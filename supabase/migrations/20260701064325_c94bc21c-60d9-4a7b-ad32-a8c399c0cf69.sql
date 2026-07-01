-- Activity Phase 5a: reusable analytics views (weighted per type). security_invoker=on so caller RLS applies.

create or replace view public.activity_daily_summary
with (security_invoker = on) as
select v.user_id,
       ae.activity_date as date,
       count(*) as total_activities,
       count(*) filter (where ae.check_out_time is not null or ae.completed_at is not null or ae.status = 'closed') as completed_activities,
       coalesce(sum(ae.duration_minutes), 0) as total_activity_minutes,
       coalesce(sum(ae.duration_minutes) filter (where ae.check_out_time is not null or ae.completed_at is not null or ae.status = 'closed'), 0) as completed_activity_minutes,
       round(coalesce(sum(case when ae.check_out_time is not null or ae.completed_at is not null or ae.status = 'closed'
                               then coalesce(t.productivity_weight, 1.0) else 0 end), 0)::numeric, 2) as activity_points
from public.activity_events ae
join public.visits v on v.id = ae.visit_id and v.visit_type = 'activity'
left join public.activity_types t on t.name = ae.activity_type
group by v.user_id, ae.activity_date;

create or replace view public.activity_type_productivity
with (security_invoker = on) as
select v.user_id,
       ae.activity_date as date,
       ae.activity_type,
       coalesce(t.productivity_weight, 1.0) as weight,
       t.is_sales_activity,
       count(*) as activities,
       count(*) filter (where ae.check_out_time is not null or ae.completed_at is not null or ae.status = 'closed') as completed,
       coalesce(sum(ae.duration_minutes), 0) as minutes,
       round((count(*) filter (where ae.check_out_time is not null or ae.completed_at is not null or ae.status = 'closed') * coalesce(t.productivity_weight, 1.0))::numeric, 2) as points
from public.activity_events ae
join public.visits v on v.id = ae.visit_id and v.visit_type = 'activity'
left join public.activity_types t on t.name = ae.activity_type
group by v.user_id, ae.activity_date, ae.activity_type, t.productivity_weight, t.is_sales_activity;

create or replace view public.field_productivity_daily
with (security_invoker = on) as
with sales as (
  select user_id,
         planned_date as date,
         count(*) filter (where status = 'productive') as productive_sales_visits,
         count(*) filter (where status in ('productive', 'unproductive')) as total_sales_visits
  from public.visits
  where coalesce(status, '') <> 'cancelled'
    and coalesce(visit_type, '') <> 'activity'
  group by user_id, planned_date
),
act as (
  select user_id, date, total_activities, completed_activities, completed_activity_minutes, activity_points
  from public.activity_daily_summary
)
select coalesce(s.user_id, a.user_id) as user_id,
       coalesce(s.date, a.date) as date,
       coalesce(s.productive_sales_visits, 0) as productive_sales_visits,
       coalesce(s.total_sales_visits, 0) as total_sales_visits,
       coalesce(a.total_activities, 0) as total_activity_visits,
       coalesce(a.completed_activities, 0) as completed_activities,
       coalesce(a.completed_activity_minutes, 0) as activity_minutes,
       coalesce(a.activity_points, 0) as activity_points,
       coalesce(s.productive_sales_visits, 0) + coalesce(a.activity_points, 0) as overall_field_productivity
from sales s
full outer join act a on a.user_id = s.user_id and a.date = s.date;

grant select on public.activity_daily_summary to authenticated;
grant select on public.activity_type_productivity to authenticated;
grant select on public.field_productivity_daily to authenticated;
