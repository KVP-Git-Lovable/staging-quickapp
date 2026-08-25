-- Correction to 20260814140000_fix_event_stock_double_application.sql.
--
-- A blanket unique index on (order_id, product_id) is wrong: it assumes one
-- audit row per order+product, but the TRIGGER
-- (trg_apply_event_stock_after_order_items) is keyed per order_item, and a
-- real order CAN legitimately list the same product on two separate lines —
-- discovered while checking production's live data before this whole feature
-- was ported there: one real order, one product entered as two lines of 18
-- and 10 units, each with its own order_item_id, both correctly tracked. The
-- blanket constraint from the prior migration would have silently rejected
-- the second line's stock impact the moment that happened, via the trigger's
-- own swallowed-exception handler — never surfaced anywhere.
--
-- What actually needs preventing is TRIGGER + RPC both applying the SAME
-- sale: the trigger runs synchronously per order_item inside the order-insert
-- transaction, always before the client's separate, later RPC call can reach
-- the server. So the RPC's real job is only to catch what the trigger missed,
-- never to duplicate what it already did.
drop index if exists public.event_stock_audit_order_product_uniq;

-- Guards the RPC against racing ITSELF (its own calls never carry an
-- order_item_id), without constraining the trigger's legitimate multi-row
-- case at all.
create unique index if not exists event_stock_audit_rpc_order_product_uniq
  on public.event_stock_audit (order_id, product_id)
  where order_item_id is null;

create or replace function public.apply_event_stock_for_order(
  p_visit_id uuid, p_order_id uuid, p_order_date date, p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_event_id uuid;
  v_day_id   uuid;
  v_user     uuid := auth.uid();
  v_product  uuid;
  v_qty      numeric;
  v_row      record;
  v_claim_id uuid;
  v_updated  int := 0;
  v_skipped  int := 0;
  v_warnings jsonb := '[]'::jsonb;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  if p_visit_id is null or p_items is null then
    return jsonb_build_object('updated',0,'skipped',0,'warnings','[]'::jsonb);
  end if;

  select id into v_event_id from public.activity_events where visit_id = p_visit_id limit 1;
  if v_event_id is null then
    return jsonb_build_object('updated',0,'skipped',0,'warnings',jsonb_build_array('No event linked to visit'));
  end if;

  select id into v_day_id from public.event_stock_days
   where event_id = v_event_id and date = p_order_date limit 1;
  if v_day_id is null then
    select id into v_day_id from public.event_stock_days
     where event_id = v_event_id order by day_number asc limit 1;
  end if;
  if v_day_id is null then
    return jsonb_build_object('updated',0,'skipped',0,'warnings',jsonb_build_array('No stock day initialized for event'));
  end if;

  for v_product, v_qty in
    select (item->>'product_id')::uuid, sum(coalesce((item->>'quantity')::numeric, 0))
      from jsonb_array_elements(p_items) item
     where (item->>'product_id') is not null
     group by 1
  loop
    if v_qty <= 0 then continue; end if;

    -- The trigger runs first, always — synchronously, inside the same
    -- transaction that inserts order_items. If it has already recorded THIS
    -- product for THIS order, trust it completely and move on: applying the
    -- RPC's own aggregate on top would double the sale. Checked per product,
    -- not per order, so a genuine partial trigger failure on one line can
    -- still be caught here for the others.
    if exists (
      select 1 from public.event_stock_audit
       where order_id = p_order_id and product_id = v_product and order_item_id is not null
    ) then
      continue;
    end if;

    select id, stock_taken, sold_qty into v_row
      from public.event_stock_items
     where event_stock_day_id = v_day_id and product_id = v_product
     for update;

    if not found then
      v_skipped := v_skipped + 1;
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('product_id', v_product, 'reason', 'No stock row'));
      continue;
    end if;

    insert into public.event_stock_audit(
      event_stock_item_id, event_id, event_stock_day_id, product_id,
      order_id, visit_id, user_id, delta_qty, prev_sold_qty, new_sold_qty, source
    ) values (
      v_row.id, v_event_id, v_day_id, v_product,
      p_order_id, p_visit_id, v_user, v_qty, v_row.sold_qty, v_row.sold_qty + v_qty, 'order_submit'
    )
    on conflict (order_id, product_id) where order_item_id is null do nothing
    returning id into v_claim_id;

    if v_claim_id is null then
      continue;
    end if;

    update public.event_stock_items
       set sold_qty = v_row.sold_qty + v_qty, updated_at = now()
     where id = v_row.id;

    if (v_row.sold_qty + v_qty) > v_row.stock_taken then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('product_id', v_product, 'reason', 'Sold exceeds stock taken'));
    end if;

    v_updated := v_updated + 1;
  end loop;

  return jsonb_build_object(
    'updated', v_updated, 'skipped', v_skipped,
    'event_id', v_event_id, 'event_stock_day_id', v_day_id, 'warnings', v_warnings
  );
end;
$function$;
