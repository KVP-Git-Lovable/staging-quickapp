-- Without a baseline snapshot old enough to compare against, the anti-join
-- reported the entire current inventory as 'added'. Return nothing instead:
-- "no baseline yet" must not look like "everything was just created".
CREATE OR REPLACE FUNCTION public.get_db_health_drift(p_days integer DEFAULT 7)
RETURNS TABLE(change_type text, object_type text, parent_name text,
              object_name text, detail_before jsonb, detail_after jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $fn$
  WITH cur AS (SELECT id, captured_at FROM db_health_snapshots ORDER BY captured_at DESC LIMIT 1),
       base AS (SELECT id FROM db_health_snapshots
                WHERE captured_at <= (SELECT captured_at FROM cur) - make_interval(days => GREATEST(p_days,0))
                  AND id <> (SELECT id FROM cur)
                ORDER BY captured_at DESC LIMIT 1),
       ok AS (SELECT EXISTS(SELECT 1 FROM base) AS has_base),
       b AS (SELECT o.* FROM db_health_objects o, ok
             WHERE ok.has_base AND o.snapshot_id = (SELECT id FROM base)),
       c AS (SELECT o.* FROM db_health_objects o, ok
             WHERE ok.has_base AND o.snapshot_id = (SELECT id FROM cur))
  SELECT 'removed', b.object_type, b.parent_name, b.object_name, b.detail, NULL::jsonb
  FROM b LEFT JOIN c
    ON c.object_type=b.object_type AND c.object_name=b.object_name
   AND c.parent_name IS NOT DISTINCT FROM b.parent_name
  WHERE c.id IS NULL
  UNION ALL
  SELECT 'added', c.object_type, c.parent_name, c.object_name, NULL::jsonb, c.detail
  FROM c LEFT JOIN b
    ON b.object_type=c.object_type AND b.object_name=c.object_name
   AND b.parent_name IS NOT DISTINCT FROM c.parent_name
  WHERE b.id IS NULL
  UNION ALL
  SELECT 'modified', c.object_type, c.parent_name, c.object_name, b.detail, c.detail
  FROM c JOIN b
    ON b.object_type=c.object_type AND b.object_name=c.object_name
   AND b.parent_name IS NOT DISTINCT FROM c.parent_name
  WHERE c.object_type IN ('column','policy','trigger','cron_job','function')
    AND b.detail IS DISTINCT FROM c.detail
  ORDER BY 1,2,3,4;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_db_health_drift(integer) TO authenticated;
