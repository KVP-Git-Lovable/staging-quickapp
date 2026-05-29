import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

/**
 * Split a list of retailer IDs into AM (first half) / PM (second half)
 * portions based on the rep's historical visit ordering taken from
 * retailer_visit_logs (ordered by start_time).
 *
 * Returns:
 *  - filtered: subset of retailerIds that fall in the requested half
 *  - hasHistory: false if there's no usable history (caller should show
 *    "no route history found — please select manually" and not filter)
 */
export async function applyHalfDayFilter(
  retailerIds: string[],
  repId: string,
  period: "first_half" | "second_half" | string | null,
): Promise<{ filtered: string[]; hasHistory: boolean }> {
  if (!retailerIds.length || !repId || !period) {
    return { filtered: retailerIds, hasHistory: false };
  }

  const { data: history } = await sb
    .from("retailer_visit_logs")
    .select("retailer_id, start_time")
    .eq("user_id", repId)
    .in("retailer_id", retailerIds)
    .order("start_time", { ascending: true })
    .limit(500);

  if (!history?.length) return { filtered: retailerIds, hasHistory: false };

  const positions: Record<string, number[]> = {};
  history.forEach((row: any, i: number) => {
    (positions[row.retailer_id] ||= []).push(i);
  });

  const avg = Object.entries(positions).map(([id, ps]) => ({
    id,
    avg: ps.reduce((a, b) => a + b, 0) / ps.length,
  }));
  avg.sort((a, b) => a.avg - b.avg);
  const ordered = avg.map((x) => x.id);

  // Append any retailers we have no history for at the end (so they fall to PM).
  const seen = new Set(ordered);
  retailerIds.forEach((id) => {
    if (!seen.has(id)) ordered.push(id);
  });

  const mid = Math.floor(ordered.length / 2);
  const slice = period === "first_half" ? ordered.slice(0, mid) : ordered.slice(mid);
  const set = new Set(slice);
  return { filtered: retailerIds.filter((id) => set.has(id)), hasHistory: true };
}
