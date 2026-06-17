# Move Counter & Event into the Navigation bar

Goal: Expose **Counter** and **Event** as two separate, first-class items in the main Navigation menu (Navbar hamburger grid) so users can reach them directly, instead of going through `Visits → Activity → Counter/Event`.

## Scope

Frontend / presentation only. No backend, no schema, no logic changes inside `CounterSales` or `EventCreate` pages — they keep working exactly as today.

## Changes

### 1. `src/components/Navbar.tsx`
Add two new entries to the `baseItems` array used by the nav grid (same shape as existing items):

- **Counter** — `icon: Store`, `href: "/counter-sales"`, label `nav.counter`, color `from-orange-500 to-orange-600`
- **Event** — `icon: CalendarDays`, `href: "/event-create"`, label `nav.event`, color `from-pink-500 to-pink-600`

Placed right after `my-visit` so they sit alongside the field-rep workflow. Gated only by the same permission helpers used for sibling items (no new gates added — if `action_visit_activity` should still apply, we reuse it; otherwise they show for everyone, matching the rest of the grid). I'll mirror the gating that currently controls the `Activity` button in `MyVisits.tsx` so the user-visible permission story doesn't change.

### 2. `src/i18n/locales/en/common.json`
Add two translation keys under `nav`:
- `nav.counter` → `"Counter"`
- `nav.event` → `"Event"`

### 3. `src/pages/MyVisits.tsx`
Remove the now-redundant entry point:
- Delete the `Activity` button (line ~1382-1385) and the `ActivityChooserModal` render block (~1703).
- Keep `AddActivityModal` import/usage removed too if no other caller remains; otherwise leave intact.
- Keep `ActivityEventsTable` and all activity *display* logic — only the **trigger** is moved.

### 4. `src/components/ActivityChooserModal.tsx`
Delete the file — it's no longer referenced after step 3.

## Out of scope

- No changes to `CounterSales`, `EventCreate`, `AddActivityModal`, or activity persistence.
- No changes to the Counter/Event UX inside their pages.
- No new permissions; reuse existing `action_visit_activity` gating if currently applied.

## Verification

1. Open the Navbar hamburger → confirm **Counter** and **Event** appear as separate tiles.
2. Click **Counter** → lands on `/counter-sales`, full bulk-billing flow works.
3. Click **Event** → lands on `/event-create`, event creation flow works.
4. Open `My Visits` → the old **Activity** button is gone; the activity events table still renders as before.
5. No console errors; no broken imports.
