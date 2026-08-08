-- Reads are SECURITY INVOKER so the RLS policies above do the gating.
GRANT SELECT ON public.db_health_snapshots TO authenticated;
GRANT SELECT ON public.db_health_objects   TO authenticated;

-- Capture stays SECURITY DEFINER (needs catalogs) but refuses an unprivileged
-- caller. auth.uid() IS NULL means pg_cron/service_role, which is allowed.
CREATE OR REPLACE FUNCTION public.capture_db_health_snapshot(p_source text DEFAULT 'manual')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.user_has_permission(auth.uid(), 'admin_db_health', 'can_read') THEN
    RAISE EXCEPTION 'Your profile does not have permission to capture a DB health snapshot';
  END IF;
  SELECT public._capture_db_health_snapshot_impl(p_source) INTO v_id;
  RETURN v_id;
END $fn$;


-- Latest snapshot with deltas against the one before it.
CREATE OR REPLACE FUNCTION public.get_db_health_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $fn$
  WITH latest AS (SELECT * FROM db_health_snapshots ORDER BY captured_at DESC LIMIT 1),
       prev AS (SELECT * FROM db_health_snapshots
                WHERE captured_at < (SELECT captured_at FROM latest)
                ORDER BY captured_at DESC LIMIT 1)
  SELECT jsonb_build_object(
    'snapshot_id',        l.id,
    'captured_at',        l.captured_at,
    'source',             l.source,
    'previous_at',        p.captured_at,
    'db_size_bytes',      l.db_size_bytes,
    'total_row_estimate', l.total_row_estimate,
    'metrics', jsonb_build_array(
      jsonb_build_object('key','tables',          'label','Tables',            'value',l.table_count,              'delta',l.table_count              - p.table_count),
      jsonb_build_object('key','columns',         'label','Columns',           'value',l.column_count,             'delta',l.column_count             - p.column_count),
      jsonb_build_object('key','views',           'label','Views',             'value',l.view_count,               'delta',l.view_count               - p.view_count),
      jsonb_build_object('key','policies',        'label','RLS Policies',      'value',l.rls_policy_count,         'delta',l.rls_policy_count         - p.rls_policy_count),
      jsonb_build_object('key','rls_enabled',     'label','RLS-enabled Tables','value',l.rls_enabled_table_count,  'delta',l.rls_enabled_table_count  - p.rls_enabled_table_count),
      jsonb_build_object('key','rls_disabled',    'label','RLS-DISABLED Tables','value',l.rls_disabled_table_count,'delta',l.rls_disabled_table_count - p.rls_disabled_table_count),
      jsonb_build_object('key','functions',       'label','Functions',         'value',l.function_count,           'delta',l.function_count           - p.function_count),
      jsonb_build_object('key','triggers',        'label','Triggers',          'value',l.trigger_count,            'delta',l.trigger_count            - p.trigger_count),
      jsonb_build_object('key','indexes',         'label','Indexes',           'value',l.index_count,              'delta',l.index_count              - p.index_count),
      jsonb_build_object('key','foreign_keys',    'label','Foreign Keys',      'value',l.foreign_key_count,        'delta',l.foreign_key_count        - p.foreign_key_count),
      jsonb_build_object('key','enums',           'label','Enum Types',        'value',l.enum_count,               'delta',l.enum_count               - p.enum_count),
      jsonb_build_object('key','sequences',       'label','Sequences',         'value',l.sequence_count,           'delta',l.sequence_count           - p.sequence_count),
      jsonb_build_object('key','extensions',      'label','Extensions',        'value',l.extension_count,          'delta',l.extension_count          - p.extension_count),
      jsonb_build_object('key','cron_jobs',       'label','Cron Jobs',         'value',l.cron_job_count,           'delta',l.cron_job_count           - p.cron_job_count),
      jsonb_build_object('key','cron_jobs_active','label','Cron Jobs Active',  'value',l.cron_job_active_count,    'delta',l.cron_job_active_count    - p.cron_job_active_count)
    ))
  FROM latest l LEFT JOIN prev p ON true;
$fn$;


-- Count trend for charting.
CREATE OR REPLACE FUNCTION public.get_db_health_trend(p_days integer DEFAULT 30)
RETURNS TABLE(captured_at timestamptz, source text, table_count int, column_count int,
              rls_policy_count int, rls_disabled_table_count int, function_count int,
              trigger_count int, index_count int, cron_job_count int, db_size_bytes bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $fn$
  SELECT s.captured_at, s.source, s.table_count, s.column_count,
         s.rls_policy_count, s.rls_disabled_table_count, s.function_count,
         s.trigger_count, s.index_count, s.cron_job_count, s.db_size_bytes
  FROM db_health_snapshots s
  WHERE s.captured_at >= now() - make_interval(days => GREATEST(p_days,1))
  ORDER BY s.captured_at;
$fn$;


-- THE drop-detector: what changed between the newest snapshot and the newest
-- one at least p_days old. 'removed' is the row that proves a drop.
CREATE OR REPLACE FUNCTION public.get_db_health_drift(p_days integer DEFAULT 7)
RETURNS TABLE(change_type text, object_type text, parent_name text,
              object_name text, detail_before jsonb, detail_after jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $fn$
  WITH cur AS (SELECT id, captured_at FROM db_health_snapshots ORDER BY captured_at DESC LIMIT 1),
       base AS (SELECT id FROM db_health_snapshots
                WHERE captured_at <= (SELECT captured_at FROM cur) - make_interval(days => GREATEST(p_days,0))
                ORDER BY captured_at DESC LIMIT 1),
       b AS (SELECT * FROM db_health_objects WHERE snapshot_id = (SELECT id FROM base)),
       c AS (SELECT * FROM db_health_objects WHERE snapshot_id = (SELECT id FROM cur))
  SELECT 'removed', b.object_type, b.parent_name, b.object_name, b.detail, NULL::jsonb
  FROM b LEFT JOIN c
    ON  c.object_type = b.object_type
    AND c.object_name = b.object_name
    AND c.parent_name IS NOT DISTINCT FROM b.parent_name
  WHERE c.id IS NULL
  UNION ALL
  SELECT 'added', c.object_type, c.parent_name, c.object_name, NULL::jsonb, c.detail
  FROM c LEFT JOIN b
    ON  b.object_type = c.object_type
    AND b.object_name = c.object_name
    AND b.parent_name IS NOT DISTINCT FROM c.parent_name
  WHERE b.id IS NULL
  UNION ALL
  SELECT 'modified', c.object_type, c.parent_name, c.object_name, b.detail, c.detail
  FROM c JOIN b
    ON  b.object_type = c.object_type
    AND b.object_name = c.object_name
    AND b.parent_name IS NOT DISTINCT FROM c.parent_name
  WHERE c.object_type IN ('column','policy','trigger','cron_job','function')
    AND b.detail IS DISTINCT FROM c.detail
  ORDER BY 1, 2, 3, 4;
$fn$;


-- "Was this column there last week?" — presence timeline for one object.
CREATE OR REPLACE FUNCTION public.get_db_health_object_history(
  p_object_type text, p_object_name text, p_parent_name text DEFAULT NULL,
  p_days integer DEFAULT 90)
RETURNS TABLE(captured_at timestamptz, present boolean, detail jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $fn$
  SELECT s.captured_at,
         (o.id IS NOT NULL) AS present,
         o.detail
  FROM db_health_snapshots s
  LEFT JOIN db_health_objects o
    ON  o.snapshot_id = s.id
    AND o.object_type = p_object_type
    AND o.object_name = p_object_name
    AND (p_parent_name IS NULL OR o.parent_name = p_parent_name)
  WHERE s.captured_at >= now() - make_interval(days => GREATEST(p_days,1))
  ORDER BY s.captured_at;
$fn$;


CREATE OR REPLACE FUNCTION public.prune_db_health_snapshots(p_keep_days integer DEFAULT 120)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_deleted integer;
BEGIN
  WITH gone AS (
    DELETE FROM db_health_snapshots
    WHERE captured_at < now() - make_interval(days => GREATEST(p_keep_days,7))
    RETURNING 1)
  SELECT count(*) INTO v_deleted FROM gone;
  RETURN v_deleted;
END $fn$;

GRANT EXECUTE ON FUNCTION public.get_db_health_overview()                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_health_trend(integer)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_health_drift(integer)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_health_object_history(text,text,text,integer)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.capture_db_health_snapshot(text)                      TO authenticated;
