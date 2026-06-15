# Product & Variant Form Audit + UI Plan

Verified against live DB (`products` = 50 cols, `product_variants` = 28 cols) and against `src/components/ProductManagement.tsx` (variant dialog at lines 1403-1624, product form earlier in the same file).

The Claude audit you pasted is **substantially correct**. Below are the validated gaps (with two small corrections) plus a concrete, scalable UI plan that does not remove anything that exists today.

---

## 1. Confirmed gaps — `product_variants` (DB → Variant dialog)

DB has 28 columns. Today's "Add New Variant" dialog already covers: `variant_name, sku, description, base_unit, unit, conversion_factor, price, stock_quantity, hsn_code, barcode, discount_percentage, discount_amount, is_active, is_focused_product, focused_type, focused_due_date, focused_target_quantity, focused_territories, focused_recurring_config`.

**Missing from UI (9 fields — Claude listed 7, missed `qr_code` and `barcode_image_url`):**

| DB column | Type | Priority | Notes |
|---|---|---|---|
| `variant_type` | varchar (default `'Other'`) | CRITICAL | Size / Color / Weight / Packaging / Quantity / Flavor / Other |
| `uom_id` | uuid → `uom_master` | CRITICAL | Variant can override product UOM (e.g. 100ml vs 1L) |
| `variant_weight_g` | numeric | CRITICAL | Required for logistics weight rollups |
| `is_discontinued` | bool (default false) | CRITICAL | Mirrors product-level discontinuation |
| `discontinued_date` | date | CRITICAL | Conditional on `is_discontinued` |
| `variant_cost` | numeric | HIGH | Per-variant landed cost; overrides product `standard_cost` |
| `variant_tax_rate` | numeric | HIGH | Per-variant tax override (some SKUs slab-differ) |
| `qr_code` | text | MEDIUM | Already present on product form; auto-generate like product |
| `barcode_image_url` | text | MEDIUM | Mirror product behaviour (upload / generated) |

> Note: Claude's audit lists `product_id, variant_name, sku, price, stock_quantity` etc as separate "implemented" rows — those are fine. `variant_type` default in DB is already `'Other'`, so making it Required in UI is safe.

## 2. Confirmed gaps — `products` (DB → Product form)

The 15 missing columns Claude listed are accurate. All exist in DB today:
`product_type, gross_weight_g, packaging_weight_g, is_discontinued, discontinued_date, discontinuation_reason, standard_cost, cost_currency, last_cost_update, reorder_quantity, primary_supplier_id, manufacturer, country_of_origin, created_by, updated_by`.

`last_cost_update` should be **auto-stamped** by a trigger when `standard_cost` changes — not a user input. `created_by` / `updated_by` should be auto-set from `auth.uid()` server-side (trigger) and displayed read-only in UI.

## 3. Parity principle

Anything visible on the Product form that semantically applies to a variant must also be on the Variant form, with **inherit-from-parent** behaviour when left blank. The rule: *variant value, when set, overrides the parent product; when null, parent value applies at read time*.

Applies to: `uom_id`, `variant_cost`, `variant_tax_rate`, `hsn_code`, `variant_weight_g`, focused-product block, discontinuation block, barcode/QR block.

## 4. Proposed UI layout — Add / Edit Variant

Replace the current flat dialog body with a tabbed layout that mirrors the Product form sections, so users get a consistent mental model.

```text
Dialog: Add / Edit Variant — [Parent product name shown in header]

[ Tab 1: Identity ]
  - Variant Name *           (existing)
  - Variant Type *           NEW — Select: Size | Color | Weight | Packaging | Quantity | Flavor | Other
  - SKU *                    (existing, auto-generate kept)
  - Product Number           (existing)
  - Description              (existing)
  - Is Active                (existing)

[ Tab 2: Units & Measurements ]
  - UOM (override)           NEW — Select from uom_master, helper: "Leave blank to inherit from product"
  - Base Unit                (existing)
  - Sales Unit               (existing)
  - Conversion Factor        (existing)
  - Variant Weight (g)       NEW — number ≥ 0

[ Tab 3: Pricing & Tax ]
  - Selling Price *          (existing)
  - Variant Cost             NEW — number ≥ 0, helper: "Overrides product Standard Cost"
  - Variant Tax Rate %       NEW — number 0-100, helper: "Overrides product GST %"
  - HSN Code                 (existing)
  - Discount %               (existing, two-way bound)
  - Discount Amount          (existing)

[ Tab 4: Inventory ]
  - Stock Quantity *         (existing)
  - Barcode                  (existing)
  - Barcode Image            NEW — upload + preview (reuse product component)
  - QR Code                  NEW — auto-generated, copy/regenerate (reuse product helper)

[ Tab 5: Lifecycle ]
  - Is Discontinued          NEW — toggle
    └─ Discontinued Date     NEW — date picker (shadcn datepicker w/ pointer-events-auto), required when toggle on

[ Tab 6: Promotions ]
  - Focused Product block    (existing FocusedProductSection component — no change)
```

Behaviour:
- Tabs use the same `Tabs` component already used in the Product form for visual parity.
- Validation: weights/costs ≥ 0, tax 0-100, `discontinued_date` required when `is_discontinued = true`, `variant_type` required.
- Inherit-from-product preview: when `uom_id` / `variant_cost` / `variant_tax_rate` are blank, show a muted helper line "Inherits: <parent value>".
- All existing fields and handlers preserved; the save handler is extended to write the 9 new columns.

## 5. Proposed UI layout — Add / Edit Product (close the 15-col gap)

Reuse current tab shell; add fields to the right tab so nothing moves around unexpectedly.

```text
Tab: Basic Info      + Product Type *  (Finished Good | Raw Material | Semi-Finished | Service | Packaging; default Finished Good)
                     + Created By / Updated By  (read-only, audit)

Tab: Measurements    + Gross Weight (g)
                     + Packaging Weight (g)

Tab: Pricing         + Standard Cost
                     + Cost Currency (default INR)
                     + Reorder Quantity (MOQ)
                     + Last Cost Update (read-only, auto)

Tab: Supply Chain    NEW TAB (or merge into existing Inventory tab)
                     + Primary Supplier   (select → vendors table)
                     + Manufacturer       (text)
                     + Country of Origin  (select, ISO list)
                     + Is Discontinued    (toggle)
                       └─ Discontinued Date         (conditional, required)
                       └─ Discontinuation Reason    (conditional, textarea)
```

## 6. Database / server work required

Minor, mostly already in place:

1. Confirm `created_by` / `updated_by` triggers on `products` (and add on `product_variants` if you want full auditability — currently absent in DB). Suggest adding the same audit cols on variants for symmetry.
2. Add a trigger to stamp `last_cost_update` when `standard_cost` changes.
3. Verify `vendors` table is queryable from product form (RLS / GRANT).
4. Country list: client-side constant (ISO-3166), no DB needed.

These can be one consolidated migration done before the UI ships.

## 7. Out of scope (explicitly preserved)

- No removal or renaming of existing fields.
- Focused-product, recurring-config, territory pickers, price-book linkage, GRN/inventory flows — untouched.
- Variant ↔ product price-book / scheme behaviour — untouched.

## 8. Suggested execution order

1. Migration: add audit cols on `product_variants`, `last_cost_update` trigger, confirm GRANTs. *(supabase--migration)*
2. Refactor Variant dialog into the 6-tab layout above; add the 9 new fields with validation and inherit-from-parent helpers.
3. Extend Product form with the 15 missing fields across Basic / Measurements / Pricing / new Supply Chain tab.
4. Update save handlers + TypeScript types regen.
5. Smoke test: create variant with all fields, edit, discontinuation flow, override pricing, ensure existing flows (focused product, barcode upload) still work.

Estimated effort: ~3-4 hours for forms, ~30 min for migration, ~30 min QA.

---

Approve to switch to build mode and I'll execute in this order, starting with the migration.