
CREATE OR REPLACE FUNCTION public.sync_order_with_items_v2(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_sum          numeric := 0;
  v_inserted     int;
  v_existing_id  uuid;
  v_before_pend  numeric;
  v_after_pend   numeric;
  v_delta        numeric;
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
  v_recon        jsonb;
BEGIN
  -- ---- 1. Shape validation ----
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
  v_channel     := COALESCE(v_order->>'sales_channel','order_based_delivery');

  IF v_order_id IS NULL THEN v_errors := v_errors || to_jsonb('order.id missing or invalid'::text); END IF;
  IF v_idem IS NULL THEN v_errors := v_errors || to_jsonb('idempotency_key missing'::text); END IF;
  IF v_retailer_id IS NULL THEN v_errors := v_errors || to_jsonb('retailer_id missing or invalid'::text); END IF;
  IF v_user_id IS NULL THEN v_errors := v_errors || to_jsonb('user_id missing or invalid'::text); END IF;
  IF v_items_count = 0 THEN v_errors := v_errors || to_jsonb('items array empty'::text); END IF;
  IF v_total < 0 THEN v_errors := v_errors || to_jsonb('total_amount negative'::text); END IF;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object('status','validation_error','errors',v_errors);
  END IF;

  -- ---- 2. Idempotency check (no lock yet — fast path) ----
  SELECT id INTO v_existing_id FROM public.orders WHERE idempotency_key = v_idem LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('status','duplicate','order_id',v_existing_id);
  END IF;

  -- ---- 3. Entity existence ----
  IF NOT EXISTS (SELECT 1 FROM public.retailers WHERE id = v_retailer_id) THEN
    v_errors := v_errors || to_jsonb('retailer not found'::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    v_errors := v_errors || to_jsonb('user not found'::text);
  END IF;

  FOR v_item IN SELECT jsonb_array_elements(v_items) LOOP
    v_pid := NULLIF(v_item->>'product_id','')::uuid;
    v_vid := NULLIF(v_item->>'variant_id','')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_rate := COALESCE((v_item->>'rate')::numeric, 0);
    v_line_total := COALESCE((v_item->>'total')::numeric, 0);

    IF v_pid IS NULL THEN v_errors := v_errors || to_jsonb('item.product_id missing/invalid'::text); CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_pid) THEN
      v_errors := v_errors || to_jsonb(format('product %s not found', v_pid));
    END IF;
    IF v_vid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.product_variants WHERE id = v_vid) THEN
      v_errors := v_errors || to_jsonb(format('variant %s not found', v_vid));
    END IF;
    IF v_qty IS NULL OR v_qty <= 0 THEN v_errors := v_errors || to_jsonb('item.quantity must be > 0'::text); END IF;
    IF v_rate < 0 THEN v_errors := v_errors || to_jsonb('item.rate negative'::text); END IF;
    IF v_line_total < 0 THEN v_errors := v_errors || to_jsonb('item.total negative'::text); END IF;
    v_sum := v_sum + v_line_total;
  END LOOP;

  -- ---- 4. Totals reconciliation ----
  IF abs(v_sum - v_total) > 0.01 THEN
    v_errors := v_errors || to_jsonb(format('total_amount %s != sum(items.total) %s', v_total, v_sum));
  END IF;

  IF jsonb_array_length(v_errors) > 0 THEN
    INSERT INTO public.sync_audit_log(order_id, idempotency_key, user_id, device_id, payload, status, error)
    VALUES (v_order_id, v_idem, v_user_id, v_device_id, p_payload, 'validation_error', v_errors::text);
    RETURN jsonb_build_object('status','validation_error','errors',v_errors);
  END IF;

  -- ---- 5. Retailer lock (serialize accounting per retailer) ----
  SELECT COALESCE(pending_amount,0) INTO v_before_pend
    FROM public.retailers WHERE id = v_retailer_id FOR UPDATE;

  -- ---- 6. Insert order header ----
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

  -- ---- 7. Bulk insert items ----
  INSERT INTO public.order_items (
    order_id, product_id, variant_id, product_name, category, rate, unit, quantity, total,
    original_rate, discount_amount, hsn_code, sgst_amount, cgst_amount
  )
  SELECT
    v_order_id,
    (it->>'product_id')::uuid,
    NULLIF(it->>'variant_id','')::uuid,
    COALESCE(it->>'product_name',''),
    COALESCE(it->>'category',''),
    COALESCE((it->>'rate')::numeric,0),
    COALESCE(it->>'unit',''),
    (it->>'quantity')::numeric,
    COALESCE((it->>'total')::numeric,0),
    NULLIF(it->>'original_rate','')::numeric,
    NULLIF(it->>'discount_amount','')::numeric,
    it->>'hsn_code',
    NULLIF(it->>'sgst_amount','')::numeric,
    NULLIF(it->>'cgst_amount','')::numeric
  FROM jsonb_array_elements(v_items) AS it;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- ---- 8. Partial-insert guard ----
  IF v_inserted <> v_items_count THEN
    RAISE EXCEPTION 'partial item insert: expected %, inserted %', v_items_count, v_inserted;
  END IF;

  -- ---- 9. Retailer pending atomic delta ----
  v_delta := CASE WHEN v_is_credit
                  THEN COALESCE((v_order->>'credit_pending_amount')::numeric, v_total)
                  ELSE 0 END
           - COALESCE((v_order->>'previous_pending_cleared')::numeric, 0);

  IF v_delta <> 0 THEN
    UPDATE public.retailers
       SET pending_amount = COALESCE(pending_amount,0) + v_delta,
           updated_at = now()
     WHERE id = v_retailer_id
     RETURNING pending_amount INTO v_after_pend;

    INSERT INTO public.retailer_pending_audit
      (retailer_id, order_id, delta, before_amount, after_amount, reason, actor_user_id)
    VALUES
      (v_retailer_id, v_order_id, v_delta, v_before_pend, v_after_pend, 'order_sync_v2', v_user_id);
  ELSE
    v_after_pend := v_before_pend;
  END IF;

  -- ---- 10. Visit update ----
  IF v_visit_id IS NOT NULL THEN
    UPDATE public.visits
       SET status = 'productive', updated_at = now()
     WHERE id = v_visit_id;
  END IF;

  -- ---- 11. Van stock decrement ----
  IF v_channel = 'van_sales' THEN
    DECLARE
      v_van_stock_id uuid;
      v_left numeric;
    BEGIN
      SELECT vs.id INTO v_van_stock_id
        FROM public.van_stock vs
       WHERE vs.user_id = v_user_id
         AND vs.stock_date = COALESCE((v_order->>'order_date')::date, CURRENT_DATE)
         AND vs.status = 'active'
       ORDER BY vs.created_at DESC LIMIT 1;

      IF v_van_stock_id IS NOT NULL THEN
        FOR v_item IN SELECT jsonb_array_elements(v_items) LOOP
          v_pid := (v_item->>'product_id')::uuid;
          v_qty := (v_item->>'quantity')::numeric;
          UPDATE public.van_stock_items
             SET ordered_qty = COALESCE(ordered_qty,0) + v_qty,
                 left_qty    = COALESCE(left_qty,0) - v_qty,
                 updated_at  = now()
           WHERE van_stock_id = v_van_stock_id
             AND product_id = v_pid
           RETURNING left_qty INTO v_left;
          IF v_left IS NOT NULL AND v_left < 0 THEN
            RAISE EXCEPTION 'van stock would go negative for product % (left=%)', v_pid, v_left;
          END IF;
        END LOOP;
      END IF;
    END;
  END IF;

  -- ---- 12. Reconciliation + audit ----
  v_recon := jsonb_build_object(
    'items_inserted', v_inserted,
    'items_expected', v_items_count,
    'retailer_pending_before', v_before_pend,
    'retailer_pending_after',  v_after_pend,
    'delta', v_delta
  );

  INSERT INTO public.sync_audit_log(order_id, idempotency_key, user_id, device_id, payload, status, reconciliation)
  VALUES (v_order_id, v_idem, v_user_id, v_device_id, p_payload, 'ok', v_recon);

  RETURN jsonb_build_object(
    'status','ok',
    'order_id', v_order_id,
    'items_inserted', v_inserted,
    'retailer_pending_after', v_after_pend,
    'reconciliation', v_recon
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.sync_audit_log(order_id, idempotency_key, user_id, device_id, payload, status, error)
  VALUES (v_order_id, v_idem, v_user_id, v_device_id, p_payload, 'error', SQLERRM);
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_order_with_items_v2(jsonb) TO authenticated, anon;

-- Rewrite legacy shim to forward to v2 (preserves any in-flight callers)
CREATE OR REPLACE FUNCTION public.sync_order_with_items(p_order jsonb, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order jsonb := p_order;
BEGIN
  IF v_order ? 'idempotency_key' = false OR (v_order->>'idempotency_key') IS NULL THEN
    v_order := v_order || jsonb_build_object('idempotency_key', v_order->>'id');
  END IF;
  RETURN public.sync_order_with_items_v2(jsonb_build_object('order', v_order, 'items', p_items));
END;
$$;
