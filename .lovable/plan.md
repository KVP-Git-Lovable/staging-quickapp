
# Offline Order Sync V2 — Hardening Plan

Goal: zero missing/duplicate/partial orders, race-free retailer accounting, decimal quantities, dead-letter for poison payloads, full audit trail. Backward compatible with existing `sync_order_with_items` until cutover.

## 1. Database migrations

### 1a. Schema fixes on existing tables
- `order_items.product_id`: currently `text NOT NULL`. Migrate to `uuid NOT NULL` (backfill from existing text where valid UUID; rows with composite/synthetic IDs get resolved via `product_variants.product_id` lookup using `variant_id`; rows that cannot resolve are quarantined into `order_items_quarantine` for manual review — not silently dropped).
- `order_items.quantity`: `integer` → `numeric(12,3)` with `CHECK (quantity > 0)`.
- `order_items.variant_id`: keep nullable but add FK to `product_variants(id)` (validated).
- `orders.idempotency_key`: add `UNIQUE` partial index `WHERE idempotency_key IS NOT NULL`.
- `orders.total_amount`: add `CHECK (total_amount >= 0)`.
- FKs: `order_items.product_id → products(id)`, `order_items.order_id → orders(id) ON DELETE CASCADE`.

### 1b. New audit tables
- `sync_audit_log(id, order_id, idempotency_key, user_id, device_id, payload jsonb, retry_count, status, error, reconciliation jsonb, created_at)`
- `failed_sync_log(id, idempotency_key UNIQUE, payload jsonb, error, retry_count, device_id, user_id, first_failed_at, last_failed_at, resolved_at, resolved_by)` — the dead-letter queue.
- `retailer_pending_audit(id, retailer_id, order_id, delta numeric, before_amount, after_amount, reason, actor_user_id, created_at)` — every pending mutation logged.

RLS: insert via SECURITY DEFINER RPC only; select restricted to admins + record owner.

### 1c. New RPC `sync_order_with_items_v2(p_payload jsonb)`
Single `SECURITY DEFINER` function, one transaction. Steps in order:

1. **Parse + shape validation** — required: `order.id`, `order.idempotency_key`, `order.retailer_id`, `order.user_id`, `order.total_amount`, non-empty `items[]`. Each item: `product_id` (valid uuid), `quantity > 0`, `rate >= 0`, `total >= 0`. Reject (return `{status:'validation_error', errors:[…]}`) — caller routes to DLQ, never silently NULLs.
2. **Idempotency check** — `SELECT id FROM orders WHERE idempotency_key = $key FOR UPDATE`. If found → return `{status:'duplicate', order_id}` (success, no-op).
3. **Entity existence** — verify `retailer_id`, `user_id`, every `product_id`, and every non-null `variant_id` exist. Missing → validation error.
4. **Totals reconciliation** — `sum(items.total)` must equal `order.total_amount` within ±0.01. Mismatch → validation error.
5. **Retailer lock** — `PERFORM 1 FROM retailers WHERE id = $retailer_id FOR UPDATE` (serializes per-retailer accounting; concurrent orders for different retailers stay parallel).
6. **Insert `orders`** with `idempotency_key`. `unique_violation` on key → return duplicate.
7. **Bulk insert `order_items`** from `jsonb_to_recordset` with explicit `product_id` and `variant_id`.
8. **Partial-insert guard** — `GET DIAGNOSTICS inserted = ROW_COUNT`; if `inserted <> jsonb_array_length(p_payload->'items')` → `RAISE EXCEPTION` (full rollback).
9. **Retailer pending delta** — compute `delta` based on credit flag; `UPDATE retailers SET pending_amount = COALESCE(pending_amount,0) + delta … RETURNING pending_amount` (atomic, no read-modify-write). Insert `retailer_pending_audit` row.
10. **Visit update** — if `visit_id` provided and valid uuid, mark `productive` + accumulate `order_value`; if invalid, validation error (no silent strip).
11. **Van stock decrement** — if `sales_channel = 'van_sales'`, atomically `UPDATE van_stock_items SET quantity = quantity - $q` per item; abort tx on negative result.
12. **Reconciliation block** — re-select `order`, `count(order_items)`, retailer pending after; assemble JSON; insert `sync_audit_log` row with `status='ok'`.
13. Return `{status:'ok', order_id, items_inserted, retailer_pending_after, reconciliation:{…}}`.

Any RAISE inside steps 5–11 rolls back entire transaction. Function never leaves a header without items, never leaves retailer pending out of sync.

### 1d. Keep `sync_order_with_items` as thin shim
Old function calls v2 internally so any unmigrated caller keeps working during rollout.

## 2. Frontend changes

### 2a. Payload standardization (`offlineOrderUtils.ts`)
- Build a single canonical payload matching the v2 schema (`{order, items}`); stop stripping `visit_id` to undefined — if invalid, refuse to queue and surface error.
- `idempotency_key = order.id` always set at creation time, before any retry.
- Remove all client-side retailer-pending math and visit updates from the post-RPC path — server is the only writer.
- Van-sales: still call `calculateLocalVanStockUpdate` optimistically before submit (UI only); server is source of truth.

### 2b. Sync engine (`useOfflineSync.ts`)
- Switch RPC call to `sync_order_with_items_v2`.
- Branch on returned `status`:
  - `ok` / `duplicate` → remove from queue, mark synced.
  - `validation_error` → move to **DLQ store** (new IDB store `SYNC_FAILED`) + insert `failed_sync_log` row via separate RPC; show toast "Order needs review".
  - network/5xx → keep in queue, increment `retry_count`.
- Hard cap: `retry_count >= 5` → DLQ. No infinite retries.
- Per-retailer serialization in client batch: group queue by `retailer_id`, process each retailer's orders sequentially (defense-in-depth on top of DB row lock).

### 2c. DLQ UI
- New screen `src/pages/admin/SyncFailedOrders.tsx` listing rows from `failed_sync_log` with payload viewer, error message, "Retry" (re-enqueues via v2) and "Discard" (sets `resolved_at`).
- Toast/badge on Rep app when local `SYNC_FAILED` store is non-empty.

### 2d. Decimal quantity plumbing
- Stop casting `qty` to int anywhere in `Cart.tsx`, `CounterSales.tsx`, `offlineOrderUtils.ts`, `vanStockSync.ts`. Use `Number(qty)` with up to 3 decimal places. Update display formatters (kg/g) accordingly.

## 3. Reconciliation & monitoring
- Daily `pg_cron` job: detects orders with mismatched `sum(items.total) vs total_amount`, missing `retailer_pending_audit` row, or header-without-items (should be zero post-migration) — writes findings to `sync_audit_log` with `status='drift'`.
- Admin dashboard widget reading `sync_audit_log` aggregates (last 24h: ok / duplicate / validation_error / drift counts).

## 4. Rollout sequence (one migration per step to keep reviewable)
1. Audit tables + DLQ table + `idempotency_key` unique index.
2. `order_items` backfill + type change to `uuid` + `numeric(12,3)` quantity + FKs (with quarantine table for unresolvable rows).
3. Create `sync_order_with_items_v2` + rewrite old function as shim.
4. Frontend: payload standardization + switch to v2 + DLQ store + retailer serialization.
5. DLQ admin page + daily reconciliation cron.

## Out of scope (call out explicitly)
- Changes to invoice numbering, packing lists, loyalty points awarder — they already consume `orders`/`order_items` and will benefit automatically once `product_id` is reliable.
- Multi-tenant distributor accounting (separate ledger work).

## Risks / open questions for confirmation before build
1. **`order_items` historical rows with composite `product_id`** — confirm policy: quarantine vs best-effort resolve via variant. Recommend quarantine + manual report.
2. **Existing duplicate `idempotency_key` values** — must dedupe historic data before adding `UNIQUE`. Migration will produce a pre-check report; abort if duplicates found.
3. **Van-stock decrement inside RPC** — currently done in `vanStockSync.ts` after success; moving into transaction means RPC needs `van_stock_items` write grants. Confirm OK.
4. **Visit update inside RPC** — same; will replace client-side `markVisitProductive` paths for order-driven productivity.

Awaiting approval to switch to build mode and execute migrations + code changes in the order above.
