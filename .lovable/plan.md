## Goal

Make the database the single source of truth for `retailers.beat_name`. When a row in `beats` is renamed, a trigger updates every retailer with that `beat_id` — across all users — so multi-owner beats stay consistent without relying on frontend code.

## Impact analysis (tables that store `beat_name`)

A scan of the schema and the codebase shows seven tables carry a `beat_name` column:


| Table                                | Role                                  | Should trigger sync it?                                                                          |
| ------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `beats`                              | source of truth                       | n/a (this is what changes)                                                                       |
| `retailers`                          | live operational data                 | **Yes** — the bug you described                                                                  |
| `beat_allowances`                    | per-user current allowance row        | No (out of scope for this fix; current row, but EditBeatModal already keeps it in sync per user) |
| `beat_plans`                         | daily plan rows (historical + future) | No — keep historical names as the snapshot of that plan day                                      |
| `retailer_beat_assignments`          | assignment history                    | No — historical                                                                                  |
| `joint_sales_sessions`               | completed session snapshots           | No — historical                                                                                  |
| `user_business_plan_territory_beats` | business-plan snapshot rows           | No — plan snapshot                                                                               |


So the trigger is intentionally scoped to `**retailers` only**. This matches your stated requirement ("history table should NOT update") and avoids rewriting historical snapshots elsewhere.

Code paths verified to be safe after this change:

- `EditBeatModal.tsx` — currently does the user-scoped `UPDATE retailers SET beat_name … WHERE beat_id=? AND user_id=?` (line 351–355). After the trigger ships, this block becomes redundant and is removed.
- `MassEditBeatsModal.tsx`, `BeatTransferModal.tsx`, `TransferRetailerBeatModal.tsx`, `MassBeatTransfer.tsx`, `AddRetailerInlineToBeat.tsx`, `CreateNewVisitModal.tsx`, `BulkImportRetailersModal.tsx` — these set `beat_id` + `beat_name` together when **moving** a retailer between beats (not renaming a beat). They keep working unchanged; the trigger only fires on `beats.beat_name` updates.
- Read-side consumers (`MyBeats`, `MyRetailers`, analytics, packing list, visits, distributor pages, etc.) just read `retailers.beat_name`. They benefit automatically.
- `retailer_beat_transfer_history` already snapshots `from_beat_name` / `to_beat_name` at write time — unaffected.

## 1. Migration: trigger on `beats`

```sql
-- Function: when a beat is renamed, propagate the new name to every retailer
-- that points at it, regardless of which user owns the retailer.
CREATE OR REPLACE FUNCTION public.sync_retailers_beat_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.beat_name IS DISTINCT FROM OLD.beat_name THEN
    UPDATE public.retailers
       SET beat_name = NEW.beat_name,
     WHERE beat_id = NEW.beat_id
       AND beat_name IS DISTINCT FROM NEW.beat_name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_retailers_beat_name ON public.beats;
CREATE TRIGGER trg_sync_retailers_beat_name
AFTER UPDATE OF beat_name ON public.beats
FOR EACH ROW
EXECUTE FUNCTION public.sync_retailers_beat_name();
```

Notes:

- `SECURITY DEFINER` so the cross-user `UPDATE` bypasses RLS — the rename action itself is already authorized by the policy on `beats`.
- `IS DISTINCT FROM` guards against no-op writes and infinite loops.
- One-time backfill is included to fix retailers whose names drifted before the trigger existed:

```sql
UPDATE public.retailers r
   SET beat_name = b.beat_name,
       updated_at = now()
  FROM public.beats b
 WHERE r.beat_id = b.beat_id
   AND r.beat_name IS DISTINCT FROM b.beat_name;
```

## 2. Frontend cleanup — `src/components/EditBeatModal.tsx`

Remove the redundant retailer-name sync block (lines 350–357):

```ts
// Update beat name for all current retailers in this beat
const { error: updateNameError } = await supabase
  .from('retailers')
  .update({ beat_name: beatName.trim() })
  .eq('beat_id', beat.id)
  .eq('user_id', user.id);
if (updateNameError) throw updateNameError;
```

Reason: after the trigger ships this is duplicate work and reintroduces the user-scoped bug. The earlier `beats` update (line 273) now propagates automatically.

The "remove from beat" and "add to beat" blocks (lines 322–348) **stay** — they handle membership changes (`beat_id`), not renames.

No other files need code changes.  
  
Add an audit entry when a Beat is renamed.

Example:

```

```

```
BEAT_RENAMED

Beat ID: beat_123

Old Name:
North Zone

New Name:
North Territory

Changed By:
Admin

Changed At:
01-Jun-2026 10:15 AM
```

Since you already have:

```

```

```
beats_audit_trg
```

this may already happen, but verify it.

## 3. Verification steps

1. Apply the migration and confirm the trigger exists (`SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.beats'::regclass`).
2. Rename a beat owned by multiple users via `EditBeatModal`, then query `SELECT DISTINCT beat_name FROM retailers WHERE beat_id = ?` — should return exactly one row with the new name.
3. Spot-check that `beat_plans`, `joint_sales_sessions`, and `retailer_beat_transfer_history` still hold the **old** name for prior rows (historical integrity preserved).
4. Run an existing beat **transfer** to confirm move flows still work (no regression).

## Out of scope (call out, do not change now)

- Syncing `beat_allowances.beat_name`, `beat_plans.beat_name`, `user_business_plan_territory_beats.beat_name` via trigger — can be added later if you want full denormalized consistency. Today the codebase treats them as snapshots.
- Removing the `MassEditBeatsModal.tsx` legacy file.