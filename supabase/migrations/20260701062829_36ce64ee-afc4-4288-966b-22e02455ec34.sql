drop policy if exists "Admins can manage product availability" on public.product_availability;

create policy product_availability_manage on public.product_availability
  for all
  using (public.user_has_permission(auth.uid(),'product_availability_settings','can_edit'))
  with check (public.user_has_permission(auth.uid(),'product_availability_settings','can_edit'));