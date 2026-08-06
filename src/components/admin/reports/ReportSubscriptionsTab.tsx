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
import { Plus, Pencil, Trash2, Zap, FileText, Loader2, Check, GripVertical, Users, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown, LayoutGrid, List as ListIcon, MoreVertical, Calendar, Clock, FileSpreadsheet, FileType2, Send, TrendingUp, PlayCircle, CalendarClock, MailCheck, X, Rows3, Sigma, Database, ChevronDown, Lock as LockIcon, Network as NetworkIcon, Eye, RefreshCw } from 'lucide-react';
import { PdfInlinePreview } from './PdfInlinePreview';
import { PDF_THEMES, getPdfTheme } from '@/lib/pdfThemes';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  respect_hierarchy?: boolean;
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
/** Cadences whose reporting period is a single day.
 *  Mirrors computePeriod() in supabase/functions/_shared/reportPeriod.ts. */
const DAILY_CADENCES = new Set(['today', 'daily', 'weekday']);

/** A daily report should describe the day it arrives on. Weekly and monthly still
 *  default to the last completed period — a month-to-date total sent on the 1st
 *  would be near-empty and read as broken. */
const defaultPeriodBasisFor = (cadence: string): 'current' | 'previous' =>
  DAILY_CADENCES.has(cadence) ? 'current' : 'previous';

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

  const recipientIds = useMemo(() => {
    const set = new Set<string>();
    subs.forEach((s: any) => (s.recipient_user_ids || []).forEach((id: string) => id && set.add(id)));
    return Array.from(set);
  }, [subs]);

  const { data: recipientProfiles = [] } = useQuery({
    queryKey: ['report-recipient-profiles', recipientIds.sort().join(',')],
    enabled: recipientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, username, profile_picture_url')
        .in('id', recipientIds);
      if (error) throw error;
      return data || [];
    },
  });

  const profileMap = useMemo(() => {
    const map = new Map<string, { name: string; avatar: string | null }>();
    recipientProfiles.forEach((p: any) => {
      map.set(p.id, { name: p.full_name || p.username || 'User', avatar: p.profile_picture_url });
    });
    return map;
  }, [recipientProfiles]);

  const avatarPaths = useMemo(() => {
    const paths: string[] = [];
    recipientProfiles.forEach((p: any) => {
      const url: string = p.profile_picture_url || '';
      const m = url.match(/\/employee-photos\/(.+)$/);
      if (m) paths.push(m[1]);
    });
    return paths;
  }, [recipientProfiles]);

  const { data: signedAvatarMap = {} } = useQuery({
    queryKey: ['recipient-avatar-signed', avatarPaths.sort().join(',')],
    enabled: avatarPaths.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('employee-photos').createSignedUrls(avatarPaths, 3600);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((d: any) => { if (d.path && d.signedUrl) map[d.path] = d.signedUrl; });
      return map;
    },
  });

  const avatarFor = (uid: string): string | null => {
    const raw = profileMap.get(uid)?.avatar;
    if (!raw) return null;
    const m = raw.match(/\/employee-photos\/(.+)$/);
    if (m && signedAvatarMap[m[1]]) return signedAvatarMap[m[1]];
    return raw;
  };

  const runNow = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('report-dispatcher', {
        body: { mode: 'manual', subscription_id: id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const delivered = data?.delivered ?? 0;
      const empty = data?.empty === true;
      if (delivered === 0) {
        toast.error('Manual run failed — no recipients delivered');
      } else if (empty) {
        toast.success(`Sent — no records for this period (${delivered} recipient${delivered === 1 ? '' : 's'})`);
      } else {
        toast.success(`Report dispatched to ${delivered} recipient${delivered === 1 ? '' : 's'}`);
      }
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

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'last_fired' | 'name' | 'cadence'>('last_fired');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  const filteredSubs = useMemo(() => {
    let list = [...subs];
    if (statusFilter !== 'all') list = list.filter((s: any) => s.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s: any) => s.name?.toLowerCase().includes(q) || s.report_definitions?.dataset_key?.toLowerCase().includes(q));
    }
    list.sort((a: any, b: any) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'cadence') return (a.cadence || '').localeCompare(b.cadence || '');
      const av = a.last_fired_at ? new Date(a.last_fired_at).getTime() : 0;
      const bv = b.last_fired_at ? new Date(b.last_fired_at).getTime() : 0;
      return bv - av;
    });
    return list;
  }, [subs, search, statusFilter, sortBy]);

  const stats = useMemo(() => {
    const total = subs.length;
    const active = subs.filter((s: any) => s.status === 'active').length;
    const today = new Date().toDateString();
    const scheduledToday = subs.filter((s: any) => s.status === 'active').length; // heuristic
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const delivered7 = subs.filter((s: any) => s.last_fired_at && new Date(s.last_fired_at).getTime() >= sevenDaysAgo).length;
    return { total, active, scheduledToday, delivered7 };
  }, [subs]);

  const cadenceIcon = (cadence: string) => {
    if (cadence === 'today' || cadence === 'daily') return <Clock size={13} className="text-muted-foreground" />;
    if (cadence === 'weekly' || cadence === 'weekday') return <CalendarClock size={13} className="text-muted-foreground" />;
    return <Calendar size={13} className="text-muted-foreground" />;
  };
  const cadenceLabel = (s: any) => {
    const map: Record<string, string> = { today: 'Today only', daily: 'Daily', weekday: 'Weekdays', weekly: 'Weekly', monthly: 'Monthly' };
    const base = map[s.cadence] || s.cadence;
    const day = s.fire_day ? ` · ${s.fire_day}` : '';
    const time = s.fire_time ? ` · ${String(s.fire_time).slice(0, 5)}` : '';
    return `${base}${day}${time}`;
  };
  const formatBadge = (fmt: string) => {
    if (fmt === 'excel') return { icon: <FileSpreadsheet size={13} className="text-emerald-600" />, label: 'Excel', tint: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    if (fmt === 'pdf') return { icon: <FileType2 size={13} className="text-rose-600" />, label: 'PDF', tint: 'bg-rose-50 text-rose-700 border-rose-200' };
    return { icon: <FileText size={13} className="text-slate-600" />, label: 'In-app', tint: 'bg-slate-50 text-slate-700 border-slate-200' };
  };
  const nextRunLabel = (s: any) => {
    if (s.status !== 'active') return '—';
    if (s.cadence === 'today') return 'Today';
    if (s.cadence === 'daily') return `Today · ${String(s.fire_time || '').slice(0, 5)}`;
    if (s.cadence === 'weekly') return `${s.fire_day || 'Mon'} · ${String(s.fire_time || '').slice(0, 5)}`;
    if (s.cadence === 'monthly') return `${s.fire_day || '1st'} · ${String(s.fire_time || '').slice(0, 5)}`;
    return 'Scheduled';
  };
  const initials = (str = '') => str.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
  const avatarColors = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-sky-500', 'bg-violet-500'];

  const statCards = [
    { label: 'Total Subscriptions', value: stats.total, hint: 'Active subscriptions', icon: <FileText size={18} />, iconBg: 'bg-violet-100 text-violet-600', accent: 'stroke-violet-500' },
    { label: 'Active', value: stats.active, hint: 'Currently running', icon: <PlayCircle size={18} />, iconBg: 'bg-emerald-100 text-emerald-600', accent: 'stroke-emerald-500' },
    { label: 'Scheduled Today', value: stats.scheduledToday, hint: 'Next run', icon: <Clock size={18} />, iconBg: 'bg-amber-100 text-amber-600', accent: 'stroke-amber-500' },
    { label: 'Delivered (7 Days)', value: stats.delivered7, hint: 'Reports delivered', icon: <MailCheck size={18} />, iconBg: 'bg-sky-100 text-sky-600', accent: 'stroke-sky-500' },
  ];

  return (
    <div className="space-y-5">
      {/* Header row with new subscription button */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Report Subscriptions</h2>
          <p className="text-sm text-muted-foreground">Build a report, schedule it, and deliver as in-app + optional push.</p>
        </div>
        <Button
          onClick={() => { setEditing(null); setWizardOpen(true); }}
          className="gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md"
        >
          <Plus size={16} /> New Subscription
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => (
          <div
            key={c.label}
            className="relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center', c.iconBg)}>
                {c.icon}
              </div>
              <svg viewBox="0 0 80 30" className="h-8 w-20 opacity-70" fill="none">
                <path d="M0 22 L15 14 L30 20 L45 8 L60 16 L80 4" className={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
              <p className="text-2xl font-bold tracking-tight mt-0.5">{c.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{c.hint}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Subscriptions panel */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText size={16} className="text-muted-foreground" /> Subscriptions
              <span className="text-xs font-normal text-muted-foreground">({filteredSubs.length})</span>
            </CardTitle>
          </div>
          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap pt-2">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subscriptions..."
                className="pl-9 h-9 bg-muted/40 border-transparent focus-visible:bg-background"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-9 gap-1">
                <Filter size={13} className="text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="w-[170px] h-9 gap-1">
                <ArrowUpDown size={13} className="text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last_fired">Sort by: Last fired</SelectItem>
                <SelectItem value="name">Sort by: Name</SelectItem>
                <SelectItem value="cadence">Sort by: Cadence</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center rounded-md border bg-background p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={cn('h-8 w-8 flex items-center justify-center rounded transition-colors', viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-muted')}
                aria-label="Grid view"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={cn('h-8 w-8 flex items-center justify-center rounded transition-colors', viewMode === 'table' ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-muted')}
                aria-label="Table view"
              >
                <ListIcon size={14} />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>
          ) : filteredSubs.length === 0 ? (
            <div className="text-center py-14 text-muted-foreground text-sm">
              <FileText className="h-10 w-10 mx-auto opacity-30 mb-2" />
              No subscriptions match your filters.
            </div>
          ) : viewMode === 'table' ? (
            <div className="overflow-x-auto -mx-6 px-6">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b">
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Name</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Dataset</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Cadence</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Format</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Recipients</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Next Run</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Last Fired</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Status</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubs.map((s: any) => {
                    const fmt = formatBadge(s.attachment_format);
                    const dsKey = s.report_definitions?.dataset_key || '—';
                    const recipients = s.recipient_user_ids ?? [];
                    return (
                      <TableRow key={s.id} className="group border-b last:border-0">
                        <TableCell className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-500/10 to-violet-500/10 flex items-center justify-center text-indigo-600">
                              <FileText size={15} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{s.name}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{s.report_definitions?.name || 'Report'}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded-full bg-indigo-50 text-indigo-700 px-2 py-0.5 text-[11px] font-medium border border-indigo-100">
                            {dsKey}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            {cadenceIcon(s.cadence)}
                            {cadenceLabel(s)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium border', fmt.tint)}>
                              {fmt.icon} {fmt.label}
                            </span>
                            <span
                              title={s.push_to_phone ? 'Phone push enabled' : 'Phone push OFF'}
                              className={cn(
                                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium border',
                                s.push_to_phone
                                  ? 'bg-sky-50 text-sky-700 border-sky-200'
                                  : 'bg-slate-100 text-slate-500 border-slate-200 line-through'
                              )}
                            >
                              <Send size={10} /> Push
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {s.recipient_mode === 'all_managers' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 px-2 py-0.5 text-[11px] font-medium border border-indigo-100">
                              <NetworkIcon size={11} /> All managers · per recipient
                            </span>
                          ) : (
                            <div className="flex items-center">
                              {recipients.slice(0, 3).map((uid: string, i: number) => {
                                const p = profileMap.get(uid);
                                const name = p?.name || 'Unknown';
                                const avatar = avatarFor(uid);
                                return (
                                  <div
                                    key={uid + i}
                                    className={cn('h-7 w-7 rounded-full ring-2 ring-background text-[10px] font-semibold text-white flex items-center justify-center overflow-hidden', !avatar && avatarColors[i % avatarColors.length], i > 0 && '-ml-2')}
                                    title={name}
                                  >
                                    {avatar ? (
                                      <img src={avatar} alt={name} className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                                    ) : (
                                      initials(name)
                                    )}
                                  </div>
                                );
                              })}
                              {recipients.length > 3 && (
                                <div className="h-7 w-7 -ml-2 rounded-full ring-2 ring-background bg-muted text-[10px] font-semibold text-muted-foreground flex items-center justify-center">
                                  +{recipients.length - 3}
                                </div>
                              )}
                              {recipients.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="text-indigo-600 font-medium">{nextRunLabel(s)}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {s.last_fired_at ? (
                            <div className="leading-tight">
                              <div>{new Date(s.last_fired_at).toLocaleDateString()}</div>
                              <div className="text-[10px]">{new Date(s.last_fired_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => toggleStatus.mutate({ id: s.id, status: s.status === 'active' ? 'paused' : 'active' })}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border transition-colors',
                              s.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                            )}
                          >
                            <span className={cn('h-1.5 w-1.5 rounded-full', s.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400')} />
                            {s.status === 'active' ? 'Active' : 'Paused'}
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Run now" disabled={runNow.isPending} onClick={() => runNow.mutate(s.id)}>
                              <Zap size={14} className="text-amber-500" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)} title="Edit">
                              <Pencil size={14} />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (confirm(`Delete "${s.name}"?`)) del.mutate(s.id); }} title="Delete">
                              <MoreVertical size={14} className="text-muted-foreground" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredSubs.map((s: any) => {
                const fmt = formatBadge(s.attachment_format);
                const recipients = s.recipient_user_ids ?? [];
                return (
                  <div key={s.id} className="rounded-xl border bg-card p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500/10 to-violet-500/10 flex items-center justify-center text-indigo-600">
                          <FileText size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{s.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{s.report_definitions?.dataset_key}</p>
                        </div>
                      </div>
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                        s.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200')}>
                        {s.status === 'active' ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">{cadenceIcon(s.cadence)} {cadenceLabel(s)}</span>
                      <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] border', fmt.tint)}>{fmt.icon} {fmt.label}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      {s.recipient_mode === 'all_managers' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 px-2 py-0.5 text-[11px] font-medium border border-indigo-100">
                          <NetworkIcon size={11} /> All managers · per recipient
                        </span>
                      ) : (
                        <div className="flex items-center">
                          {recipients.slice(0, 4).map((uid: string, i: number) => {
                            const p = profileMap.get(uid);
                            const name = p?.name || 'Unknown';
                            const avatar = avatarFor(uid);
                            return (
                              <div key={uid + i} title={name} className={cn('h-6 w-6 rounded-full ring-2 ring-background text-[9px] font-semibold text-white flex items-center justify-center overflow-hidden', !avatar && avatarColors[i % avatarColors.length], i > 0 && '-ml-2')}>
                                {avatar ? <img src={avatar} alt={name} className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : initials(name)}
                              </div>
                            );
                          })}
                          {recipients.length > 4 && (
                            <div className="h-6 w-6 -ml-2 rounded-full ring-2 ring-background bg-muted text-[9px] font-semibold text-muted-foreground flex items-center justify-center">+{recipients.length - 4}</div>
                          )}
                          {recipients.length === 0 && <span className="text-[11px] text-muted-foreground">No recipients</span>}
                        </div>
                      )}
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => runNow.mutate(s.id)}><Zap size={13} className="text-amber-500" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil size={13} /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm(`Delete "${s.name}"?`)) del.mutate(s.id); }}><Trash2 size={13} className="text-destructive" /></Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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
  const [distributorId, setDistributorId] = useState<string>(editing?.def.config?.filters?.distributor_id ?? '');



  // Step 2 — schedule + delivery
  const [cadence, setCadence] = useState(editing?.sub.cadence ?? 'daily');

  /**
   * A daily report is expected to be about the day it lands on, so it defaults to
   * the current period. Weekly and monthly default to the last COMPLETED period —
   * a month-to-date figure sent on the 1st would be near-empty and misleading.
   */
  const isDailyCadence = DAILY_CADENCES.has(cadence);
  const [fireDay, setFireDay] = useState(editing?.sub.fire_day ?? 'Mon');
  const [fireTime, setFireTime] = useState(String(editing?.sub.fire_time ?? '09:00').slice(0, 5));
  const [timezone, setTimezone] = useState(editing?.sub.timezone ?? 'Asia/Kolkata');
  const [format, setFormat] = useState(editing?.sub.attachment_format ?? 'summary_only');
  const [pushToPhone, setPushToPhone] = useState(editing?.sub.push_to_phone ?? false);
  const [periodBasis, setPeriodBasis] = useState<'current' | 'previous'>(
    ((editing?.sub as any)?.period_basis as any) ??
      defaultPeriodBasisFor(editing?.sub.cadence ?? 'daily')
  );
  // Once the user picks a window explicitly we stop re-deriving it from cadence.
  const [basisTouched, setBasisTouched] = useState(
    Boolean((editing?.sub as any)?.period_basis)
  );
  // Empty sort_key = the RPC's default order, which puts rows that actually
  // sold ahead of the zero rows rather than interleaving them alphabetically.
  const [sortKey, setSortKey] = useState<string>(editing?.def.config?.filters?.sort_key ?? '');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    (editing?.def.config?.filters?.sort_dir as any) === 'asc' ? 'asc' : 'desc'
  );
  const [scope, setScope] = useState(editing?.sub.scope ?? 'shared');
  const [respectHierarchy, setRespectHierarchy] = useState(
    (editing?.sub as any)?.respect_hierarchy !== false
  );
  const [recipientIds, setRecipientIds] = useState<string[]>(editing?.sub.recipient_user_ids ?? []);
  const [recipientMode, setRecipientMode] = useState<'named_users' | 'all_managers'>(
    ((editing?.sub as any)?.recipient_mode as any) ?? 'named_users'
  );
  const [pdfTemplate, setPdfTemplate] = useState<any>(
    ((editing?.sub as any)?.pdf_template as any) ?? {}
  );
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewRefreshKey, setPdfPreviewRefreshKey] = useState(0);
  React.useEffect(() => {
    if (format !== 'pdf') setPdfPreviewOpen(false);
  }, [format]);

  // Live manager count for all_managers mode
  const { data: managerList = [] } = useQuery({
    queryKey: ['report-all-managers'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('report_all_managers');
      if (error) throw error;
      return (data ?? []) as Array<{ user_id: string; full_name: string }>;
    },
  });

  // Force per_recipient scope whenever mode = all_managers
  React.useEffect(() => {
    if (recipientMode === 'all_managers' && scope !== 'per_recipient') {
      setScope('per_recipient');
    }
  }, [recipientMode]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (recipientMode === 'named_users' && recipientIds.length === 0) throw new Error('Add at least one recipient');
      if (values.length === 0 && !(layout === 'tabular' && rows.length > 0)) throw new Error('Pick at least one field for the report');

      const effectiveScope = recipientMode === 'all_managers' ? 'per_recipient' : scope;
      const effectiveRecipients = recipientMode === 'all_managers' ? [] : recipientIds;

      const config = {
        rows,
        columns: columns ? [columns] : [],
        values,
        filters: {
          date_from: dateFrom,
          date_to: dateTo,
          scope_user_id: scopeUserId || null,
          distributor_id: distributorId || null,
          sort_key: sortKey || null,
          sort_dir: sortKey ? sortDir : null,
        },
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
            recipient_user_ids: effectiveRecipients,
            recipient_mode: recipientMode,
            attachment_format: format,
            push_to_phone: pushToPhone,
            period_basis: periodBasis,
            scope: effectiveScope,
            respect_hierarchy: respectHierarchy,
            pdf_template: format === 'pdf' ? pdfTemplate : {},
          } as any)
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
            recipient_user_ids: effectiveRecipients,
            recipient_mode: recipientMode,
            attachment_format: format,
            push_to_phone: pushToPhone,
            period_basis: periodBasis,
            scope: effectiveScope,
            status: 'active',
          },
        });
        if (error) throw error;
        // period_basis + pdf_template aren't in the RPC signature — set directly after insert.
        if (data) {
          await supabase.from('report_subscriptions').update({
            period_basis: periodBasis,
            respect_hierarchy: respectHierarchy,
            pdf_template: format === 'pdf' ? pdfTemplate : {},
          } as any).eq('id', data);
        }
        return data;
      }
    },
    onSuccess: () => { toast.success(editing ? 'Subscription updated' : 'Subscription created'); onSaved(); },
    onError: (e: any) => toast.error(e.message || 'Failed to save'),
  });

  const canNext1 = !!(name.trim() && datasetKey && (values.length > 0 || (layout === 'tabular' && rows.length > 0)));
  const canNext2 = !!(fireTime && timezone && format && (recipientMode === 'all_managers' || recipientIds.length > 0));

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
            distributorId={distributorId} setDistributorId={setDistributorId}
            sortKey={sortKey} setSortKey={setSortKey}
            sortDir={sortDir} setSortDir={setSortDir}
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
                <Select
                  value={cadence}
                  onValueChange={(v) => {
                    setCadence(v);
                    // Follow the cadence's sensible default until the user overrides it.
                    if (!basisTouched) setPeriodBasis(defaultPeriodBasisFor(v));
                  }}
                >
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
              {format === 'pdf' && (
                <div className="md:col-span-2">
                  <PdfTemplatePanel
                    value={pdfTemplate}
                    onChange={setPdfTemplate}
                    onPreview={() => {
                      if (!pdfPreviewOpen) setPdfPreviewOpen(true);
                      else setPdfPreviewRefreshKey(k => k + 1);
                    }}
                    previewOpen={pdfPreviewOpen}
                  />
                  <PdfInlinePreview
                    open={pdfPreviewOpen}
                    template={pdfTemplate}
                    name={name}
                    dataset={dataset}
                    layout={layout}
                    rows={rows}
                    columns={columns}
                    values={values}
                    filters={{
                      date_from: dateFrom,
                      date_to: dateTo,
                      scope_user_id: scopeUserId || null,
                      distributor_id: distributorId || null,
                      sort_key: sortKey || null,
                      sort_dir: sortKey ? sortDir : null,
                    }}
                    refreshKey={pdfPreviewRefreshKey}
                  />
                </div>
              )}
              <div className="space-y-2 md:col-span-2">
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-1.5">
                      <NetworkIcon size={13} className="text-muted-foreground" />
                      Respect reporting hierarchy
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Each recipient's report covers only themselves and the people below them
                      in the reporting tree — never a peer or a manager above them. System
                      admins still receive the organisation-wide report.
                    </p>
                  </div>
                  <Switch checked={respectHierarchy} onCheckedChange={setRespectHierarchy} />
                </div>
                {!respectHierarchy && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-500">
                    Every recipient will see the whole organisation's data, including people
                    above them. Only turn this off for a deliberately org-wide report.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  Scope
                  {(recipientMode === 'all_managers' || respectHierarchy) && (
                    <LockIcon size={12} className="text-muted-foreground" />
                  )}
                </Label>
                <Select
                  value={respectHierarchy ? 'per_recipient' : scope}
                  onValueChange={setScope}
                  disabled={recipientMode === 'all_managers' || respectHierarchy}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shared">Shared — one report for everyone</SelectItem>
                    <SelectItem value="per_recipient">Per recipient — filtered by their scope</SelectItem>
                  </SelectContent>
                </Select>
                {respectHierarchy ? (
                  <p className="text-[11px] text-muted-foreground">
                    Set by the hierarchy rule above.
                  </p>
                ) : recipientMode === 'all_managers' ? (
                  <p className="text-[11px] text-muted-foreground">
                    Per recipient is required so each manager sees only their own team.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Reporting window</Label>
                <Select
                  value={periodBasis}
                  onValueChange={(v) => {
                    setBasisTouched(true);
                    setPeriodBasis(v as any);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">
                      {isDailyCadence ? 'This period to date (recommended)' : 'This period to date'}
                    </SelectItem>
                    <SelectItem value="previous">
                      {isDailyCadence ? 'Previous complete period' : 'Previous complete period (recommended)'}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {periodBasis === 'current'
                    ? isDailyCadence
                      ? `Covers that same day's activity, up to the ${fireTime} send time.`
                      : 'Covers the current period up to the send time — useful for progress summaries.'
                    : isDailyCadence
                      ? 'Covers the previous day. The report that arrives today describes yesterday.'
                      : 'Covers the last completed period (last week for weekly, last month for monthly).'}
                </p>
              </div>
              <div className="flex items-center gap-3 md:col-span-2 pt-2">
                <Switch checked={pushToPhone} onCheckedChange={setPushToPhone} id="push" />
                <Label htmlFor="push" className="cursor-pointer">Also send phone push notification</Label>
              </div>
            </div>

            {/* Recipients mode selector */}
            <div className="space-y-2">
              <Label>Recipients mode</Label>
              <div className="inline-flex rounded-md border bg-muted/30 p-0.5">
                <button
                  type="button"
                  onClick={() => setRecipientMode('named_users')}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded transition-colors',
                    recipientMode === 'named_users' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Specific users
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientMode('all_managers')}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded transition-colors inline-flex items-center gap-1.5',
                    recipientMode === 'all_managers' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <NetworkIcon size={12} /> All managers
                </button>
              </div>
            </div>

            {recipientMode === 'named_users' ? (
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
            ) : (
              <div className="rounded-md border border-indigo-100 bg-indigo-50/40 p-4 flex items-start gap-3">
                <NetworkIcon size={18} className="text-indigo-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-sm">
                  <p className="font-medium">
                    Resolves to {managerList.length} manager{managerList.length === 1 ? '' : 's'}
                  </p>
                  <p className="text-[12px] text-muted-foreground">Recalculated at every run — hierarchy changes are picked up automatically.</p>
                  <p className="text-[12px] text-muted-foreground">Each manager receives one report covering their own reporting tree.</p>
                  {managerList.length === 0 && (
                    <p className="text-[12px] text-amber-600 mt-1">No managers found — no one will receive this report until an employee is assigned a manager.</p>
                  )}
                </div>
              </div>
            )}

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
              {format === 'pdf' && (
                <div className="text-[12px] text-muted-foreground pl-1">
                  PDF template · Theme: <b>{getPdfTheme(pdfTemplate.theme).label}</b>
                  {' · '}Header: <b>{pdfTemplate.header_style || 'standard'}</b>
                  {' · '}Orientation: <b>{pdfTemplate.orientation || 'auto'}</b>
                  {' · '}Branding: <b>{pdfTemplate.branding || 'company'}</b>
                  {pdfTemplate.footer_note ? <> · Footer: <b>{pdfTemplate.footer_note}</b></> : null}
                </div>
              )}
              <div>
                <span className="font-medium">Scope:</span>{' '}
                {respectHierarchy
                  ? 'per recipient — own team only (hierarchy enforced)'
                  : recipientMode === 'all_managers'
                    ? 'per_recipient (locked)'
                    : `${scope} — organisation-wide, hierarchy off`}
              </div>
              <div>
                <span className="font-medium">Recipients:</span>{' '}
                {recipientMode === 'all_managers'
                  ? `all managers (${managerList.length} today) · one report per reporting tree`
                  : recipientIds.length}
              </div>
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

// ------- Step 1 (Salesforce-style report builder) -------

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
                  (isDone || isActive) && 'bg-[#534ab7] border-[#534ab7] text-white',
                  !isDone && !isActive && 'bg-muted border-border text-muted-foreground',
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : stepNum}
              </div>
              <span className={cn('text-sm truncate', (isActive || isDone) ? 'text-foreground font-medium' : 'text-muted-foreground')}>
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

const LAYOUT_OPTIONS = [
  { value: 'tabular', label: 'Tabular', icon: ListIcon, hint: 'Flat list — one row per record, columns for the fields you pick.' },
  { value: 'grouped', label: 'Summary', icon: Rows3, hint: 'Group rows by a field and total the measures, with subtotals.' },
  { value: 'matrix', label: 'Matrix', icon: LayoutGrid, hint: 'Pivot two fields — rows × columns with a value in each cell.' },
] as const;

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
  distributorId: string; setDistributorId: (v: string) => void;
  sortKey: string; setSortKey: (v: string) => void;
  sortDir: 'asc' | 'desc'; setSortDir: (v: 'asc' | 'desc') => void;
  onCancel: () => void;
  onNext: () => void;
  canNext: boolean;
}

function Step1Body(p: Step1Props) {
  const { dataset, layout, rows, columns, values, datasetKey, dateFrom, dateTo, scopeUserId, distributorId, sortKey, sortDir } = p;
  const { user } = useAuth();
  const { subordinates } = useSubordinates();

  const dims = dataset?.dimensions ?? [];
  const measures = dataset?.measures ?? [];
  const dimLabel = (k: string) => dims.find(d => d.key === k)?.label ?? k;
  const msrLabel = (k: string) => measures.find(m => m.key === k)?.label ?? k;
  const anyLabel = (k: string) => {
    const d = dims.find(x => x.key === k);
    if (d) return d.label;
    const m = measures.find(x => x.key === k);
    if (m) return m.label;
    return k.replace(/_/g, ' ');
  };
  const isMeasureKey = (k: string) => measures.some(m => m.key === k);

  const [fieldSearch, setFieldSearch] = React.useState('');
  const q = fieldSearch.toLowerCase();
  const filteredDims = dims.filter(d => d.label.toLowerCase().includes(q));
  const filteredMsrs = measures.filter(m => m.label.toLowerCase().includes(q));

  const addField = React.useCallback((k: string, kind: 'dim' | 'msr') => {
    if (!k) return;
    if (layout === 'tabular') {
      // Multi-column: append, ignore duplicates. Accepts dims and measures.
      p.setRows(prev => (prev.includes(k) ? prev : [...prev, k]));
    } else if (layout === 'grouped') {
      // Summary: Group Rows is single-slot (replace); Values is multi (append, dedupe).
      if (kind === 'msr') {
        p.setValues(prev => (prev.includes(k) ? prev : [...prev, k]));
      } else {
        p.setRows([k]);
      }
    } else {
      // Matrix: all three zones are single-slot (replace).
      if (kind === 'msr') {
        p.setValues([k]);
      } else if (!rows[0]) {
        p.setRows([k]);
      } else {
        p.setColumns(k);
      }
    }
  }, [layout, rows, p]);

  const removeChip = (zone: 'cols' | 'gr' | 'gc' | 'val' | 'vals', k?: string) => {
    if (zone === 'cols' && k) p.setRows(prev => prev.filter(x => x !== k));
    else if (zone === 'vals' && k) p.setValues(prev => prev.filter(x => x !== k));
    else if (zone === 'gr') p.setRows([]);
    else if (zone === 'gc') p.setColumns('');
    else if (zone === 'val') p.setValues([]);
  };

  const reorderRows = React.useCallback((from: number, to: number) => {
    p.setRows(prev => {
      if (from < 0 || to < 0 || from >= prev.length || to >= prev.length || from === to) return prev;
      const c = [...prev]; const [m] = c.splice(from, 1); c.splice(to, 0, m); return c;
    });
  }, [p]);
  const reorderValues = React.useCallback((from: number, to: number) => {
    p.setValues(prev => {
      if (from < 0 || to < 0 || from >= prev.length || to >= prev.length || from === to) return prev;
      const c = [...prev]; const [m] = c.splice(from, 1); c.splice(to, 0, m); return c;
    });
  }, [p]);
  const reorderByKey = React.useCallback((list: string[], reorder: (f: number, t: number) => void) => (fromKey: string, toKey: string) => {
    const f = list.indexOf(fromKey), t = list.indexOf(toKey);
    if (f >= 0 && t >= 0) reorder(f, t);
  }, []);

  const scopeOptions = React.useMemo(() => {
    const opts: Array<{ id: string; label: string; level: number }> = [];
    if (user?.id) opts.push({ id: user.id, label: 'Me (and my full hierarchy)', level: 0 });
    subordinates.forEach(s => opts.push({ id: s.subordinate_user_id, label: s.full_name, level: s.level }));
    return opts;
  }, [subordinates, user?.id]);
  const scopeLabel = scopeUserId
    ? (scopeOptions.find(o => o.id === scopeUserId)?.label ?? 'Selected user')
    : 'Everyone I can see';

  // Sortable columns are exactly what this report selected, in the order it
  // arranged them — nothing enumerated here. The RPC whitelists the key against
  // the same set, so anything stale just falls back to the default order.
  const sortOptions = React.useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ key: string; label: string }> = [];
    const push = (key: string, label: string) => {
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({ key, label });
    };
    rows.forEach(k => push(k, dims.find(d => d.key === k)?.label ?? k));
    values.forEach(k => push(k, measures.find(m => m.key === k)?.label ?? k));
    return out;
  }, [rows, values, dims, measures]);

  const hasDistributorDim = dims.some(d => d.key === 'distributor');
  const { data: distributors = [] } = useQuery({
    queryKey: ['report-distributors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('distributors')
        .select('id, name')
        .order('name', { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
    enabled: hasDistributorDim,
  });

  const [debounced, setDebounced] = React.useState({ datasetKey, layout, rows, columns, values, dateFrom, dateTo, scopeUserId, distributorId, sortKey, sortDir });
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced({ datasetKey, layout, rows, columns, values, dateFrom, dateTo, scopeUserId, distributorId, sortKey, sortDir }), 250);
    return () => clearTimeout(t);
  }, [datasetKey, layout, rows, columns, values, dateFrom, dateTo, scopeUserId, distributorId, sortKey, sortDir]);

  const preview = useQuery({
    queryKey: [
      'report-preview',
      debounced.datasetKey, debounced.layout,
      debounced.rows.join(','), debounced.columns,
      debounced.values.join(','),
      debounced.dateFrom, debounced.dateTo, debounced.scopeUserId, debounced.distributorId,
      debounced.sortKey, debounced.sortDir,
    ],
    enabled: !!dataset && !!dataset.source && (debounced.values.length > 0 || (debounced.layout === 'tabular' && debounced.rows.length > 0)),
    retry: false,
    queryFn: async () => {
      const payload: Record<string, unknown> = {
        p_layout: debounced.layout,
        p_rows: debounced.layout === 'tabular' ? null : (debounced.rows[0] || null),
        p_columns: debounced.layout === 'matrix' ? (debounced.columns || null) : null,
        p_values: debounced.values,
        p_filters: {
          date_from: debounced.dateFrom,
          date_to: debounced.dateTo,
          scope_user_id: debounced.scopeUserId || null,
          distributor_id: debounced.distributorId || null,
          sort_key: debounced.sortKey || null,
          sort_dir: debounced.sortKey ? debounced.sortDir : null,
        },
      };
      // Only send p_row_keys when it is actually needed. Adding the key
      // unconditionally makes PostgREST look for an overload with that
      // parameter, which fails for datasets whose function does not declare it.
      if (debounced.layout === 'grouped' && debounced.rows.length > 1) {
        payload.p_row_keys = debounced.rows;
      }
      // eslint-disable-next-line no-console
      console.debug('[ReportPreview] rpc', dataset!.source, payload);
      const { data, error } = await supabase.rpc(dataset!.source as any, payload as any);
      if (error) throw error;
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

  const layoutHint = LAYOUT_OPTIONS.find(l => l.value === layout)?.hint ?? '';

  const [sort, setSort] = React.useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);
  React.useEffect(() => { setSort(null); }, [layout, datasetKey]);

  return (
    <div className="space-y-4">
      {/* Top bar: name · dataset · Run */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={p.name}
          onChange={e => p.setName(e.target.value)}
          placeholder={dataset ? `${dataset.label} report` : 'Untitled report'}
          className="flex-1 min-w-[200px] text-base font-semibold bg-transparent border-0 border-b border-dashed border-transparent hover:border-border/60 focus:border-border outline-none py-1 px-1 text-foreground placeholder:text-muted-foreground/50"
        />
        <Select value={datasetKey} onValueChange={p.setDatasetKey}>
          <SelectTrigger className="w-auto gap-2 h-9 bg-[#eeedfe] border-[#afa9ec] text-[#534ab7] font-semibold text-sm rounded-lg hover:bg-[#e4e2fb] dark:bg-[#2a2560] dark:text-[#afa9ec] dark:border-[#4a4290]">
            <Database className="h-3.5 w-3.5" />
            <SelectValue placeholder="Choose dataset" />
          </SelectTrigger>
          <SelectContent>
            {p.datasets.map(d => (
              <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={() => preview.refetch()}
          size="sm"
          disabled={previewState === 'idle'}
          className="h-9 bg-[#20201d] text-white hover:bg-[#20201d]/90 dark:bg-[#ecebe3] dark:text-[#20201d] dark:hover:bg-[#ecebe3]/90"
        >
          <PlayCircle className="h-3.5 w-3.5 mr-1.5" /> Run
        </Button>
      </div>

      {/* Format segmented + hint */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-border overflow-hidden">
          {LAYOUT_OPTIONS.map(l => {
            const active = layout === l.value;
            const disabled = l.value === 'matrix' && !dataset?.supports_matrix;
            const Icon = l.icon;
            return (
              <button
                key={l.value}
                type="button"
                disabled={disabled}
                onClick={() => p.setLayout(l.value)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-4 py-1.5 text-sm border-r border-border last:border-r-0 transition-colors',
                  active
                    ? 'bg-[#eeedfe] text-[#534ab7] font-semibold dark:bg-[#2a2560] dark:text-[#afa9ec]'
                    : 'bg-transparent text-muted-foreground hover:bg-muted/50',
                  disabled && 'opacity-40 cursor-not-allowed',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {l.label}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-muted-foreground">{layoutHint}</span>
      </div>

      {/* Main: fields rail + right column */}
      {dataset ? (
        <div className="grid grid-cols-1 md:grid-cols-[230px_1fr] gap-3 items-start">
          {/* Fields rail */}
          <div className="rounded-xl border border-border/60 bg-muted/20 dark:bg-muted/10 p-3">
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={fieldSearch}
                onChange={e => setFieldSearch(e.target.value)}
                placeholder="Search fields..."
                className="h-8 pl-8 text-xs bg-card"
              />
            </div>
            <FieldSection title="Dimensions" fields={filteredDims} kind="dim" onAdd={(k) => addField(k, 'dim')} />
            <FieldSection title="Measures" fields={filteredMsrs} kind="msr" onAdd={(k) => addField(k, 'msr')} />
          </div>

          {/* Outline + Preview */}
          <div className="space-y-3 min-w-0">
            <OutlineBar
              layout={layout}
              rows={rows}
              columns={columns}
              values={values}
              labelOf={anyLabel}
              isMeasure={isMeasureKey}
              onRemove={removeChip}
              onDrop={addField}
              onReorderRows={reorderRows}
              onReorderValues={reorderValues}
              filtersContent={
                <FiltersPanel
                  dateFrom={dateFrom} setDateFrom={p.setDateFrom}
                  dateTo={dateTo} setDateTo={p.setDateTo}
                  scopeUserId={scopeUserId} setScopeUserId={p.setScopeUserId}
                  scopeOptions={scopeOptions} scopeLabel={scopeLabel}
                  distributorId={distributorId} setDistributorId={p.setDistributorId}
                  distributors={distributors}
                  showDistributor={hasDistributorDim}
                  sortKey={sortKey} setSortKey={p.setSortKey}
                  sortDir={sortDir} setSortDir={p.setSortDir}
                  sortOptions={sortOptions}
                />
              }
            />
            <PreviewHero
              state={previewState}
              error={preview.error as any}
              rowsData={preview.data ?? []}
              layout={layout}
              rowKey={rows[0] ?? ''}
              selectedColumns={rows}
              columnKey={columns}
              values={values}
              labelOf={anyLabel}
              isMeasure={isMeasureKey}
              sort={sort}
              setSort={setSort}
              onRemoveColumn={(k) => p.setRows(prev => prev.filter(x => x !== k))}
              onRemoveValue={(k) => p.setValues(prev => prev.filter(x => x !== k))}
              onReorderColumn={reorderByKey(rows, reorderRows)}
              onReorderValue={reorderByKey(values, reorderValues)}
            />

          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Pick a dataset above to start.
        </div>
      )}

      <DialogFooter className="pt-2">
        <Button variant="ghost" onClick={p.onCancel}>Cancel</Button>
        <Button onClick={p.onNext} disabled={!p.canNext} className="bg-[#534ab7] hover:bg-[#4740a0] text-white">
          Continue
        </Button>
      </DialogFooter>
    </div>
  );
}

function FieldSection({ title, fields, kind, onAdd }: { title: string; fields: Array<{ key: string; label: string }>; kind: 'dim' | 'msr'; onAdd: (k: string) => void }) {
  return (
    <div className="mb-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mt-2 mb-1 px-1">{title}</div>
      {fields.length === 0 ? (
        <div className="text-[11px] text-muted-foreground/60 px-2 py-1">No match</div>
      ) : fields.map(f => (
        <div
          key={f.key}
          role="button"
          tabIndex={0}
          draggable
          onClick={() => onAdd(f.key)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdd(f.key); } }}
          onDragStart={(e) => {
            const payload = JSON.stringify({ key: f.key, kind });
            e.dataTransfer.setData('application/x-report-field', payload);
            e.dataTransfer.setData('application/json', payload);
            e.dataTransfer.setData('text/plain', f.key);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-muted/60 cursor-pointer text-xs group"
          title={`Add ${f.label}`}
        >
          <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0" />
          <span className="text-foreground truncate flex-1">{f.label}</span>
          <span className={cn(
            'text-[9px] font-medium rounded px-1 py-0.5',
            kind === 'dim'
              ? 'bg-[#e6f1fb] text-[#185fa5] dark:bg-[#12314a] dark:text-[#85b7eb]'
              : 'bg-[#eeedfe] text-[#534ab7] dark:bg-[#2a2560] dark:text-[#afa9ec]',
          )}>
            {kind}
          </span>
        </div>
      ))}
    </div>
  );
}

function OutlineBar({ layout, rows, columns, values, labelOf, isMeasure, onRemove, onDrop, onReorderRows, onReorderValues, filtersContent }: {
  layout: string;
  rows: string[]; columns: string; values: string[];
  labelOf: (k: string) => string;
  isMeasure: (k: string) => boolean;
  onRemove: (zone: 'cols' | 'gr' | 'gc' | 'val' | 'vals', k?: string) => void;
  onDrop: (k: string, kind: 'dim' | 'msr') => void;
  onReorderRows?: (from: number, to: number) => void;
  onReorderValues?: (from: number, to: number) => void;
  filtersContent: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex flex-wrap gap-4 items-start">
      {layout === 'tabular' && (
        <OutlineZone title="Columns" onDropKey={(k, kind) => onDrop(k, kind)}>
          {rows.length ? (
            <ReorderableChipList
              items={rows}
              onReorder={(f, t) => onReorderRows?.(f, t)}
              renderChip={(k) => <Chip label={labelOf(k)} measure={isMeasure(k)} onRemove={() => onRemove('cols', k)} />}
            />
          ) : <EmptyChip text="add fields" />}
        </OutlineZone>
      )}
      {layout === 'grouped' && (
        <>
          <OutlineZone title="Group Rows" onDropKey={(k, kind) => { if (kind === 'dim') onDrop(k, kind); }}>
            {rows[0] ? <Chip label={labelOf(rows[0])} onRemove={() => onRemove('gr')} /> : <EmptyChip text="drop field" />}
          </OutlineZone>
          <OutlineZone title="Columns (values)" onDropKey={(k, kind) => { if (kind === 'msr') onDrop(k, kind); }}>
            {values.length ? (
              <ReorderableChipList
                items={values}
                onReorder={(f, t) => onReorderValues?.(f, t)}
                renderChip={(k) => <Chip label={labelOf(k)} measure onRemove={() => onRemove('vals', k)} />}
              />
            ) : <EmptyChip text="add measures" />}
          </OutlineZone>
        </>
      )}
      {layout === 'matrix' && (
        <>
          <OutlineZone title="Group Rows" onDropKey={(k, kind) => { if (kind === 'dim') onDrop(k, kind); }}>
            {rows[0] ? <Chip label={labelOf(rows[0])} onRemove={() => onRemove('gr')} /> : <EmptyChip text="drop field" />}
          </OutlineZone>
          <OutlineZone title="Group Columns" onDropKey={(k, kind) => { if (kind === 'dim') onDrop(k, kind); }}>
            {columns ? <Chip label={labelOf(columns)} onRemove={() => onRemove('gc')} /> : <EmptyChip text="drop field" />}
          </OutlineZone>
          <OutlineZone title="Value" onDropKey={(k, kind) => { if (kind === 'msr') onDrop(k, kind); }}>
            {values[0] ? <Chip label={labelOf(values[0])} measure onRemove={() => onRemove('val')} /> : <EmptyChip text="drop measure" />}
          </OutlineZone>
        </>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="ml-auto self-center h-8">
            <Filter className="h-3.5 w-3.5 mr-1.5" /> Filters
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[380px]" align="end">{filtersContent}</PopoverContent>
      </Popover>
    </div>
  );
}

function ReorderableChipList({ items, onReorder, renderChip }: {
  items: string[];
  onReorder: (from: number, to: number) => void;
  renderChip: (key: string, index: number) => React.ReactNode;
}) {
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);
  return (
    <>
      {items.map((k, i) => (
        <span
          key={k}
          draggable
          onDragStart={(e) => {
            setDragIndex(i);
            e.dataTransfer.setData('application/x-report-reorder', String(i));
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer.types).includes('application/x-report-reorder')) {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'move';
              if (overIndex !== i) setOverIndex(i);
            }
          }}
          onDragLeave={() => setOverIndex(prev => (prev === i ? null : prev))}
          onDrop={(e) => {
            const raw = e.dataTransfer.getData('application/x-report-reorder');
            if (!raw) return;
            e.preventDefault();
            e.stopPropagation();
            const from = Number(raw);
            setDragIndex(null); setOverIndex(null);
            if (Number.isFinite(from) && from !== i) onReorder(from, i);
          }}
          onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
          className={cn(
            'inline-flex cursor-grab active:cursor-grabbing rounded-full',
            overIndex === i && dragIndex !== i && 'ring-2 ring-[#534ab7]',
            dragIndex === i && 'opacity-40',
          )}
        >
          {renderChip(k, i)}
        </span>
      ))}
    </>
  );
}


function OutlineZone({ title, children, onDropKey }: { title: string; children: React.ReactNode; onDropKey: (k: string, kind: 'dim' | 'msr') => void }) {
  const [over, setOver] = React.useState(false);
  return (
    <div
      className="min-w-[130px]"
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!over) setOver(true); }}
      onDragLeave={(e) => { const rel = e.relatedTarget as Node | null; if (!rel || !(e.currentTarget as Node).contains(rel)) setOver(false); }}
      onDrop={(e) => {
        e.preventDefault(); e.stopPropagation(); setOver(false);
        const raw = e.dataTransfer.getData('application/x-report-field') || e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
        if (!raw) return;
        let key = raw; let kind: 'dim' | 'msr' = 'dim';
        try { const parsed = JSON.parse(raw); key = parsed.key; kind = parsed.kind; } catch { /* plain string */ }
        if (key) onDropKey(key, kind);
      }}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">{title}</div>
      <div className={cn(
        'flex flex-wrap gap-1 min-h-[30px] p-1 border border-dashed rounded-lg transition-colors',
        over ? 'border-[#534ab7] bg-[#eeedfe]/60 dark:border-[#7f77dd] dark:bg-[#2a2560]/40' : 'border-border/70',
      )}>
        {children}
      </div>
    </div>
  );
}

function Chip({ label, measure, onRemove }: { label: string; measure?: boolean; onRemove: () => void }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full pl-2.5 pr-1.5 py-0.5 text-[11px] font-medium',
      measure
        ? 'bg-[#eeedfe] text-[#534ab7] dark:bg-[#2a2560] dark:text-[#afa9ec]'
        : 'bg-[#e6f1fb] text-[#185fa5] dark:bg-[#12314a] dark:text-[#85b7eb]',
    )}>
      {label}
      <button type="button" onClick={onRemove} className="opacity-70 hover:opacity-100">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function EmptyChip({ text }: { text: string }) {
  return <span className="text-[11px] text-muted-foreground/60 italic px-2 py-1">{text}</span>;
}

function FiltersPanel({ dateFrom, setDateFrom, dateTo, setDateTo, scopeUserId, setScopeUserId, scopeOptions, scopeLabel, distributorId, setDistributorId, distributors, showDistributor, sortKey, setSortKey, sortDir, setSortDir, sortOptions }: {
  dateFrom: string; setDateFrom: (v: string) => void;
  dateTo: string; setDateTo: (v: string) => void;
  scopeUserId: string; setScopeUserId: (v: string) => void;
  scopeOptions: Array<{ id: string; label: string; level: number }>;
  scopeLabel: string;
  distributorId?: string; setDistributorId?: (v: string) => void;
  distributors?: Array<{ id: string; name: string }>;
  showDistributor?: boolean;
  sortKey?: string; setSortKey?: (v: string) => void;
  sortDir?: 'asc' | 'desc'; setSortDir?: (v: 'asc' | 'desc') => void;
  sortOptions?: Array<{ key: string; label: string }>;
}) {
  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Date range</div>
        <div className="flex gap-2 items-center">
          <Input type="date" value={dateFrom} max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs" />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="flex flex-wrap gap-1 mt-1.5">
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
                setDateFrom(from.toISOString().slice(0, 10));
                setDateTo(to.toISOString().slice(0, 10));
              }}
              className="text-[11px] rounded-full border border-dashed border-border px-2 py-0.5 text-muted-foreground hover:text-foreground hover:border-solid"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 flex items-center gap-1">
          <Users className="h-3 w-3" /> Team / User
        </div>
        <Select value={scopeUserId || '__all__'} onValueChange={(v) => setScopeUserId(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue>{scopeLabel}</SelectValue></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="__all__" className="text-xs">Everyone I can see</SelectItem>
            {scopeOptions.map(o => (
              <SelectItem key={o.id} value={o.id} className="text-xs">
                <span style={{ paddingLeft: `${Math.max(0, o.level - 1) * 10}px` }}>{o.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {setSortKey && setSortDir && (sortOptions?.length ?? 0) > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 flex items-center gap-1">
            <ArrowUpDown className="h-3 w-3" /> Sort by
          </div>
          <div className="flex gap-2">
            <Select value={sortKey || '__default__'} onValueChange={(v) => setSortKey(v === '__default__' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__default__" className="text-xs">Default — rows with orders first</SelectItem>
                {sortOptions!.map(o => (
                  <SelectItem key={o.key} value={o.key} className="text-xs">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortDir ?? 'desc'} onValueChange={(v) => setSortDir(v as 'asc' | 'desc')} disabled={!sortKey}>
              <SelectTrigger className="h-8 text-xs w-[104px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="desc" className="text-xs">Descending</SelectItem>
                <SelectItem value="asc" className="text-xs">Ascending</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {sortKey
              ? 'Applies to the preview and to every delivered report.'
              : 'People who sold appear first; everyone else follows, ordered by the grouping columns.'}
          </p>
        </div>
      )}
      {showDistributor && setDistributorId && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Distributor</div>
          <Select value={distributorId || '__all__'} onValueChange={(v) => setDistributorId(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All distributors" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__all__" className="text-xs">All distributors</SelectItem>
              {(distributors ?? []).map(d => (
                <SelectItem key={d.id} value={d.id} className="text-xs">{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

type SortState = { col: string; dir: 'asc' | 'desc' } | null;

function PreviewHero({ state, error, rowsData, layout, rowKey, selectedColumns, columnKey, values, labelOf, isMeasure, sort, setSort, onRemoveColumn, onRemoveValue, onReorderColumn, onReorderValue }: {
  state: 'idle' | 'loading' | 'error' | 'empty' | 'data';
  error: Error | null;
  rowsData: any[];
  layout: string;
  rowKey: string;
  selectedColumns?: string[];
  columnKey: string;
  values: string[];
  labelOf: (k: string) => string;
  isMeasure: (k: string) => boolean;
  sort: SortState;
  setSort: (s: SortState) => void;
  onRemoveColumn: (k: string) => void;
  onRemoveValue: (k: string) => void;
  onReorderColumn?: (fromKey: string, toKey: string) => void;
  onReorderValue?: (fromKey: string, toKey: string) => void;
}) {
  const caption = state === 'data'
    ? layout === 'tabular' ? `${rowsData.length} row${rowsData.length === 1 ? '' : 's'}`
    : layout === 'grouped' ? `${rowsData.length} group${rowsData.length === 1 ? '' : 's'}`
    : `${rowsData.length} row${rowsData.length === 1 ? '' : 's'}`
    : '';

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/60 text-xs text-muted-foreground flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5">
          <PlayCircle className="h-3.5 w-3.5" /> Preview
        </span>
        <span className="text-[11px]">{caption}</span>
      </div>
      <div className="min-h-[260px] max-h-[560px] overflow-auto">
        {state === 'idle' ? (
          <div className="text-xs text-muted-foreground py-12 text-center">Add fields to see a live preview.</div>
        ) : state === 'loading' ? (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-12">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching preview…
          </div>
        ) : state === 'error' ? (
          <div className="text-xs text-destructive py-12 text-center px-4">Preview error: {error?.message || 'RPC failed'}</div>
        ) : state === 'empty' ? (
          <div className="text-xs text-muted-foreground py-12 text-center">No rows for this configuration.</div>
        ) : layout === 'tabular' ? (
          <TabularTable rowsData={rowsData} selectedColumns={selectedColumns || []} labelOf={labelOf} isMeasure={isMeasure} sort={sort} setSort={setSort} onRemoveColumn={onRemoveColumn} onReorderColumn={onReorderColumn} />
        ) : layout === 'grouped' ? (
          <SummaryTable rowsData={rowsData} rowKey={rowKey} rowKeys={selectedColumns} values={values} labelOf={labelOf} onRemoveValue={onRemoveValue} onReorderValue={onReorderValue} />
        ) : (
          <MatrixTable rowsData={rowsData} rowKey={rowKey} columnKey={columnKey} valueKey={values[0] || ''} labelOf={labelOf} onRemoveValue={onRemoveValue} />
        )}
      </div>
    </div>
  );
}


function fmtCell(v: any): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '—';
    return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function sumNumeric(rows: any[], key: string): number | null {
  let has = false, sum = 0;
  for (const r of rows) {
    const v = r?.[key];
    if (typeof v === 'number' && Number.isFinite(v)) { sum += v; has = true; }
  }
  return has ? sum : null;
}

function ColMenu({ label, keyName, align, sortDir, onSortAsc, onSortDesc, onSummarize, onRemove, draggableKey, onReorder }: {
  label: string; keyName: string; align?: 'left' | 'right'; sortDir?: 'asc' | 'desc' | null;
  onSortAsc?: () => void; onSortDesc?: () => void; onSummarize?: string; onRemove?: () => void;
  draggableKey?: string;
  onReorder?: (fromKey: string, toKey: string) => void;
}) {
  const canOpen = onSortAsc || onSortDesc || onRemove || onSummarize;
  const [over, setOver] = React.useState(false);
  const dragEnabled = !!draggableKey && !!onReorder;
  const header = (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      {sortDir === 'asc' && <ArrowUp className="h-3 w-3 text-[#534ab7]" />}
      {sortDir === 'desc' && <ArrowDown className="h-3 w-3 text-[#534ab7]" />}
      {canOpen && <ChevronDown className="h-3 w-3 opacity-40" />}
    </span>
  );
  return (
    <th
      draggable={dragEnabled}
      onDragStart={dragEnabled ? (e) => {
        e.dataTransfer.setData('application/x-report-col-reorder', draggableKey!);
        e.dataTransfer.effectAllowed = 'move';
      } : undefined}
      onDragOver={dragEnabled ? (e) => {
        if (Array.from(e.dataTransfer.types).includes('application/x-report-col-reorder')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (!over) setOver(true);
        }
      } : undefined}
      onDragLeave={dragEnabled ? () => setOver(false) : undefined}
      onDrop={dragEnabled ? (e) => {
        const from = e.dataTransfer.getData('application/x-report-col-reorder');
        setOver(false);
        if (!from || from === draggableKey) return;
        e.preventDefault();
        onReorder!(from, draggableKey!);
      } : undefined}
      className={cn(
        'px-3 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap select-none',
        align === 'right' ? 'text-right' : 'text-left',
        dragEnabled && 'cursor-grab active:cursor-grabbing',
        over && 'bg-[#eeedfe] dark:bg-[#2a2560]/40',
      )}
    >
      {canOpen ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center gap-1 hover:text-foreground">{header}</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={align === 'right' ? 'end' : 'start'} className="w-48">
            {onSortAsc && <DropdownMenuItem onClick={onSortAsc}><ArrowUp className="h-3.5 w-3.5 mr-2" />Sort ascending</DropdownMenuItem>}
            {onSortDesc && <DropdownMenuItem onClick={onSortDesc}><ArrowDown className="h-3.5 w-3.5 mr-2" />Sort descending</DropdownMenuItem>}
            {onSummarize && <DropdownMenuItem disabled><Sigma className="h-3.5 w-3.5 mr-2" />Summarize: {onSummarize}</DropdownMenuItem>}
            {(onSortAsc || onSortDesc || onSummarize) && onRemove && <DropdownMenuSeparator />}
            {onRemove && <DropdownMenuItem onClick={onRemove} className="text-destructive"><Trash2 className="h-3.5 w-3.5 mr-2" />Remove</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : header}
    </th>
  );
}

function TabularTable({ rowsData, selectedColumns, labelOf, isMeasure, sort, setSort, onRemoveColumn, onReorderColumn }: {
  rowsData: any[]; selectedColumns: string[]; labelOf: (k: string) => string; isMeasure: (k: string) => boolean;
  sort: SortState; setSort: (s: SortState) => void; onRemoveColumn: (k: string) => void;
  onReorderColumn?: (fromKey: string, toKey: string) => void;
}) {
  const keys = React.useMemo(() => {
    const available = new Set(Object.keys(rowsData[0] ?? {}));
    if (selectedColumns.length > 0) {
      const chosen = selectedColumns.filter(k => available.has(k));
      return chosen.length ? chosen : Array.from(available);
    }
    return Array.from(available);
  }, [rowsData, selectedColumns]);

  const sorted = React.useMemo(() => {
    if (!sort) return rowsData;
    return [...rowsData].sort((a, b) => {
      const av = a?.[sort.col], bv = b?.[sort.col];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return sort.dir === 'asc' ? -1 : 1;
      if (av > bv) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [rowsData, sort]);

  return (
    <table className="w-full text-xs">
      <thead className="bg-muted/30 sticky top-0">
        <tr>
          {keys.map(k => (
            <ColMenu
              key={k}
              label={labelOf(k)}
              keyName={k}
              align={isMeasure(k) ? 'right' : 'left'}
              sortDir={sort?.col === k ? sort.dir : null}
              onSortAsc={() => setSort({ col: k, dir: 'asc' })}
              onSortDesc={() => setSort({ col: k, dir: 'desc' })}
              onRemove={selectedColumns.includes(k) ? () => onRemoveColumn(k) : undefined}
              draggableKey={selectedColumns.includes(k) ? k : undefined}
              onReorder={onReorderColumn}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={i} className="border-t border-border/40 hover:bg-muted/20">
            {keys.map(k => (
              <td key={k} className={cn('px-3 py-1.5 whitespace-nowrap text-foreground', isMeasure(k) && 'text-right tabular-nums')}>
                {fmtCell(r?.[k])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SummaryTable({ rowsData, rowKey, rowKeys = [], values, labelOf, onRemoveValue, onReorderValue }: {
  rowsData: any[]; rowKey: string; rowKeys?: string[]; values: string[]; labelOf: (k: string) => string;
  onRemoveValue: (k: string) => void;
  onReorderValue?: (fromKey: string, toKey: string) => void;
}) {
  const keys = Object.keys(rowsData[0] ?? {});
  // Grouping by several dimensions returns one named column each; a single
  // dimension still comes back under the generic "grp".
  const dimCols = rowKeys.filter(k => keys.includes(k));
  const groupCols = dimCols.length ? dimCols : [rowKey && keys.includes(rowKey) ? rowKey : keys[0]];
  const valueCols = values.length
    ? values.filter(v => keys.includes(v))
    : keys.filter(k => !groupCols.includes(k));

  return (
    <table className="w-full text-xs">
      <thead className="bg-muted/30 sticky top-0">
        <tr>
          {groupCols.map(gc => <ColMenu key={gc} label={labelOf(gc)} keyName={gc} />)}
          {valueCols.map(k => (
            <ColMenu
              key={k}
              label={labelOf(k)}
              keyName={k}
              align="right"
              onSummarize="Sum"
              onRemove={values.includes(k) ? () => onRemoveValue(k) : undefined}
              draggableKey={values.includes(k) ? k : undefined}
              onReorder={onReorderValue}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {rowsData.map((r, i) => (
          <tr key={i} className="bg-muted/25 border-t border-border/50">
            {groupCols.map(gc => (
              <td key={gc} className="px-3 py-2 font-semibold text-foreground">{fmtCell(r?.[gc])}</td>
            ))}
            {valueCols.map(k => (
              <td key={k} className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">{fmtCell(r?.[k])}</td>
            ))}
          </tr>
        ))}
        <tr className="bg-[#eaf3de] dark:bg-[#22350f] border-t-2 border-[#639922]/50">
          <td className="px-3 py-2 font-bold text-[#3b6d11] dark:text-[#97c459]"
              colSpan={groupCols.length}>Grand total</td>
          {valueCols.map(k => {
            const total = sumNumeric(rowsData, k);
            return (
              <td key={k} className="px-3 py-2 text-right tabular-nums font-bold text-[#3b6d11] dark:text-[#97c459]">
                {total == null ? '—' : fmtCell(total)}
              </td>
            );
          })}
        </tr>
      </tbody>
    </table>
  );
}

function MatrixTable({ rowsData, rowKey, columnKey, valueKey, labelOf, onRemoveValue }: {
  rowsData: any[]; rowKey: string; columnKey: string; valueKey: string; labelOf: (k: string) => string; onRemoveValue: (k: string) => void;
}) {
  const keys = Object.keys(rowsData[0] ?? {});
  // Long shape: rowKey + columnKey + valueKey present
  const isLong = !!(rowKey && columnKey && valueKey && keys.includes(rowKey) && keys.includes(columnKey) && keys.includes(valueKey));

  const rowLabels: string[] = [];
  const colLabels: string[] = [];
  const cellMap: Record<string, Record<string, number>> = {};

  if (isLong) {
    for (const r of rowsData) {
      const rv = String(r[rowKey] ?? '');
      const cv = String(r[columnKey] ?? '');
      const val = Number(r[valueKey]);
      if (!rowLabels.includes(rv)) rowLabels.push(rv);
      if (!colLabels.includes(cv)) colLabels.push(cv);
      cellMap[rv] = cellMap[rv] || {};
      cellMap[rv][cv] = (cellMap[rv][cv] || 0) + (Number.isFinite(val) ? val : 0);
    }
  } else {
    // Wide shape: one row per rowKey; every other numeric column is a pivot column
    const rk = rowKey && keys.includes(rowKey) ? rowKey : keys[0];
    for (const r of rowsData) {
      const rv = String(r?.[rk] ?? '');
      if (!rowLabels.includes(rv)) rowLabels.push(rv);
      cellMap[rv] = cellMap[rv] || {};
      keys.forEach(k => {
        if (k === rk) return;
        const v = Number(r?.[k]);
        if (Number.isFinite(v)) {
          cellMap[rv][k] = v;
          if (!colLabels.includes(k)) colLabels.push(k);
        }
      });
    }
  }

  const rowTot = (rv: string) => colLabels.reduce((s, c) => s + (cellMap[rv]?.[c] || 0), 0);
  const colTot = (cv: string) => rowLabels.reduce((s, rv) => s + (cellMap[rv]?.[cv] || 0), 0);
  const grand = rowLabels.reduce((s, rv) => s + rowTot(rv), 0);

  const rowHeader = rowKey ? labelOf(rowKey) : (keys[0] ? labelOf(keys[0]) : 'Row');
  const valueHeader = valueKey ? labelOf(valueKey) : 'Total';

  return (
    <table className="w-full text-xs">
      <thead className="bg-muted/30 sticky top-0">
        <tr>
          <ColMenu label={rowHeader} keyName={rowKey || '__row__'} />
          {colLabels.map(c => (
            <th key={c} className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
              {isLong ? c : labelOf(c)}
            </th>
          ))}
          <ColMenu
            label={`${valueHeader} total`}
            keyName="__row_total__"
            align="right"
            onSummarize="Sum"
            onRemove={valueKey ? () => onRemoveValue(valueKey) : undefined}
          />
        </tr>
      </thead>
      <tbody>
        {rowLabels.map(rv => (
          <tr key={rv} className="border-t border-border/40">
            <td className="px-3 py-1.5 font-medium text-foreground">{rv || '—'}</td>
            {colLabels.map(c => (
              <td key={c} className="px-3 py-1.5 text-right tabular-nums text-foreground">
                {cellMap[rv]?.[c] == null ? '—' : fmtCell(cellMap[rv][c])}
              </td>
            ))}
            <td className="px-3 py-1.5 text-right tabular-nums font-semibold bg-[#e6f1fb] text-[#185fa5] dark:bg-[#12314a] dark:text-[#85b7eb]">
              {fmtCell(rowTot(rv))}
            </td>
          </tr>
        ))}
        <tr className="bg-[#eaf3de] dark:bg-[#22350f] border-t-2 border-[#639922]/50">
          <td className="px-3 py-2 font-bold text-[#3b6d11] dark:text-[#97c459]">Total</td>
          {colLabels.map(c => (
            <td key={c} className="px-3 py-2 text-right tabular-nums font-bold text-[#3b6d11] dark:text-[#97c459]">{fmtCell(colTot(c))}</td>
          ))}
          <td className="px-3 py-2 text-right tabular-nums font-bold text-[#3b6d11] dark:text-[#97c459]">{fmtCell(grand)}</td>
        </tr>
      </tbody>
    </table>
  );
}



// ---------- PDF template panel (inline, Schedule step) ----------

interface PdfTemplatePanelProps {
  value: any;
  onChange: (v: any) => void;
  onPreview: () => void;
  previewOpen: boolean;
}

const HEADER_STYLES: Array<{ id: string; label: string }> = [
  { id: 'standard', label: 'Standard' },
  { id: 'centered', label: 'Centered' },
  { id: 'band', label: 'Band' },
  { id: 'compact', label: 'Compact' },
];
const ORIENTATIONS: Array<{ id: string; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'portrait', label: 'Portrait' },
  { id: 'landscape', label: 'Landscape' },
];

function Seg({
  options, value, onChange,
}: { options: Array<{ id: string; label: string }>; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex w-full rounded-md border bg-background overflow-hidden">
      {options.map((o, i) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            'flex-1 text-xs py-1.5 transition-colors',
            i > 0 && 'border-l',
            value === o.id ? 'bg-[#eeedfe] text-[#534ab7] font-medium dark:bg-[#2a2560] dark:text-[#afa9ec]' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PdfTemplatePanel({ value, onChange, onPreview, previewOpen }: PdfTemplatePanelProps) {
  const t = value ?? {};
  const set = (k: string, v: any) => onChange({ ...t, [k]: v });
  const bool = (k: string, def = true) => (t[k] === undefined ? def : !!t[k]);

  return (
    <div className="rounded-xl border border-[#afa9ec] bg-[#eeedfe]/60 dark:bg-[#2a2560]/40 p-4 space-y-4">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-[#534ab7] dark:text-[#afa9ec]">
        <FileType2 size={14} /> PDF template
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Theme</Label>
        <div className="grid grid-cols-2 gap-2">
          {PDF_THEMES.map(th => {
            const active = (t.theme ?? 'default') === th.id;
            return (
              <button
                key={th.id}
                type="button"
                onClick={() => set('theme', th.id)}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors bg-background',
                  active ? 'border-[#534ab7] ring-1 ring-[#534ab7]/40 font-medium' : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="h-3.5 w-3.5 rounded-full shrink-0 border border-black/10" style={{ background: th.accent }} />
                <span className="truncate">{th.label}</span>
                {active && <Check size={13} className="ml-auto text-[#534ab7]" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Branding</Label>
          <Select value={t.branding ?? 'company'} onValueChange={v => set('branding', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="company">Company</SelectItem>
              <SelectItem value="distributor">Distributor (scoped)</SelectItem>
              <SelectItem value="none">No branding</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Orientation</Label>
          <Seg options={ORIENTATIONS} value={t.orientation ?? 'auto'} onChange={v => set('orientation', v)} />
        </div>
      </div>


      <div className="h-px bg-[#afa9ec]/50" />

      <div className="text-[12px] font-semibold text-[#534ab7] dark:text-[#afa9ec]">Header</div>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Header style</Label>
          <Seg options={HEADER_STYLES} value={t.header_style ?? 'standard'} onChange={v => set('header_style', v)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Title override</Label>
            <Input value={t.title_override ?? ''} placeholder="Leave blank to use the report name"
              onChange={e => set('title_override', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Subtitle (optional)</Label>
            <Input value={t.subtitle ?? ''} placeholder="e.g. Prepared for the regional review"
              onChange={e => set('subtitle', e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={bool('show_period', true)} onCheckedChange={c => set('show_period', !!c)} />
            Show reporting period
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={bool('show_contact_line', false)} onCheckedChange={c => set('show_contact_line', !!c)} />
            Show address &amp; GSTIN line
          </label>
        </div>
      </div>

      <div className="h-px bg-[#afa9ec]/50" />

      <div className="text-[12px] font-semibold text-[#534ab7] dark:text-[#afa9ec]">Body</div>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={bool('include_meta', true)} onCheckedChange={c => set('include_meta', !!c)} />
            Meta block (generated, filters, recipient)
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={bool('include_totals', true)} onCheckedChange={c => set('include_totals', !!c)} />
            Totals row
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={bool('include_page_numbers', true)} onCheckedChange={c => set('include_page_numbers', !!c)} />
            Page numbers
          </label>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Footer note (optional)</Label>
          <Input value={t.footer_note ?? ''} placeholder="e.g. Confidential — internal use only"
            onChange={e => set('footer_note', e.target.value)} />
        </div>
      </div>

      <div className="pt-1">
        <Button type="button" variant="outline" className="w-full" onClick={onPreview}>
          {previewOpen ? <><RefreshCw size={14} className="mr-2" />Refresh preview</> : <><Eye size={14} className="mr-2" />Preview PDF</>}
        </Button>
        {!previewOpen && (
          <p className="mt-2 text-[11px] text-muted-foreground text-center">
            Press Preview PDF to render the template.
          </p>
        )}
      </div>
    </div>
  );
}
