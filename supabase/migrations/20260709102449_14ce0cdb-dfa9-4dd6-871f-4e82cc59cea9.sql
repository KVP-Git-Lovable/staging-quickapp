
-- 1. Enable RLS on uom_master with policies mirroring products
ALTER TABLE public.uom_master ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.uom_master TO authenticated;
GRANT ALL ON public.uom_master TO service_role;

CREATE POLICY "uom_master_select" ON public.uom_master
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage uom_master" ON public.uom_master
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. Baseline snapshot table
CREATE TABLE IF NOT EXISTS public.rls_baseline (
  table_name text PRIMARY KEY,
  policy_names text[] NOT NULL DEFAULT '{}',
  snapshot_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.rls_baseline TO authenticated;
GRANT ALL ON public.rls_baseline TO service_role;

ALTER TABLE public.rls_baseline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_baseline_admin_manage" ON public.rls_baseline
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.rls_baseline (table_name, policy_names)
SELECT c.relname, COALESCE(array_agg(p.policyname) FILTER (WHERE p.policyname IS NOT NULL), '{}')
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity
  AND c.relname NOT LIKE 'qa_%'
  AND c.relname NOT LIKE 'pg_%'
GROUP BY c.relname
ON CONFLICT (table_name) DO UPDATE
  SET policy_names = excluded.policy_names, snapshot_at = now();

-- 3. Drift-check function
CREATE OR REPLACE FUNCTION public.check_rls_drift()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_drift int := 0;
  v_missing text[];
BEGIN
  FOR r IN SELECT table_name, policy_names FROM public.rls_baseline LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = r.table_name AND c.relkind = 'r'
    ) THEN
      IF NOT (
        SELECT relrowsecurity FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = r.table_name
      ) THEN
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.table_name);
        INSERT INTO public.securityaudit_events(event_type, schema_name, table_name, ddl_command, session_user_name)
          VALUES ('RLS_DRIFT_REENABLED', 'public', r.table_name, 'auto re-enabled RLS (was disabled)', session_user);
        v_drift := v_drift + 1;
      END IF;

      SELECT array_agg(pn) INTO v_missing
      FROM unnest(r.policy_names) pn
      WHERE pn NOT IN (
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = r.table_name
      );

      IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
        INSERT INTO public.securityaudit_events(event_type, schema_name, table_name, policy_name, ddl_command, session_user_name)
          VALUES ('RLS_POLICY_MISSING', 'public', r.table_name, array_to_string(v_missing, ','), 'baseline policy missing', session_user);
        v_drift := v_drift + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN v_drift;
END
$$;

-- Schedule via pg_cron every 15 minutes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('rls-drift-check')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rls-drift-check');
    PERFORM cron.schedule('rls-drift-check', '*/15 * * * *', $cron$SELECT public.check_rls_drift();$cron$);
  END IF;
END $$;
