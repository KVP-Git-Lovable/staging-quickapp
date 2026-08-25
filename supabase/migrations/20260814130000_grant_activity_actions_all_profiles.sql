-- Extend event create/edit/delete/assign to every profile, not just Sales
-- Manager and Field Sales Executive (20260814120000 restored those two to
-- match February's historical usage). User asked explicitly for all roles.
--
-- create/edit/delete rows already exist for every profile (seeded with
-- can_read=true, others false) except action_activity_create, which never had
-- rows for Product Manager or Data Viewer at all.
update public.profile_object_permissions pop
   set can_create = true, can_edit = true, can_delete = true, can_read = true
  from public.security_profiles sp
 where pop.profile_id = sp.id
   and sp.name in ('Product Manager', 'Data Viewer')
   and pop.object_name in ('action_activity_edit', 'action_activity_delete')
   and pop.permission_type = 'action';

insert into public.profile_object_permissions
  (profile_id, object_name, permission_type, can_read, can_create, can_edit, can_delete, parent_module)
select sp.id, 'action_activity_create', 'action', true, true, true, true, 'my_visit'
  from public.security_profiles sp
 where sp.name in ('Product Manager', 'Data Viewer')
   and not exists (
     select 1 from public.profile_object_permissions pop
      where pop.profile_id = sp.id and pop.object_name = 'action_activity_create'
        and pop.permission_type = 'action'
   );

-- action_activity_assign (assign reps to an event) had no rows at all for any
-- non-admin profile.
insert into public.profile_object_permissions
  (profile_id, object_name, permission_type, can_read, can_create, can_edit, can_delete, parent_module)
select sp.id, 'action_activity_assign', 'action', true, true, true, true, 'my_visit'
  from public.security_profiles sp
 where sp.name in ('Sales Manager', 'Field Sales Executive', 'Product Manager', 'Data Viewer')
   and not exists (
     select 1 from public.profile_object_permissions pop
      where pop.profile_id = sp.id and pop.object_name = 'action_activity_assign'
        and pop.permission_type = 'action'
   );

-- Sales Manager and Field Sales Executive got create/edit back in the prior
-- migration but not delete — closing that gap for full parity.
update public.profile_object_permissions pop
   set can_delete = true
  from public.security_profiles sp
 where pop.profile_id = sp.id
   and sp.name in ('Sales Manager', 'Field Sales Executive')
   and pop.object_name = 'action_activity_delete'
   and pop.permission_type = 'action';
