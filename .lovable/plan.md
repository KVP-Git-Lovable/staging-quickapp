# Fix: "column p.unit does not exist" on Release / Reserve Stock

## Root cause
The dialog calls the RPC `public.execute_stock_action`. That function reads from `public.products` using `p.unit` in three places (lines 73, 103, 150 of the function body), but the `products` table only has `base_unit` — there is no `unit` column. Postgres aborts the whole RPC with `column p.unit does not exist`, so RELEASE / RESERVE / MARK_DAMAGED / MARK_EXPIRED / OPENING_STOCK / GRN all fail from this dialog.

Verified against the live DB:
- `information_schema.columns` for `public.products` → only `base_unit` exists, no `unit`.
- `pg_get_functiondef('execute_stock_action')` → three `p.unit` references inside `public.products` lookups.

## Fix (single migration, no frontend change)
Replace `p.unit` with `p.base_unit` in the function. Three exact spots:

1. Product metadata lookup for the ledger row:
   ```sql
   COALESCE(v_inventory.unit, p.base_unit, 'pcs')
   ```
2. `OPENING_STOCK` insert into `distributor_inventory`:
   ```sql
   COALESCE(p.base_unit, 'pcs')
   ```
3. `GRN` insert into `distributor_inventory`:
   ```sql
   COALESCE(p.base_unit, 'pcs')
   ```

Everything else (signatures, parameters, logic) stays identical, so no caller changes are needed.

## Verification after apply
1. Reopen "Release Reserved Stock" for Ball 100ml, qty 2 KG → expect success toast and reserved column to drop by the converted amount.
2. Re-run Reserve, Mark Damaged, Mark Expired on the same product → all succeed.
3. `SELECT unit FROM distributor_inventory_transactions ORDER BY created_at DESC LIMIT 5;` → the new rows show the product's base unit (e.g. `grams` / `pcs`) instead of NULL.

## Why not patch the frontend instead
The frontend never references `p.unit` — the error is generated inside the security-definer RPC. Only the function needs to change. No table changes, no RLS changes, no app code changes.
