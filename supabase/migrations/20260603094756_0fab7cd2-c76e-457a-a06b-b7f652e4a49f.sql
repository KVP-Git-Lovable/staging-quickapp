-- A: add OPERATIONAL to beat_user_access.access_type
ALTER TABLE public.beat_user_access DROP CONSTRAINT IF EXISTS beat_user_access_access_type_check;
ALTER TABLE public.beat_user_access
  ADD CONSTRAINT beat_user_access_access_type_check
  CHECK (access_type IN ('OWNER','CO_OWNER','VIEW_ONLY','COVERAGE','OPERATIONAL'));

-- B: effective_date on beat_ownership_history
ALTER TABLE public.beat_ownership_history
  ADD COLUMN IF NOT EXISTS effective_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- C: retailer_owner_history
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
DROP POLICY IF EXISTS "roh_select" ON public.retailer_owner_history;
DROP POLICY IF EXISTS "roh_insert" ON public.retailer_owner_history;
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