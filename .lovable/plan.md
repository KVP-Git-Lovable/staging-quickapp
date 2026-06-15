# Retailer Welcome WhatsApp — Plan

## Important: Template is NOT approved

Twilio Console shows your template `HX6e7fa49a06bd178381b36adcc5d7cf71`:
- **WhatsApp approval status: Not submitted**
- **WhatsApp category: Not submitted**

This means **Meta has not approved it yet**. Twilio will:
- Deliver it only to numbers joined to your Twilio WhatsApp **Sandbox** (test mode), OR
- Reject it with error `63016` ("Failed to send freeform message because you are outside the allowed window") / `63018` when sending to real customers.

**You must submit the template for WhatsApp approval in Twilio Console → Content Template Builder → open template → "Submit for WhatsApp approval"**, pick a category (e.g. UTILITY), and wait for Meta approval (usually minutes to a few hours). Until that's done, real retailers will not receive it.

I'll still wire everything up so the moment approval comes through, it works without further code changes — and so sandbox testing works today.

## What I'll change

### 1. Add the missing secret
`TWILIO_WELCOME_TEMPLATE_SID = HX6e7fa49a06bd178381b36adcc5d7cf71`

Right now the edge function throws `"TWILIO_WELCOME_TEMPLATE_SID not configured"` because this secret was never set. That's the #1 reason nothing is being sent.

### 2. Surface real errors instead of silent success
`src/utils/retailerWelcomeMessage.ts` is fire-and-forget and only logs to console — so the AddRetailer "Send WhatsApp" button always looks successful even when Twilio rejected the request.

Change it to:
- `async` returning `{ ok: boolean; error?: string; sid?: string }`
- Await the edge function response and propagate `data.error` / `data.twilio`

### 3. Show truthful toast in AddRetailer
`src/pages/AddRetailer.tsx` "Send WhatsApp" handler:
- `await triggerRetailerWelcomeMessage(...)`
- On `ok: true` → success toast with Twilio SID
- On `ok: false` → destructive toast showing the actual Twilio error (e.g. "Template not approved", "Number not in sandbox", "Invalid To number")

### 4. No edge-function code change
`supabase/functions/send-retailer-welcome-whatsapp/index.ts` already correctly uses `ContentSid` and writes to `retailer_verification_requests`. No edits needed.

### 5. No DB migration needed
`retailer_verification_requests` already captures `status`, `twilio_sid`, `error_message`.

## Files to edit
- `src/utils/retailerWelcomeMessage.ts` — make async, return result
- `src/pages/AddRetailer.tsx` — await result, show real success/error toast

## Files NOT touched
- Edge function (already correct)
- Database schema
- Other retailer/portal screens

## How to verify

**Today (template unapproved):**
1. Join your Twilio WhatsApp Sandbox from a test phone (`join <sandbox-code>` to the Twilio sandbox number).
2. Add a retailer with that phone → click "Send WhatsApp" → message arrives in sandbox.
3. Try with a non-sandbox number → toast shows the real Twilio error (proves error surfacing works).

**After Meta approves the template:**
- Add a retailer with any real WhatsApp number → message delivers in production.

## Action required from you
1. **Confirm I should add the `TWILIO_WELCOME_TEMPLATE_SID` secret** with value `HX6e7fa49a06bd178381b36adcc5d7cf71`.
2. **Submit the template for WhatsApp approval** in Twilio Console (I can't do this for you — it's a manual click in Twilio + Meta review).
