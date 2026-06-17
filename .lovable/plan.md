# Restore "Activity" button on My Visits

Bring back the original **Activity** action button on the My Visits screen so reps can register an activity/event using the existing `AddActivityModal` (the screen shown in the screenshot). Counter and Event stay where they are now (top-level Navigation tabs) — this change is purely additive.

## Changes

### `src/pages/MyVisits.tsx`
1. Add an **Activity** button back into the top action row (same row that already has buttons like Van Stock), gated by the existing `showActivity = canShowAction('action_visit_activity')` flag that is already computed in the file.
2. On click, set `setIsActivityModalOpen(true)` — this opens `AddActivityModal` directly (skipping the old Counter/Event chooser, since those now live in the Nav).
3. Use the same styling as the sibling action buttons (`Sparkles` icon, `variant="secondary"`, identical class names).

No new state, no new modal, no new route — `isActivityModalOpen` and `AddActivityModal` are still wired up in the file.

## Out of scope
- No changes to `AddActivityModal` itself.
- No changes to Counter / Event nav tabs.
- No reintroduction of `ActivityChooserModal`.

## Verification
1. Open `My Visits` → confirm an **Activity** button appears next to Van Stock (when the user has `action_visit_activity` permission).
2. Click it → the `Add Activity / Event` modal opens (matches the screenshot).
3. Save an activity → modal closes, activity appears in the `ActivityEventsTable` as before.
