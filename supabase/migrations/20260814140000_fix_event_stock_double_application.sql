-- Event stock was double-decrementing. Every (order_id, product_id) pair that
-- has ever gone through apply_event_stock_for_order shows up TWICE in
-- event_stock_audit with an IDENTICAL delta_qty, sub-millisecond apart — 8
-- pairs across multiple events, all of them exact duplicates, none partial.
-- That is not two different sales; it is the same RPC call landing twice.
-- Root cause on the client side is unconfirmed — could be the service worker
-- (this is a PWA), a duplicate .rpc() invocation, or a retry — but the fix
-- that matters is making it structurally impossible to double-apply
-- regardless of why the client calls it more than once, the same choice
-- already made for the report-dispatcher 4x-invocation bug this session.
--
-- Concretely this meant TMA Pai's RED LABEL showed 23 sold against a stock of
-- 25 (2 apparently left) when the true total from real orders is 13 (12
-- actually left) — the tracker was about to tell a rep the stall was nearly
-- out of stock that still had half of it.

-- STEP 1 — repair: remove exactly the duplicate rows (keep the earlier one
-- per pair) and subtract exactly what they added. Not a recompute-from-zero,
-- because sold_qty can also be hand-edited by the owner in the tracker UI for
-- sales outside the app — only the proven duplicate portion is touched.
with dup as (
  select id, event_stock_item_id, delta_qty,
         row_number() over (partition by order_id, product_id order by created_at asc, id asc) as rn
  from public.event_stock_audit
),
to_remove as (
  select id, event_stock_item_id, delta_qty from dup where rn > 1
),
per_item as (
  select event_stock_item_id, sum(delta_qty) as excess
  from to_remove
  group by event_stock_item_id
)
update public.event_stock_items esi
   set sold_qty = greatest(0, esi.sold_qty - per_item.excess),
       updated_at = now()
  from per_item
 where per_item.event_stock_item_id = esi.id;

delete from public.event_stock_audit
 where id in (
   select id from (
     select id, row_number() over (partition by order_id, product_id order by created_at asc, id asc) as rn
       from public.event_stock_audit
   ) x where x.rn > 1
 );

-- STEP 2 — close the race. A unique index makes the second of two identical
-- calls fail atomically inside Postgres, which application-level "check then
-- act" logic (the old function's SELECT count(*) guard) cannot guarantee
-- under concurrent execution — visible proof: the two duplicate rows for the
-- same order were 400 MICROSECONDS apart, not a plausible double-click.
create unique index if not exists event_stock_audit_order_product_uniq
  on public.event_stock_audit (order_id, product_id);

-- STEP 3 — rewrite the function around that index instead of around the old
-- guard. Two changes beyond the race fix:
--  (a) items are aggregated by product_id before processing, so an order that
--      legitimately lists the same product on two lines contributes ONE
--      correct total instead of racing itself into the same bug.
--  (b) the old guard checked "has ANY row been recorded for this whole
--      order" — so a partial failure (order has 3 products, 2 applied, one
--      RPC error) would make every future retry a no-op for ALL of it,
--      including the 1 product that never got applied. The claim is now
--      per-product, so a retry can still finish what an earlier attempt
--      left incomplete.
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

    select id, stock_taken, sold_qty into v_row
      from public.event_stock_items
     where event_stock_day_id = v_day_id and product_id = v_product
     for update;

    if not found then
      v_skipped := v_skipped + 1;
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('product_id', v_product, 'reason', 'No stock row'));
      continue;
    end if;

    -- The atomic claim. If another call for this exact (order, product) has
    -- already inserted, the unique index rejects this one and v_claim_id
    -- stays null — skip without touching sold_qty a second time.
    insert into public.event_stock_audit(
      event_stock_item_id, event_id, event_stock_day_id, product_id,
      order_id, visit_id, user_id, delta_qty, prev_sold_qty, new_sold_qty, source
    ) values (
      v_row.id, v_event_id, v_day_id, v_product,
      p_order_id, p_visit_id, v_user, v_qty, v_row.sold_qty, v_row.sold_qty + v_qty, 'order_submit'
    )
    on conflict (order_id, product_id) do nothing
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
