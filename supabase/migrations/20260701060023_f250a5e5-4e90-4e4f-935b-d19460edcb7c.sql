
drop policy if exists activity_attach_read on public.activity_attachments;
drop policy if exists activity_attach_insert on public.activity_attachments;
drop policy if exists activity_attach_delete on public.activity_attachments;

create policy activity_attach_read on public.activity_attachments
  for select to authenticated
  using (public.user_has_permission(auth.uid(), 'activity_attachments', 'can_read'));

create policy activity_attach_insert on public.activity_attachments
  for insert to authenticated
  with check (public.user_has_permission(auth.uid(), 'activity_attachments', 'can_create'));

create policy activity_attach_delete on public.activity_attachments
  for delete to authenticated
  using (public.user_has_permission(auth.uid(), 'activity_attachments', 'can_delete'));

drop policy if exists activity_obj_read on storage.objects;
drop policy if exists activity_obj_insert on storage.objects;
drop policy if exists activity_obj_delete on storage.objects;

create policy activity_obj_read on storage.objects
  for select to authenticated
  using (bucket_id = 'activity-attachments' and public.user_has_permission(auth.uid(), 'activity_attachments', 'can_read'));

create policy activity_obj_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'activity-attachments' and public.user_has_permission(auth.uid(), 'activity_attachments', 'can_create'));

create policy activity_obj_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'activity-attachments' and public.user_has_permission(auth.uid(), 'activity_attachments', 'can_delete'));
