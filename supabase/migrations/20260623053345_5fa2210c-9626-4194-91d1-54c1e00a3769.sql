
-- 1. Repoint distributors.owner_id FK from auth.users to public.profiles
ALTER TABLE public.distributors DROP CONSTRAINT IF EXISTS distributors_owner_id_fkey;
ALTER TABLE public.distributors
  ADD CONSTRAINT distributors_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_distributors_owner_id ON public.distributors(owner_id);

-- Keep owner_name in sync with profiles.full_name
CREATE OR REPLACE FUNCTION public.sync_distributor_owner_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.owner_id IS DISTINCT FROM OLD.owner_id) THEN
    SELECT full_name INTO NEW.owner_name FROM public.profiles WHERE id = NEW.owner_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_distributor_owner_name ON public.distributors;
CREATE TRIGGER trg_sync_distributor_owner_name
BEFORE INSERT OR UPDATE OF owner_id ON public.distributors
FOR EACH ROW EXECUTE FUNCTION public.sync_distributor_owner_name();

-- Backfill owner_name where missing
UPDATE public.distributors d
SET owner_name = p.full_name
FROM public.profiles p
WHERE d.owner_id = p.id
  AND (d.owner_name IS NULL OR d.owner_name = '' OR d.owner_name IS DISTINCT FROM p.full_name);

-- 2. Add can_deliver to distributor_users
ALTER TABLE public.distributor_users
  ADD COLUMN IF NOT EXISTS can_deliver boolean NOT NULL DEFAULT false;

-- 3. Helper: is current auth user the owner of this distributor?
CREATE OR REPLACE FUNCTION public.is_distributor_owner_of(_distributor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.distributors
    WHERE id = _distributor_id
      AND owner_id = auth.uid()
  )
$$;

-- 4. Scope distributor_users visibility & writes
-- Drop the overly-broad authenticated policies (admin policies remain intact)
DROP POLICY IF EXISTS "Authenticated users can view distributor users" ON public.distributor_users;
DROP POLICY IF EXISTS "Authenticated users can insert distributor users" ON public.distributor_users;
DROP POLICY IF EXISTS "Authenticated users can update distributor users" ON public.distributor_users;

-- SELECT: self row, own distributor, distributor owner, or admin
CREATE POLICY "Scoped view of distributor users"
ON public.distributor_users
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR auth_user_id = auth.uid()
  OR distributor_id = public.get_distributor_id_for_auth_user()
  OR public.is_distributor_owner_of(distributor_id)
);

-- INSERT: distributor owner or admin
CREATE POLICY "Owner or admin can insert distributor users"
ON public.distributor_users
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR public.is_distributor_owner_of(distributor_id)
);

-- UPDATE: distributor owner, admin, or self
CREATE POLICY "Owner or admin can update distributor users"
ON public.distributor_users
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR auth_user_id = auth.uid()
  OR public.is_distributor_owner_of(distributor_id)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR auth_user_id = auth.uid()
  OR public.is_distributor_owner_of(distributor_id)
);
