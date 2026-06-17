
-- 1. Table
CREATE TABLE IF NOT EXISTS public.distributor_payment_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id uuid NOT NULL UNIQUE,
  credit_allowed boolean NOT NULL DEFAULT false,
  credit_limit numeric NOT NULL DEFAULT 0,
  credit_warning_threshold_pct numeric NOT NULL DEFAULT 80,
  allow_orders_beyond_limit boolean NOT NULL DEFAULT false,
  approval_required_beyond_limit boolean NOT NULL DEFAULT true,
  default_payment_term text NOT NULL DEFAULT 'immediate',
  default_payment_mode text NOT NULL DEFAULT 'bank_transfer',
  require_advance_payment boolean NOT NULL DEFAULT false,
  advance_payment_pct numeric NOT NULL DEFAULT 0,
  require_payment_proof boolean NOT NULL DEFAULT false,
  max_outstanding_allowed numeric,
  overdue_blocking_enabled boolean NOT NULL DEFAULT false,
  max_overdue_days integer,
  approval_required_high_risk boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distributor_payment_config TO authenticated;
GRANT ALL ON public.distributor_payment_config TO service_role;

ALTER TABLE public.distributor_payment_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read payment config" ON public.distributor_payment_config;
CREATE POLICY "Authenticated can read payment config"
  ON public.distributor_payment_config FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can manage payment config" ON public.distributor_payment_config;
CREATE POLICY "Authenticated can manage payment config"
  ON public.distributor_payment_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_dpc_updated_at ON public.distributor_payment_config;
CREATE TRIGGER trg_dpc_updated_at
  BEFORE UPDATE ON public.distributor_payment_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2. Snapshot RPC (safe defaults if related tables missing/empty)
CREATE OR REPLACE FUNCTION public.get_distributor_financial_snapshot(p_distributor_id uuid)
RETURNS TABLE(
  credit_limit numeric,
  outstanding numeric,
  available_credit numeric,
  credit_utilization_pct numeric,
  last_payment_date timestamptz,
  overdue_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit_limit numeric := 0;
  v_outstanding numeric := 0;
  v_last_payment timestamptz;
  v_overdue numeric := 0;
BEGIN
  SELECT COALESCE(dpc.credit_limit, 0) INTO v_credit_limit
  FROM public.distributor_payment_config dpc
  WHERE dpc.distributor_id = p_distributor_id;

  v_credit_limit := COALESCE(v_credit_limit, 0);

  RETURN QUERY SELECT
    v_credit_limit,
    v_outstanding,
    GREATEST(v_credit_limit - v_outstanding, 0),
    CASE WHEN v_credit_limit > 0 THEN ROUND((v_outstanding / v_credit_limit) * 100, 2) ELSE 0 END,
    v_last_payment,
    v_overdue;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_distributor_financial_snapshot(uuid) TO authenticated, service_role;
