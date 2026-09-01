-- Daily productive-visit tier rewards (progressive, immediate, once per tier per day).
--
-- Requirement: a visits-category activity holds a company-set daily visit target
-- (gamification_actions.base_daily_target, e.g. 50) and % tiers (activity_tiers).
-- Required productive visits for a tier = base_daily_target × threshold_pct.
-- The moment the user's productive-visit count for the day reaches a tier's
-- threshold, that tier's configured points are awarded. Each tier pays once per
-- user per day; one visit crossing several tiers pays all of them. A visit is
-- productive only when it converted to an order (visits.status = 'productive').
--
-- These activities are stored as is_tiered = true with kpi_id NULL, which keeps
-- them invisible to both existing paths: gam_award_event skips tiered actions,
-- and the monthly target-tier awarder only matches actions with a kpi_id.

CREATE UNIQUE INDEX IF NOT EXISTS ux_gam_points_visit_tier_once
ON public.gamification_points (action_id, user_id, period_key, ((metadata->>'tier_threshold')))
WHERE reference_type = 'visit_tier';

CREATE OR REPLACE FUNCTION public.gam_award_daily_visit_tiers(
  p_user_id uuid,
  p_visit_date date,
  p_dry_run boolean DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s public.gamification_settings%ROWTYPE;
  v_dry boolean; a record; t record; v_awards integer := 0;
  v_productive integer;
  v_pct numeric;
  v_period_key text;
BEGIN
  IF p_user_id IS NULL OR p_visit_date IS NULL THEN RETURN 0; END IF;

  v_period_key := to_char(p_visit_date, 'YYYY-MM-DD');

  SELECT * INTO s FROM public.gamification_settings LIMIT 1;
  v_dry := COALESCE(p_dry_run, NOT COALESCE(s.engine_enabled, false));

  SELECT count(*) INTO v_productive
  FROM public.visits
  WHERE user_id = p_user_id AND planned_date = p_visit_date AND status = 'productive';

  IF v_productive <= 0 THEN RETURN 0; END IF;

  FOR a IN
    SELECT act.* FROM public.gamification_actions act
    JOIN public.gamification_games g ON g.id = act.game_id
    WHERE act.is_enabled AND g.is_active
      AND act.is_tiered AND act.kpi_id IS NULL
      AND COALESCE(act.trigger_type, act.action_type) = 'total_visits'
      AND COALESCE(act.base_daily_target, 0) > 0
      AND (act.validity_from IS NULL OR act.validity_from <= p_visit_date)
      AND (act.validity_to IS NULL OR act.validity_to >= p_visit_date)
  LOOP
    IF NOT public.gam_is_eligible(a.id, p_user_id) THEN CONTINUE; END IF;

    -- Share of the TOTAL daily visit target achieved as productive visits.
    v_pct := ROUND((v_productive::numeric / a.base_daily_target) * 100, 2);

    FOR t IN
      SELECT * FROM public.activity_tiers
      WHERE action_id = a.id AND threshold_pct <= v_pct
      ORDER BY threshold_pct
    LOOP
      IF EXISTS (
        SELECT 1 FROM public.gamification_points gp
        WHERE gp.action_id = a.id AND gp.user_id = p_user_id
          AND gp.period_key = v_period_key
          AND gp.reference_type = 'visit_tier'
          AND (gp.metadata->>'tier_threshold')::numeric = t.threshold_pct
      ) THEN CONTINUE; END IF;

      IF v_dry THEN v_awards := v_awards + 1; CONTINUE; END IF;

      INSERT INTO public.gamification_points
        (user_id, game_id, action_id, points, reference_type, earned_at, expires_at, status, period_key, metadata)
      VALUES
        (p_user_id, a.game_id, a.id, t.points, 'visit_tier', now(),
         public.gam_compute_expiry(a.expiry_type, a.expiry_days, now()), 'active', v_period_key,
         jsonb_build_object(
           'tier_threshold', t.threshold_pct,
           'productive_visits', v_productive,
           'daily_visit_target', a.base_daily_target,
           'visit_date', p_visit_date))
      ON CONFLICT DO NOTHING;

      v_awards := v_awards + 1;
    END LOOP;
  END LOOP;

  RETURN v_awards;
END;
$$;

-- Award live: whenever a visit becomes (or is synced as) productive. Covers the
-- online flow and offline-queued visits alike, since both land in this table.
CREATE OR REPLACE FUNCTION public.tg_award_visit_tiers()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'productive' THEN
    PERFORM public.gam_award_daily_visit_tiers(NEW.user_id, NEW.planned_date);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_visit_tiers ON public.visits;
CREATE TRIGGER trg_award_visit_tiers
AFTER INSERT OR UPDATE ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.tg_award_visit_tiers();
