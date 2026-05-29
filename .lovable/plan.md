## Goal
Persist the `ProductUnitsEditor` state (Step 1 base unit, Step 2 packaging rows, price overrides) to `product_uom_mapping` whenever a product is created or updated, and hydrate the editor when an existing product is opened for edit.

## Schema check
`product_uom_mapping` columns available today:
`id, product_id, uom_id, conversion_to_base, is_base, is_default_sales, is_default_purchase, is_price_basis, is_active, created_at, updated_at`.

That covers Step 1 + Step 2. There is **no** `price_override` or `label` column, so:
- Per-row `priceOverrides` will be persisted via the existing `price_lists` / `product_pricing` path if one exists; otherwise kept in-memory only for the Live Preview, and we'll surface a small warning under the section ("price overrides not persisted yet — schema column missing"). I'll confirm in the code before deciding.
- The custom row label is rendered in the editor only; the canonical label comes from `uom_master.code/name`.

No DB migration is required for the core persistence.

## Implementation

### 1. `src/components/ProductManagement.tsx` — `handleProductSubmit`
After the existing `products` insert/update succeeds and we know the `product_id`:
1. Load enabled units for the chosen `unitsValue.baseCategory` via `loadEnabledUnits(category)` (already in `uomEngine`) — needed to resolve sibling base units (e.g. KG when base is GRAM).
2. Call `deriveProductMappings({ category, netWeightG, netVolumeMl, packagingRows: unitsValue.rows, baseCategoryUnits, priceBasisCode, defaultSalesCode, defaultPurchaseCode })` — returns the canonical `DerivedRow[]`.
3. Reconcile against `product_uom_mapping`:
   - `select id, uom_id from product_uom_mapping where product_id = :id`
   - For each derived row → upsert `{ product_id, uom_id, conversion_to_base, is_base, is_default_sales, is_default_purchase, is_price_basis, is_active: true }` on the `(product_id, uom_id)` natural key (delete-then-insert if no unique constraint exists, otherwise `.upsert({ onConflict: 'product_id,uom_id' })`).
   - Soft-deactivate any existing rows whose `uom_id` is no longer in the derived set (`is_active = false`) rather than hard-delete, to preserve historical references from order lines.
4. Also mirror the derived "default sales" row back onto `products.unit` / `products.base_unit` / `products.conversion_factor` so legacy code paths keep working (the current update already writes these from `productForm`, so we just override them post-derive).
5. If `deriveProductMappings` throws (e.g. user picked Weight without entering net grams), surface the error message via `toast.error` and abort the save.

### 2. Edit-mode hydration
When a row's Edit pencil is clicked (existing `setProductForm` flow):
1. Set `productForm` as today.
2. Fetch `product_uom_mapping` rows joined to `uom_master` for that product (`select *, uom_master(code, name, category)` — limit to `is_active = true`).
3. Build `ProductUnitsEditorValue`:
   - `baseCategory` ← the base row's `uom_master.category` (fallback to "Quantity").
   - `netWeightG` / `netVolumeMl` ← derived from the base row's `conversion_to_base` against the first non-base packaging row when possible; otherwise leave `null` and let the user re-enter.
   - `rows` ← non-base, non-sibling mapping rows mapped into `UnitRow` shape (`uomId`, `code`, `qtyPerPiece` = `conversion_to_base / physicalSize`, flags).
   - `priceBasisCode` / `defaultSalesCode` / `defaultPurchaseCode` ← the codes from the flagged rows.
4. If no mapping rows exist for the product (legacy product), seed `unitsValue = emptyProductUnitsEditorValue()` so the user starts fresh — no crash.

### 3. UX touches
- Disable the dialog's **Create / Update** button while the reconcile request is in flight.
- After a successful save invalidate the small UoM cache: `clearUomCache(product_id)` + `clearPriceListCache(product_id)`.
- The CSV import path stays unchanged — bulk-imported products keep their legacy `unit/base_unit/conversion_factor` and can be enriched later by opening them in the editor.

### 4. Non-goals
- No schema changes.
- No changes to order entry, inventory ledger, or offline IDB writers — they already read `product_uom_mapping`.
- Price overrides remain UI-only for now unless a persistence target column is found during implementation.

## Confidence
~85 %. The reconcile + hydration paths are mechanical; the only soft spot is reverse-deriving `netWeightG` / `netVolumeMl` from existing mapping rows when the product was created in the legacy UI — covered by the "leave null and let user re-enter" fallback.