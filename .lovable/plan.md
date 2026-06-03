## Problem
Two related issues prevent cleanly deleting empty beats from `My Beats`:
1. `handleConfirmDeleteBeat` in `src/pages/MyBeats.tsx` always soft-deletes (sets `is_active = false`). Even truly empty beats (no retailers, visits, plans, orders) stay in the table forever.
2. The `can_delete_beat` RPC references `visits.beat_id`, but the `visits` table has no such column — the RPC crashes, so `canDelete` returns `false` and the UI never offers a permanent delete. It also blocks deletion based on `beat_audit_log`, which should not gate deletion of an otherwise-empty beat.

## Fix

### 1. Database — replace `can_delete_beat`
- Join `visits` through `retailers.beat_id` instead of `visits.beat_id`.
- Drop the `beat_audit_log` block; audit rows must never prevent deletion.
- Keep checks for: `retailers`, `retailer_beat_assignments`, `visits` (via retailers), `orders` (if column exists), `beat_plans`, `daily_beat_plans`, `van_beat_assignments`.

### 2. Code — `src/pages/MyBeats.tsx`, `handleConfirmDeleteBeat` (~lines 1237–1244)
Branch on `deletabilityMap[deleteItemId]`:
- If `true` → call `beatLifecycle.deletePermanent(deleteItemId, deleteItemName)`; throw on failure.
- Else → existing soft-delete path (`is_active = false`).

Everything after that block (audit log insert, UI state update, offline cache clear, toast) stays unchanged and runs in both branches.

## Verification
- 3 empty `Test Beat` rows → permanently removed from DB.
- Abhishek's duplicate `Udupi` (empty) → permanently removed.
- `Nagasaki` (7 retailers) → blocked with reason list shown in UI.
