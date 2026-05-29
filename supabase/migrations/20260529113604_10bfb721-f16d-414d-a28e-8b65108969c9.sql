
-- PHASE 1 — DB FOUNDATION (retry)

CREATE TABLE public.retailer_shared_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id uuid NOT NULL,
  shared_by_user_id uuid NOT NULL,
  shared_to_user_id uuid NOT NULL,
  access_template_id uuid,
  can_view boolean NOT NULL DEFAULT true,
  can_take_orders boolean NOT NULL DEFAULT false,
  can_collect_payment boolean NOT NULL DEFAULT false,
  can_update_feedback boolean NOT NULL DEFAULT false,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'manual',
  source_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retailer_shared_access TO authenticated;
GRANT ALL ON public.retailer_shared_access TO service_role;
ALTER TABLE public.retailer_shared_access ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_rsa_to_user_active ON public.retailer_shared_access(shared_to_user_id, is_active, effective_from, effective_to);
CREATE INDEX idx_rsa_retailer_active ON public.retailer_shared_access(retailer_id, is_active);
CREATE POLICY "rsa_party_select" ON public.retailer_shared_access FOR SELECT TO authenticated
  USING (shared_by_user_id = auth.uid() OR shared_to_user_id = auth.uid());
CREATE POLICY "rsa_owner_insert" ON public.retailer_shared_access FOR INSERT TO authenticated
  WITH CHECK (shared_by_user_id = auth.uid());
CREATE POLICY "rsa_owner_update" ON public.retailer_shared_access FOR UPDATE TO authenticated
  USING (shared_by_user_id = auth.uid());
CREATE POLICY "rsa_owner_delete" ON public.retailer_shared_access FOR DELETE TO authenticated
  USING (shared_by_user_id = auth.uid());

CREATE TABLE public.user_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  delegation_scope text NOT NULL CHECK (delegation_scope IN ('all','beats','retailers')),
  beat_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  retailer_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  effective_from timestamptz NOT NULL,
  effective_to timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','revoked')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_delegations TO authenticated;
GRANT ALL ON public.user_delegations TO service_role;
ALTER TABLE public.user_delegations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_user_delegations_status ON public.user_delegations(status, effective_to);
CREATE POLICY "deleg_party_select" ON public.user_delegations FOR SELECT TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());
CREATE POLICY "deleg_owner_insert" ON public.user_delegations FOR INSERT TO authenticated
  WITH CHECK (from_user_id = auth.uid());
CREATE POLICY "deleg_owner_update" ON public.user_delegations FOR UPDATE TO authenticated
  USING (from_user_id = auth.uid());

CREATE TABLE public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.distributor_payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.distributor_secondary_invoices(id) ON DELETE CASCADE,
  allocated_amount numeric(14,2) NOT NULL CHECK (allocated_amount > 0),
  allocation_type text NOT NULL DEFAULT 'manual' CHECK (allocation_type IN ('fifo','manual','advance')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE(payment_id, invoice_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_allocations TO authenticated;
GRANT ALL ON public.payment_allocations TO service_role;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_pa_payment ON public.payment_allocations(payment_id);
CREATE INDEX idx_pa_invoice ON public.payment_allocations(invoice_id);
CREATE POLICY "pa_authenticated_all" ON public.payment_allocations FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TABLE public.distributor_collection_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id uuid NOT NULL UNIQUE,
  allocation_strategy text NOT NULL DEFAULT 'fifo' CHECK (allocation_strategy IN ('fifo','manual','prompt')),
  allow_manual_override boolean NOT NULL DEFAULT true,
  allow_unallocated_amount boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.distributor_collection_policy TO authenticated;
GRANT ALL ON public.distributor_collection_policy TO service_role;
ALTER TABLE public.distributor_collection_policy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dcp_authenticated_read" ON public.distributor_collection_policy FOR SELECT TO authenticated USING (true);

INSERT INTO public.distributor_collection_policy(distributor_id)
SELECT DISTINCT distributor_id FROM public.distributor_payments WHERE distributor_id IS NOT NULL
ON CONFLICT (distributor_id) DO NOTHING;

CREATE TABLE public.operational_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id uuid,
  beat_id text,
  activity_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  performed_by_user_id uuid,
  owner_snapshot_user_id uuid,
  operational_snapshot_user_id uuid,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.operational_activity_log TO authenticated;
GRANT ALL ON public.operational_activity_log TO service_role;
ALTER TABLE public.operational_activity_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_oal_retailer ON public.operational_activity_log(retailer_id, created_at DESC);
CREATE INDEX idx_oal_performer ON public.operational_activity_log(performed_by_user_id, created_at DESC);
CREATE POLICY "oal_self_read" ON public.operational_activity_log FOR SELECT TO authenticated
  USING (performed_by_user_id = auth.uid() OR owner_snapshot_user_id = auth.uid() OR operational_snapshot_user_id = auth.uid());
CREATE POLICY "oal_authenticated_insert" ON public.operational_activity_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE public.route_execution_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_date date NOT NULL DEFAULT CURRENT_DATE,
  retailer_id uuid,
  beat_id text,
  assigned_user_id uuid,
  executed_by_user_id uuid,
  action_type text NOT NULL CHECK (action_type IN ('visited','skipped','reassigned','added_adhoc')),
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.route_execution_history TO authenticated;
GRANT ALL ON public.route_execution_history TO service_role;
ALTER TABLE public.route_execution_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_reh_date_user ON public.route_execution_history(route_date, assigned_user_id);
CREATE POLICY "reh_self_read" ON public.route_execution_history FOR SELECT TO authenticated
  USING (assigned_user_id = auth.uid() OR executed_by_user_id = auth.uid());
CREATE POLICY "reh_authenticated_insert" ON public.route_execution_history FOR INSERT TO authenticated WITH CHECK (true);

-- Column additions
ALTER TABLE public.distributor_payments
  ADD COLUMN IF NOT EXISTS sales_credit_user_id uuid,
  ADD COLUMN IF NOT EXISTS collected_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS operational_snapshot_user_id uuid,
  ADD COLUMN IF NOT EXISTS owner_snapshot_user_id uuid,
  ADD COLUMN IF NOT EXISTS unallocated_amount numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.distributor_secondary_invoices
  ADD COLUMN IF NOT EXISTS owner_snapshot_user_id uuid,
  ADD COLUMN IF NOT EXISTS operational_snapshot_user_id uuid,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';

UPDATE public.distributor_payments p
   SET owner_snapshot_user_id = r.user_id
  FROM public.retailers r
 WHERE p.retailer_id = r.id AND p.owner_snapshot_user_id IS NULL;

UPDATE public.distributor_secondary_invoices i
   SET owner_snapshot_user_id = r.user_id
  FROM public.retailers r
 WHERE i.retailer_id = r.id AND i.owner_snapshot_user_id IS NULL;

-- Helper functions
CREATE OR REPLACE FUNCTION public.user_owns_retailer(_user uuid, _retailer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.retailers WHERE id = _retailer AND user_id = _user);
$$;

CREATE OR REPLACE FUNCTION public.user_has_operational_access(_user uuid, _retailer uuid, _perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.user_owns_retailer(_user, _retailer)
    OR EXISTS (
      SELECT 1 FROM public.retailer_shared_access s
       WHERE s.retailer_id = _retailer
         AND s.shared_to_user_id = _user
         AND s.is_active = true
         AND s.effective_from <= now()
         AND (s.effective_to IS NULL OR s.effective_to >= now())
         AND CASE _perm
               WHEN 'view'     THEN s.can_view
               WHEN 'order'    THEN s.can_take_orders
               WHEN 'collect'  THEN s.can_collect_payment
               WHEN 'feedback' THEN s.can_update_feedback
               ELSE false END
    );
$$;

-- Allocation recompute trigger
CREATE OR REPLACE FUNCTION public.recompute_invoice_and_payment_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invoice_id uuid; v_payment_id uuid;
  v_inv_total numeric(14,2); v_inv_paid numeric(14,2);
  v_pay_total numeric(14,2); v_pay_alloc numeric(14,2);
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_payment_id := COALESCE(NEW.payment_id, OLD.payment_id);

  SELECT total_amount INTO v_inv_total FROM public.distributor_secondary_invoices WHERE id = v_invoice_id;
  SELECT COALESCE(SUM(allocated_amount),0) INTO v_inv_paid FROM public.payment_allocations WHERE invoice_id = v_invoice_id;
  UPDATE public.distributor_secondary_invoices
     SET amount_paid = v_inv_paid,
         balance_due = GREATEST(COALESCE(v_inv_total,0) - v_inv_paid, 0),
         payment_status = CASE WHEN v_inv_paid <= 0 THEN 'unpaid'
                               WHEN v_inv_paid >= COALESCE(v_inv_total,0) THEN 'paid'
                               ELSE 'partial' END,
         updated_at = now()
   WHERE id = v_invoice_id;

  SELECT amount INTO v_pay_total FROM public.distributor_payments WHERE id = v_payment_id;
  SELECT COALESCE(SUM(allocated_amount),0) INTO v_pay_alloc FROM public.payment_allocations WHERE payment_id = v_payment_id;
  UPDATE public.distributor_payments
     SET unallocated_amount = GREATEST(COALESCE(v_pay_total,0) - v_pay_alloc, 0),
         updated_at = now()
   WHERE id = v_payment_id;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_recompute_alloc_totals ON public.payment_allocations;
CREATE TRIGGER trg_recompute_alloc_totals
AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.recompute_invoice_and_payment_totals();

-- Snapshot trigger for payments
CREATE OR REPLACE FUNCTION public.set_payment_snapshots()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_snapshot_user_id IS NULL THEN
    SELECT user_id INTO NEW.owner_snapshot_user_id FROM public.retailers WHERE id = NEW.retailer_id;
  END IF;
  IF NEW.collected_by_user_id IS NULL THEN NEW.collected_by_user_id := auth.uid(); END IF;
  IF NEW.operational_snapshot_user_id IS NULL THEN
    NEW.operational_snapshot_user_id := COALESCE(NEW.collected_by_user_id, NEW.owner_snapshot_user_id);
  END IF;
  IF NEW.sales_credit_user_id IS NULL THEN NEW.sales_credit_user_id := NEW.owner_snapshot_user_id; END IF;
  IF NEW.unallocated_amount IS NULL OR NEW.unallocated_amount = 0 THEN NEW.unallocated_amount := NEW.amount; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_payment_snapshots ON public.distributor_payments;
CREATE TRIGGER trg_set_payment_snapshots
BEFORE INSERT ON public.distributor_payments
FOR EACH ROW EXECUTE FUNCTION public.set_payment_snapshots();

-- PHASE 2 — RPCs
CREATE OR REPLACE FUNCTION public.share_retailer_access(
  p_retailer_id uuid, p_to_user uuid,
  p_can_view boolean DEFAULT true, p_can_take_orders boolean DEFAULT false,
  p_can_collect_payment boolean DEFAULT false, p_can_update_feedback boolean DEFAULT false,
  p_effective_from timestamptz DEFAULT now(), p_effective_to timestamptz DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.retailer_shared_access(
    retailer_id, shared_by_user_id, shared_to_user_id,
    can_view, can_take_orders, can_collect_payment, can_update_feedback,
    effective_from, effective_to, source, created_by
  ) VALUES (
    p_retailer_id, auth.uid(), p_to_user,
    p_can_view, p_can_take_orders, p_can_collect_payment, p_can_update_feedback,
    p_effective_from, p_effective_to, 'manual', auth.uid()
  ) RETURNING id INTO v_id;
  INSERT INTO public.operational_activity_log(
    retailer_id, activity_type, entity_type, entity_id,
    performed_by_user_id, owner_snapshot_user_id, operational_snapshot_user_id, metadata_json
  ) VALUES (
    p_retailer_id, 'share_granted', 'retailer_shared_access', v_id,
    auth.uid(), (SELECT user_id FROM public.retailers WHERE id = p_retailer_id), p_to_user,
    jsonb_build_object('to_user', p_to_user)
  );
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_retailer_access(p_share_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_retailer uuid; v_to uuid;
BEGIN
  UPDATE public.retailer_shared_access
     SET is_active = false, effective_to = LEAST(COALESCE(effective_to, now()), now())
   WHERE id = p_share_id AND shared_by_user_id = auth.uid()
   RETURNING retailer_id, shared_to_user_id INTO v_retailer, v_to;
  IF v_retailer IS NOT NULL THEN
    INSERT INTO public.operational_activity_log(
      retailer_id, activity_type, entity_type, entity_id,
      performed_by_user_id, owner_snapshot_user_id, operational_snapshot_user_id, metadata_json
    ) VALUES (
      v_retailer, 'share_revoked', 'retailer_shared_access', p_share_id,
      auth.uid(), auth.uid(), v_to, jsonb_build_object('to_user', v_to)
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_user_delegation(
  p_to_user uuid, p_scope text, p_beat_ids text[], p_retailer_ids uuid[],
  p_effective_from timestamptz, p_effective_to timestamptz, p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_retailer_set uuid[];
BEGIN
  INSERT INTO public.user_delegations(
    from_user_id, to_user_id, delegation_scope, beat_ids, retailer_ids,
    effective_from, effective_to, status, notes, created_by
  ) VALUES (
    auth.uid(), p_to_user, p_scope, COALESCE(p_beat_ids,'{}'), COALESCE(p_retailer_ids,'{}'),
    p_effective_from, p_effective_to, 'active', p_notes, auth.uid()
  ) RETURNING id INTO v_id;

  IF p_scope = 'all' THEN
    SELECT array_agg(id) INTO v_retailer_set FROM public.retailers WHERE user_id = auth.uid();
  ELSIF p_scope = 'beats' THEN
    SELECT array_agg(id) INTO v_retailer_set FROM public.retailers
     WHERE user_id = auth.uid() AND beat_id = ANY(p_beat_ids);
  ELSE
    v_retailer_set := p_retailer_ids;
  END IF;

  IF v_retailer_set IS NOT NULL THEN
    INSERT INTO public.retailer_shared_access(
      retailer_id, shared_by_user_id, shared_to_user_id,
      can_view, can_take_orders, can_collect_payment, can_update_feedback,
      effective_from, effective_to, source, source_id, created_by
    )
    SELECT unnest(v_retailer_set), auth.uid(), p_to_user,
           true, true, true, true,
           p_effective_from, p_effective_to, 'delegation', v_id, auth.uid();
  END IF;

  INSERT INTO public.operational_activity_log(
    activity_type, entity_type, entity_id, performed_by_user_id,
    owner_snapshot_user_id, operational_snapshot_user_id, metadata_json
  ) VALUES (
    'delegation_created', 'user_delegation', v_id, auth.uid(),
    auth.uid(), p_to_user,
    jsonb_build_object('to_user', p_to_user, 'scope', p_scope,
                       'retailer_count', COALESCE(array_length(v_retailer_set,1),0))
  );
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.allocate_payment_fifo(p_payment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_retailer uuid; v_remaining numeric(14,2); v_amount numeric(14,2); rec record; v_take numeric(14,2);
BEGIN
  SELECT retailer_id, amount INTO v_retailer, v_amount FROM public.distributor_payments WHERE id = p_payment_id;
  DELETE FROM public.payment_allocations WHERE payment_id = p_payment_id;
  v_remaining := v_amount;
  FOR rec IN
    SELECT id, balance_due FROM public.distributor_secondary_invoices
     WHERE retailer_id = v_retailer AND COALESCE(balance_due,0) > 0
     ORDER BY invoice_date ASC, created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, rec.balance_due);
    IF v_take > 0 THEN
      INSERT INTO public.payment_allocations(payment_id, invoice_id, allocated_amount, allocation_type, created_by)
      VALUES (p_payment_id, rec.id, v_take, 'fifo', auth.uid());
      v_remaining := v_remaining - v_take;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.allocate_payment_manual(p_payment_id uuid, p_allocations jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rec jsonb; v_amount numeric(14,2); v_sum numeric(14,2) := 0;
        v_pay_amt numeric(14,2); v_distributor uuid; v_allow_unalloc boolean;
BEGIN
  SELECT amount, distributor_id INTO v_pay_amt, v_distributor FROM public.distributor_payments WHERE id = p_payment_id;
  SELECT COALESCE(allow_unallocated_amount, true) INTO v_allow_unalloc
    FROM public.distributor_collection_policy WHERE distributor_id = v_distributor;
  FOR rec IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    v_amount := (rec->>'amount')::numeric;
    IF v_amount > 0 THEN v_sum := v_sum + v_amount; END IF;
  END LOOP;
  IF v_sum > v_pay_amt THEN RAISE EXCEPTION 'Allocation sum (%) exceeds payment amount (%)', v_sum, v_pay_amt; END IF;
  IF COALESCE(v_allow_unalloc, true) = false AND v_sum < v_pay_amt THEN
    RAISE EXCEPTION 'Unallocated amount not permitted by distributor policy';
  END IF;
  DELETE FROM public.payment_allocations WHERE payment_id = p_payment_id;
  FOR rec IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    v_amount := (rec->>'amount')::numeric;
    IF v_amount > 0 THEN
      INSERT INTO public.payment_allocations(payment_id, invoice_id, allocated_amount, allocation_type, created_by)
      VALUES (p_payment_id, (rec->>'invoice_id')::uuid, v_amount, 'manual', auth.uid());
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.record_route_execution(
  p_retailer_id uuid, p_action text, p_remarks text DEFAULT NULL,
  p_beat_id text DEFAULT NULL, p_route_date date DEFAULT CURRENT_DATE
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.retailers WHERE id = p_retailer_id;
  INSERT INTO public.route_execution_history(
    route_date, retailer_id, beat_id, assigned_user_id, executed_by_user_id, action_type, remarks
  ) VALUES (p_route_date, p_retailer_id, p_beat_id, v_owner, auth.uid(), p_action, p_remarks)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_operations_today(p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (retailer_id uuid, retailer_name text, beat_id text, access_type text, pending_collection numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT r.id AS retailer_id, r.name AS retailer_name, r.beat_id, 'owned'::text AS access_type
      FROM public.retailers r WHERE r.user_id = auth.uid()
    UNION
    SELECT r.id, r.name, r.beat_id, 'shared'::text
      FROM public.retailer_shared_access s
      JOIN public.retailers r ON r.id = s.retailer_id
     WHERE s.shared_to_user_id = auth.uid()
       AND s.is_active = true
       AND s.effective_from <= now()
       AND (s.effective_to IS NULL OR s.effective_to >= now())
  ),
  pend AS (
    SELECT retailer_id, SUM(COALESCE(balance_due,0)) AS pending
      FROM public.distributor_secondary_invoices
     WHERE COALESCE(balance_due,0) > 0
     GROUP BY retailer_id
  )
  SELECT b.retailer_id, b.retailer_name, b.beat_id, b.access_type,
         COALESCE(p.pending, 0)
    FROM base b LEFT JOIN pend p ON p.retailer_id = b.retailer_id
   ORDER BY b.retailer_name;
$$;

CREATE OR REPLACE FUNCTION public.get_collection_workspace(p_filter text DEFAULT 'mine')
RETURNS TABLE (retailer_id uuid, retailer_name text, open_invoice_count integer,
               outstanding numeric, oldest_invoice_date date, access_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH access AS (
    SELECT r.id AS retailer_id, r.name AS retailer_name, 'owned'::text AS access_type
      FROM public.retailers r WHERE r.user_id = auth.uid()
    UNION
    SELECT r.id, r.name, 'shared'::text
      FROM public.retailer_shared_access s
      JOIN public.retailers r ON r.id = s.retailer_id
     WHERE s.shared_to_user_id = auth.uid()
       AND s.is_active = true AND s.can_collect_payment = true
       AND s.effective_from <= now()
       AND (s.effective_to IS NULL OR s.effective_to >= now())
  ),
  inv AS (
    SELECT retailer_id,
           COUNT(*) FILTER (WHERE COALESCE(balance_due,0) > 0)::int AS open_invoice_count,
           SUM(COALESCE(balance_due,0)) AS outstanding,
           MIN(invoice_date) FILTER (WHERE COALESCE(balance_due,0) > 0) AS oldest_invoice_date
      FROM public.distributor_secondary_invoices GROUP BY retailer_id
  )
  SELECT a.retailer_id, a.retailer_name,
         COALESCE(i.open_invoice_count,0),
         COALESCE(i.outstanding,0),
         i.oldest_invoice_date,
         a.access_type
    FROM access a LEFT JOIN inv i ON i.retailer_id = a.retailer_id
   WHERE (p_filter = 'all')
      OR (p_filter = 'mine' AND a.access_type = 'owned')
      OR (p_filter = 'shared' AND a.access_type = 'shared')
      OR (p_filter = 'overdue' AND i.oldest_invoice_date IS NOT NULL AND i.oldest_invoice_date < CURRENT_DATE - INTERVAL '30 days')
   ORDER BY outstanding DESC NULLS LAST;
$$;

-- Delegation expiry job
CREATE OR REPLACE FUNCTION public.expire_user_delegations()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.retailer_shared_access SET is_active = false
   WHERE source = 'delegation' AND is_active = true
     AND effective_to IS NOT NULL AND effective_to < now();
  UPDATE public.user_delegations SET status = 'expired'
   WHERE status = 'active' AND effective_to < now();
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire_user_delegations') THEN
      PERFORM cron.unschedule('expire_user_delegations');
    END IF;
    PERFORM cron.schedule('expire_user_delegations', '0 * * * *',
      $cron$ SELECT public.expire_user_delegations(); $cron$);
  END IF;
END $$;

-- Feature flag
INSERT INTO public.feature_flags(feature_key, feature_name, description, category, is_enabled)
VALUES ('user_operational_workspace', 'User Operational Workspace',
        'Enables /my-operations workspace, sharing, delegation, and payment allocation UI', 'operations', true)
ON CONFLICT (feature_key) DO NOTHING;
