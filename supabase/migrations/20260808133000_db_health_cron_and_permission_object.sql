-- Daily capture at 01:15 IST (19:45 UTC prev day), prune right after.
-- 11.2k rows / 3.8 MB per snapshot; 35 days ≈ 133 MB steady state.
SELECT cron.schedule('db-health-daily-snapshot', '45 19 * * *',
  $$SELECT public._capture_db_health_snapshot_impl('cron');$$);

SELECT cron.schedule('db-health-prune', '15 20 * * *',
  $$SELECT public.prune_db_health_snapshots(35);$$);

-- Register the permission object, mirroring who can already read System Settings.
INSERT INTO public.profile_object_permissions
  (profile_id, object_name, can_read, can_create, can_edit, can_delete,
   can_view_all, can_modify_all, permission_type, parent_module)
SELECT p.profile_id, 'admin_db_health', p.can_read, false, false, false,
       p.can_view_all, false, p.permission_type, p.parent_module
FROM public.profile_object_permissions p
WHERE p.object_name = 'admin_system_settings'
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_object_permissions x
    WHERE x.profile_id = p.profile_id AND x.object_name = 'admin_db_health');
