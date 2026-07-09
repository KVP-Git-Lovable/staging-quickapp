import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Plus, Pencil, ChevronDown, Search, Camera, MapPin, Clock,
  MoreVertical, Sparkles, EyeOff, Layers, ListTree, Activity as ActivityIcon,
} from 'lucide-react';
import { Layout } from '@/components/Layout';

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

// Tint helpers for the category icon chip. Accepts either a hex color or a
// named token; falls back to the muted surface when nothing is set.
const chipStyle = (color?: string | null) => {
  if (!color) return { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' };
  const hex = color.startsWith('#') ? color : `#${color}`;
  return { background: `${hex}1f`, color: hex };
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
  const [search, setSearch] = useState('');

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

  const q = search.trim().toLowerCase();
  const matches = (r: ActivityType) =>
    !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q);

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

  // Summary counts (from full loaded set, not filtered)
  const counts = useMemo(() => {
    const subs = rows.filter(r => !r.is_category);
    return {
      categories: rows.filter(r => r.is_category).length,
      subtypes: subs.length,
      photo: subs.filter(r => r.photo_required).length,
      gps: subs.filter(r => r.location_required).length,
    };
  }, [rows]);

  const hiddenSubs = useMemo(
    () => rows.filter(r => !r.is_category && !r.show_in_picker),
    [rows]
  );

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
        <div className="p-6 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Activity type master</h1>
          <p className="text-muted-foreground">You don't have permission to view this page.</p>
        </div>
      </Layout>
    );
  }

  // Static class map — Tailwind's JIT can't detect classes assembled from
  // template literals, so each tint is spelled out in full.
  const TINT_ON: Record<string, string> = {
    sky:     'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300',
    emerald: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
    amber:   'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300',
  };
  const TINT_OFF = 'border-border bg-muted/40 text-muted-foreground';

  // Compact toggle used inline on sub-type rows.
  const ToggleChip = ({
    checked, onChange, icon: Icon, label, tint,
  }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    icon: typeof Camera;
    label: string;
    tint: 'sky' | 'emerald' | 'amber';
  }) => (
    <div
      className={[
        'flex items-center gap-1.5 rounded-full border px-2 py-1 transition-colors',
        checked ? TINT_ON[tint] : TINT_OFF,
      ].join(' ')}
    >
      <Icon className="h-3 w-3" />
      <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      <Switch
        checked={checked}
        disabled={!canEdit}
        onCheckedChange={onChange}
        className="scale-75 -my-1"
      />
    </div>
  );


  const SummaryCard = ({
    label, value, icon: Icon,
  }: { label: string; value: number; icon: typeof Layers }) => (
    <Card className="border-border/60 bg-secondary/40">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-background/70 flex items-center justify-center text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold leading-none mt-0.5 tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );

  const SubtypeRow = ({ r }: { r: ActivityType }) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 px-4 border-t">
      <div className="min-w-[10rem] flex-1">
        <div className="text-sm font-medium truncate" title={r.name}>{r.name}</div>
        <div className="text-[10px] font-mono text-muted-foreground truncate">{r.code}</div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <ToggleChip
          checked={r.photo_required}
          onChange={(v) => persistField(r, { photo_required: v })}
          icon={Camera} label="Photo" tint="sky"
        />
        <ToggleChip
          checked={r.location_required}
          onChange={(v) => persistField(r, { location_required: v })}
          icon={MapPin} label="GPS" tint="emerald"
        />
        <ToggleChip
          checked={r.requires_check_in}
          onChange={(v) => persistField(r, { requires_check_in: v })}
          icon={Clock} label="Check-in" tint="amber"
        />
      </div>

      <Badge variant="secondary" className="text-[10px] font-mono">
        ×{r.productivity_weight}
      </Badge>

      {!r.show_in_picker && (
        <Badge variant="outline" className="text-[10px] gap-1">
          <EyeOff className="h-3 w-3" /> Hidden
        </Badge>
      )}

      <div className="flex items-center gap-2 ml-auto">
        <div className="flex items-center gap-1.5">
          <Switch
            checked={r.is_active}
            disabled={!canEdit}
            onCheckedChange={(v) => persistField(r, { is_active: v })}
          />
          <span className="text-[11px] text-muted-foreground">Active</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!canEdit}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(r)}>
              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit sub-type
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => persistField(r, { show_in_picker: !r.show_in_picker })}
            >
              <EyeOff className="h-3.5 w-3.5 mr-2" />
              {r.show_in_picker ? 'Hide from picker' : 'Show in picker'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="p-6 space-y-6 w-full">
        {/* Header (no back button, no AdminPageHeader) */}
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Activity type master</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure categories, sub-types, and per-type check-in rules.
              {!canEdit && <span className="ml-2 text-xs">(Read-only)</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or code…"
                className="pl-8 h-9 w-56"
              />
            </div>
            <Button onClick={openCreateCategory} disabled={!canEdit}>
              <Plus className="h-4 w-4 mr-1" /> Add category
            </Button>
          </div>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard label="Categories" value={counts.categories} icon={Layers} />
          <SummaryCard label="Sub-types" value={counts.subtypes} icon={ListTree} />
          <SummaryCard label="Photo required" value={counts.photo} icon={Camera} />
          <SummaryCard label="GPS required" value={counts.gps} icon={MapPin} />
        </div>

        {loading ? (
          <div className="p-6 text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-3">
            {categories.map((cat) => {
              const kidsAll = subtypesByParent[cat.id] || [];
              const kids = q ? kidsAll.filter(matches) : kidsAll;
              // When searching, hide categories with no matches (unless the
              // category itself matches).
              if (q && !matches(cat) && kids.length === 0) return null;
              const open = expanded[cat.id] ?? true;

              return (
                <Card key={cat.id} className="overflow-hidden border-border/60">
                  <Collapsible open={open} onOpenChange={(v) => setExpanded(p => ({ ...p, [cat.id]: v }))}>
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-muted/30">
                      <div
                        className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                        style={chipStyle(cat.color)}
                      >
                        <ActivityIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold truncate">{cat.name}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {kidsAll.length} sub-type{kidsAll.length === 1 ? '' : 's'}
                          </Badge>
                          {!cat.is_active && (
                            <Badge variant="outline" className="text-[10px] text-destructive border-destructive/40">
                              inactive
                            </Badge>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate">
                          {cat.code}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-auto">
                        <div className="hidden sm:flex items-center gap-1.5">
                          <Switch
                            checked={cat.is_active}
                            onCheckedChange={(v) => persistField(cat, { is_active: v })}
                            disabled={!canEdit}
                          />
                          <span className="text-[11px] text-muted-foreground">Active</span>
                        </div>
                        <Button
                          size="sm" variant="outline"
                          onClick={() => openCreateSubtype(cat.id)}
                          disabled={!canEdit}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add sub-type
                        </Button>
                        <Button
                          size="icon" variant="ghost" className="h-8 w-8"
                          onClick={() => openEdit(cat)}
                          disabled={!canEdit}
                          title="Edit category"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <CollapsibleTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8">
                            <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    </div>

                    <CollapsibleContent>
                      {kids.length === 0 ? (
                        <div className="px-4 py-4 text-xs text-muted-foreground border-t">
                          {q ? 'No sub-types match your search.' : 'No sub-types yet.'}
                        </div>
                      ) : (
                        kids.map(r => <SubtypeRow key={r.id} r={r} />)
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })}

            {orphans.length > 0 && (() => {
              const list = q ? orphans.filter(matches) : orphans;
              if (q && list.length === 0) return null;
              return (
                <Card className="overflow-hidden border-dashed">
                  <div className="px-4 py-3 bg-muted/30 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold text-sm">Uncategorised</span>
                    <Badge variant="secondary" className="text-[10px]">{orphans.length}</Badge>
                  </div>
                  {list.map(r => <SubtypeRow key={r.id} r={r} />)}
                </Card>
              );
            })()}

            {hiddenSubs.length > 0 && (
              <p className="text-[11px] text-muted-foreground pl-1 flex items-center gap-1">
                <EyeOff className="h-3 w-3" />
                {hiddenSubs.length} sub-type{hiddenSubs.length === 1 ? '' : 's'} hidden from the Add Activity picker
                (e.g. Counter Sale, Event). Toggle "Show in picker" in the edit dialog to expose them.
              </p>
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
