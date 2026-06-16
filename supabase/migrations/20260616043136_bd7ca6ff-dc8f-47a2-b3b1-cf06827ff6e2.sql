
CREATE OR REPLACE FUNCTION public.get_effective_features(
  p_company_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  feature_id uuid,
  feature_key text,
  feature_name text,
  description text,
  category text,
  enabled boolean,
  global_enabled boolean,
  company_override boolean,
  role_override boolean,
  user_override boolean,
  source text,
  blocked_by text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := COALESCE(p_user_id, auth.uid());
  v_role uuid;
BEGIN
  SELECT up.profile_id INTO v_role
  FROM public.user_profiles up
  WHERE up.user_id = v_user
  LIMIT 1;

  RETURN QUERY
  WITH role_override AS (
    SELECT rfc.feature_id, rfc.is_enabled
    FROM public.role_feature_config rfc
    WHERE v_role IS NOT NULL AND rfc.role_id = v_role
  ),
  base AS (
    SELECT
      ff.id AS feature_id,
      ff.feature_key,
      ff.feature_name,
      ff.description,
      ff.category,
      ff.is_enabled AS global_enabled,
      cfc.is_enabled AS company_override,
      ro.is_enabled AS role_override,
      ufc.is_enabled AS user_override
    FROM public.feature_flags ff
    LEFT JOIN public.company_feature_config cfc
      ON cfc.feature_id = ff.id AND cfc.company_id = p_company_id
    LEFT JOIN role_override ro ON ro.feature_id = ff.id
    LEFT JOIN public.user_feature_config ufc
      ON ufc.feature_id = ff.id AND ufc.user_id = v_user
  ),
  resolved AS (
    SELECT b.*,
      CASE
        WHEN b.global_enabled = false THEN false
        WHEN b.user_override IS NOT NULL THEN b.user_override
        WHEN b.role_override IS NOT NULL THEN b.role_override
        WHEN b.company_override IS NOT NULL THEN b.company_override
        ELSE b.global_enabled
      END AS resolved_enabled,
      CASE
        WHEN b.global_enabled = false THEN 'global'
        WHEN b.user_override IS NOT NULL THEN 'user'
        WHEN b.role_override IS NOT NULL THEN 'role'
        WHEN b.company_override IS NOT NULL THEN 'company'
        ELSE 'default'
      END AS resolved_source
    FROM base b
  ),
  with_deps AS (
    SELECT r.feature_id, r.feature_key, r.feature_name, r.description, r.category,
           r.global_enabled, r.company_override, r.role_override, r.user_override,
           r.resolved_enabled, r.resolved_source,
      COALESCE(
        ARRAY_AGG(dep_ff.feature_key) FILTER (
          WHERE fd.dependency_type = 'hard'
            AND dep_resolved.resolved_enabled = false
        ),
        ARRAY[]::text[]
      ) AS blocked_by
    FROM resolved r
    LEFT JOIN public.feature_dependencies fd ON fd.feature_id = r.feature_id
    LEFT JOIN public.feature_flags dep_ff ON dep_ff.id = fd.depends_on_feature_id
    LEFT JOIN resolved dep_resolved ON dep_resolved.feature_id = fd.depends_on_feature_id
    GROUP BY r.feature_id, r.feature_key, r.feature_name, r.description, r.category,
             r.global_enabled, r.company_override, r.role_override, r.user_override,
             r.resolved_enabled, r.resolved_source
  )
  SELECT
    w.feature_id,
    w.feature_key,
    w.feature_name,
    w.description,
    w.category,
    (w.resolved_enabled AND COALESCE(array_length(w.blocked_by, 1), 0) = 0) AS enabled,
    w.global_enabled,
    w.company_override,
    w.role_override,
    w.user_override,
    w.resolved_source AS source,
    w.blocked_by
  FROM with_deps w
  ORDER BY w.category, w.feature_name;
END;
$$;
