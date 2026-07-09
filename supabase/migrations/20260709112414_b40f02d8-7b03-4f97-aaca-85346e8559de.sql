
-- 1. Admin broadcast helper
CREATE OR REPLACE FUNCTION public.notify_admins(p_type text, p_title text, p_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message)
  SELECT DISTINCT admin_id, p_type, p_title, p_message
  FROM (
    SELECT user_id AS admin_id FROM public.user_roles WHERE role='admin'
    UNION
    SELECT p.id FROM public.profiles p
      JOIN public.security_profiles sp ON sp.id = p.role_id
      WHERE sp.is_system = true
  ) admins
  WHERE admin_id IS NOT NULL;
END $$;

-- 2. Security audit notify trigger (additive)
CREATE OR REPLACE FUNCTION public.securityaudit_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.event_type IN ('DROP POLICY','DROP TABLE','RLS_DRIFT_REENABLED','RLS_POLICY_MISSING') THEN
    PERFORM public.notify_admins(
      'security_alert',
      'Security change: '||NEW.event_type,
      COALESCE(NEW.event_type,'')||' on '||COALESCE(NEW.table_name,'?')
        ||COALESCE(' ('||NEW.policy_name||')','')||' by '||COALESCE(NEW.session_user_name,'?'));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS securityaudit_notify_trg ON public.securityaudit_events;
CREATE TRIGGER securityaudit_notify_trg
  AFTER INSERT ON public.securityaudit_events
  FOR EACH ROW EXECUTE FUNCTION public.securityaudit_notify();

-- 3. Extend run_data_health_checks to notify admins when anomalies found
CREATE OR REPLACE FUNCTION public.run_data_health_checks()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_count integer;
  v_total integer := 0;
BEGIN
  -- Orders without items (older than 15 min, still confirmed/pending)
  SELECT COUNT(*) INTO v_count
  FROM public.orders o
  WHERE o.created_at < now() - interval '15 minutes'
    AND o.status IN ('confirmed','pending','draft')
    AND NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id);
  INSERT INTO public.data_health_log(check_name, anomaly_count, details)
    VALUES ('orders_without_items', v_count, jsonb_build_object('threshold_minutes', 15));
  v_total := v_total + v_count;

  -- Visits without retailer
  SELECT COUNT(*) INTO v_count
  FROM public.visits v
  WHERE v.retailer_id IS NULL;
  INSERT INTO public.data_health_log(check_name, anomaly_count, details)
    VALUES ('visits_without_retailer', v_count, NULL);
  v_total := v_total + v_count;

  -- Order items pointing to non-existent variants
  SELECT COUNT(*) INTO v_count
  FROM public.order_items oi
  WHERE oi.variant_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.id = oi.variant_id);
  INSERT INTO public.data_health_log(check_name, anomaly_count, details)
    VALUES ('order_items_orphan_variant', v_count, NULL);
  v_total := v_total + v_count;

  -- Order items pointing to non-existent products
  SELECT COUNT(*) INTO v_count
  FROM public.order_items oi
  WHERE oi.product_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = oi.product_id);
  INSERT INTO public.data_health_log(check_name, anomaly_count, details)
    VALUES ('order_items_orphan_product', v_count, NULL);
  v_total := v_total + v_count;

  -- Retailers with invalid beat reference
  SELECT COUNT(*) INTO v_count
  FROM public.retailers r
  WHERE r.beat_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.beats b WHERE b.beat_id = r.beat_id);
  INSERT INTO public.data_health_log(check_name, anomaly_count, details)
    VALUES ('retailers_orphan_beat', v_count, NULL);
  v_total := v_total + v_count;

  IF v_total > 0 THEN
    PERFORM public.notify_admins(
      'data_health_alert',
      'Data integrity anomalies found',
      v_total||' data-integrity anomalies detected in the daily health check. Open Sync Health to review.');
  END IF;

  RETURN v_total;
END $$;
