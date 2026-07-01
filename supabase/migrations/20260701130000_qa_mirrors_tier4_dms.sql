-- =====================================================================
-- Migration: qa_mirrors_tier4_dms
-- Adds qa_* mirrors for the DMS (Distributor Management System) admin
-- module — distributor master data, contacts, attachments, evaluation
-- tasks, business plans, portal users, price books, and payment
-- config. All additive; no production tables touched.
-- =====================================================================

DO $$
DECLARE
  t  text;
  qt text;
  tables text[] := ARRAY[
    'distributors','distributor_contacts','distributor_attachments','distributor_evaluation_tasks',
    'distributor_business_plans','distributor_business_plan_products','distributor_business_plan_retailers',
    'distributor_business_plan_months','distributor_business_plan_month_products','distributor_users',
    'distributor_price_books','distributor_payment_config'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    qt := 'qa_' || t;

    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (LIKE public.%I INCLUDING DEFAULTS INCLUDING CONSTRAINTS)', qt, t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS qa_run_id uuid', qt);

    -- LIKE ... INCLUDING CONSTRAINTS only carries over CHECK constraints in
    -- Postgres (PK/UNIQUE need INCLUDING INDEXES), so add the PK explicitly.
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint co
      JOIN pg_class c ON c.oid = co.conrelid
      WHERE c.relname = qt AND co.contype = 'p'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD PRIMARY KEY (id)', qt);
    END IF;

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', qt);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', qt);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', qt);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', qt || '_all_authenticated', qt);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      qt || '_all_authenticated', qt
    );
  END LOOP;
END $$;

-- ---------- Extend cleanup_qa_run() to purge Tier 4 rows too ----------
CREATE OR REPLACE FUNCTION public.cleanup_qa_run(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  n integer;
BEGIN
  -- Tier 1
  DELETE FROM public.qa_order_items         WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_order_items', n);
  DELETE FROM public.qa_orders              WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_orders', n);
  DELETE FROM public.qa_retailer_visit_logs WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_retailer_visit_logs', n);
  DELETE FROM public.qa_visits              WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_visits', n);
  DELETE FROM public.qa_gps_tracking        WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_gps_tracking', n);
  DELETE FROM public.qa_attendance          WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_attendance', n);
  DELETE FROM public.qa_inst_leads          WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_inst_leads', n);
  DELETE FROM public.qa_retailers           WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_retailers', n);
  DELETE FROM public.qa_products            WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_products', n);
  DELETE FROM public.qa_sync_audit_log      WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_sync_audit_log', n);

  -- Tier 3
  DELETE FROM public.qa_activity_events              WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_activity_events', n);
  DELETE FROM public.qa_activity_attachments          WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_activity_attachments', n);
  DELETE FROM public.qa_joint_sales_sessions          WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_joint_sales_sessions', n);
  DELETE FROM public.qa_joint_sales_feedback          WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_joint_sales_feedback', n);
  DELETE FROM public.qa_gps_tracking_stops            WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_gps_tracking_stops', n);
  DELETE FROM public.qa_beat_allowances               WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_beat_allowances', n);
  DELETE FROM public.qa_beat_audit_log                WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_beat_audit_log', n);
  DELETE FROM public.qa_leave_applications            WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_leave_applications', n);
  DELETE FROM public.qa_leave_balance                 WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_leave_balance', n);
  DELETE FROM public.qa_regularization_requests       WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_regularization_requests', n);
  DELETE FROM public.qa_petty_cash_transactions       WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_petty_cash_transactions', n);
  DELETE FROM public.qa_ai_feature_feedback           WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_ai_feature_feedback', n);
  DELETE FROM public.qa_retailer_verification_audit   WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_retailer_verification_audit', n);
  DELETE FROM public.qa_distributor_payments          WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_distributor_payments', n);
  DELETE FROM public.qa_stock                         WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_stock', n);
  DELETE FROM public.qa_stock_cycle_data              WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_stock_cycle_data', n);
  DELETE FROM public.qa_social_posts                  WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_social_posts', n);
  DELETE FROM public.qa_social_comments               WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_social_comments', n);
  DELETE FROM public.qa_social_likes                  WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_social_likes', n);
  DELETE FROM public.qa_social_reactions              WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_social_reactions', n);
  DELETE FROM public.qa_social_post_attachments       WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_social_post_attachments', n);
  DELETE FROM public.qa_employee_connections          WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_employee_connections', n);
  DELETE FROM public.qa_employee_recommendations      WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_employee_recommendations', n);
  DELETE FROM public.qa_education_history             WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_education_history', n);
  DELETE FROM public.qa_emergency_contacts            WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_emergency_contacts', n);
  DELETE FROM public.qa_work_experiences              WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_work_experiences', n);
  DELETE FROM public.qa_user_onboarding_progress      WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_user_onboarding_progress', n);
  DELETE FROM public.qa_user_page_views               WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_user_page_views', n);
  DELETE FROM public.qa_user_data_usage               WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_user_data_usage', n);
  DELETE FROM public.qa_support_requests              WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_support_requests', n);

  -- Tier 4 (this migration)
  DELETE FROM public.qa_distributors                              WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_distributors', n);
  DELETE FROM public.qa_distributor_contacts                      WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_distributor_contacts', n);
  DELETE FROM public.qa_distributor_attachments                   WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_distributor_attachments', n);
  DELETE FROM public.qa_distributor_evaluation_tasks              WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_distributor_evaluation_tasks', n);
  DELETE FROM public.qa_distributor_business_plans                WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_distributor_business_plans', n);
  DELETE FROM public.qa_distributor_business_plan_products        WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_distributor_business_plan_products', n);
  DELETE FROM public.qa_distributor_business_plan_retailers       WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_distributor_business_plan_retailers', n);
  DELETE FROM public.qa_distributor_business_plan_months          WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_distributor_business_plan_months', n);
  DELETE FROM public.qa_distributor_business_plan_month_products  WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_distributor_business_plan_month_products', n);
  DELETE FROM public.qa_distributor_users                         WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_distributor_users', n);
  DELETE FROM public.qa_distributor_price_books                   WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_distributor_price_books', n);
  DELETE FROM public.qa_distributor_payment_config                WHERE qa_run_id = p_run_id; GET DIAGNOSTICS n = ROW_COUNT; result := result || jsonb_build_object('qa_distributor_payment_config', n);

  UPDATE public.qa_test_runs
     SET overall_status = 'cleaned', completed_at = now()
   WHERE run_id = p_run_id;

  RETURN result;
END;
$$;

-- ---------- Extend reset_all_qa_data() to truncate Tier 4 tables too ----------
CREATE OR REPLACE FUNCTION public.reset_all_qa_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'reset_all_qa_data requires admin role';
  END IF;

  TRUNCATE TABLE
    public.qa_order_items,
    public.qa_orders,
    public.qa_retailer_visit_logs,
    public.qa_visits,
    public.qa_gps_tracking,
    public.qa_attendance,
    public.qa_inst_leads,
    public.qa_retailers,
    public.qa_products,
    public.qa_sync_audit_log,
    public.qa_test_logs,
    public.qa_test_runs,
    public.qa_activity_events,
    public.qa_activity_attachments,
    public.qa_joint_sales_sessions,
    public.qa_joint_sales_feedback,
    public.qa_gps_tracking_stops,
    public.qa_beat_allowances,
    public.qa_beat_audit_log,
    public.qa_leave_applications,
    public.qa_leave_balance,
    public.qa_regularization_requests,
    public.qa_petty_cash_transactions,
    public.qa_ai_feature_feedback,
    public.qa_retailer_verification_audit,
    public.qa_distributor_payments,
    public.qa_stock,
    public.qa_stock_cycle_data,
    public.qa_social_posts,
    public.qa_social_comments,
    public.qa_social_likes,
    public.qa_social_reactions,
    public.qa_social_post_attachments,
    public.qa_employee_connections,
    public.qa_employee_recommendations,
    public.qa_education_history,
    public.qa_emergency_contacts,
    public.qa_work_experiences,
    public.qa_user_onboarding_progress,
    public.qa_user_page_views,
    public.qa_user_data_usage,
    public.qa_support_requests,
    public.qa_distributors,
    public.qa_distributor_contacts,
    public.qa_distributor_attachments,
    public.qa_distributor_evaluation_tasks,
    public.qa_distributor_business_plans,
    public.qa_distributor_business_plan_products,
    public.qa_distributor_business_plan_retailers,
    public.qa_distributor_business_plan_months,
    public.qa_distributor_business_plan_month_products,
    public.qa_distributor_users,
    public.qa_distributor_price_books,
    public.qa_distributor_payment_config
  RESTART IDENTITY CASCADE;
END;
$$;
