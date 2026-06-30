# QA Build System for QuickApp

Add an isolated QA build path (separate APK, separate `qa_*` tables) that shares the production codebase, Supabase project, and business logic. All work is additive except one targeted edit to `capacitor.config.ts`.

## Part 0 — Fix `capacitor.config.ts`
Remove the entire `server: { ... }` block (currently points the APK at `https://field-sales-navigator.lovable.app`). Keep `appId`, `appName`, `webDir`, `webView`, `android`, and `plugins` exactly as-is. Result: APKs load their own bundled `dist/`; hot-reload on device stops working (browser preview unaffected).

## Part 1 — Env files (no credentials inside)
- `.env.qa` → `VITE_APP_MODE=qa`, `VITE_TABLE_PREFIX=qa_`, `VITE_APP_NAME=QuickApp QA`
- `.env.production` → `VITE_APP_MODE=production`, `VITE_TABLE_PREFIX=`, `VITE_APP_NAME=QuickApp`

Supabase URL/anon key continue to come from the existing `.env`. Match the repo's current git treatment of `.env`.

## Part 2 — `src/lib/tableRouter.ts`
Export `table(name)` returning `${prefix}${name}` and `isQAMode()`. Typed against `Database['public']['Tables']`. No existing `supabase.from()` call is modified — call-site migration is a separate future task.

## Part 3 — `src/contexts/QAModeContext.tsx`
`QAModeProvider` exposing `{ isQAMode, tablePrefix }` from `import.meta.env`. Mount inside existing providers in `src/main.tsx` / `src/App.tsx`, outside routing.

## Part 4 — `src/components/qa/QAModeBanner.tsx`
Returns `null` outside QA. In QA, renders a fixed top banner at `z-[10000]` with the warning text. Mount once at the top of `src/components/Layout.tsx`. Add conditional `pt-6` on Layout's outer container ONLY when `isQAMode` is true — production layout untouched.

## Part 5 — `package.json` scripts (additive)
Add `build:qa`, `build:prod`, `sync:qa`, `sync:prod` exactly as specified. No existing script changed.

## Part 6 — Android flavors
- Read current `app_name` from `android/app/src/main/res/values/strings.xml` (currently `SalesNavigator`) and delete that single line.
- In module-level `android/app/build.gradle`, after `buildTypes`, add `flavorDimensions "environment"` and `productFlavors { qa { ... } prod { ... } }`:
  - `qa`: `applicationIdSuffix ".qa"`, `versionNameSuffix "-QA"`, `resValue "string", "app_name", "SalesNavigator QA"`, `buildConfigField "String", "APP_MODE", '"qa"'`, `ext.enableCrashlytics = false`.
  - `prod`: `resValue "string", "app_name", "SalesNavigator"`, `buildConfigField "String", "APP_MODE", '"production"'`.
- Top-level `android/build.gradle` not touched. No signing config added. Optional distinct QA icon skipped.

## Part 7 — Supabase migrations
Before writing SQL, query `information_schema.columns`, `information_schema.triggers`, `information_schema.role_table_grants`, `pg_enum`, and `information_schema.routines` for the live schema. Use real columns/types/defaults/grants/role enum values from this project. Do not assume.

### Migration 1 — `create_qa_tables`
Tier 1 mirrors (each + `qa_run_id uuid`):
`qa_retailers`, `qa_orders`, `qa_order_items`, `qa_visits`, `qa_retailer_visit_logs`, `qa_attendance`, `qa_inst_leads`, `qa_products`, `qa_gps_tracking`. For wide/evolving tables (>~25 cols) use `CREATE TABLE qa_x (LIKE x INCLUDING DEFAULTS INCLUDING CONSTRAINTS)` then `ADD COLUMN qa_run_id uuid`. Skip any source table missing in this project and note it.

Tier 2 (no mirror, read-through): profiles, beats, territories, distributors, product_variants, product_categories, product_schemes, feature_flags, companies, user_roles, etc.

QA control tables (fresh): `qa_test_runs`, `qa_test_logs`, `qa_sync_audit_log` with the columns specified.

For every `qa_*` table: enable RLS with one permissive `FOR ALL TO authenticated USING (true) WITH CHECK (true)` policy named `qa_<table>_auth`, plus GRANTs matching the role set actually used on existing production tables in this project (verified via `role_table_grants`).

### Migration 2 — `create_qa_cleanup_rpc`
- `cleanup_qa_run(p_run_id uuid)`: SECURITY DEFINER, `SET search_path = public`, deletes from every Tier 1 `qa_*` table + `qa_sync_audit_log` where `qa_run_id = p_run_id` in FK-safe order (children before parents, e.g. `qa_order_items` before `qa_orders`), updates `qa_test_runs` row to `overall_status='cleaned'`, returns a jsonb summary of deleted counts per table.
- `reset_all_qa_data()`: SECURITY DEFINER, `SET search_path = public`, role-gated using the actual function/enum found in this project (project already has `public.has_role(uuid, app_role)` and an `admin` enum value — to be re-confirmed at migration time). TRUNCATE every `qa_*` table `RESTART IDENTITY CASCADE`.
- `GRANT EXECUTE` to the same role set used in Migration 1.

Documented limitation: triggers and edge functions bound to production table names will NOT fire on `qa_*` tables. The migration summary will list every trigger found on Tier 1 tables and every edge function referencing those table names.

## Part 8 — `QA_BUILD_WORKFLOW.md`
Repo-root doc covering: (1) two-step rule with Vite static-baking explanation, (2) exact QA + Prod build commands, (3) why `server.url` was removed, (4) known limitations — full trigger + edge-function list from Part 7, (5) per-applicationId storage isolation note, (6) all bundled portals route through QA-mode prefix in QA builds, (7) QA data lifecycle — auto-generated by use, `cleanup_qa_run(run_id)` per run, `reset_all_qa_data()` admin-only, safe to accumulate.

## Hard constraints honored
No production table touched, no existing `supabase.from()` query changed, no QA UI in production, no `qa_run_id` on production tables, no hardcoded URL/key/project id anywhere, no existing script renamed, top-level `build.gradle` untouched, only the `server` block removed from `capacitor.config.ts`, no assumed role enum values, no assumed columns — all verified against this project's live schema first.

## Verification
On completion, the summary will tick every item in Part 10 explicitly, including the actual list of qa_* tables created, any skipped source tables, the role-check mechanism used in `reset_all_qa_data()`, and the trigger/edge-function inventory carried into the workflow doc.
