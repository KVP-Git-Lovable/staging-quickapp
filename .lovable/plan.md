## Beat Access Control & RLS Hardening — DB Foundation (Message 1)

This is the database-only foundation. No UI changes. After this runs and is verified, we move on to UI in subsequent messages.

### What gets built

A single migration with 14 ordered sections, exactly as specified:

1. **`user_has_permission()` function** — 4-layer resolver: user override → active coverage permission set → permanent permission set group → profile. System admin short-circuits to true.
2. **`beats` table additions** — `transferred_at`, `transferred_by` columns. Backfill `owner_id`/`owner_name` from `user_id` where null.
3. **`orders.beat_name_snapshot`** — new nullable column, backfilled from current `beats.beat_name` via `beat_id` join.
4. **`beat_user_access` table** — owner/co-owner/view-only/coverage grants, with indexes and RLS (open SELECT to authenticated; INSERT/UPDATE gated on `action_beat_share`).
5. **`beat_ownership_history` table** — append-only transfer log with RLS (open SELECT; INSERT gated on `action_beat_transfer`).
6. **`beat_coverage_assignments` table** — date-bounded leave coverage with check constraint `end_date >= start_date`, indexes, RLS gated on `action_beat_coverage`.
7. **`coverage_permission_assignments` table** — date-bounded permission set grants tied to `permission_set_groups(id)`, system-admin only writes.
8. **`user_has_beat_access()` function** — STABLE SECURITY DEFINER union of: direct ownership, active `beat_user_access`, active `beat_coverage_assignments`.
9. **Seed beat action permissions** — for every row in `security_profiles`, insert `action_beat_share`, `action_beat_transfer`, `action_beat_coverage`, `action_beat_reactivate`, `action_beat_clone` with all flags = `is_system` (system profiles get everything, others get nothing), `ON CONFLICT DO NOTHING`.
10. **`beats` RLS rebuild** — drop the open "view all beats for analytics" policy, add `beats_select` gated on `module_my_beats.can_read`, add `beats_insert` gated on `action_beat_create.can_create`. Existing UPDATE/DELETE policies stay.
11. **`retailers` RLS rebuild** — drop 4 legacy policies; new SELECT requires `module_my_retailers.can_read` AND (owner OR beat access OR `can_view_all`); INSERT/UPDATE/DELETE gated on their respective action permissions.
12. **`orders` RLS rebuild** — drop the 10 overlapping policies (incl. all anon/portal ones); new SELECT requires `module_orders.can_read` AND (owner OR beat access OR `can_view_all`); INSERT requires `action_order_create.can_create` AND owner AND beat access. Existing UPDATE policies (distributor-scoped) stay.
13. **`visits` RLS rebuild** — drop anon and legacy policies; new SELECT/INSERT mirror the orders pattern using `module_visits` and `action_visit_create`.
14. **`product_schemes` RLS rebuild** — drop admin-only policy; new SELECT/INSERT/UPDATE/DELETE gated on `module_schemes` / `action_scheme_*`. Seed scheme + order + visit + retailer action permission objects per profile (system gets everything, non-system gets module read only).

### Execution approach

I will submit the full SQL as **one** `supabase--migration` call so it runs atomically inside a transaction. If any section fails, nothing is partially applied. After approval and execution I will:

- Run `supabase--linter` and fix any new findings introduced by the migration.
- Regenerate the Supabase types file (auto-handled).
- Spot-check with `supabase--read_query`:
  - `user_has_permission(<a system admin uid>, 'module_my_beats', 'can_read')` → true
  - `user_has_beat_access(<owner uid>, '<their beat_id>')` → true
  - Count rows in `beat_user_access`, `beat_ownership_history`, `beat_coverage_assignments`, `coverage_permission_assignments` (should be 0)
  - `SELECT COUNT(*) FROM orders WHERE beat_name_snapshot IS NULL` and confirm backfill worked
  - `SELECT COUNT(*) FROM beats WHERE owner_id IS NULL` → 0 (or only rows where `user_id` is also null)
  - List policies on `beats`, `retailers`, `orders`, `visits`, `product_schemes` to confirm only the new ones remain (plus the kept UPDATE/DELETE on beats and UPDATE on orders).

### Risks called out before you approve

These are real behavior changes — please confirm you accept them:

1. **Anon/portal access to `orders` and `visits` is removed.** Sections 12 and 13 drop `Allow anon insert orders for portal`, `Allow anon read orders for portal`, `Allow anon insert visits for portal`, `Allow anon select visits for portal`. If the customer portal or any unauthenticated flow still inserts/reads these tables directly with the anon key, it will break immediately. Edge functions using the service role are unaffected.
2. **Every existing user must have a profile with `module_my_beats.can_read = true`** or they will stop seeing beats. Same for `module_my_retailers`, `module_orders`, `module_visits`, `module_schemes`. The seed in Section 9 only inserts the new *beat action* objects; Section 14 only seeds *scheme + action* objects. If `module_my_beats` / `module_my_retailers` / `module_orders` / `module_visits` rows don't already exist for non-system profiles with `can_read = true`, those users will be locked out. I recommend extending Section 14's seed loop to also `INSERT ... ON CONFLICT DO NOTHING` rows for `module_my_beats`, `module_my_retailers`, `module_orders`, `module_visits` with `can_read = true` for all profiles. **Want me to add that safety seed?**
3. **`orders_insert` now requires `user_has_beat_access(auth.uid(), beat_id)`.** Any order created without a valid beat the user owns or has access to will be rejected. Portal orders inserted by reps on behalf of customers must carry a `beat_id` the rep has access to.
4. **`retailers_update` requires beat access.** Reps editing a retailer assigned to a beat they don't own/cover will be blocked unless they have `can_view_all` (which the new policy doesn't check on UPDATE — only SELECT). Confirm this is intended.
5. The seed in Section 9 uses `ON CONFLICT DO NOTHING` but the `profile_object_permissions` table needs a unique constraint on `(profile_id, object_name)` for that to work. If the constraint doesn't exist the insert will succeed but may create duplicates. I'll verify before running.

### Out of scope for this message

UI, hooks, edge functions, types regeneration code, and the beat share/transfer/coverage workflows. Those are Message 2+.

### Two things I need from you before I write the migration

1. **Approve the anon/portal removal** in Sections 12–13, or tell me which anon policies must be preserved.
2. **Approve adding the safety seed** for `module_my_beats`, `module_my_retailers`, `module_orders`, `module_visits`, `module_schemes` with `can_read = true` on all profiles, so existing non-system users don't get locked out.
