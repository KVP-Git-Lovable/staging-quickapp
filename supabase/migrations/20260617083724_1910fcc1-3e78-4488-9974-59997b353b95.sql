
-- Recreate public.distributors table that was lost, with all columns referenced by the app

CREATE TABLE IF NOT EXISTS public.distributors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  territory_id UUID REFERENCES public.territories(id),
  status TEXT NOT NULL DEFAULT 'active',
  credit_limit NUMERIC DEFAULT 0,
  outstanding_amount NUMERIC DEFAULT 0,
  -- DMS / business profile
  distribution_level TEXT DEFAULT 'direct_distributor',
  parent_id UUID REFERENCES public.distributors(id),
  parent_type TEXT,
  distributor_status TEXT DEFAULT 'active',
  partnership_status TEXT DEFAULT 'registered',
  gst_number TEXT,
  onboarding_date DATE,
  established_year INTEGER,
  distribution_experience_years INTEGER,
  years_of_relationship INTEGER,
  sales_team_size INTEGER DEFAULT 0,
  assets_vans INTEGER DEFAULT 0,
  assets_trucks INTEGER DEFAULT 0,
  network_retailers_count INTEGER,
  region_coverage TEXT,
  coverage_area TEXT,
  annual_revenue NUMERIC,
  profitability TEXT,
  business_hunger TEXT,
  about_business TEXT,
  products_distributed TEXT[],
  other_products TEXT[],
  competition_products TEXT[],
  strength TEXT,
  weakness TEXT,
  opportunities TEXT,
  threats TEXT,
  drop_reason TEXT,
  owner_id UUID,
  owner_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grants for Data API
GRANT SELECT, INSERT, UPDATE, DELETE ON public.distributors TO authenticated;
GRANT ALL ON public.distributors TO service_role;

-- RLS
ALTER TABLE public.distributors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view all distributors" ON public.distributors;
CREATE POLICY "Authenticated users can view all distributors"
ON public.distributors FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert distributors" ON public.distributors;
CREATE POLICY "Authenticated users can insert distributors"
ON public.distributors FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update distributors" ON public.distributors;
CREATE POLICY "Authenticated users can update distributors"
ON public.distributors FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete distributors" ON public.distributors;
CREATE POLICY "Authenticated users can delete distributors"
ON public.distributors FOR DELETE
TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_distributors_parent_id ON public.distributors(parent_id);
CREATE INDEX IF NOT EXISTS idx_distributors_distribution_level ON public.distributors(distribution_level);
CREATE INDEX IF NOT EXISTS idx_distributors_status ON public.distributors(status);
CREATE INDEX IF NOT EXISTS idx_distributors_owner_id ON public.distributors(owner_id);
CREATE INDEX IF NOT EXISTS idx_distributors_territory_id ON public.distributors(territory_id);

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_distributors_updated_at ON public.distributors;
CREATE TRIGGER update_distributors_updated_at
BEFORE UPDATE ON public.distributors
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill rows from distributor_users so existing FK ids resolve
INSERT INTO public.distributors (id, name, contact_person, phone, email, status, distribution_level)
SELECT
  du.distributor_id AS id,
  COALESCE(MIN(du.full_name) FILTER (WHERE du.role = 'admin'), MIN(du.full_name)) AS name,
  COALESCE(MIN(du.full_name) FILTER (WHERE du.role = 'admin'), MIN(du.full_name)) AS contact_person,
  MIN(du.phone) AS phone,
  MIN(du.email) AS email,
  'active' AS status,
  'direct_distributor' AS distribution_level
FROM public.distributor_users du
WHERE du.distributor_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.distributors d WHERE d.id = du.distributor_id)
GROUP BY du.distributor_id;
