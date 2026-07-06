
-- 1. Alter visits
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS is_rescheduled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rescheduled_from_date date;

-- 2. next_free_day
CREATE OR REPLACE FUNCTION public.next_free_day(p_user uuid, p_from date)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_end date := (date_trunc('month', p_from) + interval '1 month - 1 day')::date;
  d date := p_from + 1;
BEGIN
  WHILE d <= v_end LOOP
    IF NOT EXISTS (
      SELECT 1 FROM leave_applications
      WHERE user_id = p_user AND status = 'approved'
        AND d BETWEEN start_date AND end_date
    ) AND NOT EXISTS (
      SELECT 1 FROM visits WHERE user_id = p_user AND planned_date = d
    ) THEN
      RETURN d;
    END IF;
    d := d + 1;
  END LOOP;
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_free_day(uuid, date) TO authenticated;

-- 3. get_missed_beat_days
CREATE OR REPLACE FUNCTION public.get_missed_beat_days(p_user uuid, p_lookback integer DEFAULT 14)
RETURNS TABLE(missed_date date, retailer_count integer, on_leave boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (p_user = auth.uid() OR public.is_subordinate_of(auth.uid(), p_user)) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH day_stats AS (
    SELECT
      v.planned_date AS d,
      COUNT(*) FILTER (WHERE v.status IN ('productive','unproductive','in-progress','in_progress')) AS attended_count,
      COUNT(*) FILTER (WHERE v.status IN ('planned','cancelled')) AS pending_count,
      COUNT(DISTINCT v.retailer_id) FILTER (WHERE v.status IN ('planned','cancelled')) AS unvisited_retailers
    FROM visits v
    WHERE v.user_id = p_user
      AND v.planned_date BETWEEN (CURRENT_DATE - p_lookback) AND (CURRENT_DATE - 1)
    GROUP BY v.planned_date
  )
  SELECT
    ds.d,
    ds.unvisited_retailers::integer,
    EXISTS (
      SELECT 1 FROM leave_applications la
      WHERE la.user_id = p_user AND la.status = 'approved'
        AND ds.d BETWEEN la.start_date AND la.end_date
    )
  FROM day_stats ds
  WHERE ds.attended_count = 0 AND ds.pending_count > 0
  ORDER BY ds.d DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_missed_beat_days(uuid, integer) TO authenticated;

-- 4. reschedule_missed_day
CREATE OR REPLACE FUNCTION public.reschedule_missed_day(
  p_user uuid,
  p_from_date date,
  p_to_date date DEFAULT NULL
)
RETURNS TABLE(moved integer, to_date date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_to date;
  v_count integer;
BEGIN
  IF NOT (p_user = auth.uid() OR public.is_subordinate_of(auth.uid(), p_user)) THEN
    RETURN;
  END IF;

  v_to := COALESCE(p_to_date, public.next_free_day(p_user, p_from_date));
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'No free day available this month';
  END IF;

  WITH updated AS (
    UPDATE visits v
    SET planned_date = v_to,
        status = 'planned',
        cancel_source = NULL,
        is_rescheduled = true,
        rescheduled_from_date = p_from_date,
        updated_at = now()
    WHERE v.user_id = p_user
      AND v.planned_date = p_from_date
      AND v.status IN ('planned','cancelled')
      AND NOT EXISTS (
        SELECT 1 FROM visits v2
        WHERE v2.user_id = p_user
          AND v2.retailer_id = v.retailer_id
          AND v2.planned_date = v_to
          AND v2.status = 'planned'
      )
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_count FROM updated;

  moved := v_count;
  to_date := v_to;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reschedule_missed_day(uuid, date, date) TO authenticated;
