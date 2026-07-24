ALTER TABLE public.report_subscriptions
  ADD COLUMN IF NOT EXISTS pdf_template jsonb NOT NULL DEFAULT '{}'::jsonb;