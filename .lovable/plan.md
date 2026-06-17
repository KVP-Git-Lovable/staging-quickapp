## Problem

For Sharma store, the retailer row has `created_by`, `owner_id`, and `user_id` all set to a valid user, and `owner_name = "Dharmesh"`. But the Retailer Overview still shows nothing for "Created by" and "Currently operated by".

Root cause: in `RetailerDetailModal.loadOwnership`, the profile lookup uses `.in('user_id', userIds)`, but the `profiles` table's primary key column is `id` — there is no `user_id` column. The query silently returns 0 rows, so every name resolves to `—`.

## Fix

In `src/components/RetailerDetailModal.tsx` → `loadOwnership`:

1. Change the profiles query to:
   - `select('id, full_name, username')`
   - `.in('id', userIds)`
2. Build the name map keyed by `p.id`.
3. For each slot use a fallback chain so we always show something useful when the profile row exists but `full_name` is empty:
   - Created by: `nameMap.get(created_by)?.full_name || username || '—'`
   - Owner: `owner_name || nameMap.get(owner_id)?.full_name || username || '—'` (keep existing preference for the stored `owner_name`)
   - Currently operated by: `nameMap.get(user_id)?.full_name || username || '—'`

No schema changes, no other files touched.

## Verification

Reopen Sharma store → header should show:
- Beat: (resolved beat name)
- Created by: Dharmesh (from profile of `41070e2f-…`)
- Owner: Dharmesh
- Currently operated by: Dharmesh
