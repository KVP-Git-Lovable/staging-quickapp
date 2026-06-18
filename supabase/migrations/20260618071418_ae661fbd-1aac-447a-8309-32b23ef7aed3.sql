
-- 1a. Extend warehouses with address & geo
ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS pincode text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS landmark text,
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS latitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS longitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS formatted_address text;

-- 1b. Saved addresses repository
CREATE TABLE IF NOT EXISTS public.distributor_saved_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id uuid NOT NULL REFERENCES public.distributors(id) ON DELETE CASCADE,
  label text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  state text,
  pincode text NOT NULL,
  country text NOT NULL DEFAULT 'India',
  landmark text,
  contact_person text,
  contact_phone text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  formatted_address text,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distributor_saved_addresses TO authenticated;
GRANT ALL ON public.distributor_saved_addresses TO service_role;

ALTER TABLE public.distributor_saved_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage saved addresses"
  ON public.distributor_saved_addresses
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_dist_saved_addr_distributor
  ON public.distributor_saved_addresses(distributor_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_dist_saved_addr_default
  ON public.distributor_saved_addresses(distributor_id)
  WHERE is_default = true;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_dist_saved_addr_updated ON public.distributor_saved_addresses;
CREATE TRIGGER trg_dist_saved_addr_updated
  BEFORE UPDATE ON public.distributor_saved_addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 1c. Extend primary_orders with snapshot fields
ALTER TABLE public.primary_orders
  ADD COLUMN IF NOT EXISTS shipping_address_source text,
  ADD COLUMN IF NOT EXISTS shipping_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shipping_saved_address_id uuid REFERENCES public.distributor_saved_addresses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shipping_latitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS shipping_longitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS shipping_contact_person text,
  ADD COLUMN IF NOT EXISTS shipping_contact_phone text;
