-- Allow anonymous (portal) clients to read active products and enabled units.
-- The customer portal authenticates via localStorage and uses Supabase as anon.

DROP POLICY IF EXISTS "Allow anon read products for portal" ON public.products;
CREATE POLICY "Allow anon read products for portal"
  ON public.products
  FOR SELECT
  TO anon
  USING (is_active = true);

DROP POLICY IF EXISTS "Allow anon read enabled_units for portal" ON public.enabled_units;
CREATE POLICY "Allow anon read enabled_units for portal"
  ON public.enabled_units
  FOR SELECT
  TO anon
  USING (true);

GRANT SELECT ON public.enabled_units TO anon;