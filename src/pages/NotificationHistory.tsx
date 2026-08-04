import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import { ArrowLeft, Bell, Download, Eye, History, Loader2, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Layout } from '@/components/Layout';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNotificationHistory } from '@/hooks/useNotifications';
import {
  NotificationDateFilter,
  isWithinRange,
  type RangePreset,
  type CustomRange,
} from '@/components/notifications/NotificationDateFilter';
import { NotificationPagination } from '@/components/notifications/NotificationPagination';
import { ReportNotificationDialog } from '@/components/notifications/ReportNotificationDialog';
import { downloadReportFile, getReportMeta } from '@/lib/reportFile';

const PAGE_SIZE = 100;

export default function NotificationHistory() {
  const navigate = useNavigate();
  const { history, isLoading, remove, clearAll } = useNotificationHistory();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [preset, setPreset] = useState<RangePreset>('all');
  const [custom, setCustom] = useState<CustomRange>({ from: '', to: '' });
  const [page, setPage] = useState(1);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [openReport, setOpenReport] = useState<any | null>(null);

  const handleDownload = async (n: any) => {
    setDownloadingId(n.id);
    try {
      await downloadReportFile(n);
    } catch (e) {
      console.error(e);
      toast.error("Couldn't download the report — please try again.");
    } finally {
      setDownloadingId(null);
    }
  };

  const types = useMemo(
    () => Array.from(new Set(history.map(n => n.type).filter(Boolean))) as string[],
    [history]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return history.filter(n => {
      const matchesType = typeFilter === 'all' || n.type === typeFilter;
      const matchesQuery =
        !q ||
        n.title?.toLowerCase().includes(q) ||
        n.message?.toLowerCase().includes(q);
      return matchesType && matchesQuery && isWithinRange(n.created_at, preset, custom);
    });
  }, [history, search, typeFilter, preset, custom]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  useEffect(() => { setPage(1); }, [search, typeFilter, preset, custom.from, custom.to]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-subtle p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft size={18} />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold flex items-center gap-2">
                <History size={18} /> Notification History
              </h1>
              <p className="text-xs text-muted-foreground">
                {history.length} notification{history.length === 1 ? '' : 's'} you have already read
              </p>
            </div>
            {history.length > 0 && (
              <Button variant="outline" size="sm" className="gap-1" onClick={clearAll}>
                <Trash2 className="h-3.5 w-3.5" /> Clear all
              </Button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notifications..."
                className="pl-8"
              />
            </div>
            {types.length > 0 && (
              <div className="flex gap-1 overflow-x-auto">
                <Button
                  variant={typeFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTypeFilter('all')}
                >
                  All
                </Button>
                {types.map(t => (
                  <Button
                    key={t}
                    variant={typeFilter === t ? 'default' : 'outline'}
                    size="sm"
                    className="whitespace-nowrap"
                    onClick={() => setTypeFilter(t)}
                  >
                    {t.replace(/_/g, ' ')}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <NotificationDateFilter
            preset={preset}
            onPresetChange={setPreset}
            custom={custom}
            onCustomChange={setCustom}
          />

          {isLoading ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Loading...</p>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Bell className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">No notifications in history</p>
            </div>
          ) : (
            <div className="space-y-2">
              {paged.map(n => {
                const report = getReportMeta(n);
                const showReportActions = n.type === 'report_delivery' && report.hasFile;
                return (
                <Card key={n.id} className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{n.title}</p>
                        {n.type && (
                          <Badge variant="secondary" className="text-[10px]">
                            {n.type.replace(/_/g, ' ')}
                          </Badge>
                        )}
                      </div>
                      {n.message && (
                        <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Received {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        {n.read_at && ` · Read on ${format(new Date(n.read_at), 'dd MMM yyyy, HH:mm')}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {showReportActions && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            aria-label={`View ${n.title ?? 'report'}`}
                            title="View report"
                            onClick={() => setOpenReport(n)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            aria-label={`Download ${n.title ?? 'report'}`}
                            title="Download report"
                            disabled={downloadingId === n.id}
                            onClick={() => handleDownload(n)}
                          >
                            {downloadingId === n.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Download className="h-3.5 w-3.5" />}
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                        aria-label="Delete notification"
                        onClick={() => remove(n.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
                );
              })}
              <NotificationPagination
                page={page}
                pageCount={pageCount}
                total={filtered.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      </div>
      <ReportNotificationDialog
        notification={openReport}
        onClose={() => setOpenReport(null)}
      />
    </Layout>
  );
}
