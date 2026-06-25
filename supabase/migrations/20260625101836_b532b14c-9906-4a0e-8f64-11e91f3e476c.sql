
-- =====================================================
-- Secondary Packing List: Dispatch + Delivery infrastructure
-- =====================================================

-- 1. Config: eway threshold on companies (single-row settings table de-facto)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS eway_threshold_value numeric NOT NULL DEFAULT 50000;

-- =====================================================
-- 2. delivery_challans
-- =====================================================
CREATE TABLE IF NOT EXISTS public.delivery_challans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_number text UNIQUE NOT NULL,
  distributor_id uuid NOT NULL REFERENCES public.distributors(id) ON DELETE RESTRICT,
  packing_list_id uuid NOT NULL REFERENCES public.packing_lists(id) ON DELETE CASCADE,
  packing_list_assignment_id uuid REFERENCES public.packing_list_assignments(id) ON DELETE SET NULL,
  delivery_run_id uuid REFERENCES public.delivery_runs(id) ON DELETE SET NULL,
  challan_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text NOT NULL DEFAULT 'Line sales — goods for supply; tax invoice to be issued on delivery',
  -- consignor snapshot
  consignor_name text,
  consignor_gstin text,
  consignor_address text,
  -- transport snapshot
  vehicle_number text,
  transporter_name text,
  driver_name text,
  -- totals
  total_qty numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','dispatched','closed','cancelled')),
  eway_bill_id uuid,
  pdf_url text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_challans TO authenticated;
GRANT ALL ON public.delivery_challans TO service_role;

ALTER TABLE public.delivery_challans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Distributor sees own challans"
  ON public.delivery_challans FOR SELECT
  TO authenticated
  USING (
    distributor_id = public.get_distributor_id_for_auth_user()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "Distributor inserts own challans"
  ON public.delivery_challans FOR INSERT
  TO authenticated
  WITH CHECK (
    distributor_id = public.get_distributor_id_for_auth_user()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "Distributor updates own challans"
  ON public.delivery_challans FOR UPDATE
  TO authenticated
  USING (
    distributor_id = public.get_distributor_id_for_auth_user()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_delivery_challans_pl ON public.delivery_challans(packing_list_id);
CREATE INDEX IF NOT EXISTS idx_delivery_challans_dist ON public.delivery_challans(distributor_id);
CREATE INDEX IF NOT EXISTS idx_delivery_challans_run ON public.delivery_challans(delivery_run_id);

-- =====================================================
-- 3. delivery_challan_items
-- =====================================================
CREATE TABLE IF NOT EXISTS public.delivery_challan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_id uuid NOT NULL REFERENCES public.delivery_challans(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  -- snapshot
  product_name text,
  hsn_code text,
  uom text,
  quantity numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_challan_items TO authenticated;
GRANT ALL ON public.delivery_challan_items TO service_role;

ALTER TABLE public.delivery_challan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Items visible via parent challan"
  ON public.delivery_challan_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.delivery_challans c
    WHERE c.id = challan_id
      AND (c.distributor_id = public.get_distributor_id_for_auth_user()
           OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
  ));

CREATE POLICY "Items inserted with parent challan"
  ON public.delivery_challan_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.delivery_challans c
    WHERE c.id = challan_id
      AND (c.distributor_id = public.get_distributor_id_for_auth_user()
           OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
  ));

CREATE INDEX IF NOT EXISTS idx_dci_challan ON public.delivery_challan_items(challan_id);
CREATE INDEX IF NOT EXISTS idx_dci_order ON public.delivery_challan_items(order_id);

-- =====================================================
-- 4. eway_bills
-- =====================================================
CREATE TABLE IF NOT EXISTS public.eway_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eway_bill_number text,
  distributor_id uuid NOT NULL REFERENCES public.distributors(id) ON DELETE RESTRICT,
  document_type text NOT NULL CHECK (document_type IN ('delivery_challan','tax_invoice')),
  challan_id uuid REFERENCES public.delivery_challans(id) ON DELETE SET NULL,
  document_number text,
  document_date date,
  consignment_value numeric NOT NULL DEFAULT 0,
  generated_date timestamptz,
  valid_from date,
  valid_until date,
  -- snapshot
  from_gstin text,
  to_gstin text,
  dispatch_place text,
  ship_to_place text,
  supply_type text DEFAULT 'Outward',
  sub_type text DEFAULT 'Line Sales',
  transaction_type text DEFAULT 'Regular',
  -- transport
  transporter_name text,
  mode text DEFAULT 'Road',
  vehicle_number text,
  approx_distance_km numeric,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','expired')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.eway_bills TO authenticated;
GRANT ALL ON public.eway_bills TO service_role;

ALTER TABLE public.eway_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Distributor sees own eway bills"
  ON public.eway_bills FOR SELECT
  TO authenticated
  USING (
    distributor_id = public.get_distributor_id_for_auth_user()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "Distributor inserts own eway bills"
  ON public.eway_bills FOR INSERT
  TO authenticated
  WITH CHECK (
    distributor_id = public.get_distributor_id_for_auth_user()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "Distributor updates own eway bills"
  ON public.eway_bills FOR UPDATE
  TO authenticated
  USING (
    distributor_id = public.get_distributor_id_for_auth_user()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
  );

-- FK from challan back to eway (added now that table exists)
ALTER TABLE public.delivery_challans
  DROP CONSTRAINT IF EXISTS delivery_challans_eway_bill_fk;
ALTER TABLE public.delivery_challans
  ADD CONSTRAINT delivery_challans_eway_bill_fk
  FOREIGN KEY (eway_bill_id) REFERENCES public.eway_bills(id) ON DELETE SET NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_delivery_challans_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_delivery_challans_touch ON public.delivery_challans;
CREATE TRIGGER trg_delivery_challans_touch
BEFORE UPDATE ON public.delivery_challans
FOR EACH ROW EXECUTE FUNCTION public.tg_delivery_challans_touch();

-- =====================================================
-- 5. Challan number generator
-- =====================================================
CREATE OR REPLACE FUNCTION public.generate_delivery_challan_number(p_date date)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE next_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN challan_number ~ '^DC-[0-9]{8}-[0-9]+$'
      THEN CAST(SPLIT_PART(challan_number,'-',3) AS integer) ELSE 0 END
  ),0) + 1 INTO next_num
  FROM public.delivery_challans
  WHERE challan_date = p_date;
  RETURN 'DC-' || to_char(p_date,'YYYYMMDD') || '-' || lpad(next_num::text,4,'0');
END $$;

-- =====================================================
-- 6. RPC: generate_delivery_challan (idempotent)
-- =====================================================
CREATE OR REPLACE FUNCTION public.generate_delivery_challan(p_packing_list_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pl public.packing_lists;
  v_existing public.delivery_challans;
  v_challan_id uuid;
  v_challan_number text;
  v_assignment public.packing_list_assignments;
  v_dist record;
  v_total_qty numeric := 0;
  v_total_value numeric := 0;
  v_run_id uuid;
BEGIN
  SELECT * INTO v_pl FROM public.packing_lists WHERE id = p_packing_list_id;
  IF v_pl IS NULL THEN RAISE EXCEPTION 'Packing list not found'; END IF;
  IF v_pl.order_type <> 'secondary' THEN RAISE EXCEPTION 'Only secondary packing lists use delivery challans'; END IF;

  -- Idempotency
  SELECT * INTO v_existing
  FROM public.delivery_challans
  WHERE packing_list_id = p_packing_list_id AND status <> 'cancelled'
  LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('challan_id', v_existing.id, 'challan_number', v_existing.challan_number, 'reused', true);
  END IF;

  SELECT * INTO v_assignment FROM public.packing_list_assignments
   WHERE packing_list_id = p_packing_list_id LIMIT 1;

  SELECT id, name, gst_number, address INTO v_dist
   FROM public.distributors WHERE id = v_pl.distributor_id;

  v_challan_number := public.generate_delivery_challan_number(CURRENT_DATE);

  INSERT INTO public.delivery_challans(
    challan_number, distributor_id, packing_list_id, packing_list_assignment_id,
    challan_date, consignor_name, consignor_gstin, consignor_address,
    vehicle_number, transporter_name, driver_name,
    total_qty, total_value, status, created_by
  ) VALUES (
    v_challan_number, v_pl.distributor_id, p_packing_list_id, v_assignment.id,
    CURRENT_DATE, v_dist.name, v_dist.gst_number, v_dist.address,
    COALESCE(v_assignment.van_id, v_pl.dispatch_vehicle),
    v_pl.transporter_name, v_pl.dispatch_driver,
    0, 0, 'issued', auth.uid()
  ) RETURNING id INTO v_challan_id;

  -- Insert items: one per (order, product) summing packed qty per product per retailer order
  INSERT INTO public.delivery_challan_items(
    challan_id, order_id, product_id, product_name, hsn_code, uom, quantity, rate, value
  )
  SELECT
    v_challan_id,
    oi.order_id,
    oi.product_id,
    COALESCE(p.name, oi.product_name) AS product_name,
    COALESCE(p.hsn_code, oi.hsn_code) AS hsn_code,
    COALESCE(oi.uom_code, oi.unit, p.base_unit) AS uom,
    SUM(oi.quantity) AS quantity,
    AVG(oi.rate) AS rate,
    SUM(oi.quantity * oi.rate) AS value
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  LEFT JOIN public.products p ON p.id = oi.product_id
  WHERE o.packing_list_id = p_packing_list_id
  GROUP BY oi.order_id, oi.product_id, p.name, oi.product_name, p.hsn_code, oi.hsn_code,
           oi.uom_code, oi.unit, p.base_unit;

  SELECT COALESCE(SUM(quantity),0), COALESCE(SUM(value),0)
    INTO v_total_qty, v_total_value
  FROM public.delivery_challan_items WHERE challan_id = v_challan_id;

  -- Attach to existing delivery run if any
  SELECT delivery_run_id INTO v_run_id
   FROM public.delivery_run_packing_lists
   WHERE packing_list_id = p_packing_list_id LIMIT 1;

  UPDATE public.delivery_challans
    SET total_qty = v_total_qty,
        total_value = v_total_value,
        delivery_run_id = v_run_id
    WHERE id = v_challan_id;

  RETURN jsonb_build_object(
    'challan_id', v_challan_id,
    'challan_number', v_challan_number,
    'total_qty', v_total_qty,
    'total_value', v_total_value,
    'reused', false
  );
END $$;

GRANT EXECUTE ON FUNCTION public.generate_delivery_challan(uuid) TO authenticated;

-- =====================================================
-- 7. RPC: deliver_and_invoice_retailer_order (atomic + idempotent)
-- p_delivered_items: jsonb array of { order_item_id, product_id, delivered_qty, returned_qty }
-- p_payment: jsonb { amount, method }
-- =====================================================
CREATE OR REPLACE FUNCTION public.deliver_and_invoice_retailer_order(
  p_order_id uuid,
  p_delivered_items jsonb,
  p_pod_url text,
  p_payment jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders;
  v_existing public.distributor_secondary_invoices;
  v_invoice_id uuid;
  v_invoice_number text;
  v_subtotal numeric := 0;
  v_cgst numeric := 0;
  v_sgst numeric := 0;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_balance numeric := 0;
  v_payment_status text;
  v_delivery_status text := 'delivered';
  v_item jsonb;
  v_oi record;
  v_product record;
  v_delivered_qty numeric;
  v_returned_qty numeric;
  v_line_tax numeric;
  v_line_taxable numeric;
  v_total_qty_dispatched numeric := 0;
  v_total_qty_returned numeric := 0;
  v_grn_id uuid;
  v_grn_number text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;

  -- Idempotency: if invoice already exists for this order, return it
  SELECT * INTO v_existing FROM public.distributor_secondary_invoices
    WHERE order_id = p_order_id LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('invoice_id', v_existing.id, 'invoice_number', v_existing.invoice_number, 'reused', true);
  END IF;

  v_invoice_number := 'DINV-' || to_char(now(),'YYYYMMDD') || '-' || lpad(((EXTRACT(EPOCH FROM now())::bigint) % 100000)::text, 5, '0');

  -- Create header (totals filled after items)
  INSERT INTO public.distributor_secondary_invoices(
    distributor_id, retailer_id, order_id, invoice_number, invoice_date,
    subtotal, cgst_amount, sgst_amount, total_amount, amount_paid, balance_due,
    status, payment_status
  ) VALUES (
    v_order.distributor_id, v_order.retailer_id, p_order_id, v_invoice_number, CURRENT_DATE,
    0, 0, 0, 0, 0, 0, 'finalized', 'pending'
  ) RETURNING id INTO v_invoice_id;

  -- Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_delivered_items, '[]'::jsonb)) LOOP
    v_delivered_qty := COALESCE((v_item->>'delivered_qty')::numeric, 0);
    v_returned_qty  := COALESCE((v_item->>'returned_qty')::numeric, 0);
    IF v_delivered_qty <= 0 THEN
      v_total_qty_returned := v_total_qty_returned + v_returned_qty;
      CONTINUE;
    END IF;

    SELECT * INTO v_oi FROM public.order_items WHERE id = (v_item->>'order_item_id')::uuid;
    IF v_oi IS NULL THEN CONTINUE; END IF;

    SELECT id, name, hsn_code, gst_percentage, base_unit INTO v_product
      FROM public.products WHERE id = v_oi.product_id;

    v_line_taxable := v_delivered_qty * v_oi.rate;
    v_line_tax     := v_line_taxable * COALESCE(v_product.gst_percentage, 0) / 100.0;

    INSERT INTO public.distributor_secondary_invoice_items(
      invoice_id, product_name, hsn_code, quantity, unit, rate,
      taxable_amount, cgst_amount, sgst_amount, total_amount
    ) VALUES (
      v_invoice_id,
      COALESCE(v_product.name, v_oi.product_name),
      COALESCE(v_product.hsn_code, v_oi.hsn_code),
      v_delivered_qty,
      COALESCE(v_oi.uom_code, v_oi.unit, v_product.base_unit),
      v_oi.rate,
      v_line_taxable,
      v_line_tax / 2.0,
      v_line_tax / 2.0,
      v_line_taxable + v_line_tax
    );

    v_subtotal := v_subtotal + v_line_taxable;
    v_cgst     := v_cgst + v_line_tax / 2.0;
    v_sgst     := v_sgst + v_line_tax / 2.0;
    v_total_qty_dispatched := v_total_qty_dispatched + v_delivered_qty;
    v_total_qty_returned   := v_total_qty_returned + v_returned_qty;
  END LOOP;

  v_total := v_subtotal + v_cgst + v_sgst;
  v_paid := COALESCE((p_payment->>'amount')::numeric, 0);
  v_balance := GREATEST(v_total - v_paid, 0);
  v_payment_status := CASE
    WHEN v_paid <= 0 THEN 'pending'
    WHEN v_paid >= v_total THEN 'paid'
    ELSE 'partial'
  END;

  UPDATE public.distributor_secondary_invoices
    SET subtotal = v_subtotal,
        cgst_amount = v_cgst,
        sgst_amount = v_sgst,
        total_amount = v_total,
        amount_paid = v_paid,
        balance_due = v_balance,
        payment_status = v_payment_status
    WHERE id = v_invoice_id;

  -- Mark order delivered (partial if any returns)
  IF v_total_qty_returned > 0 AND v_total_qty_dispatched > 0 THEN
    v_delivery_status := 'partially_delivered';
  ELSIF v_total_qty_dispatched <= 0 THEN
    v_delivery_status := 'undelivered';
  END IF;

  UPDATE public.orders
    SET delivery_status = v_delivery_status,
        delivered_at = now(),
        delivery_proof_url = COALESCE(p_pod_url, delivery_proof_url),
        delivery_payment_method = COALESCE(p_payment->>'method', delivery_payment_method),
        amount_collected = v_paid,
        payment_status = v_payment_status,
        invoice_number = v_invoice_number,
        invoice_generated_at = now()
    WHERE id = p_order_id;

  -- Returns → van_return_grn
  IF v_total_qty_returned > 0 THEN
    v_grn_number := 'VRG-' || to_char(now(),'YYYYMMDD') || '-' || lpad(((EXTRACT(EPOCH FROM now())::bigint) % 100000)::text,5,'0');
    INSERT INTO public.van_return_grn(
      van_id, user_id, retailer_id, return_date, return_grn_number, is_verified, notes
    ) VALUES (
      v_order.assigned_van_id, v_order.assigned_agent_id, v_order.retailer_id,
      CURRENT_DATE, v_grn_number, false,
      'Auto-generated from secondary delivery of order ' || p_order_id::text
    ) RETURNING id INTO v_grn_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_delivered_items) LOOP
      v_returned_qty := COALESCE((v_item->>'returned_qty')::numeric, 0);
      IF v_returned_qty > 0 THEN
        INSERT INTO public.van_return_grn_items(
          return_grn_id, product_id, return_quantity, return_reason
        ) VALUES (
          v_grn_id,
          (v_item->>'product_id')::uuid,
          v_returned_qty,
          COALESCE(v_item->>'return_reason', 'Undelivered at retailer')
        );
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'total_amount', v_total,
    'amount_paid', v_paid,
    'balance_due', v_balance,
    'van_return_grn_id', v_grn_id,
    'reused', false
  );
END $$;

GRANT EXECUTE ON FUNCTION public.deliver_and_invoice_retailer_order(uuid, jsonb, text, jsonb) TO authenticated;
