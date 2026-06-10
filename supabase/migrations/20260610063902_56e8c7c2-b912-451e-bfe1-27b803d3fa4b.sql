
ALTER TABLE public.retailers
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_by_name text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_method text,
  ADD COLUMN IF NOT EXISTS verification_notes text,
  ADD COLUMN IF NOT EXISTS unverified_order_count integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retailers_verification_method_check') THEN
    ALTER TABLE public.retailers
      ADD CONSTRAINT retailers_verification_method_check
      CHECK (verification_method IS NULL OR verification_method IN ('manual','whatsapp'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.retailer_verification_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id uuid NOT NULL REFERENCES public.retailers(id) ON DELETE CASCADE,
  action text NOT NULL,
  method text NOT NULL CHECK (method IN ('manual','whatsapp')),
  verified_items jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  performed_by uuid,
  performed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.retailer_verification_audit TO authenticated;
GRANT ALL ON public.retailer_verification_audit TO service_role;
ALTER TABLE public.retailer_verification_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_select_admin_or_owner" ON public.retailer_verification_audit
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.retailers r WHERE r.id = retailer_id AND r.user_id = auth.uid())
    OR public.is_system_admin(auth.uid())
  );
CREATE POLICY "audit_insert_authenticated" ON public.retailer_verification_audit
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.retailer_verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id uuid NOT NULL REFERENCES public.retailers(id) ON DELETE CASCADE,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('queued','sent','confirmed','rejected','failed','expired')),
  twilio_sid text,
  reply_text text,
  reply_received_at timestamptz,
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rvr_phone_status ON public.retailer_verification_requests (phone, status, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_rvr_retailer ON public.retailer_verification_requests (retailer_id, sent_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.retailer_verification_requests TO authenticated;
GRANT ALL ON public.retailer_verification_requests TO service_role;
ALTER TABLE public.retailer_verification_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rvr_select_admin_or_owner" ON public.retailer_verification_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.retailers r WHERE r.id = retailer_id AND r.user_id = auth.uid())
    OR public.is_system_admin(auth.uid())
  );
CREATE POLICY "rvr_insert_authenticated" ON public.retailer_verification_requests
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.retailer_verification_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  enabled boolean NOT NULL DEFAULT false,
  max_orders_unverified integer NOT NULL DEFAULT 3,
  block_after_limit boolean NOT NULL DEFAULT false,
  grace_days integer NOT NULL DEFAULT 0,
  require_verification_for_credit boolean NOT NULL DEFAULT false,
  auto_whatsapp_on_create boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);
GRANT SELECT ON public.retailer_verification_policy TO authenticated;
GRANT ALL ON public.retailer_verification_policy TO service_role;
ALTER TABLE public.retailer_verification_policy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rvp_select_all_auth" ON public.retailer_verification_policy
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "rvp_admin_write" ON public.retailer_verification_policy
  FOR ALL TO authenticated
  USING (public.is_system_admin(auth.uid()))
  WITH CHECK (public.is_system_admin(auth.uid()));

INSERT INTO public.retailer_verification_policy (company_id, enabled, max_orders_unverified, block_after_limit, grace_days, require_verification_for_credit, auto_whatsapp_on_create)
SELECT NULL, false, 3, false, 0, false, true
WHERE NOT EXISTS (SELECT 1 FROM public.retailer_verification_policy WHERE company_id IS NULL);

CREATE OR REPLACE FUNCTION public.can_place_order_for_retailer(p_retailer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_retailer record;
  v_policy record;
  v_used integer;
  v_remaining integer;
BEGIN
  SELECT id, verified, COALESCE(unverified_order_count,0) AS cnt, created_at
    INTO v_retailer FROM public.retailers WHERE id = p_retailer_id;

  IF v_retailer.id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Retailer not found');
  END IF;

  IF v_retailer.verified = true THEN
    RETURN jsonb_build_object('allowed', true, 'verified', true);
  END IF;

  SELECT * INTO v_policy FROM public.retailer_verification_policy
    WHERE company_id IS NULL ORDER BY created_at LIMIT 1;

  IF v_policy.id IS NULL OR v_policy.enabled = false THEN
    RETURN jsonb_build_object('allowed', true, 'verified', false, 'policy_enabled', false);
  END IF;

  IF v_policy.grace_days > 0 AND v_retailer.created_at > (now() - (v_policy.grace_days || ' days')::interval) THEN
    RETURN jsonb_build_object('allowed', true, 'verified', false, 'reason', 'within_grace_period');
  END IF;

  v_used := v_retailer.cnt;
  v_remaining := GREATEST(v_policy.max_orders_unverified - v_used, 0);

  IF v_used >= v_policy.max_orders_unverified THEN
    IF v_policy.block_after_limit THEN
      RETURN jsonb_build_object('allowed', false, 'verified', false,
        'used', v_used, 'limit', v_policy.max_orders_unverified, 'remaining', 0,
        'reason', 'unverified_order_limit_reached');
    ELSE
      RETURN jsonb_build_object('allowed', true, 'verified', false, 'warn', true,
        'used', v_used, 'limit', v_policy.max_orders_unverified, 'remaining', 0,
        'reason', 'unverified_order_limit_soft_warn');
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true, 'verified', false,
    'used', v_used, 'limit', v_policy.max_orders_unverified, 'remaining', v_remaining);
END;
$$;
GRANT EXECUTE ON FUNCTION public.can_place_order_for_retailer(uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.bump_unverified_order_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verified boolean;
BEGIN
  IF NEW.retailer_id IS NULL THEN RETURN NEW; END IF;
  SELECT verified INTO v_verified FROM public.retailers WHERE id = NEW.retailer_id;
  IF v_verified IS DISTINCT FROM true THEN
    UPDATE public.retailers
       SET unverified_order_count = COALESCE(unverified_order_count, 0) + 1
     WHERE id = NEW.retailer_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_unverified_order_count ON public.orders;
CREATE TRIGGER trg_bump_unverified_order_count
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.bump_unverified_order_count();
