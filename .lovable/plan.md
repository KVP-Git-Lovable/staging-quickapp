## Problem

Saving a product fails with:
> Could not find the 'base_unit_category' column of 'products' in the schema cache

`src/components/ProductManagement.tsx` writes `base_unit_category` (values: `Weight` / `Volume` / `Quantity`) on insert, update, and CSV import, but the `products` table never had that column — only `base_unit`. PostgREST therefore rejects the request and the Edit Product dialog can't save.

## Fix

Add the missing column to the `products` table via migration:

- Column: `base_unit_category text NOT NULL DEFAULT 'Quantity'`
- Backfill existing rows from current `base_unit` using the same normalization the UI uses (kg/g/mg/lb/oz/ton → Weight; ml/l/gal/fl_oz → Volume; else Quantity).
- Add a `CHECK` constraint limiting values to `Weight | Volume | Quantity`.

No code changes required — once the column exists, the existing Save / CSV Import paths will work and `src/integrations/supabase/types.ts` will regenerate to match.

## Out of scope

- No changes to UOM Master, `product_uom_mapping`, or Order Entry unit selection.
- No data migration beyond the one-time backfill of `base_unit_category` from `base_unit`.
