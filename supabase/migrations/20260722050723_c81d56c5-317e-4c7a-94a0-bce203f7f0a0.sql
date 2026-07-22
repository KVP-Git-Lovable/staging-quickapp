
-- Make "role" in notification rules refer to the security profile (e.g. Data Viewer, Sales Manager),
-- not the internal user_roles enum.

CREATE OR REPLACE FUNCTION public.notif_pick_users()
RETURNS TABLE(id uuid, name text, role text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id,
         COALESCE(p.full_name, p.username, 'Unknown') AS name,
         (
           SELECT sp.name
           FROM public.user_profiles up
           JOIN public.security_profiles sp ON sp.id = up.profile_id
           WHERE up.user_id = p.id
           LIMIT 1
         ) AS role
  FROM public.profiles p
  WHERE COALESCE(p.is_active, true) = true
  ORDER BY COALESCE(p.full_name, p.username);
$function$;

CREATE OR REPLACE FUNCTION public.notif_preview_recipients(
  p_receiver_type text,
  p_receiver_role text DEFAULT NULL,
  p_receiver_user_id uuid DEFAULT NULL,
  p_sample_actor uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, name text, role text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid := COALESCE(p_sample_actor, auth.uid());
BEGIN
  RETURN QUERY
  SELECT pr.id,
         COALESCE(pr.full_name, pr.username, 'Unknown'),
         (
           SELECT sp2.name
           FROM public.user_profiles up2
           JOIN public.security_profiles sp2 ON sp2.id = up2.profile_id
           WHERE up2.user_id = pr.id
           LIMIT 1
         )
  FROM public.profiles pr
  WHERE COALESCE(pr.is_active, true)
    AND pr.id IN (
      SELECT CASE
        WHEN p_receiver_type='employee'      THEN v_actor
        WHEN p_receiver_type='manager'       THEN (SELECT e.manager_id FROM public.employees e WHERE e.user_id=v_actor)
        WHEN p_receiver_type='specific_user' THEN p_receiver_user_id
      END
      UNION
      SELECT public.notif_managers_up_chain(v_actor) WHERE p_receiver_type='hierarchy'
      UNION
      SELECT up.user_id
        FROM public.user_profiles up
        JOIN public.security_profiles sp ON sp.id = up.profile_id
       WHERE p_receiver_type='role' AND sp.name = p_receiver_role
      UNION
      SELECT up.user_id
        FROM public.user_profiles up
        JOIN public.security_profiles sp ON sp.id = up.profile_id
       WHERE p_receiver_type='admin' AND sp.name = 'System Administrator'
    )
  ORDER BY 2;
END
$function$;
