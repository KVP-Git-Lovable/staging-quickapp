CREATE OR REPLACE FUNCTION public.portal_login_by_phone(p_phone text)
RETURNS TABLE (
  id uuid,
  name text,
  phone text,
  address text,
  beat_id uuid,
  territory_id uuid,
  distributor_id uuid,
  owner_id uuid,
  parent_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean text;
BEGIN
  v_clean := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  IF length(v_clean) = 12 AND left(v_clean, 2) = '91' THEN
    v_clean := substr(v_clean, 3);
  END IF;

  -- Auto-enable portal access for any retailer found by phone variants
  UPDATE public.retailers r
     SET portal_enabled = true,
         portal_pin = COALESCE(r.portal_pin, lpad((floor(random()*9000)+1000)::int::text, 4, '0'))
   WHERE r.phone IN (v_clean, '+91'||v_clean, '91'||v_clean)
     AND (r.portal_enabled IS DISTINCT FROM true);

  RETURN QUERY
  SELECT r.id, r.name, r.phone, r.address, r.beat_id, r.territory_id,
         r.distributor_id, r.owner_id, r.parent_name
    FROM public.retailers r
   WHERE r.phone IN (v_clean, '+91'||v_clean, '91'||v_clean)
   ORDER BY r.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_login_by_phone(text) TO anon, authenticated;