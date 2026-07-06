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

  SELECT beat_name INTO v_beat_name FROM public.beats WHERE beat_id = p_beat_id LIMIT 1;
  IF v_beat_name IS NULL THEN
    v_beat_name := p_beat_id;
  END IF;

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