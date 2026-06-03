## Plan: DB Audit Fixes (Parts A, B, C)

### Part A — Single Supabase migration (Fixes 1-5)

Run all 5 RLS changes as one migration:

1. `CREATE POLICY "beats_select"` on `beats` — gated by `user_has_permission('module_my_beats','can_read')`.
2. `CREATE POLICY "beats_insert"` on `beats` — gated by `user_has_permission('action_beat_create','can_create')`.
3. `DROP POLICY` "Allow anon read product_schemes for portal" and "Product schemes are viewable by authenticated users" on `product_schemes`.
4. Drop & recreate `visits_insert` policy with `user_has_permission('action_visit_create','can_create') AND auth.uid()=user_id AND user_has_beat_access(auth.uid(), beat_id)`.
5. Drop 3 old `orders` UPDATE policies, create single `orders_update` with `user_has_permission('action_order_edit','can_edit') AND (auth.uid()=user_id OR user_has_beat_access(auth.uid(), beat_id))` for both USING and WITH CHECK.

After migration is approved & run, execute the two verification SELECTs from `pg_policies` via `supabase--read_query` and share results.

### Part B — Code fixes

**Fix 6 — `src/services/beatService.ts`:** Already a batch insert (lines 297-315). No change needed. Report this in the final summary.

**Fix 7 — `src/hooks/usePermissions.ts`:** Add a 4th parallel fetch from `user_object_permissions` for the current user. Merge its rows FIRST (highest priority) before profile, set, and coverage permissions. Since merge is additive OR-logic, priority order doesn't change semantics, but we'll order the merge calls as: userOverrides → coverage → set → profile to match backend `user_has_permission()` layering.

**Fix 8 — `src/hooks/useOfflineRetailers.ts`:** Already has no `access_type` filter on the `beat_user_access` query (lines 196-203). No change needed. Report this.

**Fix 9 — `src/components/DeactivateBeatWizard.tsx`:** Currently fetches own beats via `.eq('user_id', userId)` then merges shared beats. Replace this with a single `beatService.getMyBeats(userId)` call (which returns owned + shared + coverage), then filter out the current beat and map to `DestBeat` shape. Keep the retailers fetch as-is.

**Fix 10 — `src/components/TransferOwnershipModal.tsx`:** Update the `transferBeatOwnership` call at line 100 to pass `new Date().toISOString().split('T')[0]` as the 5th argument (`effectiveDate`).

### Part C — Confirmations (already verified via grep)

- No "Pending Transfer" badge anywhere — grep for `Pending Transfer|pending_transfer|scheduled.*transfer|future.*ownership` returns no matches.
- No future-date picker in `TransferOwnershipModal.tsx` — only a reason text input.
- No setTimeout/polling logic for transfers — none found.

Will report all three as "confirmed not present" in the final summary.

### Final verification

After all DB + code changes, run the final `pg_policies` audit query from the user's message via `supabase--read_query` and share the table of results so the user can confirm every row is ✅ profile-based or ✅ beat-access.

### Technical notes

- Fixes 6 and 8 require no edits — current code already matches the spec. Will explicitly note this rather than make redundant changes.
- Fix 7 priority order is documentational only since merge is OR-based; behavior is identical regardless of merge order.
- `getMyBeats` returns `BeatWithAccess[]` with fields `id`, `beat_id`, `beat_name`, `access_type` — mapping to `DestBeat` ({id, beat_id, beat_name}) is a direct field pick.
