import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export interface DayRetailerRow {
  id: string;
  name: string;
  beat_id: string | null;
  beat_name?: string | null;
  visit_status: "completed" | "pending" | "skipped" | "not_visited";
  visit_id?: string | null;
  order_count: number;
  order_value: number;
  last_visit_date: string | null;
}

interface Params {
  repId: string | null;
  date: string;
  beatId?: string | null;
}

/**
 * Per-day retailer drill-down for a rep (optionally filtered to one beat).
 * Joins retailers in the rep's planned beats with visits and orders for that date.
 */
export function useDayRetailerDetail({ repId, date, beatId }: Params) {
  return useQuery({
    queryKey: ["bc-day-detail", repId, date, beatId || "all"],
    enabled: !!repId && !!date,
    staleTime: 30_000,
    queryFn: async (): Promise<DayRetailerRow[]> => {
      if (!repId) return [];

      // 1) Beats for the day: daily plans + permanent owned + beat_plans
      const [dailyRes, ownedRes, planRes] = await Promise.all([
        sb.from("daily_beat_plans")
          .select("beat_id")
          .eq("assigned_user_id", repId)
          .eq("plan_date", date),
        supabase.from("beats")
          .select("beat_id, beat_name")
          .eq("owner_id", repId)
          .eq("is_active", true),
        sb.from("beat_plans")
          .select("beat_id")
          .eq("user_id", repId)
          .eq("plan_date", date),
      ]);

      const beatIds = new Set<string>();
      (dailyRes.data || []).forEach((r: any) => beatIds.add(r.beat_id));
      (ownedRes.data || []).forEach((r: any) => beatIds.add(r.beat_id));
      (planRes.data || []).forEach((r: any) => beatIds.add(r.beat_id));
      if (beatId) {
        beatIds.clear();
        beatIds.add(beatId);
      }
      if (beatIds.size === 0) return [];

      const beatNameById = new Map<string, string>();
      (ownedRes.data || []).forEach((r: any) => beatNameById.set(r.beat_id, r.beat_name));
      const missingNames = Array.from(beatIds).filter((b) => !beatNameById.has(b));
      if (missingNames.length) {
        const { data } = await supabase
          .from("beats")
          .select("beat_id, beat_name")
          .in("beat_id", missingNames);
        (data || []).forEach((b: any) => beatNameById.set(b.beat_id, b.beat_name));
      }

      // 2) Retailers in those beats
      const { data: retailers = [] } = await supabase
        .from("retailers")
        .select("id, name, beat_id, last_visit_date")
        .in("beat_id", Array.from(beatIds));

      if (!retailers.length) return [];
      const retailerIds = retailers.map((r: any) => r.id);

      // 3) Visits for the date
      const { data: visits = [] } = await supabase
        .from("visits")
        .select("id, retailer_id, status")
        .eq("user_id", repId)
        .eq("planned_date", date)
        .in("retailer_id", retailerIds);
      const visitByRet = new Map<string, any>();
      (visits || []).forEach((v: any) => visitByRet.set(v.retailer_id, v));

      // 4) Orders for the date
      const { data: orders = [] } = await supabase
        .from("orders")
        .select("retailer_id, total_amount")
        .eq("user_id", repId)
        .eq("order_date", date)
        .in("retailer_id", retailerIds);
      const orderAgg = new Map<string, { count: number; value: number }>();
      (orders || []).forEach((o: any) => {
        const cur = orderAgg.get(o.retailer_id) || { count: 0, value: 0 };
        cur.count += 1;
        cur.value += Number(o.total_amount || 0);
        orderAgg.set(o.retailer_id, cur);
      });

      return retailers.map((r: any): DayRetailerRow => {
        const v = visitByRet.get(r.id);
        const agg = orderAgg.get(r.id) || { count: 0, value: 0 };
        return {
          id: r.id,
          name: r.name,
          beat_id: r.beat_id,
          beat_name: beatNameById.get(r.beat_id) || null,
          visit_status: v ? (v.status as any) : "not_visited",
          visit_id: v?.id ?? null,
          order_count: agg.count,
          order_value: agg.value,
          last_visit_date: r.last_visit_date,
        };
      });
    },
  });
}
