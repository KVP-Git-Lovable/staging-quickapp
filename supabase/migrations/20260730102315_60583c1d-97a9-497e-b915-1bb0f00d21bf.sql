CREATE OR REPLACE FUNCTION public.gam_on_retailer_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
BEGIN
  IF COALESCE(NEW.verified, false) = true AND COALESCE(OLD.verified, false) = false THEN
    v_user := COALESCE(NEW.owner_id, NEW.user_id, NEW.created_by);
    IF v_user IS NOT NULL THEN
      BEGIN
        PERFORM public.gam_award_event(
          v_user,
          'retailer_verified',
          'retailer',
          NEW.id,
          NEW.id,
          jsonb_build_object(
            'verification_score', NEW.verification_score,
            'verification_method', NEW.verification_method
          ),
          NULL
        );
      EXCEPTION WHEN others THEN NULL;
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gam_on_retailer_verified ON public.retailers;
CREATE TRIGGER trg_gam_on_retailer_verified
AFTER UPDATE OF verified ON public.retailers
FOR EACH ROW
EXECUTE FUNCTION public.gam_on_retailer_verified();