-- Report promotion 00/08 — the subscription and delivery-log columns.
--
-- Numbered 00 and timestamped ahead of the rest: these are the base columns the
-- others build on, and generate-report selects every one of them. Nothing in
-- files 01–08 depends on them, so strict ordering is not required for
-- correctness — but running them first keeps the set self-contained rather than
-- relying on someone replaying staging's older migration history.
--
-- Consolidates three staging migrations:
--   20260723085111  period_basis + delivery-log FK loosening
--   20260724052032  trigger_type + scheduled-idempotency columns
--   20260724103511  pdf_template
--
-- ─────────────────────────────────────────────────────────────────────────────
-- TWO DELIBERATE OMISSIONS from the originals. Both matter.
--
-- 1. `DELETE FROM report_delivery_log WHERE in_app_status = 'skipped_empty'`
--    NOT included. In staging that was defensive: the old generate-report read
--    the delivery log to build an `alreadyProcessed` set, and a skipped_empty
--    row would suppress a later retry for that period. The current function
--    never reads the log and never writes that status, so the DELETE buys
--    nothing — while on production it would destroy 11 of 19 delivery records,
--    58% of its history. Leaving them is inert.
--
-- 2. `DROP INDEX idx_report_delivery_dedupe` NOT included.
--    It lives in file 07 instead, which is explicitly ordered AFTER the
--    generate-report deploy. Dropping it here would break the currently
--    deployed function, whose upsert requires it — every delivery would fail
--    with "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification". Keeping the split means every statement in THIS file is
--    safe to run against a database still serving the old function.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── report_subscriptions ────────────────────────────────────────────────────

-- Which window a scheduled run covers: the period in progress, or the one just
-- closed. Daily cadences want 'current' so a 18:00 fire reports that day.
-- The CHECK is inline, exactly as the original migration wrote it, so Postgres
-- auto-names it `report_subscriptions_period_basis_check` — matching staging.
-- Naming it explicitly here would have added a SECOND, redundant constraint on
-- databases that already carry the auto-named one. Where the column exists,
-- ADD COLUMN IF NOT EXISTS skips the constraint too, which is the correct no-op.
ALTER TABLE public.report_subscriptions
  ADD COLUMN IF NOT EXISTS period_basis text NOT NULL DEFAULT 'current'
  CHECK (period_basis IN ('current','previous'));

-- NOTE: the original migration followed the ADD COLUMN with a backfill that set
-- period_basis = 'previous' for every daily/weekday/today subscription on a
-- sales dataset. That is deliberately NOT reproduced here.
--
-- It was a one-time backfill for subscriptions that already existed when the
-- column was introduced, preserving the "yesterday's sales" behaviour they had
-- before. It is not idempotent in any useful sense: re-running it silently
-- overwrites a deliberate 'current' choice back to 'previous'. I hit exactly
-- that while validating this file — it reset a staging subscription that had
-- been set to 'current' on purpose, which also explains an earlier reversion we
-- could not account for.
--
-- On production it would be a no-op regardless: both subscriptions there are on
-- the attendance dataset, so the LIKE '%sales%' predicate matches nothing. New
-- rows take the 'current' default, which is the behaviour daily reports want.

-- Scheduled idempotency. last_scheduled_period_key stores the OCCURRENCE key
-- (local date + fire_time), never the reporting-period key, so changing
-- fire_time yields a new key and permits another same-day run.
ALTER TABLE public.report_subscriptions
  ADD COLUMN IF NOT EXISTS last_scheduled_fire_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_scheduled_period_key text;

-- PDF presentation: header style, title override, theme, orientation, footer,
-- branding mode. Empty object means "use the renderer's defaults", so adding
-- this is inert until a template is actually configured.
ALTER TABLE public.report_subscriptions
  ADD COLUMN IF NOT EXISTS pdf_template jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── report_delivery_log ─────────────────────────────────────────────────────

-- Append-only history needs to record HOW a run was triggered. Backfilled as
-- 'scheduled' because every pre-existing row came from the cron dispatcher.
ALTER TABLE public.report_delivery_log
  ADD COLUMN IF NOT EXISTS trigger_type text;

UPDATE public.report_delivery_log SET trigger_type = 'scheduled' WHERE trigger_type IS NULL;

ALTER TABLE public.report_delivery_log
  ALTER COLUMN trigger_type SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.report_delivery_log
    ADD CONSTRAINT report_delivery_log_trigger_type_chk
    CHECK (trigger_type IN ('scheduled','manual'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Preserve delivery history when a subscription is deleted: cascade would take
-- the log rows with it, orphaning the notifications that reference them.
-- Switching to SET NULL keeps the record and requires the column to be nullable.
ALTER TABLE public.report_delivery_log
  ALTER COLUMN subscription_id DROP NOT NULL;

ALTER TABLE public.report_delivery_log
  DROP CONSTRAINT IF EXISTS report_delivery_log_subscription_id_fkey;

ALTER TABLE public.report_delivery_log
  ADD CONSTRAINT report_delivery_log_subscription_id_fkey
  FOREIGN KEY (subscription_id) REFERENCES public.report_subscriptions(id)
  ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
