
-- 1) Drop the unique dedupe index; multiple runs per period are legitimate now.
DROP INDEX IF EXISTS public.idx_report_delivery_dedupe;

-- 2) Delete stale skipped_empty markers so they cannot suppress anything (defensive).
DELETE FROM public.report_delivery_log WHERE in_app_status = 'skipped_empty';

-- 3) Append-only history: add trigger_type. Backfill existing rows as 'scheduled'.
ALTER TABLE public.report_delivery_log
  ADD COLUMN IF NOT EXISTS trigger_type text;
UPDATE public.report_delivery_log SET trigger_type = 'scheduled' WHERE trigger_type IS NULL;
ALTER TABLE public.report_delivery_log
  ALTER COLUMN trigger_type SET NOT NULL,
  ADD CONSTRAINT report_delivery_log_trigger_type_chk
    CHECK (trigger_type IN ('scheduled','manual'));

CREATE INDEX IF NOT EXISTS idx_report_delivery_sub_period_created
  ON public.report_delivery_log (subscription_id, period, created_at DESC);

-- 4) Scheduled-idempotency columns on subscriptions.
ALTER TABLE public.report_subscriptions
  ADD COLUMN IF NOT EXISTS last_scheduled_fire_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_scheduled_period_key text;
