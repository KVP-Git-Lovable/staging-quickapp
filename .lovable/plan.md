# Bring back "Initiate Customer Portal" in Retail Management

## What we're porting

The exact feature already built in your `Nayak Distributors Test2` project: a "Customer Portal" card on the retailer detail view with:

- Status badge (Active / Inactive)
- Portal Orders count + Last Portal Order summary
- Login phone + 4-digit PIN (with copy button) when active
- Buttons: **Initiate Customer Portal**, **Reset PIN**, **Deactivate**
- "Open Portal" link to `/customer-portal/login` (opens in new tab)

State is stored on the existing `retailers` table via `portal_enabled` (boolean) and `portal_pin` (text). Both columns already exist in this project's DB — confirmed — so no migration is needed.

## Files to add / change

1. **NEW** `src/components/retailer/RetailerCustomerPortalSection.tsx`
  Port the component verbatim from the other project (300 lines, self-contained, uses only shadcn UI + supabase client + sonner/toast). Reads/writes `retailers.portal_enabled`, `retailers.portal_pin`, and counts `orders` where `order_source = 'portal_order'`.
2. **EDIT** `src/pages/RetailManagement.tsx`
  In the retailer detail dialog (the dialog opened by clicking a row name / Edit), mount `<RetailerCustomerPortalSection retailerId={selected.id} retailerPhone={selected.phone} portalEnabled={selected.portal_enabled} portalPin={selected.portal_pin} onPortalUpdate={loadRetailers} />` inside the dialog body, near the verification card. No other UI on the page changes.
3. **EDIT** `src/pages/RetailManagement.tsx` select list
  The current fetch is `select('*')`, so `portal_enabled` and `portal_pin` already come through — no query change needed. Just thread them onto the `Retailer` type used in that file.

## Out of scope

- No changes to `VirtualizedRetailerTable.tsx` row actions (no per-row globe button this round — the action lives inside the detail dialog, matching the other project).
- No edits to `RetailerDetailModal.tsx`. Retail Management uses its own dialog; we mount the section there only.
- No new edge functions, no migrations, no RLS changes, no WhatsApp / Bolna / distributor-portal work.
- Customer portal pages themselves are not built here — the "Open Portal" link points at `/customer-portal/login` which is hosted in the separate Nayak project (same pattern as the source project).  
4.No change to existing WhatsApp or Bolna flow.

## Verification

1. Open Retail Management → click a retailer with a phone → detail dialog shows the new "Customer Portal" card with badge "Inactive" and an "Initiate Customer Portal" button.
2. Click Initiate → PIN appears, badge flips to Active, toast shows the PIN, `retailers.portal_enabled=true` in DB.
3. Reset PIN updates `portal_pin` and shows new PIN. Deactivate clears both.
4. For a retailer with no phone, Initiate button is disabled and helper text shows.
5. Portal Orders count reflects `orders.order_source = 'portal_order'` rows for that retailer.