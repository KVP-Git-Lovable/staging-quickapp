ALTER TABLE public.retailer_verification_policy
ADD COLUMN IF NOT EXISTS welcome_whatsapp_on_create boolean NOT NULL DEFAULT true;