CREATE TABLE IF NOT EXISTS public.gamification_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  territories text[] DEFAULT '{}',
  is_all_territories boolean DEFAULT false,
  baseline_target numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  category text NOT NULL DEFAULT 'orders',
  icon text,
  color text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.gamification_games TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gamification_games TO authenticated;
GRANT ALL ON public.gamification_games TO service_role;

ALTER TABLE public.gamification_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read gamification_games" ON public.gamification_games;
CREATE POLICY "Authenticated can read gamification_games" ON public.gamification_games
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage gamification_games" ON public.gamification_games;
CREATE POLICY "Admins manage gamification_games" ON public.gamification_games
  FOR ALL TO authenticated USING (public.is_admin_or_manager()) WITH CHECK (public.is_admin_or_manager());

DROP TRIGGER IF EXISTS trg_gamification_games_updated_at ON public.gamification_games;
CREATE TRIGGER trg_gamification_games_updated_at BEFORE UPDATE ON public.gamification_games
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.gamification_games (id, name, description, category, color, icon, start_date, end_date, is_active, is_all_territories)
VALUES
  ('9f4eb582-768c-4b13-9c3f-21362c7aeb1b','Order momentum','Rewards reps for placing and repeating quality orders.','orders','blue','shopping-cart', date_trunc('year', now())::date, (date_trunc('year', now()) + interval '1 year - 1 day')::date, true, true),
  ('de8a1da6-afba-423d-a983-5d80e7326840','Visit rewards','Rewards consistent, productive field visits.','visits','teal','map-pin', date_trunc('year', now())::date, (date_trunc('year', now()) + interval '1 year - 1 day')::date, true, true),
  ('e9011ef5-8963-4b5e-92f5-58bee3ace420','Retailer growth','Rewards adding and activating new retailers.','retailers','green','store', date_trunc('year', now())::date, (date_trunc('year', now()) + interval '1 year - 1 day')::date, true, true),
  ('d2345aad-5602-4aac-8d73-8e04785e8212','Attendance & discipline','Rewards on-time check-ins and streaks.','attendance','amber','user-check', date_trunc('year', now())::date, (date_trunc('year', now()) + interval '1 year - 1 day')::date, true, true),
  ('13d7c60b-340e-491e-8ca1-e06af61f8115','Focus products','Rewards selling products flagged as focused.','products','purple','package', date_trunc('year', now())::date, (date_trunc('year', now()) + interval '1 year - 1 day')::date, true, true),
  ('7617ff34-a09e-4170-8216-e4f049a6314c','Beat performance','Rewards growth and coverage within a beat.','beats','coral','route', date_trunc('year', now())::date, (date_trunc('year', now()) + interval '1 year - 1 day')::date, true, true),
  ('d53035c7-f15f-47b5-8ad5-de3decc047cc','Target rewards','Rewards a share of the rep''s own target achievement.','targets','indigo','target', date_trunc('year', now())::date, (date_trunc('year', now()) + interval '1 year - 1 day')::date, true, true),
  ('405a4759-da72-4fdd-bd3f-e851d8f7080c','Market intelligence','Rewards competition, feedback and branding captures.','captures','pink','clipboard', date_trunc('year', now())::date, (date_trunc('year', now()) + interval '1 year - 1 day')::date, true, true)
ON CONFLICT (id) DO NOTHING;

-- Any orphan activity ids (safety): attach nothing, but ensure FK integrity before adding it
DELETE FROM public.gamification_actions a
WHERE NOT EXISTS (SELECT 1 FROM public.gamification_games g WHERE g.id = a.game_id);

ALTER TABLE public.gamification_actions
  DROP CONSTRAINT IF EXISTS gamification_actions_game_id_fkey;
ALTER TABLE public.gamification_actions
  ADD CONSTRAINT gamification_actions_game_id_fkey
  FOREIGN KEY (game_id) REFERENCES public.gamification_games(id) ON DELETE CASCADE;

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

DROP POLICY IF EXISTS "Authenticated can view activity tiers" ON public.activity_tiers;
CREATE POLICY "Authenticated can view activity tiers" ON public.activity_tiers
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage activity tiers" ON public.activity_tiers;
CREATE POLICY "Admins manage activity tiers" ON public.activity_tiers
  FOR ALL TO authenticated USING (public.is_admin_or_manager()) WITH CHECK (public.is_admin_or_manager());

CREATE INDEX IF NOT EXISTS idx_activity_tiers_action ON public.activity_tiers (action_id, sort);

DROP TRIGGER IF EXISTS trg_activity_tiers_updated_at ON public.activity_tiers;
CREATE TRIGGER trg_activity_tiers_updated_at BEFORE UPDATE ON public.activity_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.activity_tiers (action_id, threshold_pct, points, sort)
SELECT a.id, t.pct, GREATEST(a.points, 1) * t.mult, t.sort
FROM public.gamification_actions a
CROSS JOIN (VALUES (80, 0.5, 1), (100, 1.0, 2), (120, 1.5, 3)) AS t(pct, mult, sort)
WHERE a.is_tiered
  AND NOT EXISTS (SELECT 1 FROM public.activity_tiers x WHERE x.action_id = a.id);