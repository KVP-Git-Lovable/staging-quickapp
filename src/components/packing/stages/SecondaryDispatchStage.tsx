import { useEffect, useState } from 'react';
import {
  Truck, Loader2, CheckCircle2, FileText, IndianRupee, Users, Package, ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { usePackingList, PackingList } from '@/hooks/usePackingList';
import StatusTimeline from './StatusTimeline';

interface Props { packingList: PackingList; onStatusChange: (s?: string) => void; }

interface OrderRow {
  id: string;
  retailer_id: string | null;
  retailer_name: string | null;
  total_amount: number | null;
  invoice_number: string | null;
  delivery_status: string | null;
}

const EWAY_THRESHOLD = 50000;

const inr = (n: number | null | undefined) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SecondaryDispatchStage({ packingList, onStatusChange }: Props) {
  const { updatePackingListStatus } = usePackingList();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingReady, setMarkingReady] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dispatching, setDispatching] = useState(false);

  // Optional transport inputs (display-only this phase)
  const [vehicle, setVehicle] = useState('');
  const [driver, setDriver] = useState('');
  const [transporter, setTransporter] = useState('');

  const loadOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('id, retailer_id, retailer_name, total_amount, invoice_number, delivery_status')
      .eq('packing_list_id', packingList.id)
      .order('created_at', { ascending: true });
    setOrders((data as OrderRow[]) || []);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('orders')
          .select('id, retailer_id, retailer_name, total_amount, invoice_number, delivery_status')
          .eq('packing_list_id', packingList.id)
          .order('created_at', { ascending: true });
        if (!cancelled) setOrders((data as OrderRow[]) || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [packingList.id]);

  const status = packingList.status;
  const totalValue = Number(packingList.total_value || 0);
  const ewayRequired = totalValue >= EWAY_THRESHOLD;

  const handleMarkReady = async () => {
    setMarkingReady(true);
    try {
      const ok = await updatePackingListStatus(packingList.id, 'ready');
      if (ok) {
        toast.success('Packing list marked ready');
        onStatusChange('ready');
      }
    } finally {
      setMarkingReady(false);
    }
  };

  const handleDispatch = async () => {
    setDispatching(true);
    try {
      const { data, error } = await supabase.rpc('dispatch_secondary_packing_list' as any, {
        p_packing_list_id: packingList.id,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      const payload: any = data;
      const n = payload?.invoicing?.invoices_created ?? 0;
      const reused = payload?.invoicing?.invoices_reused ?? 0;
      toast.success(
        `Dispatched · ${n} invoice${n === 1 ? '' : 's'} generated` +
          (reused > 0 ? ` · ${reused} reused` : ''),
      );
      setDialogOpen(false);
      await loadOrders();
      onStatusChange('dispatched');
    } catch (err: any) {
      toast.error(err?.message || 'Dispatch failed');
    } finally {
      setDispatching(false);
    }
  };

  const handleDeliverStub = () => {
    toast.info('Coming in next update');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const retailerCount = new Set(orders.map((o) => o.retailer_id).filter(Boolean)).size;
  const invoicedCount = orders.filter((o) => o.invoice_number).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
          <StatusTimeline status={packingList.status} />
          {status === 'dispatched' && (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              <Truck className="h-3 w-3 mr-1" /> DISPATCHED
            </Badge>
          )}
          {(status === 'delivered' || status === 'completed') && (
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3 mr-1" /> DELIVERED
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Users className="h-4 w-4" />} label="RETAILERS" value={`${retailerCount}`} sub="orders" />
        <StatCard icon={<Package className="h-4 w-4" />} label="ITEMS" value={`${packingList.total_items ?? 0}`} sub="units" />
        <StatCard icon={<IndianRupee className="h-4 w-4" />} label="LOAD VALUE" value={inr(totalValue)} />
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label="INVOICES"
          value={`${invoicedCount}/${orders.length}`}
          sub={invoicedCount ? 'generated' : 'pending'}
        />
      </div>

      {/* Orders table with invoice_number + delivery_status */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Retailer</th>
                <th className="text-right px-4 py-2">Amount</th>
                <th className="text-left px-4 py-2">Invoice #</th>
                <th className="text-left px-4 py-2">Delivery</th>
                {status === 'dispatched' && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted-foreground py-6">No orders on this list.</td>
                </tr>
              )}
              {orders.map((o) => (
                <tr key={o.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{o.retailer_name || '—'}</td>
                  <td className="px-4 py-2 text-right">{inr(o.total_amount)}</td>
                  <td className="px-4 py-2">
                    {o.invoice_number ? (
                      <span className="font-mono text-xs">{o.invoice_number}</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className="text-[10px]">
                      {(o.delivery_status || 'pending').toUpperCase()}
                    </Badge>
                  </td>
                  {status === 'dispatched' && (
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={handleDeliverStub}>
                        Deliver
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Status-driven primary action */}
      <div className="sticky bottom-0 bg-card border-t -mx-4 px-4 py-3 flex items-center justify-between gap-3 z-10 flex-wrap">
        <div className="text-xs text-muted-foreground">
          {status === 'picking' || status === 'packed'
            ? 'Mark this list ready to enable dispatch.'
            : status === 'ready'
              ? 'Dispatching will generate one invoice per retailer order.'
              : status === 'dispatched'
                ? 'Invoices generated. Per-stop delivery arrives in the next update.'
                : 'This list has been delivered.'}
        </div>
        {(status === 'picking' || status === 'packed') && (
          <Button variant="secondary" onClick={handleMarkReady} disabled={markingReady}>
            {markingReady && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Mark ready
          </Button>
        )}
        {status === 'ready' && (
          <Button onClick={() => setDialogOpen(true)}>
            <Truck className="h-4 w-4 mr-1" /> Dispatch and generate invoice
          </Button>
        )}
      </div>

      {/* Dispatch modal */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !dispatching && setDialogOpen(o)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dispatch and generate invoice</DialogTitle>
            <DialogDescription>
              One invoice will be generated per retailer order. This action is atomic.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Retailer</th>
                    <th className="text-right px-3 py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-t">
                      <td className="px-3 py-2">{o.retailer_name || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{inr(o.total_amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t bg-muted/30 font-semibold">
                    <td className="px-3 py-2">Load value</td>
                    <td className="px-3 py-2 text-right font-mono">{inr(totalValue)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Vehicle number</Label>
                <Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="KA-01-AB-1234" />
              </div>
              <div>
                <Label className="text-xs">Driver name</Label>
                <Input value={driver} onChange={(e) => setDriver(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Transporter</Label>
                <Input value={transporter} onChange={(e) => setTransporter(e.target.value)} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground -mt-2">
              Transport details are informational for this phase and are not sent with the dispatch.
            </p>

            <div className="rounded-md border p-3 flex items-start gap-2 text-sm">
              <ShieldAlert className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div className="flex-1">
                <div className="font-medium">E-way bill</div>
                {ewayRequired ? (
                  <div className="text-xs text-muted-foreground">
                    Load value {inr(totalValue)} ≥ {inr(EWAY_THRESHOLD)}.{' '}
                    <span className="italic">Capture e-way (Phase 4)</span>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">Not required (below {inr(EWAY_THRESHOLD)}).</div>
                )}
              </div>
              {ewayRequired && (
                <Button size="sm" variant="outline" disabled>
                  Capture e-way
                </Button>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={dispatching}>
              Cancel
            </Button>
            <Button onClick={handleDispatch} disabled={dispatching || orders.length === 0}>
              {dispatching && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Confirm dispatch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-[10px] uppercase text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-1 text-lg font-semibold">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
