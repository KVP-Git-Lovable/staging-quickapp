
-- 1) can_edit_order — actor-aware
DROP FUNCTION IF EXISTS public.can_edit_order(uuid);

CREATE OR REPLACE FUNCTION public.can_edit_order(p_order_id uuid, p_actor uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg operations_config%ROWTYPE;
  v_order orders%ROWTYPE;
  v_uid uuid := p_actor;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  SELECT * INTO v_cfg FROM operations_config WHERE id = 1;
  IF NOT FOUND OR COALESCE(v_cfg.edit_enabled, false) = false THEN
    RETURN false;
  END IF;

  IF NOT public.user_has_permission(v_uid, 'order_edit', 'can_edit') THEN
    RETURN false;
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_cfg.edit_who = 'own' THEN
    IF v_order.user_id <> v_uid THEN RETURN false; END IF;
  ELSIF v_cfg.edit_who = 'own_team' THEN
    IF v_order.user_id <> v_uid AND NOT public.is_subordinate_of(v_uid, v_order.user_id) THEN
      RETURN false;
    END IF;
  ELSIF v_cfg.edit_who = 'view_all' THEN
    IF NOT public.user_has_permission(v_uid, 'order_edit', 'can_view_all') THEN
      RETURN false;
    END IF;
  END IF;

  IF v_cfg.edit_lock_point = 'invoiced' THEN
    IF v_order.invoice_generated_at IS NOT NULL THEN RETURN false; END IF;
  ELSIF v_cfg.edit_lock_point = 'dispatched' THEN
    IF v_order.dispatched_at IS NOT NULL THEN RETURN false; END IF;
  ELSIF v_cfg.edit_lock_point = 'same_day' THEN
    IF v_order.created_at::date <> current_date THEN RETURN false; END IF;
  ELSIF v_cfg.edit_lock_point = 'hours' THEN
    IF now() - v_order.created_at > (COALESCE(v_cfg.edit_lock_hours, 0) || ' hours')::interval THEN
      RETURN false;
    END IF;
  END IF;

  IF COALESCE(v_cfg.edit_max_edits, 0) > 0
     AND COALESCE(v_order.edit_count, 0) >= v_cfg.edit_max_edits THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_edit_order(uuid, uuid) TO authenticated;

-- Update finalize_order_edit guard to use actor
CREATE OR REPLACE FUNCTION public.finalize_order_edit(
  p_original_order_id uuid,
  p_replacement_order_id uuid,
  p_edited_by uuid,
  p_reason text,
  p_target_paid numeric DEFAULT NULL::numeric,
  p_new_collection_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg operations_config%ROWTYPE;
  v_price_mismatch int;
  v_result jsonb;
BEGIN
  IF NOT public.can_edit_order(p_original_order_id, p_edited_by) THEN
    RAISE EXCEPTION 'Editing not allowed for this order (locked, no permission, or edit limit reached)';
  END IF;

  SELECT * INTO v_cfg FROM operations_config WHERE id = 1;

  IF COALESCE(v_cfg.edit_require_reason, false) AND COALESCE(p_reason, '') = '' THEN
    RAISE EXCEPTION 'A reason is required to edit this order';
  END IF;

  IF COALESCE(v_cfg.edit_lock_price, false) THEN
    SELECT COUNT(*) INTO v_price_mismatch
    FROM order_items oi_o
    JOIN order_items oi_r
      ON oi_r.order_id = p_replacement_order_id
     AND oi_r.product_id IS NOT DISTINCT FROM oi_o.product_id
     AND COALESCE(oi_r.variant_id::text, '') = COALESCE(oi_o.variant_id::text, '')
    WHERE oi_o.order_id = p_original_order_id
      AND COALESCE(oi_r.rate, 0) <> COALESCE(oi_o.rate, 0);

    IF v_price_mismatch > 0 THEN
      RAISE EXCEPTION 'Price edits are locked; only quantity can be changed';
    END IF;
  END IF;

  -- Delegate to the internal reconciliation implementation
  SELECT public.finalize_order_edit_internal(
    p_original_order_id, p_replacement_order_id, p_edited_by, p_reason, p_target_paid, p_new_collection_id
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- NOTE: we do not have finalize_order_edit_internal — instead of splitting,
-- re-declare finalize_order_edit body reusing prior logic. Simpler: revert to prior body
-- but change the guard actor. Overwrite again with the full body:

CREATE OR REPLACE FUNCTION public.finalize_order_edit(
  p_original_order_id uuid,
  p_replacement_order_id uuid,
  p_edited_by uuid,
  p_reason text,
  p_target_paid numeric DEFAULT NULL::numeric,
  p_new_collection_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_original orders%ROWTYPE;
  v_replacement orders%ROWTYPE;
  v_original_total numeric;
  v_replacement_total numeric;
  v_new_pending numeric;
  v_alloc RECORD;
  v_apply numeric;
  v_left numeric;
  v_transfer numeric := 0;
  v_repl_pending numeric;
  v_cf_collection uuid;
  v_repl_paid numeric;
  v_excess numeric;
  v_delta numeric;
  v_free_left numeric := 0;
  v_alloc2 RECORD;
  v_take numeric;
  v_orig_snapshot jsonb;
  v_repl_snapshot jsonb;
  v_cfg operations_config%ROWTYPE;
  v_price_mismatch int;
BEGIN
  IF NOT public.can_edit_order(p_original_order_id, p_edited_by) THEN
    RAISE EXCEPTION 'Editing not allowed for this order (locked, no permission, or edit limit reached)';
  END IF;

  SELECT * INTO v_cfg FROM operations_config WHERE id = 1;

  IF COALESCE(v_cfg.edit_require_reason, false) AND COALESCE(p_reason, '') = '' THEN
    RAISE EXCEPTION 'A reason is required to edit this order';
  END IF;

  IF COALESCE(v_cfg.edit_lock_price, false) THEN
    SELECT COUNT(*) INTO v_price_mismatch
    FROM order_items oi_o
    JOIN order_items oi_r
      ON oi_r.order_id = p_replacement_order_id
     AND oi_r.product_id IS NOT DISTINCT FROM oi_o.product_id
     AND COALESCE(oi_r.variant_id::text, '') = COALESCE(oi_o.variant_id::text, '')
    WHERE oi_o.order_id = p_original_order_id
      AND COALESCE(oi_r.rate, 0) <> COALESCE(oi_o.rate, 0);

    IF v_price_mismatch > 0 THEN
      RAISE EXCEPTION 'Price edits are locked; only quantity can be changed';
    END IF;
  END IF;

  SELECT * INTO v_original FROM orders WHERE id = p_original_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Original order not found');
  END IF;

  SELECT * INTO v_replacement FROM orders WHERE id = p_replacement_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Replacement order not found');
  END IF;

  IF v_original.replaced_by_order_id = p_replacement_order_id THEN
    v_new_pending := public.recompute_retailer_pending(v_original.retailer_id);
    RETURN jsonb_build_object(
      'success', true, 'already_finalized', true,
      'original_order_id', p_original_order_id,
      'replacement_order_id', p_replacement_order_id,
      'retailer_pending', v_new_pending
    );
  END IF;

  IF v_original.replaced_by_order_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Original order is already replaced by another order');
  END IF;
  IF v_original.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Original order is already cancelled');
  END IF;
  IF v_replacement.replaces_order_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Replacement order already replaces another order');
  END IF;
  IF v_replacement.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Replacement order is cancelled');
  END IF;

  v_orig_snapshot := jsonb_build_object(
    'order', to_jsonb(v_original),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(oi.*)) FROM order_items oi
                       WHERE oi.order_id = p_original_order_id), '[]'::jsonb));

  v_original_total := v_original.total_amount;
  v_replacement_total := v_replacement.total_amount;

  UPDATE orders SET replaced_by_order_id = p_replacement_order_id, updated_at = now()
    WHERE id = p_original_order_id;
  UPDATE orders SET replaces_order_id = p_original_order_id, updated_at = now()
    WHERE id = p_replacement_order_id;

  FOR v_alloc IN
    SELECT collection_id, SUM(amount_applied) AS amt
    FROM retailer_payment_allocations
    WHERE order_id = p_original_order_id
    GROUP BY collection_id
  LOOP
    SELECT COALESCE(credit_pending_amount, 0) INTO v_repl_pending
      FROM orders WHERE id = p_replacement_order_id FOR UPDATE;
    v_apply := LEAST(v_alloc.amt, v_repl_pending);

    IF v_apply > 0 THEN
      UPDATE orders
        SET credit_paid_amount    = COALESCE(credit_paid_amount, 0) + v_apply,
            credit_pending_amount = COALESCE(credit_pending_amount, 0) - v_apply,
            payment_status = CASE
              WHEN COALESCE(credit_pending_amount, 0) - v_apply <= 0 THEN 'paid' ELSE 'partial' END
        WHERE id = p_replacement_order_id;

      INSERT INTO retailer_payment_allocations (collection_id, order_id, retailer_id, amount_applied)
        VALUES (v_alloc.collection_id, p_replacement_order_id, v_original.retailer_id, v_apply);
    END IF;

    IF v_alloc.amt - v_apply > 0 THEN
      v_left := public.reflow_allocation_fifo(
                  v_original.retailer_id, v_alloc.collection_id, v_alloc.amt - v_apply, p_original_order_id);
      IF v_left > 0 THEN
        INSERT INTO credit_ledger (retailer_id, amount, type, reference_id, created_by)
        VALUES (v_original.retailer_id, -v_left, 'cancel_carry_forward', p_original_order_id, p_edited_by);
      END IF;
    END IF;

    v_transfer := v_transfer + v_alloc.amt;
  END LOOP;

  IF v_transfer = 0 AND COALESCE(v_original.credit_paid_amount, 0) > 0 THEN
    INSERT INTO retailer_payment_collections
      (retailer_id, amount, payment_method, collected_by_user_id, notes)
    VALUES
      (v_original.retailer_id, v_original.credit_paid_amount, 'carry_forward', p_edited_by,
       'Carry-forward from edited order ' || COALESCE(v_original.invoice_number, p_original_order_id::text))
    RETURNING id INTO v_cf_collection;

    SELECT COALESCE(credit_pending_amount, 0) INTO v_repl_pending
      FROM orders WHERE id = p_replacement_order_id FOR UPDATE;
    v_apply := LEAST(v_original.credit_paid_amount, v_repl_pending);

    IF v_apply > 0 THEN
      UPDATE orders
        SET credit_paid_amount    = COALESCE(credit_paid_amount, 0) + v_apply,
            credit_pending_amount = COALESCE(credit_pending_amount, 0) - v_apply,
            payment_status = CASE
              WHEN COALESCE(credit_pending_amount, 0) - v_apply <= 0 THEN 'paid' ELSE 'partial' END
        WHERE id = p_replacement_order_id;

      INSERT INTO retailer_payment_allocations (collection_id, order_id, retailer_id, amount_applied)
        VALUES (v_cf_collection, p_replacement_order_id, v_original.retailer_id, v_apply);
    END IF;

    IF v_original.credit_paid_amount - v_apply > 0 THEN
      v_left := public.reflow_allocation_fifo(
                  v_original.retailer_id, v_cf_collection, v_original.credit_paid_amount - v_apply, p_original_order_id);
      IF v_left > 0 THEN
        INSERT INTO credit_ledger (retailer_id, amount, type, reference_id, created_by)
        VALUES (v_original.retailer_id, -v_left, 'cancel_carry_forward', p_original_order_id, p_edited_by);
      END IF;
    END IF;
  END IF;

  IF p_target_paid IS NOT NULL THEN
    SELECT COALESCE(credit_paid_amount, 0) INTO v_repl_paid
      FROM orders WHERE id = p_replacement_order_id FOR UPDATE;

    v_delta := p_target_paid - v_repl_paid;

    IF v_delta > 0 THEN
      IF p_new_collection_id IS NOT NULL THEN
        SELECT COALESCE(credit_pending_amount, 0) INTO v_repl_pending
          FROM orders WHERE id = p_replacement_order_id FOR UPDATE;
        v_apply := LEAST(v_delta, v_repl_pending);

        IF v_apply > 0 THEN
          UPDATE orders
            SET credit_paid_amount = COALESCE(credit_paid_amount,0) + v_apply,
                credit_pending_amount = COALESCE(credit_pending_amount,0) - v_apply,
                payment_status = CASE
                  WHEN COALESCE(credit_pending_amount,0) - v_apply <= 0 THEN 'paid' ELSE 'partial' END
            WHERE id = p_replacement_order_id;

          INSERT INTO retailer_payment_allocations (collection_id, order_id, retailer_id, amount_applied)
            VALUES (p_new_collection_id, p_replacement_order_id, v_original.retailer_id, v_apply);
        END IF;
      END IF;
    ELSIF v_delta < 0 THEN
      v_excess := -v_delta;
      UPDATE orders
        SET credit_paid_amount = GREATEST(0, COALESCE(credit_paid_amount,0) - v_excess),
            credit_pending_amount = COALESCE(credit_pending_amount,0) + v_excess,
            payment_status = CASE
              WHEN COALESCE(credit_pending_amount,0) + v_excess <= 0 THEN 'paid' ELSE 'partial' END
        WHERE id = p_replacement_order_id;

      FOR v_alloc2 IN
        SELECT id, amount_applied
        FROM retailer_payment_allocations
        WHERE order_id = p_replacement_order_id
        ORDER BY id DESC
      LOOP
        EXIT WHEN v_excess <= 0;
        v_take := LEAST(v_alloc2.amount_applied, v_excess);
        IF v_take = v_alloc2.amount_applied THEN
          DELETE FROM retailer_payment_allocations WHERE id = v_alloc2.id;
        ELSE
          UPDATE retailer_payment_allocations SET amount_applied = amount_applied - v_take WHERE id = v_alloc2.id;
        END IF;
        v_excess := v_excess - v_take;
      END LOOP;
    END IF;
  END IF;

  v_repl_snapshot := jsonb_build_object(
    'order', to_jsonb((SELECT o FROM orders o WHERE o.id = p_replacement_order_id)),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(oi.*)) FROM order_items oi
                       WHERE oi.order_id = p_replacement_order_id), '[]'::jsonb));

  UPDATE orders
    SET edit_count = COALESCE(edit_count, 0) + 1,
        is_edited = true,
        edited_at = now(),
        updated_at = now()
    WHERE id = p_original_order_id;

  INSERT INTO public.order_edit_log (order_id, original_order_id, replacement_order_id, edited_by, reason, old_total, new_total, original_snapshot, replacement_snapshot)
  VALUES (p_original_order_id, p_original_order_id, p_replacement_order_id, p_edited_by, p_reason, v_original_total, v_replacement_total, v_orig_snapshot, v_repl_snapshot);

  v_new_pending := public.recompute_retailer_pending(v_original.retailer_id);

  RETURN jsonb_build_object(
    'success', true,
    'original_order_id', p_original_order_id,
    'replacement_order_id', p_replacement_order_id,
    'old_total', v_original_total,
    'new_total', v_replacement_total,
    'retailer_pending', v_new_pending
  );
END;
$function$;

-- 2) order_edit_requests table
CREATE TABLE IF NOT EXISTS public.order_edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_order_id uuid NOT NULL,
  replacement_order_id uuid NOT NULL,
  edited_by uuid NOT NULL DEFAULT auth.uid(),
  reason text,
  target_paid numeric,
  new_collection_id uuid,
  old_total numeric,
  new_total numeric,
  approval_request_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.order_edit_requests TO authenticated;
GRANT ALL ON public.order_edit_requests TO service_role;

ALTER TABLE public.order_edit_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oer_select ON public.order_edit_requests;
CREATE POLICY oer_select ON public.order_edit_requests
  FOR SELECT TO authenticated
  USING (
    edited_by = auth.uid()
    OR public.user_has_permission(auth.uid(), 'order_edit', 'can_view_all')
    OR EXISTS (
      SELECT 1 FROM public.approval_steps s
      WHERE s.approval_request_id = order_edit_requests.approval_request_id
        AND s.approver_id = auth.uid()
    )
  );

-- 3) Seed approval_config for order_edit
INSERT INTO public.approval_config (entity_type, use_full_hierarchy, max_levels, approval_mode, skip_levels)
SELECT 'order_edit', false, 1, 'manager', false
WHERE NOT EXISTS (SELECT 1 FROM public.approval_config WHERE entity_type = 'order_edit');

-- 4) request_order_edit
CREATE OR REPLACE FUNCTION public.request_order_edit(
  p_original_order_id uuid,
  p_replacement_order_id uuid,
  p_edited_by uuid,
  p_reason text,
  p_target_paid numeric DEFAULT NULL,
  p_new_collection_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg operations_config%ROWTYPE;
  v_old_total numeric;
  v_new_total numeric;
  v_req_id uuid;
  v_approval_id uuid;
BEGIN
  IF NOT public.can_edit_order(p_original_order_id, p_edited_by) THEN
    RAISE EXCEPTION 'Editing not allowed for this order (locked, no permission, or edit limit reached)';
  END IF;

  SELECT * INTO v_cfg FROM operations_config WHERE id = 1;

  IF COALESCE(v_cfg.edit_require_reason, false) AND COALESCE(p_reason, '') = '' THEN
    RAISE EXCEPTION 'A reason is required to edit this order';
  END IF;

  SELECT total_amount INTO v_old_total FROM orders WHERE id = p_original_order_id;
  SELECT total_amount INTO v_new_total FROM orders WHERE id = p_replacement_order_id;

  IF COALESCE(v_cfg.edit_require_approval, false)
     AND abs(COALESCE(v_new_total, 0) - COALESCE(v_old_total, 0)) > COALESCE(v_cfg.edit_approval_threshold, 0)
  THEN
    INSERT INTO public.order_edit_requests
      (original_order_id, replacement_order_id, edited_by, reason, target_paid, new_collection_id, old_total, new_total, status)
    VALUES
      (p_original_order_id, p_replacement_order_id, p_edited_by, p_reason, p_target_paid, p_new_collection_id, v_old_total, v_new_total, 'pending')
    RETURNING id INTO v_req_id;

    v_approval_id := public.create_approval_request('order_edit', v_req_id, p_edited_by);

    IF v_approval_id IS NULL THEN
      RAISE EXCEPTION 'No approver could be resolved for this order edit request';
    END IF;

    UPDATE public.order_edit_requests SET approval_request_id = v_approval_id WHERE id = v_req_id;
    RETURN 'pending';
  ELSE
    PERFORM public.finalize_order_edit(p_original_order_id, p_replacement_order_id, p_edited_by, p_reason, p_target_paid, p_new_collection_id);
    RETURN 'applied';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_order_edit(uuid, uuid, uuid, text, numeric, uuid) TO authenticated;

-- 5) Trigger for approval completion
CREATE OR REPLACE FUNCTION public.tg_order_edit_approval_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.order_edit_requests%ROWTYPE;
BEGIN
  IF NEW.entity_type <> 'order_edit' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT * INTO v_req FROM public.order_edit_requests WHERE id = NEW.entity_id FOR UPDATE;
    IF FOUND THEN
      PERFORM public.finalize_order_edit(
        v_req.original_order_id,
        v_req.replacement_order_id,
        v_req.edited_by,
        v_req.reason,
        v_req.target_paid,
        v_req.new_collection_id
      );
      UPDATE public.order_edit_requests SET status = 'approved' WHERE id = NEW.entity_id;
    END IF;
  ELSIF NEW.status = 'rejected' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT * INTO v_req FROM public.order_edit_requests WHERE id = NEW.entity_id FOR UPDATE;
    IF FOUND THEN
      UPDATE public.order_edit_requests SET status = 'rejected' WHERE id = NEW.entity_id;
      UPDATE public.orders
        SET status = 'cancelled', cancellation_reason = 'Order edit rejected', updated_at = now()
        WHERE id = v_req.replacement_order_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_edit_approval_complete ON public.approval_requests;
CREATE TRIGGER trg_order_edit_approval_complete
  AFTER UPDATE OF status ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_order_edit_approval_complete();
