
-- 1) credit_note_config
CREATE TABLE IF NOT EXISTS public.credit_note_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requires_approval boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.credit_note_config TO authenticated;
GRANT ALL ON public.credit_note_config TO service_role;

ALTER TABLE public.credit_note_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='credit_note_config' AND policyname='cn_config_read') THEN
    CREATE POLICY "cn_config_read" ON public.credit_note_config FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='credit_note_config' AND policyname='cn_config_admin') THEN
    CREATE POLICY "cn_config_admin" ON public.credit_note_config FOR ALL
      USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
  END IF;
END $$;

INSERT INTO public.credit_note_config (requires_approval)
  SELECT false WHERE NOT EXISTS (SELECT 1 FROM public.credit_note_config);

-- 2) Allow 'return_credit' on credit_ledger
ALTER TABLE public.credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_type_check;
ALTER TABLE public.credit_ledger ADD CONSTRAINT credit_ledger_type_check
  CHECK (type = ANY (ARRAY['order_credit','order_cancel','payment','adjustment',
    'cancel_refund','cancel_carry_forward','edit_advance_credit','return_credit']));

-- 3) credit_notes additions
ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_to_ledger boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT;

-- 4) credit_note_items variant linkage
ALTER TABLE public.credit_note_items
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE RESTRICT;

-- 5) returnable_qty helper
CREATE OR REPLACE FUNCTION public.returnable_qty(p_order_id uuid, p_product_id uuid, p_variant_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $func$
  SELECT GREATEST(0,
    COALESCE((SELECT SUM(oi.quantity) FROM order_items oi
       WHERE oi.order_id = p_order_id AND oi.product_id = p_product_id
         AND (p_variant_id IS NULL OR oi.variant_id = p_variant_id)),0)
  - COALESCE((SELECT SUM(cni.quantity) FROM credit_note_items cni
       JOIN credit_notes cn ON cn.id = cni.credit_note_id
       WHERE cni.original_order_id = p_order_id AND cni.product_id = p_product_id
         AND (p_variant_id IS NULL OR cni.variant_id = p_variant_id)
         AND COALESCE(cn.approval_status,'approved') <> 'rejected'
         AND COALESCE(cn.status,'issued') <> 'cancelled'),0));
$func$;
