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

        // Primary source: packing_lists assigned to me, dispatched (or already delivered)
        const { data: pls } = await supabase
          .from('packing_lists')
          .select(`
            id, packing_list_number, dispatched_at, total_packages, total_value, dispatch_destination,
            pod_photo_url, pod_notes, status, distributor_id,
            distributors(name, city, address),
            packing_list_items(
              id, product_id, ordered_qty, picked_qty,
              products(name, base_uom),
              packing_list_item_batches(id, packed_qty, picked_qty, allocated_qty, delivered_qty)
            )
          `)
          .eq('assigned_agent_id', userId)
          .eq('order_type', 'primary')
          .in('status', ['dispatched', 'delivered', 'completed'])
          .order('dispatched_at', { ascending: true });

        const primaryDeliveries: DeliveryOrder[] = (pls || []).map((p: any) => {
          const items: DeliveryLine[] = [];
          let totalUnits = 0;
          (p.packing_list_items || []).forEach((it: any) => {
            const batches = it.packing_list_item_batches || [];
            if (batches.length === 0) {
              const qty = Number(it.picked_qty || it.ordered_qty || 0);
              totalUnits += qty;
              items.push({
                product_id: it.product_id,
                product_name: it.products?.name || 'Item',
                quantity: qty,
                unit: it.products?.base_uom || 'pcs',
              });
            } else {
              batches.forEach((b: any) => {
                const qty = Number(b.packed_qty || b.picked_qty || b.allocated_qty || 0);
                totalUnits += qty;
                items.push({
                  product_id: it.product_id,
                  product_name: it.products?.name || 'Item',
                  quantity: qty,
                  unit: it.products?.base_uom || 'pcs',
                  batch_id: b.id,
                });
              });
            }
          });
          const destName = p.distributors?.name || p.dispatch_destination || 'Distributor';
          const destCity = p.distributors?.city || '';
          const status: DeliveryOrder['delivery_status'] =
            p.status === 'dispatched' ? 'dispatched' : 'delivered';
          return {
            id: p.id,
            kind: 'primary',
            retailer_id: p.distributor_id,
            retailer_name: destCity ? `${destName} — ${destCity}` : destName,
            retailer_address: p.distributors?.address || p.dispatch_destination || '',
            retailer_phone: '',
            beat_name: 'Primary DC',
            total_amount: Number(p.total_value || 0),
            items,
            delivery_status: status,
            delivery_notes: p.pod_notes || undefined,
            delivery_proof_url: p.pod_photo_url || undefined,
            packing_list_number: p.packing_list_number,
            dispatched_at: p.dispatched_at,
            total_packages: p.total_packages,
            total_units: totalUnits,
          };
        });

        setDeliveries([...primaryDeliveries, ...secondaryDeliveries]);
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

      // Update order
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

      // Deduct van stock for delivered items
      if (deliveryStatus === 'delivered' || deliveryStatus === 'partial') {
        const deliveredItems = selectedDelivery.items.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity
        }));

        await deductVanStockAfterDelivery(
          userId,
          format(new Date(), 'yyyy-MM-dd'),
          deliveredItems
        );
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
  const totalDeliveries = deliveries.length;
  const completedDeliveries = deliveries.filter(d => d.delivery_status === 'delivered').length;
  const partialDeliveries = deliveries.filter(d => d.delivery_status === 'partial').length;
  const failedDeliveries = deliveries.filter(d => d.delivery_status === 'failed').length;
  const pendingDeliveries = deliveries.filter(d => d.delivery_status === 'dispatched').length;
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

      {/* Deliveries List */}
      <div className="px-4 space-y-3">
        {deliveries.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No deliveries assigned for today</p>
            </CardContent>
          </Card>
        ) : (
          deliveries.map((delivery, index) => (
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
                    {index < deliveries.length - 1 && (
                      <div className="w-0.5 h-full min-h-[40px] bg-border mt-2" />
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{delivery.retailer_name}</p>
                        <p className="text-sm text-muted-foreground">{delivery.beat_name}</p>
                      </div>
                      {getStatusBadge(delivery.delivery_status)}
                    </div>

                    <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{delivery.retailer_address || 'No address'}</span>
                    </div>

                    <div className="flex items-center justify-between mt-4">
                      <div>
                        <p className="text-sm text-muted-foreground">{delivery.items.length} items</p>
                        <p className="font-semibold">₹{delivery.total_amount.toLocaleString()}</p>
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
              <p className="text-sm font-medium mb-2">Order Items</p>
              {selectedDelivery?.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span>{item.product_name}</span>
                  <span>{item.quantity} {item.unit || 'pcs'}</span>
                </div>
              ))}
              <div className="border-t mt-2 pt-2 flex justify-between font-semibold">
                <span>Total</span>
                <span>₹{selectedDelivery?.total_amount.toLocaleString()}</span>
              </div>
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
