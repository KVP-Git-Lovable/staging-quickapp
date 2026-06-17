
-- Remove is_system_admin() bypass from business-data RLS policies.
-- Admin/config tables (security_profiles, profiles, leave_types, taxes, territories, feature flags, etc.)
-- intentionally keep the bypass; only business data ownership policies are tightened here.

-- ============ orders ============
DROP POLICY IF EXISTS orders_select ON public.orders;
CREATE POLICY orders_select ON public.orders FOR SELECT
USING (
  user_has_permission(auth.uid(), 'module_orders'::text, 'can_read'::text) AND (
    auth.uid() = user_id
    OR user_has_beat_access(auth.uid(), beat_id)
    OR auth.uid() = owner_id_snapshot
    OR is_subordinate_of(auth.uid(), user_id)
  )
);

-- ============ order_items ============
DROP POLICY IF EXISTS order_items_select_admin_or_manager ON public.order_items;
CREATE POLICY order_items_select_admin_or_manager ON public.order_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        o.user_id = auth.uid()
        OR is_subordinate_of(auth.uid(), o.user_id)
        OR user_has_beat_access(auth.uid(), o.beat_id)
        OR auth.uid() = o.owner_id_snapshot
      )
  )
);

-- ============ visits ============
DROP POLICY IF EXISTS visits_select ON public.visits;
CREATE POLICY visits_select ON public.visits FOR SELECT
USING (
  user_has_permission(auth.uid(), 'module_visits'::text, 'can_read'::text) AND (
    auth.uid() = user_id
    OR is_subordinate_of(auth.uid(), user_id)
    OR EXISTS (
      SELECT 1 FROM public.retailers r
      WHERE r.id = visits.retailer_id
        AND user_has_beat_access(auth.uid(), r.beat_id)
    )
  )
);

-- ============ beats ============
DROP POLICY IF EXISTS beats_select ON public.beats;
CREATE POLICY beats_select ON public.beats FOR SELECT
USING (
  user_has_permission(auth.uid(), 'module_my_beats'::text, 'can_read'::text) AND (
    auth.uid() = user_id
    OR user_has_beat_access(auth.uid(), beat_id)
    OR EXISTS (
      SELECT 1 FROM public.daily_beat_plans dbp
      WHERE dbp.beat_id = beats.beat_id
        AND dbp.assigned_user_id = auth.uid()
        AND dbp.status = 'active'
    )
    OR is_subordinate_of(auth.uid(), user_id)
  )
);

DROP POLICY IF EXISTS beats_insert ON public.beats;
CREATE POLICY beats_insert ON public.beats FOR INSERT
WITH CHECK (
  user_has_permission(auth.uid(), 'action_beat_create'::text, 'can_create'::text) AND (
    auth.uid() = user_id
    OR is_subordinate_of(auth.uid(), user_id)
  )
);

-- ============ retailers ============
DROP POLICY IF EXISTS retailers_select ON public.retailers;
CREATE POLICY retailers_select ON public.retailers FOR SELECT
USING (
  user_has_permission(auth.uid(), 'module_my_retailers'::text, 'can_read'::text) AND (
    auth.uid() = user_id
    OR user_has_beat_access(auth.uid(), beat_id)
    OR EXISTS (
      SELECT 1 FROM public.daily_beat_plans dbp
      WHERE dbp.beat_id = retailers.beat_id
        AND dbp.assigned_user_id = auth.uid()
        AND dbp.status = 'active'
    )
    OR is_subordinate_of(auth.uid(), user_id)
  )
);

DROP POLICY IF EXISTS retailers_update ON public.retailers;
CREATE POLICY retailers_update ON public.retailers FOR UPDATE
USING (
  user_has_permission(auth.uid(), 'module_my_retailers'::text, 'can_edit'::text) AND (
    auth.uid() = user_id
    OR user_has_beat_access(auth.uid(), beat_id)
    OR is_subordinate_of(auth.uid(), user_id)
  )
)
WITH CHECK (
  user_has_permission(auth.uid(), 'module_my_retailers'::text, 'can_edit'::text) AND (
    auth.uid() = user_id
    OR user_has_beat_access(auth.uid(), beat_id)
    OR is_subordinate_of(auth.uid(), user_id)
  )
);

-- ============ retailer_payment_collections ============
DROP POLICY IF EXISTS "Admin manage collections" ON public.retailer_payment_collections;
DROP POLICY IF EXISTS "View own or owned collections" ON public.retailer_payment_collections;
CREATE POLICY "View own or owned collections" ON public.retailer_payment_collections FOR SELECT
USING (
  collected_by_user_id = auth.uid()
  OR revenue_owner_id = auth.uid()
  OR is_subordinate_of(auth.uid(), collected_by_user_id)
  OR is_subordinate_of(auth.uid(), revenue_owner_id)
);

-- ============ counter_customers ============
DROP POLICY IF EXISTS "System admins can view all counter customers" ON public.counter_customers;

-- ============ event_stock_* (rep-owned business data) ============
DROP POLICY IF EXISTS "Audit readable by owner or admin" ON public.event_stock_audit;
CREATE POLICY "Audit readable by owner" ON public.event_stock_audit FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own event stock days" ON public.event_stock_days;
CREATE POLICY "Users manage own event stock days" ON public.event_stock_days FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own event stock items" ON public.event_stock_items;
CREATE POLICY "Users manage own event stock items" ON public.event_stock_items FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.event_stock_days d
          WHERE d.id = event_stock_items.event_stock_day_id AND d.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.event_stock_days d
          WHERE d.id = event_stock_items.event_stock_day_id AND d.user_id = auth.uid())
);

-- ============ distributor_inventory_transactions ============
DROP POLICY IF EXISTS "Distributors can view their transactions" ON public.distributor_inventory_transactions;
CREATE POLICY "Distributors can view their transactions" ON public.distributor_inventory_transactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.distributor_users du
    WHERE du.auth_user_id = auth.uid()
      AND du.distributor_id = distributor_inventory_transactions.distributor_id
      AND du.is_active = true
  )
);

-- ============ retailer_verification_audit ============
DROP POLICY IF EXISTS audit_select_admin_or_owner ON public.retailer_verification_audit;
CREATE POLICY audit_select_owner_or_manager ON public.retailer_verification_audit FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.retailers r
    WHERE r.id = retailer_verification_audit.retailer_id
      AND (r.user_id = auth.uid() OR is_subordinate_of(auth.uid(), r.user_id))
  )
);

-- ============ primary_orders ============
-- Drop blanket admin-all bypass; admins must hold distributor or staff context
-- (existing po_dist_* and primary_orders_staff_* policies still apply).
DROP POLICY IF EXISTS po_admin_all ON public.primary_orders;
