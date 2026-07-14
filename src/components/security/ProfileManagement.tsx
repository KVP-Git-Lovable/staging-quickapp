import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Shield, Users as UsersIcon, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';

interface Profile {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
}

interface UserCount {
  profile_id: string;
  count: number;
}

export const ProfileManagement = () => {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });

  // Fetch profiles
  const { data: profiles, isLoading } = useQuery({
    queryKey: ['security-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('security_profiles')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Profile[];
    }
  });

  // Fetch user counts per profile
  const { data: userCounts } = useQuery({
    queryKey: ['profile-user-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('profile_id');
      
      if (error) throw error;
      
      const counts = data.reduce((acc, { profile_id }) => {
        acc[profile_id] = (acc[profile_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      return counts;
    }
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; id?: string }) => {
      if (data.id) {
        const { error } = await supabase
          .from('security_profiles')
          .update({ name: data.name, description: data.description })
          .eq('id', data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('security_profiles')
          .insert({ name: data.name, description: data.description, is_system: false });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-profiles'] });
      setIsDialogOpen(false);
      setEditingProfile(null);
      setFormData({ name: '', description: '' });
      toast.success(editingProfile ? 'Profile updated' : 'Profile created');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to save profile');
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('security_profiles')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-profiles'] });
      toast.success('Profile deleted');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete profile');
    }
  });

  // Activate / deactivate mutation — the safe alternative to deleting a profile in use.
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('security_profiles')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['security-profiles'] });
      toast.success(variables.is_active ? 'Profile activated' : 'Profile deactivated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update profile status');
    }
  });

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast.error('Profile name is required');
      return;
    }
    saveMutation.mutate({
      ...formData,
      id: editingProfile?.id
    });
  };

  const handleEdit = (profile: Profile) => {
    setEditingProfile(profile);
    setFormData({ name: profile.name, description: profile.description || '' });
    setIsDialogOpen(true);
  };

  const handleDelete = (profile: Profile) => {
    if (profile.is_system) {
      toast.error('System profiles cannot be deleted. Deactivate it instead.');
      return;
    }
    const users = userCounts?.[profile.id] || 0;
    if (users > 0) {
      toast.error(`"${profile.name}" has ${users} user(s) assigned. Reassign them or deactivate the profile instead of deleting.`);
      return;
    }
    if (confirm(`Permanently delete profile "${profile.name}"? This is allowed only because no users are assigned to it.`)) {
      deleteMutation.mutate(profile.id);
    }
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingProfile(null);
    setFormData({ name: '', description: '' });
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading profiles...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Security Profiles</CardTitle>
            <CardDescription>Define user roles with different permission sets</CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleDialogClose()}>
                <Plus className="h-4 w-4 mr-2" />
                Create Profile
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingProfile ? 'Edit Profile' : 'Create New Profile'}</DialogTitle>
                <DialogDescription>
                  Define a new security profile with custom permissions
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Profile Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Regional Manager"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe the role and responsibilities"
                    rows={3}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={handleDialogClose}>Cancel</Button>
                  <Button onClick={handleSave} disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? 'Saving...' : 'Save Profile'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Profile Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-center">Users</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles?.map((profile) => (
              <TableRow key={profile.id}>
                <TableCell className="font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  {profile.name}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {profile.description || '—'}
                </TableCell>
                <TableCell>
                  {profile.is_system ? (
                    <Badge variant="outline" className="bg-primary/10">System</Badge>
                  ) : (
                    <Badge variant="outline">Custom</Badge>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <UsersIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{userCounts?.[profile.id] || 0}</span>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  {profile.is_active !== false ? (
                    <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/30">Active</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-muted text-muted-foreground">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(profile)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    {!profile.is_system && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActiveMutation.mutate({ id: profile.id, is_active: profile.is_active === false })}
                        disabled={toggleActiveMutation.isPending}
                        title={profile.is_active !== false ? 'Deactivate profile' : 'Activate profile'}
                      >
                        {profile.is_active !== false
                          ? <PowerOff className="h-4 w-4 text-amber-600" />
                          : <Power className="h-4 w-4 text-green-600" />}
                      </Button>
                    )}
                    {!profile.is_system && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(profile)}
                        disabled={deleteMutation.isPending || (userCounts?.[profile.id] || 0) > 0}
                        title={(userCounts?.[profile.id] || 0) > 0 ? 'Has users assigned — deactivate instead of deleting' : 'Delete profile (no users assigned)'}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
