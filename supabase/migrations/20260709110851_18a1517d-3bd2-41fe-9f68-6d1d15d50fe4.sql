-- Data-integrity health-check log
CREATE TABLE IF NOT EXISTS public.data_health_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name text NOT NULL,
  anomaly_count int NOT NULL,
  sample_ids text[],
  checked_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.data_health_log TO authenticated;
GRANT ALL ON public.data_health_log TO service_role;

ALTER TABLE public.data_health_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view data health log" ON public.data_health_log;
CREATE POLICY "Admins can view data health log"
  ON public.data_health_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_data_health_log_checked_at
  ON public.data_health_log (checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_health_log_check_name_checked_at
  ON public.data_health_log (check_name, checked_at DESC);

-- Health-check runner
CREATE OR REPLACE FUNCTION public.run_data_health_checks()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int := 0;
  v_cnt int;
  v_ids text[];
BEGIN
  -- 1. Orders without line items (non-cancelled)
  SELECT count(*), (array_agg(o.id::text))[1:20] INTO v_cnt, v_ids
  FROM public.orders o
  WHERE o.status <> 'cancelled'
    AND NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id);
  INSERT INTO public.data_health_log(check_name, anomaly_count, sample_ids)
  VALUES ('orders_without_items', COALESCE(v_cnt, 0), v_ids);
  v_total := v_total + COALESCE(v_cnt, 0);

  -- 2. Non-activity visits without a retailer
  SELECT count(*), (array_agg(v.id::text))[1:20] INTO v_cnt, v_ids
  FROM public.visits v
  WHERE v.retailer_id IS NULL
    AND COALESCE(v.visit_type, '') <> 'activity';
  INSERT INTO public.data_health_log(check_name, anomaly_count, sample_ids)
  VALUES ('visits_without_retailer', COALESCE(v_cnt, 0), v_ids);
  v_total := v_total + COALESCE(v_cnt, 0);

  -- 3. Orphan variants (product missing)
  SELECT count(*), (array_agg(pv.id::text))[1:20] INTO v_cnt, v_ids
  FROM public.product_variants pv
  WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = pv.product_id);
  INSERT INTO public.data_health_log(check_name, anomaly_count, sample_ids)
  VALUES ('orphan_variants', COALESCE(v_cnt, 0), v_ids);
  v_total := v_total + COALESCE(v_cnt, 0);

  -- 4. Orders pointing at a missing retailer
  SELECT count(*), (array_agg(o.id::text))[1:20] INTO v_cnt, v_ids
  FROM public.orders o
  WHERE o.retailer_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.retailers r WHERE r.id = o.retailer_id);
  INSERT INTO public.data_health_log(check_name, anomaly_count, sample_ids)
  VALUES ('orders_dangling_retailer', COALESCE(v_cnt, 0), v_ids);
  v_total := v_total + COALESCE(v_cnt, 0);

  -- 5. Payment collections pointing at a missing retailer
  SELECT count(*), (array_agg(c.id::text))[1:20] INTO v_cnt, v_ids
  FROM public.retailer_payment_collections c
  WHERE NOT EXISTS (SELECT 1 FROM public.retailers r WHERE r.id = c.retailer_id);
  INSERT INTO public.data_health_log(check_name, anomaly_count, sample_ids)
  VALUES ('collections_dangling_retailer', COALESCE(v_cnt, 0), v_ids);
  v_total := v_total + COALESCE(v_cnt, 0);

  RETURN v_total;
END
$$;

REVOKE ALL ON FUNCTION public.run_data_health_checks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_data_health_checks() TO service_role;

-- Schedule daily at 02:00 UTC (unschedule prior job with same name if present)
DO $$
DECLARE v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'daily-data-health-checks';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
  PERFORM cron.schedule(
    'daily-data-health-checks',
    '0 2 * * *',
    $cron$SELECT public.run_data_health_checks();$cron$
  );
END $$;