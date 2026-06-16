## What I found

Order Entry is still using the global enabled Unit Master list from `useUnitMaster()`. It is not using the product-specific `product_uom_mapping` records, so toggling units in UOM Master alone will not make them correct per product.

Also, live data shows products like `Ball 100ml` currently have `0` active mapped units in `product_uom_mapping`, so there is no product-level configuration for Order Entry to display yet.

## How admins should configure a product

1. Go to `/admin/uom-master`.
2. Enable the units that should be available globally, for example `Piece`, `Box`, `Carton`, `Packet`.
3. Go to `/product-management`.
4. Edit the product, for example `Ball 100ml`.
5. In the Product Units section:
   - Set the category, usually `Quantity` for piece/box/carton products.
   - Select `Price basis unit`.
   - Select `Default sales unit`.
   - Add packaging rows like `Box` or `Carton` and set how many pieces each contains.
6. Save the product.

Only after this save should the product have rows in `product_uom_mapping`, which is what Order Entry should use.

## Implementation plan

1. Update `src/components/TableOrderForm.tsx` so the Unit column uses `LineItemUomSelect` with `context="sales"` instead of the global `useUnitMaster()` dropdown.
2. When a product is selected in Order Entry, default the row unit to that product’s `is_default_sales` unit from `get_product_units`, falling back to its base unit.
3. Store the selected UOM code and conversion snapshot on the row/cart item so quantity reporting and order saves keep using the correct unit conversion.
4. For products with no active UOM mapping, show a small fallback state in the Unit cell instead of a blank dropdown, with a clear indication that the product must be configured in Product Management.
5. Keep the existing global Unit Master behavior only for Product Management configuration; Order Entry should be product-specific.

## Technical notes

- The database RPC `get_product_units` is already correctly filtering disabled units from `enabled_units`.
- The missing piece is frontend wiring in `TableOrderForm.tsx`.
- Existing product data still needs product-level UOM mappings; Unit Master enabled units are only the catalog of allowed units, not automatic per-product sales units.