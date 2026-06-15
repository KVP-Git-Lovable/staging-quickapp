
-- Phase 1: Per-company feature config + dependencies

-- 1. company_feature_config
CREATE TABLE IF NOT EXISTS public.company_feature_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  feature_id uuid NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  is_enabled boolean,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, feature_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_feature_config TO authenticated;
GRANT ALL ON public.company_feature_config TO service_role;

ALTER TABLE public.company_feature_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cfc_read_authenticated" ON public.company_feature_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cfc_admin_write" ON public.company_feature_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2. feature_dependencies
CREATE TABLE IF NOT EXISTS public.feature_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id uuid NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  depends_on_feature_id uuid NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  dependency_type text NOT NULL DEFAULT 'hard' CHECK (dependency_type IN ('hard','soft')),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feature_id, depends_on_feature_id),
  CHECK (feature_id <> depends_on_feature_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_dependencies TO authenticated;
GRANT ALL ON public.feature_dependencies TO service_role;

ALTER TABLE public.feature_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fd_read_authenticated" ON public.feature_dependencies
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "fd_admin_write" ON public.feature_dependencies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3. Extend feature_flag_audit with company_id
ALTER TABLE public.feature_flag_audit
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS action text;

-- 4. updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at_cfc()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_cfc_updated_at ON public.company_feature_config;
CREATE TRIGGER trg_cfc_updated_at
  BEFORE UPDATE ON public.company_feature_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_cfc();

-- 5. RPC: get_effective_features
CREATE OR REPLACE FUNCTION public.get_effective_features(p_company_id uuid)
RETURNS TABLE (
  feature_id uuid,
  feature_key text,
  feature_name text,
  description text,
  category text,
  enabled boolean,
  global_enabled boolean,
  company_override boolean,
  blocked_by text[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      f.id,
      f.feature_key,
      f.feature_name,
      f.description,
      f.category,
      f.is_enabled AS global_enabled,
      cfc.is_enabled AS company_override,
      CASE
        WHEN f.is_enabled = false THEN false
        WHEN cfc.is_enabled IS NOT NULL THEN cfc.is_enabled
        ELSE true
      END AS effective
    FROM public.feature_flags f
    LEFT JOIN public.company_feature_config cfc
      ON cfc.feature_id = f.id AND cfc.company_id = p_company_id
  ),
  with_deps AS (
    SELECT
      b.*,
      COALESCE((
        SELECT array_agg(df.feature_key)
        FROM public.feature_dependencies d
        JOIN public.feature_flags df ON df.id = d.depends_on_feature_id
        LEFT JOIN base b2 ON b2.id = d.depends_on_feature_id
        WHERE d.feature_id = b.id
          AND d.dependency_type = 'hard'
          AND COALESCE(b2.effective, true) = false
      ), ARRAY[]::text[]) AS blocked
    FROM base b
  )
  SELECT
    id, feature_key, feature_name, description, category,
    CASE WHEN array_length(blocked,1) > 0 THEN false ELSE effective END,
    global_enabled,
    company_override,
    blocked
  FROM with_deps
  ORDER BY category, feature_name;
END $$;

GRANT EXECUTE ON FUNCTION public.get_effective_features(uuid) TO authenticated, anon;

-- 6. RPC: set_company_feature
CREATE OR REPLACE FUNCTION public.set_company_feature(
  p_company_id uuid,
  p_feature_key text,
  p_enabled boolean,
  p_cascade boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_feature_id uuid;
  v_old boolean;
  v_dep_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT id INTO v_feature_id FROM public.feature_flags WHERE feature_key = p_feature_key;
  IF v_feature_id IS NULL THEN RAISE EXCEPTION 'Unknown feature: %', p_feature_key; END IF;

  SELECT is_enabled INTO v_old FROM public.company_feature_config
    WHERE company_id = p_company_id AND feature_id = v_feature_id;

  INSERT INTO public.company_feature_config (company_id, feature_id, is_enabled, updated_by)
  VALUES (p_company_id, v_feature_id, p_enabled, auth.uid())
  ON CONFLICT (company_id, feature_id) DO UPDATE
    SET is_enabled = EXCLUDED.is_enabled,
        updated_by = auth.uid(),
        updated_at = now();

  -- Cascade enable hard dependencies if requested
  IF p_enabled = true AND p_cascade = true THEN
    FOR v_dep_id IN
      SELECT depends_on_feature_id FROM public.feature_dependencies
      WHERE feature_id = v_feature_id AND dependency_type = 'hard'
    LOOP
      INSERT INTO public.company_feature_config (company_id, feature_id, is_enabled, updated_by)
      VALUES (p_company_id, v_dep_id, true, auth.uid())
      ON CONFLICT (company_id, feature_id) DO UPDATE
        SET is_enabled = true, updated_by = auth.uid(), updated_at = now();
    END LOOP;
  END IF;

  INSERT INTO public.feature_flag_audit (feature_flag_id, changed_by, old_value, new_value, company_id, action)
  VALUES (v_feature_id, auth.uid(), v_old, p_enabled, p_company_id, 'company_override');
END $$;

GRANT EXECUTE ON FUNCTION public.set_company_feature(uuid, text, boolean, boolean) TO authenticated;

-- 7. RPC: clear_company_feature_override (revert to inherit)
CREATE OR REPLACE FUNCTION public.clear_company_feature_override(
  p_company_id uuid,
  p_feature_key text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_feature_id uuid;
  v_old boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT id INTO v_feature_id FROM public.feature_flags WHERE feature_key = p_feature_key;
  IF v_feature_id IS NULL THEN RAISE EXCEPTION 'Unknown feature: %', p_feature_key; END IF;

  SELECT is_enabled INTO v_old FROM public.company_feature_config
    WHERE company_id = p_company_id AND feature_id = v_feature_id;

  DELETE FROM public.company_feature_config
    WHERE company_id = p_company_id AND feature_id = v_feature_id;

  INSERT INTO public.feature_flag_audit (feature_flag_id, changed_by, old_value, new_value, company_id, action)
  VALUES (v_feature_id, auth.uid(), v_old, NULL, p_company_id, 'cleared_override');
END $$;

GRANT EXECUTE ON FUNCTION public.clear_company_feature_override(uuid, text) TO authenticated;
