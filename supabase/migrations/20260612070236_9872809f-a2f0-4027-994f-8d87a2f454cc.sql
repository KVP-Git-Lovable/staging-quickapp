
CREATE TABLE IF NOT EXISTS public.retailer_verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id uuid NOT NULL REFERENCES public.retailers(id) ON DELETE CASCADE,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  twilio_sid text,
  error_message text,
  reply_text text,
  reply_received_at timestamptz,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rvr_phone_sent ON public.retailer_verification_requests (phone, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_rvr_retailer_sent ON public.retailer_verification_requests (retailer_id, sent_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.retailer_verification_requests TO authenticated;
GRANT ALL ON public.retailer_verification_requests TO service_role;

ALTER TABLE public.retailer_verification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read verification requests" ON public.retailer_verification_requests;
CREATE POLICY "Authenticated read verification requests"
  ON public.retailer_verification_requests FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated insert verification requests" ON public.retailer_verification_requests;
CREATE POLICY "Authenticated insert verification requests"
  ON public.retailer_verification_requests FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update verification requests" ON public.retailer_verification_requests;
CREATE POLICY "Authenticated update verification requests"
  ON public.retailer_verification_requests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Backfill Prajwal Genral Store (reply was captured in whatsapp_sessions but lost)
UPDATE public.retailers SET
  verified = true,
  verification_method = 'whatsapp',
  verified_by_name = 'WhatsApp',
  verified_at = now(),
  whatsapp_verified = true,
  verification_score = 100
WHERE id = 'e688b159-2171-4c8d-8bff-969534eed3b2';

SELECT public.calculate_retailer_quality_score('e688b159-2171-4c8d-8bff-969534eed3b2');
