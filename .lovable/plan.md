## Retail Management table: spacing, column visibility, and export

All changes are limited to `src/pages/RetailManagement.tsx`. The reusable export dialog (`src/components/RetailerExportDialog.tsx`) already exists with field-selection — we just wire it in.

### 1. Column visibility control

- Define a `RETAILER_COLUMNS` array with `{ key, label, alwaysVisible? }` for each of the 12 columns (Photo, Retailer Name, Contact Person, Phone, Address, Territory, Status, Last Visited, Added By, Verification, Verified By, Actions).
- Add `visibleColumns` state (Set of keys), persisted to `localStorage` under `retail-management:visible-columns` so the user's choice survives reloads. Default = all visible except `contact_person` and `added_by` (denser default).
- Mark `name` and `actions` as `alwaysVisible` (can't be hidden).
- Add a **"Columns"** dropdown button in the toolbar (next to filters) using shadcn `DropdownMenu` + `DropdownMenuCheckboxItem`, one item per column. Includes "Show all" / "Reset" actions.
- Render each `<TableHead>` and matching `<TableCell>` conditionally via `visibleColumns.has(key)`. Update `colSpan` of the empty-state row to `visibleColumns.size`.

### 2. Proper column spacing

- Wrap the table container with `min-w-full` and set explicit widths/min-widths on key columns to avoid squashing:
  - Photo: `w-[64px]`
  - Retailer Name: `min-w-[200px]`
  - Phone: `min-w-[130px] whitespace-nowrap`
  - Address: `min-w-[240px]`
  - Territory / Status / Verification: `min-w-[120px]`
  - Last Visited / Added By / Verified By: `min-w-[160px] whitespace-nowrap`
  - Actions: `w-[140px] text-right`
- Keep the existing `overflow-x-auto` wrapper so the table scrolls horizontally on small screens instead of wrapping awkwardly.
- Add `whitespace-nowrap` to header cells; allow address to wrap with `break-words`.

### 3. Export with field selection

- Import `RetailerExportDialog` and add an **"Export"** button (with `Download` icon) in the toolbar near the Columns dropdown.
- Add `exportOpen` state; clicking Export sets it true.
- Pass the **currently filtered** retailers (`filteredRetailers`) and `filteredCount` so export respects active filters, not pagination.
- The dialog already supports per-field selection (default + optional columns), XLSX/CSV format, and select-all/clear/reset — no changes needed there.

### Technical notes

- No schema/data changes. No changes to verification flows, RLS, or any other page.
- Uses existing shadcn `DropdownMenu`, `Checkbox`, `Button` primitives.
- LocalStorage key is namespaced to avoid colliding with other tables.
- The Verified By column added previously stays intact; it's just one of the toggleable columns.
