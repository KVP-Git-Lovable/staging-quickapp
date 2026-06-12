import { useState, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ClipboardList, ShoppingBag, Phone, Globe, ChevronRight, MessageCircle, IndianRupee, Calendar as CalendarIcon } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, isWithinInterval, parseISO } from 'date-fns';
import { CustomerPortalUser } from '@/hooks/useCustomerPortalAuth';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

interface ContextType {
  retailer: CustomerPortalUser;
}

type TimeFilter = 'this_month' | 'last_month' | 'this_year' | 'date_range';
type OrderSourceFilter = 'all' | 'portal' | 'direct' | 'phone' | 'whatsapp';

const statusConfig: Record<string, { label: string; class: string }> = {
  draft: { label: 'Draft', class: 'bg-muted text-muted-foreground' },
  pending: { label: 'Pending', class: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  submitted: { label: 'Submitted', class: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  confirmed: { label: 'Confirmed', class: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  processing: { label: 'Processing', class: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400' },
  allocated: { label: 'Allocated', class: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400' },
  shipped: { label: 'Shipped', class: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  dispatched: { label: 'Dispatched', class: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  partially_delivered: { label: 'Partial', class: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
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

function getSourceBucket(source: string | null): Exclude<OrderSourceFilter, 'all'> {
  if (source === 'portal_order') return 'portal';
  if (source === 'whatsapp') return 'whatsapp';
  if (source === 'voice' || source === 'phone') return 'phone';
  return 'direct';
}

function matchesSourceFilter(source: string | null, filter: OrderSourceFilter) {
  return filter === 'all' || getSourceBucket(source) === filter;
}

const sourceFilterLabels: Record<Exclude<OrderSourceFilter, 'all'>, string> = {
  portal: 'Portal',
  direct: 'Direct',
  phone: 'Phone',
  whatsapp: 'WhatsApp',
};

const CustomerOrders = () => {
  const { retailer } = useOutletContext<ContextType>();
  const navigate = useNavigate();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('this_month');
  const [sourceFilter, setSourceFilter] = useState<OrderSourceFilter>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const { data: allOrders = [], isLoading } = useQuery({
    queryKey: ['customer-orders', retailer.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, created_at, order_date, total_amount, subtotal, discount_amount, status, order_source, invoice_number, delivery_date, delivered_at, payment_method, payment_status, amount_collected, delivery_status, order_items(id, product_name, quantity, rate, total, unit, category)')
        .eq('retailer_id', retailer.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });

  const timeFilteredOrders = useMemo(() => {
    const now = new Date();
    let start: Date, end: Date;
    switch (timeFilter) {
      case 'this_month': start = startOfMonth(now); end = endOfMonth(now); break;
      case 'last_month': { const lm = subMonths(now, 1); start = startOfMonth(lm); end = endOfMonth(lm); break; }
      case 'this_year': start = startOfYear(now); end = endOfMonth(now); break;
      case 'date_range':
        if (!dateFrom || !dateTo) return allOrders;
        start = dateFrom; end = dateTo;
        break;
    }
    return allOrders.filter(o => {
      const d = parseISO(o.created_at);
      return isWithinInterval(d, { start, end });
    });
  }, [allOrders, timeFilter, dateFrom, dateTo]);

  const filteredOrders = useMemo(() => {
    return timeFilteredOrders.filter((order) => matchesSourceFilter(order.order_source, sourceFilter));
  }, [timeFilteredOrders, sourceFilter]);

  const counts = useMemo(() => {
    const next = { portal: 0, direct: 0, phone: 0, whatsapp: 0 };

    for (const order of timeFilteredOrders) {
      next[getSourceBucket(order.order_source)]++;
    }

    return next;
  }, [timeFilteredOrders]);

  const totalPending = useMemo(() => {
    return timeFilteredOrders.reduce((sum, o) => {
      const pending = Number(o.total_amount || 0) - Number(o.amount_collected || 0);
      return sum + Math.max(0, pending);
    }, 0);
  }, [timeFilteredOrders]);

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground">My Orders</h2>
        <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="this_year">This Year</SelectItem>
            <SelectItem value="date_range">Date Range</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Date range pickers */}
      {timeFilter === 'date_range' && (
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("flex-1 h-8 text-xs justify-start", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                {dateFrom ? format(dateFrom, 'dd MMM yy') : 'From'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <span className="text-xs text-muted-foreground">–</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("flex-1 h-8 text-xs justify-start", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                {dateTo ? format(dateTo, 'dd MMM yy') : 'To'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-2">
        <SummaryCard icon={Globe} label="Portal" count={counts.portal} color="text-blue-600 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-950/30" active={sourceFilter === 'portal'} onClick={() => setSourceFilter((prev) => prev === 'portal' ? 'all' : 'portal')} />
        <SummaryCard icon={ShoppingBag} label="Direct" count={counts.direct} color="text-emerald-600 dark:text-emerald-400" bg="bg-emerald-50 dark:bg-emerald-950/30" active={sourceFilter === 'direct'} onClick={() => setSourceFilter((prev) => prev === 'direct' ? 'all' : 'direct')} />
        <SummaryCard icon={Phone} label="Phone" count={counts.phone} color="text-purple-600 dark:text-purple-400" bg="bg-purple-50 dark:bg-purple-950/30" active={sourceFilter === 'phone'} onClick={() => setSourceFilter((prev) => prev === 'phone' ? 'all' : 'phone')} />
        <SummaryCard icon={MessageCircle} label="WhatsApp" count={counts.whatsapp} color="text-green-600 dark:text-green-400" bg="bg-green-50 dark:bg-green-950/30" active={sourceFilter === 'whatsapp'} onClick={() => setSourceFilter((prev) => prev === 'whatsapp' ? 'all' : 'whatsapp')} />
      </div>

      {sourceFilter !== 'all' && (
        <p className="text-[11px] text-muted-foreground">
          Showing {sourceFilterLabels[sourceFilter]} orders. Tap the selected card again to show all.
        </p>
      )}

      {/* Payment Summary Strip */}
      {totalPending > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-red-50 dark:bg-red-950/30 px-4 py-2.5 border border-red-200 dark:border-red-800/40">
          <div className="flex items-center gap-2">
            <IndianRupee size={16} className="text-red-600 dark:text-red-400" />
            <span className="text-xs font-medium text-red-700 dark:text-red-300">Total Pending</span>
          </div>
          <span className="text-sm font-bold text-red-700 dark:text-red-300">
            ₹{totalPending.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>
      )}

      {/* Order List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No orders found</p>
          <p className="text-sm mt-1">{sourceFilter === 'all' ? 'Try a different time filter' : 'Try another source or time filter'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredOrders.map((order) => {
            const source = getSourceLabel(order.order_source);
            const status = statusConfig[order.status] || { label: order.status, class: 'bg-muted text-muted-foreground' };
            const SourceIcon = source.icon;
            const pending = Math.max(0, Number(order.total_amount || 0) - Number(order.amount_collected || 0));
            return (
              <Card
                key={order.id}
                className="p-3 cursor-pointer hover:bg-muted/30 transition-colors active:scale-[0.99]"
                onClick={() => navigate(`/customer-portal/orders/${order.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <SourceIcon size={14} className="text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium text-muted-foreground">{source.label} Order</span>
                      <Badge className={`text-[10px] px-1.5 py-0 ${status.class}`}>
                        {status.label}
                      </Badge>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        ₹{Number(order.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                      {pending > 0 && (
                        <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
                          ₹{pending.toLocaleString('en-IN')} pending
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {format(new Date(order.created_at), 'dd MMM yyyy, hh:mm a')}
                      {order.order_items?.length ? ` • ${order.order_items.length} items` : ''}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-muted-foreground shrink-0" />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

function SummaryCard({ icon: Icon, label, count, color, bg, active, onClick }: { icon: any; label: string; count: number; color: string; bg: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-xl p-2.5 text-center border transition-all',
        bg,
        active ? 'border-primary ring-1 ring-primary/20 shadow-sm' : 'border-transparent hover:border-border',
      )}
    >
      <Icon size={18} className={`mx-auto mb-0.5 ${color}`} />
      <p className="text-lg font-bold text-foreground">{count}</p>
      <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
    </button>
  );
}

export default CustomerOrders;
