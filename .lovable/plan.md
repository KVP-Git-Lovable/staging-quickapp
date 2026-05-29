## What's still missing

The historical commit `e1cf85b1` (15 May) had two pieces the current Dev branch never received:

**A. Toolbar on Products & SKUs tab**
Currently shows only: `Deactivate All Products`, `Sync Products`, `Add Product`.
Missing: **UoM Master**, **Import Product Data**, **Export Products**; "Deactivate All Products" must be renamed **Delete All**.

**B. Add / Edit Product modal**
Currently uses a small `max-w-md` dialog with the legacy `ProductFormFields` (SKU, Name, Product Number, Category, Rate, Unit, …). Missing everything from the screenshots:

- Dialog widened (~`max-w-3xl`) with a two-column responsive grid
- Field rename: "Product Number" → **Manufacturer Code (Optional)**
- **STEP 1 — Base Unit Setup** card: Category (Weight/Volume/Count), Physical size of 1 piece, Price basis unit, Default sales unit, Default purchase unit
- **STEP 2 — Packaging Rows** table: per-row UNIT / QTY PER 1 PIECE / LABEL SHOWN TO USER / BASE? / DEFAULT SALES? / DEFAULT PURCHASE? plus "+ add packaging unit" picker
- **PRICE OVERRIDES (optional)** section
- **LIVE PREVIEW** card with auto-computed conversion chips

All of the above already exists as `ProductUnitsEditor` in `src/components/admin/uom/ProductUnitsEditor.tsx` (restored in the previous turn) — it just isn't wired into the Add Product dialog yet.

## Database confirmation

No schema work needed. Tables already in place:
- `uom_master` + `enabled_units` — feeds Step 1 dropdowns via `useEnabledUnits`
- `product_uom_mapping` (`conversion_to_base`, `is_base_unit`, `is_default_sales`, `is_default_purchase`, `label`) — persists Step 2 rows
- `product_uom_mapping.price_override` (or equivalent) — persists Price Overrides
- `products.product_number` already exists; only the UI label changes to "Manufacturer Code"

## Implementation plan

### 1. `src/components/ProductManagement.tsx` — toolbar
- Replace the single `flex justify-between` row with a two-row toolbar matching the screenshot:
  - Row 1: search input + `Total: N` badge (already present)
  - Row 2: `UoM Master` (→ navigate `/admin/uom-master`), `Sync`, `Import Product Data`, `Export Products`, `Delete All` (destructive), `Add Product`
- Rename existing "Deactivate All Products" → **Delete All** (keep the same handler — still deactivation, label only)
- `Sync Products` → **Sync**
- Wire `Export Products` to existing CSV export helper (or add a small inline CSV builder over `filteredProducts`)
- Wire `Import Product Data` to the existing bulk-import dialog if present, otherwise open a placeholder file picker that calls the existing bulk-insert path

### 2. Add / Edit Product dialog
- Widen `DialogContent` to `max-w-3xl max-h-[90vh]`
- Replace the inner `<ProductFormFields …/>` with a new composed form:
  - Top grid: Active toggle, SKU*, Product Name*, **Manufacturer Code (Optional)** (bound to `product_number`)
  - Second grid: Category*, Brand (Optional), HSN/SAC Code, GST %*
  - Third grid: Barcode/EAN (Optional) + Description (Optional)
  - "Mark as Focused Product" toggle (reuse existing focused-product fields, collapsed when off)
  - `<ProductUnitsEditor value={unitsValue} onChange={setUnitsValue} productRate={form.rate}/>` — renders Step 1, Step 2, Price Overrides, Live Preview exactly as in the screenshots
- On **Create / Update**:
  1. Upsert into `products` (existing path; derive `rate`, `unit`, `base_unit`, `conversion_factor` from `unitsValue` so legacy code keeps working)
  2. Reconcile `product_uom_mapping` rows for this product from `unitsValue.rows` (delete-missing + upsert) including `is_base_unit`, `is_default_sales`, `is_default_purchase`, `label`, `conversion_to_base`, and `price_override`
- On **Edit**: hydrate `unitsValue` by reading `product_uom_mapping` + `uom_master` for the product

### 3. `ProductFormFields.tsx`
- Keep file for the legacy edit paths it's still used in, but inside the Add Product dialog we no longer mount it — the new composed form replaces it
- Rename the visible label "Product Number" → "Manufacturer Code (Optional)" so any remaining mounts also reflect the change

### 4. Non-goals (explicit)
- No DB migrations
- No changes to offline sync / IndexedDB writers (they already key off `product_uom_mapping`)
- No changes to order entry, pricing, or inventory logic
- Categories tab, search, pagination, table columns are already correct and stay untouched

## Confidence
- Toolbar restoration: **~95 %** — pure presentational, all handlers already exist
- Add Product redesign: **~85 %** — ProductUnitsEditor is fully restored; only wiring + persistence reconciliation is new. Edit-mode hydration is the riskiest piece and will be covered with a defensive fallback to the legacy shape if mapping rows are missing.

Approve to proceed, or tell me to drop / adjust any of the above (e.g. keep "Deactivate All" instead of "Delete All", or skip Import/Export wiring for now).