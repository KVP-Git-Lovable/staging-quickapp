
-- Schema additions
ALTER TABLE public.packing_list_item_batches
  ADD COLUMN IF NOT EXISTS delivered_qty numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS short_delivery_reason text;

ALTER TABLE public.packing_lists
  ADD COLUMN IF NOT EXISTS transporter_name    text,
  ADD COLUMN IF NOT EXISTS lr_gr_number        text,
  ADD COLUMN IF NOT EXISTS vehicle_type        text,
  ADD COLUMN IF NOT EXISTS dispatch_mode       text,
  ADD COLUMN IF NOT EXISTS total_packages      integer,
  ADD COLUMN IF NOT EXISTS total_weight_kg     numeric,
  ADD COLUMN IF NOT EXISTS dispatch_date       date,
  ADD COLUMN IF NOT EXISTS dispatch_destination text,
  ADD COLUMN IF NOT EXISTS dispatch_notes      text;

-- Storage policies for pod-uploads (bucket created via storage_create_bucket tool)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='pod-uploads read auth') THEN
    EXECUTE $p$CREATE POLICY "pod-uploads read auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'pod-uploads')$p$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='pod-uploads write auth') THEN
    EXECUTE $p$CREATE POLICY "pod-uploads write auth" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'pod-uploads')$p$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='pod-uploads update auth') THEN
    EXECUTE $p$CREATE POLICY "pod-uploads update auth" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'pod-uploads')$p$;
  END IF;
END $$;

-- ============================================================
-- RPC: dispatch_primary_packing_list_atomic
-- ============================================================
CREATE OR REPLACE FUNCTION public.dispatch_primary_packing_list_atomic(
  p_packing_list_id uuid,
  p_dispatch jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pl record;
  v_not_finalized int;
  v_inv_count int;
  v_sub_result jsonb;
  v_dispatched_at timestamptz;
  v_dispatch_ref text;
BEGIN
  SELECT * INTO v_pl FROM public.packing_lists WHERE id = p_packing_list_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Packing list not found');
  END IF;

  IF v_pl.status IN ('dispatched','delivered','completed') THEN
    RETURN jsonb_build_object('success', true, 'packing_list_id', v_pl.id,
      'status', v_pl.status, 'dispatched_at', v_pl.dispatched_at, 'already_dispatched', true);
  END IF;

  IF COALESCE(v_pl.order_type,'secondary') <> 'primary' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a primary packing list');
  END IF;

  IF v_pl.status NOT IN ('ready','packed') THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Packing list not ready for dispatch (status=' || v_pl.status || ')');
  END IF;

  SELECT COUNT(*) INTO v_inv_count
  FROM public.primary_invoices pi
  JOIN public.packing_list_orders plo ON plo.order_id = pi.order_id
  WHERE plo.packing_list_id = p_packing_list_id;

  IF v_inv_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error',
      'No primary invoices found. Generate and finalize invoices first.');
  END IF;

  SELECT COUNT(*) INTO v_not_finalized
  FROM public.primary_invoices pi
  JOIN public.packing_list_orders plo ON plo.order_id = pi.order_id
  WHERE plo.packing_list_id = p_packing_list_id
    AND pi.status <> 'finalized';

  IF v_not_finalized > 0 THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Cannot dispatch: ' || v_not_finalized || ' invoice(s) not finalized');
  END IF;

  IF v_pl.status = 'packed' THEN
    UPDATE public.packing_lists SET status = 'ready', updated_at = now() WHERE id = p_packing_list_id;
  END IF;

  v_sub_result := public.dispatch_packing_list_atomic(p_packing_list_id);
  IF COALESCE((v_sub_result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'dispatch_packing_list_atomic failed: %', v_sub_result->>'error';
  END IF;

  v_dispatched_at := now();
  v_dispatch_ref  := COALESCE(NULLIF(p_dispatch->>'dispatch_reference',''), v_pl.packing_list_number);

  UPDATE public.packing_lists SET
    dispatch_vehicle     = COALESCE(NULLIF(p_dispatch->>'dispatch_vehicle',''), dispatch_vehicle),
    dispatch_driver      = COALESCE(NULLIF(p_dispatch->>'dispatch_driver',''),  dispatch_driver),
    transporter_name     = COALESCE(NULLIF(p_dispatch->>'transporter_name',''),  transporter_name),
    lr_gr_number         = COALESCE(NULLIF(p_dispatch->>'lr_gr_number',''),      lr_gr_number),
    vehicle_type         = COALESCE(NULLIF(p_dispatch->>'vehicle_type',''),      vehicle_type),
    dispatch_mode        = COALESCE(NULLIF(p_dispatch->>'dispatch_mode',''),     dispatch_mode),
    total_packages       = COALESCE(NULLIF(p_dispatch->>'total_packages','')::int, total_packages),
    total_weight_kg      = COALESCE(NULLIF(p_dispatch->>'total_weight_kg','')::numeric, total_weight_kg),
    dispatch_date        = COALESCE(NULLIF(p_dispatch->>'dispatch_date','')::date, dispatch_date, v_dispatched_at::date),
    dispatch_destination = COALESCE(NULLIF(p_dispatch->>'dispatch_destination',''), dispatch_destination),
    dispatch_notes       = COALESCE(NULLIF(p_dispatch->>'dispatch_notes',''),       dispatch_notes),
    dispatched_at        = v_dispatched_at,
    updated_at           = now()
  WHERE id = p_packing_list_id;

  -- AR (order-level only). NOTE: distributor-ledger posting for primary dispatch
  -- is a follow-up — no existing function posts these events, so we don't invent rows.
  UPDATE public.primary_orders SET
    dispatched_at      = v_dispatched_at,
    dispatch_reference = v_dispatch_ref,
    transporter_name   = COALESCE(NULLIF(p_dispatch->>'transporter_name',''), transporter_name),
    vehicle_number     = COALESCE(NULLIF(p_dispatch->>'dispatch_vehicle',''), vehicle_number),
    payment_status     = CASE
                           WHEN COALESCE(payment_status,'pending') IN ('paid','partial') THEN payment_status
                           ELSE 'unpaid'
                         END,
    outstanding_at_order = COALESCE(outstanding_at_order, total_amount),
    updated_at = now()
  WHERE packing_list_id = p_packing_list_id;

  RETURN jsonb_build_object(
    'success', true,
    'packing_list_id', p_packing_list_id,
    'status', 'dispatched',
    'dispatched_at', v_dispatched_at,
    'total_dispatched', v_sub_result->'total_dispatched',
    'total_backorder_added', v_sub_result->'total_backorder_added'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================
-- RPC: confirm_primary_delivery_atomic
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_primary_delivery_atomic(
  p_packing_list_id   uuid,
  p_received_by       text,
  p_delivered_at      timestamptz,
  p_pod_photo_url     text,
  p_pod_signature_url text,
  p_pod_notes         text,
  p_lines             jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pl record;
  v_line jsonb;
  v_batch_id uuid;
  v_delivered numeric;
  v_reason text;
  v_delivered_at timestamptz := COALESCE(p_delivered_at, now());
BEGIN
  SELECT * INTO v_pl FROM public.packing_lists WHERE id = p_packing_list_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Packing list not found');
  END IF;

  IF v_pl.status IN ('delivered','completed') THEN
    RETURN jsonb_build_object('success', true, 'packing_list_id', v_pl.id,
      'status', v_pl.status, 'delivered_at', v_pl.delivered_at, 'already_delivered', true);
  END IF;

  IF v_pl.status <> 'dispatched' THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Packing list not in dispatched state (status=' || v_pl.status || ')');
  END IF;

  -- Default delivered_qty = packed/picked when 0
  UPDATE public.packing_list_item_batches plib
  SET delivered_qty = CASE
                        WHEN COALESCE(plib.packed_qty,0) > 0 THEN plib.packed_qty
                        WHEN COALESCE(plib.picked_qty,0) > 0 THEN plib.picked_qty
                        ELSE plib.allocated_qty
                      END
  FROM public.packing_list_items pli
  WHERE pli.id = plib.packing_list_item_id
    AND pli.packing_list_id = p_packing_list_id
    AND COALESCE(plib.delivered_qty,0) = 0;

  IF p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
      v_batch_id := NULLIF(v_line->>'batch_id','')::uuid;
      v_delivered := NULLIF(v_line->>'delivered_qty','')::numeric;
      v_reason    := NULLIF(v_line->>'short_delivery_reason','');
      IF v_batch_id IS NOT NULL THEN
        UPDATE public.packing_list_item_batches plib
        SET delivered_qty = COALESCE(v_delivered, delivered_qty),
            short_delivery_reason = COALESCE(v_reason, short_delivery_reason)
        FROM public.packing_list_items pli
        WHERE pli.id = plib.packing_list_item_id
          AND pli.packing_list_id = p_packing_list_id
          AND plib.id = v_batch_id;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.packing_lists SET
    pod_photo_url     = COALESCE(NULLIF(p_pod_photo_url,''),     pod_photo_url),
    pod_signature_url = COALESCE(NULLIF(p_pod_signature_url,''), pod_signature_url),
    pod_notes         = COALESCE(NULLIF(p_pod_notes,''),         pod_notes),
    pod_confirmed_by  = COALESCE(auth.uid(), pod_confirmed_by),
    pod_confirmed_at  = now(),
    delivered_at      = v_delivered_at,
    status            = 'delivered',
    notes             = CASE
                          WHEN NULLIF(p_received_by,'') IS NULL THEN notes
                          ELSE COALESCE(notes,'') || E'\nReceived by: ' || p_received_by
                        END,
    updated_at        = now()
  WHERE id = p_packing_list_id;

  UPDATE public.primary_orders SET
    status                = 'delivered',
    actual_delivery_date  = COALESCE(actual_delivery_date, v_delivered_at::date),
    updated_at            = now()
  WHERE packing_list_id = p_packing_list_id;

  RETURN jsonb_build_object(
    'success', true,
    'packing_list_id', p_packing_list_id,
    'status', 'delivered',
    'delivered_at', v_delivered_at
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispatch_primary_packing_list_atomic(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_primary_delivery_atomic(uuid, text, timestamptz, text, text, text, jsonb) TO authenticated;
