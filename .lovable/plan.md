
## Background

The `retailers` table has NO `verification_status` column (confirmed via schema query — only `verified`, `verification_score`, `verification_method`, `verified_by`, `whatsapp_verified`, `retailer_confirmed`, `verified_at`, `verification_address/contact/territory` exist). Code and DB functions still reference `verification_status`, causing the sync error `record "r" has no field "verification_status"`.

We will standardize on the existing columns and drop all `verification_status` usage from code, edge functions, and DB functions/triggers.

## Status mapping (replaces `verification_status`)

Derived purely from existing columns:
- `verified` → `verified = true` (or `verification_score >= 70`)
- `unverified / pending` → `verified = false AND verification_score < 40`
- `needs_attention` → `verified = false AND verification_method = 'whatsapp' AND whatsapp_verified = false` (i.e., customer replied NO) — tracked via existing `verification_notes`
- `dropped` → `status = 'inactive'`

No new columns needed.

## Step 1 — Fix the immediate sync error (DB)

Migration to recreate any DB function/trigger that references `r.verification_status` or `NEW.verification_status`, using the mapping above. Functions to fix:
- `calculate_retailer_quality_score` (latest migration `20260612073108`)
- The retailer audit trigger from `20260610085615` (drops the `verification_status` audit branch)

## Step 2 — Remove `verification_status` from frontend

### `src/pages/RetailManagement.tsx`
- Drop the `verification_status` field from the local `Retailer` type (line 74).
- Replace all 15 read/write sites (lines 257, 281, 327, 457, 494–497, 534–537, 593–594, 973, 1030, 1033) with derived status using the mapping above. Introduce a single helper `getVerificationStatus(r)` returning `'verified' | 'pending' | 'needs_attention' | 'dropped'`.
- Remove writes to `verification_status` in the inline status update (lines 281, 327) — instead update `verified`, `verification_score`, and `status` directly.

### `src/components/retailer/ApprovalChecklistDialog.tsx`
- Lines 221/231/234/237: remove `patch.verification_status = …`. Replace with:
  - verified branch → `patch.verified = true; patch.verification_score = max(80, current); patch.verified_at = now; patch.verified_by_name = currentUser`
  - needs_attention branch → `patch.verified = false; patch.verification_notes = '...'`
  - dropped branch → `patch.status = 'inactive'`

## Step 3 — Auto-send WhatsApp after AddRetailer

In `src/pages/AddRetailer.tsx`, after successful insert, call the existing helper:
```ts
import { maybeTriggerWhatsAppVerification } from '@/utils/retailerVerificationTrigger';
await maybeTriggerWhatsAppVerification(newRetailerId, phone);
```
This already respects the `retailer_verification_policy.auto_whatsapp_on_create` flag and is fire-and-forget — consolidates with the RetailManagement "WhatsApp Verify" button (which uses the same edge function).

## Step 4 — Auto-fill on WhatsApp YES (already 90% done)

`supabase/functions/whatsapp-retailer-verify-inbound/index.ts` already updates `verified=true, whatsapp_verified=true, verification_method='whatsapp', verification_score=max(80,…), verified_at=now, verified_by_name='WhatsApp', verification_address=true, verification_contact=true`. Changes:
- Remove the `verification_status: "verified"` and `verification_status: "needs_attention"` fields (lines 87, 129) — they cause the same sync error.
- Add `retailer_confirmed = true` on YES.
- Keep the new thank-you reply text already in place.

## Step 5 — Partial verification editing in ApprovalChecklistDialog

When opening the dialog for a retailer with `verification_score > 0 AND verification_score < 100`:
- Pre-check items already satisfied (whatsapp_verified, verification_address, verification_contact, retailer_confirmed, photo present, owner_name present, etc.).
- Show header "Continue verification — X% complete".
- On save, recompute score from currently checked items (use the same weights as `calculate_retailer_quality_score`) and update `verification_score` + the corresponding boolean columns. No locked state below 100%.

## Step 6 — Offline queue for verification messages

In `src/hooks/useOfflineRetailers.ts` (the actual offline retailer hook — `useOfflineSync.ts` cited in the report doesn't exist; this is the right place):
- After local save in `createRetailer`, also enqueue a `SEND_VERIFICATION` job with `{ retailer_id, phone, retry_count: 0 }`.
- In the offline sync processor (`src/lib/offlineStorage.ts` queue handler), add a handler for `SEND_VERIFICATION` that, once the parent `CREATE_RETAILER` has succeeded and we are online, invokes `send-retailer-verification-whatsapp`.
- Ordering: process `SEND_VERIFICATION` only after the matching `CREATE_RETAILER` has a server-confirmed row (use the retailer_id which is the same UUID).

## Step 7 — Consolidate WhatsApp send paths

Both AddRetailer and RetailManagement's `sendWhatsAppVerification()` (line 572) will route through `maybeTriggerWhatsAppVerification` (or directly through `supabase.functions.invoke('send-retailer-verification-whatsapp')`). One edge function, one trigger helper, two entry points.

## Technical notes

- No schema changes other than recreating two DB functions / one trigger to drop `verification_status` references.
- `src/integrations/supabase/types.ts` is auto-regenerated; no manual edit.
- All status filtering/KPI logic moves to a single derived helper to avoid drift.
- Edge function changes: only `whatsapp-retailer-verify-inbound` (remove 2 field writes, add `retailer_confirmed`).
- Offline queue uses existing IndexedDB sync queue infra — no new store.

## Out of scope

- No UI redesign of RetailManagement or AddRetailer beyond the "Continue verification" affordance.
- No changes to Bolna calling, attendance, or other modules.
