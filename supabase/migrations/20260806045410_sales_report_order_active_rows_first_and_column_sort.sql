-- Both grouped branches ordered by the grouping columns alone, so the
-- full-roster rows (no beat, no orders) interleaved alphabetically with the
-- people who actually sold -- Abhishek KP with 0 orders sorted above Dharmesh
-- with 5. Two changes, applied by surgical text patch so nothing else moves:
--
--   1. Default order is now "sold first, then the rest", each block still
--      ordered by its grouping dimensions.
--   2. p_filters.sort_key / p_filters.sort_dir override that with an explicit
--      column sort. Carried in the existing jsonb filters rather than a new
--      parameter, so the RPC signature -- and therefore PostgREST's overload
--      resolution -- is untouched. sort_key is whitelisted against the report's
--      own dimension aliases plus the known measures; anything else is ignored.
DO $migration$
DECLARE
  v_def   text;
  v_fixed text;

  a_decl    CONSTANT text := 'v_i int; v_by_day boolean; v_by_beat boolean; v_universe boolean;';
  a_calc    CONSTANT text := 'AND (v_dims <@ ARRAY[''team_member'',''order_date'',''date'',''beat'']::text[]);';
  a_uorder  CONSTANT text := 'GROUP BY %6$s ORDER BY %6$s LIMIT 2000 ) t';
  a_uargs   CONSTANT text := E'\n      v_dim_sql, v_group_sql);';
  a_gargs   CONSTANT text := '$SQL$, v_dim_sql, v_group_sql, v_group_sql);';

  n_decl   CONSTANT text := a_decl || E'\n  v_sort_key text; v_sort_dir text; v_ordinals text;'
                                   || ' v_order_sql text; v_order_plain text; v_sortable text[];';
  n_uorder CONSTANT text := 'GROUP BY %6$s ORDER BY %7$s LIMIT 2000 ) t';
  n_uargs  CONSTANT text := E'\n      v_dim_sql, v_group_sql, v_order_sql);';
  n_gargs  CONSTANT text := '$SQL$, v_dim_sql, v_group_sql, v_order_plain);';

  n_calc CONSTANT text := a_calc || E'\n'
    || E'\n  -- Ordering. Default puts rows that actually sold ahead of the rest, so the'
    || E'\n  -- full-roster zero rows collect at the end instead of interleaving by name.'
    || E'\n  -- An explicit sort_key/sort_dir in the filters replaces that entirely.'
    || E'\n  v_ordinals := (SELECT string_agg(i::text, '','') FROM generate_series(1, array_length(v_dims,1)) i);'
    || E'\n  v_sort_key := NULLIF(p_filters->>''sort_key'','''');'
    || E'\n  v_sort_dir := CASE WHEN lower(COALESCE(p_filters->>''sort_dir'',''desc'')) = ''asc'' THEN ''ASC'' ELSE ''DESC'' END;'
    || E'\n  v_sortable := v_aliases || ARRAY[''quantity'',''rate'',''revenue'',''orders'',''new_retailers'',''productive'',''unproductive'',''pending'']::text[];'
    || E'\n  IF v_sort_key IS NOT NULL AND v_sort_key = ANY(v_sortable) THEN'
    || E'\n    v_order_sql   := format(''%I %s NULLS LAST, %s'', v_sort_key, v_sort_dir, v_ordinals);'
    || E'\n    v_order_plain := v_order_sql;'
    || E'\n  ELSE'
    || E'\n    v_order_sql   := ''CASE WHEN COALESCE(SUM(ord.orders),0) > 0 THEN 0 ELSE 1 END, '' || v_ordinals;'
    || E'\n    v_order_plain := v_ordinals;'
    || E'\n  END IF;';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_sales_report';

  IF v_def IS NULL THEN RAISE EXCEPTION 'get_sales_report not found'; END IF;
  IF position(a_decl   IN v_def) = 0 THEN RAISE EXCEPTION 'anchor a_decl missing';   END IF;
  IF position(a_calc   IN v_def) = 0 THEN RAISE EXCEPTION 'anchor a_calc missing';   END IF;
  IF position(a_uorder IN v_def) = 0 THEN RAISE EXCEPTION 'anchor a_uorder missing'; END IF;
  IF position(a_uargs  IN v_def) = 0 THEN RAISE EXCEPTION 'anchor a_uargs missing';  END IF;
  IF position(a_gargs  IN v_def) = 0 THEN RAISE EXCEPTION 'anchor a_gargs missing';  END IF;

  v_fixed := replace(v_def,   a_decl,   n_decl);
  v_fixed := replace(v_fixed, a_calc,   n_calc);
  v_fixed := replace(v_fixed, a_uorder, n_uorder);
  v_fixed := replace(v_fixed, a_uargs,  n_uargs);
  v_fixed := replace(v_fixed, a_gargs,  n_gargs);

  EXECUTE v_fixed;
END
$migration$;

NOTIFY pgrst, 'reload schema';