## Goal
Add a "Bulk Apply to Products" panel to the Opening Stock Management dialog (distributor portal → Inventory) so the distributor can set Mfg Date / Expiry Date / Quantity once, choose which products to apply it to, and have those values populated into each product's first batch row — fully editable afterward and saved through the existing `execute_stock_action` RPC.

## File touched
`src/components/distributor-portal/inventory/OpeningStockDialog.tsx` (only file changed)

## UI changes
1. **Row checkbox** — add a `Checkbox` at the left of each product row in the existing collapsible list to mark it for bulk apply. Selection count shown in the bulk panel header.
2. **Bulk Apply card** — a collapsible card placed above the product list, matching the attached screenshot:
   - Header: "Bulk Apply to Products" + sub-text + right-aligned `Selected: N products` and expand chevron.
   - Inputs (responsive grid): `Mfg Date` (date), `Expiry Date` (date), `Quantity (pieces)` (number).
   - Footer buttons: `Clear`, `Apply to Selected` (disabled when 0 selected), `Apply to All Products`.
   - Styled with the existing primary/green design tokens (no custom hex).

## Behavior
- "Apply to Selected" / "Apply to All Products" writes the entered Mfg Date, Expiry Date and Quantity into the **first batch** of each targeted `ProductEntry` (only the fields the user filled in — empty bulk fields are skipped so existing values aren't wiped). The product row is auto-expanded so the user can immediately see and edit the populated values.
- Values remain fully editable in the per-product batch rows (existing `updateBatch` flow).
- "Clear" resets the bulk inputs and clears all row selections.
- On submit, the existing `handleConfirm` flow is reused unchanged — populated batches save via the existing `execute_stock_action` RPC, so persistence and re-edit on reopen continue to work exactly as today.

## State additions (local to dialog)
- `ProductEntry.selected: boolean` (default false).
- `bulkMfg`, `bulkExpiry`, `bulkQty`, `bulkExpanded` useState values.
- Helpers: `applyBulk(scope: 'selected' | 'all')`, `clearBulk()`, `toggleSelect(productId)`, `selectedCount`.

## Out of scope
- No DB / RPC / schema changes.
- No changes to warehouse, CSV upload, scan, or save logic.
- No new permissions or feature flags.
