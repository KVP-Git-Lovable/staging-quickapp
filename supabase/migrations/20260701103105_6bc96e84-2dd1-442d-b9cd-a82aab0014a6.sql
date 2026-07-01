drop policy if exists visits_insert on public.visits;

create policy visits_insert on public.visits for insert
with check (
  auth.uid() = user_id AND (
    ( public.user_has_permission(auth.uid(),'action_visit_create','can_create')
      AND public.user_has_beat_access(auth.uid(), (select r.beat_id from retailers r where r.id = visits.retailer_id)) )
    OR
    ( coalesce(visit_type,'') = 'activity'
      AND public.user_has_permission(auth.uid(),'action_visit_create','can_create') )
  )
);