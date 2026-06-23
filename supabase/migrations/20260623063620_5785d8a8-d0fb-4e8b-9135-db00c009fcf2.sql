CREATE OR REPLACE FUNCTION public.dispatch_primary_packing_list_atomic(p_packing_list_id uuid, p_dispatch jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pl record;
  v_not_finalized int;
  v_inv_count int;
  v_sub_result jsonb;
  v_dispatched_at timestamptz;
  v_dispatch_ref text;
  v_agent_id uuid;
  v_delivery_user_id uuid;
  v_du record;
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
  WHERE pi.order_id IN (
    SELECT id FROM public.primary_orders WHERE packing_list_id = p_packing_list_id
  );

  IF v_inv_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error',
      'No primary invoices found. Generate and finalize invoices first.');
  END IF;

  SELECT COUNT(*) INTO v_not_finalized
  FROM public.primary_invoices pi
  WHERE pi.order_id IN (
    SELECT id FROM public.primary_orders WHERE packing_list_id = p_packing_list_id
  )
    AND pi.status <> 'finalized';

  IF v_not_finalized > 0 THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Cannot dispatch: ' || v_not_finalized || ' invoice(s) not finalized');
  END IF;

  v_delivery_user_id := NULLIF(p_dispatch->>'assigned_delivery_user_id','')::uuid;
  IF v_delivery_user_id IS NOT NULL THEN
    SELECT * INTO v_du FROM public.distributor_users
      WHERE id = v_delivery_user_id
        AND distributor_id = v_pl.distributor_id
        AND COALESCE(can_deliver,false) = true
        AND COALESCE(is_active,false) = true;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Selected driver is not an active delivery-enabled user of this distributor');
    END IF;
    v_agent_id := v_du.auth_user_id;
  ELSE
    v_agent_id := NULLIF(p_dispatch->>'assigned_agent_id','')::uuid;
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
    driver_phone         = COALESCE(NULLIF(p_dispatch->>'driver_phone',''),     driver_phone),
    assigned_agent_id    = COALESCE(v_agent_id, assigned_agent_id),
    assigned_delivery_user_id = COALESCE(v_delivery_user_id, assigned_delivery_user_id),
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

  UPDATE public.primary_orders SET
    dispatched_at      = v_dispatched_at,
    dispatch_reference = v_dispatch_ref,
    transporter_name   = COALESCE(NULLIF(p_dispatch->>'transporter_name',''), transporter_name),
    vehicle_number     = COALESCE(NULLIF(p_dispatch->>'dispatch_vehicle',''), vehicle_number),
    payment_status     = CASE
                           WHEN COALESCE(payment_status,'pending') IN ('paid','partial') THEN payment_status
                           ELSE 'pending'
                         END,
    outstanding_at_order = COALESCE(outstanding_at_order, total_amount),
    updated_at = now()
  WHERE packing_list_id = p_packing_list_id;

  RETURN jsonb_build_object(
    'success', true,
    'packing_list_id', p_packing_list_id,
    'status', 'dispatched',
    'dispatched_at', v_dispatched_at,
    'assigned_agent_id', v_agent_id,
    'total_dispatched', v_sub_result->'total_dispatched',
    'total_backorder_added', v_sub_result->'total_backorder_added'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;