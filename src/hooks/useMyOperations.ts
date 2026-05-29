import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const sb = supabase as any;

export interface TodayRetailerRow {
  retailer_id: string;
  retailer_name: string;
  beat_id: string | null;
  access_type: "owned" | "shared";
  pending_collection: number;
}

export function useMyOperationsToday(date: string = new Date().toISOString().slice(0, 10)) {
  return useQuery({
    queryKey: ["my-operations-today", date],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await sb.rpc("get_my_operations_today", { p_date: date });
      if (error) throw error;
      return (data || []) as TodayRetailerRow[];
    },
  });
}

export interface CollectionRow {
  retailer_id: string;
  retailer_name: string;
  open_invoice_count: number;
  outstanding: number;
  oldest_invoice_date: string | null;
  access_type: "owned" | "shared";
}

export function useCollectionWorkspace(filter: "mine" | "shared" | "overdue" | "all" = "mine") {
  return useQuery({
    queryKey: ["collection-workspace", filter],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await sb.rpc("get_collection_workspace", { p_filter: filter });
      if (error) throw error;
      return (data || []) as CollectionRow[];
    },
  });
}

export function useSharedAccess() {
  return useQuery({
    queryKey: ["shared-access"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await sb
        .from("retailer_shared_access")
        .select("*, retailers:retailer_id(name)")
        .or(`shared_by_user_id.eq.${user.id},shared_to_user_id.eq.${user.id}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useDelegations() {
  return useQuery({
    queryKey: ["user-delegations"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await sb
        .from("user_delegations")
        .select("*")
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useActivityTimeline(retailerId?: string) {
  return useQuery({
    queryKey: ["activity-timeline", retailerId ?? "me"],
    enabled: true,
    staleTime: 30_000,
    queryFn: async () => {
      let q = sb.from("operational_activity_log").select("*").order("created_at", { ascending: false }).limit(50);
      if (retailerId) q = q.eq("retailer_id", retailerId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}

export function useShareRetailer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      retailerId: string;
      toUser: string;
      canView?: boolean;
      canTakeOrders?: boolean;
      canCollectPayment?: boolean;
      canUpdateFeedback?: boolean;
      effectiveFrom?: string;
      effectiveTo?: string | null;
    }) => {
      const { data, error } = await sb.rpc("share_retailer_access", {
        p_retailer_id: p.retailerId,
        p_to_user: p.toUser,
        p_can_view: p.canView ?? true,
        p_can_take_orders: p.canTakeOrders ?? false,
        p_can_collect_payment: p.canCollectPayment ?? false,
        p_can_update_feedback: p.canUpdateFeedback ?? false,
        p_effective_from: p.effectiveFrom ?? new Date().toISOString(),
        p_effective_to: p.effectiveTo ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Access shared");
      qc.invalidateQueries({ queryKey: ["shared-access"] });
      qc.invalidateQueries({ queryKey: ["my-operations-today"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to share"),
  });
}

export function useRevokeShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (shareId: string) => {
      const { error } = await sb.rpc("revoke_retailer_access", { p_share_id: shareId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Share revoked");
      qc.invalidateQueries({ queryKey: ["shared-access"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to revoke"),
  });
}

export function useCreateDelegation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      toUser: string;
      scope: "all" | "beats" | "retailers";
      beatIds?: string[];
      retailerIds?: string[];
      effectiveFrom: string;
      effectiveTo: string;
      notes?: string;
    }) => {
      const { data, error } = await sb.rpc("create_user_delegation", {
        p_to_user: p.toUser,
        p_scope: p.scope,
        p_beat_ids: p.beatIds ?? [],
        p_retailer_ids: p.retailerIds ?? [],
        p_effective_from: p.effectiveFrom,
        p_effective_to: p.effectiveTo,
        p_notes: p.notes ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Delegation created");
      qc.invalidateQueries({ queryKey: ["user-delegations"] });
      qc.invalidateQueries({ queryKey: ["shared-access"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to delegate"),
  });
}

export function useOpenInvoices(retailerId: string | null) {
  return useQuery({
    queryKey: ["open-invoices", retailerId],
    enabled: !!retailerId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await sb
        .from("distributor_secondary_invoices")
        .select("id, invoice_number, invoice_date, total_amount, amount_paid, balance_due, payment_status")
        .eq("retailer_id", retailerId)
        .gt("balance_due", 0)
        .order("invoice_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useAllocatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      paymentId: string;
      mode: "fifo" | "manual";
      allocations?: { invoice_id: string; amount: number }[];
    }) => {
      if (p.mode === "fifo") {
        const { error } = await sb.rpc("allocate_payment_fifo", { p_payment_id: p.paymentId });
        if (error) throw error;
      } else {
        const { error } = await sb.rpc("allocate_payment_manual", {
          p_payment_id: p.paymentId,
          p_allocations: p.allocations ?? [],
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Payment allocated");
      qc.invalidateQueries({ queryKey: ["collection-workspace"] });
      qc.invalidateQueries({ queryKey: ["open-invoices"] });
      qc.invalidateQueries({ queryKey: ["my-operations-today"] });
    },
    onError: (e: any) => toast.error(e.message || "Allocation failed"),
  });
}

export function useTeammates() {
  return useQuery({
    queryKey: ["teammates-basic"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb
        .from("profiles")
        .select("id, full_name, email, role")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
  });
}
