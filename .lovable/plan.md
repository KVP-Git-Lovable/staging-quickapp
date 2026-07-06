
## Goal

Surface EOD-cancelled retailers as an actionable "carried over" list in two places:
1. Rep-facing **My Visits** day view (self).
2. **Beat Coordinator** admin day/rep view (for each rep).

Both call the DB functions already created: `get_carry_forward_retailers` and `add_carry_forward_to_plan`.

## Scope

### 1. Shared hook — `src/hooks/useCarryForward.ts` (new)
- `useCarryForwardRetailers(userId, date)` — React Query fetch of `get_carry_forward_retailers(userId, date)`. Enabled only when `userId && date` and `operations_config.carry_forward_enabled === true` and `date === today`.
- `useAddCarryForward()` — mutation calling `add_carry_forward_to_plan(userId, date, ids?)`. On success invalidates the day's visits query key and the carry-forward query.
- Reads `carry_forward_enabled` via a small `useOperationsCarryForward()` helper (single-row `operations_config` select, cached).

### 2. Shared UI — `src/components/visits/CarryForwardBanner.tsx` (new)
Props: `userId`, `date`, `visitsQueryKey` (for invalidation), optional `variant: 'banner' | 'chip'`.
- `banner` (rep view): shadcn `Alert` at top: "{N} retailers carried over from earlier". Expand to show list (name + cancelled_on). Checkboxes (default all selected). Primary button "Add to today's plan" → mutation with selected ids → toast + auto-collapse.
- `chip` (coordinator view): compact `Badge` + button "Add to plan" that opens a small `Popover` with the same list/checkboxes/confirm.
- Hidden entirely when count is 0 or feature disabled or date != today (banner variant only; chip variant respects `date` prop as-is so coordinator can view any date but action still permitted for today+).

### 3. My Visits integration
Files: `src/pages/MyVisits.tsx` and `src/pages/MyVisitsOptimized.tsx` (verify which is active; add to the one used by the current route, and to both if both are reachable).
- Import `CarryForwardBanner`, render above the visit list when `selectedDate === today`.
- Pass current `user.id`, `today`, and the existing visits query key so the list refetches after "Add to plan".
- Extend the visit list row/`VisitCard.tsx` to show a small `Badge` "Carried over" when `visit.is_carry_forward === true`. Tooltip: `Carried from {carried_from_date}`.

### 4. Beat Coordinator integration
File: `src/components/admin/beat-coordinator/BeatCoordinatorDayPanel.tsx` (per-rep day view) and `RepSidebar.tsx` (per-rep list).
- In the per-rep row/header, render `<CarryForwardBanner variant="chip" userId={rep.id} date={selectedDate} .../>`.
- Uses the same mutation; on success invalidate the coordinator day-visits query.

## Technical Details

- **Types**: `get_carry_forward_retailers` return row is `{ retailer_id: string; retailer_name: string; cancelled_on: string }`. `add_carry_forward_to_plan` returns `number`. RPCs are already in generated `types.ts` after the last migration.
- **Query keys**:
  - `['carry-forward', userId, date]`
  - Existing visits keys already in `MyVisits*` and `BeatCoordinatorDayPanel` — read them before wiring to reuse verbatim.
- **Gating**: `carry_forward_enabled` fetched once via React Query (`['operations-config','carry-forward']`, staleTime 5 min).
- **Today check**: use `date === format(new Date(), 'yyyy-MM-dd')` in the app timezone helper already present (`useAppTimezone`).
- **Permissions**: RPCs enforce self-or-subordinate via `is_subordinate_of`. No client-side role check needed; coordinator page is already permission-gated.
- **Badge on visit rows**: `is_carry_forward` and `carried_from_date` columns were added in the prior migration; regenerated types expose them on `visits`.

## Out of scope

- Bulk "add all reps' carry-forwards" action in coordinator (can be added later).
- Editing/removing individual carried-forward planned visits (existing visit edit flow already handles).
