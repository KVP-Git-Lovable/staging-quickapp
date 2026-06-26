
-- Phase 1: Two-tier UOM conversions
-- Dimensional categories (Weight/Volume/Length) get universal conversion factors on uom_master.
-- Count/pack categories (Quantity/Packaging/Medication/Electronics) leave it NULL — set per product.

ALTER TABLE public.uom_master
  ADD COLUMN IF NOT EXISTS conversion_to_base numeric;

-- Backfill category_id from uom_category by matching the legacy text category to category.name
UPDATE public.uom_master m
SET category_id = c.id
FROM public.uom_category c
WHERE m.category_id IS NULL
  AND lower(c.name) = lower(m.category);

-- Ensure exactly ONE base per dimensional category (idempotent).
-- Bases: Weight=GRAM, Volume=ML, Length=MM, Quantity=PIECE.
UPDATE public.uom_master SET is_base = false
WHERE category IN ('Weight','Volume','Length','Quantity');

UPDATE public.uom_master SET is_base = true
WHERE (category='Weight'   AND code='GRAM')
   OR (category='Volume'   AND code='ML')
   OR (category='Length'   AND code='MM')
   OR (category='Quantity' AND code='PIECE');

-- Bases always equal 1
UPDATE public.uom_master SET conversion_to_base = 1 WHERE is_base = true;

-- Seed universal factors for DIMENSIONAL units
-- Weight (base = GRAM)
UPDATE public.uom_master SET conversion_to_base = 1000       WHERE category='Weight' AND code='KG';
UPDATE public.uom_master SET conversion_to_base = 0.001      WHERE category='Weight' AND code='MG';
UPDATE public.uom_master SET conversion_to_base = 1000000    WHERE category='Weight' AND code='TON';
UPDATE public.uom_master SET conversion_to_base = 28.3495    WHERE category='Weight' AND code='OZ';
UPDATE public.uom_master SET conversion_to_base = 453.592    WHERE category='Weight' AND code='LB';

-- Volume (base = ML)
UPDATE public.uom_master SET conversion_to_base = 1000       WHERE category='Volume' AND code='LITRE';
UPDATE public.uom_master SET conversion_to_base = 3785.41    WHERE category='Volume' AND code='GAL';
UPDATE public.uom_master SET conversion_to_base = 29.5735    WHERE category='Volume' AND code='FL_OZ';

-- Length (base = MM)
UPDATE public.uom_master SET conversion_to_base = 10         WHERE category='Length' AND code='CM';
UPDATE public.uom_master SET conversion_to_base = 25.4       WHERE category='Length' AND code='INCH';
UPDATE public.uom_master SET conversion_to_base = 304.8      WHERE category='Length' AND code='FT';
UPDATE public.uom_master SET conversion_to_base = 1000       WHERE category='Length' AND code='M';
UPDATE public.uom_master SET conversion_to_base = 1000000    WHERE category='Length' AND code='KM';

-- Pack/Count categories: ensure NULL (per-product)
UPDATE public.uom_master
SET conversion_to_base = NULL
WHERE category IN ('Packaging','Medication','Electronics')
  AND is_base = false;
