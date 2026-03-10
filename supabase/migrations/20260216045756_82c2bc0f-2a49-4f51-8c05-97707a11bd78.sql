
-- Fix 1: Make visits storage bucket private and replace public read policy with authenticated scoped policy
UPDATE storage.buckets 
SET public = false 
WHERE id = 'visits';

DROP POLICY IF EXISTS "Anyone can read from visits bucket" ON storage.objects;

CREATE POLICY "Authenticated users can read visits files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'visits' 
  AND (
    -- User who uploaded (file in their folder)
    auth.uid()::text = (storage.foldername(name))[1]
    OR
    -- Manager can view subordinate files
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.user_id::text = (storage.foldername(name))[1]
      AND e.manager_id = auth.uid()
    )
    OR
    -- Admin access
    public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

-- Fix 2: Replace get_profiles_for_selector with properly scoped version
CREATE OR REPLACE FUNCTION public.get_profiles_for_selector()
RETURNS TABLE (id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.full_name
  FROM public.profiles p
  WHERE p.full_name IS NOT NULL
    AND (
      -- Own profile
      p.id = auth.uid()
      OR
      -- All subordinates (recursive hierarchy)
      p.id IN (
        SELECT subordinate_user_id 
        FROM get_all_subordinates(auth.uid())
      )
      OR
      -- Admin access - sees everyone
      public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  ORDER BY p.full_name;
$$;
