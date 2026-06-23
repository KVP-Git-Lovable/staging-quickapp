CREATE OR REPLACE FUNCTION public.portal_can_read_retailer(p_retailer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH portal AS (
    SELECT du.distributor_id, d.name AS distributor_name
    FROM public.distributor_users du
    JOIN public.distributors d ON d.id = du.distributor_id
    WHERE du.auth_user_id = auth.uid()
      AND du.is_active = true
    LIMIT 1
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.retailers r
    CROSS JOIN portal p
    WHERE r.id = p_retailer_id
      AND (
        r.distributor_id = p.distributor_id
        OR EXISTS (
          SELECT 1
          FROM public.distributor_retailer_mappings drm
          WHERE drm.distributor_id = p.distributor_id
            AND drm.retailer_id = r.id
        )
        OR lower(coalesce(r.parent_name, '')) = lower(p.distributor_name)
        OR lower(coalesce(r.parent_name, '')) LIKE lower(split_part(p.distributor_name, ' ', 1)) || '%'
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.portal_can_read_beat(p_beat_id text, p_beat_row_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH portal AS (
    SELECT du.distributor_id, d.name AS distributor_name
    FROM public.distributor_users du
    JOIN public.distributors d ON d.id = du.distributor_id
    WHERE du.auth_user_id = auth.uid()
      AND du.is_active = true
    LIMIT 1
  )
  SELECT EXISTS (
    SELECT 1
    FROM portal p
    WHERE EXISTS (
      SELECT 1
      FROM public.beats b
      WHERE b.beat_id = p_beat_id
        AND b.distributor_id = p.distributor_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.distributor_beat_mappings dbm
      WHERE dbm.distributor_id = p.distributor_id
        AND p_beat_row_id IS NOT NULL
        AND dbm.beat_id = p_beat_row_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.retailers r
      WHERE r.beat_id = p_beat_id
        AND (
          r.distributor_id = p.distributor_id
          OR EXISTS (
            SELECT 1
            FROM public.distributor_retailer_mappings drm
            WHERE drm.distributor_id = p.distributor_id
              AND drm.retailer_id = r.id
          )
          OR lower(coalesce(r.parent_name, '')) = lower(p.distributor_name)
          OR lower(coalesce(r.parent_name, '')) LIKE lower(split_part(p.distributor_name, ' ', 1)) || '%'
        )
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.portal_can_read_order(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH portal AS (
    SELECT du.distributor_id, d.name AS distributor_name
    FROM public.distributor_users du
    JOIN public.distributors d ON d.id = du.distributor_id
    WHERE du.auth_user_id = auth.uid()
      AND du.is_active = true
    LIMIT 1
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    CROSS JOIN portal p
    LEFT JOIN public.retailers r ON r.id = o.retailer_id
    WHERE o.id = p_order_id
      AND (
        o.distributor_id = p.distributor_id
        OR r.distributor_id = p.distributor_id
        OR EXISTS (
          SELECT 1
          FROM public.distributor_retailer_mappings drm
          WHERE drm.distributor_id = p.distributor_id
            AND drm.retailer_id = o.retailer_id
        )
        OR lower(coalesce(r.parent_name, '')) = lower(p.distributor_name)
        OR lower(coalesce(r.parent_name, '')) LIKE lower(split_part(p.distributor_name, ' ', 1)) || '%'
      )
  )
$$;

GRANT EXECUTE ON FUNCTION public.portal_can_read_retailer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_can_read_beat(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_can_read_order(uuid) TO authenticated;

DROP POLICY IF EXISTS "Portal distributor users can read their retailer network" ON public.retailers;
CREATE POLICY "Portal distributor users can read their retailer network"
ON public.retailers
FOR SELECT
TO authenticated
USING (public.portal_can_read_retailer(id));

DROP POLICY IF EXISTS "Portal distributor users can read their network beats" ON public.beats;
CREATE POLICY "Portal distributor users can read their network beats"
ON public.beats
FOR SELECT
TO authenticated
USING (public.portal_can_read_beat(beat_id, id));

DROP POLICY IF EXISTS "Portal distributor users can read their network orders" ON public.orders;
CREATE POLICY "Portal distributor users can read their network orders"
ON public.orders
FOR SELECT
TO authenticated
USING (public.portal_can_read_order(id));