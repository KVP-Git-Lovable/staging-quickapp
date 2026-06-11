# Send Welcome WhatsApp on Add Retailer

## Goal
Whenever a retailer is added, send a WhatsApp template message (Twilio ContentSid `HXa4311ea6f7d67093fe5426e224645038`) to the retailer's phone with:
- `{{1}}` = retailer name
- `{{2}}` = retailer phone
- `{{3}}` = retailer address

Use the same Twilio account/sender (`whatsapp:+917411681616`) and `TWILIO_AUTH_TOKEN` already used by existing WhatsApp functions. No other features touched.

## Changes

### 1. New edge function `supabase/functions/send-retailer-welcome-whatsapp/index.ts`
- Accepts `{ retailer_id }`.
- Loads `name, phone, address` from `retailers` via service-role client.
- Normalises phone (reuse logic from `send-retailer-verification-whatsapp`: 10 digits → +91, etc.).
- POSTs to Twilio Messages API with:
  - `To: whatsapp:<normalised phone>`
  - `From: whatsapp:+917411681616`
  - `ContentSid: HXa4311ea6f7d67093fe5426e224645038`
  - `ContentVariables: {"1": name, "2": phone, "3": address}`
- Returns JSON success/failure. CORS + OPTIONS handled. Registered in `supabase/config.toml` with `verify_jwt = false` (matches sibling functions).

### 2. New util `src/utils/retailerWelcomeWhatsAppTrigger.ts`
- Exports `sendRetailerWelcomeWhatsApp(retailerId, phone)`.
- Fire-and-forget invoke of `send-retailer-welcome-whatsapp`; swallow errors with a `console.warn` so it never blocks the create flow (mirrors `maybeTriggerWhatsAppVerification` style — but no policy check, since user wants it on every add).

### 3. Wire into existing "Add retailer" flows
Call the new helper right after a successful insert in the same two places that already fire the verification trigger:
- `src/pages/MyRetailers.tsx`
- `src/components/AddRetailerInlineToBeat.tsx`

No business-logic changes; just an additional fire-and-forget call alongside the existing verification trigger.

## Out of scope
- No DB schema changes, no policy changes, no edits to retailer creation logic itself, no changes to invoice/verification flows.
