# Fix failing QA actions (targeted edits only)

Verified against `qa_test_logs` (staging): all 6 reported failures reproduce. No production code, no schema changes, no new flows.

## 1. `src/qa/actions/smokeActions.ts`

- `smoke.create-temp-retailer`: switch insert to route via `table('retailers')`, add required NOT NULL fields — `user_id` (from `supabase.auth.getUser()`), `entity_type: 'retailer'`, `address`, and a valid `beat_id` (query first existing `qa_beats` id, don't hardcode).
- `smoke.create-temp-beat-plan`: after picking/creating a beat, also read its `beat_name`; include `beat_name` (NOT NULL) and `beat_data: {}` in the `beat_plans` insert.

## 2. `src/qa/actions/retailerActions.ts` — duplicate check + UI stability

- Audit confirmed only one `retailer.create` exists; the `manualStepAction('retailer.delete', ...)` at the bottom is a different id and stays. No dedupe needed. (Note this in the change log; nothing to remove.)
- Increase settle wait after `tap('add-retailer-button')` from 400 ms → **700 ms** so Radix Sheet finishes its ~300 ms open animation before `waitForElement('retailer-name-input')` fires.
- Bump the `waitForElement` timeout inside `typeText('retailer-name-input')` path by adding an explicit `waitForElement('retailer-name-input', { timeoutMs: 12000 })` before typing.
- Reorder the fill sequence to match the requirement (name → beat → parent-type=Company → retail-type → category → get-location → 300 ms settle → save). GPS + parent=Company are the last state changes before Save so the button un-disables in time.
- Add a pre-save assertion loop: poll `save-retailer-button` for up to 3 s waiting for `disabled` to clear; if still disabled, dump the form's aria-invalid fields into `errorMessage` for future debugging (already better than "Element is disabled").

## 3. `src/qa/actions/orderActions.ts` — column name + missing NOT NULLs

- Product query: `.select('id, name, rate, base_unit_category, base_unit')` (drop `category`, `unit` which don't exist on `qa_products`).
- `qa_orders` insert: add `sales_channel: 'field'` and `qa_run_id` from context; keep existing `idempotency_key`, `status`, `order_date`, `retailer_name`, `visit_id`, `subtotal`, `total_amount`, `user_id`, `retailer_id`.
- `qa_order_items` insert: map `category: product.base_unit_category`, `unit: product.base_unit ?? 'PCS'`; keep `product_name`, `rate`, `quantity`, `total`, `order_id`, `product_id`; add `idempotency_key: crypto.randomUUID()`.

## 4. `src/qa/actions/visitActions.ts` + `src/qa/flows/registry.ts`

- `visitActions.ts` is already programmatic-only (no UI variant present) — confirmed. Only change: also read `qa_run_id` from ctx and include it on both the attendance and visit inserts so rows are attributable per test run. `check_in_location` is already stubbed JSONB; `planned_date` already set. No flow-registry change needed for visit (only one `visit.create` action id exists).

## 5. `src/qa/actions/offlineSyncActions.ts` — queue key + drain timeout

- Already imports `STORES` from `@/lib/offlineStorage` and uses `STORES.SYNC_QUEUE` for both read and enqueue paths — so the key can't drift. Real cause is the enqueue happens via `addToSyncQueue` which pushes into the in-memory + Preferences store, but the immediate `getAll` reads through the 60 s memory cache that was populated by the `queueBefore` snapshot at the top of the step. Fix: after `addToSyncQueue`, call `offlineStorage.clearCache?.()` if present, otherwise force a fresh read by calling `Preferences.get` directly for the `offline_syncQueue` key and parsing (fallback path), then compare against `idsBefore`.
- Add a one-time diagnostic `console.log('[QA] Preferences keys after enqueue:', (await Preferences.keys()).keys)` right after the enqueue so any future drift is visible.
- Increase the drain deadline in `offline.sync-completes-and-clears-queue` from 30 s → **45 s**.

## 6. `src/qa/actions/retailerActions.ts` — record beat assignment (Fix 7)

- Add a new lightweight action `retailer.assign-to-beat` in `retailerActions.ts` that inserts into `table('retailer_beat_assignments')` with `retailer_id`, `beat_id`, `beat_name` (all from `ctx.recall('retailer')`), `user_id` (from auth), `is_current: true`, `assigned_from: now()`.
- Update `flow.retailer-to-order` in `src/qa/flows/registry.ts` to insert this step between `retailer.create` and `visit.create`.
- Ensure `retailer.create` remembers `beat_name` on the ctx retailer object (fetch beat_name after picking the beat option, or re-read the retailer row after insert including `beat_id`/`beat_name`).

## Files touched

- `src/qa/actions/smokeActions.ts`
- `src/qa/actions/retailerActions.ts`
- `src/qa/actions/orderActions.ts`
- `src/qa/actions/visitActions.ts`
- `src/qa/actions/offlineSyncActions.ts`
- `src/qa/flows/registry.ts`

No changes to `runner.ts`, production screens/hooks, or any `qa_*` schema.

## Verification (post-build)

Run Smoke flow + `flow.retailer-to-order` + `flow.offline-order-lifecycle`, then query `qa_test_logs` filtered to the new `test_run_id` — expect all steps `passed`, and confirm rows land in `qa_retailers`, `qa_retailer_beat_assignments`, `qa_visits`, `qa_orders`, `qa_order_items` (with `idempotency_key` set), and that no production tables get new rows.
