import { useEffect, useMemo, useState } from 'react';
import { format, differenceInDays } from 'date-fns';
import {
  CheckCircle2, ScanBarcode, AlertTriangle, PackageCheck, Loader2,
  ClipboardList, Box, ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { usePackingList, PackingList } from '@/hooks/usePackingList';
import StatusTimeline from './StatusTimeline';
import CancelReasonDialog from './CancelReasonDialog';
import { useToast } from '@/hooks/use-toast';

interface BatchRow {
  id: string;
  packing_list_item_id: string;
  batch_id: string;
  batch_number: string | null;
  expiry_date: string | null;
  allocated_qty: number;
  picked_qty: number;
  packed_qty: number;
  packed_at?: string | null;
  // joined item info
  product_name?: string;
  unit?: string;
  bin_zone?: string | null;
}

interface Props {
  packingList: PackingList;
  onStatusChange: (newStatus: string) => void;
  onCancel: () => void;
}

export default function PicklistPackingStage({ packingList, onStatusChange, onCancel }: Props) {
  const { toast } = useToast();
  const {
    markBatchPicked,
    updateBatchPickedQty,
    setBatchPackedQty,
    confirmPacking,
    updatePackingListStatus,
    cancelPackingList,
  } = usePackingList();

  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);

  // Load all allocated batches for the packing list (strictly batch-driven).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: items } = await supabase
          .from('packing_list_items')
          .select('id, product_name, unit')
          .eq('packing_list_id', packingList.id);
        const itemMap = new Map<string, { product_name: string; unit: string | null }>();
        (items || []).forEach((it: any) => itemMap.set(it.id, { product_name: it.product_name, unit: it.unit }));

        if (!items || items.length === 0) {
          if (!cancelled) setBatches([]);
          return;
        }
        const itemIds = items.map((i: any) => i.id);
        const { data: rows, error } = await supabase
          .from('packing_list_item_batches' as any)
          .select('id, packing_list_item_id, batch_id, batch_number, expiry_date, allocated_qty, picked_qty, packed_qty, packed_at')
          .in('packing_list_item_id', itemIds);
        if (error) throw error;

        const list: BatchRow[] = ((rows || []) as any[]).map((r: any) => {
          const meta = itemMap.get(r.packing_list_item_id) || { product_name: '—', unit: null };
          return {
            ...r,
            product_name: meta.product_name,
            unit: meta.unit,
            bin_zone: null, // placeholder until bin/zone master is wired
          };
        });
        if (!cancelled) setBatches(list);
      } catch (err: any) {
        toast({ title: 'Error', description: err?.message || 'Failed to load batches', variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [packingList.id, toast]);

  // Group rows by item for nicer numbering & summary
  const totals = useMemo(() => {
    const ordered = batches.reduce((s, b) => s + Number(b.allocated_qty || 0), 0);
    const picked = batches.reduce((s, b) => s + Number(b.picked_qty || 0), 0);
    const packed = batches.reduce((s, b) => s + Number(b.packed_qty || 0), 0);
    return { items: batches.length, ordered, picked, packed };
  }, [batches]);

  const isDraft = packingList.status === 'draft' || packingList.status === 'picking';
  const allPicked = batches.length > 0 && batches.every(b => Number(b.picked_qty) >= Number(b.allocated_qty));
  const allPackedValid = batches.length > 0 && batches.every(
    b => Number(b.packed_qty) > 0 && Number(b.packed_qty) <= Number(b.picked_qty)
  );

  const updateRow = (id: string, patch: Partial<BatchRow>) => {
    setBatches(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)));
  };

  const handlePickedChange = async (row: BatchRow, val: number) => {
    const clamped = Math.max(0, Math.min(val, Number(row.allocated_qty)));
    setSavingId(row.id);
    const res = await updateBatchPickedQty(row.id, clamped, row.packing_list_item_id);
    setSavingId(null);
    if (res.success) {
      // If reducing picked below packed, force packed down too
      const newPacked = Math.min(Number(row.packed_qty || 0), clamped);
      updateRow(row.id, { picked_qty: clamped, packed_qty: newPacked });
      if (newPacked !== Number(row.packed_qty || 0)) {
        await setBatchPackedQty(row.id, newPacked);
      }
    }
  };

  const handleMarkPicked = async (row: BatchRow) => {
    setSavingId(row.id);
    const res = await markBatchPicked(row.id, Number(row.allocated_qty), row.packing_list_item_id);
    setSavingId(null);
    if (res.success) updateRow(row.id, { picked_qty: Number(row.allocated_qty) });
  };

  const handleMarkAllPicked = async () => {
    for (const row of batches) {
      if (Number(row.picked_qty) < Number(row.allocated_qty)) {
        await markBatchPicked(row.id, Number(row.allocated_qty), row.packing_list_item_id);
      }
    }
    setBatches(prev => prev.map(b => ({ ...b, picked_qty: Number(b.allocated_qty) })));
    if (packingList.status === 'draft') {
      await updatePackingListStatus(packingList.id, 'picking');
      onStatusChange('picking');
    }
  };

  const handlePackedChange = async (row: BatchRow, val: number) => {
    const clamped = Math.max(0, Math.min(val, Number(row.picked_qty)));
    setSavingId(row.id);
    const res = await setBatchPackedQty(row.id, clamped);
    setSavingId(null);
    if (res.success) updateRow(row.id, { packed_qty: clamped });
  };

  const handleScan = async (row: BatchRow) => {
    await handlePackedChange(row, Number(row.picked_qty));
  };

  const handleConfirmPacking = async () => {
    const res = await confirmPacking(packingList.id);
    if (res.success) onStatusChange('packed');
  };

  const handleMarkReady = async () => {
    const ok = await updatePackingListStatus(packingList.id, 'ready');
    if (ok) onStatusChange('ready');
  };

  const handleCancel = async (reason: string) => {
    const ok = await cancelPackingList(packingList.id);
    if (ok) {
      // Best-effort: append reason as a note
      await supabase.from('packing_lists').update({
        notes: (packingList.notes ? packingList.notes + '\n' : '') + `[Cancelled] ${reason}`,
      }).eq('id', packingList.id);
      onCancel();
    }
  };

  // Picked rows for the right packing panel
  const pickedRows = batches.filter(b => Number(b.picked_qty) > 0);
  const isPacked = packingList.status === 'packed';

  return (
    <div className="space-y-4">
      {/* Status Timeline */}
      <Card>
        <CardContent className="p-4">
          <StatusTimeline status={packingList.status} />
        </CardContent>
      </Card>

      {/* Dual panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* PICKLIST */}
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between p-4 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-semibold">A. Picklist View <span className="text-xs text-muted-foreground">(Picker)</span></h3>
                  <p className="text-xs text-muted-foreground">Pick items as per bins / zones</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{batches.length} Items</Badge>
                <Badge variant={allPicked ? 'default' : 'secondary'}>
                  {batches.filter(b => Number(b.picked_qty) >= Number(b.allocated_qty)).length} / {batches.length} Picked
                </Badge>
              </div>
            </div>
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : batches.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                No allocated batches found. Items must be allocated before picking.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left p-2">#</th>
                      <th className="text-left p-2">Bin / Zone</th>
                      <th className="text-left p-2">Product</th>
                      <th className="text-left p-2">Batch</th>
                      <th className="text-left p-2">Expiry</th>
                      <th className="text-right p-2">Qty to Pick</th>
                      <th className="text-right p-2">Picked Qty</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-right p-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {batches.map((row, i) => {
                      const fullyPicked = Number(row.picked_qty) >= Number(row.allocated_qty);
                      const nearExpiry = row.expiry_date &&
                        differenceInDays(new Date(row.expiry_date), new Date()) <= 30 &&
                        differenceInDays(new Date(row.expiry_date), new Date()) >= 0;
                      return (
                        <tr key={row.id} className={fullyPicked ? 'bg-emerald-50/40 dark:bg-emerald-900/10' : ''}>
                          <td className="p-2 text-muted-foreground">{i + 1}</td>
                          <td className="p-2">
                            <div className="text-xs font-medium">{row.bin_zone || '—'}</div>
                          </td>
                          <td className="p-2">
                            <div className="font-medium">{row.product_name}</div>
                            <div className="text-xs text-muted-foreground">{row.unit || ''}</div>
                          </td>
                          <td className="p-2 font-mono text-xs">{row.batch_number || '—'}</td>
                          <td className="p-2 text-xs">
                            <span className="inline-flex items-center gap-1">
                              {row.expiry_date ? format(new Date(row.expiry_date), 'dd/MM/yy') : '—'}
                              {nearExpiry && <AlertTriangle className="h-3 w-3 text-amber-600" />}
                            </span>
                          </td>
                          <td className="p-2 text-right font-medium">{Number(row.allocated_qty)}</td>
                          <td className="p-2 text-right">
                            {isDraft && !fullyPicked ? (
                              <Input
                                type="number"
                                min={0}
                                max={Number(row.allocated_qty)}
                                value={Number(row.picked_qty)}
                                onChange={(e) => handlePickedChange(row, parseInt(e.target.value) || 0)}
                                className="h-7 w-20 text-right text-xs ml-auto"
                              />
                            ) : (
                              <span className="font-semibold text-primary">{Number(row.picked_qty)}</span>
                            )}
                          </td>
                          <td className="p-2">
                            {fullyPicked ? (
                              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3 mr-1" />Picked
                              </Badge>
                            ) : Number(row.picked_qty) > 0 ? (
                              <Badge variant="outline">Partial</Badge>
                            ) : (
                              <Badge variant="secondary">Pending</Badge>
                            )}
                          </td>
                          <td className="p-2 text-right">
                            {isDraft && !fullyPicked && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleMarkPicked(row)}
                                disabled={savingId === row.id}
                              >
                                Mark Picked
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {isDraft && batches.length > 0 && (
              <div className="p-3 border-t bg-muted/20 flex justify-end">
                <Button size="sm" variant="outline" onClick={handleMarkAllPicked} disabled={allPicked}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Mark All Picked
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* PACKING */}
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between p-4 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <Box className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-semibold">B. Packing View <span className="text-xs text-muted-foreground">(Packer)</span></h3>
                  <p className="text-xs text-muted-foreground">Confirm packing for picked items</p>
                </div>
              </div>
              <Badge variant={allPackedValid ? 'default' : 'secondary'}>
                {pickedRows.filter(r => Number(r.packed_qty) > 0).length} / {pickedRows.length} Packed
              </Badge>
            </div>
            {pickedRows.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                Pick items first to enable packing.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left p-2">#</th>
                      <th className="text-left p-2">Product</th>
                      <th className="text-left p-2">Batch</th>
                      <th className="text-right p-2">Picked Qty</th>
                      <th className="text-right p-2">Packed Qty</th>
                      <th className="text-center p-2">Scan / Confirm</th>
                      <th className="text-left p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pickedRows.map((row, i) => {
                      const valid = Number(row.packed_qty) > 0 && Number(row.packed_qty) <= Number(row.picked_qty);
                      return (
                        <tr key={row.id}>
                          <td className="p-2 text-muted-foreground">{i + 1}</td>
                          <td className="p-2">
                            <div className="font-medium">{row.product_name}</div>
                            <div className="text-xs text-muted-foreground">{row.unit || ''}</div>
                          </td>
                          <td className="p-2 font-mono text-xs">{row.batch_number || '—'}</td>
                          <td className="p-2 text-right font-semibold text-primary">{Number(row.picked_qty)}</td>
                          <td className="p-2 text-right">
                            {!isPacked ? (
                              <Input
                                type="number"
                                min={0}
                                max={Number(row.picked_qty)}
                                value={Number(row.packed_qty)}
                                onChange={(e) => handlePackedChange(row, parseInt(e.target.value) || 0)}
                                className="h-7 w-20 text-right text-xs ml-auto"
                              />
                            ) : (
                              <span className="font-semibold">{Number(row.packed_qty)}</span>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            {!isPacked && (
                              <Button size="sm" variant="outline" onClick={() => handleScan(row)} disabled={savingId === row.id}>
                                <ScanBarcode className="h-3.5 w-3.5 mr-1" /> Scan
                              </Button>
                            )}
                          </td>
                          <td className="p-2">
                            {valid ? (
                              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                <PackageCheck className="h-3 w-3 mr-1" />Packed
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Pending</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {!isPacked && pickedRows.length > 0 && (
              <div className="p-3 border-t bg-muted/20 flex justify-end gap-2">
                <Button size="sm" variant="outline" className="text-destructive border-destructive/30" onClick={() => setShowCancel(true)}>
                  Cancel / Revert
                </Button>
                <Button size="sm" onClick={handleConfirmPacking} disabled={!allPackedValid}>
                  <PackageCheck className="h-4 w-4 mr-1" /> Confirm Packing
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Total Items" value={totals.items} />
        <SummaryCard label="Total Ordered" value={totals.ordered} />
        <SummaryCard label="Total Picked" value={totals.picked} accent="text-emerald-600" />
        <SummaryCard label="Total Packed" value={totals.packed} accent="text-blue-600" />
      </div>

      {/* Activity Timeline */}
      <Card>
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold mb-3">Activity Timeline</h4>
          <ul className="space-y-2 text-sm">
            <TimelineEntry label="Packing list created" timestamp={packingList.created_at} />
            {totals.picked > 0 && <TimelineEntry label={allPicked ? 'All items picked' : 'Picking in progress'} timestamp={packingList.updated_at} />}
            {totals.packed > 0 && <TimelineEntry label={allPackedValid ? 'All items packed' : 'Packing in progress'} timestamp={packingList.updated_at} />}
          </ul>
        </CardContent>
      </Card>

      {/* Sticky bottom action bar */}
      <div className="sticky bottom-0 bg-card border-t -mx-4 px-4 py-3 flex items-center justify-between gap-3 z-10">
        <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setShowCancel(true)}>
          Cancel Packing List
        </Button>
        {isPacked ? (
          <Button onClick={handleMarkReady}>
            Mark as Ready for Invoice <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleConfirmPacking} disabled={!allPackedValid}>
            <PackageCheck className="h-4 w-4 mr-1" /> Confirm Packing
          </Button>
        )}
      </div>

      <CancelReasonDialog
        open={showCancel}
        onOpenChange={setShowCancel}
        onConfirm={handleCancel}
      />
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${accent || ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function TimelineEntry({ label, timestamp }: { label: string; timestamp?: string }) {
  return (
    <li className="flex items-center gap-2">
      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      <span>{label}</span>
      {timestamp && <span className="ml-auto text-xs text-muted-foreground">{format(new Date(timestamp), 'dd MMM yyyy, hh:mm a')}</span>}
    </li>
  );
}
