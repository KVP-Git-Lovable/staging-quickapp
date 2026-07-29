import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TodayVisitRetailer {
  id: string;
  name: string;
  beat: string | null;
  status: string | null;
  minutes: number | null;
}

export function useTodaysVisitRetailers() {
  const [rows, setRows] = useState<TodayVisitRetailer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth.user?.id;
        if (!userId) {
          if (!cancelled) { setRows([]); setLoading(false); }
          return;
        }
        const today = new Date().toISOString().slice(0, 10);
        const { data: visits } = await supabase
          .from("visits")
          .select("id, retailer_id, status, check_in_time, check_out_time")
          .eq("user_id", userId)
          .eq("planned_date", today)
          .order("created_at", { ascending: true })
          .limit(100);

        const ids = [...new Set((visits ?? []).map((v: any) => v.retailer_id).filter(Boolean))];
        let nameMap = new Map<string, any>();
        if (ids.length) {
          const { data: retailers } = await supabase
            .from("retailers")
            .select("id, name, beat_name")
            .in("id", ids as string[]);
          nameMap = new Map((retailers ?? []).map((r: any) => [r.id, r]));
        }

        const mapped: TodayVisitRetailer[] = (visits ?? []).map((v: any) => {
          let minutes: number | null = null;
          if (v.check_in_time && v.check_out_time) {
            const diff =
              (new Date(v.check_out_time).getTime() - new Date(v.check_in_time).getTime()) / 60000;
            minutes = Number.isFinite(diff) && diff > 0 ? Math.round(diff) : null;
          }
          return {
            id: String(v.id),
            name: String(nameMap.get(v.retailer_id)?.name ?? "Retailer"),
            beat: nameMap.get(v.retailer_id)?.beat_name ?? null,
            status: v.status ?? null,
            minutes,
          };
        });

        if (!cancelled) { setRows(mapped); setLoading(false); }
      } catch {
        if (!cancelled) { setRows([]); setLoading(false); }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return { rows, loading };
}
