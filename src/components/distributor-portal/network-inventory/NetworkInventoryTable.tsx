import { useState, useMemo, Fragment } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import NetworkInventoryRowDetail from './NetworkInventoryRowDetail';
import type { NetworkInventoryRow, StockStatus } from './useNetworkChildInventory';

interface Props {
  rows: NetworkInventoryRow[];
  childId: string;
  loading?: boolean;
}

const PAGE_SIZE = 20;

const statusConfig: Record<StockStatus, { label: string; cls: string }> = {
  critical: { label: 'Critical', cls: 'bg-red-100 text-red-800 border-red-200' },
  low: { label: 'Low', cls: 'bg-orange-100 text-orange-800 border-orange-200' },
  healthy: { label: 'Healthy', cls: 'bg-green-100 text-green-800 border-green-200' },
  overstock: { label: 'Overstock', cls: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  neutral: { label: '—', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const dosClass = (dos: number | null) => {
  if (dos === null) return 'bg-slate-50 text-slate-600';
  if (dos < 3) return 'bg-red-50 text-red-700';
  if (dos < 7) return 'bg-orange-50 text-orange-700';
  if (dos <= 30) return 'bg-green-50 text-green-700';
  return 'bg-blue-50 text-blue-700';
};

const NetworkInventoryTable = ({ rows, childId, loading }: Props) => {
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = useMemo(() => rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [rows, page]);

  if (loading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading inventory…</div>;
  }
  if (rows.length === 0) {
    return <div className="p-8 text-center text-sm text-muted-foreground">No inventory matches the current filters.</div>;
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Available</TableHead>
            <TableHead className="text-right">Reserved</TableHead>
            <TableHead className="text-right">Avg Daily Sales</TableHead>
            <TableHead className="text-right">Days of Stock</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Movement</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((r) => {
            const key = r.product_id || `${r.product_name}|${r.variant_name || ''}`;
            const isOpen = expanded === key;
            const dos = r.days_of_stock;
            const dosLabel = dos === null ? '∞' : dos < 1 ? '<1' : Math.round(dos).toString();
            return (
              <Fragment key={key}>
                <TableRow className="cursor-pointer" onClick={() => setExpanded(isOpen ? null : key)}>
                  <TableCell className="py-2">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="text-sm font-medium">{r.product_name}</div>
                    {r.variant_name && <div className="text-xs text-muted-foreground">{r.variant_name}</div>}
                  </TableCell>
                  <TableCell className="py-2 text-right text-sm">{r.available.toLocaleString('en-IN')}</TableCell>
                  <TableCell className="py-2 text-right text-sm">{r.reserved.toLocaleString('en-IN')}</TableCell>
                  <TableCell className="py-2 text-right text-sm">{r.avg_daily_sales.toFixed(1)}</TableCell>
                  <TableCell className="py-2 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${dosClass(dos)}`}>
                      {dosLabel}
                    </span>
                  </TableCell>
                  <TableCell className="py-2">
                    <Badge variant="outline" className={`text-xs ${statusConfig[r.status].cls}`}>
                      {statusConfig[r.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">
                    {r.last_movement_at ? `${formatDistanceToNow(new Date(r.last_movement_at))} ago` : '—'}
                  </TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <NetworkInventoryRowDetail childId={childId} row={r} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/20">
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages} · {rows.length} items
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NetworkInventoryTable;
