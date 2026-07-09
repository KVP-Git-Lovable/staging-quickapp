import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, Activity as ActivityIcon, CheckCircle2, TrendingUp, Clock } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useActivityTypes } from '@/hooks/useActivityTypes';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import AssignActivityDialog from '@/components/activity/AssignActivityDialog';

interface TeamActivityRow {
  visit_id: string;
  activity_event_id: string;
  user_id: string;
  user_name: string;
  activity_type: string;
  ae_status: string | null;
  visit_status: string | null;
  activity_date: string;
  duration_minutes: number | null;
  expected_duration_minutes: number | null;
  half_day_type: string | null;
  completion_summary: string | null;
  outcome: string | null;
  assigned_by: string | null;
}

function initials(name: string) {
  return (name || '?')
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function statusPill(row: TeamActivityRow) {
  const vs = row.visit_status;
  const ae = row.ae_status;
  if (vs === 'productive') return { label: 'Productive', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  if (vs === 'unproductive') return { label: 'Unproductive', cls: 'bg-rose-100 text-rose-700 border-rose-200' };
  if (vs === 'in_progress' || ae === 'in_progress') return { label: 'In progress', cls: 'bg-blue-100 text-blue-700 border-blue-200' };
  if (ae === 'closed') return { label: 'Completed', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  return { label: 'Scheduled', cls: 'bg-amber-100 text-amber-700 border-amber-200' };
}

const ActivityCoordinator: React.FC = () => {
  const navigate = useNavigate();
  const { can, loading: permsLoading } = usePermissions();
  const { types } = useActivityTypes();

  const canView = can('activity_team_view', 'read') || can('activity_team_view', 'view_all');

  const today = new Date();
  const [fromDate, setFromDate] = useState(format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [member, setMember] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');

  const [rows, setRows] = useState<TeamActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const fetchRows = React.useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_team_activities' as any, {
      p_from: fromDate,
      p_to: toDate,
    });
    if (!error && Array.isArray(data)) setRows(data as TeamActivityRow[]);
    else setRows([]);
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => {
    if (!canView) return;
    fetchRows();
  }, [fetchRows, canView]);

  const typeMap = useMemo(() => {
    const m = new Map<string, { name: string; color: string | null }>();
    types.forEach((t) => m.set(t.code, { name: t.name, color: t.color }));
    return m;
  }, [types]);

  const memberOptions = useMemo(() => {
    const set = new Map<string, string>();
    rows.forEach((r) => set.set(r.user_id, r.user_name || '—'));
    return Array.from(set.entries());
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (member !== 'all' && r.user_id !== member) return false;
      if (typeFilter !== 'all' && r.activity_type !== typeFilter) return false;
      if (outcomeFilter === 'productive' && r.visit_status !== 'productive') return false;
      if (outcomeFilter === 'unproductive' && r.visit_status !== 'unproductive') return false;
      return true;
    });
  }, [rows, member, typeFilter, outcomeFilter]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const completed = filtered.filter(
      (r) => r.visit_status === 'productive' || r.visit_status === 'unproductive' || r.ae_status === 'closed'
    ).length;
    const productive = filtered.filter((r) => r.visit_status === 'productive').length;
    const minutes = filtered.reduce((a, r) => a + (r.duration_minutes || 0), 0);
    return { total, completed, productive, minutes };
  }, [filtered]);

  if (permsLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </Layout>
    );
  }

  if (!canView) {
    return (
      <Layout>
        <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
          <ActivityIcon className="h-12 w-12 text-muted-foreground mb-3" />
          <h2 className="text-xl font-semibold">No access</h2>
          <p className="text-muted-foreground">You need the "Activity Team View" permission to see this page.</p>
          <Button className="mt-4" variant="outline" onClick={() => navigate('/admin')}>Back to Admin</Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-subtle p-4">
        <div className="w-full space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Team activities</h1>
              <p className="text-sm text-muted-foreground">Coordinate, monitor, and assign field activities across your team.</p>
            </div>
            <Button
              className="gap-2"
              disabled={!can('action_activity_assign', 'create')}
              onClick={() => setAssignOpen(true)}
            >
              <Plus size={16} /> Assign activity
            </Button>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-3 grid grid-cols-2 md:grid-cols-5 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">From</label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">To</label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Member</label>
                <Select value={member} onValueChange={setMember}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All members</SelectItem>
                    {memberOptions.map(([id, name]) => (
                      <SelectItem key={id} value={id}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Type</label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {types.filter(t => !t.is_category).map((t) => (
                      <SelectItem key={t.id} value={t.code}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Outcome</label>
                <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="productive">Productive</SelectItem>
                    <SelectItem value="unproductive">Unproductive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<ActivityIcon className="h-5 w-5" />} label="Total activities" value={stats.total} tint="bg-blue-50 text-blue-700" />
            <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Completed" value={stats.completed} tint="bg-emerald-50 text-emerald-700" />
            <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Productive" value={stats.productive} tint="bg-teal-50 text-teal-700" />
            <StatCard icon={<Clock className="h-5 w-5" />} label="Time spent" value={`${Math.round(stats.minutes / 60 * 10) / 10}h`} tint="bg-amber-50 text-amber-700" />
          </div>

          {/* List */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Activities</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No activities in this period.</div>
              ) : (
                <ul className="divide-y">
                  {filtered.map((r) => {
                    const pill = statusPill(r);
                    const t = typeMap.get(r.activity_type);
                    const dot = t?.color || '#64748b';
                    return (
                      <li key={r.activity_event_id} className="p-3 flex items-center gap-3">
                        <div
                          className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                          style={{ backgroundColor: dot }}
                        >
                          {initials(r.user_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{r.user_name || '—'}</span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-sm">{t?.name || r.activity_type}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {r.activity_date ? format(new Date(r.activity_date), 'dd MMM yyyy') : '—'}
                            {r.duration_minutes ? ` · ${r.duration_minutes} min` : r.expected_duration_minutes ? ` · ~${r.expected_duration_minutes} min` : ''}
                            {r.assigned_by ? ' · assigned' : ''}
                          </div>
                        </div>
                        <Badge variant="outline" className={pill.cls}>{pill.label}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <AssignActivityDialog open={assignOpen} onOpenChange={setAssignOpen} onAssigned={fetchRows} />
    </Layout>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode; tint: string }> = ({ icon, label, value, tint }) => (
  <Card>
    <CardContent className="p-3 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${tint}`}>{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
      </div>
    </CardContent>
  </Card>
);

export default ActivityCoordinator;
