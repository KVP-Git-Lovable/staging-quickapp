import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export interface CreditOrder {
  id: string;
  order_number: string | null;
  order_date: string | null;
  total_amount: number;
  credit_paid_amount: number;
  credit_pending_amount: number;
  payment_status: string | null;
  created_at: string;
  /** Amount that was actually placed on credit when the order was created
   *  (excludes any cash/UPI/etc. paid at the cart). */
  original_credit_amount: number;
  /** Sum of collections (Mark Payment Received) applied to this order after creation. */
  collected_after_order: number;
  /** Amount paid at the cart at order-creation time (credit_paid_amount minus collected_after_order). */
  paid_at_order_time: number;
}

export interface CollectionRow {
  id: string;
  created_at: string;
  amount: number;
  payment_method: string | null;
  payment_proof_url: string | null;
  collected_by_user_id: string | null;
  revenue_owner_id: string | null;
  collected_by_name?: string | null;
}

export interface AllocationRow {
  id: string;
  collection_id: string;
  order_id: string;
  amount_applied: number;
  applied_at: string;
}

export interface CreditHistoryKPIs {
  totalCreditTaken: number;
  totalCleared: number;
  currentPending: number;
  avgDaysToClear: number | null;
}

export interface RetailerCreditHistory {
  kpis: CreditHistoryKPIs;
  orders: CreditOrder[];
  collections: CollectionRow[];
  allocations: AllocationRow[];
}

export function useRetailerCreditHistory(retailerId: string | null | undefined) {
  return useQuery({
    queryKey: ["retailer-credit-history", retailerId],
    enabled: !!retailerId,
    staleTime: 30_000,
    queryFn: async (): Promise<RetailerCreditHistory> => {
      if (!retailerId) {
        return {
          kpis: { totalCreditTaken: 0, totalCleared: 0, currentPending: 0, avgDaysToClear: null },
          orders: [],
          collections: [],
          allocations: [],
        };
      }

      const [ordersRes, collectionsRes, retailerRes] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, order_number, order_date, total_amount, credit_paid_amount, credit_pending_amount, payment_status, created_at"
          )
          .eq("retailer_id", retailerId)
          .eq("is_credit_order", true)
          .order("order_date", { ascending: false })
          .limit(100),
        sb
          .from("retailer_payment_collections")
          .select(
            "id, created_at, amount, payment_method, payment_proof_url, collected_by_user_id, revenue_owner_id"
          )
          .eq("retailer_id", retailerId)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.from("retailers").select("pending_amount").eq("id", retailerId).maybeSingle(),
      ]);

      const orders = (ordersRes.data || []) as CreditOrder[];
      const collections = (collectionsRes.data || []) as CollectionRow[];

      const collectionIds = collections.map((c) => c.id);
      let allocations: AllocationRow[] = [];
      if (collectionIds.length) {
        const { data } = await sb
          .from("retailer_payment_allocations")
          .select("id, collection_id, order_id, amount_applied, applied_at")
          .in("collection_id", collectionIds);
        allocations = (data || []) as AllocationRow[];
      }

      // Resolve collector names
      const userIds = Array.from(
        new Set(collections.map((c) => c.collected_by_user_id).filter(Boolean))
      ) as string[];
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);
        const byId = new Map((profs || []).map((p: any) => [p.user_id, p.full_name]));
        collections.forEach((c) => {
          c.collected_by_name = c.collected_by_user_id
            ? (byId.get(c.collected_by_user_id) as string) || null
            : null;
        });
      }

      // KPIs
      const totalCreditTaken = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const totalCleared = orders.reduce((s, o) => s + Number(o.credit_paid_amount || 0), 0);
      const currentPending = Number((retailerRes.data as any)?.pending_amount || 0);

      // Avg days to clear: for orders that reached paid status, take max(applied_at) per order
      const lastAppliedByOrder = new Map<string, string>();
      allocations.forEach((a) => {
        const cur = lastAppliedByOrder.get(a.order_id);
        if (!cur || a.applied_at > cur) lastAppliedByOrder.set(a.order_id, a.applied_at);
      });
      const days: number[] = [];
      orders.forEach((o) => {
        if (o.payment_status === "paid" && o.order_date) {
          const last = lastAppliedByOrder.get(o.id);
          if (last) {
            const d =
              (new Date(last).getTime() - new Date(o.order_date).getTime()) /
              (1000 * 60 * 60 * 24);
            if (d >= 0) days.push(d);
          }
        }
      });
      const avgDaysToClear =
        days.length > 0 ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null;

      return {
        kpis: { totalCreditTaken, totalCleared, currentPending, avgDaysToClear },
        orders,
        collections,
        allocations,
      };
    },
  });
}
