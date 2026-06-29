## Goal
Stop "Could not load products" in the Return form by replacing the unbounded `products + product_variants` embed query with the same paginated/cached source that order entry uses.

## File
`src/components/ReturnStockForm.tsx` (only this file)

## Changes

### 1. Replace `loadProducts()` (lines ~94–122) with a cache-first loader
- Use the shared `useOfflineOrderEntry` hook (same source the order-entry picker uses). It returns `products` already filtered to active, with `variants` attached, and includes `gst_percentage`.
- Map its products into the local `Product` shape currently used by the form:
  ```
  { id, name, unit, rate, sku, gst_percentage, variants: [{ id, variant_name, sku, price }] }
  ```
  - `price` for variant comes from `variant.price` (already on cached variant row).
  - Keep `gst_percentage` so the existing `computeLineTax` call (recently added) keeps working.
- Drop the standalone `.from('products').select(... product_variants (...)).eq('is_active',true).order('name')` query entirely — this is the call that times out at ~8s on large catalogs.
- Remove the local `loading` flag tied to the old fetch; use the hook's `loading` only as a fallback (cache loads instantly, so spinner usually won't show — matching order-entry behavior).

### 2. Trigger fetch on mount
- Call `fetchProducts()` from the hook inside the existing `useEffect` (replacing the old `loadProducts()` call). The hook handles cache-first load + background refresh + dedupe.

### 3. Leave the rest untouched
- `Command`/`CommandInput` search UI (lines ~549+) keeps working as-is — it filters the in-memory list, same as order entry.
- `handleAddReturn`, tax computation via `computeLineTax`, and submit paths are unchanged.
- No changes to other files, no schema changes, no RPC changes.

## Why this fixes it
The current query fetches every active product **plus** an embedded `product_variants` array in one go, with no `.range()`/limit. On ~8.5k SKUs this regularly exceeds PostgREST's 8s statement timeout → the catch block fires `toast.error('Failed to load products')`. The shared offline hook already paginates products and variants separately via `fetchAllPaginated`, caches them in IndexedDB, and returns instantly on subsequent opens — identical to the order-entry picker.

## Acceptance
- Opening Return inside Order Entry shows products immediately (from cache), with no error toast.
- All products are searchable in the picker (not capped at 1k).
- GST on returned lines still uses the product's `gst_percentage` (no regression to flat 5%).