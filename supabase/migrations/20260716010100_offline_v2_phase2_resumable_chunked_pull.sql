-- Offline Architecture v2 · Phase 2 — resumable, keyset-paginated per-table delta pull.
-- Consumed by src/lib/syncPull.ts (runDeltaPull → resumablePull → sync_pull_chunk).
-- SECURITY INVOKER → RLS scopes per user. Table name whitelisted (no injection).
-- Applied to staging DB aoxdosjkwqyuvccuwhzc 2026-07-16.

CREATE OR REPLACE FUNCTION public.sync_pull_chunk(
  p_table text,
  p_since timestamptz DEFAULT '1970-01-01 00:00:00+00'::timestamptz,
  p_after_updated_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_limit int DEFAULT 500
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE
  allow text[] := ARRAY['products','product_variants','product_uom_mapping','uom_master',
                        'product_schemes','product_categories','tax_masters','tax_components',
                        'retailers','beats'];
  v_rows jsonb;
  v_sql  text;
  v_lim  int := LEAST(GREATEST(COALESCE(p_limit,500),1),2000);
BEGIN
  IF NOT (p_table = ANY(allow)) THEN
    RAISE EXCEPTION 'sync_pull_chunk: table % not allowed', p_table;
  END IF;
  v_sql := format($f$
    SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.updated_at, t.id), '[]'::jsonb)
    FROM (
      SELECT * FROM public.%I
      WHERE updated_at > $1
        AND ( $2 IS NULL OR updated_at > $2 OR (updated_at = $2 AND id > $3) )
      ORDER BY updated_at, id
      LIMIT %s
    ) t
  $f$, p_table, v_lim);
  EXECUTE v_sql INTO v_rows USING p_since, p_after_updated_at, p_after_id;
  RETURN jsonb_build_object(
    'table', p_table,
    'rows', v_rows,
    'count', jsonb_array_length(v_rows),
    'has_more', jsonb_array_length(v_rows) >= v_lim,
    'server_time', now()
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.sync_pull_chunk(text, timestamptz, timestamptz, uuid, int) TO authenticated;
