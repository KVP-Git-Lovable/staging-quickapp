import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface PermissionFlags {
  can_read: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_view_all: boolean;
  can_modify_all: boolean;
}

export type PermissionMap = Record<string, PermissionFlags>;

type PermAction = 'read' | 'create' | 'edit' | 'delete' | 'view_all';

const EMPTY: PermissionFlags = {
  can_read: false,
  can_create: false,
  can_edit: false,
  can_delete: false,
  can_view_all: false,
  can_modify_all: false,
};

async function getUserProfileId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_profiles')
    .select('profile_id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.profile_id ?? null;
}

export function usePermissions() {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [loading, setLoading] = useState(true);

  const loadPermissions = useCallback(async () => {
    if (!user?.id) {
      setPermissions({});
      setLoading(false);
      return;
    }

    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const profileId = await getUserProfileId(user.id);

    const [profileRes, setRes, coverageRes, userOverridesRes] = await Promise.all([
      profileId
        ? supabase
            .from('profile_object_permissions')
            .select('object_name, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all')
            .eq('profile_id', profileId)
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from('permission_set_group_users')
        .select(
          `permission_set_group_permissions (
             object_name, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all
           )`
        )
        .eq('user_id', user.id),
      supabase
        .from('coverage_permission_assignments')
        .select(
          `permission_set_groups (
             permission_set_group_permissions (
               object_name, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all
             )
           )`
        )
        .eq('user_id', user.id)
        .eq('is_active', true)
        .lte('start_date', today)
        .gte('end_date', today),
      supabase
        .from('user_object_permissions')
        .select('object_name, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all')
        .eq('user_id', user.id),
    ]);

    const merged: PermissionMap = {};
    const mergeRow = (row: any) => {
      if (!row?.object_name) return;
      const key = row.object_name as string;
      const cur = merged[key] ?? { ...EMPTY };
      cur.can_read = cur.can_read || !!row.can_read;
      cur.can_create = cur.can_create || !!row.can_create;
      cur.can_edit = cur.can_edit || !!row.can_edit;
      cur.can_delete = cur.can_delete || !!row.can_delete;
      cur.can_view_all = cur.can_view_all || !!row.can_view_all;
      cur.can_modify_all = cur.can_modify_all || !!row.can_modify_all;
      merged[key] = cur;
    };

    // Merge order mirrors backend user_has_permission() layering:
    // 1) user overrides (highest), 2) coverage, 3) permanent sets, 4) base profile.
    // Logic is additive (OR) — any true value wins across all layers.
    (userOverridesRes.data as any[] | null)?.forEach(mergeRow);
    (coverageRes.data as any[] | null)?.forEach((cp: any) => {
      const grp = cp?.permission_set_groups;
      const perms = grp?.permission_set_group_permissions;
      if (Array.isArray(perms)) perms.forEach(mergeRow);
      else if (perms) mergeRow(perms);
    });
    (setRes.data as any[] | null)?.forEach((sp: any) => {
      const perms = sp?.permission_set_group_permissions;
      if (Array.isArray(perms)) perms.forEach(mergeRow);
      else if (perms) mergeRow(perms);
    });
    (profileRes.data as any[] | null)?.forEach(mergeRow);

    setPermissions(merged);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  const can = useCallback(
    (objectName: string, action: PermAction): boolean => {
      const p = permissions[objectName];
      if (!p) return false;
      return !!p[`can_${action}` as keyof PermissionFlags];
    },
    [permissions]
  );

  return { permissions, can, loading, refresh: loadPermissions };
}
