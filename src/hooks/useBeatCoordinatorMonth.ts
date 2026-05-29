import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format } from "date-fns";

const sb = supabase as any;

export interface DayBeatChip {
  beat_id: string;
  beat_name: string;
  status: "assigned" | "served" | "stale" | "uncovered" | "shared" | "planned";
  assignment_type?: string;
  retailer_count?: number;
  last_served?: string | null;
  served_by?: string | null;
}

export interface MonthData {
  /** key = YYYY-MM-DD; value = chips for that day */
  byDate: Record<string, DayBeatChip[]>;
  /** dates the rep is on approved leave */
  leaveDates: Set<string>;
}

/**
 * Returns calendar data for a single rep across the visible month.
 * Combines daily_beat_plans + permanent ownership + visits + leave_applications.
 */
export function useBeatCoordinatorMonth(repId: string | null, monthAnchor: Date) {
  const monthKey = format(monthAnchor, "yyyy-MM");
  return useQuery<MonthData>({
    queryKey: ["bc-month", repId, monthKey],
    enabled: !!repId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!repId) return { byDate: {}, leaveDates: new Set<string>() };
      const start = format(startOfMonth(monthAnchor), "yyyy-MM-dd");
      const end = format(endOfMonth(monthAnchor), "yyyy-MM-dd");

      const [plansRes, beatsRes, leavesRes, visitsRes] = await Promise.all([
        sb.from("daily_beat_plans")
          .select("plan_date, beat_id, assignment_type, assigned_user_id")
          .eq("assigned_user_id", repId)
          .gte("plan_date", start).lte("plan_date", end),
        supabase.from("beats")
          .select("beat_id, beat_name, owner_id, is_active")
          .eq("is_active", true).eq("owner_id", repId),
        sb.from("leave_applications")
          .select("user_id, start_date, end_date, status")
          .eq("user_id", repId).eq("status", "approved")
          .lte("start_date", end).gte("end_date", start),
        supabase.from("visits")
          .select("planned_date, retailer_id, status")
          .eq("user_id", repId).eq("status", "completed")
          .gte("planned_date", start).lte("planned_date", end),
      ]);

      const ownedBeats = beatsRes.data || [];
      const ownedBeatMap = new Map<string, string>();
      ownedBeats.forEach((b: any) => ownedBeatMap.set(b.beat_id, b.beat_name));

      // Map retailer→beat for visit aggregation
      const beatIdsForRet = new Set<string>(ownedBeats.map((b: any) => b.beat_id));
      (plansRes.data || []).forEach((p: any) => beatIdsForRet.add(p.beat_id));

      const { data: retailers = [] } = await supabase
        .from("retailers")
        .select("id, beat_id")
        .in("beat_id", Array.from(beatIdsForRet).slice(0, 500));
      const retailerToBeat = new Map<string, string>();
      const beatRetailerCount = new Map<string, number>();
      (retailers || []).forEach((r: any) => {
        retailerToBeat.set(r.id, r.beat_id);
        beatRetailerCount.set(r.beat_id, (beatRetailerCount.get(r.beat_id) || 0) + 1);
      });

      // Aggregate visits → date+beat → count
      const visitsByDateBeat = new Map<string, Set<string>>();
      (visitsRes.data || []).forEach((v: any) => {
        const beat = retailerToBeat.get(v.retailer_id);
        if (!beat) return;
        const key = `${v.planned_date}|${beat}`;
        if (!visitsByDateBeat.has(key)) visitsByDateBeat.set(key, new Set());
        visitsByDateBeat.get(key)!.add(v.retailer_id);
      });

      // Leave dates
      const leaveDates = new Set<string>();
      (leavesRes.data || []).forEach((l: any) => {
        const d = new Date(l.start_date);
        const e = new Date(l.end_date);
        while (d <= e) { leaveDates.add(format(d, "yyyy-MM-dd")); d.setDate(d.getDate() + 1); }
      });

      const byDate: Record<string, DayBeatChip[]> = {};
      const pushChip = (date: string, chip: DayBeatChip) => {
        if (!byDate[date]) byDate[date] = [];
        if (!byDate[date].some((c) => c.beat_id === chip.beat_id)) byDate[date].push(chip);
      };

      // From plans
      (plansRes.data || []).forEach((p: any) => {
        const visitedKey = `${p.plan_date}|${p.beat_id}`;
        const visited = visitsByDateBeat.get(visitedKey);
        const onLeave = leaveDates.has(p.plan_date);
        const status: DayBeatChip["status"] = onLeave
          ? "uncovered"
          : visited && visited.size > 0
            ? "served"
            : p.assignment_type === "split"
              ? "shared"
              : "assigned";
        pushChip(p.plan_date, {
          beat_id: p.beat_id,
          beat_name: ownedBeatMap.get(p.beat_id) || p.beat_id,
          status,
          assignment_type: p.assignment_type,
          retailer_count: beatRetailerCount.get(p.beat_id) || 0,
        });
      });

      return { byDate, leaveDates };
    },
  });
}
