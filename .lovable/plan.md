## Goal
Restructure `src/pages/distributor-portal/CreatePrimaryOrder.tsx` (1554 lines) from a single-scroll form with a decorative 4-step stepper into a real 3-stage wizard. Pure layout/flow refactor — every pricing, scheme, GST, credit, draft, and submit calculation/mutation is reused verbatim.

## Structure

`CreatePrimaryOrder.tsx` becomes the orchestrator:
- Keeps all existing state (items, products, price book, snapshot, paymentConfig, credit, shipping, payment, etc.)
- Keeps all existing data-load effects and submit/save-draft handlers untouched
- Adds `currentStep` (1|2|3), `goNext`, `goBack`, `completedSteps`
- Renders: header → `<Stepper>` → `<CreditStrip>` → active stage → `<WizardFooter>`

Three new presentational components under `src/pages/distributor-portal/primary-order/`:
1. `CartStage.tsx` — "Add Products" card with editable row table (Product / Unit / Qty / My Stock / Supplier Stock / delete), +Add Row, scheme-threshold hint, Apply Offers, right-aligned Subtotal/Discount/Total/incl-GST block.
2. `ReviewStage.tsx` — read-style line rows with qty stepper, savings, totals card with Schemes Applied highlight + CGST/SGST (real per-product GST) + bold Total.
3. `ConfirmStage.tsx` — savings banner; Billed To + Ship To side-by-side; Payment card; live credit room-left line; single commit line; (Submit handled by footer).

Three small shared bits in the same folder:
- `WizardStepper.tsx` — 3 numbered circles, click-to-jump only for completed steps.
- `CreditStrip.tsx` — slim bar: available · this order · % used · within-limit/over-limit pill; amber when this order pushes over; shows "room left" on Stage 3.
- `WizardFooter.tsx` — single sticky footer: Back · Save Draft · [Next | Submit Primary Order] · Grand Total. Grand Total hidden on Stage 1 (cart shows it in its totals block).
- `StockChips.tsx` — `MyStockChip` (exact, from `productStock`) + `SupplierStockChip` (soft signal via `useSupplierStock` hook with graceful RLS-deny hide).

## Calculations / mutations — reused as-is
Extract the existing computations (currently inline in the page) into pure helpers consumed by stages:
- `subtotal`, `totalDiscount`, `totalGst` (per-line `gst_percent`), `grandTotal`, `creditUsedPercent`, `roomLeft`, `wouldExceedLimit`, savings-on-this-order.
- Existing `handleSaveDraft`, `handleSubmit`, `addProduct`, `updateQuantity`, `removeItem`, scheme-application logic, snapshot/shipping resolver — moved to handlers on the page, passed to stages via props. No logic edits.

## Supplier stock (graceful)
New `useSupplierStock(productIds)` hook:
- Queries parent/supplier `distributor_inventory` for product ids.
- On permission error / empty: returns `{ available: false, data: {} }` → CartStage hides the Supplier Stock column.
- On success: maps to soft signal `in_stock | limited | out` (thresholds: 0 → out, ≤10 → limited, else in_stock). Never blocks submit.

## Gating
- Stage 1 → 2: `orderItems.length >= 1`.
- Stage 2 → 3: always allowed.
- Stage 3 Submit: existing validation (delivery date, shipping, payment proof when `paymentConfig` requires) — wired to the footer Submit button.
- Stepper clicks only allowed to step ≤ `max(completedSteps)`.

## Removed
- Right sidebar Order Summary widget.
- Sidebar Credit Validation widget.
- Sticky bottom totals bar.
- Header-area duplicate Save Draft + duplicate Submit.
- The standalone "Credit Validation" step.

## Out of scope
- No DB schema changes.
- No edits to secondary-sales flow, packing lists, invoice PDF, or any shared component used by secondary.
- No change to existing pricing/scheme/GST/credit math.

## Files
- Edit: `src/pages/distributor-portal/CreatePrimaryOrder.tsx` (slim orchestrator)
- New: `src/pages/distributor-portal/primary-order/WizardStepper.tsx`
- New: `src/pages/distributor-portal/primary-order/CreditStrip.tsx`
- New: `src/pages/distributor-portal/primary-order/WizardFooter.tsx`
- New: `src/pages/distributor-portal/primary-order/StockChips.tsx`
- New: `src/pages/distributor-portal/primary-order/CartStage.tsx`
- New: `src/pages/distributor-portal/primary-order/ReviewStage.tsx`
- New: `src/pages/distributor-portal/primary-order/ConfirmStage.tsx`
- New: `src/hooks/useSupplierStock.ts`

## Verification
- Build passes (`tsgo` via auto-typecheck).
- Manual: place a 2-line cart identical to the screenshot; confirm Subtotal/Discount/Total/CGST/SGST/Grand Total match pre-refactor values.
- Edit mode (`editOrderId`) still loads existing order into the cart on Stage 1.
- Credit strip turns amber when `grandTotal > available`.

Approve to proceed.