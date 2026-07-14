-- Prevent destructive deletion of security profiles.
-- A profile may be HARD-deleted ONLY when it is non-system AND has zero users assigned.
-- Otherwise it must be deactivated (is_active=false). Enforced at DB level so no UI or
-- direct-SQL path can silently orphan users (as happened to the System Administrator profile).

ALTER TABLE public.security_profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.guard_security_profile_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_users integer;
BEGIN
  IF OLD.is_system THEN
    RAISE EXCEPTION 'System profiles cannot be deleted. Deactivate the profile instead.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT count(*) INTO v_users
  FROM public.user_profiles
  WHERE profile_id = OLD.id;

  IF v_users > 0 THEN
    RAISE EXCEPTION 'Profile "%" has % user(s) assigned and cannot be deleted. Reassign those users or deactivate the profile instead.',
      OLD.name, v_users
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_security_profile_delete ON public.security_profiles;
CREATE TRIGGER trg_guard_security_profile_delete
  BEFORE DELETE ON public.security_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_security_profile_delete();
