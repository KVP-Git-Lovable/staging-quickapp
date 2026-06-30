## Goal
Add 3 new QA test categories (Offline Sync, Product Variants, Pricing) + an optional offline lifecycle flow to the existing Run Tests (QA) module — using the actual storage and offline primitives in this codebase, not the placeholders in the prompt.

## Pre-flight findings (must be reflected in the implementation)

1. **Storage is Capacitor Preferences, not IndexedDB.**
   `src/lib/offlineStorage.ts` is a `Preferences`-backed wrapper. `STORES.SYNC_QUEUE = 'syncQueue'` is the pending-actions queue; `STORES.ORDERS = 'orders'` holds queued orders. The `readFromIndexedDB(...)` helper in the prompt's template won't work here — the offline action will instead call `offlineStorage.getAll(STORES.SYNC_QUEUE)` / `getAll(STORES.ORDERS)`.

2. **An in-app offline toggle DOES exist.**
   `NetworkContext` exposes `setManualOfflineMode(boolean)` and `manualOfflineMode`. We do NOT need a UI `data-testid` — instead, in QA mode only, expose the setter on `window.__qaSetOffline` (set inside the existing `QAModeProvider`) so `offlineSyncActions` can flip offline/online programmatically without touching production UI.

3. **Sync-linkage field is `tempId`, not `local_ref_id`.**
   `useOfflineSync.ts` uses `tempId` on sync-queue items. The server `orders` table does NOT currently have a `local_ref_id`/`tempId` column. We will NOT add a column. Instead the "synced exactly once" check will:
   - Verify the syncQueue item with that `tempId` is gone from the queue, AND
   - Match the server row via `retailer_id` + an `order_date` window around the queued timestamp, asserting exactly one match.
   This is the most honest check available without a schema change (which Part 9 forbids).

4. **`qa_products` mirror EXISTS** (visible in the schema list), so pricing actions must use `table('products')`. There is **no `qa_product_variants` mirror** — variant action will read `product_variants` directly (Tier 2 read-through), and the file will document this with a comment.

5. **No "trigger sync" button testid exists.** Sync is triggered automatically by `useOfflineSync` when network restores. The action will restore network via `__qaSetOffline(false)` and wait, rather than tapping a non-existent button.

## Part 2B — data-testid additions (minimal)
Add `data-testid` to existing elements only — no behavior changes:
- Order entry screen (`src/pages/OrderEntry.tsx` or `TableOrderForm.tsx`): variant picker trigger → `product-variant-select`; quantity input → `order-quantity-input`; submit button → `submit-order-button`; per-line rate display → `order-item-rate-display`.
- Product catalog (`src/pages/CustomerCatalog.tsx` or product list): price element → `product-price-{productId}`.
- No offline-toggle testid (handled via `window.__qaSetOffline`).

## Part 4B — `src/qa/actions/offlineSyncActions.ts` (new)
Two actions, written against the **real** primitives:
- `offline.order-queued-locally` — calls `window.__qaSetOffline(true)`, drives the order screen, then asserts `offlineStorage.getAll(STORES.SYNC_QUEUE)` contains an item with matching `retailerId` and a `tempId`. Remembers `{ tempId, queuedAt }` in ctx.
- `offline.sync-completes-and-clears-queue` — calls `window.__qaSetOffline(false)`, waits ~3s for `useOfflineSync` to drain, then asserts:
  - no queue item with that `tempId` remains, AND
  - exactly one row in `table('orders')` matches `retailer_id` within a ±2-minute window of `queuedAt` (fails on 0 or >1 → duplicate-sync detection).

## Part 4C — `src/qa/actions/productVariantActions.ts` (new)
- `product.variant-selection-resolves-correct-price` — opens order screen, selects variant via `selectOption('product-variant-select', label)`, reads `order-item-rate-display`, compares to `product_variants.rate` queried directly (no `table()` wrapper — documented as Tier 2 read-through).
- `product.variant-quantity-totals-correctly` — fully implemented (not a stub): types qty into `order-quantity-input`, reads line total, asserts `rate * qty` within 0.01.

## Part 4D — `src/qa/actions/pricingCoverageActions.ts` (new)
- `pricing.all-active-products-have-a-rate` — queries `table('products')` filtering by the actual active column in this schema (will be verified against `products` columns before write; likely `is_active`), flags rows with null/0 rate.
- `pricing.spot-check-catalog-screen-matches-db` — navigates catalog, reads `product-price-{id}` for first N products, compares to DB rate.

## Part 4E — `src/qa/actions/registry.ts`
Add imports + spread the three new arrays into `allQAActions`. No existing entries touched.

## Part 4F — `src/qa/flows/registry.ts`
Append `flow.offline-order-lifecycle` chaining the two offline actions (`stopOnFailure: true`).

## QA provider tweak
In `src/qa/QAModeProvider` (or wherever the QA banner mounts), add a small effect when `isQAMode()` is true that pulls `setManualOfflineMode` from `useNetwork()` and assigns it to `window.__qaSetOffline`. Production builds never run this code (already gated). No new context, no UI.

## Files created
- `src/qa/actions/offlineSyncActions.ts`
- `src/qa/actions/productVariantActions.ts`
- `src/qa/actions/pricingCoverageActions.ts`

## Files modified (minimal)
- `src/qa/actions/registry.ts` — 3 imports + 3 spreads.
- `src/qa/flows/registry.ts` — 1 flow appended.
- `src/qa/QAModeProvider.tsx` — expose `__qaSetOffline` in QA only.
- Order entry + catalog screens — `data-testid` attributes only (no logic change).

## Explicitly NOT doing
- Not adding `local_ref_id` (or any column) to `orders`.
- Not creating `qa_product_variants`.
- Not building an in-app offline toggle UI (already exists via NetworkContext).
- Not using IndexedDB APIs — this project uses Capacitor Preferences.
- Not modifying any existing test action, hook, or screen logic beyond `data-testid`.

## Open question before I build
The prompt's example code is heavily IndexedDB- and `local_ref_id`-shaped, but this codebase uses Capacitor Preferences + `tempId` with no server-side linkage column. My plan adapts to the real primitives (queue lookup via `offlineStorage`, duplicate detection via retailer+timestamp window). Confirm this adaptation is acceptable — the alternative would be a schema migration to add `local_ref_id` to `orders` + `qa_orders` and have `useOfflineSync` populate it, which is out of scope per Part 9.