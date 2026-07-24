# Report Subscription — PDF pipeline rebuild

Scope is strictly the PDF path inside the report subscription wizard's Schedule step and the `generate-report` edge function. Excel, `summary_only`, notifications, and the shared `notifications` trigger are not touched.

## Phase 1 — Rebuild the PDF renderer (verify before Phase 3)

**Files**
- `supabase/functions/generate-report/index.ts` — refactor so it builds one neutral report model:
  `{ title, subtitle, period, columns[], rows[], totals, meta }`.
  Excel path and PDF path both consume this model independently. Current `renderPdf` (pdf-lib) is removed.
- `supabase/functions/generate-report/pdf-renderer.ts` — NEW. Uses `npm:jspdf` + `npm:jspdf-autotable`.
- `supabase/functions/generate-report/branding.ts` — NEW small helper. Fetches once per run from `public.companies` (`header_logo_url` → fallback `logo_url`, `header_name`, `name`, `address`, `gstin`, `contact_phone`, `currency`, `date_format`). When the report scope is a single distributor, use `distributors.logo_url` / `distributors.name` instead if branding = Distributor. Logo is fetched, base64-encoded, embedded via `doc.addImage()`. All currency/date formatting flows through the fetched `currency` and `date_format` — no hardcoded ₹ or date strings.

**Renderer behaviour**
- Default template = "Standard" header from the reference: logo left · `header_name` + company name + report title · reporting period right · brand-coloured divider · meta block (generated timestamp, recipient, scope, filters) · autotable (filled header row, right-aligned numeric columns, zebra rows, tinted totals row) · footer (page X of Y · generated-by · optional footer note).
- Orientation: portrait when columns ≤ 6, landscape otherwise (this is the Auto rule; explicit overrides come in Phase 3).
- autotable handles repeated header rows across page breaks, column widths, per-column alignment, styled totals footer.

**Verify Phase 1 before moving on** by running `generate-report` end-to-end for an existing PDF subscription and downloading the output.

## Phase 2 — Preview PDF button

**Files**
- `supabase/functions/generate-report/index.ts` — add a `mode: 'preview'` branch. It accepts the in-progress wizard payload (dataset, filters, period basis, `pdf_template`, scope), runs the same model + renderer, and returns the PDF bytes inline (base64 or signed short-lived URL) without writing to `report_subscriptions` or `report_delivery_log`.
- `src/components/admin/reports/ReportSubscriptionsTab.tsx` — inside the Schedule step (around the Format select at ~line 831), add a **Preview PDF** button visible only when `format === 'pdf'`. On click it invokes the preview mode, opens the returned PDF in a new tab. No DB write.

## Phase 3 — Template configuration (`pdf_template`)

**Migration**
```sql
ALTER TABLE public.report_subscriptions
  ADD COLUMN IF NOT EXISTS pdf_template jsonb NOT NULL DEFAULT '{}'::jsonb;
```
Empty `{}` means "use defaults", so existing rows need no backfill. Renderer merge order: structural defaults ← `companies`/`distributors` branding ← per-subscription `pdf_template`.

**Wizard state** (`ReportSubscriptionsTab.tsx`)
- Add `pdfTemplate` state seeded from `editing?.sub.pdf_template ?? {}`.
- Include it in both the create insert (~line 712) and update path (~line 735).
- On Format change to non-PDF, keep the object in state but stop rendering the panel.

**Schedule step — inline panel** (rendered directly beneath the Format select, not a modal, not a new route). Collapses when Format is Excel or Summary. Matches `pdf_template_panel.html` structure and styling (not exact pixel metrics; sample values in the reference are illustrative only).

Header section:
- Header style — Standard · Centered · Band · Compact
- Title override (blank = report name)
- Subtitle (optional)
- Show reporting period (default on)
- Show address & GSTIN line (default off; source depends on Branding selection)

Body section:
- Branding — Company · Distributor · None
- Orientation — Auto · Portrait · Landscape
- Include — meta block · totals row · page numbers (all default on)
- Footer note (optional; replaces generated-by line)

**Review step** — when format is PDF, list the pdf_template summary (header style, orientation, branding, footer note preview).

**Renderer wiring** — `pdf-renderer.ts` reads `pdf_template` and applies each option (header variant switch, orientation override, meta/totals/page-number toggles, footer note substitution, GSTIN line, title/subtitle overrides).

## Phase 4 — Wide-column handling in `pdf-renderer.ts`

Applied in this order until the table fits:
1. Auto-orient to landscape (unless user forced Portrait).
2. Shrink font size down to a floor of ~6pt.
3. Split columns across pages: repeat the leftmost row-label column on every continuation page, and add a subtitle band like `columns 8–15, continued`.

Row-label detection: first column of the model unless `meta.rowLabelColumns` says otherwise.

## Technical notes

- Deps: `npm:jspdf`, `npm:jspdf-autotable` (both work in Deno edge runtime). `pdf-lib` is dropped from this path. No `@react-pdf/renderer`.
- No changes to the notifications trigger, push flow, `report_delivery_log` idempotency, or Excel generation.
- Preview endpoint must not write to `report_subscriptions`, `report_delivery_log`, or Storage — bytes go straight back to the caller.
- Branding logo is fetched exactly once per generate run and reused across per-recipient files.

## Files touched (summary)

- NEW `supabase/functions/generate-report/pdf-renderer.ts`
- NEW `supabase/functions/generate-report/branding.ts`
- MOD `supabase/functions/generate-report/index.ts` (neutral model + preview mode + wire new renderer, remove pdf-lib PDF path)
- MOD `src/components/admin/reports/ReportSubscriptionsTab.tsx` (Schedule step: inline PDF panel + Preview button + wizard state; Review step: PDF template summary; create/update: persist `pdf_template`)
- Migration: add `pdf_template jsonb` on `report_subscriptions`
