import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Shield, Save } from 'lucide-react';
import { toast } from 'sonner';
import { ModulePermissionTable, PermissionMap } from './ModulePermissionTable';
import { SYSTEM_ADMINISTRATOR_PROFILE, getAllModulePermissionItems } from './permissionModules';

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

  const selectedProfileName = profiles?.find(p => p.id === selectedProfileId)?.name;
  const isSystemAdmin = selectedProfileName === SYSTEM_ADMINISTRATOR_PROFILE;

  const { isLoading } = useQuery({
    queryKey: ['profile-object-permissions', selectedProfileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profile_object_permissions')
        .select('object_name, can_read, can_create, can_edit, can_delete')
        .eq('profile_id', selectedProfileId);
      if (error) throw error;

      const map: PermissionMap = {};
      (data || []).forEach(p => {
        map[p.object_name] = {
          can_read: p.can_read,
          can_create: p.can_create,
          can_edit: p.can_edit,
          can_delete: p.can_delete,
        };
      });

      // For System Administrator, auto-grant all
      if (isSystemAdmin) {
        getAllModulePermissionItems().forEach(name => {
          map[name] = { can_read: true, can_create: true, can_edit: true, can_delete: true };
        });
      }

      setLocalPerms(map);
      setDirty(false);
      return map;
    },
    enabled: !!selectedProfileId,
  });

  const handleChange = useCallback((objectName: string, field: string, value: boolean) => {
    setLocalPerms(prev => ({
      ...prev,
      [objectName]: {
        can_read: false,
        can_create: false,
        can_edit: false,
        can_delete: false,
        ...prev[objectName],
        [field]: value,
      },
    }));
    setDirty(true);
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates = Object.entries(localPerms).map(([object_name, perms]) => ({
        profile_id: selectedProfileId,
        object_name,
        ...perms,
        can_view_all: false,
        can_modify_all: false,
      }));
      const { error } = await supabase
        .from('profile_object_permissions')
        .upsert(updates, { onConflict: 'profile_id,object_name' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-object-permissions'] });
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
          <Select value={selectedProfileId} onValueChange={(v) => { setSelectedProfileId(v); setDirty(false); }}>
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
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? 'Saving...' : 'Save Permissions'}
          </Button>
        )}
      </div>

      {selectedProfileId && !isLoading && (
        <ModulePermissionTable
          permissions={localPerms}
          onChange={handleChange}
          disabled={isSystemAdmin}
        />
      )}

      {isLoading && (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}
    </div>
  );
};
