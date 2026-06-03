## Plan: Fix duplicate-check returning nothing + wrong owner name

### Root cause

`checkBeatNameDuplicate` in `src/pages/MyBeats.tsx` line 137 selects `profiles:user_id(full_name, name)`. The `name` column does not exist on `profiles` (correct column is `username`). PostgREST rejects the whole query, `orgBeats` comes back undefined/empty, and the function returns `null` — so **no duplicate warning ever fires**, which is why typing "udupi" went through silently even though "Udupi" exists in the table.

The same bad column also means the owner-name fallback (`b.profiles?.name`) can never resolve, hence `"Another user"` when it should read `"Prabhu KVP"`.

### Fix (single file, src/pages/MyBeats.tsx)

Three one-token edits:

1. **Line 137** — embed select:
   ```ts
   .select('beat_name, user_id, profiles:user_id(full_name, username)')
   ```
2. **Line 149** — exact-match owner name:
   ```ts
   const ownerName = b.profiles?.full_name || b.profiles?.username || 'Another user';
   ```
3. **Line 165** — near-match owner name: same change as line 149.

No other code, schema, or UI changes. The dialog wiring (`DuplicateBeatWarningDialog`) and `handleSaveBeat` flow are already correct.

### Verification

- Type a beat name owned by a different user (e.g. "udupi" → existing "Udupi"). Expect the red dialog "Duplicate Beat Name Not Allowed" with **Existing owner: Prabhu KVP**.
- Type a unique name → no dialog.
- Type a near-match → amber dialog with correct owner name.

### Notes

- The PostgREST embed `profiles:user_id(...)` relies on the FK from `beats.user_id` → `profiles.id`. If for any reason the embed comes back `null` at runtime, I'll add a one-shot fallback that re-queries `profiles` by id. Will only add if observed; not needed otherwise.
