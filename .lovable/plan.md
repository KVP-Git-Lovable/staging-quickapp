## Findings

- The live database now has only one `order_items → orders` foreign key: `order_items_order_id_fkey`.
- The user-facing error is coming from invoice PDF generation: `VisitInvoicePDFGenerator.tsx → fetchAndGenerateInvoice()`.
- The failing network request still uses the ambiguous embed:
  ```text
  orders?select=*,order_items(*)&id=eq...
  ```
- Because the error details still mention the dropped `order_items_order_fk`, PostgREST is likely serving a stale relationship cache in at least one request path.
- There are multiple remaining code locations that embed `order_items(...)` from `orders` without naming the FK, so the same issue can reappear in invoice, visits, analytics, target progress, gamification, and Edge Functions.

## Plan

1. **Harden frontend queries**
   - Replace ambiguous `order_items(...)` embeds under `orders` with explicit FK syntax:
     ```text
     order_items!order_items_order_id_fkey(...)
     ```
   - Prioritize the invoice PDF path first, especially `src/utils/invoiceGenerator.ts`.
   - Update other app-side query sites found in the audit so the UI no longer depends on PostgREST guessing the relationship.

2. **Harden Edge Function queries**
   - Update the same embed pattern in Edge Functions that query `orders` with `order_items(...)`.
   - This prevents scheduled content, recommendations, visit AI insights, and competency tips from hitting the same PostgREST ambiguity.

3. **Refresh PostgREST schema cache again**
   - Run a small schema-cache refresh migration/query:
     ```sql
     NOTIFY pgrst, 'reload schema';
     ```
   - This addresses the stale cache still reporting the already-dropped `order_items_order_fk`.

4. **Validate**
   - Re-check live FK list to confirm only `order_items_order_id_fkey` remains.
   - Re-run/search the changed query patterns to ensure no ambiguous `orders → order_items` embeds remain in active app/Edge Function code.

## Expected result

- Invoice PDF generation stops failing with `PGRST201`.
- Other screens using order item embeds become safe even if PostgREST cache briefly contains old relationship metadata.
- Database relationship remains clean with a single FK from `order_items.order_id` to `orders.id`.