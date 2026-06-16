## Goal
Remove only the helper sentence shown above the day grid on the Auto Plan Preview page. Everything else (summary card, calendar view, day grid with drag-to-swap and the per-day menu to replace/move/remove, rationale section, save flow) stays exactly as it is.

## Change
**File:** `src/pages/AutoPlanPreview.tsx`

Delete lines 574–579 (the `{/* (3) Helper text */}` block):

```tsx
{/* (3) Helper text */}
{hasPreview && (
  <p className="text-xs text-muted-foreground">
    Each day holds one beat. Drag to swap, use the menu to replace, move, or remove.
  </p>
)}
```

No other edits. The Summary panel (above) and the Calendar grid (below) remain unchanged, so drag-and-drop swapping and the kebab menu (Replace / Move / Remove) continue to work as before.

## Out of scope
- No logic, data, or styling changes to the grid, calendar, rationale, or save flow.
- No route or navigation changes.
