import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format, eachDayOfInterval } from "date-fns";

const sb = supabase as any;

export type DayBeatStatus =
  | "served"
  | "in_progress"
  | "assigned"
  | "uncovered"
  | "shared"
  | "missed"
  | "partial"
  | "unplanned";

export interface DayBeat {
  beat_id: string;
  beat_name: string;
  status: DayBeatStatus;
  assignment_type?: string | null;
  retailer_count: number;
  last_served: string | null;
  source: "daily" | "permanent";
}

export interface CalendarData {
  byDate: Record<string, DayBeat[]>;
  leaveDates: Set<string>;
  beatRetailerCount: Record<string, number>;
  lastServedByBeat: Record<string, string | null>;
  // Beat name lookup for any beat we discovered
  beatNameById: Record<string, string>;
}

export function useCalendarData(repId: string | null, monthAnchor: Date) {
  const monthKey = format(monthAnchor, "yyyy-MM");
  return useQuery<CalendarData>({
    queryKey: ["calendarData", repId, monthKey],
    enabled: !!repId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!repId) {
        return {
          byDate: {},
          leaveDates: new Set(),
          beatRetailerCount: {},
          lastServedByBeat: {},
          beatNameById: {},
        };
      }
      const start = format(startOfMonth(monthAnchor), "yyyy-MM-dd");
      const end = format(endOfMonth(monthAnchor), "yyyy-MM-dd");

      const [dailyRes, beatPlansRes, ownedBeatsRes, leavesRes, visitsRes, sharedAccessRes] =
        await Promise.all([
          sb
            .from("daily_beat_plans")
            .select("plan_date, beat_id, assignment_type, assigned_user_id")
            .eq("assigned_user_id", repId)
            .gte("plan_date", start)
            .lte("plan_date", end),
          sb
            .from("beat_plans")
            .select("plan_date, beat_id")
            .eq("user_id", repId)
            .gte("plan_date", start)
            .lte("plan_date", end),
          supabase
            .from("beats")
            .select("beat_id, beat_name, owner_id, is_active")
            .eq("is_active", true)
            .eq("owner_id", repId),
          sb
            .from("leave_applications")
            .select("user_id, start_date, end_date, status")
            .eq("user_id", repId)
            .eq("status", "approved")
            .lte("start_date", end)
            .gte("end_date", start),
          supabase
            .from("visits")
            .select("planned_date, retailer_id, status")
            .eq("user_id", repId)
            .gte("planned_date", start)
            .lte("planned_date", end),
          sb
            .from("beat_user_access")
            .select("beat_id, access_type, effective_from, effective_to")
            .eq("user_id", repId)
            .eq("is_active", true)
            .lte("effective_from", end)
            .or(`effective_to.is.null,effective_to.gte.${start}`),
        ]);

      // Beat universe = owned + planned (daily + permanent)
      const beatNameById: Record<string, string> = {};
      (ownedBeatsRes.data || []).forEach((b: any) => {
        beatNameById[b.beat_id] = b.beat_name;
      });
      const allBeatIds = new Set<string>(Object.keys(beatNameById));
      (dailyRes.data || []).forEach((p: any) => allBeatIds.add(p.beat_id));
      (beatPlansRes.data || []).forEach((p: any) => allBeatIds.add(p.beat_id));
      (sharedAccessRes.data || []).forEach((a: any) => allBeatIds.add(a.beat_id));

      // Fetch missing beat names
      const missing = Array.from(allBeatIds).filter((id) => !beatNameById[id]);
      if (missing.length) {
        const { data: more } = await supabase
          .from("beats")
          .select("beat_id, beat_name")
          .in("beat_id", missing);
        (more || []).forEach((b: any) => (beatNameById[b.beat_id] = b.beat_name));
      }

      // Retailer counts + last-served per beat
      const beatRetailerCount: Record<string, number> = {};
      const lastServedByBeat: Record<string, string | null> = {};
      const retailerToBeat = new Map<string, string>();

      if (allBeatIds.size > 0) {
        const ids = Array.from(allBeatIds);
        const { data: retailers } = await supabase
          .from("retailers")
          .select("id, beat_id")
          .in("beat_id", ids);
        (retailers || []).forEach((r: any) => {
          retailerToBeat.set(r.id, r.beat_id);
          beatRetailerCount[r.beat_id] = (beatRetailerCount[r.beat_id] || 0) + 1;
        });

        // Last served — single query: max visit_date per retailer (then collapse)
        const retailerIds = (retailers || []).map((r: any) => r.id);
        if (retailerIds.length) {
          const { data: lastVisits } = await sb
            .from("retailer_visit_logs")
            .select("retailer_id, visit_date")
            .in("retailer_id", retailerIds)
            .order("visit_date", { ascending: false })
            .limit(retailerIds.length * 2);
          (lastVisits || []).forEach((v: any) => {
            const beat = retailerToBeat.get(v.retailer_id);
            if (!beat) return;
            const cur = lastServedByBeat[beat];
            if (!cur || v.visit_date > cur) lastServedByBeat[beat] = v.visit_date;
          });
        }
        ids.forEach((b) => {
          if (!(b in lastServedByBeat)) lastServedByBeat[b] = null;
        });
      }

      // Visits this month — derive completed/total per (date, beat)
      const visitsKey = (d: string, b: string) => `${d}|${b}`;
      const totalByKey = new Map<string, number>();
      const completedByKey = new Map<string, number>();
      (visitsRes.data || []).forEach((v: any) => {
        const beat = retailerToBeat.get(v.retailer_id);
        if (!beat) return;
        const k = visitsKey(v.planned_date, beat);
        totalByKey.set(k, (totalByKey.get(k) || 0) + 1);
        if (v.status === "completed") {
          completedByKey.set(k, (completedByKey.get(k) || 0) + 1);
        }
      });

      // Leave dates
      const leaveDates = new Set<string>();
      (leavesRes.data || []).forEach((l: any) => {
        const d = new Date(l.start_date + "T00:00:00");
        const e = new Date(l.end_date + "T00:00:00");
        while (d <= e) {
          leaveDates.add(format(d, "yyyy-MM-dd"));
          d.setDate(d.getDate() + 1);
        }
      });

      const byDate: Record<string, DayBeat[]> = {};
      const push = (date: string, chip: DayBeat) => {
        if (!byDate[date]) byDate[date] = [];
        if (!byDate[date].some((c) => c.beat_id === chip.beat_id))
          byDate[date].push(chip);
      };

      const deriveStatus = (
        date: string,
        beatId: string,
        assignmentType: string | null,
        hasDaily: boolean,
        hasPermanent: boolean,
      ): DayBeatStatus => {
        const k = visitsKey(date, beatId);
        const total = totalByKey.get(k) || 0;
        const completed = completedByKey.get(k) || 0;
        const onLeave = leaveDates.has(date);
        if (onLeave && !hasDaily) return "uncovered";
        if (assignmentType === "split") return "shared";
        if (completed > 0 && completed === total) return "served";
        if (completed > 0) return "in_progress";
        if (hasDaily || hasPermanent) return "assigned";
        return "unplanned";
      };

      (dailyRes.data || []).forEach((p: any) => {
        push(p.plan_date, {
          beat_id: p.beat_id,
          beat_name: beatNameById[p.beat_id] || p.beat_id,
          status: deriveStatus(p.plan_date, p.beat_id, p.assignment_type, true, false),
          assignment_type: p.assignment_type,
          retailer_count: beatRetailerCount[p.beat_id] || 0,
          last_served: lastServedByBeat[p.beat_id] ?? null,
          source: "daily",
        });
      });

      (beatPlansRes.data || []).forEach((p: any) => {
        push(p.plan_date, {
          beat_id: p.beat_id,
          beat_name: beatNameById[p.beat_id] || p.beat_id,
          status: deriveStatus(p.plan_date, p.beat_id, null, false, true),
          retailer_count: beatRetailerCount[p.beat_id] || 0,
          last_served: lastServedByBeat[p.beat_id] ?? null,
          source: "permanent",
        });
      });

      // Shared beats — render across every applicable day in the visible month
      const monthDays = eachDayOfInterval({
        start: startOfMonth(monthAnchor),
        end: endOfMonth(monthAnchor),
      }).map((d) => format(d, "yyyy-MM-dd"));
      (sharedAccessRes.data || []).forEach((access: any) => {
        const from = access.effective_from || start;
        const to = access.effective_to ? access.effective_to.slice(0, 10) : end;
        monthDays.forEach((dateStr) => {
          if (dateStr < from || dateStr > to) return;
          push(dateStr, {
            beat_id: access.beat_id,
            beat_name: beatNameById[access.beat_id] || access.beat_id,
            status: "shared",
            assignment_type: access.access_type,
            retailer_count: beatRetailerCount[access.beat_id] || 0,
            last_served: lastServedByBeat[access.beat_id] ?? null,
            source: "permanent",
          });
        });
      });

      return {
        byDate,
        leaveDates,
        beatRetailerCount,
        lastServedByBeat,
        beatNameById,
      };
    },
  });
}
