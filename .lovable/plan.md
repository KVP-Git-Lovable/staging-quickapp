## Problem
The beat dropdown / beat lists filter on `beats.created_by = current user`. On beat transfer the `user_id` (owner) changes but `created_by` does **not**, so the new owner can't see the beat in:
- Add Retailer page (0 beats shown)
- Beat Detail "move retailers" picker
- Beat Planning (offline cache)
- MyBeats (offline cache fallback)

Verified live example: beat **Sayyaji Rao Road & Devaraja Market Area** has `user_id` = Dharmesh, `created_by` = Nishdeep, no `beat_user_access` rows → invisible to Dharmesh in Add Retailer.

## Fix — replace `created_by` ownership filters with `user_id`

### 1. `src/pages/AddRetailer.tsx`
**Online query (line ~258–263)** — replace
```ts
.from('beats')
.select('beat_id, beat_name, user_id, created_by, owner_name, is_active, id')
.eq('created_by', user.id)
.eq('is_active', true)
```
with
```ts
.from('beats')
.select('beat_id, beat_name, user_id, created_by, owner_name, is_active, id')
.eq('user_id', user.id)
.eq('is_active', true)
```
Keep the `beat_user_access` merge and `byId` dedupe untouched.

**Cache-first path (line ~228)** — restrict to owner so other users' cached beats don't leak in:
```ts
const userBeats = cachedBeats.filter((beat: any) =>
  beat.is_active !== false &&
  (beat.user_id === user.id || beat.access_type) // owned OR shared/coverage
);
```

### 2. `src/pages/BeatDetail.tsx` (line 574)
Reassignment picker — list beats the current user owns, not those they created:
```ts
.eq('user_id', user.id)
```

### 3. `src/pages/BeatPlanning.tsx` (line 111)
Offline cache filter — use owner field:
```ts
const userBeats = cachedBeats.filter(
  (b: any) => b.is_active !== false && b.user_id === effectiveUserId
);
```

### 4. `src/pages/MyBeats.tsx` (line 420)
Drop the `created_by` fallback — after a transfer it incorrectly attributes the beat back to the original creator. Filter strictly by owner:
```ts
const userCachedBeats = cachedBeats.filter((b: any) =>
  effectiveUserIds.includes(b.user_id)
);
```
Leave the online query at line 1245 (`user_id.eq.X,created_by.eq.X`) as-is for now — it intentionally widens to include not-yet-transferred legacy rows; flag for follow-up only if the audit shows it causing duplicates.

## Out of scope
- No schema, RLS, or migration changes — `beats` RLS already permits owners to read their beats.
- Insert paths (`created_by: user.id` on new beat creation) remain unchanged — `created_by` is still a valid audit field.
- `beat_user_access` merge logic untouched.

## Verification
1. Logged in as **Dharmesh** → `/add-retailer`: "Sayyaji Rao Road & Devaraja Market Area" appears, dropdown shows ≥1 beats.
2. Same beat appears in MyBeats and BeatPlanning for Dharmesh, both online and offline (after a refresh that re-caches).
3. Logged in as **Nishdeep** (original creator, no longer owner): beat does **not** appear (correct — he no longer owns it).
4. Logged in as a user with only a `beat_user_access` row: beat still appears in AddRetailer (merge path).
5. BeatDetail "move retailers to another beat" picker on a transferred beat lists the new owner's other beats.
