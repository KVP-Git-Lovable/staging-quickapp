import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, CartesianGrid,
} from 'recharts';
import { Loader2, Activity, TrendingUp, Timer, Layers } from 'lucide-react';

interface Props {
  userIds: string[];
  dateRange: { from: Date; to: Date };
  isScopeReady?: boolean;
}

interface DailyRow {
  user_id: string;
  date: string;
  total_activities: number;
  completed_activities: number;
  total_activity_minutes: number;
  completed_activity_minutes: number;
  activity_points: number;
}
interface TypeRow {
  user_id: string;
  date: string;
  activity_type: string | null;
  weight: number;
  is_sales_activity: boolean | null;
  activities: number;
  completed: number;
  minutes: number;
  points: number;
}
interface FieldRow {
  user_id: string;
  date: string;
  productive_sales_visits: number;
  total_sales_visits: number;
  total_activity_visits: number;
  completed_activities: number;
  activity_minutes: number;
  activity_points: number;
  overall_field_productivity: number;
}

const fmtMinutes = (m: number) => {
  if (!m) return '0m';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}h ${r}m` : `${r}m`;
};

export const FieldActivitySection = ({ userIds, dateRange, isScopeReady = true }: Props) => {
  const [loading, setLoading] = useState(false);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [byType, setByType] = useState<TypeRow[]>([]);
  const [field, setField] = useState<FieldRow[]>([]);

  const fromStr = format(dateRange.from, 'yyyy-MM-dd');
  const toStr = format(dateRange.to, 'yyyy-MM-dd');
  const scopeKey = userIds.join(',');

  useEffect(() => {
    if (!isScopeReady || userIds.length === 0) {
      setDaily([]); setByType([]); setField([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const client = supabase as any;
        const [d, t, f] = await Promise.all([
          client.from('activity_daily_summary')
            .select('user_id,date,total_activities,completed_activities,total_activity_minutes,completed_activity_minutes,activity_points')
            .in('user_id', userIds).gte('date', fromStr).lte('date', toStr),
          client.from('activity_type_productivity')
            .select('user_id,date,activity_type,weight,is_sales_activity,activities,completed,minutes,points')
            .in('user_id', userIds).gte('date', fromStr).lte('date', toStr),
          client.from('field_productivity_daily')
            .select('user_id,date,productive_sales_visits,total_sales_visits,total_activity_visits,completed_activities,activity_minutes,activity_points,overall_field_productivity')
            .in('user_id', userIds).gte('date', fromStr).lte('date', toStr),
        ]);
        if (cancelled) return;
        setDaily((d.data as DailyRow[]) || []);
        setByType((t.data as TypeRow[]) || []);
        setField((f.data as FieldRow[]) || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [scopeKey, fromStr, toStr, isScopeReady]);

  const totals = useMemo(() => {
    const t = {
      productiveSales: 0, totalSales: 0,
      totalActivities: 0, completedActivities: 0,
      activityMinutes: 0, activityPoints: 0,
      overall: 0,
    };
    field.forEach(r => {
      t.productiveSales += Number(r.productive_sales_visits) || 0;
      t.totalSales += Number(r.total_sales_visits) || 0;
      t.totalActivities += Number(r.total_activity_visits) || 0;
      t.completedActivities += Number(r.completed_activities) || 0;
      t.activityMinutes += Number(r.activity_minutes) || 0;
      t.activityPoints += Number(r.activity_points) || 0;
      t.overall += Number(r.overall_field_productivity) || 0;
    });
    return t;
  }, [field]);

  const typeAggregate = useMemo(() => {
    const m = new Map<string, { activity_type: string; weight: number; activities: number; completed: number; minutes: number; points: number; }>();
    byType.forEach(r => {
      const key = r.activity_type || 'Other';
      const cur = m.get(key) || { activity_type: key, weight: r.weight ?? 1, activities: 0, completed: 0, minutes: 0, points: 0 };
      cur.weight = r.weight ?? cur.weight;
      cur.activities += Number(r.activities) || 0;
      cur.completed += Number(r.completed) || 0;
      cur.minutes += Number(r.minutes) || 0;
      cur.points += Number(r.points) || 0;
      m.set(key, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.points - a.points);
  }, [byType]);

  const monthlyAggregate = useMemo(() => {
    const m = new Map<string, { month: string; activities: number; completed: number; minutes: number; points: number; }>();
    daily.forEach(r => {
      const mo = r.date.slice(0, 7); // YYYY-MM
      const cur = m.get(mo) || { month: mo, activities: 0, completed: 0, minutes: 0, points: 0 };
      cur.activities += Number(r.total_activities) || 0;
      cur.completed += Number(r.completed_activities) || 0;
      cur.minutes += Number(r.completed_activity_minutes) || 0;
      cur.points += Number(r.activity_points) || 0;
      m.set(mo, cur);
    });
    return Array.from(m.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [daily]);

  const comparison = [
    { name: 'Visits', Sales: totals.productiveSales, Activities: totals.completedActivities },
    { name: 'Productivity', Sales: totals.productiveSales, Activities: totals.activityPoints },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="animate-spin mr-2 h-4 w-4" /> Loading field activity…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Headline */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-emerald-200/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" /> Overall Field Productivity
            </div>
            <div className="text-2xl font-bold text-emerald-700 mt-1">{totals.overall.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground">productive sales + Σ activity points</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5" /> Sales Visits
            </div>
            <div className="text-2xl font-bold mt-1">{totals.totalSales}</div>
            <div className="text-[10px] text-muted-foreground">
              {totals.productiveSales} productive
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Layers className="h-3.5 w-3.5" /> Activity Visits
            </div>
            <div className="text-2xl font-bold mt-1">{totals.totalActivities}</div>
            <div className="text-[10px] text-muted-foreground">
              {totals.completedActivities} completed · {totals.activityPoints.toFixed(2)} pts
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Timer className="h-3.5 w-3.5" /> Time on Activities
            </div>
            <div className="text-2xl font-bold mt-1">{fmtMinutes(totals.activityMinutes)}</div>
            <div className="text-[10px] text-muted-foreground">Sales time: n/a</div>
          </CardContent>
        </Card>
      </div>

      {/* Sales vs Activity comparison */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sales vs Activity comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparison}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Sales" fill="#10b981" />
                <Bar dataKey="Activities" fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Activity-wise productivity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Activity-wise productivity</CardTitle>
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
                    <Bar dataKey="completed" name="Completed" fill="#8b5cf6" />
                    <Bar dataKey="points" name="Points (Σ weight)" fill="#ec4899" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Activity type</TableHead>
                      <TableHead className="text-right">Weight</TableHead>
                      <TableHead className="text-right">Activities</TableHead>
                      <TableHead className="text-right">Completed</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                      <TableHead className="text-right">Points</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {typeAggregate.map(r => (
                      <TableRow key={r.activity_type}>
                        <TableCell className="font-medium">{r.activity_type}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className="text-[10px]">{Number(r.weight).toFixed(2)}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{r.activities}</TableCell>
                        <TableCell className="text-right">{r.completed}</TableCell>
                        <TableCell className="text-right">{fmtMinutes(r.minutes)}</TableCell>
                        <TableCell className="text-right font-semibold text-indigo-700">{Number(r.points).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Monthly summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Monthly activity summary</CardTitle>
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
                  <Bar dataKey="completed" name="Completed activities" fill="#0ea5e9" />
                  <Bar dataKey="points" name="Activity points" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FieldActivitySection;
