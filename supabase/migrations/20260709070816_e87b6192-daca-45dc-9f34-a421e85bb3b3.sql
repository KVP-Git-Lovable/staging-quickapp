CREATE OR REPLACE FUNCTION public.retailer_has_history(p_retailer_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM orders                       WHERE retailer_id = p_retailer_id)
      OR EXISTS (SELECT 1 FROM visits                       WHERE retailer_id = p_retailer_id)
      OR EXISTS (SELECT 1 FROM credit_ledger                WHERE retailer_id = p_retailer_id)
      OR EXISTS (SELECT 1 FROM credit_notes                 WHERE retailer_id = p_retailer_id)
      OR EXISTS (SELECT 1 FROM retailer_payment_collections WHERE retailer_id = p_retailer_id);
$$;

CREATE OR REPLACE FUNCTION public.beat_has_history(p_beat_id text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM orders                    WHERE beat_id = p_beat_id)
      OR EXISTS (SELECT 1 FROM retailers                 WHERE beat_id = p_beat_id)
      OR EXISTS (SELECT 1 FROM retailer_beat_assignments WHERE beat_id = p_beat_id);
$$;

GRANT EXECUTE ON FUNCTION public.retailer_has_history(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.beat_has_history(text) TO authenticated, service_role;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_retailer_id_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_retailer_id_fkey
  FOREIGN KEY (retailer_id) REFERENCES public.retailers(id) ON DELETE RESTRICT;

ALTER TABLE public.daily_retailer_assignments DROP CONSTRAINT IF EXISTS daily_retailer_assignments_retailer_id_fkey;
ALTER TABLE public.daily_retailer_assignments ADD CONSTRAINT daily_retailer_assignments_retailer_id_fkey
  FOREIGN KEY (retailer_id) REFERENCES public.retailers(id) ON DELETE RESTRICT;