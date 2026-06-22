CREATE OR REPLACE FUNCTION public.finalize_order_edit(
  p_original_order_id uuid,
  p_replacement_order_id uuid,
  p_edited_by uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original orders%ROWTYPE;
  v_replacement orders%ROWTYPE;
  v_cancel_result jsonb;
  v_original_invoice_id uuid;
  v_replacement_invoice_id uuid;
  v_original_total numeric;
  v_replacement_total numeric;
BEGIN
  -- 1) Lock both orders
  SELECT * INTO v_original FROM orders WHERE id = p_original_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Original order not found');
  END IF;

  SELECT * INTO v_replacement FROM orders WHERE id = p_replacement_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Replacement order not found');
  END IF;

  -- 2) Idempotency
  IF v_original.replaced_by_order_id = p_replacement_order_id THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_finalized', true,
      'original_order_id', p_original_order_id,
      'replacement_order_id', p_replacement_order_id
    );
  END IF;

  -- 3) Validation
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

  v_original_total := v_original.total_amount;
  v_replacement_total := v_replacement.total_amount;

  -- 4) Link
  UPDATE orders SET replaced_by_order_id = p_replacement_order_id, updated_at = now()
    WHERE id = p_original_order_id;
  UPDATE orders SET replaces_order_id = p_original_order_id, updated_at = now()
    WHERE id = p_replacement_order_id;

  -- 6a) Capture original invoice id (if any) BEFORE cancel so we can find it after
  SELECT id INTO v_original_invoice_id
    FROM invoices
    WHERE order_id = p_original_order_id
      AND status <> 'cancelled'
    ORDER BY created_at DESC
    LIMIT 1;

  IF v_original_invoice_id IS NULL THEN
    -- maybe already cancelled by a prior partial run
    SELECT id INTO v_original_invoice_id
      FROM invoices
      WHERE order_id = p_original_order_id
      ORDER BY created_at DESC
      LIMIT 1;
  END IF;

  -- 5) Cancel original via existing atomic RPC
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

  -- 6) Invoice supersede
  IF v_original_invoice_id IS NOT NULL THEN
    SELECT id INTO v_replacement_invoice_id
      FROM invoices
      WHERE order_id = p_replacement_order_id
        AND status <> 'cancelled'
      ORDER BY created_at DESC
      LIMIT 1;

    UPDATE invoices
      SET status = 'superseded',
          superseded_by_invoice_id = v_replacement_invoice_id,
          updated_at = now()
      WHERE id = v_original_invoice_id;

    IF v_replacement_invoice_id IS NOT NULL THEN
      UPDATE invoices
        SET revises_invoice_id = v_original_invoice_id,
            updated_at = now()
        WHERE id = v_replacement_invoice_id;
    END IF;
  END IF;

  -- 7) Log
  INSERT INTO order_edit_log (original_order_id, replacement_order_id, edited_by, reason, edit_summary)
  VALUES (
    p_original_order_id,
    p_replacement_order_id,
    p_edited_by,
    p_reason,
    jsonb_build_object(
      'old_total_amount', v_original_total,
      'new_total_amount', v_replacement_total,
      'cancel_result', v_cancel_result,
      'original_invoice_id', v_original_invoice_id,
      'replacement_invoice_id', v_replacement_invoice_id
    )
  );

  -- 8) Return
  RETURN jsonb_build_object(
    'success', true,
    'original_order_id', p_original_order_id,
    'replacement_order_id', p_replacement_order_id,
    'old_total_amount', v_original_total,
    'new_total_amount', v_replacement_total,
    'original_invoice_id', v_original_invoice_id,
    'replacement_invoice_id', v_replacement_invoice_id,
    'invoice_superseded', v_original_invoice_id IS NOT NULL,
    'cancel_result', v_cancel_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_order_edit(uuid, uuid, uuid, text) TO authenticated, service_role;