import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, 
  Package, 
  Calendar, 
  Truck, 
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  ClipboardCheck
} from 'lucide-react';
import OrderTrackingTimeline from '@/components/distributor-portal/OrderTrackingTimeline';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface OrderItem {
  id: string;
  product_name: string;
  variant_name?: string;
  quantity: number;
  received_quantity?: number;
  unit: string;
  unit_price: number;
  line_total: number;
}

const PrimaryOrderDetail = () => {
  const navigate = useNavigate();
  const { id: orderId } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (orderId) {
      loadOrderDetails(orderId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const loadOrderDetails = async (id: string) => {
    setLoading(true);

    const startedAt = performance.now();
    try {
      // Single round-trip: fetch header + items via FK relation
      const { data, error } = await supabase
        .from('primary_orders')
        .select(
          `
          id,
          order_number,
          order_date,
          expected_delivery_date,
          actual_delivery_date,
          status,
          subtotal,
          discount_amount,
          tax_amount,
          total_amount,
          payment_terms,
          payment_status,
          notes,
          dispatch_reference,
          transporter_name,
          vehicle_number,
          dispatched_at,
          primary_order_items(
            id,
            product_name,
            variant_name,
            quantity,
            received_quantity,
            unit,
            unit_price,
            line_total
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      if (!isMountedRef.current) return;
      setOrder(data);
      setItems(((data as any)?.primary_order_items || []) as OrderItem[]);
    } catch (error) {
      console.error('Error loading order:', error);
      toast.error('Failed to load order details');
      navigate('/distributor-portal/primary-orders');
    } finally {
      const elapsedMs = Math.round(performance.now() - startedAt);
      console.debug(`[PrimaryOrderDetail] loadOrderDetails in ${elapsedMs}ms`);
      if (isMountedRef.current) setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-muted text-muted-foreground',
      submitted: 'bg-blue-100 text-blue-700',
      confirmed: 'bg-indigo-100 text-indigo-700',
      processing: 'bg-yellow-100 text-yellow-700',
      dispatched: 'bg-purple-100 text-purple-700',
      in_transit: 'bg-orange-100 text-orange-700',
      delivered: 'bg-green-100 text-green-700',
      partially_delivered: 'bg-amber-100 text-amber-700',
      cancelled: 'bg-red-100 text-red-700',
    };
    return colors[status] || 'bg-muted text-muted-foreground';
  };

  const getStatusIcon = (status: string) => {
    if (status === 'delivered') return <CheckCircle className="w-5 h-5 text-green-600" />;
    if (status === 'cancelled') return <XCircle className="w-5 h-5 text-red-600" />;
    if (['dispatched', 'in_transit'].includes(status)) return <Truck className="w-5 h-5 text-purple-600" />;
    return <Clock className="w-5 h-5 text-yellow-600" />;
  };

  const submitOrder = async () => {
    try {
      const { error } = await supabase
        .from('primary_orders')
        .update({ status: 'submitted' })
        .eq('id', orderId);

      if (error) throw error;
      toast.success('Order submitted successfully');
      if (orderId) await loadOrderDetails(orderId);
    } catch (error) {
      console.error('Error submitting order:', error);
      toast.error('Failed to submit order');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p>Order not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background standalone-page">
      {/* Header */}
      <header className="sticky-header-safe z-50 bg-card border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/distributor-portal/primary-orders')}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="font-semibold text-foreground">{order.order_number}</h1>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(order.order_date), 'dd MMM yyyy')}
                </p>
              </div>
            </div>
            <Badge className={getStatusColor(order.status)}>
              {order.status.replace('_', ' ')}
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Order Tracking Timeline */}
        <OrderTrackingTimeline orderId={order.id} currentStatus={order.status} />

        {/* Order Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Order Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Order Date</p>
                <p className="font-medium">{format(new Date(order.order_date), 'dd MMM yyyy')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Expected Delivery</p>
                <p className="font-medium">
                  {order.expected_delivery_date 
                    ? format(new Date(order.expected_delivery_date), 'dd MMM yyyy')
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Payment Terms</p>
                <p className="font-medium capitalize">{order.payment_terms?.replace('_', ' ') || 'Net 30'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Payment Status</p>
                <Badge variant="outline" className="capitalize">
                  {order.payment_status}
                </Badge>
              </div>
            </div>
            {order.notes && (
              <div className="pt-2 border-t">
                <p className="text-muted-foreground text-sm">Notes</p>
                <p className="text-sm">{order.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Shipping Info (if dispatched) */}
        {order.dispatch_reference && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Shipping Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Dispatch Reference</p>
                  <p className="font-medium">{order.dispatch_reference}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Transporter</p>
                  <p className="font-medium">{order.transporter_name || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Vehicle Number</p>
                  <p className="font-medium">{order.vehicle_number || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Dispatched At</p>
                  <p className="font-medium">
                    {order.dispatched_at 
                      ? format(new Date(order.dispatched_at), 'dd MMM yyyy, hh:mm a')
                      : '-'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Order Items */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4" />
              Order Items ({items.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {items.map((item) => (
                <div 
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{item.product_name}</p>
                    {item.variant_name && (
                      <p className="text-sm text-muted-foreground">{item.variant_name}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {item.quantity} {item.unit} × ₹{item.unit_price.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">₹{item.line_total.toLocaleString('en-IN')}</p>
                    {item.received_quantity !== undefined && item.received_quantity !== null && (
                      <p className="text-xs text-muted-foreground">
                        Received: {item.received_quantity}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Separator className="my-4" />

            {/* Totals */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>₹{order.subtotal?.toLocaleString('en-IN') || '0'}</span>
              </div>
              {order.discount_amount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount</span>
                  <span>-₹{order.discount_amount.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span>₹{order.tax_amount?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || '0'}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span className="text-primary">₹{order.total_amount?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || '0'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        {order.status === 'draft' && (
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => navigate(`/distributor-portal/primary-order/${orderId}/edit`)}
            >
              Edit Order
            </Button>
            <Button 
              className="flex-1"
              onClick={submitOrder}
            >
              <Send className="w-4 h-4 mr-2" />
              Submit Order
            </Button>
          </div>
        )}

        {/* GRN Button for dispatched/in_transit orders */}
        {['dispatched', 'in_transit'].includes(order.status) && (
          <div className="flex gap-3">
            <Button 
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={() => navigate(`/distributor-portal/goods-receipt/${orderId}`)}
            >
              <ClipboardCheck className="w-4 h-4 mr-2" />
              Receive Goods (Create GRN)
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default PrimaryOrderDetail;
