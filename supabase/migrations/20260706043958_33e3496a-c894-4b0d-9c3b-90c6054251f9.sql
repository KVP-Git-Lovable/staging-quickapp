
-- 1) can_edit_order helper
CREATE OR REPLACE FUNCTION public.can_edit_order(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg operations_config%ROWTYPE;
  v_order orders%ROWTYPE;
  v_uid uuid := auth.uid();
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

  -- Who
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

  -- Lock point
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

  -- Max edits
  IF COALESCE(v_cfg.edit_max_edits, 0) > 0
     AND COALESCE(v_order.edit_count, 0) >= v_cfg.edit_max_edits THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_edit_order(uuid) TO authenticated;

-- 2) Extend existing order_edit_log with the new audit fields (additive; keeps existing snapshot columns)
ALTER TABLE public.order_edit_log
  ADD COLUMN IF NOT EXISTS order_id  uuid,
  ADD COLUMN IF NOT EXISTS old_total numeric,
  ADD COLUMN IF NOT EXISTS new_total numeric;

-- Ensure RLS is enabled and add the requested read policy alongside existing ones
ALTER TABLE public.order_edit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read edit log by permission or ownership" ON public.order_edit_log;
CREATE POLICY "Read edit log by permission or ownership"
  ON public.order_edit_log
  FOR SELECT
  USING (
    public.user_has_permission(auth.uid(), 'order_edit', 'can_edit')
    OR EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = COALESCE(order_edit_log.order_id, order_edit_log.original_order_id)
        AND o.user_id = auth.uid()
    )
  );

-- 3) finalize_order_edit — prepend policy guards + append audit updates
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
  v_cancel_result jsonb;
  v_original_invoice_id uuid;
  v_replacement_invoice_id uuid;
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
  -- Policy guards (run before any reconciliation)
  IF NOT public.can_edit_order(p_original_order_id) THEN
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

  DELETE FROM retailer_payment_allocations WHERE order_id = p_original_order_id;
  UPDATE orders
    SET credit_paid_amount = 0,
        credit_pending_amount = total_amount
    WHERE id = p_original_order_id;

  SELECT id INTO v_original_invoice_id
    FROM invoices WHERE order_id = p_original_order_id AND status <> 'cancelled'
    ORDER BY created_at DESC LIMIT 1;
  IF v_original_invoice_id IS NULL THEN
    SELECT id INTO v_original_invoice_id
      FROM invoices WHERE order_id = p_original_order_id
      ORDER BY created_at DESC LIMIT 1;
  END IF;

  v_cancel_result := public.cancel_order_atomic(
    p_order_id := p_original_order_id,
    p_reason := COALESCE(p_reason, 'Replaced by edited order'),
    p_cancelled_by := p_edited_by,
    p_settlement_method := NULL,
    p_settlement_amount := 0,
    p_van_stock_action := NULL
  );

  IF NOT COALESCE((v_cancel_result->>'success')::boolean, false)
     AND NOT COALESCE((v_cancel_result->>'already_cancelled')::boolean, false) THEN
    RAISE EXCEPTION 'Failed to cancel original order: %', v_cancel_result->>'error';
  END IF;

  IF v_original_invoice_id IS NOT NULL THEN
    SELECT id INTO v_replacement_invoice_id
      FROM invoices WHERE order_id = p_replacement_order_id AND status <> 'cancelled'
      ORDER BY created_at DESC LIMIT 1;

    UPDATE invoices
      SET status = 'superseded', superseded_by_invoice_id = v_replacement_invoice_id, updated_at = now()
      WHERE id = v_original_invoice_id;

    IF v_replacement_invoice_id IS NOT NULL THEN
      UPDATE invoices
        SET revises_invoice_id = v_original_invoice_id, updated_at = now()
        WHERE id = v_replacement_invoice_id;
    END IF;
  END IF;

  IF p_target_paid IS NOT NULL THEN
    SELECT COALESCE(credit_paid_amount,0) INTO v_repl_paid
      FROM orders WHERE id = p_replacement_order_id FOR UPDATE;

    IF p_target_paid > v_repl_paid THEN
      SELECT LEAST(p_target_paid - v_repl_paid, COALESCE(credit_pending_amount,0))
        INTO v_delta FROM orders WHERE id = p_replacement_order_id;

      IF v_delta > 0 AND p_new_collection_id IS NOT NULL THEN
        UPDATE orders
          SET credit_paid_amount = COALESCE(credit_paid_amount,0) + v_delta,
              credit_pending_amount = COALESCE(credit_pending_amount,0) - v_delta,
              payment_status = CASE WHEN COALESCE(credit_pending_amount,0) - v_delta <= 0
                                    THEN 'paid' ELSE 'partial' END
          WHERE id = p_replacement_order_id;

        INSERT INTO retailer_payment_allocations (collection_id, order_id, retailer_id, amount_applied)
          VALUES (p_new_collection_id, p_replacement_order_id, v_original.retailer_id, v_delta);
      END IF;

    ELSIF p_target_paid < v_repl_paid THEN
      v_excess := v_repl_paid - p_target_paid;
      FOR v_alloc2 IN
        SELECT id, collection_id, amount_applied
        FROM retailer_payment_allocations
        WHERE order_id = p_replacement_order_id
        ORDER BY created_at DESC
      LOOP
        EXIT WHEN v_excess <= 0;
        v_take := LEAST(v_excess, v_alloc2.amount_applied);

        IF v_take >= v_alloc2.amount_applied THEN
          DELETE FROM retailer_payment_allocations WHERE id = v_alloc2.id;
        ELSE
          UPDATE retailer_payment_allocations
            SET amount_applied = amount_applied - v_take
            WHERE id = v_alloc2.id;
        END IF;

        UPDATE orders
          SET credit_paid_amount = COALESCE(credit_paid_amount,0) - v_take,
              credit_pending_amount = COALESCE(credit_pending_amount,0) + v_take,
              payment_status = CASE WHEN COALESCE(credit_paid_amount,0) - v_take <= 0
                                    THEN 'pending' ELSE 'partial' END
          WHERE id = p_replacement_order_id;

        v_free_left := public.reflow_allocation_fifo(
                         v_original.retailer_id, v_alloc2.collection_id, v_take, p_replacement_order_id);

        IF v_free_left > 0 THEN
          INSERT INTO credit_ledger (retailer_id, amount, type, reference_id, created_by)
          VALUES (v_original.retailer_id, -v_free_left, 'edit_advance_credit', p_replacement_order_id, p_edited_by);
        END IF;

        v_excess := v_excess - v_take;
      END LOOP;
    END IF;
  END IF;

  v_new_pending := public.recompute_retailer_pending(v_original.retailer_id);

  SELECT jsonb_build_object(
    'order', to_jsonb(r.*),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(oi.*)) FROM order_items oi
                       WHERE oi.order_id = p_replacement_order_id), '[]'::jsonb))
    INTO v_repl_snapshot FROM orders r WHERE r.id = p_replacement_order_id;

  -- Bump audit fields on the original order
  UPDATE orders
    SET edit_count = COALESCE(edit_count, 0) + 1,
        is_edited = true,
        edited_at = now(),
        updated_at = now()
    WHERE id = p_original_order_id;

  INSERT INTO order_edit_log (
    original_order_id, replacement_order_id, edited_by, reason, edit_summary,
    original_snapshot, replacement_snapshot,
    order_id, old_total, new_total
  )
  VALUES (
    p_original_order_id, p_replacement_order_id, p_edited_by, p_reason,
    jsonb_build_object(
      'old_total_amount', v_original_total,
      'new_total_amount', v_replacement_total,
      'payment_carried', v_transfer,
      'cancel_result', v_cancel_result,
      'original_invoice_id', v_original_invoice_id,
      'replacement_invoice_id', v_replacement_invoice_id,
      'target_paid', p_target_paid,
      'new_collection_id', p_new_collection_id,
      'retailer_pending_after', v_new_pending
    ),
    v_orig_snapshot,
    v_repl_snapshot,
    p_original_order_id,
    v_original_total,
    v_replacement_total
  );

  RETURN jsonb_build_object(
    'success', true,
    'original_order_id', p_original_order_id,
    'replacement_order_id', p_replacement_order_id,
    'old_total_amount', v_original_total,
    'new_total_amount', v_replacement_total,
    'payment_carried', v_transfer,
    'original_invoice_id', v_original_invoice_id,
    'replacement_invoice_id', v_replacement_invoice_id,
    'invoice_superseded', v_original_invoice_id IS NOT NULL,
    'cancel_result', v_cancel_result,
    'retailer_pending', v_new_pending
  );
END;
$function$;
