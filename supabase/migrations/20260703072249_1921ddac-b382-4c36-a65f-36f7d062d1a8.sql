
-- 1. operations_config
CREATE TABLE public.operations_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  backdate_enabled boolean NOT NULL DEFAULT false,
  backdate_mode text NOT NULL DEFAULT 'direct' CHECK (backdate_mode IN ('direct','approval')),
  backdate_max_days integer NOT NULL DEFAULT 7,
  backdate_require_reason boolean NOT NULL DEFAULT true,
  on_behalf_enabled boolean NOT NULL DEFAULT false,
  oob_enabled boolean NOT NULL DEFAULT false,
  oob_visibility text NOT NULL DEFAULT 'assigned' CHECK (oob_visibility IN ('beat','assigned','territory','all')),
  oob_require_reason boolean NOT NULL DEFAULT true,
  oob_require_gps boolean NOT NULL DEFAULT true,
  oob_notify_manager boolean NOT NULL DEFAULT true,
  oob_allow_offline boolean NOT NULL DEFAULT false,
  oob_credit_rule text NOT NULL DEFAULT 'collector' CHECK (oob_credit_rule IN ('collector','owner')),
  edit_enabled boolean NOT NULL DEFAULT false,
  edit_lock_point text NOT NULL DEFAULT 'invoiced' CHECK (edit_lock_point IN ('invoiced','dispatched','same_day','hours')),
  edit_lock_hours integer NOT NULL DEFAULT 24,
  edit_who text NOT NULL DEFAULT 'own' CHECK (edit_who IN ('own','own_team','view_all')),
  edit_require_reason boolean NOT NULL DEFAULT true,
  edit_require_approval boolean NOT NULL DEFAULT false,
  edit_approval_threshold numeric NOT NULL DEFAULT 0,
  edit_lock_price boolean NOT NULL DEFAULT false,
  edit_max_edits integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operations_config TO authenticated;
GRANT ALL ON public.operations_config TO service_role;

ALTER TABLE public.operations_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY operations_config_read ON public.operations_config
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY operations_config_write ON public.operations_config
  FOR ALL
  USING (public.user_has_permission(auth.uid(),'operations_config','can_edit'))
  WITH CHECK (public.user_has_permission(auth.uid(),'operations_config','can_edit'));

INSERT INTO public.operations_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 2. orders new columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS placed_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS is_backdated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS backdate_reason text,
  ADD COLUMN IF NOT EXISTS is_out_of_beat boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS out_of_beat_reason text,
  ADD COLUMN IF NOT EXISTS is_planned_beat boolean;

-- 3. order_backdate_date_grants
CREATE TABLE public.order_backdate_date_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_date date NOT NULL,
  reason text,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, order_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_backdate_date_grants TO authenticated;
GRANT ALL ON public.order_backdate_date_grants TO service_role;

ALTER TABLE public.order_backdate_date_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_backdate_date_grants_read ON public.order_backdate_date_grants
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.user_has_permission(auth.uid(),'order_backdate','can_create')
    OR public.user_has_permission(auth.uid(),'operations_config','can_edit')
  );

CREATE POLICY order_backdate_date_grants_write ON public.order_backdate_date_grants
  FOR ALL
  USING (
    public.user_has_permission(auth.uid(),'order_backdate','can_create')
    OR public.user_has_permission(auth.uid(),'operations_config','can_edit')
  )
  WITH CHECK (
    public.user_has_permission(auth.uid(),'order_backdate','can_create')
    OR public.user_has_permission(auth.uid(),'operations_config','can_edit')
  );
