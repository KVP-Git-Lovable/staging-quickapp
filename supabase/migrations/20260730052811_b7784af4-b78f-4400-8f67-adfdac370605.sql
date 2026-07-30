
-- Helpers -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gam_period_key(p_scope text, p_ts timestamptz DEFAULT now())
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_scope = 'user_month' THEN to_char(p_ts, 'YYYY-MM')
    ELSE to_char(p_ts, 'YYYY-MM-DD')
  END;
$$;

CREATE OR REPLACE FUNCTION public.gam_fy_end(p_ts timestamptz DEFAULT now())
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (date_trunc('year', p_ts + interval '9 months') + interval '3 months' - interval '1 second');
$$;

CREATE OR REPLACE FUNCTION public.gam_compute_expiry(p_expiry_type text, p_expiry_days integer, p_ts timestamptz DEFAULT now())
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_expiry_type = 'never' THEN NULL
    WHEN p_expiry_type = 'days' THEN p_ts + make_interval(days => COALESCE(p_expiry_days, 180))
    ELSE public.gam_fy_end(p_ts)
  END;
$$;

CREATE OR REPLACE FUNCTION public.gam_is_eligible(p_action_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.gamification_actions%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.gamification_actions WHERE id = p_action_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF a.eligibility_mode = 'all' THEN
    RETURN true;
  ELSIF a.eligibility_mode = 'users' THEN
    RETURN p_user_id = ANY(a.eligibility_ids);
  ELSIF a.eligibility_mode = 'manager' THEN
    IF p_user_id = ANY(a.eligibility_ids) THEN RETURN true; END IF;
    RETURN EXISTS (
      SELECT 1 FROM unnest(a.eligibility_ids) m(mid),
      LATERAL public.get_all_subordinates(m.mid) s
      WHERE s.subordinate_user_id = p_user_id
    );
  ELSIF a.eligibility_mode = 'territory' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = p_user_id
        AND p.territories_covered && (SELECT array_agg(x::text) FROM unnest(a.eligibility_ids) x)
    );
  END IF;
  RETURN false;
END;
$$;

-- Condition evaluation: conditions_json = [{"field":"amount","operator":">=","value":1000}]
CREATE OR REPLACE FUNCTION public.gam_conditions_match(p_conditions jsonb, p_context jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  c jsonb;
  fld text; op text; val jsonb; actual jsonb;
  a_num numeric; v_num numeric;
BEGIN
  IF p_conditions IS NULL OR jsonb_typeof(p_conditions) <> 'array' OR jsonb_array_length(p_conditions) = 0 THEN
    RETURN true;
  END IF;

  FOR c IN SELECT * FROM jsonb_array_elements(COALESCE(p_conditions, '[]'::jsonb)) LOOP
    fld := c->>'field';
    op := COALESCE(c->>'operator', '=');
    val := c->'value';
    actual := COALESCE(p_context, '{}'::jsonb)->fld;

    IF actual IS NULL THEN RETURN false; END IF;

    BEGIN
      a_num := (actual #>> '{}')::numeric;
      v_num := (val #>> '{}')::numeric;
    EXCEPTION WHEN others THEN
      a_num := NULL; v_num := NULL;
    END;

    IF op IN ('>', '>=', '<', '<=') THEN
      IF a_num IS NULL OR v_num IS NULL THEN RETURN false; END IF;
      IF op = '>'  AND NOT (a_num >  v_num) THEN RETURN false; END IF;
      IF op = '>=' AND NOT (a_num >= v_num) THEN RETURN false; END IF;
      IF op = '<'  AND NOT (a_num <  v_num) THEN RETURN false; END IF;
      IF op = '<=' AND NOT (a_num <= v_num) THEN RETURN false; END IF;
    ELSIF op = '=' THEN
      IF a_num IS NOT NULL AND v_num IS NOT NULL THEN
        IF a_num <> v_num THEN RETURN false; END IF;
      ELSIF (actual #>> '{}') IS DISTINCT FROM (val #>> '{}') THEN
        RETURN false;
      END IF;
    ELSIF op = '!=' THEN
      IF (actual #>> '{}') IS NOT DISTINCT FROM (val #>> '{}') THEN RETURN false; END IF;
    ELSIF op = 'in' THEN
      IF jsonb_typeof(val) <> 'array' THEN RETURN false; END IF;
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(val) e WHERE (e #>> '{}') = (actual #>> '{}')) THEN
        RETURN false;
      END IF;
    ELSIF op = 'contains' THEN
      IF position(lower(val #>> '{}') in lower(actual #>> '{}')) = 0 THEN RETURN false; END IF;
    ELSIF op = 'is_true' THEN
      IF (actual #>> '{}') NOT IN ('true','t','1') THEN RETURN false; END IF;
    ELSIF op = 'is_false' THEN
      IF (actual #>> '{}') NOT IN ('false','f','0') THEN RETURN false; END IF;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

-- Cap check + increment. Returns true when the award is allowed.
CREATE OR REPLACE FUNCTION public.gam_consume_cap(p_action_id uuid, p_user_id uuid, p_retailer_id uuid, p_ts timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.gamification_actions%ROWTYPE;
  v_key text;
  v_ret uuid;
  v_count integer;
BEGIN
  SELECT * INTO a FROM public.gamification_actions WHERE id = p_action_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF a.cap_scope = 'none' OR a.cap_value IS NULL OR a.cap_value <= 0 THEN RETURN true; END IF;

  IF a.cap_scope = 'user_month' THEN
    v_key := public.gam_period_key('user_month', p_ts); v_ret := NULL;
  ELSIF a.cap_scope = 'retailer' THEN
    v_key := 'retailer'; v_ret := p_retailer_id;
    IF v_ret IS NULL THEN RETURN true; END IF;
  ELSE
    v_key := public.gam_period_key('user_day', p_ts); v_ret := NULL;
  END IF;

  INSERT INTO public.gamification_daily_tracking (user_id, action_id, tracking_date, period_key, retailer_id, count)
  VALUES (p_user_id, p_action_id, p_ts::date, v_key, v_ret, 1)
  ON CONFLICT (user_id, action_id, period_key, coalesce(retailer_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET count = public.gamification_daily_tracking.count + 1, updated_at = now()
  RETURNING count INTO v_count;

  IF v_count > a.cap_value THEN
    -- cap hit: roll the counter back and drop the award entirely
    UPDATE public.gamification_daily_tracking
      SET count = a.cap_value, updated_at = now()
    WHERE user_id = p_user_id AND action_id = p_action_id AND period_key = v_key
      AND coalesce(retailer_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_ret, '00000000-0000-0000-0000-000000000000'::uuid);
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- Main award entry point ----------------------------------------------

CREATE OR REPLACE FUNCTION public.gam_award_event(
  p_user_id uuid,
  p_trigger_type text,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_retailer_id uuid DEFAULT NULL,
  p_context jsonb DEFAULT '{}'::jsonb,
  p_dry_run boolean DEFAULT NULL
)
RETURNS TABLE(action_id uuid, action_name text, points numeric, awarded boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.gamification_settings%ROWTYPE;
  a record;
  v_now timestamptz := now();
  v_dry boolean;
  v_expires timestamptz;
BEGIN
  SELECT * INTO s FROM public.gamification_settings LIMIT 1;
  v_dry := COALESCE(p_dry_run, NOT COALESCE(s.engine_enabled, false));

  IF p_user_id IS NULL OR p_trigger_type IS NULL THEN RETURN; END IF;

  FOR a IN
    SELECT act.* FROM public.gamification_actions act
    JOIN public.gamification_games g ON g.id = act.game_id
    WHERE act.is_enabled = true
      AND g.is_active = true
      AND COALESCE(act.trigger_type, act.action_type) = p_trigger_type
      AND COALESCE(act.is_tiered, false) = false
      AND (act.validity_from IS NULL OR act.validity_from <= v_now::date)
      AND (act.validity_to IS NULL OR act.validity_to >= v_now::date)
      AND (g.start_date IS NULL OR g.start_date <= v_now::date)
      AND (g.end_date IS NULL OR g.end_date >= v_now::date)
  LOOP
    action_id := a.id; action_name := a.action_name; points := a.points; awarded := false; reason := NULL;

    IF NOT public.gam_is_eligible(a.id, p_user_id) THEN
      reason := 'not_eligible'; RETURN NEXT; CONTINUE;
    END IF;

    IF NOT public.gam_conditions_match(a.conditions_json, p_context) THEN
      reason := 'conditions_not_met'; RETURN NEXT; CONTINUE;
    END IF;

    -- idempotency: never award the same activity twice for the same reference
    IF p_reference_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.gamification_points gp
      WHERE gp.action_id = a.id AND gp.reference_id = p_reference_id AND gp.user_id = p_user_id
    ) THEN
      reason := 'already_awarded'; RETURN NEXT; CONTINUE;
    END IF;

    IF v_dry THEN
      reason := 'dry_run'; RETURN NEXT; CONTINUE;
    END IF;

    IF NOT public.gam_consume_cap(a.id, p_user_id, p_retailer_id, v_now) THEN
      reason := 'cap_reached'; RETURN NEXT; CONTINUE;
    END IF;

    v_expires := public.gam_compute_expiry(a.expiry_type, a.expiry_days, v_now);

    INSERT INTO public.gamification_points
      (user_id, game_id, action_id, points, reference_type, reference_id, earned_at, expires_at, status, period_key, retailer_id, metadata)
    VALUES
      (p_user_id, a.game_id, a.id, a.points, p_reference_type, p_reference_id, v_now, v_expires, 'active',
       to_char(v_now, 'YYYY-MM'), p_retailer_id, jsonb_build_object('trigger', p_trigger_type, 'context', p_context));

    awarded := true; reason := 'awarded';

    IF COALESCE(s.notifications_enabled, true) THEN
      BEGIN
        INSERT INTO public.notifications (user_id, title, message, type)
        VALUES (p_user_id,
                'You earned ' || a.points || ' points',
                a.action_name,
                'gamification');
      EXCEPTION WHEN others THEN NULL;
      END;
    END IF;

    RETURN NEXT;
  END LOOP;
END;
$$;

-- Expiry sweep ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gam_expire_points()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.gamification_points
  SET status = 'expired'
  WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Balance --------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gam_user_balance(p_user_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(points), 0)
  FROM public.gamification_points
  WHERE user_id = p_user_id AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now());
$$;

-- Target tier evaluation (period close, highest-only) -------------------

CREATE OR REPLACE FUNCTION public.gam_evaluate_target_tiers(p_period_key text DEFAULT to_char(now(), 'YYYY-MM'), p_dry_run boolean DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.gamification_settings%ROWTYPE;
  v_dry boolean; a record; t record; upt record; v_awards integer := 0;
  v_start date := to_date(p_period_key || '-01', 'YYYY-MM-DD');
BEGIN
  SELECT * INTO s FROM public.gamification_settings LIMIT 1;
  v_dry := COALESCE(p_dry_run, NOT COALESCE(s.engine_enabled, false));

  FOR a IN
    SELECT act.* FROM public.gamification_actions act
    JOIN public.gamification_games g ON g.id = act.game_id
    WHERE act.is_enabled AND g.is_active AND act.is_tiered AND act.kpi_id IS NOT NULL
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

-- Redemption (oldest first) --------------------------------------------

CREATE OR REPLACE FUNCTION public.gam_redeem_points(p_user_id uuid, p_amount numeric)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_left numeric := p_amount; v_min integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Redemption amount must be positive'; END IF;
  IF public.gam_user_balance(p_user_id) < p_amount THEN RAISE EXCEPTION 'Insufficient points balance'; END IF;

  SELECT MAX(redemption_min) INTO v_min FROM public.gamification_actions WHERE COALESCE(redemption_min,0) > 0;
  IF v_min IS NOT NULL AND p_amount < v_min THEN
    RAISE EXCEPTION 'Minimum redemption is % points', v_min;
  END IF;

  FOR r IN
    SELECT id, points FROM public.gamification_points
    WHERE user_id = p_user_id AND status = 'active' AND (expires_at IS NULL OR expires_at > now())
    ORDER BY earned_at ASC
  LOOP
    EXIT WHEN v_left <= 0;
    UPDATE public.gamification_points SET status = 'redeemed' WHERE id = r.id;
    v_left := v_left - r.points;
  END LOOP;

  RETURN p_amount;
END;
$$;

-- Leaderboard repoint ---------------------------------------------------

CREATE OR REPLACE FUNCTION public.gam_refresh_leaderboard(p_period_type text DEFAULT 'month')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start timestamptz; v_end timestamptz; v_label text; v_rows integer;
BEGIN
  IF p_period_type = 'week' THEN
    v_start := date_trunc('week', now()); v_end := v_start + interval '1 week';
    v_label := to_char(v_start, 'IYYY-"W"IW');
  ELSIF p_period_type = 'all_time' THEN
    v_start := '-infinity'::timestamptz; v_end := 'infinity'::timestamptz; v_label := 'All time';
  ELSE
    v_start := date_trunc('month', now()); v_end := v_start + interval '1 month';
    v_label := to_char(v_start, 'YYYY-MM');
  END IF;

  DELETE FROM public.leaderboard_snapshots
  WHERE period_type = p_period_type AND period_label = v_label;

  INSERT INTO public.leaderboard_snapshots
    (period_type, period_start, period_end, period_label, user_id, rank, total_points, full_name, profile_picture_url, captured_at)
  SELECT p_period_type,
         CASE WHEN v_start = '-infinity'::timestamptz THEN now() - interval '100 years' ELSE v_start END,
         CASE WHEN v_end = 'infinity'::timestamptz THEN now() ELSE v_end END,
         v_label,
         t.user_id,
         ROW_NUMBER() OVER (ORDER BY t.total DESC),
         t.total,
         p.full_name,
         NULL,
         now()
  FROM (
    SELECT gp.user_id, SUM(gp.points) AS total
    FROM public.gamification_points gp
    JOIN public.gamification_actions a ON a.id = gp.action_id
    WHERE gp.status = 'active'
      AND (gp.expires_at IS NULL OR gp.expires_at > now())
      AND COALESCE(a.leaderboard, true)
      AND gp.earned_at >= v_start AND gp.earned_at < v_end
    GROUP BY gp.user_id
  ) t
  JOIN public.profiles p ON p.id = t.user_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gam_award_event(uuid, text, text, uuid, uuid, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gam_user_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gam_redeem_points(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gam_refresh_leaderboard(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gam_evaluate_target_tiers(text, boolean) TO authenticated;
