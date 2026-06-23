import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { 
  Truck, 
  MapPin, 
  Phone, 
  CheckCircle2, 
  AlertCircle, 
  XCircle,
  Camera,
  Package,
  Navigation,
  Clock,
  ChevronRight,
  ChevronDown
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { deductVanStockAfterDelivery } from '@/utils/inventoryReservation';

interface DeliveryOrder {
  id: string;
  retailer_id: string;
  retailer_name: string;
  retailer_address: string;
  retailer_phone: string;
  beat_name: string;
  total_amount: number;
  items: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    unit?: string;
  }>;
  delivery_status: 'dispatched' | 'delivered' | 'partial' | 'failed';
  delivery_notes?: string;
  delivery_proof_url?: string;
  packing_list_number?: string;
}

interface AssignedPackingList {
  id: string;
  packing_list_number: string;
  delivery_date: string;
  total_orders: number;
  total_items: number;
  total_value: number;
  status: string;
  orders: DeliveryOrder[];
  is_primary?: boolean;
  dispatch_destination?: string | null;
  total_packages?: number | null;
  dispatched_at?: string | null;
}


export default function MyDeliveriesTab() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [assignedPackingLists, setAssignedPackingLists] = useState<AssignedPackingList[]>([]);
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set());

  // Delivery update dialog
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryOrder | null>(null);
  const [showDeliveryDialog, setShowDeliveryDialog] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState<'delivered' | 'partial' | 'failed'>('delivered');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

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

  // Load assigned packing lists and their orders
  useEffect(() => {
    const loadAssignedDeliveries = async () => {
      if (!userId) return;

      setLoading(true);
      try {
        const today = format(new Date(), 'yyyy-MM-dd');
        console.log('[MyDeliveries] Loading for user:', userId);
        console.log('[MyDeliveries] Today date:', today);

        // Get packing lists assigned to this agent
        const { data: assignments, error: assignmentError } = await supabase
          .from('packing_list_assignments')
          .select(`
            id,
            packing_list_id,
            packing_lists(
              id,
              packing_list_number,
              delivery_date,
              total_orders,
              total_items,
              total_value,
              status
            )
          `)
          .eq('agent_id', userId);

        console.log('[MyDeliveries] Raw assignments:', assignments);
        console.log('[MyDeliveries] Assignment error:', assignmentError);

        if (assignmentError) throw assignmentError;

        // Filter to today's or future packing lists
        // Handle both object and array formats for nested data
        const relevantAssignments = (assignments || []).filter((a: any) => {
          // Supabase can return nested data as object or array
          const packingList = Array.isArray(a.packing_lists) 
            ? a.packing_lists[0] 
            : a.packing_lists;
          
          if (!packingList) {
            console.log('[MyDeliveries] Skipping assignment - no packing list data:', a);
            return false;
          }

          // Proper date comparison
          const deliveryDate = new Date(packingList.delivery_date + 'T00:00:00');
          const todayDate = new Date(today + 'T00:00:00');
          const isValidDate = deliveryDate >= todayDate;
          const isValidStatus = packingList.status === 'dispatched' || packingList.status === 'packed';
          
          console.log('[MyDeliveries] Checking PL:', packingList.packing_list_number,
            '| Status:', packingList.status, '(valid:', isValidStatus, ')',
            '| Date:', packingList.delivery_date, '(valid:', isValidDate, ')');

          return isValidStatus && isValidDate;
        });

        console.log('[MyDeliveries] Relevant assignments count:', relevantAssignments.length);

        // For each packing list, get the orders
        const packingListsWithOrders: AssignedPackingList[] = [];

        for (const assignment of relevantAssignments) {
          // Handle both object and array formats
          const packingList = Array.isArray((assignment as any).packing_lists) 
            ? (assignment as any).packing_lists[0] 
            : (assignment as any).packing_lists;
          if (!packingList) continue;

          const { data: orders, error: ordersError } = await supabase
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
            .eq('packing_list_id', packingList.id)
            .order('created_at', { ascending: true });

          if (ordersError) {
            console.error('Error loading orders:', ordersError);
            continue;
          }

          const formattedOrders: DeliveryOrder[] = (orders || []).map((order: any) => ({
            id: order.id,
            retailer_id: order.retailer_id,
            retailer_name: order.retailers?.name || 'Unknown',
            retailer_address: order.retailers?.address || '',
            retailer_phone: order.retailers?.contact_phone || '',
            beat_name: order.retailers?.beat_name || '',
            total_amount: order.total_amount,
            items: order.items || [],
            delivery_status: order.delivery_status || 'dispatched',
            delivery_notes: order.delivery_notes,
            delivery_proof_url: order.delivery_proof_url,
            packing_list_number: packingList.packing_list_number
          }));

          packingListsWithOrders.push({
            id: packingList.id,
            packing_list_number: packingList.packing_list_number,
            delivery_date: packingList.delivery_date,
            total_orders: packingList.total_orders,
            total_items: packingList.total_items,
            total_value: packingList.total_value,
            status: packingList.status,
            orders: formattedOrders
          });
        }

        // Primary packing-list completion is driven by the child distributor's GRN,
        // not by this delivery screen. Only secondary deliveries are loaded here.


        setAssignedPackingLists(packingListsWithOrders);

        
        // Auto-expand today's packing lists
        const todayLists = packingListsWithOrders
          .filter(pl => pl.delivery_date === today)
          .map(pl => pl.id);
        setExpandedLists(new Set(todayLists));

      } catch (error) {
        console.error('Error loading assigned deliveries:', error);
        toast({
          title: "Error",
          description: "Failed to load deliveries",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    loadAssignedDeliveries();
  }, [userId, toast]);

  const toggleExpand = (listId: string) => {
    setExpandedLists(prev => {
      const newSet = new Set(prev);
      if (newSet.has(listId)) {
        newSet.delete(listId);
      } else {
        newSet.add(listId);
      }
      return newSet;
    });
  };

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
      setAssignedPackingLists(prev => prev.map(pl => ({
        ...pl,
        orders: pl.orders.map(o => 
          o.id === selectedDelivery.id 
            ? { ...o, delivery_status: deliveryStatus, delivery_notes: deliveryNotes, delivery_proof_url: proofUrl || undefined }
            : o
        )
      })));

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

  // Calculate overall stats
  const allOrders = assignedPackingLists.flatMap(pl => pl.orders);
  const totalDeliveries = allOrders.length;
  const completedDeliveries = allOrders.filter(d => d.delivery_status === 'delivered').length;
  const partialDeliveries = allOrders.filter(d => d.delivery_status === 'partial').length;
  const failedDeliveries = allOrders.filter(d => d.delivery_status === 'failed').length;
  const pendingDeliveries = allOrders.filter(d => d.delivery_status === 'dispatched').length;
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
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">Today's Delivery Progress</span>
            </div>
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

      {/* Assigned Packing Lists */}
      {assignedPackingLists.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No deliveries assigned to you</p>
            <p className="text-sm text-muted-foreground mt-1">
              Check back later or contact your manager
            </p>
          </CardContent>
        </Card>
      ) : (
        assignedPackingLists.map((packingList) => {
          const listOrders = packingList.orders;
          const listCompleted = listOrders.filter(o => o.delivery_status === 'delivered').length;
          const listProgress = listOrders.length > 0 
            ? (listOrders.filter(o => ['delivered', 'partial', 'failed'].includes(o.delivery_status)).length / listOrders.length) * 100 
            : 0;

          return (
            <Collapsible
              key={packingList.id}
              open={expandedLists.has(packingList.id)}
              onOpenChange={() => toggleExpand(packingList.id)}
            >
              <Card>
                <CollapsibleTrigger className="w-full">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Package className="h-5 w-5 text-primary" />
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{packingList.packing_list_number}</p>
                            {packingList.is_primary && (
                              <Badge className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0">PRIMARY</Badge>
                            )}
                          </div>
                          {packingList.is_primary ? (
                            <p className="text-sm text-muted-foreground">
                              {packingList.dispatch_destination || 'Destination N/A'} • {packingList.total_packages ?? 0} pkgs • {packingList.total_items ?? 0} units
                              {packingList.dispatched_at && (
                                <> • Dispatched {format(new Date(packingList.dispatched_at), 'dd MMM HH:mm')}</>
                              )}
                            </p>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(packingList.delivery_date), 'dd MMM yyyy')} • {listOrders.length} orders
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {packingList.is_primary ? (
                          <Badge variant="outline">Dispatched</Badge>
                        ) : (
                          <Badge variant={listProgress === 100 ? "default" : "outline"}>
                            {listCompleted}/{listOrders.length}
                          </Badge>
                        )}
                        {expandedLists.has(packingList.id) ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    {!packingList.is_primary && <Progress value={listProgress} className="h-1.5 mt-3" />}

                  </CardContent>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="px-4 pb-4 space-y-3 border-t pt-3">
                    {listOrders.map((delivery, index) => (
                      <Card 
                        key={delivery.id} 
                        className={`overflow-hidden ${delivery.delivery_status === 'dispatched' ? 'border-primary/50' : ''}`}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start gap-3">
                            <div className="flex flex-col items-center">
                              <div className={`h-7 w-7 rounded-full flex items-center justify-center ${
                                delivery.delivery_status === 'dispatched' ? 'bg-primary/10' : 'bg-muted'
                              }`}>
                                <span className="text-xs font-bold">{index + 1}</span>
                              </div>
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{delivery.retailer_name}</p>
                                  <p className="text-xs text-muted-foreground">{delivery.beat_name}</p>
                                </div>
                                {getStatusBadge(delivery.delivery_status)}
                              </div>

                              {delivery.retailer_address && (
                                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate">{delivery.retailer_address}</span>
                                </div>
                              )}

                              <div className="flex items-center justify-between mt-3">
                                <div>
                                  <p className="text-xs text-muted-foreground">{delivery.items.length} items</p>
                                  <p className="font-semibold text-sm">₹{delivery.total_amount.toLocaleString()}</p>
                                </div>
                                
                                <div className="flex gap-1">
                                  {delivery.retailer_phone && (
                                    <Button 
                                      variant="outline" 
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        callRetailer(delivery.retailer_phone);
                                      }}
                                    >
                                      <Phone className="h-3 w-3" />
                                    </Button>
                                  )}
                                  {delivery.retailer_address && (
                                    <Button 
                                      variant="outline" 
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openMaps(delivery.retailer_address);
                                      }}
                                    >
                                      <Navigation className="h-3 w-3" />
                                    </Button>
                                  )}
                                  {delivery.delivery_status === 'dispatched' && (
                                    <Button 
                                      size="sm"
                                      className="h-8"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openDeliveryDialog(delivery);
                                      }}
                                    >
                                      Update
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })
      )}

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
                placeholder="Add any notes about the delivery..."
                className="mt-2"
              />
            </div>

            {/* Photo Capture */}
            <div>
              <label className="text-sm font-medium">Proof of Delivery</label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={fileInputRef}
                onChange={handleImageCapture}
                className="hidden"
              />
              <div className="mt-2">
                {proofImage ? (
                  <div className="relative">
                    <img 
                      src={proofImage} 
                      alt="Delivery proof" 
                      className="w-full h-32 object-cover rounded-lg"
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
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Capture Photo
                  </Button>
                )}
              </div>
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
