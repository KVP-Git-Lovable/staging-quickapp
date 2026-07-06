
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS covered_for_user_id uuid;

-- 2. suggest_beat_cover
CREATE OR REPLACE FUNCTION public.suggest_beat_cover(
  p_beat_id text,
  p_date date,
  p_absent_user uuid
)
RETURNS TABLE(
  candidate_user_id uuid,
  candidate_name text,
  distance_km numeric,
  planned_load integer,
  is_free boolean,
  score numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lat numeric;
  v_lng numeric;
BEGIN
  IF NOT (public.is_subordinate_of(auth.uid(), p_absent_user) OR auth.uid() = p_absent_user) THEN
    RETURN;
  END IF;

  SELECT avg(latitude), avg(longitude)
    INTO v_lat, v_lng
  FROM public.retailers
  WHERE beat_id = p_beat_id
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL;

  RETURN QUERY
  WITH subs AS (
    SELECT s.subordinate_user_id AS uid, s.full_name AS name
    FROM public.get_all_subordinates(auth.uid()) s
    WHERE s.subordinate_user_id <> p_absent_user
      AND NOT EXISTS (
        SELECT 1 FROM public.leave_applications la
        WHERE la.user_id = s.subordinate_user_id
          AND la.status = 'approved'
          AND p_date BETWEEN la.start_date AND la.end_date
      )
  ),
  latest_loc AS (
    SELECT DISTINCT ON (v.user_id)
      v.user_id,
      NULLIF(v.check_in_location->>'latitude','')::numeric AS lat,
      NULLIF(v.check_in_location->>'longitude','')::numeric AS lng
    FROM public.visits v
    WHERE v.user_id IN (SELECT uid FROM subs)
      AND v.check_in_location IS NOT NULL
    ORDER BY v.user_id, v.check_in_time DESC NULLS LAST, v.created_at DESC
  ),
  loads AS (
    SELECT v.user_id, count(*)::int AS planned_load
    FROM public.visits v
    WHERE v.user_id IN (SELECT uid FROM subs)
      AND v.planned_date = p_date
      AND v.status = 'planned'
    GROUP BY v.user_id
  ),
  computed AS (
    SELECT
      s.uid AS candidate_user_id,
      s.name AS candidate_name,
      CASE
        WHEN v_lat IS NULL OR v_lng IS NULL OR ll.lat IS NULL OR ll.lng IS NULL THEN NULL
        ELSE 6371 * acos(
          least(1, greatest(-1,
            cos(radians(ll.lat)) * cos(radians(v_lat)) *
            cos(radians(v_lng) - radians(ll.lng)) +
            sin(radians(ll.lat)) * sin(radians(v_lat))
          ))
        )
      END::numeric AS distance_km,
      COALESCE(l.planned_load, 0) AS planned_load
    FROM subs s
    LEFT JOIN latest_loc ll ON ll.user_id = s.uid
    LEFT JOIN loads l ON l.user_id = s.uid
  )
  SELECT
    c.candidate_user_id,
    c.candidate_name,
    c.distance_km,
    c.planned_load,
    (c.planned_load = 0) AS is_free,
    (COALESCE(c.distance_km, 9999) + c.planned_load * 5)::numeric AS score
  FROM computed c
  ORDER BY score ASC
  LIMIT 10;
END;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_beat_cover(text, date, uuid) TO authenticated;

-- 3. assign_beat_cover
CREATE OR REPLACE FUNCTION public.assign_beat_cover(
  p_beat_id text,
  p_date date,
  p_absent_user uuid,
  p_cover_user uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moved integer := 0;
  v_beat_name text;
BEGIN
  IF NOT public.is_subordinate_of(auth.uid(), p_absent_user) THEN
    RAISE EXCEPTION 'Not authorized to reassign visits for this user';
  END IF;

  WITH moved AS (
    UPDATE public.visits v
    SET user_id = p_cover_user,
        covered_for_user_id = p_absent_user,
        updated_at = now()
    WHERE v.user_id = p_absent_user
      AND v.planned_date = p_date
      AND v.status = 'planned'
      AND v.retailer_id IN (SELECT id FROM public.retailers WHERE beat_id = p_beat_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.visits v2
        WHERE v2.user_id = p_cover_user
          AND v2.planned_date = p_date
          AND v2.status = 'planned'
          AND v2.retailer_id = v.retailer_id
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_moved FROM moved;

  SELECT name INTO v_beat_name FROM public.beats WHERE id::text = p_beat_id LIMIT 1;

  INSERT INTO public.beat_coverage_assignments (
    primary_user_id, coverage_user_id, beat_id, beat_name,
    start_date, end_date, reason, is_active, assigned_by
  ) VALUES (
    p_absent_user, p_cover_user, p_beat_id, v_beat_name,
    p_date, p_date, 'AI leave cover', true, auth.uid()
  );

  RETURN v_moved;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_beat_cover(text, date, uuid, uuid) TO authenticated;
