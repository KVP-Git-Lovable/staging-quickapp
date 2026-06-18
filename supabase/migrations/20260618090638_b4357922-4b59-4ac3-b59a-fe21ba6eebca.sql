
-- 1. Allocations table
CREATE TABLE public.retailer_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.retailer_payment_collections(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  retailer_id uuid NOT NULL REFERENCES public.retailers(id) ON DELETE CASCADE,
  amount_applied numeric NOT NULL CHECK (amount_applied > 0),
  applied_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rpa_collection ON public.retailer_payment_allocations(collection_id);
CREATE INDEX idx_rpa_order ON public.retailer_payment_allocations(order_id);
CREATE INDEX idx_rpa_retailer ON public.retailer_payment_allocations(retailer_id);

GRANT SELECT ON public.retailer_payment_allocations TO authenticated;
GRANT ALL ON public.retailer_payment_allocations TO service_role;

ALTER TABLE public.retailer_payment_allocations ENABLE ROW LEVEL SECURITY;

-- Readable if the user can see the underlying collection (delegates to retailer_payment_collections RLS)
CREATE POLICY "rpa_select_via_collection"
ON public.retailer_payment_allocations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.retailer_payment_collections c
    WHERE c.id = retailer_payment_allocations.collection_id
  )
);

-- 2. FIFO apply RPC
CREATE OR REPLACE FUNCTION public.apply_retailer_payment_fifo(
  p_retailer_id uuid,
  p_amount numeric,
  p_collection_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining numeric := p_amount;
  v_allocations jsonb := '[]'::jsonb;
  v_new_pending numeric := 0;
  v_apply numeric;
  v_order RECORD;
  v_already_allocated numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- Idempotency: if this collection already has allocations, return them
  SELECT COALESCE(SUM(amount_applied), 0) INTO v_already_allocated
  FROM public.retailer_payment_allocations
  WHERE collection_id = p_collection_id;

  IF v_already_allocated > 0 THEN
    SELECT COALESCE(SUM(credit_pending_amount), 0) INTO v_new_pending
    FROM public.orders
    WHERE retailer_id = p_retailer_id
      AND is_credit_order = true;

    RETURN jsonb_build_object(
      'already_applied', true,
      'allocated_amount', v_already_allocated,
      'unallocated_amount', GREATEST(p_amount - v_already_allocated, 0),
      'new_pending_amount', v_new_pending,
      'allocations', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'order_id', order_id,
          'applied_amount', amount_applied
        )), '[]'::jsonb)
        FROM public.retailer_payment_allocations
        WHERE collection_id = p_collection_id
      )
    );
  END IF;

  -- Lock the retailer row to serialize concurrent payments
  PERFORM 1 FROM public.retailers WHERE id = p_retailer_id FOR UPDATE;

  FOR v_order IN
    SELECT id, COALESCE(credit_pending_amount, 0) AS pending, COALESCE(credit_paid_amount, 0) AS paid, total_amount
    FROM public.orders
    WHERE retailer_id = p_retailer_id
      AND is_credit_order = true
      AND COALESCE(credit_pending_amount, 0) > 0
    ORDER BY order_date ASC NULLS LAST, created_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_apply := LEAST(v_remaining, v_order.pending);

    UPDATE public.orders
    SET credit_paid_amount = COALESCE(credit_paid_amount, 0) + v_apply,
        credit_pending_amount = COALESCE(credit_pending_amount, 0) - v_apply,
        payment_status = CASE
          WHEN COALESCE(credit_pending_amount, 0) - v_apply <= 0 THEN 'paid'
          ELSE 'partial'
        END
    WHERE id = v_order.id;

    INSERT INTO public.retailer_payment_allocations
      (collection_id, order_id, retailer_id, amount_applied)
    VALUES
      (p_collection_id, v_order.id, p_retailer_id, v_apply);

    v_allocations := v_allocations || jsonb_build_object(
      'order_id', v_order.id,
      'applied_amount', v_apply,
      'remaining_after', v_order.pending - v_apply
    );

    v_remaining := v_remaining - v_apply;
  END LOOP;

  -- Recompute retailer pending as authoritative sum
  SELECT COALESCE(SUM(credit_pending_amount), 0) INTO v_new_pending
  FROM public.orders
  WHERE retailer_id = p_retailer_id
    AND is_credit_order = true;

  UPDATE public.retailers
  SET pending_amount = v_new_pending
  WHERE id = p_retailer_id;

  RETURN jsonb_build_object(
    'already_applied', false,
    'allocated_amount', p_amount - v_remaining,
    'unallocated_amount', v_remaining,
    'new_pending_amount', v_new_pending,
    'allocations', v_allocations
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_retailer_payment_fifo(uuid, numeric, uuid) TO authenticated;

-- 3. Admin-only backfill (uses existing has_role helper if present; otherwise restrict by service_role only)
CREATE OR REPLACE FUNCTION public.backfill_retailer_payment_allocations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_retailer RECORD;
  v_collection RECORD;
  v_processed int := 0;
  v_skipped int := 0;
BEGIN
  -- Caller must be admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins may run backfill';
  END IF;

  FOR v_collection IN
    SELECT c.id, c.retailer_id, c.amount
    FROM public.retailer_payment_collections c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.retailer_payment_allocations a WHERE a.collection_id = c.id
    )
    ORDER BY c.created_at ASC
  LOOP
    BEGIN
      PERFORM public.apply_retailer_payment_fifo(
        v_collection.retailer_id, v_collection.amount, v_collection.id
      );
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('processed', v_processed, 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_retailer_payment_allocations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_retailer_payment_allocations() TO authenticated;
