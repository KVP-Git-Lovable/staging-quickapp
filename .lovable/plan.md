
# Secondary Packing List: Dispatch → Delivery

Implements the back-half of the Secondary (B2R) packing-list workflow. **Primary (B2D) flow is left completely untouched.**

## Scope split

```
Pick / Pack  ──►  Dispatch (NEW for secondary)  ──►  Delivery (NEW for secondary)  ──►  Reconcile
   (shared)        Challan + E-way bill                 Per-retailer Tax Invoice         Close challan
                                                        at POD                            + Van-return GRN
```

## Part 1 — Database migration

Three new tables (snapshot-style; reprints stay correct even if masters change):

1. **`delivery_challans`** — header per van-load. Challan number `DC-YYYYMMDD-NNNN`, links `packing_list_id`, `packing_list_assignment_id`, `delivery_run_id`, `eway_bill_id`. Snapshots consignor (name/GSTIN/address) and transport (vehicle/transporter/driver). Status: `issued / dispatched / closed / cancelled`.
2. **`delivery_challan_items`** — one row per product per retailer order. Snapshots `product_name`, `hsn_code`, `uom`, quantity, rate, value.
3. **`eway_bills`** — generic e-way record; `document_type` = `delivery_challan` (secondary) or `tax_invoice` (future primary). Stores 12-digit EWB number from GST portal, validity, party/transport snapshot. Status: `active / cancelled / expired`.

**Config:** `eway_threshold_value numeric default 50000` on the existing company/settings table — overridable, no hardcoding.

**RLS:** mirror `packing_lists` policies — distributor sees own rows via the existing `get_distributor_id_for_auth_user()` helper; staff sees all. GRANTs to `authenticated` + `service_role`.

**RPCs (atomic + idempotent):**
- `generate_delivery_challan(p_packing_list_id)` — returns existing challan if non-cancelled one exists; otherwise snapshots consignor/transport, inserts items from packed lines (HSN + rate from `products`), rolls totals, attaches packing list to its existing `delivery_runs` row via `delivery_run_packing_lists`, sets `delivery_challans.delivery_run_id`.
- `deliver_and_invoice_retailer_order(p_order_id, p_delivered_items jsonb, p_pod_url text, p_payment jsonb)` — guard against re-invoicing; inserts `distributor_secondary_invoices` + items with GST split from `products.gst_percentage` (ledger auto-posts via existing trigger `trg_auto_ledger_secondary_invoice`); updates order POD/delivery/payment fields; records undelivered units into `van_return_grn` / `van_return_grn_items`.

## Part 2 — Dispatch UI (secondary only)

Rewrite `src/components/packing/stages/InvoiceDispatchStage.tsx` to match the attached mock:

- Header tiles: Retailers / Total Qty / Load Value / Agent · Van (from `packing_list_assignments`).
- **Delivery Challan card** (Rule 55) — "Generate Delivery Challan" button. After generation, shows challan number, date, downloadable PDF.
- **E-way Bill card** (Value-based) — threshold-gated:
  - Under threshold → "Not required".
  - At/over threshold → required banner with the load value, then a dialog to enter the portal-issued EWB number + validity. Disabled until challan exists.
- Footer "Dispatch on Challan →" — disabled until challan (and EWB if required) are in place. On click, sets PL status `dispatched`, run starts.
- **Remove** the legacy `generateInvoiceFromPackingList` write for secondary. Primary stays as-is.

## Part 3 — Delivery UI (secondary only)

Extend `DeliveryRunStage.tsx` per-stop:
- Editable delivered qty per line (defaults to ordered, can go down).
- POD capture (photo / signature → uploads to existing storage, sets `delivery_proof_url`).
- Payment collected (amount + mode).
- "Confirm Delivery & Generate Invoice" calls `deliver_and_invoice_retailer_order`. UI shows the new invoice number; offers print.
- Returned/undelivered qty flagged per line — auto-pushed into van-return GRN by the RPC.

## Part 4 — Reconcile & Close

When all stops are completed:
- Show **Loaded = Delivered + Returned** reconciliation panel.
- Post the consolidated van-return GRN (reuse existing path).
- Set `delivery_challans.status = 'closed'` and complete the delivery run.
- No retailer GRN created.

## Part 5 — Print templates

Two new printable views (matching `challan-eway-documents.html`):
- `DeliveryChallanPrint.tsx` — Rule 55 challan, line-sales consignee block, HSN + value table, EWB number stamped.
- `EwayBillPrint.tsx` — EWB-01 layout.

Reuse the existing PDF pipeline; store URL on the challan row.

## Technical details

- **Schema source of truth:** HSN and tax rate always pulled from `products.hsn_code` / `products.gst_percentage` at challan/invoice generation time and snapshotted onto the line rows.
- **Idempotency:** challan RPC short-circuits if a non-cancelled challan exists for the PL; invoice RPC short-circuits if a finalized `distributor_secondary_invoices` exists for the order.
- **Ledger:** never written manually — relies on existing `auto_ledger_on_secondary_invoice` trigger.
- **Returns:** reuse `van_return_grn` / `van_return_grn_items`; no new return tables.
- **Run linkage:** reuse the run already created at dispatch — link, don't duplicate, via `delivery_run_packing_lists`.
- **Numbering:** challan numbers via a Postgres function mirroring the existing PL/invoice number generators.
- **EWB API:** modeled as fields now (clean seam) — manual entry from GST portal in this iteration; auto-generation via GSP is a follow-up.

## Files touched

- `supabase/migrations/<new>.sql` — three tables, RLS, GRANTs, two RPCs, challan-number helper, config column.
- `src/components/packing/stages/InvoiceDispatchStage.tsx` — rebuilt for secondary Dispatch stage.
- `src/components/packing/stages/DeliveryRunStage.tsx` — per-stop delivery+invoice flow.
- `src/components/packing/stages/SecondaryReconcileStage.tsx` — new reconciliation panel.
- `src/components/packing/prints/DeliveryChallanPrint.tsx` — new.
- `src/components/packing/prints/EwayBillPrint.tsx` — new.
- `src/components/packing/dialogs/EwayBillEntryDialog.tsx` — new.
- `src/pages/PackingListDetail.tsx` + `src/pages/distributor-portal/PackingListDetail.tsx` — route `dispatched`/`delivered`/`completed` for secondary through the new stages and the reconcile panel.

## Acceptance

- One challan per van-load (idempotent), correct items/HSN/qty/value; old generic-invoice write no longer fires for secondary.
- Dispatch attaches PL to its existing run, links challan to run, run stops = PL's retailer orders.
- Threshold-gated EWB; portal number prints on challan.
- Per-stop confirm → one `distributor_secondary_invoices` row, ledger auto-posts, order POD/payment updated, returns land in `van_return_grn`.
- Re-confirming a stop doesn't double-invoice.
- Reconciliation closes challan; no retailer GRN.
- Primary flow unchanged.
