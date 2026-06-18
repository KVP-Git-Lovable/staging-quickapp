## Goal

In My Visit → Today's Order, add a **View Invoice** action next to the existing **Invoice (download)** button, mirroring the Operations page so the user can preview the invoice in a dialog without downloading. Keep both options available, single order or multi-order, with no errors.

## Reference (already working in Operations)
`src/pages/Operations.tsx:1997-2006` uses the shared pair:
- `<InvoicePreviewDialog orderId invoiceNumber triggerLabel="View Invoice" iconOnly />` — opens a modal that streams the PDF
- `<DownloadInvoiceButton orderId invoiceNumber />` — same fetch path, downloads

Both pull from `fetchAndGenerateInvoice(orderId)` (the same util `VisitInvoicePDFGenerator` already uses), so data parity is guaranteed.

## Changes

**1. `src/components/VisitInvoicePDFGenerator.tsx`**
- Keep the existing download/WhatsApp/Email/SMS buttons unchanged.
- Add a new "View" button (Eye icon) next to "Invoice" that:
  - Single order → opens `<InvoicePreviewDialog orderId=… invoiceNumber=… />` directly.
  - Multiple orders → reuse `InvoiceSelectionModal` with a new `actionType: 'view'`, then open the preview for the chosen order.
- Add local state `previewOrder: { id, invoice_number } | null` and render `<InvoicePreviewDialog>` conditionally controlled by that state (the dialog already supports controlled `open` via its props; if not, wrap with a thin controlled variant).

**2. `src/components/InvoiceSelectionModal.tsx`** (only if needed)
- Extend its `actionType` union to include `'view'` so the modal title/CTA reads "Select an order to view".

**3. No DB / backend changes.** Both buttons hit the same `fetchAndGenerateInvoice` path Operations uses, which already resolves order → invoice → items from Supabase correctly. No `.single()` changes needed.

## Out of scope
- No layout redesign of the Today's Order card beyond adding the View button next to Invoice.
- Cancel Order, Feedback, AI tabs untouched.

## Verification
- Open a visit with 1 order → click View → PDF previews inline; Invoice still downloads.
- Open a visit with 2+ orders → View opens selection modal then preview; Invoice opens selection modal then downloads.
- Offline: View shows the standard "needs internet" toast (preview requires network); Download keeps its existing offline-queue behavior unchanged.
