
-- Extend cancel_order_atomic with: revenue-target recompute, partial-payment settlement,
-- van-stock handling, invoice metadata. All existing tables reused.

DROP FUNCTION IF EXISTS public.cancel_order_atomic(uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.cancel_order_atomic(
  p_order_id uuid,
  p_reason text,
  p_cancelled_by uuid,
  p_settlement_method text DEFAULT NULL,   -- 'refund' | 'credit_note' | 'carry_forward'
  p_settlement_amount numeric DEFAULT 0,
  p_van_stock_action text DEFAULT NULL     -- 'collected' | 'damaged' | 'not_collected'
)
RETURNS jsonb
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
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', true, 'already_cancelled', true);
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

  -- Cancel invoice with metadata (Phase 0 columns)
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

  -- Reverse UNPAID credit portion (existing behaviour)
  IF v_order.is_credit_order AND v_order.credit_pending_amount > 0 THEN
    v_credit_reversed := v_order.credit_pending_amount;
    INSERT INTO credit_ledger (retailer_id, amount, type, reference_id, created_by)
    VALUES (v_order.retailer_id, -v_credit_reversed, 'order_cancel', p_order_id, p_cancelled_by);
  END IF;

  -- Settle ALREADY-PAID credit portion (new)
  IF v_order.is_credit_order
     AND COALESCE(v_order.credit_paid_amount, 0) > 0
     AND p_settlement_method IS NOT NULL
     AND COALESCE(p_settlement_amount, 0) > 0 THEN

    IF p_settlement_method = 'refund' THEN
      INSERT INTO credit_ledger (retailer_id, amount, type, reference_id, created_by)
      VALUES (v_order.retailer_id, -p_settlement_amount, 'cancel_refund', p_order_id, p_cancelled_by);
      v_settlement_recorded := true;

    ELSIF p_settlement_method = 'carry_forward' THEN
      INSERT INTO credit_ledger (retailer_id, amount, type, reference_id, created_by)
      VALUES (v_order.retailer_id, -p_settlement_amount, 'cancel_carry_forward', p_order_id, p_cancelled_by);
      v_settlement_recorded := true;

    ELSIF p_settlement_method = 'credit_note' THEN
      -- Generate CN number CN/YY-YY/NNN
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
        p_settlement_amount, 0, 0, p_settlement_amount, 'issued', p_cancelled_by
      ) RETURNING id INTO v_cn_id;

      -- Mirror order items into credit_note_items
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
    END IF;
  END IF;

  -- Van stock handling (only when a van_stock row exists for this user+date)
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
            -- Return to sellable: ordered down, left up
            UPDATE van_stock_items SET
              ordered_qty = GREATEST(0, COALESCE(ordered_qty,0) - v_item.quantity::int),
              left_qty    = COALESCE(left_qty,0) + v_item.quantity::int,
              updated_at  = v_now
            WHERE id = v_van_stock_item.id;
          ELSIF p_van_stock_action = 'damaged' THEN
            -- Remove from ordered (cancelled) but DO NOT return to sellable stock
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

  -- Retailer last_order_date refresh
  UPDATE retailers SET
    last_order_date = (
      SELECT MAX(order_date) FROM orders
      WHERE retailer_id = v_order.retailer_id
        AND status = 'confirmed'
        AND id != p_order_id
    ),
    updated_at = v_now
  WHERE id = v_order.retailer_id;

  -- Visit revert
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

  -- Gamification reversal
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

  -- Loyalty reversal
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

  -- Recompute revenue targets (cancel must not leave stale actuals)
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

  -- Log (extended)
  INSERT INTO order_cancellation_log (order_id, reason, cancelled_by, reversal_summary)
  VALUES (
    p_order_id, p_reason, p_cancelled_by,
    jsonb_build_object(
      'credit_reversed', v_credit_reversed,
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
      'van_stock_action', p_van_stock_action
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'credit_reversed', v_credit_reversed,
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
    'van_stock_action', p_van_stock_action
  );
END;
$function$;
