## Problem

The duplicate-beat check on `My Beats` silently fails when another user in the same org already owns the beat name. Two root causes:

1. The Supabase embed `profiles:user_id(full_name, username)` in `checkBeatNameDuplicate` (src/pages/MyBeats.tsx line 137) needs an FK from `beats.user_id` → `profiles.id`. That FK doesn't exist, so PostgREST returns an empty/failed result and the check exits early.
2. The `beats_select` RLS policy scopes rows per-user, so even without the embed the current user can't see other users' beats to compare against.

## Fix

### 1. Database — add a SECURITY DEFINER RPC

Create `public.get_org_beat_names(p_distributor_id uuid)` that bypasses RLS and returns every active beat plus its owner's display name. Grant `EXECUTE` to `authenticated`.

```sql
CREATE OR REPLACE FUNCTION public.get_org_beat_names(p_distributor_id uuid DEFAULT NULL)
RETURNS TABLE(beat_name text, user_id uuid, full_name text, username text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.beat_name, b.user_id, p.full_name, p.username
  FROM beats b
  LEFT JOIN profiles p ON p.id = b.user_id
  WHERE b.is_active = true
    AND (p_distributor_id IS NULL OR b.distributor_id = p_distributor_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_org_beat_names(uuid) TO authenticated;
```

No change to the existing `beats_select` RLS — duplicate checking goes through the RPC only.

### 2. Code — `src/pages/MyBeats.tsx` `checkBeatNameDuplicate` (lines 128–175)

Replace the failing `from('beats').select(...)` call with the RPC. Owner name comes directly from RPC fields, so no extra `profiles` lookup is needed. Exact-match and near-match logic stay identical.

```ts
const { data: orgBeats, error } = await supabase
  .rpc('get_org_beat_names', { p_distributor_id: distributorId ?? null });
if (error) { console.error('checkBeatNameDuplicate:', error); return null; }
if (!orgBeats || orgBeats.length === 0) return null;

// exact match
for (const b of orgBeats as any[]) {
  const bName = (b.beat_name || '').toLowerCase();
  if (bName === normalized) {
    const isOwn = b.user_id === currentUserId;
    return {
      matchType: isOwn ? 'exact_own' : 'exact_other',
      existingOwnerName: b.full_name || b.username || 'Another user',
      matchedBeatName: b.beat_name,
    };
  }
}

// near match (unchanged levenshtein/contains logic, owner name from RPC fields)
```

## Verification

- Log in as Abhishek, type a beat name owned by Prabhu → red "Duplicate Beat Name Not Allowed" dialog appears, owner shows "Prabhu KVP".
- Type a brand-new name → no warning, beat creates normally.
- Type a near-match owned by another user → amber "Similar beat found" with `Cancel` + `Create Anyway`.
- Own-beat duplicate still flagged as before.
