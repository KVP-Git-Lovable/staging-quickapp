
-- 1) Authoritative recompute helper
CREATE OR REPLACE FUNCTION public.recompute_retailer_pending(p_retailer_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_pending numeric := 0;
BEGIN
  IF p_retailer_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(GREATEST(COALESCE(credit_pending_amount, 0), 0)), 0)
    INTO v_new_pending
  FROM public.orders
  WHERE retailer_id = p_retailer_id
    AND COALESCE(status, '') <> 'cancelled'
    AND is_credit_order = true;

  UPDATE public.retailers
     SET pending_amount = v_new_pending,
         updated_at = now()
   WHERE id = p_retailer_id;

  RETURN v_new_pending;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_retailer_pending(uuid) TO authenticated, service_role;

-- 2) Replace the hand-computed delta in sync_order_with_items_v2 with the recompute helper
CREATE OR REPLACE FUNCTION public.sync_order_with_items_v2(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order        jsonb := p_payload->'order';
  v_items        jsonb := COALESCE(p_payload->'items', '[]'::jsonb);
  v_order_id     uuid;
  v_idem         text;
  v_retailer_id  uuid;
  v_user_id      uuid;
  v_visit_id     uuid;
  v_total        numeric;
  v_items_count  int := jsonb_array_length(v_items);
  v_taxable_sum  numeric := 0;
  v_sgst_sum     numeric := 0;
  v_cgst_sum     numeric := 0;
  v_expected_total numeric;
  v_inserted     int;
  v_existing_id  uuid;
  v_before_pend  numeric;
  v_after_pend   numeric;
  v_is_credit    boolean;
  v_channel      text;
  v_errors       jsonb := '[]'::jsonb;
  v_item         jsonb;
  v_pid          uuid;
  v_vid          uuid;
  v_qty          numeric;
  v_rate         numeric;
  v_line_total   numeric;
  v_device_id    text := COALESCE(p_payload->>'device_id', NULL);
BEGIN
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('status','validation_error','errors',jsonb_build_array('order object missing'));
  END IF;

  v_order_id    := NULLIF(v_order->>'id','')::uuid;
  v_idem        := NULLIF(v_order->>'idempotency_key','');
  v_retailer_id := NULLIF(v_order->>'retailer_id','')::uuid;
  v_user_id     := NULLIF(v_order->>'user_id','')::uuid;
  v_visit_id    := NULLIF(v_order->>'visit_id','')::uuid;
  v_total       := COALESCE((v_order->>'total_amount')::numeric, 0);
  v_is_credit   := COALESCE((v_order->>'is_credit_order')::boolean, false);
  v_channel     := CASE COALESCE(v_order->>'sales_channel','')
                     WHEN 'van_sales'             THEN 'field'
                     WHEN 'order_based_delivery'  THEN 'field'
                     WHEN 'counter'               THEN 'counter'
                     WHEN 'event'                 THEN 'event'
                     WHEN 'field'                 THEN 'field'
                     ELSE 'field'
                   END;

  IF v_order_id IS NULL THEN v_errors := v_errors || to_jsonb('order.id missing or invalid'::text); END IF;
  IF v_idem IS NULL THEN v_errors := v_errors || to_jsonb('idempotency_key missing'::text); END IF;
  IF v_retailer_id IS NULL THEN v_errors := v_errors || to_jsonb('retailer_id missing or invalid'::text); END IF;
  IF v_user_id IS NULL THEN v_errors := v_errors || to_jsonb('user_id missing or invalid'::text); END IF;
  IF v_items_count = 0 THEN v_errors := v_errors || to_jsonb('items array empty'::text); END IF;
  IF v_total < 0 THEN v_errors := v_errors || to_jsonb('total_amount negative'::text); END IF;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object('status','validation_error','errors',v_errors);
  END IF;

  SELECT id INTO v_existing_id FROM public.orders WHERE idempotency_key = v_idem LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('status','duplicate','order_id',v_existing_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.retailers WHERE id = v_retailer_id) THEN
    v_errors := v_errors || to_jsonb('retailer not found'::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    v_errors := v_errors || to_jsonb('user not found'::text);
  END IF;

  FOR v_item IN SELECT jsonb_array_elements(v_items) LOOP
    v_pid        := NULLIF(v_item->>'product_id','')::uuid;
    v_vid        := NULLIF(v_item->>'variant_id','')::uuid;
    v_qty        := (v_item->>'quantity')::numeric;
    v_rate       := COALESCE((v_item->>'rate')::numeric, 0);
    v_line_total := COALESCE((v_item->>'total')::numeric, 0);

    IF v_pid IS NULL AND v_vid IS NULL THEN
      v_errors := v_errors || to_jsonb('item.product_id or variant_id required'::text); CONTINUE;
    END IF;

    IF v_pid IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_pid)
       AND NOT EXISTS (SELECT 1 FROM public.product_variants WHERE id = v_pid) THEN
      v_errors := v_errors || to_jsonb(format('product %s not found', v_pid));
    END IF;

    IF v_vid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.product_variants WHERE id = v_vid) THEN
      v_errors := v_errors || to_jsonb(format('variant %s not found', v_vid));
    END IF;

    IF v_qty IS NULL OR v_qty <= 0 THEN v_errors := v_errors || to_jsonb('item.quantity must be > 0'::text); END IF;
    IF v_rate < 0 THEN v_errors := v_errors || to_jsonb('item.rate negative'::text); END IF;
    IF v_line_total < 0 THEN v_errors := v_errors || to_jsonb('item.total negative'::text); END IF;

    v_taxable_sum := v_taxable_sum + v_line_total;
    v_sgst_sum    := v_sgst_sum + COALESCE(NULLIF(v_item->>'sgst_amount','')::numeric, 0);
    v_cgst_sum    := v_cgst_sum + COALESCE(NULLIF(v_item->>'cgst_amount','')::numeric, 0);
  END LOOP;

  v_expected_total := round(v_taxable_sum + v_sgst_sum + v_cgst_sum);
  IF abs(v_expected_total - v_total) > 1 THEN
    v_errors := v_errors || to_jsonb(format(
      'total_amount %s != taxable(%s) + sgst(%s) + cgst(%s) = expected %s',
      v_total, v_taxable_sum, v_sgst_sum, v_cgst_sum, v_expected_total
    ));
  END IF;

  IF jsonb_array_length(v_errors) > 0 THEN
    INSERT INTO public.sync_audit_log(order_id, idempotency_key, user_id, device_id, payload, status, error)
    VALUES (v_order_id, v_idem, v_user_id, v_device_id, p_payload, 'validation_error', v_errors::text);
    RETURN jsonb_build_object('status','validation_error','errors',v_errors);
  END IF;

  SELECT COALESCE(pending_amount,0) INTO v_before_pend
    FROM public.retailers WHERE id = v_retailer_id FOR UPDATE;

  BEGIN
    INSERT INTO public.orders (
      id, user_id, visit_id, retailer_id, retailer_name,
      subtotal, discount_amount, total_amount, status,
      distributor_id, distributor_name,
      is_credit_order, credit_pending_amount, credit_paid_amount, previous_pending_cleared,
      payment_method, payment_proof_url, upi_last_four_code,
      invoice_number, order_date, idempotency_key,
      delivery_date, beat_id, territory_id, order_source,
      parent_order_id, is_backorder, event_id, counter_customer_id, owner_id_snapshot,
      sales_channel, created_at
    ) VALUES (
      v_order_id, v_user_id, v_visit_id, v_retailer_id, COALESCE(v_order->>'retailer_name',''),
      COALESCE((v_order->>'subtotal')::numeric, v_total),
      COALESCE((v_order->>'discount_amount')::numeric, 0),
      v_total,
      COALESCE(v_order->>'status','confirmed'),
      NULLIF(v_order->>'distributor_id','')::uuid, v_order->>'distributor_name',
      v_is_credit,
      COALESCE((v_order->>'credit_pending_amount')::numeric, 0),
      COALESCE((v_order->>'credit_paid_amount')::numeric, 0),
      COALESCE((v_order->>'previous_pending_cleared')::numeric, 0),
      v_order->>'payment_method', v_order->>'payment_proof_url', v_order->>'upi_last_four_code',
      v_order->>'invoice_number',
      COALESCE((v_order->>'order_date')::date, CURRENT_DATE),
      v_idem,
      NULLIF(v_order->>'delivery_date','')::date,
      v_order->>'beat_id', v_order->>'territory_id', v_order->>'order_source',
      NULLIF(v_order->>'parent_order_id','')::uuid,
      COALESCE((v_order->>'is_backorder')::boolean,false),
      NULLIF(v_order->>'event_id','')::uuid,
      NULLIF(v_order->>'counter_customer_id','')::uuid,
      NULLIF(v_order->>'owner_id_snapshot','')::uuid,
      v_channel,
      COALESCE((v_order->>'created_at')::timestamptz, now())
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_existing_id FROM public.orders WHERE idempotency_key = v_idem LIMIT 1;
    RETURN jsonb_build_object('status','duplicate','order_id', v_existing_id);
  END;

  INSERT INTO public.order_items (
    order_id, product_id, variant_id, product_name, category, rate, unit, quantity, total,
    original_rate, discount_amount, hsn_code, sgst_amount, cgst_amount,
    uom_id, uom_code, conversion_to_base
  )
  SELECT
    v_order_id,
    CASE
      WHEN NULLIF(it->>'product_id','') IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = (it->>'product_id')::uuid)
        THEN (it->>'product_id')::uuid
      ELSE NULL
    END,
    CASE
      WHEN NULLIF(it->>'variant_id','') IS NOT NULL
        THEN NULLIF(it->>'variant_id','')::uuid
      WHEN NULLIF(it->>'product_id','') IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.id = (it->>'product_id')::uuid)
        THEN (it->>'product_id')::uuid
      ELSE NULL
    END,
    COALESCE(it->>'product_name',''),
    COALESCE(it->>'category','Uncategorized'),
    COALESCE((it->>'rate')::numeric,0),
    COALESCE(it->>'unit',''),
    (it->>'quantity')::numeric,
    COALESCE((it->>'total')::numeric,0),
    NULLIF(it->>'original_rate','')::numeric,
    NULLIF(it->>'discount_amount','')::numeric,
    it->>'hsn_code',
    NULLIF(it->>'sgst_amount','')::numeric,
    NULLIF(it->>'cgst_amount','')::numeric,
    NULLIF(it->>'uom_id','')::uuid,
    COALESCE(NULLIF(it->>'uom_code',''), NULLIF(it->>'unit','')),
    NULLIF(it->>'conversion_to_base','')::numeric
  FROM jsonb_array_elements(v_items) AS it;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted <> v_items_count THEN
    RAISE EXCEPTION 'partial item insert: expected %, inserted %', v_items_count, v_inserted;
  END IF;

  -- AUTHORITATIVE: recompute retailer pending from active credit orders
  v_after_pend := public.recompute_retailer_pending(v_retailer_id);

  IF v_after_pend IS DISTINCT FROM v_before_pend THEN
    INSERT INTO public.retailer_pending_audit
      (retailer_id, order_id, delta, before_amount, after_amount, reason, actor_user_id)
    VALUES
      (v_retailer_id, v_order_id, COALESCE(v_after_pend,0) - COALESCE(v_before_pend,0),
       v_before_pend, v_after_pend, 'order_sync_v2_recompute', v_user_id);
  END IF;

  IF v_visit_id IS NOT NULL THEN
    UPDATE public.visits
       SET status = 'productive',
           check_out_time = COALESCE(check_out_time, now()),
           updated_at = now()
     WHERE id = v_visit_id;
  END IF;

  INSERT INTO public.sync_audit_log(order_id, idempotency_key, user_id, device_id, payload, status, error)
  VALUES (v_order_id, v_idem, v_user_id, v_device_id, p_payload, 'ok', NULL);

  RETURN jsonb_build_object(
    'status','ok',
    'order_id', v_order_id,
    'pending_before', v_before_pend,
    'pending_after', v_after_pend
  );
END;
$function$;

-- 3) cancel_order_atomic: call recompute at the end so cancellation reflects authoritatively.
--    We don't touch the body — just wrap a thin post-hook by recreating the function with
--    the same signature and appending the recompute call before RETURN.
CREATE OR REPLACE FUNCTION public.cancel_order_atomic(
  p_order_id uuid,
  p_reason text,
  p_cancelled_by uuid,
  p_settlement_method text DEFAULT NULL,
  p_settlement_amount numeric DEFAULT 0,
  p_van_stock_action text DEFAULT NULL
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
  v_new_pending numeric;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status = 'cancelled' THEN
    -- Still self-heal pending on idempotent re-calls.
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

  IF v_order.is_credit_order AND v_order.credit_pending_amount > 0 THEN
    v_credit_reversed := v_order.credit_pending_amount;
    INSERT INTO credit_ledger (retailer_id, amount, type, reference_id, created_by)
    VALUES (v_order.retailer_id, -v_credit_reversed, 'order_cancel', p_order_id, p_cancelled_by);
  END IF;

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

  -- AUTHORITATIVE: recompute retailer pending from active credit orders.
  v_new_pending := public.recompute_retailer_pending(v_order.retailer_id);

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
      'van_stock_action', p_van_stock_action,
      'retailer_pending_after', v_new_pending
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
    'van_stock_action', p_van_stock_action,
    'retailer_pending', v_new_pending
  );
END;
$function$;

-- 4) finalize_order_edit: recompute retailer pending after cancel+link so the final value
--    equals (other active orders' pending) + (replacement's unpaid).
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
  v_new_pending numeric;
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
      'success', true,
      'already_finalized', true,
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

  SELECT id INTO v_original_invoice_id
    FROM invoices
    WHERE order_id = p_original_order_id
      AND status <> 'cancelled'
    ORDER BY created_at DESC
    LIMIT 1;

  IF v_original_invoice_id IS NULL THEN
    SELECT id INTO v_original_invoice_id
      FROM invoices
      WHERE order_id = p_original_order_id
      ORDER BY created_at DESC
      LIMIT 1;
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

  -- AUTHORITATIVE: re-sync retailer pending after both cancel+replace are linked.
  v_new_pending := public.recompute_retailer_pending(v_original.retailer_id);

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
    'original_invoice_id', v_original_invoice_id,
    'replacement_invoice_id', v_replacement_invoice_id,
    'invoice_superseded', v_original_invoice_id IS NOT NULL,
    'cancel_result', v_cancel_result,
    'retailer_pending', v_new_pending
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_order_edit(uuid, uuid, uuid, text) TO authenticated, service_role;

-- 5) FIFO payment: switch tail recompute to the helper so all paths share one source of truth.
CREATE OR REPLACE FUNCTION public.apply_retailer_payment_fifo(
  p_retailer_id uuid,
  p_amount numeric,
  p_collection_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining numeric := p_amount;
  v_allocations jsonb := '[]'::jsonb;
  v_new_pending numeric := 0;
  v_apply numeric;
  v_order RECORD;
  v_already_allocated numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  SELECT COALESCE(SUM(amount_applied), 0) INTO v_already_allocated
  FROM public.retailer_payment_allocations
  WHERE collection_id = p_collection_id;

  IF v_already_allocated > 0 THEN
    v_new_pending := public.recompute_retailer_pending(p_retailer_id);
    RETURN jsonb_build_object(
      'already_applied', true,
      'allocated_amount', v_already_allocated,
      'unallocated_amount', GREATEST(p_amount - v_already_allocated, 0),
      'new_pending_amount', v_new_pending,
      'allocations', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'order_id', order_id,
          'applied_amount', amount_applied
        )), '[]'::jsonb)
        FROM public.retailer_payment_allocations
        WHERE collection_id = p_collection_id
      )
    );
  END IF;

  PERFORM 1 FROM public.retailers WHERE id = p_retailer_id FOR UPDATE;

  FOR v_order IN
    SELECT id, COALESCE(credit_pending_amount, 0) AS pending, COALESCE(credit_paid_amount, 0) AS paid, total_amount
    FROM public.orders
    WHERE retailer_id = p_retailer_id
      AND is_credit_order = true
      AND COALESCE(status, '') <> 'cancelled'
      AND COALESCE(credit_pending_amount, 0) > 0
    ORDER BY order_date ASC NULLS LAST, created_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_apply := LEAST(v_remaining, v_order.pending);

    UPDATE public.orders
    SET credit_paid_amount = COALESCE(credit_paid_amount, 0) + v_apply,
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

    v_allocations := v_allocations || jsonb_build_object(
      'order_id', v_order.id,
      'applied_amount', v_apply,
      'remaining_after', v_order.pending - v_apply
    );

    v_remaining := v_remaining - v_apply;
  END LOOP;

  v_new_pending := public.recompute_retailer_pending(p_retailer_id);

  RETURN jsonb_build_object(
    'already_applied', false,
    'allocated_amount', p_amount - v_remaining,
    'unallocated_amount', v_remaining,
    'new_pending_amount', v_new_pending,
    'allocations', v_allocations
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_retailer_payment_fifo(uuid, numeric, uuid) TO authenticated;

-- 6) One-time self-heal so any pre-existing drift is fixed
DO $$
DECLARE
  v_rid uuid;
BEGIN
  FOR v_rid IN SELECT DISTINCT retailer_id FROM public.orders WHERE retailer_id IS NOT NULL LOOP
    PERFORM public.recompute_retailer_pending(v_rid);
  END LOOP;
END $$;
