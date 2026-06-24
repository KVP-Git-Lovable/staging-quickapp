CREATE OR REPLACE FUNCTION public.reflow_allocation_fifo(
  p_retailer_id     uuid,
  p_collection_id   uuid,
  p_amount          numeric,
  p_exclude_order_id uuid
) RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining numeric := COALESCE(p_amount, 0);
  v_apply     numeric;
  v_order     RECORD;
BEGIN
  IF v_remaining <= 0 THEN
    RETURN 0;
  END IF;

  FOR v_order IN
    SELECT id, COALESCE(credit_pending_amount, 0) AS pending
    FROM public.orders
    WHERE retailer_id = p_retailer_id
      AND is_credit_order = true
      AND COALESCE(status, '') <> 'cancelled'
      AND COALESCE(credit_pending_amount, 0) > 0
      AND id <> p_exclude_order_id
    ORDER BY order_date ASC NULLS LAST, created_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := LEAST(v_remaining, v_order.pending);

    UPDATE public.orders
    SET credit_paid_amount    = COALESCE(credit_paid_amount, 0) + v_apply,
        credit_pending_amount = COALESCE(credit_pending_amount, 0) - v_apply,
        payment_status = CASE
          WHEN COALESCE(credit_pending_amount, 0) - v_apply <= 0 THEN 'paid'
          ELSE 'partial'
        END
    WHERE id = v_order.id;

    INSERT INTO public.retailer_payment_allocations
      (collection_id, order_id, retailer_id, amount_applied)
    VALUES
      (p_collection_id, v_order.id, p_retailer_id, v_apply);

    v_remaining := v_remaining - v_apply;
  END LOOP;

  RETURN v_remaining;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_order_atomic(
  p_order_id uuid,
  p_reason text,
  p_cancelled_by uuid,
  p_settlement_method text DEFAULT NULL::text,
  p_settlement_amount numeric DEFAULT 0,
  p_van_stock_action text DEFAULT NULL::text
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_visit RECORD;
  v_credit_reversed NUMERIC := 0;
  v_gamification_points_reversed NUMERIC := 0;
  v_loyalty_points_reversed NUMERIC := 0;
  v_invoice_cancelled BOOLEAN := false;
  v_visit_reverted BOOLEAN := false;
  v_other_confirmed_orders INT;
  v_gam_row RECORD;
  v_loyalty_row RECORD;
  v_item RECORD;
  v_van_stock RECORD;
  v_van_stock_item RECORD;
  v_invoice RECORD;
  v_cn_id uuid;
  v_cn_number text;
  v_cn_prefix text;
  v_cn_count int;
  v_fy_start int;
  v_fy_end int;
  v_now timestamptz := now();
  v_kpi_id uuid;
  v_settlement_recorded boolean := false;
  v_new_pending numeric;
  v_alloc_freed numeric := 0;
  v_paid_settle numeric := 0;
  v_carry_leftover numeric := 0;
  v_left numeric := 0;
  v_cf_collection uuid;
  v_alloc RECORD;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status = 'cancelled' THEN
    v_new_pending := public.recompute_retailer_pending(v_order.retailer_id);
    RETURN jsonb_build_object('success', true, 'already_cancelled', true, 'retailer_pending', v_new_pending);
  END IF;

  IF v_order.status NOT IN ('confirmed', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot cancel order with status: ' || v_order.status);
  END IF;

  UPDATE orders SET
    status = 'cancelled',
    cancelled_at = v_now,
    cancellation_reason = p_reason,
    cancelled_by = p_cancelled_by,
    updated_at = v_now
  WHERE id = p_order_id;

  SELECT * INTO v_invoice FROM invoices WHERE order_id = p_order_id AND status != 'cancelled' LIMIT 1;
  IF FOUND THEN
    UPDATE invoices SET
      status = 'cancelled',
      cancelled_at = v_now,
      cancellation_reason = p_reason,
      updated_at = v_now
    WHERE id = v_invoice.id;
    v_invoice_cancelled := true;
  END IF;

  IF v_order.is_credit_order AND COALESCE(v_order.credit_pending_amount, 0) > 0 THEN
    v_credit_reversed := v_order.credit_pending_amount;
    INSERT INTO credit_ledger (retailer_id, amount, type, reference_id, created_by)
    VALUES (v_order.retailer_id, -v_credit_reversed, 'order_cancel', p_order_id, p_cancelled_by);
  END IF;

  SELECT COALESCE(SUM(amount_applied), 0) INTO v_alloc_freed
    FROM retailer_payment_allocations WHERE order_id = p_order_id;
  v_paid_settle := CASE WHEN v_alloc_freed > 0
                        THEN v_alloc_freed
                        ELSE COALESCE(v_order.credit_paid_amount, 0) END;

  IF v_order.is_credit_order AND v_paid_settle > 0 THEN
    IF p_settlement_method = 'carry_forward' THEN
      IF v_alloc_freed > 0 THEN
        FOR v_alloc IN
          SELECT collection_id, SUM(amount_applied) AS amt
          FROM retailer_payment_allocations
          WHERE order_id = p_order_id
          GROUP BY collection_id
        LOOP
          v_left := public.reflow_allocation_fifo(
                      v_order.retailer_id, v_alloc.collection_id, v_alloc.amt, p_order_id);
          v_carry_leftover := v_carry_leftover + v_left;
        END LOOP;
        DELETE FROM retailer_payment_allocations WHERE order_id = p_order_id;
      ELSE
        INSERT INTO retailer_payment_collections
          (retailer_id, amount, payment_method, collected_by_user_id, notes)
        VALUES
          (v_order.retailer_id, v_paid_settle, 'carry_forward', p_cancelled_by,
           'Carry-forward from cancelled order ' || COALESCE(v_order.invoice_number, p_order_id::text))
        RETURNING id INTO v_cf_collection;

        v_carry_leftover := public.reflow_allocation_fifo(
                              v_order.retailer_id, v_cf_collection, v_paid_settle, p_order_id);
      END IF;

      IF v_carry_leftover > 0 THEN
        INSERT INTO credit_ledger (retailer_id, amount, type, reference_id, created_by)
        VALUES (v_order.retailer_id, -v_carry_leftover, 'cancel_carry_forward', p_order_id, p_cancelled_by);
      END IF;
      v_settlement_recorded := true;

    ELSIF p_settlement_method = 'refund' THEN
      DELETE FROM retailer_payment_allocations WHERE order_id = p_order_id;
      INSERT INTO credit_ledger (retailer_id, amount, type, reference_id, created_by)
      VALUES (v_order.retailer_id, -v_paid_settle, 'cancel_refund', p_order_id, p_cancelled_by);
      v_settlement_recorded := true;

    ELSIF p_settlement_method = 'credit_note' THEN
      DELETE FROM retailer_payment_allocations WHERE order_id = p_order_id;

      v_fy_start := CASE WHEN EXTRACT(MONTH FROM v_now) >= 4
                         THEN EXTRACT(YEAR FROM v_now)::int
                         ELSE EXTRACT(YEAR FROM v_now)::int - 1 END;
      v_fy_end := v_fy_start + 1;
      v_cn_prefix := 'CN/' || RIGHT(v_fy_start::text, 2) || '-' || RIGHT(v_fy_end::text, 2) || '/';
      SELECT COUNT(*) INTO v_cn_count FROM credit_notes WHERE credit_note_number LIKE v_cn_prefix || '%';
      v_cn_number := v_cn_prefix || LPAD((v_cn_count + 1)::text, 3, '0');

      INSERT INTO credit_notes (
        credit_note_number, credit_note_date, retailer_id, retailer_name,
        reason, reason_notes, sub_total, sgst_total, cgst_total,
        total_amount, status, created_by
      ) VALUES (
        v_cn_number, v_now::date, v_order.retailer_id,
        (SELECT name FROM retailers WHERE id = v_order.retailer_id),
        'order_cancellation',
        'Cancellation of order ' || COALESCE(v_order.invoice_number, p_order_id::text) || ': ' || p_reason,
        v_paid_settle, 0, 0, v_paid_settle, 'issued', p_cancelled_by
      ) RETURNING id INTO v_cn_id;

      FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id LOOP
        INSERT INTO credit_note_items (
          credit_note_id, original_order_id, original_invoice_number, product_id,
          product_name, hsn_code, unit, quantity, rate, total,
          taxable_amount, sgst_amount, cgst_amount
        ) VALUES (
          v_cn_id, p_order_id, v_order.invoice_number, v_item.product_id,
          v_item.product_name, v_item.hsn_code, v_item.unit,
          v_item.quantity, v_item.rate, v_item.total,
          COALESCE(v_item.total - COALESCE(v_item.sgst_amount,0) - COALESCE(v_item.cgst_amount,0), v_item.total),
          COALESCE(v_item.sgst_amount, 0), COALESCE(v_item.cgst_amount, 0)
        );
      END LOOP;
      v_settlement_recorded := true;

    ELSE
      DELETE FROM retailer_payment_allocations WHERE order_id = p_order_id;
      INSERT INTO credit_ledger (retailer_id, amount, type, reference_id, created_by)
      VALUES (v_order.retailer_id, -v_paid_settle, 'cancel_carry_forward', p_order_id, p_cancelled_by);
      v_settlement_recorded := true;
    END IF;
  END IF;

  IF p_van_stock_action IS NOT NULL AND p_van_stock_action <> 'not_collected' THEN
    SELECT * INTO v_van_stock FROM van_stock
      WHERE user_id = v_order.user_id AND stock_date = v_order.order_date
      ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN
      FOR v_item IN SELECT product_id, product_name, quantity, unit FROM order_items WHERE order_id = p_order_id LOOP
        SELECT * INTO v_van_stock_item FROM van_stock_items
          WHERE van_stock_id = v_van_stock.id AND product_id = v_item.product_id::text
          LIMIT 1;
        IF FOUND THEN
          IF p_van_stock_action = 'collected' THEN
            UPDATE van_stock_items SET
              ordered_qty = GREATEST(0, COALESCE(ordered_qty,0) - v_item.quantity::int),
              left_qty    = COALESCE(left_qty,0) + v_item.quantity::int,
              updated_at  = v_now
            WHERE id = v_van_stock_item.id;
          ELSIF p_van_stock_action = 'damaged' THEN
            UPDATE van_stock_items SET
              ordered_qty = GREATEST(0, COALESCE(ordered_qty,0) - v_item.quantity::int),
              updated_at  = v_now
            WHERE id = v_van_stock_item.id;
          END IF;
        END IF;
        IF p_van_stock_action = 'damaged' THEN
          INSERT INTO van_stock_adjustments (
            van_stock_id, adjustment_type, product_id, product_name,
            quantity, reason, created_by
          ) VALUES (
            v_van_stock.id, 'damage', v_item.product_id::text, v_item.product_name,
            v_item.quantity::int,
            'Order ' || COALESCE(v_order.invoice_number, p_order_id::text) || ' cancelled (write-off): ' || p_reason,
            p_cancelled_by
          );
        END IF;
      END LOOP;
    END IF;
  END IF;

  UPDATE retailers SET
    last_order_date = (
      SELECT MAX(order_date) FROM orders
      WHERE retailer_id = v_order.retailer_id
        AND status = 'confirmed'
        AND id != p_order_id
    ),
    updated_at = v_now
  WHERE id = v_order.retailer_id;

  IF v_order.visit_id IS NOT NULL THEN
    SELECT * INTO v_visit FROM visits WHERE id = v_order.visit_id;
    IF FOUND AND v_visit.status = 'productive' AND COALESCE(v_visit.completion_source, 'order') = 'order' THEN
      SELECT COUNT(*) INTO v_other_confirmed_orders
      FROM orders
      WHERE visit_id = v_order.visit_id AND id != p_order_id AND status = 'confirmed';
      IF v_other_confirmed_orders = 0 THEN
        UPDATE visits SET status='planned', completion_source=NULL, updated_at=v_now WHERE id = v_order.visit_id;
        v_visit_reverted := true;
      END IF;
    END IF;
  END IF;

  FOR v_gam_row IN
    SELECT game_id, user_id, action_id, SUM(points) AS points_to_reverse
    FROM gamification_points
    WHERE reference_id = p_order_id AND reference_type = 'order' AND points > 0
    GROUP BY game_id, user_id, action_id
  LOOP
    INSERT INTO gamification_points (game_id, user_id, action_id, points, reference_type, reference_id, earned_at, metadata)
    VALUES (v_gam_row.game_id, v_gam_row.user_id, v_gam_row.action_id,
            -v_gam_row.points_to_reverse, 'order', p_order_id, v_now,
            jsonb_build_object('type','order_cancellation_reversal','order_id', p_order_id));
    v_gamification_points_reversed := v_gamification_points_reversed + v_gam_row.points_to_reverse;
  END LOOP;

  FOR v_loyalty_row IN
    SELECT program_id, retailer_id, action_id,
           COALESCE(awarded_by_user_id, p_cancelled_by) AS awarded_by_user_id,
           SUM(points) AS points_to_reverse
    FROM retailer_loyalty_points
    WHERE reference_id = p_order_id AND points > 0
    GROUP BY program_id, retailer_id, action_id, COALESCE(awarded_by_user_id, p_cancelled_by)
  LOOP
    INSERT INTO retailer_loyalty_points (program_id, retailer_id, action_id, points, reference_type, reference_id,
                                         earned_at, awarded_by_user_id, metadata, description, visit_id)
    VALUES (v_loyalty_row.program_id, v_loyalty_row.retailer_id, v_loyalty_row.action_id,
            -v_loyalty_row.points_to_reverse, 'order', p_order_id, v_now, v_loyalty_row.awarded_by_user_id,
            jsonb_build_object('type','order_cancellation_reversal','order_id', p_order_id),
            'Order cancellation reversal', v_order.visit_id);
    v_loyalty_points_reversed := v_loyalty_points_reversed + v_loyalty_row.points_to_reverse;
  END LOOP;

  UPDATE gamification_retailer_sequences
    SET consecutive_orders = GREATEST(0, consecutive_orders - 1), updated_at = v_now
    WHERE user_id = v_order.user_id AND retailer_id = v_order.retailer_id;

  UPDATE gamification_daily_tracking
    SET count = GREATEST(0, count - 1), updated_at = v_now
    WHERE user_id = v_order.user_id AND tracking_date = v_order.order_date;

  SELECT id INTO v_kpi_id FROM target_kpi_definitions WHERE kpi_key = 'revenue_contribution' LIMIT 1;
  IF v_kpi_id IS NOT NULL AND v_order.user_id IS NOT NULL THEN
    UPDATE user_period_targets upt
    SET actual_value = public.calculate_revenue_contribution(v_order.user_id, upt.period_start, upt.period_end),
        achievement_percent = CASE WHEN target_value > 0
          THEN ROUND((public.calculate_revenue_contribution(v_order.user_id, upt.period_start, upt.period_end) / target_value) * 100, 2)
          ELSE 0 END,
        last_calculated_at = v_now
    WHERE upt.user_id = v_order.user_id
      AND upt.kpi_id = v_kpi_id
      AND v_order.order_date BETWEEN upt.period_start AND upt.period_end;
  END IF;

  v_new_pending := public.recompute_retailer_pending(v_order.retailer_id);

  INSERT INTO order_cancellation_log (order_id, reason, cancelled_by, reversal_summary)
  VALUES (
    p_order_id, p_reason, p_cancelled_by,
    jsonb_build_object(
      'credit_reversed', v_credit_reversed,
      'paid_settled', v_paid_settle,
      'carry_leftover', v_carry_leftover,
      'gamification_points_reversed', v_gamification_points_reversed,
      'loyalty_points_reversed', v_loyalty_points_reversed,
      'invoice_cancelled', v_invoice_cancelled,
      'visit_reverted', v_visit_reverted,
      'retailer_id', v_order.retailer_id,
      'order_date', v_order.order_date,
      'settlement_method', p_settlement_method,
      'settlement_amount', COALESCE(p_settlement_amount, 0),
      'settlement_recorded', v_settlement_recorded,
      'credit_note_id', v_cn_id,
      'credit_note_number', v_cn_number,
      'van_stock_action', p_van_stock_action,
      'retailer_pending_after', v_new_pending
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'credit_reversed', v_credit_reversed,
    'paid_settled', v_paid_settle,
    'carry_leftover', v_carry_leftover,
    'gamification_points_reversed', v_gamification_points_reversed,
    'loyalty_points_reversed', v_loyalty_points_reversed,
    'invoice_cancelled', v_invoice_cancelled,
    'visit_reverted', v_visit_reverted,
    'retailer_id', v_order.retailer_id,
    'order_date', v_order.order_date,
    'settlement_method', p_settlement_method,
    'settlement_amount', COALESCE(p_settlement_amount, 0),
    'settlement_recorded', v_settlement_recorded,
    'credit_note_id', v_cn_id,
    'credit_note_number', v_cn_number,
    'van_stock_action', p_van_stock_action,
    'retailer_pending', v_new_pending
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_order_edit(
  p_original_order_id uuid,
  p_replacement_order_id uuid,
  p_edited_by uuid,
  p_reason text
) RETURNS jsonb
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

  v_new_pending := public.recompute_retailer_pending(v_original.retailer_id);

  INSERT INTO order_edit_log (original_order_id, replacement_order_id, edited_by, reason, edit_summary)
  VALUES (
    p_original_order_id, p_replacement_order_id, p_edited_by, p_reason,
    jsonb_build_object(
      'old_total_amount', v_original_total,
      'new_total_amount', v_replacement_total,
      'payment_carried', v_transfer,
      'cancel_result', v_cancel_result,
      'original_invoice_id', v_original_invoice_id,
      'replacement_invoice_id', v_replacement_invoice_id,
      'retailer_pending_after', v_new_pending
    )
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