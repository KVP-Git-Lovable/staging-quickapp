import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Shield, Save } from 'lucide-react';
import { toast } from 'sonner';
import { clearAllCachedPermissions } from '@/utils/cachedAuthIntegrity';
import { CRUDFlags, PermissionMap } from './PermissionLayerTable';
import { HierarchicalPermissionEditor } from './HierarchicalPermissionEditor';

import {
  HIERARCHICAL_MODULES,
  getAllModuleNames,
  getAllFieldNames,
  getAllActionNames,
  getAllWidgetNames,
  getPermissionType,
} from './hierarchicalPermissions';

// Composite key: `${object_name}__${permission_type}`
const makeKey = (object_name: string, permission_type: string) =>
  `${object_name}__${permission_type}`;

const getPermissionTypeForName = (name: string): string => {
  if (name.startsWith('module_')) return 'module';
  if (name.startsWith('field_')) return 'field';
  if (name.startsWith('action_')) return 'action';
  if (name.startsWith('widget_')) return 'widget';
  return 'feature';
};

const getParentModuleForName = (name: string): string | null => {
  const modKey = name.replace(/^module_/, '');
  if (HIERARCHICAL_MODULES.find(m => m.name === modKey)) return modKey;
  for (const mod of HIERARCHICAL_MODULES) {
    const all = [
      ...mod.fields.map(f => f.name),
      ...mod.actions.map(a => a.name),
      ...mod.widgets.map(w => w.name),
    ];
    if (all.includes(name)) return mod.name;
  }
  return null;
};

// All hierarchical item names (modules + fields + actions + widgets)
const getAllHierarchicalNames = (): string[] => [
  ...getAllModuleNames(),
  ...getAllFieldNames(),
  ...getAllActionNames(),
  ...getAllWidgetNames(),
];

export const RolePermissionsTab = () => {
  const queryClient = useQueryClient();
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [localPerms, setLocalPerms] = useState<PermissionMap>({});
  const [dirty, setDirty] = useState(false);

  const { data: profiles } = useQuery({
    queryKey: ['security-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('security_profiles')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Auto-select first profile on load
  useEffect(() => {
    if (profiles && profiles.length > 0 && !selectedProfileId) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [profiles, selectedProfileId]);

  const { isLoading } = useQuery({
    queryKey: ['profile-hierarchical-permissions', selectedProfileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profile_object_permissions')
        .select('object_name, permission_type, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all')
        .eq('profile_id', selectedProfileId)
        .in('permission_type', ['module', 'field', 'action', 'widget', 'feature']);

      if (error) throw error;

      const map: PermissionMap = {};
      (data || []).forEach(p => {
        const key = p.object_name;
        map[key] = {
          can_read: p.can_read ?? false,
          can_create: p.can_create ?? false,
          can_edit: p.can_edit ?? false,
          can_delete: p.can_delete ?? false,
          can_view_all: p.can_view_all ?? false,
          can_modify_all: p.can_modify_all ?? false,
        };
      });

      setLocalPerms(map);
      setDirty(false);
      return map;
    },
    enabled: !!selectedProfileId,
  });

  const handleChange = useCallback(
    (name: string, field: keyof CRUDFlags, value: boolean) => {
      setLocalPerms(prev => ({
        ...prev,
        [name]: {
          can_read: false,
          can_create: false,
          can_edit: false,
          can_delete: false,
          can_view_all: false,
          can_modify_all: false,
          ...prev[name],
          [field]: value,
        },
      }));
      setDirty(true);
    },
    []
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates = Object.entries(localPerms).map(([object_name, perms]) => ({
        profile_id: selectedProfileId,
        object_name,
        permission_type: getPermissionTypeForName(object_name),
        parent_module: getParentModuleForName(object_name),
        can_read: perms.can_read,
        can_create: perms.can_create,
        can_edit: perms.can_edit,
        can_delete: perms.can_delete,
        can_view_all: perms.can_view_all,
        can_modify_all: perms.can_modify_all,
      }));

      const { error } = await supabase
        .from('profile_object_permissions')
        .upsert(updates, { onConflict: 'profile_id,object_name,permission_type' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-hierarchical-permissions'] });
      queryClient.invalidateQueries({ queryKey: ['profile-permissions'] });
      clearAllCachedPermissions();
      setDirty(false);
      toast.success('Permissions saved successfully');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to save'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold">Select Role</h2>
          <Select
            value={selectedProfileId}
            onValueChange={(v) => {
              setSelectedProfileId(v);
              setDirty(false);
            }}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Choose role" />
            </SelectTrigger>
            <SelectContent>
              {profiles?.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    {p.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {dirty && (
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? 'Saving...' : 'Save Permissions'}
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {selectedProfileId && !isLoading && (
        <HierarchicalPermissionEditor
          permissions={localPerms}
          onChange={handleChange}
        />
      )}
    </div>
  );
};
