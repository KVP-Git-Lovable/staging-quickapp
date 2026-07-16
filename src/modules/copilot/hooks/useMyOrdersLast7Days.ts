import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DailyOrderPoint {
  date: string; // YYYY-MM-DD
  label: string; // dd MMM
  kg: number;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function shortLabel(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function useMyOrdersLast7Days() {
  const [data, setData] = useState<DailyOrderPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setLoading(false); return; }

      const now = new Date();
      const days: DailyOrderPoint[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        days.push({ date: isoDate(d), label: shortLabel(d), kg: 0 });
      }
      const startDate = days[0].date;
      const endDate = days[days.length - 1].date;

      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, order_date, status")
        .eq("user_id", user.id)
        .gte("order_date", startDate)
        .lte("order_date", endDate)
        .limit(2000);
      if (error) { console.error("[copilot] orders7d", error); if (!cancelled) setLoading(false); return; }

      const activeOrders = (orders ?? []).filter((o: any) => (o.status ?? "").toLowerCase() !== "cancelled");
      const orderIds = activeOrders.map((o: any) => o.id);
      const orderDateMap = new Map(activeOrders.map((o: any) => [o.id, o.order_date as string]));

      if (orderIds.length) {
        const { data: items, error: itemsErr } = await supabase
          .from("order_items")
          .select("order_id, quantity, conversion_to_base")
          .in("order_id", orderIds);
        if (itemsErr) console.error("[copilot] order_items7d", itemsErr);
        for (const it of items ?? []) {
          const date = orderDateMap.get((it as any).order_id);
          if (!date) continue;
          const bucket = days.find((d) => d.date === date);
          if (!bucket) continue;
          const qty = Number((it as any).quantity ?? 0);
          const conv = Number((it as any).conversion_to_base ?? 1) || 1;
          bucket.kg += qty * conv;
        }
      }

      for (const d of days) d.kg = Math.round(d.kg * 100) / 100;
      if (!cancelled) { setData(days); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  return { data, loading };
}
