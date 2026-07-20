
-- 1) Metadata
UPDATE public.reportable_datasets
SET dimensions = '[
  {"key":"team_member","label":"Team member"},
  {"key":"status","label":"Status"},
  {"key":"beat","label":"Beat"},
  {"key":"date","label":"Date"},
  {"key":"check_in_time","label":"Check-in time"},
  {"key":"check_out_time","label":"Check-out time"}
]'::jsonb,
    measures = '[
  {"key":"total_hours","label":"Total hours","agg":"sum"},
  {"key":"present","label":"Present","agg":"count"},
  {"key":"absent","label":"Absent","agg":"count"},
  {"key":"half_day","label":"Half day","agg":"count"},
  {"key":"on_leave","label":"Leave","agg":"count"}
]'::jsonb,
    supports_matrix = true,
    updated_at = now()
WHERE key = 'attendance';

UPDATE public.reportable_datasets
SET dimensions = '[
  {"key":"team_member","label":"Team member"},
  {"key":"beat","label":"Beat"},
  {"key":"retailer","label":"Retailer"},
  {"key":"order_date","label":"Order date"},
  {"key":"status","label":"Status"}
]'::jsonb,
    measures = '[
  {"key":"revenue","label":"Revenue","agg":"sum"},
  {"key":"quantity","label":"Quantity","agg":"sum"},
  {"key":"new_retailers","label":"New retailers","agg":"count"}
]'::jsonb,
    supports_matrix = true,
    updated_at = now()
WHERE key = 'sales';

UPDATE public.reportable_datasets
SET dimensions = '[
  {"key":"team_member","label":"Team member"},
  {"key":"retailer","label":"Retailer"},
  {"key":"order_date","label":"Order date"},
  {"key":"status","label":"Status"}
]'::jsonb,
    measures = '[
  {"key":"order_count","label":"Order count","agg":"count"},
  {"key":"total_amount","label":"Total amount","agg":"sum"}
]'::jsonb,
    supports_matrix = true,
    updated_at = now()
WHERE key = 'orders';

UPDATE public.reportable_datasets
SET dimensions = '[
  {"key":"team_member","label":"Team member"},
  {"key":"beat","label":"Beat"},
  {"key":"retailer","label":"Retailer"},
  {"key":"visit_date","label":"Visit date"}
]'::jsonb,
    measures = '[
  {"key":"visit_count","label":"Visit count","agg":"count"},
  {"key":"productive_visits","label":"Productive visits","agg":"count"}
]'::jsonb,
    supports_matrix = true,
    updated_at = now()
WHERE key = 'visits';

-- 2) RPCs

CREATE OR REPLACE FUNCTION public.get_attendance_report(p_layout text, p_rows text, p_columns text, p_values text[], p_filters jsonb)
RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_date_from DATE := COALESCE((p_filters->>'date_from')::DATE, CURRENT_DATE - 30);
  v_date_to   DATE := COALESCE((p_filters->>'date_to')::DATE,   CURRENT_DATE);
  v_scope_user UUID := NULLIF(p_filters->>'scope_user_id','')::UUID;
  v_user_ids UUID[];
  v_rec JSONB;
BEGIN
  IF v_scope_user IS NOT NULL THEN
    BEGIN
      SELECT ARRAY(SELECT user_id FROM public.get_all_subordinates(v_scope_user)) || v_scope_user
        INTO v_user_ids;
    EXCEPTION WHEN OTHERS THEN
      v_user_ids := ARRAY[v_scope_user];
    END;
  END IF;

  IF p_layout = 'tabular' THEN
    FOR v_rec IN
      WITH days AS (SELECT generate_series(v_date_from, v_date_to, '1 day')::date AS d),
      roster AS (
        SELECT id AS user_id, COALESCE(full_name, username, 'Unknown') AS team_member
        FROM public.profiles
        WHERE is_active = true
          AND (v_user_ids IS NULL OR id = ANY(v_user_ids))
      )
      SELECT to_jsonb(t) FROM (
        SELECT
          d.d AS date,
          r.team_member,
          COALESCE(a.status, 'absent') AS status,
          (
            SELECT b.beat_name
            FROM public.daily_beat_plans dbp
            LEFT JOIN public.beats b ON b.beat_id = dbp.beat_id
            WHERE dbp.assigned_user_id = r.user_id AND dbp.plan_date = d.d
            LIMIT 1
          ) AS beat,
          a.check_in_time,
          a.check_out_time,
          COALESCE(a.total_hours, 0) AS total_hours
        FROM days d
        CROSS JOIN roster r
        LEFT JOIN public.attendance a
               ON a.user_id = r.user_id AND a.date = d.d
        ORDER BY d.d DESC, r.team_member
        LIMIT 5000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;

  ELSIF p_layout = 'grouped' THEN
    FOR v_rec IN
      WITH days AS (SELECT generate_series(v_date_from, v_date_to, '1 day')::date AS d),
      roster AS (
        SELECT id AS user_id, COALESCE(full_name, username, 'Unknown') AS team_member
        FROM public.profiles
        WHERE is_active = true
          AND (v_user_ids IS NULL OR id = ANY(v_user_ids))
      ),
      base AS (
        SELECT d.d AS date, r.user_id, r.team_member,
               COALESCE(a.status, 'absent') AS status,
               a.total_hours
        FROM days d CROSS JOIN roster r
        LEFT JOIN public.attendance a ON a.user_id=r.user_id AND a.date=d.d
      )
      SELECT to_jsonb(t) FROM (
        SELECT
          CASE p_rows
            WHEN 'date' THEN date::text
            WHEN 'status' THEN status
            ELSE team_member
          END AS grp,
          COALESCE(SUM(total_hours),0)::numeric(10,2) AS total_hours,
          COUNT(*) FILTER (WHERE status='present') AS present,
          COUNT(*) FILTER (WHERE status='absent')  AS absent,
          COUNT(*) FILTER (WHERE status='half_day_leave') AS half_day,
          COUNT(*) FILTER (WHERE status='leave') AS on_leave
        FROM base
        GROUP BY 1
        ORDER BY 1
        LIMIT 2000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;

  ELSIF p_layout = 'matrix' THEN
    FOR v_rec IN
      WITH days AS (SELECT generate_series(v_date_from, v_date_to, '1 day')::date AS d),
      roster AS (
        SELECT id AS user_id, COALESCE(full_name, username, 'Unknown') AS team_member
        FROM public.profiles
        WHERE is_active = true
          AND (v_user_ids IS NULL OR id = ANY(v_user_ids))
      )
      SELECT to_jsonb(t) FROM (
        SELECT
          r.team_member,
          jsonb_object_agg(
            d.d::text,
            CASE WHEN a.status = 'present' THEN 1 ELSE 0 END
          ) AS by_date
        FROM days d
        CROSS JOIN roster r
        LEFT JOIN public.attendance a ON a.user_id = r.user_id AND a.date = d.d
        GROUP BY r.team_member
        ORDER BY r.team_member
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;
  END IF;

  RETURN;
END; $$;

CREATE OR REPLACE FUNCTION public.get_orders_report(p_layout text, p_rows text, p_columns text, p_values text[], p_filters jsonb)
RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_date_from DATE := COALESCE((p_filters->>'date_from')::DATE, CURRENT_DATE - 30);
  v_date_to   DATE := COALESCE((p_filters->>'date_to')::DATE,   CURRENT_DATE);
  v_scope_user UUID := NULLIF(p_filters->>'scope_user_id','')::UUID;
  v_user_ids UUID[];
  v_rec JSONB;
BEGIN
  IF v_scope_user IS NOT NULL THEN
    BEGIN
      SELECT ARRAY(SELECT user_id FROM public.get_all_subordinates(v_scope_user)) || v_scope_user
        INTO v_user_ids;
    EXCEPTION WHEN OTHERS THEN
      v_user_ids := ARRAY[v_scope_user];
    END;
  END IF;

  IF p_layout = 'tabular' THEN
    FOR v_rec IN
      SELECT to_jsonb(t) FROM (
        SELECT
          COALESCE(p.full_name, p.username, 'Unknown') AS team_member,
          o.retailer_name AS retailer,
          o.order_date::date AS order_date,
          o.status,
          1 AS order_count,
          COALESCE(o.total_amount, 0) AS total_amount
        FROM public.orders o
        LEFT JOIN public.profiles p ON p.id = o.user_id
        WHERE o.order_date::date BETWEEN v_date_from AND v_date_to
          AND (v_user_ids IS NULL OR o.user_id = ANY(v_user_ids))
        ORDER BY o.order_date DESC
        LIMIT 5000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;
  ELSE
    FOR v_rec IN
      SELECT to_jsonb(t) FROM (
        SELECT
          CASE p_rows
            WHEN 'retailer' THEN o.retailer_name
            WHEN 'order_date' THEN o.order_date::date::text
            WHEN 'status' THEN o.status
            ELSE COALESCE(p.full_name, p.username, 'Unknown')
          END AS grp,
          COUNT(*) AS order_count,
          COALESCE(SUM(o.total_amount),0)::numeric(14,2) AS total_amount
        FROM public.orders o
        LEFT JOIN public.profiles p ON p.id = o.user_id
        WHERE o.order_date::date BETWEEN v_date_from AND v_date_to
          AND (v_user_ids IS NULL OR o.user_id = ANY(v_user_ids))
        GROUP BY 1
        ORDER BY order_count DESC
        LIMIT 2000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.get_sales_report(p_layout text, p_rows text, p_columns text, p_values text[], p_filters jsonb)
RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_date_from DATE := COALESCE((p_filters->>'date_from')::DATE, CURRENT_DATE - 30);
  v_date_to   DATE := COALESCE((p_filters->>'date_to')::DATE,   CURRENT_DATE);
  v_scope_user UUID := NULLIF(p_filters->>'scope_user_id','')::UUID;
  v_user_ids UUID[];
  v_rec JSONB;
BEGIN
  IF v_scope_user IS NOT NULL THEN
    BEGIN
      SELECT ARRAY(SELECT user_id FROM public.get_all_subordinates(v_scope_user)) || v_scope_user
        INTO v_user_ids;
    EXCEPTION WHEN OTHERS THEN
      v_user_ids := ARRAY[v_scope_user];
    END;
  END IF;

  IF p_layout = 'tabular' THEN
    FOR v_rec IN
      WITH first_order AS (
        SELECT retailer_id, MIN(order_date::date) AS first_dt
        FROM public.orders
        WHERE (v_user_ids IS NULL OR user_id = ANY(v_user_ids))
        GROUP BY retailer_id
      )
      SELECT to_jsonb(t) FROM (
        SELECT
          COALESCE(p.full_name, p.username, 'Unknown') AS team_member,
          b.beat_name AS beat,
          o.retailer_name AS retailer,
          o.order_date::date AS order_date,
          o.status,
          COALESCE(SUM(oi.quantity),0)::numeric AS quantity,
          COALESCE(SUM(oi.quantity * oi.rate),0)::numeric(14,2) AS revenue,
          CASE WHEN fo.first_dt = o.order_date::date
                AND fo.first_dt BETWEEN v_date_from AND v_date_to
               THEN 1 ELSE 0 END AS new_retailers
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        LEFT JOIN public.profiles p ON p.id = o.user_id
        LEFT JOIN public.beats b ON b.beat_id = o.beat_id
        LEFT JOIN first_order fo ON fo.retailer_id = o.retailer_id
        WHERE o.order_date::date BETWEEN v_date_from AND v_date_to
          AND o.status <> 'cancelled'
          AND (v_user_ids IS NULL OR o.user_id = ANY(v_user_ids))
        GROUP BY p.full_name, p.username, b.beat_name, o.retailer_name, o.retailer_id, o.order_date, o.status, fo.first_dt
        ORDER BY revenue DESC NULLS LAST
        LIMIT 5000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;
  ELSE
    FOR v_rec IN
      WITH first_order AS (
        SELECT retailer_id, MIN(order_date::date) AS first_dt
        FROM public.orders
        WHERE (v_user_ids IS NULL OR user_id = ANY(v_user_ids))
        GROUP BY retailer_id
      )
      SELECT to_jsonb(t) FROM (
        SELECT
          CASE p_rows
            WHEN 'beat' THEN b.beat_name
            WHEN 'retailer' THEN o.retailer_name
            WHEN 'order_date' THEN o.order_date::date::text
            WHEN 'status' THEN o.status
            ELSE COALESCE(p.full_name, p.username, 'Unknown')
          END AS grp,
          COALESCE(SUM(oi.quantity),0)::numeric AS quantity,
          COALESCE(SUM(oi.quantity * oi.rate),0)::numeric(14,2) AS revenue,
          COUNT(DISTINCT o.retailer_id) FILTER (
            WHERE fo.first_dt BETWEEN v_date_from AND v_date_to
              AND fo.first_dt = o.order_date::date
          ) AS new_retailers
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        LEFT JOIN public.profiles p ON p.id = o.user_id
        LEFT JOIN public.beats b ON b.beat_id = o.beat_id
        LEFT JOIN first_order fo ON fo.retailer_id = o.retailer_id
        WHERE o.order_date::date BETWEEN v_date_from AND v_date_to
          AND o.status <> 'cancelled'
          AND (v_user_ids IS NULL OR o.user_id = ANY(v_user_ids))
        GROUP BY 1
        ORDER BY revenue DESC NULLS LAST
        LIMIT 2000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.get_visits_report(p_layout text, p_rows text, p_columns text, p_values text[], p_filters jsonb)
RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_date_from DATE := COALESCE((p_filters->>'date_from')::DATE, CURRENT_DATE - 30);
  v_date_to   DATE := COALESCE((p_filters->>'date_to')::DATE,   CURRENT_DATE);
  v_scope_user UUID := NULLIF(p_filters->>'scope_user_id','')::UUID;
  v_user_ids UUID[];
  v_rec JSONB;
BEGIN
  IF v_scope_user IS NOT NULL THEN
    BEGIN
      SELECT ARRAY(SELECT user_id FROM public.get_all_subordinates(v_scope_user)) || v_scope_user
        INTO v_user_ids;
    EXCEPTION WHEN OTHERS THEN
      v_user_ids := ARRAY[v_scope_user];
    END;
  END IF;

  IF p_layout = 'tabular' THEN
    FOR v_rec IN
      SELECT to_jsonb(t) FROM (
        SELECT
          COALESCE(p.full_name, p.username, 'Unknown') AS team_member,
          b.beat_name AS beat,
          r.name AS retailer,
          v.planned_date AS visit_date,
          1 AS visit_count,
          CASE WHEN v.status = 'productive' OR EXISTS (
            SELECT 1 FROM public.orders o
             WHERE o.visit_id = v.id AND o.status <> 'cancelled'
          ) THEN 1 ELSE 0 END AS productive_visits
        FROM public.visits v
        LEFT JOIN public.profiles p ON p.id = v.user_id
        LEFT JOIN public.retailers r ON r.id = v.retailer_id
        LEFT JOIN public.beats b ON b.beat_id = r.beat_id
        WHERE v.planned_date BETWEEN v_date_from AND v_date_to
          AND (v_user_ids IS NULL OR v.user_id = ANY(v_user_ids))
        ORDER BY v.planned_date DESC
        LIMIT 5000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;
  ELSE
    FOR v_rec IN
      SELECT to_jsonb(t) FROM (
        SELECT
          CASE p_rows
            WHEN 'beat' THEN b.beat_name
            WHEN 'retailer' THEN r.name
            WHEN 'visit_date' THEN v.planned_date::text
            ELSE COALESCE(p.full_name, p.username, 'Unknown')
          END AS grp,
          COUNT(*) AS visit_count,
          COUNT(*) FILTER (
            WHERE v.status='productive' OR EXISTS (
              SELECT 1 FROM public.orders o
               WHERE o.visit_id = v.id AND o.status <> 'cancelled'
            )
          ) AS productive_visits
        FROM public.visits v
        LEFT JOIN public.profiles p ON p.id = v.user_id
        LEFT JOIN public.retailers r ON r.id = v.retailer_id
        LEFT JOIN public.beats b ON b.beat_id = r.beat_id
        WHERE v.planned_date BETWEEN v_date_from AND v_date_to
          AND (v_user_ids IS NULL OR v.user_id = ANY(v_user_ids))
        GROUP BY 1
        ORDER BY visit_count DESC
        LIMIT 2000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;
  END IF;
END; $$;
