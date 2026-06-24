CREATE OR REPLACE FUNCTION public.create_invoice_on_order_confirmed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id uuid;
  v_invoice_no text;
  v_company_id uuid;
  v_sub_total numeric := 0;
  v_total_tax numeric := 0;
  v_total_amount numeric := 0;
  v_existing uuid;
BEGIN
  -- Only act when transitioning into 'confirmed'
  IF NEW.status IS DISTINCT FROM 'confirmed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- NON-BLOCKING: invoice generation must NEVER abort order creation / sync.
  BEGIN
    -- Guard: do not duplicate if an invoice already exists for this order
    SELECT id INTO v_existing FROM public.invoices WHERE order_id = NEW.id LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN NEW;
    END IF;

    v_invoice_no := public.generate_invoice_number();

    -- Company: first companies row (nullable FK; safe if none)
    SELECT id INTO v_company_id FROM public.companies ORDER BY created_at NULLS LAST LIMIT 1;

    SELECT
      COALESCE(SUM(oi.quantity * oi.rate), 0),
      COALESCE(SUM(COALESCE(oi.cgst_amount,0) + COALESCE(oi.sgst_amount,0) + COALESCE(oi.igst_amount,0) + COALESCE(oi.cess_amount,0)), 0)
    INTO v_sub_total, v_total_tax
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id;

    v_total_amount := COALESCE(NEW.total_amount, v_sub_total + v_total_tax);

    -- customer_id MUST be NULL: its FK points to the (unused, empty) customers table,
    -- not retailers. The retailer is carried via order_id -> orders.retailer_id.
    INSERT INTO public.invoices (
      invoice_number, company_id, customer_id, order_id,
      invoice_date, sub_total, total_tax, total_amount,
      status, created_by, owner_id_snapshot
    ) VALUES (
      v_invoice_no, v_company_id, NULL, NEW.id,
      COALESCE(NEW.order_date::date, CURRENT_DATE),
      v_sub_total, v_total_tax, v_total_amount,
      'generated', NEW.user_id, NEW.user_id
    )
    RETURNING id INTO v_invoice_id;

    INSERT INTO public.invoice_items (
      invoice_id, description, hsn_sac, quantity, unit,
      price_per_unit, gst_rate, taxable_amount,
      cgst_amount, sgst_amount, total_amount
    )
    SELECT
      v_invoice_id, oi.product_name, oi.hsn_code, oi.quantity, oi.unit, oi.rate,
      COALESCE(oi.tax_rate_snapshot, COALESCE(oi.cgst_rate,0) + COALESCE(oi.sgst_rate,0) + COALESCE(oi.igst_rate,0), 0),
      oi.quantity * oi.rate,
      COALESCE(oi.cgst_amount,0), COALESCE(oi.sgst_amount,0),
      (oi.quantity * oi.rate) + COALESCE(oi.cgst_amount,0) + COALESCE(oi.sgst_amount,0) + COALESCE(oi.igst_amount,0) + COALESCE(oi.cess_amount,0)
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id;

    IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
      UPDATE public.orders SET invoice_number = v_invoice_no WHERE id = NEW.id;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Never block the order; log and continue without an invoice.
    RAISE WARNING 'create_invoice_on_order_confirmed failed for order %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;