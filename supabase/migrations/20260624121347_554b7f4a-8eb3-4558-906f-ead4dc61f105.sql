ALTER TABLE public.scheme_applicability DROP CONSTRAINT IF EXISTS scheme_applicability_applicability_level_check;
ALTER TABLE public.scheme_applicability ADD CONSTRAINT scheme_applicability_applicability_level_check
  CHECK (applicability_level IN ('global', 'territory', 'beat', 'retailer', 'salesperson', 'product', 'distributor'));