import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Pencil } from 'lucide-react';

interface ActivityType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_sales_activity: boolean;
  productivity_weight: number;
  requires_check_in: boolean;
  default_duration_minutes: number | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
}

type Draft = Partial<ActivityType>;

const EMPTY: Draft = {
  code: '',
  name: '',
  description: '',
  is_sales_activity: false,
  productivity_weight: 1.0,
  requires_check_in: true,
  default_duration_minutes: null,
  color: '',
  sort_order: 0,
  is_active: true,
};

export default function ActivityTypeManagement() {
  const { user } = useAuth();
  const { can, loading: permLoading } = usePermissions();
  const canEdit = can('activity_type_settings', 'edit');
  const canRead = can('activity_type_settings', 'read') || canEdit;

  const [rows, setRows] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('activity_types' as any)
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) {
      toast.error('Failed to load activity types');
    } else {
      setRows((data || []) as unknown as ActivityType[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setDraft(EMPTY);
    setDialogOpen(true);
  };

  const openEdit = (row: ActivityType) => {
    setEditingId(row.id);
    setDraft(row);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!draft.code || !draft.name) {
      toast.error('Code and Name are required');
      return;
    }
    setSaving(true);
    const payload: any = {
      code: draft.code,
      name: draft.name,
      description: draft.description || null,
      is_sales_activity: !!draft.is_sales_activity,
      productivity_weight: Number(draft.productivity_weight ?? 1),
      requires_check_in: !!draft.requires_check_in,
      default_duration_minutes:
        draft.default_duration_minutes != null && draft.default_duration_minutes !== ('' as any)
          ? Number(draft.default_duration_minutes)
          : null,
      color: draft.color || null,
      sort_order: Number(draft.sort_order ?? 0),
      is_active: draft.is_active ?? true,
      updated_by: user?.id ?? null,
    };
    let error;
    if (editingId) {
      ({ error } = await supabase.from('activity_types' as any).update(payload).eq('id', editingId));
    } else {
      payload.created_by = user?.id ?? null;
      ({ error } = await supabase.from('activity_types' as any).insert(payload));
    }
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editingId ? 'Updated' : 'Created');
    setDialogOpen(false);
    load();
  };

  const toggleActive = async (row: ActivityType) => {
    const { error } = await supabase
      .from('activity_types' as any)
      .update({ is_active: !row.is_active, updated_by: user?.id ?? null })
      .eq('id', row.id);
    if (error) toast.error(error.message);
    else load();
  };

  if (permLoading) return <div className="p-6">Loading…</div>;
  if (!canRead) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Activity Type Master</h1>
        <p className="text-muted-foreground mt-2">
          You don't have permission to view this page.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Activity Type Master</h1>
          <p className="text-sm text-muted-foreground">
            Manage the activity categories used across the app.
            {!canEdit && ' (Read-only)'}
          </p>
        </div>
        <Button onClick={openCreate} disabled={!canEdit}>
          <Plus className="h-4 w-4" /> Add Activity Type
        </Button>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Sales?</TableHead>
              <TableHead>Weight</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead>Default min</TableHead>
              <TableHead>Sort</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9}>Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={9}>No activity types.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="font-mono text-xs">{r.code}</TableCell>
                <TableCell>{r.is_sales_activity ? 'Yes' : 'No'}</TableCell>
                <TableCell>{Number(r.productivity_weight)}</TableCell>
                <TableCell>{r.requires_check_in ? 'Required' : 'No'}</TableCell>
                <TableCell>{r.default_duration_minutes ?? '—'}</TableCell>
                <TableCell>{r.sort_order}</TableCell>
                <TableCell>
                  <Switch
                    checked={r.is_active}
                    onCheckedChange={() => toggleActive(r)}
                    disabled={!canEdit}
                  />
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r)} disabled={!canEdit}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Activity Type' : 'Add Activity Type'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Code *</Label>
              <Input
                value={draft.code || ''}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                disabled={!!editingId || !canEdit}
                placeholder="e.g. counter_sale"
              />
            </div>
            <div>
              <Label>Name *</Label>
              <Input
                value={draft.name || ''}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                disabled={!canEdit}
              />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Input
                value={draft.description || ''}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Sort order</Label>
              <Input
                type="number"
                value={draft.sort_order ?? 0}
                onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Productivity weight</Label>
              <Input
                type="number"
                step="0.1"
                value={draft.productivity_weight ?? 1}
                onChange={(e) => setDraft({ ...draft, productivity_weight: Number(e.target.value) })}
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Default duration (min)</Label>
              <Input
                type="number"
                value={draft.default_duration_minutes ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    default_duration_minutes: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Color</Label>
              <Input
                value={draft.color || ''}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                disabled={!canEdit}
                placeholder="#3b82f6"
              />
            </div>
            <div className="flex items-center gap-2 mt-6">
              <Switch
                checked={!!draft.is_sales_activity}
                onCheckedChange={(v) => setDraft({ ...draft, is_sales_activity: v })}
                disabled={!canEdit}
              />
              <Label>Counts as sales visit</Label>
            </div>
            <div className="flex items-center gap-2 mt-6">
              <Switch
                checked={!!draft.requires_check_in}
                onCheckedChange={(v) => setDraft({ ...draft, requires_check_in: v })}
                disabled={!canEdit}
              />
              <Label>Requires check-in</Label>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Switch
                checked={draft.is_active ?? true}
                onCheckedChange={(v) => setDraft({ ...draft, is_active: v })}
                disabled={!canEdit}
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!canEdit || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
