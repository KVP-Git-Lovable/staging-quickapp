import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Search, History, RefreshCw, Download, ArrowUp, ArrowDown, ChevronsUpDown,
  ListFilter, X,
} from 'lucide-react';
import {
  isWithinRange,
  type RangePreset,
  type CustomRange,
} from '@/components/notifications/NotificationDateFilter';
import { NotificationPagination } from '@/components/notifications/NotificationPagination';
import { toast } from 'sonner';

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
 * How a notification was fired — did a human initiate it, or the system?
 * Manual covers three human-initiated paths, each identified differently:
 *   - notification rules   -> notify_send_test() sets metadata.is_test = true
 *   - report subscriptions -> "Run now" sets metadata.trigger_type = 'manual'
 *                             (a scheduled run sets 'scheduled')
 *   - broadcasts           -> type = 'broadcast' (admin-composed announcement,
 *                             which carries no metadata marker of its own)
 * Anything else came from an event trigger or a schedule, i.e. automatic.
 */
type FiredBy = 'manual' | 'auto';
const firedByOf = (n: { metadata: Record<string, any> | null; type: string | null }): FiredBy => {
  const m = n.metadata ?? {};
  const isTest = m.is_test === true || m.is_test === 'true';
  const manualTrigger = String(m.trigger_type ?? '').toLowerCase() === 'manual';
  const isBroadcast = String(n.type ?? '').toLowerCase() === 'broadcast';
  return isTest || manualTrigger || isBroadcast ? 'manual' : 'auto';
};

type SortKey = 'title' | 'recipient' | 'created_at' | 'read_at';
type SortDir = 'asc' | 'desc';

const DATE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
];

/** Column header with optional sorting and multi-select filtering. */
const ColumnHead: React.FC<{
  label: string;
  sortKey?: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort?: (k: SortKey, dir: SortDir) => void;
  options?: { value: string; label: string }[];
  selected?: Set<string>;
  onToggle?: (v: string) => void;
  onClear?: () => void;
  className?: string;
}> = ({ label, sortKey, sort, onSort, options, selected, onToggle, onClear, className }) => {
  const isSorted = sortKey && sort.key === sortKey;
  const isFiltered = !!selected && selected.size > 0;
  const hasMenu = !!options || !!sortKey;

  if (!hasMenu) return <TableHead className={className}>{label}</TableHead>;

  return (
    <TableHead className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`-ml-2 inline-flex items-center gap-1 rounded px-2 py-1 text-left transition-colors hover:bg-muted/70 ${
              isFiltered || isSorted ? 'text-foreground' : ''
            }`}
          >
            <span className="font-medium">{label}</span>
            {isSorted ? (
              sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
            ) : sortKey ? (
              <ChevronsUpDown size={12} className="opacity-40" />
            ) : null}
            {isFiltered && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {selected!.size}
              </span>
            )}
            {!!options && !isFiltered && <ListFilter size={12} className="opacity-40" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          {sortKey && onSort && (
            <>
              <DropdownMenuLabel className="text-xs">Sort</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onSort(sortKey, 'asc')} className="gap-2 text-sm">
                <ArrowUp size={14} /> Ascending
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSort(sortKey, 'desc')} className="gap-2 text-sm">
                <ArrowDown size={14} /> Descending
              </DropdownMenuItem>
            </>
          )}
          {options && options.length > 0 && (
            <>
              {sortKey && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="flex items-center justify-between text-xs">
                Filter
                {isFiltered && (
                  <button
                    onClick={(e) => { e.preventDefault(); onClear?.(); }}
                    className="inline-flex items-center gap-1 text-[11px] font-normal text-muted-foreground hover:text-foreground"
                  >
                    <X size={11} /> Clear
                  </button>
                )}
              </DropdownMenuLabel>
              <div className="max-h-64 overflow-y-auto">
                {options.map(o => (
                  <DropdownMenuCheckboxItem
                    key={o.value}
                    checked={selected?.has(o.value) ?? false}
                    onCheckedChange={() => onToggle?.(o.value)}
                    onSelect={(e) => e.preventDefault()}
                    className="text-sm"
                  >
                    {o.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </TableHead>
  );
};

export const NotificationHistoryTab: React.FC = () => {
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<RangePreset>('all');
  const [custom, setCustom] = useState<CustomRange>({ from: '', to: '' });
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'created_at', dir: 'desc' });
  const [recipientF, setRecipientF] = useState<Set<string>>(new Set());
  const [deliveryF, setDeliveryF] = useState<Set<string>>(new Set());
  const [firedByF, setFiredByF] = useState<Set<string>>(new Set());
  const [seenF, setSeenF] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

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

  const all = data || [];

  // Filter option lists are derived from the data so they only ever offer real values.
  const recipientOptions = useMemo(
    () => Array.from(new Set(all.map(n => n.recipient))).sort()
      .map(v => ({ value: v, label: v })),
    [all]
  );
  const deliveryOptions = useMemo(
    () => Array.from(new Set(all.map(n => n.delivery_status || 'delivered'))).sort()
      .map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) })),
    [all]
  );

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void) => (v: string) => {
    const next = new Set(set);
    next.has(v) ? next.delete(v) : next.add(v);
    setter(next);
  };

  const onSort = (key: SortKey, dir: SortDir) => setSort({ key, dir });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = all.filter(n => {
      if (recipientF.size && !recipientF.has(n.recipient)) return false;
      if (deliveryF.size && !deliveryF.has(n.delivery_status || 'delivered')) return false;
      if (firedByF.size && !firedByF.has(n.firedBy)) return false;
      if (seenF.size && !seenF.has(n.is_read ? 'read' : 'unread')) return false;
      if (q && !(
        n.title?.toLowerCase().includes(q) ||
        n.message?.toLowerCase().includes(q) ||
        n.recipient?.toLowerCase().includes(q)
      )) return false;
      return isWithinRange(n.created_at, preset, custom);
    });

    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = sort.key === 'recipient' ? a.recipient : (a as any)[sort.key];
      const bv = sort.key === 'recipient' ? b.recipient : (b as any)[sort.key];
      if (!av && !bv) return 0;
      if (!av) return 1;   // empties always last
      if (!bv) return -1;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [all, search, preset, custom, recipientF, deliveryF, firedByF, seenF, sort]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pagedRows = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page]);

  useEffect(() => { setPage(1); },
    [search, preset, custom.from, custom.to, recipientF, deliveryF, firedByF, seenF]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  const readCount = all.filter(n => n.is_read).length;
  const manualCount = all.filter(n => n.firedBy === 'manual').length;
  const activeFilters = recipientF.size + deliveryF.size + firedByF.size + seenF.size;

  const clearAll = () => {
    setRecipientF(new Set()); setDeliveryF(new Set());
    setFiredByF(new Set()); setSeenF(new Set());
    setSearch(''); setPreset('all'); setCustom({ from: '', to: '' });
  };

  /** Exports exactly what is on screen — current filters, search and sort applied. */
  const handleExport = async () => {
    if (rows.length === 0) { toast.error('Nothing to export'); return; }
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const sheetRows = rows.map(n => ({
        Title: n.title,
        Content: n.message,
        Recipient: n.recipient,
        'Sent at': format(new Date(n.created_at), 'dd MMM yyyy, HH:mm'),
        Delivery: n.delivery_status || 'delivered',
        'Fired by': n.firedBy === 'manual' ? 'Manual' : 'Auto',
        Seen: n.is_read ? 'Read' : 'Unread',
        'Read at': n.read_at ? format(new Date(n.read_at), 'dd MMM yyyy, HH:mm') : '',
      }));
      const ws = XLSX.utils.json_to_sheet(sheetRows);
      ws['!cols'] = [{ wch: 34 }, { wch: 52 }, { wch: 20 }, { wch: 20 },
                     { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 20 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Notification History');
      XLSX.writeFile(wb, `Notification History - ${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast.success(`Exported ${rows.length} notifications`);
    } catch (e: any) {
      toast.error(e?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-4 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <History size={16} /> Notification History
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{all.length}</span> sent ·{' '}
              <span className="font-medium text-foreground">{readCount}</span> read ·{' '}
              <span className="font-medium text-foreground">{manualCount}</span> manual
              <span className="ml-2 text-muted-foreground/80">
                — org-wide totals; you can only mark your own notifications as read.
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExport} disabled={exporting || rows.length === 0}>
              <Download size={14} /> {exporting ? 'Exporting…' : 'Export'}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
            </Button>
          </div>
        </div>

        {/* Toolbar: date range (left) + search. Column-level controls live in the headers. */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="All time" />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {preset === 'custom' && (
            <div className="flex items-center gap-1.5">
              <Input
                type="date" value={custom.from} className="h-9 w-[150px]"
                onChange={(e) => setCustom({ ...custom, from: e.target.value })}
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date" value={custom.to} className="h-9 w-[150px]"
                onChange={(e) => setCustom({ ...custom, to: e.target.value })}
              />
            </div>
          )}

          <div className="relative min-w-[240px] flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, message or recipient"
              className="h-9 pl-8"
            />
          </div>

          {(activeFilters > 0 || search || preset !== 'all') && (
            <Button size="sm" variant="ghost" className="h-9 gap-1 text-muted-foreground" onClick={clearAll}>
              <X size={14} /> Clear all
              {activeFilters > 0 && <Badge variant="secondary" className="ml-1">{activeFilters}</Badge>}
            </Button>
          )}

          <span className="ml-auto text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{rows.length}</span> of {all.length}
          </span>
        </div>
      </CardHeader>

      <CardContent className="overflow-x-auto pt-0">
        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No notifications match these filters</p>
            {(activeFilters > 0 || search || preset !== 'all') && (
              <Button size="sm" variant="outline" className="mt-3" onClick={clearAll}>Clear filters</Button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/50 backdrop-blur">
                <TableRow className="hover:bg-transparent">
                  <ColumnHead label="Title" sortKey="title" sort={sort} onSort={onSort} />
                  <TableHead>Content</TableHead>
                  <ColumnHead
                    label="Recipient" sortKey="recipient" sort={sort} onSort={onSort}
                    options={recipientOptions} selected={recipientF}
                    onToggle={toggle(recipientF, setRecipientF)} onClear={() => setRecipientF(new Set())}
                  />
                  <ColumnHead label="Sent at" sortKey="created_at" sort={sort} onSort={onSort} />
                  <ColumnHead
                    label="Delivery" sort={sort}
                    options={deliveryOptions} selected={deliveryF}
                    onToggle={toggle(deliveryF, setDeliveryF)} onClear={() => setDeliveryF(new Set())}
                  />
                  <ColumnHead
                    label="Fired by" sort={sort}
                    options={[{ value: 'auto', label: 'Auto' }, { value: 'manual', label: 'Manual' }]}
                    selected={firedByF}
                    onToggle={toggle(firedByF, setFiredByF)} onClear={() => setFiredByF(new Set())}
                  />
                  <ColumnHead
                    label="Seen" sort={sort}
                    options={[{ value: 'read', label: 'Read' }, { value: 'unread', label: 'Unread' }]}
                    selected={seenF}
                    onToggle={toggle(seenF, setSeenF)} onClear={() => setSeenF(new Set())}
                  />
                  <ColumnHead label="Read at" sortKey="read_at" sort={sort} onSort={onSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedRows.map(n => (
                  <TableRow key={n.id} className="hover:bg-muted/40">
                    <TableCell className="max-w-[220px] truncate font-medium">{n.title}</TableCell>
                    <TableCell className="max-w-[300px] truncate text-xs text-muted-foreground">{n.message}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{n.recipient}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      {format(new Date(n.created_at), 'dd MMM yyyy, HH:mm')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">{n.delivery_status || 'delivered'}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={n.firedBy === 'manual'
                          ? 'border-amber-500/60 text-amber-600 dark:text-amber-400'
                          : 'text-muted-foreground'}
                        title={n.firedBy === 'manual'
                          ? `${n.type === 'broadcast' ? 'Sent manually as a broadcast' : 'Fired manually via "Run now"'}${n.testBatchId ? ` · batch ${n.testBatchId.slice(0, 8)}` : ''}`
                          : 'Fired automatically by an event trigger or schedule'}
                      >
                        {n.firedBy === 'manual' ? 'Manual' : 'Auto'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={n.is_read ? 'default' : 'outline'}>
                        {n.is_read ? 'Read' : 'Unread'}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      {n.read_at ? format(new Date(n.read_at), 'dd MMM yyyy, HH:mm') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
