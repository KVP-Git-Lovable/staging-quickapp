import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Plus, Trash2, Users, Edit2, UserPlus, Loader2, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCurrency } from "@/contexts/CurrencyContext";

interface ExpenseGroup {
  id: string;
  name: string;
  description: string | null;
  ta_type: string;
  fixed_ta_amount: number;
  da_amount: number;
  ta_per_km_rate: number;
  member_count?: number;
}

interface GroupMember {
  user_id: string;
  full_name: string;
}

const ExpenseGroupsConfig = () => {
  const { format: fmtMoney } = useCurrency();
  const { toast } = useToast();
  const [groups, setGroups] = useState<ExpenseGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ExpenseGroup | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formTaType, setFormTaType] = useState<'fixed' | 'from_beat' | 'from_gps'>('from_beat');
  const [formFixedTa, setFormFixedTa] = useState(0);
  const [formDa, setFormDa] = useState(0);
  const [formTaPerKm, setFormTaPerKm] = useState(0);

  // Members dialog
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [membersGroup, setMembersGroup] = useState<ExpenseGroup | null>(null);
  const [currentMembers, setCurrentMembers] = useState<GroupMember[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState('');
  const [savingMembers, setSavingMembers] = useState(false);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const { data: groupsData } = await (supabase as any).from('expense_groups').select('*').order('name');
      const { data: membersData } = await (supabase as any).from('expense_group_members').select('group_id');

      const countMap = new Map<string, number>();
      (membersData || []).forEach((m: any) => {
        countMap.set(m.group_id, (countMap.get(m.group_id) || 0) + 1);
      });

      const enriched = (groupsData || []).map((g: any) => ({
        ...g,
        member_count: countMap.get(g.id) || 0,
      }));

      setGroups(enriched);
    } catch (error) {
      console.error('Error fetching groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingGroup(null);
    setFormName('');
    setFormDescription('');
    setFormTaType('from_beat');
    setFormFixedTa(0);
    setFormDa(0);
    setFormTaPerKm(0);
    setDialogOpen(true);
  };

  const openEditDialog = (group: ExpenseGroup) => {
    setEditingGroup(group);
    setFormName(group.name);
    setFormDescription(group.description || '');
    setFormTaType(group.ta_type as 'fixed' | 'from_beat');
    setFormFixedTa(group.fixed_ta_amount);
    setFormDa(group.da_amount);
    setFormTaPerKm(group.ta_per_km_rate);
    setDialogOpen(true);
  };

  const handleSaveGroup = async () => {
    if (!formName.trim()) {
      toast({ title: 'Error', description: 'Group name is required', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: formName.trim(),
        description: formDescription.trim() || null,
        ta_type: formTaType,
        fixed_ta_amount: formFixedTa,
        da_amount: formDa,
        ta_per_km_rate: formTaPerKm,
        updated_at: new Date().toISOString(),
      };

      if (editingGroup) {
        const { error } = await (supabase as any).from('expense_groups').update(payload).eq('id', editingGroup.id);
        if (error) throw error;
        toast({ title: 'Updated', description: `Group "${formName}" updated` });
      } else {
        const { error } = await (supabase as any).from('expense_groups').insert(payload);
        if (error) throw error;
        toast({ title: 'Created', description: `Group "${formName}" created` });
      }

      setDialogOpen(false);
      fetchGroups();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to save group', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = async (group: ExpenseGroup) => {
    if (!confirm(`Delete group "${group.name}"? This will remove all member associations.`)) return;
    try {
      await (supabase as any).from('expense_groups').delete().eq('id', group.id);
      toast({ title: 'Deleted', description: `Group "${group.name}" deleted` });
      fetchGroups();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  // Members management
  const openMembersDialog = async (group: ExpenseGroup) => {
    setMembersGroup(group);
    setMemberSearch('');
    setMembersDialogOpen(true);

    // Fetch current members
    const { data: memberRows } = await (supabase as any)
      .from('expense_group_members')
      .select('user_id')
      .eq('group_id', group.id);

    const memberIds = (memberRows || []).map((m: any) => m.user_id);
    setSelectedUserIds(new Set(memberIds));

    // Fetch member names
    if (memberIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', memberIds);
      setCurrentMembers((profiles || []).map((p: any) => ({ user_id: p.id, full_name: p.full_name || 'Unknown' })));
    } else {
      setCurrentMembers([]);
    }

    // Fetch all available users
    const { data: allProfiles } = await supabase.rpc('get_profiles_for_selector');
    setAllUsers((allProfiles || []).map((p: any) => ({ id: p.id, full_name: p.full_name || 'Unknown' })));
  };

  const toggleMember = (userId: string) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleSaveMembers = async () => {
    if (!membersGroup) return;
    try {
      setSavingMembers(true);

      // Delete all existing members for this group
      await (supabase as any).from('expense_group_members').delete().eq('group_id', membersGroup.id);

      // Insert new members
      if (selectedUserIds.size > 0) {
        const rows = Array.from(selectedUserIds).map(uid => ({
          group_id: membersGroup.id,
          user_id: uid,
        }));
        const { error } = await (supabase as any).from('expense_group_members').insert(rows);
        if (error) throw error;
      }

      toast({ title: 'Saved', description: `${selectedUserIds.size} members assigned to "${membersGroup.name}"` });
      setMembersDialogOpen(false);
      fetchGroups();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSavingMembers(false);
    }
  };

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const filteredUsers = memberSearch.trim()
    ? allUsers.filter(u => u.full_name.toLowerCase().includes(memberSearch.toLowerCase()))
    : allUsers;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-32 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Expense Groups
            </CardTitle>
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-1" />
              Create Group
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Create groups to assign the same TA/DA policy to multiple users at once. Priority: User Override → Group → Team → Global.
          </p>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No expense groups yet. Create one to bulk-assign TA/DA policies.
            </div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] px-3">Group Name</TableHead>
                    <TableHead className="text-[11px] px-3">TA Type</TableHead>
                    <TableHead className="text-[11px] px-3">TA (₹)</TableHead>
                    <TableHead className="text-[11px] px-3">DA (₹)</TableHead>
                    <TableHead className="text-[11px] px-3">Per KM (₹)</TableHead>
                    <TableHead className="text-[11px] px-3">Members</TableHead>
                    <TableHead className="text-[11px] px-2 w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map(g => (
                    <TableRow key={g.id}>
                      <TableCell className="py-2 px-3">
                        <div>
                          <p className="text-sm font-medium">{g.name}</p>
                          {g.description && <p className="text-[11px] text-muted-foreground">{g.description}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="py-2 px-3">
                        <Badge variant="outline" className="text-[10px]">
                          {g.ta_type === 'fixed' ? 'Fixed' : 'From Beat'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 px-3 text-xs">{fmtMoney(g.fixed_ta_amount)}</TableCell>
                      <TableCell className="py-2 px-3 text-xs">{fmtMoney(g.da_amount)}</TableCell>
                      <TableCell className="py-2 px-3 text-xs">{fmtMoney(g.ta_per_km_rate)}</TableCell>
                      <TableCell className="py-2 px-3">
                        <Badge
                          variant="secondary"
                          className="text-[10px] cursor-pointer hover:bg-primary/10"
                          onClick={() => openMembersDialog(g)}
                        >
                          <Users className="h-3 w-3 mr-1" />
                          {g.member_count || 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 px-2">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openMembersDialog(g)}>
                            <UserPlus className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditDialog(g)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDeleteGroup(g)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Group Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGroup ? 'Edit Group' : 'Create Expense Group'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Group Name *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. North Region Sales" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Optional description" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">TA Type</Label>
              <Select value={formTaType} onValueChange={(v: 'fixed' | 'from_beat') => setFormTaType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed TA</SelectItem>
                  <SelectItem value="from_beat">From Beat Distance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Fixed TA (₹)</Label>
                <Input type="number" min="0" value={formFixedTa} onChange={e => setFormFixedTa(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">DA (₹)</Label>
                <Input type="number" min="0" value={formDa} onChange={e => setFormDa(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Per KM (₹)</Label>
                <Input type="number" min="0" step="0.5" value={formTaPerKm} onChange={e => setFormTaPerKm(Number(e.target.value))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveGroup} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingGroup ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members Management Dialog */}
      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Manage Members — {membersGroup?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{selectedUserIds.size} selected</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelectedUserIds(new Set(allUsers.map(u => u.id)))}>
                  Select All
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedUserIds(new Set())}>
                  Clear
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[300px] border rounded-md">
              <div className="p-2 space-y-1">
                {filteredUsers.map(u => (
                  <div
                    key={u.id}
                    className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                      selectedUserIds.has(u.id) ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => toggleMember(u.id)}
                  >
                    <Checkbox checked={selectedUserIds.has(u.id)} onCheckedChange={() => toggleMember(u.id)} />
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">{getInitials(u.full_name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{u.full_name}</span>
                  </div>
                ))}
                {filteredUsers.length === 0 && (
                  <div className="text-center py-6 text-sm text-muted-foreground">No users found</div>
                )}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMembersDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveMembers} disabled={savingMembers}>
              {savingMembers && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save Members ({selectedUserIds.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ExpenseGroupsConfig;
