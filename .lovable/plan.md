## Issue

The page shows `Shared With Me = 1`, but the list below says `No beats created yet`.

## Root cause

`MyBeats.tsx` is using two different data sources:

- `beatService.getMyBeats(user.id)` correctly returns owned + shared beats and drives the count card.
- The visible list is built from `beats[]`, which is loaded only by `user_id` / selected users, so beats shared through `beat_user_access` are not included in the rendered list.

So the shared beat exists in the access-aware data, but never gets merged into the list shown on screen.

## Fix

Update `src/pages/MyBeats.tsx` only:

1. Add a `displayBeats` memoized list that starts with the existing `beats[]` list.
2. Merge any missing beats from `myBeatsRaw` using `beat_id` as the key.
3. Preserve existing fields needed by `BeatCard`:
   - `id`
   - `name`
   - `category`
   - `created_at`
   - `travel_allowance`
   - `average_km`
   - `average_time_minutes`
   - `territory_id`
   - `owner_name`
   - `is_active`
4. Change `annotatedBeats` to map over `displayBeats` instead of `beats`.
5. Keep the existing tab filters unchanged, so:
   - `My Beats` still shows only `OWNED`
   - `Shared With Me` shows `CO_OWNER`, `OPERATIONAL`, and `VIEW_ONLY`
   - `Covering Today` still shows `COVERAGE`

## Scope

No DB schema changes, no RLS changes, no UI redesign, and no order/beat business logic changes.

## Expected result

When `Shared With Me` count is `1`, clicking/selecting that tab will show the shared beat in the list instead of the empty state.