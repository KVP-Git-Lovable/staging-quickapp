import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, RefreshCw, Loader2, Play, CheckCircle2, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface FailedRow {
  id: string;
  idempotency_key: string;
  payload: any;
  error: string | null;
  retry_count: number;
  device_id: string | null;
  user_id: string | null;
  last_failed_at: string;
  first_failed_at: string;
  user_name?: string;
}

interface HealthRow {
  check_name: string;
  anomaly_count: number;
  checked_at: string;
  sample_ids: string[] | null;
}

interface SecurityEvent {
  id: string;
  event_type: string;
  table_name: string | null;
  policy_name: string | null;
  session_user_name: string | null;
  event_time: string;
}

const SyncHealth = () => {
  const navigate = useNavigate();
  const { hasAdminAccess, loading: adminLoading } = useAdminAccess();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runningHealth, setRunningHealth] = useState(false);

  const [syncedToday, setSyncedToday] = useState(0);
  const [failed, setFailed] = useState<FailedRow[]>([]);
  const [health, setHealth] = useState<HealthRow[]>([]);
  const [security, setSecurity] = useState<SecurityEvent[]>([]);
  const [viewRow, setViewRow] = useState<FailedRow | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [okRes, failRes, healthRes, secRes] = await Promise.all([
        supabase
          .from('sync_audit_log')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'ok')
          .gte('created_at', todayStart.toISOString()),
        supabase
          .from('failed_sync_log')
          .select('*')
          .is('resolved_at', null)
          .order('last_failed_at', { ascending: false })
          .limit(500),
        supabase
          .from('data_health_log')
          .select('check_name, anomaly_count, checked_at, sample_ids')
          .order('checked_at', { ascending: false })
          .limit(500),
        supabase
          .from('securityaudit_events')
          .select('id, event_type, table_name, policy_name, session_user_name, event_time')
          .order('event_time', { ascending: false })
          .limit(50),
      ]);

      setSyncedToday(okRes.count ?? 0);

      const failedRows = (failRes.data ?? []) as FailedRow[];
      const userIds = Array.from(new Set(failedRows.map(r => r.user_id).filter(Boolean))) as string[];
      if (userIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', userIds);
        const nameMap = new Map((profs ?? []).map((p: any) => [p.user_id, p.full_name]));
        failedRows.forEach(r => { r.user_name = nameMap.get(r.user_id!) ?? undefined; });
      }
      setFailed(failedRows);

      // latest per check_name
      const latest = new Map<string, HealthRow>();
      ((healthRes.data ?? []) as HealthRow[]).forEach(r => {
        if (!latest.has(r.check_name)) latest.set(r.check_name, r);
      });
      setHealth(Array.from(latest.values()));

      setSecurity((secRes.data ?? []) as SecurityEvent[]);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load sync health');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasAdminAccess) loadAll();
  }, [hasAdminAccess, loadAll]);

  const retryRow = async (row: FailedRow) => {
    setActingId(row.id);
    try {
      const payload = row.payload || {};
      const order = payload.order ?? payload.p_order;
      const items = payload.items ?? payload.p_items;
      if (!order || !items) {
        toast.error('Row payload missing order/items; cannot retry');
        return;
      }
      const { data, error } = await supabase.rpc('sync_order_with_items' as any, {
        p_order: order,
        p_items: items,
      });
      if (error) throw error;
      const status = (data as any)?.status;
      if (status === 'ok' || status === 'duplicate') {
        await supabase
          .from('failed_sync_log')
          .update({ resolved_at: new Date().toISOString(), resolved_by: user?.id })
          .eq('id', row.id);
        toast.success(`Retry ${status}`);
        loadAll();
      } else {
        toast.error(`Retry returned status: ${status ?? 'unknown'}`);
      }
    } catch (e: any) {
      toast.error(e.message ?? 'Retry failed');
    } finally {
      setActingId(null);
    }
  };

  const markResolved = async (row: FailedRow) => {
    if (!window.confirm('Mark this failed sync as resolved without retrying?')) return;
    setActingId(row.id);
    try {
      const { error } = await supabase
        .from('failed_sync_log')
        .update({ resolved_at: new Date().toISOString(), resolved_by: user?.id })
        .eq('id', row.id);
      if (error) throw error;
      toast.success('Marked resolved');
      loadAll();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    } finally {
      setActingId(null);
    }
  };

  const runHealth = async () => {
    setRunningHealth(true);
    try {
      const { error } = await supabase.rpc('run_data_health_checks' as any);
      if (error) throw error;
      toast.success('Health checks run');
      loadAll();
    } catch (e: any) {
      toast.error(e.message ?? 'Health check failed');
    } finally {
      setRunningHealth(false);
    }
  };

  const summary = useMemo(() => {
    const retrying = failed.filter(f => f.retry_count >= 1 && f.retry_count <= 4).length;
    const stuck = failed.filter(f => f.retry_count >= 5).length;
    return { failed: failed.length, retrying, stuck };
  }, [failed]);

  const byDevice = useMemo(() => {
    const m = new Map<string, number>();
    failed.forEach(f => m.set(f.device_id ?? '(unknown)', (m.get(f.device_id ?? '(unknown)') ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [failed]);

  const byUser = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>();
    failed.forEach(f => {
      const key = f.user_id ?? '(unknown)';
      const cur = m.get(key) ?? { name: f.user_name ?? key, count: 0 };
      cur.count += 1;
      m.set(key, cur);
    });
    return Array.from(m.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [failed]);

  if (adminLoading || loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }
  if (!hasAdminAccess) return <Navigate to="/dashboard" replace />;

  return (
    <Layout>
      <div className="w-full p-4 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin-controls')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Sync Health</h1>
              <p className="text-sm text-muted-foreground">Monitor sync integrity, retry failures, and audit RLS changes</p>
            </div>
          </div>
          <Button onClick={loadAll} disabled={refreshing} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Synced today</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold text-emerald-600">{syncedToday}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Failed (unresolved)</CardTitle></CardHeader>
            <CardContent><div className={`text-3xl font-bold ${summary.failed > 0 ? 'text-red-600' : ''}`}>{summary.failed}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Retrying</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold text-amber-600">{summary.retrying}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Stuck (≥5 retries)</CardTitle></CardHeader>
            <CardContent><div className={`text-3xl font-bold ${summary.stuck > 0 ? 'text-red-600' : ''}`}>{summary.stuck}</div></CardContent></Card>
        </div>

        <Tabs defaultValue="failed" className="space-y-4">
          <TabsList>
            <TabsTrigger value="failed">Failed Syncs ({failed.length})</TabsTrigger>
            <TabsTrigger value="groups">By Device / User</TabsTrigger>
            <TabsTrigger value="health">Data Integrity</TabsTrigger>
            <TabsTrigger value="security">Security Events</TabsTrigger>
          </TabsList>

          <TabsContent value="failed">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Idempotency Key</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Device</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead>Retries</TableHead>
                        <TableHead>Last Failed</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {failed.length === 0 && (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No unresolved failures 🎉</TableCell></TableRow>
                      )}
                      {failed.map(row => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-xs max-w-[180px] truncate" title={row.idempotency_key}>{row.idempotency_key}</TableCell>
                          <TableCell>{row.user_name ?? row.user_id?.slice(0, 8) ?? '—'}</TableCell>
                          <TableCell className="font-mono text-xs">{row.device_id ?? '—'}</TableCell>
                          <TableCell className="max-w-[260px] truncate text-xs text-red-600" title={row.error ?? ''}>{row.error ?? '—'}</TableCell>
                          <TableCell>
                            <Badge variant={row.retry_count >= 5 ? 'destructive' : row.retry_count >= 1 ? 'default' : 'secondary'}>
                              {row.retry_count}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{format(new Date(row.last_failed_at), 'MMM d, HH:mm')}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => setViewRow(row)}><Eye className="h-4 w-4" /></Button>
                              <Button size="sm" variant="outline" disabled={actingId === row.id} onClick={() => retryRow(row)}>
                                {actingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                              </Button>
                              <Button size="sm" variant="outline" disabled={actingId === row.id} onClick={() => markResolved(row)}>
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="groups">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Failures by Device</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>Device</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {byDevice.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-4">None</TableCell></TableRow>}
                      {byDevice.map(([d, c]) => (
                        <TableRow key={d}><TableCell className="font-mono text-xs">{d}</TableCell><TableCell className="text-right"><Badge variant={c >= 5 ? 'destructive' : 'secondary'}>{c}</Badge></TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Failures by User</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>User</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {byUser.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-4">None</TableCell></TableRow>}
                      {byUser.map(([id, v]) => (
                        <TableRow key={id}><TableCell>{v.name}</TableCell><TableCell className="text-right"><Badge variant={v.count >= 5 ? 'destructive' : 'secondary'}>{v.count}</Badge></TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="health">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Latest Data Integrity Checks</CardTitle>
                <Button size="sm" onClick={runHealth} disabled={runningHealth}>
                  {runningHealth ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                  Run now
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Check</TableHead><TableHead>Anomalies</TableHead><TableHead>Checked At</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {health.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">No checks recorded</TableCell></TableRow>}
                    {health.map(h => (
                      <TableRow key={h.check_name}>
                        <TableCell className="font-medium">{h.check_name}</TableCell>
                        <TableCell>
                          <Badge variant={h.anomaly_count > 0 ? 'destructive' : 'secondary'}>{h.anomaly_count}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{format(new Date(h.checked_at), 'MMM d, HH:mm')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader><CardTitle className="text-base">Recent Security Events</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Event</TableHead><TableHead>Table</TableHead><TableHead>Policy</TableHead><TableHead>User</TableHead><TableHead>Time</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {security.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">No events</TableCell></TableRow>}
                    {security.map(e => (
                      <TableRow key={e.id}>
                        <TableCell><Badge variant={e.event_type.includes('DROP') || e.event_type.includes('MISSING') ? 'destructive' : 'secondary'}>{e.event_type}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{e.table_name ?? '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{e.policy_name ?? '—'}</TableCell>
                        <TableCell className="text-xs">{e.session_user_name ?? '—'}</TableCell>
                        <TableCell className="text-xs">{format(new Date(e.event_time), 'MMM d, HH:mm')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={!!viewRow} onOpenChange={o => !o && setViewRow(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
            <DialogHeader><DialogTitle>Failed Sync Details</DialogTitle></DialogHeader>
            {viewRow && (
              <div className="space-y-3 text-sm">
                <div><span className="font-medium">Idempotency Key: </span><span className="font-mono text-xs">{viewRow.idempotency_key}</span></div>
                <div><span className="font-medium">Error: </span><span className="text-red-600">{viewRow.error ?? '—'}</span></div>
                <div><span className="font-medium">Retries: </span>{viewRow.retry_count}</div>
                <div><span className="font-medium">First failed: </span>{format(new Date(viewRow.first_failed_at), 'PPpp')}</div>
                <div><span className="font-medium">Last failed: </span>{format(new Date(viewRow.last_failed_at), 'PPpp')}</div>
                <div>
                  <div className="font-medium mb-1">Payload</div>
                  <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-96">{JSON.stringify(viewRow.payload, null, 2)}</pre>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default SyncHealth;
