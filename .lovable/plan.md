
## Goal
Let the existing Bolna agent (Tanipriya, +918031151880) verify retailers by phone during an outbound call: fetch details → read them aloud → on "yes/confirm/correct" set `verified = true`.

## Schema note (verified via DB)
The `retailers` table uses `phone` (not `phone_number`). The function will accept `phone_number` in the request body per the spec but query the `phone` column internally, with the same E.164/last-10-digit fallback used by `_shared/bolna.ts` so it tolerates mixed stored formats.

## 1. New edge function: `supabase/functions/verify-retailer-call/index.ts`

- Public (no JWT) — added to `supabase/config.toml` as `[functions.verify-retailer-call] verify_jwt = false`, matching the other Bolna voice functions.
- CORS via the shared `corsHeaders` from `_shared/bolna.ts`.
- Uses `SUPABASE_SERVICE_ROLE_KEY` so it can update `verified` regardless of RLS.
- Parses Bolna's wrapped payload shapes using the existing `parseBolnaPayload` helper.

Body contract:
```json
{ "phone_number": "+919741435887", "action": "fetch" | "confirm" }
```

Behavior:
- `action: "fetch"` → look up retailer with phone normalization (E.164, `+91`, `91`, last-10 ilike fallback). Returns:
  ```json
  { "success": true, "retailer": { "id", "name", "address", "phone_number", "verified" } }
  ```
  If not found → `{ "success": false, "not_found": true, "message": "We could not locate your retailer information. Please contact support." }`
- `action: "confirm"` → same lookup, then `update({ verified: true }).eq('id', retailer.id)`. Returns:
  ```json
  { "success": true, "message": "Retailer verified successfully" }
  ```
- Invalid/missing action or phone → `{ success: false, error: "..." }` with HTTP 200 (Bolna-friendly).
- All responses HTTP 200 with JSON; errors logged via `console.error`.

No DB migration needed — `phone` and `verified` already exist.

## 2. Bolna custom-tool JSON (deliverable to paste into Bolna dashboard)

Two tools, both using the exact wrapper format requested:

### Tool A — `fetch_retailer`
```json
{
  "name": "fetch_retailer",
  "description": "Fetch retailer details from Supabase using the caller's phone number. Call this first, then read the returned name, address and phone number to the retailer and ask them to confirm.",
  "pre_call_message": "Let me pull up your retailer details.",
  "parameters": {
    "type": "object",
    "properties": {
      "phone_number": { "type": "string", "description": "Caller phone in E.164, e.g. +919741435887" }
    },
    "required": ["phone_number"]
  },
  "key": "custom_task",
  "value": {
    "method": "POST",
    "param": { "phone_number": "{{phone_number}}", "action": "fetch" },
    "url": "https://aoxdosjkwqyuvccuwhzc.supabase.co/functions/v1/verify-retailer-call",
    "api_token": null,
    "headers": {
      "Content-Type": "application/json",
      "apikey": "<VITE_SUPABASE_PUBLISHABLE_KEY>"
    }
  }
}
```

### Tool B — `confirm_retailer`
```json
{
  "name": "confirm_retailer",
  "description": "Mark the retailer as verified after they say yes / confirm / correct to the read-back details.",
  "pre_call_message": "Confirming your details now.",
  "parameters": {
    "type": "object",
    "properties": {
      "phone_number": { "type": "string" }
    },
    "required": ["phone_number"]
  },
  "key": "custom_task",
  "value": {
    "method": "POST",
    "param": { "phone_number": "{{phone_number}}", "action": "confirm" },
    "url": "https://aoxdosjkwqyuvccuwhzc.supabase.co/functions/v1/verify-retailer-call",
    "api_token": null,
    "headers": {
      "Content-Type": "application/json",
      "apikey": "<VITE_SUPABASE_PUBLISHABLE_KEY>"
    }
  }
}
```

(The anon key is already publishable and lives in `.env`; I'll paste the literal value into the JSON delivered to you so it's ready to drop into Bolna.)

## 3. Bolna agent prompt snippet (deliverable)

Script to paste into the Tanipriya agent's system prompt:

> When the call connects, call `fetch_retailer` with the caller's phone.
> - If `success` is false / `not_found`: say "We could not locate your retailer information. Please contact support." then end.
> - Otherwise say: "Please confirm your retailer details. Your store name is {{name}}. Your address is {{address}}. Your registered phone number is {{phone_number}}. Are these details correct?"
> - If the retailer says yes / confirm / correct / right / haan / sahi → call `confirm_retailer`, then say "Thank you, your details are now verified."
> - If they say no / wrong / galat → ask "Please tell us what is incorrect and our representative will contact you." then end.

## 4. Out of scope (not touched)
- No UI changes.
- No changes to `bolna-outbound-call`, WhatsApp flows, or any other function.
- No schema migration.

## Deliverables after approval
1. `supabase/functions/verify-retailer-call/index.ts`
2. `supabase/config.toml` entry for `verify_jwt = false`
3. The two ready-to-paste Bolna tool JSON blobs (with the actual anon key filled in) + the agent prompt snippet, posted in chat.
