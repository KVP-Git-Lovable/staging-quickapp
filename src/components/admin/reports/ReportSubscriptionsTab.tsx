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
import { Plus, Pencil, Trash2, Zap, FileText, Loader2, Check, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Dataset {
  key: string;
  label: string;
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
  const [rows, setRows] = useState<string>(editing?.def.config?.rows?.[0] ?? '');
  const [columns, setColumns] = useState<string>(editing?.def.config?.columns?.[0] ?? '');
  const [values, setValues] = useState<string[]>(
    (editing?.def.config?.values ?? []).map((v: any) => (typeof v === 'string' ? v : v.key)),
  );

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
        .select('id, full_name, username, email')
        .order('full_name', { ascending: true })
        .limit(500);
      if (error) throw error;
      return data as any[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Name is required');
      if (!datasetKey) throw new Error('Dataset is required');
      if (recipientIds.length === 0) throw new Error('Add at least one recipient');
      if (values.length === 0) throw new Error('Pick at least one measure');

      const config = {
        rows: rows ? [rows] : [],
        columns: columns ? [columns] : [],
        values,
        filters: {},
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

  const canNext1 = name.trim() && datasetKey && values.length > 0;
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
              <div><span className="font-medium">Rows:</span> {rows || '—'}{layout === 'matrix' && ` · Columns: ${columns || '—'}`}</div>
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
      </DialogContent>
    </Dialog>
  );
}
