import { useMemo } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Package, ShoppingBag, Phone, Globe, MessageCircle, CheckCircle2, Circle, Clock, Truck, BoxIcon, Download, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { CustomerPortalUser } from '@/hooks/useCustomerPortalAuth';
import { InvoicePDFGenerator } from '@/components/invoice/InvoicePDFGenerator';
import { OrderInvoicePDFGenerator } from '@/components/invoice/OrderInvoicePDFGenerator';

interface ContextType {
  retailer: CustomerPortalUser;
}

const statusConfig: Record<string, { label: string; class: string }> = {
  draft: { label: 'Draft', class: 'bg-muted text-muted-foreground' },
  pending: { label: 'Pending', class: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  submitted: { label: 'Submitted', class: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  confirmed: { label: 'Confirmed', class: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  processing: { label: 'Processing', class: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400' },
  allocated: { label: 'Allocated', class: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400' },
  shipped: { label: 'Shipped', class: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  dispatched: { label: 'Dispatched', class: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  partially_delivered: { label: 'Partially Delivered', class: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  delivered: { label: 'Delivered', class: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  cancelled: { label: 'Cancelled', class: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
};

const sourceConfig: Record<string, { label: string; icon: typeof ShoppingBag }> = {
  portal_order: { label: 'Portal', icon: Globe },
  manual: { label: 'Direct', icon: ShoppingBag },
  voice: { label: 'Phone', icon: Phone },
  phone: { label: 'Phone', icon: Phone },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
};

function getSourceLabel(source: string | null) {
  return sourceConfig[source || ''] || { label: 'Direct', icon: ShoppingBag };
}

// Supply status timeline steps
const TIMELINE_STEPS = [
  { key: 'placed', label: 'Order Placed', icon: Clock },
  { key: 'confirmed', label: 'Confirmed', icon: CheckCircle2 },
  { key: 'processing', label: 'Processing', icon: BoxIcon },
  { key: 'shipped', label: 'Shipped', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: Package },
];

function getStepIndex(status: string): number {
  switch (status) {
    case 'draft': case 'pending': case 'submitted': return 0;
    case 'confirmed': return 1;
    case 'processing': case 'allocated': return 2;
    case 'shipped': case 'dispatched': return 3;
    case 'delivered': case 'partially_delivered': return 4;
    case 'cancelled': return -1;
    default: return 0;
  }
}

const CustomerOrderDetail = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { retailer } = useOutletContext<ContextType>();

  const { data: order, isLoading } = useQuery({
    queryKey: ['customer-order-detail', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(id, product_name, quantity, rate, total, unit, category)')
        .eq('id', orderId!)
        .eq('retailer_id', retailer.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orderId,
  });

  // Fetch distributor name
  const { data: distributor } = useQuery({
    queryKey: ['customer-order-distributor', order?.distributor_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('distributors')
        .select('id, name')
        .eq('id', order!.distributor_id!)
        .single();
      return data;
    },
    enabled: !!order?.distributor_id,
  });

  // Fetch packing list reference
  const { data: packingList } = useQuery({
    queryKey: ['customer-order-packing-list', order?.packing_list_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('packing_lists')
        .select('id, packing_list_number')
        .eq('id', order!.packing_list_id!)
        .single();
      return data;
    },
    enabled: !!order?.packing_list_id,
  });

  // Fetch invoice linked to this order
  const { data: invoice } = useQuery({
    queryKey: ['customer-order-invoice', orderId],
    queryFn: async () => {
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, total_amount, status')
        .eq('order_id', orderId!)
        .maybeSingle();
      return data;
    },
    enabled: !!orderId,
  });

  // Fetch collection history from credit_ledger
  const { data: collections = [] } = useQuery({
    queryKey: ['customer-order-collections', orderId],
    queryFn: async () => {
      const { data } = await supabase
        .from('credit_ledger')
        .select('id, amount, type, created_at')
        .eq('reference_id', orderId!)
        .eq('type', 'payment')
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!orderId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="px-4 pt-4 pb-24 max-w-lg mx-auto text-center py-20">
        <p className="text-muted-foreground">Order not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/customer-portal/orders')}>
          <ArrowLeft size={16} className="mr-2" /> Back to Orders
        </Button>
      </div>
    );
  }

  const source = getSourceLabel(order.order_source);
  const status = statusConfig[order.status] || { label: order.status, class: 'bg-muted text-muted-foreground' };
  const SourceIcon = source.icon;
  const items = order.order_items || [];
  const pending = Math.max(0, Number(order.total_amount || 0) - Number(order.amount_collected || 0));
  const currentStep = getStepIndex(order.status);
  const isCancelled = order.status === 'cancelled';

  const paymentBadge = pending <= 0
    ? { label: 'Paid', class: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' }
    : Number(order.amount_collected || 0) > 0
      ? { label: 'Partial', class: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' }
      : { label: 'Unpaid', class: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' };

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/customer-portal/orders')} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-foreground">Order Details</h1>
          <p className="text-[11px] text-muted-foreground">
            {format(new Date(order.created_at), 'dd MMM yyyy, hh:mm a')}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <SourceIcon size={14} className="text-muted-foreground" />
          <Badge className={`text-[10px] ${status.class}`}>{status.label}</Badge>
        </div>
      </div>

      {/* Distributor & Reference */}
      {(distributor || packingList) && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Building2 size={16} className="text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Fulfillment Details</h3>
          </div>
          <div className="space-y-1.5 text-sm">
            {distributor && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Distributor</span>
                <span className="font-medium text-foreground">{distributor.name}</span>
              </div>
            )}
            {packingList && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Distributor Reference</span>
                <span className="font-medium text-foreground">{packingList.packing_list_number}</span>
              </div>
            )}
          </div>
        </Card>
      )}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Supply Status</h3>
        {isCancelled ? (
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <Circle size={16} />
            <span className="text-sm font-medium">Order Cancelled</span>
            {order.cancelled_at && (
              <span className="text-xs text-muted-foreground ml-auto">{format(new Date(order.cancelled_at), 'dd MMM, hh:mm a')}</span>
            )}
          </div>
        ) : (
          <div className="relative pl-6">
            {TIMELINE_STEPS.map((step, i) => {
              const isCompleted = i <= currentStep;
              const isCurrent = i === currentStep;
              const StepIcon = step.icon;
              let dateStr = '';
              if (i === 0 && order.created_at) dateStr = format(new Date(order.created_at), 'dd MMM, hh:mm a');
              if (i === 3 && order.dispatched_at) dateStr = format(new Date(order.dispatched_at), 'dd MMM, hh:mm a');
              if (i === 4 && order.delivered_at) dateStr = format(new Date(order.delivered_at), 'dd MMM, hh:mm a');

              return (
                <div key={step.key} className="relative flex items-start gap-3 pb-4 last:pb-0">
                  {/* Vertical line */}
                  {i < TIMELINE_STEPS.length - 1 && (
                    <div className={`absolute left-[-12px] top-6 w-0.5 h-full ${isCompleted && i < currentStep ? 'bg-emerald-500' : 'bg-border'}`} />
                  )}
                  {/* Icon */}
                  <div className={`absolute left-[-18px] flex items-center justify-center w-5 h-5 rounded-full ${
                    isCompleted ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'
                  } ${isCurrent ? 'ring-2 ring-emerald-300 dark:ring-emerald-700' : ''}`}>
                    <StepIcon size={11} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${isCompleted ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {step.label}
                    </p>
                    {dateStr && <p className="text-[10px] text-muted-foreground">{dateStr}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Amount & Payment */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-foreground">Payment Details</h3>
          <Badge className={`text-[10px] ${paymentBadge.class}`}>{paymentBadge.label}</Badge>
        </div>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>₹{Number(order.subtotal || order.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
          {Number(order.discount_amount || 0) > 0 && (
            <div className="flex justify-between text-green-600 dark:text-green-400">
              <span>Discount</span>
              <span>-₹{Number(order.discount_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-foreground border-t border-border pt-1.5">
            <span>Total</span>
            <span>₹{Number(order.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
          {Number(order.amount_collected || 0) > 0 && (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>Collected</span>
              <span>₹{Number(order.amount_collected).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          {pending > 0 && (
            <div className="flex justify-between font-bold text-red-600 dark:text-red-400">
              <span>Pending</span>
              <span>₹{pending.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Invoice Section */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">Invoice</h3>
        {((invoice || order.invoice_number) && ['confirmed', 'dispatched', 'delivered', 'partially_delivered'].includes(order.status)) ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{invoice?.invoice_number || order.invoice_number}</p>
              {invoice?.invoice_date && (
                <p className="text-[11px] text-muted-foreground">{format(new Date(invoice.invoice_date), 'dd MMM yyyy')}</p>
              )}
            </div>
            {invoice?.id ? (
              <InvoicePDFGenerator invoiceId={invoice.id} buttonLabel="Download" buttonIcon={<Download className="mr-1.5 h-3.5 w-3.5" />} />
            ) : order.invoice_number ? (
              <OrderInvoicePDFGenerator orderId={order.id} invoiceNumber={order.invoice_number} />
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-2 py-2">
            <Clock size={14} className="text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Invoice Not Generated Yet</p>
              <p className="text-[11px] text-muted-foreground/70">Invoice will be generated after dispatch</p>
            </div>
          </div>
        )}
      </Card>

      {/* Collection History */}
      {collections.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-2">Collection History</h3>
          <div className="space-y-2">
            {collections.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <div>
                  <p className="text-sm text-foreground">Payment</p>
                  <p className="text-[10px] text-muted-foreground">{format(new Date(c.created_at), 'dd MMM yyyy, hh:mm a')}</p>
                </div>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  ₹{Math.abs(Number(c.amount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Items List */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Package size={16} className="text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Items ({items.length})</h3>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No item details available</p>
        ) : (
          <div className="space-y-2">
            {items.map((item: any) => (
              <div key={item.id} className="flex justify-between items-start py-1.5 border-b border-border last:border-0">
                <div className="min-w-0 flex-1 mr-2">
                  <p className="text-sm font-medium text-foreground line-clamp-2">{item.product_name || 'Product'}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {item.quantity} {item.unit || 'pcs'} × ₹{Number(item.rate || 0).toFixed(2)}
                  </p>
                </div>
                <p className="text-sm font-semibold text-foreground whitespace-nowrap">
                  ₹{Number(item.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default CustomerOrderDetail;
