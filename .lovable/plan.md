## Goal

Apply the 4 DB patches (A-D), the `beatService.transferBeatOwnership` patch, the ShareBeatModal OPERATIONAL option, and the MyBeats/BeatCard OPERATIONAL action-menu + badge updates. Add the `cleanup-expired-coverage` Edge Function.

Confirmed current DB state (from a live check):
- `beat_user_access` CHECK constraint = `('OWNER','CO_OWNER','VIEW_ONLY','COVERAGE')` — missing OPERATIONAL.
- `beat_ownership_history` columns = id, beat_id, beat_name, old_owner_id, old_owner_name, new_owner_id, new_owner_name, transferred_by, transferred_at, reason, created_at — missing `effective_date`.
- `retailer_owner_history` does not exist.
- `cleanup_expired_coverage()` does not exist.

## 1. Single DB migration (Patches A + B + C + D)

```sql
-- A: add OPERATIONAL to beat_user_access.access_type
ALTER TABLE public.beat_user_access DROP CONSTRAINT IF EXISTS beat_user_access_access_type_check;
ALTER TABLE public.beat_user_access
  ADD CONSTRAINT beat_user_access_access_type_check
  CHECK (access_type IN ('OWNER','CO_OWNER','VIEW_ONLY','COVERAGE','OPERATIONAL'));

-- B: effective_date on beat_ownership_history
ALTER TABLE public.beat_ownership_history
  ADD COLUMN IF NOT EXISTS effective_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- C: retailer_owner_history (+ indexes, GRANTs, RLS, policies)
CREATE TABLE IF NOT EXISTS public.retailer_owner_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id UUID NOT NULL,
  retailer_name TEXT,
  old_user_id UUID NOT NULL,
  old_user_name TEXT,
  new_user_id UUID NOT NULL,
  new_user_name TEXT,
  changed_by UUID NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT,
  beat_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_roh_retailer_id ON public.retailer_owner_history (retailer_id);
CREATE INDEX IF NOT EXISTS idx_roh_old_user ON public.retailer_owner_history (old_user_id);
CREATE INDEX IF NOT EXISTS idx_roh_new_user ON public.retailer_owner_history (new_user_id);

GRANT SELECT, INSERT ON public.retailer_owner_history TO authenticated;
GRANT ALL ON public.retailer_owner_history TO service_role;

ALTER TABLE public.retailer_owner_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roh_select" ON public.retailer_owner_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "roh_insert" ON public.retailer_owner_history FOR INSERT TO authenticated WITH CHECK (true);

-- D: cleanup_expired_coverage
CREATE OR REPLACE FUNCTION public.cleanup_expired_coverage()
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE beat_coverage_assignments
     SET is_active = false, updated_at = now()
   WHERE is_active = true AND end_date < CURRENT_DATE;

  UPDATE beat_user_access
     SET is_active = false, updated_at = now()
   WHERE is_active = true AND effective_to IS NOT NULL AND effective_to < now();

  UPDATE coverage_permission_assignments
     SET is_active = false
   WHERE is_active = true AND end_date < CURRENT_DATE;
$$;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_coverage() TO authenticated, service_role;
```

## 2. Edge Function `supabase/functions/cleanup-expired-coverage/index.ts`

- CORS + OPTIONS handler.
- Uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to create an admin client.
- Calls `await admin.rpc('cleanup_expired_coverage')`.
- Returns `{ ok: true }`.
- Inform user they can schedule it daily via the Dashboard (we do not auto-schedule via pg_cron in this patch).

## 3. `src/services/beatService.ts`

- Extend `AccessType`: `'OWNED' | 'CO_OWNER' | 'OPERATIONAL' | 'VIEW_ONLY' | 'COVERAGE'`.
- Update `grantBeatAccess` / `revokeBeatAccess` parameter signatures (they already use `Exclude<AccessType,'OWNED'>` so OPERATIONAL is automatically allowed).
- Extend `getBeatsForUser` `.in('access_type', ['CO_OWNER','VIEW_ONLY','OPERATIONAL'])` (line 471) for sharedWithMe count.
- `transferBeatOwnership(beatId, newOwnerId, transferredBy, reason, effectiveDate?: string)`:
  - Resolve `effectiveDate` → `CURRENT_DATE` if absent; pass to `beat_ownership_history.effective_date`.
  - Fetch retailers for the beat (id, retailer_name) BEFORE the user_id update.
  - Resolve `currentOwnerName` from `beat.owner_name`, and `newOwnerName` (already resolved).
  - After the existing retailers `user_id` update, insert one `retailer_owner_history` row per retailer (batch insert) with old/new user ids+names, changed_by, reason, beat_id (TEXT).
  - No future-date scheduling logic — record is written immediately; UI may show "pending" later but we don't gate transfer execution on `effective_date`.

## 4. `src/components/ShareBeatModal.tsx`

- `type Access = "CO_OWNER" | "OPERATIONAL" | "VIEW_ONLY"`.
- Add a third RadioGroupItem `OPERATIONAL` with label "Operational" and description "Can visit, take orders, update retailers — cannot edit beat structure".
- `.in("access_type", ["CO_OWNER","OPERATIONAL","VIEW_ONLY"])` when loading shares.
- Row badge label map: `CO_OWNER`→"Co-owner", `OPERATIONAL`→"Operational", `VIEW_ONLY`→"View only".

## 5. `src/components/BeatCard.tsx`

- Extend `BeatAccessType` to include `'OPERATIONAL'`.
- Add `accessBadge` case: `OPERATIONAL` → blue badge "Operational".
- `COVERAGE` badge → "Covering until {format(coverageEndDate,'PP')}" when `coverageEndDate` present, else "Covering".
- Visibility for OPERATIONAL active: only `showHistory` (gated by existing permission key). Confirm `showEdit` excludes OPERATIONAL (currently `isOwner || isCoOwner` — already excludes), and Share/Coverage/Transfer/Deactivate/Clone require `isOwner` — already excludes.

## 6. `src/pages/MyBeats.tsx`

- Widen the inline union at line 1279 to include `'OPERATIONAL'`.
- `accessTab === 'shared'` filter (line 1293): include OPERATIONAL alongside CO_OWNER / VIEW_ONLY.

## Out of scope

- No pg_cron scheduling (Dashboard scheduling instead).
- No future-date scheduling UI / "pending transfer" badge (rule says do not build it yet).
- No changes to `EditBeatModal`.
- No changes to RLS on existing tables beyond what's listed.
- No changes to `useOfflineRetailers` / Message 12 work.
