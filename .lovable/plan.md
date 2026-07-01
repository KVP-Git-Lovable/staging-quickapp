## Problem

The "Retailer → Beat → Visit → Order" flow only fills name/phone/address on Add Retailer, then taps Save. The save fails because three more fields are mandatory but never auto-filled by the QA action:

1. **Assign to Beat** (`Select a beat`)
2. **Select Distributor** (when Parent Type = "Distributor", which is the default)
3. **GPS Location** (validation `errors.location = "GPS location is required"`)

Other flow steps (`visit.create`, `order.create`, `attendance.punch_in/out`) are wired as `manualStepAction`, so a flow run marks them as `failed — Manual step required`. Offline-sync steps poll for up to 60s for a tester to place an order through the UI — also a form of "waiting for user input".

## Fix — Scope

Make every action in every registered flow (`flow.smoke`, `flow.retailer-to-order`, `flow.offline-order-lifecycle`) run end-to-end without any human interaction. Where a prerequisite genuinely cannot be automated from inside the WebView (native camera face-match), stub it in QA mode rather than surface as manual.

## Changes

### 1. New UI automation primitive — `randomSelectOption`

`src/qa/automation/uiActions.ts`

Add `randomSelectOption(testId, opts?)` that:
- Taps the trigger (`data-testid`).
- Waits for the shadcn popover (`[role="listbox"]` / `[role="option"]`) to render.
- Filters out `aria-disabled="true"` and `data-disabled` options and picks a random one.
- Clicks it via the same synthetic-event path as `selectOption`.

Also add `stubGeolocation(lat, lng)` that patches `navigator.geolocation.getCurrentPosition` to synchronously invoke the success callback with the given coords, and returns a restore function. QA-build-only.

### 2. `AddRetailer.tsx` — add testids only (no logic change)

Add `data-testid` to the existing controls so QA can drive them:
- Beat `SelectTrigger` → `retailer-beat-select`
- Parent Type `SelectTrigger` → `retailer-parent-type-select`
- Distributor `SelectTrigger` → `retailer-distributor-select`
- "Get Location" icon button → `retailer-get-location-button`

### 3. `retailer.create` — auto-fill beat, parent, distributor, GPS

`src/qa/actions/retailerActions.ts`

After typing name/phone/address:
1. Call `stubGeolocation(12.9716, 77.5946)` (Bengaluru) and tap `retailer-get-location-button`; wait for the "Location Captured" toast.
2. `randomSelectOption('retailer-beat-select')` — pick any real beat from the master.
3. `selectOption('retailer-parent-type-select', 'Company')` — Company parent doesn't require a distributor, so the flow doesn't depend on beat↔distributor mappings being seeded.
   - Fallback: if `Company` isn't offered for this tenant, `randomSelectOption('retailer-distributor-select')` after the beat's mapped-distributor list finishes loading.
4. Small settle sleep, then tap `save-retailer-button` and keep the existing UI+DB cross-verify.

Remove the geolocation stub in a `finally` block.

### 4. Flow `flow.retailer-to-order` — replace skipped visit/order steps

`src/qa/actions/visitActions.ts` and `orderActions.ts` currently return `manualStepAction`. Convert them to real UI drivers gated by a QA-only prerequisite stubber:

- **`attendance.punch_in`** (new real impl): stub geolocation, mock the face-match hook via a QA-only `window.__qaBypassFaceMatch = true` flag consumed inside `useFaceMatching` (single `if (import.meta.env.VITE_APP_MODE === 'qa' && window.__qaBypassFaceMatch) return { verified: true }` early-return), tap "Start My Day", wait for `attendance-checked-in` state, verify `qa_attendance` row.
- **`visit.create`**: with attendance active, navigate to `/my-visits`, pick the retailer created by `retailer.create` (from `ctx.recall('retailer')`), tap Start Visit, verify a `qa_visits` row in status `in_progress`.
- **`order.create`**: from inside the visit, tap "Add Order", pick 1 product (`randomSelectOption` on the product picker), set qty=1, submit, verify a `qa_orders` + `qa_order_items` row.

If any of the three underlying screens don't yet have testids the action needs, the fix adds them (mechanical, no behavioural change) in the same commit.

### 5. Flow `flow.offline-order-lifecycle` — remove the 60s tester-wait

`src/qa/actions/offlineSyncActions.ts` currently polls for a tester to place an order manually. Replace the polling with a programmatic enqueue that goes through the same helper the app uses (`offlineStorage.add(STORES.SYNC_QUEUE, { action: 'CREATE_ORDER', data: {...} })`) with a fresh `tempId` and the retailer from `ctx.recall('retailer')`. The rest of the action (assert queue entry exists → toggle online → wait for drain → assert exactly-one server row) stays as-is.

### 6. Flow `flow.smoke` — already end-to-end, no change

Verified: all four smoke steps write/read `qa_*` directly and never touch the UI.

### 7. Standalone actions used outside flows

`productVariantActions` and `pricingCoverageActions` take `retailer_id` / `product_id` / `variant_label` as required inputs with no defaults. When run from a Flow that doesn't supply them, they'd throw. Add a default-resolver: if the input is missing, pick a random active row from `qa_retailers` / `qa_products` / `product_variants` at run-time. Keep the manual override path for targeted runs.

## Acceptance

- Running the "Retailer → Beat → Visit → Order" flow with no input creates a retailer (with a real beat, Company parent, stubbed GPS), starts attendance, opens a visit, places a 1-line order, and every step reports `passed` — no UI screen ever waits for a human.
- Running the "Offline order" flow toggles offline, enqueues an order programmatically, toggles online, drains, and asserts one matching server row — no 60s tester wait.
- Running the "Smoke" flow is unchanged (already automated).
- Individual actions from the Actions tab still accept manual input overrides.

## Technical notes

- Face-match bypass and geolocation stub are strictly gated by `import.meta.env.VITE_APP_MODE === 'qa'`; production bundles must not carry the bypass code path — enforce with the same `if (qa)` pattern already used by `window.__qaSetOffline` in `AppContent`.
- All new writes still go through `table()` so `qa_*` mirrors receive the data — no prod-table pollution.
- No RPCs, migrations, or backend changes are needed.