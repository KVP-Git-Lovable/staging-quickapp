-- Sync primary packing_list.status from child GRN-driven primary_orders.status.
-- When every primary_order tied to a packing_list is 'delivered', flip the
-- packing list (currently 'dispatched') to 'delivered' and stamp delivered_at.
-- Otherwise leave the packing list unchanged (no partial status at list level).
CREATE OR REPLACE FUNCTION public.sync_primary_packing_list_delivery(p_packing_list_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_delivered int;
  v_current_status text;
BEGIN
  IF p_packing_list_id IS NULL THEN
    RETURN;
  END IF;

  SELECT status INTO v_current_status
  FROM public.packing_lists
  WHERE id = p_packing_list_id;

  IF v_current_status IS NULL THEN
    RETURN;
  END IF;

  -- Only act when packing list is in 'dispatched' (the only valid transition is
  -- dispatched -> delivered per enforce_packing_list_status_transition).
  IF v_current_status <> 'dispatched' THEN
    RETURN;
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'delivered')
    INTO v_total, v_delivered
  FROM public.primary_orders
  WHERE packing_list_id = p_packing_list_id;

  IF v_total > 0 AND v_delivered = v_total THEN
    UPDATE public.packing_lists
    SET status = 'delivered',
        delivered_at = COALESCE(delivered_at, now()),
        updated_at = now()
    WHERE id = p_packing_list_id
      AND status = 'dispatched';
  END IF;
END;
$$;

-- Trigger: when a primary_order status changes, recompute its packing list.
CREATE OR REPLACE FUNCTION public.trg_sync_primary_packing_list_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.packing_list_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
    PERFORM public.sync_primary_packing_list_delivery(NEW.packing_list_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_primary_packing_list_delivery_trg ON public.primary_orders;
CREATE TRIGGER sync_primary_packing_list_delivery_trg
AFTER INSERT OR UPDATE OF status, packing_list_id ON public.primary_orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_primary_packing_list_delivery();