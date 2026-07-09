
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.find_duplicate_retailers(
  p_name text,
  p_phone text DEFAULT NULL,
  p_lat numeric DEFAULT NULL,
  p_lng numeric DEFAULT NULL,
  p_exclude_id uuid DEFAULT NULL,
  p_radius_m numeric DEFAULT 100
)
RETURNS TABLE(
  id uuid,
  name text,
  phone text,
  owner_user_id uuid,
  owner_name text,
  matched_on text[],
  distance_m numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.name, r.phone, r.user_id, p.full_name,
    array_remove(ARRAY[
      CASE WHEN p_phone IS NOT NULL AND length(regexp_replace(p_phone,'\D','','g'))>=7
            AND regexp_replace(coalesce(r.phone,''),'\D','','g')=regexp_replace(p_phone,'\D','','g') THEN 'phone' END,
      CASE WHEN p_name IS NOT NULL AND similarity(lower(btrim(r.name)),lower(btrim(p_name)))>=0.5 THEN 'name' END,
      CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL
            AND (6371000*acos(least(1,greatest(-1,cos(radians(p_lat))*cos(radians(r.latitude))*cos(radians(r.longitude)-radians(p_lng))+sin(radians(p_lat))*sin(radians(r.latitude))))))<=p_radius_m THEN 'location' END
    ], NULL) AS matched_on,
    CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL THEN
      round((6371000*acos(least(1,greatest(-1,cos(radians(p_lat))*cos(radians(r.latitude))*cos(radians(r.longitude)-radians(p_lng))+sin(radians(p_lat))*sin(radians(r.latitude))))))::numeric,0) END AS distance_m
  FROM retailers r
  LEFT JOIN profiles p ON p.id = r.user_id
  WHERE (p_exclude_id IS NULL OR r.id <> p_exclude_id)
    AND coalesce(r.status,'active') <> 'inactive'
    AND (
      (p_phone IS NOT NULL AND length(regexp_replace(p_phone,'\D','','g'))>=7 AND regexp_replace(coalesce(r.phone,''),'\D','','g')=regexp_replace(p_phone,'\D','','g'))
      OR (p_name IS NOT NULL AND similarity(lower(btrim(r.name)),lower(btrim(p_name)))>=0.5)
      OR (p_lat IS NOT NULL AND p_lng IS NOT NULL AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL
          AND (6371000*acos(least(1,greatest(-1,cos(radians(p_lat))*cos(radians(r.latitude))*cos(radians(r.longitude)-radians(p_lng))+sin(radians(p_lat))*sin(radians(r.latitude))))))<=p_radius_m)
    )
  ORDER BY array_length(array_remove(ARRAY[
      CASE WHEN p_phone IS NOT NULL AND regexp_replace(coalesce(r.phone,''),'\D','','g')=regexp_replace(coalesce(p_phone,''),'\D','','g') AND length(regexp_replace(coalesce(p_phone,''),'\D','','g'))>=7 THEN 'x' END,
      CASE WHEN p_name IS NOT NULL AND similarity(lower(btrim(r.name)),lower(btrim(p_name)))>=0.5 THEN 'x' END
    ], NULL),1) DESC NULLS LAST, distance_m ASC NULLS LAST
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_retailers(text, text, numeric, numeric, uuid, numeric) TO authenticated, service_role;
