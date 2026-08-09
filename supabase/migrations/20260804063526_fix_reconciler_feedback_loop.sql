-- BUG: reconcile_retailer_account() derived "money in" partly from
-- orders.credit_paid_amount, a column the same function overwrites a few lines later.
-- Every re-run therefore re-counted its own output as new money:
--   run 1: in = collections
--   run 2: in = collections + (what run 1 wrote)   <-- runaway
-- It only stayed stable when retailer_payment_allocations happened to cover the amount.
--
-- FIX: money in is now derived only from IMMUTABLE sources —
--   retailer_payment_collections (the audited payment record), plus
--   retailers.legacy_direct_paid, a one-time snapshot of pre-collections payments
--   that were only ever recorded on the order row.
-- orders.credit_paid_amount becomes pure output and is never read back as input.

ALTER TABLE public.retailers
  ADD COLUMN IF NOT EXISTS legacy_direct_paid numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.retailers.legacy_direct_paid IS
  'One-time snapshot of payments recorded directly on orders before the collections '
  'module existed. Immutable input to reconcile_retailer_account. Do not recompute '
  'from orders.credit_paid_amount — that column is the reconciler''s own output.';

-- Snapshot. Only retailers with ZERO collections can have a trustworthy legacy figure:
-- with no collections the reconciler could not have inflated the column. Where
-- collections exist, any excess is loop residue, not real money, so it is set to 0
-- and the audited collections record becomes the sole authority.
UPDATE public.retailers r
SET legacy_direct_paid = COALESCE((
      SELECT sum(o.credit_paid_amount) FROM public.orders o
      WHERE o.retailer_id = r.id AND o.is_credit_order
        AND COALESCE(o.status,'') NOT IN ('cancelled','replaced')), 0)
WHERE NOT EXISTS (
  SELECT 1 FROM public.retailer_payment_collections c WHERE c.retailer_id = r.id);

CREATE OR REPLACE FUNCTION public.reconcile_retailer_account(p_retailer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collections numeric := 0; v_legacy numeric := 0; v_total_in numeric := 0;
  v_remaining numeric := 0; v_apply numeric := 0;
  v_live_total numeric := 0; v_pending numeric := 0; v_advance numeric := 0;
  v_order RECORD;
BEGIN
  IF p_retailer_id IS NULL THEN RETURN NULL; END IF;
  PERFORM 1 FROM public.retailers WHERE id = p_retailer_id FOR UPDATE;

  -- Money in, from immutable sources only.
  SELECT COALESCE(SUM(amount),0) INTO v_collections
  FROM public.retailer_payment_collections WHERE retailer_id = p_retailer_id;

  SELECT COALESCE(legacy_direct_paid,0) INTO v_legacy
  FROM public.retailers WHERE id = p_retailer_id;

  v_total_in := v_collections + v_legacy;

  -- Release payment stranded on dead (replaced/cancelled) versions.
  UPDATE public.orders
  SET credit_paid_amount = 0, credit_pending_amount = 0, payment_status = 'pending'
  WHERE retailer_id = p_retailer_id AND is_credit_order = true
    AND COALESCE(status,'') IN ('cancelled','replaced');

  v_remaining := v_total_in;

  -- FIFO oldest-first across LIVE credit orders only.
  FOR v_order IN
    SELECT id, COALESCE(total_amount,0) AS total_amount
    FROM public.orders
    WHERE retailer_id = p_retailer_id AND is_credit_order = true
      AND COALESCE(status,'') NOT IN ('cancelled','replaced')
    ORDER BY order_date ASC NULLS LAST, created_at ASC
    FOR UPDATE
  LOOP
    v_live_total := v_live_total + v_order.total_amount;
    v_apply := LEAST(GREATEST(v_remaining,0), v_order.total_amount);

    UPDATE public.orders
    SET credit_paid_amount    = v_apply,
        credit_pending_amount = v_order.total_amount - v_apply,
        payment_status = CASE
          WHEN v_order.total_amount - v_apply <= 0 THEN 'paid'
          WHEN v_apply <= 0 THEN 'pending'
          ELSE 'partial' END
    WHERE id = v_order.id;

    v_remaining := v_remaining - v_apply;
  END LOOP;

  v_pending := GREATEST(0, v_live_total - v_total_in);   -- rule 1: never negative
  v_advance := GREATEST(0, v_total_in - v_live_total);   -- rule 2: excess -> advance

  UPDATE public.retailers
  SET pending_amount = v_pending, advance_credit = v_advance, updated_at = now()
  WHERE id = p_retailer_id;

  RETURN jsonb_build_object(
    'retailer_id', p_retailer_id, 'collections', v_collections,
    'legacy_direct_paid', v_legacy, 'total_in', v_total_in,
    'live_orders_total', v_live_total, 'pending_amount', v_pending,
    'advance_credit', v_advance);
END;
$$;