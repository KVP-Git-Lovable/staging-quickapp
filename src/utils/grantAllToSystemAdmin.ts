import { supabase } from '@/integrations/supabase/client';
import { getAllModulePermissionItems } from '@/components/security/permissionModules';

const SYSTEM_ADMIN_PROFILE_NAME = 'System Administrator';

// Mirrors ObjectPermissions.tsx: all rows use permission_type = 'feature'.
const PERMISSION_TYPE = 'feature';

const FULL_PERMS = {
  can_read: true,
  can_create: true,
  can_edit: true,
  can_delete: true,
  can_view_all: true,
  can_modify_all: true,
};

export interface GrantAllResult {
  profileId: string | null;
  totalObjects: number;
  granted: number;
  skipped: number;
}

/**
 * Grants ALL permission objects (from PERMISSION_MODULES) to the
 * "System Administrator" security profile. Diff-based & idempotent.
 * Only inserts/updates rows that are missing or not fully granted.
 */
export async function grantAllToSystemAdmin(): Promise<GrantAllResult> {
  // 1) Resolve profile
  const { data: profile, error: profileErr } = await supabase
    .from('security_profiles')
    .select('id')
    .eq('name', SYSTEM_ADMIN_PROFILE_NAME)
    .maybeSingle();

  if (profileErr) throw profileErr;
  if (!profile?.id) {
    return { profileId: null, totalObjects: 0, granted: 0, skipped: 0 };
  }

  const profileId = profile.id;
  const allObjectNames = Array.from(new Set(getAllModulePermissionItems()));

  // 2) Fetch existing rows for this profile
  const { data: existing, error: existErr } = await supabase
    .from('profile_object_permissions')
    .select('object_name, permission_type, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all')
    .eq('profile_id', profileId);

  if (existErr) throw existErr;

  const existingMap = new Map<string, any>();
  (existing ?? []).forEach((row: any) => {
    existingMap.set(`${row.object_name}::${row.permission_type}`, row);
  });

  // 3) Diff: only touch rows that are missing or not fully granted
  const rowsToUpsert = allObjectNames
    .map((objectName) => {
      const key = `${objectName}::${PERMISSION_TYPE}`;
      const existingRow = existingMap.get(key);
      const isFullyGranted =
        existingRow &&
        existingRow.can_read &&
        existingRow.can_create &&
        existingRow.can_edit &&
        existingRow.can_delete &&
        existingRow.can_view_all &&
        existingRow.can_modify_all;
      if (isFullyGranted) return null;
      return {
        profile_id: profileId,
        object_name: objectName,
        permission_type: PERMISSION_TYPE,
        ...FULL_PERMS,
      };
    })
    .filter(Boolean) as Array<Record<string, any>>;

  if (rowsToUpsert.length === 0) {
    return {
      profileId,
      totalObjects: allObjectNames.length,
      granted: 0,
      skipped: allObjectNames.length,
    };
  }

  const { error: upsertErr } = await supabase
    .from('profile_object_permissions')
    .upsert(rowsToUpsert, { onConflict: 'profile_id,object_name,permission_type' });

  if (upsertErr) throw upsertErr;

  return {
    profileId,
    totalObjects: allObjectNames.length,
    granted: rowsToUpsert.length,
    skipped: allObjectNames.length - rowsToUpsert.length,
  };
}
