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
  v_owner        uuid;
  v_placed_by    uuid;
  v_caller       uuid := auth.uid();
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
  v_pid_raw      text;
  v_vid_raw      text;
  v_sku_raw      text;
  v_vsku_raw     text;
  v_pname        text;
  v_resolved_pid uuid;
  v_resolved_vid uuid;
  v_qty          numeric;
  v_rate         numeric;
  v_line_total   numeric;
  v_device_id    text := COALESCE(p_payload->>'device_id', NULL);
  v_resolved_items jsonb := '[]'::jsonb;
  v_oob          boolean;
  v_oob_reason   text;
  v_is_planned   boolean;
  v_owner_snap   uuid;
  v_cfg          RECORD;
  v_mgr          uuid;
BEGIN
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('status','validation_error','errors',jsonb_build_array('order object missing'));
  END IF;

  v_order_id    := NULLIF(v_order->>'id','')::uuid;
  v_idem        := NULLIF(v_order->>'idempotency_key','');
  v_retailer_id := NULLIF(v_order->>'retailer_id','')::uuid;

  v_oob         := COALESCE((v_order->>'is_out_of_beat')::boolean, false);
  v_oob_reason  := NULLIF(v_order->>'out_of_beat_reason','');
  v_is_planned  := COALESCE((v_order->>'is_planned_beat')::boolean, false);

  -- True retailer owner snapshot
  IF v_retailer_id IS NOT NULL THEN
    SELECT user_id INTO v_owner_snap FROM public.retailers WHERE id = v_retailer_id;
  END IF;

  -- OOB guard + credit rule
  IF v_oob THEN
    SELECT oob_enabled, oob_credit_rule, oob_notify_manager
      INTO v_cfg FROM public.operations_config WHERE id = 1;
    IF NOT FOUND OR NOT COALESCE(v_cfg.oob_enabled, false) THEN
      RAISE EXCEPTION 'Out-of-beat ordering not allowed for this retailer';
    END IF;
    IF NOT public.retailer_in_user_oob_scope(v_retailer_id) THEN
      RAISE EXCEPTION 'Out-of-beat ordering not allowed for this retailer';
    END IF;

    IF v_cfg.oob_credit_rule = 'owner' THEN
      v_owner     := COALESCE(v_owner_snap, v_caller);
      v_placed_by := v_caller;
    ELSE
      v_owner     := v_caller;
      v_placed_by := NULL;
    END IF;
    v_user_id := v_owner;
  ELSE
    -- Existing on-behalf branch
    v_owner   := COALESCE(NULLIF(v_order->>'user_id',''), v_caller::text)::uuid;
    v_user_id := v_owner;

    IF v_owner IS DISTINCT FROM v_caller THEN
      IF NOT public.user_has_permission(v_caller, 'order_on_behalf', 'can_create') THEN
        RAISE EXCEPTION 'Not allowed to place orders on behalf';
      END IF;
      IF NOT (
        public.is_subordinate_of(v_caller, v_owner)
        OR public.user_has_permission(v_caller, 'order_on_behalf', 'can_view_all')
      ) THEN
        RAISE EXCEPTION 'That user is not in your team';
      END IF;
      v_placed_by := v_caller;
    ELSE
      v_placed_by := NULLIF(v_order->>'placed_by_user_id','')::uuid;
    END IF;
  END IF;

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
    v_pid_raw    := NULLIF(v_item->>'product_id','');
    v_vid_raw    := NULLIF(v_item->>'variant_id','');
    v_sku_raw    := NULLIF(v_item->>'sku','');
    v_vsku_raw   := NULLIF(v_item->>'variant_sku','');
    v_pname      := NULLIF(v_item->>'product_name','');
    v_qty        := (v_item->>'quantity')::numeric;
    v_rate       := COALESCE((v_item->>'rate')::numeric, 0);
    v_line_total := COALESCE((v_item->>'total')::numeric, 0);
    v_resolved_pid := NULL;
    v_resolved_vid := NULL;

    DECLARE
      v_is_free_placeholder boolean := (v_pname IS NOT NULL AND v_pname ILIKE '%(FREE)');
    BEGIN
      IF v_pid_raw IS NOT NULL THEN
        BEGIN
          SELECT id INTO v_resolved_pid FROM public.products WHERE id = v_pid_raw::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
          v_resolved_pid := NULL;
        END;
      END IF;

      IF v_resolved_pid IS NULL AND v_sku_raw IS NOT NULL THEN
        SELECT id INTO v_resolved_pid
          FROM public.products
         WHERE sku IS NOT NULL AND lower(sku) = lower(v_sku_raw)
         LIMIT 1;
      END IF;

      IF v_resolved_pid IS NULL AND v_pname IS NOT NULL THEN
        SELECT id INTO v_resolved_pid
          FROM public.products
         WHERE lower(btrim(name)) = lower(btrim(v_pname))
         LIMIT 1;
      END IF;

      IF v_resolved_pid IS NULL THEN
        IF v_is_free_placeholder THEN
          v_resolved_pid := NULL;
        ELSE
          v_errors := v_errors || to_jsonb(format('product not found: %s', COALESCE(v_pname, v_sku_raw, v_pid_raw, 'unknown')));
        END IF;
      END IF;

      IF v_vid_raw IS NOT NULL THEN
        BEGIN
          SELECT id INTO v_resolved_vid FROM public.product_variants WHERE id = v_vid_raw::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
          v_resolved_vid := NULL;
        END;
        IF v_resolved_vid IS NULL AND v_vsku_raw IS NOT NULL THEN
          SELECT id INTO v_resolved_vid
            FROM public.product_variants
           WHERE sku IS NOT NULL AND lower(sku) = lower(v_vsku_raw)
           LIMIT 1;
        END IF;
        IF v_resolved_vid IS NULL THEN
          v_errors := v_errors || to_jsonb(format('variant not found: %s', COALESCE(v_vsku_raw, v_vid_raw)));
        END IF;
      ELSIF v_pid_raw IS NOT NULL AND v_resolved_pid IS NULL THEN
        BEGIN
          SELECT id INTO v_resolved_vid FROM public.product_variants WHERE id = v_pid_raw::uuid;
          IF v_resolved_vid IS NOT NULL THEN
            SELECT product_id INTO v_resolved_pid FROM public.product_variants WHERE id = v_resolved_vid;
            v_errors := (
              SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
                FROM jsonb_array_elements(v_errors) e
               WHERE e::text NOT LIKE format('%%product not found: %s%%', COALESCE(v_pname, v_sku_raw, v_pid_raw, 'unknown'))
            );
          END IF;
        EXCEPTION WHEN invalid_text_representation THEN NULL;
        END;
      END IF;
    END;

    IF v_qty IS NULL OR v_qty <= 0 THEN v_errors := v_errors || to_jsonb('item.quantity must be > 0'::text); END IF;
    IF v_rate < 0 THEN v_errors := v_errors || to_jsonb('item.rate negative'::text); END IF;
    IF v_line_total < 0 THEN v_errors := v_errors || to_jsonb('item.total negative'::text); END IF;

    v_taxable_sum := v_taxable_sum + v_line_total;
    v_sgst_sum    := v_sgst_sum + COALESCE(NULLIF(v_item->>'sgst_amount','')::numeric, 0);
    v_cgst_sum    := v_cgst_sum + COALESCE(NULLIF(v_item->>'cgst_amount','')::numeric, 0);

    v_resolved_items := v_resolved_items || jsonb_build_array(
      v_item
        || jsonb_build_object(
             'resolved_product_id', CASE WHEN v_resolved_pid IS NULL THEN NULL ELSE to_jsonb(v_resolved_pid) END,
             'resolved_variant_id', CASE WHEN v_resolved_vid IS NULL THEN NULL ELSE to_jsonb(v_resolved_vid) END
           )
    );
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

  IF COALESCE((v_order->>'is_backdated')::boolean, false) THEN
    IF NOT public.can_backdate_order((COALESCE(v_order->>'order_date', CURRENT_DATE::text))::date) THEN
      RAISE EXCEPTION 'Backdating not allowed for this date';
    END IF;
  END IF;

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
      sales_channel, created_at,
      placed_by_user_id, is_backdated, backdate_reason,
      is_out_of_beat, out_of_beat_reason, is_planned_beat,
      oob_location
    ) VALUES (
      v_order_id, v_owner, v_visit_id, v_retailer_id, COALESCE(v_order->>'retailer_name',''),
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
      v_owner_snap,
      v_channel,
      COALESCE((v_order->>'created_at')::timestamptz, now()),
      v_placed_by,
      COALESCE((v_order->>'is_backdated')::boolean, false),
      NULLIF(v_order->>'backdate_reason',''),
      v_oob,
      v_oob_reason,
      v_is_planned,
      case when coalesce((v_order->>'is_out_of_beat')::boolean, false) then (v_order->'oob_location') else null end
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_existing_id FROM public.orders WHERE idempotency_key = v_idem LIMIT 1;
    RETURN jsonb_build_object('status','duplicate','order_id', v_existing_id);
  END;

  INSERT INTO public.order_items (
    order_id, product_id, variant_id, product_name, category, rate, unit, quantity, total,
    original_rate, discount_amount, hsn_code, sgst_amount, cgst_amount,
    uom_id, uom_code, conversion_to_base,
    tax_rate_snapshot, cgst_rate, sgst_rate, igst_rate, igst_amount, cess_rate, cess_amount, tax_master_id
  )
  SELECT
    v_order_id,
    NULLIF(it->>'resolved_product_id','')::uuid,
    NULLIF(it->>'resolved_variant_id','')::uuid,
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
    NULLIF(it->>'conversion_to_base','')::numeric,
    NULLIF(it->>'tax_rate_snapshot','')::numeric,
    NULLIF(it->>'cgst_rate','')::numeric,
    NULLIF(it->>'sgst_rate','')::numeric,
    NULLIF(it->>'igst_rate','')::numeric,
    NULLIF(it->>'igst_amount','')::numeric,
    NULLIF(it->>'cess_rate','')::numeric,
    NULLIF(it->>'cess_amount','')::numeric,
    NULLIF(it->>'tax_master_id','')::uuid
  FROM jsonb_array_elements(v_resolved_items) AS it;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted <> v_items_count THEN
    RAISE EXCEPTION 'partial item insert: expected %, inserted %', v_items_count, v_inserted;
  END IF;

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

  -- Notify placer's nearest manager for OOB orders
  IF v_oob THEN
    IF COALESCE(v_cfg.oob_notify_manager, false) THEN
      SELECT manager_id INTO v_mgr
        FROM public.get_reporting_chain(v_caller)
       ORDER BY level
       LIMIT 1;
      IF v_mgr IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, message, related_id, related_table, retailer_id)
        VALUES (
          v_mgr,
          'out_of_beat_order',
          'Out-of-beat order placed',
          format('%s placed an out-of-beat order for retailer %s',
                 COALESCE((SELECT full_name FROM public.profiles WHERE id = v_caller), 'A user'),
                 COALESCE(v_order->>'retailer_name', v_retailer_id::text)),
          v_order_id,
          'orders',
          v_retailer_id
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status','ok',
    'order_id', v_order_id,
    'pending_before', v_before_pend,
    'pending_after', v_after_pend
  );
END;
$function$;