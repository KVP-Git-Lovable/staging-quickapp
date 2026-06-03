## Create `src/services/beatService.ts`

New file only. No UI, hooks, or other files touched.

### Imports & shared types

- `import { supabase } from '@/integrations/supabase/client'`
- Export types:
  - `AccessType = 'OWNED' | 'CO_OWNER' | 'VIEW_ONLY' | 'COVERAGE'`
  - `BeatWithAccess` = beats row + `accessType: AccessType`
  - `BeatStats = { total, active, inactive, sharedWithMe, covering }`
  - `BeatHistory = { ownership: any[]; retailerTransfers: any[]; coverage: any[] }`

All functions are `async`, return typed results, and surface Supabase errors via `throw error`.

### Functions

1. **`getMyBeats(userId)`** — two parallel queries:
   - `beats` where `user_id = userId` → tag `OWNED`.
   - `beat_user_access` where `user_id = userId AND is_active = true` AND (`effective_to IS NULL OR effective_to > now()`), join `beats(*)` → tag with `access_type` value (`CO_OWNER` / `VIEW_ONLY` / `COVERAGE`).
   - Merge, dedupe by `beats.id` (owned wins), return `BeatWithAccess[]`.

2. **`reactivateBeat(beatId, userId)`** — `update beats set is_active=true, reactivated_at=now(), reactivated_by=userId, updated_by=userId where id=beatId`.

3. **`deactivateBeat(beatId, userId)`** — same pattern with `is_active=false, deactivated_at, deactivated_by`.

4. **`transferRetailers(retailerIds, fromBeatId, toBeatId, transferredBy, reason)`**
   - Load `to` beat (`beat_id`, `beat_name`, `user_id`) and `from` beat (`beat_name`) by their `beat_id` text key.
   - Load the affected retailers (id, name) for history rows.
   - `update retailers set beat_id = toBeat.beat_id, beat_name = toBeat.beat_name where id in retailerIds`.
   - `update retailer_beat_assignments set is_current=false, assigned_to=now(), removed_by=transferredBy, transfer_reason=reason where retailer_id in retailerIds and is_current=true`.
   - `insert retailer_beat_assignments` one row per retailer with `beat_id=toBeat.beat_id`, `beat_name`, `assigned_from=now()`, `is_current=true`, `assigned_by=transferredBy`, `transfer_reason=reason`, `user_id=toBeat.user_id`.
   - `insert retailer_beat_transfer_history` one row per retailer with from/to beat ids+names, `transferred_by`, `transferred_at=now()`.

5. **`transferBeatOwnership(beatId, newOwnerId, transferredBy, reason)`**
   - Fetch current beat (id, beat_id, beat_name, owner_id, owner_name, user_id).
   - Fetch new owner profile (`profiles.full_name` or `name`) for `new_owner_name`.
   - `update beats set user_id=newOwnerId, owner_id=newOwnerId, owner_name=newName, transferred_at=now(), transferred_by=transferredBy, updated_by=transferredBy where id=beatId`.
   - `insert beat_ownership_history` with old/new owner ids+names, `transferred_by`, `transferred_at=now()`, `reason`.
   - `update retailers set user_id=newOwnerId where beat_id=beat.beat_id`.

6. **`grantBeatAccess(beatId, userId, accessType, grantedBy, effectiveTo?)`**
   - Resolve `beats.beat_id` text from `beatId` UUID.
   - `insert beat_user_access {beat_id, user_id, access_type, granted_by, effective_from: now(), effective_to: effectiveTo ?? null, is_active: true}`.

7. **`revokeBeatAccess(beatId, userId, accessType)`**
   - Resolve `beats.beat_id` text.
   - `update beat_user_access set is_active=false where beat_id=textId and user_id=userId and access_type=accessType and is_active=true`.

8. **`assignCoverage(beatId, primaryUserId, coverageUserId, startDate, endDate, reason, permissionSetId, assignedBy)`**
   - Resolve `beats.beat_id` text + `beat_name`.
   - `insert beat_coverage_assignments {beat_id, beat_name, primary_user_id, coverage_user_id, assigned_by, start_date, end_date, reason, is_active:true}`.
   - `insert beat_user_access {beat_id, user_id: coverageUserId, access_type:'COVERAGE', granted_by:assignedBy, effective_from:startDate, effective_to:endDate, is_active:true, reason}`.
   - `insert coverage_permission_assignments {user_id: coverageUserId, permission_set_id: permissionSetId, start_date, end_date, granted_by:assignedBy, reason, is_active:true}`.

9. **`endCoverage(coverageId)`**
   - Load coverage row (`beat_id`, `coverage_user_id`, `start_date`, `end_date`).
   - `update beat_coverage_assignments set is_active=false where id=coverageId`.
   - `update beat_user_access set is_active=false where beat_id=cov.beat_id and user_id=cov.coverage_user_id and access_type='COVERAGE' and is_active=true`.
   - `update coverage_permission_assignments set is_active=false where user_id=cov.coverage_user_id and start_date=cov.start_date and end_date=cov.end_date and is_active=true`.

10. **`getBeatHistory(beatId)`**
    - Resolve `beats.beat_id` text.
    - Parallel: `beat_ownership_history` by `beat_id`, `retailer_beat_transfer_history` where `from_beat_id=textId OR to_beat_id=textId`, `beat_coverage_assignments` by `beat_id` — all ordered desc by created/transferred timestamps.
    - Return `{ ownership, retailerTransfers, coverage }`.

11. **`getBeatStats(userId)`**
    - Parallel HEAD counts:
      - `total` = beats where `user_id=userId`.
      - `active` = beats where `user_id=userId AND is_active=true`.
      - `inactive` = beats where `user_id=userId AND is_active=false`.
      - `sharedWithMe` = `beat_user_access` where `user_id=userId AND access_type in ('CO_OWNER','VIEW_ONLY') AND is_active=true AND (effective_to IS NULL OR effective_to > now())`.
      - `covering` = `beat_user_access` where `user_id=userId AND access_type='COVERAGE' AND is_active=true AND (effective_to IS NULL OR effective_to > now())`.
    - Return `BeatStats`.

12. **`cloneBeat(beatId, newBeatName, createdBy)`**
    - Fetch source beat row.
    - Build new row: same `category`, `travel_allowance`, `average_km`, `average_time_minutes`, `territory_id`, `distributor_id`; `beat_name=newBeatName`; `beat_id` = `src.beat_id + '-COPY-' + Date.now().toString(36)`; `user_id=createdBy`; `owner_id=createdBy`; `owner_name` from profile lookup; `is_active=true`; `created_by=createdBy`; `updated_by=createdBy`; omit deactivated_*, reactivated_*, transferred_* fields.
    - Insert and return the inserted beat row. Do **not** copy retailers.

### Notes

- All functions accept and return plain values; no React/state.
- `beat_id` columns in child tables are the text key from `beats.beat_id`; the service always resolves the text key from the UUID before touching child tables.
- Errors from Supabase are re-thrown so the caller can handle them with toasts / React Query.
- File length target: ~350 lines, single export per function plus shared types.
