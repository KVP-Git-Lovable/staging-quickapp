
drop policy if exists cn_config_admin on public.credit_note_config;
drop policy if exists cn_config_write on public.credit_note_config;
create policy cn_config_write on public.credit_note_config
  for all
  using (public.user_has_permission(auth.uid(),'credit_note_settings','can_edit'))
  with check (public.user_has_permission(auth.uid(),'credit_note_settings','can_edit'));

drop policy if exists "Admins can manage config" on public.approval_config;
create policy "Admins can manage config" on public.approval_config
  for all
  using (has_role(auth.uid(),'admin'::app_role) and entity_type <> 'credit_note')
  with check (has_role(auth.uid(),'admin'::app_role) and entity_type <> 'credit_note');

drop policy if exists approval_config_credit_note_write on public.approval_config;
create policy approval_config_credit_note_write on public.approval_config
  for all
  using (entity_type = 'credit_note' and public.user_has_permission(auth.uid(),'credit_note_settings','can_edit'))
  with check (entity_type = 'credit_note' and public.user_has_permission(auth.uid(),'credit_note_settings','can_edit'));
