import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, History, RefreshCw } from 'lucide-react';

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
}

export const NotificationHistoryTab: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'read' | 'unread'>('all');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-notification-history'],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('notifications')
        .select('id, user_id, title, message, type, is_read, read_at, created_at, delivery_status, deleted_at')
        .order('created_at', { ascending: false })
        .limit(500);
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
      }));
    },
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data || []).filter(n => {
      const matchesStatus =
        statusFilter === 'all' || (statusFilter === 'read' ? n.is_read : !n.is_read);
      const matchesQuery =
        !q ||
        n.title?.toLowerCase().includes(q) ||
        n.message?.toLowerCase().includes(q) ||
        n.recipient?.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [data, search, statusFilter]);

  const readCount = (data || []).filter(n => n.is_read).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="flex items-center gap-2 text-base">
          <History size={16} /> Notification History
          <span className="text-xs font-normal text-muted-foreground">
            {(data || []).length} sent · {readCount} read
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
          <Button size="sm" variant="outline" className="gap-1" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>
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
                <TableHead>Seen</TableHead>
                <TableHead>Read at</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(n => (
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
      </CardContent>
    </Card>
  );
};
