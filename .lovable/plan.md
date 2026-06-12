## Problem

When User B opens the app on a device/browser previously used by Abhishek even if logout or login and checked in incognito mode same issue(without an explicit logout in between), My Visits shows Abhishek's beat ("Bejai - Kuntikana Beat") instead of User B's own beat.

## Root cause (confirmed from console logs + code)

The console clearly shows, right after the new session loads:

```
permission denied for table beat_plans
permission denied for table beats
[Cache] Error caching beats, keeping existing cache
[Cache] Error caching beat plans, keeping existing cache
```

Two compounding bugs:

1. **Master-data cache runs before the Supabase session is restored.** `useMasterDataCache` fires `select * from beats / beat_plans / retailers` without waiting for `auth.getSession()` to finish. With no JWT attached, RLS returns `42501`. The `catch` block intentionally **keeps the existing IndexedDB cache** ("keeping existing cache"). That existing cache still holds **Abhishek's** beats / beat_plans / retailers from the previous session.
2. **IndexedDB stores aren't purged on user-identity change.** They're only cleared inside `signOut()` (`offlineStorage.clearAll`). Because the user closed the tab instead of signing out, `STORES.BEATS`, `STORES.BEAT_PLANS`, `STORES.RETAILERS`, `STORES.VISITS` still contain Abhishek's rows when User B logs in.

`useVisitsDataOptimized` then merges/falls back to that stale IDB data, so the header reads "Bejai - Kuntikana Beat" (Abhishek's plan), and the offline branches in `MyVisits.tsx` (lines ~755 / 846) filter only by `planned_date` — they don't re-check `user_id`, so any leaked row survives.

This is **not** an RLS policy bug — RLS is doing the right thing. It's a client-side cache-isolation bug.

## Fix (scope: cache hygiene only, no schema/RLS changes)

### 1. Gate master-data cache on a valid session

File: `src/hooks/useMasterDataCache.ts`

- In `cacheBeats`, `cacheBeatPlans`, `cacheRetailers`, `cacheCompetitionData`, etc., short-circuit when there is no authenticated user:
  ```ts
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) { onProgress?.(..., 'skipped'); return; }
  ```
- In the top-level `forceRefreshAll` / scheduled refresh effect, replace the current "fire and forget" trigger with one that waits for `user?.id` (use the same `useAuthReady`-style pattern already used elsewhere).
- Stop using `keeping existing cache` semantics on **permission errors (42501)** — on auth failure we must invalidate the cached store, not preserve it. Treat 42501 as "session not ready, do nothing" and let a later run repopulate.

### 2. Purge per-user IDB stores on identity change

File: `src/hooks/useAuth.tsx` (and/or a small helper called from the auth state listener)

- Persist `last_authenticated_user_id` in `localStorage` whenever the session resolves.
- On every `INITIAL_SESSION` / `SIGNED_IN` event, if `session.user.id !== last_authenticated_user_id`:
  - Call `offlineStorage.clear(STORES.BEATS)`, `BEAT_PLANS`, `RETAILERS`, `VISITS`, `ORDERS` (only if no unsynced items), `SYNC_METADATA`.
  - Clear `visit_status_cache` in localStorage and any `myvisits_snapshot_*` Preferences keys for the previous user.
  - Then write the new `last_authenticated_user_id`.
- Add the same guard inside `useVisitsDataOptimized`'s existing auth listener (it already calls `clearAllCachesAndState`; extend it to also wipe the relevant IDB stores, not just the module-level `Map`).

### 3. Defensive filter in the offline fallback path

File: `src/pages/MyVisits.tsx` (and `useVisitsDataOptimized` offline merge)

- Anywhere we read from `offlineStorage.getAll(STORES.VISITS / RETAILERS / BEAT_PLANS)`, also filter by `row.user_id === user.id`. This is belt-and-suspenders so even if a future regression leaves stale rows in IDB, the UI never displays another user's data.

### 4. Verification

After the change, on the affected device:

- Log in as Abhishek → confirm beat shows correctly.
- Close the tab (don't sign out) → log in as User B.
- Expect: header shows User B's beat (or "no beat planned"), Today's Progress reflects User B only, no `permission denied` errors in console for `beats` / `beat_plans` during the unauth window.

## Out of scope

- No changes to RLS policies, GRANTs, or table structure on `beats` / `beat_plans` / `retailers`.
- No change to the manager "view as subordinate" flow.
- No UI/visual changes.