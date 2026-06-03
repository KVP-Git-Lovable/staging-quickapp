-- FIX 1: beats SELECT
CREATE POLICY "beats_select" ON public.beats
FOR SELECT TO authenticated
USING (user_has_permission(auth.uid(), 'module_my_beats', 'can_read'));

-- FIX 2: beats INSERT
CREATE POLICY "beats_insert" ON public.beats
FOR INSERT TO authenticated
WITH CHECK (user_has_permission(auth.uid(), 'action_beat_create', 'can_create'));

-- FIX 3: Remove old open product_schemes SELECT policies
DROP POLICY IF EXISTS "Allow anon read product_schemes for portal" ON public.product_schemes;
DROP POLICY IF EXISTS "Product schemes are viewable by authenticated users" ON public.product_schemes;

-- FIX 4: visits INSERT — derive beat_id from the retailer
DROP POLICY IF EXISTS "visits_insert" ON public.visits;
CREATE POLICY "visits_insert" ON public.visits
FOR INSERT TO authenticated
WITH CHECK (
  user_has_permission(auth.uid(), 'action_visit_create', 'can_create')
  AND auth.uid() = user_id
  AND user_has_beat_access(
    auth.uid(),
    (SELECT r.beat_id FROM public.retailers r WHERE r.id = visits.retailer_id)
  )
);

-- FIX 5: orders UPDATE
DROP POLICY IF EXISTS "Users can update their own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update all orders" ON public.orders;
DROP POLICY IF EXISTS "Distributor users can update orders for their distributor" ON public.orders;
CREATE POLICY "orders_update" ON public.orders
FOR UPDATE TO authenticated
USING (
  user_has_permission(auth.uid(), 'action_order_edit', 'can_edit')
  AND (auth.uid() = user_id OR user_has_beat_access(auth.uid(), beat_id))
)
WITH CHECK (
  user_has_permission(auth.uid(), 'action_order_edit', 'can_edit')
  AND (auth.uid() = user_id OR user_has_beat_access(auth.uid(), beat_id))
);