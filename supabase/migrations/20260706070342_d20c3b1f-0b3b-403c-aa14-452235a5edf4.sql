
-- 1. operations_config new columns
ALTER TABLE public.operations_config
  ADD COLUMN IF NOT EXISTS auto_cancel_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eod_cutoff_time time NOT NULL DEFAULT '20:00:00',
  ADD COLUMN IF NOT EXISTS eod_timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS carry_forward_enabled boolean NOT NULL DEFAULT true;

-- 2. visits.cancel_source
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS cancel_source text
  CHECK (cancel_source IS NULL OR cancel_source IN ('manual','eod_auto'));

-- 3. EOD cancel function
CREATE OR REPLACE FUNCTION public.eod_cancel_pending_visits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg public.operations_config%ROWTYPE;
  v_now timestamp;
  v_today date;
  v_time time;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_cfg FROM public.operations_config WHERE id = 1;
  IF v_cfg.id IS NULL OR COALESCE(v_cfg.auto_cancel_enabled, false) = false THEN
    RETURN 0;
  END IF;

  v_now := (now() AT TIME ZONE v_cfg.eod_timezone);
  v_today := v_now::date;
  v_time := v_now::time;

  UPDATE public.visits
     SET status = 'cancelled',
         cancel_source = 'eod_auto',
         updated_at = now()
   WHERE status = 'planned'
     AND (planned_date < v_today
          OR (planned_date = v_today AND v_time >= v_cfg.eod_cutoff_time));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.eod_cancel_pending_visits() TO service_role;

-- 4. pg_cron schedule (hourly)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'eod-cancel-pending-visits') THEN
    PERFORM cron.unschedule('eod-cancel-pending-visits');
  END IF;
END $$;

SELECT cron.schedule(
  'eod-cancel-pending-visits',
  '0 * * * *',
  $cron$ SELECT public.eod_cancel_pending_visits(); $cron$
);
