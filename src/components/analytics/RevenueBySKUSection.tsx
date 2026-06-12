import { useState, useEffect, useMemo } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { RefreshCw, PieChartIcon, BarChart3, Package, X, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';

interface SKURevenue {
  product_name: string;
  quantity_sold: number;
  revenue: number;
  unit: string;
}

interface RevenueBySKUSectionProps {
  selectedUsers: string[];
  dateRange: { from: Date; to: Date };
  filteredUserName?: string | null;
  onClearFilter?: () => void;
  onDataLoaded?: (data: SKURevenue[]) => void;
  allUsers?: { id: string; full_name: string | null }[];
}

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#84cc16', '#06b6d4', '#a855f7'];

export const RevenueBySKUSection = ({ selectedUsers, dateRange, filteredUserName, onClearFilter, onDataLoaded, allUsers = [] }: RevenueBySKUSectionProps) => {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  const [skuData, setSkuData] = useState<SKURevenue[]>([]);
  const [chartType, setChartType] = useState<'pie' | 'bar'>('pie');
  const [hideChart, setHideChart] = useState(false);
  const [skuFilter, setSkuFilter] = useState<'all' | 'top5' | 'bottom5'>('all');

  // Fetch SKU revenue data
  const fetchSKUData = async () => {
    setLoading(true);
    try {
      const fromDate = format(dateRange.from, 'yyyy-MM-dd');
      const toDate = format(dateRange.to, 'yyyy-MM-dd');

      // If no users selected or multiple users, aggregate across selected users
      if (selectedUsers.length === 0 || selectedUsers.length > 1) {
        // First get the user IDs for the selected user names
        let userIds: string[] = [];
        
        if (selectedUsers.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('full_name', selectedUsers);
          
          if (profilesError || !profiles) {
            console.error('Error fetching profiles:', profilesError);
            setSkuData([]);
            setLoading(false);
            return;
          }
          userIds = profiles.map(p => p.id);
        }

        // Fetch orders for selected users in the date range
        let ordersQuery = supabase
          .from('orders')
          .select('id')
          .eq('status', 'confirmed')
          .gte('order_date', fromDate)
          .lte('order_date', toDate);
        
        // Filter by user IDs if we have selected users
        if (userIds.length > 0) {
          ordersQuery = ordersQuery.in('user_id', userIds);
        }

        const { data: orders, error: ordersError } = await ordersQuery;

        if (ordersError || !orders || orders.length === 0) {
          console.error('Orders error or no orders:', ordersError);
          setSkuData([]);
          setLoading(false);
          return;
        }

        const orderIds = orders.map((o: any) => o.id);

        // Fetch order items for these orders
        const { data: orderItems, error: itemsError } = await supabase
          .from('order_items')
          .select('product_name, quantity, unit, total')
          .in('order_id', orderIds);

        if (itemsError || !orderItems) {
          console.error('Order items error:', itemsError);
          setSkuData([]);
          setLoading(false);
          return;
        }

        // Aggregate by product
        const aggregated: Record<string, SKURevenue> = {};
        orderItems.forEach((item: any) => {
          const key = item.product_name || 'Unknown';
          if (!aggregated[key]) {
            aggregated[key] = {
              product_name: key,
              quantity_sold: 0,
              revenue: 0,
              unit: item.unit || 'KG'
            };
          }
          // Convert grams to KG
          const qty = Number(item.quantity || 0);
          const unit = (item.unit || '').toLowerCase();
          if (unit === 'grams' || unit === 'gram' || unit === 'g') {
            aggregated[key].quantity_sold += qty / 1000;
            aggregated[key].unit = 'KG';
          } else {
            aggregated[key].quantity_sold += qty;
          }
          aggregated[key].revenue += Number(item.total || 0);
        });

        const sortedData = Object.values(aggregated).sort((a, b) => b.quantity_sold - a.quantity_sold);
        setSkuData(sortedData);
      } else {
        // Use the RPC for single user
        const { data, error } = await (supabase as any).rpc('get_product_revenue_performance', {
          user_full_name: selectedUsers[0],
          start_date: fromDate,
          end_date: toDate
        });

        if (error) {
          console.error('Error fetching SKU data:', error);
          setSkuData([]);
          setLoading(false);
          return;
        }

        if (data && data.length > 0) {
          // Aggregate by product name (in case of duplicates)
          const aggregated: Record<string, SKURevenue> = {};
          data.forEach((item: any) => {
            const key = item.product_name;
            if (!aggregated[key]) {
              aggregated[key] = {
                product_name: item.product_name,
                quantity_sold: 0,
                revenue: 0,
                unit: item.unit || 'KG'
              };
            }
            aggregated[key].quantity_sold += Number(item.quantity_sold || 0);
            aggregated[key].revenue += Number(item.revenue || 0);
          });

          // Sort by quantity_sold descending (KG)
          const sortedData = Object.values(aggregated).sort((a, b) => b.quantity_sold - a.quantity_sold);
          setSkuData(sortedData);
        } else {
          setSkuData([]);
        }
      }
    } catch (error) {
      console.error('Error in SKU revenue fetch:', error);
      setSkuData([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when props change
  // Using JSON.stringify on selectedUsers to ensure stable dependency comparison
  // Also include allUsers.length to re-trigger when users list becomes available
  useEffect(() => {
    fetchSKUData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(selectedUsers), dateRange.from, dateRange.to, allUsers.length]);

  // Notify parent when data is loaded
  // Note: Removed onDataLoaded from deps to prevent infinite loops when parent doesn't memoize callback
  useEffect(() => {
    if (onDataLoaded && skuData.length > 0) {
      onDataLoaded(skuData);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuData]);

  // Apply filter to skuData for the table
  const filteredSkuData = useMemo(() => {
    if (skuFilter === 'top5' && skuData.length > 5) {
      return skuData.slice(0, 5);
    } else if (skuFilter === 'bottom5' && skuData.length > 5) {
      return skuData.slice(-5);
    }
    return skuData;
  }, [skuData, skuFilter]);

  // Prepare chart data
  const chartData = useMemo(() => {
    // Convert all quantities to KG for chart visualization
    const dataWithKG = filteredSkuData.slice(0, 10).map((item, index) => {
      const unit = (item.unit || '').toLowerCase();
      const quantityKG = (unit === 'grams' || unit === 'gram' || unit === 'g') 
        ? item.quantity_sold / 1000 
        : item.quantity_sold;
      return {
        name: item.product_name.length > 15 ? item.product_name.substring(0, 15) + '...' : item.product_name,
        fullName: item.product_name,
        value: quantityKG, // Use quantity in KG for chart sizing
        revenue: item.revenue,
        quantity: item.quantity_sold,
        unit: item.unit,
        color: COLORS[index % COLORS.length]
      };
    });
    return dataWithKG;
  }, [filteredSkuData]);

  const totalRevenue = useMemo(() => 
    filteredSkuData.reduce((sum, item) => sum + item.revenue, 0), 
    [filteredSkuData]
  );

  const totalQuantityKG = useMemo(() => 
    filteredSkuData.reduce((sum, item) => {
      const unit = (item.unit || '').toLowerCase();
      if (unit === 'grams' || unit === 'gram' || unit === 'g') {
        return sum + (item.quantity_sold / 1000);
      }
      return sum + item.quantity_sold;
    }, 0), 
    [filteredSkuData]
  );

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base sm:text-lg md:text-xl">Revenue Summary by SKU</CardTitle>
              <p className="text-sm text-muted-foreground">
                Product-wise revenue breakdown • {selectedUsers.length === 0 ? 'All Users' : selectedUsers.length === 1 ? selectedUsers[0] : `${selectedUsers.length} Users`} • {format(dateRange.from, 'MMM dd')} - {format(dateRange.to, 'MMM dd, yyyy')}
              </p>
            </div>
          </div>
          {filteredUserName && onClearFilter && (
            <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              <span className="text-xs">Filtered: {filteredUserName}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0 hover:bg-muted"
                onClick={onClearFilter}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Results */}
        {loading ? (
          <div className="text-center py-8">
            <RefreshCw className="animate-spin mx-auto mb-2" size={24} />
            <p className="text-muted-foreground">Loading SKU data...</p>
          </div>
        ) : skuData.length > 0 ? (
          <div className="space-y-4">
            {/* Unified Control Bar - matching Order Summary by User layout */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1">
                <Button
                  variant={skuFilter === 'top5' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => setSkuFilter(skuFilter === 'top5' ? 'all' : 'top5')}
                >
                  Top 5
                </Button>
                <Button
                  variant={skuFilter === 'bottom5' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => setSkuFilter(skuFilter === 'bottom5' ? 'all' : 'bottom5')}
                >
                  Bottom 5
                </Button>
              </div>
              <div className="flex items-center gap-1">
                {!hideChart && (
                  <ToggleGroup type="single" value={chartType} onValueChange={(v) => v && setChartType(v as 'pie' | 'bar')}>
                    <ToggleGroupItem value="pie" aria-label="Pie Chart" className="h-8 w-8 p-0">
                      <PieChartIcon className="h-4 w-4" />
                    </ToggleGroupItem>
                    <ToggleGroupItem value="bar" aria-label="Bar Chart" className="h-8 w-8 p-0">
                      <BarChart3 className="h-4 w-4" />
                    </ToggleGroupItem>
                  </ToggleGroup>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setHideChart(!hideChart)}
                  title={hideChart ? "Show Visual" : "Hide Visual"}
                >
                  {hideChart ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            
            <div className={cn("grid grid-cols-1 gap-6", !hideChart && "lg:grid-cols-2")}>
              {/* Chart Section */}
              {!hideChart && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Top 10 products by Qty (PCs)</p>
                  <ResponsiveContainer width="100%" height={isMobile ? 280 : 350}>
                    {chartType === 'pie' ? (
                      <PieChart margin={isMobile ? { top: 20, right: 20, bottom: 20, left: 20 } : undefined}>
                        <Pie
                          data={chartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={isMobile ? 70 : 120}
                          label={false}
                          labelLine={false}
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number, name: string, props: any) => [
                            `${value.toFixed(2)} PCs | ₹${props.payload.revenue.toLocaleString()}`,
                            props.payload.fullName
                          ]}
                        />
                        <Legend wrapperStyle={{ fontSize: isMobile ? '6px' : '12px' }} />
                      </PieChart>
                    ) : (
                      <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                        <XAxis type="number" tickFormatter={(value) => `${value.toFixed(1)} KG`} />
                        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                        <Tooltip 
                          formatter={(value: number, name: string, props: any) => [
                            `${value.toFixed(2)} KG | ₹${props.payload.revenue.toLocaleString()}`,
                            props.payload.fullName
                          ]}
                        />
                        <Bar dataKey="value">
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              )}
              
              {/* Summary Table */}
              <div>
              <h3 className="font-semibold text-sm sm:text-base mb-3">SKU Revenue Summary</h3>
              <div className="border rounded-lg max-h-[400px] scrollbar-always-visible">
                <div className="min-w-max">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted/50 z-10">
                      <TableRow>
                        <TableHead className="text-[10px] sm:text-xs py-1 px-1.5 sm:py-1.5 sm:px-3 whitespace-nowrap">Product</TableHead>
                        <TableHead className="text-[10px] sm:text-xs text-right py-1 px-1.5 sm:py-1.5 sm:px-3 whitespace-nowrap">Qty</TableHead>
                        <TableHead className="text-[10px] sm:text-xs text-right py-1 px-1.5 sm:py-1.5 sm:px-3 whitespace-nowrap">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSkuData.map((row, index) => (
                        <TableRow key={index} className="hover:bg-muted/30">
                          <TableCell className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs py-1 px-1.5 sm:py-1.5 sm:px-3">
                            <div 
                              className="w-2 h-2 sm:w-3 sm:h-3 rounded-full flex-shrink-0" 
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            <span className="truncate max-w-[100px] sm:max-w-[150px]" title={row.product_name}>
                              {row.product_name}
                            </span>
                          </TableCell>
                          <TableCell className="text-[10px] sm:text-xs text-right font-bold py-1 px-1.5 sm:py-1.5 sm:px-3 whitespace-nowrap">
                            {(() => {
                              const unit = (row.unit || '').toLowerCase();
                              if (unit === 'grams' || unit === 'gram' || unit === 'g') {
                                return `${(row.quantity_sold / 1000).toFixed(2)} PCs`;
                              }
                              if (unit === 'kg' || unit.includes('kilo')) {
                                return `${row.quantity_sold.toFixed(1)} PCs`;
                              }
                              return `${row.quantity_sold.toFixed(1)} ${row.unit}`;
                            })()}
                          </TableCell>
                          <TableCell className="text-[10px] sm:text-xs text-right py-1 px-1.5 sm:py-1.5 sm:px-3 whitespace-nowrap">
                            ₹{row.revenue.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <tfoot className="bg-background border-t sticky bottom-0 z-10">
                      <TableRow>
                        <TableCell className="text-[10px] sm:text-xs font-semibold py-1 px-1.5 sm:py-1.5 sm:px-3 whitespace-nowrap">Total ({filteredSkuData.length} SKUs)</TableCell>
                        <TableCell className="text-[10px] sm:text-xs text-right font-semibold py-1 px-1.5 sm:py-1.5 sm:px-3 whitespace-nowrap">
                          {totalQuantityKG.toFixed(2)} PCs
                        </TableCell>
                        <TableCell className="text-[10px] sm:text-xs text-right font-bold text-primary py-1 px-1.5 sm:py-1.5 sm:px-3 whitespace-nowrap">
                          ₹{totalRevenue.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    </tfoot>
                  </Table>
                </div>
              </div>
            </div>
            {/* Close grid */}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No SKU data found for the selected filters
          </div>
        )}
      </CardContent>
    </Card>
  );
};
