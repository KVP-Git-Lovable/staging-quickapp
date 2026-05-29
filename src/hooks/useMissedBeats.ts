import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addDays, format, parseISO, differenceInCalendarDays } from "date-fns";

const sb = supabase as any;

export const MAX_AUTO_RESCHEDULE_DAYS = 14;
export const MISSED_LOOKBACK_DAYS = 30;
export const FORWARD_LOOKAHEAD_DAYS = 30;

export interface MissedBeat {
  rep_id: string;
  rep_name: string;
  beat_id: string;
  beat_name: string;
  missed_date: string;
  age_days: number;
  source: "daily" | "permanent";
  /** suggested next available date or null if too old / none found */
  suggested_date: string | null;
  too_old: boolean;
}

interface RepInfo {
  id: string;
  full_name: string;
}

interface Args {
  reps: RepInfo[];
  /** When provided, restricts results to a single rep. */
  scopedRepId?: string | null;
  enabled?: boolean;
}

const todayStr = () => format(new Date(), "yyyy-MM-dd");

export function useMissedBeats({ reps, scopedRepId, enabled = true }: Args) {
  const repIds = (scopedRepId ? reps.filter((r) => r.id === scopedRepId) : reps).map((r) => r.id);
  const repNameById = Object.fromEntries(reps.map((r) => [r.id, r.full_name]));

  return useQuery<MissedBeat[]>({
    queryKey: ["missed-beats", repIds.sort().join(",")],
    enabled: enabled && repIds.length > 0,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const today = todayStr();
      const start = format(addDays(new Date(), -MISSED_LOOKBACK_DAYS), "yyyy-MM-dd");
      const fwdEnd = format(addDays(new Date(), FORWARD_LOOKAHEAD_DAYS), "yyyy-MM-dd");

      // 1. Past plans (daily + permanent) for these reps
      const [dailyPastRes, permPastRes, dailyFwdRes, permFwdRes, leavesRes] = await Promise.all([
        sb
          .from("daily_beat_plans")
          .select("plan_date, beat_id, assigned_user_id")
          .in("assigned_user_id", repIds)
          .gte("plan_date", start)
          .lt("plan_date", today)
          .eq("status", "active"),
        sb
          .from("beat_plans")
          .select("plan_date, beat_id, user_id")
          .in("user_id", repIds)
          .gte("plan_date", start)
          .lt("plan_date", today),
        sb
          .from("daily_beat_plans")
          .select("plan_date, beat_id, assigned_user_id")
          .in("assigned_user_id", repIds)
          .gte("plan_date", today)
          .lte("plan_date", fwdEnd)
          .eq("status", "active"),
        sb
          .from("beat_plans")
          .select("plan_date, beat_id, user_id")
          .in("user_id", repIds)
          .gte("plan_date", today)
          .lte("plan_date", fwdEnd),
        sb
          .from("leave_applications")
          .select("user_id, start_date, end_date, status")
          .in("user_id", repIds)
          .eq("status", "approved")
          .lte("start_date", fwdEnd)
          .gte("end_date", start),
      ]);

      type Plan = { rep_id: string; beat_id: string; date: string; source: "daily" | "permanent" };
      const past: Plan[] = [];
      (dailyPastRes.data || []).forEach((p: any) =>
        past.push({ rep_id: p.assigned_user_id, beat_id: p.beat_id, date: p.plan_date, source: "daily" }),
      );
      (permPastRes.data || []).forEach((p: any) =>
        past.push({ rep_id: p.user_id, beat_id: p.beat_id, date: p.plan_date, source: "permanent" }),
      );
      if (past.length === 0) return [];

      // dedupe (rep|beat|date)
      const dedup = new Map<string, Plan>();
      past.forEach((p) => {
        const k = `${p.rep_id}|${p.beat_id}|${p.date}`;
        if (!dedup.has(k)) dedup.set(k, p);
      });
      const planList = Array.from(dedup.values());

      // 2. Beat names + retailers
      const beatIds = Array.from(new Set(planList.map((p) => p.beat_id)));
      const [beatsRes, retailersRes] = await Promise.all([
        supabase.from("beats").select("beat_id, beat_name").in("beat_id", beatIds),
        supabase.from("retailers").select("id, beat_id").in("beat_id", beatIds),
      ]);
      const beatNameById: Record<string, string> = {};
      (beatsRes.data || []).forEach((b: any) => (beatNameById[b.beat_id] = b.beat_name));
      const retailersByBeat = new Map<string, string[]>();
      (retailersRes.data || []).forEach((r: any) => {
        const arr = retailersByBeat.get(r.beat_id) || [];
        arr.push(r.id);
        retailersByBeat.set(r.beat_id, arr);
      });

      // 3. Completed visits in window for these reps
      const allRetailerIds = Array.from(new Set(Array.from(retailersByBeat.values()).flat()));
      const completed = new Set<string>(); // key rep|date|retailer
      if (allRetailerIds.length) {
        const { data: visits } = await supabase
          .from("visits")
          .select("user_id, planned_date, retailer_id, status")
          .in("user_id", repIds)
          .in("retailer_id", allRetailerIds)
          .eq("status", "completed")
          .gte("planned_date", start)
          .lt("planned_date", today);
        (visits || []).forEach((v: any) =>
          completed.add(`${v.user_id}|${v.planned_date}|${v.retailer_id}`),
        );
      }

      // 4. Determine missed: zero completed visits across this beat's retailers
      const missed: Plan[] = planList.filter((p) => {
        const rids = retailersByBeat.get(p.beat_id) || [];
        if (rids.length === 0) return true; // planned but no retailers — still counts as missed
        return !rids.some((rid) => completed.has(`${p.rep_id}|${p.date}|${rid}`));
      });

      // 5. Build leave date sets per rep
      const leaveByRep = new Map<string, Set<string>>();
      (leavesRes.data || []).forEach((l: any) => {
        const set = leaveByRep.get(l.user_id) || new Set<string>();
        const d = new Date(l.start_date + "T00:00:00");
        const e = new Date(l.end_date + "T00:00:00");
        while (d <= e) {
          set.add(format(d, "yyyy-MM-dd"));
          d.setDate(d.getDate() + 1);
        }
        leaveByRep.set(l.user_id, set);
      });

      // 6. Build planned-set (rep|beat|date) for forward window
      const plannedFwd = new Set<string>();
      (dailyFwdRes.data || []).forEach((p: any) =>
        plannedFwd.add(`${p.assigned_user_id}|${p.beat_id}|${p.plan_date}`),
      );
      (permFwdRes.data || []).forEach((p: any) =>
        plannedFwd.add(`${p.user_id}|${p.beat_id}|${p.plan_date}`),
      );
      // include past missed entries that we're now considering — avoid suggesting same rep+beat+date twice
      planList.forEach((p) =>
        plannedFwd.add(`${p.rep_id}|${p.beat_id}|${p.date}`),
      );

      const today0 = new Date(today + "T00:00:00");

      const suggestNext = (rep: string, beat: string): string | null => {
        const leaves = leaveByRep.get(rep) || new Set();
        const d = new Date(today0);
        for (let i = 0; i < FORWARD_LOOKAHEAD_DAYS; i++) {
          const key = format(d, "yyyy-MM-dd");
          const isSunday = d.getDay() === 0;
          const planKey = `${rep}|${beat}|${key}`;
          if (!isSunday && !leaves.has(key) && !plannedFwd.has(planKey)) return key;
          d.setDate(d.getDate() + 1);
        }
        return null;
      };

      const result: MissedBeat[] = missed.map((p) => {
        const age = differenceInCalendarDays(today0, parseISO(p.date));
        const tooOld = age > MAX_AUTO_RESCHEDULE_DAYS;
        return {
          rep_id: p.rep_id,
          rep_name: repNameById[p.rep_id] || "—",
          beat_id: p.beat_id,
          beat_name: beatNameById[p.beat_id] || p.beat_id,
          missed_date: p.date,
          age_days: age,
          source: p.source,
          suggested_date: tooOld ? null : suggestNext(p.rep_id, p.beat_id),
          too_old: tooOld,
        };
      });

      // Sort: newest missed first within each rep
      result.sort((a, b) => {
        if (a.rep_name !== b.rep_name) return a.rep_name.localeCompare(b.rep_name);
        return b.missed_date.localeCompare(a.missed_date);
      });
      return result;
    },
  });
}
