
create table public.activity_attachments (
  id uuid primary key default gen_random_uuid(),
  activity_event_id uuid not null references public.activity_events(id) on delete restrict,
  file_path text not null,
  file_name text,
  file_type text,
  file_size bigint,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.activity_attachments to authenticated;
grant all on public.activity_attachments to service_role;

alter table public.activity_attachments enable row level security;

create policy activity_attach_read
  on public.activity_attachments for select
  to authenticated
  using (auth.uid() is not null);

create policy activity_attach_insert
  on public.activity_attachments for insert
  to authenticated
  with check (uploaded_by = auth.uid());

create policy activity_attach_delete
  on public.activity_attachments for delete
  to authenticated
  using (uploaded_by = auth.uid());

create index idx_activity_attach_event on public.activity_attachments(activity_event_id);

create policy activity_obj_read
  on storage.objects for select
  to authenticated
  using (bucket_id = 'activity-attachments' and auth.uid() is not null);

create policy activity_obj_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'activity-attachments' and auth.uid() = owner);

create policy activity_obj_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'activity-attachments' and auth.uid() = owner);
