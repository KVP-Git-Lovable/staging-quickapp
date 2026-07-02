import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, CartesianGrid,
} from 'recharts';
import { Loader2, Activity, TrendingUp, Timer, Layers, Users } from 'lucide-react';
import { useActivityTypes } from '@/hooks/useActivityTypes';

interface Props {
  userIds?: string[];
  dateRange: { from: Date; to: Date };
  isScopeReady?: boolean;
}

interface TeamActivityRow {
  visit_id: string;
  activity_event_id: string;
  user_id: string;
  user_name: string;
  activity_type: string | null;
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

const fmtMinutes = (m: number) => {
  if (!m) return '0m';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}h ${r}m` : `${r}m`;
};

const isCompleted = (r: TeamActivityRow) =>
  r.visit_status === 'productive' || r.visit_status === 'unproductive' || r.ae_status === 'closed';
const isProductive = (r: TeamActivityRow) => r.visit_status === 'productive';
const isUnproductive = (r: TeamActivityRow) => r.visit_status === 'unproductive';

export const FieldActivitySection = ({ dateRange, isScopeReady = true }: Props) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TeamActivityRow[]>([]);
  const { types: activityTypes } = useActivityTypes();

  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');

  const fromStr = format(dateRange.from, 'yyyy-MM-dd');
  const toStr = format(dateRange.to, 'yyyy-MM-dd');

  useEffect(() => {
    if (!isScopeReady) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await (supabase as any).rpc('get_team_activities', {
          p_from: fromStr,
          p_to: toStr,
        });
        if (cancelled) return;
        if (error) {
          console.error('get_team_activities error', error);
          setRows([]);
        } else {
          setRows((data as TeamActivityRow[]) || []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fromStr, toStr, isScopeReady]);

  // Type color/label lookup from master
  const typeMeta = useMemo(() => {
    const m = new Map<string, { color: string; label: string; weight: number }>();
    activityTypes.forEach(t => {
      m.set(t.name, { color: t.color || '#6366f1', label: t.name, weight: t.productivity_weight ?? 1 });
    });
    return m;
  }, [activityTypes]);

  const members = useMemo(() => {
    const s = new Map<string, string>();
    rows.forEach(r => { if (r.user_id) s.set(r.user_id, r.user_name || 'Unknown'); });
    return Array.from(s.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const pickerTypes = useMemo(
    () => activityTypes.filter(t => t.is_active && t.show_in_picker && !t.is_category),
    [activityTypes],
  );

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (memberFilter !== 'all' && r.user_id !== memberFilter) return false;
      if (typeFilter !== 'all' && r.activity_type !== typeFilter) return false;
      if (outcomeFilter === 'productive' && !isProductive(r)) return false;
      if (outcomeFilter === 'unproductive' && !isUnproductive(r)) return false;
      return true;
    });
  }, [rows, memberFilter, typeFilter, outcomeFilter]);

  const totals = useMemo(() => {
    let total = 0, completed = 0, productive = 0, unproductive = 0, minutes = 0;
    filtered.forEach(r => {
      total += 1;
      if (isCompleted(r)) completed += 1;
      if (isProductive(r)) productive += 1;
      if (isUnproductive(r)) unproductive += 1;
      minutes += Number(r.duration_minutes) || 0;
    });
    const overall = total > 0 ? (productive / total) * 100 : 0;
    return { total, completed, productive, unproductive, minutes, overall };
  }, [filtered]);

  const typeAggregate = useMemo(() => {
    const m = new Map<string, { activity_type: string; color: string; count: number; completed: number; productive: number; minutes: number; }>();
    filtered.forEach(r => {
      const key = r.activity_type || 'Other';
      const meta = typeMeta.get(key);
      const cur = m.get(key) || {
        activity_type: key,
        color: meta?.color || '#6366f1',
        count: 0, completed: 0, productive: 0, minutes: 0,
      };
      cur.count += 1;
      if (isCompleted(r)) cur.completed += 1;
      if (isProductive(r)) cur.productive += 1;
      cur.minutes += Number(r.duration_minutes) || 0;
      m.set(key, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.count - a.count);
  }, [filtered, typeMeta]);

  const monthlyAggregate = useMemo(() => {
    const m = new Map<string, { month: string; count: number; productive: number; minutes: number; }>();
    filtered.forEach(r => {
      const mo = (r.activity_date || '').slice(0, 7);
      if (!mo) return;
      const cur = m.get(mo) || { month: mo, count: 0, productive: 0, minutes: 0 };
      cur.count += 1;
      if (isProductive(r)) cur.productive += 1;
      cur.minutes += Number(r.duration_minutes) || 0;
      m.set(mo, cur);
    });
    return Array.from(m.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [filtered]);

  const byRep = useMemo(() => {
    const m = new Map<string, { user_id: string; user_name: string; activities: number; productive: number; unproductive: number; minutes: number; }>();
    filtered.forEach(r => {
      const cur = m.get(r.user_id) || {
        user_id: r.user_id, user_name: r.user_name || 'Unknown',
        activities: 0, productive: 0, unproductive: 0, minutes: 0,
      };
      cur.activities += 1;
      if (isProductive(r)) cur.productive += 1;
      if (isUnproductive(r)) cur.unproductive += 1;
      cur.minutes += Number(r.duration_minutes) || 0;
      m.set(r.user_id, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.activities - a.activities);
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="animate-spin mr-2 h-4 w-4" /> Loading field activity…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="min-w-[160px]">
              <Select value={memberFilter} onValueChange={setMemberFilter}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Member" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All members</SelectItem>
                  {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Activity type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {pickerTypes.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[140px]">
              <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Outcome" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All outcomes</SelectItem>
                  <SelectItem value="productive">Productive</SelectItem>
                  <SelectItem value="unproductive">Unproductive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground ml-auto">
              {format(dateRange.from, 'dd MMM')} – {format(dateRange.to, 'dd MMM yyyy')}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-emerald-200/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" /> Field Productivity
            </div>
            <div className="text-2xl font-bold text-emerald-700 mt-1">{totals.overall.toFixed(1)}%</div>
            <div className="text-[10px] text-muted-foreground">productive / total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5" /> Total activities
            </div>
            <div className="text-2xl font-bold mt-1">{totals.total}</div>
            <div className="text-[10px] text-muted-foreground">{totals.completed} completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Layers className="h-3.5 w-3.5" /> Productive
            </div>
            <div className="text-2xl font-bold text-green-700 mt-1">{totals.productive}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Layers className="h-3.5 w-3.5" /> Unproductive
            </div>
            <div className="text-2xl font-bold text-red-700 mt-1">{totals.unproductive}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Timer className="h-3.5 w-3.5" /> Total time
            </div>
            <div className="text-2xl font-bold mt-1">{fmtMinutes(totals.minutes)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Activity-wise */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Activity-wise breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {typeAggregate.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No activities in this period.</p>
          ) : (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={typeAggregate}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="activity_type" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" name="Activities" fill="#6366f1" />
                    <Bar dataKey="productive" name="Productive" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Activity type</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Completed</TableHead>
                      <TableHead className="text-right">Productive</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {typeAggregate.map(r => (
                      <TableRow key={r.activity_type}>
                        <TableCell className="font-medium">
                          <Badge
                            variant="outline"
                            className="text-[11px]"
                            style={{ borderColor: r.color, color: r.color }}
                          >
                            {r.activity_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{r.count}</TableCell>
                        <TableCell className="text-right">{r.completed}</TableCell>
                        <TableCell className="text-right text-green-700 font-semibold">{r.productive}</TableCell>
                        <TableCell className="text-right">{fmtMinutes(r.minutes)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Monthly */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Monthly summary</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyAggregate.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No data.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyAggregate}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" name="Activities" fill="#0ea5e9" />
                  <Bar dataKey="productive" name="Productive" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* By-rep */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> By rep
          </CardTitle>
        </CardHeader>
        <CardContent>
          {byRep.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No reps in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rep</TableHead>
                    <TableHead className="text-right">Activities</TableHead>
                    <TableHead className="text-right">Productive</TableHead>
                    <TableHead className="text-right">Unproductive</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                    <TableHead className="text-right">Productivity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byRep.map(r => {
                    const pct = r.activities > 0 ? (r.productive / r.activities) * 100 : 0;
                    return (
                      <TableRow key={r.user_id}>
                        <TableCell className="font-medium">{r.user_name}</TableCell>
                        <TableCell className="text-right">{r.activities}</TableCell>
                        <TableCell className="text-right text-green-700">{r.productive}</TableCell>
                        <TableCell className="text-right text-red-700">{r.unproductive}</TableCell>
                        <TableCell className="text-right">{fmtMinutes(r.minutes)}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-700">{pct.toFixed(0)}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FieldActivitySection;
