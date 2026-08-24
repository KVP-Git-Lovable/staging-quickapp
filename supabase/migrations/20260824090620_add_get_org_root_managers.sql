-- The employees a caller may read via RLS is scoped to themselves and their
-- own subordinates, so a query for "whoever has no manager" from the client
-- only ever succeeds for a system admin or for the root themselves — a
-- regional or branch head looking for the org's true top gets nothing back.
--
-- get_all_subordinates already solves the equivalent problem for "who is
-- below this person" via SECURITY DEFINER; this is the same pattern for
-- "who is at the very top" — the employee, or employees, nobody reports to.
CREATE OR REPLACE FUNCTION public.get_org_root_managers()
RETURNS TABLE(user_id uuid, full_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    e.user_id,
    COALESCE(p.full_name, p.username, 'Unknown') AS full_name
  FROM employees e
  LEFT JOIN profiles p ON p.id = e.user_id
  WHERE e.manager_id IS NULL
  ORDER BY full_name;
$function$;

GRANT EXECUTE ON FUNCTION public.get_org_root_managers() TO authenticated;
