import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DecliningRetailer {
  id: string;
  name: string;
  recentValue: number;
  priorValue: number;
  dropPct: number;
}

export interface LowYieldRetailer {
  id: string;
  name: string;
  minutes: number;
  orderValue: number;
}

export interface SlowMover {
  id: string;
  name: string;
  value: number;
  quantity: number;
}

export interface CopilotTickerData {
  declining: DecliningRetailer[];
  lowYield: LowYieldRetailer[];
  slowMovers: SlowMover[];
  loading: boolean;
}

type OrderRow = {
  id: string;
  retailer_id: string | null;
  visit_id: string | null;
  total_amount: number | string | null;
  order_date: string | null;
  status: string | null;
};

type VisitRow = {
  id: string;
  retailer_id: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
};

type OrderItemRow = {
  order_id: string;
  product_id: string | null;
  product_name: string | null;
  total: number | string | null;
  quantity: number | string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function useCopilotTicker(): CopilotTickerData {
  const [data, setData] = useState<CopilotTickerData>({
    declining: [],
    lowYield: [],
    slowMovers: [],
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const finish = (next: Partial<CopilotTickerData>) => {
        if (!cancelled) setData({ declining: [], lowYield: [], slowMovers: [], loading: false, ...next });
      };

      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (!user) return finish({});

        const now = new Date();
        const today = isoDate(now);
        const start180 = isoDate(new Date(now.getTime() - 180 * DAY_MS));
        const start90 = isoDate(new Date(now.getTime() - 90 * DAY_MS));
        const start60 = isoDate(new Date(now.getTime() - 60 * DAY_MS));
        const start30 = isoDate(new Date(now.getTime() - 30 * DAY_MS));

        const [ordersRes, visitsRes] = await Promise.all([
          supabase
            .from("orders")
            .select("id, retailer_id, visit_id, total_amount, order_date, status")
            .eq("user_id", user.id)
            .gte("order_date", start180)
            .lte("order_date", today)
            .order("order_date", { ascending: false })
            .limit(4000),
          supabase
            .from("visits")
            .select("id, retailer_id, check_in_time, check_out_time")
            .eq("user_id", user.id)
            .not("check_in_time", "is", null)
            .not("check_out_time", "is", null)
            .gte("planned_date", start90)
            .limit(2000),
        ]);

        if (ordersRes.error) console.error("[copilot] ticker orders", ordersRes.error);
        if (visitsRes.error) console.error("[copilot] ticker visits", visitsRes.error);

        const orders = ((ordersRes.data ?? []) as OrderRow[]).filter(
          (o) => o.status?.toLowerCase() !== "cancelled"
        );
        const visits = (visitsRes.data ?? []) as VisitRow[];

        // ---- Slide 1: declining retailers (last 30d vs prior 30d) ----
        const retailerWindows = new Map<string, { recent: number; prior: number }>();
        for (const o of orders) {
          if (!o.retailer_id || !o.order_date) continue;
          const bucket = retailerWindows.get(o.retailer_id) ?? { recent: 0, prior: 0 };
          if (o.order_date >= start30) bucket.recent += num(o.total_amount);
          else if (o.order_date >= start60) bucket.prior += num(o.total_amount);
          retailerWindows.set(o.retailer_id, bucket);
        }
        const declining = [...retailerWindows.entries()]
          .filter(([, w]) => w.prior > 0 && w.recent < w.prior)
          .map(([id, w]) => ({
            id,
            name: "Retailer",
            recentValue: w.recent,
            priorValue: w.prior,
            dropPct: ((w.prior - w.recent) / w.prior) * 100,
          }))
          .sort((a, b) => b.priorValue - b.recentValue - (a.priorValue - a.recentValue))
          .slice(0, 5);

        // ---- Slide 2: high time spent, low order value ----
        const orderValueByVisit = new Map<string, number>();
        for (const o of orders) {
          if (!o.visit_id) continue;
          orderValueByVisit.set(o.visit_id, (orderValueByVisit.get(o.visit_id) ?? 0) + num(o.total_amount));
        }
        const retailerVisitStats = new Map<string, { minutes: number; orderValue: number }>();
        for (const v of visits) {
          if (!v.retailer_id || !v.check_in_time || !v.check_out_time) continue;
          const mins = (new Date(v.check_out_time).getTime() - new Date(v.check_in_time).getTime()) / 60000;
          if (!Number.isFinite(mins) || mins <= 0 || mins > 8 * 60) continue;
          const stat = retailerVisitStats.get(v.retailer_id) ?? { minutes: 0, orderValue: 0 };
          stat.minutes += mins;
          stat.orderValue += orderValueByVisit.get(v.id) ?? 0;
          retailerVisitStats.set(v.retailer_id, stat);
        }
        const lowYield = [...retailerVisitStats.entries()]
          .map(([id, s]) => ({ id, name: "Retailer", minutes: Math.round(s.minutes), orderValue: s.orderValue }))
          .sort((a, b) => {
            const ra = a.orderValue / Math.max(a.minutes, 1);
            const rb = b.orderValue / Math.max(b.minutes, 1);
            if (ra !== rb) return ra - rb;
            return b.minutes - a.minutes;
          })
          .filter((r) => r.minutes >= 5)
          .slice(0, 5);

        // ---- Slide 3: slow moving products (last 90 days) ----
        const recentOrderIds = orders
          .filter((o) => (o.order_date ?? "") >= start90)
          .map((o) => o.id)
          .slice(0, 800);

        let slowMovers: SlowMover[] = [];
        if (recentOrderIds.length) {
          const { data: itemRows, error: itemErr } = await supabase
            .from("order_items")
            .select("order_id, product_id, product_name, total, quantity")
            .in("order_id", recentOrderIds)
            .limit(5000);
          if (itemErr) console.error("[copilot] ticker order_items", itemErr);
          const productTotals = new Map<string, { name: string; value: number; quantity: number }>();
          for (const item of (itemRows ?? []) as OrderItemRow[]) {
            const key = item.product_id ?? item.product_name ?? "";
            if (!key) continue;
            const entry = productTotals.get(key) ?? {
              name: item.product_name || "Product",
              value: 0,
              quantity: 0,
            };
            entry.value += num(item.total);
            entry.quantity += num(item.quantity);
            productTotals.set(key, entry);
          }
          slowMovers = [...productTotals.entries()]
            .map(([id, p]) => ({ id, name: p.name, value: p.value, quantity: p.quantity }))
            .sort((a, b) => a.value - b.value || a.quantity - b.quantity)
            .slice(0, 3);
        }

        // ---- Resolve retailer names ----
        const retailerIds = [...new Set([...declining.map((r) => r.id), ...lowYield.map((r) => r.id)])];
        if (retailerIds.length) {
          const { data: retailers, error: retErr } = await supabase
            .from("retailers")
            .select("id, name")
            .in("id", retailerIds);
          if (retErr) console.error("[copilot] ticker retailers", retErr);
          const names = new Map((retailers ?? []).map((r: any) => [r.id, r.name || "Retailer"]));
          for (const r of declining) r.name = names.get(r.id) ?? "Retailer";
          for (const r of lowYield) r.name = names.get(r.id) ?? "Retailer";
        }

        finish({ declining, lowYield, slowMovers });
      } catch (error) {
        console.error("[copilot] ticker failed", error);
        finish({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}
