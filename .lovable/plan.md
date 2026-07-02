## Goal
Bring the existing Edited Orders view into the **Operations Monitor** tab bar as a new tab placed **right after "Cancelled"**, matching how the other tabs (Orders, Stock, Payments, Competitor, Return Stock, Cancelled) behave. Remove the standalone "Edited Orders" button in the page header since the view is now inline.

## Changes

### 1. Extract Edited Orders body into a reusable section component
- **New file:** `src/components/operations/EditedOrdersSection.tsx`
- Move the content of `src/pages/EditedOrders.tsx` (data fetch, search, edit-log table, expandable before/after diff) into this component, minus the `<Layout>`, back button, page heading, and outer page padding.
- Keep the same fetch (`order_edit_log` + profile names + invoice numbers), search input, refresh button, expandable diff rows, and formatting utilities. No business logic changes.
- Export a default `EditedOrdersSection` component that renders just the Card (search + table).

### 2. Add "Edited" tab in Operations Monitor
- **File:** `src/pages/Operations.tsx`
- In the `TabsList` (currently `grid-cols-7`), append a new `<TabsTrigger value="edited">Edited</TabsTrigger>` after `cancelled`, and update to `grid-cols-8`.
- Add `<TabsContent value="edited">` after the Cancelled tab content, rendering `<EditedOrdersSection />`.
- Remove the top-right **"Edited Orders"** header button (the `<Pencil …/> Edited Orders` button around line 1249) since the view now lives inside the tabs.
- Leave the existing "Edited" badges on individual order rows in the Orders tab untouched.

### 3. Keep legacy route working
- Keep `src/pages/EditedOrders.tsx` and its route intact (used by deep links from the Orders tab "Edited" badge / notifications). It will simply re-render `EditedOrdersSection` inside its existing `Layout` wrapper so behavior stays identical, while the Operations tab consumes the same component.

## Out of scope
- No changes to permissions, RPCs, or the `order_edit_log` schema.
- No visual redesign of the existing edit-log table.
