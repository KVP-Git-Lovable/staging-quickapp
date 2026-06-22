-- Phase 2b-1: Edit order foundation (additive only)

-- 1) order_edit_log (mirror of order_cancellation_log)
CREATE TABLE IF NOT EXISTS public.order_edit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_order_id uuid NOT NULL,
  replacement_order_id uuid,
  edited_by uuid,
  reason text,
  edit_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_edit_log TO authenticated;
GRANT ALL ON public.order_edit_log TO service_role;

ALTER TABLE public.order_edit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their edit logs" ON public.order_edit_log;
CREATE POLICY "Users can view their edit logs"
  ON public.order_edit_log FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert edit logs" ON public.order_edit_log;
CREATE POLICY "Users can insert edit logs"
  ON public.order_edit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_order_edit_log_original ON public.order_edit_log(original_order_id);
CREATE INDEX IF NOT EXISTS idx_order_edit_log_replacement ON public.order_edit_log(replacement_order_id);

-- 2) Linkage columns on orders (idempotent)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS replaces_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS replaced_by_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.orders.replaced_by_order_id IS
  'Set on the OLD (superseded) order — points to the new replacement order created by the edit flow.';
COMMENT ON COLUMN public.orders.replaces_order_id IS
  'Set on the NEW (replacement) order — points back to the original order it replaces.';

CREATE INDEX IF NOT EXISTS idx_orders_replaces_order_id ON public.orders(replaces_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_replaced_by_order_id ON public.orders(replaced_by_order_id);
