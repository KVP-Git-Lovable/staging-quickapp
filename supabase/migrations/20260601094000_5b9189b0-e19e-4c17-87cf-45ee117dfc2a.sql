CREATE TABLE IF NOT EXISTS public.retailer_beat_transfer_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id     uuid NOT NULL,
  retailer_name   text NOT NULL,
  from_beat_id    uuid NOT NULL,
  from_beat_name  text NOT NULL,
  to_beat_id      uuid NOT NULL,
  to_beat_name    text NOT NULL,
  transferred_by  uuid NOT NULL,
  transferred_at  timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.retailer_beat_transfer_history TO authenticated;
GRANT ALL ON public.retailer_beat_transfer_history TO service_role;

ALTER TABLE public.retailer_beat_transfer_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read transfer history"
  ON public.retailer_beat_transfer_history FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Users insert their own transfer history rows"
  ON public.retailer_beat_transfer_history FOR INSERT
  TO authenticated WITH CHECK (transferred_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_rbth_retailer ON public.retailer_beat_transfer_history(retailer_id);
CREATE INDEX IF NOT EXISTS idx_rbth_from_beat ON public.retailer_beat_transfer_history(from_beat_id);
CREATE INDEX IF NOT EXISTS idx_rbth_to_beat ON public.retailer_beat_transfer_history(to_beat_id);