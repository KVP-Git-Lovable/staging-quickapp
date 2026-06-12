## Root cause
The retailer you just added was created through `/add-retailer` (`src/pages/AddRetailer.tsx`). That page calls `createRetailer(payload)` and then navigates away — it **never invokes** the WhatsApp triggers.

The triggers exist and the policy is enabled:
- DB `retailer_verification_policy`: `auto_whatsapp_on_create = true`, `welcome_whatsapp_on_create = true` ✅
- `src/utils/retailerVerificationTrigger.ts` and `src/utils/retailerWelcomeWhatsAppTrigger.ts` exist and respect those flags.
- They are wired into `src/pages/MyRetailers.tsx` (quick-add modal) and `src/components/AddRetailerInlineToBeat.tsx`, but **not** into `AddRetailer.tsx`.

So any retailer added from the full Add Retailer page silently skips both the verification WhatsApp and the welcome WhatsApp.

## Fix
In `src/pages/AddRetailer.tsx` `performInsert()` (around line 913–927), after `createRetailer` succeeds and we have `result.data.id`, fire the same two dynamic imports used in `MyRetailers.tsx`. Skip them when offline (`result.offline === true`) — the edge functions need network; the triggers will fire on the next manual edit or from the existing sync path.

```ts
if (result.success && !result.offline && result.data?.id && payload.phone) {
  const { maybeTriggerWhatsAppVerification } = await import('@/utils/retailerVerificationTrigger');
  maybeTriggerWhatsAppVerification(result.data.id, payload.phone);
  const { sendRetailerWelcomeWhatsApp } = await import('@/utils/retailerWelcomeWhatsAppTrigger');
  sendRetailerWelcomeWhatsApp(result.data.id, payload.phone);
}
```

Only this single insertion; do not change toast, navigation, or edit-mode behavior. Both utilities already:
- read `retailer_verification_policy` and exit early if the toggle is off
- handle their own errors silently (no UI regression)

## Out of scope
- Policy values, edge functions, and Twilio config are unchanged.
- Edit mode (`isEditMode === true`) keeps current behavior — no resend on edits.
- Offline saves: trigger fires on next online add; we don't queue WhatsApp sends.

## Verification
1. Add a retailer via `/add-retailer` with a valid phone → expect verification + welcome WhatsApp to arrive (policy toggles ON).
2. Turn `auto_whatsapp_on_create` OFF in Verification Policy → add another retailer → no verification message, welcome still sent.
3. Add a retailer while offline → no WhatsApp (expected); no error toast.
4. Edit an existing retailer → no WhatsApp sent (no regression).
