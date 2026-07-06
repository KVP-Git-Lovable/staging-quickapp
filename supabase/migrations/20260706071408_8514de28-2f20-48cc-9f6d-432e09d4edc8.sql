
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS is_carry_forward boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS carried_from_date date;

CREATE OR REPLACE FUNCTION public.get_carry_forward_retailers(p_user uuid, p_date date)
RETURNS TABLE(retailer_id uuid, retailer_name text, cancelled_on date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user <> auth.uid() AND NOT public.is_subordinate_of(auth.uid(), p_user) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (v.retailer_id)
      v.retailer_id, v.planned_date, v.status, v.cancel_source
    FROM public.visits v
    WHERE v.user_id = p_user
    ORDER BY v.retailer_id, v.planned_date DESC
  )
  SELECT l.retailer_id, r.name::text AS retailer_name, l.planned_date AS cancelled_on
  FROM latest l
  JOIN public.retailers r ON r.id = l.retailer_id
  WHERE l.status = 'cancelled'
    AND l.cancel_source = 'eod_auto'
    AND l.planned_date < p_date
    AND NOT EXISTS (
      SELECT 1 FROM public.visits v2
      WHERE v2.user_id = p_user
        AND v2.retailer_id = l.retailer_id
        AND v2.planned_date >= p_date
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.add_carry_forward_to_plan(p_user uuid, p_date date, p_retailer_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF p_user <> auth.uid() AND NOT public.is_subordinate_of(auth.uid(), p_user) THEN
    RETURN 0;
  END IF;

  WITH targets AS (
    SELECT * FROM public.get_carry_forward_retailers(p_user, p_date) g
    WHERE p_retailer_ids IS NULL OR g.retailer_id = ANY(p_retailer_ids)
  ), ins AS (
    INSERT INTO public.visits (user_id, retailer_id, planned_date, status, is_carry_forward, carried_from_date)
    SELECT p_user, t.retailer_id, p_date, 'planned', true, t.cancelled_on
    FROM targets t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.user_id = p_user
        AND v.retailer_id = t.retailer_id
        AND v.planned_date = p_date
        AND v.status = 'planned'
    )
    RETURNING 1
  )
  SELECT count(*)::int INTO v_count FROM ins;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_carry_forward_retailers(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_carry_forward_to_plan(uuid, date, uuid[]) TO authenticated;
