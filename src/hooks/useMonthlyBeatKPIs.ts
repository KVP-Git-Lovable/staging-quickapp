import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format } from "date-fns";

const sb = supabase as any;

export interface MonthKPIs {
  planned: number;
  served: number;
  missed: number;
  coveragePct: number;
  orderValue: number;
  productivePct: number;
}

export function useMonthlyBeatKPIs(repId: string | null, monthAnchor: Date) {
  const monthKey = format(monthAnchor, "yyyy-MM");
  return useQuery<MonthKPIs>({
    queryKey: ["bc-month-kpis", repId, monthKey],
    enabled: !!repId,
    staleTime: 60_000,
    queryFn: async () => {
      const empty: MonthKPIs = {
        planned: 0, served: 0, missed: 0,
        coveragePct: 0, orderValue: 0, productivePct: 0,
      };
      if (!repId) return empty;
      const start = format(startOfMonth(monthAnchor), "yyyy-MM-dd");
      const end = format(endOfMonth(monthAnchor), "yyyy-MM-dd");
      const todayStr = format(new Date(), "yyyy-MM-dd");

      const [plansRes, beatPlansRes, visitsRes, ordersRes] = await Promise.all([
        sb.from("daily_beat_plans")
          .select("plan_date, beat_id")
          .eq("assigned_user_id", repId)
          .gte("plan_date", start).lte("plan_date", end),
        sb.from("beat_plans")
          .select("plan_date, beat_id")
          .eq("user_id", repId)
          .gte("plan_date", start).lte("plan_date", end),
        supabase.from("visits")
          .select("planned_date, retailer_id, status")
          .eq("user_id", repId)
          .gte("planned_date", start).lte("planned_date", end),
        supabase.from("orders")
          .select("order_date, retailer_id, total_amount")
          .eq("user_id", repId)
          .gte("order_date", start).lte("order_date", end),
      ]);

      // unique (date, beat_id) pairs
      const plannedSet = new Set<string>();
      (plansRes.data || []).forEach((p: any) => plannedSet.add(`${p.plan_date}|${p.beat_id}`));
      (beatPlansRes.data || []).forEach((p: any) => plannedSet.add(`${p.plan_date}|${p.beat_id}`));
      const planned = plannedSet.size;

      const beatIds = Array.from(new Set(Array.from(plannedSet).map((k) => k.split("|")[1])));
      const retailerBeat = new Map<string, string>();
      if (beatIds.length) {
        const { data: rets } = await supabase
          .from("retailers")
          .select("id, beat_id")
          .in("beat_id", beatIds);
        (rets || []).forEach((r: any) => retailerBeat.set(r.id, r.beat_id));
      }

      // visits per (date|beat)
      const completedByKey = new Map<string, number>();
      const totalByKey = new Map<string, number>();
      let productiveVisits = 0;
      let totalVisits = 0;
      (visitsRes.data || []).forEach((v: any) => {
        const beat = retailerBeat.get(v.retailer_id);
        if (!beat) return;
        const k = `${v.planned_date}|${beat}`;
        totalByKey.set(k, (totalByKey.get(k) || 0) + 1);
        if (v.status === "completed") {
          completedByKey.set(k, (completedByKey.get(k) || 0) + 1);
        }
      });
      (visitsRes.data || []).forEach((v: any) => {
        totalVisits += 1;
        // productive = visit with order
      });

      const orderedRetailerByDay = new Set<string>();
      let orderValue = 0;
      (ordersRes.data || []).forEach((o: any) => {
        orderValue += Number(o.total_amount || 0);
        orderedRetailerByDay.add(`${o.order_date}|${o.retailer_id}`);
      });
      (visitsRes.data || []).forEach((v: any) => {
        if (orderedRetailerByDay.has(`${v.planned_date}|${v.retailer_id}`)) productiveVisits += 1;
      });

      let served = 0;
      let missed = 0;
      plannedSet.forEach((k) => {
        const completed = completedByKey.get(k) || 0;
        const [date] = k.split("|");
        if (completed > 0) served += 1;
        else if (date < todayStr) missed += 1;
      });

      const coveragePct = planned > 0 ? Math.round((served / planned) * 100) : 0;
      const productivePct = totalVisits > 0 ? Math.round((productiveVisits / totalVisits) * 100) : 0;

      return { planned, served, missed, coveragePct, orderValue, productivePct };
    },
  });
}
