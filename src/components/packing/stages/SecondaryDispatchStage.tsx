import { useEffect, useMemo, useState } from 'react';
import {
  FileText, Truck, ArrowRight, Loader2, AlertTriangle, CheckCircle2, ShieldAlert,
  Printer, Users, IndianRupee, Boxes, User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { usePackingList, PackingList } from '@/hooks/usePackingList';
import { useToast } from '@/hooks/use-toast';
import StatusTimeline from './StatusTimeline';

interface Props { packingList: PackingList; onStatusChange: (s: string) => void; }

const DEFAULT_THRESHOLD = 50000;

export default function SecondaryDispatchStage({ packingList, onStatusChange }: Props) {
  const { toast } = useToast();
  const { updatePackingListStatus, assignDriverAndCreateRun, loading: hookLoading } = usePackingList();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ retailers: 0, totalQty: 0, totalValue: 0 });
  const [assignment, setAssignment] = useState<any | null>(null);
  const [run, setRun] = useState<any | null>(null);
  const [agents, setAgents] = useState<Array<{ id: string; full_name: string }>>([]);
  const [vehicleLabel, setVehicleLabel] = useState<string>('');
  const [agentName, setAgentName] = useState<string>('');

  // Driver-assignment form (used only when no assignment yet)
  const [agentId, setAgentId] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');

  const [challan, setChallan] = useState<any | null>(null);
  const [eway, setEway] = useState<any | null>(null);
  const [threshold, setThreshold] = useState<number>(DEFAULT_THRESHOLD);

  const [generating, setGenerating] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [ewayDialog, setEwayDialog] = useState(false);
  const [ewayForm, setEwayForm] = useState({ number: '', validUntil: '', distanceKm: '' });
  const [savingEway, setSavingEway] = useState(false);

  // -------- load --------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Retailer count + load summary from orders/order_items
        const { data: orderRows } = await supabase
          .from('orders')
          .select('id, retailer_id, total_amount')
          .eq('packing_list_id', packingList.id);
        const orders = orderRows || [];
        const retailerCount = new Set(orders.map(o => o.retailer_id).filter(Boolean)).size;

        // Sum packed qty
        const { data: items } = await supabase
          .from('packing_list_items')
          .select('id, packing_list_item_batches(packed_qty)')
          .eq('packing_list_id', packingList.id);
        let qty = 0;
        (items || []).forEach((it: any) => (it.packing_list_item_batches || []).forEach((b: any) => { qty += Number(b.packed_qty || 0); }));
        const totalValue = orders.reduce((s, o: any) => s + Number(o.total_amount || 0), 0);
        if (!cancelled) setStats({ retailers: retailerCount, totalQty: qty, totalValue });

        // assignment + run
        const { data: assigns } = await supabase
          .from('packing_list_assignments').select('*')
          .eq('packing_list_id', packingList.id).limit(1);
        if (!cancelled && assigns?.length) setAssignment(assigns[0]);

        const { data: links } = await (supabase as any)
          .from('delivery_run_packing_lists').select('delivery_run_id')
          .eq('packing_list_id', packingList.id).limit(1);
        if (links?.length) {
          const { data: r } = await (supabase as any).from('delivery_runs').select('*').eq('id', links[0].delivery_run_id).single();
          if (!cancelled) setRun(r);
          if (!cancelled) setVehicleLabel(r?.vehicle_number || '');
        }

        // existing challan
        const { data: cs } = await (supabase as any)
          .from('delivery_challans').select('*')
          .eq('packing_list_id', packingList.id).neq('status', 'cancelled').limit(1);
        if (!cancelled && cs?.length) {
          setChallan(cs[0]);
          if (cs[0].eway_bill_id) {
            const { data: eb } = await (supabase as any).from('eway_bills').select('*').eq('id', cs[0].eway_bill_id).single();
            if (!cancelled) setEway(eb);
          }
        }

        // agents (for assignment dropdown)
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').limit(200);
        if (!cancelled) setAgents((profiles || []).filter((p: any) => p.full_name).map((p: any) => ({ id: p.id, full_name: p.full_name })));

        // threshold from companies
        const { data: company } = await (supabase as any).from('companies').select('eway_threshold_value').limit(1).maybeSingle();
        if (!cancelled && company?.eway_threshold_value) setThreshold(Number(company.eway_threshold_value));
      } catch (err: any) {
        toast({ title: 'Load failed', description: err?.message, variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [packingList.id, toast]);

  useEffect(() => {
    if (assignment) {
      const a = agents.find(x => x.id === assignment.agent_id);
      setAgentName(a?.full_name || run?.driver_name || 'Assigned');
      setVehicleLabel(run?.vehicle_number || assignment?.van_id || '');
    }
  }, [assignment, agents, run]);

  const ewayRequired = useMemo(() => (challan ? Number(challan.total_value || 0) : stats.totalValue) >= threshold, [challan, stats.totalValue, threshold]);
  const hasAssignment = !!assignment;
  const hasChallan = !!challan;
  const isDispatched = ['dispatched', 'delivered', 'completed'].includes(packingList.status);

  // -------- actions --------
  const handleAssign = async () => {
    if (!agentId) { toast({ title: 'Select driver', variant: 'destructive' }); return; }
    const res = await assignDriverAndCreateRun(packingList.id, {
      agentId, vehicleNumber, driverName, deliveryMode: 'direct', notes: '',
    });
    if (res.success) {
      if (res.assignment) setAssignment(res.assignment);
      if (res.run) setRun(res.run);
    }
  };

  const handleGenerateChallan = async () => {
    setGenerating(true);
    try {
      const { data, error } = await (supabase as any).rpc('generate_delivery_challan', { p_packing_list_id: packingList.id });
      if (error) throw error;
      const { data: c } = await (supabase as any).from('delivery_challans').select('*').eq('id', data.challan_id).single();
      setChallan(c);
      toast({ title: data.reused ? 'Challan already exists' : 'Challan generated', description: c.challan_number });
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const openEwayDialog = () => {
    if (!challan) { toast({ title: 'Generate challan first', variant: 'destructive' }); return; }
    setEwayDialog(true);
  };

  const handleSaveEway = async () => {
    if (!challan) return;
    if (!ewayForm.number || ewayForm.number.replace(/\D/g, '').length < 12) {
      toast({ title: 'Enter a valid 12-digit EWB number', variant: 'destructive' }); return;
    }
    setSavingEway(true);
    try {
      const payload: any = {
        eway_bill_number: ewayForm.number.trim(),
        distributor_id: packingList.distributor_id,
        document_type: 'delivery_challan',
        challan_id: challan.id,
        document_number: challan.challan_number,
        document_date: challan.challan_date,
        consignment_value: Number(challan.total_value || 0),
        generated_date: new Date().toISOString(),
        valid_from: new Date().toISOString().slice(0, 10),
        valid_until: ewayForm.validUntil || null,
        from_gstin: challan.consignor_gstin,
        dispatch_place: challan.consignor_address,
        vehicle_number: challan.vehicle_number,
        transporter_name: challan.transporter_name,
        approx_distance_km: ewayForm.distanceKm ? Number(ewayForm.distanceKm) : null,
        status: 'active',
      };
      const { data: inserted, error } = await (supabase as any).from('eway_bills').insert(payload).select().single();
      if (error) throw error;
      await (supabase as any).from('delivery_challans').update({ eway_bill_id: inserted.id }).eq('id', challan.id);
      setEway(inserted);
      setChallan({ ...challan, eway_bill_id: inserted.id });
      setEwayDialog(false);
      toast({ title: 'E-way bill recorded', description: inserted.eway_bill_number });
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSavingEway(false);
    }
  };

  const handleDispatch = async () => {
    if (!challan) { toast({ title: 'Generate challan first', variant: 'destructive' }); return; }
    if (ewayRequired && !eway) { toast({ title: 'E-way bill required', description: `Load value ≥ ₹${threshold.toLocaleString('en-IN')}`, variant: 'destructive' }); return; }
    if (!hasAssignment) { toast({ title: 'Assign a driver first', variant: 'destructive' }); return; }
    setDispatching(true);
    try {
      // bridge to 'ready' first if needed, then 'dispatched'
      if (packingList.status === 'packed') await updatePackingListStatus(packingList.id, 'ready');
      const ok = await updatePackingListStatus(packingList.id, 'dispatched');
      if (ok) {
        await (supabase as any).from('delivery_challans').update({ status: 'dispatched' }).eq('id', challan.id);
        onStatusChange('dispatched');
      }
    } finally { setDispatching(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
          <StatusTimeline status={packingList.status} />
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">READY TO DISPATCH</Badge>
        </CardContent>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Users className="h-4 w-4" />} label="RETAILERS" value={`${stats.retailers}`} sub="orders" />
        <StatCard icon={<Boxes className="h-4 w-4" />} label="TOTAL QTY" value={stats.totalQty.toLocaleString('en-IN')} sub="units" />
        <StatCard icon={<IndianRupee className="h-4 w-4" />} label="LOAD VALUE" value={`₹${Number(challan?.total_value || stats.totalValue).toLocaleString('en-IN')}`} />
        <StatCard icon={<User className="h-4 w-4" />} label="AGENT · VAN" value={agentName || '—'} sub={vehicleLabel || '—'} />
      </div>

      {/* Assign-driver inline if missing */}
      {!hasAssignment && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><User className="h-4 w-4 text-primary" /> Assign agent &amp; vehicle</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Driver *</Label>
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                  <SelectContent>{agents.map(a => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Driver name (display)</Label><Input value={driverName} onChange={e => setDriverName(e.target.value)} /></div>
              <div><Label className="text-xs">Vehicle number</Label><Input value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} placeholder="KA-01-AB-1234" /></div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={handleAssign} disabled={hookLoading || !agentId}>Assign &amp; create run</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Challan + E-way cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Delivery Challan */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Delivery Challan
              </h3>
              <Badge variant="outline" className="text-xs">Rule 55</Badge>
            </div>
            {hasChallan ? (
              <div className="space-y-2">
                <div className="rounded-md border p-3 bg-emerald-50/40 dark:bg-emerald-900/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Challan number</p>
                      <p className="font-semibold">{challan.challan_number}</p>
                    </div>
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Generated
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">Qty {Number(challan.total_qty).toLocaleString('en-IN')} · Value ₹{Number(challan.total_value).toLocaleString('en-IN')}</div>
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-1" /> Print Challan
                </Button>
              </div>
            ) : (
              <>
                <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground mb-3">
                  No challan yet — goods can&apos;t move without it.
                </div>
                <Button className="w-full" onClick={handleGenerateChallan} disabled={generating || isDispatched}>
                  {generating && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  <FileText className="h-4 w-4 mr-1" /> Generate Delivery Challan
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* E-way Bill */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-primary" /> E-way Bill
              </h3>
              <Badge variant="outline" className="text-xs">{ewayRequired ? 'Value-based' : 'Below threshold'}</Badge>
            </div>
            {ewayRequired ? (
              eway ? (
                <div className="space-y-2">
                  <div className="rounded-md border p-3 bg-emerald-50/40 dark:bg-emerald-900/10">
                    <p className="text-xs text-muted-foreground">EWB Number</p>
                    <p className="font-mono font-semibold">{eway.eway_bill_number}</p>
                    {eway.valid_until && <p className="text-xs text-muted-foreground mt-1">Valid until {eway.valid_until}</p>}
                  </div>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => window.print()}>
                    <Printer className="h-4 w-4 mr-1" /> Print E-way Bill
                  </Button>
                </div>
              ) : (
                <>
                  <div className="rounded-md bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 p-3 mb-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5" />
                    <span>Required — load value ₹{Number(challan?.total_value || stats.totalValue).toLocaleString('en-IN')} exceeds the ₹{threshold.toLocaleString('en-IN')} threshold.</span>
                  </div>
                  <Button className="w-full" onClick={openEwayDialog} disabled={!hasChallan}>
                    <ShieldAlert className="h-4 w-4 mr-1" /> Generate / Enter E-way Bill
                  </Button>
                  {!hasChallan && <p className="text-xs text-muted-foreground italic mt-2">Generate the challan first.</p>}
                </>
              )
            ) : (
              <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                E-way bill not required (load value below ₹{threshold.toLocaleString('en-IN')}).
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 bg-card border-t -mx-4 px-4 py-3 flex items-center justify-between gap-3 z-10 flex-wrap">
        <div className="text-xs text-muted-foreground">
          {!hasChallan
            ? 'Generate the challan to dispatch'
            : ewayRequired && !eway
              ? 'Record the E-way bill to dispatch'
              : 'Goods will move on Delivery Challan' + (eway ? ' + E-way bill' : '')}
        </div>
        <Button onClick={handleDispatch} disabled={dispatching || isDispatched || !hasChallan || (ewayRequired && !eway) || !hasAssignment}>
          {dispatching && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          <Truck className="h-4 w-4 mr-1" /> Dispatch on Challan <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* EWB Dialog */}
      <Dialog open={ewayDialog} onOpenChange={setEwayDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enter E-way Bill Details</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">EWB Number (12 digits) *</Label>
              <Input value={ewayForm.number} onChange={e => setEwayForm({ ...ewayForm, number: e.target.value })} placeholder="From GST e-way portal" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Valid until</Label>
                <Input type="date" value={ewayForm.validUntil} onChange={e => setEwayForm({ ...ewayForm, validUntil: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Approx distance (km)</Label>
                <Input type="number" value={ewayForm.distanceKm} onChange={e => setEwayForm({ ...ewayForm, distanceKm: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Generate the EWB on the GST portal and paste the issued 12-digit number here. It will print on the challan.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEwayDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveEway} disabled={savingEway}>
              {savingEway && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save
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
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">{icon}{label}</div>
        <p className="text-lg font-bold mt-1 truncate">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
