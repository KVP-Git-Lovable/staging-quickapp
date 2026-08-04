import React, { useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, PlayCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { useZohoSync } from '@/hooks/useZohoSync';
import { ZohoSyncLogViewer } from '@/components/zoho/ZohoSyncLogViewer';
import { ZohoFixDataTab } from '@/components/zoho/ZohoFixDataTab';

const statusBadge = (status: string | null) => {
  switch (status) {
    case 'synced':
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">synced</Badge>;
    case 'failed':
      return <Badge variant="destructive">failed</Badge>;
    case 'skipped':
      return <Badge variant="secondary">skipped</Badge>;
    default:
      return <Badge variant="outline">not synced</Badge>;
  }
};

const ZohoBooksSync: React.FC = () => {
  const { can, loading: permLoading } = usePermissions();
  const { hasAdminAccess, loading: adminLoading } = useAdminAccess();
  const { rows, logs, errors, syncedAt, loading, running, summary, reload, dryRun, syncNow, updateRetailer } =
    useZohoSync();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<any | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const allowed = can('zoho_sync', 'can_edit') || can('zoho_sync', 'edit') || hasAdminAccess;

  const nameById = useMemo(() => {
    const map: Record<string, string> = {};
    rows.forEach((r) => {
      map[r.id] = r.name ?? r.id;
    });
    return map;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const status = r.zoho_sync_status ?? 'not_synced';
      if (statusFilter === 'ready' && r.is_ready !== true) return false;
      if (statusFilter === 'blocked' && r.is_ready !== false) return false;
      if (['synced', 'failed', 'skipped'].includes(statusFilter) && status !== statusFilter) return false;
      if (q && !(r.name ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  if (permLoading || adminLoading) {
    return (
      <Layout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (!allowed) {
    return (
      <Layout>
        <Card className="mx-auto mt-10 max-w-md">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You do not have permission to manage Zoho Books sync.
          </CardContent>
        </Card>
      </Layout>
    );
  }

  const handleDryRun = async (ids?: string[]) => {
    try {
      const result = await dryRun(ids);
      setDryRunResult(result);
      toast({
        title: 'Validation complete',
        description: `${result?.processed ?? 0} retailer(s) validated. No data was sent to Zoho.`,
      });
    } catch (e) {
      toast({
        title: 'Validation failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleSync = async (ids?: string[]) => {
    try {
      const result = await syncNow(ids);
      const c = result?.counts ?? {};
      toast({
        title: 'Sync finished',
        description: `Created ${c.synced ?? 0}, updated ${c.updated ?? 0}, skipped ${c.skipped ?? 0}, failed ${c.failed ?? 0}.`,
      });
    } catch (e) {
      toast({
        title: 'Sync failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const cards = [
    { label: 'Total retailers', value: summary.total },
    { label: 'Ready to sync', value: summary.ready },
    { label: 'Skipped', value: summary.skipped },
    { label: 'Synced', value: summary.synced },
    { label: 'Failed', value: summary.failed },
  ];

  return (
    <Layout>
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Zoho Books Sync</h1>
            <p className="text-sm text-muted-foreground">
              Push retailers to Zoho Books as customer contacts. Manual runs only — nothing is synced automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={reload} disabled={loading || running}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button variant="secondary" onClick={() => handleDryRun()} disabled={running}>
              <ShieldCheck className="mr-2 h-4 w-4" /> Validate only (dry run)
            </Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={running || summary.ready === 0}>
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
              Sync now
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {cards.map((c) => (
            <Card key={c.label}>
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-2xl font-semibold">{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Blockers</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.keys(summary.blockers).length === 0 ? (
              <p className="text-sm text-muted-foreground">No blockers — all retailers are ready.</p>
            ) : (
              Object.entries(summary.blockers)
                .sort((a, b) => b[1] - a[1])
                .map(([blocker, count]) => (
                  <Badge key={blocker} variant="secondary" className="text-sm">
                    {blocker}: {count}
                  </Badge>
                ))
            )}
          </CardContent>
        </Card>

        {dryRunResult && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Dry run result (nothing was sent)</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setDryRunResult(null)}>
                Dismiss
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(dryRunResult, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="retailers">
          <TabsList>
            <TabsTrigger value="retailers">Retailers</TabsTrigger>
            <TabsTrigger value="fix">Fix data ({summary.total - summary.ready})</TabsTrigger>
            <TabsTrigger value="log">Sync log</TabsTrigger>
          </TabsList>

          <TabsContent value="retailers" className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Search by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="ready">Ready to sync</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="synced">Synced</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Retailer</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>GST</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last synced</TableHead>
                        <TableHead>Error / blocker</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="py-10 text-center">
                            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ) : filtered.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                            No retailers match this filter.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filtered.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.name ?? '—'}</TableCell>
                            <TableCell>{r.state ?? <span className="text-destructive">missing</span>}</TableCell>
                            <TableCell className="font-mono text-xs">{r.gst_number ?? '—'}</TableCell>
                            <TableCell>{r.currency_code ?? r.currency ?? 'INR'}</TableCell>
                            <TableCell>{statusBadge(r.zoho_sync_status)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {syncedAt[r.id] ? new Date(syncedAt[r.id]!).toLocaleString() : '—'}
                            </TableCell>
                            <TableCell className="max-w-[280px] text-xs text-destructive">
                              {errors[r.id] ?? (r.is_ready === false ? r.blocker : '')}
                            </TableCell>
                            <TableCell className="text-right">
                              {r.zoho_sync_status === 'failed' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={running}
                                  onClick={async () => {
                                    setRetryingId(r.id);
                                    await handleSync([r.id]);
                                    setRetryingId(null);
                                  }}
                                >
                                  {retryingId === r.id ? 'Retrying…' : 'Retry'}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fix" className="mt-4">
            <ZohoFixDataTab rows={rows} onSave={updateRetailer} />
          </TabsContent>

          <TabsContent value="log" className="mt-4">
            <ZohoSyncLogViewer logs={logs} nameById={nameById} />
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send retailers to Zoho Books?</AlertDialogTitle>
            <AlertDialogDescription>
              {summary.ready} retailer(s) will be sent to Zoho Books. {summary.total - summary.ready} will be skipped
              because of data blockers. Existing contacts are updated, not duplicated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleSync()}>Sync now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
};

export default ZohoBooksSync;
