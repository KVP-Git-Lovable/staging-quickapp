import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, getMonth, getYear, subDays, subWeeks, subMonths, subQuarters } from 'date-fns';

export type PerformancePeriod = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year';

export interface PerformanceData {
  id: string;
  name: string;
  revenueTarget: number;
  revenueActual: number;
  revenueProgress: number;
  revenueGap: number;
  quantityTarget: number;
  quantityActual: number;
  quantityProgress: number;
  quantityGap: number;
}

export interface OverallPerformance {
  revenueTarget: number;
  revenueActual: number;
  revenueProgress: number;
  revenueGap: number;
  quantityTarget: number;
  quantityActual: number;
  quantityProgress: number;
  quantityGap: number;
  quantityUnit: string;
}

export interface PerformanceSummary {
  overall: OverallPerformance;
  territories: PerformanceData[];
  beats: PerformanceData[];
  retailers: PerformanceData[];
  isLoading: boolean;
}

// Get FY year from a date (April-March fiscal year)
const getFYYear = (date: Date): number => {
  const month = getMonth(date);
  const year = getYear(date);
  return month < 3 ? year : year + 1;
};

// Get FY month number from calendar month (April = 1, March = 12)
const getFYMonthNumber = (calendarMonth: number): number => {
  if (calendarMonth >= 3) return calendarMonth - 2;
  return calendarMonth + 10;
};

export function usePerformanceSummary(
  userId: string | undefined,
  period: PerformancePeriod
): PerformanceSummary {
  const [isLoading, setIsLoading] = useState(true);
  const [overall, setOverall] = useState<OverallPerformance>({
    revenueTarget: 0,
    revenueActual: 0,
    revenueProgress: 0,
    revenueGap: 0,
    quantityTarget: 0,
    quantityActual: 0,
    quantityProgress: 0,
    quantityGap: 0,
    quantityUnit: 'Units',
  });
  const [territories, setTerritories] = useState<PerformanceData[]>([]);
  const [beats, setBeats] = useState<PerformanceData[]>([]);
  const [retailers, setRetailers] = useState<PerformanceData[]>([]);

  // Calculate date range based on period
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (period) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'yesterday':
        const yesterday = subDays(now, 1);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
      case 'this_week':
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
      case 'last_week':
        const lastWeek = subWeeks(now, 1);
        return { start: startOfWeek(lastWeek, { weekStartsOn: 1 }), end: endOfWeek(lastWeek, { weekStartsOn: 1 }) };
      case 'this_month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'last_month':
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      case 'this_quarter':
        return { start: startOfQuarter(now), end: endOfQuarter(now) };
      case 'last_quarter':
        const lastQuarter = subQuarters(now, 1);
        return { start: startOfQuarter(lastQuarter), end: endOfQuarter(lastQuarter) };
      case 'this_year':
        const fyYear = getFYYear(now);
        const fyStart = new Date(fyYear - 1, 3, 1);
        const fyEnd = new Date(fyYear, 2, 31, 23, 59, 59);
        return { start: fyStart, end: fyEnd };
      default:
        return { start: startOfDay(now), end: endOfDay(now) };
    }
  }, [period]);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const now = new Date();
        const fyYear = getFYYear(now);
        const currentFYMonthNumber = getFYMonthNumber(getMonth(now));

        // Fetch user's business plan
        const { data: planData } = await supabase
          .from('user_business_plans')
          .select('id, quantity_target, quantity_unit, revenue_target')
          .eq('user_id', userId)
          .eq('year', fyYear)
          .single();

        if (!planData) {
          setIsLoading(false);
          return;
        }

        const quantityUnit = planData.quantity_unit || 'Units';

        // Fetch monthly targets for period-based calculations
        const { data: monthData } = await supabase
          .from('user_business_plan_months')
          .select('month_number, quantity_target, revenue_target')
          .eq('business_plan_id', planData.id)
          .eq('is_active', true);

        // Fetch territory targets
        const { data: territoryTargets } = await supabase
          .from('user_business_plan_territories')
          .select('territory_id, territory_name, quantity_target, revenue_target')
          .eq('business_plan_id', planData.id);

        // Fetch beat targets
        const { data: beatTargets } = await supabase
          .from('user_business_plan_territory_beats')
          .select('beat_id, beat_name, quantity_target, revenue_target')
          .eq('business_plan_id', planData.id);

        // Fetch retailer targets
        const { data: retailerTargets } = await supabase
          .from('user_business_plan_retailers')
          .select('retailer_id, retailer_name, quantity_target, target_revenue')
          .eq('business_plan_id', planData.id)
          .eq('is_active', true);

        // Calculate overall target based on period
        let overallRevenueTarget = 0;
        let overallQuantityTarget = 0;
        let periodMultiplier = 1;

        // Determine which month to use for targets (for past periods, use the month from dateRange)
        const targetDate = dateRange.start;
        const targetFYMonthNumber = getFYMonthNumber(getMonth(targetDate));

        if (period === 'this_year') {
          overallRevenueTarget = planData.revenue_target || 0;
          overallQuantityTarget = planData.quantity_target || 0;
        } else if (period === 'this_month' || period === 'last_month') {
          const monthTarget = monthData?.find(m => m.month_number === targetFYMonthNumber);
          overallRevenueTarget = monthTarget?.revenue_target || 0;
          overallQuantityTarget = monthTarget?.quantity_target || 0;
          periodMultiplier = (monthTarget?.revenue_target || 0) / (planData.revenue_target || 1);
        } else if (period === 'this_quarter' || period === 'last_quarter') {
          const quarterStart = targetFYMonthNumber <= 3 ? 1 : 
                               targetFYMonthNumber <= 6 ? 4 :
                               targetFYMonthNumber <= 9 ? 7 : 10;
          const quarterMonths = [quarterStart, quarterStart + 1, quarterStart + 2];
          const quarterTargets = monthData?.filter(m => quarterMonths.includes(m.month_number)) || [];
          overallRevenueTarget = quarterTargets.reduce((sum, m) => sum + (m.revenue_target || 0), 0);
          overallQuantityTarget = quarterTargets.reduce((sum, m) => sum + (m.quantity_target || 0), 0);
          periodMultiplier = overallRevenueTarget / (planData.revenue_target || 1);
        } else if (period === 'this_week' || period === 'last_week') {
          const monthTarget = monthData?.find(m => m.month_number === targetFYMonthNumber);
          overallRevenueTarget = (monthTarget?.revenue_target || 0) / 4;
          overallQuantityTarget = (monthTarget?.quantity_target || 0) / 4;
          periodMultiplier = overallRevenueTarget / (planData.revenue_target || 1);
        } else {
          // today or yesterday - daily target
          const monthTarget = monthData?.find(m => m.month_number === targetFYMonthNumber);
          overallRevenueTarget = (monthTarget?.revenue_target || 0) / 26; // ~26 working days
          overallQuantityTarget = (monthTarget?.quantity_target || 0) / 26;
          periodMultiplier = overallRevenueTarget / (planData.revenue_target || 1);
        }

        // Fetch actuals from orders
        const startStr = dateRange.start.toISOString();
        const endStr = dateRange.end.toISOString();

        // Get orders with retailer info
        const { data: ordersData } = await supabase
          .from('orders')
          .select(`
            id, 
            total_amount, 
            retailer_id,
            retailers!inner(id, name, beat_id, territory_id)
          `)
          .eq('user_id', userId)
          .gte('created_at', startStr)
          .lte('created_at', endStr);

        // Get order items for quantity with unit info
        const orderIds = ordersData?.map(o => o.id) || [];
        let orderItems: any[] = [];
        if (orderIds.length > 0) {
          const { data: itemsData } = await supabase
            .from('order_items')
            .select('order_id, quantity, unit')
            .in('order_id', orderIds);
          orderItems = itemsData || [];
        }

        // Calculate order quantities by order_id, normalizing to KG
        const orderQuantities: Record<string, number> = {};
        let totalQuantityInGrams = 0;
        
        orderItems.forEach(item => {
          const qty = Number(item.quantity) || 0;
          const itemUnit = (item.unit || '').toLowerCase();
          
          // Convert all quantities to grams for consistent summing
          let qtyInGrams = qty;
          if (itemUnit === 'kg' || itemUnit === 'kgs' || itemUnit === 'kilo') {
            qtyInGrams = qty * 1000;
          } else if (itemUnit === 'g' || itemUnit === 'grams' || itemUnit === 'gram') {
            qtyInGrams = qty;
          } else {
            // For pieces/units, treat as-is (will be converted to KG later)
            qtyInGrams = qty;
          }
          
          orderQuantities[item.order_id] = (orderQuantities[item.order_id] || 0) + qtyInGrams;
          totalQuantityInGrams += qtyInGrams;
        });

        // Calculate overall actuals - convert total quantity to KG
        const overallRevenueActual = ordersData?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0;
        const overallQuantityActual = totalQuantityInGrams / 1000; // Convert to KG

        // Calculate progress
        const revenueProgress = overallRevenueTarget > 0 ? Math.round((overallRevenueActual / overallRevenueTarget) * 100) : 0;
        const quantityProgress = overallQuantityTarget > 0 ? Math.round((overallQuantityActual / overallQuantityTarget) * 100) : 0;

        setOverall({
          revenueTarget: overallRevenueTarget,
          revenueActual: overallRevenueActual,
          revenueProgress,
          revenueGap: Math.max(overallRevenueTarget - overallRevenueActual, 0),
          quantityTarget: overallQuantityTarget,
          quantityActual: overallQuantityActual,
          quantityProgress,
          quantityGap: Math.max(overallQuantityTarget - overallQuantityActual, 0),
          quantityUnit,
        });

        // Calculate territory performance (quantities already in grams, convert to KG)
        const territoryActuals: Record<string, { revenue: number; quantity: number }> = {};
        ordersData?.forEach(order => {
          const retailer = order.retailers as any;
          if (retailer?.territory_id) {
            if (!territoryActuals[retailer.territory_id]) {
              territoryActuals[retailer.territory_id] = { revenue: 0, quantity: 0 };
            }
            territoryActuals[retailer.territory_id].revenue += Number(order.total_amount || 0);
            // Convert order quantities (in grams) to KG
            const orderQtyInGrams = orderQuantities[order.id] || 0;
            territoryActuals[retailer.territory_id].quantity += orderQtyInGrams / 1000;
          }
        });

        const territoryPerformance: PerformanceData[] = (territoryTargets || []).map(t => {
          const target = {
            revenue: (t.revenue_target || 0) * periodMultiplier,
            quantity: (t.quantity_target || 0) * periodMultiplier,
          };
          const actual = territoryActuals[t.territory_id] || { revenue: 0, quantity: 0 };
          return {
            id: t.territory_id,
            name: t.territory_name,
            revenueTarget: target.revenue,
            revenueActual: actual.revenue,
            revenueProgress: target.revenue > 0 ? Math.round((actual.revenue / target.revenue) * 100) : 0,
            revenueGap: Math.max(target.revenue - actual.revenue, 0),
            quantityTarget: target.quantity,
            quantityActual: actual.quantity,
            quantityProgress: target.quantity > 0 ? Math.round((actual.quantity / target.quantity) * 100) : 0,
            quantityGap: Math.max(target.quantity - actual.quantity, 0),
          };
        });
        setTerritories(territoryPerformance);

        // Calculate beat performance (quantities in grams, convert to KG)
        // First, get all beats to map beat_id (string) to id (uuid) and beat_name
        const uniqueBeatIds = new Set<string>();
        ordersData?.forEach(order => {
          const retailer = order.retailers as any;
          if (retailer?.beat_id) {
            uniqueBeatIds.add(retailer.beat_id);
          }
        });

        // Fetch beats data to map beat_id strings to UUIDs and names
        let beatsMap: Record<string, { uuid: string; name: string }> = {};
        if (uniqueBeatIds.size > 0) {
          const { data: beatsData } = await supabase
            .from('beats')
            .select('id, beat_id, beat_name')
            .in('beat_id', Array.from(uniqueBeatIds));
          
          beatsData?.forEach(beat => {
            beatsMap[beat.beat_id] = { uuid: beat.id, name: beat.beat_name };
          });
        }

        // Build beat actuals using UUID as key
        const beatActuals: Record<string, { revenue: number; quantity: number; name: string }> = {};
        ordersData?.forEach(order => {
          const retailer = order.retailers as any;
          if (retailer?.beat_id) {
            const beatInfo = beatsMap[retailer.beat_id];
            const beatUuid = beatInfo?.uuid || retailer.beat_id;
            const beatName = beatInfo?.name || '';
            
            if (!beatActuals[beatUuid]) {
              beatActuals[beatUuid] = { revenue: 0, quantity: 0, name: beatName };
            }
            beatActuals[beatUuid].revenue += Number(order.total_amount || 0);
            // Convert order quantities (in grams) to KG
            const orderQtyInGrams = orderQuantities[order.id] || 0;
            beatActuals[beatUuid].quantity += orderQtyInGrams / 1000;
          }
        });

        // Build beat targets map (uses UUID as beat_id)
        const beatTargetsMap: Record<string, { name: string; revenueTarget: number; quantityTarget: number }> = {};
        (beatTargets || []).forEach(bt => {
          beatTargetsMap[bt.beat_id] = {
            name: bt.beat_name,
            revenueTarget: (bt.revenue_target || 0) * periodMultiplier,
            quantityTarget: (bt.quantity_target || 0) * periodMultiplier,
          };
        });

        // Merge beats with targets and actuals
        const allBeatIds = new Set([...Object.keys(beatActuals), ...Object.keys(beatTargetsMap)]);
        const beatPerformance: PerformanceData[] = Array.from(allBeatIds).map(id => {
          const target = beatTargetsMap[id] || { name: '', revenueTarget: 0, quantityTarget: 0 };
          const actual = beatActuals[id] || { revenue: 0, quantity: 0, name: '' };
          const beatName = target.name || actual.name || 'Unknown Beat';
          
          return {
            id,
            name: beatName,
            revenueTarget: target.revenueTarget,
            revenueActual: actual.revenue,
            revenueProgress: target.revenueTarget > 0 ? Math.round((actual.revenue / target.revenueTarget) * 100) : 0,
            revenueGap: Math.max(target.revenueTarget - actual.revenue, 0),
            quantityTarget: target.quantityTarget,
            quantityActual: actual.quantity,
            quantityProgress: target.quantityTarget > 0 ? Math.round((actual.quantity / target.quantityTarget) * 100) : 0,
            quantityGap: Math.max(target.quantityTarget - actual.quantity, 0),
          };
        });
        setBeats(beatPerformance);

        // Calculate retailer performance (quantities in grams, convert to KG)
        const retailerActuals: Record<string, { revenue: number; quantity: number }> = {};
        ordersData?.forEach(order => {
          if (order.retailer_id) {
            if (!retailerActuals[order.retailer_id]) {
              retailerActuals[order.retailer_id] = { revenue: 0, quantity: 0 };
            }
            retailerActuals[order.retailer_id].revenue += Number(order.total_amount || 0);
            // Convert order quantities (in grams) to KG
            const orderQtyInGrams = orderQuantities[order.id] || 0;
            retailerActuals[order.retailer_id].quantity += orderQtyInGrams / 1000;
          }
        });

        const retailerPerformance: PerformanceData[] = (retailerTargets || []).map(r => {
          const target = {
            revenue: (r.target_revenue || 0) * periodMultiplier,
            quantity: (r.quantity_target || 0) * periodMultiplier,
          };
          const actual = retailerActuals[r.retailer_id] || { revenue: 0, quantity: 0 };
          return {
            id: r.retailer_id,
            name: r.retailer_name,
            revenueTarget: target.revenue,
            revenueActual: actual.revenue,
            revenueProgress: target.revenue > 0 ? Math.round((actual.revenue / target.revenue) * 100) : 0,
            revenueGap: Math.max(target.revenue - actual.revenue, 0),
            quantityTarget: target.quantity,
            quantityActual: actual.quantity,
            quantityProgress: target.quantity > 0 ? Math.round((actual.quantity / target.quantity) * 100) : 0,
            quantityGap: Math.max(target.quantity - actual.quantity, 0),
          };
        });
        setRetailers(retailerPerformance);

      } catch (error) {
        console.error('Error fetching performance summary:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [userId, period, dateRange.start.toISOString(), dateRange.end.toISOString()]);

  return {
    overall,
    territories,
    beats,
    retailers,
    isLoading,
  };
}
