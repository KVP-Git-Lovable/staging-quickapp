# Send OTP via MSG91 from Retailer Overview

## Scope
Add a "Send OTP" test button beside the Owner's Number in the Retailer Overview modal (`RetailerDetailModal.tsx`), backed by a new Supabase Edge Function that calls MSG91's Flow API using a server-side auth key.

## Backend

**Secret**
- Prompt user via `add_secret` for `MSG91_AUTHKEY` (user-provided credential from MSG91 dashboard).

**Edge Function: `send-retailer-otp`** (`verify_jwt = true`, added to `supabase/config.toml`)
- Input (validated with zod): `{ retailer_id: string, retailer_name: string, mobile: string }`.
- Normalize mobile: strip non-digits; accept `10` digit Indian numbers or `12` digit starting with `91`; reject otherwise with 400.
- Generate 6-digit OTP: `String(Math.floor(100000 + Math.random()*900000))`.
- POST to `https://control.msg91.com/api/v5/flow` with headers `accept`, `content-type`, `authkey: Deno.env.get('MSG91_AUTHKEY')` and body:
  ```json
  {
    "template_id": "6a50862e39b1722f50058a55",
    "short_url": "0",
    "realTimeResponse": "1",
    "recipients": [{ "mobiles": "91XXXXXXXXXX", "VAR1": "<name>", "VAR2": "<otp>" }]
  }
  ```
- Console-log retailer id/name/mobile/OTP and MSG91 response (test-only, as requested).
- Return `{ success: true }` on MSG91 2xx; otherwise `{ success: false, error: <msg91 message or status> }` with the actual MSG91 error text passed through.
- Include CORS headers on all responses.

## Frontend (`src/components/RetailerDetailModal.tsx`)

- Add helper `isValidIndianMobile(phone)` — true when digits-only length is 10 or (12 starting with 91).
- Add local state `sendingOtp: boolean`.
- Beside the Owner's Number display (view mode, ~line 1233), render a small `Button` "Send OTP" (size sm, variant outline):
  - `disabled={!isValidIndianMobile(formData.phone) || sendingOtp}`
  - On click: call `supabase.functions.invoke('send-retailer-otp', { body: { retailer_id: retailer.id, retailer_name: formData.name, mobile: formData.phone } })`.
  - Show spinner icon while pending.
  - `toast.success('OTP sent successfully.')` on success; `toast.error(err.message || 'Failed to send OTP')` showing the MSG91 error on failure.

## Provider Abstraction (future-proofing)
Edge function structured as `sendOtp({ mobile, name, otp })` internal helper → currently routes to `msg91Provider`. Swapping providers later only requires editing the function; frontend contract stays the same.

## Acceptance
- Button appears beside Owner's Number; disabled without valid 10-digit (or 91-prefixed 12-digit) number.
- Each click generates a fresh 6-digit OTP server-side.
- MSG91 called with correct template + payload; auth key never sent to browser.
- Success/error toasts reflect real MSG91 response.

## Files touched
- `supabase/functions/send-retailer-otp/index.ts` (new)
- `supabase/config.toml` (register function; keep JWT verified)
- `src/components/RetailerDetailModal.tsx` (button + handler)
- Secret: `MSG91_AUTHKEY` via `add_secret`
