
CREATE TABLE public.product_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  scope_type text NOT NULL CHECK (scope_type IN ('region','zone','state','territory','distributor','user')),
  scope_value text NOT NULL,
  mode text NOT NULL DEFAULT 'include' CHECK (mode IN ('include','exclude')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (product_id, scope_type, scope_value, mode)
);

CREATE INDEX idx_prod_avail_product ON public.product_availability(product_id);
CREATE INDEX idx_prod_avail_lookup  ON public.product_availability(scope_type, scope_value);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_availability TO authenticated;
GRANT ALL ON public.product_availability TO service_role;

ALTER TABLE public.product_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage product availability"
  ON public.product_availability
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Product availability viewable by authenticated users"
  ON public.product_availability
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
