## QA Runner: qa_run_id attribution + Run Tests screen result display

Two connected fixes so cleanup works and the Run Tests screen shows authoritative results.

### 1. Add `qa_run_id: ctx.runId` to every qa_* entity insert

Audit every action file and add `qa_run_id: ctx.runId` to any insert into a `qa_*` entity table missing it.

- `src/qa/automation/retailerActions.ts`
  - `retailer.create` insert into `qa_retailers` → add `qa_run_id`
  - `retailer.assign-to-beat` insert into `qa_retailer_beat_assignments` → add `qa_run_id`
- `src/qa/automation/visitActions.ts` — confirm `qa_visits`, `qa_attendance` inserts include it (Fix 4 landed; re-verify)
- `src/qa/automation/orderActions.ts` — `qa_orders`, `qa_order_items` inserts
- `src/qa/automation/smokeActions.ts` — any `qa_*` inserts (beats, beat_plans, etc.)
- `src/qa/automation/offlineSyncActions.ts` — any `qa_*` inserts

Rule: every `.from(table('qa_<entity>'))` `.insert(...)` in the QA action layer must carry `qa_run_id: ctx.runId`. `qa_test_runs` and `qa_test_logs` are managed by `runner.ts` and are out of scope.

### 2. FIX A — Use `run_id` (not `id`) as the join key everywhere

`qa_test_runs.id` is the table PK; `qa_test_runs.run_id` is the uuid that `qa_test_logs.test_run_id` references. They are always different.

- Grep `src/` for `qa_test_logs` and `qa_test_runs` usages.
- In `src/pages/RunTestsScreen.tsx` (and any hook it calls), every `.eq('test_run_id', …)` must receive `run.run_id`, never `run.id`.
- Every `.eq('…', runId)` against `qa_test_runs` must use `.eq('run_id', runId)` — never `.eq('id', runId)`.
- Leave `src/qa/runner.ts` `startRun` / `logStep` / `finishRun` unchanged (they already use `run_id`).

### 3. FIX B — Kill stuck "running" rows

- Apply migration:
  ```sql
  UPDATE qa_test_runs
     SET overall_status = 'failed',
         completed_at   = started_at,
         notes          = 'Cleaned up: runner crashed before finishing'
   WHERE completed_at IS NULL
     AND overall_status = 'running'
     AND started_at < now() - interval '1 hour';
  ```
- In `RunTestsScreen` "Past Runs" query, add `.neq('overall_status', 'running')` OR treat any run with `started_at < now() - 5min` and `overall_status = 'running'` as `failed` in the display.

### 4. FIX C — Re-fetch from DB after `finishRun()`

In `RunTestsScreen.tsx`, after the run loop:

```ts
await finishRun(runId, allResults);

const { data: runData } = await supabase
  .from(table('qa_test_runs') as any)
  .select('*')
  .eq('run_id', runId)
  .single();

const { data: logData } = await supabase
  .from(table('qa_test_logs') as any)
  .select('*')
  .eq('test_run_id', runId)
  .order('started_at', { ascending: true });

setCompletedRun(runData);
setResults(logData ?? []);
```

Authoritative DB state — not in-memory streaming state — drives the final display.

### 5. FIX D — Past Runs section

In `RunTestsScreen.tsx`, ensure a Past Runs list exists (last 20):

```ts
const { data: runs } = await supabase
  .from(table('qa_test_runs') as any)
  .select('*')
  .eq('build_type', 'qa')
  .neq('overall_status', 'running')
  .order('started_at', { ascending: false })
  .limit(20);
```

Expanding a run fetches its logs with `.eq('test_run_id', selectedRun.run_id)`. Show status badge, pass/fail counts, start time, duration; expandable per-step logs.

### Out of scope / do not change

- `qa_test_runs` / `qa_test_logs` schemas.
- `runner.ts` `startRun` / `logStep` / `finishRun` behavior.
- Any production (non-`qa_*`) tables or code.

### Verification

- Run a flow → results render immediately from DB on completion.
- Grep confirms zero `.eq('test_run_id', run.id)` and zero `.eq('id', runId)` against `qa_test_runs`.
- Past Runs shows today's runs with counts + expandable logs.
- Stuck yesterday run no longer displays as in-progress.
- New rows in `qa_retailers` / `qa_visits` / `qa_attendance` / `qa_orders` / `qa_order_items` all carry `qa_run_id`, so `cleanup_qa_run()` removes them.
