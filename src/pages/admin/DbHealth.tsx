import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft, RefreshCw, Loader2, Camera, ShieldAlert, Search,
  ArrowDown, ArrowUp, Minus,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Metric {
  key: string;
  label: string;
  value: number | null;
  delta: number | null;
}

interface Overview {
  snapshot_id: string;
  captured_at: string;
  source: string;
  previous_at: string | null;
  db_size_bytes: number | null;
  total_row_estimate: number | null;
  metrics: Metric[];
}

interface TrendRow {
  captured_at: string;
  table_count: number;
  column_count: number;
  rls_policy_count: number;
  function_count: number;
}

interface DriftRow {
  change_type: 'removed' | 'added' | 'modified';
  object_type: string;
  parent_name: string | null;
  object_name: string;
  detail_before: Record<string, unknown> | null;
  detail_after: Record<string, unknown> | null;
}

interface HistoryRow {
  captured_at: string;
  present: boolean;
  detail: Record<string, unknown> | null;
}

const OBJECT_TYPES = [
  'column', 'table', 'policy', 'function', 'trigger',
  'index', 'foreign_key', 'view', 'enum', 'sequence', 'extension', 'cron_job',
];

/** A dropped object is the whole point of this page — surface it hardest. */
const CHANGE_RANK: Record<string, number> = { removed: 0, modified: 1, added: 2 };

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  const units = ['B', 'kB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null || delta === undefined) {
    return <span className="text-xs text-muted-foreground">no prior snapshot</span>;
  }
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> unchanged
      </span>
    );
  }
  const dropped = delta < 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${
        dropped ? 'text-red-600' : 'text-emerald-600'
      }`}
    >
      {dropped ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
      {dropped ? delta : `+${delta}`}
    </span>
  );
}

const DbHealth = () => {
  const navigate = useNavigate();
  const { can, loading: permLoading } = usePermissions();
  const allowed = can('admin_db_health', 'read');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [drift, setDrift] = useState<DriftRow[]>([]);
  const [driftDays, setDriftDays] = useState('7');
  const [trendDays, setTrendDays] = useState('30');

  const [histType, setHistType] = useState('column');
  const [histName, setHistName] = useState('');
  const [histParent, setHistParent] = useState('');
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [histLoading, setHistLoading] = useState(false);

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [ovRes, trRes, drRes] = await Promise.all([
        supabase.rpc('get_db_health_overview' as any),
        supabase.rpc('get_db_health_trend' as any, { p_days: Number(trendDays) }),
        supabase.rpc('get_db_health_drift' as any, { p_days: Number(driftDays) }),
      ]);

      if (ovRes.error) throw ovRes.error;
      if (trRes.error) throw trRes.error;
      if (drRes.error) throw drRes.error;

      setOverview((ovRes.data as unknown as Overview) ?? null);
      setTrend((trRes.data as unknown as TrendRow[]) ?? []);
      setDrift((drRes.data as unknown as DriftRow[]) ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not load DB health data');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [trendDays, driftDays]);

  useEffect(() => {
    if (allowed) loadAll();
    else if (!permLoading) setLoading(false);
  }, [allowed, permLoading, loadAll]);

  const captureNow = async () => {
    setCapturing(true);
    try {
      const { error } = await supabase.rpc('capture_db_health_snapshot' as any, {
        p_source: 'manual',
      });
      // The RPC raises its own permission message — show it verbatim.
      if (error) throw error;
      toast.success('Snapshot captured');
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not capture snapshot');
    } finally {
      setCapturing(false);
    }
  };

  const searchHistory = async () => {
    if (!histName.trim()) {
      toast.error('Enter an object name to search');
      return;
    }
    setHistLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_db_health_object_history' as any, {
        p_object_type: histType,
        p_object_name: histName.trim(),
        p_parent_name: histParent.trim() || null,
        p_days: 90,
      });
      if (error) throw error;
      setHistory((data as unknown as HistoryRow[]) ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? 'Lookup failed');
    } finally {
      setHistLoading(false);
    }
  };

  const sortedDrift = useMemo(
    () =>
      [...drift].sort(
        (a, b) =>
          (CHANGE_RANK[a.change_type] ?? 9) - (CHANGE_RANK[b.change_type] ?? 9) ||
          a.object_type.localeCompare(b.object_type) ||
          a.object_name.localeCompare(b.object_name),
      ),
    [drift],
  );

  const removedCount = useMemo(
    () => drift.filter(d => d.change_type === 'removed').length,
    [drift],
  );

  const chartData = useMemo(
    () =>
      trend.map(t => ({
        date: format(new Date(t.captured_at), 'dd MMM'),
        Tables: t.table_count,
        Columns: t.column_count,
        Policies: t.rls_policy_count,
        Functions: t.function_count,
      })),
    [trend],
  );

  if (permLoading || loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!allowed) {
    return (
      <Layout>
        <div className="w-full p-4">
          <Card className="max-w-lg mx-auto mt-16">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-muted-foreground" />
                Not available
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Your profile does not have permission to view DB Health.
              </p>
              <Button variant="outline" size="sm" onClick={() => navigate('/admin-controls')}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="w-full p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin-controls')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">DB Health</h1>
              <p className="text-sm text-muted-foreground">
                Schema inventory over time — proves whether a table or column existed on a past date
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={loadAll} disabled={refreshing} variant="outline" size="sm">
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={captureNow} disabled={capturing} size="sm">
              {capturing
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Camera className="h-4 w-4 mr-2" />}
              Capture snapshot now
            </Button>
          </div>
        </div>

        {/* Snapshot context */}
        {overview && (
          <Card>
            <CardContent className="py-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Last captured: </span>
                <span className="font-semibold">
                  {format(new Date(overview.captured_at), 'dd MMM yyyy, HH:mm')}
                </span>
                <Badge variant="outline" className="ml-2">{overview.source}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Compared against: </span>
                <span className="font-semibold">
                  {overview.previous_at
                    ? format(new Date(overview.previous_at), 'dd MMM yyyy, HH:mm')
                    : 'no earlier snapshot yet'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Database size: </span>
                <span className="font-semibold">{formatBytes(overview.db_size_bytes)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Rows (est.): </span>
                <span className="font-semibold">
                  {overview.total_row_estimate?.toLocaleString() ?? '—'}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {overview?.metrics?.map(m => (
            <Card key={m.key} className={m.delta !== null && m.delta < 0 ? 'border-red-400' : ''}>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {m.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold tabular-nums">
                  {m.value?.toLocaleString() ?? '—'}
                </div>
                <DeltaBadge delta={m.delta} />
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="changes">
          <TabsList>
            <TabsTrigger value="changes">
              What changed
              {removedCount > 0 && (
                <Badge variant="destructive" className="ml-2">{removedCount} removed</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="trend">Trend</TabsTrigger>
            <TabsTrigger value="history">Object history</TabsTrigger>
          </TabsList>

          {/* Drift */}
          <TabsContent value="changes" className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Compare against</span>
              <Select value={driftDays} onValueChange={setDriftDays}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 day ago</SelectItem>
                  <SelectItem value="7">7 days ago</SelectItem>
                  <SelectItem value="30">30 days ago</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {sortedDrift.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No schema changes detected in this window. If no snapshot that old
                  exists yet, nothing is reported rather than everything.
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Change</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Table / Parent</TableHead>
                        <TableHead>Object</TableHead>
                        <TableHead>Detail</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedDrift.map((d, i) => (
                        <TableRow
                          key={`${d.object_type}-${d.parent_name}-${d.object_name}-${i}`}
                          className={d.change_type === 'removed' ? 'bg-red-50 dark:bg-red-950/30' : ''}
                        >
                          <TableCell>
                            <Badge
                              variant={
                                d.change_type === 'removed' ? 'destructive'
                                  : d.change_type === 'added' ? 'default' : 'secondary'
                              }
                            >
                              {d.change_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{d.object_type}</TableCell>
                          <TableCell className="text-sm">{d.parent_name ?? '—'}</TableCell>
                          <TableCell className="text-sm font-mono">{d.object_name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                            {d.change_type === 'modified'
                              ? `${JSON.stringify(d.detail_before)} → ${JSON.stringify(d.detail_after)}`
                              : JSON.stringify(d.detail_before ?? d.detail_after)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Trend */}
          <TabsContent value="trend" className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Window</span>
              <Select value={trendDays} onValueChange={setTrendDays}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Card>
              <CardContent className="pt-6">
                {chartData.length < 2 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Needs at least two snapshots to draw a trend. A snapshot is taken
                    automatically each night.
                  </p>
                ) : (
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="Tables" stroke="#2563eb" dot={false} />
                        <Line type="monotone" dataKey="Columns" stroke="#7c3aed" dot={false} />
                        <Line type="monotone" dataKey="Policies" stroke="#059669" dot={false} />
                        <Line type="monotone" dataKey="Functions" stroke="#ea580c" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Object history */}
          <TabsContent value="history" className="space-y-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Was this object there before?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Object type</label>
                    <Select value={histType} onValueChange={setHistType}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OBJECT_TYPES.map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      Table (for a column)
                    </label>
                    <Input
                      value={histParent}
                      onChange={e => setHistParent(e.target.value)}
                      placeholder="products"
                      className="w-48"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Object name</label>
                    <Input
                      value={histName}
                      onChange={e => setHistName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') searchHistory(); }}
                      placeholder="rate"
                      className="w-48"
                    />
                  </div>
                  <Button onClick={searchHistory} disabled={histLoading} size="sm">
                    {histLoading
                      ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <Search className="h-4 w-4 mr-2" />}
                    Search
                  </Button>
                </div>

                {history !== null && (
                  history.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No snapshots in the last 90 days.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Snapshot</TableHead>
                            <TableHead>Present</TableHead>
                            <TableHead>Detail</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {history.map((h, i) => (
                            <TableRow key={i} className={!h.present ? 'bg-red-50 dark:bg-red-950/30' : ''}>
                              <TableCell className="text-sm">
                                {format(new Date(h.captured_at), 'dd MMM yyyy, HH:mm')}
                              </TableCell>
                              <TableCell>
                                <Badge variant={h.present ? 'default' : 'destructive'}>
                                  {h.present ? 'present' : 'missing'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {h.detail ? JSON.stringify(h.detail) : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default DbHealth;
