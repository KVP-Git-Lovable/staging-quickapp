-- 1) Add a flag to mark user-derived placeholder distributor rows
ALTER TABLE public.distributors
  ADD COLUMN IF NOT EXISTS is_placeholder BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_distributors_is_placeholder
  ON public.distributors(is_placeholder);

-- 2) Restore real distributor BHARATH BEVERAGES from recycle bin onto the existing id
UPDATE public.distributors d
SET
  name             = COALESCE(rb.record_data->>'name', d.name),
  contact_person   = COALESCE(rb.record_data->>'contact_person', d.contact_person),
  phone            = COALESCE(rb.record_data->>'phone', d.phone),
  email            = NULLIF(rb.record_data->>'email', ''),
  address          = COALESCE(rb.record_data->>'address', d.address),
  gst_number       = COALESCE(rb.record_data->>'gst_number', d.gst_number),
  region_coverage  = COALESCE(rb.record_data->>'region_coverage', d.region_coverage),
  parent_id        = NULLIF(rb.record_data->>'parent_id','')::uuid,
  distribution_level = COALESCE(rb.record_data->>'distribution_level', d.distribution_level),
  distributor_status = COALESCE(rb.record_data->>'distributor_status', d.distributor_status),
  partnership_status = COALESCE(rb.record_data->>'partnership_status', d.partnership_status),
  status           = COALESCE(rb.record_data->>'status', d.status),
  is_placeholder   = false,
  updated_at       = now()
FROM public.recycle_bin rb
WHERE rb.original_table = 'distributors'
  AND rb.original_id::uuid = d.id
  AND d.id = '3049f21b-95a1-436e-a433-483c9c465481';

-- Remove the restored item from recycle bin so it isn't restored twice
DELETE FROM public.recycle_bin
WHERE original_table = 'distributors'
  AND original_id::uuid = '3049f21b-95a1-436e-a433-483c9c465481';

-- 3) Mark the remaining user-derived placeholder rows (created by the bad backfill).
--    Identify them by: they share their id with a distributor_users row AND their
--    name/email exactly matches one of that distributor's users (case-insensitive).
--    Their `name` is replaced with a neutral placeholder so the UI never shows the
--    user's name as the distributor business name. Linked orders/users are NOT touched.
UPDATE public.distributors d
SET
  is_placeholder = true,
  name           = 'Unassigned Distributor (' || substr(d.id::text, 1, 8) || ')',
  contact_person = NULL,
  email          = NULL,
  phone          = NULL,
  updated_at     = now()
WHERE d.created_at = '2026-06-17 08:37:18.023085+00'
  AND d.id <> '3049f21b-95a1-436e-a433-483c9c465481'
  AND EXISTS (
    SELECT 1 FROM public.distributor_users du
    WHERE du.distributor_id = d.id
      AND (
        lower(du.full_name) = lower(d.name)
        OR lower(du.email)  = lower(COALESCE(d.email, ''))
      )
  );