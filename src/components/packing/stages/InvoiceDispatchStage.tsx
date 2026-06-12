import { useEffect, useMemo, useState } from 'react';
import { format, differenceInDays } from 'date-fns';
import {
  FileText, Download, AlertTriangle, Truck, IndianRupee, Loader2, CheckCircle2, ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { usePackingList, PackingList } from '@/hooks/usePackingList';
import { useToast } from '@/hooks/use-toast';
import StatusTimeline from './StatusTimeline';

interface InvoiceRow {
  id: string;
  product_name: string;
  unit: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  packed_qty: number;
  invoice_qty: number;
  unit_price: number;
  gst_rate: number;
}

interface Props {
  packingList: PackingList;
  onStatusChange: (s: string) => void;
}

export default function InvoiceDispatchStage({ packingList, onStatusChange }: Props) {
  const { toast } = useToast();
  const { generateInvoiceFromPackingList, updatePackingListStatus, loading: hookLoading } = usePackingList();

  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [notes, setNotes] = useState(packingList.notes || '');
  const [invoiceGenerated, setInvoiceGenerated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: items } = await supabase
          .from('packing_list_items')
          .select(`
            id, product_name, unit, product_id,
            packing_list_item_batches(id, batch_number, expiry_date, packed_qty, picked_qty)
          `)
          .eq('packing_list_id', packingList.id);

        const productIds = [...new Set((items || []).map((i: any) => i.product_id).filter(Boolean))];
        let priceMap: Record<string, number> = {};
        if (productIds.length > 0) {
          const { data: prods } = await supabase.from('products').select('id, price').in('id', productIds);
          priceMap = (prods || []).reduce((acc: any, p: any) => { acc[p.id] = Number(p.price || 0); return acc; }, {});
        }

        const flat: InvoiceRow[] = [];
        (items || []).forEach((it: any) => {
          (it.packing_list_item_batches || []).forEach((b: any) => {
            if (Number(b.packed_qty || 0) <= 0) return;
            flat.push({
              id: b.id,
              product_name: it.product_name,
              unit: it.unit,
              batch_number: b.batch_number,
              expiry_date: b.expiry_date,
              packed_qty: Number(b.packed_qty),
              invoice_qty: Number(b.packed_qty),
              unit_price: priceMap[it.product_id] || 0,
              gst_rate: 5,
            });
          });
        });
        if (!cancelled) setRows(flat);

        const { data: exc } = await supabase
          .from('delivery_exceptions' as any)
          .select('*')
          .eq('packing_list_id', packingList.id);
        if (!cancelled) setExceptions((exc as any[]) || []);

        const { data: existingInv } = await (supabase as any)
          .from('invoices')
          .select('id')
          .eq('order_id', null)
          .limit(1);
        // Best-effort: check if any invoice already exists tied to one of our orders
        const { data: orderRows } = await supabase.from('orders').select('id').eq('packing_list_id', packingList.id);
        const orderIds = (orderRows || []).map((o: any) => o.id);
        if (orderIds.length > 0) {
          const { data: linkedInv } = await (supabase as any).from('invoices').select('id').in('order_id', orderIds).limit(1);
          if (!cancelled) setInvoiceGenerated(!!(linkedInv && linkedInv.length > 0));
        }
      } catch (err: any) {
        toast({ title: 'Error', description: err?.message || 'Failed to load invoice data', variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [packingList.id, toast]);

  const totals = useMemo(() => {
    const subtotal = rows.reduce((s, r) => s + r.invoice_qty * r.unit_price, 0);
    const tax = rows.reduce((s, r) => s + (r.invoice_qty * r.unit_price * r.gst_rate) / 100, 0);
    return { subtotal, tax, total: subtotal + tax, packed: rows.reduce((s, r) => s + r.packed_qty, 0) };
  }, [rows]);

  const unresolvedExceptions = exceptions.filter(e => !e.resolved).length;

  const handleGenerateInvoice = async () => {
    if (unresolvedExceptions > 0) {
      toast({ title: 'Resolve exceptions first', description: 'Cannot generate invoice with open exceptions', variant: 'destructive' });
      return;
    }
    const res = await generateInvoiceFromPackingList(packingList.id);
    if (res.success) {
      setInvoiceGenerated(true);
      // Invoice generation also advances the packing list to 'ready'.
      // Notify parent so the Dispatch (Delivery Run) stage mounts immediately.
      onStatusChange('ready');
    }
  };

  const handleMoveToDispatch = async () => {
    // Advance packing list from 'packed' → 'ready' so the Dispatch (Delivery Run) stage mounts.
    if (packingList.status === 'packed') {
      const ok = await updatePackingListStatus(packingList.id, 'ready');
      if (!ok) return;
    }
    onStatusChange('ready');
    toast({ title: 'Ready for dispatch', description: 'Assign a driver below to dispatch the order.' });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
          <StatusTimeline status={packingList.status} />
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">DISPATCH READY</Badge>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Total Packed Items" value={String(totals.packed)} icon={<FileText className="h-4 w-4 text-primary" />} />
        <KpiCard
          label="Invoice Status"
          value={invoiceGenerated ? 'Generated' : 'Not Generated'}
          accent={invoiceGenerated ? 'text-emerald-600' : 'text-destructive'}
          icon={<FileText className="h-4 w-4 text-primary" />}
        />
        <KpiCard
          label="Dispatch Readiness"
          value={unresolvedExceptions === 0 ? 'Ready' : 'Pending'}
          accent={unresolvedExceptions === 0 ? 'text-emerald-600' : 'text-amber-600'}
          icon={<Truck className="h-4 w-4 text-primary" />}
        />
        <KpiCard label="Total Amount" value={`₹ ${totals.total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`} icon={<IndianRupee className="h-4 w-4 text-primary" />} />
        <KpiCard
          label="Exceptions"
          value={String(unresolvedExceptions)}
          accent={unresolvedExceptions > 0 ? 'text-destructive' : 'text-emerald-600'}
          subtitle={unresolvedExceptions === 0 ? 'No issues' : 'Open issues'}
          icon={<AlertTriangle className="h-4 w-4 text-primary" />}
        />
      </div>

      {/* Action buttons + table */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold">Invoice Items</h3>
              <div className="flex gap-2">
                <Button onClick={handleGenerateInvoice} disabled={hookLoading || invoiceGenerated || unresolvedExceptions > 0}>
                  <FileText className="h-4 w-4 mr-1" /> {invoiceGenerated ? 'Generated' : 'Generate Invoice'}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline"><Download className="h-4 w-4 mr-1" /> Export Invoice</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => window.print()}>Print / Save PDF</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportCsv(rows)}>Export as CSV</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : rows.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">No packed items found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left p-2">#</th>
                      <th className="text-left p-2">Product</th>
                      <th className="text-left p-2">Batch</th>
                      <th className="text-left p-2">Expiry</th>
                      <th className="text-right p-2">Packed Qty</th>
                      <th className="text-right p-2">Invoice Qty</th>
                      <th className="text-left p-2">UOM</th>
                      <th className="text-right p-2">Unit Price</th>
                      <th className="text-right p-2">GST %</th>
                      <th className="text-right p-2">Amount</th>
                      <th className="text-center p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((r, i) => {
                      const amount = r.invoice_qty * r.unit_price * (1 + r.gst_rate / 100);
                      const nearExpiry = r.expiry_date &&
                        differenceInDays(new Date(r.expiry_date), new Date()) <= 30 &&
                        differenceInDays(new Date(r.expiry_date), new Date()) >= 0;
                      return (
                        <tr key={r.id}>
                          <td className="p-2 text-muted-foreground">{i + 1}</td>
                          <td className="p-2 font-medium">{r.product_name}</td>
                          <td className="p-2 font-mono text-xs">{r.batch_number || '—'}</td>
                          <td className="p-2 text-xs">
                            <span className="inline-flex items-center gap-1">
                              {r.expiry_date ? format(new Date(r.expiry_date), 'dd/MM/yy') : '—'}
                              {nearExpiry && <AlertTriangle className="h-3 w-3 text-amber-600" />}
                            </span>
                          </td>
                          <td className="p-2 text-right">{r.packed_qty}</td>
                          <td className="p-2 text-right">
                            <Input
                              type="number"
                              min={0}
                              max={r.packed_qty}
                              value={r.invoice_qty}
                              disabled={invoiceGenerated}
                              onChange={(e) => {
                                const v = Math.min(parseInt(e.target.value) || 0, r.packed_qty);
                                setRows(prev => prev.map(x => x.id === r.id ? { ...x, invoice_qty: v } : x));
                              }}
                              className="h-7 w-16 text-right text-xs ml-auto"
                            />
                          </td>
                          <td className="p-2 text-xs">{r.unit || 'PCS'}</td>
                          <td className="p-2 text-right">₹{r.unit_price.toLocaleString('en-IN')}</td>
                          <td className="p-2 text-right">{r.gst_rate}%</td>
                          <td className="p-2 text-right font-medium">₹{amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                          <td className="p-2 text-center">
                            <Badge variant={invoiceGenerated ? 'default' : 'outline'} className={invoiceGenerated ? 'bg-emerald-100 text-emerald-800' : 'text-destructive border-destructive/30'}>
                              {invoiceGenerated ? 'Generated' : 'Not Generated'}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/30 text-sm">
                    <tr>
                      <td colSpan={4} className="p-2 font-medium">Total</td>
                      <td className="p-2 text-right font-medium">{totals.packed}</td>
                      <td className="p-2 text-right font-medium">{rows.reduce((s, r) => s + r.invoice_qty, 0)}</td>
                      <td colSpan={3}></td>
                      <td className="p-2 text-right font-semibold">₹{totals.subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                      <td></td>
                    </tr>
                    <tr>
                      <td colSpan={8}></td>
                      <td className="p-2 text-right text-xs text-muted-foreground">GST</td>
                      <td className="p-2 text-right">₹{totals.tax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                      <td></td>
                    </tr>
                    <tr>
                      <td colSpan={8}></td>
                      <td className="p-2 text-right text-xs text-muted-foreground">Grand Total</td>
                      <td className="p-2 text-right font-bold">₹{totals.total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Exception handling */}
          <Card>
            <CardContent className="p-4">
              <h4 className="text-sm font-semibold mb-3">Exception Handling</h4>
              <div className="grid grid-cols-1 gap-2">
                <Button variant="outline" size="sm" onClick={() => toast({ title: 'Coming soon', description: 'Shortage flow' })}>Handle Shortage</Button>
                <Button variant="outline" size="sm" onClick={() => toast({ title: 'Coming soon', description: 'Substitution flow' })}>Substitution</Button>
                <Button variant="outline" size="sm" onClick={() => toast({ title: 'Coming soon', description: 'Split shipment flow' })}>Split Shipment</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h4 className="text-sm font-semibold mb-2">Exceptions</h4>
              {exceptions.length === 0 ? (
                <div className="p-4 rounded-md bg-emerald-50 dark:bg-emerald-900/10 text-sm">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-medium">
                    <CheckCircle2 className="h-4 w-4" /> No Exceptions
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">All items are available and ready for invoicing and dispatch.</p>
                </div>
              ) : (
                <ul className="space-y-2 text-sm">
                  {exceptions.map(ex => (
                    <li key={ex.id} className="p-2 border rounded">
                      <div className="font-medium text-xs">{ex.exception_type}</div>
                      <div className="text-xs text-muted-foreground">{ex.description}</div>
                      <Badge variant={ex.resolved ? 'default' : 'destructive'} className="mt-1">
                        {ex.resolved ? 'Resolved' : 'Open'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h4 className="text-sm font-semibold mb-2">Notes</h4>
              <Textarea
                placeholder="Add notes (optional)…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={async () => {
                  await supabase.from('packing_lists').update({ notes }).eq('id', packingList.id);
                }}
                className="min-h-[80px] text-sm"
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {invoiceGenerated && (
        <div className="sticky bottom-0 bg-card border-t -mx-4 px-4 py-3 flex items-center justify-end gap-3 z-10">
          <Button onClick={handleMoveToDispatch}>
            Proceed to Dispatch <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, accent, subtitle, icon }: { label: string; value: string; accent?: string; subtitle?: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <p className={`text-lg font-bold mt-1 ${accent || ''}`}>{value}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function exportCsv(rows: InvoiceRow[]) {
  const header = ['Product', 'Batch', 'Expiry', 'Packed', 'Invoice Qty', 'UOM', 'Unit Price', 'GST %', 'Amount'];
  const lines = rows.map(r => [
    r.product_name, r.batch_number || '', r.expiry_date || '',
    r.packed_qty, r.invoice_qty, r.unit || '', r.unit_price, r.gst_rate,
    (r.invoice_qty * r.unit_price * (1 + r.gst_rate / 100)).toFixed(2),
  ].join(','));
  const csv = [header.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'invoice.csv';
  a.click();
  URL.revokeObjectURL(url);
}
