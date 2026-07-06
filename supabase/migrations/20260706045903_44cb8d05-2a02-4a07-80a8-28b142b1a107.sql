
CREATE OR REPLACE FUNCTION public.get_operations_exceptions(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_types text[] DEFAULT NULL,
  p_user uuid DEFAULT NULL
)
RETURNS TABLE (
  order_id uuid,
  invoice_number text,
  order_date date,
  entered_on timestamptz,
  is_backdated boolean,
  is_on_behalf boolean,
  is_out_of_beat boolean,
  is_edited boolean,
  retailer_id uuid,
  retailer_name text,
  collector_id uuid,
  placed_by_id uuid,
  owner_id uuid,
  collector_name text,
  placed_by_name text,
  owner_name text,
  reason text,
  oob_location jsonb,
  total_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.user_has_permission(auth.uid(), 'operations_config', 'can_edit') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    o.id AS order_id,
    o.invoice_number,
    o.order_date,
    o.created_at AS entered_on,
    COALESCE(o.is_backdated, false) AS is_backdated,
    (o.placed_by_user_id IS NOT NULL) AS is_on_behalf,
    COALESCE(o.is_out_of_beat, false) AS is_out_of_beat,
    COALESCE(o.is_edited, false) AS is_edited,
    o.retailer_id,
    r.name AS retailer_name,
    o.user_id AS collector_id,
    o.placed_by_user_id AS placed_by_id,
    o.owner_id_snapshot AS owner_id,
    pc.full_name AS collector_name,
    pp.full_name AS placed_by_name,
    po.full_name AS owner_name,
    COALESCE(o.backdate_reason, o.out_of_beat_reason) AS reason,
    o.oob_location,
    o.total_amount
  FROM public.orders o
  LEFT JOIN public.retailers r ON r.id = o.retailer_id
  LEFT JOIN public.profiles pc ON pc.id = o.user_id
  LEFT JOIN public.profiles pp ON pp.id = o.placed_by_user_id
  LEFT JOIN public.profiles po ON po.id = o.owner_id_snapshot
  WHERE COALESCE(o.status, '') <> 'cancelled'
    AND (
      COALESCE(o.is_backdated, false)
      OR o.placed_by_user_id IS NOT NULL
      OR COALESCE(o.is_out_of_beat, false)
      OR COALESCE(o.is_edited, false)
    )
    AND (p_from IS NULL OR o.order_date >= p_from)
    AND (p_to IS NULL OR o.order_date <= p_to)
    AND (
      p_user IS NULL
      OR o.user_id = p_user
      OR o.placed_by_user_id = p_user
    )
    AND (
      p_types IS NULL
      OR array_length(p_types, 1) IS NULL
      OR (COALESCE(o.is_backdated, false) AND 'backdated' = ANY(p_types))
      OR (o.placed_by_user_id IS NOT NULL AND 'on_behalf' = ANY(p_types))
      OR (COALESCE(o.is_out_of_beat, false) AND 'out_of_beat' = ANY(p_types))
      OR (COALESCE(o.is_edited, false) AND 'edited' = ANY(p_types))
    )
  ORDER BY o.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_operations_exceptions(date, date, text[], uuid) TO authenticated;
