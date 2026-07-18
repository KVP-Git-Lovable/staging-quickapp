
-- Enable market intelligence portal on employees
ALTER TABLE public.employee_directory
  ADD COLUMN IF NOT EXISTS portal_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_pin text;

-- Employee market intelligence visits
CREATE TABLE IF NOT EXISTS public.employee_market_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employee_directory(id) ON DELETE CASCADE,
  employee_name text,
  retailer_id uuid REFERENCES public.retailers(id) ON DELETE SET NULL,
  retailer_name text,
  is_new_retailer boolean NOT NULL DEFAULT false,
  territory_id uuid REFERENCES public.territories(id) ON DELETE SET NULL,
  territory_executive_id uuid,
  territory_executive_name text,
  retailer_photo_url text,
  latitude numeric,
  longitude numeric,
  visit_purpose text,
  retailer_response text,
  product_interest text,
  competitor_notes text,
  pricing_feedback text,
  supply_issues text,
  overall_sentiment text,
  next_action text,
  additional_notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_market_visits TO authenticated;
GRANT ALL ON public.employee_market_visits TO service_role;

ALTER TABLE public.employee_market_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emv_read_all_auth" ON public.employee_market_visits
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "emv_insert_auth" ON public.employee_market_visits
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "emv_update_own" ON public.employee_market_visits
  FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

CREATE OR REPLACE FUNCTION public.emv_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_emv_touch ON public.employee_market_visits;
CREATE TRIGGER trg_emv_touch BEFORE UPDATE ON public.employee_market_visits
  FOR EACH ROW EXECUTE FUNCTION public.emv_touch_updated_at();
