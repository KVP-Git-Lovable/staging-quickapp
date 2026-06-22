-- Phase 2a: Order edit policy table (single-row config)
CREATE TABLE IF NOT EXISTS public.order_edit_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edit_enabled BOOLEAN NOT NULL DEFAULT true,
  editable_until TEXT NOT NULL DEFAULT 'invoice_generated',
  -- room for future expansion (e.g. 'dispatched', 'delivered', 'same_day', etc.)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT ON public.order_edit_policy TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_edit_policy TO authenticated;
GRANT ALL ON public.order_edit_policy TO service_role;

ALTER TABLE public.order_edit_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view order edit policy" ON public.order_edit_policy;
CREATE POLICY "Anyone can view order edit policy"
  ON public.order_edit_policy FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins manage order edit policy" ON public.order_edit_policy;
CREATE POLICY "Admins manage order edit policy"
  ON public.order_edit_policy FOR ALL
  USING (public.is_system_admin(auth.uid()))
  WITH CHECK (public.is_system_admin(auth.uid()));

-- Seed a single default row
INSERT INTO public.order_edit_policy (edit_enabled, editable_until)
SELECT true, 'invoice_generated'
WHERE NOT EXISTS (SELECT 1 FROM public.order_edit_policy);
