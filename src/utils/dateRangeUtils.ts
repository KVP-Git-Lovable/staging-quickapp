import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

/**
 * Generate dates between start and end (inclusive) restricted to allowed weekdays.
 * weekdays uses JS day numbers (0 = Sun … 6 = Sat). Default Mon–Sat.
 */
export function generateDateRange(
  start: string,
  end: string,
  weekdays: number[] = [1, 2, 3, 4, 5, 6],
): string[] {
  if (!start || !end || end < start) return start ? [start] : [];
  const out: string[] = [];
  const cur = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (cur <= last) {
    if (weekdays.includes(cur.getDay())) {
      out.push(format(cur, "yyyy-MM-dd"));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export interface AssignmentConflict {
  type: "already_assigned" | "self_planned";
  date: string;
  beat_id: string;
  message: string;
}

/**
 * Detect whether the proposed (beats × dates × rep) would clash with:
 *  - daily_beat_plans rows for a DIFFERENT rep (already-assigned)
 *  - the rep's own beat_plans rows for the same date+beat
 */
export async function detectConflicts(
  beatIds: string[],
  repId: string,
  dates: string[],
): Promise<AssignmentConflict[]> {
  if (!beatIds.length || !repId || !dates.length) return [];

  const [existingRes, selfRes] = await Promise.all([
    sb
      .from("daily_beat_plans")
      .select("plan_date, beat_id, assigned_user_id, status")
      .in("beat_id", beatIds)
      .in("plan_date", dates)
      .neq("assigned_user_id", repId)
      .eq("status", "active"),
    sb
      .from("beat_plans")
      .select("plan_date, beat_id, beat_name")
      .eq("user_id", repId)
      .in("plan_date", dates)
      .in("beat_id", beatIds),
  ]);

  const existing = (existingRes.data || []) as any[];
  const otherRepIds = Array.from(new Set(existing.map((r) => r.assigned_user_id)));
  const nameById = new Map<string, string>();
  if (otherRepIds.length) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", otherRepIds);
    (data || []).forEach((p: any) => nameById.set(p.id, p.full_name));
  }

  const conflicts: AssignmentConflict[] = [];
  existing.forEach((r) => {
    conflicts.push({
      type: "already_assigned",
      date: r.plan_date,
      beat_id: r.beat_id,
      message: `${r.plan_date}: beat already assigned to ${nameById.get(r.assigned_user_id) || "another rep"}`,
    });
  });
  (selfRes.data || []).forEach((r: any) => {
    conflicts.push({
      type: "self_planned",
      date: r.plan_date,
      beat_id: r.beat_id,
      message: `${r.plan_date}: rep self-planned ${r.beat_name || r.beat_id}`,
    });
  });
  return conflicts;
}
