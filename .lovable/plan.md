# Distributor Financial Configuration + Primary Order Payment Integration

## How it will work (end-user view)

1. **Admin opens a Distributor** → new **"Payment & Credit"** tab between *Pricing* and *FY Plan*. Sets credit rules, default payment term/mode, advance rules, financial controls. Sees a read-only **Financial Snapshot** card (computed from existing ledger tables).
2. **Rep / Distributor Portal user creates a Primary Order** → after Add Products & Review, a new **Payment Details** card auto-populates from the distributor's saved config. Read-only unless the user has override permission. Advance amount + balance payable + payment-proof upload appear conditionally.
3. **Credit Validation** panel reads from distributor config (limit / outstanding / utilization / behaviour rules) and blocks or warns accordingly. Submit is gated by configured rules (advance %, proof upload, approval beyond limit).
4. **After submit**, the order stores everything (term, mode, advance, balance, proof URL, snapshot). Status timeline + new **Edit / Cancel** buttons appear, gated by the Admin's *Order Cancellation/Editing Configuration*. Cancelling requires a reason. All edits/cancels are audit-logged.

```text
Distributor Master
└─ Payment & Credit Tab  (new)
   ├─ Credit Configuration
   ├─ Payment Configuration
   ├─ Financial Snapshot (read-only)
   └─ Financial Controls
                         │
                         ▼  (feeds into)
Primary Order Flow
  Add Products → Review → Payment Details (NEW) → Credit Validation → Submit
                                                                       │
                                                                       ▼
                                                    Order View: timeline + Edit / Cancel
                                                                       │
                                                                       ▼
                                                         Admin Settings → Order Lifecycle Rules
```

---

## Build order

```text
Phase 1  ── DB schema for distributor financial config + order payment fields + cancellation config
Phase 2  ── Distributor Master: "Payment & Credit" tab (4 sections)
Phase 3  ── Primary Order: Payment Details card + Credit Validation rewire + proof upload
Phase 4  ── Order Lifecycle: admin config page + Edit/Cancel buttons + cancellation modal + audit
Phase 5  ── Permissions, override flag, smoke tests
```

Each phase is shippable on its own. Phase 1 has zero UI impact; phases 2–4 each surface visibly.

---

## Phase 1 — Database

### New table: `distributor_payment_config` (1 row per distributor)
- `distributor_id` (FK, unique)
- **Credit**: `credit_allowed`, `credit_limit`, `credit_warning_threshold_pct`, `allow_orders_beyond_limit`, `approval_required_beyond_limit`
- **Payment defaults**: `default_payment_term` (enum), `default_payment_mode` (enum), `require_advance_payment`, `advance_payment_pct`, `require_payment_proof`
- **Controls**: `max_outstanding_allowed`, `overdue_blocking_enabled`, `max_overdue_days`, `approval_required_high_risk`

RLS: read = distributor's own users + their admin hierarchy; write = admin/finance roles only. Standard `service_role` grant.

### New table: `order_lifecycle_config` (global, single row, admin-managed)
- `allow_order_cancellation`, `allow_order_editing`
- `cancellation_cutoff_stage` (enum: draft/submitted/confirmed/processing/allocated/packed/dispatched)
- `editing_cutoff_stage` (same enum)

### Extend `primary_orders`
- `payment_term`, `payment_mode`, `advance_amount` numeric, `balance_payable` (generated col = total − advance), `payment_proof_url`, `payment_status` (pending/partial/paid)
- `credit_snapshot` jsonb — point-in-time snapshot of limit/outstanding/available/utilization at submit
- Audit: `cancelled_by`, `cancelled_at`, `cancellation_reason`, `edited_by`, `edited_at`

### Financial Snapshot — no new table
Compute live in a SQL view / RPC `get_distributor_financial_snapshot(p_distributor_id)` reading from `distributor_retailer_ledger` and `distributor_payments` (already exist). Returns outstanding, available credit (limit − outstanding), utilization %, last payment date, overdue amount.

### Storage
New private bucket **`order-payment-proofs`** (signed URLs). RLS on `storage.objects` to allow distributor's own users + their admin chain to read; uploader writes only to their own distributor's folder.

---

## Phase 2 — Distributor Master "Payment & Credit" tab

File: `src/components/distributor/DistributorTabs.tsx` (or wherever the existing tab list lives — confirm during implementation). Insert new tab between *Pricing* and *FY Plan*.

New component tree under `src/components/distributor/payment-credit/`:
- `PaymentCreditTab.tsx` (container, loads/saves `distributor_payment_config`)
- `CreditConfigurationSection.tsx`
- `PaymentConfigurationSection.tsx`
- `FinancialSnapshotSection.tsx` (calls RPC; auto-refresh every 60s)
- `FinancialControlsSection.tsx`

Single Save button at bottom; zod validation; permission-gated to finance/admin roles.

---

## Phase 3 — Primary Order: Payment Details

File: `src/pages/distributor-portal/CreatePrimaryOrder.tsx` + sibling components.

New card `PaymentDetailsCard.tsx` placed between Order Details and Credit Validation:
- On mount, fetch `distributor_payment_config` for the selected distributor → seed defaults.
- Fields rendered read-only by default; an **"Override"** toggle is shown only if user has `payment.override` permission (added to permission registry).
- Conditional UI:
  - Advance amount appears when term ∈ {Advance Payment, Partial Payment} OR `require_advance_payment=true`.
  - Balance payable is always read-only, formula `grand_total − advance_amount`.
  - Proof upload appears when `require_payment_proof=true` OR Advance Payment chosen. Accepts pdf/jpg/jpeg/png, ≤5MB, uploads to `order-payment-proofs`, stores returned path.

Rewire `CreditValidationCard` to read limits from `distributor_payment_config` (not hardcoded). Block / warn / require-approval according to `allow_orders_beyond_limit` and `approval_required_beyond_limit`. Skip entirely if term = Immediate Payment.

On submit:
- Validate: advance ≤ total, proof uploaded if required, credit rules satisfied.
- Insert `primary_orders` with payment fields + `credit_snapshot` JSONB captured from the RPC.
- Existing offline-first queue used as-is (no new infra).

---

## Phase 4 — Order Lifecycle (Edit / Cancel)

### Admin config page
New route `/admin/settings/order-lifecycle` (visible to admins only). One form bound to `order_lifecycle_config`.

### Order detail page
File: existing primary-order detail view. Add:
- `OrderActions.tsx` — shows Edit / Cancel buttons only when:
  - feature toggle is ON AND current stage is *before* the configured cutoff.
- Disabled-button tooltip explains why ("Order already in Processing — cannot edit").
- `CancelOrderDialog.tsx` — reason select (Ordered by mistake / Duplicate / Stock not required / Financial issue / Other) + optional notes; mandatory. Writes `cancelled_by`, `cancelled_at`, `cancellation_reason`; sets status to `cancelled`; triggers existing 14-step atomic cancellation RPC.
- Edit re-opens the order in the existing CreatePrimaryOrder screen in edit mode; on save, sets `edited_by`/`edited_at` and appends an `order_lifecycle_audit` row.

### Audit
Reuse existing `primary_order_status_history` table for state transitions. Add `order_lifecycle_audit` only if a separate audit row per edit field is required — confirm with you before adding.

---

## Phase 5 — Permissions & smoke tests

- New permissions: `distributor_payment_config.read/write`, `payment.override`, `order.cancel`, `order.edit`.
- Gate them through the existing permission-set architecture (no new RBAC system).
- Smoke tests:
  - Save config → create order → defaults applied, advance/proof required, blocked when over limit.
  - Cancel after cutoff → blocked. Cancel before cutoff with reason → success + audit row.
  - Edit before cutoff → fields editable; after cutoff → buttons hidden.

---

## Open questions before I start (please pick)

1. **Scope this round** — build all 5 phases in one go, or ship Phase 1+2 first (config foundation) and Phase 3+4 in a second pass? I'd recommend the two-step ship; Phase 3 depends on Phase 1 being live.
2. **Existing config tables** — there are already `credit_management_config`, `distributor_credit_limits`, and `distributor_collection_policy` tables. Should I (a) **add** the new `distributor_payment_config` table alongside them, or (b) **extend** the existing ones with the new columns and consolidate? Option (b) is cleaner long-term but riskier.
3. **Cancellation engine** — reuse the existing 14-step atomic cancellation RPC (your memory references it), or build a thinner "soft cancel" path for orders that never reached fulfilment? I'd reuse the existing RPC for consistency.
4. **Order edit** — full re-open of the order screen in edit mode, or a narrower "edit payment details / quantities only" inline modal? Full re-open is more work but matches the spec.
