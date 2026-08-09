import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, Download, Eye, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface InvoiceRow {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  status: string | null;
  order_id: string;
  order_status: string | null;
  storage_path: string;
  has_pdf: boolean;
}

const money = (n: number) =>
  `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

export function InvoicesTab({ retailerId }: { retailerId: string }) {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc(
        'get_retailer_invoices' as any,
        { p_retailer_id: retailerId },
      );
      if (error) throw error;
      setRows((data as unknown as InvoiceRow[]) ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load invoices');
    } finally {
      setLoading(false);
    }
  }, [retailerId]);

  useEffect(() => { if (retailerId) load(); }, [retailerId, load]);

  /**
   * PDF upload to the `invoices` bucket stopped around 16 Jul, so most invoices
   * have no cached file. Serve the cached copy when it exists; otherwise render
   * it on demand from the invoice data rather than showing a broken link.
   */
  const openInvoice = async (row: InvoiceRow, mode: 'view' | 'download') => {
    setBusyId(row.invoice_id);
    try {
      if (row.has_pdf) {
        const { data } = supabase.storage
          .from('invoices')
          .getPublicUrl(row.storage_path);
        if (data?.publicUrl) {
          window.open(data.publicUrl, '_blank', 'noopener');
          return;
        }
      }

      const { fetchAndGenerateInvoice } = await import('@/utils/invoiceGenerator');
      const { blob, invoiceNumber } = await fetchAndGenerateInvoice(row.order_id);
      const url = URL.createObjectURL(blob);

      if (mode === 'download') {
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice-${invoiceNumber || row.invoice_number}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(url, '_blank', 'noopener');
      }
      // Give the browser time to consume the blob before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not open the invoice');
    } finally {
      setBusyId(null);
    }
  };

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
        No invoices raised for this retailer yet.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead className="whitespace-nowrap">Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow
                key={r.invoice_id}
                className={r.status === 'superseded' ? 'opacity-60' : ''}
              >
                <TableCell className="text-xs font-mono whitespace-nowrap">
                  <FileText className="h-3 w-3 inline mr-1 text-muted-foreground" />
                  {r.invoice_number}
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {format(new Date(r.invoice_date), 'dd MMM yy')}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {money(r.total_amount)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={r.status === 'superseded' ? 'secondary' : 'outline'}
                    className="text-[10px] capitalize"
                  >
                    {r.status ?? 'generated'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button
                    variant="ghost" size="sm"
                    disabled={busyId === r.invoice_id}
                    onClick={() => openInvoice(r, 'view')}
                  >
                    {busyId === r.invoice_id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Eye className="h-3 w-3" />}
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    disabled={busyId === r.invoice_id}
                    onClick={() => openInvoice(r, 'download')}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Invoices saved earlier open instantly; the rest are rendered on demand,
        so every invoice is available either way.
      </p>
    </div>
  );
}
