CREATE TABLE public.activity_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_sales_activity boolean NOT NULL DEFAULT false,
  productivity_weight numeric NOT NULL DEFAULT 1.0,
  requires_check_in boolean NOT NULL DEFAULT true,
  default_duration_minutes integer,
  color text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_types TO authenticated;
GRANT ALL ON public.activity_types TO service_role;

ALTER TABLE public.activity_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_types_read ON public.activity_types
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY activity_types_write ON public.activity_types
  FOR ALL
  USING (public.user_has_permission(auth.uid(), 'activity_type_settings', 'can_edit'))
  WITH CHECK (public.user_has_permission(auth.uid(), 'activity_type_settings', 'can_edit'));

CREATE OR REPLACE FUNCTION public.update_activity_types_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_activity_types_updated_at
  BEFORE UPDATE ON public.activity_types
  FOR EACH ROW EXECUTE FUNCTION public.update_activity_types_updated_at();

INSERT INTO public.activity_types (code, name, is_sales_activity, sort_order) VALUES
  ('counter_sale','Counter Sale', true, 10),
  ('event','Event', false, 20),
  ('other','Other', false, 999),
  ('joint_beat_visit','Joint Visit', false, 30),
  ('new_beat_survey','Route Survey', false, 40),
  ('distributor_visit','Distributor Visit', false, 50),
  ('meeting_training','Meeting / Training', false, 60),
  ('demo','Product Demo', false, 70),
  ('promotion','Promotion', false, 80),
  ('doctor_visit','Doctor Visit', false, 90),
  ('celebration','Celebration', false, 100),
  ('marketing_event','Marketing Event', false, 110),
  ('dealer_meeting','Dealer Meeting', false, 120),
  ('training','Training', false, 130),
  ('promotional_campaign','Promotional Campaign', false, 140),
  ('exhibition','Exhibition', false, 150),
  ('market_survey','Market Survey', false, 160),
  ('competitor_analysis','Competitor Analysis', false, 170)
ON CONFLICT (code) DO NOTHING;