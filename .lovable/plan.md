# Out-of-beat retailer search + ordering

Mirrors the existing backdate / on-behalf patterns. No new screen, no schema changes (server already migrated). All UI changes are gated by `oob_enabled AND can('order_out_of_beat','create')`; when off, behaviour is unchanged.

## 1. Shared plumbing (new small files)

**`src/hooks/useOOBConfig.ts`** — one-shot React Query for `operations_config` row `id = 1`, returns `{ oob_enabled, oob_visibility, oob_require_reason, oob_require_gps, oob_credit_rule }`. Cached with staleTime 5 min.

**`src/hooks/useTodaysBeatIds.ts`** — returns `Set<string>` of beat_ids planned for the current user *today*: union of
- `daily_beat_plans.beat_id` where `assigned_user_id = me AND plan_date = today AND status = 'active'`
- `beat_plans.beat_id` where `user_id = me AND plan_date = today`
- owned beats (`beats.user_id = me OR beats.owner_id = me`, `is_active = true`) — permanent ownership counts as "in today's beat"

Used to decide `is_planned_beat` for a chosen retailer.

**`src/hooks/useMyTerritoryIds.ts`** — territory_ids from beats the user owns (`beats.user_id = me OR owner_id = me`). Used only when `oob_visibility = 'territory' | 'all'` to widen the retailer list.

**`src/lib/outOfBeatContext.ts`** — session-scoped context, same shape as `onBehalfContext`:
```
type OutOfBeatContext = { retailerId: string; reason: string; gpsLat?: number; gpsLng?: number };
```
`getOutOfBeatContext / setOutOfBeatContext / clearOutOfBeatContext` keyed as `out_of_beat_context`.

## 2. MyRetailers — widened loader + place-order gate

In `src/pages/MyRetailers.tsx`, when `oob_enabled && can('order_out_of_beat','create')` and the selected view is "self" (single user, self):

- Extend `loadRetailers` with an additive fetch based on `oob_visibility`:
  - `beat` → no widening.
  - `assigned` → current loader already covers assigned + shared. No extra fetch.
  - `territory` → additionally `select * from retailers where territory_id IN <my territories>` (dedupe by id into existing map). Cached with the rest.
  - `all` → **search-driven only, online-only**. Skip auto-load. When `navigator.onLine === false`, gate is disabled and a small "Search is limited to your beats while offline" hint appears in the search box tooltip. When online + search term length ≥ 3, hit `retailers` filtered by `name ILIKE %q% OR phone ILIKE %q%` with `limit 50`, and merge into `retailers` state (marking these as OOB-sourced rows).
- Rows that lie outside `useTodaysBeatIds()` show a small "Out of beat" muted badge next to the beat name. Rows unavailable due to OOB gate off keep behaving as today.

The ShoppingCart action stays visible for OOB-scope rows. On click:
1. Compute `isPlannedBeat = todaysBeatIds.has(r.beat_id)`.
2. If in-beat → navigate to `/order-entry?...` as today; also call `clearOutOfBeatContext()`.
3. If out-of-beat → open a small confirm dialog with:
   - Warning banner "This retailer is outside today's planned beat".
   - Reason input (required when `oob_require_reason`).
   - GPS capture button (required when `oob_require_gps`) using existing `navigator.geolocation.getCurrentPosition`. Store lat/lng.
   - Confirm sets `outOfBeatContext = { retailerId: r.id, reason, gpsLat, gpsLng }` and navigates.

The existing on-behalf gate (`canPlaceOrderForRow`) is preserved and combines with the OOB gate.

## 3. Cart — consume context, surface badge, ship flags

In `src/pages/Cart.tsx`, mirror the backdate/on-behalf wiring:

- Read `outOfBeatContext` on mount into `oobCtx`. Compute `isOutOfBeat = !!oobCtx && oobCtx.retailerId === validRetailerId`.
- Compute `isPlannedBeat` from `useTodaysBeatIds()` for `validRetailerId` (fallback true when hook loading is unknown — server re-checks anyway).
- Extend both order payload builders (regular ~L1094 and D-1 ~L2084) with:
  ```
  is_out_of_beat: isOutOfBeat,
  out_of_beat_reason: isOutOfBeat ? oobCtx!.reason : null,
  is_planned_beat: isOutOfBeat ? false : true,
  ```
  Keep `user_id = currentUserId` unchanged (server reassigns credit per `oob_credit_rule` — no client compute).
- Add an "Out of beat" pill in the summary card, next to the existing Backdated / On-behalf badges (same styling), with sub-text showing the reason.
- On successful submit and on manual cancel, call `clearOutOfBeatContext()` alongside the existing `sessionStorage.removeItem('backdated_order_context')` cleanup.

GPS captured at pick-time is **not** persisted to a specific column here (no schema change requested) — the reason + is_out_of_beat + is_planned_beat + owner snapshot is the record. GPS is retained in session context in case a future step needs it; no order column write.

## 4. What stays unchanged

- OrderEntry doesn't need edits — it already receives `retailerId` via URL and hands off to Cart, which now enforces OOB flags.
- Existing on-behalf and backdate flows continue independently and can coexist with OOB.
- Users without `order_out_of_beat.create` see today's behaviour: only assigned/shared beat retailers, no OOB dialog, no badge.

## Technical notes

- Server RLS already returns OOB retailers when the caller matches `retailer_in_user_oob_scope`, so widened selects need no elevated privileges.
- `oob_visibility = 'all'` must be online-only because RLS scans the full retailers table; enforce via `navigator.onLine` before enabling the search-driven path.
- No new routes, no new pages, no DB migration.

## Files touched

- new `src/hooks/useOOBConfig.ts`
- new `src/hooks/useTodaysBeatIds.ts`
- new `src/hooks/useMyTerritoryIds.ts`
- new `src/lib/outOfBeatContext.ts`
- edit `src/pages/MyRetailers.tsx` — widened loader, OOB dialog on ShoppingCart click, OOB badge on rows
- edit `src/pages/Cart.tsx` — read context, add payload flags, summary badge, cleanup on success/cancel
