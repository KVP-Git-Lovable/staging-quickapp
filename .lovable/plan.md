## No changes required

Both offline pending-amount branches in `src/components/VisitCard.tsx` already implement the requested fix:

- **~line 774 (`checkStatus` offline guard):** lines 789–795 compute `todaysCreditPending` from `todaysOrders` and set `pendingAmount` to `Math.max(reconciled, todaysCreditPending)`.
- **~line 1344 (dedicated pending-amount effect):** lines 1375–1380+ do the same reconciliation and use the same `max` before setting state.

This matches the snippet you shared exactly (same variable names, same guard, same comment about avoiding double-counting synced orders). This is the change I made in the previous UOM prefetch turn under "FIX B — Pending banner offline".

## Verification
Read both regions of `VisitCard.tsx` — the `Math.max(reconciled, todaysCreditPending)` guard is present in each.

## Recommendation
No plan to implement. If the banner still looks wrong in a specific scenario (e.g., synced order not folded into `cachedRetailer.pending_amount` yet, or a value mismatch vs. the Today's Order view), share the retailer / order and I'll diagnose from there.
