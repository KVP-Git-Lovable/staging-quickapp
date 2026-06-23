import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { 
  Truck, 
  ArrowLeft, 
  MapPin, 
  Phone, 
  CheckCircle2, 
  AlertCircle, 
  XCircle,
  Camera,
  Package,
  Navigation,
  Clock,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { deductVanStockAfterDelivery } from '@/utils/inventoryReservation';

type DeliveryKind = 'primary' | 'secondary';

interface DeliveryLine {
  product_id: string;
  product_name: string;
  quantity: number;
  unit?: string;
  // Primary only
  batch_id?: string;
}

interface DeliveryOrder {
  id: string;
  kind: DeliveryKind;
  retailer_id: string;
  retailer_name: string;
  retailer_address: string;
  retailer_phone: string;
  beat_name: string;
  total_amount: number;
  items: DeliveryLine[];
  delivery_status: 'dispatched' | 'delivered' | 'partial' | 'failed';
  delivery_notes?: string;
  delivery_proof_url?: string;
  // Primary only
  packing_list_number?: string;
  dispatched_at?: string | null;
  total_packages?: number | null;
  total_units?: number;
}

export default function DeliveryRun() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  // Delivery update dialog
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryOrder | null>(null);
  const [showDeliveryDialog, setShowDeliveryDialog] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState<'delivered' | 'partial' | 'failed'>('delivered');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [kindFilter, setKindFilter] = useState<'all' | DeliveryKind>('all');
  const [primaryLineQty, setPrimaryLineQty] = useState<Record<string, string>>({});

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    getUser();
  }, []);

  // Load assigned deliveries
  useEffect(() => {
    const loadDeliveries = async () => {
      if (!userId) return;

      setLoading(true);
      try {
        const today = format(new Date(), 'yyyy-MM-dd');

        const { data: orders, error } = await supabase
          .from('orders')
          .select(`
            id,
            retailer_id,
            total_amount,
            items,
            delivery_status,
            delivery_notes,
            delivery_proof_url,
            retailers(
              id,
              name,
              address,
              contact_phone,
              beat_name
            )
          `)
          .eq('assigned_agent_id', userId)
          .eq('delivery_date', today)
          .in('delivery_status', ['dispatched', 'delivered', 'partial', 'failed'])
          .order('created_at', { ascending: true });

        if (error) throw error;

        const secondaryDeliveries: DeliveryOrder[] = (orders || []).map((order: any) => ({
          id: order.id,
          kind: 'secondary',
          retailer_id: order.retailer_id,
          retailer_name: order.retailers?.name || 'Unknown',
          retailer_address: order.retailers?.address || '',
          retailer_phone: order.retailers?.contact_phone || '',
          beat_name: order.retailers?.beat_name || '',
          total_amount: order.total_amount,
          items: order.items || [],
          delivery_status: order.delivery_status,
          delivery_notes: order.delivery_notes,
          delivery_proof_url: order.delivery_proof_url
        }));

        // Primary packing-list completion is driven by the child distributor's GRN,
        // not by this delivery run. Only secondary retailer deliveries are shown here.
        setDeliveries(secondaryDeliveries);
      } catch (error) {
        console.error('Error loading deliveries:', error);
        toast({
          title: "Error",
          description: "Failed to load deliveries",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    loadDeliveries();
  }, [userId, toast]);

  const openDeliveryDialog = (delivery: DeliveryOrder) => {
    setSelectedDelivery(delivery);
    setDeliveryStatus('delivered');
    setDeliveryNotes('');
    setProofImage(null);
    if (delivery.kind === 'primary') {
      const seed: Record<string, string> = {};
      delivery.items.forEach((it, idx) => {
        const key = it.batch_id || `${idx}`;
        seed[key] = String(it.quantity);
      });
      setPrimaryLineQty(seed);
    } else {
      setPrimaryLineQty({});
    }
    setShowDeliveryDialog(true);
  };

  const handleImageCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProofImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateDelivery = async () => {
    if (!selectedDelivery || !userId) return;

    setUpdating(true);
    try {
      let proofUrl = null;

      // Upload proof image if captured
      if (proofImage) {
        const base64Data = proofImage.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });

        const fileName = `delivery-proof/${selectedDelivery.id}-${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('delivery-proofs')
          .upload(fileName, blob);

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('delivery-proofs')
            .getPublicUrl(fileName);
          proofUrl = publicUrl;
        }
      }

      if (selectedDelivery.kind === 'primary') {
        // Primary delivery via atomic RPC
        const lines = selectedDelivery.items
          .filter((it) => !!it.batch_id)
          .map((it, idx) => ({
            batch_id: it.batch_id,
            delivered_qty: Number(primaryLineQty[it.batch_id || `${idx}`] ?? it.quantity) || 0,
            short_delivery_reason:
              deliveryStatus === 'partial' || deliveryStatus === 'failed'
                ? (deliveryNotes || deliveryStatus)
                : null,
          }));

        const { data: rpcRes, error: rpcErr } = await supabase.rpc(
          'confirm_primary_delivery_atomic' as any,
          {
            p_packing_list_id: selectedDelivery.id,
            p_received_by: null,
            p_delivered_at: new Date().toISOString(),
            p_pod_photo_url: proofUrl,
            p_pod_signature_url: null,
            p_pod_notes: deliveryNotes || null,
            p_lines: lines,
          } as any
        );
        if (rpcErr) throw rpcErr;
        const res: any = rpcRes;
        if (res && res.success === false) throw new Error(res.error || 'Delivery confirm failed');
      } else {
        // Secondary: existing flow (orders + van stock)
        const { error: updateError } = await supabase
          .from('orders')
          .update({
            delivery_status: deliveryStatus,
            delivery_notes: deliveryNotes,
            delivery_proof_url: proofUrl,
            delivered_at: deliveryStatus === 'delivered' ? new Date().toISOString() : null
          })
          .eq('id', selectedDelivery.id);

        if (updateError) throw updateError;

        if (deliveryStatus === 'delivered' || deliveryStatus === 'partial') {
          const deliveredItems = selectedDelivery.items.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
          }));
          await deductVanStockAfterDelivery(
            userId,
            format(new Date(), 'yyyy-MM-dd'),
            deliveredItems
          );
        }
      }

      // Update local state
      setDeliveries(prev => prev.map(d => 
        d.id === selectedDelivery.id 
          ? { ...d, delivery_status: deliveryStatus, delivery_notes: deliveryNotes, delivery_proof_url: proofUrl || undefined }
          : d
      ));

      toast({
        title: "Success",
        description: `Delivery marked as ${deliveryStatus}`
      });

      setShowDeliveryDialog(false);
    } catch (error) {
      console.error('Error updating delivery:', error);
      toast({
        title: "Error",
        description: "Failed to update delivery",
        variant: "destructive"
      });
    } finally {
      setUpdating(false);
    }
  };

  const openMaps = (address: string) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  };

  const callRetailer = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  // Calculate stats
  const filteredDeliveries = deliveries.filter((d) =>
    kindFilter === 'all' ? true : d.kind === kindFilter
  );
  const primaryCount = deliveries.filter((d) => d.kind === 'primary').length;
  const secondaryCount = deliveries.filter((d) => d.kind === 'secondary').length;

  const totalDeliveries = filteredDeliveries.length;
  const completedDeliveries = filteredDeliveries.filter(d => d.delivery_status === 'delivered').length;
  const partialDeliveries = filteredDeliveries.filter(d => d.delivery_status === 'partial').length;
  const failedDeliveries = filteredDeliveries.filter(d => d.delivery_status === 'failed').length;
  const pendingDeliveries = filteredDeliveries.filter(d => d.delivery_status === 'dispatched').length;
  const progress = totalDeliveries > 0 ? ((completedDeliveries + partialDeliveries + failedDeliveries) / totalDeliveries) * 100 : 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'delivered':
        return <Badge className="bg-green-100 text-green-800">Delivered</Badge>;
      case 'partial':
        return <Badge className="bg-amber-100 text-amber-800">Partial</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'partial':
        return <AlertCircle className="h-5 w-5 text-amber-600" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-card border-b sticky top-0 z-10">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Delivery Run</h1>
              <p className="text-sm text-muted-foreground">{format(new Date(), 'dd MMM yyyy')}</p>
            </div>
          </div>
          <Truck className="h-6 w-6 text-primary" />
        </div>
      </div>

      {/* Progress Card */}
      <div className="p-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Delivery Progress</span>
              <span className="text-sm text-muted-foreground">
                {completedDeliveries + partialDeliveries + failedDeliveries} / {totalDeliveries}
              </span>
            </div>
            <Progress value={progress} className="h-3" />
            <div className="grid grid-cols-4 gap-2 mt-4">
              <div className="text-center">
                <p className="text-lg font-bold text-muted-foreground">{pendingDeliveries}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-green-600">{completedDeliveries}</p>
                <p className="text-xs text-muted-foreground">Delivered</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-amber-600">{partialDeliveries}</p>
                <p className="text-xs text-muted-foreground">Partial</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-red-600">{failedDeliveries}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter chips */}
      <div className="px-4 pb-2 flex items-center gap-2">
        {(['all', 'primary', 'secondary'] as const).map((k) => {
          const count = k === 'all' ? deliveries.length : k === 'primary' ? primaryCount : secondaryCount;
          const active = kindFilter === k;
          return (
            <button
              key={k}
              onClick={() => setKindFilter(k)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {k.charAt(0).toUpperCase() + k.slice(1)} <span className="opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Deliveries List */}
      <div className="px-4 space-y-3">
        {filteredDeliveries.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No deliveries assigned for today</p>
            </CardContent>
          </Card>
        ) : (
          filteredDeliveries.map((delivery, index) => (
            <Card 
              key={delivery.id} 
              className={`overflow-hidden ${delivery.delivery_status === 'dispatched' ? 'border-primary/50' : ''}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                      delivery.delivery_status === 'dispatched' ? 'bg-primary/10' : 'bg-muted'
                    }`}>
                      <span className="text-sm font-bold">{index + 1}</span>
                    </div>
                    {index < filteredDeliveries.length - 1 && (
                      <div className="w-0.5 h-full min-h-[40px] bg-border mt-2" />
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{delivery.retailer_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {delivery.kind === 'primary' && delivery.packing_list_number
                            ? delivery.packing_list_number
                            : delivery.beat_name}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge
                          variant="outline"
                          className={
                            delivery.kind === 'primary'
                              ? 'border-primary/40 text-primary bg-primary/5 text-[10px]'
                              : 'border-muted-foreground/30 text-muted-foreground text-[10px]'
                          }
                        >
                          {delivery.kind.toUpperCase()}
                        </Badge>
                        {getStatusBadge(delivery.delivery_status)}
                      </div>
                    </div>

                    {delivery.kind === 'secondary' && (
                      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{delivery.retailer_address || 'No address'}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-4">
                      <div>
                        {delivery.kind === 'primary' ? (
                          <>
                            <p className="text-sm text-muted-foreground">
                              {delivery.total_units ?? 0} units
                              {delivery.total_packages ? ` · ${delivery.total_packages} cartons` : ''}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {delivery.dispatched_at
                                ? `Dispatched ${format(new Date(delivery.dispatched_at), 'HH:mm')}`
                                : 'Dispatched'}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm text-muted-foreground">{delivery.items.length} items</p>
                            <p className="font-semibold">₹{delivery.total_amount.toLocaleString()}</p>
                          </>
                        )}
                      </div>
                      
                      <div className="flex gap-2">
                        {delivery.retailer_phone && (
                          <Button 
                            variant="outline" 
                            size="icon"
                            onClick={() => callRetailer(delivery.retailer_phone)}
                          >
                            <Phone className="h-4 w-4" />
                          </Button>
                        )}
                        {delivery.retailer_address && (
                          <Button 
                            variant="outline" 
                            size="icon"
                            onClick={() => openMaps(delivery.retailer_address)}
                          >
                            <Navigation className="h-4 w-4" />
                          </Button>
                        )}
                        {delivery.delivery_status === 'dispatched' && (
                          <Button onClick={() => openDeliveryDialog(delivery)}>
                            Update
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Delivery Update Dialog */}
      <Dialog open={showDeliveryDialog} onOpenChange={setShowDeliveryDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Delivery</DialogTitle>
            <DialogDescription>
              {selectedDelivery?.retailer_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Order Summary */}
            <div className="bg-muted p-3 rounded-lg">
              <p className="text-sm font-medium mb-2">
                {selectedDelivery?.kind === 'primary' ? 'Dispatched Items' : 'Order Items'}
              </p>
              {selectedDelivery?.items.map((item, idx) => {
                const key = item.batch_id || `${idx}`;
                const editable =
                  selectedDelivery.kind === 'primary' &&
                  !!item.batch_id &&
                  deliveryStatus !== 'delivered';
                return (
                  <div key={idx} className="flex justify-between items-center text-sm py-1">
                    <span className="truncate pr-2">{item.product_name}</span>
                    {editable ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={item.quantity}
                          value={primaryLineQty[key] ?? String(item.quantity)}
                          onChange={(e) =>
                            setPrimaryLineQty((p) => ({ ...p, [key]: e.target.value }))
                          }
                          className="w-16 h-7 px-2 rounded border bg-background text-right text-sm"
                        />
                        <span className="text-xs text-muted-foreground">
                          / {item.quantity} {item.unit || 'pcs'}
                        </span>
                      </div>
                    ) : (
                      <span>
                        {item.quantity} {item.unit || 'pcs'}
                      </span>
                    )}
                  </div>
                );
              })}
              {selectedDelivery?.kind !== 'primary' && (
                <div className="border-t mt-2 pt-2 flex justify-between font-semibold">
                  <span>Total</span>
                  <span>₹{selectedDelivery?.total_amount.toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Status Selection */}
            <div>
              <label className="text-sm font-medium">Delivery Status</label>
              <Select value={deliveryStatus} onValueChange={(v: any) => setDeliveryStatus(v)}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="delivered">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      Delivered
                    </div>
                  </SelectItem>
                  <SelectItem value="partial">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      Partial Delivery
                    </div>
                  </SelectItem>
                  <SelectItem value="failed">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-600" />
                      Failed
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div>
              <label className="text-sm font-medium">Notes (Optional)</label>
              <Textarea
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder="Add any notes about this delivery..."
                className="mt-2"
              />
            </div>

            {/* Proof Photo */}
            <div>
              <label className="text-sm font-medium">Proof Photo</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleImageCapture}
              />
              {proofImage ? (
                <div className="mt-2 relative">
                  <img 
                    src={proofImage} 
                    alt="Proof" 
                    className="w-full h-40 object-cover rounded-lg"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute bottom-2 right-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Retake
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full mt-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Take Photo
                </Button>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeliveryDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateDelivery} disabled={updating}>
              {updating ? 'Updating...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
