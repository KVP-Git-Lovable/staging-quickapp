# On-Behalf Ordering — piggyback on View-As selector

## 1. Session context (mirrors backdate)

Add helper `src/lib/onBehalfContext.ts`:

- `getOnBehalfContext()` → `{ userId, name } | null` read from `sessionStorage.on_behalf_context`.
- `setOnBehalfContext(ctx)` / `clearOnBehalfContext()`.
- Never activates when `userId === currentUser.id`.

## 2. `CompactMultiUserSelector` extensions

New optional props:
- `enableOnBehalf?: boolean` — turn behaviour on for pages that support it (MyRetailers, MyVisits).

Behaviour when `enableOnBehalf` is true:
- Read `operations_config.on_behalf_enabled` (one-shot query, cached) and `usePermissions().can('order_on_behalf', ...)`.
- If `on_behalf_enabled` is false → component behaves exactly as today.
- If `can('order_on_behalf','view_all')` is true → replace subordinate list with all active profiles from `profiles` (id, full_name, is_active=true), searchable via existing search input. Otherwise keep `useSubordinates()` list.
- When selection resolves to a single non-self user AND user has `can('order_on_behalf','create')`, call `setOnBehalfContext({ userId, name })`. Otherwise (self / multi / no perm) call `clearOnBehalfContext()`.
- Visible cue: small "On behalf" badge on the trigger button when context is active.

## 3. MyRetailers "Place order" gating

In `src/pages/MyRetailers.tsx`, the ShoppingCart button already navigates to `/order-entry?...` for phone orders.

- Pass `enableOnBehalf` to the selector.
- Compute `isViewingOther = selectedUserIds.length === 1 && selectedUserIds[0] !== user.id`.
- When `isViewingOther`:
  - If `on_behalf_enabled` AND `can('order_on_behalf','create')` → button visible and enabled; on click it also ensures `on_behalf_context` is set (defensive re-set from selection).
  - Otherwise → button hidden (or disabled with tooltip "You cannot place orders for other users").
- Self view unchanged.

MyVisits: same gating rule applied around the existing "start visit / create order" affordance for the selected other user. (No layout changes — only enable/disable the action.)

## 4. Cart consumes the context

In `src/pages/Cart.tsx`:

- Read `on_behalf_context` at mount (same pattern as `backdateCtx`).
- If present:
  - `orderData.user_id = ctx.userId` (target user — credited)
  - `orderData.placed_by_user_id = currentUserId` (logged-in user — enterer)
  - Show a `Badge` "On behalf of {ctx.name}" next to the existing Backdated badge in the summary card.
- If absent: unchanged (`user_id = currentUserId`, no `placed_by_user_id`).
- Apply to both order payload builders (regular + D-1) at lines ~1087 and ~2074.
- Clear `on_behalf_context` on successful submit and on manual cancel/back, alongside the existing backdate cleanup.

Server already enforces the permission + team check via `sync_order_with_items_v2`, so this UI layer is only about surfacing the context — invalid attempts fail server-side.

## 5. What stays unchanged

- Users without `order_on_behalf` still see the team View-As dropdown for read-only data browsing.
- Selecting "My Data" or multiple users clears the on-behalf context immediately — normal ordering resumes.
- Backdate flow is orthogonal; contexts can coexist (order both backdated AND on behalf).

## Technical notes

- Data sources: `operations_config` row `id = 1` field `on_behalf_enabled`; RPC `get_all_subordinates`; direct `profiles` select for `view_all` case (id, full_name, is_active).
- Permission hook: existing `usePermissions()` with `object_name = 'order_on_behalf'`.
- Storage key: `on_behalf_context` (JSON: `{ userId, name }`), session-scoped.
- No DB changes. No new routes. No new pages.

## Files touched

- new `src/lib/onBehalfContext.ts`
- edit `src/components/CompactMultiUserSelector.tsx`
- edit `src/pages/MyRetailers.tsx`
- edit `src/pages/MyVisits.tsx`
- edit `src/pages/Cart.tsx`
