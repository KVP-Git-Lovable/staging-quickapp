alter table public.activity_events
  add column if not exists completion_summary text,
  add column if not exists voice_note_url text;

drop function if exists public.activity_visit_action(uuid,uuid,text,uuid,double precision,double precision);

create or replace function public.activity_visit_action(
  p_visit_id uuid, p_activity_event_id uuid, p_action text, p_actor uuid,
  p_lat double precision default null, p_lng double precision default null,
  p_outcome text default null, p_summary text default null, p_voice_url text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v_ci timestamptz; v_dur integer;
begin
  if p_action = 'check_in' then
    update visits set check_in_time = coalesce(check_in_time, now()), status = 'in-progress' where id = p_visit_id;
    update activity_events set check_in_time = coalesce(check_in_time, now()), status = 'active',
      check_in_latitude=coalesce(p_lat,check_in_latitude), check_in_longitude=coalesce(p_lng,check_in_longitude),
      start_latitude=coalesce(p_lat,start_latitude), start_longitude=coalesce(p_lng,start_longitude)
      where id = p_activity_event_id;
  elsif p_action in ('check_out','complete') then
    select check_in_time into v_ci from activity_events where id = p_activity_event_id;
    v_dur := case when v_ci is not null then greatest(0, round(extract(epoch from (now()-v_ci))/60))::int else null end;
    update visits set check_out_time = now(),
      status = case when p_outcome in ('productive','unproductive') then p_outcome else 'productive' end
      where id = p_visit_id;
    update activity_events set check_out_time=now(), status='closed', completed_at=now(),
      duration_minutes=coalesce(v_dur,duration_minutes),
      completion_summary=coalesce(p_summary,completion_summary),
      voice_note_url=coalesce(p_voice_url,voice_note_url),
      end_latitude=coalesce(p_lat,end_latitude), end_longitude=coalesce(p_lng,end_longitude)
      where id = p_activity_event_id;
  else
    return jsonb_build_object('success',false,'error','unknown action');
  end if;
  return jsonb_build_object('success',true,'action',p_action);
end; $f$;

drop policy if exists activity_voice_read on storage.objects;
drop policy if exists activity_voice_insert on storage.objects;
drop policy if exists activity_voice_delete on storage.objects;

create policy activity_voice_read   on storage.objects for select using (bucket_id='activity-voice-notes' and public.user_has_permission(auth.uid(),'action_activity_create','can_create'));
create policy activity_voice_insert on storage.objects for insert with check (bucket_id='activity-voice-notes' and public.user_has_permission(auth.uid(),'action_activity_create','can_create'));
create policy activity_voice_delete on storage.objects for delete using (bucket_id='activity-voice-notes' and public.user_has_permission(auth.uid(),'action_activity_create','can_create'));