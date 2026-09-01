-- Fix the target-tier gamification pipeline (e.g. the "Quantity target" activity).
--
-- Why: gam_evaluate_target_tiers awards points from user_period_targets.achievement_percent,
-- but nothing ever populated that table — the admin FY-plan screens write to
-- user_business_plans / user_business_plan_months instead. On top of that, the KPI actuals
-- machinery (calculate_user_kpi_actual, update_revenue_actual) targets legacy kpi_keys
-- ('revenue_contribution', …) that no longer exist in target_kpi_definitions (current keys:
-- quantity, revenue, visits, retailer_activation), and the tier evaluator ignored
-- gamification_actions.validity_from/validity_to.
--
-- This migration is self-contained per environment: it (re)defines the bridge + actuals
-- functions, wires triggers, reschedules the cron, and runs the backfill sync at the end.
-- Deploying it to another project brings that project's own business-plan targets into
-- user_period_targets automatically.

-- ---------------------------------------------------------------------------
-- 1. Quantity actuals: total ordered quantity for a user in a period.
--    Mirrors calculate_revenue_contribution's status filter; excludes BOGO free
--    lines (rate 0, category 'Free Item') so gifted stock doesn't count as sales.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_order_quantity(p_user_id uuid, p_start date, p_end date)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(oi.quantity), 0)
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.user_id = p_user_id
    AND o.status IN ('confirmed', 'delivered')
    AND o.order_date BETWEEN p_start AND p_end
    AND NOT (COALESCE(oi.rate, 0) = 0 AND oi.category = 'Free Item');
$$;

-- ---------------------------------------------------------------------------
-- 2. Refresh actuals + achievement on a user's period-target rows overlapping
--    a given date, for the KPIs this bridge maintains. Computes the actual into
--    a variable first (the legacy trigger read the OLD actual_value inside its
--    SET list, so achievement_percent always lagged one event behind).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_user_period_actuals(p_user_id uuid, p_date date)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r record;
  v_actual numeric;
BEGIN
  IF p_user_id IS NULL OR p_date IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT upt.id, upt.period_start, upt.period_end, upt.target_value, k.kpi_key
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

    UPDATE public.user_period_targets
    SET actual_value = v_actual,
        achievement_percent = CASE WHEN r.target_value > 0
                                   THEN ROUND((v_actual / r.target_value) * 100, 2)
                                   ELSE 0 END,
        last_calculated_at = now()
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- Orders: any insert/update (incl. cancellations) refreshes the affected periods.
CREATE OR REPLACE FUNCTION public.tg_refresh_period_actuals_order()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_user_period_actuals(NEW.user_id, NEW.order_date);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_period_actuals_order ON public.orders;
CREATE TRIGGER trg_refresh_period_actuals_order
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_period_actuals_order();

-- Order items land after the order row inside sync_order_with_items, so an
-- order-level trigger alone would compute quantity before the items exist.
CREATE OR REPLACE FUNCTION public.tg_refresh_period_actuals_order_item()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_date date;
BEGIN
  SELECT o.user_id, o.order_date INTO v_user, v_date
  FROM public.orders o
  WHERE o.id = COALESCE(NEW.order_id, OLD.order_id);
  PERFORM public.refresh_user_period_actuals(v_user, v_date);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_period_actuals_order_item ON public.order_items;
CREATE TRIGGER trg_refresh_period_actuals_order_item
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_period_actuals_order_item();

-- ---------------------------------------------------------------------------
-- 3. Bridge: user_business_plans/_months  →  user_period_targets.
--    FY is April–March and user_business_plans.year is the FY *end* year
--    (see getFYYear in src/hooks/useUserTargetProgress.ts), so
--    month_number 1 = April of (year - 1) … month_number 10 = January of year.
--    Rows for these two KPIs are owned exclusively by this bridge: stale months
--    (plan deactivated, target zeroed) are deleted so revoked targets can't award.
-- ---------------------------------------------------------------------------
-- Month-level target set derived from the FY business plans. Kept as its own
-- STABLE function (rather than a temp table) because this project's
-- guard_destructive_ddl event trigger blocks DROP TABLE, temp tables included.
CREATE OR REPLACE FUNCTION public.bp_month_targets()
RETURNS TABLE(user_id uuid, period_start date, period_end date, quantity_target numeric, revenue_target numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT ON (p.user_id, ps.period_start)
         p.user_id,
         ps.period_start,
         (ps.period_start + interval '1 month' - interval '1 day')::date AS period_end,
         COALESCE(m.quantity_target, 0) AS quantity_target,
         COALESCE(m.revenue_target, 0)  AS revenue_target
  FROM public.user_business_plans p
  JOIN public.user_business_plan_months m ON m.business_plan_id = p.id
  CROSS JOIN LATERAL (
    SELECT make_date(
             CASE WHEN m.month_number <= 9 THEN p.year - 1 ELSE p.year END,
             CASE WHEN m.month_number <= 9 THEN m.month_number + 3 ELSE m.month_number - 9 END,
             1) AS period_start
  ) ps
  WHERE COALESCE(p.has_no_target, false) = false
    AND COALESCE(m.is_active, true)
    AND m.month_number BETWEEN 1 AND 12
  ORDER BY p.user_id, ps.period_start, p.updated_at DESC, m.updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.sync_user_period_targets_from_business_plans()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_kpi_quantity uuid;
  v_kpi_revenue uuid;
  v_upserted integer := 0;
  v_n integer;
BEGIN
  SELECT id INTO v_kpi_quantity FROM public.target_kpi_definitions WHERE kpi_key = 'quantity' LIMIT 1;
  SELECT id INTO v_kpi_revenue  FROM public.target_kpi_definitions WHERE kpi_key = 'revenue'  LIMIT 1;
  IF v_kpi_quantity IS NULL AND v_kpi_revenue IS NULL THEN RETURN 0; END IF;

  IF v_kpi_quantity IS NOT NULL THEN
    INSERT INTO public.user_period_targets
      (user_id, kpi_id, period_type, period_start, period_end, target_value, actual_value, achievement_percent, last_calculated_at)
    SELECT b.user_id, v_kpi_quantity, 'month', b.period_start, b.period_end, b.quantity_target,
           a.actual,
           CASE WHEN b.quantity_target > 0 THEN ROUND((a.actual / b.quantity_target) * 100, 2) ELSE 0 END,
           now()
    FROM public.bp_month_targets() b
    CROSS JOIN LATERAL (SELECT public.calculate_order_quantity(b.user_id, b.period_start, b.period_end) AS actual) a
    WHERE b.quantity_target > 0
    ON CONFLICT (user_id, kpi_id, period_type, period_start) DO UPDATE
      SET target_value = EXCLUDED.target_value,
          period_end = EXCLUDED.period_end,
          actual_value = EXCLUDED.actual_value,
          achievement_percent = EXCLUDED.achievement_percent,
          last_calculated_at = now();
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_upserted := v_upserted + v_n;

    DELETE FROM public.user_period_targets t
    WHERE t.kpi_id = v_kpi_quantity AND t.period_type = 'month'
      AND NOT EXISTS (
        SELECT 1 FROM public.bp_month_targets() b
        WHERE b.user_id = t.user_id AND b.period_start = t.period_start AND b.quantity_target > 0
      );
  END IF;

  IF v_kpi_revenue IS NOT NULL THEN
    INSERT INTO public.user_period_targets
      (user_id, kpi_id, period_type, period_start, period_end, target_value, actual_value, achievement_percent, last_calculated_at)
    SELECT b.user_id, v_kpi_revenue, 'month', b.period_start, b.period_end, b.revenue_target,
           a.actual,
           CASE WHEN b.revenue_target > 0 THEN ROUND((a.actual / b.revenue_target) * 100, 2) ELSE 0 END,
           now()
    FROM public.bp_month_targets() b
    CROSS JOIN LATERAL (SELECT public.calculate_revenue_contribution(b.user_id, b.period_start, b.period_end) AS actual) a
    WHERE b.revenue_target > 0
    ON CONFLICT (user_id, kpi_id, period_type, period_start) DO UPDATE
      SET target_value = EXCLUDED.target_value,
          period_end = EXCLUDED.period_end,
          actual_value = EXCLUDED.actual_value,
          achievement_percent = EXCLUDED.achievement_percent,
          last_calculated_at = now();
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_upserted := v_upserted + v_n;

    DELETE FROM public.user_period_targets t
    WHERE t.kpi_id = v_kpi_revenue AND t.period_type = 'month'
      AND NOT EXISTS (
        SELECT 1 FROM public.bp_month_targets() b
        WHERE b.user_id = t.user_id AND b.period_start = t.period_start AND b.revenue_target > 0
      );
  END IF;

  RETURN v_upserted;
END;
$$;

-- Keep the bridge fresh when admins edit monthly targets.
CREATE OR REPLACE FUNCTION public.tg_sync_upt_from_business_plans()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_user_period_targets_from_business_plans();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_upt_from_bp_months ON public.user_business_plan_months;
CREATE TRIGGER trg_sync_upt_from_bp_months
AFTER INSERT OR UPDATE OR DELETE ON public.user_business_plan_months
FOR EACH STATEMENT EXECUTE FUNCTION public.tg_sync_upt_from_business_plans();

DROP TRIGGER IF EXISTS trg_sync_upt_from_bp ON public.user_business_plans;
CREATE TRIGGER trg_sync_upt_from_bp
AFTER INSERT OR UPDATE OR DELETE ON public.user_business_plans
FOR EACH STATEMENT EXECUTE FUNCTION public.tg_sync_upt_from_business_plans();

-- ---------------------------------------------------------------------------
-- 4. Tier evaluator: honor the activity's validity window. An action awards a
--    month only when that month overlaps [validity_from, validity_to]
--    (NULL = unbounded). Everything else is unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gam_evaluate_target_tiers(p_period_key text DEFAULT to_char(now(), 'YYYY-MM'::text), p_dry_run boolean DEFAULT NULL::boolean)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s public.gamification_settings%ROWTYPE;
  v_dry boolean; a record; t record; upt record; v_awards integer := 0;
  v_start date := to_date(p_period_key || '-01', 'YYYY-MM-DD');
  v_end date;
BEGIN
  v_end := (v_start + interval '1 month' - interval '1 day')::date;
  SELECT * INTO s FROM public.gamification_settings LIMIT 1;
  v_dry := COALESCE(p_dry_run, NOT COALESCE(s.engine_enabled, false));

  FOR a IN
    SELECT act.* FROM public.gamification_actions act
    JOIN public.gamification_games g ON g.id = act.game_id
    WHERE act.is_enabled AND g.is_active AND act.is_tiered AND act.kpi_id IS NOT NULL
      AND (act.validity_from IS NULL OR act.validity_from <= v_end)
      AND (act.validity_to IS NULL OR act.validity_to >= v_start)
  LOOP
    FOR upt IN
      SELECT u.user_id, u.achievement_percent
      FROM public.user_period_targets u
      WHERE u.kpi_id = a.kpi_id
        AND u.period_start >= v_start
        AND u.period_start < (v_start + interval '1 month')
    LOOP
      IF NOT public.gam_is_eligible(a.id, upt.user_id) THEN CONTINUE; END IF;

      SELECT * INTO t FROM public.activity_tiers
      WHERE action_id = a.id AND threshold_pct <= COALESCE(upt.achievement_percent, 0)
      ORDER BY threshold_pct DESC LIMIT 1;

      IF NOT FOUND THEN CONTINUE; END IF;

      IF EXISTS (
        SELECT 1 FROM public.gamification_points
        WHERE action_id = a.id AND user_id = upt.user_id AND period_key = p_period_key
      ) THEN CONTINUE; END IF;

      IF v_dry THEN v_awards := v_awards + 1; CONTINUE; END IF;

      INSERT INTO public.gamification_points
        (user_id, game_id, action_id, points, reference_type, earned_at, expires_at, status, period_key, metadata)
      VALUES
        (upt.user_id, a.game_id, a.id, t.points, 'target_tier', now(),
         public.gam_compute_expiry(a.expiry_type, a.expiry_days, now()), 'active', p_period_key,
         jsonb_build_object('tier_threshold', t.threshold_pct, 'achievement_percent', upt.achievement_percent));

      v_awards := v_awards + 1;
    END LOOP;
  END LOOP;

  RETURN v_awards;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Cron: evaluate the previous month daily (idempotent via the period_key
--    dedup) instead of once on the 1st, so late target backfills still award.
--    Nightly bridge sync as a safety net behind the triggers. Guarded so the
--    migration also applies where pg_cron is absent (e.g. local dev).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gam-target-tiers') THEN
      PERFORM cron.unschedule('gam-target-tiers');
    END IF;
    PERFORM cron.schedule('gam-target-tiers', '30 1 * * *',
      $cron$SELECT public.gam_evaluate_target_tiers(to_char(now() - interval '1 month', 'YYYY-MM'));$cron$);

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-user-period-targets') THEN
      PERFORM cron.unschedule('sync-user-period-targets');
    END IF;
    PERFORM cron.schedule('sync-user-period-targets', '45 0 * * *',
      $cron$SELECT public.sync_user_period_targets_from_business_plans();$cron$);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Backfill this environment's targets now.
-- ---------------------------------------------------------------------------
SELECT public.sync_user_period_targets_from_business_plans();
