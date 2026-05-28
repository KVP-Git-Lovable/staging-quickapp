import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, subDays, subWeeks, subMonths, subQuarters, getMonth, getYear, getDaysInMonth, getDay } from 'date-fns';

export type TargetPeriod = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'this_quarter' | 'this_year' | 'last_week' | 'last_month' | 'last_quarter';
export type TargetBasis = 'revenue' | 'quantity';

interface UserTargetProgress {
  target: number;
  actual: number;
  progress: number;
  gap: number;
  unit: string;
  isLoading: boolean;
}

// FY months mapping (April = 1, March = 12)
const FY_MONTHS = [
  { number: 1, name: 'April', calendarMonth: 3 },
  { number: 2, name: 'May', calendarMonth: 4 },
  { number: 3, name: 'June', calendarMonth: 5 },
  { number: 4, name: 'July', calendarMonth: 6 },
  { number: 5, name: 'August', calendarMonth: 7 },
  { number: 6, name: 'September', calendarMonth: 8 },
  { number: 7, name: 'October', calendarMonth: 9 },
  { number: 8, name: 'November', calendarMonth: 10 },
  { number: 9, name: 'December', calendarMonth: 11 },
  { number: 10, name: 'January', calendarMonth: 0 },
  { number: 11, name: 'February', calendarMonth: 1 },
  { number: 12, name: 'March', calendarMonth: 2 },
];

// Calculate working days for a month (6-day work week, excluding Sundays)
const getWorkingDaysInMonth = (calendarMonth: number, calendarYear: number): number => {
  const daysInMonth = getDaysInMonth(new Date(calendarYear, calendarMonth, 1));
  
  let sundays = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(calendarYear, calendarMonth, day);
    if (getDay(date) === 0) sundays++;
  }
  
  return daysInMonth - sundays;
};

// Get FY year from a date (April-March fiscal year)
const getFYYear = (date: Date): number => {
  const month = getMonth(date);
  const year = getYear(date);
  return month < 3 ? year : year + 1;
};

// Get FY month number from calendar month (April = 1, March = 12)
const getFYMonthNumber = (calendarMonth: number): number => {
  const monthInfo = FY_MONTHS.find(m => m.calendarMonth === calendarMonth);
  return monthInfo?.number || 1;
};

// Cache for plan data to avoid repeated fetches
const planCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute cache

export function useUserTargetProgress(
  userId: string | undefined,
  period: TargetPeriod,
  basis: TargetBasis
): UserTargetProgress {
  const [target, setTarget] = useState(0);
  const [actual, setActual] = useState(0);
  const [unit, setUnit] = useState('Units');
  const [isLoading, setIsLoading] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Calculate date range based on period - memoized with stable keys
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
        const lastWeekDate = subWeeks(now, 1);
        return { start: startOfWeek(lastWeekDate, { weekStartsOn: 1 }), end: endOfWeek(lastWeekDate, { weekStartsOn: 1 }) };
      case 'this_month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'last_month':
        const lastMonthDate = subMonths(now, 1);
        return { start: startOfMonth(lastMonthDate), end: endOfMonth(lastMonthDate) };
      case 'this_quarter':
        return { start: startOfQuarter(now), end: endOfQuarter(now) };
      case 'last_quarter':
        const lastQuarterDate = subQuarters(now, 1);
        return { start: startOfQuarter(lastQuarterDate), end: endOfQuarter(lastQuarterDate) };
      case 'this_year':
        const fyYear = getFYYear(now);
        const fyStart = new Date(fyYear - 1, 3, 1);
        const fyEnd = new Date(fyYear, 2, 31, 23, 59, 59);
        return { start: fyStart, end: fyEnd };
      default:
        return { start: startOfDay(now), end: endOfDay(now) };
    }
  }, [period]);

  // Create stable date strings for dependency
  const startStr = useMemo(() => dateRange.start.toISOString(), [dateRange.start.getTime()]);
  const endStr = useMemo(() => dateRange.end.toISOString(), [dateRange.end.getTime()]);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const now = new Date();
        const fyYear = getFYYear(now);
        const cacheKey = `${userId}_${fyYear}`;

        // Check cache for plan data
        let planData: any = null;
        let monthData: any[] | null = null;
        const cached = planCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          planData = cached.data.planData;
          monthData = cached.data.monthData;
        } else {
          // Fetch plan for current FY first
          const planResult = await supabase
            .from('user_business_plans')
            .select('id, quantity_target, quantity_unit, revenue_target, year')
            .eq('user_id', userId)
            .eq('year', fyYear)
            .single();

          planData = planResult.data;

          // If no plan for current FY, try the next FY (user may have set target for upcoming year)
          if (!planData) {
            const nextFYResult = await supabase
              .from('user_business_plans')
              .select('id, quantity_target, quantity_unit, revenue_target, year')
              .eq('user_id', userId)
              .eq('year', fyYear + 1)
              .single();
            planData = nextFYResult.data;
          }

          // If still no plan, try fetching the most recent plan
          if (!planData) {
            const latestResult = await supabase
              .from('user_business_plans')
              .select('id, quantity_target, quantity_unit, revenue_target, year')
              .eq('user_id', userId)
              .order('year', { ascending: false })
              .limit(1)
              .single();
            planData = latestResult.data;
          }

          // Fetch month data for the found plan
          if (planData) {
            const monthResult = await supabase
              .from('user_business_plan_months')
              .select('month_number, quantity_target, revenue_target, business_plan_id')
              .eq('business_plan_id', planData.id)
              .order('month_number');
            monthData = monthResult.data || [];
          } else {
            monthData = [];
          }

          // Cache the result
          planCache.set(cacheKey, {
            data: { planData, monthData },
            timestamp: Date.now()
          });
        }

        if (!planData) {
          setTarget(0);
          setUnit('Units');
        } else {
          setUnit(planData.quantity_unit || 'Units');

          let calculatedTarget = 0;

          if (period === 'today' || period === 'yesterday') {
            const targetDate = period === 'yesterday' ? subDays(now, 1) : now;
            const targetMonth = getFYMonthNumber(getMonth(targetDate));
            const targetCalendarMonth = getMonth(targetDate);
            const targetCalendarYear = getYear(targetDate);
            
            const monthTarget = monthData?.find(m => m.month_number === targetMonth);
            const workingDays = getWorkingDaysInMonth(targetCalendarMonth, targetCalendarYear);
            
            if (monthTarget && workingDays > 0) {
              calculatedTarget = basis === 'revenue'
                ? (monthTarget.revenue_target || 0) / workingDays
                : (monthTarget.quantity_target || 0) / workingDays;
            }
          } else if (period === 'this_week' || period === 'last_week') {
            const targetDate = period === 'last_week' ? subWeeks(now, 1) : now;
            const targetFYMonthNumber = getFYMonthNumber(getMonth(targetDate));
            const monthTarget = monthData?.find(m => m.month_number === targetFYMonthNumber);
            if (monthTarget) {
              calculatedTarget = basis === 'revenue'
                ? (monthTarget.revenue_target || 0) / 4
                : (monthTarget.quantity_target || 0) / 4;
            }
          } else if (period === 'this_month' || period === 'last_month') {
            const targetDate = period === 'last_month' ? subMonths(now, 1) : now;
            const targetFYMonthNumber = getFYMonthNumber(getMonth(targetDate));
            const monthTarget = monthData?.find(m => m.month_number === targetFYMonthNumber);
            if (monthTarget) {
              calculatedTarget = basis === 'revenue' 
                ? (monthTarget.revenue_target || 0)
                : (monthTarget.quantity_target || 0);
            }
          } else if (period === 'this_quarter' || period === 'last_quarter') {
            const targetDate = period === 'last_quarter' ? subQuarters(now, 1) : now;
            const targetFYMonthNumber = getFYMonthNumber(getMonth(targetDate));
            const quarterStart = targetFYMonthNumber <= 3 ? 1 : 
                                 targetFYMonthNumber <= 6 ? 4 :
                                 targetFYMonthNumber <= 9 ? 7 : 10;
            const quarterMonths = [quarterStart, quarterStart + 1, quarterStart + 2];
            
            const quarterTargets = monthData?.filter(m => quarterMonths.includes(m.month_number)) || [];
            calculatedTarget = basis === 'revenue'
              ? quarterTargets.reduce((sum, m) => sum + (m.revenue_target || 0), 0)
              : quarterTargets.reduce((sum, m) => sum + (m.quantity_target || 0), 0);
          } else if (period === 'this_year') {
            calculatedTarget = basis === 'revenue' 
              ? (planData.revenue_target || 0)
              : (planData.quantity_target || 0);
          }

          setTarget(calculatedTarget);
        }

        // Fetch actual performance - optimized single query approach
        if (basis === 'revenue') {
          const { data: ordersData } = await supabase
            .from('orders')
            .select('total_amount')
            .eq('user_id', userId)
            .gte('created_at', startStr)
            .lte('created_at', endStr);

          const totalRevenue = ordersData?.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0) || 0;
          setActual(totalRevenue);
        } else {
          // Use a join to get quantities in one query
          const { data: ordersData } = await supabase
            .from('orders')
            .select('id, order_items!order_items_order_id_fkey(quantity, unit)')
            .eq('user_id', userId)
            .gte('created_at', startStr)
            .lte('created_at', endStr);

          // Sum quantities and convert to KG (order_items store quantities in grams)
          const totalQuantityInGrams = ordersData?.reduce((sum, order) => {
            const orderQty = (order.order_items as any[])?.reduce(
              (itemSum, item) => {
                const qty = Number(item.quantity) || 0;
                const itemUnit = (item.unit || '').toLowerCase();
                // If unit is already KG, convert to grams for consistent summing
                if (itemUnit === 'kg' || itemUnit === 'kgs') {
                  return itemSum + (qty * 1000);
                }
                // Grams or default - use as-is
                return itemSum + qty;
              }, 0
            ) || 0;
            return sum + orderQty;
          }, 0) || 0;
          
          // Convert total grams to KG for display
          const totalQuantityInKg = totalQuantityInGrams / 1000;
          setActual(totalQuantityInKg);
        }
      } catch (error) {
        if ((error as any)?.name !== 'AbortError') {
          console.error('Error fetching target progress:', error);
          setTarget(0);
          setActual(0);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [userId, period, basis, startStr, endStr]);

  const progress = target > 0 ? Math.min(Math.round((actual / target) * 100), 100) : 0;
  // Gap is now difference (can be negative if exceeding target)
  const gap = actual - target;

  return {
    target,
    actual,
    progress,
    gap,
    unit,
    isLoading
  };
}
