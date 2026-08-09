-- Previously "missing state" hard-blocked sync, on the assumption Zoho needs
-- place_of_supply (GST). But this Zoho org has GST disabled, so the sync
-- function never actually sends place_of_supply/gst_treatment to Zoho at all
-- (see buildContactPayload's `if (gstEnabled)` guard) — the block was
-- unnecessary. Removing it so retailers with no state/city/pincode can still
-- sync. If GST is ever enabled on the org later and Zoho starts requiring
-- place_of_supply, missing-state contacts will surface as a real "failed"
-- sync (visible + actionable) instead of just failing at Zoho's end silently.
CREATE OR REPLACE VIEW public.zoho_sync_readiness AS
WITH dup AS (
  SELECT lower(btrim(retailers.name)) AS k
  FROM retailers
  GROUP BY lower(btrim(retailers.name))
  HAVING count(*) > 1
)
SELECT
  r.id,
  r.name,
  r.state,
  r.city,
  r.pincode,
  r.phone,
  r.email,
  r.gst_number,
  r.currency,
  r.zoho_contact_id,
  r.zoho_sync_status,
  CASE
    WHEN NOT r.zoho_sync_enabled THEN 'not enabled for sync (pilot gate)'
    WHEN r.name IS NULL OR btrim(r.name) = '' THEN 'missing name'
    WHEN d.k IS NOT NULL THEN 'duplicate contact name'
    WHEN r.gst_number IS NOT NULL AND btrim(r.gst_number) <> '' AND length(btrim(r.gst_number)) <> 15 THEN 'invalid GST format'
    ELSE NULL
  END AS blocker,
  (
    r.zoho_sync_enabled
    AND r.name IS NOT NULL AND btrim(r.name) <> ''
    AND d.k IS NULL
    AND (r.gst_number IS NULL OR btrim(r.gst_number) = '' OR length(btrim(r.gst_number)) = 15)
  ) AS is_ready,
  CASE
    WHEN r.gst_number IS NOT NULL AND length(btrim(r.gst_number)) = 15 THEN 'business_gst'
    ELSE 'consumer'
  END AS gst_treatment,
  COALESCE(r.currency, 'INR') AS currency_code,
  r.zoho_sync_enabled
FROM retailers r
LEFT JOIN dup d ON d.k = lower(btrim(r.name));