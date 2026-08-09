-- Zoho Books customer sync: additive schema only. Nothing dropped or overwritten.

ALTER TABLE public.retailers
  ADD COLUMN IF NOT EXISTS email             text,
  ADD COLUMN IF NOT EXISTS city              text,
  ADD COLUMN IF NOT EXISTS pincode           text,
  ADD COLUMN IF NOT EXISTS pan_no            text,
  ADD COLUMN IF NOT EXISTS legal_name        text,
  ADD COLUMN IF NOT EXISTS country           text DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS zoho_contact_id   text,
  ADD COLUMN IF NOT EXISTS zoho_synced_at    timestamptz,
  ADD COLUMN IF NOT EXISTS zoho_sync_status  text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS zoho_sync_error   text;

CREATE INDEX IF NOT EXISTS idx_retailers_zoho_sync_status
  ON public.retailers (zoho_sync_status);
CREATE INDEX IF NOT EXISTS idx_retailers_zoho_contact_id
  ON public.retailers (zoho_contact_id) WHERE zoho_contact_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.zoho_sync_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id      uuid REFERENCES public.retailers(id) ON DELETE SET NULL,
  entity_type      text NOT NULL DEFAULT 'contact',
  action           text NOT NULL,               -- create | update | skip | error
  request_payload  jsonb,
  response_payload jsonb,
  http_status      integer,
  error_message    text,
  synced_by        uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zoho_sync_log_retailer
  ON public.zoho_sync_log (retailer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zoho_sync_log_created
  ON public.zoho_sync_log (created_at DESC);

ALTER TABLE public.zoho_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read zoho sync log" ON public.zoho_sync_log;
CREATE POLICY "Authenticated read zoho sync log"
  ON public.zoho_sync_log FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service role writes zoho sync log" ON public.zoho_sync_log;
CREATE POLICY "Service role writes zoho sync log"
  ON public.zoho_sync_log FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.zoho_sync_log TO authenticated;
GRANT ALL    ON public.zoho_sync_log TO service_role;