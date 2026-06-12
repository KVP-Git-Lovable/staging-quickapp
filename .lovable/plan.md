## Goal
Rename the user-facing label "KG" to "PCs" everywhere in the Analytics screen. Calculations, data, and DB conversions stay exactly the same — only the displayed text/unit string changes.

## Scope of changes (display strings only)

1. `src/components/analytics/SupervisorReport.tsx`
   - `formatKg` → output `"... PCs"` instead of `"... KG"`.
   - Summary cards: "Total KG" card title → "Total PCs".
   - Table column headers: "Total KG" → "Total PCs".
   - Product/SKU table unit cell (currently hardcoded `'KG'`) → `'PCs'`.
   - PDF export labels: `'Total Quantity (KG)'` → `'Total Quantity (PCs)'`; PDF table head `'Total KG'` → `'Total PCs'`; SKU export unit value `'KG'` → `'PCs'`.
   - Tooltips/legends showing "KG" → "PCs".

2. `src/components/analytics/AnalyticsDetailDialogs.tsx`
   - Fallback unit cell `'KG'` → `'PCs'`.

3. `src/components/analytics/useBusinessMetrics.ts`
   - The `formatQuantity` helper returns `unit: 'KG'` for kg/gram inputs → return `'PCs'` instead (label only; numeric value unchanged).

Internal variable names (`totalKg`, `total_kg`, `toKgQuantity`, `getKgQuantity`, `quantity_kg`) will be left as-is to keep the diff minimal and avoid regressions. Only user-visible strings change.

## What is NOT changed
- No DB migration.
- No change to gram→KG numeric conversion (÷1000 still happens; values stay identical).
- No change to Customer Portal, Order Entry, Cart, Packing List, Invoices, or any other module — only the Analytics components above.
- Sorting, totals, charts, and CSV/PDF numbers stay the same.

## Side effects / risk
- Purely cosmetic. Numbers in the cards will read e.g. `12.5 PCs` where the underlying value is 12.5 kg (i.e. 12,500 g). If users expect "PCs" to mean discrete pieces, the number may look small — flagging so you're aware. If that's a problem, we'd need option 2 (treat raw values as PCs) instead.
- PDF/CSV exports will say "PCs" in headers and totals.
- No impact on other screens, RLS, edge functions, or stored data.
