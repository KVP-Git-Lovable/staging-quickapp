
-- =========================================
-- PART A: Seed missing feature flags
-- =========================================
INSERT INTO public.feature_flags (feature_key, feature_name, description, category, is_enabled)
VALUES
  ('counter_sales', 'Counter Sales / POS', 'Enable counter sales / point-of-sale module', 'module', true),
  ('van_sales', 'Van Sales Management', 'Van sales operations and stock management', 'module', true),
  ('event_orders', 'Event Orders', 'Event-based stock tracking and orders', 'module', true),
  ('branding_requests', 'Branding Requests', 'Allow branding material requests', 'module', true),
  ('joint_sales', 'Joint Sales', 'Joint sales sessions with manager', 'module', true),
  ('employee_360', 'Employee 360', 'Employee 360 profile view', 'module', true),
  ('employee_onboarding', 'Employee Onboarding', 'New employee onboarding workflow', 'module', true),
  ('retailer_loyalty', 'Retailer Loyalty', 'Retailer loyalty program', 'module', true),
  ('credit_management', 'Credit Management', 'Credit limit and ledger management', 'module', true),
  ('vendors', 'Vendors', 'Vendor master and management', 'module', true),
  ('holidays', 'Holidays', 'Holiday calendar configuration', 'module', true),
  ('leave_management', 'Leave Management', 'Leave application and approval', 'module', true),
  ('team_approvals', 'Team Approvals', 'Team approval workflows', 'module', true),
  ('expense_approvals', 'Expense Approvals', 'Expense approval workflows', 'module', true),
  ('help_center', 'Help Center', 'In-app help center and articles', 'module', true),
  ('ai_features', 'AI Features', 'AI assistants, recommendations, insights', 'module', true),
  ('customer_portal', 'Customer Portal', 'Retailer-facing customer portal', 'module', true),
  ('distributor_portal', 'Distributor Portal', 'External distributor portal', 'module', true),
  ('whatsapp_ordering', 'WhatsApp Ordering', 'Conversational ordering via WhatsApp', 'module', true),
  ('cart', 'Shopping Cart', 'Cart-based order checkout', 'module', true),
  ('notifications', 'Notifications', 'In-app notifications panel', 'module', true),
  ('performance_dashboard', 'Performance Dashboard', 'Performance metrics dashboard', 'module', true),
  ('status_dashboard', 'Status Dashboard', 'Operational status dashboard', 'module', true),
  ('mass_beat_transfer', 'Mass Beat Transfer', 'Bulk transfer of beats between reps', 'module', true),
  ('pm_projects', 'Project Management', 'Internal projects, tasks, sprints', 'module', true),
  ('feedback_management', 'Feedback Management', 'Feedback policies and surveys', 'module', true),
  ('gps_track_management', 'GPS Tracking Admin', 'Admin view of rep GPS tracks', 'module', true),
  ('attendance_management', 'Attendance Management', 'Admin view of attendance', 'module', true),
  ('admin_expense_management', 'Admin Expense Management', 'Admin view of all expenses', 'module', true),
  ('admin_dashboard', 'Admin Dashboard', 'Top-level admin dashboard', 'module', true),
  ('beat_analytics', 'Beat Analytics', 'Beat analytics and insights', 'module', true),
  ('beat_planning', 'Beat Planning', 'Beat planning workflows', 'module', true),
  ('competency', 'Competency Management', 'Competency tracking module', 'module', true),
  ('team_competency', 'Team Competency', 'Manager view of team competency', 'module', true),
  ('team_targets', 'Team Targets', 'Team target allocation and tracking', 'module', true),
  ('joint_sales_analytics', 'Joint Sales Analytics', 'Analytics on joint sales sessions', 'module', true),
  ('invoice_management', 'Invoice Management', 'Invoice generation and management', 'module', true),
  ('scheme_master', 'Scheme Master', 'Scheme master configuration', 'module', true),
  ('product_management', 'Product Management', 'Product master management', 'module', true),
  ('uom_master', 'UOM Master', 'Unit of measure master', 'module', true),
  ('user_management', 'User Management', 'User roles and management', 'module', true),
  ('security_management', 'Security Management', 'Permissions and security profiles', 'module', true),
  ('credit_note_create', 'Credit Notes', 'Create credit notes for returns', 'module', true),
  ('pending_payments', 'Pending Payments', 'View pending payments', 'module', true),
  ('my_deliveries_module', 'My Deliveries', 'Delivery agent assignments view', 'module', true),
  ('my_operations', 'My Operations', 'Personal operations workspace', 'module', true),
  ('my_retailers', 'My Retailers', 'Personal retailers list', 'module', true),
  ('today_summary', 'Today Summary', 'Daily summary view', 'module', true),
  ('usage_report', 'Usage Report', 'App usage analytics', 'module', true),

  ('visit_check_in_mandatory', 'Visit Check-In Mandatory', 'Require check-in before any visit action', 'process', false),
  ('visit_photo_mandatory', 'Visit Photo Mandatory', 'Require a photo during visit', 'process', false),
  ('visit_remarks_mandatory', 'Visit Remarks Mandatory', 'Require remarks before closing a visit', 'process', false),
  ('visit_no_order_reason_required', 'No-Order Reason Required', 'Require reason when a visit ends without an order', 'process', true),
  ('attendance_face_match', 'Attendance Face Match', 'Verify face match during check-in', 'process', false),
  ('attendance_geo_fence', 'Attendance Geo-fence', 'Restrict check-in to allowed locations', 'process', false),
  ('attendance_auto_end_day', 'Auto End Day', 'Automatically end day after inactivity', 'process', true),
  ('attendance_regularization_enabled', 'Attendance Regularization', 'Allow attendance regularization requests', 'process', true),
  ('order_payment_proof_mandatory', 'Payment Proof Mandatory', 'Require payment proof on order/collection', 'process', false),
  ('order_credit_limit_enforced', 'Credit Limit Enforcement', 'Block orders that exceed retailer credit limit', 'process', true),
  ('order_edit_window_enabled', 'Order Edit Window', 'Allow editing of orders within configured window', 'process', true),
  ('order_cancel_requires_reason', 'Order Cancel Reason Required', 'Require reason when cancelling an order', 'process', true),
  ('retailer_verification_required', 'Retailer Verification', 'Require verification for new retailers', 'process', false),
  ('retailer_gps_required', 'Retailer GPS Required', 'Require valid GPS coordinates on retailer creation', 'process', true),
  ('retailer_photo_required', 'Retailer Photo Required', 'Require store photo on retailer creation', 'process', false),
  ('feedback_before_checkout', 'Feedback Before Checkout', 'Show feedback survey before checkout', 'process', false),
  ('feedback_before_order_submit', 'Feedback Before Order', 'Show feedback survey before order submission', 'process', false),
  ('gps_always_on', 'GPS Always On', 'Require GPS to be on throughout the day', 'process', true),
  ('gps_distance_validation', 'GPS Distance Validation', 'Validate distance between rep and retailer', 'process', true),
  ('offline_mode_required', 'Offline Mode Required', 'Require app to function offline-first', 'process', true)
ON CONFLICT (feature_key) DO NOTHING;

-- =========================================
-- PART B: New scoping tables
-- =========================================
CREATE TABLE IF NOT EXISTS public.role_feature_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.security_profiles(id) ON DELETE CASCADE,
  feature_id uuid NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  is_enabled boolean,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, feature_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_feature_config TO authenticated;
GRANT ALL ON public.role_feature_config TO service_role;

ALTER TABLE public.role_feature_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rfc_super_admin_all" ON public.role_feature_config
  FOR ALL TO authenticated
  USING (public.is_system_admin(auth.uid()))
  WITH CHECK (public.is_system_admin(auth.uid()));

CREATE POLICY "rfc_read_authenticated" ON public.role_feature_config
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.user_feature_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature_id uuid NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  is_enabled boolean,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, feature_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_feature_config TO authenticated;
GRANT ALL ON public.user_feature_config TO service_role;

ALTER TABLE public.user_feature_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ufc_super_admin_all" ON public.user_feature_config
  FOR ALL TO authenticated
  USING (public.is_system_admin(auth.uid()))
  WITH CHECK (public.is_system_admin(auth.uid()));

CREATE POLICY "ufc_self_read" ON public.user_feature_config
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_rfc_touch ON public.role_feature_config;
CREATE TRIGGER trg_rfc_touch BEFORE UPDATE ON public.role_feature_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_ufc_touch ON public.user_feature_config;
CREATE TRIGGER trg_ufc_touch BEFORE UPDATE ON public.user_feature_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================
-- PART C: Audit log scope columns
-- =========================================
ALTER TABLE public.feature_flag_audit
  ADD COLUMN IF NOT EXISTS scope_type text,
  ADD COLUMN IF NOT EXISTS scope_id uuid;

-- =========================================
-- PART D: Updated effective-features RPC
-- =========================================
DROP FUNCTION IF EXISTS public.get_effective_features(uuid);
DROP FUNCTION IF EXISTS public.get_effective_features(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_effective_features(
  p_company_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  feature_id uuid,
  feature_key text,
  feature_name text,
  description text,
  category text,
  enabled boolean,
  global_enabled boolean,
  company_override boolean,
  role_override boolean,
  user_override boolean,
  source text,
  blocked_by text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := COALESCE(p_user_id, auth.uid());
  v_role uuid;
BEGIN
  SELECT du.profile_id INTO v_role
  FROM public.distributor_users du
  WHERE du.id = v_user
  LIMIT 1;

  IF v_role IS NULL THEN
    SELECT pop.profile_id INTO v_role
    FROM public.profile_object_permissions pop
    WHERE pop.profile_id IN (SELECT id FROM public.security_profiles)
    LIMIT 0;
  END IF;

  RETURN QUERY
  WITH role_override AS (
    SELECT rfc.feature_id, rfc.is_enabled
    FROM public.role_feature_config rfc
    WHERE v_role IS NOT NULL AND rfc.role_id = v_role
  ),
  base AS (
    SELECT
      ff.id AS feature_id,
      ff.feature_key,
      ff.feature_name,
      ff.description,
      ff.category,
      ff.is_enabled AS global_enabled,
      cfc.is_enabled AS company_override,
      ro.is_enabled AS role_override,
      ufc.is_enabled AS user_override
    FROM public.feature_flags ff
    LEFT JOIN public.company_feature_config cfc
      ON cfc.feature_id = ff.id AND cfc.company_id = p_company_id
    LEFT JOIN role_override ro ON ro.feature_id = ff.id
    LEFT JOIN public.user_feature_config ufc
      ON ufc.feature_id = ff.id AND ufc.user_id = v_user
  ),
  resolved AS (
    SELECT b.*,
      CASE
        WHEN b.global_enabled = false THEN false
        WHEN b.user_override IS NOT NULL THEN b.user_override
        WHEN b.role_override IS NOT NULL THEN b.role_override
        WHEN b.company_override IS NOT NULL THEN b.company_override
        ELSE b.global_enabled
      END AS resolved_enabled,
      CASE
        WHEN b.global_enabled = false THEN 'global'
        WHEN b.user_override IS NOT NULL THEN 'user'
        WHEN b.role_override IS NOT NULL THEN 'role'
        WHEN b.company_override IS NOT NULL THEN 'company'
        ELSE 'default'
      END AS resolved_source
    FROM base b
  ),
  with_deps AS (
    SELECT r.feature_id, r.feature_key, r.feature_name, r.description, r.category,
           r.global_enabled, r.company_override, r.role_override, r.user_override,
           r.resolved_enabled, r.resolved_source,
      COALESCE(
        ARRAY_AGG(dep_ff.feature_key) FILTER (
          WHERE fd.dependency_type = 'hard'
            AND dep_resolved.resolved_enabled = false
        ),
        ARRAY[]::text[]
      ) AS blocked_by
    FROM resolved r
    LEFT JOIN public.feature_dependencies fd ON fd.feature_id = r.feature_id
    LEFT JOIN public.feature_flags dep_ff ON dep_ff.id = fd.depends_on_feature_id
    LEFT JOIN resolved dep_resolved ON dep_resolved.feature_id = fd.depends_on_feature_id
    GROUP BY r.feature_id, r.feature_key, r.feature_name, r.description, r.category,
             r.global_enabled, r.company_override, r.role_override, r.user_override,
             r.resolved_enabled, r.resolved_source
  )
  SELECT
    w.feature_id,
    w.feature_key,
    w.feature_name,
    w.description,
    w.category,
    (w.resolved_enabled AND COALESCE(array_length(w.blocked_by, 1), 0) = 0) AS enabled,
    w.global_enabled,
    w.company_override,
    w.role_override,
    w.user_override,
    w.resolved_source AS source,
    w.blocked_by
  FROM with_deps w
  ORDER BY w.category, w.feature_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_features(uuid, uuid) TO authenticated;

-- =========================================
-- PART E: Role / User toggle RPCs
-- =========================================
CREATE OR REPLACE FUNCTION public.set_role_feature(
  p_role_id uuid,
  p_feature_key text,
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feature_id uuid;
BEGIN
  SELECT id INTO v_feature_id FROM public.feature_flags WHERE feature_key = p_feature_key;
  IF v_feature_id IS NULL THEN RAISE EXCEPTION 'Unknown feature %', p_feature_key; END IF;

  INSERT INTO public.role_feature_config (role_id, feature_id, is_enabled, updated_by)
  VALUES (p_role_id, v_feature_id, p_enabled, auth.uid())
  ON CONFLICT (role_id, feature_id) DO UPDATE
    SET is_enabled = EXCLUDED.is_enabled,
        updated_by = auth.uid(),
        updated_at = now();

  INSERT INTO public.feature_flag_audit (feature_id, action, changed_by, scope_type, scope_id)
  VALUES (v_feature_id,
          CASE WHEN p_enabled IS NULL THEN 'role_inherit' WHEN p_enabled THEN 'role_enable' ELSE 'role_disable' END,
          auth.uid(), 'role', p_role_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_role_feature(uuid, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_user_feature(
  p_user_id uuid,
  p_feature_key text,
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feature_id uuid;
BEGIN
  SELECT id INTO v_feature_id FROM public.feature_flags WHERE feature_key = p_feature_key;
  IF v_feature_id IS NULL THEN RAISE EXCEPTION 'Unknown feature %', p_feature_key; END IF;

  INSERT INTO public.user_feature_config (user_id, feature_id, is_enabled, updated_by)
  VALUES (p_user_id, v_feature_id, p_enabled, auth.uid())
  ON CONFLICT (user_id, feature_id) DO UPDATE
    SET is_enabled = EXCLUDED.is_enabled,
        updated_by = auth.uid(),
        updated_at = now();

  INSERT INTO public.feature_flag_audit (feature_id, action, changed_by, scope_type, scope_id)
  VALUES (v_feature_id,
          CASE WHEN p_enabled IS NULL THEN 'user_inherit' WHEN p_enabled THEN 'user_enable' ELSE 'user_disable' END,
          auth.uid(), 'user', p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_feature(uuid, text, boolean) TO authenticated;
