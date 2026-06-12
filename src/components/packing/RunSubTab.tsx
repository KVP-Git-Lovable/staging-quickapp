import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  Truck, Plus, User, Clock, CheckCircle2, MapPin, Package, Loader2, Play, AlertCircle
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Props {
  orderType: 'primary' | 'secondary';
  distributorId?: string;
}

interface DeliveryRun {
  id: string;
  run_number: string;
  agent_id: string | null;
  agent_name?: string;
  vehicle_id: string | null;
  status: string;
  start_time: string | null;
  completed_at: string | null;
  created_at: string;
  packing_list_count: number;
}

interface ReadyPackingList {
  id: string;
  packing_list_number: string;
  total_items: number;
  total_value: number;
  delivery_date: string;
}

interface Agent {
  id: string;
  full_name: string;
}

const runStatusConfig: Record<string, { label: string; color: string }> = {
  ready: { label: 'Ready', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  assigned: { label: 'Assigned', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  out_for_delivery: { label: 'Out for Delivery', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
};

export default function RunSubTab({ orderType, distributorId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<DeliveryRun[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [readyLists, setReadyLists] = useState<ReadyPackingList[]>([]);
  const [selectedPlIds, setSelectedPlIds] = useState<Set<string>>(new Set());
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [creating, setCreating] = useState(false);

  // Delivery mode fields
  const [deliveryMode, setDeliveryMode] = useState('direct');
  const [dispatchDate, setDispatchDate] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [transporterName, setTransporterName] = useState('');
  const [trackingId, setTrackingId] = useState('');
  const [lrNumber, setLrNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');

  useEffect(() => { loadRuns(); }, []);

  const loadRuns = async () => {
    setLoading(true);
    try {
      const { data: runsData } = await supabase
        .from('delivery_runs')
        .select('*, delivery_run_packing_lists(packing_list_id)')
        .order('created_at', { ascending: false });

      if (runsData) {
        // Get agent names
        const agentIds = [...new Set(runsData.map(r => r.agent_id).filter(Boolean))];
        let agentMap: Record<string, string> = {};
        if (agentIds.length > 0) {
          const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', agentIds);
          if (profiles) agentMap = profiles.reduce((acc, p) => { acc[p.id] = p.full_name || ''; return acc; }, {} as Record<string, string>);
        }

        setRuns(runsData.map(r => ({
          id: r.id,
          run_number: r.run_number,
          agent_id: r.agent_id,
          agent_name: r.agent_id ? agentMap[r.agent_id] || 'Unknown' : undefined,
          vehicle_id: r.vehicle_id,
          status: r.status,
          start_time: r.start_time,
          completed_at: r.completed_at,
          created_at: r.created_at,
          packing_list_count: (r.delivery_run_packing_lists as any[])?.length || 0,
        })));
      }
    } catch (e) {
      console.error('Error loading delivery runs:', e);
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = async () => {
    // Load ready packing lists
    const { data: lists } = await supabase
      .from('packing_lists')
      .select('id, packing_list_number, total_items, total_value, delivery_date')
      .eq('status', 'ready')
      .eq('order_type', orderType);

    // Filter out those already in a run
    const { data: assigned } = await supabase.from('delivery_run_packing_lists').select('packing_list_id');
    const assignedIds = new Set((assigned || []).map(a => a.packing_list_id));
    setReadyLists((lists || []).filter(l => !assignedIds.has(l.id)));

    // Load agents
    const { data: profiles } = await supabase.from('profiles').select('id, full_name');
    setAgents((profiles || []).filter(p => p.full_name).map(p => ({ id: p.id, full_name: p.full_name || '' })));

    setSelectedPlIds(new Set());
    setSelectedAgentId('');
    setShowCreateDialog(true);
  };

  const handleCreateRun = async () => {
    if (selectedPlIds.size === 0) {
      toast({ title: 'Select packing lists', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const { data: run, error } = await supabase
        .from('delivery_runs')
        .insert({
          agent_id: selectedAgentId || null,
          status: selectedAgentId ? 'assigned' : 'ready',
          delivery_mode: deliveryMode,
          dispatch_date: dispatchDate || null,
          expected_delivery_date: expectedDeliveryDate || null,
          transporter_name: transporterName || null,
          tracking_id: trackingId || null,
          lr_number: lrNumber || null,
          driver_name: driverName || null,
          vehicle_number: vehicleNumber || null,
        } as any)
        .select()
        .single();

      if (error) throw error;

      // Map packing lists
      const mappings = Array.from(selectedPlIds).map((plId, idx) => ({
        delivery_run_id: run.id,
        packing_list_id: plId,
        sequence_order: idx + 1,
      }));

      const { error: mapError } = await supabase.from('delivery_run_packing_lists').insert(mappings);
      if (mapError) throw mapError;

      toast({ title: 'Delivery run created', description: `${run.run_number} with ${selectedPlIds.size} packing lists` });
      setShowCreateDialog(false);
      loadRuns();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to create delivery run', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStatus = async (runId: string, newStatus: string) => {
    try {
      const { error } = await supabase.from('delivery_runs').update({ status: newStatus }).eq('id', runId);
      if (error) throw error;
      toast({ title: 'Status updated' });
      loadRuns();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="px-4 pt-4 flex items-center justify-between">
        <h3 className="font-semibold text-sm text-muted-foreground">Delivery Runs</h3>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-1" /> Create Run
        </Button>
      </div>

      {/* Runs List */}
      <div className="px-4 pb-6 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : runs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-40" />
              <p className="text-muted-foreground font-medium">No active delivery runs</p>
              <p className="text-xs text-muted-foreground mt-1">Create a delivery run from ready packing lists</p>
            </CardContent>
          </Card>
        ) : (
          runs.map(run => {
            const config = runStatusConfig[run.status] || runStatusConfig.ready;
            return (
              <Card key={run.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-sm">{run.run_number}</p>
                      {run.agent_name && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" /> {run.agent_name}
                        </div>
                      )}
                    </div>
                    <Badge className={config.color}>{config.label}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t">
                    <div>
                      <p className="text-xs text-muted-foreground">Packing Lists</p>
                      <p className="font-semibold">{run.packing_list_count}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Created</p>
                      <p className="font-semibold text-xs">{format(new Date(run.created_at), 'dd MMM HH:mm')}</p>
                    </div>
                    <div className="text-right">
                      {run.status === 'ready' && (
                        <Button size="sm" variant="outline" onClick={() => handleUpdateStatus(run.id, 'assigned')}>
                          Assign
                        </Button>
                      )}
                      {run.status === 'assigned' && (
                        <Button size="sm" onClick={() => handleUpdateStatus(run.id, 'out_for_delivery')}>
                          <Play className="h-3 w-3 mr-1" /> Start
                        </Button>
                      )}
                      {run.status === 'out_for_delivery' && (
                        <Button size="sm" variant="outline" onClick={() => handleUpdateStatus(run.id, 'delivered')}>
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Delivery Run</DialogTitle>
            <DialogDescription>Select ready packing lists and assign a delivery agent</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Ready Packing Lists</label>
              {readyLists.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <AlertCircle className="h-4 w-4" />
                  <span>No ready packing lists available. Mark packing lists as "Ready" first.</span>
                </div>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {readyLists.map(pl => (
                    <div key={pl.id} className={`flex items-center gap-3 p-2 rounded border transition-all ${selectedPlIds.has(pl.id) ? 'border-primary bg-primary/5' : ''}`}>
                      <Checkbox
                        checked={selectedPlIds.has(pl.id)}
                        onCheckedChange={() => {
                          setSelectedPlIds(prev => {
                            const next = new Set(prev);
                            if (next.has(pl.id)) next.delete(pl.id);
                            else next.add(pl.id);
                            return next;
                          });
                        }}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{pl.packing_list_number}</p>
                        <p className="text-xs text-muted-foreground">{pl.total_items} items • ₹{pl.total_value.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Delivery Mode</label>
              <Select value={deliveryMode} onValueChange={setDeliveryMode}>
                <SelectTrigger>
                  <SelectValue placeholder="Select mode..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">Direct</SelectItem>
                  <SelectItem value="courier">Courier</SelectItem>
                  <SelectItem value="pickup">Pickup</SelectItem>
                  <SelectItem value="3pl">3PL</SelectItem>
                  <SelectItem value="van_delivery">Van Delivery</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Dispatch Date</label>
                <Input type="date" value={dispatchDate} onChange={e => setDispatchDate(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Expected Delivery</label>
                <Input type="date" value={expectedDeliveryDate} onChange={e => setExpectedDeliveryDate(e.target.value)} />
              </div>
            </div>

            {(deliveryMode === 'courier' || deliveryMode === '3pl') && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Transporter Name</label>
                  <Input value={transporterName} onChange={e => setTransporterName(e.target.value)} placeholder="Enter transporter..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Tracking ID</label>
                    <Input value={trackingId} onChange={e => setTrackingId(e.target.value)} placeholder="Tracking #" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">LR Number</label>
                    <Input value={lrNumber} onChange={e => setLrNumber(e.target.value)} placeholder="LR #" />
                  </div>
                </div>
              </div>
            )}

            {(deliveryMode === 'direct' || deliveryMode === 'van_delivery') && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Driver Name</label>
                  <Input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Driver name..." />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Vehicle Number</label>
                  <Input value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} placeholder="MH-XX-XXXX" />
                </div>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">Delivery Agent (Optional)</label>
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select agent..." />
                </SelectTrigger>
                <SelectContent>
                  {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateRun} disabled={creating || selectedPlIds.size === 0}>
              {creating ? 'Creating...' : `Create Run (${selectedPlIds.size} lists)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
