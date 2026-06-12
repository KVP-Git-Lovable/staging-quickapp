import { useParams, useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, ShoppingBag, ListOrdered, CalendarDays, IndianRupee, Tag, Clock, Package, Truck, BoxIcon } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { CustomerPortalUser } from '@/hooks/useCustomerPortalAuth';
import { cn } from '@/lib/utils';

interface ContextType {
  retailer: CustomerPortalUser;
}

interface LocationState {
  total?: number;
  savings?: number;
  orderDate?: string;
  displayId?: string;
}

const MINI_TIMELINE = [
  { key: 'placed', label: 'Order Placed', icon: Clock },
  { key: 'processing', label: 'Processing', icon: BoxIcon },
  { key: 'dispatched', label: 'Dispatched', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: Package },
];

const CustomerOrderSuccess = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { retailer } = useOutletContext<ContextType>();

  const state = (location.state || {}) as LocationState;
  const hasState = !!(state.total !== undefined && state.displayId);

  // Only fetch from DB if we don't have state (e.g. direct URL visit)
  const { data: order, isLoading } = useQuery({
    queryKey: ['customer-order-success', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, created_at, total_amount, discount_amount, invoice_number, order_date, packing_list_id')
        .eq('id', orderId!)
        .eq('retailer_id', retailer.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orderId && !hasState,
  });

  // Fetch packing list number if available (from DB fallback)
  const packingListId = order?.packing_list_id;
  const { data: packingList } = useQuery({
    queryKey: ['order-success-packing-list', packingListId],
    queryFn: async () => {
      const { data } = await supabase
        .from('packing_lists')
        .select('packing_list_number')
        .eq('id', packingListId!)
        .single();
      return data;
    },
    enabled: !!packingListId,
  });

  // Show loading only if we need DB and it's still loading
  if (!hasState && isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasState && !order) {
    return (
      <div className="px-4 pt-8 pb-24 max-w-lg mx-auto text-center">
        <p className="text-muted-foreground">Order not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/customer-portal/orders')}>
          View My Orders
        </Button>
      </div>
    );
  }

  // Resolve display values from state or DB
  const total = hasState ? state.total! : Number(order?.total_amount || 0);
  const savings = hasState ? (state.savings || 0) : Number(order?.discount_amount || 0);
  const displayId = hasState ? state.displayId! : (order?.invoice_number || order?.id.slice(0, 8).toUpperCase());
  const orderDateStr = hasState ? state.orderDate : (order?.order_date || order?.created_at);
  const orderDate = orderDateStr ? new Date(orderDateStr + (orderDateStr.length === 10 ? 'T00:00:00' : '')) : new Date();
  const expectedDelivery = addDays(orderDate, 3);

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto space-y-4">
      {/* Success Header */}
      <div className="flex flex-col items-center text-center space-y-2 py-4">
        <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center animate-in zoom-in-50 duration-500">
          <CheckCircle2 className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Order Placed Successfully!</h1>
        <p className="text-sm text-muted-foreground">Your order has been confirmed and sent to the distributor.</p>
      </div>

      {/* Order Summary Card */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3 pb-2 border-b border-border">
          <ListOrdered size={16} className="text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Order ID</p>
            <p className="text-sm font-semibold text-foreground">{displayId}</p>
          </div>
        </div>

        {packingList?.packing_list_number && (
          <div className="flex items-center gap-3 pb-2 border-b border-border">
            <Package size={16} className="text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Packing List</p>
              <p className="text-sm font-semibold text-foreground">{packingList.packing_list_number}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-start gap-2">
            <CalendarDays size={14} className="text-muted-foreground mt-0.5" />
            <div>
              <p className="text-[11px] text-muted-foreground">Order Date</p>
              <p className="text-sm font-medium text-foreground">{format(orderDate, 'dd MMM yyyy')}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CalendarDays size={14} className="text-muted-foreground mt-0.5" />
            <div>
              <p className="text-[11px] text-muted-foreground">Expected Delivery</p>
              <p className="text-sm font-medium text-foreground">{format(expectedDelivery, 'dd MMM yyyy')}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IndianRupee size={14} className="text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Amount</span>
            </div>
            <span className="text-base font-bold text-foreground">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
          {savings > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag size={14} className="text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm text-emerald-600 dark:text-emerald-400">You Saved</span>
              </div>
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">₹{savings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Mini Status Timeline */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Order Status</h3>
        <div className="flex items-center justify-between">
          {MINI_TIMELINE.map((step, i) => {
            const isFirst = i === 0;
            const StepIcon = step.icon;
            return (
              <div key={step.key} className="flex flex-col items-center flex-1 relative">
                {/* Connector line */}
                {i > 0 && (
                  <div className={cn(
                    "absolute top-3 right-1/2 w-full h-0.5",
                    isFirst ? "bg-emerald-500" : "bg-border"
                  )} />
                )}
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center z-10",
                  isFirst
                    ? "bg-emerald-500 text-white ring-2 ring-emerald-300 dark:ring-emerald-700"
                    : "bg-muted text-muted-foreground"
                )}>
                  <StepIcon size={12} />
                </div>
                <span className={cn(
                  "text-[9px] mt-1 text-center leading-tight",
                  isFirst ? "text-foreground font-semibold" : "text-muted-foreground"
                )}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 pt-2">
        <Button className="w-full gap-2" onClick={() => navigate('/customer-portal/orders')}>
          <ListOrdered size={16} /> View My Orders
        </Button>
        <Button variant="outline" className="w-full gap-2" onClick={() => navigate('/customer-portal/home')}>
          <ShoppingBag size={16} /> Continue Shopping
        </Button>
      </div>
    </div>
  );
};

export default CustomerOrderSuccess;
