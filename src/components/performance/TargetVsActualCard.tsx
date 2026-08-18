import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface TargetVsActualCardProps {
  entityType: 'beat' | 'retailer';
  entityId: string;
  beatTextId?: string; // For beats: the text beat_id used in retailers table
  userId?: string;
}

interface TargetData {
  revenueTarget: number;
  quantityTarget: number;
  actualRevenue: number;
  actualQuantity: number;
}

export function TargetVsActualCard({ entityType, entityId, beatTextId, userId }: TargetVsActualCardProps) {
  const [loading, setLoading] = useState(true);
  const [targets, setTargets] = useState<TargetData>({
    revenueTarget: 0,
    quantityTarget: 0,
    actualRevenue: 0,
    actualQuantity: 0
  });
  const [quantityUnit, setQuantityUnit] = useState<string>('units');

  const getDefaultFY = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    return currentMonth >= 3 ? currentYear + 1 : currentYear;
  };

  const [selectedFY, setSelectedFY] = useState<number>(getDefaultFY());

  const fyOptions = useMemo(() => {
    const currentFY = getDefaultFY();
    const options = [];
    for (let i = 0; i < 5; i++) {
      const fy = currentFY - i;
      options.push({
        value: fy,
        label: `FY ${fy - 1}-${fy.toString().slice(-2)}`
      });
    }
    return options;
  }, []);

  useEffect(() => {
    loadTargetData();
  }, [entityId, entityType, selectedFY, userId, beatTextId]);

  const loadTargetData = async () => {
    if (!entityId) return;
    setLoading(true);

    try {
      const fyStartDate = new Date(selectedFY - 1, 3, 1);
      const fyEndDate = new Date(selectedFY, 2, 31, 23, 59, 59);

      let totalRevenueTarget = 0;
      let totalQuantityTarget = 0;
      let planQuantityUnit = 'units';

      if (entityType === 'beat') {
        // Get targets for beat from user_business_plan_territory_beats
        const { data: targetsData } = await supabase
          .from('user_business_plan_territory_beats')
          .select('quantity_target, revenue_target, user_business_plans!inner(year, quantity_unit)')
          .eq('beat_id', entityId)
          .eq('user_business_plans.year', selectedFY);

        totalRevenueTarget = targetsData?.reduce((sum, t) => sum + Number(t.revenue_target || 0), 0) || 0;
        totalQuantityTarget = targetsData?.reduce((sum, t) => sum + Number(t.quantity_target || 0), 0) || 0;
        
        if (targetsData && targetsData.length > 0) {
          planQuantityUnit = (targetsData[0].user_business_plans as any)?.quantity_unit || 'units';
        }

        // Get actual revenue and quantity for beat
        // Use beatTextId for retailer query since retailers.beat_id stores text beat_id
        const retailerBeatId = beatTextId || entityId;
        const { data: retailers } = await supabase
          .from('retailers')
          .select('id')
          .eq('beat_id', retailerBeatId);

        const retailerIds = retailers?.map(r => r.id) || [];

        if (retailerIds.length > 0) {
          const { data: ordersData } = await supabase
            .from('orders')
            .select('id, total_amount, created_at')
            .in('retailer_id', retailerIds)
            .gte('created_at', fyStartDate.toISOString())
            .lte('created_at', fyEndDate.toISOString());

          const actualRevenue = ordersData?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0;

          let actualQuantity = 0;
          if (ordersData && ordersData.length > 0) {
            const orderIds = ordersData.map(o => o.id);
            const { data: orderItemsData } = await supabase
              .from('order_items')
              .select('quantity')
              .in('order_id', orderIds);
            actualQuantity = orderItemsData?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;
          }

          setTargets({
            revenueTarget: totalRevenueTarget,
            quantityTarget: totalQuantityTarget,
            actualRevenue,
            actualQuantity
          });
        } else {
          setTargets({
            revenueTarget: totalRevenueTarget,
            quantityTarget: totalQuantityTarget,
            actualRevenue: 0,
            actualQuantity: 0
          });
        }
      } else {
        // Get targets for retailer from user_business_plan_retailers
        const { data: targetsData } = await supabase
          .from('user_business_plan_retailers')
          .select('quantity_target, target_revenue, user_business_plans!inner(year, quantity_unit)')
          .eq('retailer_id', entityId)
          .eq('is_active', true)
          .eq('user_business_plans.year', selectedFY);

        totalRevenueTarget = targetsData?.reduce((sum, t) => sum + Number(t.target_revenue || 0), 0) || 0;
        totalQuantityTarget = targetsData?.reduce((sum, t) => sum + Number(t.quantity_target || 0), 0) || 0;
        
        if (targetsData && targetsData.length > 0) {
          planQuantityUnit = (targetsData[0].user_business_plans as any)?.quantity_unit || 'units';
        }

        // Get actual revenue and quantity for retailer
        const { data: ordersData } = await supabase
          .from('orders')
          .select('id, total_amount, created_at')
          .eq('retailer_id', entityId)
          .gte('created_at', fyStartDate.toISOString())
          .lte('created_at', fyEndDate.toISOString());

        const actualRevenue = ordersData?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0;

        let actualQuantity = 0;
        if (ordersData && ordersData.length > 0) {
          const orderIds = ordersData.map(o => o.id);
          const { data: orderItemsData } = await supabase
            .from('order_items')
            .select('quantity')
            .in('order_id', orderIds);
          actualQuantity = orderItemsData?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;
        }

        setTargets({
          revenueTarget: totalRevenueTarget,
          quantityTarget: totalQuantityTarget,
          actualRevenue,
          actualQuantity
        });
      }

      setQuantityUnit(planQuantityUnit);
    } catch (error) {
      console.error('Error loading target data:', error);
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <Card className="shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Target vs. Actual
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          <div className="animate-pulse space-y-4">
            <div className="h-24 bg-muted rounded" />
            <div className="h-24 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasTargets = targets.revenueTarget > 0 || targets.quantityTarget > 0;

  return (
    <Card className="shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Target vs. Actual
          </CardTitle>
          <Select value={selectedFY.toString()} onValueChange={(val) => setSelectedFY(parseInt(val))}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Select FY" />
            </SelectTrigger>
            <SelectContent>
              {fyOptions.map(fy => (
                <SelectItem key={fy.value} value={fy.value.toString()}>
                  {fy.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        {hasTargets ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Revenue Target vs Actual */}
            <div className="p-4 rounded-lg bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-green-700">Revenue</span>
                <Badge variant="outline" className={`text-xs ${
                  targets.actualRevenue >= targets.revenueTarget 
                    ? 'bg-green-500/20 text-green-700 border-green-500/30' 
                    : 'bg-orange-500/20 text-orange-700 border-orange-500/30'
                }`}>
                  {targets.revenueTarget > 0 
                    ? `${((targets.actualRevenue / targets.revenueTarget) * 100).toFixed(0)}%` 
                    : '0%'}
                </Badge>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Target</span>
                  <span className="font-medium">₹{targets.revenueTarget.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Actual</span>
                  <span className="font-bold text-green-600">₹{targets.actualRevenue.toLocaleString('en-IN')}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 mt-2">
                  <div 
                    className={`h-2 rounded-full transition-all ${
                      targets.actualRevenue >= targets.revenueTarget 
                        ? 'bg-green-500' 
                        : 'bg-orange-500'
                    }`}
                    style={{ width: `${Math.min((targets.actualRevenue / (targets.revenueTarget || 1)) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className={targets.actualRevenue >= targets.revenueTarget ? 'text-green-600 font-medium' : 'text-orange-600 font-medium'}>
                    {targets.actualRevenue > targets.revenueTarget 
                      ? `Overachieved: +₹${(targets.actualRevenue - targets.revenueTarget).toLocaleString('en-IN')}` 
                      : targets.actualRevenue === targets.revenueTarget 
                        ? 'On Target ✓'
                        : `Gap: -₹${(targets.revenueTarget - targets.actualRevenue).toLocaleString('en-IN')}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Quantity Target vs Actual */}
            <div className="p-4 rounded-lg bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-700">Quantity</span>
                <Badge variant="outline" className={`text-xs ${
                  targets.actualQuantity >= targets.quantityTarget 
                    ? 'bg-green-500/20 text-green-700 border-green-500/30' 
                    : 'bg-orange-500/20 text-orange-700 border-orange-500/30'
                }`}>
                  {targets.quantityTarget > 0 
                    ? `${((targets.actualQuantity / targets.quantityTarget) * 100).toFixed(0)}%` 
                    : '0%'}
                </Badge>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Target</span>
                  <span className="font-medium">{targets.quantityTarget.toLocaleString('en-IN')} {quantityUnit}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Actual</span>
                  <span className="font-bold text-blue-600">{targets.actualQuantity.toLocaleString('en-IN')} {quantityUnit}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 mt-2">
                  <div 
                    className={`h-2 rounded-full transition-all ${
                      targets.actualQuantity >= targets.quantityTarget 
                        ? 'bg-green-500' 
                        : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min((targets.actualQuantity / (targets.quantityTarget || 1)) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className={targets.actualQuantity >= targets.quantityTarget ? 'text-green-600 font-medium' : 'text-orange-600 font-medium'}>
                    {targets.actualQuantity > targets.quantityTarget 
                      ? `Overachieved: +${(targets.actualQuantity - targets.quantityTarget).toLocaleString('en-IN')} ${quantityUnit}` 
                      : targets.actualQuantity === targets.quantityTarget 
                        ? 'On Target ✓'
                        : `Gap: -${(targets.quantityTarget - targets.actualQuantity).toLocaleString('en-IN')} ${quantityUnit}`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No targets set for FY {selectedFY - 1}-{selectedFY.toString().slice(-2)}</p>
        )}
      </CardContent>
    </Card>
  );
}
