## Goal
Fix the app-wide bug where retailer queries against a beat use `beats.id` (UUID) instead of `beats.beat_id` (text). The `retailers.beat_id` column stores the text code, so any filter using the UUID returns 0 rows — which is why Beat detail and Beat cards show empty retailer counts and lists.

## Root cause
Two ID columns on `beats`:
- `beats.id` — UUID
- `beats.beat_id` — text code (e.g. `beat_1776158879188_p96py4yji`)

`retailers.beat_id` stores the **text code**. Any code path that selects `beats.id` and then filters retailers by it silently returns nothing.

## Audit scope
Every file containing a query against `retailers` (select/update/count) filtered by `beat_id`, and the upstream code that supplies the value. Each must pass the text `beat_id`, never the UUID.

## Confirmed bugs to fix

1. **`src/pages/MassBeatTransfer.tsx`**
   - Line 58: selects `beats.id` instead of `beat_id`. Change select to `id, beat_id, beat_name`.
   - Keep `Beat` interface but add `beat_id: string`.
   - Lines 80, 186, 196, 198, 216: replace `sourceBeatId`/`destBeat.id`/`sourceBeat.id` with the text `beat_id`. Drive the dropdown by `beat_id` (or keep UUID for the Select value but resolve `beat_id` when querying/updating retailers).

2. **Sweep all `.eq('beat_id', X)` / `.in('beat_id', X)` calls on the `retailers` table** and verify `X` is a text `beat_id`. Files to verify (most already correct, a few suspect):
   - `src/components/BeatAnalyticsModal.tsx` (beatId prop): in `MyBeats.tsx` it is passed `selectedBeatForAnalytics.id` — that `id` is mapped from `beat.beat_id`, so OK; in `BeatDetail.tsx` confirm same.
   - `src/components/BeatVisitCalendar.tsx`, `BeatAuditTimeline.tsx`, `BeatTransferDialog.tsx`, `BeatInsightModal`, `BeatAllowanceManagement.tsx`, `MassEditBeatsModal.tsx`, `TomorrowBeatPlan.tsx`, `CreateNewVisitModal.tsx`, `VanStockManagement.tsx`, `AddRetailerInlineToBeat.tsx`, `EditBeatModal.tsx`, `performance/TargetVsActualCard.tsx`, `BeatPlanning.tsx`, `hooks/useBeatMetrics.ts`, `hooks/useRetailerBeatHistory.ts`, `hooks/useBeatCoordinatorMonth.ts`, `hooks/useMissedBeats.ts`, `hooks/useCalendarData.ts`, `pages/MyBeats.tsx`, `pages/BeatDetail.tsx`, `pages/CreateBeat.tsx`.
   - For each, trace the source of the value passed in. If it ultimately comes from `beats.id` (UUID), change the upstream query/prop to use `beats.beat_id`.

3. **`src/components/BeatCard.tsx` retailer count** — comes from `MyBeats` which already maps `beat.beat_id`. Re-verify nothing along the chain reverts to UUID.

4. **`src/pages/BeatDetail.tsx`** — already resolves `beat?.beat_id ?? id` before querying retailers; verify no remaining `beat.id` usages leak into retailer filters.

## Method
For every file in the audit list:
1. Read the query and the variable feeding `beat_id`.
2. Trace back to the source. If it's a `beats` row fetched with `select('id ...')` and used as a retailer filter, replace with `beat_id` (text) end-to-end.
3. Leave all unrelated logic, UI, styling untouched.

## Non-goals
- No UI/layout/styling changes.
- No schema changes; no edits to other modules (orders, distributors, visits) unless their filter on `retailers.beat_id` is also wrong.
- No change to queries that legitimately use `beats.id` (e.g. `distributor_beat_mappings.beat_id` which references the UUID).

## Verification
- Open `/my-beats` → cards show non-zero retailer counts where retailers exist.
- Open a Beat detail page → "Retailers in this Beat (N)" matches DB and the list renders.
- Mass Beat Transfer page → selecting a source beat loads its retailers; transfer writes text `beat_id` to `retailers`.
- `grep` confirms no remaining `.eq('beat_id', <somethingThatIsUUID>)` against the `retailers` table.
