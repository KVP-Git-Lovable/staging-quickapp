-- Progressive target-tier rewards.
--
-- Requirement change: instead of awarding only the single highest tier reached,
-- evaluated after the month closes, each configured tier is an independent
-- milestone. Its points are awarded IMMEDIATELY when the user's cumulative
-- achievement for the period first reaches that tier's threshold, and each tier
-- can be awarded only once per (action, user, period). One order crossing
-- several thresholds awards all of them at once; recalculations (backdated /
-- edited / cancelled orders) never duplicate an already-awarded tier.
--
-- Builds on 20260901070000: refresh_user_period_actuals() already runs on every
-- order / order_item change, so hooking the awarder there makes awards live.

-- One ledger row per tier per user per period, enforced at the storage layer.
-- (Existing rows carry tier_threshold in metadata already.)
CREATE UNIQUE INDEX IF NOT EXISTS ux_gam_points_target_tier_once
ON public.gamification_points (action_id, user_id, period_key, ((metadata->>'tier_threshold')))
WHERE reference_type = 'target_tier';

-- Core awarder: give every not-yet-awarded tier whose threshold is reached.
CREATE OR REPLACE FUNCTION public.gam_award_tiers_for_target(
  p_user_id uuid,
  p_kpi_id uuid,
  p_period_start date,
  p_achievement numeric,
  p_dry_run boolean DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s public.gamification_settings%ROWTYPE;
  v_dry boolean; a record; t record; v_awards integer := 0;
  v_period_key text;
  v_month_end date;
BEGIN
  IF p_user_id IS NULL OR p_kpi_id IS NULL OR p_period_start IS NULL THEN RETURN 0; END IF;

  v_period_key := to_char(p_period_start, 'YYYY-MM');
  v_month_end := (p_period_start + interval '1 month' - interval '1 day')::date;

  SELECT * INTO s FROM public.gamification_settings LIMIT 1;
  v_dry := COALESCE(p_dry_run, NOT COALESCE(s.engine_enabled, false));

  FOR a IN
    SELECT act.* FROM public.gamification_actions act
    JOIN public.gamification_games g ON g.id = act.game_id
    WHERE act.is_enabled AND g.is_active AND act.is_tiered AND act.kpi_id = p_kpi_id
      AND (act.validity_from IS NULL OR act.validity_from <= v_month_end)
      AND (act.validity_to IS NULL OR act.validity_to >= p_period_start)
  LOOP
    IF NOT public.gam_is_eligible(a.id, p_user_id) THEN CONTINUE; END IF;

    FOR t IN
      SELECT * FROM public.activity_tiers
      WHERE action_id = a.id AND threshold_pct <= COALESCE(p_achievement, 0)
      ORDER BY threshold_pct
    LOOP
      IF EXISTS (
        SELECT 1 FROM public.gamification_points gp
        WHERE gp.action_id = a.id AND gp.user_id = p_user_id
          AND gp.period_key = v_period_key
          AND gp.reference_type = 'target_tier'
          AND (gp.metadata->>'tier_threshold')::numeric = t.threshold_pct
      ) THEN CONTINUE; END IF;

      IF v_dry THEN v_awards := v_awards + 1; CONTINUE; END IF;

      INSERT INTO public.gamification_points
        (user_id, game_id, action_id, points, reference_type, earned_at, expires_at, status, period_key, metadata)
      VALUES
        (p_user_id, a.game_id, a.id, t.points, 'target_tier', now(),
         public.gam_compute_expiry(a.expiry_type, a.expiry_days, now()), 'active', v_period_key,
         jsonb_build_object('tier_threshold', t.threshold_pct, 'achievement_percent', p_achievement))
      ON CONFLICT DO NOTHING;

      v_awards := v_awards + 1;
    END LOOP;
  END LOOP;

  RETURN v_awards;
END;
$$;

-- Period-level evaluator (cron / manual entrypoint): now delegates to the
-- progressive awarder for every target row of the given month. No longer
-- "highest tier only", and safe to run any number of times.
CREATE OR REPLACE FUNCTION public.gam_evaluate_target_tiers(p_period_key text DEFAULT to_char(now(), 'YYYY-MM'::text), p_dry_run boolean DEFAULT NULL::boolean)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  upt record; v_awards integer := 0;
  v_start date := to_date(p_period_key || '-01', 'YYYY-MM-DD');
BEGIN
  FOR upt IN
    SELECT u.user_id, u.kpi_id, u.period_start, u.achievement_percent
    FROM public.user_period_targets u
    WHERE u.period_start >= v_start
      AND u.period_start < (v_start + interval '1 month')
      AND u.kpi_id IS NOT NULL
  LOOP
    v_awards := v_awards + public.gam_award_tiers_for_target(
      upt.user_id, upt.kpi_id, upt.period_start, upt.achievement_percent, p_dry_run);
  END LOOP;

  RETURN v_awards;
END;
$$;

-- Live path: refresh actuals AND award any newly reached tiers in the same
-- pass, so points land the moment an order crosses a threshold.
CREATE OR REPLACE FUNCTION public.refresh_user_period_actuals(p_user_id uuid, p_date date)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r record;
  v_actual numeric;
  v_achievement numeric;
BEGIN
  IF p_user_id IS NULL OR p_date IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT upt.id, upt.kpi_id, upt.period_start, upt.period_end, upt.target_value, k.kpi_key
    FROM public.user_period_targets upt
    JOIN public.target_kpi_definitions k ON k.id = upt.kpi_id
    WHERE upt.user_id = p_user_id
      AND p_date BETWEEN upt.period_start AND upt.period_end
      AND k.kpi_key IN ('quantity', 'revenue')
  LOOP
    v_actual := CASE r.kpi_key
      WHEN 'quantity' THEN public.calculate_order_quantity(p_user_id, r.period_start, r.period_end)
      WHEN 'revenue'  THEN public.calculate_revenue_contribution(p_user_id, r.period_start, r.period_end)
    END;

    v_achievement := CASE WHEN r.target_value > 0
                          THEN ROUND((v_actual / r.target_value) * 100, 2)
                          ELSE 0 END;

    UPDATE public.user_period_targets
    SET actual_value = v_actual,
        achievement_percent = v_achievement,
        last_calculated_at = now()
    WHERE id = r.id;

    PERFORM public.gam_award_tiers_for_target(p_user_id, r.kpi_id, r.period_start, v_achievement);
  END LOOP;
END;
$$;

-- Cron: with progressive semantics it is correct (and required) to evaluate the
-- CURRENT month too — e.g. after a nightly bulk resync of backdated orders.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gam-target-tiers') THEN
      PERFORM cron.unschedule('gam-target-tiers');
    END IF;
    PERFORM cron.schedule('gam-target-tiers', '30 1 * * *',
      $cron$SELECT public.gam_evaluate_target_tiers(to_char(now() - interval '1 month', 'YYYY-MM')) + public.gam_evaluate_target_tiers(to_char(now(), 'YYYY-MM'));$cron$);
  END IF;
END;
$$;
