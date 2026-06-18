DROP POLICY IF EXISTS "Users can view order items" ON public.primary_order_items;

CREATE POLICY "Users can view order items"
ON public.primary_order_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.primary_orders po
    WHERE po.id = primary_order_items.order_id
      AND (
        po.created_by_user_id = auth.uid()
        OR po.source_distributor_id = get_distributor_id_for_auth_user()
        OR po.target_distributor_id = get_distributor_id_for_auth_user()
        OR is_subordinate_of(auth.uid(), po.created_by_user_id)
        OR is_system_admin(auth.uid())
        -- Parent / OEM distributor: can read items of child distributor orders
        OR (
          get_distributor_id_for_auth_user() IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.distributors d
            WHERE d.id = po.source_distributor_id
              AND d.parent_id = get_distributor_id_for_auth_user()
          )
          AND (po.target_distributor_id IS NULL
               OR po.target_distributor_id = get_distributor_id_for_auth_user())
        )
      )
  )
);