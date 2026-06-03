CREATE OR REPLACE FUNCTION public.get_org_beat_names(p_distributor_id uuid DEFAULT NULL)
RETURNS TABLE(beat_name text, user_id uuid, full_name text, username text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.beat_name, b.user_id, p.full_name, p.username
  FROM beats b
  LEFT JOIN profiles p ON p.id = b.user_id
  WHERE b.is_active = true
    AND (p_distributor_id IS NULL OR b.distributor_id = p_distributor_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_org_beat_names(uuid) TO authenticated;