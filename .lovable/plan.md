## Beat Coordinator — fixes + AI features

### 1. Chip colors + new `missed` status
- Extend `DayBeatChip["status"]` in `useBeatCoordinatorMonth.ts` / `useCalendarData.ts` with `"missed"` and `"partial"`.
- In the month aggregator, classify past planned beats with zero completed visits as `missed`; planned with some-but-not-all retailers visited as `partial`.
- In `MonthGrid.tsx`, expand `STATUS_BG` so:
  - `missed` → red (`bg-destructive/15 text-destructive border-destructive/40`)
  - `served` → blue (`bg-beat-served/...`)
  - `partial` → amber (`bg-beat-stale/...`)
- Update the legend row to include Missed and Partial.

### 2. Clickable chips → retailer drill-down
- Make each chip a `<button>` (stop propagation from day cell).
- Clicking opens a new `BeatDayDetailDialog` showing for that rep+date+beat: retailer list with columns Name, Planned, Visit status, Order #, Order value, Last served.
- Data source: `retailers` (by `beat_id`) left-joined with `visits` (rep+date) and `orders` (rep+date+retailer).

### 3. Monthly KPI bar (above calendar)
- New `MonthlyKPIBar.tsx` rendered inside `CalendarTab` above `MonthGrid`.
- 6 cards: Planned beats, Served, Missed, Coverage %, Order value, Productive %.
- Hook `useMonthlyBeatKPIs(repId, monthAnchor)` aggregates from existing month data + orders for the month.

### 4. DayDetailPanel drill-down
- Extend `DayDetailPanel.tsx`: when a day is selected, render a retailer table grouped by beat (Planned, Visited, Order value, Status pill).
- Reuses the same retailer/visit/order query as the chip dialog (shared hook `useDayRetailerDetail`).

### 5. AI Route Plan (new)
- New edge function `ai-weekly-route-plan` (verify_jwt=false, CORS, Lovable AI Gateway, `google/gemini-2.5-pro`).
- Input: repId, week start. Server fetches owned beats + retailers (lat/lng) + last_served + pending dues; passes compact JSON to the model.
- Output: per-day suggested beat order with rationale + estimated km.
- Surface in `AIRoutePlanTab.tsx`: "Generate weekly plan" button, results list, "Apply to calendar" writes to `daily_beat_plans`.

### 6. AI Coverage Suggestion (new)
- New edge function `ai-coverage-suggestion` invoked from `LeaveCoverageTab` (and optionally auto-trigger on approved leave).
- Input: leave rep id, date range. Server fetches teammate candidates (same manager/territory), today's workload (`daily_beat_plans`+`visits`), proximity (avg lat/lng of beats vs leave rep's beats), recent coverage history.
- Model returns ranked list with score + reason; UI shows cards with "Assign coverage" CTA wired to existing `beat_coverage_assignments` insert.

### Technical notes
- All new DB reads use existing tables — no schema migrations.
- Edge functions: secrets already present (`LOVABLE_API_KEY`). No new secrets.
- Status colors use existing `beat-*` tokens; add `beat-missed` token if needed in `index.css` + `tailwind.config.ts` (red HSL).
- Keep React Query keys versioned: `bc-month-v2`, `bc-day-detail`, `bc-month-kpis`.

### Files
- edit: `src/hooks/useBeatCoordinatorMonth.ts`, `src/hooks/useCalendarData.ts`, `src/components/admin/beat-coordinator/MonthGrid.tsx`, `CalendarTab.tsx`, `DayDetailPanel.tsx`, `AIRoutePlanTab.tsx`, `LeaveCoverageTab.tsx`, `src/index.css`, `tailwind.config.ts`
- new: `src/components/admin/beat-coordinator/MonthlyKPIBar.tsx`, `BeatDayDetailDialog.tsx`, `src/hooks/useMonthlyBeatKPIs.ts`, `src/hooks/useDayRetailerDetail.ts`, `supabase/functions/ai-weekly-route-plan/index.ts`, `supabase/functions/ai-coverage-suggestion/index.ts`
