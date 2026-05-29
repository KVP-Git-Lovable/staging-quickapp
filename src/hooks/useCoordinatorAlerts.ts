import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const sb = supabase as any;

export interface CoordinatorAlert {
  id: string;
  title: string;
  message: string;
  type: string;
  related_id: string | null;
  related_table: string | null;
  created_at: string;
}

export function useCoordinatorAlerts() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery<CoordinatorAlert[]>({
    queryKey: ["coordinator-alerts", user?.id],
    enabled: !!user?.id,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data } = await sb
        .from("notifications")
        .select("id, title, message, type, related_id, related_table, created_at")
        .eq("user_id", user!.id)
        .eq("is_read", false)
        .in("type", ["beat_coverage_alert", "beat_coverage_cascade"])
        .order("created_at", { ascending: false })
        .limit(50);
      return (data || []) as CoordinatorAlert[];
    },
  });

  const markRead = async (id: string) => {
    await sb.from("notifications").update({ is_read: true }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["coordinator-alerts", user?.id] });
  };

  return { ...query, markRead };
}
