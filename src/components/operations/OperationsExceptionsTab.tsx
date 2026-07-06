import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, MapPin, Filter, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCSV } from '@/utils/fileDownloader';

type ExceptionRow = {
  order_id: string;
  invoice_number: string | null;
  order_date: string;
  entered_on: string;
  is_backdated: boolean;
  is_on_behalf: boolean;
  is_out_of_beat: boolean;
  is_edited: boolean;
  retailer_id: string | null;
  retailer_name: string | null;
  collector_id: string | null;
  placed_by_id: string | null;
  owner_id: string | null;
  collector_name: string | null;
  placed_by_name: string | null;
  owner_name: string | null;
  reason: string | null;
  oob_location: any;
  total_amount: number | null;
};

const TYPE_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'backdated',   label: 'Backdated',   color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { value: 'on_behalf',   label: 'On-behalf',   color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'out_of_beat', label: 'Out-of-beat', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'edited',      label: 'Edited',      color: 'bg-slate-100 text-slate-800 border-slate-200' },
];

export default function OperationsExceptionsTab() {
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [types, setTypes] = useState<string[]>([]);
  const [userId, setUserId] = useState<string>('all');
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [rows, setRows] = useState<ExceptionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name', { ascending: true })
        .limit(1000);
      setUsers((data as any[]) || []);
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('get_operations_exceptions', {
        p_from: from || null,
        p_to: to || null,
        p_types: types.length ? types : null,
        p_user: userId && userId !== 'all' ? userId : null,
      });
      if (error) throw error;
      setRows((data as ExceptionRow[]) || []);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load exceptions');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const toggleType = (v: string) => {
    setTypes((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
  };

  const typesLabel = types.length === 0 ? 'All types' : `${types.length} selected`;

  const badgesFor = (r: ExceptionRow) => {
    const items: { value: string; label: string; color: string }[] = [];
    if (r.is_backdated)   items.push(TYPE_OPTIONS[0]);
    if (r.is_on_behalf)   items.push(TYPE_OPTIONS[1]);
    if (r.is_out_of_beat) items.push(TYPE_OPTIONS[2]);
    if (r.is_edited)      items.push(TYPE_OPTIONS[3]);
    return items;
  };

  const exportCsv = async () => {
    if (!rows.length) { toast.info('Nothing to export'); return; }
    const header = [
      'Order #','Retailer','Types','Order date','Entered on',
      'Collector','Placed by','Owner','Reason','GPS','Amount',
    ];
    const esc = (v: any) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map((r) => [
      r.invoice_number || r.order_id,
      r.retailer_name || '',
      badgesFor(r).map((b) => b.label).join('|'),
      r.order_date,
      r.entered_on,
      r.collector_name || '',
      r.placed_by_name || '',
      r.owner_name || '',
      r.reason || '',
      r.oob_location ? `${r.oob_location.lat},${r.oob_location.lng}` : '',
      r.total_amount ?? '',
    ].map(esc).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    await downloadCSV(csv, `operations-exceptions-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Types</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-48 justify-start">
                <Filter className="h-4 w-4 mr-2" />{typesLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              {TYPE_OPTIONS.map((t) => (
                <label key={t.value} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted cursor-pointer text-sm">
                  <Checkbox checked={types.includes(t.value)} onCheckedChange={() => toggleType(t.value)} />
                  {t.label}
                </label>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">User</label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="All users" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All users</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.full_name || u.id.slice(0, 8)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Apply
        </Button>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="h-4 w-4 mr-2" />Export CSV
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Retailer</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Order date / Entered on</TableHead>
              <TableHead>Collector</TableHead>
              <TableHead>Placed by</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={9} className="text-center py-6 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center py-6 text-sm text-muted-foreground">No exception orders in this range.</TableCell></TableRow>
            )}
            {!loading && rows.map((r) => {
              const bs = badgesFor(r);
              const od = r.order_date ? format(new Date(r.order_date), 'MMM dd, yyyy') : '—';
              const en = r.entered_on ? format(new Date(r.entered_on), 'MMM dd, yyyy HH:mm') : '—';
              const mismatch = r.order_date && r.entered_on && r.order_date !== r.entered_on.slice(0, 10);
              return (
                <TableRow key={r.order_id}>
                  <TableCell className="font-mono text-xs">{r.invoice_number || r.order_id.slice(0, 8)}</TableCell>
                  <TableCell>{r.retailer_name || '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {bs.map((b) => (
                        <Badge key={b.value} variant="outline" className={`text-[10px] px-1.5 py-0 ${b.color}`}>{b.label}</Badge>
                      ))}
                      {r.oob_location?.lat != null && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center text-purple-700">
                                <MapPin className="h-3.5 w-3.5" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              GPS: {Number(r.oob_location.lat).toFixed(5)}, {Number(r.oob_location.lng).toFixed(5)}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div>{od}</div>
                    <div className={mismatch ? 'text-amber-700' : 'text-muted-foreground'}>{en}</div>
                  </TableCell>
                  <TableCell className="text-xs">{r.collector_name || '—'}</TableCell>
                  <TableCell className="text-xs">{r.placed_by_name || '—'}</TableCell>
                  <TableCell className="text-xs">{r.owner_name || '—'}</TableCell>
                  <TableCell className="text-xs max-w-[240px] truncate" title={r.reason || ''}>{r.reason || '—'}</TableCell>
                  <TableCell className="text-right font-medium">
                    {r.total_amount != null ? `₹${Number(r.total_amount).toFixed(2)}` : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
