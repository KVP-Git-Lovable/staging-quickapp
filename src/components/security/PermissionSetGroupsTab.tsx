import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Pencil, Trash2, Users, Save } from 'lucide-react';
import { toast } from 'sonner';
import { ModulePermissionTable, PermissionMap } from './ModulePermissionTable';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface Group {
  id: string;
  name: string;
  user_count: number;
}

export const PermissionSetGroupsTab = () => {
  const queryClient = useQueryClient();
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [localPerms, setLocalPerms] = useState<PermissionMap>({});
  const [dirty, setDirty] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [groupName, setGroupName] = useState('');

  // Fetch groups with user counts
  const { data: groups = [] } = useQuery({
    queryKey: ['permission-set-groups'],
    queryFn: async () => {
      const { data: grps, error } = await supabase
        .from('permission_set_groups')
        .select('id, name')
        .order('name');
      if (error) throw error;

      const { data: userCounts } = await supabase
        .from('permission_set_group_users')
        .select('group_id');

      const countMap = new Map<string, number>();
      userCounts?.forEach(u => countMap.set(u.group_id, (countMap.get(u.group_id) || 0) + 1));

      return (grps || []).map(g => ({
        ...g,
        user_count: countMap.get(g.id) || 0,
      })) as Group[];
    },
  });

  // Fetch permissions for selected group
  useQuery({
    queryKey: ['permission-set-group-perms', selectedGroupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permission_set_group_permissions')
        .select('object_name, can_read, can_create, can_edit, can_delete')
        .eq('group_id', selectedGroupId);
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
      setLocalPerms(map);
      setDirty(false);
      return map;
    },
    enabled: !!selectedGroupId,
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

  // Create / Rename group
  const groupMutation = useMutation({
    mutationFn: async ({ id, name }: { id?: string; name: string }) => {
      if (id) {
        const { error } = await supabase.from('permission_set_groups').update({ name }).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('permission_set_groups').insert({ name });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permission-set-groups'] });
      setShowAddDialog(false);
      setEditingGroup(null);
      setGroupName('');
      toast.success('Group saved');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('permission_set_groups').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permission-set-groups'] });
      if (selectedGroupId) setSelectedGroupId('');
      toast.success('Group deleted');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const savePermsMutation = useMutation({
    mutationFn: async () => {
      const updates = Object.entries(localPerms).map(([object_name, perms]) => ({
        group_id: selectedGroupId,
        object_name,
        ...perms,
        can_view_all: false,
        can_modify_all: false,
      }));
      const { error } = await supabase
        .from('permission_set_group_permissions')
        .upsert(updates, { onConflict: 'group_id,object_name' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permission-set-group-perms'] });
      setDirty(false);
      toast.success('Permissions saved');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  return (
    <div className="flex gap-4 min-h-[500px]">
      {/* Left sidebar */}
      <div className="w-[220px] shrink-0 space-y-3">
        <Button
          className="w-full gap-2"
          onClick={() => { setShowAddDialog(true); setGroupName(''); }}
        >
          <Plus className="h-4 w-4" />
          Add Group
        </Button>

        <div className="space-y-2">
          {groups.map(g => (
            <div
              key={g.id}
              onClick={() => setSelectedGroupId(g.id)}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                selectedGroupId === g.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card hover:bg-muted/50 border-border'
              }`}
            >
              <p className="font-medium text-sm truncate">{g.name}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs flex items-center gap-1 opacity-80">
                  <Users className="h-3 w-3" />
                  {g.user_count} users
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingGroup(g); setGroupName(g.name); }}
                    className="p-1 rounded hover:bg-background/20"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(g.id); }}
                    className="p-1 rounded hover:bg-background/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {groups.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No groups yet. Create one to get started.
            </div>
          )}
        </div>
      </div>

      {/* Right content */}
      <div className="flex-1 space-y-4">
        {selectedGroup ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">{selectedGroup.name}</h2>
              {dirty && (
                <Button onClick={() => savePermsMutation.mutate()} disabled={savePermsMutation.isPending} className="gap-2">
                  <Save className="h-4 w-4" />
                  {savePermsMutation.isPending ? 'Saving...' : 'Save Permissions'}
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Permissions</p>
            <ModulePermissionTable permissions={localPerms} onChange={handleChange} />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a group to configure permissions
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={showAddDialog || !!editingGroup} onOpenChange={() => { setShowAddDialog(false); setEditingGroup(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingGroup ? 'Rename Group' : 'Create Group'}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Group name"
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
          />
          <DialogFooter>
            <Button
              onClick={() => groupMutation.mutate({ id: editingGroup?.id, name: groupName })}
              disabled={!groupName.trim() || groupMutation.isPending}
            >
              {groupMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
