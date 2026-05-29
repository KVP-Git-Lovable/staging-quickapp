
# User Operational Flexibility — Implementation Plan

Phased delivery. Each phase is shippable on its own. No admin UI in this scope — every table/RPC is built so a future admin module can plug in without schema changes.

## Guiding model

Five orthogonal axes, never collapsed onto a single user column:

```text
Ownership            → retailers.user_id / beats.user_id          (rarely changes)
Operational Access   → retailer_shared_access + user_delegations  (daily / temporary)
Sales Credit         → orders.sales_credit_user_id                (who gets the sale)
Collection Activity  → distributor_payments.collected_by_user_id  (who took cash)
Historical Snapshot  → *_snapshot_user_id columns on txns         (frozen at event time)
```

Snapshots are written by triggers at insert time so reports stay correct even after ownership/shares change.

---

## Phase 1 — DB foundation (migration only, no UI)

### 1.1 New tables

**`retailer_shared_access`** — temporary share grants
- `id, retailer_id, shared_by_user_id, shared_to_user_id`
- `access_template_id` (nullable; FK target table comes later in admin phase — store as uuid now)
- flags: `can_view, can_take_orders, can_collect_payment, can_update_feedback` (bool, default false)
- `effective_from timestamptz, effective_to timestamptz, is_active bool default true`
- `created_at, created_by`
- Index: `(shared_to_user_id, is_active, effective_from, effective_to)`, `(retailer_id, is_active)`

**`user_delegations`** — leave handover
- `id, from_user_id, to_user_id`
- `delegation_scope text check in ('all','beats','retailers')`
- `beat_ids uuid[], retailer_ids uuid[]`
- `effective_from, effective_to, status text check in ('active','expired','revoked')`
- `created_at, created_by`
- Trigger on insert: fan out into `retailer_shared_access` rows (one per affected retailer) with the four permission flags = true, so all downstream RLS just reads one table.

**`payment_allocations`** — payment ↔ invoice link
- `id, payment_id, invoice_id, allocated_amount numeric(14,2)`
- `allocation_type text check in ('fifo','manual','advance')`
- `created_at, created_by`
- Trigger: after insert/update/delete, recompute `distributor_secondary_invoices.amount_paid/amount_due/payment_status` and refresh `distributor_payments.unallocated_amount`.
- Unique `(payment_id, invoice_id)`.

**`distributor_collection_policy`** — per-distributor settings (one row per distributor)
- `id, distributor_id unique, allocation_strategy text default 'fifo' check in ('fifo','manual','prompt')`
- `allow_manual_override bool default true, allow_unallocated_amount bool default true`
- Seed one row per existing distributor in the same migration.

**`operational_activity_log`** — single timeline (append-only)
- `id, retailer_id, beat_id, activity_type text, entity_type text, entity_id uuid`
- `performed_by_user_id, owner_snapshot_user_id, operational_snapshot_user_id`
- `metadata_json jsonb default '{}', created_at`
- Indexes: `(retailer_id, created_at desc)`, `(performed_by_user_id, created_at desc)`.

**`route_execution_history`**
- `id, route_date date, retailer_id, beat_id, assigned_user_id, executed_by_user_id`
- `action_type text check in ('visited','skipped','reassigned','added_adhoc')`
- `remarks text, created_at`
- Index `(route_date, assigned_user_id)`.

All tables: standard `GRANT SELECT/INSERT/UPDATE/DELETE … TO authenticated`, `GRANT ALL … TO service_role`, RLS enabled.

### 1.2 Column additions (no data loss)

`distributor_payments` → `sales_credit_user_id, collected_by_user_id, operational_snapshot_user_id, owner_snapshot_user_id, unallocated_amount numeric(14,2) default 0`.

`distributor_secondary_invoices` → `owner_snapshot_user_id, operational_snapshot_user_id, amount_paid numeric(14,2) default 0, amount_due numeric(14,2) generated always as (total_amount - coalesce(amount_paid,0)) stored, payment_status text default 'unpaid'`.

Operational tables (`orders`, `visits`, `distributor_payments`, `distributor_secondary_invoices`) → `owner_user_id, operational_user_id, created_by, updated_by` where missing. Existing `created_by` columns are kept as-is.

Backfill: `owner_snapshot_user_id := retailers.user_id`, `amount_paid := sum(existing allocations or 0)`.

### 1.3 RLS / SECURITY DEFINER helpers

- `public.user_has_operational_access(_user uuid, _retailer uuid, _perm text) returns bool` — checks ownership OR active row in `retailer_shared_access` covering `now()` with the requested flag. Used by RLS on orders/visits/payments to allow shared collaborators to read/write.
- `public.user_owns_retailer(_user, _retailer)` — pure ownership check.
- Update RLS on `orders`, `distributor_payments`, `visits` to use `user_has_operational_access` for SELECT/INSERT/UPDATE.
- Reuse existing `has_role` / hierarchy RPCs untouched.

### 1.4 Snapshot triggers

Single `set_operational_snapshots()` trigger attached to `orders`, `distributor_payments`, `distributor_secondary_invoices`:
- Fills `owner_snapshot_user_id` from `retailers.user_id`.
- Fills `operational_snapshot_user_id` from active `retailer_shared_access` (preferring delegation > share) or owner.
- Fills `sales_credit_user_id` (payments/orders) from `auth.uid()` only if NULL.
- Logs an `operational_activity_log` row.

### 1.5 Delegation expiry job

`pg_cron` job `expire_user_delegations` (hourly): sets `user_delegations.status='expired'` and `retailer_shared_access.is_active=false` where `effective_to < now()`.

---

## Phase 2 — RPCs (server logic, still no UI)

1. `share_retailer_access(p_retailer_id, p_to_user, p_perms jsonb, p_from, p_to)` — insert into `retailer_shared_access`.
2. `revoke_retailer_access(p_share_id)` — soft revoke + log.
3. `create_user_delegation(p_to_user, p_scope, p_beat_ids, p_retailer_ids, p_from, p_to)` — fans out share rows in one txn.
4. `allocate_payment_fifo(p_payment_id)` — picks oldest open invoices for that retailer until payment exhausted; remainder → unallocated.
5. `allocate_payment_manual(p_payment_id, p_allocations jsonb)` — `[{invoice_id, amount}, …]`; validates sum ≤ payment amount; respects `allow_unallocated_amount` from policy.
6. `reallocate_payment(p_payment_id, p_allocations jsonb)` — wipe + re-apply.
7. `record_route_execution(p_retailer_id, p_action, p_remarks)`.
8. `get_my_operations_today(p_date)` — returns today's retailers (owned ∪ shared today via daily plan ∪ delegations) with pending collection totals.
9. `get_collection_workspace(p_filter text)` — pending invoices/outstanding/overdue grouped by retailer.

All RPCs `p_`-prefixed, drop overloaded legacy signatures, security definer with explicit `search_path = public`.

---

## Phase 3 — User workspace UI (`/my-operations`)

New route in `src/App.tsx` → `src/pages/MyOperations.tsx` with tabs (`shadcn/Tabs`):

```text
Today | My Beats | Retailers | Collections | Shared Access | Delegation
```

Components in `src/components/my-operations/`:

- `TodayTab.tsx` — today's retailers (from `get_my_operations_today`), today's route order, pending-collection chips, quick actions (Share / Delegate / Collect / Feedback) opening shared drawers.
- `MyBeatsTab.tsx` — three sections: Owned / Shared / Temporary; each row shows retailer count, pending collections, overdue invoices (reads `beats` + new views).
- `RetailersTab.tsx` — filter chips Owned / Shared / Assigned Today; row click → `RetailerDetailDrawer` with sections Summary, Outstanding, Open Invoices, Shared Access, Activity Timeline (from `operational_activity_log`). Header shows Owner + current Operational user.
- `CollectionsTab.tsx` — wraps the new Collection Center.
- `SharedAccessTab.tsx` — list grants where I am sharer or recipient, with Revoke.
- `DelegationTab.tsx` — list + "New Delegation" wizard (To / Date range / Scope / Retailers or Beats).

Shared drawers (reused everywhere):

- `ShareRetailerDrawer.tsx`
- `DelegateDrawer.tsx`
- `CollectPaymentDrawer.tsx` (see Phase 4)
- `FeedbackDrawer.tsx` (thin wrapper over existing feedback)

Hooks in `src/hooks/`:

- `useMyOperationsToday`, `useMyBeats`, `useMyRetailers`, `useCollectionWorkspace`, `useSharedAccess`, `useDelegations`, `useActivityTimeline`.

All hooks follow the offline-first pattern (React Query + IndexedDB cache + retry queue) consistent with `useOfflineRetailers` / `useOfflineOrderEntry`.

Mobile (Capacitor) gets the same routes — tabs collapse to a bottom segmented control on `<md`.

---

## Phase 4 — Collection Center & payment allocation

Route: `/my-operations/collections` (also linked from distributor portal's existing `CollectPayment.tsx`).

`CollectionWorkspace.tsx`:
- Lists pending invoices and outstanding retailers.
- Filters: My Collections / Shared Collections / Overdue / Follow-up Required.
- Row → `CollectPaymentDrawer`.

`CollectPaymentDrawer.tsx` — two modes governed by `distributor_collection_policy.allocation_strategy`:

**Auto FIFO** (default): user enters amount, preview shows which invoices will be settled, single Confirm → `allocate_payment_fifo`.

**Manual** (or when policy allows override): table of open invoices `[Invoice | Outstanding | Allocate]` with editable amount column, running totals (Allocated / Unallocated / Payment Total), validations:
- Sum of allocations ≤ payment amount.
- Each allocation ≤ invoice outstanding.
- If `allow_unallocated_amount=false`, sum must equal payment.
- Supports the refusal scenario: user can leave INV001 at 0 and put full amount on INV002.

Submit calls `allocate_payment_manual`. Drawer also offers a "Switch to FIFO" toggle when policy allows.

Existing `src/pages/distributor-portal/CollectPayment.tsx` is updated to use the same drawer instead of its inline form, so external portal and internal workspace share one flow.

---

## Phase 5 — Reporting (user-level only, no admin)

Add to existing `Performance` / `MyTargets` area, new tiles wired to RPCs:

- `My Sales` — `sum(orders) where sales_credit_user_id = me`.
- `My Collections` — `sum(distributor_payments) where collected_by_user_id = me`.
- `Shared Activity` — counts from `operational_activity_log` where `performed_by_user_id = me` and `owner_snapshot_user_id != me`.
- `Today's Execution` — from `route_execution_history`.
- `Outstanding Follow-up` — open invoices on retailers in my operational set, sorted by days overdue.

Sales credit and collection activity stay in separate cards/queries — never aggregated together.

---

## Phase 6 — Testing & rollback

**Test scenarios** (Playwright + manual):
1. Owner takes order → snapshot columns populated; share grant after-the-fact doesn't change snapshot.
2. Share grant with `can_take_orders=true` → recipient can insert order; without it, RLS blocks.
3. Delegation create → child shares appear; cron expiry → access revoked at boundary.
4. FIFO allocation across 3 invoices with leftover unallocated.
5. Manual allocation: skip oldest, pay newest only (refusal scenario).
6. Partial payment then second payment → statuses transition `unpaid → partial → paid`.
7. Reallocation rewrites invoice statuses correctly.
8. Multiple collectors on same retailer in same day → both visible in activity timeline with correct `performed_by_user_id`.
9. Offline: queue share + payment while offline, sync, verify snapshot integrity.
10. Hierarchy manager sees subordinate activity (uses existing `get_all_subordinates`).

**Rollback plan:**
- Every migration is reversible (drop new tables, drop new columns — generated `amount_due` dropped first).
- Snapshot triggers are detachable; without them, app falls back to current behavior.
- Feature flag `feature_flags.user_operational_workspace` gates the `/my-operations` route and the new collection drawer; turning it off restores the legacy `CollectPayment.tsx` inline form.
- `payment_allocations` is additive: if disabled, invoices still settle via existing direct-payment logic because `amount_paid` is also writable directly.

---

## Technical / non-functional notes

- All Supabase IDs via env vars; no hardcoding.
- All errors retryable via existing IndexedDB queue; multi-device 23505 treated as success.
- New RPCs prefixed `p_`, security definer, explicit `search_path`.
- New tables get `service_role` grants for edge functions; `anon` not granted (all auth-scoped).
- No changes to `auth`, `storage`, `realtime`, `vault` schemas.
- Memory entries to add after build: `architecture/operational-flexibility-model`, `features/payment-allocation/manual-and-fifo`, `features/delegation-and-shared-access`.

## Out of scope (deferred to admin phase)

- Access templates management UI (`access_template_id` is stored but not edited here).
- Collection policy editor.
- Cross-distributor reporting dashboards.
- Bulk delegation imports.

## Confidence

~80%. Main risks: (a) RLS rewrite on `orders` / `distributor_payments` must not regress existing manager/hierarchy access — mitigated by composing helpers, not replacing them; (b) `amount_due` as a generated column requires no existing writes to that name — verified absent in current schema; if present, switch to trigger-maintained column.
