-- Tax treatment for a scheme's discount, for the Manual Per-Unit scheme.
--
--   'exclusive' (DEFAULT, = today's behaviour exactly):
--       the entered per-unit discount is a PRE-TAX amount. The taxable base is
--       reduced by it and GST is charged on the remainder, so what the retailer
--       actually saves is discount * (1 + gst%).
--
--   'inclusive':
--       the entered per-unit discount is the amount off the FINAL, tax-paid
--       price. The taxable base must therefore be reduced by
--       discount / (1 + gst/100) so that the invoice total falls by exactly the
--       amount entered.
--
-- Additive only, and the default preserves current behaviour for every existing
-- scheme — no invoice already raised changes, and no scheme starts computing
-- differently until it is explicitly switched to 'inclusive'.
ALTER TABLE public.product_schemes
  ADD COLUMN IF NOT EXISTS discount_tax_treatment text NOT NULL DEFAULT 'exclusive';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_schemes_discount_tax_treatment_check'
  ) THEN
    ALTER TABLE public.product_schemes
      ADD CONSTRAINT product_schemes_discount_tax_treatment_check
      CHECK (discount_tax_treatment IN ('inclusive','exclusive'));
  END IF;
END $$;

COMMENT ON COLUMN public.product_schemes.discount_tax_treatment IS
  'exclusive (default) = entered discount is pre-tax, GST charged on the reduced base. inclusive = entered discount is off the tax-paid price, so the taxable base is reduced by discount/(1+gst/100). Only meaningful for discount-bearing schemes such as manual_per_unit_discount.';

NOTIFY pgrst, 'reload schema';
