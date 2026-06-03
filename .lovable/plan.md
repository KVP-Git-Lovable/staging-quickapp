## Goal

Make the offline retailer cache include retailers from beats shared with the current user (via `beat_user_access`), not just their own retailers.

## File to modify

`src/hooks/useOfflineRetailers.ts` — specifically the `getAllRetailers` function (lines ~181-214). This is the single fetch path that hydrates IndexedDB (`STORES.RETAILERS`) for offline use.

## Change

Replace the current single `select('*')` with a three-step parallel fetch + merge:

1. Resolve current user via `supabase.auth.getUser()`.
2. Fetch own retailers: `from('retailers').select('*').eq('user_id', userId)`.
3. Fetch accessible beat IDs:
   ```ts
   const { data: accessibleBeats } = await supabase
     .from('beat_user_access')
     .select('beat_id')
     .eq('user_id', userId)
     .eq('is_active', true)
     .or(`effective_to.is.null,effective_to.gt.${new Date().toISOString()}`);
   const beatIds = accessibleBeats?.map(b => b.beat_id) ?? [];
   ```
4. If `beatIds.length > 0`, fetch shared retailers:
   ```ts
   from('retailers').select('*').in('beat_id', beatIds).neq('user_id', userId)
   ```
5. Merge `own + shared`, dedupe by `id` (Map-based), then `offlineStorage.mergeData(STORES.RETAILERS, merged)` and return.

Offline branch (no network) is unchanged — IndexedDB already holds both sets from the last online sync.

Error handling: if the `beat_user_access` query fails, fall back to own retailers only and log a warning (do not block).

## Out of scope

- `useOfflineSync.ts` retailer paths (lines 632/654/872/885/948) — those are queue-sync writes (update/insert by id), not list fetches, so they don't need filtering changes.
- `useOfflineRetailers.createRetailer/updateRetailer/deleteRetailer` — unchanged.
- RLS policies — assumed to already permit reading shared retailers (Messages 1-7 set this up via `beat_user_access`).
- No DB migration, no type changes.

## Verification

- Reload the app while online → IndexedDB `retailers` store contains both own and shared-beat retailers.
- Disconnect → retailers from shared beats still listed.
