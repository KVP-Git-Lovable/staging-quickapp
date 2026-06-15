## Findings

1. The Customer Portal already has the Schemes tab and `CustomerSchemes.tsx` page (queries `product_schemes` where `is_active = true AND show_in_portal = true`).
2. The DB column `product_schemes.show_in_portal` exists, but the admin **Scheme Master** form (`SchemeFormFields.tsx` + `SchemeMaster.tsx`) has **no toggle** for it and the insert/update payloads don't set it. So every scheme stays at the default and nothing appears in the Customer Portal — that's why the screen looks empty.
3. The "Show in Customer Portal" panel visible in your screenshot is a mock/desired state — it isn't actually rendered by current code.
4. Customer Portal Cart (`CustomerCart.tsx`) does not surface any scheme proximity hint like "add 5 more to avail offer".

## What I'll change

### A. Make "Show in Customer Portal" a real, working toggle
- `src/components/SchemeFormFields.tsx`: add a `Switch` block (next to Active) bound to `schemeForm.show_in_portal` with helper text "Visible to customers in the Customer Portal".
- `src/components/SchemeMaster.tsx`:
  - Add `show_in_portal: false` to `initialSchemeForm`.
  - Include `show_in_portal: schemeForm.show_in_portal` in the **insert** and **update** payloads.
  - When opening an existing scheme for edit, hydrate `show_in_portal` from the row.
  - Add a small "Portal" badge in the schemes table row when `show_in_portal` is true so admins can see at a glance which schemes are public.

### B. Cart scheme-proximity alerts ("Add 5 more to avail offer")
- New helper `src/utils/customerSchemeHints.ts`:
  - Given the current cart lines and the active portal schemes, for each line with a `buy_x_get_y` / `volume` / `tiered` / `min qty` scheme matching that `product_id` (or its category), compute `remaining = condition_quantity - cart_qty`.
  - Return `{ schemeId, productId, message, remaining, benefit }` for any line where `remaining > 0` AND `cart_qty > 0` (so it only nudges when they've started adding).
  - Also handle `min_order_value` schemes by comparing cart subtotal.
- Wire into `src/pages/customer-portal/CustomerCart.tsx`:
  - Fetch active portal schemes (reuse same query as `CustomerSchemes.tsx`).
  - Above each cart row (or in a sticky banner below totals), render a soft yellow alert:
    "Add 5 KG more of <Product> to get 1 KG free" with a `+` quick-action that bumps the qty to the threshold via existing `ensureMinimumCartQuantity`.
  - For order-value schemes, show one banner near the totals: "Add ₹250 more to unlock 10% off".
- Reuse the existing `Gift` icon + amber palette already used by `SchemesWidget` for visual consistency.

### C. No DB migration needed
`show_in_portal` column already exists. No schema change.

## Verification
1. Open Scheme Master → Edit Scheme → toggle "Show in Customer Portal" on → Update.
2. Open Customer Portal → Schemes tab → confirm the scheme card appears and the bottom-nav badge increments.
3. Add a partial qty of that product to the cart → confirm yellow "Add N more to avail offer" banner shows with a quick-add button that fills to the threshold.
4. Toggle the switch off → scheme disappears from portal Schemes tab and cart hint vanishes.

## Out of scope
- No changes to the staff app's Order Entry scheme engine (`useAppliedSchemes`, `OrderEntrySchemesModal`).
- No changes to `product_schemes` schema, RLS, or other portal screens (Catalog/Orders).
