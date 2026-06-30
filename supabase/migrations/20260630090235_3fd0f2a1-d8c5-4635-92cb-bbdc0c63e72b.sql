
-- =====================================================================
-- Migration: create_qa_tables
-- Creates isolated QA sandbox tables (qa_*) mirroring Tier 1 production
-- tables, plus QA control tables. All additive; no production tables
-- touched.
-- =====================================================================

-- ---------- Tier 1 mirrors (LIKE INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ----------
-- Note: LIKE copies columns, defaults, NOT NULLs, and CHECK constraints.
-- It does NOT copy foreign keys, indexes, or triggers — by design for QA isolation.

CREATE TABLE IF NOT EXISTS public.qa_retailers           (LIKE public.retailers           INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS public.qa_orders              (LIKE public.orders              INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS public.qa_order_items         (LIKE public.order_items         INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS public.qa_visits              (LIKE public.visits              INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS public.qa_retailer_visit_logs (LIKE public.retailer_visit_logs INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS public.qa_attendance          (LIKE public.attendance          INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS public.qa_inst_leads          (LIKE public.inst_leads          INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS public.qa_products            (LIKE public.products            INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS public.qa_gps_tracking        (LIKE public.gps_tracking        INCLUDING DEFAULTS INCLUDING CONSTRAINTS);

ALTER TABLE public.qa_retailers           ADD COLUMN IF NOT EXISTS qa_run_id uuid;
ALTER TABLE public.qa_orders              ADD COLUMN IF NOT EXISTS qa_run_id uuid;
ALTER TABLE public.qa_order_items         ADD COLUMN IF NOT EXISTS qa_run_id uuid;
ALTER TABLE public.qa_visits              ADD COLUMN IF NOT EXISTS qa_run_id uuid;
ALTER TABLE public.qa_retailer_visit_logs ADD COLUMN IF NOT EXISTS qa_run_id uuid;
ALTER TABLE public.qa_attendance          ADD COLUMN IF NOT EXISTS qa_run_id uuid;
ALTER TABLE public.qa_inst_leads          ADD COLUMN IF NOT EXISTS qa_run_id uuid;
ALTER TABLE public.qa_products            ADD COLUMN IF NOT EXISTS qa_run_id uuid;
ALTER TABLE public.qa_gps_tracking        ADD COLUMN IF NOT EXISTS qa_run_id uuid;

-- ---------- QA control tables ----------
CREATE TABLE IF NOT EXISTS public.qa_test_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  apk_version     text,
  build_type      text DEFAULT 'qa',
  device_name     text,
  android_version text,
  tester_id       uuid,
  tester_email    text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  overall_status  text DEFAULT 'running',
  total_tests     integer DEFAULT 0,
  passed_tests    integer DEFAULT 0,
  failed_tests    integer DEFAULT 0,
  notes           text
);

CREATE TABLE IF NOT EXISTS public.qa_test_logs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id        uuid NOT NULL,
  test_name          text NOT NULL,
  module_name        text,
  step_name          text,
  status             text NOT NULL DEFAULT 'running',
  started_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  error_message      text,
  assertion_details  jsonb,
  records_created    jsonb,
  records_deleted    jsonb,
  metadata_json      jsonb
);

CREATE TABLE IF NOT EXISTS public.qa_sync_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_run_id      uuid,
  entity_type    text NOT NULL,
  entity_id      uuid,
  action         text NOT NULL,
  status         text NOT NULL DEFAULT 'pending',
  payload        jsonb,
  error_message  text,
  attempt_count  integer DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  synced_at      timestamptz
);

-- ---------- GRANTS ----------
-- Pattern observed on production tables (orders/retailers/attendance):
--   authenticated: SELECT, INSERT, UPDATE, DELETE
--   service_role:  ALL
-- QA tables intentionally exclude anon (authenticated session required).
DO $$
DECLARE
  t text;
  qa_tables text[] := ARRAY[
    'qa_retailers','qa_orders','qa_order_items','qa_visits',
    'qa_retailer_visit_logs','qa_attendance','qa_inst_leads',
    'qa_products','qa_gps_tracking',
    'qa_test_runs','qa_test_logs','qa_sync_audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY qa_tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'qa_' || t || '_auth', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      'qa_' || t || '_auth', t
    );
  END LOOP;
END $$;

-- =====================================================================
-- Migration: create_qa_cleanup_rpc
-- =====================================================================

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
  -- Delete children first to respect potential FK semantics if added later.
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

  UPDATE public.qa_test_runs
     SET overall_status = 'cleaned', completed_at = now()
   WHERE run_id = p_run_id;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_all_qa_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin gate using the project's existing has_role(uuid, app_role) function
  -- and the 'admin' value in the app_role enum (both verified in this project).
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
    public.qa_test_runs
  RESTART IDENTITY CASCADE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_qa_run(uuid)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_all_qa_data()   TO authenticated, service_role;
