## Goal
Build two modals that drive sharing and coverage on a beat using existing `beatService` functions, and wire them into `MyBeats.tsx` to replace the current "coming soon" toasts.

---

## File 1 — `src/components/ShareBeatModal.tsx` (new)

### Props
```ts
{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beat: { id: string; beat_id: string; beat_name: string };
  grantedBy: string;     // current user id
}
```

### UI
- Shadcn `Dialog` titled "Share Beat — {beat.beat_name}".
- **Form** (top):
  - User search: debounced text input → `supabase.from('profiles').select('user_id, full_name, name, avatar_url').ilike('full_name','%q%').limit(8)`. Show result list; click sets `selectedUser`. Exclude beat owner and already-active sharees.
  - Access level: `RadioGroup` with `CO_OWNER` ("Co-owner — can view, visit, take orders, edit retailers") and `VIEW_ONLY` ("View only — can view beat and retailers only").
  - Duration: `RadioGroup` with `permanent` and `until`. When `until`, show shadcn date picker (Popover + Calendar with `pointer-events-auto`).
  - Reason: optional `Input`.
  - Footer: `Cancel` + `Grant Access` (disabled until user + access + (date if "until") set, plus submitting spinner).
- **Current shares list** (below form):
  - Fetched via `supabase.from('beat_user_access').select('id, user_id, access_type, effective_to, profiles:profiles!beat_user_access_user_id_fkey(full_name, name, avatar_url)').eq('beat_id', beat.beat_id).in('access_type', ['CO_OWNER','VIEW_ONLY']).eq('is_active', true)`. If the FK alias fails, fall back to a separate `profiles` batch fetch.
  - Each row: `Avatar` (initials), name, access badge (`Co-owner` / `View only`), duration text (`Permanent` if `effective_to` null, else `Until <formatted date>`), `Revoke` button.

### Actions
- **Grant**: `await beatService.grantBeatAccess(beat.id, selectedUser.user_id, access, grantedBy, untilDate?.toISOString() ?? null)` → toast success, reset form, refresh shares list.
- **Revoke**: `await beatService.revokeBeatAccess(beat.id, row.user_id, row.access_type)` → toast, refresh list.
- All errors → `toast.error(err.message)`, keep dialog open.

---

## File 2 — `src/components/CoverageModal.tsx` (new)

### Props
```ts
{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beat: { id: string; beat_id: string; beat_name: string };
  primaryUserId: string; // beat owner
  assignedBy: string;    // current user id
}
```

### UI
- Shadcn `Dialog` titled "Assign Coverage — {beat.beat_name}".
- **Form**:
  - Coverage person: same debounced profile search component pattern as ShareBeatModal (exclude `primaryUserId`).
  - Start date + End date: two shadcn date pickers (Popover + Calendar). End must be ≥ Start.
  - Temporary permissions: `Select` populated from `supabase.from('permission_set_groups').select('id, name, description').order('name')`. Optional. Helper text: "If selected, {personName} gets these extra permissions only during coverage dates."
  - Reason: required `Input` (reason is non-null in `assignCoverage`).
  - Footer: `Cancel` + `Assign Coverage` (disabled until person + start + end + reason).

### Actions
- **Assign**: `beatService.assignCoverage(beat.id, primaryUserId, coverageUser.user_id, startIso, endIso, reason, permissionSetId ?? '', assignedBy)`.
  - Caveat: `assignCoverage` always inserts into `coverage_permission_assignments`. If no permission set selected we will pass an empty string today, which will likely fail. **Workaround in this modal**: require a permission set selection (mark dropdown required) to avoid a broken call. Note this clearly in the helper text: "Select a permission set". Updating the service signature to make it optional is out of scope per prior agreement.
  - Toast success, close dialog, refresh active coverage list.
- **Active coverage list** (below form): `supabase.from('beat_coverage_assignments').select('id, coverage_user_id, start_date, end_date, profiles:profiles!beat_coverage_assignments_coverage_user_id_fkey(full_name, name, avatar_url)').eq('beat_id', beat.beat_id).eq('is_active', true).order('start_date',{ascending:false})`. Same FK fallback pattern.
  - Each row: avatar + name + `{start} → {end}` + `End Coverage` button → `beatService.endCoverage(row.id)` → refresh.

---

## Wire-up in `src/pages/MyBeats.tsx`
- Import `ShareBeatModal` and `CoverageModal`.
- Add state: `shareBeat`, `coverageBeat` (`{ id, beat_id, name } | null`).
- Replace existing `onShare`/`onAssignCoverage` props (currently `toast.info`) on `BeatCard` (line 1787-1788) to set the corresponding state with `{ id: beat.id, beat_id: beat.id, name: beat.name }` (since `MyBeats` `beat.id` IS the text key per memory).
- Render both modals near other dialogs at the bottom of the JSX, gated by `user` and the state being set; pass `grantedBy: user.id`, `primaryUserId: user.id` (current owner viewing their own beat), `assignedBy: user.id`.

---

## Out of scope
- No `beatService.ts` changes.
- No DB migration, RLS, or table changes.
- No edits to `types.ts`, `BeatCard.tsx` menu, or permission matrix.
- No revamp of MyBeats data loading.

## UI notes
- Use semantic tokens only; no hardcoded hex.
- Calendar uses `pointer-events-auto` per shadcn datepicker guidance.
- `Avatar` initials fallback when `avatar_url` missing.
