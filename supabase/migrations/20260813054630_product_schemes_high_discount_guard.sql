-- Speed bump for org-wide discounts, tuned by policy rather than hardcoded.
--
-- "ADDUKU FREE approved in meeting" was created at 50% with
-- applicability_type='global' — every product, every retailer — and was live
-- within seconds of a single click. Two orders went out at half price before it
-- was spotted ~4 hours later.
--
-- This does NOT ban high discounts. It refuses to let an ACTIVE global scheme
-- above the threshold be created or switched on without a deliberate override in
-- the same transaction, the same escape-hatch idiom as the destructive-DDL guard:
--
--   SET LOCAL app.allow_high_discount = 'on';
--
-- NOTE: the function created here reads policy_value as text and is BROKEN —
-- scheme_policy_config.policy_value is jsonb. Superseded immediately by
-- 20260813054720_product_schemes_guard_fix_jsonb_policy_read.sql. Kept so the
-- migration timeline replays exactly as it ran.

INSERT INTO public.scheme_policy_config (policy_name, policy_value, description, is_active)
SELECT 'global_discount_max_percent', '25',
       'Maximum discount_percentage an ACTIVE scheme with applicability_type=global may carry. Above this, scope the scheme or use SET LOCAL app.allow_high_discount=''on''. Set is_active=false to disable the guard.',
       true
WHERE NOT EXISTS (SELECT 1 FROM public.scheme_policy_config WHERE policy_name = 'global_discount_max_percent');

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

  SELECT NULLIF(policy_value, '')::numeric INTO v_max
  FROM public.scheme_policy_config
  WHERE policy_name = 'global_discount_max_percent' AND is_active = true
  LIMIT 1;

  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.discount_percentage > v_max THEN
    RAISE EXCEPTION 'BLOCKED: high global discount' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_product_schemes_guard_high_global_discount ON public.product_schemes;
CREATE TRIGGER trg_product_schemes_guard_high_global_discount
  BEFORE INSERT OR UPDATE ON public.product_schemes
  FOR EACH ROW EXECUTE FUNCTION public.tg_product_schemes_guard_high_global_discount();
