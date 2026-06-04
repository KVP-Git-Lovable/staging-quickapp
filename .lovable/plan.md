## Goal
Restructure the Product Management toolbar into two clean rows.

## Layout

**Row 1 — Filters (left-aligned):**
- Search input (`Search products or SKUs...`)
- Status tabs: `Active (6) | Inactive (8413) | All (8419)`
- `Showing: N` badge

**Row 2 — Actions (right-aligned):**
- UoM Master · Sync · Import Product Data · Export Products · Delete All · Add Product

## File
`src/components/ProductManagement.tsx` — replace the current single flex row (around lines 910–925) that wraps `<div className="flex items-center justify-between">` containing both the filter group and the action buttons.

Change to:
```
<div className="space-y-3">
  {/* Row 1: filters */}
  <div className="flex flex-wrap items-center gap-3">
    <Search input (w-80) />
    <Tabs Active / Inactive / All />
    <Badge Showing: N />
  </div>

  {/* Row 2: actions */}
  <div className="flex flex-wrap items-center justify-end gap-2">
    UoM Master, Sync, Import, Export, Delete All, Add Product
  </div>
</div>
```

No logic, state, data fetching, or DB changes — purely a JSX/Tailwind layout refactor of the toolbar block. The action buttons themselves keep their existing handlers/icons/variants untouched.
