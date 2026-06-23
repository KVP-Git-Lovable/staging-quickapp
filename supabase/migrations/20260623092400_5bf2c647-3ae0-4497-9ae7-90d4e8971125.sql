
CREATE OR REPLACE FUNCTION public.sync_primary_packing_list_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pl_id uuid := NEW.packing_list_id;
  v_remaining int;
BEGIN
  IF v_pl_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'delivered' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_remaining
  FROM public.primary_orders
  WHERE packing_list_id = v_pl_id
    AND status <> 'delivered';

  IF v_remaining = 0 THEN
    UPDATE public.packing_lists
       SET status = 'delivered',
           delivered_at = now()
     WHERE id = v_pl_id
       AND status = 'dispatched';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_primary_packing_list_delivery ON public.primary_orders;
DROP TRIGGER IF EXISTS trg_sync_primary_packing_list_on_delivery ON public.primary_orders;

CREATE TRIGGER trg_sync_primary_packing_list_on_delivery
AFTER INSERT OR UPDATE OF status, packing_list_id ON public.primary_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_primary_packing_list_on_delivery();

-- One-time backfill for lists stuck on dispatched whose orders are already delivered
UPDATE public.packing_lists pl
SET status = 'delivered',
    delivered_at = COALESCE(pl.delivered_at, now())
WHERE pl.status = 'dispatched'
  AND pl.order_type = 'primary'
  AND EXISTS (SELECT 1 FROM public.primary_orders po WHERE po.packing_list_id = pl.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.primary_orders po
    WHERE po.packing_list_id = pl.id
      AND po.status <> 'delivered'
  );
