import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export interface CreditOrder {
  id: string;
  order_number: string | null;
  invoice_number: string | null;
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
  /** Last applied_at timestamp from allocations for this order. */
  last_collection_date: string | null;
  /** Days from order_date to last_collection_date when payment_status='paid'. */
  days_to_clear: number | null;
  /** Days from order_date to today when not paid. */
  days_outstanding: number | null;
  /** True when not paid and days_outstanding > credit_days. */
  is_overdue: boolean;
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

export interface CreditTerms {
  credit_limit: number | null;
  credit_days: number | null;
  source: "retailer" | "distributor" | "global" | "none";
}

export interface RetailerCreditHistory {
  kpis: CreditHistoryKPIs;
  orders: CreditOrder[];
  collections: CollectionRow[];
  allocations: AllocationRow[];
  creditTerms: CreditTerms;
  distributorId: string | null;
}

export interface DateRange {
  from?: string | null; // YYYY-MM-DD
  to?: string | null;   // YYYY-MM-DD
}

async function resolveCreditTerms(
  retailerId: string,
  distributorId: string | null
): Promise<CreditTerms> {
  if (distributorId) {
    const { data: rrow } = await sb
      .from("distributor_retailer_credit_limits")
      .select("credit_limit, credit_days")
      .eq("retailer_id", retailerId)
      .eq("distributor_id", distributorId)
      .eq("is_active", true)
      .maybeSingle();
    if (rrow) {
      return {
        credit_limit: rrow.credit_limit == null ? null : Number(rrow.credit_limit),
        credit_days: rrow.credit_days == null ? null : Number(rrow.credit_days),
        source: "retailer",
      };
    }
  }
  // Retailer-only row (no distributor) — supports retailers without a distributor.
  const { data: rNullRow } = await sb
    .from("distributor_retailer_credit_limits")
    .select("credit_limit, credit_days")
    .eq("retailer_id", retailerId)
    .is("distributor_id", null)
    .eq("is_active", true)
    .maybeSingle();
  if (rNullRow) {
    return {
      credit_limit: rNullRow.credit_limit == null ? null : Number(rNullRow.credit_limit),
      credit_days: rNullRow.credit_days == null ? null : Number(rNullRow.credit_days),
      source: "retailer",
    };
  }
  if (distributorId) {
    const { data: drow } = await sb
      .from("distributor_credit_limits")
      .select("credit_limit, credit_days")
      .eq("distributor_id", distributorId)
      .maybeSingle();
    if (drow) {
      return {
        credit_limit: drow.credit_limit == null ? null : Number(drow.credit_limit),
        credit_days: drow.credit_days == null ? null : Number(drow.credit_days),
        source: "distributor",
      };
    }
  }

  const { data: cfg } = await sb
    .from("credit_management_config")
    .select("payment_term_days")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cfg && cfg.payment_term_days != null) {
    return {
      credit_limit: null,
      credit_days: Number(cfg.payment_term_days),
      source: "global",
    };
  }
  return { credit_limit: null, credit_days: null, source: "none" };
}

export function useRetailerCreditHistory(
  retailerId: string | null | undefined,
  range?: DateRange
) {
  const from = range?.from || null;
  const to = range?.to || null;
  return useQuery({
    queryKey: ["retailer-credit-history", retailerId, from, to],
    enabled: !!retailerId,
    staleTime: 30_000,
    queryFn: async (): Promise<RetailerCreditHistory> => {
      if (!retailerId) {
        return {
          kpis: { totalCreditTaken: 0, totalCleared: 0, currentPending: 0, avgDaysToClear: null },
          orders: [],
          collections: [],
          allocations: [],
          creditTerms: { credit_limit: null, credit_days: null, source: "none" },
          distributorId: null,
        };
      }

      // Resolve retailer's distributor first (needed for credit terms)
      const { data: retailerRow } = await supabase
        .from("retailers")
        .select("pending_amount, distributor_id")
        .eq("id", retailerId)
        .maybeSingle();
      const distributorId = (retailerRow as any)?.distributor_id || null;

      let ordersQuery = supabase
        .from("orders")
        .select(
          "id, order_number, invoice_number, order_date, total_amount, credit_paid_amount, credit_pending_amount, payment_status, created_at"
        )
        .eq("retailer_id", retailerId)
        .eq("is_credit_order", true)
        .neq("status", "cancelled")
        .is("replaced_by_order_id", null)
        .order("order_date", { ascending: false })
        .limit(500);

      if (from) ordersQuery = ordersQuery.gte("order_date", from);
      if (to) ordersQuery = ordersQuery.lte("order_date", to);

      let collectionsQuery = sb
        .from("retailer_payment_collections")
        .select(
          "id, created_at, amount, payment_method, payment_proof_url, collected_by_user_id, revenue_owner_id"
        )
        .eq("retailer_id", retailerId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (from) collectionsQuery = collectionsQuery.gte("created_at", from);
      if (to) collectionsQuery = collectionsQuery.lte("created_at", `${to}T23:59:59`);

      const [ordersRes, collectionsRes, creditTerms] = await Promise.all([
        ordersQuery,
        collectionsQuery,
        resolveCreditTerms(retailerId, distributorId),
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

      // Per-order: sum of collections applied AFTER the order and last applied_at
      const collectedByOrder = new Map<string, number>();
      const lastAppliedByOrder = new Map<string, string>();
      allocations.forEach((a) => {
        collectedByOrder.set(
          a.order_id,
          (collectedByOrder.get(a.order_id) || 0) + Number(a.amount_applied || 0)
        );
        const cur = lastAppliedByOrder.get(a.order_id);
        if (!cur || a.applied_at > cur) lastAppliedByOrder.set(a.order_id, a.applied_at);
      });

      const todayMs = Date.now();
      const creditDays = creditTerms.credit_days;

      orders.forEach((o) => {
        const collected = Number(collectedByOrder.get(o.id) || 0);
        const pending = Number(o.credit_pending_amount || 0);
        const paid = Number(o.credit_paid_amount || 0);
        o.collected_after_order = collected;
        o.original_credit_amount = Math.max(0, pending + collected);
        o.paid_at_order_time = Math.max(0, paid - collected);
        o.last_collection_date = lastAppliedByOrder.get(o.id) || null;

        const isPaid = (o.payment_status || "").toLowerCase() === "paid";
        if (isPaid && o.order_date && o.last_collection_date) {
          const d =
            (new Date(o.last_collection_date).getTime() -
              new Date(o.order_date).getTime()) /
            (1000 * 60 * 60 * 24);
          o.days_to_clear = Math.max(0, Math.round(d));
        } else {
          o.days_to_clear = null;
        }
        if (!isPaid && o.order_date) {
          const d =
            (todayMs - new Date(o.order_date).getTime()) / (1000 * 60 * 60 * 24);
          o.days_outstanding = Math.max(0, Math.round(d));
        } else {
          o.days_outstanding = null;
        }
        o.is_overdue =
          !isPaid &&
          creditDays != null &&
          o.days_outstanding != null &&
          o.days_outstanding > creditDays;
      });

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

      const totalCreditTaken = orders.reduce(
        (s, o) => s + Number(o.original_credit_amount || 0),
        0
      );
      const totalCleared = orders.reduce(
        (s, o) => s + Number(o.collected_after_order || 0),
        0
      );
      const currentPending = Number((retailerRow as any)?.pending_amount || 0);

      const days: number[] = [];
      orders.forEach((o) => {
        if (o.days_to_clear != null) days.push(o.days_to_clear);
      });
      const avgDaysToClear =
        days.length > 0
          ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10
          : null;

      return {
        kpis: { totalCreditTaken, totalCleared, currentPending, avgDaysToClear },
        orders,
        collections,
        allocations,
        creditTerms,
        distributorId,
      };
    },
  });
}
