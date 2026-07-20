
# Report Subscriptions

Adds a "Report subscriptions" tab to the existing Notification Rules admin page that lets an admin build a report from a dataset, schedule it, and deliver it as an in-app notification with an optional Excel/PDF file and phone push. Reuses `notifications`, `send-push`, `push_device_tokens`, `push_config`, and the cron pattern from `capture-leaderboard-snapshot`.

## Resolved decisions (from your answers)
- **Sales metric**: Revenue (₹) and Quantity (cases) as two separate measures — deferred to the follow-up Secondary Sales dataset.
- **Summary-only**: strictly text-only, no file.
- **Recipients**: named users only (`recipient_user_ids uuid[]`); no roles.
- **EOD scoping**: per-subscription toggle `scope: shared | per_recipient`. `per_recipient` re-runs the dataset RPC per recipient scoped to their subordinates via `get_all_subordinates`.

## Execution order
Prompt 0 → Prompt 6 (Attendance only) → Prompts 1–4 (admin UI) → Prompt 5 (recipient screen) → Secondary Sales dataset later.

---

## Prompt 0 — Backend foundation

### Migration 1 — schema + Attendance dataset registration
- `public.reportable_datasets(key text pk, label, description, source, dimensions jsonb, measures jsonb, supports_matrix bool, is_active bool default true, timestamps)`.
- `public.report_definitions(id uuid pk, name, dataset_key fk, layout text check in tabular/grouped/matrix, config jsonb, created_by uuid, timestamps)`.
- `public.report_subscriptions(id uuid pk, name, report_definition_id fk, cadence text, fire_day text, fire_time time, timezone text default 'Asia/Kolkata', recipient_user_ids uuid[] not null default '{}', attachment_format text check in excel/pdf/summary_only, push_to_phone bool default true, scope text check in shared/per_recipient default 'shared', status text check in active/paused/draft default 'active', last_fired_at timestamptz, created_by uuid, timestamps)`.
- `public.report_delivery_log(id uuid pk, subscription_id fk, recipient_user_id uuid, period text, notification_id uuid, storage_path text, in_app_status text, push_status text, error text, created_at)`.
- GRANT SELECT/INSERT/UPDATE/DELETE to `authenticated`, ALL to `service_role`, plus `GRANT SELECT ON reportable_datasets TO authenticated`.
- Enable RLS on all four. Policies:
  - `reportable_datasets`: read for all authenticated; write only for `has_any_admin_permission(auth.uid())` (reuse existing admin check helper — will confirm exact function name in code).
  - `report_definitions` / `report_subscriptions`: admins read/write all; non-admin recipients can read a subscription (and its definition via join) when `auth.uid() = ANY(recipient_user_ids)` or `auth.uid() = created_by`.
  - `report_delivery_log`: recipients can read their own rows; admins read all.
- `updated_at` trigger on the three writable tables.
- Storage bucket `report-files` (private) via `supabase--storage_create_bucket`; RLS policy on `storage.objects` restricting SELECT to a service-minted signed URL only (client never lists).
- Seed row in `reportable_datasets`: key `attendance`, source `get_attendance_report`, `supports_matrix=true`, dimensions `[team_member, status, date]`, measures `[{key:hours,agg:avg},{key:present,agg:count}]`.

### Migration 2 — Attendance RPC
`public.get_attendance_report(p_layout text, p_rows text, p_columns text, p_values text[], p_filters jsonb) returns setof jsonb` (SECURITY DEFINER, search_path=public).
- `p_filters` supports `{date_from, date_to, user_ids?, scope_user_id?}`. When `scope_user_id` is set, restrict to that user + `get_all_subordinates(scope_user_id)`.
- `tabular`: raw joined rows from `attendance` + `profiles.full_name`.
- `grouped`: dynamic `group by p_rows`, aggregating `avg(total_hours) as hours`, `count(*) filter (where status='Present') as present`.
- `matrix`: pivot `p_columns` values into columns; include row + column totals.
- Reconciles with `attendance_daily_admin_summary` for org-level day counts (used when `p_rows='date'` and no per-user filter).

**Acceptance**: `select get_attendance_report('grouped','beat',null,'{present,hours}',jsonb_build_object('date_from',current_date,'date_to',current_date))` matches `attendance_daily_admin_summary` totals for today.

---

## Prompt 1 — "Report subscriptions" tab (list page)
- Refactor `src/pages/admin/NotificationRulesAdmin.tsx` to wrap current content in shadcn `Tabs` with two triggers: "Notification rules" (existing content untouched) and "Report subscriptions" (new).
- New component `src/components/admin/reports/ReportSubscriptionsTab.tsx`:
  - Header + primary "New subscription" button → opens `ReportSubscriptionWizard` dialog.
  - Responsive grid of `SubscriptionCard`s: dataset icon tile (colour from dataset key hash), name, subtitle `<dataset> · <cadence @ time>`, cadence chip, active/paused `Switch` (updates `status`), status dot. Dashed "New subscription" add-card at the end.
  - Row actions menu: Run now (calls `report-dispatcher` with `subscription_id` override), Edit, Delete.
  - Below the grid: "Recent deliveries" card — last 20 rows of `report_delivery_log` joined to subscription name, showing sent-to count and status check.
- Data via new hook `src/hooks/admin/useReportSubscriptions.ts` (React Query).

**Acceptance**: subs render as cards; toggle flips `status` in DB; New subscription opens the wizard.

---

## Prompt 2 — Wizard Step 1: Build report
- Component `src/components/admin/reports/wizard/StepBuild.tsx` inside a shared `WizardShell` (3-step stepper).
- Dataset selector cards from `reportable_datasets where is_active`.
- Layout segmented: Tabular / Grouped / Matrix (Matrix disabled unless `supports_matrix`).
- Zones per layout:
  - Tabular → Columns.
  - Grouped → Group rows by + Values.
  - Matrix → Rows + Columns (pivot) + Values.
- Filters zone (date range built-in; other filters read from dataset config in a follow-up). Options row per layout (subtotals/grand total; row/col totals; sales "mark Sundays off" placeholder — hidden for Attendance).
- Fields palette: chips tagged `dim`/`msr`, drag via `@dnd-kit/core` (already installed).
- Live preview table: debounced `supabase.rpc(dataset.source, {p_layout, p_rows, p_columns, p_values, p_filters})` → render as HTML table (max 50 preview rows).
- Continue → hold config in wizard state (Zustand-lite via `useState` + context).

---

## Prompt 3 — Wizard Step 2: Schedule & delivery
- `StepSchedule.tsx`:
  - Cadence segmented (Daily/Weekday/Weekly/Monthly). Weekly shows weekday picker, Monthly shows day-of-month.
  - Time input + timezone select (default `Asia/Kolkata`).
  - Recipients: user multi-select with avatar chips (reuse `useSubordinates` + admin lookup). Named users only.
  - Fixed banner: "In-app notification — shows in the notification bell." (non-selectable).
  - Attachment single-select: Excel / PDF / Summary only.
  - `push_to_phone` toggle (default on) with helper text.
  - **Scope** segmented: Shared (one file, all recipients) vs Per-recipient (team-scoped file per recipient).

---

## Prompt 4 — Wizard Step 3: Review & create
- `StepReview.tsx`: editable name (default `<Dataset> — <Layout>`), summary card, activate toggle.
- Save: single RPC `create_report_subscription(p_definition jsonb, p_subscription jsonb)` (SECURITY DEFINER) that inserts one `report_definitions` row then the `report_subscriptions` row referencing it, in a transaction, returning `subscription_id`.
- On success: close dialog, toast, refresh list.

---

## Prompt 5 — Recipient notification detail
- Locate the current notification-detail rendering (likely `src/pages/Notifications.tsx` or the notification bell drawer) and add a branch for `type === 'report_delivery'`.
- Metadata shape: `{ storage_path, attachment_format, report_name, period, definition_id, subscription_id }`.
- If `attachment_format` in `excel|pdf`: render file card (icon by ext, filename, size if available). "Download report" button calls a new edge function `sign-report-file` that verifies caller ∈ `recipient_user_ids` and returns a fresh 5-min signed URL; open in browser/native viewer. Never persist the URL.
- If `summary_only`: render digest text from `metadata.body_md` (Markdown → sanitized HTML), no file card.
- Push deep-link: `send-push` `data.route = "/notifications/" + notification_id` so tap opens this screen for the correct id.

---

## Prompt 6 — Generation + scheduling

### Edge function `report-dispatcher` (cron)
- Reuses secret-header pattern from `capture-leaderboard-snapshot`.
- Selects `report_subscriptions where status='active'` and matches now against `cadence + fire_day + fire_time` in `timezone`. Idempotency: skip if `last_fired_at` is within the current period bucket.
- For each due subscription, invokes `generate-report` (fetch to internal function URL with service-role auth) with `{subscription_id, period, mode: 'scheduled'}`. Also supports manual `{subscription_id, mode: 'manual'}` from the UI "Run now".
- pg_cron entries via `supabase--insert` (not migration) so URLs/keys stay per-env:
  - `*/15 * * * *` tick to catch any 15-min-aligned `fire_time`.

### Edge function `generate-report`
- Loads subscription + definition + dataset.
- Computes reporting period (Daily = yesterday; Weekday = yesterday if weekday; Weekly = previous ISO week; Monthly = previous month).
- **Scope = shared**: single RPC call, single file build.
- **Scope = per_recipient**: loop recipients; for each, call RPC with `p_filters.scope_user_id = recipient` (restricts via `get_all_subordinates`); build one file per recipient.
- File rendering:
  - Excel via `npm:exceljs` (headers, freeze row, totals styled).
  - PDF via `npm:@react-pdf/renderer` (simple tabular layout).
  - Upload to `report-files/{subscription_id}/{period}/{recipient_or_shared}.{ext}` (private).
- For each recipient:
  - Insert `notifications` row: `type='report_delivery'`, title=`${subscription.name}`, body=summary line or digest text, `metadata={storage_path, attachment_format, report_name, period, definition_id, subscription_id, body_md?}`.
  - For `summary_only`: no upload, no `storage_path`; digest text goes into `metadata.body_md` + `body`.
  - If `push_to_phone`: call `send-push` with `data.notification_id` and `data.route`.
  - Insert `report_delivery_log` row with in_app/push statuses.
- Stamp `last_fired_at` at the end. Wrap per-recipient work in try/catch so one failure doesn't abort the batch.

### Edge function `sign-report-file`
- Validates JWT via `getClaims`, checks caller ∈ `recipient_user_ids` for the notification's `subscription_id`, then `createSignedUrl(storage_path, 300)`.

**Acceptance**: a due subscription generates the file(s), creates in-app notifications for all recipients, pushes to those with tokens, logs outcomes; re-running the dispatcher for the same period does not double-send.

---

## Files created / touched
- **Migrations** (2): schema+seed; `get_attendance_report` RPC + `create_report_subscription` RPC.
- **Edge functions**: `report-dispatcher/index.ts`, `generate-report/index.ts`, `sign-report-file/index.ts`.
- **Storage**: bucket `report-files` (private) via tool.
- **Frontend**:
  - `src/pages/admin/NotificationRulesAdmin.tsx` — wrap in Tabs.
  - `src/components/admin/reports/ReportSubscriptionsTab.tsx`
  - `src/components/admin/reports/SubscriptionCard.tsx`
  - `src/components/admin/reports/RecentDeliveries.tsx`
  - `src/components/admin/reports/wizard/{WizardShell,StepBuild,StepSchedule,StepReview,FieldsPalette,PreviewGrid}.tsx`
  - `src/hooks/admin/{useReportSubscriptions,useReportableDatasets,useDatasetPreview}.ts`
  - `src/pages/Notifications.tsx` (or bell drawer) — add `report_delivery` branch.
  - `src/hooks/useReportFileUrl.ts` — signed-URL fetcher via `sign-report-file`.
- **Secrets**: none new (reuses `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_*`, push trigger secret).

## Out of scope for this build
- Secondary Sales dataset RPC (added after Attendance is validated end-to-end).
- Custom filter widgets beyond a date-range picker.
- Role-based recipients (locked to named users per your decision).
