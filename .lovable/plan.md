## Goal
Make every "Delete Beat" entry point honor `can_delete_beat`:
- Empty beats are hard-deleted via `beatLifecycle.deletePermanent`.
- Beats with history surface a clear, non-browser message and stay intact (user must Deactivate separately).

## Fix 1 — `src/pages/BeatDetail.tsx`

### `handleDeleteClick` (lines 511–568)
Before any other work, call `can_delete_beat`:
```ts
const { data: check, error } = await supabase
  .rpc('can_delete_beat' as any, { p_beat_id: beatData.beat_id });
if (error) { toast.error('Could not check beat data. Please try again.'); return; }
```
- If `!check.deletable`: show `window.confirm` listing `check.reasons`, offering deactivation. On confirm, set `is_active=false`, `deactivated_at=now()`, `deactivated_by=user.id`, toast success, `navigate('/my-beats')`. Return without opening the delete dialog.
- If `check.deletable`: keep the existing logic that fetches `availableBeats`, `availableUsers`, and impact counts (these will be zero), then `setIsDeleteDialogOpen(true)`.

### `handleConfirmDelete` (line 658–661)
Replace the soft-delete block:
```ts
await supabase.from('beats').update({ is_active: false }).eq('beat_id', beatData.beat_id);
```
with:
```ts
const deleted = await beatLifecycle.deletePermanent(beatData.beat_id, beatData.beat_name);
if (!deleted) throw new Error('Failed to permanently delete beat');
```
Wire `useBeatLifecycle()` at the top of the component (the hook is already used elsewhere; import if missing). Audit-log insert and recycle-bin call stay unchanged.

## Fix 2 — `src/components/BeatCard.tsx` (line 114)
Drop the `retailer_count === 0` clause from `showDelete`; let the runtime `canDelete` check decide:
```ts
const showDelete = !isActive && !!onDelete && can('action_beat_delete', 'delete');
```

## Fix 3 — `src/pages/MyBeats.tsx` `handleDeleteBeatClick` (lines 1050–1063)
Replace the `window.confirm` + deactivate fallback with a clear toast and exit:
```ts
if (!check.deletable) {
  toast.error(
    `"${beatName}" cannot be permanently deleted — it has historical records (${check.reasons.join(', ')}). Use Deactivate to hide it instead.`,
    { duration: 6000 }
  );
  return;
}
```
Everything below (counts fetch, `openDeleteDialog`) stays. The existing soft/hard branch in `handleConfirmDeleteBeat` (from the prior fix) already calls `deletePermanent` when `deletabilityMap[id]` is true.

## No DB changes
`can_delete_beat` and `delete_beat_permanent` RPCs already exist and were patched in the prior migration.

## Verification
- Scenario A — Inactive `test2` (empty): ⋮ → Delete Beat → confirm → row removed from `beats`.
- Scenario B — Inactive `Nagasaki` (7 retailers, orders, visits): ⋮ → Delete Beat → red toast lists reasons; row remains in DB.
- Scenario C — `BeatDetail` for a beat with orders: Delete button → confirm dialog explains history, offers deactivate; Yes deactivates, No is a no-op.
- Scenario D — `BeatDetail` for an empty beat: Delete dialog opens, confirm permanently removes the row.
