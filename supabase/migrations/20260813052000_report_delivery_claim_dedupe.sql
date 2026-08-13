-- Stop a scheduled report being delivered more than once per recipient/period.
--
-- Production sent 4 copies of every scheduled report from 12 Aug 2026.
-- generate-report is invoked ~4x per dispatcher tick (source still unconfirmed —
-- one cron run, one dispatcher response, four deliveries). It always was; what
-- changed is that report_promo_07 dropped idx_report_delivery_dedupe and made
-- report_delivery_log append-only, so the repeats stopped being collapsed.
--
-- The guard has to be ATOMIC, not check-then-insert: the four inserts landed
-- 30-300ms apart, so a SELECT followed by an INSERT would still let several
-- through. A dedicated claims table with a real primary key makes exactly one
-- caller win, decided by Postgres.
--
-- A separate table rather than a unique index on report_delivery_log, because
-- that table already holds the duplicate history and adding a unique index would
-- mean deleting rows first.

CREATE TABLE IF NOT EXISTS public.report_delivery_claims (
  subscription_id   uuid        NOT NULL,
  recipient_user_id uuid        NOT NULL,
  period            text        NOT NULL,
  trigger_type      text        NOT NULL,
  claimed_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, recipient_user_id, period, trigger_type)
);

ALTER TABLE public.report_delivery_claims ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='report_delivery_claims' AND policyname='Admins can view delivery claims') THEN
    CREATE POLICY "Admins can view delivery claims" ON public.report_delivery_claims
      FOR SELECT TO authenticated USING (public.is_admin_or_manager());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS report_delivery_claims_claimed_idx
  ON public.report_delivery_claims (claimed_at DESC);

-- Returns true only for the caller that actually inserted the claim. Every
-- concurrent duplicate gets false and must skip delivery entirely.
--
-- Manual runs are never deduped: "Run now" is a deliberate act and must always
-- produce a report, however many times it is pressed.
CREATE OR REPLACE FUNCTION public.report_claim_delivery(
  p_subscription_id uuid,
  p_recipient_user_id uuid,
  p_period text,
  p_trigger_type text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_claimed boolean;
BEGIN
  IF p_trigger_type IS DISTINCT FROM 'scheduled' THEN
    RETURN true;
  END IF;

  INSERT INTO public.report_delivery_claims
    (subscription_id, recipient_user_id, period, trigger_type)
  VALUES
    (p_subscription_id, p_recipient_user_id, p_period, 'scheduled')
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  RETURN v_claimed;
END;
$fn$;

REVOKE ALL ON FUNCTION public.report_claim_delivery(uuid, uuid, text, text) FROM public, anon, authenticated;

COMMENT ON FUNCTION public.report_claim_delivery(uuid, uuid, text, text) IS
  'Atomically claims one scheduled delivery for a subscription/recipient/period. Returns true to exactly one caller; concurrent duplicates get false and must not deliver. Manual runs always return true.';

CREATE OR REPLACE FUNCTION public.prune_report_delivery_claims(p_keep_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_n integer;
BEGIN
  DELETE FROM public.report_delivery_claims
  WHERE claimed_at < now() - make_interval(days => GREATEST(p_keep_days, 1));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$fn$;
