## Plan: Fix profiles column references in 4 components

The `profiles` table uses `id`, `username`, `profile_picture_url` — not `user_id`, `name`, `avatar_url`. Apply the exact substitutions specified in 4 files.

### Files

1. **`src/components/ShareBeatModal.tsx`**
   - Update `Profile` interface fields.
   - Both `profiles` selects → `id, full_name, username, profile_picture_url`.
   - `profilesMap.set(p.user_id, …)` → `p.id`.
   - Keep `profilesMap.get(r.user_id)` and `beat_user_access.user_id`/`excludedIds` lookups against `beat_user_access` rows unchanged.
   - `selectedUser.user_id` → `.id`; avatar/name fields swapped; result list `key`/filter switched to `r.id`.

2. **`src/components/CoverageModal.tsx`**
   - Update `UserProfile` interface.
   - Profile lookup select + `.in("id", ids)` + `profMap.set(p.id, …)`. Keep `profMap.get(r.coverage_user_id)`.
   - Search select + `.neq("id", primaryUserId)`.
   - `selectedUser.user_id` → `.id`; all `name`/`avatar_url` display references swapped; result `key={r.id}`.

3. **`src/components/TransferOwnershipModal.tsx`**
   - Update `UserProfile` interface.
   - Search select + `.neq("id", currentUserId)`.
   - `selectedUser.user_id` → `.id`; display fields swapped; `key={r.id}`.

4. **`src/components/BeatHistoryDrawer.tsx`**
   - Profile select → `id, full_name, username`, `.in("id", …)`, `map[p.id] = p.full_name || p.username`.

### Verification

- Auto type-check after edits.
- No DB/schema changes; no behavior changes beyond column names.

### Notes

- Only references to `profiles.*` columns are changed. References to `beat_user_access.user_id`, `beat_coverage_assignments.coverage_user_id`, etc. stay as-is per the spec.
