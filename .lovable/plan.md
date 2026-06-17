## Goal

Rebuild the **My Visits → Activity → Add Activity / Event** module to support 7 visit types (Customer, Beat, Joint, Route survey, Distributor, Event, Meeting) per the uploaded spec, **without** disturbing the existing order/visit flow. After activities are logged, surface them in **Today's Summary** as a rich Activity Log card.

## Safety analysis (why this won't break order flow)

- Orders read/write: `orders`, `order_items`, `visits (visit_type='retailer')`, `retailers`, `beat_plans`, `retailer_visit_logs`.
- This feature writes: `activity_events`, `visits (visit_type='activity')`, optional `joint_sales_sessions`, `joint_sales_feedback`.
- `visits` is shared but isolated by `visit_type`. Activity visits have no `retailer_id` for most types, so `useVisitsDataOptimized` (which filters by `retailer_id`) skips them. `TodaySummary` already filters activities with `.eq('visit_type','activity')`.
- All new `activity_events` columns are nullable `ADD COLUMN IF NOT EXISTS` — no impact on existing rows or queries.
- Legacy `activity_type` values (Event, Meeting, Celebration, Demo, Promotion, Other) are preserved in the new color/label maps; existing cards keep rendering.
- `ActivityEventsTable`'s special Event branch, plus `handleStartActivity`/`handleCompleteActivity`, are left untouched.

## Steps

### 1. DB migration — extend `activity_events`
Add the ~45 nullable columns from the spec (`visit_category`, `activity_sub_type`, `beat_id/name`, `subordinate_user_id`, `joint_session_id`, `distributor_id/name`, `visit_purpose`, `check_in_time/out_time`, GPS, `duration_minutes`, beat counts, outcome/contact/follow-up, footfall/sales, topic/attendees, 5× `rep_rating_*`, `rep_overall_outcome/strengths/improvement_areas/action_items/followup_date`, full `survey_*` block including `survey_proposed_beat_names text[]`). All `ADD COLUMN IF NOT EXISTS`. No GRANT/RLS changes needed (existing policies cover all columns).

### 2. Refactor `src/hooks/useActivityEvents.ts`
- Extend `ActivityEvent` interface with every new field.
- Extend `CreateActivityParams` likewise.
- In `createActivity`:
  - `visitInsert.visit_type = params.visit_category || 'activity'`; also write `check_in_time` when provided.
  - In `activityInsert`, conditionally spread every new param (only if provided — never overwrite with null).
- Add new exported helper `updateVisitCheckOut(visitId, activityId, checkOutTime)` that updates `visits` (status → `productive`) and `activity_events` (`check_out_time` + computed `duration_minutes`).

### 3. Rebuild `src/components/AddActivityModal.tsx`
Full rewrite per spec:
- 7-type icon selector (`Store, Route, Users, MapSearch, Warehouse, Megaphone, CalendarDays`) with colored active state.
- Consolidated state for all 7 forms (customer / beat / joint / route survey / distributor / event / meeting fields).
- Shared header: date picker + GPS capture + check-in/out row (Log check-out enabled after submit).
- Per-type forms exactly as in spec (retailer search, beat selector with auto-load from `beat_plans`, subordinate picker via `useSubordinates`, star ratings + market intel toggle, route-survey wizard with proposed beat-name chips, distributor search, event subtypes, meeting subtype with hour/half/full-day).
- Online-only guard via `useConnectivity()`; toast if offline.
- On submit: call `createActivity` with the right param set, then for `joint_beat_visit` insert into `joint_sales_sessions`, link via `joint_session_id`, and optionally insert into `joint_sales_feedback`.
- Reset form and `window.dispatchEvent('visitDataChanged')` on success.

**Distributor search caveat:** the spec uses `from('distributors')`, but that table doesn't exist in this project (we confirmed earlier). I'll point distributor search at the existing `distributor_users` table (`distinct distributor_id, full_name` ilike) so this type doesn't crash. If you'd rather wait until the missing `distributors` table is restored, say so and I'll hide the Distributor type behind a feature check instead.

### 4. Light update to `src/components/ActivityEventsTable.tsx`
- Extend `ACTIVITY_TYPE_COLORS` with the 7 new ids (keep all legacy keys).
- Add small summary lines for `customer_visit`, `beat_visit`, `joint_beat_visit`, `new_beat_survey` cards per spec.
- Do **not** touch the existing `Event` branch or Start/Complete handlers.

### 5. Update `src/pages/MyVisits.tsx`
- Add `overdueFollowUpCount` query (activities with `outcome='follow_up_needed'` and `follow_up_date <= today`).
- Render a small destructive badge next to the Activity tab.

### 6. Update `src/pages/TodaySummary.tsx` (additive only)
- Add `activitySummary` state with `totalCount`, `totalFieldMinutes`, `byType[]`, `overdueFollowUps`.
- In `fetchTodaysData`'s finally block, fetch `activity_events` for the date range + user scope (respects `managerSelectedUserId` self/all), group by `visit_category || activity_type`, compute durations, and count overdue follow-ups.
- Replace the existing purple `completedActivitiesCount` mini-card with a new **Activity Log** `<Card>` placed after Key Metrics — per-type colored rows showing label, count, total time, and up to 3 entries (name, beat, outcome pill, duration), plus an overdue-follow-up warning footer.
- Leave every other query, card, and state untouched.

### 7. Verification
- Build passes.
- Open `/visits` → Activity tab → Add Activity: each of the 7 types renders, validates, submits, and shows up in the list with the correct summary line.
- Log a customer visit → check `/today` shows the Activity Log card with the right grouping and duration.
- Place a normal primary/secondary order separately to confirm order flow still works unchanged.

## Files touched

- New migration: `supabase/migrations/<ts>_extend_activity_events_for_visit_types.sql`
- Edit: `src/hooks/useActivityEvents.ts`
- Rewrite: `src/components/AddActivityModal.tsx`
- Edit: `src/components/ActivityEventsTable.tsx`
- Edit: `src/pages/MyVisits.tsx`
- Edit: `src/pages/TodaySummary.tsx`

No edits to order, retailer, beat-plan, attendance, or invoice code.
