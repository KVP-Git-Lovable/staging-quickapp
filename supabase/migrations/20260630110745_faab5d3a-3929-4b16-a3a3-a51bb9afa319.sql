-- Allow 'specific' approval mode
ALTER TABLE public.approval_config DROP CONSTRAINT IF EXISTS approval_config_approval_mode_check;
ALTER TABLE public.approval_config ADD CONSTRAINT approval_config_approval_mode_check
  CHECK (approval_mode = ANY (ARRAY['auto'::text,'manager'::text,'multi_level'::text,'specific'::text]));

ALTER TABLE public.credit_notes ADD COLUMN IF NOT EXISTS approval_request_id uuid;
ALTER TABLE public.approval_config ADD COLUMN IF NOT EXISTS specific_approver_id uuid;

INSERT INTO public.approval_config (entity_type, use_full_hierarchy, max_levels, approval_mode, skip_levels)
SELECT 'credit_note', false, 1, 'specific', false
WHERE NOT EXISTS (SELECT 1 FROM public.approval_config WHERE entity_type='credit_note');

CREATE OR REPLACE FUNCTION public.create_approval_request(p_entity_type text, p_entity_id uuid, p_requester_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_chain RECORD; v_config RECORD; v_request_id uuid; v_levels integer := 0;
BEGIN
  SELECT * INTO v_config FROM approval_config WHERE entity_type = p_entity_type;

  IF v_config.approval_mode = 'specific' AND v_config.specific_approver_id IS NOT NULL THEN
    INSERT INTO approval_requests (entity_type, entity_id, requester_id, current_level, total_levels, status)
    VALUES (p_entity_type, p_entity_id, p_requester_id, 1, 1, 'pending') RETURNING id INTO v_request_id;
    INSERT INTO approval_steps (approval_request_id, level, approver_id, status)
    VALUES (v_request_id, 1, v_config.specific_approver_id, 'pending');
    INSERT INTO approval_audit_log (approval_request_id, entity_type, entity_id, action, performed_by, level, metadata)
    VALUES (v_request_id, p_entity_type, p_entity_id, 'submitted', p_requester_id, 0, jsonb_build_object('mode','specific'));
    RETURN v_request_id;
  END IF;

  FOR v_chain IN SELECT manager_id, level FROM get_reporting_chain(p_requester_id) ORDER BY level
                 LIMIT COALESCE(v_config.max_levels, 10) LOOP
    v_levels := v_levels + 1;
  END LOOP;
  IF v_levels = 0 THEN v_levels := 1; END IF;

  INSERT INTO approval_requests (entity_type, entity_id, requester_id, current_level, total_levels, status)
  VALUES (p_entity_type, p_entity_id, p_requester_id, 1, v_levels, 'pending')
  RETURNING id INTO v_request_id;

  FOR v_chain IN SELECT manager_id, level FROM get_reporting_chain(p_requester_id) ORDER BY level
                 LIMIT COALESCE(v_config.max_levels, 10) LOOP
    INSERT INTO approval_steps (approval_request_id, level, approver_id, status)
    VALUES (v_request_id, v_chain.level, v_chain.manager_id, 'pending');
  END LOOP;

  INSERT INTO approval_audit_log (approval_request_id, entity_type, entity_id, action, performed_by, level, metadata)
  VALUES (v_request_id, p_entity_type, p_entity_id, 'submitted', p_requester_id, 0, jsonb_build_object('total_levels', v_levels));
  RETURN v_request_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.finalize_credit_note(p_retailer_id uuid, p_reason text, p_reason_notes text, p_created_by uuid, p_visit_id uuid, p_lines jsonb, p_van_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_req boolean; v_eff boolean; v_line jsonb; v_ret numeric;
  v_cn uuid; v_num text; v_grn uuid; v_van uuid;
  v_sub numeric:=0; v_cgst numeric:=0; v_sgst numeric:=0; v_total numeric:=0;
  v_primary uuid; v_fy_start date; v_seq int;
  v_req_id uuid;
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
  v_van := coalesce(p_van_id, (select id from vans where assigned_user_id=p_created_by and coalesce(is_active,true) limit 1));
  if v_van is not null then
    insert into van_return_grn (van_id, user_id, retailer_id, visit_id, return_date, return_grn_number, notes)
    values (v_van, p_created_by, p_retailer_id, p_visit_id, now()::date,
      'RET-'||to_char(now(),'YYMMDDHH24MISS'), 'Credit note '||v_num)
    returning id into v_grn;
    insert into van_return_grn_items (return_grn_id, product_id, variant_id, return_quantity, return_reason, disposition)
    select v_grn, (l->>'product_id')::uuid, nullif(l->>'variant_id','')::uuid,
      (l->>'quantity')::numeric, p_reason,
      case when lower(coalesce(p_reason,'')) ~ 'damag|expir|quality' then 'scrap' else 'restock' end
    from jsonb_array_elements(p_lines) l;
  end if;
  if v_eff then
    perform public._post_credit_note_to_ledger(v_cn, p_retailer_id, v_total, v_primary, p_created_by);
    update credit_notes set posted_to_ledger=true where id=v_cn;
  else
    v_req_id := public.create_approval_request('credit_note', v_cn, p_created_by);
    if v_req_id is null or not exists (select 1 from approval_steps where approval_request_id=v_req_id) then
      raise exception 'Approval is required for credit notes but no approver is configured';
    end if;
    update credit_notes set approval_request_id = v_req_id where id = v_cn;
  end if;
  return jsonb_build_object('success',true,'credit_note_id',v_cn,'credit_note_number',v_num,
    'total',v_total,'requires_approval',v_req,'posted_to_ledger',v_eff,'return_grn_created',v_van is not null);
end; $function$;

CREATE OR REPLACE FUNCTION public.tg_credit_note_approval_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_cn credit_notes%rowtype;
BEGIN
  IF NEW.entity_type <> 'credit_note' THEN RETURN NEW; END IF;
  IF OLD.status='pending' AND NEW.status='approved' THEN
    SELECT * INTO v_cn FROM credit_notes WHERE id=NEW.entity_id FOR UPDATE;
    IF FOUND AND NOT COALESCE(v_cn.posted_to_ledger,false) THEN
      PERFORM public._post_credit_note_to_ledger(v_cn.id, v_cn.retailer_id, v_cn.total_amount, v_cn.original_order_id, NEW.final_approved_by);
      UPDATE credit_notes SET approval_status='approved', status='issued', posted_to_ledger=true,
        approved_by=NEW.final_approved_by, approved_at=now() WHERE id=v_cn.id;
    END IF;
  ELSIF OLD.status='pending' AND NEW.status='rejected' THEN
    UPDATE credit_notes SET approval_status='rejected', status='cancelled', approved_at=now() WHERE id=NEW.entity_id;
  END IF;
  RETURN NEW;
END; $f$;

DROP TRIGGER IF EXISTS trg_credit_note_approval_complete ON public.approval_requests;
CREATE TRIGGER trg_credit_note_approval_complete
  AFTER UPDATE OF status ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_credit_note_approval_complete();