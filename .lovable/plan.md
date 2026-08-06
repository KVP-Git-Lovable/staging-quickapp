# Zoho Books: Settings scope findings and path for Product/Tax/Unit/Price sync

## What I verified on your live connection

Your linked connection (SHRAVAN's Zoho Books, region `in`) reports:

- Granted scopes: `ZohoBooks.settings.READ`, `contacts.ALL`, `invoices.ALL`, `estimates.ALL`, `salesorders.ALL`, `purchaseorders.ALL`, `bills.ALL`, `expenses.ALL`, `projects.ALL`
- Scopes the connector can additionally request: only `ZohoBooks.customerpayments.ALL` and `ZohoBooks.creditnotes.ALL`

So: **`ZohoBooks.settings.ALL` / `.CREATE` / `.UPDATE` are not offered by the built-in connector**, and I cannot add them by reconnecting — the reconnect scope picker only exposes the two scopes listed above. The built-in connector is intentionally read-only for Settings.

A read-only smoke test confirmed the read side works today: `GET /items?organization_id=60080896175` returned HTTP 200 with your item `WOOD` (rate 20000, unit `box`). No data was created or modified.

## What that means for the four sync objects

Items (Products), Taxes, Units, and Price Lists all live under Zoho's **Settings** scope family.

| Direction | Supported by built-in connector |
|---|---|
| Read Zoho -> QuickApp (products, taxes, units, price lists) | Yes, works now with `settings.READ` |
| Write QuickApp -> Zoho (create/update items, taxes, units, price lists) | No. Zoho will reject with an authorization error |

Customer sync keeps working unchanged, because it uses `contacts.ALL`.

## Recommended path

Pick one of two:

**Option A — Read-only sync through the built-in connector (no new setup).**
Extend the existing `zoho-sync-customers` gateway pattern with new read-only modes that pull Zoho Items, Taxes, Units and Price Lists into QuickApp for mapping/reconciliation, showing a diff of "in Zoho but not in QuickApp" and vice versa. Zoho stays the master for these masters; QuickApp writes nothing.

**Option B — Custom (self-managed) OAuth app for the write direction.**
Register your own Zoho API Console client on the India DC with `ZohoBooks.settings.ALL` plus the other scopes you need, obtain a refresh token once, store `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` / `ZOHO_REFRESH_TOKEN` / `ZOHO_ORG_ID` as secrets, and have a dedicated edge function refresh tokens itself and push products/taxes/units/prices. This is the only way to get write access to Settings objects today. Keep the built-in connector for contacts/invoices so nothing existing regresses.

A hybrid is fine too: built-in connector for contacts + invoices, custom OAuth client only for the Settings-scoped master data.

## Technical notes

- Gateway base stays `https://connector-gateway.lovable.dev/zoho_books`, paths after `/books/v3`, headers `Authorization: Bearer ${LOVABLE_API_KEY}` and `X-Connection-Api-Key: ${ZOHO_BOOKS_API_KEY}`.
- Custom-OAuth calls would instead go direct to `https://www.zohoapis.in/books/v3/...` with `Authorization: Zoho-oauthtoken <access_token>`, refreshed via `https://accounts.zoho.in/oauth/v2/token`.
- The `zoho_sync_enabled` gate in the readiness view stays untouched in either option.
- GST-off handling already implemented for contacts applies equally to items (`hsn_or_sac`, `item_tax_preferences` only when GST is on).

## Decision needed

Do you want Option A (read-only pull, quick), Option B (custom OAuth so QuickApp can push masters into Zoho), or the hybrid?
