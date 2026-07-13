
DROP POLICY IF EXISTS orders_select_portal_anon ON public.orders;

CREATE POLICY orders_select_portal_anon
ON public.orders
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.retailers r
    WHERE r.id = orders.retailer_id
      AND r.portal_enabled = true
      AND (
        r.owner_id = orders.user_id
        OR r.user_id = orders.user_id
        OR orders.user_id IS NULL
      )
  )
);
