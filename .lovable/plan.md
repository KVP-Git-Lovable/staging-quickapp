## What I traced for your test payment

Retailer: **Aarogya Health Foods** — one credit order today.

| Stage | Order total | credit_paid_amount | credit_pending_amount | retailer.pending_amount |
|---|---|---|---|---|
| At order placement (Cart, "partial" payment of ₹100 on a ₹160 order) | 160 | **100** | **60** | 60 |
| After "Mark Payment Received" ₹20 (cash, FIFO) | 160 | **120** | **40** | 40 |

`retailer_payment_collections` has 1 row of ₹20. `retailer_payment_allocations` has 1 row of ₹20 against this order. So the **FIFO RPC, the DB writes, and the per-order math are all correct.** Mark Payment Received already:
- Inserts collection → calls `apply_retailer_payment_fifo` (oldest credit order first)
- Updates `orders.credit_paid_amount`, `orders.credit_pending_amount`, `orders.payment_status`
- Updates `retailers.pending_amount` as authoritative SUM
- Idempotent on `collection_id`

## Where the calculation actually looks wrong: Credit History KPIs

`src/hooks/useRetailerCreditHistory.ts` computes:

```
totalCreditTaken = SUM(orders.total_amount)            // = 160  ❌
totalCleared     = SUM(orders.credit_paid_amount)      // = 120  ❌ (includes the ₹100 already paid at cart)
currentPending   = retailers.pending_amount            // = 40   ✓
```

So the history shows "₹160 credit taken, ₹120 cleared" when in reality **only ₹60 ever went on credit and only ₹20 was actually collected later**. This is the tracing/calculation mismatch.

The correct definitions, derivable from existing data:

```
per order:
  collected_via_collections(order) = SUM(retailer_payment_allocations.amount_applied WHERE order_id = order.id)
  original_credit_amount(order)    = credit_pending_amount + collected_via_collections(order)
                                   = total_amount - (credit_paid_amount - collected_via_collections(order))

totalCreditTaken = SUM(original_credit_amount)         // = 60
totalCleared     = SUM(collected_via_collections)      // = 20  (matches retailer_payment_collections)
currentPending   = retailers.pending_amount            // = 40
```

Invariant check: `totalCreditTaken = totalCleared + currentPending` → 60 = 20 + 40 ✓

## Changes

1. **`src/hooks/useRetailerCreditHistory.ts`** — fix `totalCreditTaken` and `totalCleared` using the allocation-derived formulas above. Also expose per-order `original_credit_amount` and `collected_after_order` on `CreditOrder` so the UI can show "Credit at order time / Collected later / Still pending" per row.

2. **`src/components/CreditHistorySection.tsx` and `src/components/RetailerCreditHistoryDrawer.tsx`** — update the per-order row to show the three derived numbers instead of just `credit_paid_amount`, and tweak KPI labels so "Total Cleared" clearly means "collected after order via Mark Payment Received" (not "paid at cart").

3. **No change to** `PaymentMarkingModal.tsx`, `apply_retailer_payment_fifo`, or any write path — they are correct.

## Out of scope

- Backfilling/rewriting historical `credit_paid_amount` values.
- Changing Cart's partial-payment storage logic.
- Any UI redesign beyond label/number corrections.
