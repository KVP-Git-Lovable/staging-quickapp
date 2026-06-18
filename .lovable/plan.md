# Plan: Order-level reconciliation + Retailer Credit History

Two coordinated changes to close the gap between the rep "Pay" action in *My Visit* and the underlying credit orders, and to give reps/admins visibility into a retailer's credit-and-payment cycle.

---

## Part 1 — Reconcile orders on payment (FIFO)

**Problem today**
`PaymentMarkingModal` only updates `retailers.pending_amount` and inserts a row into `retailer_payment_collections`. The originating credit orders (`orders.is_credit_order = true`, `credit_pending_amount > 0`) are never touched, so order-level paid/pending is permanently out of sync with the retailer's aggregate balance.

**What we'll build**

1. **New SECURITY DEFINER RPC `apply_retailer_payment_fifo(p_retailer_id, p_amount, p_collection_id, p_payment_method, p_proof_url)**` that runs atomically:
  - Lock the retailer's open credit orders (`is_credit_order = true AND credit_pending_amount > 0`) ordered by `order_date ASC, created_at ASC` with `FOR UPDATE SKIP LOCKED`.
  - Walk them, applying the payment amount: increase `orders.credit_paid_amount` and decrease `orders.credit_pending_amount`; when an order reaches 0 pending, set `payment_status = 'paid'`; partial → `'partial'`.
  - Recompute and update `retailers.pending_amount = SUM(credit_pending_amount)` for the retailer (single source of truth, no drift).
  - Return JSON `{ allocations: [{ order_id, applied_amount, remaining_after }], unallocated_amount }`.
2. **New table `retailer_payment_allocations**` (audit of which collection settled which order, mandatory for history & reporting):
  - `collection_id` → `retailer_payment_collections.id`
  - `order_id` → `orders.id`
  - `retailer_id`, `amount_applied`, `applied_at`
  - RLS: same scope as `retailer_payment_collections` (rep can read own; admins via existing helpers).
  - GRANTs to `authenticated` and `service_role` per project policy.
3. `**PaymentMarkingModal` change**
  - Replace the direct `UPDATE retailers SET pending_amount = ...` with: insert the collection row first (to get `collection_id`), then `supabase.rpc('apply_retailer_payment_fifo', { ... })`.
  - On success, call `onPaymentMarked(result.new_pending_amount)` using the value returned by the RPC instead of computing it client-side.
  - Toast still shows the amount; an extra line shows "Settled N invoice(s)".
  - Offline path: queue the same RPC call in the existing IndexedDB retry queue (treat like any other write — never-expire, 23505 → success).
4. **Backfill (one-off, optional, opt-in)**
  - Provide a separate admin RPC `backfill_retailer_payment_allocations()` that, for each retailer, walks historical `retailer_payment_collections` ordered by date and FIFO-applies them to historical credit orders. NOT auto-run; surfaced as a button on an admin page only if the user asks for it later.

**Why an RPC and a separate table?** Concurrency safety (rep + admin collecting at the same time on different devices), historical traceability ("which payment cleared invoice #123"), and so reports can compute days-to-clear from the allocation row, not from the collection row alone.

---

## Part 2 — Retailer Credit History view

**Where it lives**

- New drawer `RetailerCreditHistoryDrawer.tsx` opened from:
  - The pending banner on `VisitCard` (small "History" link beside Tips/Pay).
  - A button on the retailer detail page so admins can open it without a visit.

**What it shows** (single drawer, three stacked sections)

1. **Summary KPIs (top strip, 4 chips, all derived — no hardcodes):**
  - Total credit taken (lifetime) = `SUM(total_amount)` over `orders` where `is_credit_order = true`.
  - Total cleared = `SUM(credit_paid_amount)`.
  - Currently pending = `retailers.pending_amount` (cross-checked with `SUM(credit_pending_amount)`).
  - Avg days-to-clear = average of `(fully_paid_at - order_date)` across orders that reached `payment_status = 'paid'`, where `fully_paid_at` = max(`applied_at`) from `retailer_payment_allocations` for that order.
2. **Credit orders timeline** — list of credit orders newest-first:
  - Order #, date, total, paid so far, pending, status badge.
  - Expand to see the allocations that have settled it (from `retailer_payment_allocations`) with date + method + collector.
3. **Collections timeline** — list from `retailer_payment_collections` newest-first:
  - Date, amount, method, proof thumbnail (signed URL), collected_by name, revenue_owner name.
  - Each row expands to show the FIFO allocations it produced (which orders it cleared and by how much).

**Data hooks**

- `useRetailerCreditHistory(retailerId)` — one React Query that fetches the three datasets in parallel (orders, collections, allocations) plus the KPI aggregates, paginated to last 100 of each with "Load more".
- All currency/date strings use the existing `toLocaleString('en-IN')` / `date-fns` helpers — no hardcoded sample numbers.

**No revenue/business-logic changes beyond Part 1.** Revenue reporting that already reads `orders.credit_paid_amount` / `payment_status` will automatically reflect rep collections once Part 1 lands.

---

## Files to touch

**New**

- `supabase/migrations/<new>.sql` — `retailer_payment_allocations` table (with GRANTs + RLS), `apply_retailer_payment_fifo` RPC, optional backfill RPC.
- `src/hooks/useRetailerCreditHistory.ts`
- `src/components/RetailerCreditHistoryDrawer.tsx`

**Edited**

- `src/components/PaymentMarkingModal.tsx` — switch from direct UPDATE to RPC; surface allocation count in toast.
- `src/components/VisitCard.tsx` — add small "History" link in the pending banner (lines ~2724–2766); after `onPaymentMarked`, also invalidate the credit-history query.
- `src/utils/offlineErrorHandler.ts` / offline queue mapping — register the new RPC so partial-offline payments are retried with the same FIFO semantics.  
  
Before deployment, confirm:
  1. ✅ Idempotency protection against duplicate RPC retries.
  2. ✅ Overpayment handling.
  3. ✅ Retailer row locking.
  4. ✅ Database constraints on payment amounts.
  5. ✅ Allocation records written within the same transaction.
  If those five items are included, I would consider this a **production-ready design** and a significant improvement over the current implementation.

## Out of scope (call out, don't build)

- Linking rep collections into `distributor_payments` / `payment_allocations` (distributor-portal invoice settlement) — that's a separate ledger and would need an explicit decision from you.
- Admin backfill is delivered as an RPC only; no UI for it in this round.
- Credit-score recomputation triggered by payments — not changed; existing `useCreditScoreCalculation` will pick up the cleaner data on its next run.