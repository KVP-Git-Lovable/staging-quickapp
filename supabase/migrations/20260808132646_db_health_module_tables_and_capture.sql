-- DB Health module: point-in-time schema inventory so a dropped table/column
-- is provable after the fact ("was this column there last week?").
-- Complements, does not replace: rls_baseline/check_rls_drift (RLS on/off),
-- data_health_log/run_data_health_checks (data quality),
-- securityaudit_events (live DDL capture).

CREATE TABLE IF NOT EXISTS public.db_health_snapshots (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at              timestamptz NOT NULL DEFAULT now(),
  captured_by              uuid,
  source                   text NOT NULL DEFAULT 'manual',
  table_count              integer,
  view_count               integer,
  column_count             integer,
  rls_policy_count         integer,
  rls_enabled_table_count  integer,
  rls_disabled_table_count integer,
  function_count           integer,
  trigger_count            integer,
  index_count              integer,
  foreign_key_count        integer,
  enum_count               integer,
  sequence_count           integer,
  extension_count          integer,
  cron_job_count           integer,
  cron_job_active_count    integer,
  edge_function_hint       integer,
  total_row_estimate       bigint,
  db_size_bytes            bigint,
  notes                    text
);

CREATE TABLE IF NOT EXISTS public.db_health_objects (
  id            bigserial PRIMARY KEY,
  snapshot_id   uuid NOT NULL REFERENCES public.db_health_snapshots(id) ON DELETE CASCADE,
  object_type   text NOT NULL,
  object_schema text NOT NULL DEFAULT 'public',
  parent_name   text,
  object_name   text NOT NULL,
  detail        jsonb
);

CREATE INDEX IF NOT EXISTS idx_dbho_snapshot      ON public.db_health_objects(snapshot_id, object_type);
CREATE INDEX IF NOT EXISTS idx_dbho_identity      ON public.db_health_objects(object_type, parent_name, object_name);
CREATE INDEX IF NOT EXISTS idx_dbhs_captured_at   ON public.db_health_snapshots(captured_at DESC);

ALTER TABLE public.db_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.db_health_objects   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS db_health_snapshots_read ON public.db_health_snapshots;
CREATE POLICY db_health_snapshots_read ON public.db_health_snapshots
  FOR SELECT TO authenticated
  USING (public.user_has_permission(auth.uid(), 'admin_db_health', 'can_read'));

DROP POLICY IF EXISTS db_health_objects_read ON public.db_health_objects;
CREATE POLICY db_health_objects_read ON public.db_health_objects
  FOR SELECT TO authenticated
  USING (public.user_has_permission(auth.uid(), 'admin_db_health', 'can_read'));


CREATE OR REPLACE FUNCTION public.capture_db_health_snapshot(p_source text DEFAULT 'manual')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.db_health_snapshots(source, captured_by)
  VALUES (COALESCE(NULLIF(p_source,''), 'manual'), auth.uid())
  RETURNING id INTO v_id;

  -- tables (with RLS flag, row estimate, size)
  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,object_name,detail)
  SELECT v_id, 'table', n.nspname, c.relname,
         jsonb_build_object('rls_enabled', c.relrowsecurity,
                            'row_estimate', GREATEST(c.reltuples,0)::bigint,
                            'size_bytes', pg_total_relation_size(c.oid))
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r';

  -- views + materialized views
  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,object_name,detail)
  SELECT v_id, 'view', n.nspname, c.relname,
         jsonb_build_object('materialized', c.relkind = 'm')
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('v','m');

  -- columns: type/nullability/default so an ALTER is detectable too, not just a DROP
  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,parent_name,object_name,detail)
  SELECT v_id, 'column', c.table_schema, c.table_name, c.column_name,
         jsonb_build_object('data_type', c.data_type,
                            'is_nullable', c.is_nullable,
                            'column_default', c.column_default,
                            'ordinal', c.ordinal_position)
  FROM information_schema.columns c
  WHERE c.table_schema = 'public';

  -- RLS policies
  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,parent_name,object_name,detail)
  SELECT v_id, 'policy', p.schemaname, p.tablename, p.policyname,
         jsonb_build_object('cmd', p.cmd, 'permissive', p.permissive,
                            'roles', p.roles, 'qual', p.qual, 'with_check', p.with_check)
  FROM pg_policies p WHERE p.schemaname = 'public';

  -- functions
  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,object_name,detail)
  SELECT v_id, 'function', n.nspname, p.oid::regprocedure::text,
         jsonb_build_object('security_definer', p.prosecdef,
                            'language', l.lanname,
                            'kind', p.prokind)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l  ON l.oid = p.prolang
  WHERE n.nspname = 'public';

  -- triggers
  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,parent_name,object_name,detail)
  SELECT v_id, 'trigger', n.nspname, c.relname, t.tgname,
         jsonb_build_object('enabled', t.tgenabled)
  FROM pg_trigger t
  JOIN pg_class c     ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal AND n.nspname = 'public';

  -- indexes
  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,parent_name,object_name,detail)
  SELECT v_id, 'index', i.schemaname, i.tablename, i.indexname,
         jsonb_build_object('definition', i.indexdef)
  FROM pg_indexes i WHERE i.schemaname = 'public';

  -- foreign keys
  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,parent_name,object_name,detail)
  SELECT v_id, 'foreign_key', n.nspname, c.relname, con.conname,
         jsonb_build_object('definition', pg_get_constraintdef(con.oid))
  FROM pg_constraint con
  JOIN pg_class c     ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE con.contype = 'f' AND n.nspname = 'public';

  -- enum types
  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,object_name,detail)
  SELECT v_id, 'enum', n.nspname, t.typname,
         jsonb_build_object('labels', (SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
                                       FROM pg_enum e WHERE e.enumtypid = t.oid))
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE t.typtype = 'e' AND n.nspname = 'public';

  -- sequences
  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,object_name,detail)
  SELECT v_id, 'sequence', n.nspname, c.relname, '{}'::jsonb
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'S';

  -- installed extensions
  INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,object_name,detail)
  SELECT v_id, 'extension', COALESCE(n.nspname,'-'), e.extname,
         jsonb_build_object('version', e.extversion)
  FROM pg_extension e LEFT JOIN pg_namespace n ON n.oid = e.extnamespace;

  -- cron jobs (isolated: never let a permission issue abort the whole snapshot)
  BEGIN
    INSERT INTO public.db_health_objects(snapshot_id,object_type,object_schema,object_name,detail)
    SELECT v_id, 'cron_job', 'cron', j.jobname,
           jsonb_build_object('schedule', j.schedule, 'active', j.active, 'command', j.command)
    FROM cron.job j;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'db_health: cron.job not readable (%)', SQLERRM;
  END;

  -- roll up the header counts from what was just captured
  UPDATE public.db_health_snapshots s SET
    table_count              = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='table'),
    view_count               = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='view'),
    column_count             = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='column'),
    rls_policy_count         = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='policy'),
    rls_enabled_table_count  = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='table' AND (o.detail->>'rls_enabled')::boolean),
    rls_disabled_table_count = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='table' AND NOT (o.detail->>'rls_enabled')::boolean),
    function_count           = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='function'),
    trigger_count            = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='trigger'),
    index_count              = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='index'),
    foreign_key_count        = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='foreign_key'),
    enum_count               = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='enum'),
    sequence_count           = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='sequence'),
    extension_count          = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='extension'),
    cron_job_count           = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='cron_job'),
    cron_job_active_count    = (SELECT count(*) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='cron_job' AND (o.detail->>'active')::boolean),
    total_row_estimate       = (SELECT COALESCE(sum((o.detail->>'row_estimate')::bigint),0) FROM db_health_objects o WHERE o.snapshot_id=v_id AND o.object_type='table'),
    db_size_bytes            = pg_database_size(current_database())
  WHERE s.id = v_id;

  RETURN v_id;
END $fn$;

COMMENT ON FUNCTION public.capture_db_health_snapshot(text) IS
  'Captures a full public-schema inventory into db_health_snapshots/db_health_objects. Read-only against the catalogs.';
