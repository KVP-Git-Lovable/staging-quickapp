
-- ============ reportable_datasets (was missing) ============
CREATE TABLE IF NOT EXISTS public.reportable_datasets (
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

DROP POLICY IF EXISTS "Anyone signed in can read active datasets" ON public.reportable_datasets;
CREATE POLICY "Anyone signed in can read active datasets"
  ON public.reportable_datasets FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins or managers can manage datasets" ON public.reportable_datasets;
CREATE POLICY "Admins or managers can manage datasets"
  ON public.reportable_datasets FOR ALL
  TO authenticated
  USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());

DROP TRIGGER IF EXISTS trg_reportable_datasets_updated ON public.reportable_datasets;
CREATE TRIGGER trg_reportable_datasets_updated
  BEFORE UPDATE ON public.reportable_datasets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill FK if it wasn't installed with report_definitions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_definitions_dataset_key_fkey'
  ) THEN
    ALTER TABLE public.report_definitions
      ADD CONSTRAINT report_definitions_dataset_key_fkey
      FOREIGN KEY (dataset_key) REFERENCES public.reportable_datasets(key) ON DELETE RESTRICT;
  END IF;
END $$;

-- ============ Seed datasets ============
INSERT INTO public.reportable_datasets (key, label, description, source, dimensions, measures, supports_matrix, is_active) VALUES
('attendance',
 'Attendance',
 'Daily attendance records with status and hours per team member.',
 'get_attendance_report',
 '[{"key":"team_member","label":"Team member"},{"key":"status","label":"Status"},{"key":"date","label":"Date"}]'::jsonb,
 '[{"key":"hours","label":"Hours","agg":"avg"},{"key":"present","label":"Days present","agg":"count"}]'::jsonb,
 true, true),
('sales',
 'Sales quantity',
 'Sold quantity per product / distributor / rep across a date range.',
 'get_sales_report',
 '[{"key":"team_member","label":"Team member"},{"key":"distributor","label":"Distributor"},{"key":"product","label":"Product"},{"key":"date","label":"Date"}]'::jsonb,
 '[{"key":"qty","label":"Quantity","agg":"sum"},{"key":"amount","label":"Amount","agg":"sum"},{"key":"orders","label":"Orders","agg":"count"}]'::jsonb,
 true, true),
('visits',
 'Visits',
 'Retailer visits with check-in / check-out state per team member.',
 'get_visits_report',
 '[{"key":"team_member","label":"Team member"},{"key":"status","label":"Status"},{"key":"date","label":"Date"}]'::jsonb,
 '[{"key":"visits","label":"Visits","agg":"count"},{"key":"completed","label":"Completed","agg":"count"}]'::jsonb,
 true, true),
('orders',
 'Orders',
 'Orders placed with amount and status per team member / distributor.',
 'get_orders_report',
 '[{"key":"team_member","label":"Team member"},{"key":"distributor","label":"Distributor"},{"key":"status","label":"Status"},{"key":"date","label":"Date"}]'::jsonb,
 '[{"key":"orders","label":"Orders","agg":"count"},{"key":"amount","label":"Amount","agg":"sum"}]'::jsonb,
 true, true)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  source = EXCLUDED.source,
  dimensions = EXCLUDED.dimensions,
  measures = EXCLUDED.measures,
  supports_matrix = EXCLUDED.supports_matrix,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- ============ get_visits_report ============
CREATE OR REPLACE FUNCTION public.get_visits_report(
  p_layout text,
  p_rows text,
  p_columns text,
  p_values text[],
  p_filters jsonb
) RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
          v.planned_date AS date,
          COALESCE(p.full_name, p.username, 'Unknown') AS team_member,
          v.status,
          v.retailer_id,
          v.visit_type
        FROM public.visits v
        LEFT JOIN public.profiles p ON p.id = v.user_id
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
          COALESCE(p.full_name, p.username, 'Unknown') AS team_member,
          COUNT(*) AS visits,
          COUNT(*) FILTER (WHERE v.status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE v.status = 'cancelled') AS cancelled,
          COUNT(*) FILTER (WHERE v.status = 'planned')   AS planned
        FROM public.visits v
        LEFT JOIN public.profiles p ON p.id = v.user_id
        WHERE v.planned_date BETWEEN v_date_from AND v_date_to
          AND (v_user_ids IS NULL OR v.user_id = ANY(v_user_ids))
        GROUP BY COALESCE(p.full_name, p.username, 'Unknown')
        ORDER BY visits DESC
        LIMIT 2000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_visits_report(text, text, text, text[], jsonb) TO authenticated, service_role;

-- ============ get_orders_report ============
CREATE OR REPLACE FUNCTION public.get_orders_report(
  p_layout text,
  p_rows text,
  p_columns text,
  p_values text[],
  p_filters jsonb
) RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
          o.order_date::date AS date,
          COALESCE(p.full_name, p.username, 'Unknown') AS team_member,
          o.distributor_name AS distributor,
          o.retailer_name AS retailer,
          o.status,
          o.total_amount AS amount,
          o.invoice_number
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
          COALESCE(p.full_name, p.username, 'Unknown') AS team_member,
          COUNT(*) AS orders,
          COALESCE(SUM(o.total_amount), 0) AS amount,
          COUNT(*) FILTER (WHERE o.status = 'delivered') AS delivered,
          COUNT(*) FILTER (WHERE o.status = 'cancelled') AS cancelled
        FROM public.orders o
        LEFT JOIN public.profiles p ON p.id = o.user_id
        WHERE o.order_date::date BETWEEN v_date_from AND v_date_to
          AND (v_user_ids IS NULL OR o.user_id = ANY(v_user_ids))
        GROUP BY COALESCE(p.full_name, p.username, 'Unknown')
        ORDER BY orders DESC
        LIMIT 2000
      ) t
    LOOP RETURN NEXT v_rec; END LOOP;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_orders_report(text, text, text, text[], jsonb) TO authenticated, service_role;

-- ============ get_sales_report (wrapper w/ standard signature) ============
CREATE OR REPLACE FUNCTION public.get_sales_report(
  p_layout text,
  p_rows text,
  p_columns text,
  p_values text[],
  p_filters jsonb
) RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  FOR v_rec IN
    SELECT to_jsonb(t) FROM (
      SELECT
        COALESCE(p.full_name, p.username, 'Unknown') AS team_member,
        o.distributor_name AS distributor,
        pr.name AS product,
        SUM(oi.quantity)::numeric AS qty,
        SUM(oi.quantity * oi.rate)::numeric AS amount,
        COUNT(DISTINCT o.id) AS orders
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      LEFT JOIN public.profiles p ON p.id = o.user_id
      LEFT JOIN public.products pr ON pr.id = oi.product_id
      WHERE o.order_date::date BETWEEN v_date_from AND v_date_to
        AND o.status <> 'cancelled'
        AND (v_user_ids IS NULL OR o.user_id = ANY(v_user_ids))
      GROUP BY COALESCE(p.full_name, p.username, 'Unknown'), o.distributor_name, pr.name
      ORDER BY amount DESC NULLS LAST
      LIMIT 5000
    ) t
  LOOP RETURN NEXT v_rec; END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_report(text, text, text, text[], jsonb) TO authenticated, service_role;
