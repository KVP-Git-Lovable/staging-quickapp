CREATE OR REPLACE FUNCTION public.next_free_day(p_user uuid, p_from date)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date := greatest(p_from, current_date) + 1;
  v_end date := (date_trunc('month', v_start) + interval '1 month - 1 day')::date;
  d date := v_start;
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