-- Record WHO creates, changes and deactivates a scheme.
--
-- On 12 Aug 2026 a global 50% scheme ("ADDUKU FREE approved in meeting") went
-- live in production for ~4 hours and halved two real orders. It was impossible
-- to answer "who added this": product_schemes has no created_by, and
-- ai_scheme_suggestions.reviewed_by was left NULL on approval. The only evidence
-- was session activity, which narrows a suspect but does not name one.

ALTER TABLE public.product_schemes
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

COMMENT ON COLUMN public.product_schemes.created_by IS
  'Stamped automatically from auth.uid() on insert. NULL for rows predating 2026-08-13 or written by a service-role job, where auth.uid() is null.';

-- Full history, because created_by/updated_by only show the LATEST editor. A
-- scheme created harmless and later widened to global 50% must leave a trail of
-- that change, not just the end state.
CREATE TABLE IF NOT EXISTS public.product_scheme_audit (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id           uuid,
  action              text NOT NULL,
  actor_user_id       uuid,
  scheme_name         text,
  scheme_type         text,
  discount_percentage numeric,
  discount_amount     numeric,
  applicability_type  text,
  is_active           boolean,
  changed_fields      text[],
  old_row             jsonb,
  new_row             jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_scheme_audit_scheme_idx  ON public.product_scheme_audit (scheme_id, created_at DESC);
CREATE INDEX IF NOT EXISTS product_scheme_audit_created_idx ON public.product_scheme_audit (created_at DESC);

ALTER TABLE public.product_scheme_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='product_scheme_audit' AND policyname='Admins can view scheme audit') THEN
    CREATE POLICY "Admins can view scheme audit" ON public.product_scheme_audit
      FOR SELECT TO authenticated USING (public.is_admin_or_manager());
  END IF;
END $$;

GRANT SELECT ON public.product_scheme_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_product_schemes_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_actor   uuid := auth.uid();
  v_changed text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, v_actor);
    NEW.updated_by := COALESCE(NEW.updated_by, v_actor);
    INSERT INTO public.product_scheme_audit
      (scheme_id, action, actor_user_id, scheme_name, scheme_type,
       discount_percentage, discount_amount, applicability_type, is_active, new_row)
    VALUES (NEW.id, 'insert', v_actor, NEW.name, NEW.scheme_type,
            NEW.discount_percentage, NEW.discount_amount, NEW.applicability_type,
            NEW.is_active, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_by := v_actor;
    SELECT array_agg(key) INTO v_changed
    FROM jsonb_each(to_jsonb(NEW))
    WHERE to_jsonb(NEW) -> key IS DISTINCT FROM to_jsonb(OLD) -> key;

    IF v_changed IS NULL OR v_changed <@ ARRAY['updated_at','updated_by'] THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.product_scheme_audit
      (scheme_id, action, actor_user_id, scheme_name, scheme_type,
       discount_percentage, discount_amount, applicability_type, is_active,
       changed_fields, old_row, new_row)
    VALUES (NEW.id, 'update', v_actor, NEW.name, NEW.scheme_type,
            NEW.discount_percentage, NEW.discount_amount, NEW.applicability_type,
            NEW.is_active, v_changed, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;

  INSERT INTO public.product_scheme_audit
    (scheme_id, action, actor_user_id, scheme_name, scheme_type,
     discount_percentage, discount_amount, applicability_type, is_active, old_row)
  VALUES (OLD.id, 'delete', v_actor, OLD.name, OLD.scheme_type,
          OLD.discount_percentage, OLD.discount_amount, OLD.applicability_type,
          OLD.is_active, to_jsonb(OLD));
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_product_schemes_audit suppressed: % [%]', SQLERRM, SQLSTATE;
  RETURN COALESCE(NEW, OLD);
END;
$fn$;

DROP TRIGGER IF EXISTS trg_product_schemes_audit ON public.product_schemes;
CREATE TRIGGER trg_product_schemes_audit
  BEFORE INSERT OR UPDATE OR DELETE ON public.product_schemes
  FOR EACH ROW EXECUTE FUNCTION public.tg_product_schemes_audit();
