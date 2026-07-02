create or replace function public.get_assignable_users()
returns table(user_id uuid, user_name text)
language plpgsql security definer set search_path to 'public' as $f$
declare v_me uuid := auth.uid();
begin
  if v_me is null then return; end if;
  if not public.user_has_permission(v_me,'action_activity_assign','can_create') then return; end if;
  if public.user_has_permission(v_me,'activity_team_view','can_view_all') then
    return query select p.id, p.full_name from public.profiles p order by p.full_name;
  else
    return query
    with recursive dl(uid) as (
      select e.user_id from public.employees e where e.manager_id = v_me
      union select e2.user_id from public.employees e2 join dl on e2.manager_id = dl.uid
    )
    select p.id, p.full_name from public.profiles p join dl on dl.uid = p.id order by p.full_name;
  end if;
end; $f$;

grant execute on function public.get_assignable_users() to authenticated;