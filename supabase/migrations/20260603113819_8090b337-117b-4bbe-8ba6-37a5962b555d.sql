-- Enable missing beat action permissions for Sales Manager
UPDATE profile_object_permissions
SET can_read = true, can_create = true, can_edit = true
WHERE profile_id = (SELECT id FROM security_profiles WHERE name = 'Sales Manager')
  AND object_name IN (
    'action_beat_share',
    'action_beat_coverage',
    'action_beat_transfer',
    'action_beat_reactivate',
    'action_beat_clone'
  );

-- Enable missing beat action permissions for Field Sales Executive
UPDATE profile_object_permissions
SET can_read = true, can_create = true, can_edit = true
WHERE profile_id = (SELECT id FROM security_profiles WHERE name = 'Field Sales Executive')
  AND object_name IN (
    'action_beat_share',
    'action_beat_reactivate',
    'action_beat_clone'
  );