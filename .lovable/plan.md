# Edit Primary Order + Detailed Totals (UI fix)

Make the distributor portal's "Edit Order" button actually work, and bring the totals panel up to parity with the rep Cart (subtotal → discount → taxable → CGST → SGST → round-off → grand total).

## Scope (UI/presentation only — no schema changes)

Single file change: `src/pages/distributor-portal/CreatePrimaryOrder.tsx`
Plus a routing line in `src/App.tsx`.

## 1. Reuse CreatePrimaryOrder for Create + Edit

- Read `:id` via `useParams`. If present → **edit mode**.
- On mount in edit mode: fetch `primary_orders` + `primary_order_items` for the id, then hydrate `orderItems`, `expectedDeliveryDate`, `notes`. Block edit if `status !== 'draft'` (toast + redirect back to detail) — same constraint already implied by the Detail page (Edit button only shows for draft).
- Header: show "Edit Primary Order — {order_number}" vs "New Primary Order".
- `saveOrder()` branches:
  - Create: existing insert path.
  - Edit: `update` header (subtotal/discount/tax/total/notes/expected_delivery_date/status), `delete` existing `primary_order_items` for `order_id`, then re-`insert` from current `orderItems` (simple, atomic-enough for draft edits).
- After save, navigate back to `/distributor-portal/primary-order/:id`.

## 2. Detailed Totals Panel (matches rep Cart visually)

Replace the current flat `subtotal + 18% tax` block with a structured summary card:

```text
Subtotal (gross)              ₹ …
  – Item discount             −₹ …
  – Scheme discount           −₹ …      (if any)
Taxable value                  ₹ …
  CGST (½ of GST%)             ₹ …
  SGST (½ of GST%)             ₹ …
Round-off                      ±₹ …
─────────────────────────────────────
Grand Total                    ₹ …
```

Implementation details:

- Add `discount_amount` (number) and `gst_percent` (number, default product-level or fallback 18) to each `OrderItem`.
- Per-line: small inline "Disc ₹" input + read-only "GST %" pulled from `products.gst_rate` (or fallback 18 if column not populated for that row).
- `calculateTotals()` returns `{ subtotal, totalItemDiscount, taxable, cgst, sgst, roundOff, grandTotal }`. CGST = SGST = taxable × gst%/200 (per item, then summed).
- Persist breakdown into `primary_orders` columns that already exist: `subtotal`, `discount_amount`, `tax_amount`, `total_amount`. Per-item `discount_amount` / `tax_amount` / `tax_rate` already exist on `primary_order_items` (26 cols) — fill them.

## 3. Schemes summary (read-only display, no engine wiring)

Out-of-scope per your selection — we'll show a placeholder "Schemes" line that reads `0` for now (only the **detailed totals panel** was selected). Easy to wire `product_schemes` later by reusing `schemeEngine` from the rep Cart.

## 4. Routing

In `src/App.tsx` near line 499 add:
```tsx
<Route path="primary-order/:id/edit" element={<CreatePrimaryOrder />} />
```

## Out of scope

- Per-item scheme auto-apply (would require porting `useOfflineSchemes` + `schemeEngine` into distributor context).
- Editing non-draft orders.
- Backend/RPC changes.

## Files touched

- `src/pages/distributor-portal/CreatePrimaryOrder.tsx` (edit-mode hydration, totals panel, per-line discount + GST inputs)
- `src/App.tsx` (one route line)
