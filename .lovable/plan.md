## Redesign My Beats: stats, tabs, access-aware cards

Targets two files. No DB changes. Reuses existing `beatService` (created in message 3) and `usePermissions` (created in message 2).

### File 1 — `src/components/BeatCard.tsx` (extend, do not replace)

Add the new access model and permission-gated dropdown while keeping the existing visual layout (stats grid, metrics, territory, footer).

1. Extend props:
   - `accessType?: 'OWNED' | 'CO_OWNER' | 'VIEW_ONLY' | 'COVERAGE'` (default `'OWNED'`).
   - `coverageEndDate?: string | null`, `sharedByName?: string | null`.
   - New optional callbacks: `onShare`, `onAssignCoverage`, `onTransferOwnership`, `onClone`, `onHistory`.
   - Keep existing callbacks (`onEdit`, `onDeactivate`, `onReactivate`, `onDelete`, `onDetails`, `onAIInsights`, `onTransfer`).
2. Header badges:
   - Replace "Transfer Beat" wording. Add an Access badge next to `#beat_number`:
     - `OWNED` → `Owner` (default variant)
     - `CO_OWNER` → `Co-owner` (secondary)
     - `VIEW_ONLY` → `Viewing` (outline)
     - `COVERAGE` → `Covering` (warning tone)
   - Active/Inactive badge stays.
3. Context line under the title:
   - If `accessType === 'COVERAGE'` and `coverageEndDate`: render small muted text `Covering until {format date}`.
   - Else if `sharedByName`: render `Shared by {sharedByName}`.
4. Dropdown menu — pull `const { can } = usePermissions()` inside the card, then render items per the spec matrix:
   - **active + OWNED**: Edit, Share, Assign Coverage, Transfer Ownership, Clone, View History, Deactivate.
   - **active + CO_OWNER**: Edit, View History.
   - **active + VIEW_ONLY / COVERAGE**: View History only.
   - **inactive (any)**: Reactivate, View History, Delete (Delete only when `can('action_beat_delete','delete')` AND `retailer_count === 0`).
   - Each item is wrapped in the matching `can(object, action)` check from the spec. Items with no handler prop are also hidden so existing pages that don't pass the new callbacks don't render dead items.
5. Bottom action row:
   - Keep AI Insights / Edit / Analytics / Deactivate-or-Delete buttons unchanged for backward compatibility, but only render Edit/Deactivate/Delete buttons when the user has the matching permission AND is `OWNED`. For non-owner access types, render only AI Insights + Analytics so visiting reps still see the card.

### File 2 — `src/pages/MyBeats.tsx` (surgical edits)

Keep existing loaders for retailers, recommendations, beat plans, modals, pagination, etc. Only swap the header stats row and the beats grid section.

1. Imports: add `import { usePermissions } from '@/hooks/usePermissions'` and `import * as beatService from '@/services/beatService'`.
2. New state:
   - `myBeatsRaw: BeatWithAccess[]` and `beatStats: BeatStats | null`.
   - `accessTab: 'mine' | 'shared' | 'covering' | 'inactive' | 'all'` (default `'mine'`).
3. New loader `loadMyBeatsAndStats()` called from `loadBeats` (or in parallel via `Promise.all`): runs `beatService.getMyBeats(user.id)` + `beatService.getBeatStats(user.id)` and stores results. Errors are caught and logged; failures do not break the existing `loadBeats` flow.
4. Build a quick lookup `accessByBeatId = new Map<string, BeatWithAccess>()` keyed on `beat.beat_id` (text). Use it to tag existing `beats[]` items with `accessType`, `coverageEndDate`, `sharedByName` before rendering. Beats present in the access query but missing from the existing `beats[]` (e.g. shared from another user the current loader didn't fetch) are merged in with `retailer_count: 0`, `total_retailers: 0`, default metrics — they'll render as cards that still trigger the existing analytics modal.
5. Replace the existing 6-card stats grid (lines ~1352–1424) with 5 cards driven by `beatStats`:
   - My Beats (`total`), Active (`active`), Inactive (`inactive`), Shared With Me (`sharedWithMe`), Covering Today (`covering`). Each card click sets `accessTab` to the relevant value (My Beats → `mine`, Active → `mine` + active filter, Inactive → `inactive`, Shared → `shared`, Covering → `covering`). Removes "No Retailer", "Total Retailers", "Avg per Beat", and the orange "Unassigned Retailers" banner (they are not in the new spec). Keep the existing `statsDetailDialog` state and its dialog — unused entries are inert.
6. Replace the existing `ToggleGroup` (Active/Inactive/All) with a `<Tabs>` block of 5 triggers: `My Beats | Shared With Me | Covering | Inactive | All`, bound to `accessTab`. Keep the heading + count summary above the grid.
7. Filter logic for the grid:
   - `mine` → access `OWNED` && `is_active !== false`.
   - `shared` → access in `['CO_OWNER','VIEW_ONLY']` && `is_active !== false`.
   - `covering` → access `COVERAGE` && coverage end date `>= today`.
   - `inactive` → `is_active === false` regardless of access.
   - `all` → everything in the merged list.
   - Then apply the existing search filter (`searchTerm`) and `selectedUserIds` filter on top.
8. `BeatCard` invocation gets the new props (`accessType`, `coverageEndDate`, `sharedByName`) and the new menu callbacks. For the actions that don't yet have UIs (Share / Assign Coverage / Transfer Ownership / Clone / View History), wire each to a small handler that calls `toast.info('Coming soon')` for now; a follow-up message will swap them for real dialogs. `onEdit`, `onTransfer`, `onDeactivate`, `onReactivate`, `onDelete`, `onAIInsights`, `onDetails` keep their existing wiring.
9. Pagination remains driven by the filtered list (`filteredBeats`).

### Out of scope

- No edits to `EditBeatModal`, `BeatTransferDialog`, `useBeatLifecycle`, recommendations, beat-plans creation, retailer assignment logic, RLS, or DB.
- No new dialogs for Share / Coverage / Clone / History — those land in later messages.

### Risks / notes

- `getMyBeats` issues an `or(...)` filter on `effective_to`; if Supabase rejects null comparison, the fallback already coded in the service handles it.
- Beats that only appear via `beat_user_access` (cross-user shares) won't have `retailer_count` because the existing loader only queries the current user's retailers. They render with count `0` until a dedicated count fetch is added (out of scope here).
