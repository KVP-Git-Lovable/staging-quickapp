
-- 1. Fix get_attendance_report: lowercase statuses (present/leave/half_day_leave/regularized)
--    and derive "absent" via LEFT JOIN of active-employee roster to attendance rows.
CREATE OR REPLACE FUNCTION public.get_attendance_report(
  p_layout text, p_rows text, p_columns text, p_values text[], p_filters jsonb
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
          d.d          AS date,
          r.user_id,
          r.team_member,
          COALESCE(a.status, 'absent') AS status,
          a.total_hours AS hours
        FROM days d
        CROSS JOIN roster r
        LEFT JOIN public.attendance a
               ON a.user_id = r.user_id AND a.date = d.d
        ORDER BY d.d DESC, r.team_member
        LIMIT 5000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;

  ELSIF p_layout = 'grouped' THEN
    IF p_rows = 'team_member' THEN
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
            ROUND(AVG(a.total_hours)::numeric, 2) AS hours,
            COUNT(*) FILTER (WHERE a.status = 'present')        AS present,
            COUNT(*) FILTER (WHERE a.status = 'leave')          AS on_leave,
            COUNT(*) FILTER (WHERE a.status = 'half_day_leave') AS half_day,
            COUNT(*) FILTER (WHERE a.status = 'regularized')    AS regularized,
            COUNT(*) FILTER (WHERE a.id IS NULL)                AS absent,
            COUNT(*)                                            AS total_days
          FROM days d
          CROSS JOIN roster r
          LEFT JOIN public.attendance a
                 ON a.user_id = r.user_id AND a.date = d.d
          GROUP BY r.team_member
          ORDER BY r.team_member
          LIMIT 2000
        ) t
      LOOP RETURN NEXT v_rec; END LOOP;

    ELSIF p_rows = 'date' THEN
      FOR v_rec IN
        WITH days AS (SELECT generate_series(v_date_from, v_date_to, '1 day')::date AS d),
        roster AS (
          SELECT id AS user_id FROM public.profiles
          WHERE is_active = true
            AND (v_user_ids IS NULL OR id = ANY(v_user_ids))
        )
        SELECT to_jsonb(t) FROM (
          SELECT
            d.d AS date,
            ROUND(AVG(a.total_hours)::numeric, 2) AS hours,
            COUNT(*) FILTER (WHERE a.status = 'present')        AS present,
            COUNT(*) FILTER (WHERE a.status = 'leave')          AS on_leave,
            COUNT(*) FILTER (WHERE a.status = 'half_day_leave') AS half_day,
            COUNT(*) FILTER (WHERE a.status = 'regularized')    AS regularized,
            COUNT(*) FILTER (WHERE a.id IS NULL)                AS absent
          FROM days d
          CROSS JOIN roster r
          LEFT JOIN public.attendance a
                 ON a.user_id = r.user_id AND a.date = d.d
          GROUP BY d.d
          ORDER BY d.d DESC
        ) t
      LOOP RETURN NEXT v_rec; END LOOP;

    ELSE  -- rows = status
      FOR v_rec IN
        WITH days AS (SELECT generate_series(v_date_from, v_date_to, '1 day')::date AS d),
        roster AS (
          SELECT id AS user_id FROM public.profiles
          WHERE is_active = true
            AND (v_user_ids IS NULL OR id = ANY(v_user_ids))
        ),
        merged AS (
          SELECT COALESCE(a.status, 'absent') AS status, a.total_hours
          FROM days d
          CROSS JOIN roster r
          LEFT JOIN public.attendance a
                 ON a.user_id = r.user_id AND a.date = d.d
        )
        SELECT to_jsonb(t) FROM (
          SELECT status, COUNT(*) AS count, ROUND(AVG(total_hours)::numeric, 2) AS hours
          FROM merged
          GROUP BY status
          ORDER BY status
        ) t
      LOOP RETURN NEXT v_rec; END LOOP;
    END IF;

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
        LEFT JOIN public.attendance a
               ON a.user_id = r.user_id AND a.date = d.d
        GROUP BY r.team_member
        ORDER BY r.team_member
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;
  END IF;

  RETURN;
END;
$function$;

-- 2. Swap admin-only report RLS to use is_admin_or_manager() (per spec).
DROP POLICY IF EXISTS "Admins manage all report definitions"   ON public.report_definitions;
DROP POLICY IF EXISTS "Admins manage all subscriptions"        ON public.report_subscriptions;
DROP POLICY IF EXISTS "Admins can manage datasets"             ON public.reportable_datasets;
DROP POLICY IF EXISTS "Admins read all delivery log"           ON public.report_delivery_log;

CREATE POLICY "Admins/managers manage report definitions"
  ON public.report_definitions FOR ALL
  USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());

CREATE POLICY "Admins/managers manage subscriptions"
  ON public.report_subscriptions FOR ALL
  USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());

CREATE POLICY "Admins/managers manage datasets"
  ON public.reportable_datasets FOR ALL
  USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());

CREATE POLICY "Admins/managers read delivery log"
  ON public.report_delivery_log FOR SELECT
  USING (public.is_admin_or_manager());

-- 3. Also gate the create RPC on is_admin_or_manager (not raw has_role).
CREATE OR REPLACE FUNCTION public.create_report_subscription(p_definition jsonb, p_subscription jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_def_id UUID;
  v_sub_id UUID;
  v_uid UUID := auth.uid();
BEGIN
  IF NOT public.is_admin_or_manager() THEN
    RAISE EXCEPTION 'Only admins/managers can create report subscriptions';
  END IF;

  INSERT INTO public.report_definitions (name, dataset_key, layout, config, created_by)
  VALUES (
    p_definition->>'name',
    p_definition->>'dataset_key',
    p_definition->>'layout',
    COALESCE(p_definition->'config', '{}'::jsonb),
    v_uid
  ) RETURNING id INTO v_def_id;

  INSERT INTO public.report_subscriptions (
    name, report_definition_id, cadence, fire_day, fire_time, timezone,
    recipient_user_ids, attachment_format, push_to_phone, scope, status, created_by
  )
  VALUES (
    p_subscription->>'name',
    v_def_id,
    p_subscription->>'cadence',
    p_subscription->>'fire_day',
    COALESCE((p_subscription->>'fire_time')::time, '08:00'::time),
    COALESCE(p_subscription->>'timezone', 'Asia/Kolkata'),
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(p_subscription->'recipient_user_ids'))::uuid[],
      '{}'::uuid[]
    ),
    COALESCE(p_subscription->>'attachment_format', 'excel'),
    COALESCE((p_subscription->>'push_to_phone')::boolean, true),
    COALESCE(p_subscription->>'scope', 'shared'),
    COALESCE(p_subscription->>'status', 'active'),
    v_uid
  ) RETURNING id INTO v_sub_id;

  RETURN v_sub_id;
END;
$function$;
