# New Primary Order — UI Redesign (pixel-match the screenshot)

## Goal

Re-skin `src/pages/distributor-portal/CreatePrimaryOrder.tsx` to match the attached reference exactly. **No changes to state, data loading, totals math, Supabase reads/writes, validation, edit-mode handling, routing, or the distributor-portal layout/sidebar.** Pure presentation work in this one file (plus, if needed, a small extracted `OrderItemsTable` sub-component for readability).

## What stays untouched

- Sidebar/header chrome (already provided by `DistributorPortalLayout`).
- All hooks, effects, fetches: `loadData`, `loadExistingOrder`, `loadCreditInfo`, `saveOrder`, `addItem`, `updateItem`, `removeItem`, `totals` memo.
- Field semantics: `expectedDeliveryDate`, `notes`, `discount_percent`, `gst_percent`, etc.
- Save Draft / Submit actions and their conditions (credit-exceeded disable).

## New page composition

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ← New Primary Order                              [📄 Save as Draft]  │  ← top header strip
│   Price Book: <name> • <today date> • <N items>                      │
├──────────────────────────────────────────────────────────────────────┤
│  (1)──Add Products──(2)──Review Pricing──(3)──Credit Check──(4)──Submit │  ← stepper
├────────────────────────────────────────────┬─────────────────────────┤
│  ┌─ Add Products ───────────────────────┐  │ ┌─ Order Summary ─────┐ │
│  │ Category | Select Product | Qty +/-  │  │ │ Total Items      3  │ │
│  │ [+ Add to Order]                     │  │ │ Total Units    200  │ │
│  └──────────────────────────────────────┘  │ │ Subtotal   ₹6,000   │ │
│                                            │ │ Discount   -₹324    │ │
│  ┌─ Order Items (3) ──────── Clear All ─┐  │ │ GST(12%)   ₹713.28  │ │
│  │ Product | Price | Qty | Disc | GST   │  │ │ ─────────────────── │ │
│  │ | Line Total | Action                │  │ │ Estimated  ₹6,389   │ │
│  │ <rows with thumb, SKU, badges>       │  │ │ [ View Details → ]  │ │
│  │ ───── + Add more products ─────      │  │ └─────────────────────┘ │
│  └──────────────────────────────────────┘  │ ┌─ Credit Utilization ┐ │
│                                            │ │ [Within Limit pill] │ │
│  ┌─ Order Details ──────────────────────┐  │ │ Credit  ₹5,00,000   │ │
│  │ Exp Delivery | Shipping Address     │  │ │ Outstd  ₹4,20,000   │ │
│  │ Payment Terms| [+ Add New Address]   │  │ │ This Or ₹  6,389    │ │
│  │ Notes (textarea)                     │  │ │ [██████░░] 85% Used │ │
│  └──────────────────────────────────────┘  │ │ Available ₹73,610   │ │
│                                            │ └─────────────────────┘ │
└────────────────────────────────────────────┴─────────────────────────┘
┌──────────────────────────────────────────────────────────────────────┐
│ Subtotal | Discount | GST(12%) | Round Off | Grand Total ₹6,389  │←sticky
│                                          [Save Draft] [Submit Order →]│
└──────────────────────────────────────────────────────────────────────┘
```

Sticky footer matches the screenshot's bottom bar — five labelled total chips on the left, two CTAs on the right, Grand Total emphasised.

## Section-by-section spec

### 1. Header strip (replace lines 423-453)
- White card, full content width, rounded, subtle border.
- Left: back chevron → existing nav target.
- Title: `New Primary Order` (edit-mode keeps current label).
- Subtitle row, muted, dot-separated: `Price Book: {priceBookName} · {format(today,'dd MMM yyyy')} · {orderItems.length} items`.
- Right: `Save as Draft` outline button (icon: `FileText`). Wire to `saveOrder(false)`. (Same handler the bottom Save Draft uses.)

### 2. Stepper (new)
- Self-contained block under header. 4 circular numbered nodes joined by horizontal lines.
- Steps: `Add Products / Add products to your order`, `Review Pricing / Review pricing and taxes`, `Credit Check / Check credit limit`, `Submit / Review and submit order`.
- Active step derived locally:
  - Step 1 active when `orderItems.length === 0`.
  - Step 2 active when items exist but `!expectedDeliveryDate` (proxy for "still reviewing pricing").
  - Step 3 active when items + delivery date set and `creditChecked && outstanding+grandTotal <= creditLimit`.
  - Step 4 active when ready to submit.
- Purely visual, non-clickable. Implement inline (small `Stepper` component at top of file).

### 3. Two-column body grid
- `grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6`.
- Left column: Add Products card → Order Items card → Order Details card.
- Right column: sticky (`sticky top-24 self-start space-y-4`) container holding Order Summary + Credit Utilization.

### 4. Add Products card
- Header with `ShoppingBag` icon + "Add Products".
- 3-column grid (Category / Select Product / Quantity) matching the screenshot proportions; Qty uses the same `−  input  +` cluster already implemented.
- `Add to Order` button below the grid, dark/primary, left-aligned, with `+` icon.

### 5. Order Items — convert from cards to a proper table
- Use `Table` primitives from `@/components/ui/table`.
- Columns: Product · Price (₹) · Qty · Discount · GST · Line Total (₹) · Action.
- Product cell: 40×40 rounded thumbnail (`<img>` if `product.image_url` exists, else `Package` icon fallback in muted square) + name + SKU below + badges row:
  - `Price Book Applied` (emerald outline with star icon) — show when the item's `unit_price` matches the price-book entry.
  - `MRP Used` (amber outline with info tooltip) — show when no price-book entry exists.
- Qty cell: inline `−  input  +` controls (smaller h-8).
- Discount cell: numeric input with `%` suffix, plus muted line under it showing the rupee discount, e.g. `(₹160.00)`.
- GST cell: numeric input with `%` suffix.
- Line Total cell: right-aligned bold rupee value.
- Action cell: edit pencil + red trash; pencil is a stub (focuses the row's qty input) since edit-in-place already exists.
- Header row: `Order Items ({orderItems.length})` left, `Clear All` red text button right (calls `setOrderItems([])`).
- Empty state preserved (existing Package illustration).
- Footer row inside the card (not a Table row): full-width dashed button `+ Add more products` that scrolls/focuses the Add Products card.

### 6. Order Details card
- 2-column grid.
- Left: Expected Delivery Date · Payment Terms (Select, options: `Cash on Delivery`, `7 Days`, `15 Days`, `30 Days`, `45 Days`; **state-only**, no DB write since `primary_orders` payload is unchanged — keep as UI-only field for now) · Notes textarea.
- Right: Shipping Address Select (placeholder `Select shipping address`, options pulled from existing distributor location fetch if available, otherwise single placeholder option for now) + a full-width dashed `+ Add New Address` button (no-op stub with a toast: "Address management coming soon").
- These two new fields (`Payment Terms`, `Shipping Address`) are UI-only placeholders so the layout matches the screenshot without modifying the save payload. Document this clearly with an inline `// TODO` comment.

### 7. Right sticky panel — Order Summary card
- Title with document icon.
- Rows: Total Items (`orderItems.length`), Total Units (`sum of quantity`), Subtotal (`totals.subtotal`), Discount (red, negative), GST (with effective % label like `GST ({avgGstPercent}%)`), divider, Estimated Total (large, primary color).
- `View Details →` ghost button below — toggles a small expanded breakdown (CGST/SGST/Round-off) inline. Keep simple: open/closes a collapsed area.

### 8. Right sticky panel — Credit Utilization card
- Title row with credit-card icon + status pill on right:
  - `Within Limit` (emerald) when `(outstanding+grand) <= creditLimit*0.85`
  - `Near Limit` (amber) when `<= creditLimit`
  - `Exceeded` (red) when over.
- Rows: Credit Limit, Outstanding, This Order (Est.) — three label/value pairs.
- `Progress` bar (existing `@/components/ui/progress`) showing `(outstanding+grand)/creditLimit * 100`; bar color follows pill state.
- `XX% Used` label aligned right of the bar.
- Available Credit row: green bold value `max(0, creditLimit - outstanding - grand)`.
- If exceeded: red warning text under the row ("Order exceeds credit limit. Submission disabled.").

### 9. Sticky bottom action bar (replace lines 820-857)
- Same `fixed bottom-0 ...` container.
- Inside: left flex group with 5 stat blocks (label small/muted on top, value bold below): Subtotal, Discount (red), GST (with %), Round Off, Grand Total (larger primary).
- Right group: `Save Draft` outline → `saveOrder(false)`, `Continue to Review Pricing` / `Submit Order` primary → `saveOrder(true)` (disabled when no items OR credit exceeded). Keep button label `Submit Order →` to match the spec; the screenshot's "Continue to Review Pricing" is the same primary CTA — we use `Submit Order` per spec section 7.
- Hide entire bar when `orderItems.length === 0` (preserve current behavior).

## Visual tokens

- Cards: `rounded-xl border bg-card shadow-sm`.
- Card header padding `p-5 pb-3`, body `p-5 pt-0`.
- Section titles `text-base font-semibold` with leading icon in muted square `w-7 h-7 rounded-md bg-muted/60 grid place-items-center`.
- Stepper active node: filled primary circle white text; inactive: bordered muted circle muted text. Connector line: 1px border that turns primary up to the active node.
- Badges use existing `Badge` with `variant="outline"` plus color classes.
- Maintain `pb-44` on outer wrapper so sticky footer never overlaps content.

## Implementation order

1. Add `Stepper` inline component + helper to compute active step.
2. Add icon imports (`FileText`, `ShoppingBag`, `CreditCard`, `Truck`, `Edit2`, `Info`, `Star`) and `Progress`, `Table` family, `format` from `date-fns`.
3. Replace JSX from `return (` down. Keep all existing handler wiring 1:1.
4. Verify with the preview at `/distributor-portal/create-primary-order`: empty state, with 3 items, credit at 85%, credit exceeded.

## Out of scope

- Persisting `payment_terms` / `shipping_address` / `Add New Address` flow (UI placeholders only — flagged with TODO).
- Product thumbnails require `image_url` on the product; if missing, render the icon fallback. No schema changes.
- No edits to other distributor-portal pages, no DB migration, no edge-function changes.
