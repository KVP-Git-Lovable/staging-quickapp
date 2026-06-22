
-- 1) Sequence + race-free invoice numbering
CREATE SEQUENCE IF NOT EXISTS public.primary_invoice_seq;

CREATE OR REPLACE FUNCTION public.generate_primary_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 'PINV-' || to_char(now(), 'YYMM') || '-' ||
         lpad(nextval('public.primary_invoice_seq')::text, 5, '0');
END;
$$;

-- 2) Generate one draft primary invoice per primary order on a packed/ready primary packing list.
--    Header-only. Lines are read back from primary_order_items at render time.
CREATE OR REPLACE FUNCTION public.generate_primary_invoices_atomic(p_packing_list_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pl              record;
  v_order           record;
  v_line            record;
  v_invoice_id      uuid;
  v_invoice_number  text;
  v_billed_qty      numeric;
  v_gross           numeric;
  v_discount        numeric;
  v_taxable         numeric;
  v_tax             numeric;
  v_sub_subtotal    numeric;
  v_sub_discount    numeric;
  v_sub_tax         numeric;
  v_due             date;
  v_days            integer;
  v_results         jsonb := '[]'::jsonb;
  v_count           integer := 0;
BEGIN
  -- Validate packing list
  SELECT * INTO v_pl FROM public.packing_lists
  WHERE id = p_packing_list_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Packing list not found');
  END IF;
  IF COALESCE(v_pl.order_type, 'secondary') <> 'primary' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a primary packing list');
  END IF;
  IF v_pl.status NOT IN ('packed', 'ready') THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Packing list must be packed or ready (current: ' || v_pl.status || ')');
  END IF;

  FOR v_order IN
    SELECT po.id, po.distributor_id, po.payment_terms, po.payment_term
    FROM public.primary_orders po
    WHERE po.packing_list_id = p_packing_list_id
  LOOP
    -- Idempotency: skip if invoice already exists for this order
    IF EXISTS (SELECT 1 FROM public.primary_invoices WHERE order_id = v_order.id) THEN
      CONTINUE;
    END IF;

    v_sub_subtotal := 0;
    v_sub_discount := 0;
    v_sub_tax      := 0;

    -- Pre-compute totals
    FOR v_line IN
      SELECT poi.id, poi.unit_price, poi.discount_percent, poi.tax_percent,
             -- proportional billed qty: total packed on each pl_item × this source's share
             COALESCE((
               SELECT SUM(
                 COALESCE(pbatch_totals.packed_total, 0) *
                 CASE WHEN pl_totals.total_allocated > 0
                      THEN s.allocated_qty / pl_totals.total_allocated
                      ELSE 0 END
               )
               FROM public.packing_list_item_sources s
               LEFT JOIN LATERAL (
                 SELECT SUM(COALESCE(b.packed_qty,0)) AS packed_total
                 FROM public.packing_list_item_batches b
                 WHERE b.packing_list_item_id = s.packing_list_item_id
               ) pbatch_totals ON true
               LEFT JOIN LATERAL (
                 SELECT SUM(COALESCE(s2.allocated_qty,0)) AS total_allocated
                 FROM public.packing_list_item_sources s2
                 WHERE s2.packing_list_item_id = s.packing_list_item_id
               ) pl_totals ON true
               WHERE s.order_item_id = poi.id
                 AND s.order_id = v_order.id
                 AND s.packing_list_item_id IN (
                   SELECT id FROM public.packing_list_items WHERE packing_list_id = p_packing_list_id
                 )
             ), 0) AS billed_qty
      FROM public.primary_order_items poi
      WHERE poi.order_id = v_order.id
    LOOP
      v_billed_qty := COALESCE(v_line.billed_qty, 0);
      IF v_billed_qty <= 0 THEN CONTINUE; END IF;

      v_gross    := v_billed_qty * COALESCE(v_line.unit_price, 0);
      v_discount := v_gross * COALESCE(v_line.discount_percent, 0) / 100;
      v_taxable  := v_gross - v_discount;
      v_tax      := v_taxable * COALESCE(v_line.tax_percent, 0) / 100;

      v_sub_subtotal := v_sub_subtotal + v_taxable;
      v_sub_discount := v_sub_discount + v_discount;
      v_sub_tax      := v_sub_tax + v_tax;
    END LOOP;

    -- Determine due date from payment terms (e.g. net_30, net_15, net_45, net_60)
    v_days := 0;
    IF COALESCE(v_order.payment_terms, v_order.payment_term, '') ~* '^net[_\- ]?\d+$' THEN
      v_days := COALESCE(NULLIF(regexp_replace(COALESCE(v_order.payment_terms, v_order.payment_term, ''), '\D', '', 'g'), ''), '0')::integer;
    END IF;
    v_due := CURRENT_DATE + (v_days || ' days')::interval;

    v_invoice_number := public.generate_primary_invoice_number();

    INSERT INTO public.primary_invoices (
      invoice_number, order_id, distributor_id,
      invoice_date, due_date,
      subtotal, discount_amount, tax_amount, total_amount,
      status
    ) VALUES (
      v_invoice_number, v_order.id, v_order.distributor_id,
      CURRENT_DATE, v_due,
      ROUND(v_sub_subtotal::numeric, 2),
      ROUND(v_sub_discount::numeric, 2),
      ROUND(v_sub_tax::numeric, 2),
      ROUND((v_sub_subtotal + v_sub_tax)::numeric, 2),
      'draft'
    ) RETURNING id INTO v_invoice_id;

    v_results := v_results || jsonb_build_object(
      'invoice_id', v_invoice_id,
      'invoice_number', v_invoice_number,
      'order_id', v_order.id,
      'total_amount', ROUND((v_sub_subtotal + v_sub_tax)::numeric, 2)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'packing_list_id', p_packing_list_id,
    'invoices', v_results,
    'count', v_count
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 3) Finalize a primary invoice (document-only in v1).
--    NOTE: AR/ledger posting and primary_orders.payment_status updates are
--    intentionally deferred to a follow-up phase.
CREATE OR REPLACE FUNCTION public.finalize_primary_invoice_atomic(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
BEGIN
  SELECT * INTO v_inv FROM public.primary_invoices
  WHERE id = p_invoice_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF v_inv.status = 'finalized' THEN
    RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'already_finalized', true);
  END IF;

  UPDATE public.primary_invoices
  SET status = 'finalized',
      finalized_at = now(),
      finalized_by = COALESCE(auth.uid()::text, finalized_by),
      updated_at = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 4) Grants — match the existing packing-list RPC roles
GRANT EXECUTE ON FUNCTION public.generate_primary_invoice_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_primary_invoices_atomic(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_primary_invoice_atomic(uuid) TO authenticated, service_role;
GRANT USAGE ON SEQUENCE public.primary_invoice_seq TO authenticated, service_role;
