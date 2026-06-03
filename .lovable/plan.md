## Apply 3 RLS upgrades on `beats` and `visits`

Single Supabase migration containing all three policy swaps (in order):

1. **beats UPDATE** — drop `"Profile-based beat edit"`, create `beats_update` gated by `user_has_permission('action_beat_edit','can_edit')` AND (`auth.uid() = user_id` OR `user_has_beat_access(auth.uid(), beat_id)`), same for WITH CHECK.
2. **beats DELETE** — drop `"Profile-based beat delete"`, create `beats_delete` gated by `user_has_permission('action_beat_delete','can_delete')` AND `auth.uid() = user_id`.
3. **visits UPDATE** — drop `"Users can update their own visits"`, create `visits_update` gated by `user_has_permission('action_visit_edit','can_edit')` AND `auth.uid() = user_id`, same for WITH CHECK.

### Verification

After the migration is approved and run, execute the supplied `pg_policies` query via `supabase--read_query` and share the result table back. Expected: all 7 rows across `beats`/`visits` show ✅ profile-based (or ✅ beat-access for the OR-branch).

### Notes

- All changes are RLS-only. No code or schema changes.
- No frontend impact — the called functions already exist and the UI already uses `usePermissions` which reads the same 4 layers.
