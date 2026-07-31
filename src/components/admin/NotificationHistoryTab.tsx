import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, History, RefreshCw } from 'lucide-react';
import {
  NotificationDateFilter,
  isWithinRange,
  type RangePreset,
  type CustomRange,
} from '@/components/notifications/NotificationDateFilter';
import { NotificationPagination } from '@/components/notifications/NotificationPagination';

const PAGE_SIZE = 100;

interface NotificationRow {
  id: string;
  user_id: string | null;
  title: string;
  message: string;
  type: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  delivery_status: string | null;
  deleted_at: string | null;
  metadata: Record<string, any> | null;
}

/**
 * How a notification was fired.
 * `notify_send_test` (the ⚡ "Run now" action on a notification rule) stamps
 * metadata.is_test = true; everything else came from a real event trigger.
 */
type FiredBy = 'manual' | 'auto';
const firedByOf = (n: { metadata: Record<string, any> | null }): FiredBy =>
  n.metadata?.is_test === true || n.metadata?.is_test === 'true' ? 'manual' : 'auto';

export const NotificationHistoryTab: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'read' | 'unread'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'auto' | 'manual'>('all');
  const [preset, setPreset] = useState<RangePreset>('all');
  const [custom, setCustom] = useState<CustomRange>({ from: '', to: '' });
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-notification-history'],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('notifications')
        .select('id, user_id, title, message, type, is_read, read_at, created_at, delivery_status, deleted_at, metadata')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;

      const notifications = (rows || []) as unknown as NotificationRow[];
      const userIds = Array.from(new Set(notifications.map(n => n.user_id).filter(Boolean))) as string[];

      let nameById = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        nameById = new Map((profiles || []).map((p: any) => [p.id, p.full_name as string]));
      }

      return notifications.map(n => ({
        ...n,
        recipient: (n.user_id && nameById.get(n.user_id)) || (n.user_id ? 'Unknown user' : '—'),
        firedBy: firedByOf(n),
        testBatchId: (n.metadata?.test_batch_id as string) || null,
      }));
    },
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data || []).filter(n => {
      const matchesStatus =
        statusFilter === 'all' || (statusFilter === 'read' ? n.is_read : !n.is_read);
      const matchesSource = sourceFilter === 'all' || n.firedBy === sourceFilter;
      const matchesQuery =
        !q ||
        n.title?.toLowerCase().includes(q) ||
        n.message?.toLowerCase().includes(q) ||
        n.recipient?.toLowerCase().includes(q);
      return matchesStatus && matchesSource && matchesQuery && isWithinRange(n.created_at, preset, custom);
    });
  }, [data, search, statusFilter, sourceFilter, preset, custom]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pagedRows = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page]
  );

  useEffect(() => { setPage(1); }, [search, statusFilter, sourceFilter, preset, custom.from, custom.to]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  const readCount = (data || []).filter(n => n.is_read).length;
  const manualCount = (data || []).filter(n => n.firedBy === 'manual').length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="flex items-center gap-2 text-base">
          <History size={16} /> Notification History
          <span className="text-xs font-normal text-muted-foreground">
            {(data || []).length} sent · {readCount} read · {manualCount} manual
          </span>
          <span className="text-[11px] font-normal text-muted-foreground/80 basis-full">
            Org-wide totals across all recipients — you can only mark your own notifications as read.
          </span>
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, message or recipient"
              className="pl-8 w-64"
            />
          </div>
          {(['all', 'read', 'unread'] as const).map(s => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? 'default' : 'outline'}
              onClick={() => setStatusFilter(s)}
              className="capitalize"
            >
              {s}
            </Button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {([
            { key: 'all', label: 'All sources' },
            { key: 'auto', label: 'Auto' },
            { key: 'manual', label: 'Manual' },
          ] as const).map(s => (
            <Button
              key={s.key}
              size="sm"
              variant={sourceFilter === s.key ? 'default' : 'outline'}
              onClick={() => setSourceFilter(s.key)}
            >
              {s.label}
            </Button>
          ))}
          <Button size="sm" variant="outline" className="gap-1" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>
        <NotificationDateFilter
          preset={preset}
          onPresetChange={setPreset}
          custom={custom}
          onCustomChange={setCustom}
        />
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No notifications found</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Sent at</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Fired by</TableHead>
                <TableHead>Seen</TableHead>
                <TableHead>Read at</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.map(n => (
                <TableRow key={n.id}>
                  <TableCell className="font-medium max-w-[220px] truncate">{n.title}</TableCell>
                  <TableCell className="max-w-[280px] truncate text-muted-foreground text-xs">{n.message}</TableCell>
                  <TableCell className="text-sm">{n.recipient}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {format(new Date(n.created_at), 'dd MMM yyyy, HH:mm')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">{n.delivery_status || 'delivered'}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        n.firedBy === 'manual'
                          ? 'border-amber-500/60 text-amber-600 dark:text-amber-400'
                          : 'text-muted-foreground'
                      }
                      title={
                        n.firedBy === 'manual'
                          ? `Fired manually from a notification rule${n.testBatchId ? ` · batch ${n.testBatchId.slice(0, 8)}` : ''}`
                          : 'Fired automatically by an event trigger'
                      }
                    >
                      {n.firedBy === 'manual' ? 'Manual' : 'Auto'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={n.is_read ? 'default' : 'outline'}>
                      {n.is_read ? 'Read' : 'Unread'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {n.read_at ? format(new Date(n.read_at), 'dd MMM yyyy, HH:mm') : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <NotificationPagination
          page={page}
          pageCount={pageCount}
          total={rows.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </CardContent>
    </Card>
  );
};
