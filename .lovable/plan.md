## Why the cards "don't feel clickable" today

They do call `setAccessTab(...)` but three of the new cards (Total Retailers, Empty Beats, No Visits) all set the same value `'mine'` — which is also the default tab. So clicking changes nothing visibly, and there's no selected-state highlight on the card itself. Avg Order Value and Orders This Month have no click handler at all. We'll fix both: dedicated filter modes + a ring highlight on the active card.

## Changes to `src/services/beatService.ts`

Extend `BeatStats` and `getBeatStats(userId)`:

- Drop `totalRetailers`. Add:
  - `activeRetailers: number` — retailers with status='active' (or null) on any of my beats (active + inactive beats)
  - `inactiveRetailers: number` — retailers with status='inactive' on any of my beats
- Return two id sets used by the page to filter the beat list:
  - `emptyBeatIds: string[]` — active beats with 0 retailers
  - `noVisits30dBeatIds: string[]` — active beats where no retailer has a `check_in_time` in last 30 days
  - `sharedByMeBeatIds: string[]` — beat_ids from `beat_user_access` where `granted_by = userId` and active
  - `pendingCoverageBeatIds: string[]` — beat_ids from `beat_coverage_assignments` where `primary_user_id = userId`, `is_active`, `start_date > today`
- Counts (`emptyBeats`, `noVisits30d`, `sharedByMe`, `pendingCoverage`) are derived from `.length` of those arrays so the badge and the filter agree.

Retailers fetched once via `.in('beat_id', allMyBeatIds)` and reused for active/inactive split + empty/no-visit computation (no extra round-trips).

## Changes to `src/pages/MyBeats.tsx`

### 1. Widen `accessTab` type

```ts
type AccessTab =
  | 'mine' | 'shared' | 'covering' | 'inactive' | 'all'
  | 'empty' | 'no-visits' | 'shared-by-me' | 'pending-coverage';
```

The visible `<Tabs>` component keeps its current 5 options; the extra 4 modes are set only via card clicks and surface a "Filtered by …  ✕ Clear" pill above the list.

### 2. Beat list filter switch (around line 1430)

Add cases for the new modes, using the id sets from `beatStats`:

```ts
if (accessTab === 'empty')             return beatStats.emptyBeatIds.includes(beat.beat_id);
if (accessTab === 'no-visits')         return beatStats.noVisits30dBeatIds.includes(beat.beat_id);
if (accessTab === 'shared-by-me')      return beatStats.sharedByMeBeatIds.includes(beat.beat_id);
if (accessTab === 'pending-coverage')  return beatStats.pendingCoverageBeatIds.includes(beat.beat_id);
```

### 3. Compact card layout

Replace the current `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4` block with a denser grid:

- `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2`
- Card: `p-2.5`, `border-l-2`, no description line
- Number: `text-lg font-bold`
- Label: `text-[11px] font-medium leading-tight`
- Active card: `ring-2 ring-<color>-500`

### 4. The 8 cards (left → right)

| # | Card | Value | Click → setAccessTab(...) |
|---|---|---|---|
| 1 | Active Retailers | `activeRetailers` | (no click — informational) |
| 2 | Inactive Retailers | `inactiveRetailers` | (no click — informational) |
| 3 | Empty Beats | `emptyBeats` | `'empty'` |
| 4 | No Visits (30d) | `noVisits30d` | `'no-visits'` |
| 5 | Avg Order Value | `₹avgOrderValue` | (no click — informational) |
| 6 | Orders This Month | `ordersThisMonth` | (no click — informational) |
| 7 | Shared By Me | `sharedByMe` | `'shared-by-me'` |
| 8 | Pending Coverage | `pendingCoverage` | `'pending-coverage'` |

Informational cards get `cursor-default` and no hover/ring; actionable cards keep `cursor-pointer hover:shadow-md` plus the ring highlight when active.

### 5. Filter pill above the list

When `accessTab` is one of the extra 4 modes, render a small chip:

```
Filtered: Empty Beats (1)   [✕ Clear]
```

`Clear` resets to `'mine'`. This makes the click effect obvious because the user can see both the highlighted card AND the chip change.

## Acceptance

- Card grid is ~half the vertical height of the current screenshot.
- No "Total Retailers" card; Active + Inactive retailer counts appear instead.
- Clicking Empty Beats / No Visits / Shared By Me / Pending Coverage:
  - Highlights the clicked card with a colored ring
  - Shows the "Filtered: …" chip
  - Shrinks the beat list to only the matching beats
- Clear chip restores the default `mine` view.
- Active Retailers, Inactive Retailers, Avg Order Value, Orders This Month remain visually quiet (no pointer cursor, no hover ring).

## Out of scope

- No changes to `MyRetailers.tsx` in this pass.
- No new RPCs; everything is computed in JS from the existing `retailers`, `visits`, `beat_user_access`, `beat_coverage_assignments` queries inside `getBeatStats`.
