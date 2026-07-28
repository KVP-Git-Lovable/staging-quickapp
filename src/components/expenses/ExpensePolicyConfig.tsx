import React, { useState, useEffect, useCallback } from 'react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Save, Loader2, Car, Utensils, Receipt, Shield, Plus, Trash2, Users, User, Info, Search, Edit2, UserPlus, HelpCircle, MapPin, Navigation, Banknote } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import ExpenseCategoriesConfig from './ExpenseCategoriesConfig';
import ApprovalWorkflowsConfig from './ApprovalWorkflowsConfig';
import ApprovalRulesConfig from './ApprovalRulesConfig';

interface ExpenseConfig {
  id: string;
  ta_type: 'fixed' | 'from_beat' | 'from_gps';
  fixed_ta_amount: number;
  da_amount: number;
  ta_per_km_rate: number;
  da_calculation_basis: 'per_day' | 'per_half_day';
  max_additional_expense_per_day: number;
  max_additional_expense_per_month: number;
  require_bill_above_amount: number;
  allowed_categories: string[];
  expense_policy_notes: string;
}

interface OverrideEntry {
  id: string;
  ref_id: string;
  type: 'user' | 'team';
  amount: number;
  name: string;
}

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

const DEFAULT_CATEGORIES = ['food', 'travel', 'accommodation', 'communication', 'other'];

// ─── Multi-Profile Selector (Popover + Checkboxes for batch selection) ──

const MultiProfileSelector = React.memo<{
  excludeIds: string[];
  onAdd: (selections: { id: string; name: string }[]) => void;
  label: string;
  managersOnly?: boolean;
}>(({ excludeIds, onAdd, label, managersOnly = false }) => {
  const [profiles, setProfiles] = useState<{ id: string; full_name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchProfiles = async () => {
      if (managersOnly) {
        const { data: managerIds } = await supabase
          .from('employees')
          .select('manager_id')
          .not('manager_id', 'is', null);

        const uniqueManagerIds = [...new Set((managerIds || []).map((e: any) => e.manager_id))];

        if (uniqueManagerIds.length === 0) {
          setProfiles([]);
          return;
        }

        const { data: managerProfiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', uniqueManagerIds)
          .order('full_name');

        setProfiles((managerProfiles || []).filter((p: any) => !excludeIds.includes(p.id)));
      } else {
        const { data } = await supabase.rpc('get_profiles_for_selector');
        setProfiles((data || []).filter((p: any) => !excludeIds.includes(p.id)));
      }
    };
    if (open) {
      fetchProfiles();
      setSelected(new Set());
      setSearch('');
    }
  }, [open, excludeIds, managersOnly]);

  const filtered = search.trim()
    ? profiles.filter(p => p.full_name.toLowerCase().includes(search.toLowerCase()))
    : profiles;

  const toggleUser = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const selections = profiles
      .filter(p => selected.has(p.id))
      .map(p => ({ id: p.id, name: p.full_name }));
    if (selections.length > 0) onAdd(selections);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-7 text-xs pl-7"
            />
          </div>
        </div>
        <ScrollArea className="h-[200px]">
          <div className="p-1.5 space-y-0.5">
            {filtered.map(p => (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors',
                  selected.has(p.id) ? 'bg-primary/10' : 'hover:bg-muted/50'
                )}
                onClick={() => toggleUser(p.id)}
              >
                <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleUser(p.id)} className="h-3.5 w-3.5" />
                <span className="truncate">{p.full_name}</span>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-4 text-xs text-muted-foreground">No users available</div>
            )}
          </div>
        </ScrollArea>
        {selected.size > 0 && (
          <div className="p-2 border-t">
            <Button size="sm" className="w-full h-7 text-xs" onClick={handleConfirm}>
              Add {selected.size} Selected
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});

MultiProfileSelector.displayName = 'MultiProfileSelector';

// ─── Override Table (extracted outside to prevent remount on parent re-render) ──

const OverrideTable = React.memo<{
  field: 'ta' | 'da';
  overrides: OverrideEntry[];
  defaultAmount: number;
  onUpdateAmount: (field: 'ta' | 'da', id: string, amount: number) => void;
  onDelete: (field: 'ta' | 'da', entry: OverrideEntry) => void;
  onAdd: (field: 'ta' | 'da', type: 'user' | 'team', refId: string, name: string) => void;
}>(({ field, overrides, defaultAmount, onUpdateAmount, onDelete, onAdd }) => {
  const { format: fmtMoney } = useCurrency();
  const currencySymbol = fmtMoney(0).replace(/[\d.,\s]/g, '') || '';
  const excludeIds = overrides.map(o => o.ref_id);

  return (
    <div className="space-y-3 mt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Default: <span className="font-semibold text-foreground">{fmtMoney(defaultAmount)}</span> for users not listed below
        </p>
      </div>

      {overrides.length > 0 && (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] px-2">User / Team</TableHead>
                <TableHead className="text-[11px] px-2">Type</TableHead>
                <TableHead className="text-[11px] px-2">{field === 'ta' ? 'TA' : 'DA'} Amount ({currencySymbol})</TableHead>
                <TableHead className="text-[11px] px-1 w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overrides.map(o => (
                <TableRow key={`${o.id}-${field}`}>
                  <TableCell className="text-xs font-medium py-2 px-2">{o.name}</TableCell>
                  <TableCell className="py-2 px-2">
                    <Badge variant={o.type === 'user' ? 'default' : 'secondary'} className="text-[10px]">
                      {o.type === 'user' ? <><User className="h-3 w-3 mr-1" />User</> : <><Users className="h-3 w-3 mr-1" />Team</>}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 px-2">
                    <Input
                      type="number"
                      min="0"
                      className="h-8 text-xs w-[100px]"
                      value={o.amount}
                      onChange={(e) => onUpdateAmount(field, o.id, Number(e.target.value))}
                    />
                  </TableCell>
                  <TableCell className="py-2 px-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => onDelete(field, o)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <MultiProfileSelector
          excludeIds={excludeIds}
          onAdd={(selections) => selections.forEach(s => onAdd(field, 'user', s.id, s.name))}
          label="Add Users"
        />
        <MultiProfileSelector
          excludeIds={excludeIds}
          onAdd={(selections) => selections.forEach(s => onAdd(field, 'team', s.id, s.name))}
          label="Add Teams"
          managersOnly
        />
      </div>

      {overrides.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          No custom {field === 'ta' ? 'TA' : 'DA'} overrides yet. Add users or teams above.
        </p>
      )}
    </div>
  );
});

OverrideTable.displayName = 'OverrideTable';
// ─── Inline Group Section (shown inside TA/DA custom sections) ──

const InlineGroupSection = React.memo<{
  groups: ExpenseGroup[];
  field: 'ta' | 'da';
  onCreate: (context: 'ta' | 'da') => void;
  onEdit: (g: ExpenseGroup, context: 'ta' | 'da') => void;
  onMembers: (g: ExpenseGroup) => void;
  onDelete: (g: ExpenseGroup) => void;
}>(({ groups, field, onCreate, onEdit, onMembers, onDelete }) => {
  const { format: fmtMoney } = useCurrency();
  const currencySymbol = fmtMoney(0).replace(/[\d.,\s]/g, '') || '';
  // Filter groups: TA section shows groups with TA config, DA section shows groups with DA config
  const filteredGroups = groups.filter(g => {
    if (field === 'ta') {
      return g.fixed_ta_amount > 0 || g.ta_per_km_rate > 0 || g.ta_type === 'fixed' || g.ta_type === 'from_gps';
    } else {
      return g.da_amount > 0;
    }
  });

  return (
    <div className="mt-4 pt-4 border-t space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          {field === 'ta' ? 'TA' : 'DA'} Group Overrides
        </p>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => onCreate(field)}>
          <Plus className="h-3 w-3" />
          Create {field === 'ta' ? 'TA' : 'DA'} Group
        </Button>
      </div>
      {filteredGroups.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">No {field === 'ta' ? 'TA' : 'DA'} groups yet.</p>
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] px-2">Group</TableHead>
                <TableHead className="text-[11px] px-2">{field === 'ta' ? `TA (${currencySymbol})` : `DA (${currencySymbol})`}</TableHead>
                <TableHead className="text-[11px] px-2">Members</TableHead>
                <TableHead className="text-[11px] px-1 w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGroups.map(g => (
                <TableRow key={g.id}>
                  <TableCell className="py-1.5 px-2">
                    <p className="text-xs font-medium">{g.name}</p>
                    {g.description && <p className="text-[10px] text-muted-foreground">{g.description}</p>}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-xs">
                    {field === 'ta' ? (
                      g.ta_type === 'from_gps' ? `GPS × ${fmtMoney(g.ta_per_km_rate)}/km` : fmtMoney(g.fixed_ta_amount)
                    ) : (
                      fmtMoney(g.da_amount)
                    )}
                  </TableCell>
                  <TableCell className="py-1.5 px-2">
                    <Badge variant="secondary" className="text-[10px] cursor-pointer" onClick={() => onMembers(g)}>
                      <Users className="h-3 w-3 mr-0.5" />{g.member_count || 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-1.5 px-1">
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onMembers(g)}><UserPlus className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onEdit(g, field)}><Edit2 className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => onDelete(g)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">Priority: User Override → Group → Team → Global Default</p>
    </div>
  );
});

InlineGroupSection.displayName = 'InlineGroupSection';

const ExpensePolicyConfig = () => {
  const { format: fmtMoney } = useCurrency();
  const currencySymbol = fmtMoney(0).replace(/[\d.,\s]/g, '') || '';
  const { toast } = useToast();
  const [config, setConfig] = useState<ExpenseConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Distribution modes
  const [taDistribution, setTaDistribution] = useState<'same_for_all' | 'custom'>('same_for_all');
  const [daDistribution, setDaDistribution] = useState<'same_for_all' | 'custom'>('same_for_all');

  // Unified override lists (TA and DA separately)
  const [taOverrides, setTaOverrides] = useState<OverrideEntry[]>([]);
  const [daOverrides, setDaOverrides] = useState<OverrideEntry[]>([]);

  // Expense Groups (inline)
  const [expenseGroups, setExpenseGroups] = useState<ExpenseGroup[]>([]);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupDialogContext, setGroupDialogContext] = useState<'ta' | 'da'>('ta');
  const [editingGroup, setEditingGroup] = useState<ExpenseGroup | null>(null);
  const [groupForm, setGroupForm] = useState({ name: '', description: '', ta_type: 'from_beat' as 'fixed' | 'from_beat' | 'from_gps', fixed_ta_amount: 0, da_amount: 0, ta_per_km_rate: 0 });
  const [savingGroup, setSavingGroup] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [membersGroup, setMembersGroup] = useState<ExpenseGroup | null>(null);
  const [allUsers, setAllUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState('');
  const [savingMembers, setSavingMembers] = useState(false);
  const [showTAHelp, setShowTAHelp] = useState(false);
  const [showDAHelp, setShowDAHelp] = useState(false);

  useEffect(() => {
    fetchConfig();
    fetchOverrides();
    fetchGroups();
  }, []);

  const fetchConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('expense_master_config')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }
      
      if (!data) {
        // No config exists yet — create one
        const { data: newData, error: insertError } = await supabase
          .from('expense_master_config')
          .insert({
            ta_type: 'from_beat',
            fixed_ta_amount: 0,
            da_amount: 0,
          } as any)
          .select()
          .single();

        if (insertError) throw insertError;
        if (newData) {
          setConfig({
            id: newData.id,
            ta_type: (newData.ta_type as 'fixed' | 'from_beat') || 'from_beat',
            fixed_ta_amount: newData.fixed_ta_amount || 0,
            da_amount: newData.da_amount || 0,
            ta_per_km_rate: (newData as any).ta_per_km_rate || 0,
            da_calculation_basis: ((newData as any).da_calculation_basis as 'per_day' | 'per_half_day') || 'per_day',
            max_additional_expense_per_day: (newData as any).max_additional_expense_per_day || 0,
            max_additional_expense_per_month: (newData as any).max_additional_expense_per_month || 0,
            require_bill_above_amount: (newData as any).require_bill_above_amount || 500,
            allowed_categories: (newData as any).allowed_categories || DEFAULT_CATEGORIES,
            expense_policy_notes: (newData as any).expense_policy_notes || '',
          });
        }
      } else {
        setConfig({
          id: data.id,
          ta_type: (data.ta_type as 'fixed' | 'from_beat') || 'from_beat',
          fixed_ta_amount: data.fixed_ta_amount || 0,
          da_amount: data.da_amount || 0,
          ta_per_km_rate: (data as any).ta_per_km_rate || 0,
          da_calculation_basis: ((data as any).da_calculation_basis as 'per_day' | 'per_half_day') || 'per_day',
          max_additional_expense_per_day: (data as any).max_additional_expense_per_day || 0,
          max_additional_expense_per_month: (data as any).max_additional_expense_per_month || 0,
          require_bill_above_amount: (data as any).require_bill_above_amount || 500,
          allowed_categories: (data as any).allowed_categories || DEFAULT_CATEGORIES,
          expense_policy_notes: (data as any).expense_policy_notes || '',
        });
      }
    } catch (error) {
      console.error('Error fetching expense config:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOverrides = async () => {
    try {
      const { data: userData } = await (supabase as any).from('user_expense_config').select('*');
      const { data: teamData } = await (supabase as any).from('team_expense_config').select('*');

      const allIds = [
        ...(userData || []).map((u: any) => u.user_id),
        ...(teamData || []).map((t: any) => t.manager_id),
      ];
      let nameMap = new Map<string, string>();
      if (allIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', allIds);
        profiles?.forEach((p: any) => nameMap.set(p.id, p.full_name || 'Unknown'));
      }

      // Build TA overrides
      const taList: OverrideEntry[] = [];
      const daList: OverrideEntry[] = [];

      (userData || []).forEach((u: any) => {
        const name = nameMap.get(u.user_id) || 'Unknown';
        if (u.fixed_ta_amount > 0 || u.ta_type) {
          taList.push({ id: u.id, ref_id: u.user_id, type: 'user', amount: u.fixed_ta_amount || 0, name });
        }
        if (u.da_amount > 0) {
          daList.push({ id: u.id, ref_id: u.user_id, type: 'user', amount: u.da_amount || 0, name });
        }
      });

      (teamData || []).forEach((t: any) => {
        const name = nameMap.get(t.manager_id) || 'Unknown';
        if (t.fixed_ta_amount > 0 || t.ta_type) {
          taList.push({ id: t.id, ref_id: t.manager_id, type: 'team', amount: t.fixed_ta_amount || 0, name });
        }
        if (t.da_amount > 0) {
          daList.push({ id: t.id, ref_id: t.manager_id, type: 'team', amount: t.da_amount || 0, name });
        }
      });

      setTaOverrides(taList);
      setDaOverrides(daList);

      // Set distribution mode based on existing data
      if (taList.length > 0) setTaDistribution('custom');
      if (daList.length > 0) setDaDistribution('custom');
    } catch (error) {
      console.error('Error fetching overrides:', error);
    }
  };

  // ─── Expense Groups helpers ────────────────────────────────────────────────

  const fetchGroups = async () => {
    try {
      const { data: groupsData } = await (supabase as any).from('expense_groups').select('*').order('name');
      const { data: membersData } = await (supabase as any).from('expense_group_members').select('group_id');
      const countMap = new Map<string, number>();
      (membersData || []).forEach((m: any) => countMap.set(m.group_id, (countMap.get(m.group_id) || 0) + 1));
      setExpenseGroups((groupsData || []).map((g: any) => ({ ...g, member_count: countMap.get(g.id) || 0 })));
    } catch (error) {
      console.error('Error fetching groups:', error);
    }
  };

  const openCreateGroupDialog = (context: 'ta' | 'da' = 'ta') => {
    setEditingGroup(null);
    setGroupDialogContext(context);
    setGroupForm({ name: '', description: '', ta_type: 'from_beat', fixed_ta_amount: 0, da_amount: 0, ta_per_km_rate: 0 });
    setGroupDialogOpen(true);
  };

  const openEditGroupDialog = (group: ExpenseGroup, context: 'ta' | 'da' = 'ta') => {
    setEditingGroup(group);
    setGroupDialogContext(context);
    setGroupForm({ name: group.name, description: group.description || '', ta_type: group.ta_type as 'fixed' | 'from_beat' | 'from_gps', fixed_ta_amount: group.fixed_ta_amount, da_amount: group.da_amount, ta_per_km_rate: group.ta_per_km_rate });
    setGroupDialogOpen(true);
  };

  const handleSaveGroup = async () => {
    if (!groupForm.name.trim()) { toast({ title: 'Error', description: 'Group name is required', variant: 'destructive' }); return; }
    try {
      setSavingGroup(true);
      const payload = { name: groupForm.name.trim(), description: groupForm.description.trim() || null, ta_type: groupForm.ta_type, fixed_ta_amount: groupForm.fixed_ta_amount, da_amount: groupForm.da_amount, ta_per_km_rate: groupForm.ta_per_km_rate, updated_at: new Date().toISOString() };
      if (editingGroup) {
        await (supabase as any).from('expense_groups').update(payload).eq('id', editingGroup.id);
        toast({ title: 'Updated', description: `Group "${groupForm.name}" updated` });
      } else {
        await (supabase as any).from('expense_groups').insert(payload);
        toast({ title: 'Created', description: `Group "${groupForm.name}" created` });
      }
      setGroupDialogOpen(false);
      fetchGroups();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally { setSavingGroup(false); }
  };

  const handleDeleteGroup = async (group: ExpenseGroup) => {
    if (!confirm(`Delete group "${group.name}"?`)) return;
    try {
      await (supabase as any).from('expense_groups').delete().eq('id', group.id);
      toast({ title: 'Deleted', description: `Group "${group.name}" deleted` });
      fetchGroups();
    } catch (error: any) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
  };

  const openMembersDialog = async (group: ExpenseGroup) => {
    setMembersGroup(group);
    setMemberSearch('');
    setMembersDialogOpen(true);
    const { data: memberRows } = await (supabase as any).from('expense_group_members').select('user_id').eq('group_id', group.id);
    setSelectedMemberIds(new Set((memberRows || []).map((m: any) => m.user_id)));
    const { data: allProfiles } = await supabase.rpc('get_profiles_for_selector');
    setAllUsers((allProfiles || []).map((p: any) => ({ id: p.id, full_name: p.full_name || 'Unknown' })));
  };

  const handleSaveMembers = async () => {
    if (!membersGroup) return;
    try {
      setSavingMembers(true);
      await (supabase as any).from('expense_group_members').delete().eq('group_id', membersGroup.id);
      if (selectedMemberIds.size > 0) {
        const rows = Array.from(selectedMemberIds).map(uid => ({ group_id: membersGroup.id, user_id: uid }));
        const { error } = await (supabase as any).from('expense_group_members').insert(rows);
        if (error) throw error;
      }
      toast({ title: 'Saved', description: `${selectedMemberIds.size} members assigned to "${membersGroup.name}"` });
      setMembersDialogOpen(false);
      fetchGroups();
    } catch (error: any) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
    finally { setSavingMembers(false); }
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const filteredMemberUsers = memberSearch.trim()
    ? allUsers.filter(u => u.full_name.toLowerCase().includes(memberSearch.toLowerCase()))
    : allUsers;

  // ─── Override CRUD helpers ──────────────────────────────────────────────────

  const addOverride = async (
    field: 'ta' | 'da',
    type: 'user' | 'team',
    refId: string,
    name: string
  ) => {
    try {
      const defaultAmount = field === 'ta' ? (config?.fixed_ta_amount || 0) : (config?.da_amount || 0);
      const table = type === 'user' ? 'user_expense_config' : 'team_expense_config';
      const refField = type === 'user' ? 'user_id' : 'manager_id';

      // Check if record already exists
      const { data: existing } = await (supabase as any).from(table).select('*').eq(refField, refId).maybeSingle();

      if (existing) {
        // Update the specific field
        const updateData = field === 'ta'
          ? { fixed_ta_amount: defaultAmount, ta_type: config?.ta_type || 'fixed', updated_at: new Date().toISOString() }
          : { da_amount: defaultAmount, updated_at: new Date().toISOString() };
        await (supabase as any).from(table).update(updateData).eq('id', existing.id);

        const entry: OverrideEntry = { id: existing.id, ref_id: refId, type, amount: defaultAmount, name };
        if (field === 'ta') setTaOverrides(prev => [...prev, entry]);
        else setDaOverrides(prev => [...prev, entry]);
      } else {
        // Insert new record
        const insertData = type === 'user'
          ? {
              user_id: refId,
              ta_type: field === 'ta' ? (config?.ta_type || 'fixed') : 'from_beat',
              fixed_ta_amount: field === 'ta' ? defaultAmount : 0,
              da_amount: field === 'da' ? defaultAmount : 0,
            }
          : {
              manager_id: refId,
              ta_type: field === 'ta' ? (config?.ta_type || 'fixed') : 'from_beat',
              fixed_ta_amount: field === 'ta' ? defaultAmount : 0,
              da_amount: field === 'da' ? defaultAmount : 0,
            };

        const { data, error } = await (supabase as any).from(table).insert(insertData).select().single();
        if (error) throw error;

        const entry: OverrideEntry = { id: data.id, ref_id: refId, type, amount: defaultAmount, name };
        if (field === 'ta') setTaOverrides(prev => [...prev, entry]);
        else setDaOverrides(prev => [...prev, entry]);
      }

      toast({ title: "Added", description: `${type === 'team' ? 'Team' : 'User'} override added for ${name}` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to add", variant: "destructive" });
    }
  };

  const updateOverrideAmount = (field: 'ta' | 'da', id: string, amount: number) => {
    if (field === 'ta') {
      setTaOverrides(prev => prev.map(o => o.id === id ? { ...o, amount } : o));
    } else {
      setDaOverrides(prev => prev.map(o => o.id === id ? { ...o, amount } : o));
    }
  };

  const deleteOverride = async (field: 'ta' | 'da', entry: OverrideEntry) => {
    try {
      const table = entry.type === 'user' ? 'user_expense_config' : 'team_expense_config';
      // Check if the other field also has an override for this same record
      const otherList = field === 'ta' ? daOverrides : taOverrides;
      const hasOther = otherList.some(o => o.id === entry.id);

      if (hasOther) {
        // Just zero out this field, don't delete the row
        const updateData = field === 'ta'
          ? { fixed_ta_amount: 0, ta_type: null, updated_at: new Date().toISOString() }
          : { da_amount: 0, updated_at: new Date().toISOString() };
        await (supabase as any).from(table).update(updateData).eq('id', entry.id);
      } else {
        // No other field uses this row, delete it entirely
        await (supabase as any).from(table).delete().eq('id', entry.id);
      }

      if (field === 'ta') setTaOverrides(prev => prev.filter(o => o.id !== entry.id));
      else setDaOverrides(prev => prev.filter(o => o.id !== entry.id));

      toast({ title: "Removed", description: "Override removed" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to remove", variant: "destructive" });
    }
  };

  // ─── Save All ───────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!config) return;
    try {
      setSaving(true);

      // Save global config
      const { error } = await supabase
        .from('expense_master_config')
        .update({
          ta_type: config.ta_type,
          fixed_ta_amount: config.fixed_ta_amount,
          da_amount: config.da_amount,
          ta_per_km_rate: config.ta_per_km_rate,
          da_calculation_basis: config.da_calculation_basis,
          max_additional_expense_per_day: config.max_additional_expense_per_day,
          max_additional_expense_per_month: config.max_additional_expense_per_month,
          require_bill_above_amount: config.require_bill_above_amount,
          allowed_categories: config.allowed_categories,
          expense_policy_notes: config.expense_policy_notes,
        } as any)
        .eq('id', config.id);

      if (error) throw error;

      // Save TA overrides
      for (const o of taOverrides) {
        const table = o.type === 'user' ? 'user_expense_config' : 'team_expense_config';
        await (supabase as any).from(table)
          .update({ fixed_ta_amount: o.amount, ta_type: 'fixed', updated_at: new Date().toISOString() })
          .eq('id', o.id);
      }

      // Save DA overrides
      for (const o of daOverrides) {
        const table = o.type === 'user' ? 'user_expense_config' : 'team_expense_config';
        await (supabase as any).from(table)
          .update({ da_amount: o.amount, updated_at: new Date().toISOString() })
          .eq('id', o.id);
      }

      // If switching to same_for_all, clean up overrides
      if (taDistribution === 'same_for_all' && taOverrides.length > 0) {
        for (const o of taOverrides) {
          const table = o.type === 'user' ? 'user_expense_config' : 'team_expense_config';
          const hasDA = daOverrides.some(d => d.id === o.id);
          if (hasDA) {
            await (supabase as any).from(table).update({ fixed_ta_amount: 0, ta_type: null }).eq('id', o.id);
          } else {
            await (supabase as any).from(table).delete().eq('id', o.id);
          }
        }
        setTaOverrides([]);
      }

      if (daDistribution === 'same_for_all' && daOverrides.length > 0) {
        for (const o of daOverrides) {
          const table = o.type === 'user' ? 'user_expense_config' : 'team_expense_config';
          const hasTA = taOverrides.some(t => t.id === o.id);
          if (hasTA) {
            await (supabase as any).from(table).update({ da_amount: 0 }).eq('id', o.id);
          } else {
            await (supabase as any).from(table).delete().eq('id', o.id);
          }
        }
        setDaOverrides([]);
      }

      toast({ title: "Success", description: "Expense policy saved successfully" });
    } catch (error) {
      console.error('Error saving config:', error);
      toast({ title: "Error", description: "Failed to save policy", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ─── Stable callbacks for OverrideTable ─────────────────────────────────────

  const handleUpdateOverrideAmount = useCallback((field: 'ta' | 'da', id: string, amount: number) => {
    updateOverrideAmount(field, id, amount);
  }, []);

  const handleDeleteOverride = useCallback((field: 'ta' | 'da', entry: OverrideEntry) => {
    deleteOverride(field, entry);
  }, [daOverrides, taOverrides]);

  const handleAddOverride = useCallback((field: 'ta' | 'da', type: 'user' | 'team', refId: string, name: string) => {
    addOverride(field, type, refId, name);
  }, [config]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Loading expense configuration...
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── TA Policy Card ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Car className="h-4 w-4 text-primary" />
              Travel Allowance (TA) Policy
            </CardTitle>
            <button
              onClick={() => setShowTAHelp(true)}
              className="inline-flex items-center justify-center rounded-full w-7 h-7 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              aria-label="How TA policy works"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* TA Calculation Method */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">TA Calculation Method</Label>
            <Select
              value={config.ta_type}
              onValueChange={(value: 'fixed' | 'from_beat' | 'from_gps') =>
                setConfig(prev => prev ? { ...prev, ta_type: value } : null)
              }
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed TA per Day</SelectItem>
                <SelectItem value="from_beat">TA from Beat Distance</SelectItem>
                <SelectItem value="from_gps">From GPS Tracking</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* From Beat — info message */}
          {config.ta_type === 'from_beat' && (
            <div className="rounded-md bg-muted/50 border p-3 flex items-start gap-2">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">
                  TA will be auto-calculated from each beat's travel allowance value. Configure beat-level TA in the Beat Management section.
                </p>
                <div className="mt-2 space-y-1.5">
                  <Label className="text-xs">Per KM Rate ({currencySymbol}) — optional</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    className="max-w-[180px]"
                    value={config.ta_per_km_rate}
                    onChange={(e) =>
                      setConfig(prev => prev ? { ...prev, ta_per_km_rate: Number(e.target.value) } : null)
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">Set 0 to use beat-level fixed TA</p>
                </div>
              </div>
            </div>
          )}

          {/* From GPS — info message + per-km rate */}
          {config.ta_type === 'from_gps' && (
            <div className="rounded-md bg-muted/50 border p-3 flex items-start gap-2">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">
                  TA will be auto-calculated from the user's actual GPS kilometers traveled during the day. The system tracks GPS distance in real-time and calculates: <strong>TA = Total KM × Per KM Rate</strong>.
                </p>
                <div className="mt-2 space-y-1.5">
                  <Label className="text-xs">Per KM Rate ({currencySymbol}) <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    className="max-w-[180px]"
                    value={config.ta_per_km_rate}
                    onChange={(e) =>
                      setConfig(prev => prev ? { ...prev, ta_per_km_rate: Number(e.target.value) } : null)
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Example: If rate is {fmtMoney(8)}/km and user travels 45 km, TA = {fmtMoney(360)}
                  </p>
                </div>
              </div>
            </div>
          )}


          {config.ta_type === 'fixed' && (
            <>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Distribution</Label>
                <RadioGroup
                  value={taDistribution}
                  onValueChange={(v) => setTaDistribution(v as 'same_for_all' | 'custom')}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="same_for_all" id="ta-same" />
                    <Label htmlFor="ta-same" className="text-xs cursor-pointer">Same for all</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="custom" id="ta-custom" />
                    <Label htmlFor="ta-custom" className="text-xs cursor-pointer">Custom per user/team</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  {taDistribution === 'custom' ? `Default TA Amount (${currencySymbol})` : `Fixed TA Amount (${currencySymbol})`}
                </Label>
                <Input
                  type="number"
                  min="0"
                  className="max-w-[180px]"
                  value={config.fixed_ta_amount}
                  onChange={(e) =>
                    setConfig(prev => prev ? { ...prev, fixed_ta_amount: Number(e.target.value) } : null)
                  }
                />
                {taDistribution === 'same_for_all' && (
                  <p className="text-[11px] text-muted-foreground">Every user gets {fmtMoney(config.fixed_ta_amount)} per working day</p>
                )}
              </div>

              {taDistribution === 'custom' && (
                <>
                  <OverrideTable field="ta" overrides={taOverrides} defaultAmount={config.fixed_ta_amount} onUpdateAmount={handleUpdateOverrideAmount} onDelete={handleDeleteOverride} onAdd={handleAddOverride} />
                  <InlineGroupSection groups={expenseGroups} field="ta" onCreate={openCreateGroupDialog} onEdit={openEditGroupDialog} onMembers={openMembersDialog} onDelete={handleDeleteGroup} />
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── DA Policy Card ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Utensils className="h-4 w-4 text-primary" />
              Daily Allowance (DA) Policy
            </CardTitle>
            <button
              onClick={() => setShowDAHelp(true)}
              className="inline-flex items-center justify-center rounded-full w-7 h-7 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              aria-label="How DA policy works"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Distribution */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Distribution</Label>
            <RadioGroup
              value={daDistribution}
              onValueChange={(v) => setDaDistribution(v as 'same_for_all' | 'custom')}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="same_for_all" id="da-same" />
                <Label htmlFor="da-same" className="text-xs cursor-pointer">Same for all</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="custom" id="da-custom" />
                <Label htmlFor="da-custom" className="text-xs cursor-pointer">Custom per user/team</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">
                {daDistribution === 'custom' ? `Default DA Amount (${currencySymbol})` : `DA Amount (${currencySymbol})`}
              </Label>
              <Input
                type="number"
                min="0"
                value={config.da_amount}
                onChange={(e) =>
                  setConfig(prev => prev ? { ...prev, da_amount: Number(e.target.value) } : null)
                }
              />
              {daDistribution === 'same_for_all' && (
                <p className="text-[11px] text-muted-foreground">Daily allowance on attendance-marked days</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Calculation Basis</Label>
              <Select
                value={config.da_calculation_basis}
                onValueChange={(value: 'per_day' | 'per_half_day') =>
                  setConfig(prev => prev ? { ...prev, da_calculation_basis: value } : null)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_day">Full Day Only</SelectItem>
                  <SelectItem value="per_half_day">Half Day = 50% DA</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">How DA applies for half-day attendance</p>
            </div>
          </div>

          {daDistribution === 'custom' && (
            <>
              <OverrideTable field="da" overrides={daOverrides} defaultAmount={config.da_amount} onUpdateAmount={handleUpdateOverrideAmount} onDelete={handleDeleteOverride} onAdd={handleAddOverride} />
              <InlineGroupSection groups={expenseGroups} field="da" onCreate={openCreateGroupDialog} onEdit={openEditGroupDialog} onMembers={openMembersDialog} onDelete={handleDeleteGroup} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Additional Expenses Policy */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            Additional Expenses Policy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Max per Day ({currencySymbol})</Label>
              <Input
                type="number"
                min="0"
                value={config.max_additional_expense_per_day}
                onChange={(e) =>
                  setConfig(prev => prev ? { ...prev, max_additional_expense_per_day: Number(e.target.value) } : null)
                }
              />
              <p className="text-[11px] text-muted-foreground">0 = no limit</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Max per Month ({currencySymbol})</Label>
              <Input
                type="number"
                min="0"
                value={config.max_additional_expense_per_month}
                onChange={(e) =>
                  setConfig(prev => prev ? { ...prev, max_additional_expense_per_month: Number(e.target.value) } : null)
                }
              />
              <p className="text-[11px] text-muted-foreground">0 = no limit</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bill Required Above ({currencySymbol})</Label>
              <Input
                type="number"
                min="0"
                value={config.require_bill_above_amount}
                onChange={(e) =>
                  setConfig(prev => prev ? { ...prev, require_bill_above_amount: Number(e.target.value) } : null)
                }
              />
              <p className="text-[11px] text-muted-foreground">Mandatory bill attachment above this amount</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Group Dialogs are rendered below */}

      {/* Expense Categories */}
      <ExpenseCategoriesConfig />

      {/* Approval Workflows */}
      <ApprovalWorkflowsConfig />

      {/* Approval Rules */}
      <ApprovalRulesConfig />

      {/* Policy Notes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Policy Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={config.expense_policy_notes}
            onChange={(e) =>
              setConfig(prev => prev ? { ...prev, expense_policy_notes: e.target.value } : null)
            }
            placeholder="Add any additional policy notes or guidelines for expense claims..."
            rows={3}
            className="text-sm"
          />
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Expense Policy
        </Button>
      </div>

      {/* Create/Edit Group Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGroup ? 'Edit Group' : `Create ${groupDialogContext === 'ta' ? 'TA' : 'DA'} Group`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Group Name *</Label>
              <Input value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. North Region Sales" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input value={groupForm.description} onChange={e => setGroupForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
            </div>

            {/* TA-specific fields */}
            {groupDialogContext === 'ta' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">TA Type</Label>
                  <Select value={groupForm.ta_type} onValueChange={(v: 'fixed' | 'from_beat' | 'from_gps') => setGroupForm(f => ({ ...f, ta_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed TA</SelectItem>
                      <SelectItem value="from_beat">From Beat Distance</SelectItem>
                      <SelectItem value="from_gps">From GPS Tracking</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fixed TA ({currencySymbol})</Label>
                    <Input type="number" min="0" value={groupForm.fixed_ta_amount} onChange={e => setGroupForm(f => ({ ...f, fixed_ta_amount: Number(e.target.value) }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Per KM Rate ({currencySymbol})</Label>
                    <Input type="number" min="0" step="0.5" value={groupForm.ta_per_km_rate} onChange={e => setGroupForm(f => ({ ...f, ta_per_km_rate: Number(e.target.value) }))} />
                  </div>
                </div>
              </>
            )}

            {/* DA-specific fields */}
            {groupDialogContext === 'da' && (
              <div className="space-y-1.5">
                <Label className="text-xs">DA Amount ({currencySymbol})</Label>
                <Input type="number" min="0" value={groupForm.da_amount} onChange={e => setGroupForm(f => ({ ...f, da_amount: Number(e.target.value) }))} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveGroup} disabled={savingGroup}>
              {savingGroup && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
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
              <Input placeholder="Search users..." value={memberSearch} onChange={e => setMemberSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{selectedMemberIds.size} selected</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelectedMemberIds(new Set(allUsers.map(u => u.id)))}>Select All</Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedMemberIds(new Set())}>Clear</Button>
              </div>
            </div>
            <ScrollArea className="h-[300px] border rounded-md">
              <div className="p-2 space-y-1">
                {filteredMemberUsers.map(u => (
                  <div
                    key={u.id}
                    className={cn('flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors', selectedMemberIds.has(u.id) ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50')}
                    onClick={() => { setSelectedMemberIds(prev => { const next = new Set(prev); if (next.has(u.id)) next.delete(u.id); else next.add(u.id); return next; }); }}
                  >
                    <Checkbox checked={selectedMemberIds.has(u.id)} onCheckedChange={() => { setSelectedMemberIds(prev => { const next = new Set(prev); if (next.has(u.id)) next.delete(u.id); else next.add(u.id); return next; }); }} />
                    <Avatar className="h-6 w-6"><AvatarFallback className="text-xs">{getInitials(u.full_name)}</AvatarFallback></Avatar>
                    <span className="text-sm">{u.full_name}</span>
                  </div>
                ))}
                {filteredMemberUsers.length === 0 && <div className="text-center py-6 text-sm text-muted-foreground">No users found</div>}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMembersDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveMembers} disabled={savingMembers}>
              {savingMembers && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save Members ({selectedMemberIds.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TA Help Dialog */}
      <Dialog open={showTAHelp} onOpenChange={setShowTAHelp}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Car className="h-4 w-4 text-primary" />
              How Travel Allowance (TA) Works
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="space-y-1.5">
              <h4 className="font-semibold text-foreground">What is TA?</h4>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Travel Allowance compensates employees for <strong className="text-foreground">travel expenses</strong> incurred during field work — fuel, transport, tolls, etc. TA is calculated daily based on the method you choose.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-foreground">3 Calculation Methods</h4>
              <div className="grid gap-2">
                <div className="p-2.5 rounded-md border bg-muted/30">
                  <div className="flex items-center gap-2 mb-1">
                    <Banknote className="h-3.5 w-3.5 text-blue-500" />
                    <span className="font-medium text-xs text-foreground">Fixed TA per Day</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">A flat amount paid every working day, regardless of distance traveled. Simple and predictable.</p>
                </div>
                <div className="p-2.5 rounded-md border bg-muted/30">
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="h-3.5 w-3.5 text-green-500" />
                    <span className="font-medium text-xs text-foreground">From Beat Distance</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">TA is calculated from each beat's configured distance (average KM). Uses the <strong>per-KM rate</strong> × beat distance, or a beat-level fixed allowance.</p>
                </div>
                <div className="p-2.5 rounded-md border bg-muted/30">
                  <div className="flex items-center gap-2 mb-1">
                    <Navigation className="h-3.5 w-3.5 text-orange-500" />
                    <span className="font-medium text-xs text-foreground">From GPS Tracking</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">TA is <strong>auto-calculated</strong> from actual GPS kilometers traveled during the day. Uses <strong>per-KM rate</strong> × real distance. Updates in real-time.</p>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <h4 className="font-semibold text-foreground">Distribution Options</h4>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex gap-2">
                  <Badge variant="secondary" className="text-[10px] shrink-0">Same for all</Badge>
                  <span>One TA amount/method applies to the entire organization</span>
                </div>
                <div className="flex gap-2">
                  <Badge variant="secondary" className="text-[10px] shrink-0">Custom</Badge>
                  <span>Set different TA for specific users, teams (managers), or groups</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <h4 className="font-semibold text-foreground">Override Priority</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                When multiple configs exist, the system resolves in this order:
              </p>
              <ol className="text-[11px] text-muted-foreground space-y-0.5 list-decimal list-inside">
                <li><strong className="text-foreground">User Override</strong> — highest priority</li>
                <li><strong className="text-foreground">Group Override</strong> — assigned expense group</li>
                <li><strong className="text-foreground">Team Override</strong> — set by manager</li>
                <li><strong className="text-foreground">Global Default</strong> — fallback for everyone</li>
              </ol>
            </div>

            <div className="p-3 rounded-md border border-dashed bg-muted/20 space-y-2">
              <h4 className="font-semibold text-foreground text-xs">💡 Example</h4>
              <div className="text-[11px] text-muted-foreground space-y-1">
                <p><strong className="text-foreground">Method:</strong> From GPS Tracking, Rate: {fmtMoney(8)}/km</p>
                <p><strong className="text-foreground">Employee travels:</strong> 45 km in a day</p>
                <p><strong className="text-foreground">TA calculated:</strong> 45 × {fmtMoney(8)} = <strong className="text-foreground">{fmtMoney(360)}</strong></p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DA Help Dialog */}
      <Dialog open={showDAHelp} onOpenChange={setShowDAHelp}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Utensils className="h-4 w-4 text-primary" />
              How Daily Allowance (DA) Works
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="space-y-1.5">
              <h4 className="font-semibold text-foreground">What is DA?</h4>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Daily Allowance covers <strong className="text-foreground">daily expenses</strong> like food, refreshments, and incidentals that employees incur while working in the field. It is a fixed amount paid per working day.
              </p>
            </div>

            <div className="space-y-1.5">
              <h4 className="font-semibold text-foreground">How It's Calculated</h4>
              <div className="p-2.5 rounded-md border bg-muted/30">
                <p className="text-[11px] text-muted-foreground">
                  DA is a <strong className="text-foreground">flat daily amount</strong> credited for each day the employee is marked as present (checked in). Unlike TA, there is no distance-based variation — every present day earns the same DA.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <h4 className="font-semibold text-foreground">Distribution Options</h4>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex gap-2">
                  <Badge variant="secondary" className="text-[10px] shrink-0">Same for all</Badge>
                  <span>One DA amount applies to everyone in the organization</span>
                </div>
                <div className="flex gap-2">
                  <Badge variant="secondary" className="text-[10px] shrink-0">Custom</Badge>
                  <span>Set different DA for specific users, teams, or groups based on role, location, etc.</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <h4 className="font-semibold text-foreground">Override Priority</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Same as TA — when multiple configs exist:
              </p>
              <ol className="text-[11px] text-muted-foreground space-y-0.5 list-decimal list-inside">
                <li><strong className="text-foreground">User Override</strong> — highest priority</li>
                <li><strong className="text-foreground">Group Override</strong> — assigned expense group</li>
                <li><strong className="text-foreground">Team Override</strong> — set by manager</li>
                <li><strong className="text-foreground">Global Default</strong> — fallback for everyone</li>
              </ol>
            </div>

            <div className="p-3 rounded-md border border-dashed bg-muted/20 space-y-2">
              <h4 className="font-semibold text-foreground text-xs">💡 Example</h4>
              <div className="text-[11px] text-muted-foreground space-y-1">
                <p><strong className="text-foreground">Global DA:</strong> {fmtMoney(200)}/day</p>
                <p><strong className="text-foreground">Group "Metro Cities":</strong> {fmtMoney(300)}/day (override)</p>
                <p><strong className="text-foreground">Employee in Metro group, present 22 days:</strong> 22 × {fmtMoney(300)} = <strong className="text-foreground">{fmtMoney(6600)}</strong></p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExpensePolicyConfig;
