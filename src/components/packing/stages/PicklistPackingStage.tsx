import { useEffect, useMemo, useState } from 'react';
import { format, differenceInDays } from 'date-fns';
import {
  CheckCircle2, ScanBarcode, AlertTriangle, PackageCheck, Loader2,
  ClipboardList, Box, ArrowRight, XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { usePackingList, PackingList } from '@/hooks/usePackingList';
import StatusTimeline from './StatusTimeline';
import CancelReasonDialog from './CancelReasonDialog';
import { BarcodeScannerDialog } from './BarcodeScannerDialog';
import { useToast } from '@/hooks/use-toast';

const SHORT_PICK_REASONS = [
  'Stock not available',
  'Damaged batch found',
  'Batch expired',
  'Wrong product in bin',
  'Qty mismatch in warehouse',
  'Other',
];

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
  short_pick_reason?: string | null;
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
    markBatchPicked, updateBatchPickedQty, setBatchPackedQty,
    confirmPacking, updatePackingListStatus, cancelPackingList,
  } = usePackingList();

  const [batches, setBatches]       = useState<BatchRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [savingId, setSavingId]     = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [activeStage, setActiveStage] = useState<'picking' | 'packing'>(
    packingList.status === 'packed' ? 'packing' : 'picking'
  );

  // Barcode scan dialog state
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [scanTargetRow, setScanTargetRow]   = useState<BatchRow | null>(null);

  // Packing confirmation dialog state
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [packingNotes, setPackingNotes]           = useState('');
  const [confirmingSave, setConfirmingSave]        = useState(false);

  // Load batches
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

        if (!items || items.length === 0) { if (!cancelled) setBatches([]); return; }
        const itemIds = items.map((i: any) => i.id);

        const { data: rows, error } = await supabase
          .from('packing_list_item_batches' as any)
          .select('id, packing_list_item_id, batch_id, batch_number, expiry_date, allocated_qty, picked_qty, packed_qty, packed_at, short_pick_reason')
          .in('packing_list_item_id', itemIds);
        if (error) throw error;

        const list: BatchRow[] = ((rows || []) as any[]).map((r: any) => {
          const meta = itemMap.get(r.packing_list_item_id) || { product_name: '—', unit: null };
          return { ...r, product_name: meta.product_name, unit: meta.unit, bin_zone: null };
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

  const totals = useMemo(() => {
    const ordered = batches.reduce((s, b) => s + Number(b.allocated_qty || 0), 0);
    const picked  = batches.reduce((s, b) => s + Number(b.picked_qty   || 0), 0);
    const packed  = batches.reduce((s, b) => s + Number(b.packed_qty   || 0), 0);
    return { items: batches.length, ordered, picked, packed };
  }, [batches]);

  const shortPicks = batches.filter(b => Number(b.picked_qty) < Number(b.allocated_qty) && Number(b.picked_qty) > 0);
  const unloggedShorts = shortPicks.filter(b => !b.short_pick_reason);
  const allPicked      = batches.length > 0 && batches.every(b => Number(b.picked_qty) >= Number(b.allocated_qty) || Number(b.picked_qty) > 0);
  const allPackedValid = batches.filter(b => Number(b.picked_qty) > 0).length > 0 &&
    batches.filter(b => Number(b.picked_qty) > 0).every(b => Number(b.packed_qty) > 0 && Number(b.packed_qty) <= Number(b.picked_qty));

  const isDraft  = packingList.status === 'draft' || packingList.status === 'picking';
  const isPacked = packingList.status === 'packed';

  const updateRow = (id: string, patch: Partial<BatchRow>) =>
    setBatches(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));

  const handlePickedChange = async (row: BatchRow, val: number) => {
    const clamped = Math.max(0, Math.min(val, Number(row.allocated_qty)));
    setSavingId(row.id);
    const res = await updateBatchPickedQty(row.id, clamped, row.packing_list_item_id);
    setSavingId(null);
    if (res.success) {
      const newPacked = Math.min(Number(row.packed_qty || 0), clamped);
      updateRow(row.id, { picked_qty: clamped, packed_qty: newPacked });
      if (newPacked !== Number(row.packed_qty || 0)) await setBatchPackedQty(row.id, newPacked);
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

  const handleShortReasonChange = async (row: BatchRow, reason: string) => {
    updateRow(row.id, { short_pick_reason: reason });
    await supabase.from('packing_list_item_batches' as any)
      .update({ short_pick_reason: reason } as any)
      .eq('id', row.id);
  };

  const handlePackedChange = async (row: BatchRow, val: number) => {
    const clamped = Math.max(0, Math.min(val, Number(row.picked_qty)));
    setSavingId(row.id);
    const res = await setBatchPackedQty(row.id, clamped);
    setSavingId(null);
    if (res.success) updateRow(row.id, { packed_qty: clamped });
  };

  // Open the barcode scanner dialog for a specific batch row
  const openScanDialog = (row: BatchRow) => {
    setScanTargetRow(row);
    setScanDialogOpen(true);
  };

  // Called by BarcodeScannerDialog when scan is verified
  const handleScanSuccess = async (scannedCode: string) => {
    if (!scanTargetRow) return;
    const row = scanTargetRow;
    // Set packed_qty = picked_qty
    await handlePackedChange(row, Number(row.picked_qty));
    // Stamp scanned_at on the batch
    await supabase.from('packing_list_item_batches' as any)
      .update({ scanned_at: new Date().toISOString() } as any)
      .eq('id', row.id);
    updateRow(row.id, { packed_qty: Number(row.picked_qty) });
    toast({ title: 'Batch verified ✓', description: `${row.batch_number || scannedCode} confirmed` });
    setScanTargetRow(null);
  };

  const handleScanAllPack = async () => {
    for (const row of pickedRows) {
      if (Number(row.packed_qty) < Number(row.picked_qty)) {
        await setBatchPackedQty(row.id, Number(row.picked_qty));
      }
    }
    setBatches(prev => prev.map(b => ({ ...b, packed_qty: Number(b.picked_qty) })));
  };

  // Complete picking → move to packing stage
  const handleCompletePicking = async () => {
    if (unloggedShorts.length > 0) {
      toast({ title: 'Log all short-pick reasons first', description: `${unloggedShorts.length} short pick(s) need a reason`, variant: 'destructive' });
      return;
    }
    if (packingList.status === 'draft') {
      await updatePackingListStatus(packingList.id, 'picking');
      onStatusChange('picking');
    }
    setActiveStage('packing');
  };

  // Open confirmation dialog before confirming packing
  const openConfirmDialog = () => {
    if (!allPackedValid) {
      toast({ title: 'All picked items must be packed', description: 'Enter packed qty for every row', variant: 'destructive' });
      return;
    }
    setConfirmDialogOpen(true);
  };

  const handleConfirmPacking = async () => {
    setConfirmingSave(true);
    try {
      // Persist packing notes
      if (packingNotes) {
        await supabase.from('packing_lists')
          .update({ packing_notes: packingNotes, packing_confirmed_at: new Date().toISOString() } as any)
          .eq('id', packingList.id);
      }
      const res = await confirmPacking(packingList.id);
      if (res.success) {
        setConfirmDialogOpen(false);
        onStatusChange('packed');
      }
    } finally {
      setConfirmingSave(false);
    }
  };

  const handleMarkReady = async () => {
    const ok = await updatePackingListStatus(packingList.id, 'ready');
    if (ok) onStatusChange('ready');
  };

  const handleCancel = async (reason: string) => {
    const ok = await cancelPackingList(packingList.id);
    if (ok) {
      await supabase.from('packing_lists').update({
        notes: (packingList.notes ? packingList.notes + '\n' : '') + `[Cancelled] ${reason}`,
      }).eq('id', packingList.id);
      onCancel();
    }
  };

  const pickedRows = batches.filter(b => Number(b.picked_qty) > 0);
  const pickProgress  = batches.length > 0 ? Math.round((batches.filter(b => Number(b.picked_qty) >= Number(b.allocated_qty)).length / batches.length) * 100) : 0;
  const packProgress  = pickedRows.length > 0 ? Math.round((pickedRows.filter(b => Number(b.packed_qty) > 0).length / pickedRows.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Status Timeline */}
      <Card>
        <CardContent className="p-4">
          <StatusTimeline status={activeStage === 'packing' && (packingList.status === 'draft' || packingList.status === 'picking') ? 'packed' : packingList.status} />
        </CardContent>
      </Card>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total batches" value={totals.items} />
        <StatCard label="Total ordered"  value={totals.ordered} />
        <StatCard label="Total picked"   value={totals.picked}  accent="text-amber-600" />
        <StatCard label="Total packed"   value={totals.packed}  accent="text-blue-600" />
      </div>

      {/* Stage tabs */}
      <div className="flex gap-2">
        {(['picking', 'packing'] as const).map(stage => (
          <button
            key={stage}
            onClick={() => setActiveStage(stage)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              activeStage === stage
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {stage === 'picking' ? (
              <span className="flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> Picking</span>
            ) : (
              <span className="flex items-center gap-1.5"><Box className="h-3.5 w-3.5" /> Packing</span>
            )}
          </button>
        ))}
      </div>

      {/* ── PICKING STAGE ── */}
      {activeStage === 'picking' && (
        <Card>
          <CardHeader className="py-3 px-4 border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" /> Picking list
                  <span className="text-xs font-normal text-muted-foreground">(Picker)</span>
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Pick items as per bin / zone</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{pickProgress}% picked</span>
                <div className="w-20 h-1.5 bg-border rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pickProgress}%` }} />
                </div>
                <Badge variant="outline">{batches.length} batches</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : batches.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">No allocated batches found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left p-2">#</th>
                      <th className="text-left p-2">Bin</th>
                      <th className="text-left p-2">Product · Batch · Expiry</th>
                      <th className="text-right p-2">To pick</th>
                      <th className="text-right p-2">Picked qty</th>
                      <th className="text-center p-2">Scan</th>
                      <th className="text-center p-2">Status</th>
                      <th className="text-center p-2">Short reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {batches.map((row, i) => {
                      const fullyPicked = Number(row.picked_qty) >= Number(row.allocated_qty);
                      const isShort     = !fullyPicked && Number(row.picked_qty) > 0;
                      const nearExpiry  = row.expiry_date &&
                        differenceInDays(new Date(row.expiry_date), new Date()) <= 30 &&
                        differenceInDays(new Date(row.expiry_date), new Date()) >= 0;
                      return (
                        <tr key={row.id} className={fullyPicked ? 'bg-emerald-50/40 dark:bg-emerald-900/10' : isShort ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}>
                          <td className="p-2 text-muted-foreground text-xs">{i + 1}</td>
                          <td className="p-2">
                            <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{row.bin_zone || '—'}</span>
                          </td>
                          <td className="p-2">
                            <div className="font-medium text-sm">{row.product_name}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              {row.batch_number || '—'}
                              {row.expiry_date && (
                                <span className={nearExpiry ? 'text-amber-600 font-medium' : ''}>
                                  · {format(new Date(row.expiry_date), 'dd/MM/yy')}
                                  {nearExpiry && <AlertTriangle className="h-3 w-3 inline ml-0.5" />}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-2 text-right font-medium">{Number(row.allocated_qty)}</td>
                          <td className="p-2 text-right">
                            {isDraft && !fullyPicked ? (
                              <Input
                                type="number" min={0} max={Number(row.allocated_qty)}
                                value={Number(row.picked_qty)}
                                onChange={(e) => handlePickedChange(row, parseInt(e.target.value) || 0)}
                                className="h-7 w-20 text-right text-xs ml-auto"
                              />
                            ) : (
                              <span className="font-semibold text-primary">{Number(row.picked_qty)}</span>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            {isDraft && !fullyPicked && (
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                                onClick={() => handleMarkPicked(row)} disabled={savingId === row.id}>
                                <ScanBarcode className="h-3.5 w-3.5" /> Mark
                              </Button>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            {fullyPicked ? (
                              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Picked
                              </Badge>
                            ) : isShort ? (
                              <Badge className="bg-amber-100 text-amber-800">
                                <AlertTriangle className="h-3 w-3 mr-1" /> Short
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Pending</Badge>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            {isShort && (
                              <Select
                                value={row.short_pick_reason || ''}
                                onValueChange={(v) => handleShortReasonChange(row, v)}
                              >
                                <SelectTrigger className="h-7 text-xs w-40">
                                  <SelectValue placeholder="Select reason *" />
                                </SelectTrigger>
                                <SelectContent>
                                  {SHORT_PICK_REASONS.map(r => (
                                    <SelectItem key={r} value={r}>{r}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Short pick warnings */}
            {unloggedShorts.length > 0 && (
              <div className="mx-4 mb-2 p-2.5 bg-amber-50 border border-amber-200 dark:bg-amber-900/20 rounded-lg flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span><strong>{unloggedShorts.length}</strong> short pick(s) require a reason before completing picking.</span>
              </div>
            )}

            <div className="p-3 border-t bg-muted/20 flex items-center justify-between gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowCancel(true)} className="text-destructive border-destructive/30">
                <XCircle className="h-4 w-4 mr-1" /> Cancel list
              </Button>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleMarkAllPicked} disabled={allPicked}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Mark all picked
                </Button>
                <Button size="sm" onClick={handleCompletePicking}
                  disabled={batches.length === 0 || !allPicked || unloggedShorts.length > 0}>
                  Complete picking <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── PACKING STAGE ── */}
      {activeStage === 'packing' && (
        <Card>
          <CardHeader className="py-3 px-4 border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Box className="h-4 w-4 text-primary" /> Packing
                  <span className="text-xs font-normal text-muted-foreground">(Packer)</span>
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Confirm packing for picked items</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{packProgress}% packed</span>
                <div className="w-20 h-1.5 bg-border rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${packProgress}%` }} />
                </div>
                <Badge variant={allPackedValid ? 'default' : 'secondary'}>
                  {pickedRows.filter(r => Number(r.packed_qty) > 0).length} / {pickedRows.length} packed
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {pickedRows.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                No picked items yet. Complete picking first.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left p-2">#</th>
                      <th className="text-left p-2">Product</th>
                      <th className="text-left p-2">Batch · Expiry</th>
                      <th className="text-right p-2">Picked qty</th>
                      <th className="text-right p-2">Packed qty</th>
                      <th className="text-center p-2">Scan / confirm</th>
                      <th className="text-center p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pickedRows.map((row, i) => {
                      const valid      = Number(row.packed_qty) > 0 && Number(row.packed_qty) <= Number(row.picked_qty);
                      const nearExpiry = row.expiry_date &&
                        differenceInDays(new Date(row.expiry_date), new Date()) <= 30 &&
                        differenceInDays(new Date(row.expiry_date), new Date()) >= 0;
                      return (
                        <tr key={row.id} className={valid ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}>
                          <td className="p-2 text-xs text-muted-foreground">{i + 1}</td>
                          <td className="p-2">
                            <div className="font-medium">{row.product_name}</div>
                            <div className="text-xs text-muted-foreground">{row.unit || ''}</div>
                          </td>
                          <td className="p-2 text-xs">
                            <span>{row.batch_number || '—'}</span>
                            {row.expiry_date && (
                              <span className={`ml-1 ${nearExpiry ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                · {format(new Date(row.expiry_date), 'dd/MM/yy')}
                                {nearExpiry && <AlertTriangle className="h-3 w-3 inline ml-0.5" />}
                              </span>
                            )}
                          </td>
                          <td className="p-2 text-right font-semibold text-amber-600">{Number(row.picked_qty)}</td>
                          <td className="p-2 text-right">
                            {!isPacked ? (
                              <Input
                                type="number" min={0} max={Number(row.picked_qty)}
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
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                                onClick={() => openScanDialog(row)} disabled={savingId === row.id}>
                                <ScanBarcode className="h-3.5 w-3.5" /> Scan
                              </Button>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            {valid ? (
                              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                <PackageCheck className="h-3 w-3 mr-1" /> Packed
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

            <div className="p-3 border-t bg-muted/20 flex items-center justify-between gap-2">
              <Button size="sm" variant="outline" onClick={() => setActiveStage('picking')}>
                ← Back to picking
              </Button>
              <div className="flex gap-2">
                {!isPacked && pickedRows.length > 0 && (
                  <Button size="sm" variant="outline" onClick={handleScanAllPack}>
                    Scan all
                  </Button>
                )}
                {isPacked ? (
                  <Button size="sm" onClick={handleMarkReady}>
                    Proceed to dispatch <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button size="sm" onClick={openConfirmDialog} disabled={!allPackedValid}>
                    <PackageCheck className="h-4 w-4 mr-1" /> Confirm packing
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancel packing list button */}
      <div className="flex justify-start">
        <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10 text-sm"
          onClick={() => setShowCancel(true)}>
          Cancel packing list
        </Button>
      </div>

      {/* Packing confirmation dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm packing</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {/* Auto-checks */}
            {[
              { label: 'All picked items have a packed qty',                ok: allPackedValid },
              { label: 'No unpicked batches with zero reason',              ok: unloggedShorts.length === 0 },
              { label: 'Packed qty ≤ picked qty for all items',             ok: batches.every(b => Number(b.packed_qty) <= Number(b.picked_qty)) },
            ].map(c => (
              <div key={c.label} className="flex items-center gap-2 text-sm">
                {c.ok
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  : <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />}
                <span className={c.ok ? 'text-foreground' : 'text-destructive'}>{c.label}</span>
              </div>
            ))}
            <div className="pt-1">
              <Label className="text-xs text-muted-foreground">Packer notes (optional)</Label>
              <Textarea
                value={packingNotes}
                onChange={e => setPackingNotes(e.target.value)}
                placeholder="Any notes about packing exceptions…"
                className="mt-1 min-h-[60px] text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleConfirmPacking} disabled={confirmingSave || !allPackedValid}>
              {confirmingSave && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Confirm &amp; proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CancelReasonDialog open={showCancel} onOpenChange={setShowCancel} onConfirm={handleCancel} />

      {/* Barcode scanner dialog — camera (Option 1) + manual/BT (Option 2) */}
      <BarcodeScannerDialog
        open={scanDialogOpen}
        onOpenChange={(v) => { setScanDialogOpen(v); if (!v) setScanTargetRow(null); }}
        expectedCode={scanTargetRow?.batch_number ?? null}
        productName={scanTargetRow?.product_name}
        onSuccess={handleScanSuccess}
        allowMismatch={false}
      />
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${accent || ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

