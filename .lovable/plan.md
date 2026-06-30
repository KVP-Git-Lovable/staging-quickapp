## Root cause

The `table()` helper in `src/lib/tableRouter.ts` works correctly, but **almost no code in the app uses it**. A grep shows only two files import `tableRouter`: `src/qa/runner.ts` and `src/App.tsx`. Every other screen, hook, and service calls `supabase.from('retailers')`, `supabase.from('orders')`, etc. with the **hard-coded production table name**.

So in the QA APK:
- `VITE_TABLE_PREFIX=qa_` is set correctly.
- The QA banner reads `isQAMode()` and shows "writes to qa_* tables only".
- But every actual `supabase.from(...)` call ignores the prefix and hits the real `public.retailers`, `public.orders`, etc.

That's why "June stored" landed in `retailers` and why the app shows prod data — the QA build is talking to the same prod tables as the prod build.

Refactoring hundreds of `supabase.from('x')` call sites to use `table('x')` is impractical and error-prone. The fix is to route at the client level.

## Fix (single source of truth: wrap the Supabase client)

1. **Define the QA mirror set** in `src/lib/tableRouter.ts`:
   ```ts
   export const QA_MIRRORED_TABLES = new Set([
     'retailers', 'visits', 'orders', 'order_items',
     'attendance', 'gps_tracking', 'retailer_visit_logs',
     'products', 'inst_leads',
     // plus the QA-only logging tables already prefixed: test_runs, test_logs, sync_audit_log
   ]);
   ```
   These match the `qa_*` tables that already exist in the database.

2. **Wrap the Supabase client** in `src/integrations/supabase/client.ts` with a `Proxy` so that, **only when `VITE_APP_MODE === 'qa'`**, calls to `supabase.from(name)` are transparently rewritten:
   - If `name ∈ QA_MIRRORED_TABLES` → forward to `qa_<name>`.
   - Otherwise → forward unchanged (reference data like `profiles`, `beats`, `products` lookups, etc., have no QA mirror and must keep reading from prod, which matches what the QA system was designed for).
   - In **production builds the Proxy is a no-op** (returns the real client untouched), so prod behavior is byte-identical.
   - The auto-generated `client.ts` header comment will be preserved by exporting the wrapped client from the same file; no edits to `types.ts`.

3. **Block writes to non-mirrored tables in QA** to stop accidental prod-data pollution:
   - In QA mode only, intercept `insert / update / upsert / delete` on tables not in `QA_MIRRORED_TABLES` and:
     - log a `console.error` with the table name and stack,
     - return a rejected PostgrestResponse-shaped error `"QA build: writes to public.<table> are blocked"`.
   - Reads on non-mirrored tables stay allowed (so the app can still render reference data).

4. **RPC handling in QA**:
   - Many RPCs (`sync_order_with_items_v2`, `finalize_order_edit`, `apply_retailer_payment_fifo`, etc.) write to `public.orders`/`public.order_items` directly and have no QA equivalents.
   - Add an allow-list `QA_SAFE_RPCS` of RPCs known to be read-only or already QA-aware. In QA mode, calls to RPCs not on the list are blocked the same way as writes, with a clear error.
   - This is intentionally conservative: it surfaces every place that needs a `qa_` RPC variant, instead of silently corrupting prod.

5. **Drop the now-redundant `table()` indirection at call sites** that already adopted it (only `src/qa/runner.ts`); after the Proxy wrapper exists, `runner.ts` can call `supabase.from('retailers')` directly and still hit `qa_retailers`. Keep `table()` exported for any code that needs the raw string (e.g., building a `realtime` channel filter), but it's no longer required for `.from(...)`.

6. **Banner copy update** in `QAModeBanner` to reflect the new contract:
   > "QA MODE — mirrored tables route to `qa_*`; writes to non-mirrored prod tables and unsafe RPCs are blocked."

7. **Verification steps after build**:
   - Rebuild `npm run build:qa && npx cap sync android` and install the QA flavor.
   - Create a retailer → confirm row appears in `qa_retailers`, not `retailers`.
   - Open Retailers list → confirm it reads from `qa_retailers` (empty except for the new one).
   - Try an action that uses a non-mirrored write (e.g., create a leave application) → confirm the QA build surfaces the "writes blocked" error instead of writing to prod.
   - Run `npm run build:prod` and smoke-test a normal flow to confirm the Proxy is a no-op.

## What this does NOT change

- No production database schema changes.
- No production code paths (Proxy is gated on `VITE_APP_MODE === 'qa'`).
- No edits to `src/integrations/supabase/types.ts`.
- Existing `qa_*` migrations and the Run Tests module continue to work; they just stop being the only path that respects the prefix.

## Follow-up (not in this fix)

Some screens will hit "RPC blocked in QA" once #4 lands — that's the correct signal that we still need `qa_*` variants for those RPCs (orders, payments, edits). Those can be added incrementally without touching the client wrapper again.