-- Restore foreign keys to uom_master that were silently skipped when the
-- columns were added via "ADD COLUMN IF NOT EXISTS ... REFERENCES" on
-- databases where the column already existed (the REFERENCES clause of a
-- skipped ADD COLUMN never runs). PostgREST needs these FKs to resolve the
-- customer-portal catalog embeds:
--   products:      uom_master!products_default_sales_uom_id_fkey
--   enabled_units: uom_master!enabled_units_uom_id_fkey
-- Without them the catalog products query fails and the portal shows
-- "No product found." for every retailer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_default_sales_uom_id_fkey'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_default_sales_uom_id_fkey
      FOREIGN KEY (default_sales_uom_id) REFERENCES public.uom_master(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'enabled_units_uom_id_fkey'
      AND conrelid = 'public.enabled_units'::regclass
  ) THEN
    ALTER TABLE public.enabled_units
      ADD CONSTRAINT enabled_units_uom_id_fkey
      FOREIGN KEY (uom_id) REFERENCES public.uom_master(id);
  END IF;
END $$;
