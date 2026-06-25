import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, FileText, Truck, MapPin, IndianRupee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PackingList } from '@/hooks/usePackingList';

interface Props { packingList: PackingList; }

interface OrderStop {
  id: string;
  order_number: string | null;
  retailer_id: string;
  retailer_name: string;
  total_amount: number;
  delivery_status: string | null;
  invoice_number: string | null;
  items: Array<{ id: string; product_id: string; product_name: string; quantity: number; rate: number; uom_code?: string; unit?: string }>;
}

export default function SecondaryRetailerStops({ packingList }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stops, setStops] = useState<OrderStop[]>([]);
  const [activeStop, setActiveStop] = useState<OrderStop | null>(null);
  const [delivered, setDelivered] = useState<Record<string, number>>({});
  const [returned, setReturned] = useState<Record<string, number>>({});
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<string>('cash');
  const [podUrl, setPodUrl] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const { data: orders } = await supabase
        .from('orders')
        .select('id, order_number, retailer_id, total_amount, delivery_status, invoice_number, retailers(name)')
        .eq('packing_list_id', packingList.id);

      const orderIds = (orders || []).map((o: any) => o.id);
      let itemsByOrder: Record<string, any[]> = {};
      if (orderIds.length) {
        const { data: items } = await supabase
          .from('order_items')
          .select('id, order_id, product_id, product_name, quantity, rate, uom_code, unit')
          .in('order_id', orderIds);
        itemsByOrder = (items || []).reduce((acc: any, it: any) => {
          (acc[it.order_id] = acc[it.order_id] || []).push(it);
          return acc;
        }, {});
      }
      setStops((orders || []).map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        retailer_id: o.retailer_id,
        retailer_name: o.retailers?.name || '—',
        total_amount: Number(o.total_amount || 0),
        delivery_status: o.delivery_status,
        invoice_number: o.invoice_number,
        items: itemsByOrder[o.id] || [],
      })));
    } finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, [packingList.id]);

  const openStop = (s: OrderStop) => {
    setActiveStop(s);
    const d: Record<string, number> = {};
    const r: Record<string, number> = {};
    s.items.forEach(it => { d[it.id] = Number(it.quantity); r[it.id] = 0; });
    setDelivered(d); setReturned(r);
    setPaymentAmount('0'); setPaymentMode('cash'); setPodUrl('');
  };

  const handleConfirm = async () => {
    if (!activeStop) return;
    setSubmitting(true);
    try {
      const p_items = activeStop.items.map(it => ({
        order_item_id: it.id,
        product_id: it.product_id,
        delivered_qty: Number(delivered[it.id] || 0),
        returned_qty: Number(returned[it.id] || 0),
      }));
      const { data, error } = await (supabase as any).rpc('deliver_and_invoice_retailer_order', {
        p_order_id: activeStop.id,
        p_delivered_items: p_items,
        p_pod_url: podUrl || null,
        p_payment: { amount: Number(paymentAmount || 0), method: paymentMode },
      });
      if (error) throw error;
      toast({ title: data?.reused ? 'Already invoiced' : 'Invoice generated', description: data?.invoice_number });
      setActiveStop(null);
      await reload();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /> Retailer stops</h3>
            <Badge variant="outline" className="text-xs">{stops.length} stops</Badge>
          </div>
          <div className="space-y-2">
            {stops.map(s => {
              const isInvoiced = !!s.invoice_number;
              return (
                <div key={s.id} className="flex items-center justify-between p-3 border rounded-md">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium truncate">{s.retailer_name}</span>
                      <Badge variant="outline" className="text-[10px]">{s.order_number || s.id.slice(0, 8)}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      <IndianRupee className="h-3 w-3" /> ₹{s.total_amount.toLocaleString('en-IN')}
                      {isInvoiced && <span className="text-emerald-600">· Invoice {s.invoice_number}</span>}
                    </div>
                  </div>
                  {isInvoiced ? (
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Delivered
                    </Badge>
                  ) : (
                    <Button size="sm" onClick={() => openStop(s)}>
                      <FileText className="h-4 w-4 mr-1" /> Confirm &amp; Invoice
                    </Button>
                  )}
                </div>
              );
            })}
            {stops.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">No retailer stops found.</div>}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!activeStop} onOpenChange={(o) => !o && setActiveStop(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Confirm delivery — {activeStop?.retailer_name}</DialogTitle></DialogHeader>
          {activeStop && (
            <div className="space-y-3">
              <div className="overflow-x-auto max-h-[280px]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left p-2">Product</th>
                      <th className="text-right p-2">Ordered</th>
                      <th className="text-right p-2">Delivered</th>
                      <th className="text-right p-2">Returned</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {activeStop.items.map(it => (
                      <tr key={it.id}>
                        <td className="p-2">{it.product_name}</td>
                        <td className="p-2 text-right">{it.quantity}</td>
                        <td className="p-2 text-right">
                          <Input type="number" min={0} max={it.quantity} value={delivered[it.id] ?? 0}
                            onChange={e => {
                              const v = Math.max(0, Math.min(Number(e.target.value || 0), it.quantity));
                              setDelivered(prev => ({ ...prev, [it.id]: v }));
                              setReturned(prev => ({ ...prev, [it.id]: Math.max(0, it.quantity - v) }));
                            }}
                            className="h-7 w-16 text-right text-xs ml-auto" />
                        </td>
                        <td className="p-2 text-right">
                          <Input type="number" min={0} max={it.quantity} value={returned[it.id] ?? 0}
                            onChange={e => {
                              const v = Math.max(0, Math.min(Number(e.target.value || 0), it.quantity));
                              setReturned(prev => ({ ...prev, [it.id]: v }));
                            }}
                            className="h-7 w-16 text-right text-xs ml-auto" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Payment collected</Label>
                  <Input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Mode</Label>
                  <Select value={paymentMode} onValueChange={setPaymentMode}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="credit">Credit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">POD URL (optional)</Label>
                  <Input value={podUrl} onChange={e => setPodUrl(e.target.value)} placeholder="Photo/signature URL" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveStop(null)}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <CheckCircle2 className="h-4 w-4 mr-1" /> Confirm delivery &amp; generate invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
