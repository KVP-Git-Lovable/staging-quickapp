## Fix "Unknown User" greeting and "Admin" label in side menu

Two unrelated bugs surfaced by the same screenshot. Both fixes are small and safe.

### Bug 1 — Side menu label is hardcoded to "Admin"

**File:** `src/components/Navbar.tsx`, line 286.

Currently:
```tsx
{hasAdminAccess && (
  <div className="flex items-center gap-1.5 ...">
    <Shield className="h-3.5 w-3.5" />
    <span className="font-medium">Admin</span>
  </div>
)}
```

`securityProfileName` is already destructured from `useAuth()` on line 74 but never used.

**Fix:** Render the actual assigned security profile name. Show the row whenever a profile is assigned (not only for admins):

```tsx
{securityProfileName && (
  <div className="flex items-center gap-1.5 text-xs opacity-90 text-primary-foreground mt-1">
    <Shield className="h-3.5 w-3.5" />
    <span className="font-medium">{securityProfileName}</span>
  </div>
)}
```

Result: shows "System Administrator", "Sales Manager", "HR Manager", etc. — whatever profile is in `user_profiles → security_profiles.name`. Falls back to no row if the user has no profile assigned (already a separate problem the security UI surfaces).

### Bug 2 — "Unknown User" greeting

**Root cause:** 12 auth users have no row in `public.profiles` (the `handle_new_user` trigger fires on new signups, but these users predate it or it failed). When `fetchUserProfile` hits `PGRST116` (no rows), the fallback at `src/hooks/useAuth.tsx:161` hardcodes the string `'Unknown User'`, which then displays everywhere.

**Two-part fix:**

**2a. Code — better fallback** (`src/hooks/useAuth.tsx`, lines 156–166):

Replace the literal `'Unknown User'` with a proper chain that uses the real auth metadata, then leaves the field empty so callers' own fallbacks work:

```ts
if (error.code === 'PGRST116') {
  const meta: any = user?.user_metadata || {};
  const emailBase = user?.email?.split('@')[0]
    ?.replace(/[._-]+/g, ' ')
    ?.replace(/\b\w/g, c => c.toUpperCase()) || null;
  return {
    id: userId,
    username: meta.username || user?.email?.split('@')[0] || null,
    full_name: meta.full_name || meta.name || emailBase || null,  // never the literal 'Unknown User'
    phone_number: meta.phone_number || null,
    recovery_email: meta.recovery_email || null,
    profile_picture_url: meta.profile_picture_url || null,
  };
}
```

This alone makes the greeting show the user's real name from auth metadata (e.g. "Dharmesh", "Prajwal Kvpcorp", "Ajay Prabhu") instead of "Unknown User" for the 12 affected accounts.

**2b. Data — backfill missing `profiles` rows** (one-off migration):

```sql
INSERT INTO public.profiles (id, username, full_name)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1)),
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    NULLIF(u.raw_user_meta_data->>'name', ''),
    initcap(replace(split_part(u.email, '@', 1), '.', ' '))
  )
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
```

This creates the 12 missing rows so the normal SELECT path works going forward and downstream features that join on `profiles` (admin lists, dashboards, leaderboards) stop excluding these users.

The `handle_new_user` trigger remains in place for future signups; no schema change needed.

### Files touched

- `src/components/Navbar.tsx` — 1 small edit.
- `src/hooks/useAuth.tsx` — 1 small edit (PGRST116 fallback block).
- One data migration (the INSERT … SELECT above).

### Verification

- Re-open the side menu — should show the actual security profile name (e.g. "System Administrator") instead of "Admin".
- Greeting and avatar tooltip should show the real name pulled from `profiles` (or, for the 12 backfilled users, from auth metadata after the backfill runs).
- `SELECT count(*) FROM auth.users u LEFT JOIN profiles p ON p.id=u.id WHERE p.id IS NULL;` should return 0.

### Out of scope

- Why the trigger didn't fire originally for those 12 accounts (cannot reconstruct without auth.users insert logs). Backfill is the pragmatic fix.
- The role subtitle ("User" under the greeting on `/dashboard`) comes from `user_roles.role`. If you'd like that subtitle to also show the security profile name instead of the legacy `app_role` enum, say the word and I'll switch `Index.tsx` line 98 in the same change.
