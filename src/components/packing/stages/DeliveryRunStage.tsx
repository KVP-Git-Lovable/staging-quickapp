import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Truck, MapPin, User, FileText, CheckCircle2, Loader2, Send, AlertTriangle,
  Download, ArrowRight, Map as MapIcon, Pencil, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { usePackingList, PackingList } from '@/hooks/usePackingList';
import { useToast } from '@/hooks/use-toast';
import StatusTimeline from './StatusTimeline';

interface DispatchRow {
  id: string;
  product_name: string;
  unit: string | null;
  batch_number: string | null;
  packed_qty: number;
  dispatched_qty: number;
  delivered_qty: number;
}

interface Agent { id: string; full_name: string; }

interface Props {
  packingList: PackingList;
  onStatusChange: (s: string) => void;
}

export default function DeliveryRunStage({ packingList, onStatusChange }: Props) {
  const { toast } = useToast();
  const { assignDriverAndCreateRun, updateDriverAssignment, updatePackingListStatus, loading: hookLoading } = usePackingList();

  const [rows, setRows] = useState<DispatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState<any | null>(null);
  const [run, setRun] = useState<any | null>(null);
  const [editMode, setEditMode] = useState(false);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [deliveryMode, setDeliveryMode] = useState('direct');
  const [routeNotes, setRouteNotes] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: items } = await supabase
          .from('packing_list_items')
          .select(`id, product_name, unit, packing_list_item_batches(id, batch_number, packed_qty)`)
          .eq('packing_list_id', packingList.id);

        const flat: DispatchRow[] = [];
        (items || []).forEach((it: any) => {
          (it.packing_list_item_batches || []).forEach((b: any) => {
            if (Number(b.packed_qty || 0) <= 0) return;
            flat.push({
              id: b.id,
              product_name: it.product_name,
              unit: it.unit,
              batch_number: b.batch_number,
              packed_qty: Number(b.packed_qty),
              dispatched_qty: packingList.status === 'dispatched' || packingList.status === 'delivered' || packingList.status === 'completed' ? Number(b.packed_qty) : 0,
              delivered_qty: packingList.status === 'delivered' || packingList.status === 'completed' ? Number(b.packed_qty) : 0,
            });
          });
        });
        if (!cancelled) setRows(flat);

        const { data: assigns } = await supabase
          .from('packing_list_assignments')
          .select('*')
          .eq('packing_list_id', packingList.id)
          .limit(1);
        if (!cancelled && assigns && assigns.length > 0) setAssignment(assigns[0]);

        const { data: links } = await (supabase as any)
          .from('delivery_run_packing_lists')
          .select('delivery_run_id')
          .eq('packing_list_id', packingList.id)
          .limit(1);
        if (links && links.length > 0) {
          const { data: r } = await (supabase as any).from('delivery_runs').select('*').eq('id', links[0].delivery_run_id).single();
          if (!cancelled) setRun(r);
        }

        const { data: profiles } = await supabase.from('profiles').select('id, full_name').limit(200);
        if (!cancelled) {
          setAgents((profiles || []).filter((p: any) => p.full_name).map((p: any) => ({ id: p.id, full_name: p.full_name })));
        }
      } catch (err: any) {
        toast({ title: 'Error', description: err?.message || 'Failed to load dispatch data', variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [packingList.id, packingList.status, toast]);

  const totals = useMemo(() => ({
    packed: rows.reduce((s, r) => s + r.packed_qty, 0),
    dispatched: rows.reduce((s, r) => s + r.dispatched_qty, 0),
    delivered: rows.reduce((s, r) => s + r.delivered_qty, 0),
  }), [rows]);

  const isAssigned = !!assignment;
  const isDispatched = packingList.status === 'dispatched' || packingList.status === 'delivered' || packingList.status === 'completed';
  const isDelivered = packingList.status === 'delivered' || packingList.status === 'completed';

  const handleAssign = async () => {
    if (!agentId) {
      toast({ title: 'Select driver', description: 'Driver/Agent is required', variant: 'destructive' });
      return;
    }
    const fn = isAssigned ? updateDriverAssignment : assignDriverAndCreateRun;
    const res = await fn(packingList.id, {
      agentId,
      vehicleNumber,
      driverName,
      deliveryMode,
      notes: routeNotes,
    });
    if (res.success) {
      if (res.assignment) setAssignment(res.assignment);
      if (res.run) setRun(res.run);
      setEditMode(false);
    }
  };

  const startEdit = () => {
    setAgentId(assignment?.agent_id || '');
    setVehicleNumber(run?.vehicle_number || assignment?.van_id || '');
    setDriverName(run?.driver_name || '');
    setDeliveryMode(run?.delivery_mode || 'direct');
    setRouteNotes(run?.notes || '');
    setEditMode(true);
  };

  const handleDispatch = async () => {
    const ok = await updatePackingListStatus(packingList.id, 'dispatched');
    if (ok) {
      onStatusChange('dispatched');
      setRows(prev => prev.map(r => ({ ...r, dispatched_qty: r.packed_qty })));
    }
  };

  const handleCompleteRun = async () => {
    const allDelivered = rows.every(r => r.delivered_qty >= r.dispatched_qty);
    if (!allDelivered) {
      toast({ title: 'Update delivery', description: 'Set delivered qty for every line first', variant: 'destructive' });
      return;
    }
    const ok = await updatePackingListStatus(packingList.id, 'completed');
    if (ok) {
      onStatusChange('completed');
      if (run?.id) {
        await (supabase as any).from('delivery_runs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', run.id);
      }
    }
  };

  const driverDisplay = useMemo(() => {
    if (!assignment) return '—';
    const a = agents.find(x => x.id === assignment.agent_id);
    return a?.full_name || run?.driver_name || 'Assigned';
  }, [assignment, agents, run]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
          <StatusTimeline status={packingList.status} />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={!run}><MapIcon className="h-4 w-4 mr-1" /> Track on Map</Button>
            {isDispatched && !isDelivered && (
              <Button size="sm" onClick={handleCompleteRun}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Update Delivery Status
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Driver assignment panel — built into Stage 3 */}
      {(!isAssigned || editMode) ? (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                {editMode ? 'Edit Driver, Vehicle & Route' : 'Assign Driver & Create Delivery Run'}
              </h3>
              {editMode && (
                <Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Driver / Agent *</Label>
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                  <SelectContent>
                    {agents.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Driver Name (display)</Label>
                <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="e.g. Ramesh Singh" />
              </div>
              <div>
                <Label className="text-xs">Vehicle Number</Label>
                <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="e.g. GJ-01-AB-1234" />
              </div>
              <div>
                <Label className="text-xs">Delivery Mode</Label>
                <Select value={deliveryMode} onValueChange={setDeliveryMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">Direct Delivery</SelectItem>
                    <SelectItem value="courier">Courier</SelectItem>
                    <SelectItem value="transporter">Transporter</SelectItem>
                    <SelectItem value="self_pickup">Self Pickup</SelectItem>
                    <SelectItem value="van_sales">Van Sales</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Route Notes</Label>
                <Input value={routeNotes} onChange={(e) => setRouteNotes(e.target.value)} placeholder="Origin → Destination, stops, KM…" />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={handleAssign} disabled={hookLoading || !agentId}>
                <Send className="h-4 w-4 mr-1" /> {editMode ? 'Save Changes' : 'Assign & Create Run'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Info cards */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">Delivery Assignment</h3>
            {!isDispatched && (
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit Driver / Vehicle / Route
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <InfoCard icon={<Truck className="h-4 w-4 text-primary" />} label="Delivery Run" value={run?.run_number || 'DR-—'} subtitle={isDispatched ? 'In Progress' : 'Planned'} />
            <InfoCard icon={<User className="h-4 w-4 text-primary" />} label="Driver / Agent" value={driverDisplay} />
            <InfoCard icon={<Truck className="h-4 w-4 text-primary" />} label="Vehicle" value={run?.vehicle_number || assignment.van_id || '—'} subtitle={run?.delivery_mode || ''} />
            <InfoCard icon={<MapPin className="h-4 w-4 text-primary" />} label="Route" value={run?.notes || '—'} />
            <InfoCard icon={<FileText className="h-4 w-4 text-primary" />} label="Items" value={`${totals.delivered} / ${totals.packed} Delivered`} />
            <InfoCard icon={<FileText className="h-4 w-4 text-primary" />} label="POD Status" value={isDelivered ? 'Received' : 'Pending'} accent={isDelivered ? 'text-emerald-600' : 'text-amber-600'} />
          </div>

          {/* Items table + side panels */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
            <Card>
              <CardContent className="p-0">
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
                          <th className="text-right p-2">Packed Qty</th>
                          <th className="text-right p-2">Dispatched Qty</th>
                          <th className="text-right p-2">Delivered Qty</th>
                          <th className="text-left p-2">Delivery Status</th>
                          <th className="text-center p-2">POD</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {rows.map((r, i) => {
                          const fullyDelivered = r.delivered_qty >= r.dispatched_qty && r.dispatched_qty > 0;
                          return (
                            <tr key={r.id}>
                              <td className="p-2 text-muted-foreground">{i + 1}</td>
                              <td className="p-2 font-medium">{r.product_name}</td>
                              <td className="p-2 font-mono text-xs">{r.batch_number || '—'}</td>
                              <td className="p-2 text-right">{r.packed_qty}</td>
                              <td className="p-2 text-right font-medium">{r.dispatched_qty}</td>
                              <td className="p-2 text-right">
                                {isDispatched && !isDelivered ? (
                                  <Input
                                    type="number"
                                    min={0}
                                    max={r.dispatched_qty}
                                    value={r.delivered_qty}
                                    onChange={(e) => {
                                      const v = Math.min(parseInt(e.target.value) || 0, r.dispatched_qty);
                                      setRows(prev => prev.map(x => x.id === r.id ? { ...x, delivered_qty: v } : x));
                                    }}
                                    className="h-7 w-16 text-right text-xs ml-auto"
                                  />
                                ) : (
                                  <span className="font-semibold">{r.delivered_qty}</span>
                                )}
                              </td>
                              <td className="p-2">
                                {fullyDelivered ? (
                                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">Delivered</Badge>
                                ) : r.dispatched_qty > 0 ? (
                                  <Badge variant="outline">Out for delivery</Badge>
                                ) : (
                                  <Badge variant="secondary">Pending</Badge>
                                )}
                              </td>
                              <td className="p-2 text-center">
                                {fullyDelivered ? (
                                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">Received</Badge>
                                ) : (
                                  <Badge variant="secondary">Pending</Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-muted/30 text-sm">
                        <tr>
                          <td colSpan={3} className="p-2 font-medium">Total</td>
                          <td className="p-2 text-right">{totals.packed}</td>
                          <td className="p-2 text-right">{totals.dispatched}</td>
                          <td className="p-2 text-right">{totals.delivered}</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardContent className="p-4">
                  <h4 className="text-sm font-semibold mb-3">Delivery Summary</h4>
                  <ul className="space-y-2 text-sm">
                    <SummaryRow label="Total Items" value={String(rows.length)} />
                    <SummaryRow label="Packed" value={String(totals.packed)} />
                    <SummaryRow label="Dispatched" value={String(totals.dispatched)} />
                    <SummaryRow label="Delivered" value={String(totals.delivered)} accent="text-emerald-600" />
                    <SummaryRow label="Started At" value={run?.start_time ? format(new Date(run.start_time), 'dd MMM, hh:mm a') : '—'} />
                    <SummaryRow label="Completed" value={run?.completed_at ? format(new Date(run.completed_at), 'dd MMM, hh:mm a') : '—'} />
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <h4 className="text-sm font-semibold mb-3">Activity Timeline</h4>
                  <ul className="space-y-2 text-sm">
                    {assignment && (
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span>Driver assigned</span>
                      </li>
                    )}
                    {isDispatched && (
                      <li className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-amber-600" />
                        <span>Out for delivery</span>
                      </li>
                    )}
                    {isDelivered && (
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span>Delivered ({totals.delivered}/{totals.packed})</span>
                      </li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Bottom actions */}
          <div className="sticky bottom-0 bg-card border-t -mx-4 px-4 py-3 flex items-center justify-between gap-3 z-10 flex-wrap">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => toast({ title: 'Coming soon', description: 'Return flow' })}>
                Add Return
              </Button>
              <Button variant="outline" size="sm" className="text-destructive border-destructive/30" onClick={() => toast({ title: 'Reported', description: 'Issue logged' })}>
                <AlertTriangle className="h-4 w-4 mr-1" /> Report Issue
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!isDelivered}>
                <Download className="h-4 w-4 mr-1" /> Download POD
              </Button>
              {!isDispatched && (
                <Button onClick={handleDispatch}>
                  <Truck className="h-4 w-4 mr-1" /> Mark Dispatched
                </Button>
              )}
              {isDispatched && !isDelivered && (
                <Button onClick={handleCompleteRun}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Complete Delivery Run
                </Button>
              )}
              {isDelivered && (
                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 px-3 py-1">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Closed
                </Badge>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function InfoCard({ icon, label, value, subtitle, accent }: { icon: React.ReactNode; label: string; value: string; subtitle?: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{icon}{label}</div>
        <p className={`text-sm font-semibold mt-1 truncate ${accent || ''}`}>{value}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`text-sm font-medium ${accent || ''}`}>{value}</span>
    </li>
  );
}
