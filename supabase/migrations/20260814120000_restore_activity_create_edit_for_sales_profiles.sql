-- "new row violates row-level security policy for table 'visits'" on Event
-- create/edit for anyone who isn't System Administrator.
--
-- action_activity_create has ZERO rows for Sales Manager, Field Sales
-- Executive, Product Manager, Data Viewer — only System Administrator holds
-- it. That is what visits_insert's activity branch checks, so those 16 users
-- (12 FSE, 3 Sales Manager, 1 Product Manager) cannot create an event at all.
--
-- Not a deliberate restriction: activity_events itself has Events created in
-- February by Prajwalkvp (Sales Manager) and by Alice / Shravya k (Field
-- Sales Executive) — before whatever reseed wiped this grant. Restoring it to
-- match who actually used the feature, not granting it fresh.
--
-- action_activity_edit already has rows for every profile but can_edit was
-- false for all but System Administrator — the ActivityEventsTable Edit
-- button gates on exactly this permission, so even a rep who could create an
-- event could never open it again.
--
-- Product Manager and Data Viewer are left untouched: no evidence either ever
-- created an event, and granting create-rights is a business call, not a bug
-- fix, once there's no historical precedent to restore.
update public.profile_object_permissions pop
   set can_create = true,
       can_read   = true
  from public.security_profiles sp
 where pop.profile_id = sp.id
   and sp.name in ('Sales Manager', 'Field Sales Executive')
   and pop.object_name = 'action_activity_edit'
   and pop.permission_type = 'action';

update public.profile_object_permissions pop
   set can_edit = true
  from public.security_profiles sp
 where pop.profile_id = sp.id
   and sp.name in ('Sales Manager', 'Field Sales Executive')
   and pop.object_name = 'action_activity_edit'
   and pop.permission_type = 'action';

insert into public.profile_object_permissions
  (profile_id, object_name, permission_type, can_read, can_create, can_edit, can_delete, parent_module)
select sp.id, 'action_activity_create', 'action', true, true, true, false, 'my_visit'
  from public.security_profiles sp
 where sp.name in ('Sales Manager', 'Field Sales Executive')
   and not exists (
     select 1 from public.profile_object_permissions pop
      where pop.profile_id = sp.id
        and pop.object_name = 'action_activity_create'
        and pop.permission_type = 'action'
   );
