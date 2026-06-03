## Plan: Resolve Krishnapura duplicate by renaming older beat

Both active "Krishnapura" beats are owned by **Vikhyath** (user `206ae2fa-…`). To unblock the per-user partial unique index without losing data, rename the older one and append the owner's name for clarity.

### 1. Migration (single `supabase--migration` call)

```sql
-- Step 1: Rename the older Krishnapura beat (Feb 2026) to disambiguate
UPDATE public.beats
SET beat_name = 'Krishnapura (Vikhyath - Old)'
WHERE beat_id = 'beat_1779082704647_okhsc9d6o'
  AND beat_name = 'Krishnapura'
  AND is_active = true;

-- Step 2: Create the per-user partial unique index (previously failed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_beats_unique_name_user
  ON public.beats (LOWER(beat_name), user_id)
  WHERE is_active = true AND distributor_id IS NULL;
```

The distributor-scoped index `idx_beats_unique_name_distributor` already exists from the previous run — not recreated.

### 2. Verification

- Re-query `beats` for `beat_name ILIKE 'krishnapura%'` to confirm two distinct names.
- Confirm `pg_indexes` lists both `idx_beats_unique_name_distributor` and `idx_beats_unique_name_user`.

### 3. No code changes

Scenario 9 UI + service code is already implemented. This plan only resolves the data conflict and adds the second DB safety-net index.

### Notes / assumptions

- Renaming is non-destructive — all FKs reference `beat_id` (text), not `beat_name`, so retailers, visits, orders, coverage, etc. remain intact.
- Suffix format `"<original> (<owner> - Old)"` is human-readable and matches your "rename with user name created by user" instruction. If you prefer a different suffix (e.g. just `"Krishnapura - Vikhyath"` or include creation date), tell me before approving.
