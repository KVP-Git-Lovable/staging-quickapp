-- Phase 7-3: customer portal needs to read availability rules without an auth session.
-- Rules are not sensitive (visibility metadata). Allow anon SELECT.
GRANT SELECT ON public.product_availability TO anon;
CREATE POLICY "Product availability viewable by anon"
  ON public.product_availability
  FOR SELECT
  TO anon
  USING (true);