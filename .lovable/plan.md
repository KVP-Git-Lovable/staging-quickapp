## Goal
Only `PIECE` is enabled in the unit master, but 8,468 products in the product master still carry `KG` or `ML` as their unit. Standardise every product to `PIECE` so the rep app, order entry, summary screens and invoices all display the unit as Piece going forward.

## Where the wrong unit comes from
- `products.unit` — currently 7,020 rows = `KG`, 1,448 rows = `ML`. This is the column the order entry / cart / summary screens read.
- `products.base_unit` — same split in lowercase (`kg`, `ml`).
- `products.base_unit_category` — already `Quantity` for 8,411 rows; only 54 are `Weight`.

No other product-level table stores a unit (product_variants doesn't have unit columns; line-item tables get the unit copied in at order time and are out of scope per your choice).

## Changes
1. One-shot data update on `public.products`:
   - `unit` → `'PIECE'` for every row.
   - `base_unit` → `'piece'` for every row.
   - `base_unit_category` → `'Quantity'` for every row (fixes the 54 Weight stragglers and the 3 NULLs).
2. No schema, RLS, or code changes — the order form already reads `product.unit` and now also persists the selected unit verbatim (from the previous fix), so new orders will save and display `PIECE`.
3. Historical order/invoice/packing-list rows are left untouched per your instruction.

## Verification after run
- `SELECT unit, count(*) FROM products GROUP BY unit;` → single row `PIECE | 8468`.
- Open an existing product in product master → unit shows Piece.
- Add a product to a new order → line shows `qty × ₹rate` with unit `PIECE`.