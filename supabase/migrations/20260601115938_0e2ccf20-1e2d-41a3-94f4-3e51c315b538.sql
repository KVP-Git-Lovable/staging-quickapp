-- Helper: check if user has a profile permission on an action
CREATE OR REPLACE FUNCTION public.user_has_action_permission(
  _user_id uuid,
  _action text,
  _perm text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result boolean;
BEGIN
  IF _perm NOT IN ('can_read','can_create','can_edit','can_delete','can_view_all','can_modify_all') THEN
    RAISE EXCEPTION 'Invalid permission column: %', _perm;
  END IF;
  EXECUTE format($f$
    SELECT EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.profile_object_permissions pop ON pop.profile_id = up.profile_id
      WHERE up.user_id = $1
        AND pop.object_name = $2
        AND pop.%I = true
    )
  $f$, _perm)
  INTO result
  USING _user_id, _action;
  RETURN COALESCE(result, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_has_action_permission(uuid, text, text) TO authenticated, anon, service_role;

-- Beats: profile-based UPDATE policy
DROP POLICY IF EXISTS "Profile-based beat edit" ON public.beats;
CREATE POLICY "Profile-based beat edit"
ON public.beats
FOR UPDATE
TO authenticated
USING (public.user_has_action_permission(auth.uid(), 'action_beat_edit', 'can_edit'))
WITH CHECK (public.user_has_action_permission(auth.uid(), 'action_beat_edit', 'can_edit'));

-- Beats: profile-based DELETE policy
DROP POLICY IF EXISTS "Profile-based beat delete" ON public.beats;
CREATE POLICY "Profile-based beat delete"
ON public.beats
FOR DELETE
TO authenticated
USING (public.user_has_action_permission(auth.uid(), 'action_beat_delete', 'can_delete'));
