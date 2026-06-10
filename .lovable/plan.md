## Goal

Upgrade retailer verification in Retail Management with two distinct flows, a verifier audit trail, a blue tick across the app, and a policy that limits how many orders a Rep can book on an unverified retailer.

---

## 1. Manual Approval — Confirmation Checklist Dialog

Today the "Verify" dialog already has 3 checkboxes (Address, Contact, Territory) and silently marks `verified=true` when all three are ticked. We will replace it with a stricter **Approve Retailer** confirmation dialog.

**Dialog content (each item shows the actual value from the retailer row so admin can eyeball it):**
- ☐ Retailer Name is genuine — shows `name`
- ☐ Address is genuine & matches GPS — shows `address` + "Open in Maps" link
- ☐ Phone Number is genuine — shows `phone` with "Call" + "WhatsApp" quick links
- ☐ Owner Name is genuine — shows `owner_name`
- ☐ Beat / Territory assignment is correct — shows `beat_name` / `territory_name`
- ☐ GST / Shop Type details look genuine (optional, only shown when present)
- Notes textarea (optional)

**Approve button** is disabled until **all mandatory items** are ticked. On approve:
- Set `verification_status = 'verified'`, `verified = true`
- Record `verified_by = auth.uid()`, `verified_by_name`, `verified_at = now()`, `verification_method = 'manual'`, `verification_notes`
- Write a row to a new `retailer_verification_audit` table (who, when, which items, notes, method)

**Reject / Needs Attention** button stays — same behaviour as today but also logged in the audit table.

**Visible verifier badge:** retailer detail panel + row tooltip show "Verified by {name} on {date} (Manual)".

---

## 2. Automated WhatsApp Verification

When a Rep adds a new retailer (and phone is present), the system sends a WhatsApp confirmation message via Twilio (already wired in `send-invoice-whatsapp`; we add a new function `send-retailer-verification-whatsapp`).

**Flow:**
1. On retailer insert (DB trigger or client-side post-insert call) → enqueue WhatsApp send.
2. Edge function sends template message:
   > "Hi {owner_name}, {company} added your shop *{retailer_name}* at {address}. Reply **YES** to confirm or **NO** if details are wrong."
3. Store a row in `retailer_verification_requests` (retailer_id, phone, sent_at, status='sent', token).
4. Inbound webhook (`whatsapp-inbound` edge function — new): match the reply to the latest pending request by phone, then:
   - **YES** → mark retailer `verified=true`, `verification_status='verified'`, `verification_method='whatsapp'`, `verified_at=now()`, `verified_by_name='WhatsApp Self-Confirm'`.
   - **NO** → mark `verification_status='needs_attention'` and notify the Rep + admin.
5. Resend / manual-trigger button in Retail Management for admins ("Send WhatsApp Verification").

**Twilio inbound webhook URL** will be the deployed `whatsapp-inbound` function; user configures it once in Twilio console (we surface the URL in chat after deploy).

---

## 3. Blue Tick Everywhere

`VirtualizedRetailerTable` already renders a `CheckCircle2` blue tick when `verified===true`. Extend the same indicator to:
- Rep mobile retailer list / retailer card
- Order entry retailer picker
- Visit detail header
- Distributor portal retailer ledger header

Single helper `<VerifiedTick retailer={...} />` with tooltip "Verified via {method} by {name} on {date}".

---

## 4. Unverified-Order Policy

New admin-configurable policy table `retailer_verification_policy` (single row per company):

| field | meaning |
|---|---|
| `enabled` | master switch |
| `max_orders_unverified` | e.g. 3 — Rep can book up to N orders before retailer must be verified |
| `block_after_limit` | hard block vs soft warning |
| `grace_days` | optional days after creation before policy kicks in |
| `require_verification_for_credit` | block credit/PDC orders entirely if not verified |

**Enforcement points (client + RPC guard):**
- Order Entry "Place Order" → call `can_place_order_for_retailer(retailer_id)` RPC which counts existing orders and returns `{allowed, reason, remaining}`.
- If blocked: toast "Retailer not verified. {remaining_count_used}/{limit} unverified orders used. Please request verification." with a CTA to trigger WhatsApp verification.

**Admin UI:** new "Verification Policy" card inside Admin Controls → Retail Management section.

---

## 5. Schema changes (single migration)

```sql
ALTER TABLE retailers
  ADD COLUMN verified_by uuid,
  ADD COLUMN verified_by_name text,
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN verification_method text CHECK (verification_method IN ('manual','whatsapp')),
  ADD COLUMN verification_notes text,
  ADD COLUMN unverified_order_count integer NOT NULL DEFAULT 0;

CREATE TABLE retailer_verification_audit (...);          -- who/when/items/notes/method
CREATE TABLE retailer_verification_requests (...);       -- WhatsApp sends + replies
CREATE TABLE retailer_verification_policy (...);         -- per-company policy

CREATE FUNCTION can_place_order_for_retailer(p_retailer_id uuid) RETURNS jsonb ...;
CREATE TRIGGER bump_unverified_order_count AFTER INSERT ON orders ...;
```

RLS: admins manage policy; reps read policy + own retailers' audit; webhook uses service role.

---

## 6. Files to touch

- `src/pages/RetailManagement.tsx` — replace verify dialog with new ApprovalChecklistDialog; add "Send WhatsApp" action; show verifier line.
- `src/components/retailer/ApprovalChecklistDialog.tsx` *(new)*
- `src/components/retailer/VerifiedTick.tsx` *(new)* — replaces ad-hoc `CheckCircle2`
- `src/components/VirtualizedRetailerTable.tsx` — use VerifiedTick (with tooltip)
- `src/pages/AdminControls.tsx` — Verification Policy card
- `src/hooks/useRetailerVerificationPolicy.ts` *(new)*
- Order Entry pages — call `can_place_order_for_retailer` before submit
- `supabase/functions/send-retailer-verification-whatsapp/index.ts` *(new)*
- `supabase/functions/whatsapp-inbound/index.ts` *(new, verify_jwt=false)*
- One migration as above

---

## Open question

For the auto WhatsApp flow, should the verification message be sent **automatically the moment a Rep adds a new retailer**, or only when an **admin / Rep clicks "Send WhatsApp Verification"**? I'd recommend auto on creation + manual resend button, but confirm before I build.
