CREATE POLICY "Portal distributor users can read order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND public.portal_can_read_order(o.id)
  )
);