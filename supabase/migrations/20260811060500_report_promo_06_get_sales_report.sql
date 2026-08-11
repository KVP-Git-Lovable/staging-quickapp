-- Report promotion 06/06 — get_sales_report, final state.
--
-- Consolidates NINE staging migrations that each rewrote this function in turn:
--   20260805090342  sales_report_multi_dimension_grouping
--   20260805092128  restore_get_sales_report_grants
--   20260805101847  sales_report_zero_activity_users_and_visit_measures
--   20260805102111  fix_sales_report_universe_aggregation
--   20260805103123  add_orders_column_to_tabular_sales_report
--   20260805103307  fix_tabular_orders_use_cte_not_window
--   20260805111047  sales_report_universe_supports_beat_dimension
--   20260805112725  sales_report_universe_full_active_roster
--   20260806045410  sales_report_order_active_rows_first_and_column_sort
-- plus the subordinate-scope fix (20260805121139) and the exclusion of
-- 'replaced' orders (20260807120844), both already folded into the body below.
--
-- Replaying those nine in sequence would push ~100KB of SQL to reach the state
-- this one statement reaches, and two of them are DO-block textual patches that
-- assert anchors absent from any database that has not already run the others.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SIGNATURE CHANGE — why the DROP is required, not optional
--
-- The previous signature took FIVE arguments. This one takes six
-- (p_row_keys text[] DEFAULT NULL). CREATE OR REPLACE cannot change a
-- function's argument list — it would create a second, OVERLOADED function and
-- leave the five-argument version in place. PostgREST then cannot resolve which
-- to call and every report fails. The old signature must be dropped first.
--
-- DROP FUNCTION discards the ACL, so the GRANTs at the foot of this file are
-- load-bearing: without them `authenticated` loses EXECUTE and the client gets
-- "Failed to send a request to the Edge Function".
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_sales_report(text, text, text, text[], jsonb);

CREATE OR REPLACE FUNCTION public.get_sales_report(p_layout text, p_rows text, p_columns text, p_values text[], p_filters jsonb, p_row_keys text[] DEFAULT NULL::text[])
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_date_from DATE := COALESCE((p_filters->>'date_from')::DATE, CURRENT_DATE - 30);
  v_date_to   DATE := COALESCE((p_filters->>'date_to')::DATE,   CURRENT_DATE);
  v_scope_user UUID := NULLIF(p_filters->>'scope_user_id','')::UUID;
  v_distributor UUID := NULLIF(p_filters->>'distributor_id','')::UUID;
  v_user_ids UUID[];
  v_row_key text := COALESCE(NULLIF(p_rows,''), 'team_member');
  v_col_key text := COALESCE(NULLIF(p_columns,''), 'team_member');
  v_val_key text := COALESCE(p_values[1], 'quantity');
  v_row_sql text; v_col_sql text; v_val_sql text; v_sql text; v_rec JSONB;
  v_dims text[]; v_aliases text[]; v_dim_sql text := ''; v_group_sql text := '';
  v_i int; v_by_day boolean; v_by_beat boolean; v_universe boolean;
  v_sort_key text; v_sort_dir text; v_ordinals text; v_order_sql text; v_order_plain text; v_sortable text[];
BEGIN
  IF v_scope_user IS NOT NULL THEN
    BEGIN
      SELECT ARRAY(SELECT s.subordinate_user_id FROM public.get_all_subordinates(v_scope_user) s) || v_scope_user
        INTO v_user_ids;
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'report scope resolution failed for %: %', v_scope_user, SQLERRM; v_user_ids := ARRAY[v_scope_user]; END;
  END IF;

  IF p_layout = 'tabular' THEN
    FOR v_rec IN
      WITH first_order AS (
        SELECT retailer_id, MIN(order_date::date) AS first_dt FROM public.orders
        WHERE cancelled_at IS NULL AND status NOT IN ('cancelled','replaced')
          AND (v_user_ids IS NULL OR user_id = ANY(v_user_ids))
          AND (v_distributor IS NULL OR distributor_id = v_distributor)
        GROUP BY retailer_id ),
      user_orders AS (
        SELECT user_id, COUNT(DISTINCT id) AS orders FROM public.orders
        WHERE order_date::date BETWEEN v_date_from AND v_date_to
          AND cancelled_at IS NULL AND status NOT IN ('cancelled','replaced')
          AND (v_user_ids IS NULL OR user_id = ANY(v_user_ids))
          AND (v_distributor IS NULL OR distributor_id = v_distributor)
        GROUP BY user_id )
      SELECT to_jsonb(t) FROM (
        SELECT o.order_date::date AS order_date,
          COALESCE(p.full_name, p.username, 'Unknown') AS team_member,
          COALESCE(o.beat_name_snapshot, b.beat_name) AS beat,
          o.retailer_name AS retailer, o.distributor_name AS distributor,
          oi.product_name AS product, oi.category AS category, oi.uom_code AS uom,
          o.status AS status,
          COALESCE(oi.quantity,0)::numeric AS quantity,
          COALESCE(oi.rate,0)::numeric(14,2) AS rate,
          COALESCE(oi.quantity*oi.rate,0)::numeric(14,2) AS revenue,
          COALESCE(uo.orders,0) AS orders,
          CASE WHEN fo.first_dt = o.order_date::date
                AND fo.first_dt BETWEEN v_date_from AND v_date_to THEN 1 ELSE 0 END AS new_retailers
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        LEFT JOIN public.profiles p ON p.id = o.user_id
        LEFT JOIN public.beats b ON b.beat_id = o.beat_id
        LEFT JOIN first_order fo ON fo.retailer_id = o.retailer_id
        LEFT JOIN user_orders uo ON uo.user_id = o.user_id
        WHERE o.order_date::date BETWEEN v_date_from AND v_date_to
          AND o.cancelled_at IS NULL AND o.status NOT IN ('cancelled','replaced')
          AND (v_user_ids IS NULL OR o.user_id = ANY(v_user_ids))
          AND (v_distributor IS NULL OR o.distributor_id = v_distributor)
        ORDER BY o.order_date DESC, o.created_at DESC LIMIT 5000 ) t
    LOOP RETURN NEXT v_rec; END LOOP;
    RETURN;
  END IF;

  IF p_layout = 'matrix' THEN
    v_row_sql := CASE v_row_key
      WHEN 'beat' THEN 'COALESCE(o.beat_name_snapshot, b.beat_name, ''—'')'
      WHEN 'retailer' THEN 'COALESCE(o.retailer_name, ''—'')'
      WHEN 'distributor' THEN 'COALESCE(o.distributor_name, ''—'')'
      WHEN 'order_date' THEN 'o.order_date::date::text'
      WHEN 'date' THEN 'o.order_date::date::text'
      WHEN 'status' THEN 'COALESCE(o.status, ''—'')'
      WHEN 'product' THEN 'COALESCE(oi.product_name, ''—'')'
      WHEN 'category' THEN 'COALESCE(oi.category, ''—'')'
      WHEN 'uom' THEN 'COALESCE(oi.uom_code, ''—'')'
      ELSE 'COALESCE(p.full_name, p.username, ''Unknown'')' END;
    v_col_sql := CASE v_col_key
      WHEN 'beat' THEN 'COALESCE(o.beat_name_snapshot, b.beat_name, ''—'')'
      WHEN 'retailer' THEN 'COALESCE(o.retailer_name, ''—'')'
      WHEN 'distributor' THEN 'COALESCE(o.distributor_name, ''—'')'
      WHEN 'order_date' THEN 'o.order_date::date::text'
      WHEN 'date' THEN 'o.order_date::date::text'
      WHEN 'status' THEN 'COALESCE(o.status, ''—'')'
      WHEN 'product' THEN 'COALESCE(oi.product_name, ''—'')'
      WHEN 'category' THEN 'COALESCE(oi.category, ''—'')'
      WHEN 'uom' THEN 'COALESCE(oi.uom_code, ''—'')'
      ELSE 'COALESCE(p.full_name, p.username, ''Unknown'')' END;
    v_val_sql := CASE v_val_key
      WHEN 'revenue' THEN 'COALESCE(SUM(oi.quantity*oi.rate),0)::numeric(14,2)'
      WHEN 'rate' THEN 'COALESCE(AVG(oi.rate),0)::numeric(14,2)'
      WHEN 'orders' THEN 'COUNT(DISTINCT o.id)'
      WHEN 'new_retailers' THEN 'COUNT(DISTINCT o.retailer_id)'
      ELSE 'COALESCE(SUM(oi.quantity),0)::numeric' END;
    v_sql := format($SQL$
      SELECT to_jsonb(t) FROM ( SELECT %s AS %I, %s AS %I, %s AS %I
        FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
        LEFT JOIN public.profiles p ON p.id = o.user_id
        LEFT JOIN public.beats b ON b.beat_id = o.beat_id
        WHERE o.order_date::date BETWEEN $1 AND $2
          AND o.cancelled_at IS NULL AND o.status NOT IN ('cancelled','replaced')
          AND ($3::uuid[] IS NULL OR o.user_id = ANY($3::uuid[]))
          AND ($4::uuid IS NULL OR o.distributor_id = $4::uuid)
        GROUP BY 1,2 ORDER BY 1,2 LIMIT 5000 ) t
    $SQL$, v_row_sql, v_row_key, v_col_sql, v_col_key, v_val_sql, v_val_key);
    FOR v_rec IN EXECUTE v_sql USING v_date_from, v_date_to, v_user_ids, v_distributor
    LOOP RETURN NEXT v_rec; END LOOP;
    RETURN;
  END IF;

  IF p_row_keys IS NULL OR COALESCE(array_length(p_row_keys,1),0) = 0 THEN
    v_dims := ARRAY[v_row_key]; v_aliases := ARRAY['grp'];
  ELSE v_dims := p_row_keys; v_aliases := p_row_keys; END IF;

  v_by_day  := ('order_date' = ANY(v_dims)) OR ('date' = ANY(v_dims));
  v_by_beat := ('beat' = ANY(v_dims));
  v_universe := ('team_member' = ANY(v_dims))
                AND (v_dims <@ ARRAY['team_member','order_date','date','beat']::text[]);

  -- Ordering. Default puts rows that actually sold ahead of the rest, so the
  -- full-roster zero rows collect at the end instead of interleaving by name.
  -- An explicit sort_key/sort_dir in the filters replaces that entirely.
  v_ordinals := (SELECT string_agg(i::text, ',') FROM generate_series(1, array_length(v_dims,1)) i);
  v_sort_key := NULLIF(p_filters->>'sort_key','');
  v_sort_dir := CASE WHEN lower(COALESCE(p_filters->>'sort_dir','desc')) = 'asc' THEN 'ASC' ELSE 'DESC' END;
  v_sortable := v_aliases || ARRAY['quantity','rate','revenue','orders','new_retailers','productive','unproductive','pending']::text[];
  IF v_sort_key IS NOT NULL AND v_sort_key = ANY(v_sortable) THEN
    v_order_sql   := format('%I %s NULLS LAST, %s', v_sort_key, v_sort_dir, v_ordinals);
    v_order_plain := v_order_sql;
  ELSE
    v_order_sql   := 'CASE WHEN COALESCE(SUM(ord.orders),0) > 0 THEN 0 ELSE 1 END, ' || v_ordinals;
    v_order_plain := v_ordinals;
  END IF;

  IF v_universe THEN
    FOR v_i IN 1..array_length(v_dims,1) LOOP
      v_dim_sql := v_dim_sql || format('%s AS %I, ',
        CASE WHEN v_dims[v_i] IN ('order_date','date') THEN 'base.day::text'
             WHEN v_dims[v_i] = 'beat' THEN 'COALESCE(base.beat, ''—'')'
             ELSE 'COALESCE(pr.full_name, pr.username, ''Unknown'')' END, v_aliases[v_i]);
      v_group_sql := v_group_sql || v_i::text || ',';
    END LOOP;
    v_group_sql := rtrim(v_group_sql, ',');

    v_sql := format($SQL$
      WITH first_order AS (
        SELECT retailer_id, MIN(order_date::date) AS first_dt FROM public.orders
        WHERE cancelled_at IS NULL AND status NOT IN ('cancelled','replaced')
          AND ($3::uuid[] IS NULL OR user_id = ANY($3::uuid[]))
          AND ($4::uuid IS NULL OR distributor_id = $4::uuid) GROUP BY retailer_id ),
      sold AS (
        SELECT DISTINCT user_id FROM public.orders
         WHERE order_date::date BETWEEN $1 AND $2 AND cancelled_at IS NULL AND status NOT IN ('cancelled','replaced')
           AND ($3::uuid[] IS NULL OR user_id = ANY($3::uuid[]))
           AND ($4::uuid IS NULL OR distributor_id = $4::uuid) ),
      touched AS (
        SELECT user_id FROM sold
        UNION SELECT user_id FROM public.visits
          WHERE planned_date BETWEEN $1 AND $2
        UNION SELECT user_id FROM public.attendance
          WHERE date BETWEEN $1 AND $2 ),
      base AS (
        SELECT o.user_id, %1$s AS day, %4$s AS beat
          FROM public.orders o LEFT JOIN public.beats b ON b.beat_id = o.beat_id
         WHERE o.order_date::date BETWEEN $1 AND $2
           AND o.cancelled_at IS NULL AND o.status NOT IN ('cancelled','replaced')
           AND ($3::uuid[] IS NULL OR o.user_id = ANY($3::uuid[]))
           AND ($4::uuid IS NULL OR o.distributor_id = $4::uuid)
        UNION
        SELECT v.user_id, %2$s, NULL::text FROM public.visits v
         WHERE v.planned_date BETWEEN $1 AND $2
           AND ($3::uuid[] IS NULL OR v.user_id = ANY($3::uuid[]))
           AND NOT EXISTS (SELECT 1 FROM sold s WHERE s.user_id = v.user_id)
        UNION
        SELECT a.user_id, %3$s, NULL::text FROM public.attendance a
         WHERE a.date BETWEEN $1 AND $2
           AND ($3::uuid[] IS NULL OR a.user_id = ANY($3::uuid[]))
           AND NOT EXISTS (SELECT 1 FROM sold s WHERE s.user_id = a.user_id)
        UNION
        -- Full roster: active profiles with no activity at all in the period.
        SELECT pr.id, NULL::date, NULL::text FROM public.profiles pr
         WHERE pr.is_active
           AND ($3::uuid[] IS NULL OR pr.id = ANY($3::uuid[]))
           AND NOT EXISTS (SELECT 1 FROM touched t WHERE t.user_id = pr.id) ),
      ord AS (
        SELECT o.user_id, %1$s AS day, %4$s AS beat, COUNT(DISTINCT o.id) AS orders,
               COALESCE(SUM(oi.quantity),0)::numeric AS quantity,
               COALESCE(AVG(oi.rate),0)::numeric(14,2) AS rate,
               COALESCE(SUM(oi.quantity*oi.rate),0)::numeric(14,2) AS revenue,
               COUNT(DISTINCT o.retailer_id) FILTER (
                 WHERE fo.first_dt BETWEEN $1 AND $2 AND fo.first_dt = o.order_date::date) AS new_retailers
        FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
        LEFT JOIN public.beats b ON b.beat_id = o.beat_id
        LEFT JOIN first_order fo ON fo.retailer_id = o.retailer_id
        WHERE o.order_date::date BETWEEN $1 AND $2 AND o.cancelled_at IS NULL AND o.status NOT IN ('cancelled','replaced')
          AND ($3::uuid[] IS NULL OR o.user_id = ANY($3::uuid[]))
          AND ($4::uuid IS NULL OR o.distributor_id = $4::uuid) GROUP BY 1,2,3 ),
      vis AS (
        SELECT v.user_id, %2$s AS day,
               COUNT(*) FILTER (WHERE v.status='productive') AS productive,
               COUNT(*) FILTER (WHERE v.status='unproductive') AS unproductive,
               COUNT(*) FILTER (WHERE v.status='planned') AS pending
        FROM public.visits v WHERE v.planned_date BETWEEN $1 AND $2
          AND ($3::uuid[] IS NULL OR v.user_id = ANY($3::uuid[])) GROUP BY 1,2 )
      SELECT to_jsonb(t) FROM (
        SELECT %5$s
          COALESCE(SUM(ord.quantity),0)::numeric AS quantity,
          COALESCE(AVG(ord.rate),0)::numeric(14,2) AS rate,
          COALESCE(SUM(ord.revenue),0)::numeric(14,2) AS revenue,
          COALESCE(SUM(ord.orders),0) AS orders,
          COALESCE(SUM(ord.new_retailers),0) AS new_retailers,
          COALESCE(SUM(vis.productive),0) AS productive,
          COALESCE(SUM(vis.unproductive),0) AS unproductive,
          COALESCE(SUM(vis.pending),0) AS pending
        FROM base LEFT JOIN public.profiles pr ON pr.id = base.user_id
        LEFT JOIN ord ON ord.user_id = base.user_id
                     AND ord.day IS NOT DISTINCT FROM base.day
                     AND ord.beat IS NOT DISTINCT FROM base.beat
        LEFT JOIN vis ON vis.user_id = base.user_id AND vis.day IS NOT DISTINCT FROM base.day
        GROUP BY %6$s ORDER BY %7$s LIMIT 2000 ) t
    $SQL$,
      CASE WHEN v_by_day  THEN 'o.order_date::date' ELSE 'NULL::date' END,
      CASE WHEN v_by_day  THEN 'v.planned_date'     ELSE 'NULL::date' END,
      CASE WHEN v_by_day  THEN 'a.date'             ELSE 'NULL::date' END,
      CASE WHEN v_by_beat THEN 'COALESCE(o.beat_name_snapshot, b.beat_name)' ELSE 'NULL::text' END,
      v_dim_sql, v_group_sql, v_order_sql);

    FOR v_rec IN EXECUTE v_sql USING v_date_from, v_date_to, v_user_ids, v_distributor
    LOOP RETURN NEXT v_rec; END LOOP;
    RETURN;
  END IF;

  FOR v_i IN 1..array_length(v_dims,1) LOOP
    v_dim_sql := v_dim_sql || format('%s AS %I, ',
      CASE v_dims[v_i]
        WHEN 'beat' THEN 'COALESCE(o.beat_name_snapshot, b.beat_name, ''—'')'
        WHEN 'retailer' THEN 'COALESCE(o.retailer_name,''—'')'
        WHEN 'distributor' THEN 'COALESCE(o.distributor_name,''—'')'
        WHEN 'product' THEN 'COALESCE(oi.product_name,''—'')'
        WHEN 'category' THEN 'COALESCE(oi.category,''—'')'
        WHEN 'uom' THEN 'COALESCE(oi.uom_code,''—'')'
        WHEN 'order_date' THEN 'o.order_date::date::text'
        WHEN 'date' THEN 'o.order_date::date::text'
        WHEN 'status' THEN 'COALESCE(o.status,''—'')'
        ELSE 'COALESCE(p.full_name, p.username, ''Unknown'')' END, v_aliases[v_i]);
    v_group_sql := v_group_sql || v_i::text || ',';
  END LOOP;
  v_group_sql := rtrim(v_group_sql, ',');
  v_sql := format($SQL$
    WITH first_order AS (
      SELECT retailer_id, MIN(order_date::date) AS first_dt FROM public.orders
      WHERE cancelled_at IS NULL AND status NOT IN ('cancelled','replaced')
        AND ($3::uuid[] IS NULL OR user_id = ANY($3::uuid[]))
        AND ($4::uuid IS NULL OR distributor_id = $4::uuid) GROUP BY retailer_id )
    SELECT to_jsonb(t) FROM ( SELECT %s
        COALESCE(SUM(oi.quantity),0)::numeric AS quantity,
        COALESCE(AVG(oi.rate),0)::numeric(14,2) AS rate,
        COALESCE(SUM(oi.quantity*oi.rate),0)::numeric(14,2) AS revenue,
        COUNT(DISTINCT o.id) AS orders,
        COUNT(DISTINCT o.retailer_id) FILTER (
          WHERE fo.first_dt BETWEEN $1 AND $2 AND fo.first_dt = o.order_date::date) AS new_retailers
      FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
      LEFT JOIN public.profiles p ON p.id = o.user_id
      LEFT JOIN public.beats b ON b.beat_id = o.beat_id
      LEFT JOIN first_order fo ON fo.retailer_id = o.retailer_id
      WHERE o.order_date::date BETWEEN $1 AND $2
        AND o.cancelled_at IS NULL AND o.status NOT IN ('cancelled','replaced')
        AND ($3::uuid[] IS NULL OR o.user_id = ANY($3::uuid[]))
        AND ($4::uuid IS NULL OR o.distributor_id = $4::uuid)
      GROUP BY %s ORDER BY %s LIMIT 2000 ) t
  $SQL$, v_dim_sql, v_group_sql, v_order_plain);
  FOR v_rec IN EXECUTE v_sql USING v_date_from, v_date_to, v_user_ids, v_distributor
  LOOP RETURN NEXT v_rec; END LOOP;
END;
$function$;

-- Load-bearing: the DROP above discarded the previous ACL.
GRANT EXECUTE ON FUNCTION public.get_sales_report(text, text, text, text[], jsonb, text[])
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
