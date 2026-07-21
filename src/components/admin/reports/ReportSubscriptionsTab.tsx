import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, Zap, FileText, Loader2, Check, GripVertical, Users, Search, Filter, ArrowUpDown, LayoutGrid, List as ListIcon, MoreVertical, Calendar, Clock, FileSpreadsheet, FileType2, Send, TrendingUp, PlayCircle, CalendarClock, MailCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useSubordinates } from '@/hooks/useSubordinates';
import { useAuth } from '@/hooks/useAuth';

interface Dataset {
  key: string;
  label: string;
  description?: string;
  source?: string;
  dimensions: Array<{ key: string; label: string }>;
  measures: Array<{ key: string; label: string; agg?: string }>;
  supports_matrix: boolean;
}

interface Definition {
  id: string;
  name: string;
  dataset_key: string;
  layout: string;
  config: any;
}

interface Subscription {
  id: string;
  name: string;
  report_definition_id: string;
  cadence: string;
  fire_day: string | null;
  fire_time: string;
  timezone: string;
  recipient_user_ids: string[];
  attachment_format: string;
  push_to_phone: boolean;
  scope: string;
  status: string;
  last_fired_at: string | null;
}

const CADENCES = [
  { value: 'today', label: 'Today only (one-time)' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekday', label: 'Weekdays only' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FORMATS = [
  { value: 'summary_only', label: 'Summary only (in-app text)' },
  { value: 'excel', label: 'Excel (.xlsx)' },
  { value: 'pdf', label: 'PDF' },
];

export function ReportSubscriptionsTab() {
  const qc = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<{ sub: Subscription; def: Definition } | null>(null);

  const { data: datasets = [] } = useQuery({
    queryKey: ['reportable-datasets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('reportable_datasets').select('*').eq('is_active', true);
      if (error) throw error;
      return data as Dataset[];
    },
  });

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ['report-subscriptions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_subscriptions')
        .select('*, report_definitions(name, dataset_key, layout)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const runNow = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('report-dispatcher', {
        body: { mode: 'manual', subscription_id: id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Report dispatched');
      qc.invalidateQueries({ queryKey: ['report-subscriptions'] });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to run'),
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('report_subscriptions').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report-subscriptions'] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('report_subscriptions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Subscription deleted');
      qc.invalidateQueries({ queryKey: ['report-subscriptions'] });
    },
  });

  const openEdit = async (row: any) => {
    const { data: def } = await supabase.from('report_definitions').select('*').eq('id', row.report_definition_id).maybeSingle();
    if (!def) return;
    setEditing({ sub: row, def: def as Definition });
    setWizardOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Report Subscriptions</h2>
          <p className="text-sm text-muted-foreground">Build a report, schedule it, and deliver as in-app + optional push.</p>
        </div>
        <Button onClick={() => { setEditing(null); setWizardOpen(true); }} className="gap-2">
          <Plus size={16} /> New Subscription
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText size={16} /> Subscriptions ({subs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
          ) : subs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No subscriptions yet. Create your first one to schedule a recurring report.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Dataset</TableHead>
                  <TableHead>Cadence</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Last fired</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subs.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.report_definitions?.dataset_key}</TableCell>
                    <TableCell className="text-sm">
                      {s.cadence}{s.fire_day ? ` · ${s.fire_day}` : ''} · {String(s.fire_time).slice(0, 5)}
                    </TableCell>
                    <TableCell><Badge variant="outline">{s.attachment_format}</Badge></TableCell>
                    <TableCell className="text-sm">{(s.recipient_user_ids ?? []).length}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.last_fired_at ? new Date(s.last_fired_at).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={s.status === 'active'}
                        onCheckedChange={(c) => toggleStatus.mutate({ id: s.id, status: c ? 'active' : 'paused' })}
                      />
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="sm" title="Run now" disabled={runNow.isPending} onClick={() => runNow.mutate(s.id)}>
                        <Zap size={14} className="text-amber-500" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(s)}><Pencil size={14} /></Button>
                      <Button variant="ghost" size="sm" onClick={() => { if (confirm(`Delete "${s.name}"?`)) del.mutate(s.id); }}>
                        <Trash2 size={14} className="text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {wizardOpen && (
        <SubscriptionWizard
          datasets={datasets}
          editing={editing}
          onClose={() => { setWizardOpen(false); setEditing(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['report-subscriptions'] }); setWizardOpen(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ------- Wizard -------

interface WizardProps {
  datasets: Dataset[];
  editing: { sub: Subscription; def: Definition } | null;
  onClose: () => void;
  onSaved: () => void;
}

function SubscriptionWizard({ datasets, editing, onClose, onSaved }: WizardProps) {
  const [step, setStep] = useState(1);

  // Step 1 — build report
  const [name, setName] = useState(editing?.sub.name ?? '');
  const [datasetKey, setDatasetKey] = useState(editing?.def.dataset_key ?? datasets[0]?.key ?? '');
  const [layout, setLayout] = useState(editing?.def.layout ?? 'tabular');
  const [rows, setRows] = useState<string[]>(
    Array.isArray(editing?.def.config?.rows) ? editing!.def.config!.rows : (editing?.def.config?.rows ? [editing.def.config.rows] : []),
  );
  const [columns, setColumns] = useState<string>(editing?.def.config?.columns?.[0] ?? '');
  const [values, setValues] = useState<string[]>(
    (editing?.def.config?.values ?? []).map((v: any) => (typeof v === 'string' ? v : v.key)),
  );

  // Date range filter (defaults to last 30 days)
  const isoToday = new Date().toISOString().slice(0, 10);
  const iso30 = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })();
  const [dateFrom, setDateFrom] = useState<string>(editing?.def.config?.filters?.date_from ?? iso30);
  const [dateTo, setDateTo] = useState<string>(editing?.def.config?.filters?.date_to ?? isoToday);
  const [scopeUserId, setScopeUserId] = useState<string>(editing?.def.config?.filters?.scope_user_id ?? '');



  // Step 2 — schedule + delivery
  const [cadence, setCadence] = useState(editing?.sub.cadence ?? 'daily');
  const [fireDay, setFireDay] = useState(editing?.sub.fire_day ?? 'Mon');
  const [fireTime, setFireTime] = useState(String(editing?.sub.fire_time ?? '09:00').slice(0, 5));
  const [timezone, setTimezone] = useState(editing?.sub.timezone ?? 'Asia/Kolkata');
  const [format, setFormat] = useState(editing?.sub.attachment_format ?? 'summary_only');
  const [pushToPhone, setPushToPhone] = useState(editing?.sub.push_to_phone ?? false);
  const [scope, setScope] = useState(editing?.sub.scope ?? 'shared');
  const [recipientIds, setRecipientIds] = useState<string[]>(editing?.sub.recipient_user_ids ?? []);

  const dataset = useMemo(() => datasets.find(d => d.key === datasetKey), [datasets, datasetKey]);

  const { data: users = [] } = useQuery({
    queryKey: ['profiles-for-recipients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, username, recovery_email, phone_number, is_active')
        .eq('is_active', true)
        .order('full_name', { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []).map((u: any) => ({ ...u, email: u.recovery_email })) as any[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Name is required');
      if (!datasetKey) throw new Error('Dataset is required');
      if (recipientIds.length === 0) throw new Error('Add at least one recipient');
      if (values.length === 0 && !(layout === 'tabular' && rows.length > 0)) throw new Error('Pick at least one field for the report');

      const config = {
        rows,
        columns: columns ? [columns] : [],
        values,
        filters: { date_from: dateFrom, date_to: dateTo, scope_user_id: scopeUserId || null },
      };


      if (editing) {
        const { error: dErr } = await supabase
          .from('report_definitions')
          .update({ name, dataset_key: datasetKey, layout, config })
          .eq('id', editing.def.id);
        if (dErr) throw dErr;
        const { error: sErr } = await supabase
          .from('report_subscriptions')
          .update({
            name,
            cadence,
            fire_day: cadence === 'weekly' || cadence === 'monthly' ? fireDay : null,
            fire_time: fireTime,
            timezone,
            recipient_user_ids: recipientIds,
            attachment_format: format,
            push_to_phone: pushToPhone,
            scope,
          })
          .eq('id', editing.sub.id);
        if (sErr) throw sErr;
      } else {
        const { data, error } = await supabase.rpc('create_report_subscription', {
          p_definition: {
            name,
            dataset_key: datasetKey,
            layout,
            config,
          },
          p_subscription: {
            name,
            cadence,
            fire_day: cadence === 'weekly' || cadence === 'monthly' ? fireDay : null,
            fire_time: fireTime,
            timezone,
            recipient_user_ids: recipientIds,
            attachment_format: format,
            push_to_phone: pushToPhone,
            scope,
            status: 'active',
          },
        });
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => { toast.success(editing ? 'Subscription updated' : 'Subscription created'); onSaved(); },
    onError: (e: any) => toast.error(e.message || 'Failed to save'),
  });

  const canNext1 = !!(name.trim() && datasetKey && (values.length > 0 || (layout === 'tabular' && rows.length > 0)));
  const canNext2 = fireTime && timezone && format && recipientIds.length > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0 gap-0">
        <div className="px-6 pt-5 pb-4 border-b border-border/60">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-base font-semibold">
              {editing ? 'Edit subscription' : 'New report subscription'}
            </DialogTitle>
          </DialogHeader>
          <StepBar current={step} />
        </div>

        <div className="p-6">

        {step === 1 && (
          <Step1Body
            name={name} setName={setName}
            datasets={datasets}
            datasetKey={datasetKey} setDatasetKey={setDatasetKey}
            layout={layout} setLayout={setLayout}
            rows={rows} setRows={setRows}
            columns={columns} setColumns={setColumns}
            values={values} setValues={setValues}
            dataset={dataset}
            dateFrom={dateFrom} setDateFrom={setDateFrom}
            dateTo={dateTo} setDateTo={setDateTo}
            scopeUserId={scopeUserId} setScopeUserId={setScopeUserId}
            onCancel={onClose}
            onNext={() => setStep(2)}
            canNext={!!canNext1}
          />
        )}


        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cadence</Label>
                <Select value={cadence} onValueChange={setCadence}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CADENCES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {cadence === 'weekly' && (
                <div className="space-y-2">
                  <Label>Day of week</Label>
                  <Select value={fireDay} onValueChange={setFireDay}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {cadence === 'monthly' && (
                <div className="space-y-2">
                  <Label>Day of month (1–28)</Label>
                  <Input type="number" min={1} max={28} value={fireDay ?? '1'} onChange={e => setFireDay(e.target.value)} />
                </div>
              )}
              <div className="space-y-2">
                <Label>Fire time</Label>
                <Input type="time" value={fireTime} onChange={e => setFireTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Input value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="Asia/Kolkata" />
              </div>
              <div className="space-y-2">
                <Label>Format</Label>
                <Select value={format} onValueChange={setFormat}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORMATS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Scope</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shared">Shared — one report for everyone</SelectItem>
                    <SelectItem value="per_recipient">Per recipient — filtered by their scope</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 md:col-span-2 pt-2">
                <Switch checked={pushToPhone} onCheckedChange={setPushToPhone} id="push" />
                <Label htmlFor="push" className="cursor-pointer">Also send phone push notification</Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Recipients * ({recipientIds.length} selected)</Label>
              <div className="max-h-56 overflow-y-auto border rounded-md p-2 space-y-1">
                {users.map(u => {
                  const on = recipientIds.includes(u.id);
                  return (
                    <label key={u.id} className="flex items-center gap-2 text-sm py-1 hover:bg-muted/40 rounded px-1 cursor-pointer">
                      <Checkbox
                        checked={on}
                        onCheckedChange={(c) => setRecipientIds(prev => c ? [...prev, u.id] : prev.filter(x => x !== u.id))}
                      />
                      <span className="flex-1">{u.full_name || u.username || u.email || u.id}</span>
                      {u.email && <span className="text-xs text-muted-foreground">{u.email}</span>}
                    </label>
                  );
                })}
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)} disabled={!canNext2}>Next</Button>
            </DialogFooter>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="bg-muted/40 rounded p-4 space-y-2 text-sm">
              <div><span className="font-medium">Name:</span> {name}</div>
              <div><span className="font-medium">Dataset:</span> {dataset?.label} ({layout})</div>
              <div><span className="font-medium">Rows:</span> {rows.join(', ') || '—'}{layout === 'matrix' && ` · Columns: ${columns || '—'}`}</div>
              <div><span className="font-medium">Measures:</span> {values.join(', ')}</div>
              <div><span className="font-medium">Schedule:</span> {cadence}{['weekly','monthly'].includes(cadence) ? ` · ${fireDay}` : ''} · {fireTime} ({timezone})</div>
              <div><span className="font-medium">Format:</span> {format} {pushToPhone ? '· + phone push' : ''}</div>
              <div><span className="font-medium">Scope:</span> {scope}</div>
              <div><span className="font-medium">Recipients:</span> {recipientIds.length}</div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <><Loader2 size={14} className="animate-spin mr-1" />Saving…</> : editing ? 'Save changes' : 'Create subscription'}
              </Button>
            </DialogFooter>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------- Step 1 (redesigned) -------

const STEP_LABELS = ['Build report', 'Schedule', 'Review'];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-3">
      {STEP_LABELS.map((label, i) => {
        const stepNum = i + 1;
        const isDone = current > stepNum;
        const isActive = current === stepNum;
        return (
          <React.Fragment key={label}>
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={cn(
                  'h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-medium border transition-colors shrink-0',
                  isDone && 'bg-[#534ab7] border-[#534ab7] text-white',
                  isActive && 'bg-[#534ab7] border-[#534ab7] text-white',
                  !isDone && !isActive && 'bg-muted border-border text-muted-foreground',
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : stepNum}
              </div>
              <span
                className={cn(
                  'text-sm truncate',
                  (isActive || isDone) ? 'text-foreground font-medium' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={cn('flex-1 h-px', current > stepNum ? 'bg-[#534ab7]' : 'bg-border')} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

interface Step1Props {
  name: string; setName: (v: string) => void;
  datasets: Dataset[];
  datasetKey: string; setDatasetKey: (v: string) => void;
  layout: string; setLayout: (v: string) => void;
  rows: string[]; setRows: React.Dispatch<React.SetStateAction<string[]>>;
  columns: string; setColumns: (v: string) => void;

  values: string[]; setValues: React.Dispatch<React.SetStateAction<string[]>>;
  dataset: Dataset | undefined;
  dateFrom: string; setDateFrom: (v: string) => void;
  dateTo: string; setDateTo: (v: string) => void;
  scopeUserId: string; setScopeUserId: (v: string) => void;
  onCancel: () => void;
  onNext: () => void;
  canNext: boolean;
}

function Step1Body(p: Step1Props) {
  const { dataset, layout, rows, columns, values, datasetKey, dateFrom, dateTo, scopeUserId } = p;
  const { user } = useAuth();
  const { subordinates } = useSubordinates();
  const scopeOptions = React.useMemo(() => {
    const opts: Array<{ id: string; label: string; level: number }> = [];
    if (user?.id) opts.push({ id: user.id, label: 'Me (and my full hierarchy)', level: 0 });
    subordinates.forEach(s => opts.push({ id: s.subordinate_user_id, label: s.full_name, level: s.level }));
    return opts;
  }, [subordinates, user?.id]);
  const scopeLabel = scopeUserId
    ? (scopeOptions.find(o => o.id === scopeUserId)?.label ?? 'Selected user')
    : 'Everyone I can see';

  const layoutHint =
    layout === 'tabular' ? 'Flat table — one row per record, columns for every field you pick.'
    : layout === 'grouped' ? 'Group rows by one dimension and total the measures.'
    : 'Pivot rows against columns, measures fill the cells with row/column totals.';

  const dims = dataset?.dimensions ?? [];
  const measures = dataset?.measures ?? [];

  const dimLabel = (key: string) => dims.find(d => d.key === key)?.label ?? key;
  const msrLabel = (key: string) => measures.find(m => m.key === key)?.label ?? key;

  const toggleValue = (k: string) => {
    p.setValues(v => v.includes(k) ? v.filter(x => x !== k) : [...v, k]);
  };

  // Debounce config changes so we don't spam the RPC on every keystroke/drop
  const [debounced, setDebounced] = React.useState({ datasetKey, layout, rows, columns, values, dateFrom, dateTo, scopeUserId });
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced({ datasetKey, layout, rows, columns, values, dateFrom, dateTo, scopeUserId }), 250);
    return () => clearTimeout(t);
  }, [datasetKey, layout, rows, columns, values, dateFrom, dateTo, scopeUserId]);

  // Live preview — real RPC call for the selected date range
  const preview = useQuery({
    queryKey: [
      'report-preview',
      debounced.datasetKey,
      debounced.layout,
      debounced.rows,
      debounced.columns,
      debounced.values.join(','),
      debounced.dateFrom,
      debounced.dateTo,
      debounced.scopeUserId,
    ],
    enabled: !!dataset && !!dataset.source && (debounced.values.length > 0 || (debounced.layout === 'tabular' && debounced.rows.length > 0)),
    retry: false,
    queryFn: async () => {
      const payload = {
        p_layout: debounced.layout,
        p_rows: debounced.layout === 'tabular' ? null : (debounced.rows[0] || null),
        p_columns: debounced.layout === 'matrix' ? (debounced.columns || null) : null,
        p_values: debounced.values,
        p_filters: {
          date_from: debounced.dateFrom,
          date_to: debounced.dateTo,
          scope_user_id: debounced.scopeUserId || null,
        },
      };


      // eslint-disable-next-line no-console
      console.debug('[ReportPreview] rpc', dataset!.source, payload);
      const { data, error } = await supabase.rpc(dataset!.source as any, payload as any);
      if (error) {
        // eslint-disable-next-line no-console
        console.error('[ReportPreview] error', error);
        throw error;
      }
      // eslint-disable-next-line no-console
      console.debug('[ReportPreview] rows', Array.isArray(data) ? data.length : data);
      return (data ?? []) as any[];
    },
  });

  const previewState: 'idle' | 'loading' | 'error' | 'empty' | 'data' =
    !dataset ? 'idle'
    : (values.length === 0 && !(layout === 'tabular' && rows.length > 0)) ? 'idle'
    : preview.isLoading || preview.isFetching ? 'loading'
    : preview.error ? 'error'
    : (preview.data ?? []).length === 0 ? 'empty'
    : 'data';

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</Label>
        <Input
          value={p.name}
          onChange={e => p.setName(e.target.value)}
          placeholder="e.g. Daily attendance snapshot"
          className="max-w-md"
        />
      </div>

      {/* Dataset cards */}
      <div className="space-y-2">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dataset</Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {p.datasets.map(d => {
            const selected = d.key === datasetKey;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => p.setDatasetKey(d.key)}
                className={cn(
                  'text-left rounded-xl border p-4 transition-all',
                  selected
                    ? 'border-2 border-[#534ab7] bg-[#eeedfe] dark:bg-[#534ab7]/15'
                    : 'border-border/60 hover:border-border bg-card',
                )}
              >
                <div className="font-semibold text-sm text-foreground">{d.label}</div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                  {(d as any).description || d.dimensions.slice(0, 2).map(x => x.label).join(', ').toLowerCase()}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Layout segmented */}
      <div className="space-y-2">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Layout</Label>
        <div className="inline-flex w-full rounded-xl border border-border/60 p-1 bg-muted/30">
          {(['tabular', 'grouped', 'matrix'] as const).map(l => {
            const disabled = l === 'matrix' && !dataset?.supports_matrix;
            const active = layout === l;
            return (
              <button
                key={l}
                type="button"
                disabled={disabled}
                onClick={() => p.setLayout(l)}
                className={cn(
                  'flex-1 text-sm font-medium rounded-lg py-2 transition-colors capitalize',
                  active
                    ? 'bg-[#eeedfe] text-[#534ab7] shadow-sm dark:bg-[#534ab7]/25 dark:text-white'
                    : 'text-muted-foreground hover:text-foreground',
                  disabled && 'opacity-40 cursor-not-allowed',
                )}
              >
                {l}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{layoutHint}</p>
      </div>

      {/* Builder body */}
      {dataset && (
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
          {/* Fields palette */}
          <div className="rounded-xl border border-border/60 bg-card p-3">
            <div className="text-xs font-medium text-muted-foreground px-1 pb-2">Fields</div>
            <div className="space-y-1">
              {dims.map(d => (
                <FieldRow key={d.key} fieldKey={d.key} label={d.label} kind="dim" />
              ))}
              {measures.map(m => (
                <FieldRow key={m.key} fieldKey={m.key} label={m.label} kind="msr" />
              ))}
            </div>
          </div>

          {/* Config zones */}
          <div className="space-y-3">
            {layout === 'matrix' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ZoneCard title="Group rows by" accept="dim" onDropKey={(k) => p.setRows([k])}>
                  <ZonePicker
                    value={rows[0] ?? ''}
                    onChange={(v) => p.setRows(v ? [v] : [])}
                    options={dims}
                    placeholder="Drop a dimension"
                    tone="dim"
                  />
                </ZoneCard>
                <ZoneCard title="Column groups" tone="purple" accept="dim" onDropKey={p.setColumns}>
                  <ZonePicker
                    value={columns}
                    onChange={p.setColumns}
                    options={dims}
                    placeholder="Drop a dimension"
                    tone="dim"
                  />
                </ZoneCard>
              </div>
            )}
            {layout === 'grouped' && (
              <ZoneCard title="Group rows by" accept="dim" onDropKey={(k) => p.setRows([k])}>
                <ZonePicker
                  value={rows[0] ?? ''}
                  onChange={(v) => p.setRows(v ? [v] : [])}
                  options={dims}
                  placeholder="Drop a dimension"
                  tone="dim"
                />
              </ZoneCard>
            )}
            {layout === 'tabular' && (
              <ZoneCard
                title="Columns"
                onDropKey={(k) => p.setRows(prev => prev.includes(k) ? prev : [...prev, k])}
              >
                <ZoneMulti
                  value={rows}
                  onChange={p.setRows}
                  dims={dims}
                  measures={measures}
                />
              </ZoneCard>
            )}


            {layout !== 'tabular' && (
              <ZoneCard
                title="Values"
                accept="msr"
                acceptedKeys={measures.map(m => m.key)}
                rejectedDropMessage="Values accepts measures only. Drag a field marked ‘msr’ from Fields."
                onDropKey={(k) => p.setValues(prev => prev.includes(k) ? prev : [...prev, k])}
              >
                <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                  {values.length === 0 ? (
                    <span className="text-xs text-muted-foreground/60 italic px-1 py-1">
                      Drop measures — drag any measure from the Fields palette here.
                    </span>
                  ) : (
                    values.map(k => (
                      <MeasurePill key={k} label={msrLabel(k)} onRemove={() => toggleValue(k)} />
                    ))
                  )}
                </div>
              </ZoneCard>
            )}

            <ZoneCard title="Date range">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">From</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(e) => p.setDateFrom(e.target.value)}
                    className="h-8 text-xs w-[150px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">To</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(e) => p.setDateTo(e.target.value)}
                    className="h-8 text-xs w-[150px]"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {[
                    { label: 'Last 7d', days: 7 },
                    { label: 'Last 30d', days: 30 },
                    { label: 'Last 90d', days: 90 },
                    { label: 'This month', days: -1 },
                  ].map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        const to = new Date();
                        const from = new Date();
                        if (preset.days === -1) from.setDate(1);
                        else from.setDate(to.getDate() - preset.days);
                        p.setDateFrom(from.toISOString().slice(0, 10));
                        p.setDateTo(to.toISOString().slice(0, 10));
                      }}
                      className="text-[11px] rounded-full border border-dashed border-border px-2 py-0.5 text-muted-foreground hover:text-foreground hover:border-solid"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </ZoneCard>

            <ZoneCard title="Team / User filter">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1 min-w-[240px]">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" /> Show data for
                  </Label>
                  <Select
                    value={scopeUserId || '__all__'}
                    onValueChange={(v) => p.setScopeUserId(v === '__all__' ? '' : v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue>{scopeLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="__all__" className="text-xs">Everyone I can see</SelectItem>
                      {scopeOptions.length > 0 && <div className="border-t my-1" />}
                      {scopeOptions.map(o => (
                        <SelectItem key={o.id} value={o.id} className="text-xs">
                          <span style={{ paddingLeft: `${Math.max(0, o.level - 1) * 10}px` }}>
                            {o.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[11px] text-muted-foreground pb-1 max-w-sm">
                  Pick any user in your hierarchy — the report includes that person and their full team, respecting your access.
                </p>
              </div>
            </ZoneCard>




            {layout === 'matrix' && (
              <div className="flex flex-wrap items-center gap-5 pt-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox defaultChecked /> <span>Row totals</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox defaultChecked /> <span>Column totals</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox /> <span>Mark Sundays off</span>
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Live preview */}
      <LivePreviewCard
        state={previewState}
        error={preview.error as any}
        rows={preview.data ?? []}
        layout={layout}
        rowKey={rows[0] ?? ''}
        selectedColumns={rows}
        columnKey={columns}
        values={values}
        onReorderTabular={(next) => p.setRows(next)}
      />




      <DialogFooter className="pt-2">
        <Button variant="ghost" onClick={p.onCancel}>Cancel</Button>
        <Button onClick={p.onNext} disabled={!p.canNext} className="bg-[#534ab7] hover:bg-[#4740a0] text-white">
          Continue
        </Button>
      </DialogFooter>
    </div>
  );
}

function FieldRow({ label, kind, fieldKey }: { label: string; kind: 'dim' | 'msr'; fieldKey: string }) {
  return (
    <div
      draggable
      data-report-field-key={fieldKey}
      data-report-field-kind={kind}
      onDragStart={(e) => {
        const payload = JSON.stringify({ key: fieldKey, kind });
        e.dataTransfer.setData('application/x-report-field', payload);
        e.dataTransfer.setData('application/json', payload);
        e.dataTransfer.setData('text/plain', fieldKey);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-muted/60 cursor-grab active:cursor-grabbing group"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0" />
        <span className="text-sm text-foreground truncate">{label}</span>
      </div>
      <span
        className={cn(
          'text-[10px] font-medium rounded-full px-1.5 py-0.5',
          kind === 'dim'
            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
            : 'bg-[#eeedfe] text-[#534ab7] dark:bg-[#534ab7]/25 dark:text-white',
        )}
      >
        {kind}
      </span>
    </div>
  );
}

function ZoneCard({
  title, tone, children, accept, acceptedKeys, rejectedDropMessage, onDropKey,
}: {
  title: string;
  tone?: 'purple';
  children: React.ReactNode;
  accept?: 'dim' | 'msr';
  acceptedKeys?: string[];
  rejectedDropMessage?: string;
  onDropKey?: (key: string) => void;
}) {
  const [over, setOver] = React.useState(false);
  const [dropError, setDropError] = React.useState('');
  const handleDrop = (e: React.DragEvent) => {
    if (!onDropKey) return;
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    try {
      const raw =
        e.dataTransfer.getData('application/x-report-field') ||
        e.dataTransfer.getData('application/json') ||
        e.dataTransfer.getData('text/plain');
      if (!raw) return;
      let key: string;
      let kind: 'dim' | 'msr' | undefined;
      try {
        const parsed = JSON.parse(raw);
        key = parsed.key;
        kind = parsed.kind;
      } catch {
        key = raw;
      }
      if (!key) return;
      const isAcceptedKey = !acceptedKeys || acceptedKeys.includes(key);
      if ((accept && kind && kind !== accept) || !isAcceptedKey) {
        setDropError(rejectedDropMessage ?? `Drop a ${accept === 'msr' ? 'measure' : 'dimension'} here.`);
        window.setTimeout(() => setDropError(''), 2600);
        return;
      }
      setDropError('');
      onDropKey(key);
    } catch { /* ignore */ }
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!onDropKey) return;
    // Required to allow a drop.
    e.preventDefault();
    e.stopPropagation();
    try { e.dataTransfer.dropEffect = 'copy'; } catch { /* noop */ }
    if (!over) setOver(true);
  };
  return (
    <div
      onDragEnterCapture={handleDragOver}
      onDragOverCapture={handleDragOver}
      onDragLeave={(e) => {
        const related = e.relatedTarget as Node | null;
        if (!related || !(e.currentTarget as Node).contains(related)) {
          setOver(false);
        }
      }}
      onDropCapture={handleDrop}
      className={cn(
        'relative rounded-xl border border-dashed p-3 transition-colors',
        tone === 'purple' ? 'border-[#534ab7]/40 bg-[#eeedfe]/50 dark:bg-[#534ab7]/10' : 'border-border/60',
        over && 'border-solid border-[#534ab7] bg-[#eeedfe]/70 dark:bg-[#534ab7]/20',
      )}
    >
      <div className="text-xs text-muted-foreground pb-2 pointer-events-none">{title}</div>
      {/* Children keep pointer-events so pills/buttons stay clickable.
          Drops bubble up to this outer div's onDrop. */}
      <div>
        {children}
      </div>
      {dropError && (
        <p role="alert" className="pt-2 text-[11px] font-medium text-destructive">
          {dropError}
        </p>
      )}
    </div>
  );
}


function ZonePicker({
  value, onChange, options, placeholder, tone,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ key: string; label: string }>;
  placeholder: string;
  tone: 'dim' | 'msr';
}) {
  if (!value) {
    return (
      <Select onValueChange={onChange}>
        <SelectTrigger className="h-8 border-dashed text-xs text-muted-foreground bg-transparent">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  const label = options.find(o => o.key === value)?.label ?? value;
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange('')}
        className={cn(
          'text-xs rounded-full px-2.5 py-1 border',
          tone === 'dim'
            ? 'bg-blue-500/10 text-blue-600 border-transparent hover:bg-blue-500/20 dark:text-blue-400'
            : 'bg-[#eeedfe] text-[#534ab7] border-transparent hover:bg-[#e4e2fb] dark:bg-[#534ab7]/25 dark:text-white',
        )}
        title="Click to remove"
      >
        {label}
      </button>
    </div>
  );
}

function MeasurePill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="text-xs rounded-full bg-[#eeedfe] text-[#534ab7] px-2.5 py-1 hover:bg-[#e4e2fb] dark:bg-[#534ab7]/25 dark:text-white"
    >
      {label}
    </button>
  );
}

function ZoneMulti({
  value, onChange, dims, measures,
}: {
  value: string[];
  onChange: React.Dispatch<React.SetStateAction<string[]>>;
  dims: Array<{ key: string; label: string }>;
  measures: Array<{ key: string; label: string }>;
}) {
  const all = [...dims.map(d => ({ ...d, kind: 'dim' as const })), ...measures.map(m => ({ ...m, kind: 'msr' as const }))];
  const labelOf = (k: string) => all.find(o => o.key === k)?.label ?? k;
  const kindOf = (k: string) => all.find(o => o.key === k)?.kind ?? 'dim';
  const remaining = all.filter(o => !value.includes(o.key));
  return (
    <div className="flex flex-wrap gap-1.5 min-h-[28px] items-center">
      {value.length === 0 ? (
        <span className="text-xs text-muted-foreground/60 italic px-1 py-1">
          Drop dimensions or measures — they become the preview columns.
        </span>
      ) : (
        value.map(k => (
          <button
            key={k}
            type="button"
            onClick={() => onChange(prev => prev.filter(x => x !== k))}
            className={cn(
              'text-xs rounded-full px-2.5 py-1 border border-transparent',
              kindOf(k) === 'dim'
                ? 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-400'
                : 'bg-[#eeedfe] text-[#534ab7] hover:bg-[#e4e2fb] dark:bg-[#534ab7]/25 dark:text-white',
            )}
            title="Click to remove"
          >
            {labelOf(k)}
          </button>
        ))
      )}
    </div>
  );
}

function LivePreviewCard({
  state, error, rows, layout, rowKey, columnKey, values, selectedColumns, onReorderTabular,
}: {
  state: 'idle' | 'loading' | 'error' | 'empty' | 'data';
  error: Error | null;
  rows: any[];
  layout: string;
  rowKey: string;
  columnKey: string;
  values: string[];
  selectedColumns?: string[];
  onReorderTabular?: (next: string[]) => void;
}) {
  const sample = rows; // show all fetched rows — the container scrolls when tall

  // Build columns from returned keys. Tabular respects the user's ordered picks;
  // matrix prioritises row/column dims then measures; grouped shows what came back.
  const computedColumns = React.useMemo<string[]>(() => {
    if (sample.length === 0) return [];
    const keys = Array.from(new Set(sample.flatMap(r => Object.keys(r ?? {}))));
    if (layout === 'matrix') {
      const priority = [rowKey, columnKey, ...values].filter(Boolean);
      const rest = keys.filter(k => !priority.includes(k));
      return [...priority.filter(k => keys.includes(k)), ...rest].slice(0, 8);
    }
    if (layout === 'tabular' && selectedColumns && selectedColumns.length > 0) {
      const filtered = selectedColumns.filter(k => keys.includes(k)).slice(0, 12);
      return filtered.length ? filtered : keys.slice(0, 8);
    }
    return keys.slice(0, 8);
  }, [sample, layout, rowKey, columnKey, values, selectedColumns]);

  // Local order (allows drag-reorder for non-tabular layouts too). Kept in sync
  // with the computed order when the underlying config changes.
  const [order, setOrder] = React.useState<string[]>(computedColumns);
  React.useEffect(() => { setOrder(computedColumns); }, [computedColumns.join(',')]);

  const [dragCol, setDragCol] = React.useState<string | null>(null);
  const [overCol, setOverCol] = React.useState<string | null>(null);

  const reorderColumns = (from: string, to: string) => {
    if (from === to) return;
    const next = order.slice();
    const fromIdx = next.indexOf(from);
    const toIdx = next.indexOf(to);
    if (fromIdx < 0 || toIdx < 0) return;
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, from);
    setOrder(next);
    if (layout === 'tabular' && onReorderTabular) {
      // Persist reorder into the parent so the saved report + generated file
      // reflect the new column order.
      onReorderTabular(next);
    }
  };

  const columns = order;

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/60 text-xs font-medium text-muted-foreground flex items-center justify-between">
        <span>Live preview</span>
        {state === 'data' && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            {rows.length} row{rows.length === 1 ? '' : 's'} · drag column headers to reorder
          </span>
        )}
      </div>
      <div className="p-3 min-h-[80px] max-h-[520px] overflow-y-auto">

        {state === 'idle' ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            Add at least one measure to see a live preview for the selected date range.
          </div>
        ) : state === 'loading' ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching preview…
          </div>
        ) : state === 'error' ? (
          <div className="text-xs text-destructive py-4 text-center">
            Preview error — {error?.message || 'RPC failed'}
          </div>
        ) : state === 'empty' ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            No rows for this configuration in the selected date range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border/60">
                  {columns.map((c) => {
                    const isMeasure = values.includes(c);
                    const isOver = overCol === c && dragCol && dragCol !== c;
                    return (
                      <th
                        key={c}
                        draggable
                        onDragStart={(e) => {
                          setDragCol(c);
                          e.dataTransfer.setData('application/x-report-col', c);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          if (!dragCol) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (overCol !== c) setOverCol(c);
                        }}
                        onDragLeave={() => { if (overCol === c) setOverCol(null); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const from = e.dataTransfer.getData('application/x-report-col') || dragCol;
                          if (from) reorderColumns(from, c);
                          setDragCol(null);
                          setOverCol(null);
                        }}
                        onDragEnd={() => { setDragCol(null); setOverCol(null); }}
                        className={cn(
                          'text-left font-medium px-2 py-1.5 capitalize whitespace-nowrap select-none cursor-grab active:cursor-grabbing',
                          isMeasure && layout === 'matrix' && 'bg-[#eeedfe]/50 text-[#534ab7]',
                          isOver && 'border-l-2 border-[#534ab7]',
                          dragCol === c && 'opacity-50',
                        )}
                        title="Drag to reorder"
                      >
                        <span className="inline-flex items-center gap-1">
                          <GripVertical className="h-3 w-3 text-muted-foreground/40" />
                          {c.replace(/_/g, ' ')}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sample.map((r, i) => (
                  <tr key={i} className="border-b border-border/40 last:border-0">
                    {columns.map((c) => {
                      const isMeasure = values.includes(c);
                      return (
                        <td
                          key={c}
                          className={cn(
                            'px-2 py-1.5 text-foreground whitespace-nowrap',
                            isMeasure && layout === 'matrix' && 'bg-[#eeedfe]/40 font-medium',
                          )}
                        >
                          {formatCell(r?.[c])}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


function formatCell(v: any): string {
  if (v == null) return '—';
  if (typeof v === 'number') return v.toLocaleString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

