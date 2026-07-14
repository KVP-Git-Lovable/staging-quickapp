CREATE OR REPLACE FUNCTION public.user_has_beat_access(_user_id uuid, _beat_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM beats WHERE beat_id = _beat_id AND user_id = _user_id
    UNION ALL
    SELECT 1 FROM beat_user_access
    WHERE beat_id = _beat_id AND user_id = _user_id AND is_active = true
      AND (effective_from IS NULL OR effective_from <= now())
      AND (effective_to IS NULL OR effective_to > now())
    UNION ALL
    SELECT 1 FROM beat_coverage_assignments
    WHERE beat_id = _beat_id AND coverage_user_id = _user_id AND is_active = true
      AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_beat_share_peers()
RETURNS TABLE (peer_user_id uuid, peer_name text, beat_id text, beat_name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH my_beats AS (
    SELECT b.beat_id, b.beat_name, b.user_id AS owner_id
    FROM beats b
    WHERE b.user_id = auth.uid() OR public.user_has_beat_access(auth.uid(), b.beat_id)
  )
  SELECT mb.owner_id AS peer_user_id, p.full_name AS peer_name, mb.beat_id, mb.beat_name, 'OWNER'::text AS role
  FROM my_beats mb
  JOIN public.profiles p ON p.id = mb.owner_id
  WHERE mb.owner_id <> auth.uid()
  UNION
  SELECT bua.user_id AS peer_user_id, p.full_name AS peer_name, mb.beat_id, mb.beat_name, bua.access_type::text AS role
  FROM my_beats mb
  JOIN public.beat_user_access bua ON bua.beat_id = mb.beat_id
  JOIN public.profiles p ON p.id = bua.user_id
  WHERE bua.is_active = true
    AND (bua.effective_from IS NULL OR bua.effective_from <= now())
    AND (bua.effective_to   IS NULL OR bua.effective_to   >  now())
    AND bua.user_id <> auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_beat_share_peers() TO authenticated;