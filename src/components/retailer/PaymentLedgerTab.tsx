import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, RefreshCw, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface LedgerRow {
  entry_at: string;
  entry_type: 'order' | 'payment';
  reference: string | null;
  detail: string | null;
  debit: number;
  credit: number;
  running_balance: number;
  payment_method: string | null;
  order_id: string | null;
  collection_id: string | null;
  order_status: string | null;
  payment_status: string | null;
  is_credit_order: boolean | null;
}

const money = (n: number) =>
  `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

export function PaymentLedgerTab({ retailerId }: { retailerId: string }) {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc(
        'get_retailer_payment_ledger' as any,
        { p_retailer_id: retailerId },
      );
      if (error) throw error;
      setRows((data as unknown as LedgerRow[]) ?? []);
    } catch (e: any) {
      // The RPC raises its own permission message — surface it verbatim.
      setError(e?.message ?? 'Could not load the payment ledger');
    } finally {
      setLoading(false);
    }
  }, [retailerId]);

  useEffect(() => { if (retailerId) load(); }, [retailerId, load]);

  const summary = useMemo(() => {
    const billed = rows.reduce((s, r) => s + Number(r.debit || 0), 0);
    const received = rows.reduce((s, r) => s + Number(r.credit || 0), 0);
    // Closing balance is the last row's running balance, not the max.
    const closing = rows.length ? Number(rows[rows.length - 1].running_balance) : 0;
    return { billed, received, closing };
  }, [rows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
        {error}
      </CardContent></Card>
    );
  }

  if (!rows.length) {
    return (
      <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
        No orders or payments recorded for this retailer yet.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <Card><CardContent className="p-3">
          <div className="text-[11px] text-muted-foreground">Billed on credit</div>
          <div className="text-lg font-bold tabular-nums">{money(summary.billed)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[11px] text-muted-foreground">Payments received</div>
          <div className="text-lg font-bold tabular-nums text-emerald-600">
            {money(summary.received)}
          </div>
        </CardContent></Card>
        <Card className={summary.closing > 0 ? 'border-amber-400' : ''}>
          <CardContent className="p-3">
            <div className="text-[11px] text-muted-foreground">
              {summary.closing < 0 ? 'Advance held' : 'Outstanding'}
            </div>
            <div className={`text-lg font-bold tabular-nums ${
              summary.closing > 0 ? 'text-amber-600'
                : summary.closing < 0 ? 'text-blue-600' : ''}`}>
              {money(Math.abs(summary.closing))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Ledger */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Date</TableHead>
              <TableHead>Entry</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Billed</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow
                key={`${r.entry_type}-${r.order_id ?? r.collection_id}-${i}`}
                className={r.entry_type === 'payment' ? 'bg-emerald-50 dark:bg-emerald-950/20' : ''}
              >
                <TableCell className="text-xs whitespace-nowrap">
                  {format(new Date(r.entry_at), 'dd MMM yy')}
                </TableCell>
                <TableCell className="text-xs">
                  <span className="inline-flex items-center gap-1">
                    {r.entry_type === 'payment'
                      ? <ArrowDownCircle className="h-3 w-3 text-emerald-600" />
                      : <ArrowUpCircle className="h-3 w-3 text-muted-foreground" />}
                    {r.entry_type === 'payment' ? 'Payment' : (r.detail ?? 'Order')}
                  </span>
                  {r.entry_type === 'payment' && r.payment_method && (
                    <Badge variant="outline" className="ml-1 text-[10px] capitalize">
                      {r.payment_method}
                    </Badge>
                  )}
                  {r.entry_type === 'order' && r.payment_status === 'partial' && (
                    <Badge variant="secondary" className="ml-1 text-[10px]">partial</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs font-mono">{r.reference || '—'}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {Number(r.debit) ? money(r.debit) : '—'}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums text-emerald-700">
                  {Number(r.credit) ? money(r.credit) : '—'}
                </TableCell>
                <TableCell className={`text-right text-xs tabular-nums font-semibold ${
                  Number(r.running_balance) > 0 ? 'text-amber-700'
                    : Number(r.running_balance) < 0 ? 'text-blue-700' : ''}`}>
                  {money(r.running_balance)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Cash orders are listed for history but do not add to the balance — only credit
        orders do. A negative balance means the retailer is in advance.
      </p>
    </div>
  );
}
