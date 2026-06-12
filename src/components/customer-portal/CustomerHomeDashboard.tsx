import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { customerPortalSupabase } from '@/integrations/supabase/portal-client';
import {
  IndianRupee, ShoppingBag, TrendingUp, CalendarDays, Package,
  CreditCard, Gift, ClipboardList, BarChart3,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  LineChart, Line, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';

interface Props {
  retailerId: string;
}

interface MetricData {
  pendingAmount: number;
  cachedPendingAmount: number;
  computedPendingAmount: number;
  monthOrderCount: number;
  monthOrderValue: number;
  lastOrderDate: string | null;
  totalOrders: number;
}

interface CategoryData { name: string; value: number; }
interface ProductData { name: string; quantity: number; value: number; unit: string; }
interface TrendData { month: string; value: number; }
interface RecentOrder { id: string; created_at: string; total_amount: number; amount_collected: number; status: string; payment_status: string; }
interface RecentPayment { id: string; created_at: string; amount: number; type: string; }
interface StatusCount { status: string; count: number; }
interface ActiveScheme {
  id: string;
  name: string;
  scheme_type: string;
  description: string | null;
  end_date: string | null;
  discount_percentage: number | null;
  discount_amount: number | null;
  buy_quantity: number | null;
  free_quantity: number | null;
}

const COLORS = [
  '#8B5CF6', // violet
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
];

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  dispatched: 'bg-indigo-100 text-indigo-800',
  processing: 'bg-purple-100 text-purple-800',
};

const STATUS_DOT_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500',
  confirmed: 'bg-blue-500',
  delivered: 'bg-green-500',
  cancelled: 'bg-red-500',
  dispatched: 'bg-indigo-500',
  processing: 'bg-purple-500',
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-red-100 text-red-700',
  partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
};

const EmptyState = ({ icon: Icon, message }: { icon: React.ElementType; message: string }) => (
  <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
    <Icon size={24} className="mb-2 opacity-40" />
    <p className="text-xs">{message}</p>
  </div>
);

const getSchemeLabel = (scheme: ActiveScheme): string => {
  if (scheme.scheme_type === 'buy_get' && scheme.buy_quantity && scheme.free_quantity) {
    return `Buy ${scheme.buy_quantity} Get ${scheme.free_quantity} Free`;
  }
  if (scheme.discount_percentage) return `${scheme.discount_percentage}% Off`;
  if (scheme.discount_amount) return `₹${scheme.discount_amount} Off`;
  return scheme.scheme_type.replace(/_/g, ' ');
};

const getPaymentLabel = (order: RecentOrder): { label: string; colorClass: string } => {
  const total = Number(order.total_amount) || 0;
  const collected = Number(order.amount_collected) || 0;
  if (collected >= total && total > 0) return { label: 'Paid', colorClass: PAYMENT_STATUS_COLORS.paid };
  if (collected > 0 && collected < total) return { label: 'Partial', colorClass: PAYMENT_STATUS_COLORS.partial };
  return { label: 'Pending', colorClass: PAYMENT_STATUS_COLORS.pending };
};

const CustomerHomeDashboard = ({ retailerId }: Props) => {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<MetricData>({
    pendingAmount: 0, cachedPendingAmount: 0, computedPendingAmount: 0, monthOrderCount: 0, monthOrderValue: 0, lastOrderDate: null, totalOrders: 0,
  });
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [topProducts, setTopProducts] = useState<ProductData[]>([]);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [statusCounts, setStatusCounts] = useState<StatusCount[]>([]);
  const [activeSchemes, setActiveSchemes] = useState<ActiveScheme[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const now = new Date();
      const monthStart = startOfMonth(now).toISOString();
      const monthEnd = endOfMonth(now).toISOString();
      const todayStr = format(now, 'yyyy-MM-dd');

      const [retailerRes, monthOrdersRes, recentOrdersRes, paymentsRes, trendQueries, allOrdersRes, schemesRes] = await Promise.all([
        customerPortalSupabase
          .from('retailers')
.select('pending_amount, last_order_date')
          .eq('id', retailerId)
          .maybeSingle(),

        customerPortalSupabase
          .from('orders')
          .select('id, total_amount, status, order_items(product_name, category, quantity, total, unit)')
          .eq('retailer_id', retailerId)
          .gte('created_at', monthStart)
          .lte('created_at', monthEnd)
          .neq('status', 'cancelled'),

        customerPortalSupabase
          .from('orders')
          .select('id, created_at, total_amount, amount_collected, status, payment_status')
          .eq('retailer_id', retailerId)
          .order('created_at', { ascending: false })
          .limit(5),

        customerPortalSupabase
          .from('credit_ledger')
          .select('id, created_at, amount, type')
          .eq('retailer_id', retailerId)
          .order('created_at', { ascending: false })
          .limit(5),

        Promise.all(
          Array.from({ length: 6 }, (_, i) => {
            const m = subMonths(now, 5 - i);
            const ms = startOfMonth(m).toISOString();
            const me = endOfMonth(m).toISOString();
            return customerPortalSupabase
              .from('orders')
              .select('total_amount')
              .eq('retailer_id', retailerId)
              .gte('created_at', ms)
              .lte('created_at', me)
              .neq('status', 'cancelled')
              .then(res => ({
                month: format(m, 'MMM'),
                value: (res.data || []).reduce((s, o) => s + (Number(o.total_amount) || 0), 0),
              }));
          })
        ),

        customerPortalSupabase
          .from('orders')
          .select('id, status, total_amount, amount_collected')
          .eq('retailer_id', retailerId)
          .neq('status', 'cancelled'),

        customerPortalSupabase
          .from('product_schemes')
          .select('id, name, scheme_type, description, end_date, discount_percentage, discount_amount, buy_quantity, free_quantity')
          .eq('is_active', true)
          .eq('show_in_portal', true)
          .or(`end_date.is.null,end_date.gte.${todayStr}`),
      ]);

      // Metrics
      const cachedPendingAmount = Number(retailerRes.data?.pending_amount) || 0;
      const lastOrderDate = retailerRes.data?.last_order_date || null;
      const monthOrders = monthOrdersRes.data || [];
      const monthOrderCount = monthOrders.length;
      const monthOrderValue = monthOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
      const allOrders = allOrdersRes.data || [];
      const computedPendingAmount = allOrders.reduce((sum: number, order: any) => {
        const total = Number(order.total_amount) || 0;
        const collected = Number(order.amount_collected) || 0;
        return sum + Math.max(0, total - collected);
      }, 0);
      const pendingAmount = computedPendingAmount > 0 ? computedPendingAmount : cachedPendingAmount;
      setMetrics({
        pendingAmount,
        cachedPendingAmount,
        computedPendingAmount,
        monthOrderCount,
        monthOrderValue,
        lastOrderDate,
        totalOrders: allOrders.length,
      });

      // Status breakdown
      const statusMap: Record<string, number> = {};
      allOrders.forEach((o: any) => {
        const st = o.status || 'unknown';
        statusMap[st] = (statusMap[st] || 0) + 1;
      });
      setStatusCounts(
        Object.entries(statusMap)
          .map(([status, count]) => ({ status, count }))
          .sort((a, b) => b.count - a.count)
      );

      // Category breakdown (pie) and product data with value + unit
      const catMap: Record<string, number> = {};
      const prodMap: Record<string, { quantity: number; value: number; unit: string }> = {};
      monthOrders.forEach((o: any) => {
        (o.order_items || []).forEach((item: any) => {
          const cat = item.category || 'Uncategorized';
          catMap[cat] = (catMap[cat] || 0) + (Number(item.total) || 0);
          const pName = item.product_name;
          if (!prodMap[pName]) prodMap[pName] = { quantity: 0, value: 0, unit: item.unit || '' };
          prodMap[pName].quantity += Number(item.quantity) || 0;
          prodMap[pName].value += Number(item.total) || 0;
        });
      });
      setCategoryData(Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value));
      setTopProducts(
        Object.entries(prodMap)
          .map(([name, d]) => ({ name, quantity: d.quantity, value: d.value, unit: d.unit }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 10)
      );

      setTrendData(trendQueries);
      setRecentOrders((recentOrdersRes.data || []) as RecentOrder[]);
      setRecentPayments((paymentsRes.data || []) as RecentPayment[]);
      setActiveSchemes((schemesRes.data || []) as ActiveScheme[]);
      setLoading(false);
    };

    fetchAll();
  }, [retailerId]);

  if (loading) {
    return (
      <div className="space-y-3 mb-5">
        <div className="grid grid-cols-2 gap-2.5">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  const formatCurrency = (v: number) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const totalProductQty = topProducts.reduce((s, p) => s + p.quantity, 0);
  const totalProductValue = topProducts.reduce((s, p) => s + p.value, 0);

  return (
    <div className="space-y-3 mb-5">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        <Card className="p-3 border-red-200 bg-gradient-to-br from-red-50 to-red-100/50">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-red-500/15 flex items-center justify-center">
              <IndianRupee size={14} className="text-red-600" />
            </div>
            <span className="text-[10px] text-red-700/70 font-medium">Pending Payment</span>
          </div>
          <p className="text-base font-bold text-red-600">{formatCurrency(metrics.pendingAmount)}</p>
          {metrics.computedPendingAmount > 0 && metrics.cachedPendingAmount === 0 && (
            <p className="mt-1 text-[9px] text-red-600/80">Calculated from unpaid orders</p>
          )}
        </Card>

        <Card className="p-3 bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <ShoppingBag size={14} className="text-blue-600" />
            </div>
            <span className="text-[10px] text-blue-700/70 font-medium">This Month</span>
          </div>
          <p className="text-base font-bold text-blue-700">{metrics.monthOrderCount} orders</p>
        </Card>

        <Card className="p-3 bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <TrendingUp size={14} className="text-emerald-600" />
            </div>
            <span className="text-[10px] text-emerald-700/70 font-medium">Month Value</span>
          </div>
          <p className="text-base font-bold text-emerald-700">{formatCurrency(metrics.monthOrderValue)}</p>
        </Card>

        <Card className="p-3 bg-gradient-to-br from-violet-50 to-violet-100/50 border-violet-200">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-violet-500/15 flex items-center justify-center">
              <CalendarDays size={14} className="text-violet-600" />
            </div>
            <span className="text-[10px] text-violet-700/70 font-medium">Last Order</span>
          </div>
          <p className="text-sm font-bold text-violet-700">
            {metrics.lastOrderDate ? format(new Date(metrics.lastOrderDate), 'dd MMM yyyy') : '—'}
          </p>
        </Card>
      </div>

      {/* Order Status Summary */}
      <Card className="p-3 bg-gradient-to-r from-slate-50 to-white">
        <h3 className="text-xs font-semibold mb-2.5 flex items-center gap-1.5">
          <ClipboardList size={13} className="text-slate-500" />
          Order Summary
          <Badge variant="secondary" className="text-[9px] ml-auto">{metrics.totalOrders} total</Badge>
        </h3>
        {statusCounts.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {statusCounts.map(sc => (
              <div key={sc.status} className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2 py-1.5">
                <div className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT_COLORS[sc.status] || 'bg-muted-foreground'}`} />
                <div>
                  <span className="text-[10px] text-muted-foreground capitalize block leading-tight">{sc.status}</span>
                  <span className="text-xs font-bold">{sc.count}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={ClipboardList} message="No orders yet" />
        )}
      </Card>

      {/* Active Schemes */}
      {activeSchemes.length > 0 && (
        <Card className="p-3 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
          <h3 className="text-xs font-semibold mb-2.5 flex items-center gap-1.5 text-amber-800">
            <Gift size={13} />
            Active Schemes & Offers
            <Badge className="ml-auto bg-amber-500 text-white text-[9px]">{activeSchemes.length}</Badge>
          </h3>
          <div className="space-y-2">
            {activeSchemes.slice(0, 5).map(scheme => (
              <div key={scheme.id} className="flex items-start gap-2 p-2 rounded-lg bg-white/70 border border-amber-200/60">
                <div className="h-7 w-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Gift size={13} className="text-amber-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-900 truncate">{scheme.name}</p>
                  <Badge variant="outline" className="text-[9px] py-0 px-1.5 mt-0.5 border-amber-300 text-amber-700 bg-amber-50">
                    {getSchemeLabel(scheme)}
                  </Badge>
                  {scheme.description && (
                    <p className="text-[10px] text-amber-700/80 mt-0.5 line-clamp-1">{scheme.description}</p>
                  )}
                  {scheme.end_date && (
                    <p className="text-[9px] text-muted-foreground mt-0.5">
                      Valid till {format(new Date(scheme.end_date), 'dd MMM yyyy')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Pie Chart - Category Breakdown */}
      <Card className="p-3">
        <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <Package size={13} className="text-muted-foreground" />
          Order by Category (This Month)
        </h3>
        {categoryData.length > 0 ? (
          <div className="flex items-center">
            <ResponsiveContainer width="50%" height={150}>
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={32}>
                  {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="w-1/2 space-y-1.5 pl-2">
              {categoryData.slice(0, 5).map((c, i) => (
                <div key={c.name} className="flex items-center gap-1.5 text-[10px]">
                  <div className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="truncate text-muted-foreground">{c.name}</span>
                  <span className="ml-auto font-semibold whitespace-nowrap">{formatCurrency(c.value)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState icon={Package} message="No orders this month to show category breakdown" />
        )}
      </Card>

      {/* Bar Chart - Top Products by Qty */}
      <Card className="p-3">
        <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <BarChart3 size={13} className="text-muted-foreground" />
          Top Products by Qty (This Month)
        </h3>
        {topProducts.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(140, topProducts.length * 28)}>
            <BarChart data={topProducts} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 9 }} />
              <Tooltip formatter={(v: number, name: string) => [v, name === 'quantity' ? 'Qty' : name]} />
              <Bar dataKey="quantity" radius={[0, 4, 4, 0]} barSize={16}>
                {topProducts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState icon={ShoppingBag} message="No product data for this month" />
        )}
      </Card>

      {/* SKU Revenue Summary Table */}
      {topProducts.length > 0 && (
        <Card className="p-3">
          <h3 className="text-xs font-semibold mb-2.5 flex items-center gap-1.5">
            <Package size={13} className="text-muted-foreground" />
            SKU Revenue Summary
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-1.5 text-primary font-medium">Product</th>
                  <th className="text-right py-1.5 text-primary font-medium pr-3">Qty</th>
                  <th className="text-right py-1.5 text-primary font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p, i) => (
                  <tr key={p.name} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="truncate max-w-[140px]">{p.name}</span>
                    </td>
                    <td className="text-right py-1.5 font-semibold pr-3 whitespace-nowrap">
                      {p.quantity.toFixed(1)} {p.unit.toUpperCase()}
                    </td>
                    <td className="text-right py-1.5 font-semibold whitespace-nowrap">
                      {formatCurrency(p.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/50 font-bold">
                  <td className="py-2 text-xs">Total ({topProducts.length} SKUs)</td>
                  <td className="text-right py-2 text-xs pr-3 whitespace-nowrap">
                    {totalProductQty.toFixed(2)} {topProducts[0]?.unit?.toUpperCase() || ''}
                  </td>
                  <td className="text-right py-2 text-xs whitespace-nowrap">
                    {formatCurrency(totalProductValue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Line Chart - 6 Month Trend */}
      <Card className="p-3">
        <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <TrendingUp size={13} className="text-muted-foreground" />
          Order Trend (6 Months)
        </h3>
        {trendData.some(t => t.value > 0) ? (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={trendData} margin={{ left: 0, right: 10, top: 5, bottom: 0 }}>
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 4, fill: '#3B82F6' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState icon={TrendingUp} message="Order history will appear here" />
        )}
      </Card>

      {/* Recent Orders with payment status */}
      <Card className="p-3">
        <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <Package size={13} className="text-muted-foreground" />
          Recent Orders
        </h3>
        {recentOrders.length > 0 ? (
          <div className="space-y-2">
            {recentOrders.map(o => {
              const payment = getPaymentLabel(o);
              const pendingAmt = Math.max(0, (Number(o.total_amount) || 0) - (Number(o.amount_collected) || 0));
              return (
                <div key={o.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/30">
                  <div>
                    <p className="font-medium">{format(new Date(o.created_at), 'dd MMM yyyy')}</p>
                    <div className="flex gap-1 mt-0.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${STATUS_COLORS[o.status] || 'bg-muted text-muted-foreground'}`}>
                        {o.status}
                      </span>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${payment.colorClass}`}>
                        {payment.label}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold block">{formatCurrency(Number(o.total_amount))}</span>
                    {pendingAmt > 0 && (
                      <span className="text-[9px] text-red-600">Due: {formatCurrency(pendingAmt)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={Package} message="No orders placed yet" />
        )}
      </Card>

      {/* Recent Payments */}
      <Card className="p-3">
        <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <CreditCard size={13} className="text-muted-foreground" />
          Recent Payments
        </h3>
        {recentPayments.length > 0 ? (
          <div className="space-y-2">
            {recentPayments.map(p => (
              <div key={p.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium">{format(new Date(p.created_at), 'dd MMM yyyy')}</p>
                  <span className="text-[10px] text-muted-foreground capitalize">{p.type}</span>
                </div>
                <span className={`font-semibold ${Number(p.amount) < 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {Number(p.amount) < 0 ? '−' : '+'}{formatCurrency(Math.abs(Number(p.amount)))}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={CreditCard} message="No payment records yet" />
        )}
      </Card>
    </div>
  );
};

export default CustomerHomeDashboard;
