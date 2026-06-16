ALTER TABLE public.products ADD COLUMN IF NOT EXISTS base_unit_category text NOT NULL DEFAULT 'Quantity';

UPDATE public.products
SET base_unit_category = CASE
  WHEN lower(coalesce(base_unit,'')) IN ('kg','gram','grams','g','mg','lb','oz','ton') THEN 'Weight'
  WHEN lower(coalesce(base_unit,'')) IN ('ml','litre','liter','l','gal','fl_oz') THEN 'Volume'
  ELSE 'Quantity'
END
WHERE base_unit_category = 'Quantity';

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_base_unit_category_check;
ALTER TABLE public.products ADD CONSTRAINT products_base_unit_category_check
  CHECK (base_unit_category IN ('Weight','Volume','Quantity'));

NOTIFY pgrst, 'reload schema';