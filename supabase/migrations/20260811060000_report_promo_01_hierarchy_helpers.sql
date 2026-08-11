-- Report promotion 01/06 — hierarchy helper functions.
--
-- Consolidated from the staging migration `report_recipient_hierarchy_helpers`
-- (20260805121438). These two functions let generate-report resolve, in one
-- round trip, which recipients bypass hierarchy scoping and whether a
-- report author's pinned scope_user_id is visible to a given recipient.
--
-- Safe to run more than once: both are CREATE OR REPLACE.

-- Which of these report recipients bypass hierarchy scoping. Lets
-- generate-report resolve the whole recipient list in one round trip.
CREATE OR REPLACE FUNCTION public.report_system_admins(p_user_ids uuid[])
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT u
  FROM unnest(COALESCE(p_user_ids, ARRAY[]::uuid[])) AS u
  WHERE public.is_system_admin(u);
$function$;

-- True when _target is _viewer or sits beneath them in employees.manager_id.
-- is_subordinate_of() deliberately excludes level 0; report visibility includes
-- the viewer's own rows, so this wrapper adds the self case.
CREATE OR REPLACE FUNCTION public.report_can_view_user(_viewer uuid, _target uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _viewer = _target OR public.is_subordinate_of(_viewer, _target);
$function$;

GRANT EXECUTE ON FUNCTION public.report_system_admins(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_can_view_user(uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
