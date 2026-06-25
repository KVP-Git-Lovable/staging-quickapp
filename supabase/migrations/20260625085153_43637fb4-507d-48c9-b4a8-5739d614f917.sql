ALTER TABLE public.order_edit_log
  ADD COLUMN IF NOT EXISTS original_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS replacement_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.finalize_order_edit(p_original_order_id uuid, p_replacement_order_id uuid, p_edited_by uuid, p_reason text, p_target_paid numeric DEFAULT NULL::numeric, p_new_collection_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
BEGIN
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

  -- Capture ORIGINAL snapshot BEFORE any mutation
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

  -- Capture REPLACEMENT snapshot AFTER all reconciliation, BEFORE log insert
  SELECT jsonb_build_object(
    'order', to_jsonb(r.*),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(oi.*)) FROM order_items oi
                       WHERE oi.order_id = p_replacement_order_id), '[]'::jsonb))
    INTO v_repl_snapshot FROM orders r WHERE r.id = p_replacement_order_id;

  INSERT INTO order_edit_log (original_order_id, replacement_order_id, edited_by, reason, edit_summary, original_snapshot, replacement_snapshot)
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
    v_repl_snapshot
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