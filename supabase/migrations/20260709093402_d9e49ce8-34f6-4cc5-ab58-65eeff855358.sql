CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.quarantine_orphan_orders(p_grace_minutes int DEFAULT 10)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_ids uuid[]; r record;
BEGIN
  SELECT array_agg(o.id) INTO v_ids
  FROM public.orders o
  WHERE o.status <> 'cancelled'
    AND o.created_at < now() - make_interval(mins => p_grace_minutes)
    AND NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id);

  IF v_ids IS NULL THEN RETURN 0; END IF;

  UPDATE public.orders
    SET status='cancelled',
        cancellation_reason = COALESCE(cancellation_reason,'auto-quarantine: order has no line items'),
        cancelled_at = COALESCE(cancelled_at, now())
  WHERE id = ANY(v_ids);

  INSERT INTO public.sync_audit_log(order_id, idempotency_key, user_id, device_id, payload, status, error)
  SELECT o.id, o.idempotency_key, o.user_id, NULL, jsonb_build_object('auto_quarantine',true),
         'validation_error', 'auto-quarantine: 0 line items'
  FROM public.orders o WHERE o.id = ANY(v_ids);

  FOR r IN SELECT DISTINCT retailer_id FROM public.orders WHERE id = ANY(v_ids) AND retailer_id IS NOT NULL LOOP
    PERFORM public.recompute_retailer_pending(r.retailer_id);
  END LOOP;

  RETURN array_length(v_ids,1);
END $$;

SELECT cron.schedule('quarantine-orphan-orders','*/15 * * * *', $$SELECT public.quarantine_orphan_orders(10);$$);