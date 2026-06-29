
-- 4) GUARD FIRST: ensure auto-link is unambiguous
CREATE UNIQUE INDEX IF NOT EXISTS uq_taxmaster_active_rate
  ON public.tax_masters (total_rate) WHERE is_active = true;

-- 1) ONE-TIME BACKFILL
UPDATE public.products p
SET    tax_master_id = t.id
FROM   public.tax_masters t
WHERE  t.is_active = true
  AND  t.total_rate = p.gst_percentage
  AND  p.tax_master_id IS NULL
  AND  p.gst_percentage IS NOT NULL;

-- 2) PRODUCTS TRIGGER: keep tax_master_id <-> gst_percentage in lockstep
CREATE OR REPLACE FUNCTION public.sync_product_tax_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS trg_sync_product_tax_link ON public.products;
CREATE TRIGGER trg_sync_product_tax_link
  BEFORE INSERT OR UPDATE OF tax_master_id, gst_percentage
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_product_tax_link();

-- 3) TAX MASTER TRIGGER: propagate rate changes to linked products
CREATE OR REPLACE FUNCTION public.propagate_tax_master_rate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.total_rate IS DISTINCT FROM OLD.total_rate THEN
    UPDATE public.products
    SET gst_percentage = NEW.total_rate
    WHERE tax_master_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_tax_master_rate ON public.tax_masters;
CREATE TRIGGER trg_propagate_tax_master_rate
  AFTER UPDATE OF total_rate ON public.tax_masters
  FOR EACH ROW
  EXECUTE FUNCTION public.propagate_tax_master_rate();
