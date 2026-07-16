import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RetailerInsight {
  id: string;
  name: string;
  orderCount: number;
  orderValue: number;
}

export interface UserInsight {
  id: string;
  name: string;
  orderCount: number;
  orderValue: number;
}

export interface VisitInsight {
  id: string;
  retailerName: string;
  date: string;
  orderCount: number;
  orderValue: number;
}

interface CopilotInsights {
  topRetailers: RetailerInsight[];
  topUser: UserInsight | null;
  topVisit: VisitInsight | null;
  loading: boolean;
}

type OrderRow = {
  retailer_id: string | null;
  user_id: string | null;
  visit_id: string | null;
  total_amount: number | string | null;
  order_date: string | null;
  status: string | null;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function useCopilotInsights(): CopilotInsights {
  const [insights, setInsights] = useState<CopilotInsights>({
    topRetailers: [],
    topUser: null,
    topVisit: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setInsights((current) => ({ ...current, loading: false }));
        return;
      }

      const now = new Date();
      const today = isoDate(now);
      const calendarYearStart = `${now.getFullYear()}-01-01`;
      const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      const financialYearStart = `${fyYear}-04-01`;
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      const quarterStart = isoDate(new Date(Date.UTC(now.getFullYear(), quarterMonth, 1)));
      const queryStart = calendarYearStart < financialYearStart ? calendarYearStart : financialYearStart;

      const { data, error } = await supabase
        .from("orders")
        .select("retailer_id, user_id, visit_id, total_amount, order_date, status")
        .gte("order_date", queryStart)
        .lte("order_date", today)
        .order("order_date", { ascending: false })
        .limit(5000);

      if (error) {
        console.error("[copilot] insights orders", error);
        if (!cancelled) setInsights((current) => ({ ...current, loading: false }));
        return;
      }

      const orders = ((data ?? []) as OrderRow[]).filter((order) =>
        order.status?.toLowerCase() !== "cancelled"
      );
      const retailerTotals = new Map<string, { orderCount: number; orderValue: number }>();
      const userTotals = new Map<string, { orderCount: number; orderValue: number }>();
      const visitTotals = new Map<string, { retailerId: string | null; date: string; orderCount: number; orderValue: number }>();

      for (const order of orders) {
        const value = Number(order.total_amount ?? 0);
        const date = order.order_date ?? "";

        if (order.retailer_id && date >= financialYearStart) {
          const total = retailerTotals.get(order.retailer_id) ?? { orderCount: 0, orderValue: 0 };
          total.orderCount += 1;
          total.orderValue += Number.isFinite(value) ? value : 0;
          retailerTotals.set(order.retailer_id, total);
        }

        if (order.user_id && date >= quarterStart) {
          const total = userTotals.get(order.user_id) ?? { orderCount: 0, orderValue: 0 };
          total.orderCount += 1;
          total.orderValue += Number.isFinite(value) ? value : 0;
          userTotals.set(order.user_id, total);
        }

        if (order.user_id === user.id && order.visit_id && date >= calendarYearStart) {
          const total = visitTotals.get(order.visit_id) ?? {
            retailerId: order.retailer_id,
            date,
            orderCount: 0,
            orderValue: 0,
          };
          total.orderCount += 1;
          total.orderValue += Number.isFinite(value) ? value : 0;
          if (date > total.date) total.date = date;
          if (!total.retailerId && order.retailer_id) total.retailerId = order.retailer_id;
          visitTotals.set(order.visit_id, total);
        }
      }

      const rankedRetailers = [...retailerTotals.entries()]
        .sort((a, b) => b[1].orderValue - a[1].orderValue)
        .slice(0, 2);
      const rankedUsers = [...userTotals.entries()]
        .sort((a, b) => b[1].orderCount - a[1].orderCount || b[1].orderValue - a[1].orderValue);
      const rankedVisits = [...visitTotals.entries()]
        .sort((a, b) => b[1].orderValue - a[1].orderValue || b[1].orderCount - a[1].orderCount);

      const retailerIds = [...new Set([
        ...rankedRetailers.map(([id]) => id),
        ...rankedVisits.slice(0, 1).map(([, total]) => total.retailerId).filter(Boolean),
      ])] as string[];
      const userIds = rankedUsers.slice(0, 1).map(([id]) => id);

      const [retailerResult, profileResult] = await Promise.all([
        retailerIds.length
          ? supabase.from("retailers").select("id, name").in("id", retailerIds)
          : Promise.resolve({ data: [], error: null }),
        userIds.length
          ? supabase.from("profiles").select("id, full_name").in("id", userIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (retailerResult.error) console.error("[copilot] insights retailers", retailerResult.error);
      if (profileResult.error) console.error("[copilot] insights profiles", profileResult.error);
      const retailerNames = new Map((retailerResult.data ?? []).map((row: any) => [row.id, row.name || "Retailer"]));
      const profileNames = new Map((profileResult.data ?? []).map((row: any) => [row.id, row.full_name || "Team member"]));

      const topRetailers = rankedRetailers.map(([id, total]) => ({
        id,
        name: retailerNames.get(id) ?? "Retailer",
        ...total,
      }));
      const topUserEntry = rankedUsers[0];
      const topVisitEntry = rankedVisits[0];

      if (!cancelled) {
        setInsights({
          topRetailers,
          topUser: topUserEntry ? {
            id: topUserEntry[0],
            name: profileNames.get(topUserEntry[0]) ?? (topUserEntry[0] === user.id ? "You" : "Team member"),
            ...topUserEntry[1],
          } : null,
          topVisit: topVisitEntry ? {
            id: topVisitEntry[0],
            retailerName: topVisitEntry[1].retailerId
              ? retailerNames.get(topVisitEntry[1].retailerId) ?? "Retailer"
              : "Retailer",
            date: topVisitEntry[1].date,
            orderCount: topVisitEntry[1].orderCount,
            orderValue: topVisitEntry[1].orderValue,
          } : null,
          loading: false,
        });
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return insights;
}