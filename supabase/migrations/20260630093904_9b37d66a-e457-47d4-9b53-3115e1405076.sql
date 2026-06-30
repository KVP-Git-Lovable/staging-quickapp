
alter table public.van_return_grn_items add column if not exists disposition text;

create or replace function public._post_credit_note_to_ledger(
  p_cn_id uuid, p_retailer_id uuid, p_amount numeric, p_primary_order uuid, p_actor uuid)
returns void language plpgsql security definer set search_path to 'public' as $f$
declare v_collection uuid; v_pending numeric; v_apply numeric := 0; v_left numeric;
begin
  if coalesce(p_amount,0) <= 0 then perform public.recompute_retailer_pending(p_retailer_id); return; end if;
  insert into retailer_payment_collections (retailer_id, amount, payment_method, collected_by_user_id, notes)
  values (p_retailer_id, p_amount, 'credit_note', p_actor, 'Credit note '||p_cn_id::text)
  returning id into v_collection;
  if p_primary_order is not null then
    select coalesce(credit_pending_amount,0) into v_pending from orders where id=p_primary_order for update;
    v_apply := least(p_amount, v_pending);
    if v_apply > 0 then
      update orders set credit_paid_amount=coalesce(credit_paid_amount,0)+v_apply,
        credit_pending_amount=coalesce(credit_pending_amount,0)-v_apply,
        payment_status=case when coalesce(credit_pending_amount,0)-v_apply<=0 then 'paid' else 'partial' end
      where id=p_primary_order;
      insert into retailer_payment_allocations (collection_id, order_id, retailer_id, amount_applied)
      values (v_collection, p_primary_order, p_retailer_id, v_apply);
    end if;
  end if;
  v_left := public.reflow_allocation_fifo(p_retailer_id, v_collection, p_amount - coalesce(v_apply,0), p_primary_order);
  if v_left > 0 then
    insert into credit_ledger (retailer_id, amount, type, reference_id, created_by)
    values (p_retailer_id, -v_left, 'return_credit', p_cn_id, p_actor);
  end if;
  perform public.recompute_retailer_pending(p_retailer_id);
end; $f$;

create or replace function public.finalize_credit_note(
  p_retailer_id uuid, p_reason text, p_reason_notes text, p_created_by uuid, p_visit_id uuid, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare
  v_req boolean; v_eff boolean; v_line jsonb; v_ret numeric;
  v_cn uuid; v_num text; v_grn uuid;
  v_sub numeric:=0; v_cgst numeric:=0; v_sgst numeric:=0; v_total numeric:=0;
  v_primary uuid; v_fy_start date; v_seq int;
begin
  if p_retailer_id is null or p_lines is null or jsonb_array_length(p_lines)=0 then
    return jsonb_build_object('success',false,'error','retailer and lines required'); end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_ret := public.returnable_qty((v_line->>'original_order_id')::uuid,
      (v_line->>'product_id')::uuid, nullif(v_line->>'variant_id','')::uuid);
    if (v_line->>'quantity')::numeric > v_ret + 1e-6 then
      return jsonb_build_object('success',false,'error',
        format('Return qty %s exceeds returnable %s on order %s',
          v_line->>'quantity', v_ret, v_line->>'original_order_id')); end if;
    v_sub := v_sub + coalesce((v_line->>'taxable_amount')::numeric,(v_line->>'total')::numeric,0);
    v_cgst:= v_cgst+ coalesce((v_line->>'cgst_amount')::numeric,0);
    v_sgst:= v_sgst+ coalesce((v_line->>'sgst_amount')::numeric,0);
    v_total:=v_total+ coalesce((v_line->>'total')::numeric,0);
  end loop;

  select coalesce(requires_approval,false) into v_req from credit_note_config limit 1;
  v_eff := not coalesce(v_req,false);
  v_primary := (p_lines->0->>'original_order_id')::uuid;

  v_fy_start := case when extract(month from now())>=4
     then make_date(extract(year from now())::int,4,1)
     else make_date(extract(year from now())::int-1,4,1) end;

  perform pg_advisory_xact_lock(hashtext('credit_note_seq'));
  select count(*)+1 into v_seq from credit_notes
    where credit_note_date >= v_fy_start and credit_note_date < v_fy_start + interval '1 year';
  v_num := 'CN/'||to_char(v_fy_start,'YY')||'-'||to_char(v_fy_start+interval '1 year','YY')||'/'||lpad(v_seq::text,3,'0');

  insert into credit_notes (credit_note_number, credit_note_date, retailer_id, retailer_name,
    reason, reason_notes, sub_total, sgst_total, cgst_total, total_amount,
    status, approval_status, posted_to_ledger, original_order_id, created_by)
  select v_num, now()::date, p_retailer_id, r.name, p_reason, p_reason_notes,
    v_sub, v_sgst, v_cgst, v_total,
    case when v_eff then 'issued' else 'pending_approval' end,
    case when v_req then 'pending' else 'not_required' end,
    false, v_primary, p_created_by
  from retailers r where r.id=p_retailer_id
  returning id into v_cn;

  insert into credit_note_items (credit_note_id, original_order_id, original_invoice_number,
    product_id, variant_id, product_name, hsn_code, unit, quantity, rate, total,
    taxable_amount, sgst_amount, cgst_amount, barcode)
  select v_cn, (l->>'original_order_id')::uuid,
    (select invoice_number from orders where id=(l->>'original_order_id')::uuid),
    (l->>'product_id')::uuid, nullif(l->>'variant_id','')::uuid,
    l->>'product_name', l->>'hsn_code', l->>'unit',
    (l->>'quantity')::numeric, (l->>'rate')::numeric, (l->>'total')::numeric,
    (l->>'taxable_amount')::numeric, (l->>'sgst_amount')::numeric, (l->>'cgst_amount')::numeric, l->>'barcode'
  from jsonb_array_elements(p_lines) l;

  insert into van_return_grn (user_id, retailer_id, visit_id, return_date, return_grn_number, notes)
  values (p_created_by, p_retailer_id, p_visit_id, now()::date,
    'RET-'||to_char(now(),'YYMMDDHH24MISS'), 'Credit note '||v_num)
  returning id into v_grn;

  insert into van_return_grn_items (return_grn_id, product_id, variant_id, return_quantity, return_reason, disposition)
  select v_grn, (l->>'product_id')::uuid, nullif(l->>'variant_id','')::uuid,
    (l->>'quantity')::numeric, p_reason,
    case when lower(coalesce(p_reason,'')) ~ 'damag|expir|quality' then 'scrap' else 'restock' end
  from jsonb_array_elements(p_lines) l;

  if v_eff then
    perform public._post_credit_note_to_ledger(v_cn, p_retailer_id, v_total, v_primary, p_created_by);
    update credit_notes set posted_to_ledger=true where id=v_cn;
  end if;

  return jsonb_build_object('success',true,'credit_note_id',v_cn,'credit_note_number',v_num,
    'total',v_total,'requires_approval',v_req,'posted_to_ledger',v_eff);
end; $f$;

create or replace function public.approve_credit_note(p_cn_id uuid, p_approver uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v credit_notes%rowtype;
begin
  select * into v from credit_notes where id=p_cn_id for update;
  if not found then return jsonb_build_object('success',false,'error','not found'); end if;
  if v.posted_to_ledger then return jsonb_build_object('success',true,'already_posted',true); end if;
  if coalesce(v.approval_status,'')<>'pending' then
    return jsonb_build_object('success',false,'error','not pending approval'); end if;
  perform public._post_credit_note_to_ledger(p_cn_id, v.retailer_id, v.total_amount, v.original_order_id, p_approver);
  update credit_notes set approval_status='approved', approved_by=p_approver, approved_at=now(),
    status='issued', posted_to_ledger=true where id=p_cn_id;
  return jsonb_build_object('success',true,'credit_note_id',p_cn_id);
end; $f$;

create or replace function public.reject_credit_note(p_cn_id uuid, p_approver uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v credit_notes%rowtype;
begin
  select * into v from credit_notes where id=p_cn_id for update;
  if not found then return jsonb_build_object('success',false,'error','not found'); end if;
  if v.posted_to_ledger then return jsonb_build_object('success',false,'error','already posted; cannot reject'); end if;
  update credit_notes set approval_status='rejected', status='cancelled',
    approved_by=p_approver, approved_at=now(),
    reason_notes=coalesce(reason_notes,'')||' | rejected: '||coalesce(p_reason,'') where id=p_cn_id;
  return jsonb_build_object('success',true,'credit_note_id',p_cn_id);
end; $f$;
