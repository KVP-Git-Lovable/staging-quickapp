## Goal
Gate the "welcome WhatsApp" template (`HXa4311ea6f7d67093fe5426e224645038`) — currently fired unconditionally on every Add Retailer — behind a new toggle in **Retail Management → Verification Policy**. The manual **WhatsApp verify** action in the retailer row's 3-dot menu (uses the existing `send-retailer-verification-whatsapp` function) is untouched and keeps working as-is.

## Changes

### 1. DB migration — add policy flag
Add a new boolean column to `retailer_verification_policy`:
- `welcome_whatsapp_on_create boolean NOT NULL DEFAULT true`

(Separate from the existing `auto_whatsapp_on_create`, which controls the verification yes/no template. This new flag controls the welcome template only, so the two channels stay independent.)

### 2. `src/hooks/useRetailerVerificationPolicy.ts`
- Add `welcome_whatsapp_on_create: boolean` to `RetailerVerificationPolicy` interface.
- Add `welcome_whatsapp_on_create: true` to `DEFAULT_POLICY`.

### 3. `src/components/retailer/VerificationPolicyCard.tsx`
- Add a new `<ToggleRow>` directly under the existing "Auto-send WhatsApp on retailer create" toggle (line ~270):
  - Label: **"Send welcome WhatsApp on retailer create"**
  - Hint: "Sends a welcome message with name, phone, and address to the retailer."
  - Bound to `draft.welcome_whatsapp_on_create`.

### 4. `src/utils/retailerWelcomeWhatsAppTrigger.ts`
- Convert helper to async: before invoking the edge function, read `retailer_verification_policy.welcome_whatsapp_on_create` (mirrors the policy check pattern in `retailerVerificationTrigger.ts`).
- If flag is false/missing → silently skip.
- Otherwise invoke `send-retailer-welcome-whatsapp` fire-and-forget as today. All errors still swallowed with `console.warn`.

### 5. Callers (no behaviour change beyond gating)
`src/pages/MyRetailers.tsx` and `src/components/AddRetailerInlineToBeat.tsx` already call `sendRetailerWelcomeWhatsApp(...)` right after the verification trigger. No code changes needed — they continue to fire-and-forget; the gating now happens inside the helper.

## Out of scope
- No edits to the welcome edge function itself (`send-retailer-welcome-whatsapp`).
- No edits to the manual "WhatsApp verify" menu action in `RetailManagement.tsx` — it stays a manual trigger using the verification template.
- No changes to the existing `auto_whatsapp_on_create` verification flow.
