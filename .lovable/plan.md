
## What's actually happening (verified against your data)

Retailer **Annapurna Sweet Shop** — pending ₹2,829 before the new order.

| Order | Date | Total | Paid | Pending | Status |
|---|---|---|---|---|---|
| b8c21427 (new, 24-Jul) | 09:52 | 279 | 0 | **279** | pending |
| 42fb86a7 (10-Jul) | | 1,280 | 0 | 1,280 | pending |
| 3a1096e6 (10-Jul, oldest open) | | 1,828 | 558 → 837 | 1,270 | partial |

At the new order you tapped **Full payment**. What the app did:
- Collected only **₹279** (just the new order's amount).
- Applied it via FIFO → allocation `815e4aaf` landed on the *oldest* open order `3a1096e6`, not on the new order.

Net effect: new order still pending, oldest reduced by 279, retailer pending unchanged at 2,829. Exactly the wrong outcome for "Full".

## What "Full" should mean (your clarification)

- **Full payment** = pay **previous_pending + new_order_total** together → every open order (old + new) becomes `paid`. No FIFO needed; the collection exactly matches all open pending.
- **Partial payment** = pay any amount less than total due → keep current FIFO oldest-first behaviour (correct as-is).
- **Credit** = collect nothing → new order joins pending list, old pendings untouched (correct as-is).

## Root cause

`src/pages/Cart.tsx` lines 1030–1058 treat Full as "pay this order's total only" and always route through `apply_retailer_payment_fifo`:

```ts
} else if (paymentType === "full") {
  // Full payment - routed through FIFO post-insert. ...
  creditPaid = 0;
  creditPending = totalAmount;   // ← only the new order's amount
  ...
}
```

Two bugs:
1. The collection amount is `totalAmount` (new order only) — it should be `pendingAmountFromPrevious + totalAmount` when there's prior pending.
2. Full is routed through FIFO — for a true "clear everything" collection, FIFO happens to work (it will pay every open order), but only if the amount is right. Bug #1 defeats it.

Partial has the correct FIFO behaviour today and stays untouched.

## Fix

1. **Cart.tsx — Full payment path**
   - When `paymentType === "full"`, set the collection amount to `pendingAmountFromPrevious + totalAmount` (the full outstanding, not just the new order).
   - Keep the FIFO call — with the correct amount, FIFO will settle every open order in one shot (oldest → newest, including the just-inserted new order).
   - Set `previous_pending_cleared` on the new order to the actual amount that flowed to older invoices (read back from `retailer_payment_allocations`), so the receipt shows "cleared ₹2,829 old dues + ₹279 this order".
   - Same change in the offline branch (~line 1945) so the optimistic cache reflects "all paid".

2. **UI copy on the Full option**
   - Show the true amount that will be collected: **"Full payment — collect ₹{previous_pending + new_order_total}"** with a small breakdown line ("₹2,829 old dues + ₹279 this order"). Removes the ambiguity that caused this bug in the first place.

3. **Partial and Credit paths**
   - No behaviour change. Partial keeps FIFO oldest-first. Credit stays as-is.

4. **Data repair for Annapurna (one-off, not a migration)**
   - You have two options — I'll do whichever you pick:
     - **A. Reassign the ₹279 allocation** from order `3a1096e6` to the new order `b8c21427`, so the new order shows `paid` and `3a1096e6` returns to pending 1,549. Retailer pending stays 2,829. This matches what would have happened if you'd tapped "Credit" (and is safe if you didn't actually collect ₹2,829 more in cash).
     - **B. Record the missing ₹2,829 collection** (only if you really did receive that cash) so every old order + the new order becomes `paid` and retailer pending goes to 0.

## Out of scope

- No change to the standalone "Collect Payment" drawer — it's explicitly FIFO by intent.
- No change to edit-mode payment reconciliation (`finalize_order_edit`).
- No change to `apply_retailer_payment_fifo` RPC — bug is purely on the client side (wrong collection amount for Full).

## Technical notes

- Files: `src/pages/Cart.tsx` — the two Full/Partial payment blocks around lines ~1030 and ~1945, plus the payment-type UI component that renders the Full/Partial/Credit options (to show the full amount + breakdown).
- `pendingAmountFromPrevious` is already computed in Cart.tsx (line ~460 from `retailers.pending_amount`), so no new query needed.
- Offline optimistic split at lines 1388–1406 must be updated to reflect "all open orders paid" when Full is used with prior pending, not just the new order.
