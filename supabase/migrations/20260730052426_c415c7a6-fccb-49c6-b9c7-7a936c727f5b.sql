-- Phase 0: extend gamification tables (additive only)

ALTER TABLE public.gamification_actions
  ADD COLUMN IF NOT EXISTS conditions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS expiry_type text NOT NULL DEFAULT 'fy_end',
  ADD COLUMN IF NOT EXISTS expiry_days integer,
  ADD COLUMN IF NOT EXISTS validity_from date,
  ADD COLUMN IF NOT EXISTS validity_to date,
  ADD COLUMN IF NOT EXISTS cap_scope text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS cap_value integer,
  ADD COLUMN IF NOT EXISTS redemption_min integer,
  ADD COLUMN IF NOT EXISTS award_mode text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS leaderboard boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS eligibility_mode text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS eligibility_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS is_tiered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kpi_id uuid,
  ADD COLUMN IF NOT EXISTS target_period text,
  ADD COLUMN IF NOT EXISTS tier_mode text NOT NULL DEFAULT 'highest',
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS trigger_type text;

ALTER TABLE public.gamification_actions
  DROP CONSTRAINT IF EXISTS gamification_actions_expiry_type_check,
  DROP CONSTRAINT IF EXISTS gamification_actions_cap_scope_check,
  DROP CONSTRAINT IF EXISTS gamification_actions_eligibility_mode_check;

ALTER TABLE public.gamification_actions
  ADD CONSTRAINT gamification_actions_expiry_type_check CHECK (expiry_type IN ('days','never','fy_end')),
  ADD CONSTRAINT gamification_actions_cap_scope_check CHECK (cap_scope IN ('none','user_day','user_month','retailer')),
  ADD CONSTRAINT gamification_actions_eligibility_mode_check CHECK (eligibility_mode IN ('all','manager','territory','users'));

ALTER TABLE public.gamification_points
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS period_key text,
  ADD COLUMN IF NOT EXISTS retailer_id uuid;

ALTER TABLE public.gamification_points
  DROP CONSTRAINT IF EXISTS gamification_points_status_check;
ALTER TABLE public.gamification_points
  ADD CONSTRAINT gamification_points_status_check CHECK (status IN ('active','expired','redeemed'));

CREATE INDEX IF NOT EXISTS idx_gamification_points_user_status ON public.gamification_points (user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_gamification_points_action_period ON public.gamification_points (action_id, period_key);

ALTER TABLE public.gamification_games
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'orders',
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS color text;

ALTER TABLE public.gamification_daily_tracking
  ADD COLUMN IF NOT EXISTS period_key text,
  ADD COLUMN IF NOT EXISTS retailer_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gam_tracking_user_action_period
  ON public.gamification_daily_tracking (user_id, action_id, period_key, coalesce(retailer_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE period_key IS NOT NULL;

-- New: activity tiers
CREATE TABLE IF NOT EXISTS public.activity_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.gamification_actions(id) ON DELETE CASCADE,
  threshold_pct integer NOT NULL,
  points numeric NOT NULL DEFAULT 0,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.activity_tiers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_tiers TO authenticated;
GRANT ALL ON public.activity_tiers TO service_role;

ALTER TABLE public.activity_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view activity tiers" ON public.activity_tiers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage activity tiers" ON public.activity_tiers
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager()) WITH CHECK (public.is_admin_or_manager());

CREATE INDEX IF NOT EXISTS idx_activity_tiers_action ON public.activity_tiers (action_id, sort);

-- New: global settings (single row)
CREATE TABLE IF NOT EXISTS public.gamification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  engine_enabled boolean NOT NULL DEFAULT false,
  currency_name text NOT NULL DEFAULT 'Points',
  point_conversion numeric NOT NULL DEFAULT 1,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  leaderboard_enabled boolean NOT NULL DEFAULT true,
  notifications_enabled boolean NOT NULL DEFAULT true,
  default_award_mode text NOT NULL DEFAULT 'auto',
  approval_fallback text NOT NULL DEFAULT 'manager',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gamification_settings_singleton_true CHECK (singleton)
);

GRANT SELECT ON public.gamification_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.gamification_settings TO authenticated;
GRANT ALL ON public.gamification_settings TO service_role;

ALTER TABLE public.gamification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view gamification settings" ON public.gamification_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage gamification settings" ON public.gamification_settings
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager()) WITH CHECK (public.is_admin_or_manager());

-- products focus flag
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_focused boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_products_is_focused ON public.products (is_focused) WHERE is_focused;

-- updated_at triggers
CREATE TRIGGER trg_activity_tiers_updated_at BEFORE UPDATE ON public.activity_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_gamification_settings_updated_at BEFORE UPDATE ON public.gamification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();