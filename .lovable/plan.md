## Add `usePermissions()` hook

Create one new file. No existing components or files modified.

### File: `src/hooks/usePermissions.ts`

A merged-permission hook that combines all 3 server layers into a single client-side `PermissionMap` and exposes a `can(object, action)` helper. This complements (does not replace) the existing `useProfilePermissions` hook — that one only reads profile permissions; this one merges profile + permanent permission sets + active coverage permission sets, mirroring the layers in `user_has_permission()` from Message 1.

#### What it does
1. Reads the current `auth` user via the project's `useAuth` hook (`@/hooks/useAuth`).
2. Resolves `profile_id` via `user_profiles.profile_id`.
3. Fetches three sources in parallel:
   - `profile_object_permissions` for the resolved profile.
   - `permission_set_group_users` → nested `permission_set_group_permissions` for the user.
   - `coverage_permission_assignments` filtered by `is_active = true`, `start_date <= today`, `end_date >= today` → nested `permission_set_groups` → `permission_set_group_permissions`.
4. OR-merges every row by `object_name` into `PermissionMap`.
5. Exposes `{ permissions, can, loading, refresh }`.

#### Helper
`can(objectName, action)` where `action ∈ 'read' | 'create' | 'edit' | 'delete' | 'view_all'`. Returns `false` when the object is not present in the merged map (deny-by-default).

#### Notes (kept silent in code)
- Uses `.maybeSingle()` instead of `.single()` on `user_profiles` to match the existing project convention and avoid throws when a user has no profile yet.
- Parallelizes the three fetches with `Promise.all` for faster first paint.
- `loadPermissions` is wrapped in `useCallback` so the returned `refresh` is stable for consumers passing it to deps arrays.
- No `can_modify_all` action key is exposed via `can()` (per spec); the raw flag is still available in `permissions[obj].can_modify_all` for callers that need it.

### Out of scope
- No changes to `useProfilePermissions`, `AdminControls`, `Layout`, route guards, or any page. Those come in later messages.
- No changes to types, RLS, or DB.
