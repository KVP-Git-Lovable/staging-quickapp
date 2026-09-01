-- gam_refresh_leaderboard stored its p_period_type ('month' / 'week' / 'all_time')
-- verbatim into leaderboard_snapshots, whose CHECK only allows 'weekly' / 'monthly'
-- (the values the capture-leaderboard-snapshot edge function writes and the admin
-- UI reads). The hourly gam-refresh-leaderboard cron therefore fails the moment the
-- current month has any leaderboard-eligible points — it only ever "succeeded"
-- while the aggregation was empty. Normalize the stored value instead.

CREATE OR REPLACE FUNCTION public.gam_refresh_leaderboard(p_period_type text DEFAULT 'month'::text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start timestamptz; v_end timestamptz; v_label text; v_rows integer;
  v_store_type text;
BEGIN
  IF p_period_type IN ('week', 'weekly') THEN
    v_start := date_trunc('week', now()); v_end := v_start + interval '1 week';
    v_label := to_char(v_start, 'IYYY-"W"IW');
    v_store_type := 'weekly';
  ELSIF p_period_type = 'all_time' THEN
    v_start := '-infinity'::timestamptz; v_end := 'infinity'::timestamptz; v_label := 'All time';
    v_store_type := 'all_time';
  ELSE
    v_start := date_trunc('month', now()); v_end := v_start + interval '1 month';
    v_label := to_char(v_start, 'YYYY-MM');
    v_store_type := 'monthly';
  END IF;

  DELETE FROM public.leaderboard_snapshots
  WHERE period_type = v_store_type AND period_label = v_label;

  INSERT INTO public.leaderboard_snapshots
    (period_type, period_start, period_end, period_label, user_id, rank, total_points, full_name, profile_picture_url, captured_at)
  SELECT v_store_type,
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

-- 'all_time' snapshots were never storable under the old CHECK either; allow them
-- so a manual all-time refresh doesn't blow up.
ALTER TABLE public.leaderboard_snapshots DROP CONSTRAINT IF EXISTS leaderboard_snapshots_period_type_check;
ALTER TABLE public.leaderboard_snapshots ADD CONSTRAINT leaderboard_snapshots_period_type_check
  CHECK (period_type = ANY (ARRAY['weekly'::text, 'monthly'::text, 'all_time'::text]));
