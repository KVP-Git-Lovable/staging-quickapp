## Plan — Fix QA APK: visit creation, beats mirror, Run Tests screen

### 1) "Failed to create visit" in QA APK

**Root cause.** `CreateNewVisitModal` inserts into `beat_plans` (it plans a beat for a date, i.e. "creates a visit"). `beat_plans` is NOT in `QA_MIRRORED_TABLES`, so the QA Supabase proxy blocks the insert with `QA_BLOCKED`, and the modal surfaces it as "Failed to create visit." A few related tables (`beats`, `daily_beat_plans`, `retailer_beat_assignments`) have the same problem the moment QA users touch beat/visit flows.

**Fix.**
- New migration creates `qa_` mirrors that don't exist yet:
  - `qa_beats` (full mirror of `public.beats` — `CREATE TABLE … (LIKE public.beats INCLUDING ALL)` minus FKs to non-mirrored prod tables).
  - `qa_beat_plans`.
  - `qa_daily_beat_plans`.
  - `qa_retailer_beat_assignments`.
  - Each gets the standard 4-step block: `CREATE TABLE` → `GRANT SELECT/INSERT/UPDATE/DELETE` to `authenticated` + `ALL` to `service_role` → `ENABLE RLS` → permissive policy (`USING (true) WITH CHECK (true)`) matching the existing `qa_*` table style. No anon grants — QA is auth-only.
- Extend `QA_MIRRORED_TABLES` in `src/lib/tableRouter.ts` with: `beats`, `beat_plans`, `daily_beat_plans`, `retailer_beat_assignments`.
- Harden the QA wrapper in `src/integrations/supabase/client.ts`: if the caller passes a name that already starts with `qa_`, treat it as mirrored (pass through, no block). This stops the wrapper from blocking legitimate writes to `qa_test_runs` / `qa_test_logs` and any future `qa_*` table that code references directly.

After this, `CreateNewVisitModal` writes to `qa_beat_plans` and the toast becomes "Visit Created".

### 2) Beats mirror

Covered by the same migration above (`qa_beats` + the dependent `qa_beat_plans` / `qa_daily_beat_plans` / `qa_retailer_beat_assignments`) and the `QA_MIRRORED_TABLES` update. Any read/write in QA that goes through `supabase.from('beats')` will land on `qa_beats` automatically — no page changes required.

### 3) "Run Tests (QA)" — "Something went wrong" + add runnable samples

**Why it crashes.** Two compounding problems:
- The runner writes to `qa_test_runs` / `qa_test_logs` via `supabase.from(...)`. The QA wrapper sees those names are not in `QA_MIRRORED_TABLES` and returns a `QA_BLOCKED` shape. Every step then logs a noisy error and never actually persists, but the click path still works. The crash itself is most likely a render-time exception that the global ErrorBoundary catches as "Something went wrong" — the screen calls hooks after an early `return <Navigate />`, violating the rules of hooks when `isQAMode` flips. We'll fix that by moving the `useState` / `useMemo` calls above the early return.
- All flows/actions are `skipped`, so even when the page does render, "Run Selected" is permanently disabled and looks broken.

**Fix.**
- `src/qa/screens/RunTestsScreen.tsx`: move `useState` / `useMemo` hooks above the `if (!isQAMode) return <Navigate/>` early return; wrap `runSelected` in try/catch so a thrown step error becomes a failed result row instead of bubbling to the ErrorBoundary.
- The wrapper change in (1) also lets `qa_test_runs` / `qa_test_logs` inserts actually land.
- Add real, runnable sample actions (`skipped: false`) that exercise the QA routing end-to-end against `qa_*` tables only:
  - `smoke.count-retailers` — `select count` head:true on `qa_retailers`, passes if no error.
  - `smoke.list-products` — fetches 5 rows from `qa_products`.
  - `retailer.create-temp` — inserts a throwaway retailer into `qa_retailers` with a `QA-TEST-<uuid>` name, then deletes it; passes if both succeed.
  - `visit.create-temp` — inserts then deletes a `qa_beat_plans` row for the current user + today (depends on the migration above).
- Add a runnable sample flow `flow.smoke` chaining `smoke.count-retailers` → `smoke.list-products` → `retailer.create-temp` so users see a green/red trail when they click Run.
- Leave the existing `skipped` placeholder actions in place — they document what still needs service extraction.

### Acceptance

- QA APK can create a visit; row appears in `qa_beat_plans`, never in `public.beat_plans`.
- Creating/reading a beat in QA hits `qa_beats`.
- Opening `/qa/run-tests` in the QA APK no longer shows "Something went wrong"; selecting "Smoke" and clicking Run shows pass rows, and a row appears in `qa_test_runs` with linked `qa_test_logs`.
- Production build is unaffected (wrapper is a no-op when `VITE_APP_MODE !== 'qa'`).

### Out of scope

- Extracting `CreateNewVisitModal` / order-entry logic into service modules so the remaining `skipped` actions can run. That's the separate Phase-2 service-extraction pass already noted in the screen's amber banner.
