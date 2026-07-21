
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
            SELECT b.beat_name
            FROM public.daily_beat_plans dbp
            LEFT JOIN public.beats b ON b.beat_id = dbp.beat_id
            WHERE dbp.assigned_user_id = a.user_id AND dbp.plan_date = a.date
            LIMIT 1
          ) AS beat,
          a.check_in_time,
          a.check_out_time,
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
        ORDER BY 1 ASC
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
        ORDER BY r.team_member ASC
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;
  END IF;

  RETURN;
END; $function$;
