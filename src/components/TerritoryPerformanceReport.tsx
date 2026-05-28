import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, DollarSign, Package, Users, Target, Award, Zap, MapPin, ShoppingBag, Activity } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import TerritorySupportRequestForm from './TerritorySupportRequestForm';

interface TerritoryPerformanceReportProps {
  territoryId: string;
  territoryName: string;
}

const TerritoryPerformanceReport: React.FC<TerritoryPerformanceReportProps> = ({ territoryId, territoryName }) => {
  const [loading, setLoading] = useState(true);
  const [performanceData, setPerformanceData] = useState<any>(null);

  useEffect(() => {
    loadPerformanceData();
  }, [territoryId]);

  const loadPerformanceData = async () => {
    setLoading(true);
    
    const { data: territory } = await supabase
      .from('territories')
      .select('*, competition_master(*)')
      .eq('id', territoryId)
      .single();

    if (!territory) {
      setLoading(false);
      return;
    }

    // Fetch beats in this territory
    const { data: territoryBeats } = await supabase
      .from('beats')
      .select('beat_id, beat_name, average_km, is_active, created_at')
      .eq('territory_id', territoryId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    const { data: allRetailers } = await supabase.from('retailers').select('id, name, address, category, beat_id');
    const territoryRetailers = allRetailers?.filter(r => 
      territory.pincode_ranges?.some((pin: string) => r.address?.includes(pin))
    ) || [];
    const retailerIds = territoryRetailers.map(r => r.id);

    const currentMonthStart = startOfMonth(new Date());
    const currentMonthEnd = endOfMonth(new Date());
    const previousMonthStart = startOfMonth(subMonths(new Date(), 1));
    const previousMonthEnd = endOfMonth(subMonths(new Date(), 1));

    // Get last 6 months sales data for chart
    const monthlySalesData = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(new Date(), i));
      const monthEnd = endOfMonth(subMonths(new Date(), i));
      
      const { data: monthOrders } = await supabase
        .from('orders')
        .select('total_amount')
        .in('retailer_id', retailerIds)
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString())
        .eq('status', 'confirmed');

      const monthSales = monthOrders?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0;
      monthlySalesData.push({
        month: format(monthStart, 'MMM'),
        sales: monthSales,
        orders: monthOrders?.length || 0,
      });
    }

    // Current month sales with product details
    const { data: currentMonthOrders } = await supabase
      .from('orders')
      .select('total_amount, retailer_id, order_items!order_items_order_id_fkey(product_id, product_name, quantity, total)')
      .in('retailer_id', retailerIds)
      .gte('created_at', currentMonthStart.toISOString())
      .lte('created_at', currentMonthEnd.toISOString())
      .eq('status', 'confirmed');

    const currentSales = currentMonthOrders?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0;

    // Previous month sales
    const { data: previousMonthOrders } = await supabase
      .from('orders')
      .select('total_amount')
      .in('retailer_id', retailerIds)
      .gte('created_at', previousMonthStart.toISOString())
      .lte('created_at', previousMonthEnd.toISOString())
      .eq('status', 'confirmed');

    const previousSales = previousMonthOrders?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0;
    const growthPercentage = previousSales > 0 ? ((currentSales - previousSales) / previousSales) * 100 : 0;

    // Product performance analysis
    const productMap = new Map();
    currentMonthOrders?.forEach(order => {
      order.order_items?.forEach((item: any) => {
        const existing = productMap.get(item.product_name) || { quantity: 0, revenue: 0 };
        productMap.set(item.product_name, { 
          name: item.product_name, 
          quantity: existing.quantity + item.quantity,
          revenue: existing.revenue + Number(item.total || 0)
        });
      });
    });
    
    const allProducts = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue);
    const topProducts = allProducts.slice(0, 5);
    const bottomProducts = allProducts.slice(-5).reverse();

    // Retailer performance
    const retailerSalesMap = new Map();
    currentMonthOrders?.forEach(order => {
      const existing = retailerSalesMap.get(order.retailer_id) || 0;
      retailerSalesMap.set(order.retailer_id, existing + Number(order.total_amount || 0));
    });

    const retailerPerformance = territoryRetailers.map(r => ({
      ...r,
      sales: retailerSalesMap.get(r.id) || 0
    })).sort((a, b) => b.sales - a.sales);

    const topRetailers = retailerPerformance.slice(0, 5);
    const bottomRetailers = retailerPerformance.filter(r => r.sales > 0).slice(-5).reverse();

    // Visit count
    const { data: visits } = await supabase
      .from('visits')
      .select('id')
      .in('retailer_id', retailerIds)
      .gte('visit_date', currentMonthStart.toISOString());

    // Competition data
    const { data: competitionData } = await supabase
      .from('competition_data')
      .select('*, competition_master(competitor_name), retailers(name)')
      .in('retailer_id', retailerIds)
      .gte('created_at', currentMonthStart.toISOString())
      .order('created_at', { ascending: false });

    setPerformanceData({
      territory,
      currentSales,
      previousSales,
      growthPercentage,
      retailerCount: territoryRetailers.length,
      orderCount: currentMonthOrders?.length || 0,
      visitCount: visits?.length || 0,
      topProducts,
      bottomProducts,
      topRetailers,
      bottomRetailers,
      monthlySalesData,
      competitionActivities: competitionData || [],
      beats: territoryBeats || []
    });

    setLoading(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading performance report...</div>;
  }

  if (!performanceData) {
    return <div className="text-center p-8 text-muted-foreground">No data available</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-4 sm:px-0">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="w-full sm:w-auto">
            <h3 className="text-lg sm:text-xl lg:text-2xl font-bold break-words">{territoryName}</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">Performance Report</p>
          </div>
          <Badge variant="outline" className="text-xs">
            {format(new Date(), 'MMMM yyyy')}
          </Badge>
        </div>
        <TerritorySupportRequestForm territoryId={territoryId} territoryName={territoryName} />
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
        <Card className="shadow-lg">
          <CardHeader className="pb-2 px-3 sm:px-4">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
              <span className="truncate">Sales</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-4">
            <div className="text-base sm:text-lg lg:text-2xl font-bold truncate">₹{performanceData.currentSales.toFixed(0)}</div>
            <div className={`text-xs flex items-center gap-1 mt-1 ${performanceData.growthPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {performanceData.growthPercentage >= 0 ? <TrendingUp className="h-3 w-3 flex-shrink-0" /> : <TrendingDown className="h-3 w-3 flex-shrink-0" />}
              <span className="truncate">{Math.abs(performanceData.growthPercentage).toFixed(1)}%</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader className="pb-2 px-3 sm:px-4">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <Users className="h-3 w-3 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
              <span className="truncate">Retailers</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-4">
            <div className="text-base sm:text-lg lg:text-2xl font-bold">{performanceData.retailerCount}</div>
            <div className="text-xs text-muted-foreground mt-1 truncate">Active</div>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader className="pb-2 px-3 sm:px-4">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <Package className="h-3 w-3 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
              <span className="truncate">Orders</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-4">
            <div className="text-base sm:text-lg lg:text-2xl font-bold">{performanceData.orderCount}</div>
            <div className="text-xs text-muted-foreground mt-1 truncate">This month</div>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader className="pb-2 px-3 sm:px-4">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <MapPin className="h-3 w-3 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
              <span className="truncate">Visits</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-4">
            <div className="text-base sm:text-lg lg:text-2xl font-bold">{performanceData.visitCount}</div>
            <div className="text-xs text-muted-foreground mt-1 truncate">This month</div>
          </CardContent>
        </Card>
      </div>

      {/* Sales Growth Chart */}
      <Card className="shadow-lg">
        <CardHeader className="px-3 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base lg:text-lg">
            <Activity className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
            <span className="truncate">6-Month Sales Trend</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          <div className="h-[200px] sm:h-[250px] lg:h-[300px] w-full overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performanceData.monthlySalesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Line type="monotone" dataKey="sales" stroke="#8b5cf6" name="Sales (₹)" strokeWidth={2} />
                <Line type="monotone" dataKey="orders" stroke="#3b82f6" name="Orders" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Top & Bottom Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <Card className="shadow-lg">
          <CardHeader className="px-3 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base lg:text-lg">
              <Award className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 flex-shrink-0" />
              <span className="truncate">Top Performing SKUs</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            {performanceData.topProducts.length > 0 ? (
              <div className="space-y-2">
                {performanceData.topProducts.map((product: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-2 sm:p-3 border rounded-lg gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs sm:text-sm truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground">Qty: {product.quantity}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-xs sm:text-sm text-green-600 whitespace-nowrap">₹{product.revenue.toFixed(0)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-muted-foreground text-center py-4">No sales data available</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader className="px-3 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base lg:text-lg">
              <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600 flex-shrink-0" />
              <span className="truncate">Low Performing SKUs</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            {performanceData.bottomProducts.length > 0 ? (
              <div className="space-y-2">
                {performanceData.bottomProducts.map((product: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-2 sm:p-3 border rounded-lg gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs sm:text-sm truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground">Qty: {product.quantity}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-xs sm:text-sm text-orange-600 whitespace-nowrap">₹{product.revenue.toFixed(0)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-muted-foreground text-center py-4">No sales data available</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Beats in Territory */}
      {performanceData.beats && performanceData.beats.length > 0 && (
        <Card className="shadow-lg">
          <CardHeader className="px-3 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base lg:text-lg">
              <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 flex-shrink-0" />
              <span className="truncate">Beats in Territory ({performanceData.beats.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              {performanceData.beats.map((beat: any) => (
                <div key={beat.beat_id} className="p-2 sm:p-3 border rounded-lg hover:border-primary transition-colors">
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <p className="font-medium text-xs sm:text-sm truncate flex-1">{beat.beat_name}</p>
                    <Badge variant="outline" className="text-xs flex-shrink-0">Active</Badge>
                  </div>
                  {beat.average_km && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{beat.average_km} km avg</span>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    Created: {format(new Date(beat.created_at), 'MMM dd, yyyy')}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top & Bottom Retailers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <Card className="shadow-lg">
          <CardHeader className="px-3 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base lg:text-lg">
              <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 flex-shrink-0" />
              <span className="truncate">Top Retailers</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            {performanceData.topRetailers.length > 0 ? (
              <div className="space-y-2">
                {performanceData.topRetailers.map((retailer: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-2 sm:p-3 border rounded-lg gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs sm:text-sm truncate">{retailer.name}</p>
                      <Badge variant="outline" className="text-xs mt-1">{retailer.category}</Badge>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-xs sm:text-sm text-green-600 whitespace-nowrap">₹{retailer.sales.toFixed(0)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-muted-foreground text-center py-4">No data available</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader className="px-3 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base lg:text-lg">
              <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600 flex-shrink-0" />
              <span className="truncate">Bottom Retailers</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            {performanceData.bottomRetailers.length > 0 ? (
              <div className="space-y-2">
                {performanceData.bottomRetailers.map((retailer: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-2 sm:p-3 border rounded-lg gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs sm:text-sm truncate">{retailer.name}</p>
                      <Badge variant="outline" className="text-xs mt-1">{retailer.category}</Badge>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-xs sm:text-sm text-orange-600 whitespace-nowrap">₹{retailer.sales.toFixed(0)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-muted-foreground text-center py-4">No low-performing retailers</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Competition Activities */}
      {performanceData.competitionActivities.length > 0 && (
        <Card className="shadow-lg">
          <CardHeader className="px-3 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base lg:text-lg">
              <Zap className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
              <span className="truncate">Competition Activity ({performanceData.competitionActivities.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <div className="space-y-2">
              {performanceData.competitionActivities.slice(0, 10).map((activity: any) => (
                <div key={activity.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-2 sm:p-3 border rounded-lg gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-xs sm:text-sm truncate">{activity.competition_master?.competitor_name}</p>
                      {activity.impact_level && <Badge variant="outline" className="text-xs flex-shrink-0">{activity.impact_level}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {activity.retailers?.name} • {format(new Date(activity.created_at), 'MMM dd, yyyy')}
                    </p>
                    {activity.insight && (
                      <p className="text-xs mt-1 line-clamp-2">{activity.insight}</p>
                    )}
                  </div>
                  {activity.needs_attention && (
                    <Badge variant="destructive" className="text-xs self-start sm:self-center flex-shrink-0">Needs Attention</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Insights */}
      <Card className="border-primary/50 bg-primary/5 shadow-lg">
        <CardHeader className="px-3 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base lg:text-lg">
            <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
            <span className="truncate">AI Insights & Recommendations</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 sm:space-y-3 px-3 sm:px-6">
          {performanceData.growthPercentage < 0 && (
            <div className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 bg-background rounded-lg">
              <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-xs sm:text-sm">Declining Sales Trend</p>
                <p className="text-xs text-muted-foreground break-words">
                  Sales have decreased by {Math.abs(performanceData.growthPercentage).toFixed(1)}%. 
                  Consider increasing retailer visits and launching targeted promotions.
                </p>
              </div>
            </div>
          )}
          
          {performanceData.competitionActivities.length > 3 && (
            <div className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 bg-background rounded-lg">
              <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-xs sm:text-sm">High Competition Activity</p>
                <p className="text-xs text-muted-foreground break-words">
                  {performanceData.competitionActivities.length} competitor activities detected this month. 
                  Focus on strengthening relationships and differentiating your offerings.
                </p>
              </div>
            </div>
          )}

          {performanceData.growthPercentage > 10 && (
            <div className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 bg-background rounded-lg">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-xs sm:text-sm">Strong Growth Performance</p>
                <p className="text-xs text-muted-foreground break-words">
                  Excellent {performanceData.growthPercentage.toFixed(1)}% growth! 
                  Consider expanding to similar territories and replicating successful strategies.
                </p>
              </div>
            </div>
          )}

          {performanceData.bottomRetailers.length > 0 && (
            <div className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 bg-background rounded-lg">
              <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-xs sm:text-sm">Low-Performing Retailers</p>
                <p className="text-xs text-muted-foreground break-words">
                  {performanceData.bottomRetailers.length} retailers need attention. Schedule visits and provide support to boost their performance.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TerritoryPerformanceReport;
