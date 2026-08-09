-- Lovable's zoho-sync-customers (v17) builds its batch from
--   zoho_sync_readiness WHERE is_ready = true
-- and ignores retailers.zoho_sync_status entirely, so parking rows as 'on_hold'
-- does not limit a run. The view is the only lever that actually gates a batch.

ALTER TABLE public.retailers
  ADD COLUMN IF NOT EXISTS zoho_sync_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.retailers.zoho_sync_enabled IS
  'Opt-in gate for the Zoho Books sync. zoho_sync_readiness.is_ready is false '
  'unless this is true, which caps any batch run to the selected retailers. '
  'Set true for all retailers when the pilot is signed off.';

UPDATE public.retailers SET zoho_sync_enabled = false;
UPDATE public.retailers SET zoho_sync_enabled = true
WHERE id IN ('ca55824f-d3a8-4caf-a0cd-33493502a377',   -- Aarogya Health Foods
             '50d94213-6df1-4e50-a1e5-e8c1bd0c3fe7');  -- Ajantha Cold Storage

-- Column ORDER must stay identical to the existing view, so append the new
-- column at the end rather than inserting it mid-list.
DROP VIEW IF EXISTS public.zoho_sync_readiness;

CREATE VIEW public.zoho_sync_readiness
WITH (security_invoker = on) AS
WITH dup AS (
  SELECT lower(btrim(name)) AS k FROM public.retailers
  GROUP BY 1 HAVING count(*) > 1)
SELECT r.id, r.name, r.state, r.city, r.pincode, r.phone, r.email,
       r.gst_number, r.currency, r.zoho_contact_id, r.zoho_sync_status,
       CASE
         WHEN NOT r.zoho_sync_enabled THEN 'not enabled for sync (pilot gate)'
         WHEN r.name IS NULL OR btrim(r.name)='' THEN 'missing name'
         WHEN r.state IS NULL OR btrim(r.state)='' THEN 'missing state / place_of_supply'
         WHEN d.k IS NOT NULL THEN 'duplicate contact name'
         WHEN r.gst_number IS NOT NULL AND btrim(r.gst_number) <> ''
              AND length(btrim(r.gst_number)) <> 15 THEN 'invalid GST format'
         ELSE NULL
       END AS blocker,
       (r.zoho_sync_enabled
        AND r.name IS NOT NULL AND btrim(r.name) <> ''
        AND r.state IS NOT NULL AND btrim(r.state) <> ''
        AND d.k IS NULL
        AND (r.gst_number IS NULL OR btrim(r.gst_number) = ''
             OR length(btrim(r.gst_number)) = 15)) AS is_ready,
       CASE WHEN r.gst_number IS NOT NULL AND length(btrim(r.gst_number))=15
            THEN 'business_gst' ELSE 'consumer' END AS gst_treatment,
       COALESCE(r.currency,'INR') AS currency_code,
       r.zoho_sync_enabled
FROM public.retailers r
LEFT JOIN dup d ON d.k = lower(btrim(r.name));

GRANT SELECT ON public.zoho_sync_readiness TO authenticated;