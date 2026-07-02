
alter table public.activity_events
  add column if not exists assigned_by uuid,
  add column if not exists assignment_note text;

create or replace function public.assign_activity(
  p_subordinate_ids uuid[], p_activity_type text, p_activity_date date,
  p_expected_duration_minutes integer default null, p_half_day_type text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v_mgr uuid := auth.uid(); v_uid uuid; v_visit uuid; v_created int := 0; v_skipped int := 0; v_all boolean;
begin
  if v_mgr is null then return jsonb_build_object('success',false,'error','not authenticated'); end if;
  if not public.user_has_permission(v_mgr,'action_activity_assign','can_create') then
    return jsonb_build_object('success',false,'error','no permission to assign activities'); end if;
  v_all := public.user_has_permission(v_mgr,'activity_team_view','can_view_all');
  foreach v_uid in array p_subordinate_ids loop
    if not v_all and not exists (
      with recursive dl(uid) as (
        select e.user_id from employees e where e.manager_id = v_mgr
        union select e2.user_id from employees e2 join dl on e2.manager_id = dl.uid
      ) select 1 from dl where uid = v_uid
    ) then v_skipped := v_skipped + 1; continue; end if;

    insert into public.visits (user_id, planned_date, status, visit_type)
      values (v_uid, p_activity_date, 'planned', 'activity') returning id into v_visit;

    insert into public.activity_events
      (visit_id, user_id, activity_type, visit_category, activity_date, duration_type,
       expected_duration_minutes, half_day_type, assigned_by, assignment_note, status)
      values (v_visit, v_uid, p_activity_type, p_activity_type, p_activity_date, 'single_day',
       p_expected_duration_minutes, p_half_day_type, v_mgr, p_note, 'upcoming');
    v_created := v_created + 1;
  end loop;
  return jsonb_build_object('success',true,'created',v_created,'skipped',v_skipped);
end; $f$;

create or replace function public.get_team_activities(p_from date default null, p_to date default null)
returns table(visit_id uuid, activity_event_id uuid, user_id uuid, user_name text, activity_type text,
  ae_status text, visit_status text, activity_date date, duration_minutes integer,
  expected_duration_minutes integer, half_day_type text, completion_summary text, outcome text, assigned_by uuid)
language plpgsql security definer set search_path to 'public' as $f$
declare v_me uuid := auth.uid(); v_all boolean;
begin
  if v_me is null then return; end if;
  v_all := public.user_has_permission(v_me,'activity_team_view','can_view_all');
  if not v_all and not public.user_has_permission(v_me,'activity_team_view','can_read') then return; end if;
  return query
  with recursive dl(uid) as (
    select v_me
    union select e.user_id from employees e join dl on e.manager_id = dl.uid
  )
  select v.id, ae.id, v.user_id, pr.full_name, ae.activity_type, ae.status, v.status,
         ae.activity_date, ae.duration_minutes, ae.expected_duration_minutes, ae.half_day_type,
         ae.completion_summary, ae.outcome, ae.assigned_by
  from public.visits v
  join public.activity_events ae on ae.visit_id = v.id
  left join public.profiles pr on pr.id = v.user_id
  where v.visit_type = 'activity'
    and (v_all or v.user_id in (select uid from dl))
    and (p_from is null or v.planned_date >= p_from)
    and (p_to   is null or v.planned_date <= p_to)
  order by v.planned_date desc, ae.created_at desc;
end; $f$;
