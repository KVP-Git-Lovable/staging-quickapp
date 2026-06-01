# Beat Lifecycle + Retailer-Beat Assignment History

## Goals
1. Beat Master: segmented `Active / Inactive / All` toggle (default Active).
2. Soft-delete (deactivate) any Beat that has history; allow permanent delete only when fully unused.
3. Track every retailer↔beat assignment with full `assigned_from / assigned_to / assigned_by / reason` history so Beat A→B→A is fully reconstructible.
4. Surface this history in Retailer details and Beat details, plus a full audit trail.

Out of scope (this phase): admin reactivation screens beyond the toggle action, mass-history backfill UI (we will backfill silently in the migration).

---

## 1. Database changes

### 1a. `beats` table — add lifecycle columns
- `updated_by uuid`
- `deactivated_at timestamptz null`
- `deactivated_by uuid null`
- `reactivated_at timestamptz null`
- `reactivated_by uuid null`

(`is_active`, `created_at`, `created_by`, `updated_at` already exist.)

### 1b. New table `retailer_beat_assignments`
```text
id              uuid pk
retailer_id     uuid not null  (-> retailers.id)
beat_id         text not null  (-> beats.beat_id, matches existing FK style)
assigned_from   timestamptz not null default now()
assigned_to     timestamptz null
is_current      boolean not null default true
assigned_by     uuid null
removed_by      uuid null
transfer_reason text null
created_at / updated_at timestamptz
```
- Partial unique index: `(retailer_id) where is_current = true` — enforces "one active beat per retailer".
- Indexes on `beat_id`, `retailer_id`, `is_current`.
- RLS + GRANTs following project conventions (auth-only writes, scoped reads by `user_id` chain via security-definer helper).

### 1c. Backfill
One-shot insert: for every `retailers` row with a non-null `beat_id`, create a row with `assigned_from = retailers.created_at`, `is_current = true`, `assigned_by = retailers.user_id`.

### 1d. RPCs (SECURITY DEFINER, `p_` params)
- `transfer_retailer_beat(p_retailer_id, p_new_beat_id, p_reason)` — closes current row (`assigned_to = now(), is_current = false, removed_by = auth.uid()`), inserts new row, updates `retailers.beat_id/beat_name`, writes `beat_audit_log` entry `RETAILER_TRANSFERRED`. Idempotent if new beat == current beat.
- `assign_retailer_to_beat(p_retailer_id, p_beat_id, p_reason)` — same logic; used for initial assignment from "Unassigned".
- `can_delete_beat(p_beat_id) returns jsonb` — returns `{deletable: bool, reasons: text[]}` after checking:
  - any current retailer (`retailers.beat_id = p_beat_id`)
  - any row in `retailer_beat_assignments` (current or historical)
  - any `visits` referencing the beat
  - any `orders` / `distributor_secondary_invoices` referencing the beat
  - any `daily_beat_plans` / `beat_plans` / `daily_retailer_assignments` / `van_beat_assignments` rows
  - any `beat_audit_log` rows
- `deactivate_beat(p_beat_id)` — sets `is_active=false`, stamps `deactivated_at/by`, writes `BEAT_DEACTIVATED` audit row. Leaves history intact.
- `reactivate_beat(p_beat_id)` — reverse + `BEAT_REACTIVATED`.
- `delete_beat_permanent(p_beat_id)` — re-runs `can_delete_beat` server-side; throws if not deletable; deletes the beat row.

### 1e. `beat_audit_log` — add allowed action values
Allow new actions: `BEAT_CREATED`, `BEAT_UPDATED`, `BEAT_DEACTIVATED`, `BEAT_REACTIVATED`, `RETAILER_TRANSFERRED`, `RETAILER_ASSIGNED_TO_BEAT`. (Table is freeform `text`, no schema change needed; only conventions + triggers updated.)

### 1f. Trigger
On `beats` INSERT / UPDATE of meaningful columns → write `BEAT_CREATED` / `BEAT_UPDATED` rows automatically.

---

## 2. Frontend — Beat Master (`src/pages/MyBeats.tsx`)

- New state `beatStatusFilter: 'active' | 'inactive' | 'all'`, default `'active'`.
- Segmented control (`ToggleGroup`) at the top of the Beats tab.
- Beat fetch: drop the hard-coded `.eq('is_active', true)`; filter client-side from the segmented value (keeps offline cache simple).
- Per-row action menu:
  - Call `can_delete_beat` lazily when the menu opens (or batch on list load) → show **Delete** only when `deletable=true`, otherwise show **Deactivate**.
  - Inactive beats show **Reactivate** instead.
- Update `BeatDeleteDialog` to a thin wrapper that:
  - If `deletable=true` → confirm hard delete (calls `delete_beat_permanent`).
  - If `deletable=false` → show blocked message with the reason list and a single **Deactivate** CTA (calls `deactivate_beat`). Keeps existing transfer/reassign/unassign options as separate pre-step actions if the user wants to clear retailers first.
- Inactive beats render with a muted style + "Inactive" badge.

## 3. Retailer transfer flow

- New `TransferRetailerBeatModal` (reused from Retailer detail + a row action in `MyRetailers`):
  - Fields: Current Beat (read-only), New Beat (Select, only active beats), Transfer Reason (textarea, required).
  - Calls `transfer_retailer_beat` RPC. Invalidates retailer + beat queries.
- `MassEditBeatsModal`: route through `transfer_retailer_beat` per retailer (looped or new bulk RPC `transfer_retailers_beat_bulk`) so history rows are created.

## 4. History views

- **Retailer detail** (`RetailerDetailModal`): add tab **Beat History** — table of `retailer_beat_assignments` for the retailer, newest first, joined to beat name + assigner profile name. Always show "Current" badge on the active row.
- **Beat detail** (`BeatDetail.tsx`): two sub-sections:
  - **Current Retailers** — existing list (filtered by `is_current = true`).
  - **Historical Retailers** — distinct retailers from `retailer_beat_assignments` for this beat with assigned_from / assigned_to columns, even if the retailer is now elsewhere or the beat is inactive.

## 5. Hooks / utilities

- `src/hooks/useBeatLifecycle.ts` — wraps `can_delete_beat`, `deactivate_beat`, `reactivate_beat`, `delete_beat_permanent` with React Query + toasts.
- `src/hooks/useRetailerBeatHistory.ts` — fetches assignment rows for a retailer or beat.
- Replace direct `retailers.update({ beat_id })` in MyBeats / MassEditBeatsModal / inline assign with the new RPCs so no code path can mutate beat ownership without a history row.

## 6. Offline-first compatibility

- New RPC calls go through the existing offline retry queue (`offlineErrorHandler`) — they are idempotent on `(retailer_id, beat_id, assigned_from)` so retries from a different device safely return 23505 → treated as success per project policy.
- IndexedDB cache of retailers continues to store `beat_id` / `beat_name` for quick UI; history is fetched on demand and not cached offline (acceptable — it is reporting data).

## 7. Acceptance checks
- Toggle defaults to Active and switches lists correctly.
- A brand-new beat with no retailers and no other refs shows **Delete**; clicking it removes the row.
- A beat that ever had a retailer shows **Deactivate**; trying to force-delete via API also fails.
- Transferring ABC Medical: North → South → North creates 3 rows; current row points to North; previous two have `assigned_to` set.
- Retailer detail → Beat History tab shows all 3 rows with timestamps and assigner.
- Beat detail (North) → Historical Retailers shows ABC Medical twice with the two stints.
- Deactivating a beat hides it from the default list but keeps every historical row intact; reports for prior dates still resolve the beat name.
- `beat_audit_log` contains matching `BEAT_DEACTIVATED` / `RETAILER_TRANSFERRED` rows.

---

## Phasing
1. **DB migration** — beats columns + `retailer_beat_assignments` + RPCs + backfill + trigger.
2. **Beat Master UI** — toggle + dynamic Edit/Delete/Deactivate + Reactivate.
3. **Retailer transfer RPC wiring** — modal + MyRetailers row action + MassEditBeats rewrite.
4. **History tabs** — Retailer detail + Beat detail.
5. **QA pass** against the acceptance checks.

Shall I proceed with Phase 1 (the migration)?
