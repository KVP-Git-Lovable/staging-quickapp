import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export interface RepWorkload {
  ownCount: number;
  coverCount: number;
}

/**
 * Workload (own retailers + leave-cover retailers) for a list of reps on a given date.
 * Used by the LeaveCoverage tab to warn when a cover assignment would push a rep
 * past a comfortable daily load.
 */
export function useRepWorkloadToday(repIds: string[], date: string) {
  return useQuery({
    queryKey: ["rep-workload-today", date, [...repIds].sort().join(",")],
    enabled: repIds.length > 0,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const out: Record<string, RepWorkload> = {};
      repIds.forEach((id) => (out[id] = { ownCount: 0, coverCount: 0 }));

      // Daily plans first
      const { data: dra } = await sb
        .from("daily_retailer_assignments")
        .select("assigned_to, assignment_type")
        .eq("plan_date", date)
        .in("assigned_to", repIds);

      const sawDaily = new Set<string>();
      (dra || []).forEach((r: any) => {
        sawDaily.add(r.assigned_to);
        if (r.assignment_type === "leave_sub") out[r.assigned_to].coverCount += 1;
        else out[r.assigned_to].ownCount += 1;
      });

      // Fallback: permanent ownership for reps with no daily plan rows
      const fallbackIds = repIds.filter((id) => !sawDaily.has(id));
      if (fallbackIds.length > 0) {
        const { data: rs } = await supabase
          .from("retailers")
          .select("user_id")
          .in("user_id", fallbackIds);
        (rs || []).forEach((r: any) => {
          if (out[r.user_id]) out[r.user_id].ownCount += 1;
        });
      }

      return out;
    },
  });
}
