## Problem

The user-management page at `/admin#users` lives in `src/pages/AdminDashboard.tsx` (not the Security Management page edited earlier). It currently:

- Always shows inactive users — no filter.
- Counts all users in "Total Users".
- Per-row Active toggle writes only `profiles.user_status` ('active' / 'inactive') and not `profiles.is_active`, so beat-picker filters that use `is_active` (Share / Coverage / Transfer modals) don't actually hide users deactivated here.
- Does not revoke beat access on deactivation.

## Changes — all in `src/pages/AdminDashboard.tsx`

### 1. Add "Show inactive users" filter

- Add state: `const [showInactive, setShowInactive] = useState(false);`
- In the header row (next to Columns / Refresh, around line 469), add a `Switch` + `Label`:
  - "Show inactive users" — off by default.
- Apply the filter to the rendered/filtered user list (alongside the existing search filter): when `showInactive` is false, exclude users whose `profile?.user_status === 'inactive'`.

### 2. Update counts (around line 464)

- Compute:
  - `activeCount = users.filter(u => u.profile?.user_status !== 'inactive').length`
  - `inactiveCount = users.length - activeCount`
- Replace "Total Users: {users.length}" with:
  - Primary: `Active Users: {activeCount}`
  - Muted suffix: `({inactiveCount} inactive)`
- Keep the existing "X users with security profiles assigned" line.

### 3. Make the per-row toggle also update `is_active` and revoke beat access

Update `toggleUserActiveStatus` (lines 342–383):

- On the `profiles` update, set BOTH fields in one call:
  - `user_status: newStatus` (existing)
  - `is_active: newStatus === 'active'` (new)
- Also keep `distributor_users` in sync (best-effort, no throw):
  - `update({ is_active: newStatus === 'active', user_status: newStatus }).eq('auth_user_id', userId)`
- When `newStatus === 'inactive'`, after the profile update succeeds, revoke beat access (best-effort):
  - `beat_user_access`: `.update({ is_active: false }).eq('user_id', userId)`
  - `beat_coverage_assignments`: `.update({ is_active: false }).eq('coverage_user_id', userId).gte('end_date', today)` where `today = new Date().toISOString().slice(0, 10)`
- Keep all existing optimistic-update / revert logic intact. Adjust the success toast to mention beat-access revocation when deactivating.

### 4. Out of scope (no changes)

- The per-row Active toggle component, the "Inactive" status label, and the filterable Active column already work — leave them.
- `SecurityManagement → UserProfileAssignment` changes from the previous turn remain in place; they govern the secondary list under Security and are still correct (now redundant rather than conflicting).
- Beat picker modals (`ShareBeatModal`, `CoverageModal`, `TransferOwnershipModal`) already filter on `is_active = true` — no change needed once step 3 keeps that flag in sync.

## Technical notes

- `profiles.user_status` is the canonical text field driving the UI on this page; `profiles.is_active` is the boolean used by RLS-adjacent filters in beat modals. We keep both in sync to avoid splitting the source of truth across pages.
- `distributor_users.user_status` is a Postgres enum (`user_status` type). The `.update({ user_status: 'active' | 'inactive' })` matches existing values used elsewhere in the project, so no migration is needed.
- All cross-table updates (distributor_users, beat_user_access, beat_coverage_assignments) are best-effort: we don't fail the toggle if a permission policy blocks one of them, but we do show the result toast.

## Verification

1. `/admin#users`: deactivate one user → row disappears from list; "Active Users" count drops by 1; "(N inactive)" goes up by 1.
2. Flip "Show inactive users" on → user reappears with the Inactive label and the toggle off.
3. Open ShareBeat / Coverage / Transfer Ownership modals → search for that user → they no longer appear in results.
4. Re-activate from `/admin#users` → user reappears in active list and is searchable again in beat modals.
