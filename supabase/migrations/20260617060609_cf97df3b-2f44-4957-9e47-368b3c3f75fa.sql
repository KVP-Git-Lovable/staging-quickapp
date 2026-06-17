
-- =========================================================
-- Phase 1.A — distributor_payment_config
-- =========================================================
CREATE TABLE IF NOT EXISTS public.distributor_payment_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  distributor_id UUID NOT NULL UNIQUE REFERENCES public.distributors(id) ON DELETE CASCADE,
  credit_allowed BOOLEAN NOT NULL DEFAULT false,
  credit_limit NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_warning_threshold_pct NUMERIC(5,2) NOT NULL DEFAULT 80,
  allow_orders_beyond_limit BOOLEAN NOT NULL DEFAULT false,
  approval_required_beyond_limit BOOLEAN NOT NULL DEFAULT true,
  default_payment_term TEXT NOT NULL DEFAULT 'immediate'
    CHECK (default_payment_term IN ('immediate','net_7','net_15','net_30','net_45','advance','partial','credit_based')),
  default_payment_mode TEXT NOT NULL DEFAULT 'bank_transfer'
    CHECK (default_payment_mode IN ('credit','bank_transfer','upi','cash','cheque','neft_rtgs')),
  require_advance_payment BOOLEAN NOT NULL DEFAULT false,
  advance_payment_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (advance_payment_pct BETWEEN 0 AND 100),
  require_payment_proof BOOLEAN NOT NULL DEFAULT false,
  max_outstanding_allowed NUMERIC(14,2),
  overdue_blocking_enabled BOOLEAN NOT NULL DEFAULT false,
  max_overdue_days INTEGER,
  approval_required_high_risk BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distributor_payment_config TO authenticated;
GRANT ALL ON public.distributor_payment_config TO service_role;

ALTER TABLE public.distributor_payment_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read distributor payment config"
  ON public.distributor_payment_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage distributor payment config"
  ON public.distributor_payment_config FOR ALL TO authenticated
  USING (public.is_system_admin(auth.uid()))
  WITH CHECK (public.is_system_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_touch_distributor_payment_config ON public.distributor_payment_config;
CREATE TRIGGER trg_touch_distributor_payment_config
  BEFORE UPDATE ON public.distributor_payment_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- Phase 1.B — order_lifecycle_config
-- =========================================================
CREATE TABLE IF NOT EXISTS public.order_lifecycle_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  allow_order_cancellation BOOLEAN NOT NULL DEFAULT true,
  allow_order_editing BOOLEAN NOT NULL DEFAULT true,
  cancellation_cutoff_stage TEXT NOT NULL DEFAULT 'processing'
    CHECK (cancellation_cutoff_stage IN ('draft','submitted','confirmed','processing','allocated','packed','dispatched')),
  editing_cutoff_stage TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (editing_cutoff_stage IN ('draft','submitted','confirmed','processing','allocated','packed','dispatched')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_lifecycle_config TO authenticated;
GRANT ALL ON public.order_lifecycle_config TO service_role;

ALTER TABLE public.order_lifecycle_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can read order lifecycle config"
  ON public.order_lifecycle_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage order lifecycle config"
  ON public.order_lifecycle_config FOR ALL TO authenticated
  USING (public.is_system_admin(auth.uid()))
  WITH CHECK (public.is_system_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_touch_order_lifecycle_config ON public.order_lifecycle_config;
CREATE TRIGGER trg_touch_order_lifecycle_config
  BEFORE UPDATE ON public.order_lifecycle_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.order_lifecycle_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- Phase 1.C — extend primary_orders
-- =========================================================
ALTER TABLE public.primary_orders
  ADD COLUMN IF NOT EXISTS payment_term TEXT,
  ADD COLUMN IF NOT EXISTS payment_mode TEXT,
  ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_proof_url TEXT,
  ADD COLUMN IF NOT EXISTS credit_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS edited_by UUID,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='primary_orders' AND column_name='balance_payable'
  ) THEN
    ALTER TABLE public.primary_orders
      ADD COLUMN balance_payable NUMERIC(14,2)
      GENERATED ALWAYS AS (COALESCE(total_amount,0) - COALESCE(advance_amount,0)) STORED;
  END IF;
END $$;

-- =========================================================
-- Phase 1.D — financial snapshot RPC
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_distributor_financial_snapshot(p_distributor_id UUID)
RETURNS TABLE (
  credit_limit NUMERIC,
  outstanding NUMERIC,
  available_credit NUMERIC,
  credit_utilization_pct NUMERIC,
  last_payment_date DATE,
  overdue_amount NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit NUMERIC := 0;
  v_outstanding NUMERIC := 0;
  v_last_pay DATE;
  v_overdue NUMERIC := 0;
  v_max_overdue_days INT;
BEGIN
  SELECT COALESCE(dpc.credit_limit,0), dpc.max_overdue_days
    INTO v_limit, v_max_overdue_days
  FROM public.distributor_payment_config dpc
  WHERE dpc.distributor_id = p_distributor_id;

  SELECT COALESCE(SUM(GREATEST(COALESCE(po.total_amount,0) - COALESCE(po.advance_amount,0), 0)),0)
    INTO v_outstanding
  FROM public.primary_orders po
  WHERE po.distributor_id = p_distributor_id
    AND po.status NOT IN ('cancelled','draft')
    AND COALESCE(po.payment_status,'pending') <> 'paid';

  SELECT MAX(dp.payment_date)::date INTO v_last_pay
  FROM public.distributor_payments dp
  WHERE dp.distributor_id = p_distributor_id;

  IF v_max_overdue_days IS NOT NULL THEN
    SELECT COALESCE(SUM(GREATEST(COALESCE(po.total_amount,0) - COALESCE(po.advance_amount,0), 0)),0)
      INTO v_overdue
    FROM public.primary_orders po
    WHERE po.distributor_id = p_distributor_id
      AND po.status NOT IN ('cancelled','draft')
      AND COALESCE(po.payment_status,'pending') <> 'paid'
      AND COALESCE(po.expected_delivery_date, po.order_date) + (v_max_overdue_days || ' days')::interval < now();
  END IF;

  credit_limit := v_limit;
  outstanding := v_outstanding;
  available_credit := GREATEST(v_limit - v_outstanding, 0);
  credit_utilization_pct := CASE WHEN v_limit > 0 THEN ROUND((v_outstanding / v_limit) * 100, 2) ELSE 0 END;
  last_payment_date := v_last_pay;
  overdue_amount := v_overdue;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_distributor_financial_snapshot(UUID) TO authenticated;
