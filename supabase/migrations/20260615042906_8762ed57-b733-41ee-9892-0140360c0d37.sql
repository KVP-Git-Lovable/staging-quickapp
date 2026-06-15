ALTER TABLE public.retailers
ADD COLUMN IF NOT EXISTS verification_score integer DEFAULT 0;

COMMENT ON COLUMN public.retailers.verification_score IS 'Backend-calculated retailer verification score from WhatsApp and checklist verification signals.';