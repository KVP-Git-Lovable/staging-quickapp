-- Restore the products.unit column, which exists on preprod (text NOT NULL
-- DEFAULT 'piece') and is selected by the customer-portal catalog and prices
-- queries, but had been dropped out-of-band on the staging database. Its
-- absence made every portal products query fail with 400 ("column
-- products.unit does not exist") and the catalog showed "No product found.".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'unit'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN unit text NOT NULL DEFAULT 'piece';
  END IF;
END $$;
