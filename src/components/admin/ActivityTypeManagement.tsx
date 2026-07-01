import { useEffect, useMemo, useState } from 'react';
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Pencil, ChevronDown, ChevronRight } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';

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
  parent_id: string | null;
  is_category: boolean;
  photo_required: boolean;
  location_required: boolean;
  show_in_picker: boolean;
}

type Draft = Partial<ActivityType>;

const EMPTY_CATEGORY: Draft = {
  code: '', name: '', description: '', is_category: true, is_sales_activity: false,
  productivity_weight: 1, requires_check_in: false, color: '', sort_order: 0,
  is_active: true, show_in_picker: true, photo_required: false, location_required: false,
  parent_id: null,
};

const EMPTY_SUBTYPE: Draft = {
  code: '', name: '', description: '', is_category: false, is_sales_activity: false,
  productivity_weight: 1, requires_check_in: true, color: '', sort_order: 0,
  is_active: true, show_in_picker: true, photo_required: false, location_required: false,
  parent_id: null,
};

export default function ActivityTypeManagement() {
  const { user } = useAuth();
  const { can, loading: permLoading } = usePermissions();
  const canEdit = can('activity_type_settings', 'edit');
  const canRead = can('activity_type_settings', 'read') || canEdit;

  const [rows, setRows] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_CATEGORY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('activity_types' as any)
      .select('*')
      .order('sort_order', { ascending: true })
      .range(0, 4999);
    if (error) toast.error('Failed to load activity types');
    else {
      const list = (data || []) as unknown as ActivityType[];
      setRows(list);
      setExpanded((prev) => {
        const next = { ...prev };
        list.filter(r => r.is_category).forEach(c => { if (next[c.id] === undefined) next[c.id] = true; });
        return next;
      });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const categories = useMemo(
    () => rows.filter(r => r.is_category).sort((a, b) => a.sort_order - b.sort_order),
    [rows]
  );
  const subtypesByParent = useMemo(() => {
    const m: Record<string, ActivityType[]> = {};
    rows.filter(r => !r.is_category).forEach(r => {
      const k = r.parent_id || '_orphan';
      (m[k] ||= []).push(r);
    });
    Object.values(m).forEach(list => list.sort((a, b) => a.sort_order - b.sort_order));
    return m;
  }, [rows]);
  const orphans = subtypesByParent['_orphan'] || [];

  const openCreateCategory = () => {
    setEditingId(null); setDraft(EMPTY_CATEGORY); setDialogOpen(true);
  };
  const openCreateSubtype = (categoryId: string) => {
    setEditingId(null); setDraft({ ...EMPTY_SUBTYPE, parent_id: categoryId }); setDialogOpen(true);
  };
  const openEdit = (row: ActivityType) => {
    setEditingId(row.id); setDraft(row); setDialogOpen(true);
  };

  const persistField = async (row: ActivityType, patch: Partial<ActivityType>) => {
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, ...patch } : r));
    const { error } = await supabase
      .from('activity_types' as any)
      .update({ ...patch, updated_by: user?.id ?? null })
      .eq('id', row.id);
    if (error) { toast.error(error.message); load(); }
  };

  const save = async () => {
    if (!draft.code || !draft.name) { toast.error('Code and Name are required'); return; }
    if (!draft.is_category && !draft.parent_id) {
      toast.error('Sub-type needs a parent category'); return;
    }
    setSaving(true);
    const payload: any = {
      code: draft.code,
      name: draft.name,
      description: draft.description || null,
      is_category: !!draft.is_category,
      parent_id: draft.is_category ? null : (draft.parent_id || null),
      is_sales_activity: !!draft.is_sales_activity,
      productivity_weight: Number(draft.productivity_weight ?? 1),
      requires_check_in: !!draft.requires_check_in,
      default_duration_minutes:
        draft.default_duration_minutes != null && draft.default_duration_minutes !== ('' as any)
          ? Number(draft.default_duration_minutes) : null,
      color: draft.color || null,
      sort_order: Number(draft.sort_order ?? 0),
      is_active: draft.is_active ?? true,
      show_in_picker: draft.show_in_picker ?? true,
      photo_required: !!draft.photo_required,
      location_required: !!draft.location_required,
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
    if (error) { toast.error(error.message); return; }
    toast.success(editingId ? 'Updated' : 'Created');
    setDialogOpen(false);
    load();
  };

  if (permLoading) return <Layout><div className="p-6">Loading…</div></Layout>;
  if (!canRead) {
    return (
      <Layout>
        <div className="p-6 space-y-4">
          <AdminPageHeader title="Activity Type Master" subtitle="Manage the activity categories used across the app." />
          <p className="text-muted-foreground">You don't have permission to view this page.</p>
        </div>
      </Layout>
    );
  }

  const SubtypeRow = ({ r }: { r: ActivityType }) => (
    <div className="grid grid-cols-12 gap-2 items-center py-2 px-3 border-t text-sm">
      <div className="col-span-3 font-medium truncate" title={r.name}>{r.name}
        <div className="text-[10px] font-mono text-muted-foreground">{r.code}</div>
      </div>
      <div className="col-span-2">
        <Select
          value={r.parent_id ?? ''}
          onValueChange={(v) => persistField(r, { parent_id: v })}
          disabled={!canEdit}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-1 flex items-center gap-1 text-xs">
        <Switch checked={r.photo_required} disabled={!canEdit}
          onCheckedChange={(v) => persistField(r, { photo_required: v })} />
        <span>Photo</span>
      </div>
      <div className="col-span-1 flex items-center gap-1 text-xs">
        <Switch checked={r.location_required} disabled={!canEdit}
          onCheckedChange={(v) => persistField(r, { location_required: v })} />
        <span>GPS</span>
      </div>
      <div className="col-span-1 flex items-center gap-1 text-xs">
        <Switch checked={r.requires_check_in} disabled={!canEdit}
          onCheckedChange={(v) => persistField(r, { requires_check_in: v })} />
        <span>Check-in</span>
      </div>
      <div className="col-span-1 flex items-center gap-1 text-xs">
        <Switch checked={r.show_in_picker} disabled={!canEdit}
          onCheckedChange={(v) => persistField(r, { show_in_picker: v })} />
        <span>Picker</span>
      </div>
      <div className="col-span-1 flex items-center gap-1 text-xs">
        <Switch checked={r.is_sales_activity} disabled={!canEdit}
          onCheckedChange={(v) => persistField(r, { is_sales_activity: v })} />
        <span>Sales</span>
      </div>
      <div className="col-span-1">
        <Input type="number" step="0.1" className="h-8 text-xs"
          value={r.productivity_weight}
          onChange={(e) => setRows(prev => prev.map(x => x.id === r.id ? { ...x, productivity_weight: Number(e.target.value) } : x))}
          onBlur={(e) => persistField(r, { productivity_weight: Number(e.target.value) })}
          disabled={!canEdit} />
      </div>
      <div className="col-span-1 flex items-center gap-2 justify-end">
        <Switch checked={r.is_active} disabled={!canEdit}
          onCheckedChange={(v) => persistField(r, { is_active: v })} />
        <Button size="sm" variant="ghost" onClick={() => openEdit(r)} disabled={!canEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="p-6 space-y-4">
        <AdminPageHeader
          title="Activity Type Master"
          subtitle={`Manage the activity categories and sub-types.${!canEdit ? ' (Read-only)' : ''}`}
          rightContent={
            <Button onClick={openCreateCategory} disabled={!canEdit}>
              <Plus className="h-4 w-4 mr-1" /> Add Category
            </Button>
          }
        />

        {loading ? (
          <div className="p-6 text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-3">
            {categories.map((cat) => {
              const kids = subtypesByParent[cat.id] || [];
              const open = expanded[cat.id] ?? true;
              return (
                <div key={cat.id} className="border rounded-md overflow-hidden bg-card">
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/40">
                    <button
                      className="flex items-center gap-2 flex-1 text-left"
                      onClick={() => setExpanded(p => ({ ...p, [cat.id]: !open }))}
                    >
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span
                        className="inline-block h-3 w-3 rounded-sm border"
                        style={{ background: cat.color || 'transparent' }}
                      />
                      <span className="font-semibold">{cat.name}</span>
                      <span className="text-xs text-muted-foreground">({kids.length})</span>
                      {!cat.is_active && <span className="text-xs text-destructive">inactive</span>}
                    </button>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={cat.is_active}
                        onCheckedChange={(v) => persistField(cat, { is_active: v })}
                        disabled={!canEdit}
                      />
                      <Button size="sm" variant="ghost" onClick={() => openEdit(cat)} disabled={!canEdit}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openCreateSubtype(cat.id)} disabled={!canEdit}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Sub-type
                      </Button>
                    </div>
                  </div>
                  {open && (
                    <div>
                      {kids.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-muted-foreground border-t">No sub-types yet.</div>
                      ) : kids.map(r => <SubtypeRow key={r.id} r={r} />)}
                    </div>
                  )}
                </div>
              );
            })}

            {orphans.length > 0 && (
              <div className="border rounded-md overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 font-semibold text-sm">
                  Uncategorised ({orphans.length})
                </div>
                {orphans.map(r => <SubtypeRow key={r.id} r={r} />)}
              </div>
            )}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingId ? 'Edit' : 'Add'} {draft.is_category ? 'Category' : 'Sub-type'}
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Code *</Label>
                <Input
                  value={draft.code || ''}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                  disabled={!!editingId || !canEdit}
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

              {!draft.is_category && (
                <div className="col-span-2">
                  <Label>Parent category *</Label>
                  <Select
                    value={draft.parent_id ?? ''}
                    onValueChange={(v) => setDraft({ ...draft, parent_id: v })}
                    disabled={!canEdit}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

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
                <Input type="number" value={draft.sort_order ?? 0}
                  onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
                  disabled={!canEdit} />
              </div>
              <div>
                <Label>Color</Label>
                <Input value={draft.color || ''} placeholder="#3b82f6"
                  onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                  disabled={!canEdit} />
              </div>

              {!draft.is_category && (
                <>
                  <div>
                    <Label>Productivity weight</Label>
                    <Input type="number" step="0.1" value={draft.productivity_weight ?? 1}
                      onChange={(e) => setDraft({ ...draft, productivity_weight: Number(e.target.value) })}
                      disabled={!canEdit} />
                  </div>
                  <div>
                    <Label>Default duration (min)</Label>
                    <Input type="number" value={draft.default_duration_minutes ?? ''}
                      onChange={(e) => setDraft({
                        ...draft,
                        default_duration_minutes: e.target.value === '' ? null : Number(e.target.value),
                      })}
                      disabled={!canEdit} />
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <Switch checked={!!draft.photo_required}
                      onCheckedChange={(v) => setDraft({ ...draft, photo_required: v })}
                      disabled={!canEdit} />
                    <Label>Photo required</Label>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Switch checked={!!draft.location_required}
                      onCheckedChange={(v) => setDraft({ ...draft, location_required: v })}
                      disabled={!canEdit} />
                    <Label>GPS required</Label>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Switch checked={!!draft.requires_check_in}
                      onCheckedChange={(v) => setDraft({ ...draft, requires_check_in: v })}
                      disabled={!canEdit} />
                    <Label>Requires check-in</Label>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Switch checked={draft.show_in_picker ?? true}
                      onCheckedChange={(v) => setDraft({ ...draft, show_in_picker: v })}
                      disabled={!canEdit} />
                    <Label>Show in picker</Label>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Switch checked={!!draft.is_sales_activity}
                      onCheckedChange={(v) => setDraft({ ...draft, is_sales_activity: v })}
                      disabled={!canEdit} />
                    <Label>Counts as sales visit</Label>
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 mt-2">
                <Switch checked={draft.is_active ?? true}
                  onCheckedChange={(v) => setDraft({ ...draft, is_active: v })}
                  disabled={!canEdit} />
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
    </Layout>
  );
}
