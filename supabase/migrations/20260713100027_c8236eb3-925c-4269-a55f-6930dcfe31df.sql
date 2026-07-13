
CREATE POLICY "Distributors can update their inventory"
ON public.distributor_inventory
FOR UPDATE
USING (
  (EXISTS (SELECT 1 FROM public.distributor_users du
    WHERE du.auth_user_id = auth.uid()
      AND du.distributor_id = distributor_inventory.distributor_id
      AND du.is_active = true))
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_system_admin(auth.uid())
)
WITH CHECK (
  (EXISTS (SELECT 1 FROM public.distributor_users du
    WHERE du.auth_user_id = auth.uid()
      AND du.distributor_id = distributor_inventory.distributor_id
      AND du.is_active = true))
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_system_admin(auth.uid())
);
