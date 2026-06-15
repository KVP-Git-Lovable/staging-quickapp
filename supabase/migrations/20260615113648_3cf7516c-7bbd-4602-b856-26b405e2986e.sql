
-- Audit columns on product_variants for symmetry with products
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- Auto-stamp last_cost_update when standard_cost changes on products
CREATE OR REPLACE FUNCTION public.stamp_product_last_cost_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.standard_cost IS NOT NULL THEN
      NEW.last_cost_update := now();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.standard_cost IS DISTINCT FROM OLD.standard_cost THEN
      NEW.last_cost_update := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_product_last_cost_update ON public.products;
CREATE TRIGGER trg_stamp_product_last_cost_update
  BEFORE INSERT OR UPDATE OF standard_cost ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.stamp_product_last_cost_update();

-- Auto-stamp created_by / updated_by on products and product_variants
CREATE OR REPLACE FUNCTION public.stamp_audit_user_cols()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
    NEW.updated_by := auth.uid();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_audit_user ON public.products;
CREATE TRIGGER trg_products_audit_user
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.stamp_audit_user_cols();

DROP TRIGGER IF EXISTS trg_product_variants_audit_user ON public.product_variants;
CREATE TRIGGER trg_product_variants_audit_user
  BEFORE INSERT OR UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.stamp_audit_user_cols();
