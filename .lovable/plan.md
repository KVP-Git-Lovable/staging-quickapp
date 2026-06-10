## Goal
Clean up the Columns picker in `/retail-management` so each row has a single radio-style dot indicator shown once, and the dropdown opens cleanly below the trigger without overflowing the page header.

## Changes (single file: `src/pages/RetailManagement.tsx`)

1. **Replace `DropdownMenuCheckboxItem` rows with custom rows** that render a radio-style indicator (filled dot when selected, empty ring when not) followed by the label. The indicator appears exactly once per row, on the left, using `lucide-react` `Circle` / `Dot` (or a small `div` ring with inner dot).
   - Use `DropdownMenuItem` with `onSelect={(e) => e.preventDefault()}` and `onClick={() => toggleColumn(col.key)}` so the menu stays open on toggle.
   - Locked columns (`alwaysVisible`) render with `opacity-50 pointer-events-none` and an always-filled dot.

2. **Anchor dropdown below the trigger with scroll**:
   - `DropdownMenuContent` props: `align="end"`, `side="bottom"`, `sideOffset={6}`, `avoidCollisions={false}`.
   - Add `max-h-[60vh] overflow-y-auto` to the content so long lists scroll inside the menu instead of pushing above the header.

3. **Keep existing behavior intact**: `Show all`, `Reset to default`, label "Show columns", separators, and the `(locked)` suffix for always-visible columns. No changes to state, persistence, table rendering, export, tabs, or any other page logic.

## Visual spec for the row indicator
```
( • )  Phone          ← selected
(   )  Added By       ← unselected
( • )  Actions (locked)   ← disabled, dimmed
```
A 14px circular ring; when selected, a 6px filled dot is centered inside. Uses `border-primary` for the ring and `bg-primary` for the dot, so it matches the existing theme.

## Out of scope
- No schema, RLS, or data changes.
- No changes to filters, table columns, export dialog, verification flow, or tabs.
