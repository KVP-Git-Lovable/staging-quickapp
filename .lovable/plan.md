Implementation plan for Messages 9, 10, and 11.

---

## Part A — `TransferOwnershipModal` (Message 9)

### New file: `src/components/TransferOwnershipModal.tsx`

Props:
```ts
{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beat: { id: string; beat_id: string; beat_name: string; retailer_count: number };
  currentUserId: string;
  onSuccess: () => void; // parent removes beat from list / reloads
}
```

UI (shadcn `Dialog`):
- Title: "Transfer Beat — {beat_name}".
- Destructive alert banner (Alert variant `destructive` or amber tinted via semantic tokens): "This is permanent. Cannot be auto-reversed."
- User search: same debounced `profiles` (`full_name`/`name` ilike) pattern used in ShareBeatModal — exclude `currentUserId`. Avatar + selected chip with X.
- "This will" bullet list (rendered after a user is selected):
  - Move **{beat_name}** to **{selectedUser.name}**
  - Reassign all **{retailer_count}** retailers to **{selectedUser.name}**
  - Record full ownership history
  - Your past orders and visits remain attributed to you
- Reason: `Input` (required).
- Footer: `Cancel` + `Transfer Ownership` (destructive style; disabled until user + reason; spinner while submitting).

Confirm action:
- `await beatService.transferBeatOwnership(beat.id, selectedUser.user_id, currentUserId, reason.trim())`
- `toast.success(\`Beat transferred to ${name}\`)`, call `onSuccess()`, close.

### Wire-up in `src/pages/MyBeats.tsx`
- Add state `transferBeat: {id, beat_id, name, retailer_count} | null`.
- Replace `onTransferOwnership` toast at line ~1789 with `setTransferBeat({...})`.
- Render modal near other beat dialogs; `onSuccess` calls `loadBeats()` and removes the beat locally (`setBeats(prev => prev.filter(b => b.id !== transferBeat.id))`).

---

## Part B — `BeatHistoryDrawer` (Message 10)

### New file: `src/components/BeatHistoryDrawer.tsx`

Props:
```ts
{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beat: { id: string; beat_id: string; beat_name: string };
}
```

Use shadcn `Sheet` (`side="right"`, `max-w-lg`, scrollable body).

On open: `const history = await beatService.getBeatHistory(beat.id)` → loading spinner while pending.

Body: 3-tab `<Tabs>` (`ownership` | `retailers` | `coverage`).

1. **Ownership** — render `history.ownership` rows:
   - `format(transferred_at, 'PP p')`
   - `old_owner_name → new_owner_name` (badge style)
   - Reason text (muted)
   - "By {transferred_by}" — resolve to a name via a single batched `profiles` lookup of all unique user ids across the three lists (one query when drawer opens).
2. **Retailer transfers** — `history.retailerTransfers`:
   - `retailer_name`, `from_beat_name → to_beat_name`, `format(transferred_at, 'PP')`, "By {name}".
3. **Coverage log** — `history.coverage`:
   - Covered by (`coverage_user_id` → name)
   - `start_date → end_date`
   - `reason`
   - Status badge: `is_active && end_date >= today ? 'Active' : 'Ended'`
   - Sorted desc by `created_at` (already from service).

Empty state per tab: muted "No history yet."

### Wire-up in `MyBeats.tsx`
- Add state `historyBeat`. Replace `onHistory` toast (line ~1791) with `setHistoryBeat({...})`. Render drawer.

---

## Part C — Order snapshots (Message 11)

The app has one central order-submission helper (`submitOrderWithOfflineSupport` in `src/utils/offlineOrderUtils.ts`) used by all 4 caller sites (`Cart.tsx` ×2, `CounterSales.tsx` ×2). Two additional direct supabase order inserts live in `useOfflineSync.ts` (lines 619 & 994) for queued-order replay.

### Central injection in `submitOrderWithOfflineSupport`
Right before constructing `normalizedOrder` (around line 40), if `orderData.beat_name_snapshot` is undefined OR `orderData.owner_id_snapshot` is undefined AND `orderData.retailer_id` exists:

```ts
let beat_name_snapshot = orderData.beat_name_snapshot ?? null;
let owner_id_snapshot  = orderData.owner_id_snapshot  ?? null;

if (orderData.retailer_id && (beat_name_snapshot === null || owner_id_snapshot === null)) {
  try {
    // Try IDB cache first for offline safety
    const cachedRetailers = await offlineStorage.getAll<any>(STORES.RETAILERS).catch(() => []);
    const cachedRetailer = cachedRetailers.find((r: any) => r.id === orderData.retailer_id);
    let beatTextId  = cachedRetailer?.beat_id ?? null;
    let beatName    = cachedRetailer?.beat_name ?? null;
    let ownerId     = null as string | null;

    if (!beatTextId) {
      const { data: r } = await supabase
        .from('retailers').select('beat_id, beat_name')
        .eq('id', orderData.retailer_id).maybeSingle();
      beatTextId = r?.beat_id ?? null;
      beatName   = r?.beat_name ?? null;
    }
    if (beatTextId) {
      const { data: b } = await supabase
        .from('beats').select('owner_id, user_id, beat_name')
        .eq('beat_id', beatTextId).maybeSingle();
      ownerId  = b?.owner_id ?? b?.user_id ?? null;
      beatName = beatName ?? b?.beat_name ?? null;
    }
    beat_name_snapshot = beat_name_snapshot ?? beatName;
    owner_id_snapshot  = owner_id_snapshot  ?? ownerId;
  } catch { /* keep nulls */ }
}

// inject into orderData prior to normalizedOrder build
orderData = { ...orderData, beat_name_snapshot, owner_id_snapshot };
```

This guarantees every order written via the helper carries both snapshots.

### Queue-sync direct insert paths (`src/hooks/useOfflineSync.ts`)
Both insert sites operate on data that was queued earlier. Add a thin enrichment helper at module scope:

```ts
async function ensureOrderSnapshots(order: any) {
  if (order.beat_name_snapshot !== undefined && order.owner_id_snapshot !== undefined) return order;
  // reuse same lookup logic as central injection (extract into shared util)
  return enrichWithBeatSnapshots(order);
}
```

Refactor: extract the lookup body from `submitOrderWithOfflineSupport` into a shared exported function `enrichWithBeatSnapshots(order)` inside `offlineOrderUtils.ts`. Call it from both `useOfflineSync.ts` insert sites just before `.insert(data)` / `.insert({...})`.

### Caller-side (optional, no code change needed)
No edits required to `Cart.tsx` / `CounterSales.tsx` since central injection covers them. Documented behavior: callers may pass `beat_name_snapshot`/`owner_id_snapshot` explicitly and it takes precedence; otherwise auto-derived from retailer→beat.

### Idempotency / immutability
- Fields set only when missing (`?? null` check).
- No code path performs `UPDATE` on these columns — confirmed by ripgrep scope (no `beat_name_snapshot` writes elsewhere).
- `seedLoyaltyData.ts` is excluded — seed/demo data only.

---

## Out of scope
- No `beatService.ts` changes.
- No DB migration, RLS, or column additions (both snapshot columns already exist).
- No `BeatCard.tsx` permission matrix or layout changes.
- No edits to `types.ts`.
- No changes to order analytics / reporting consumers (they already read whatever is present).

## UI / design
- Semantic tokens only.
- Calendar in any picker uses `pointer-events-auto`.
- Sheet drawer width `sm:max-w-lg`, full-height scrollable.

## Verification
After build:
1. Confirm Cart and CounterSales submit a sample order; `orders` row contains non-null `beat_name_snapshot` and `owner_id_snapshot` (via Supabase read-query).
2. Confirm offline queue replay also stamps snapshots (queue an order with no internet → reconnect → verify columns populated).
3. Open `BeatHistoryDrawer` on a beat with prior transfers/coverage; tabs render data or empty state.
4. Open `TransferOwnershipModal`, transfer to another user; verify `beats.owner_id` and `beats.user_id` updated and `beat_ownership_history` row written.
