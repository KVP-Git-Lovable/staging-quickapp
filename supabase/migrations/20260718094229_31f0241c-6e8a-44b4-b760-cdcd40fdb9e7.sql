ALTER TABLE public.influencer_referrals
  ADD COLUMN IF NOT EXISTS consumer_name text,
  ADD COLUMN IF NOT EXISTS consumer_phone text,
  ADD COLUMN IF NOT EXISTS consumer_address text,
  ADD COLUMN IF NOT EXISTS interested_products jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tagged_retailer_id uuid,
  ADD COLUMN IF NOT EXISTS voice_transcript text;

DROP POLICY IF EXISTS "influencer_referrals_anon_insert" ON public.influencer_referrals;
CREATE POLICY "influencer_referrals_anon_insert" ON public.influencer_referrals
  FOR INSERT TO anon WITH CHECK (true);
GRANT INSERT, SELECT ON public.influencer_referrals TO anon;