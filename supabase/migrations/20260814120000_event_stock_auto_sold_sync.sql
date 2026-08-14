-- Event stock auto-sync hardening.
--
-- Submitted event orders update event_stock_items.sold_qty through an
-- AFTER INSERT trigger on order_items (the client-side RPC
-- apply_event_stock_for_order stays as a fallback and skips when the
-- trigger already recorded the order in event_stock_audit). This
-- migration captures that trigger in the repo and fixes two gaps:
--
-- 1. Auto-created stock rows now carry the order line's unit, so the
--    tracker shows which unit the sold quantity is counted in.
-- 2. Order quantities are converted into the stock row's unit via the
--    UOM master before being added (an order for 2 BOX no longer adds
--    "2" to a row tracked in PIECE). Unmapped/legacy units fall back
--    to 1:1.

ALTER TABLE public.event_stock_audit ADD COLUMN IF NOT EXISTS order_item_id uuid;
CREATE INDEX IF NOT EXISTS idx_event_stock_audit_order_item ON public.event_stock_audit(order_item_id);

CREATE OR REPLACE FUNCTION public.trg_apply_event_stock_after_order_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_event_id uuid;
  v_day_id uuid;
  v_row RECORD;
  v_pid uuid;
  v_price numeric;
  v_qty numeric;
  v_conv_order numeric;
  v_conv_stock numeric;
BEGIN
  -- Idempotent per order item: offline sync can replay inserts.
  IF EXISTS (SELECT 1 FROM public.event_stock_audit WHERE order_item_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT id, visit_id, order_date, status, user_id
    INTO v_order
  FROM public.orders WHERE id = NEW.order_id;
  IF v_order.visit_id IS NULL OR v_order.status = 'cancelled' THEN RETURN NEW; END IF;
  IF NEW.product_id IS NULL OR NEW.quantity IS NULL OR NEW.quantity <= 0 THEN RETURN NEW; END IF;
  BEGIN
    v_pid := NEW.product_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  SELECT id INTO v_event_id FROM public.activity_events WHERE visit_id = v_order.visit_id LIMIT 1;
  IF v_event_id IS NULL THEN RETURN NEW; END IF;

  -- Stock day matching the order date, else day 1.
  SELECT id INTO v_day_id
  FROM public.event_stock_days
  WHERE event_id = v_event_id AND date = v_order.order_date
  LIMIT 1;
  IF v_day_id IS NULL THEN
    SELECT id INTO v_day_id
    FROM public.event_stock_days
    WHERE event_id = v_event_id
    ORDER BY day_number ASC
    LIMIT 1;
  END IF;
  IF v_day_id IS NULL THEN RETURN NEW; END IF;

  SELECT id, sold_qty, unit INTO v_row
  FROM public.event_stock_items
  WHERE event_stock_day_id = v_day_id AND product_id = v_pid
  FOR UPDATE;

  IF NOT FOUND THEN
    v_price := COALESCE(NEW.rate, (SELECT rate FROM public.products WHERE id = v_pid), 0);
    INSERT INTO public.event_stock_items(event_stock_day_id, product_id, unit, stock_taken, sold_qty, price)
    VALUES (v_day_id, v_pid, NULLIF(NEW.unit, ''), 0, 0, v_price)
    RETURNING id, sold_qty, unit INTO v_row;
  END IF;

  -- Convert the ordered quantity into the stock row's unit.
  v_qty := NEW.quantity;
  IF v_row.unit IS NOT NULL AND NULLIF(NEW.unit, '') IS NOT NULL
     AND lower(NEW.unit) <> lower(v_row.unit) THEN
    -- Order line's factor: prefer its uom_id snapshot, else match by code.
    SELECT m.conversion_to_base INTO v_conv_order
    FROM public.product_uom_mapping m
    WHERE m.product_id = v_pid AND m.uom_id = NEW.uom_id AND m.is_active IS NOT FALSE
    LIMIT 1;
    IF v_conv_order IS NULL THEN
      SELECT m.conversion_to_base INTO v_conv_order
      FROM public.product_uom_mapping m
      JOIN public.uom_master u ON u.id = m.uom_id
      WHERE m.product_id = v_pid AND lower(u.code) = lower(NEW.unit) AND m.is_active IS NOT FALSE
      LIMIT 1;
    END IF;
    SELECT m.conversion_to_base INTO v_conv_stock
    FROM public.product_uom_mapping m
    JOIN public.uom_master u ON u.id = m.uom_id
    WHERE m.product_id = v_pid AND lower(u.code) = lower(v_row.unit) AND m.is_active IS NOT FALSE
    LIMIT 1;
    IF v_conv_order IS NOT NULL AND v_conv_stock IS NOT NULL AND v_conv_stock > 0 THEN
      v_qty := round((NEW.quantity * v_conv_order / v_conv_stock)::numeric, 3);
    END IF;
  END IF;

  UPDATE public.event_stock_items
     SET sold_qty = v_row.sold_qty + v_qty,
         updated_at = now()
   WHERE id = v_row.id;

  INSERT INTO public.event_stock_audit(
    event_stock_item_id, event_id, event_stock_day_id, product_id,
    order_id, order_item_id, visit_id, user_id,
    delta_qty, prev_sold_qty, new_sold_qty, source
  ) VALUES (
    v_row.id, v_event_id, v_day_id, v_pid,
    v_order.id, NEW.id, v_order.visit_id, v_order.user_id,
    v_qty, v_row.sold_qty, v_row.sold_qty + v_qty, 'order_submit'
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the order itself over a stock-tracker problem.
  RAISE WARNING 'event-stock trigger failed for order_item %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_stock_on_order_items ON public.order_items;
CREATE TRIGGER trg_event_stock_on_order_items
AFTER INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.trg_apply_event_stock_after_order_items();
