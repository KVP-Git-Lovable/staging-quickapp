
-- Enums
DO $$ BEGIN
  CREATE TYPE public.influencer_role AS ENUM ('plumber','painter','electrician','civil_contractor','architect','mason');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.influencer_referral_status AS ENUM ('new','contacted','converted','dropped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- employee_directory
CREATE TABLE IF NOT EXISTS public.employee_directory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  full_name text NOT NULL,
  employee_code text,
  email text,
  phone text,
  department text,
  location text,
  reports_to_directory_id uuid REFERENCES public.employee_directory(id) ON DELETE SET NULL,
  reports_to_profile_id uuid,
  joining_date date,
  previous_experience text,
  bio text,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  follows_company_page boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_directory TO authenticated;
GRANT ALL ON public.employee_directory TO service_role;
ALTER TABLE public.employee_directory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employee_directory_read_authenticated" ON public.employee_directory FOR SELECT TO authenticated USING (true);
CREATE POLICY "employee_directory_insert" ON public.employee_directory FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "employee_directory_update" ON public.employee_directory FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "employee_directory_delete" ON public.employee_directory FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER trg_employee_directory_updated BEFORE UPDATE ON public.employee_directory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_employee_directory_company ON public.employee_directory(company_id);
CREATE INDEX IF NOT EXISTS idx_employee_directory_reports_to ON public.employee_directory(reports_to_directory_id);

-- influencers
CREATE TABLE IF NOT EXISTS public.influencers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  name text NOT NULL,
  company text,
  phone text NOT NULL,
  email text,
  website text,
  role public.influencer_role NOT NULL,
  region text,
  territory_id uuid,
  pincode text,
  portal_enabled boolean NOT NULL DEFAULT false,
  portal_last_login_at timestamptz,
  influenced_orders_count integer NOT NULL DEFAULT 0,
  influenced_orders_value numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, phone)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.influencers TO authenticated;
GRANT ALL ON public.influencers TO service_role;
ALTER TABLE public.influencers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "influencers_read" ON public.influencers FOR SELECT TO authenticated USING (true);
CREATE POLICY "influencers_insert" ON public.influencers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "influencers_update" ON public.influencers FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "influencers_delete" ON public.influencers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER trg_influencers_updated BEFORE UPDATE ON public.influencers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_influencers_company ON public.influencers(company_id);
CREATE INDEX IF NOT EXISTS idx_influencers_phone ON public.influencers(phone);
CREATE INDEX IF NOT EXISTS idx_influencers_role ON public.influencers(role);

-- influencer_retailer_map
CREATE TABLE IF NOT EXISTS public.influencer_retailer_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id uuid NOT NULL REFERENCES public.influencers(id) ON DELETE CASCADE,
  retailer_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  since date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (influencer_id, retailer_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.influencer_retailer_map TO authenticated;
GRANT ALL ON public.influencer_retailer_map TO service_role;
ALTER TABLE public.influencer_retailer_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "influencer_map_read" ON public.influencer_retailer_map FOR SELECT TO authenticated USING (true);
CREATE POLICY "influencer_map_write" ON public.influencer_retailer_map FOR ALL TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER trg_influencer_map_updated BEFORE UPDATE ON public.influencer_retailer_map
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_influencer_map_retailer ON public.influencer_retailer_map(retailer_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_influencer_map_influencer ON public.influencer_retailer_map(influencer_id);

-- influencer_referrals
CREATE TABLE IF NOT EXISTS public.influencer_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id uuid NOT NULL REFERENCES public.influencers(id) ON DELETE CASCADE,
  retailer_name text NOT NULL,
  phone text,
  area text,
  notes text,
  status public.influencer_referral_status NOT NULL DEFAULT 'new',
  converted_retailer_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.influencer_referrals TO authenticated;
GRANT ALL ON public.influencer_referrals TO service_role;
ALTER TABLE public.influencer_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "influencer_referrals_read" ON public.influencer_referrals FOR SELECT TO authenticated USING (true);
CREATE POLICY "influencer_referrals_write" ON public.influencer_referrals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (true);
CREATE TRIGGER trg_influencer_referrals_updated BEFORE UPDATE ON public.influencer_referrals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_influencer_referrals_influencer ON public.influencer_referrals(influencer_id);

-- Order columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS influencer_id uuid REFERENCES public.influencers(id) ON DELETE SET NULL;
ALTER TABLE public.primary_orders ADD COLUMN IF NOT EXISTS influencer_id uuid REFERENCES public.influencers(id) ON DELETE SET NULL;
ALTER TABLE public.support_requests ADD COLUMN IF NOT EXISTS influencer_id uuid REFERENCES public.influencers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_influencer ON public.orders(influencer_id) WHERE influencer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_primary_orders_influencer ON public.primary_orders(influencer_id) WHERE influencer_id IS NOT NULL;

-- Auto attribution
CREATE OR REPLACE FUNCTION public.orders_autoattribute_influencer()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inf uuid; v_cnt int;
BEGIN
  IF NEW.influencer_id IS NULL AND NEW.retailer_id IS NOT NULL THEN
    SELECT count(*), min(influencer_id) INTO v_cnt, v_inf
    FROM public.influencer_retailer_map
    WHERE retailer_id = NEW.retailer_id AND active;
    IF v_cnt = 1 THEN NEW.influencer_id := v_inf; END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_orders_autoattribute_influencer ON public.orders;
CREATE TRIGGER trg_orders_autoattribute_influencer
  BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.orders_autoattribute_influencer();

-- Rollup
CREATE OR REPLACE FUNCTION public.influencer_rollup_recalc()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.influencer_id IS NOT NULL THEN
    v_ids := array_append(v_ids, NEW.influencer_id);
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.influencer_id IS NOT NULL THEN
    v_ids := array_append(v_ids, OLD.influencer_id);
  END IF;
  IF array_length(v_ids,1) IS NULL THEN RETURN NULL; END IF;

  UPDATE public.influencers i
  SET influenced_orders_count = COALESCE(agg.cnt,0),
      influenced_orders_value = COALESCE(agg.val,0)
  FROM (
    SELECT influencer_id, count(*)::int AS cnt, sum(COALESCE(total_amount,0))::numeric AS val
    FROM public.orders
    WHERE influencer_id = ANY(v_ids)
    GROUP BY influencer_id
  ) agg
  WHERE i.id = agg.influencer_id;

  UPDATE public.influencers SET influenced_orders_count = 0, influenced_orders_value = 0
  WHERE id = ANY(v_ids)
    AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.influencer_id = influencers.id);

  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_orders_influencer_rollup ON public.orders;
CREATE TRIGGER trg_orders_influencer_rollup
  AFTER INSERT OR UPDATE OF influencer_id, total_amount OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.influencer_rollup_recalc();

-- Feature flags
INSERT INTO public.feature_flags (feature_key, feature_name, description, is_enabled)
VALUES
  ('employees_module','Employees Directory','Company staff directory including non-user records', true),
  ('influencers_module','Influencers','Manage plumbers, painters, electricians and other influencers', true),
  ('influencer_portal','Influencer Portal','Phone-OTP portal for influencers', true)
ON CONFLICT (feature_key) DO NOTHING;
