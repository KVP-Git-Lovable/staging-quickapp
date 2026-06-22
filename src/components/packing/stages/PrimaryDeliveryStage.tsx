import { useEffect, useState, useRef, Fragment } from 'react';
import { format } from 'date-fns';
import {
  Truck, Loader2, ArrowRight, Camera, PenLine, StickyNote,
  PackageCheck, Upload, AlertTriangle, X
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
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PackingList } from '@/hooks/usePackingList';
import StatusTimeline from './StatusTimeline';

interface Props {
  packingList: PackingList;
  onStatusChange: (s?: string) => void;
}

interface LineRow {
  batch_id: string;
  product_name: string;
  unit: string | null;
  dispatched_qty: number;
  delivered_qty: number;
  short_delivery_reason: string;
}

const POD_BUCKET = 'pod-uploads';

async function uploadToBucket(packingListId: string, kind: 'photo' | 'signature', file: File | Blob, ext: string): Promise<string> {
  const path = `${packingListId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(POD_BUCKET).upload(path, file, { upsert: true, contentType: file.type || 'image/png' });
  if (error) throw error;
  return path; // store storage path; viewers should use createSignedUrl on this private bucket
}

export default function PrimaryDeliveryStage({ packingList, onStatusChange }: Props) {
  const pl = packingList as any;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [exceptionOpen, setExceptionOpen] = useState(false);

  const [lines, setLines] = useState<LineRow[]>([]);
  const [receivedBy, setReceivedBy] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [deliveryTime, setDeliveryTime] = useState(format(new Date(), 'HH:mm'));
  const [podNotes, setPodNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [sigEmpty, setSigEmpty] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: items } = await supabase
          .from('packing_list_items')
          .select(`
            id, product_name, unit,
            packing_list_item_batches(id, packed_qty, picked_qty, allocated_qty, delivered_qty, short_delivery_reason)
          `)
          .eq('packing_list_id', packingList.id);

        if (cancelled) return;

        const rows: LineRow[] = [];
        (items || []).forEach((it: any) => {
          const batches = it.packing_list_item_batches || [];
          if (batches.length === 0) return;
          batches.forEach((b: any) => {
            const dispatched = Number(b.packed_qty || b.picked_qty || b.allocated_qty || 0);
            const delivered = Number(b.delivered_qty || 0) || dispatched;
            rows.push({
              batch_id: b.id,
              product_name: it.product_name,
              unit: it.unit,
              dispatched_qty: dispatched,
              delivered_qty: delivered,
              short_delivery_reason: b.short_delivery_reason || '',
            });
          });
        });
        setLines(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [packingList.id]);

  // ---- Signature canvas helpers ----
  const setupCanvas = (canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d')!;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
  };
  const pointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const { x, y } = pointer(e);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const { x, y } = pointer(e);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.lineTo(x, y);
    ctx.stroke();
    if (sigEmpty) setSigEmpty(false);
  };
  const onUp = () => { drawing.current = false; };
  const clearSig = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setSigEmpty(true);
  };
  const sigToBlob = (): Promise<Blob | null> => new Promise((res) => {
    const c = canvasRef.current;
    if (!c || sigEmpty) return res(null);
    c.toBlob((b) => res(b), 'image/png');
  });

  const onPhotoPick = (f: File | null) => {
    setPhotoFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setPhotoPreview(url);
    } else {
      setPhotoPreview(null);
    }
  };

  const updateLine = (idx: number, patch: Partial<LineRow>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const handleMarkDelivered = async () => {
    if (!receivedBy.trim()) {
      toast({ variant: 'destructive', title: 'Received by required' });
      return;
    }
    setSubmitting(true);
    try {
      const deliveredAt = new Date(`${deliveryDate}T${deliveryTime}:00`).toISOString();

      let photoUrl = '';
      let signatureUrl = '';
      if (photoFile) {
        photoUrl = await uploadToBucket(packingList.id, 'photo', photoFile, (photoFile.name.split('.').pop() || 'jpg'));
      }
      const sigBlob = await sigToBlob();
      if (sigBlob) {
        signatureUrl = await uploadToBucket(packingList.id, 'signature', sigBlob, 'png');
      }

      const linePayload = lines
        .filter((l) => l.delivered_qty !== l.dispatched_qty || l.short_delivery_reason)
        .map((l) => ({
          batch_id: l.batch_id,
          delivered_qty: l.delivered_qty,
          short_delivery_reason: l.delivered_qty < l.dispatched_qty ? (l.short_delivery_reason || 'short') : null,
        }));

      const { data, error } = await supabase.rpc('confirm_primary_delivery_atomic' as any, {
        p_packing_list_id: packingList.id,
        p_received_by: receivedBy,
        p_delivered_at: deliveredAt,
        p_pod_photo_url: photoUrl,
        p_pod_signature_url: signatureUrl,
        p_pod_notes: podNotes,
        p_lines: linePayload,
      } as any);
      if (error) throw error;
      const res: any = data;
      if (!res?.success) throw new Error(res?.error || 'Delivery confirmation failed');
      toast({ title: 'Marked as delivered' });
      onStatusChange('delivered');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e.message });
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
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-primary">Stage B</span>
        <h2 className="text-base font-semibold">Delivery &amp; POD</h2>
        <Badge variant="outline" className="text-[10px] tracking-wide bg-primary/5 border-primary/20 text-primary">
          DISPATCHED → DELIVERED
        </Badge>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Truck className="h-5 w-5 text-amber-700 dark:text-amber-300" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">{packingList.packing_list_number}</h3>
                <p className="text-xs text-muted-foreground">
                  In transit · {pl.dispatch_driver || '—'} · {pl.dispatch_vehicle || '—'}
                </p>
              </div>
            </div>
            <Badge className="bg-amber-100 text-amber-800 border-amber-200">DISPATCHED</Badge>
          </div>
          <StatusTimeline status={packingList.status} />
        </CardContent>
      </Card>

      {/* Delivery Details */}
      <Card>
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <PackageCheck className="h-4 w-4 text-primary" /> Delivery Details
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Received By</Label>
              <Input value={receivedBy} placeholder="— enter name" onChange={(e) => setReceivedBy(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Delivery Date</Label>
              <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Delivery Time</Label>
              <Input type="time" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</Label>
              <div className="mt-2 text-sm text-primary font-medium">Confirming…</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delivered Quantities */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold">Delivered Quantities</h4>
            <span className="text-[11px] text-muted-foreground">defaults to dispatched; edit for partial</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b">
                  <th className="text-left py-2 w-8">#</th>
                  <th className="text-left py-2">Product</th>
                  <th className="text-right py-2 w-24">Dispatched</th>
                  <th className="text-right py-2 w-32">Delivered</th>
                  <th className="text-right py-2 w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const isShort = l.delivered_qty < l.dispatched_qty;
                  const isFull = l.delivered_qty === l.dispatched_qty;
                  return (
                    <>
                      <tr key={l.batch_id} className={isShort ? 'bg-rose-50/60 dark:bg-rose-950/20' : ''}>
                        <td className="py-2 text-muted-foreground">{i + 1}</td>
                        <td className="py-2 font-medium text-primary">{l.product_name}</td>
                        <td className="py-2 text-right">{l.dispatched_qty}</td>
                        <td className="py-2 text-right">
                          <Input
                            type="number"
                            value={l.delivered_qty}
                            onChange={(e) => updateLine(i, { delivered_qty: Number(e.target.value) })}
                            className="h-7 text-right w-20 ml-auto"
                            min={0}
                            max={l.dispatched_qty}
                          />
                        </td>
                        <td className="py-2 text-right">
                          <span className={isFull ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>
                            {isFull ? 'Full' : `Short ${l.dispatched_qty - l.delivered_qty} · ${l.short_delivery_reason || 'reason?'}`}
                          </span>
                        </td>
                      </tr>
                      {isShort && (
                        <tr className="bg-rose-50/30 dark:bg-rose-950/10">
                          <td></td>
                          <td colSpan={4} className="pb-2">
                            <Input
                              placeholder="Reason for short delivery (e.g. damaged, refused)"
                              value={l.short_delivery_reason}
                              onChange={(e) => updateLine(i, { short_delivery_reason: e.target.value })}
                              className="h-7 text-xs"
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* POD photo + signature */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Camera className="h-4 w-4 text-primary" /> Proof of Delivery — Photo
            </h4>
            {photoPreview ? (
              <div className="relative">
                <img src={photoPreview} alt="POD" className="rounded border max-h-48 mx-auto" />
                <Button size="icon" variant="ghost" className="absolute top-1 right-1 h-6 w-6" onClick={() => onPhotoPick(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <label className="block border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30">
                <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-2" />
                <div className="text-sm font-medium">Upload / capture photo</div>
                <div className="text-[11px] text-muted-foreground mt-1">JPG or PNG · stored to pod_photo_url</div>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => onPhotoPick(e.target.files?.[0] || null)}
                />
              </label>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <PenLine className="h-4 w-4 text-primary" /> Receiver Signature
              </h4>
              <Button size="sm" variant="ghost" onClick={clearSig}>Clear</Button>
            </div>
            <div className="border-2 border-dashed rounded-lg bg-background">
              <canvas
                ref={(el) => el && setupCanvas(el)}
                width={500}
                height={150}
                className="w-full h-[150px] touch-none rounded"
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerLeave={onUp}
              />
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">Sign here · stored to pod_signature_url</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <StickyNote className="h-4 w-4 text-amber-500" /> Delivery Notes
          </h4>
          <Textarea
            rows={2}
            placeholder="optional remarks (e.g. left with security, partial accepted)…"
            value={podNotes}
            onChange={(e) => setPodNotes(e.target.value)}
          />
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        Partial / short delivery is captured per line with a reason for v1.
      </div>

      <div className="sticky bottom-0 bg-card border-t -mx-4 px-4 py-3 flex items-center justify-end gap-3 z-10">
        <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => setExceptionOpen(true)}>
          <AlertTriangle className="h-4 w-4 mr-1" /> Report Exception
        </Button>
        <Button onClick={handleMarkDelivered} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
          Mark as Delivered <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      <Dialog open={exceptionOpen} onOpenChange={setExceptionOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Report Exception</DialogTitle></DialogHeader>
          <Textarea rows={3} placeholder="Describe the exception (refused, address issue, vehicle breakdown, etc.)" value={podNotes} onChange={(e) => setPodNotes(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setExceptionOpen(false)}>Close</Button>
            <Button onClick={async () => {
              await supabase.from('packing_lists').update({ pod_notes: podNotes } as any).eq('id', packingList.id);
              setExceptionOpen(false);
              toast({ title: 'Exception saved' });
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
