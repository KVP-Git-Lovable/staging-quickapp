-- scheme_policy_config.policy_value is JSONB, not text. Reading it as
-- NULLIF(policy_value,'')::numeric raised "invalid input syntax for type json"
-- and, because the guard runs BEFORE INSERT, that surfaced as a failure to save
-- ANY global scheme. Read the scalar with #>> '{}' instead, which works whether
-- the value is stored as a JSON number (25) or a JSON string ("25").
CREATE OR REPLACE FUNCTION public.tg_product_schemes_guard_high_global_discount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_max numeric;
BEGIN
  IF COALESCE(NEW.is_active, false) IS NOT TRUE
     OR COALESCE(NEW.applicability_type, '') <> 'global'
     OR COALESCE(NEW.discount_percentage, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  IF COALESCE(current_setting('app.allow_high_discount', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT NULLIF(policy_value #>> '{}', '')::numeric INTO v_max
    FROM public.scheme_policy_config
    WHERE policy_name = 'global_discount_max_percent' AND is_active = true
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- A malformed policy row must not make schemes unsaveable. Fail OPEN, loudly.
    RAISE WARNING 'global_discount_max_percent unreadable (%), guard skipped', SQLERRM;
    RETURN NEW;
  END;

  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.discount_percentage > v_max THEN
    RAISE EXCEPTION
      'BLOCKED: % percent is above the % percent limit for an organisation-wide scheme (%).',
      NEW.discount_percentage, v_max, COALESCE(NEW.name, 'unnamed')
      USING ERRCODE = '42501',
            HINT = 'A global scheme applies to every product and every retailer. Either scope it (applicability_type), or if this is genuinely intended run it inside a transaction with SET LOCAL app.allow_high_discount = ''on''. Threshold: scheme_policy_config.global_discount_max_percent.';
  END IF;

  RETURN NEW;
END;
$fn$;
