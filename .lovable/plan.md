## Goal

1. Restore the **old one-click Auto Plan flow** on My Visits: clicking Auto Plan generates the plan immediately (no preview detour) and lands on the existing `AutoPlanRationale` page with all per-beat explanations, summary card, "How Auto Plan Works", and the original **Edit Plans / Start Visits** buttons.
2. Make "Edit Plans" open the new `AutoPlanPreview` page (drag/drop editor) so the preview feature stays available without blocking the default flow.
3. Add a **Calendar view** on the Rationale page that shows the new plan's days **and the past 90 days of `beat_plans` history**, so the user can see the recurring day-beat pattern at a glance.

Nothing from the new Preview page is removed; nothing in the Rationale page is removed.

## Changes

### 1. `src/pages/MyVisits.tsx` — restore immediate generation
Replace the current `handleAutoGeneratePlan` (which only navigates to `/auto-plan-preview`) with the original immediate-generate version, then navigate to `/auto-plan-rationale` with the planResult so the rich page renders:

```ts
const handleAutoGeneratePlan = async () => {
  if (!user?.id) return;
  setIsGeneratingPlan(true);
  const t = toast.loading('Generating optimized plan…');
  try {
    const { data, error } = await supabase.functions.invoke('auto-generate-beat-plan', {
      body: { userId: user.id, forceRegenerate: true },
    });
    if (error) throw error;
    const result = data?.results?.[0];
    toast.dismiss(t);
    if (result?.status === 'success') {
      toast.success(`Created ${result.plansCreated} beat plans`);
      invalidateData?.();
      navigate('/auto-plan-rationale', { state: { planResult: result } });
    } else {
      toast.error(result?.reason || 'Failed to generate plan');
    }
  } catch (e) {
    toast.dismiss(t);
    toast.error('Failed to generate plan');
  } finally {
    setIsGeneratingPlan(false);
  }
};
```

Add the missing `isGeneratingPlan` state if it's not already there (it was removed in the last edit). Restore the spinner on the Auto Plan button.

### 2. `src/pages/AutoPlanRationale.tsx` — add Calendar view + wire Edit Plans
- Wrap content in `Tabs` with two tabs: **Details** (existing summary + day cards + "How Auto Plan Works") and **Calendar**.
- The Calendar tab renders a month grid (using existing `Calendar` shadcn component for the date math + a custom day renderer) covering: `min(planStart − 90d, planStart)` through `planEnd`. Two months by default with prev/next month navigation.
- Each calendar day cell shows a colored dot/initials chip indicating its beat. Color legend:
  - Blue = newly auto-planned in this run
  - Amber = pre-scheduled (locked) in this run
  - Gray = historical `beat_plans` row outside this run (past 90 days)
- Click a day → small `Popover` with: beat name, date, source (New / Pre-scheduled / Historical), and (for new days) the same rationale text already shown in the Details tab.
- Legend strip above the calendar.

Data fetching on mount:
```ts
supabase.from('beat_plans')
  .select('plan_date, beat_id, beat_name, beat_data')
  .eq('user_id', userId)
  .gte('plan_date', format(subDays(parseISO(planningPeriod.start), 90), 'yyyy-MM-dd'))
  .lt('plan_date', planningPeriod.start);
```
Merge with `weeklyPlan` (current run) into a single `Map<date, entry>` for rendering. `userId` is taken from `planResult.userId` (already in the payload) — no hardcoding.

- Change the "Edit Plans" button from `navigate('/beat-planning')` to `navigate('/auto-plan-preview')` so it opens the drag/drop editor with the same date range as the saved plan. Optionally pass `{ state: { fromDate, toDate } }` so the preview page can prefill — `AutoPlanPreview` would read this in its existing date pickers (small addition: read `location.state` in its `useEffect` to seed `fromDate`/`toDate`).
- Keep "Start Visits" → `/visits/retailers` unchanged.
- Keep the "How Auto Plan Works" card unchanged.

### 3. `src/pages/AutoPlanPreview.tsx` — accept optional prefill
Tiny addition: when `location.state?.fromDate` / `toDate` are present, seed the date pickers with them (one-time on mount). Default behavior unchanged.

### 4. No DB / no edge function changes
All data already exists in `beat_plans`. Same write surface (`beat_plans` + `ai_autonomous_actions`). Auto-generate edge function still supports `forceRegenerate` (used by the immediate flow) and `previewOnly` (used by the preview flow) — no edit needed.

## Files touched
- `src/pages/MyVisits.tsx` — restore immediate generation + spinner state + navigate to rationale
- `src/pages/AutoPlanRationale.tsx` — add Tabs, Calendar view with 90-day history, change Edit Plans target
- `src/pages/AutoPlanPreview.tsx` — accept optional `location.state` prefill

## Out of scope
- Editing on the Calendar view itself (read-only visualisation; edits remain in the Preview page).
- Changing the scoring algorithm or which fields are stored in `beat_data`.
