
# QA Run Tests — Real UI Automation

Replace the placeholder "Skipped: logic not yet extracted" behavior in the QA Run Tests module with an automation engine that drives the live app's own screens (clicks real buttons, fills real inputs, waits for real toasts) and cross-verifies every result against the corresponding `qa_*` table. No business logic, hook, or data-fetching code in any screen will change — only `data-testid` attributes will be added.

This work stays QA-build-only. Nothing here is importable or reachable from production builds.

## Scope clarification — what this catches and what it can't

The engine runs inside the same WebView as the rest of the app, so it tests the React/DOM layer (missing buttons, broken handlers, forms that fail to submit, broken navigation, bad DB writes). It cannot detect native-only defects (camera capture, GPS permission dialogs, native pickers, WebView-specific rendering bugs below the DOM). This limitation will be stated in the module's own comments. Any flow needing a true native capability is reported as `Manual step required: <capability>` rather than faked.

## New files

```text
src/qa/automation/
  uiActions.ts   -- waitForElement, tap, typeText, selectOption, waitForText, sleep
  navigate.ts    -- registerNavigator, goTo (wraps the app's existing react-router navigate)
```

`uiActions.ts` uses DOM polling on `[data-testid="..."]`, dispatches real pointer/mouse/click events, and uses the native `value` setter + `input`/`change` events so React's controlled inputs register the change. `selectOption` handles both native `<select>` and shadcn-style custom dropdowns (open then click option by text).

`navigate.ts` exposes `registerNavigator(navigate)` and `goTo(path)`. Registration happens once near the router root, gated by `isQAMode()`.

## Files modified — engine wiring

- `src/App.tsx` (or the component that already calls `useNavigate` at the root) — add a QA-gated `useEffect` that calls `registerNavigator(navigate)`. No other change.
- `src/qa/runner.ts` — after each `action.run()` in both `runSingleAction` and `runFlow`, always navigate back to `/qa/run-tests` (wrapped in try/finally so failed/thrown actions still reset). Remove the early-exit `skipped` branch since no action will be skipped anymore (kept only as a fallback for "manual step required" actions, see below).
- `src/qa/actions/_skipped.ts` — repurpose into a `manualStepAction(id, label, entity, capability)` helper that surfaces as `Manual step required: <capability>` in results.
- `src/qa/screens/RunTestsScreen.tsx` — remove "Skipped" UI; add a "Running: <action label>…" indicator while an action is in flight; render `Manual step required` rows distinctly from pass/fail.

## Files modified — `data-testid` only (no logic change)

For each interactive element listed below, the only edit is adding a `data-testid` attribute. The exact element names will be confirmed by reading each file during build; the list below is the target set.

Retailer create:
- `src/pages/MyRetailers.tsx` or the nav component — `nav-retailers` on the menu entry to retailers.
- `src/pages/AddRetailer.tsx` and/or the entry button on `MyRetailers.tsx` — `add-retailer-button`, `retailer-name-input`, `retailer-beat-select`, `retailer-phone-input`, `retailer-address-input`, `save-retailer-button`, `retailer-save-success` (on the toast/redirect anchor).

Retailer delete (only if a delete control exists in UI): row menu trigger, confirm-delete button, success anchor. If no UI delete path exists, the action is registered as `manualStepAction` instead of forced.

Visit create:
- `src/pages/MyVisits.tsx` / `MyBeats.tsx` — `nav-visits`, `start-visit-button-<retailer>` pattern (or a generic `start-visit-button` if the list provides one), `visit-create-success`.

Order create:
- The order entry screen reached from a visit (`src/pages/Cart.tsx` and the order entry form already used today) — `add-product-button`, `product-search-input`, product row selector, `qty-input`, `submit-order-button`, `order-submit-success`.

Attendance punch-in/out:
- `src/pages/Attendance.tsx` — `nav-attendance`, `punch-in-button`, `punch-out-button`, `attendance-success`. Attendance currently requires camera + GPS; see "Native capability gaps" below.

A complete list of touched file paths will be included in the final implementation summary, with explicit confirmation that each diff contains only attribute additions.

## Action rewrites

Each of these files is replaced so every action's `run()` performs the real UI flow, then cross-verifies via the `qa_*` table using the existing `table()` router. Result rule: `pass = (UI success indicator seen) AND (matching DB row found)`. A UI-vs-DB mismatch is itself a failure — that's exactly what this system exists to catch.

- `src/qa/actions/retailerActions.ts` — `retailer.create`, `retailer.delete` (or manual-step if no UI delete).
- `src/qa/actions/visitActions.ts` — `visit.create`.
- `src/qa/actions/orderActions.ts` — `order.create` (verifies both `qa_orders` and `qa_order_items`).
- `src/qa/actions/attendanceActions.ts` — `attendance.punch_in`, `attendance.punch_out`, subject to the native-capability gap below.

Each action follows: `goTo(...) → tap(nav) → tap(open form) → typeText/selectOption(fields) → tap(save) → waitForText(success) → supabase.from(table('qa_xxx')).select(...).maybeSingle()`.

## Native capability gaps

Attendance punch-in/out in this codebase requires camera face-match + GPS. Neither can be reliably triggered from inside the WebView purely via DOM events. Plan:

1. Inspect `src/pages/Attendance.tsx` during build to confirm whether a QA-mode bypass already exists or whether these are hard requirements.
2. If hard-required, register `attendance.punch_in` / `attendance.punch_out` as `manualStepAction(..., 'camera + GPS')` — they appear in the picker and surface as `Manual step required: camera + GPS` rather than running an unreliable fake. This will be explicitly called out in the final summary.

## Hard constraints (will not be violated)

- No screen's business logic, state, hooks, or data fetching is modified — only `data-testid` attributes added.
- All automation entry points (`registerNavigator`, action files, screen) remain gated by `isQAMode()` and are never imported from production code paths.
- `src/lib/tableRouter.ts` and `src/integrations/supabase/client.ts` are not touched.
- No Supabase URL/ID/credential is hardcoded anywhere.
- DB cross-verification is kept on every action; UI-only "success" is never sufficient to pass.

## Verification at the end

The implementation summary will tick every box in the prompt's Part 8 checklist, list the exact files where `data-testid` attributes were added (with a one-line confirmation that no other change was made in each), and call out any flow that ended up as `Manual step required` along with the reason.
