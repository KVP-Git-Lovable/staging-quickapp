# Make the Event Stock Unit field fully UOM-master driven

## What's happening today

On the Event Stock Tracking page, the Unit column already renders the shared UOM picker once a product is chosen, but two things break the parity with Order Entry:

- Before a product is picked, the cell renders a fake disabled dropdown whose only option is the literal text `"Unit"` (the placeholder visible in the screenshot).
- When a product is picked, the row's unit is seeded from the product's legacy `base_unit` text column instead of letting the UOM master supply the mapped default. If `base_unit` is empty, the row falls back to the string `"Unit"`, which is not a real unit and never matches a UOM-master code, so the picker can end up showing an empty value.
- Saved rows loaded from the database use the same `unit || products.base_unit || "Unit"` fallback chain, so historical rows can also display a non-master unit.

Order Entry does none of this: it hands `productId` to the picker, and the picker itself emits the correct default UOM, code, conversion factor and price basis from `product_uom_mapping`.

## What will change

1. **Placeholder cell** — replace the fake `"Unit"` dropdown with a plain disabled em-dash cell (same as Order Entry's no-product state). No fabricated unit values.
2. **Product selection** — stop seeding `unit` from `base_unit`. On select, clear the unit/conversion fields and let the UOM picker emit the mapped default (which also recalculates the row price via the existing `uomUnitPrice` helper). Rate seeding stays as-is until the picker emits its selection.
3. **Loading saved rows** — keep the stored snapshot `unit` when present (historical accuracy), but drop the `"Unit"` literal fallback; when a row has no stored unit the picker resolves the product's default from the UOM master.
4. **No UOM mapping** — for legacy products with no `product_uom_mapping` rows, the picker already renders a "Configure UOM" hint (with `hideWhenSingle={false}`). Keep that behaviour so the gap is visible instead of silently guessing.
5. **Summary/table display** — the read-only rows below show `it.unit`; they will show the stored snapshot code, unchanged, and fall back to the product's base UOM label via the shared `UomLabel` component rather than the `"Unit"` string.

## Technical notes

- Single file: `src/pages/EventStockTracker.tsx`.
- Reuses existing shared pieces — `LineItemUomSelect` (`context="sales"`, `hideWhenSingle={false}`), `useProductUnits`/`useLineItemUom`, and `UomLabel` for read-only labels. No new hooks.
- `DEFAULT_DRAFT.unit` becomes an empty string; the row's `unit`, `conversion_to_base` and `price_basis_conversion` continue to be persisted as the snapshot on `event_stock_items` — no schema or migration changes.
- The unit-conversion logic already present for quantity re-scaling (e.g. 12 PIECE to 1 BOX) stays untouched.
