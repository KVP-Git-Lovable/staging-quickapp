ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS superseded_by_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revises_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

COMMENT ON COLUMN public.invoices.superseded_by_invoice_id IS 'Set on an OLD invoice replaced by an edit; points to the new invoice.';
COMMENT ON COLUMN public.invoices.revises_invoice_id IS 'Set on a NEW invoice from an edit; points back to the replaced invoice.';