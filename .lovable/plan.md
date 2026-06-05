## Goal

Trim the My Beats stat dashboard back to 6 clickable cards and remove all related extra data from `getBeatStats()`.

## Changes

### 1. `src/services/beatService.ts` — shrink `BeatStats`

Keep only these fields on `BeatStats` and on the object returned by `getBeatStats(userId)`:

- `total` — total of user's beats (mine)
- `active` — active beats from mine
- `inactive` — inactive beats from mine
- `sharedWithMe` — count from `beat_user_access` where `user_id = userId`
- `covering` — beats user is covering today
- `emptyBeats` — active beats with 0 retailers

Remove from the interface and from the function body (including the queries / loops that only feed them):

- `activeRetailers`, `inactiveRetailers`
- `noVisits30d`, `noVisits30dBeatIds`
- `avgOrderValue`, `ordersThisMonth`
- `sharedByMe`, `sharedByMeBeatIds`
- `pendingCoverage`, `pendingCoverageBeatIds`
- `emptyBeatIds` (no longer needed since Empty Beats now just sets `'mine'`)

Drop the now-unused fetches: orders-this-month query, visits-30d query, `beat_coverage_assignments` future-dated query, `beat_user_access granted_by = userId` query, and the retailer status split. Keep the single retailers fetch only if still needed for `emptyBeats` (compare active beat ids against retailer `beat_id` set).

### 2. `src/pages/MyBeats.tsx` — 6-card grid

Replace the current 8-card block with exactly 6 cards, in this order, all clickable:

| # | Card | Value | onClick |
|---|---|---|---|
| 1 | My Beats | `beatStats.total` | `setAccessTab('mine')` |
| 2 | Active | `beatStats.active` | `setAccessTab('mine')` |
| 3 | Inactive | `beatStats.inactive` | `setAccessTab('inactive')` |
| 4 | Shared With Me | `beatStats.sharedWithMe` | `setAccessTab('shared')` |
| 5 | Covering Today | `beatStats.covering` | `setAccessTab('covering')` |
| 6 | Empty Beats | `beatStats.emptyBeats` | `setAccessTab('mine')` |

All cards: `cursor-pointer`, `hover:shadow-md`, and `ring-2 ring-<color>-500` when their tab matches `accessTab` (Empty Beats highlights together with My Beats / Active since they all map to `'mine'` — that's fine, matches user spec).

### 3. Cleanup in `MyBeats.tsx`

- Remove the `'empty' | 'no-visits' | 'shared-by-me' | 'pending-coverage'` entries from the `accessTab` type union and from the `filteredBeats` switch.
- Remove the "Filtered: … ✕ Clear" chip block above the beat list (no longer reachable).
- Remove any imports / references to the deleted `beatStats` fields.
- Grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2`, same compact card styling as current (`p-2.5`, `border-l-2`, `text-lg font-bold` value, `text-[11px]` label).

## Out of scope

- No changes to `MyRetailers.tsx`.
- No DB / RPC changes.
