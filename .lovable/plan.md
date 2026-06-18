## Why "Pending Amount: ₹490" is wrong (root cause)

The order in DB is correct: total ₹445, paid ₹200, credit_pending ₹245. But `retailers.pending_amount` got written as **₹490 = ₹245 × 2**. Audit table confirms this exactly:

```
retailer_pending_audit:
  before=245, delta=+245, after=490, reason=order_sync_v2
```

So at the moment the RPC ran, retailer.pending_amount was **already** 245, and the RPC added another 245.

**The double-write bug** is in `src/pages/Cart.tsx`:

1. `submitOrderWithOfflineSupport(...)` returns immediately (`offline: !navigator.onLine`) and fires `sync_order_with_items` RPC in the **background** (line 292 — not awaited).
2. Cart then runs synchronously: `UPDATE retailers SET pending_amount = newTotalPending (245)` (lines 980–995, and a copy at 1699–1708 for the D-1 path).
3. The background RPC `sync_order_with_items_v2` reads `pending_amount` (now 245, just written by Cart) and does `pending_amount = pending_amount + v_delta` where `v_delta = credit_pending_amount - previous_pending_cleared = 245 - 0 = 245` → **490**.

The RPC's additive write is the correct authoritative path (it also writes `retailer_pending_audit`). The client-side Cart UPDATE is leftover/redundant and is what causes double-counting.

(Answer to the question in your reviewer's note: yes, all post-order payments via Mark Payment Received do create `retailer_payment_allocations` rows — `apply_retailer_payment_fifo` inserts them unconditionally inside the same transaction. So `original_credit_amount = credit_pending_amount + sum(allocations)` is accurate for any order that wasn't manually patched in the DB.)

## Why the Today's Order panel correctly shows ₹245 but the banner shows ₹490

The "Today's Order" yellow box renders `credit_pending_amount` of the order (₹245 — correct).
The orange "Pending Amount" banner renders `retailers.pending_amount` (₹490 — wrong because of the double-write above).

## Fix

### 1. Code — remove the redundant client-side UPDATEs in `src/pages/Cart.tsx`

- Delete the block at **lines 979–995** (`Update retailer's pending_amount and last_order_date` after `submitOrderWithOfflineSupport` for the regular flow).
- Delete the block at **lines 1699–1708** (the same UPDATE in the D-1 delivery flow).
- Keep the existing `last_order_date` write only by moving that single field into a small `UPDATE retailers SET last_order_date = ... WHERE id = ...` (no `pending_amount`), since `last_order_date` is not handled by the RPC.

The RPC `sync_order_with_items_v2` already:
- Adds `credit_pending_amount − previous_pending_cleared` to `retailers.pending_amount` atomically inside the same transaction.
- Writes a row to `retailer_pending_audit` for traceability.
- Works for online, slow-connection-retry, and genuinely-offline (queued → synced later) paths.

The old-format branch in `useOfflineSync.ts` (lines 646–677) still does its own additive write only for legacy queued orders that don't take the v2 RPC path — leave it as-is (it doesn't race with Cart because Cart never wrote when `result.offline` was true).

### 2. Data — one-off backfill for retailers whose pending_amount drifted

Reset every retailer's `pending_amount` to the authoritative sum across their credit orders:

```sql
UPDATE public.retailers r
   SET pending_amount = COALESCE(s.sum_pending, 0),
       updated_at = now()
  FROM (
    SELECT retailer_id, SUM(COALESCE(credit_pending_amount, 0)) AS sum_pending
      FROM public.orders
     WHERE is_credit_order = true
     GROUP BY retailer_id
  ) s
 WHERE r.id = s.retailer_id
   AND COALESCE(r.pending_amount, 0) <> COALESCE(s.sum_pending, 0);
```

Also explicitly zero out retailers with no credit orders but a non-zero stored pending (cleanup of orphaned values):

```sql
UPDATE public.retailers
   SET pending_amount = 0,
       updated_at = now()
 WHERE COALESCE(pending_amount, 0) <> 0
   AND id NOT IN (SELECT retailer_id FROM public.orders WHERE is_credit_order = true);
```

This will reset Bogadi Provisions from ₹490 → ₹245 immediately and clean any other retailers affected by the same double-write before the code fix.

## Out of scope (intentional)

- Not changing the partial-payment math that puts the *combined* (prev pending + new) into `credit_pending_amount` of the new order. That's a separate design question and would require a per-collection ledger redesign.
- Not touching `apply_retailer_payment_fifo`, `PaymentMarkingModal`, or `useRetailerCreditHistory` — those are already correct after the previous plan.
