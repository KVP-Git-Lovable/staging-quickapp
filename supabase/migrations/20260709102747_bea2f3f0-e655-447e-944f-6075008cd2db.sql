
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
        INSERT INTO public.securityaudit_events(event_type, schema_name, table_name, object_identity, ddl_command, session_user_name)
          VALUES ('RLS_DRIFT_REENABLED', 'public', r.table_name, format('public.%I', r.table_name),
                  'auto re-enabled RLS (was disabled)', session_user);
        v_drift := v_drift + 1;
      END IF;

      SELECT array_agg(pn) INTO v_missing
      FROM unnest(r.policy_names) pn
      WHERE pn NOT IN (
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = r.table_name
      );

      IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
        INSERT INTO public.securityaudit_events(event_type, schema_name, table_name, policy_name, object_identity, ddl_command, session_user_name)
          VALUES ('RLS_POLICY_MISSING', 'public', r.table_name, array_to_string(v_missing, ','),
                  format('public.%I', r.table_name), 'baseline policy missing', session_user);
        v_drift := v_drift + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN v_drift;
END
$$;
