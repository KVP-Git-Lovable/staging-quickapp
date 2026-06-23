import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  FileText, Download, Printer, Eye, Loader2, CheckCircle2, ArrowRight, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { usePackingList, PackingList } from '@/hooks/usePackingList';
import { useToast } from '@/hooks/use-toast';
import { buildPrimaryInvoiceBlob } from '@/utils/primaryInvoiceDocument';
import StatusTimeline from './StatusTimeline';
import { getPrimaryPackingListInvoiceLookup, PrimaryInvoice, PrimaryOrderInfo } from './primaryInvoiceLookup';

interface DistributorInfo {
  id: string;
  name: string;
  gst_number: string | null;
  state: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  contact_person: string | null;
  credit_limit: number | null;
  outstanding_amount: number | null;
}

interface InvoiceLine {
  id: string;
  product_id: string;
  product_name: string;
  hsn_code: string | null;
  unit: string | null;
  ordered_qty: number;
  packed_qty: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
}

interface Props {
  packingList: PackingList;
  onStatusChange: (s?: string) => void;
}

// Indian-format number → words (lakh/crore)
function numberToWords(num: number): string {
  if (!isFinite(num)) return '';
  const n = Math.round(num);
  if (n === 0) return 'Zero Rupees';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const two = (x: number): string => x < 20 ? ones[x] : tens[Math.floor(x/10)] + (x%10 ? ' ' + ones[x%10] : '');
  const three = (x: number): string => x >= 100 ? ones[Math.floor(x/100)] + ' Hundred' + (x%100 ? ' ' + two(x%100) : '') : two(x);
  let out = '';
  const cr = Math.floor(n/10000000); const rem1 = n%10000000;
  const lk = Math.floor(rem1/100000); const rem2 = rem1%100000;
  const th = Math.floor(rem2/1000); const rem3 = rem2%1000;
  if (cr) out += three(cr) + ' Crore ';
  if (lk) out += three(lk) + ' Lakh ';
  if (th) out += three(th) + ' Thousand ';
  if (rem3) out += three(rem3);
  const paise = Math.round((num - n) * 100);
  return (out.trim() + ' Rupees' + (paise ? ' and ' + two(paise) + ' Paise' : '')).replace(/\s+/g,' ');
}

const fmt = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PrimaryInvoiceStage({ packingList, onStatusChange }: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { generatePrimaryInvoices, finalizePrimaryInvoice, updatePackingListStatus, loading: hookLoading } = usePackingList();

  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<PrimaryInvoice[]>([]);
  const [ordersById, setOrdersById] = useState<Record<string, PrimaryOrderInfo>>({});
  const [invoiceStats, setInvoiceStats] = useState<{ expected: number; finalized: number }>({ expected: 0, finalized: 0 });
  const [buyerById, setBuyerById] = useState<Record<string, DistributorInfo>>({});
  const [linesByOrder, setLinesByOrder] = useState<Record<string, InvoiceLine[]>>({});
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Linked primary orders for this packing list
      const { orders: orderList, orderIds, invoices: invs, expectedCount, finalizedCount } = await getPrimaryPackingListInvoiceLookup(packingList.id);
      setOrdersById(orderList.reduce((acc, o) => { acc[o.id] = o; return acc; }, {} as Record<string, PrimaryOrderInfo>));
      setInvoices(invs);
      setInvoiceStats({ expected: expectedCount, finalized: finalizedCount });
      setActiveInvoiceId(prev => prev && invs.some(i => i.id === prev) ? prev : invs[0]?.id || null);

      // BUYER distributors — resolved from each invoice's distributor_id (the child / Billed To party).
      // Never resolve from packing_lists.distributor_id (that's the SELLER / fulfilling distributor).
      const buyerIds = Array.from(new Set(
        invs.map(i => i.distributor_id).filter((v): v is string => !!v)
      ));
      if (buyerIds.length) {
        const { data: ds } = await supabase
          .from('distributors')
          .select('id, name, gst_number, state, address, email, phone, contact_person, credit_limit, outstanding_amount')
          .in('id', buyerIds);
        const map: Record<string, DistributorInfo> = {};
        (ds || []).forEach((d: any) => { map[d.id] = d as DistributorInfo; });
        setBuyerById(map);
      } else {
        setBuyerById({});
      }

      // Lines (order_items + packed qty per item)
      if (orderIds.length) {
        const { data: items } = await supabase
          .from('primary_order_items')
          .select('id, order_id, product_id, product_name, unit, ordered_qty, quantity, unit_price, discount_percent, tax_percent')
          .in('order_id', orderIds);

        // packed qty per order_item_id via sources → batches (proportional split)
        const { data: plItems } = await supabase
          .from('packing_list_items')
          .select('id')
          .eq('packing_list_id', packingList.id);
        const plItemIds = (plItems || []).map((p: any) => p.id);

        let packedByOrderItem: Record<string, number> = {};
        if (plItemIds.length) {
          const { data: sources } = await supabase
            .from('packing_list_item_sources')
            .select('packing_list_item_id, order_id, order_item_id, allocated_qty')
            .in('packing_list_item_id', plItemIds);
          const { data: batches } = await supabase
            .from('packing_list_item_batches')
            .select('packing_list_item_id, packed_qty')
            .in('packing_list_item_id', plItemIds);

          const packedPerPlItem: Record<string, number> = {};
          (batches || []).forEach((b: any) => {
            packedPerPlItem[b.packing_list_item_id] = (packedPerPlItem[b.packing_list_item_id] || 0) + Number(b.packed_qty || 0);
          });
          const allocPerPlItem: Record<string, number> = {};
          (sources || []).forEach((s: any) => {
            allocPerPlItem[s.packing_list_item_id] = (allocPerPlItem[s.packing_list_item_id] || 0) + Number(s.allocated_qty || 0);
          });
          (sources || []).forEach((s: any) => {
            const totalPacked = packedPerPlItem[s.packing_list_item_id] || 0;
            const totalAlloc = allocPerPlItem[s.packing_list_item_id] || 0;
            const share = totalAlloc > 0 ? Number(s.allocated_qty || 0) / totalAlloc : 0;
            const billed = totalPacked * share;
            if (s.order_item_id) {
              packedByOrderItem[s.order_item_id] = (packedByOrderItem[s.order_item_id] || 0) + billed;
            }
          });
        }

        // HSN from products
        const prodIds = [...new Set((items || []).map((i: any) => i.product_id).filter(Boolean))];
        let hsnMap: Record<string, string | null> = {};
        if (prodIds.length) {
          const { data: prods } = await supabase.from('products').select('id, hsn_code').in('id', prodIds);
          hsnMap = (prods || []).reduce((acc: any, p: any) => { acc[p.id] = p.hsn_code || null; return acc; }, {});
        }

        const byOrder: Record<string, InvoiceLine[]> = {};
        (items || []).forEach((it: any) => {
          const line: InvoiceLine = {
            id: it.id,
            product_id: it.product_id,
            product_name: it.product_name,
            hsn_code: hsnMap[it.product_id] || null,
            unit: it.unit,
            ordered_qty: Number(it.ordered_qty ?? it.quantity ?? 0),
            packed_qty: Number(packedByOrderItem[it.id] || 0),
            unit_price: Number(it.unit_price || 0),
            discount_percent: Number(it.discount_percent || 0),
            tax_percent: Number(it.tax_percent || 0),
          };
          (byOrder[it.order_id] = byOrder[it.order_id] || []).push(line);
        });
        setLinesByOrder(byOrder);
      }
    } catch (err: any) {
      toast({ title: 'Failed to load invoices', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [packingList.id, packingList.distributor_id, toast]);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = async () => {
    const res = await generatePrimaryInvoices(packingList.id);
    if ((res as any).success) await load();
  };

  const handleFinalize = async (invoiceId: string) => {
    const res = await finalizePrimaryInvoice(invoiceId);
    if ((res as any).success) await load();
  };

  const handleProceedToDispatch = async () => {
    if (packingList.status === 'packed') {
      const ok = await updatePackingListStatus(packingList.id, 'ready');
      if (!ok) return;
    }
    onStatusChange('ready');
    toast({ title: 'Ready for dispatch' });
    // Avoid double-appending when this stage is already mounted under the /dispatch route
    if (!/\/dispatch\/?$/.test(window.location.pathname)) {
      navigate('dispatch');
    }
  };

  const buildBlobForActive = useCallback(async (): Promise<Blob | null> => {
    const inv = invoices.find(i => i.id === activeInvoiceId);
    if (!inv) return null;
    const lines = linesByOrder[inv.order_id] || [];
    const order = ordersById[inv.order_id];
    let company: any = {};
    try {
      const { data } = await supabase.from('companies').select('*').limit(1).maybeSingle();
      company = data || {};
    } catch {}
    const isDraft = inv.status !== 'finalized' || /^DRAFT-/i.test(inv.invoice_number || '');
    // Buyer = the invoice's distributor_id (child / Billed To). NOT packing_lists.distributor_id.
    const buyer = inv.distributor_id ? buyerById[inv.distributor_id] || null : null;
    return buildPrimaryInvoiceBlob({
      invoiceNumber: inv.invoice_number,
      invoiceDate: inv.invoice_date,
      dueDate: inv.due_date,
      isDraft,
      distributor: buyer,
      company,
      orderNumber: order?.order_number || null,
      orderDate: order?.order_date || null,
      packingListNumber: (packingList as any).packing_list_number || (packingList as any).pl_number || null,
      paymentTerms: order?.payment_terms || order?.payment_term || null,
      salesPerson: null,
      lines: lines.map(l => ({
        product_name: l.product_name,
        hsn_code: l.hsn_code,
        unit: l.unit,
        packed_qty: l.packed_qty,
        unit_price: l.unit_price,
        discount_percent: l.discount_percent,
        tax_percent: l.tax_percent,
      })),
    });
  }, [invoices, activeInvoiceId, linesByOrder, buyerById, ordersById, packingList]);

  const [docBusy, setDocBusy] = useState<'view' | 'download' | 'print' | null>(null);

  const handleView = async () => {
    setDocBusy('view');
    try {
      const blob = await buildBlobForActive();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      toast({ title: 'View failed', description: e?.message, variant: 'destructive' });
    } finally { setDocBusy(null); }
  };

  const handleDownload = async () => {
    setDocBusy('download');
    try {
      const blob = await buildBlobForActive();
      if (!blob) return;
      const inv = invoices.find(i => i.id === activeInvoiceId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${inv?.invoice_number || 'invoice'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: 'Download failed', description: e?.message, variant: 'destructive' });
    } finally { setDocBusy(null); }
  };

  const handlePrint = async () => {
    setDocBusy('print');
    try {
      const blob = await buildBlobForActive();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (w) {
        w.addEventListener('load', () => { try { w.focus(); w.print(); } catch {} });
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      toast({ title: 'Print failed', description: e?.message, variant: 'destructive' });
    } finally { setDocBusy(null); }
  };


  const activeInvoice = invoices.find(i => i.id === activeInvoiceId) || null;
  const activeOrder = activeInvoice ? ordersById[activeInvoice.order_id] : null;
  const activeLines = activeInvoice ? (linesByOrder[activeInvoice.order_id] || []) : [];
  const distributor = activeInvoice?.distributor_id ? (buyerById[activeInvoice.distributor_id] || null) : null;

  const totals = useMemo(() => {
    let gross = 0, disc = 0, taxable = 0, tax = 0;
    activeLines.forEach(l => {
      if (l.packed_qty <= 0) return;
      const g = l.packed_qty * l.unit_price;
      const d = g * l.discount_percent / 100;
      const t = (g - d);
      const x = t * l.tax_percent / 100;
      gross += g; disc += d; taxable += t; tax += x;
    });
    return { gross, disc, taxable, tax, total: taxable + tax };
  }, [activeLines]);

  const allFinalized = invoiceStats.expected > 0 && invoiceStats.finalized === invoiceStats.expected;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No invoices yet — show empty state with generate
  if (invoices.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <StatusTimeline status={packingList.status} />
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">INVOICE PENDING</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-12 text-center space-y-4">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
            <h3 className="text-lg font-semibold">No invoices generated yet</h3>
            <p className="text-sm text-muted-foreground">
              Generate one draft invoice per primary order on this packing list. Billed quantity is the packed quantity.
            </p>
            <Button onClick={handleGenerate} disabled={hookLoading}>
              <FileText className="h-4 w-4 mr-1" /> Generate Invoices
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
          <StatusTimeline status={packingList.status} />
          <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300">INVOICE GENERATED</Badge>
        </CardContent>
      </Card>

      {/* Header bar */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">
                  {activeInvoice?.status === 'finalized'
                    ? activeInvoice.invoice_number
                    : 'Draft invoice (no number assigned)'}
                </h3>
                <Badge
                  className={activeInvoice?.status === 'finalized'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'}
                >
                  {(activeInvoice?.status || 'draft').toUpperCase()}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {activeInvoice?.status === 'finalized' && activeInvoice.finalized_at
                  ? `Finalized: ${format(new Date(activeInvoice.finalized_at), 'dd MMM yyyy, HH:mm')}`
                  : activeInvoice?.invoice_date
                    ? `Invoice date: ${format(new Date(activeInvoice.invoice_date), 'dd MMM yyyy')}`
                    : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleView} disabled={docBusy !== null}>
              {docBusy === 'view' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Eye className="h-4 w-4 mr-1" />} View
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload} disabled={docBusy !== null}>
              {docBusy === 'download' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />} Download
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={docBusy !== null}>
              {docBusy === 'print' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />} Print
            </Button>
            {activeInvoice && activeInvoice.status !== 'finalized' ? (
              <Button size="sm" onClick={() => handleFinalize(activeInvoice.id)} disabled={hookLoading}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Finalize Invoice
              </Button>
            ) : activeInvoice ? (
              <Button size="sm" disabled variant="secondary">
                <CheckCircle2 className="h-4 w-4 mr-1" /> Finalized ✓
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Invoice switcher when multiple */}
      {invoices.length > 1 && (
        <Tabs value={activeInvoiceId || ''} onValueChange={setActiveInvoiceId}>
          <TabsList className="flex-wrap h-auto">
            {invoices.map(inv => (
              <TabsTrigger key={inv.id} value={inv.id}>
                {inv.status === 'finalized' ? inv.invoice_number : 'Draft'}
                <span className="ml-2 text-xs text-muted-foreground">
                  {ordersById[inv.order_id]?.order_number}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          {invoices.map(inv => <TabsContent key={inv.id} value={inv.id} />)}
        </Tabs>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <InfoCard title="Invoice Details" rows={[
          ['Number', activeInvoice?.status === 'finalized' ? (activeInvoice.invoice_number || '—') : '— (assigned on finalize)'],
          ['Date', activeInvoice ? format(new Date(activeInvoice.invoice_date), 'dd MMM yyyy') : '—'],
          ['Status', (activeInvoice?.status || 'draft').toUpperCase()],
        ]} />
        <InfoCard title="Distributor" rows={[
          ['Name', distributor?.name || '—'],
          ['GSTIN', distributor?.gst_number || '—'],
          ['State', distributor?.state || '—'],
          ['Contact', distributor?.phone || distributor?.contact_person || '—'],
        ]} />
        <InfoCard title="Order Reference" rows={[
          ['PO #', activeOrder?.order_number || '—'],
          ['Order date', activeOrder?.order_date ? format(new Date(activeOrder.order_date), 'dd MMM yyyy') : '—'],
          ['Ordered qty', String(activeLines.reduce((s, l) => s + l.ordered_qty, 0))],
          ['Packed qty', String(activeLines.reduce((s, l) => s + l.packed_qty, 0))],
        ]} />
        <InfoCard title="Payment Terms" rows={[
          ['Term', activeOrder?.payment_terms || activeOrder?.payment_term || '—'],
          ['Credit limit', distributor?.credit_limit != null ? fmt(distributor.credit_limit) : '—'],
          ['Available credit', activeOrder?.available_credit_at_order != null ? fmt(activeOrder.available_credit_at_order) : '—'],
          ['Due date', activeInvoice?.due_date ? format(new Date(activeInvoice.due_date), 'dd MMM yyyy') : '—'],
        ]} />
      </div>

      {/* Items + summary */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <Card>
          <CardContent className="p-0">
            <div className="p-4 border-b">
              <h3 className="font-semibold">Invoice Items</h3>
              <p className="text-xs text-muted-foreground">Billed on packed quantity. Short qty shown for information only.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">#</th>
                    <th className="text-left p-2">Product</th>
                    <th className="text-left p-2">HSN</th>
                    <th className="text-right p-2">Ordered</th>
                    <th className="text-right p-2">Packed</th>
                    <th className="text-right p-2">Rate</th>
                    <th className="text-right p-2">Disc %</th>
                    <th className="text-right p-2">Taxable</th>
                    <th className="text-right p-2">GST %</th>
                    <th className="text-right p-2">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {activeLines.map((l, i) => {
                    const gross = l.packed_qty * l.unit_price;
                    const taxable = gross - (gross * l.discount_percent / 100);
                    const amount = taxable * (1 + l.tax_percent / 100);
                    const isShort = l.packed_qty < l.ordered_qty;
                    return (
                      <tr key={l.id} className={isShort ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}>
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2 font-medium">{l.product_name}</td>
                        <td className="p-2 font-mono text-xs">{l.hsn_code || '—'}</td>
                        <td className="p-2 text-right">{l.ordered_qty}</td>
                        <td className="p-2 text-right">
                          <span className={isShort ? 'inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium' : ''}>
                            {isShort && <AlertTriangle className="h-3 w-3" />}
                            {l.packed_qty.toFixed(l.packed_qty % 1 ? 2 : 0)}
                          </span>
                        </td>
                        <td className="p-2 text-right">{fmt(l.unit_price)}</td>
                        <td className="p-2 text-right">{l.discount_percent}%</td>
                        <td className="p-2 text-right">{fmt(taxable)}</td>
                        <td className="p-2 text-right">{l.tax_percent}%</td>
                        <td className="p-2 text-right font-medium">{fmt(amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/30 text-sm">
                  <tr>
                    <td colSpan={9} className="p-2 text-right font-semibold">Grand Total</td>
                    <td className="p-2 text-right font-bold">{fmt(totals.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <h4 className="text-sm font-semibold mb-2">Invoice Summary</h4>
            <SummaryRow label="Gross Value" value={fmt(totals.gross)} />
            <SummaryRow label="Trade Discount" value={`- ${fmt(totals.disc)}`} />
            <SummaryRow label="Scheme Discount" value={fmt(0)} />
            <SummaryRow label="Taxable Value" value={fmt(totals.taxable)} />
            <SummaryRow label="CGST" value={fmt(totals.tax / 2)} />
            <SummaryRow label="SGST" value={fmt(totals.tax / 2)} />
            <div className="border-t mt-2 pt-2">
              <SummaryRow label="Grand Total" value={fmt(totals.total)} bold />
            </div>
            <p className="text-[11px] text-muted-foreground italic pt-2">
              {numberToWords(totals.total)} only
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Next-step bar — gated until every invoice on the list is finalized */}
      <div className="sticky bottom-0 bg-card border-t -mx-4 px-4 py-3 flex items-center justify-between gap-3 z-10">
        <p className="text-xs text-muted-foreground">
          {allFinalized
            ? 'All invoices finalized. Ready to prepare for dispatch.'
            : `Invoices finalized (${invoiceStats.finalized}/${invoiceStats.expected}) — finalize all invoices to unlock dispatch.`}
        </p>
        <Button onClick={handleProceedToDispatch} disabled={!allFinalized}>
          Prepare for Dispatch <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function InfoCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <Card>
      <CardContent className="p-4">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{title}</h4>
        <dl className="space-y-1 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-2">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-sm font-medium text-right truncate">{v}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between text-sm ${bold ? 'font-bold' : ''}`}>
      <span className={bold ? '' : 'text-muted-foreground'}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
