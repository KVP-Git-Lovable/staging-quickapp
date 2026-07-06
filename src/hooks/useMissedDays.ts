import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export interface MissedBeatDay {
  missed_date: string;
  retailer_count: number;
  on_leave: boolean;
}

export function useMissedBeatDays(
  userId: string | null | undefined,
  lookback = 14,
  opts: { enabled?: boolean } = {},
) {
  return useQuery<MissedBeatDay[]>({
    queryKey: ["missed-beat-days", userId, lookback],
    enabled: !!userId && opts.enabled !== false,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await sb.rpc("get_missed_beat_days", {
        p_user: userId,
        p_lookback: lookback,
      });
      if (error) throw error;
      return (data || []) as MissedBeatDay[];
    },
  });
}

export function useRescheduleMissedDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { userId: string; fromDate: string; toDate?: string | null }) => {
      const { data, error } = await sb.rpc("reschedule_missed_day", {
        p_user: args.userId,
        p_from_date: args.fromDate,
        p_to_date: args.toDate ?? null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        moved: (row?.moved as number) || 0,
        toDate: (row?.to_date as string) || args.toDate || "",
      };
    },
    onSuccess: (_r, args) => {
      qc.invalidateQueries({ queryKey: ["missed-beat-days", args.userId] });
      qc.invalidateQueries({ queryKey: ["bc-day", args.userId] });
    },
  });
}
