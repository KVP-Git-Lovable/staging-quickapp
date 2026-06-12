
-- Visits: allow anon insert for portal-created visits, scoped to retailer's owner
CREATE POLICY "visits_insert_portal_anon" ON public.visits
  FOR INSERT TO anon
  WITH CHECK (
    visit_type = 'portal_order'
    AND EXISTS (
      SELECT 1 FROM public.retailers r
      WHERE r.id = visits.retailer_id
        AND r.owner_id = visits.user_id
    )
  );

-- Also allow anon SELECT of those portal visits (used by find-or-create lookup)
CREATE POLICY "visits_select_portal_anon" ON public.visits
  FOR SELECT TO anon
  USING (
    visit_type = 'portal_order'
    AND EXISTS (
      SELECT 1 FROM public.retailers r
      WHERE r.id = visits.retailer_id
        AND r.owner_id = visits.user_id
    )
  );

GRANT SELECT, INSERT ON public.visits TO anon;

-- Orders: allow anon insert for portal_order rows scoped to retailer owner
CREATE POLICY "orders_insert_portal_anon" ON public.orders
  FOR INSERT TO anon
  WITH CHECK (
    order_source = 'portal_order'
    AND EXISTS (
      SELECT 1 FROM public.retailers r
      WHERE r.id = orders.retailer_id
        AND r.owner_id = orders.user_id
    )
  );

CREATE POLICY "orders_select_portal_anon" ON public.orders
  FOR SELECT TO anon
  USING (
    order_source = 'portal_order'
    AND EXISTS (
      SELECT 1 FROM public.retailers r
      WHERE r.id = orders.retailer_id
        AND r.owner_id = orders.user_id
    )
  );

GRANT SELECT, INSERT ON public.orders TO anon;

-- Order items: allow anon insert/select for items tied to a portal order
CREATE POLICY "order_items_insert_portal_anon" ON public.order_items
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.order_source = 'portal_order'
    )
  );

CREATE POLICY "order_items_select_portal_anon" ON public.order_items
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.order_source = 'portal_order'
    )
  );

GRANT SELECT, INSERT ON public.order_items TO anon;
