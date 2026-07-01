## Audit of every QA flow

### Flow 1 — `flow.smoke`
All four actions are pure DB calls (no UI). **No stalls.** Leave as-is.

### Flow 2 — `flow.retailer-to-order`  ← still broken
- `retailer.create` — now hands-free after last turn's fix (Retail Type + Category testids + random pick). Covers every required field validated in `AddRetailer.handleSave` (name, phone, address, retailType, category, beat, parentType, distributor-if-not-Company, GPS).
- `visit.create` — **still `manualStepAction` → always returns `pass: false`**, so the flow always stops here (`stopOnFailure: true`).
- `order.create` — **still `manualStepAction`**, never reached today; would also fail if it were.

### Flow 3 — `flow.offline-order-lifecycle`
Both steps are fully programmatic (queue insert + drain wait). Only prompt is `retailer_id`, which is auto-supplied via `fromContext: 'retailer.id'` when chained. **No stalls in flow-mode.** When run standalone the input is prompted — leave that alone (matches other standalone actions).

### Product Variants + Pricing Coverage actions
- `product.variant-selection-resolves-correct-price` and `product.variant-quantity-totals-correctly` auto-resolve `retailer_id / product_id / variant_label` from the DB when omitted (already fixed). No stalls.
- `pricing.*` are DB sweeps / catalog spot-checks. No stalls.

### Standalone attendance actions
`attendance.punch_in` and `attendance.punch_out` are `manualStepAction`. They aren't wired into any flow, but they always fail when picked. Out of scope for "flow stalls" but worth calling out — will leave unless requested.

---

## Fix plan

### 1. Replace `visit.create` with real automation
Rewrite `src/qa/actions/visitActions.ts` to be programmatic (mirrors the offline-sync action pattern — same project already accepts DB-level automation where native prerequisites block UI drive):

- Read `retailer_id` from context (`fromContext: 'retailer.id'`), fallback to prompt.
- Ensure an `attendance` row exists for today for the current user; if missing, insert one with `check_in_time = now()`, stubbed lat/lng (12.9716, 77.5946), `status = 'checked_in'`. This satisfies the "active attendance session" gate that `MyVisits` enforces without requiring camera/face-match.
- Insert a `visits` row (routed via `table('visits')` → `qa_visits`) with `retailer_id`, `user_id`, `check_in_time = now()`, GPS stub, `status = 'in_progress'`.
- `ctx.remember('visit', {...})` so the order step can consume it.
- Verify the row lands in `qa_visits`, return `pass: true`.

### 2. Replace `order.create` with real automation
Rewrite `src/qa/actions/orderActions.ts`:

- Read `retailer_id` from `retailer.id` and `visit_id` from `visit.id` via context.
- Pick one active product from `qa_products` (any with a non-null `rate`).
- Insert `qa_orders` (retailer_id, visit_id, user_id, total_amount, status='pending', order_date=today) plus one `qa_order_items` line (product_id, quantity=1, rate, product_id required per project convention).
- Verify the order + item persisted, `ctx.remember('order', {...})`, return pass.

Both steps use `table(...)` so writes route to `qa_*` mirrors — same pattern already used by smoke + offline-sync actions.

### 3. Guardrails on `retailer.create` for zero-data tenants
Currently if the QA tenant has 0 beats or 0 distributors, `randomSelectOption` throws and the flow dies. Add small pre-flight probes at the top of `retailer.create.run`: query `qa_beats` and (when Company parent isn't offered) `qa_distributors`. If either is empty, return `pass:false` with a clear "Seed at least one beat/distributor in QA before running this flow" message instead of stalling mid-form.

### 4. No changes needed
- Offline sync actions — already hands-free.
- Product variant / pricing actions — already auto-resolve inputs.
- Smoke — pure DB.

---

## Files touched

- `src/qa/actions/visitActions.ts` — rewrite from placeholder to real programmatic action.
- `src/qa/actions/orderActions.ts` — rewrite from placeholder to real programmatic action.
- `src/qa/actions/retailerActions.ts` — add empty-beat / empty-distributor pre-flight guard.

No production code, RLS, or schema changes. All writes go through `table()` so they hit `qa_*` mirrors only.

## Acceptance
- Running `flow.retailer-to-order` end-to-end completes without any manual click or field entry, and a matching `qa_retailers` + `qa_visits` + `qa_orders` + `qa_order_items` chain exists in the DB.
- Running `flow.smoke` and `flow.offline-order-lifecycle` continues to pass hands-free.
- No flow prompts the tester for input mid-run.
