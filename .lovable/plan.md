## Investigation summary

I checked the current Dev working tree, available Git history, database metadata, and relevant Lovable chat history between April 1 and May 20.

### Historical sources found

**Beat Coordinator / Beat Management**

- `mkjio097b051628` — created `src/pages/admin/BeatCoordinator.tsx`.
- `007ed8e9` — created `LeaveCoverageTab.tsx`.
- `7dfaf919` — created `BeatAssignmentTab.tsx` and `AIRoutePlanTab.tsx`.
- `4f40592c` — created the calendar-first implementation:
  - `CalendarTab.tsx`
  - `RepSidebar.tsx`
  - `MonthGrid.tsx`
  - `DayDetailPanel.tsx`
  - `DateRangeAssignDrawer.tsx`
  - `useCalendarData.ts`
- `d710c8b7` — created `dateRangeUtils.ts`.
- `a636484c` — created `halfDayRouteUtils.ts`.
- `327b6d8c` — created `RescheduleMissedDrawer.tsx`.
- `e6479f54` — expanded `AIRoutePlanTab.tsx` into the full AI route planning UI.
- `fc3fc9d2` — latest useful Beat Coordinator snapshot before it disappeared; includes split-chip calendar updates.

**Lovable chat entries used for Beat Coordinator behavior**

- `#4133` to `#4136` — Calendar tab as default Tab 0.
- `#4137` to `#4138` — Beat Assignment tab.
- `#4139` to `#4142` — Leave Coverage and unplanned absence handling.
- `#4143` to `#4144` — AI Route Plan tab.
- `#4145` to `#4148` — missed beat reschedule and shared/split beat assignment.
- `#4149` to `#4150` — “Add beat assignment for today” confirmation that the tab had the requested layout.

**UOM Master**

- `9d2299a8` — first redesigned UOM Master implementation on Apr 28.
- `38911b72` — latest useful UOM Master UI snapshot on Apr 29.
- Historical files present at that snapshot:
  - `src/pages/UomMasterPage.tsx`
  - `src/components/admin/uom/UomMasterPage.tsx`
  - `src/components/admin/uom/ProductUnitsEditor.tsx`
  - `src/lib/uomEngine.ts`

**Lovable chat entries used for UOM behavior**

- `#3795` to `#3798` — exact UOM Master requirements and implementation summary.
- `#3885` to `#3886` — later scalability plan for industry-specific units, primary/secondary units, and active/inactive handling.
- `#4303` to `#4304` — later diagnosis that Product Master and other screens were no longer reading from `uom_master`.

**Product Master Enhancements**

- `8ca7937c` and surrounding Apr 29 commits — Product Master / Product UOM mapping changes.
- `3983` to `3986` chat range — product pagination and modern toolbar.
- `3883` to `3884` chat range — removal of stock fields from Add/Edit Product.
- `3879` to `3882` chat range — large Product Master UOM/packaging/hydration refactor plan; this plan was declined as a full migration, but several parts were later implemented separately.

## Current Dev state vs historical state

### Missing now

**Beat Coordinator**

- `/admin/beat-coordinator` route is missing from `src/App.tsx`.
- Admin Controls card for Beat Coordinator is missing.
- Entire `src/pages/admin/BeatCoordinator.tsx` is missing.
- Entire `src/components/admin/beat-coordinator/` directory is missing.
- Supporting hooks/utils are missing:
  - `src/hooks/useCalendarData.ts`
  - `src/hooks/useBeatCoordinatorMonth.ts`
  - `src/utils/dateRangeUtils.ts`
  - `src/utils/halfDayRouteUtils.ts`
- Edge function `supabase/functions/ai-route-suggestion/` is missing from current tree.

**UOM Master**

- `/admin/uom-master` route is missing.
- Admin Controls card for Unit of Measure Master is missing.
- `src/pages/UomMasterPage.tsx` is missing.
- `src/components/admin/uom/UomMasterPage.tsx` is missing.
- `src/components/admin/uom/ProductUnitsEditor.tsx` is missing.
- `src/lib/uomEngine.ts` is missing.
- Product Master still uses hardcoded units (`kg`, `ltr`, `pcs`) in `ProductFormFields.tsx`.

**Product Master enhancements**

- Product list pagination / total count is missing.
- Modern responsive toolbar from the historical UI is missing.
- Add/Edit product form still shows stock-related UI (`Closing Stock`) and barcode image upload, which historical instructions removed.
- Product Number label has not been restored to the desired “Manufacturer Code (Optional)” wording.
- UOM mapping editor / packaging logic is missing from the current visible UI.

## Database support confirmation

The current database still has the core restoration tables/functions:

- `daily_beat_plans` exists.
- `daily_retailer_assignments` exists.
- `daily_retailer_assignments.stop_order` exists.
- `uom_master` exists.
- `enabled_units` exists.
- `product_uom_mapping` exists.
- `product_uom_mapping` has:
  - `conversion_to_base`
  - `is_base`
  - `is_default_sales`
  - `is_default_purchase`
  - `is_price_basis`
- `get_product_units`, `get_enabled_units`, `get_all_subordinates`, and `is_coordinator` exist.

Important caveat: current `uom_master` has evolved and currently does **not** expose every historical field exactly as the Apr 29 UI expected. For example, `enabled_units.display_order` exists, but `uom_master.conversion_to_base` was not present in the metadata I checked. So UOM restoration should prefer adapting the historical UI to the current schema rather than blindly reverting the old code.

## Confidence estimate

- **Beat Coordinator:** 90–95% match possible. The exact historical source files exist in Git history and the database tables still exist. Some minor adaptations may be needed for current permissions, TypeScript types, and any schema drift.
- **UOM Master:** 75–85% match possible. The exact historical UI exists, but the database schema has changed since then, so the restored UI must be adapted to the current `uom_master` / `enabled_units` model.
- **Product Master Enhancements:** 65–80% match possible. Some historical changes were implemented as smaller follow-up fixes, some were plans that were declined, and the current file has moved away from that UI. I can restore the visible behavior closely, but I will avoid destructive schema reversions.

## Areas that cannot be reproduced exactly without more input

- Screenshots from Lovable history are not directly available to me unless you attach them here. I can restore from exact historical code and chat descriptions, but pixel-perfect screenshot matching may need your screenshots.
- If a historical preview snapshot included uncommitted/generated state that was never saved to Git, I can only infer it from chat summaries.
- UOM conversion-chain display may need schema adaptation because the current DB does not exactly match the Apr 29 UOM UI assumptions.
- The Product Master full-page routes (`/admin/products/new`, `/admin/products/:id/edit`) were proposed in a declined plan, so I will not implement that part unless you explicitly want it.

## Restoration plan

### Phase 1 — Restore Beat Coordinator source and routing

1. Restore from the historical final Beat Coordinator snapshot around `fc3fc9d2`:
  - `src/pages/admin/BeatCoordinator.tsx`
  - all files under `src/components/admin/beat-coordinator/`
  - `src/hooks/useCalendarData.ts`
  - `src/hooks/useBeatCoordinatorMonth.ts`
  - `src/utils/dateRangeUtils.ts`
  - `src/utils/halfDayRouteUtils.ts`
2. Restore route in `src/App.tsx`:
  - `/admin/beat-coordinator`
3. Restore Admin Controls card:
  - title: `Beat Coordinator`
  - route: `/admin/beat-coordinator`
4. Restore `ai-route-suggestion` Edge Function source if required by the AI Route tab.
5. Adapt imports/types to current project files without removing newer app routes or current enhancements.

### Phase 2 — Verify Beat Coordinator workflows

Validate these restored flows:

- Calendar default tab.
- Team sidebar from `useSubordinates()`.
- Month grid with assigned / served / uncovered / shared statuses.
- Date range assignment drawer.
- Beat Assignment tab two-column layout.
- Temp cover / split / permanent assignment.
- Split beat two-rep flow and split revoke dialog.
- Leave Coverage planned leave + unplanned absent cards.
- Missed beat reschedule drawer.
- AI Route tab with fallback retailer loading, stop ordering, save/push/export.

### Phase 3 — Restore UOM Master UI and routing

1. Restore/adapt:
  - `src/pages/UomMasterPage.tsx`
  - `src/components/admin/uom/UomMasterPage.tsx`
  - `src/components/admin/uom/ProductUnitsEditor.tsx`
  - `src/lib/uomEngine.ts`
2. Add route:
  - `/admin/uom-master`
3. Add Admin Controls card:
  - title: `Unit of Measure Master`
  - route: `/admin/uom-master`
4. Adapt the historical UOM UI to current DB structure:
  - use `uom_master` for code/name/category/base metadata
  - use `enabled_units` for enabled/default/display order flags
  - use current `product_uom_mapping` for product-level conversions
5. If an additive DB column is genuinely required for exact conversion-chain editing, I will propose that as a separate migration before coding it.

### Phase 4 — Reconnect Product Master to UOM Master

1. Replace hardcoded Product Master unit dropdowns with live UOM data.
2. Restore Product UOM mapping UI where possible:
  - base unit
  - price basis unit
  - default sales unit
  - default purchase unit
  - packaging rows
  - local preview based on current state
3. Preserve current Product Master data and newer database columns.
4. Avoid removing current business-critical fields unless they are only UI fields already agreed to be hidden.

### Phase 5 — Restore Product Master UI improvements

1. Re-add pagination at 15 products per page.
2. Re-add total product count badge.
3. Restore the responsive toolbar that fits within the viewport.
4. Hide stock-related fields from the Add/Edit Product form.
5. Remove barcode image upload from the product form UI; keep barcode text.
6. Rename Product Number to Manufacturer Code (Optional).
7. Keep all current recent enhancements outside this scope untouched.

### Phase 6 — Integration and verification

1. Check TypeScript import compatibility and route rendering.
2. Verify admin access gating still uses current `useAdminAccess()` behavior.
3. Verify restored UI does not break current `ProductManagementPage`, `AdminControls`, or current routes.
4. Run targeted tests/checks for restored workflows where available.
5. Confirm visually in the preview that the restored routes load:
  - `/admin/beat-coordinator`
  - `/admin/uom-master`
  - `/product-management`

## Preservation rules during implementation

- No destructive database rollback.
- No reverting the full repo to an older commit.
- Restore only the missing feature files/components and adapt them forward.
- Keep current migrations, schema additions, offline-first behavior, permissions model, and recent order/inventory fixes intact.
- If a database change is needed, it will be additive and proposed separately before UI code depends on it.