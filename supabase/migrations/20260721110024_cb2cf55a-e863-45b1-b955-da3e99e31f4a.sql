
CREATE OR REPLACE FUNCTION public.get_attendance_report(p_layout text, p_rows text, p_columns text, p_values text[], p_filters jsonb)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_default_from DATE := CASE WHEN p_layout = 'tabular' THEN CURRENT_DATE - 14 ELSE CURRENT_DATE - 30 END;
  v_date_from DATE := COALESCE((p_filters->>'date_from')::DATE, v_default_from);
  v_date_to   DATE := COALESCE((p_filters->>'date_to')::DATE,   CURRENT_DATE);
  v_scope_user UUID := NULLIF(p_filters->>'scope_user_id','')::UUID;
  v_user_ids UUID[];
  v_rec JSONB;
  v_measure TEXT := COALESCE(p_values[1], 'present');
  v_row_key TEXT := COALESCE(NULLIF(p_rows,''), 'team_member');
  v_col_key TEXT := COALESCE(NULLIF(p_columns,''), 'date');
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
          a.date,
          COALESCE(p.full_name, p.username, 'Unknown') AS team_member,
          a.status,
          (
            SELECT bp.beat_name FROM public.beat_plans bp
            WHERE bp.user_id = a.user_id AND bp.plan_date = a.date LIMIT 1
          ) AS beat,
          a.check_in_time, a.check_out_time,
          COALESCE(a.total_hours, 0) AS total_hours
        FROM public.attendance a
        LEFT JOIN public.profiles p ON p.id = a.user_id
        WHERE a.date BETWEEN v_date_from AND v_date_to
          AND (v_user_ids IS NULL OR a.user_id = ANY(v_user_ids))
        ORDER BY a.date DESC, team_member ASC
        LIMIT 5000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;

  ELSIF p_layout = 'grouped' THEN
    FOR v_rec IN
      WITH days AS (SELECT generate_series(v_date_from, v_date_to, '1 day')::date AS d),
      roster AS (
        SELECT id AS user_id, COALESCE(full_name, username, 'Unknown') AS team_member
        FROM public.profiles
        WHERE is_active = true AND (v_user_ids IS NULL OR id = ANY(v_user_ids))
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
          CASE v_row_key
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
        GROUP BY 1 ORDER BY 1 ASC LIMIT 2000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;

  ELSIF p_layout = 'matrix' THEN
    -- Build a long-shape row set { <row_key>: <row_val>, <col_key>: <col_val>, <measure>: <numeric> }
    FOR v_rec IN
      WITH days AS (SELECT generate_series(v_date_from, v_date_to, '1 day')::date AS d),
      roster AS (
        SELECT id AS user_id, COALESCE(full_name, username, 'Unknown') AS team_member
        FROM public.profiles
        WHERE is_active = true AND (v_user_ids IS NULL OR id = ANY(v_user_ids))
      ),
      base AS (
        SELECT
          d.d AS date,
          r.user_id,
          r.team_member,
          COALESCE(a.status, 'absent') AS status,
          COALESCE(a.total_hours, 0)::numeric AS total_hours,
          (SELECT bp.beat_name FROM public.beat_plans bp
             WHERE bp.user_id = r.user_id AND bp.plan_date = d.d LIMIT 1) AS beat_raw,
          a.check_in_time, a.check_out_time
        FROM days d
        CROSS JOIN roster r
        LEFT JOIN public.attendance a ON a.user_id = r.user_id AND a.date = d.d
      ),
      enriched AS (
        SELECT
          CASE v_row_key
            WHEN 'date' THEN date::text
            WHEN 'status' THEN status
            WHEN 'beat' THEN COALESCE(beat_raw, 'No beat')
            WHEN 'check_in_time' THEN COALESCE(check_in_time::text, '—')
            WHEN 'check_out_time' THEN COALESCE(check_out_time::text, '—')
            ELSE team_member
          END AS row_val,
          CASE v_col_key
            WHEN 'date' THEN date::text
            WHEN 'status' THEN status
            WHEN 'beat' THEN COALESCE(beat_raw, 'No beat')
            WHEN 'check_in_time' THEN COALESCE(check_in_time::text, '—')
            WHEN 'check_out_time' THEN COALESCE(check_out_time::text, '—')
            ELSE team_member
          END AS col_val,
          status, total_hours
        FROM base
      ),
      agg AS (
        SELECT row_val, col_val,
          CASE v_measure
            WHEN 'total_hours' THEN COALESCE(AVG(total_hours), 0)::numeric(10,2)
            WHEN 'absent'      THEN COUNT(*) FILTER (WHERE status='absent')::numeric
            WHEN 'half_day'    THEN COUNT(*) FILTER (WHERE status='half_day_leave')::numeric
            WHEN 'on_leave'    THEN COUNT(*) FILTER (WHERE status='leave')::numeric
            ELSE               COUNT(*) FILTER (WHERE status='present')::numeric
          END AS val
        FROM enriched
        GROUP BY row_val, col_val
      )
      SELECT jsonb_build_object(v_row_key, row_val, v_col_key, col_val, v_measure, val)
      FROM agg
      WHERE val IS NOT NULL
      ORDER BY row_val, col_val
      LIMIT 5000
    LOOP RETURN NEXT v_rec; END LOOP;
  END IF;

  RETURN;
END; $function$;
