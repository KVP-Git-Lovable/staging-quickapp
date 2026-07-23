
-- 1. Add period_basis (current vs previous) to subscriptions
ALTER TABLE public.report_subscriptions
  ADD COLUMN IF NOT EXISTS period_basis text NOT NULL DEFAULT 'current'
  CHECK (period_basis IN ('current','previous'));

-- 2. Default sales-type daily reports to previous
UPDATE public.report_subscriptions s
SET period_basis = 'previous'
FROM public.report_definitions d
WHERE s.report_definition_id = d.id
  AND s.cadence IN ('daily','weekday','today')
  AND d.dataset_key LIKE '%sales%'
  AND s.period_basis = 'current';

-- 3. Preserve notification delivery history when subscription is deleted:
--    switch cascade → set null so notifications keep their (now-orphaned) log row.
ALTER TABLE public.report_delivery_log
  DROP CONSTRAINT IF EXISTS report_delivery_log_subscription_id_fkey;

ALTER TABLE public.report_delivery_log
  ALTER COLUMN subscription_id DROP NOT NULL;

ALTER TABLE public.report_delivery_log
  ADD CONSTRAINT report_delivery_log_subscription_id_fkey
  FOREIGN KEY (subscription_id) REFERENCES public.report_subscriptions(id)
  ON DELETE SET NULL;
