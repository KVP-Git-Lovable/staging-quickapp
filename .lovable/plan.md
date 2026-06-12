# WhatsApp toggle in Retailer Verification Policy

## What I checked

- **Policy UI** (`src/components/retailer/VerificationPolicyCard.tsx`, Retail Management → Verification Policy tab) already has two toggles:
  - "Auto-send WhatsApp on retailer create" → `auto_whatsapp_on_create`
  - "Send welcome WhatsApp on retailer create" → `welcome_whatsapp_on_create`
  
  They are buried at the bottom of the **Basics** tab under the "Order restrictions" header, which is why they look missing.

- **Send logic** (`src/utils/retailerVerificationTrigger.ts` and `src/utils/retailerWelcomeWhatsAppTrigger.ts`) reads those flags before invoking the edge function and returns early if false. Both client paths (`AddRetailerInlineToBeat.tsx`, `MyRetailers.tsx`) go through these helpers.

- **DB triggers** on `public.retailers`: none send WhatsApp. So the only WA paths are the two helpers above — gating them is sufficient.

- **Current DB row**: both flags are `true`, which is why messages still fire today.

## The problem

The toggles exist but live under a misleading section, so admins can't find them and assume the policy isn't there. Once found, they already work.

## Fix

1. In `VerificationPolicyCard.tsx` Basics tab, lift the two WhatsApp toggles out of "Order restrictions" into their own clearly labeled section:
   - New `SectionHeader`: **"WhatsApp messaging"** with description "Control automated WhatsApp messages sent when a sales user adds a new retailer."
   - Place the two existing `ToggleRow`s under it.
   - Add a short hint under "Auto-send WhatsApp on retailer create": "Turn off to stop the verification WhatsApp when a sales user adds a retailer."
   
2. No backend / trigger changes — gating already works. After the user toggles off and saves, the next retailer added by a sales user will not receive the WhatsApp.

## How to verify

- Open Retail Management → Verification Policy → Basics. Both toggles appear under a new "WhatsApp messaging" section.
- Turn both off, click Save.
- Add a retailer via sales flow → no WhatsApp is sent (confirmed by inspecting `retailer_verification_requests` — no new row, and edge function logs show no invocation).
