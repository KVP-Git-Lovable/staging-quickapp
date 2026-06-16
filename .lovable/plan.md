# UOM-Aware Quantity Reporting

Backend is verified ready: all 4 RPCs exist (`get_sales_quantity_summary`, `get_sales_quantity_report`, `get_today_sales_summary`, `resolve_quantity_to_base`) and `order_items` has `product_id`, `uom_code`, `conversion_to_base`, `unit`. This plan wires the frontend to use them consistently.

## Goal

Stop the scattered `if (unit === 'grams') qty/1000` string-matching that silently mis-aggregates Volume (ML/L) and Piece products. Replace with one shared utility that trusts the per-line `conversion_to_base` snapshot, and add a true multi-unit report.

## Scope

### 1. New shared utility — `src/lib/uomQuantity.ts`
- `resolveToBase(qty, unitText, conversionSnap)` — snapshot-first, text fallback for legacy rows.
- `formatBaseQty(baseQty, category, baseCode)` — returns `{ primary, secondary }` (e.g. `12,500 g` + `12.5 KG`).
- `aggregateToBase(items[])` — sum helper.

### 2. Replace legacy conversion in existing files
For each, (a) add `uom_code, conversion_to_base, product_id` to the `order_items` select, (b) swap manual gram-math for `resolveToBase`, (c) label the unit dynamically from `uom_code`.

- `src/pages/TodaySummary.tsx` — remove `convertToKg`; show `"12,500 g · 12.5 KG"` style.
- `src/components/analytics/RevenueBySKUSection.tsx` — both code paths (direct query + `get_product_revenue_performance` RPC); label column by category (KG / L / Pcs / raw).
- `src/hooks/useTeamTargetProgress.ts` — both reducers (~L219, ~L267).
- `src/hooks/useUserTargetProgress.ts` — extend select, swap reducer.
- `src/components/ReportGenerator.tsx` — rename `orderPerKG → orderQty`, add `orderQtyUnit`, update column header + every caller (`SupervisorReport`, `ReportSummaryDialog`, `useReportVoiceChat`, `Analytics.tsx`).

### 3. Consistency cleanup (same legacy pattern, not in original list)
These also use `=== 'grams'` matching and will disagree with the fixed screens otherwise:
- `src/components/VanStockManagement.tsx`
- `src/components/analytics/useBusinessMetrics.ts`
- `src/components/operations/OperationsSummaryBoxes.tsx`
- `src/pages/Analytics.tsx`

### 4. Card-level unit label (corrected CHANGE 10)
`BusinessSummaryCard` and `PerformanceSnapshot` are dumb presentational components — they receive numbers as props. The actual fix lives **upstream** in whichever hook feeds them (typically `usePerformanceSummary` / `useBusinessMetrics`): compute the base qty with `resolveToBase`, derive a unit label (`KG` if all Weight, `L` if all Volume, else `Units`), and pass both `value` and `unitLabel` down. The card just renders what it's given.

### 5. New UOM Quantity Report
- `src/components/reports/UomQuantityReport.tsx` — date filters, summary table from `get_sales_quantity_summary`, expandable row per product calling `get_sales_quantity_report` for full unit-by-unit breakdown, CSV export, category color badges (Weight=amber, Volume=blue, Quantity=green). *Note: the JSX in the original prompt was malformed; I'll reconstruct it cleanly using shadcn `Table`, `Badge`, `Button`, `Input`, `Card`.*
- `src/pages/UomQuantityReportPage.tsx` — wraps it in `Layout` with `AdminPageHeader`.
- Route in `src/App.tsx`: `/uom-quantity-report`.
- Sidebar nav entry under Analytics/Reports with `Scale` icon (gated by the same can_read permission as other reports).

## Multi-unit reporting answer

- **Per-product, all-units breakdown** → the new `/uom-quantity-report` page. Click any row to see how that SKU sold across every UOM it was ever invoiced in (CASE / BOX / KG / GRAM / PIECE…).
- **Per-row category-aware display** → `RevenueBySKUSection` switches its quantity column label per row.
- **What it deliberately does not do**: a global "show everything in KG" toggle. Summing weight + volume + pieces into one number is meaningless, so the report keeps them in separate columns instead.

## Technical Details

**Conversion contract** — `order_items.conversion_to_base` is the authoritative per-line factor (snapshotted at order time by the UOM engine). `resolveToBase` uses it first; only legacy rows missing the snapshot fall through to text rules (gram=1, kg=1000, ml=1, l=1000, default=1).

**Type safety** — `ReportGenerator` rename is a breaking interface change; every consumer must be updated in the same commit or TS build fails.

**RPC calls** — Use `(supabase as any).rpc(...)` until `types.ts` regenerates (it auto-syncs from Supabase API).

**Out of scope** — Mobile rep app surfaces (`MyVisits`, `OrderItemsExpanded`, distributor portal inventory/packing) keep their existing free-text display per the comment in `src/utils/unitDisplayUtils.ts`. Can be migrated in a follow-up.

## Acceptance

1. TodaySummary, Analytics SKU section, target progress hooks, and business cards all show the same total for the same date range.
2. A Volume product (ML/L) no longer aggregates as if it were pieces.
3. `/uom-quantity-report` loads, lists products, expands to per-UOM rows, exports CSV.
4. `ReportGenerator` column reads "Qty Sold" with per-row unit (e.g. `500 g`, `12.5 KG`, `10 Pcs`).
5. No TS errors after the `orderPerKG → orderQty` rename.
