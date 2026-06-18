## Problem

In the My Retailers list (Dharmesh's user), some rows show a beat-id slug like `beat_1781174542723_t9guh0881` in the Beat column instead of the human beat name (e.g. "Nazarbad & Jayalakshmipuram").

## Root cause

`retailers.beat_name` is a denormalized column. For most rows it correctly stores the beat name, but for some rows (e.g. Amruth Store, Anand Stores) it stores the raw beat_id slug — so the UI's `r.beat_name || r.beat_id` fallback shows the slug. The `beats` table itself has the correct name; only the denormalized snapshot is wrong.

Confirmed in DB:
- `Anand Stores` → `beat_name = "beat_1781174542723_t9guh0881"` (wrong)
- `beats` row with that id → `beat_name = "Nazarbad & Jayalakshmipuram"` (correct)

## Fix (3 parts)

**1. Data backfill (migration)**
Update every `retailers` row where `beat_name` looks like a beat-id slug (starts with `beat_` and matches the id pattern) by joining to `beats.beat_name`:
```sql
UPDATE retailers r
SET beat_name = b.beat_name
FROM beats b
WHERE r.beat_id = b.beat_id
  AND (r.beat_name IS NULL OR r.beat_name ~ '^beat_[0-9]+_[a-z0-9]+$' OR r.beat_name = r.beat_id);
```

**2. Keep it in sync going forward (trigger)**
Add a `BEFORE INSERT OR UPDATE OF beat_id` trigger on `retailers` that auto-fills `beat_name` from `beats` whenever `beat_id` changes, so this can't drift again. Also a `BEFORE UPDATE OF beat_name` trigger on `beats` that propagates renames to all child retailers.

**3. UI safety net (`src/pages/MyRetailers.tsx`)**
Change the two display sites (lines 1031 and 1118) from `r.beat_name || r.beat_id` to a helper that:
- Hides anything matching the `beat_<digits>_<slug>` pattern.
- Falls back to a beat-id → name lookup map built from the `beats` table (fetched once per page load alongside retailers).
- Shows "Unassigned" if no name can be resolved (instead of leaking the slug).

This way even if a stray row slips through the trigger, the UI never displays the raw id.

## Scope

- Only the My Retailers page UI + the denormalization triggers/backfill. No change to how retailers are written, no schema rename.
- After the migration runs, Dharmesh's list will show real beat names; the trigger prevents regression.

## Out of scope (ask if wanted)

- Same audit/backfill for other tables that snapshot `beat_name` (e.g. `visits`, `orders`, `retailer_beat_assignments`) — happy to extend if you want a full sweep.
