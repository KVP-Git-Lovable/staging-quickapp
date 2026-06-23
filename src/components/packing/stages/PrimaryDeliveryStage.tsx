import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Truck, Loader2, PackageCheck, Clock, FileCheck2, Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { PackingList } from '@/hooks/usePackingList';
import StatusTimeline from './StatusTimeline';

interface Props {
  packingList: PackingList;
  onStatusChange: (s?: string) => void;
}

interface GrnLineRow {
  product_name: string;
  unit: string | null;
  ordered_quantity: number;
  received_quantity: number;
  damaged_quantity: number;
}

interface GrnSummary {
  id: string;
  grn_number: string | null;
  received_at: string | null;
  confirmed_at: string | null;
  order_number: string | null;
  lines: GrnLineRow[];
}

export default function PrimaryDeliveryStage({ packingList }: Props) {
  const pl = packingList as any;
  const [loading, setLoading] = useState(true);
  const [childName, setChildName] = useState<string>('');
  const [grns, setGrns] = useState<GrnSummary[]>([]);

  const isDelivered = pl.status === 'delivered' || pl.status === 'completed';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: orders } = await supabase
          .from('primary_orders')
          .select('id, order_number, target_distributor_id')
          .eq('packing_list_id', packingList.id);

        if (cancelled) return;
        const orderRows = orders || [];
        const childId = orderRows[0]?.target_distributor_id;
        if (childId) {
          const { data: dist } = await supabase
            .from('distributors')
            .select('name')
            .eq('id', childId)
            .maybeSingle();
          if (!cancelled) setChildName((dist as any)?.name || '');
        }

        if (isDelivered && orderRows.length) {
          const orderIds = orderRows.map((o: any) => o.id);
          const { data: grnRows } = await supabase
            .from('goods_receipt_notes')
            .select('id, grn_number, received_at, confirmed_at, order_id, grn_items(product_name, unit, ordered_quantity, received_quantity, damaged_quantity)')
            .in('order_id', orderIds);

          if (cancelled) return;
          const orderMap = new Map(orderRows.map((o: any) => [o.id, o.order_number]));
          const summaries: GrnSummary[] = (grnRows || []).map((g: any) => ({
            id: g.id,
            grn_number: g.grn_number,
            received_at: g.received_at,
            confirmed_at: g.confirmed_at,
            order_number: orderMap.get(g.order_id) || null,
            lines: (g.grn_items || []).map((l: any) => ({
              product_name: l.product_name,
              unit: l.unit,
              ordered_quantity: Number(l.ordered_quantity || 0),
              received_quantity: Number(l.received_quantity || 0),
              damaged_quantity: Number(l.damaged_quantity || 0),
            })),
          }));
          setGrns(summaries);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [packingList.id, isDelivered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-primary">Stage B</span>
        <h2 className="text-base font-semibold">Delivery</h2>
        <Badge variant="outline" className="text-[10px] tracking-wide bg-primary/5 border-primary/20 text-primary">
          {isDelivered ? 'DELIVERED' : 'AWAITING GOODS RECEIPT'}
        </Badge>
      </div>

      {/* Header / status */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${isDelivered ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                {isDelivered
                  ? <PackageCheck className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
                  : <Truck className="h-5 w-5 text-amber-700 dark:text-amber-300" />}
              </div>
              <div>
                <h3 className="text-lg font-semibold">{packingList.packing_list_number}</h3>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {childName ? `Child distributor: ${childName}` : 'Child distributor'}
                </p>
              </div>
            </div>
            <Badge className={isDelivered ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'}>
              {isDelivered ? 'DELIVERED' : 'DISPATCHED'}
            </Badge>
          </div>
          <StatusTimeline status={packingList.status} />
        </CardContent>
      </Card>

      {/* Logistics — read-only */}
      <Card>
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Truck className="h-4 w-4 text-primary" /> Dispatch Logistics
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <ReadOnlyField label="Vehicle" value={pl.dispatch_vehicle} />
            <ReadOnlyField label="Driver" value={pl.dispatch_driver} />
            <ReadOnlyField label="Driver Phone" value={pl.driver_phone} />
            <ReadOnlyField label="Transporter" value={pl.transporter_name} />
            <ReadOnlyField label="LR / GR No." value={pl.lr_gr_number} />
            <ReadOnlyField label="Vehicle Type" value={pl.vehicle_type} />
            <ReadOnlyField label="Packages" value={pl.total_packages} />
            <ReadOnlyField label="Dispatched At" value={pl.dispatched_at ? format(new Date(pl.dispatched_at), 'dd MMM yyyy HH:mm') : null} />
          </div>
          {pl.dispatch_destination && (
            <div className="mt-3 text-xs text-muted-foreground">
              Destination: <span className="text-foreground font-medium">{pl.dispatch_destination}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* State-specific body */}
      {!isDelivered ? (
        <Card className="border-amber-200 bg-amber-50/60 dark:bg-amber-900/10 dark:border-amber-900/40">
          <CardContent className="p-6 flex items-start gap-3">
            <Clock className="h-5 w-5 text-amber-700 dark:text-amber-300 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                In transit — awaiting goods receipt from {childName || 'child distributor'}
              </h4>
              <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-1">
                This packing list will be automatically marked Delivered once the child distributor confirms
                their Goods Receipt Note (GRN) for every linked primary order. No manual confirmation is required here.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4">
            <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <FileCheck2 className="h-4 w-4 text-emerald-600" /> Goods Receipt Summary
            </h4>
            {grns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No GRN records found.</p>
            ) : (
              <div className="space-y-4">
                {grns.map((g) => (
                  <div key={g.id} className="rounded-md border">
                    <div className="px-3 py-2 border-b bg-muted/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="font-medium text-foreground">
                        GRN: <span className="text-primary">{g.grn_number || g.id.slice(0, 8)}</span>
                        {g.order_number && <span className="text-muted-foreground"> · Order {g.order_number}</span>}
                      </div>
                      <div className="text-muted-foreground">
                        Received: {g.received_at ? format(new Date(g.received_at), 'dd MMM yyyy HH:mm') : '—'}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b">
                            <th className="text-left py-2 px-3">Product</th>
                            <th className="text-right py-2 px-3 w-24">Ordered</th>
                            <th className="text-right py-2 px-3 w-24">Received</th>
                            <th className="text-right py-2 px-3 w-24">Damaged</th>
                            <th className="text-right py-2 px-3 w-24">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.lines.map((l, i) => {
                            const full = l.received_quantity >= l.ordered_quantity;
                            return (
                              <tr key={i} className="border-b last:border-b-0">
                                <td className="py-2 px-3 font-medium">{l.product_name}</td>
                                <td className="py-2 px-3 text-right">{l.ordered_quantity}{l.unit ? ` ${l.unit}` : ''}</td>
                                <td className="py-2 px-3 text-right">{l.received_quantity}</td>
                                <td className="py-2 px-3 text-right">{l.damaged_quantity || 0}</td>
                                <td className="py-2 px-3 text-right">
                                  <span className={full ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                                    {full ? 'Full' : `Short ${l.ordered_quantity - l.received_quantity}`}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}
