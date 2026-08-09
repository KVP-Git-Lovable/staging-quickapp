CREATE OR REPLACE VIEW public.zoho_sync_readiness
WITH (security_invoker = on) AS
WITH dup AS (
  SELECT lower(btrim(name)) AS k FROM public.retailers
  GROUP BY 1 HAVING count(*) > 1)
SELECT r.id, r.name, r.state, r.city, r.pincode, r.phone, r.email,
       r.gst_number, r.currency, r.zoho_contact_id, r.zoho_sync_status,
       CASE
         WHEN r.name IS NULL OR btrim(r.name)='' THEN 'missing name'
         WHEN r.state IS NULL OR btrim(r.state)='' THEN 'missing state / place_of_supply'
         WHEN d.k IS NOT NULL THEN 'duplicate contact name'
         WHEN r.gst_number IS NOT NULL AND btrim(r.gst_number) <> ''
              AND length(btrim(r.gst_number)) <> 15 THEN 'invalid GST format'
         ELSE NULL
       END AS blocker,
       (CASE
         WHEN r.name IS NULL OR btrim(r.name)='' THEN false
         WHEN r.state IS NULL OR btrim(r.state)='' THEN false
         WHEN d.k IS NOT NULL THEN false
         WHEN r.gst_number IS NOT NULL AND btrim(r.gst_number) <> ''
              AND length(btrim(r.gst_number)) <> 15 THEN false
         ELSE true END) AS is_ready,
       CASE WHEN r.gst_number IS NOT NULL AND length(btrim(r.gst_number))=15
            THEN 'business_gst' ELSE 'consumer' END AS gst_treatment,
       COALESCE(r.currency,'INR') AS currency_code
FROM public.retailers r
LEFT JOIN dup d ON d.k = lower(btrim(r.name));

GRANT SELECT ON public.zoho_sync_readiness TO authenticated;