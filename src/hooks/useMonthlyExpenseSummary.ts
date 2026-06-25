import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { fetchExpenseConfigs, resolveExpenseConfig, fetchUserManagerId } from './useResolvedExpenseConfig';
import { fetchMonthlyGPSDistances } from './useGPSDistance';

export interface WeeklyBreakdown {
  weekLabel: string;
  weekNumber: number;
  ta: number;
  taKm: number;
  da: number;
  additional: number;
  total: number;
  orderValue: number;
  orderCount: number;
  startDate: string;
  endDate: string;
}

export interface DailyBreakdown {
  date: string;
  ta: number;
  taKm: number;
  da: number;
  additional: number;
  total: number;
  orderValue: number;
  orderCount: number;
  isPresent: boolean;
}

export interface MonthlyExpenseSummary {
  ta: number;
  totalKm: number;
  taType: string;
  da: number;
  additionalApproved: number;
  additionalPending: number;
  additionalRejected: number;
  additionalTotal: number;
  total: number;
  orderValue: number;
  presentDays: number;
  weeklyBreakdown: WeeklyBreakdown[];
  dailyBreakdown: DailyBreakdown[];
}

export const useMonthlyExpenseSummary = (userId: string | undefined, yearMonth: string) => {
  return useQuery({
    queryKey: ['monthly-expense-summary', userId, yearMonth],
    queryFn: async (): Promise<MonthlyExpenseSummary> => {
      if (!userId) throw new Error('No user');

      const [year, month] = yearMonth.split('-').map(Number);
      const start = startOfMonth(new Date(year, month - 1));
      const end = endOfMonth(start);
      const startStr = format(start, 'yyyy-MM-dd');
      const endStr = format(end, 'yyyy-MM-dd');

      const [{ globalConfig, userConfigMap, teamConfigMap, userGroupConfigMap }, managerId, attendanceRes, beatPlansRes, beatsRes, additionalRes, ordersRes] = await Promise.all([
        fetchExpenseConfigs(),
        fetchUserManagerId(userId),
        supabase.from('attendance').select('date, status')
          .eq('user_id', userId).gte('date', startStr).lte('date', endStr),
        supabase.from('beat_plans').select('plan_date, beat_id')
          .eq('user_id', userId).gte('plan_date', startStr).lte('plan_date', endStr),
        supabase.from('beats').select('beat_id, travel_allowance, average_km'),
        (supabase as any).from('additional_expenses').select('amount, status, expense_date')
          .eq('user_id', userId).gte('expense_date', startStr).lte('expense_date', endStr),
        supabase.from('orders').select('total_amount, order_date')
          .eq('user_id', userId).gte('order_date', startStr).lte('order_date', endStr)
          .eq('status', 'confirmed'),
      ]);

      // Resolve config with hierarchy: User > Group > Manager > Global
      const config = resolveExpenseConfig(userId, managerId, globalConfig, userConfigMap, teamConfigMap, userGroupConfigMap);
      const daAmount = config.da_amount;
      const taType = config.ta_type;
      const fixedTa = config.fixed_ta_amount;
      const taPerKmRate = config.ta_per_km_rate;

      // Build beat TA map - uses per-km rate if configured
      const beatTAMap = new Map<string, number>();
      beatsRes.data?.forEach((b: any) => {
        const km = b.average_km || 0;
        const beatFixedTA = b.travel_allowance || 0;
        const ta = (taPerKmRate > 0 && km > 0) ? (km * taPerKmRate) : beatFixedTA;
        beatTAMap.set(b.beat_id, ta);
      });

      // Present dates (for DA)
      const presentDates = new Set(
        attendanceRes.data?.filter(a => ['present', 'regularized'].includes(a.status)).map(a => a.date) || []
      );
      const presentDays = presentDates.size;

      // Leave dates — TA is not paid on leave days (mirrors BeatAllowanceManagement table)
      const leaveDates = new Set(
        attendanceRes.data?.filter(a => ['leave', 'on_leave', 'absent', 'half_day_leave'].includes(a.status)).map(a => a.date) || []
      );

      // DA total
      const da = presentDays * daAmount;

      // TA calculation per beat-plan day (source of truth = beat_plans, same as Expense Details table)
      const dailyTA = new Map<string, number>();
      const dailyKm = new Map<string, number>();
      const planDates = new Set<string>(
        (beatPlansRes.data || []).map((p: any) => p.plan_date as string)
      );

      if (taType === 'from_gps') {
        // Fetch GPS distances for the month
        const gpsDistances = await fetchMonthlyGPSDistances(userId, startStr, endStr);
        planDates.forEach(d => {
          if (leaveDates.has(d)) return;
          const km = gpsDistances.get(d) || 0;
          dailyKm.set(d, km);
          dailyTA.set(d, Math.round(km * taPerKmRate * 100) / 100);
        });
      } else if (taType === 'fixed') {
        planDates.forEach(d => {
          if (leaveDates.has(d)) return;
          dailyTA.set(d, fixedTa);
        });
      } else {
        // from_beat
        beatPlansRes.data?.forEach((plan: any) => {
          if (leaveDates.has(plan.plan_date)) return;
          const current = dailyTA.get(plan.plan_date) || 0;
          dailyTA.set(plan.plan_date, current + (beatTAMap.get(plan.beat_id) || 0));
        });
      }

      let ta = 0;
      dailyTA.forEach(v => ta += v);

      // Additional expenses
      const additional = additionalRes.data || [];
      const additionalApproved = additional
        .filter((e: any) => ['manager_approved', 'paid'].includes(e.status))
        .reduce((s: number, e: any) => s + (e.amount || 0), 0);
      const additionalPending = additional
        .filter((e: any) => ['submitted', 'draft'].includes(e.status))
        .reduce((s: number, e: any) => s + (e.amount || 0), 0);
      const additionalRejected = additional
        .filter((e: any) => e.status === 'rejected')
        .reduce((s: number, e: any) => s + (e.amount || 0), 0);
      const additionalTotal = additional.reduce((s: number, e: any) => s + (e.amount || 0), 0);

      // Weekly breakdown (week 1 = days 1-7, week 2 = 8-14, etc.)
      const weeklyMap = new Map<number, WeeklyBreakdown>();
      const dailyBreakdown: DailyBreakdown[] = [];
      const daysInMonth = end.getDate();
      
      for (let day = 1; day <= daysInMonth; day++) {
        const weekNum = Math.ceil(day / 7);
        const dateStr = `${yearMonth}-${String(day).padStart(2, '0')}`;
        
        if (!weeklyMap.has(weekNum)) {
          const weekStart = day;
          const weekEnd = Math.min(day + 6, daysInMonth);
          weeklyMap.set(weekNum, {
            weekLabel: `Week ${weekNum}`,
            weekNumber: weekNum,
            ta: 0, taKm: 0, da: 0, additional: 0, total: 0, orderValue: 0, orderCount: 0,
            startDate: `${yearMonth}-${String(weekStart).padStart(2, '0')}`,
            endDate: `${yearMonth}-${String(weekEnd).padStart(2, '0')}`,
          });
        }

        const week = weeklyMap.get(weekNum)!;
        
        const dayTA = dailyTA.get(dateStr) || 0;
        const dayTAKm = dailyKm.get(dateStr) || 0;
        const isPresent = presentDates.has(dateStr);
        const dayDA = isPresent ? daAmount : 0;
        const dayAdditional = additional
          .filter((e: any) => e.expense_date === dateStr && ['manager_approved', 'paid'].includes(e.status))
          .reduce((s: number, e: any) => s + (e.amount || 0), 0);

        const dayOrders = (ordersRes.data || []).filter((o: any) => o.order_date === dateStr);
        const dayOrderValue = dayOrders.reduce((s: number, o: any) => s + (o.total_amount || 0), 0);
        const dayOrderCount = dayOrders.length;

        week.ta += dayTA;
        week.taKm += dayTAKm;
        week.da += dayDA;
        week.additional += dayAdditional;
        week.orderValue += dayOrderValue;
        week.orderCount += dayOrderCount;

        dailyBreakdown.push({
          date: dateStr,
          ta: dayTA,
          taKm: dayTAKm,
          da: dayDA,
          additional: dayAdditional,
          total: dayTA + dayDA + dayAdditional,
          orderValue: dayOrderValue,
          orderCount: dayOrderCount,
          isPresent,
        });
      }

      // Calculate weekly totals
      weeklyMap.forEach(w => w.total = w.ta + w.da + w.additional);

      const orderValue = (ordersRes.data || []).reduce((s: number, o: any) => s + (o.total_amount || 0), 0);

      let totalKm = 0;
      dailyKm.forEach(v => totalKm += v);

      return {
        ta,
        totalKm,
        taType,
        da,
        additionalApproved,
        additionalPending,
        additionalRejected,
        additionalTotal,
        total: ta + da + additionalApproved,
        orderValue,
        presentDays,
        weeklyBreakdown: Array.from(weeklyMap.values()),
        dailyBreakdown,
      };
    },
    enabled: !!userId && !!yearMonth,
    staleTime: 2 * 60 * 1000,
  });
};
