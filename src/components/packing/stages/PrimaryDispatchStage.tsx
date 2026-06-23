import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Truck, Package, Boxes, Scale, Calendar, Loader2, MapPin,
  StickyNote, ArrowRight, Pause, Pencil
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PackingList } from '@/hooks/usePackingList';
import StatusTimeline from './StatusTimeline';
import { getPrimaryPackingListInvoiceLookup } from './primaryInvoiceLookup';

interface Props {
  packingList: PackingList;
  onStatusChange: (s?: string) => void;
}

interface DispatchForm {
  assigned_delivery_user_id: string;
  dispatch_driver: string;
  driver_phone: string;
  dispatch_vehicle: string;
  vehicle_type: string;
  transporter_name: string;
  lr_gr_number: string;
  dispatch_mode: string;
  total_packages: string;
  total_weight_kg: string;
  dispatch_date: string;
  dispatch_destination: string;
  dispatch_notes: string;
}

interface DeliveryUserOption {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  phone: string | null;
  role: string | null;
}

const fmtNum = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('en-IN').format(Number(n));

export default function PrimaryDispatchStage({ packingList, onStatusChange }: Props) {
  const pl = packingList as any;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [totalQty, setTotalQty] = useState(0);
  const [distributor, setDistributor] = useState<any>(null);
  const [warehouse, setWarehouse] = useState<any>(null);
  const [invoiceStats, setInvoiceStats] = useState<{ total: number; finalized: number }>({ total: 0, finalized: 0 });

  const [deliveryUsers, setDeliveryUsers] = useState<DeliveryUserOption[]>([]);

  const [form, setForm] = useState<DispatchForm>({
    assigned_delivery_user_id: pl.assigned_delivery_user_id || '',
    dispatch_driver: pl.dispatch_driver || '',
    driver_phone: pl.driver_phone || '',
    dispatch_vehicle: pl.dispatch_vehicle || '',
    vehicle_type: pl.vehicle_type || '',
    transporter_name: pl.transporter_name || '',
    lr_gr_number: pl.lr_gr_number || '',
    dispatch_mode: pl.dispatch_mode || 'Road',
    total_packages: pl.total_packages ? String(pl.total_packages) : '',
    total_weight_kg: pl.total_weight_kg ? String(pl.total_weight_kg) : '',
    dispatch_date: pl.dispatch_date || pl.delivery_date || format(new Date(), 'yyyy-MM-dd'),
    dispatch_destination: pl.dispatch_destination || '',
    dispatch_notes: pl.dispatch_notes || pl.notes || '',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: items }, { data: dist }, { data: wh }, invoiceLookup] = await Promise.all([
          supabase
            .from('packing_list_items')
            .select('id, ordered_qty, picked_qty, packing_list_item_batches(packed_qty, picked_qty, allocated_qty)')
            .eq('packing_list_id', packingList.id),
          pl.distributor_id
            ? supabase.from('distributors').select('id, name, city, state, address').eq('id', pl.distributor_id).maybeSingle()
            : Promise.resolve({ data: null }),
          pl.warehouse_id
            ? supabase.from('warehouses').select('id, name, city').eq('id', pl.warehouse_id).maybeSingle()
            : Promise.resolve({ data: null }),
          getPrimaryPackingListInvoiceLookup(packingList.id),
        ]);

        if (cancelled) return;

        let qty = 0;
        (items || []).forEach((i: any) => {
          const batches = i.packing_list_item_batches || [];
          if (batches.length === 0) {
            qty += Number(i.picked_qty || i.ordered_qty || 0);
          } else {
            batches.forEach((b: any) => {
              qty += Number(b.packed_qty || b.picked_qty || b.allocated_qty || 0);
            });
          }
        });
        setTotalQty(qty);
        setDistributor(dist || null);
        setWarehouse(wh || null);

        setInvoiceStats({ total: invoiceLookup.expectedCount, finalized: invoiceLookup.finalizedCount });

        // Destination default
        if (!form.dispatch_destination && dist) {
          setForm((f) => ({
            ...f,
            dispatch_destination: [dist.name, dist.city].filter(Boolean).join(' — '),
          }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }

      // Load distributor's delivery-enabled users (parallel/independent)
      if (pl.distributor_id) {
        const { data: dus } = await supabase
          .from('distributor_users')
          .select('id, auth_user_id, full_name, phone, role, can_deliver, is_active')
          .eq('distributor_id', pl.distributor_id)
          .eq('can_deliver', true)
          .eq('is_active', true)
          .order('full_name', { ascending: true });
        if (!cancelled) setDeliveryUsers((dus || []) as DeliveryUserOption[]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packingList.id]);

  const totalPackages = useMemo(() => {
    const fromForm = parseInt(form.total_packages || '0', 10);
    return fromForm || 0;
  }, [form.total_packages]);
  const totalWeight = useMemo(() => Number(form.total_weight_kg || 0), [form.total_weight_kg]);

  const allFinalized = invoiceStats.total > 0 && invoiceStats.finalized === invoiceStats.total;
  const canDispatch = allFinalized && !!form.dispatch_driver && !!form.dispatch_vehicle;

  const persistForm = async () => {
    await supabase.from('packing_lists').update({
      dispatch_driver: form.dispatch_driver || null,
      driver_phone: form.driver_phone || null,
      assigned_delivery_user_id: form.assigned_delivery_user_id || null,
      dispatch_vehicle: form.dispatch_vehicle || null,
      vehicle_type: form.vehicle_type || null,
      transporter_name: form.transporter_name || null,
      lr_gr_number: form.lr_gr_number || null,
      dispatch_mode: form.dispatch_mode || null,
      total_packages: form.total_packages ? Number(form.total_packages) : null,
      total_weight_kg: form.total_weight_kg ? Number(form.total_weight_kg) : null,
      dispatch_date: form.dispatch_date || null,
      dispatch_destination: form.dispatch_destination || null,
      dispatch_notes: form.dispatch_notes || null,
    } as any).eq('id', packingList.id);
  };

  const selectDriver = (deliveryUserId: string) => {
    const u = deliveryUsers.find((x) => x.id === deliveryUserId);
    if (!u) return;
    setForm((f) => ({
      ...f,
      assigned_delivery_user_id: u.id,
      dispatch_driver: u.full_name || '',
      driver_phone: u.phone || '',
    }));
  };

  const handleSaveAssignment = async () => {
    setAssignOpen(false);
    await persistForm();
    toast({ title: 'Assignment saved' });
  };

  const handleHold = async () => {
    if (!holdReason.trim()) {
      toast({ variant: 'destructive', title: 'Reason required' });
      return;
    }
    await supabase.from('packing_lists').update({
      dispatch_notes: `[HOLD] ${holdReason} \n${form.dispatch_notes || ''}`.trim(),
    } as any).eq('id', packingList.id);
    setHoldOpen(false);
    setHoldReason('');
    toast({ title: 'Dispatch placed on hold' });
  };

  const handleMarkDispatched = async () => {
    if (!canDispatch) {
      toast({ variant: 'destructive', title: 'Cannot dispatch', description: 'Finalize all invoices and assign driver + vehicle first.' });
      return;
    }
    if (!form.assigned_delivery_user_id) {
      toast({ variant: 'destructive', title: 'Driver required', description: 'Select a delivery-enabled user from the distributor.' });
      return;
    }
    setSubmitting(true);
    try {
      await persistForm();
      const { data, error } = await supabase.rpc('dispatch_primary_packing_list_atomic' as any, {
        p_packing_list_id: packingList.id,
        p_dispatch: {
          assigned_delivery_user_id: form.assigned_delivery_user_id,
          dispatch_vehicle: form.dispatch_vehicle,
          dispatch_driver: form.dispatch_driver,
          driver_phone: form.driver_phone,
          transporter_name: form.transporter_name,
          lr_gr_number: form.lr_gr_number,
          vehicle_type: form.vehicle_type,
          dispatch_mode: form.dispatch_mode,
          total_packages: form.total_packages || null,
          total_weight_kg: form.total_weight_kg || null,
          dispatch_date: form.dispatch_date,
          dispatch_destination: form.dispatch_destination,
          dispatch_notes: form.dispatch_notes,
        },
      } as any);
      if (error) throw error;
      const res: any = data;
      if (!res?.success) throw new Error(res?.error || 'Dispatch failed');
      toast({ title: 'Dispatched', description: 'Stock deducted and primary orders updated.' });
      onStatusChange('dispatched');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Dispatch failed', description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header strip */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-primary">Stage A</span>
        <h2 className="text-base font-semibold">Dispatch</h2>
        <Badge variant="outline" className="text-[10px] tracking-wide bg-primary/5 border-primary/20 text-primary">
          DISPATCH READY → DISPATCHED
        </Badge>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">{packingList.packing_list_number}</h3>
                <p className="text-xs text-muted-foreground">
                  Delivery: {format(new Date(packingList.delivery_date), 'dd MMM yyyy')}
                  {distributor?.name && <> · {distributor.name}</>}
                </p>
              </div>
            </div>
            <Badge className="bg-primary/10 text-primary border-primary/20">DISPATCH READY</Badge>
          </div>

          <StatusTimeline status={packingList.status} />
        </CardContent>
      </Card>

      {/* Banner */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900/40 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
        {allFinalized
          ? `✓ Invoices finalized (${invoiceStats.finalized}/${invoiceStats.total}) — ready for dispatch.`
          : `Invoices finalized (${invoiceStats.finalized}/${invoiceStats.total}) — finalize all invoices before dispatching.`}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={<Package className="h-4 w-4" />} value={fmtNum(totalPackages)} label="TOTAL PACKAGES" sub="Cartons" />
        <StatCard icon={<Boxes className="h-4 w-4" />} value={fmtNum(totalQty)} label="TOTAL QUANTITY" sub="Units" />
        <StatCard icon={<Scale className="h-4 w-4" />} value={fmtNum(totalWeight)} label="EST. WEIGHT" sub="Kg" />
        <StatCard icon={<Truck className="h-4 w-4" />} value={form.dispatch_mode || '—'} label="DISPATCH MODE" />
        <StatCard
          icon={<Calendar className="h-4 w-4" />}
          value={form.dispatch_date ? format(new Date(form.dispatch_date), 'dd MMM yyyy') : '—'}
          label="DISPATCH DATE"
        />
      </div>

      {/* Vehicle & Driver */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" /> Assigned Vehicle &amp; Driver
            </h4>
            <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Change assignment
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Field label="DRIVER / AGENT" value={form.dispatch_driver} hint={form.driver_phone} />
            <Field label="VEHICLE NUMBER" value={form.dispatch_vehicle} />
            <Field label="VEHICLE TYPE" value={form.vehicle_type} />
            <Field label="TRANSPORTER" value={form.transporter_name} />
            <Field label="LR / GR NUMBER" value={form.lr_gr_number} placeholderHint="— add" />
            <Field label="DISPATCH MODE" value={form.dispatch_mode} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-rose-500" /> Destination
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground w-20 mt-0.5">Ship from</span>
                <span className="font-medium">
                  {warehouse?.name ? `Warehouse — ${warehouse.name}` : 'Default warehouse'}
                  {warehouse?.city && ` · ${warehouse.city}`}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground w-20 mt-0.5">Deliver to</span>
                <span className="font-medium">
                  {form.dispatch_destination || (distributor ? `${distributor.name}` : '—')}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground italic pt-1">
                Primary = single point-to-point destination (no multi-stop route).
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <StickyNote className="h-4 w-4 text-amber-500" /> Additional Notes
            </h4>
            <Textarea
              rows={3}
              placeholder="Notes for the dispatch team (handling, deadlines, etc.)"
              value={form.dispatch_notes}
              onChange={(e) => setForm({ ...form, dispatch_notes: e.target.value })}
              className="text-sm"
            />
          </CardContent>
        </Card>
      </div>

      <div className="text-xs text-muted-foreground">
        Stock is still <span className="font-medium">reserved</span>, not deducted — it leaves inventory the moment you mark dispatched.
      </div>

      <div className="sticky bottom-0 bg-card border-t -mx-4 px-4 py-3 flex items-center justify-end gap-3 z-10">
        <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => setHoldOpen(true)}>
          <Pause className="h-4 w-4 mr-1" /> Hold / Delay
        </Button>
        <Button onClick={handleMarkDispatched} disabled={!canDispatch || submitting}>
          {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
          Mark as Dispatched <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Assignment dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Assign Vehicle &amp; Driver</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Driver / Agent</Label>
              <Select value={form.assigned_delivery_user_id} onValueChange={selectDriver}>
                <SelectTrigger>
                  <SelectValue placeholder={deliveryUsers.length ? 'Select a delivery user…' : 'No delivery-enabled users found'} />
                </SelectTrigger>
                <SelectContent>
                  {deliveryUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      <span className="font-medium">{u.full_name}</span>
                      {u.role ? <span className="text-muted-foreground"> · {u.role}</span> : null}
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-600">can deliver</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Only this distributor's active <code>can_deliver</code> users — no free typing.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Driver Phone</Label>
              <Input value={form.driver_phone} readOnly placeholder="Auto-filled from selected user" className="bg-muted/40" />
            </div>
            <FormField label="Vehicle Number" value={form.dispatch_vehicle} onChange={(v) => setForm({ ...form, dispatch_vehicle: v })} />
            <FormField label="Vehicle Type" value={form.vehicle_type} onChange={(v) => setForm({ ...form, vehicle_type: v })} />
            <FormField label="Transporter" value={form.transporter_name} onChange={(v) => setForm({ ...form, transporter_name: v })} />
            <FormField label="LR / GR Number" value={form.lr_gr_number} onChange={(v) => setForm({ ...form, lr_gr_number: v })} />
            <div className="space-y-1">
              <Label className="text-xs">Dispatch Mode</Label>
              <Select value={form.dispatch_mode} onValueChange={(v) => setForm({ ...form, dispatch_mode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Road">Road</SelectItem>
                  <SelectItem value="Rail">Rail</SelectItem>
                  <SelectItem value="Air">Air</SelectItem>
                  <SelectItem value="Courier">Courier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <FormField label="Dispatch Date" type="date" value={form.dispatch_date} onChange={(v) => setForm({ ...form, dispatch_date: v })} />
            <FormField label="Total Packages" type="number" value={form.total_packages} onChange={(v) => setForm({ ...form, total_packages: v })} />
            <FormField label="Est. Weight (Kg)" type="number" value={form.total_weight_kg} onChange={(v) => setForm({ ...form, total_weight_kg: v })} />
            <div className="col-span-2">
              <FormField label="Destination" value={form.dispatch_destination} onChange={(v) => setForm({ ...form, dispatch_destination: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveAssignment}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hold dialog */}
      <Dialog open={holdOpen} onOpenChange={setHoldOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Hold / Delay Dispatch</DialogTitle></DialogHeader>
          <Textarea rows={3} placeholder="Reason for hold..." value={holdReason} onChange={(e) => setHoldReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldOpen(false)}>Cancel</Button>
            <Button onClick={handleHold}>Place on Hold</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon, value, label, sub }: { icon: React.ReactNode; value: string; label: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="h-7 w-7 rounded bg-muted flex items-center justify-center text-muted-foreground mb-2">{icon}</div>
        <div className="text-xl font-semibold leading-tight">{value}</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">{label}</div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Field({ label, value, hint, placeholderHint }: { label: string; value: string; hint?: string; placeholderHint?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{label}</div>
      <div className="font-medium">
        {value || <span className="text-muted-foreground italic">{placeholderHint || '—'}</span>}
      </div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function FormField({
  label, value, onChange, type = 'text'
}: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
