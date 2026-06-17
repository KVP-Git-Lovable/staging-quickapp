DROP POLICY IF EXISTS "Allow anon read product_schemes for portal" ON public.product_schemes;
CREATE POLICY "Allow anon read product_schemes for portal"
  ON public.product_schemes
  FOR SELECT
  TO anon
  USING (is_active = true AND show_in_portal = true);

GRANT SELECT ON public.product_schemes TO anon;