## Goal

Today, clicking **My Visits → Auto Plan** immediately calls the `auto-generate-beat-plan` edge function with `forceRegenerate: true`, writes rows to `beat_plans`, and navigates to the rationale page. We will keep the scoring/assignment engine 100% as is, but split the flow into **Generate Preview → Review/Edit → Save**.

---

## New User Flow

1. User clicks **Auto Plan** in My Visits.
2. Instead of generating immediately, navigate to a new page **`/auto-plan-preview`**.
3. Page header asks for:
   - **From Date** (default: today)
   - **To Date** (default: end of next week, same window the engine uses today — capped at e.g. 31 days)
   - **Generate Preview** button
4. On Generate, call the edge function in **preview mode** — it returns the proposed `weeklyPlan` + rationales without writing to `beat_plans`.
5. Preview rendered as a **calendar view** (week grid) for the chosen range, with each day showing the assigned beat card (beat name, retailer count, est. value, badge for pre-scheduled).
6. User can:
   - **Drag a beat** from one day to another (swap or move).
   - **Remove** a beat from a day (clear that day).
   - **Replace** a beat via a dropdown of the user's active beats (also lets them add a beat to an empty/removed day).
   - Pre-scheduled days stay **locked** (same lock icon convention as the rationale page).
7. Footer shows **Discard** and **Save Plan**. Save Plan writes only the edited plan to `beat_plans` and then routes to the existing `/auto-plan-rationale` (or back to My Visits) with a success toast.

---

## Implementation

### 1. Edge function: `supabase/functions/auto-generate-beat-plan/index.ts`

Extend the request body (backward compatible):

```ts
{ userId, forceRegenerate?, previewOnly?: boolean, fromDate?: string, toDate?: string }
```

- `getPlanningDays()` becomes `getPlanningDays(fromDate?, toDate?)`. When both are supplied, build the day list between them; otherwise keep current "rest of this week + next week" behavior.
- When `previewOnly === true`: skip the `beat_plans` insert/delete block and the `ai_autonomous_actions` insert. Return the same response shape (`weeklyPlan`, `rationales`, `plansCreated: 0`, `previewOnly: true`).
- Pre-scheduled detection logic is unchanged — those days still come back flagged so the UI can lock them.

### 2. New endpoint: `supabase/functions/save-beat-plan/index.ts`

Accepts the user-edited plan and persists it:

```ts
{ userId, fromDate, toDate, days: [{ date, beat_id, beat_name, retailers, estimated_value, rationale }] }
```

Logic:
- Auth-verify caller matches `userId` (or is admin).
- Inside a single transaction-style sequence:
  - Delete existing auto-generated `beat_plans` rows for `userId` in `[fromDate, toDate]` where `beat_data->>'auto_generated' = 'true'` (mirrors current force-regenerate behavior, preserves manually pre-scheduled rows).
  - Insert one row per day in `days` (skip days the user emptied).
  - Insert one summary `ai_autonomous_actions` row (same shape used today).
- Return `{ plansCreated, prescheduledPreserved }` so the existing rationale page renders unchanged.

### 3. Frontend: `src/pages/MyVisits.tsx`

Replace `handleAutoGeneratePlan` body: instead of invoking the function, do `navigate('/auto-plan-preview')`. Keep the `showAutoPlan` permission check and button styling exactly as is.

### 4. New page: `src/pages/AutoPlanPreview.tsx` + route in `src/App.tsx`

Sections:
- **Date range bar** — two shadcn date pickers (with `pointer-events-auto`) + `Generate Preview` button. Validation: `from <= to`, range ≤ 31 days.
- **Calendar grid** — reuse styling from My Visits week view. One column per day in the selected range, wrapping into weekly rows. Each cell shows beat card or "No beat" placeholder.
- **Edit interactions**:
  - `@dnd-kit/core` (already in repo if present; otherwise HTML5 drag-and-drop fallback) for drag between days.
  - Per-cell menu: Remove, Replace (opens beat picker populated from the same `beats` query used in My Visits).
  - Locked cells (`is_prescheduled`) show a lock icon and ignore drag/remove/replace.
- **Footer** — Discard (navigate back) and Save Plan (calls `save-beat-plan`, then `navigate('/auto-plan-rationale', { state: { planResult } })`).
- Loading + empty states identical to current rationale page conventions.

### 5. i18n keys
Add `visits.autoPlanPreviewTitle`, `visits.fromDate`, `visits.toDate`, `visits.generatePreview`, `visits.savePlan`, `visits.discardPreview`, `visits.removeBeat`, `visits.replaceBeat`, `visits.prescheduledLocked` to `src/i18n/locales/en/common.json`. Other locales fall back to English (existing pattern).

### 6. Permissions
Reuse the existing `action_visit_auto_plan` permission for both the button and the new preview/save routes. No new permission needed.

---

## What stays untouched

- The scoring algorithm, retailer prioritization, pre-scheduled preservation, consecutive-day de-duplication, and rationale generation in the edge function.
- `AutoPlanRationale.tsx` — still rendered after Save, just with user-edited data.
- The original "rest-of-week + next-week" default range is preserved when the user doesn't change the date pickers.

---

## Out of scope

- Bulk auto-plan across multiple users (admin scheduler) — keeps using the existing cron path with no `previewOnly`.
- Re-running the scoring engine on a per-cell edit (we just let the user manually swap from the beats list).
- Persisting draft previews across sessions (preview lives in component state only).
