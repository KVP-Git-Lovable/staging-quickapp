
-- Phase 2: Variant hybrid schema — nullable override columns + variant tax sync

-- 1) Add nullable override columns
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.product_categories(id),
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS gst_percentage numeric,
  ADD COLUMN IF NOT EXISTS tax_master_id uuid REFERENCES public.tax_masters(id),
  ADD COLUMN IF NOT EXISTS default_sales_uom_id uuid REFERENCES public.uom_master(id),
  ADD COLUMN IF NOT EXISTS price_basis_uom_id uuid REFERENCES public.uom_master(id),
  ADD COLUMN IF NOT EXISTS base_unit text,
  ADD COLUMN IF NOT EXISTS base_unit_category text,
  ADD COLUMN IF NOT EXISTS net_weight_g numeric,
  ADD COLUMN IF NOT EXISTS net_volume_ml numeric,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS product_type text,
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS country_of_origin text,
  ADD COLUMN IF NOT EXISTS sku_image_url text,
  ADD COLUMN IF NOT EXISTS reorder_level numeric,
  ADD COLUMN IF NOT EXISTS reorder_quantity numeric,
  ADD COLUMN IF NOT EXISTS standard_cost numeric;

-- 2) Backfill gst_percentage from legacy variant_tax_rate
UPDATE public.product_variants
SET gst_percentage = variant_tax_rate
WHERE gst_percentage IS NULL AND variant_tax_rate IS NOT NULL AND variant_tax_rate > 0;

-- 3) Variant tax-link sync trigger (mirrors products.sync_product_tax_link)
CREATE OR REPLACE FUNCTION public.sync_variant_tax_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rate NUMERIC;
  v_tax_id UUID;
BEGIN
  IF NEW.tax_master_id IS NOT NULL THEN
    SELECT total_rate INTO v_rate
    FROM public.tax_masters
    WHERE id = NEW.tax_master_id;
    IF v_rate IS NOT NULL THEN
      NEW.gst_percentage := v_rate;
    END IF;
  ELSIF NEW.gst_percentage IS NOT NULL THEN
    SELECT id INTO v_tax_id
    FROM public.tax_masters
    WHERE is_active = true
      AND total_rate = NEW.gst_percentage
    ORDER BY created_at
    LIMIT 1;
    IF v_tax_id IS NOT NULL THEN
      NEW.tax_master_id := v_tax_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_variant_tax_link ON public.product_variants;
CREATE TRIGGER trg_sync_variant_tax_link
  BEFORE INSERT OR UPDATE OF tax_master_id, gst_percentage
  ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_variant_tax_link();

-- 4) Extend tax-master rate propagation to also update linked variants
CREATE OR REPLACE FUNCTION public.propagate_tax_master_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.total_rate IS DISTINCT FROM OLD.total_rate THEN
    UPDATE public.products
    SET gst_percentage = NEW.total_rate
    WHERE tax_master_id = NEW.id;

    UPDATE public.product_variants
    SET gst_percentage = NEW.total_rate
    WHERE tax_master_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
