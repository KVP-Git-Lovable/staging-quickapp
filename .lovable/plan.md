
## Goal
Turn `src/components/AddActivityModal.tsx` from a 3-step flow (Category → Sub-type → Schedule) into a **single-screen scheduler** with a more vibrant, modern look. No backend or logic changes — only layout/UX and styling.

## Single-page layout
Everything visible at once inside a wider (`max-w-3xl`) dialog:

```
┌─────────────────────────────────────────────────┐
│  🎨 Gradient header — "Schedule Activity"       │
│      subtitle + selected chip preview           │
├─────────────────────────────────────────────────┤
│  1. Category (5 colored pill boxes, row)        │
│  2. Sub-type (color-tinted chips, filtered)     │
│  3. When  ── Single / Multi toggle + date(s)    │
│  4. Duration (30m · 1h · 2h · 4h · Full · Cust) │
│  5. Time of day (Full · 1st half · 2nd half)    │
├─────────────────────────────────────────────────┤
│  Summary strip (chips of current selections)    │
│  [Cancel]                    [Schedule 🚀]      │
└─────────────────────────────────────────────────┘
```

- Categories always visible as horizontally-scrollable colored cards; selected one gets a ring + saturated background using its `color` token.
- Sub-types render inline directly under categories (no view-swap, no back button) and use the parent category's color as a soft tint.
- Scheduling section is always mounted (no gating on `selectedType`) but the Schedule button stays disabled until category + sub-type are picked.
- Duration presets + Time-of-day become larger pill chips with icons (Clock, Sun, Moon) and colored active states.

## Visual polish
- Gradient dialog header (`from-primary/10 via-accent/10 to-primary/5`) with rounded top and activity icon in a circular badge.
- Each section wrapped in a subtle `bg-muted/30 rounded-xl p-4` card with a small numbered label chip (①②③④⑤).
- Reuse existing `COLOR_CLASS` map; add a matching `COLOR_RING`/`COLOR_SOFT` map for selected states and sub-type tints — all Tailwind palette classes (no new tokens needed since they're referring to category colors coming from DB, same pattern already used).
- Icons via lucide-react: `Sparkles`, `CalendarDays`, `Clock`, `Sun`, `Moon`, `Sunrise`, `Rocket`.
- Live summary bar above footer shows current picks as colored badges: category → sub-type → date(s) → duration → time-of-day.

## Files touched
- `src/components/AddActivityModal.tsx` — rewrite JSX only. Keep all state, handlers, `createActivity` payload, validation, and `useActivityTypes` usage exactly as-is.

## Out of scope
- No changes to `useActivityEvents`, `useActivityTypes`, DB schema, RLS, or the detail sheet.
- No new dependencies.

## Acceptance
- Opening "Add Activity" shows one scrollable screen with category boxes, sub-type chips, date/duration/time-of-day all visible.
- No "Change" / back button; changing category simply re-filters sub-types below.
- Save payload to `createActivity` is byte-identical to today.
- Schedule button disabled until both category and sub-type are chosen.
