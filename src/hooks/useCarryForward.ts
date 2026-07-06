import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export interface CarryForwardRetailer {
  retailer_id: string;
  retailer_name: string;
  cancelled_on: string;
}

export function useCarryForwardEnabled() {
  return useQuery({
    queryKey: ["operations-config", "carry-forward"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await sb
        .from("operations_config")
        .select("carry_forward_enabled")
        .limit(1)
        .maybeSingle();
      return !!data?.carry_forward_enabled;
    },
  });
}

export function useCarryForwardRetailers(
  userId: string | null | undefined,
  date: string | null | undefined,
  opts: { enabled?: boolean } = {},
) {
  return useQuery<CarryForwardRetailer[]>({
    queryKey: ["carry-forward", userId, date],
    enabled: !!userId && !!date && opts.enabled !== false,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await sb.rpc("get_carry_forward_retailers", {
        p_user: userId,
        p_date: date,
      });
      if (error) throw error;
      return (data || []) as CarryForwardRetailer[];
    },
  });
}

export function useAddCarryForward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { userId: string; date: string; retailerIds?: string[] | null }) => {
      const { data, error } = await sb.rpc("add_carry_forward_to_plan", {
        p_user: args.userId,
        p_date: args.date,
        p_retailer_ids: args.retailerIds ?? null,
      });
      if (error) throw error;
      return (data as number) || 0;
    },
    onSuccess: (_n, args) => {
      qc.invalidateQueries({ queryKey: ["carry-forward", args.userId, args.date] });
      qc.invalidateQueries({ queryKey: ["bc-day", args.userId, args.date] });
    },
  });
}
