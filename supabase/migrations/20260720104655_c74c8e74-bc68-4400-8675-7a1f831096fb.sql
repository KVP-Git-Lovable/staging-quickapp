
-- ============ reportable_datasets ============
CREATE TABLE public.reportable_datasets (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL,
  dimensions JSONB NOT NULL DEFAULT '[]'::jsonb,
  measures JSONB NOT NULL DEFAULT '[]'::jsonb,
  supports_matrix BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.reportable_datasets TO authenticated;
GRANT ALL ON public.reportable_datasets TO service_role;

ALTER TABLE public.reportable_datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can read active datasets"
  ON public.reportable_datasets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage datasets"
  ON public.reportable_datasets FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============ report_definitions ============
CREATE TABLE public.report_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  dataset_key TEXT NOT NULL REFERENCES public.reportable_datasets(key) ON DELETE RESTRICT,
  layout TEXT NOT NULL CHECK (layout IN ('tabular', 'grouped', 'matrix')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_definitions TO authenticated;
GRANT ALL ON public.report_definitions TO service_role;

ALTER TABLE public.report_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all report definitions"
  ON public.report_definitions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============ report_subscriptions ============
CREATE TABLE public.report_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  report_definition_id UUID NOT NULL REFERENCES public.report_definitions(id) ON DELETE CASCADE,
  cadence TEXT NOT NULL CHECK (cadence IN ('daily', 'weekday', 'weekly', 'monthly')),
  fire_day TEXT,
  fire_time TIME NOT NULL DEFAULT '08:00',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  recipient_user_ids UUID[] NOT NULL DEFAULT '{}',
  attachment_format TEXT NOT NULL DEFAULT 'excel' CHECK (attachment_format IN ('excel', 'pdf', 'summary_only')),
  push_to_phone BOOLEAN NOT NULL DEFAULT true,
  scope TEXT NOT NULL DEFAULT 'shared' CHECK (scope IN ('shared', 'per_recipient')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'draft')),
  last_fired_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_subs_status ON public.report_subscriptions(status) WHERE status = 'active';
CREATE INDEX idx_report_subs_recipients ON public.report_subscriptions USING GIN (recipient_user_ids);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_subscriptions TO authenticated;
GRANT ALL ON public.report_subscriptions TO service_role;

ALTER TABLE public.report_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all subscriptions"
  ON public.report_subscriptions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Recipients or creator can read subscription"
  ON public.report_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by OR auth.uid() = ANY(recipient_user_ids));

CREATE POLICY "Recipients can read linked definition"
  ON public.report_definitions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.report_subscriptions s
      WHERE s.report_definition_id = report_definitions.id
        AND (auth.uid() = s.created_by OR auth.uid() = ANY(s.recipient_user_ids))
    )
  );

-- ============ report_delivery_log ============
CREATE TABLE public.report_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.report_subscriptions(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL,
  period TEXT NOT NULL,
  notification_id UUID,
  storage_path TEXT,
  in_app_status TEXT,
  push_status TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_delivery_sub ON public.report_delivery_log(subscription_id, created_at DESC);
CREATE INDEX idx_report_delivery_recipient ON public.report_delivery_log(recipient_user_id, created_at DESC);
CREATE UNIQUE INDEX idx_report_delivery_dedupe ON public.report_delivery_log(subscription_id, recipient_user_id, period);

GRANT SELECT ON public.report_delivery_log TO authenticated;
GRANT ALL ON public.report_delivery_log TO service_role;

ALTER TABLE public.report_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipients read own delivery log"
  ON public.report_delivery_log FOR SELECT
  TO authenticated
  USING (auth.uid() = recipient_user_id);

CREATE POLICY "Admins read all delivery log"
  ON public.report_delivery_log FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ============ updated_at triggers ============
CREATE TRIGGER trg_reportable_datasets_updated
  BEFORE UPDATE ON public.reportable_datasets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_report_definitions_updated
  BEFORE UPDATE ON public.report_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_report_subscriptions_updated
  BEFORE UPDATE ON public.report_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Attendance RPC ============
CREATE OR REPLACE FUNCTION public.get_attendance_report(
  p_layout TEXT,
  p_rows TEXT,
  p_columns TEXT,
  p_values TEXT[],
  p_filters JSONB
) RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_from DATE := COALESCE((p_filters->>'date_from')::DATE, CURRENT_DATE - 30);
  v_date_to DATE := COALESCE((p_filters->>'date_to')::DATE, CURRENT_DATE);
  v_scope_user UUID := NULLIF(p_filters->>'scope_user_id','')::UUID;
  v_user_ids UUID[];
  v_rec JSONB;
BEGIN
  -- Resolve scoped users (self + subordinates) if provided
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
          a.user_id,
          COALESCE(p.full_name, p.username, 'Unknown') AS team_member,
          a.status,
          a.total_hours AS hours
        FROM public.attendance a
        LEFT JOIN public.profiles p ON p.id = a.user_id
        WHERE a.date BETWEEN v_date_from AND v_date_to
          AND (v_user_ids IS NULL OR a.user_id = ANY(v_user_ids))
        ORDER BY a.date DESC, team_member
        LIMIT 5000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;

  ELSIF p_layout = 'grouped' THEN
    IF p_rows = 'team_member' THEN
      FOR v_rec IN
        SELECT to_jsonb(t) FROM (
          SELECT
            COALESCE(p.full_name, p.username, 'Unknown') AS team_member,
            ROUND(AVG(a.total_hours)::numeric, 2) AS hours,
            COUNT(*) FILTER (WHERE a.status = 'Present') AS present,
            COUNT(*) AS total_days
          FROM public.attendance a
          LEFT JOIN public.profiles p ON p.id = a.user_id
          WHERE a.date BETWEEN v_date_from AND v_date_to
            AND (v_user_ids IS NULL OR a.user_id = ANY(v_user_ids))
          GROUP BY 1
          ORDER BY 1
          LIMIT 2000
        ) t
      LOOP RETURN NEXT v_rec; END LOOP;
    ELSIF p_rows = 'date' THEN
      FOR v_rec IN
        SELECT to_jsonb(t) FROM (
          SELECT
            a.date,
            ROUND(AVG(a.total_hours)::numeric, 2) AS hours,
            COUNT(*) FILTER (WHERE a.status = 'Present') AS present,
            COUNT(*) FILTER (WHERE a.status = 'Absent') AS absent,
            COUNT(*) FILTER (WHERE a.status = 'On leave') AS on_leave,
            COUNT(*) FILTER (WHERE a.status = 'Half day') AS half_day
          FROM public.attendance a
          WHERE a.date BETWEEN v_date_from AND v_date_to
            AND (v_user_ids IS NULL OR a.user_id = ANY(v_user_ids))
          GROUP BY 1
          ORDER BY 1 DESC
        ) t
      LOOP RETURN NEXT v_rec; END LOOP;
    ELSE -- status
      FOR v_rec IN
        SELECT to_jsonb(t) FROM (
          SELECT
            a.status,
            COUNT(*) AS count,
            ROUND(AVG(a.total_hours)::numeric, 2) AS hours
          FROM public.attendance a
          WHERE a.date BETWEEN v_date_from AND v_date_to
            AND (v_user_ids IS NULL OR a.user_id = ANY(v_user_ids))
          GROUP BY 1
          ORDER BY 1
        ) t
      LOOP RETURN NEXT v_rec; END LOOP;
    END IF;

  ELSIF p_layout = 'matrix' THEN
    -- Pivot: rows = team_member, columns = date, value = present count
    FOR v_rec IN
      SELECT jsonb_object_agg(k, v) FROM (
        SELECT 'team_member' AS k, to_jsonb(team_member) AS v FROM (
          SELECT COALESCE(p.full_name, p.username, 'Unknown') AS team_member,
            jsonb_object_agg(a.date::text,
              COUNT(*) FILTER (WHERE a.status = 'Present')
            ) AS by_date
          FROM public.attendance a
          LEFT JOIN public.profiles p ON p.id = a.user_id
          WHERE a.date BETWEEN v_date_from AND v_date_to
            AND (v_user_ids IS NULL OR a.user_id = ANY(v_user_ids))
          GROUP BY 1
        ) x
        UNION ALL
        SELECT 'by_date' AS k, x.by_date AS v FROM (
          SELECT jsonb_object_agg(a.date::text,
            COUNT(*) FILTER (WHERE a.status = 'Present')
          ) AS by_date
          FROM public.attendance a
          WHERE a.date BETWEEN v_date_from AND v_date_to
            AND (v_user_ids IS NULL OR a.user_id = ANY(v_user_ids))
          GROUP BY a.user_id
        ) x
      ) merged
    LOOP RETURN NEXT v_rec; END LOOP;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_attendance_report(TEXT, TEXT, TEXT, TEXT[], JSONB) TO authenticated, service_role;

-- ============ create_report_subscription RPC ============
CREATE OR REPLACE FUNCTION public.create_report_subscription(
  p_definition JSONB,
  p_subscription JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_def_id UUID;
  v_sub_id UUID;
  v_uid UUID := auth.uid();
BEGIN
  IF NOT has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can create report subscriptions';
  END IF;

  INSERT INTO public.report_definitions (name, dataset_key, layout, config, created_by)
  VALUES (
    p_definition->>'name',
    p_definition->>'dataset_key',
    p_definition->>'layout',
    COALESCE(p_definition->'config', '{}'::jsonb),
    v_uid
  )
  RETURNING id INTO v_def_id;

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
  )
  RETURNING id INTO v_sub_id;

  RETURN v_sub_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_report_subscription(JSONB, JSONB) TO authenticated;

-- ============ Seed Attendance dataset ============
INSERT INTO public.reportable_datasets (key, label, description, source, dimensions, measures, supports_matrix, is_active)
VALUES (
  'attendance',
  'Attendance',
  'Daily attendance records with status and hours per team member.',
  'get_attendance_report',
  '[
    {"key":"team_member","label":"Team member"},
    {"key":"status","label":"Status"},
    {"key":"date","label":"Date"}
  ]'::jsonb,
  '[
    {"key":"hours","label":"Hours","agg":"avg"},
    {"key":"present","label":"Days present","agg":"count"}
  ]'::jsonb,
  true,
  true
)
ON CONFLICT (key) DO NOTHING;
