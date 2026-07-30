import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface GamSettings {
  id: string;
  engine_enabled: boolean;
  currency_name: string;
  point_conversion: number;
  timezone: string;
  leaderboard_enabled: boolean;
  notifications_enabled: boolean;
  default_award_mode: string;
  approval_fallback: string;
}

export const useGamSettings = () =>
  useQuery({
    queryKey: ["gam-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gamification_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as GamSettings | null;
    },
  });

export const useUpdateGamSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<GamSettings> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("gamification_settings").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gam-settings"] });
      toast.success("Global configuration saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not save settings"),
  });
};

export const usePrograms = () =>
  useQuery({
    queryKey: ["gam-programs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gamification_games")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const useProgram = (id?: string) =>
  useQuery({
    queryKey: ["gam-program", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gamification_games")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const useActivities = (programId?: string) =>
  useQuery({
    queryKey: ["gam-activities", programId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("gamification_actions").select("*").order("created_at", { ascending: true });
      if (programId) q = q.eq("game_id", programId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export const useActivityTiers = (actionId?: string) =>
  useQuery({
    queryKey: ["gam-tiers", actionId],
    enabled: !!actionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_tiers")
        .select("*")
        .eq("action_id", actionId!)
        .order("threshold_pct", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

export const usePointsIssuedYtd = () =>
  useQuery({
    queryKey: ["gam-points-ytd"],
    queryFn: async () => {
      const start = new Date(new Date().getFullYear(), 0, 1).toISOString();
      const { data, error } = await supabase
        .from("gamification_points")
        .select("points")
        .gte("earned_at", start)
        .limit(5000);
      if (error) throw error;
      return (data ?? []).reduce((s: number, r: any) => s + Number(r.points || 0), 0);
    },
  });

export const useTargetKpis = () =>
  useQuery({
    queryKey: ["gam-target-kpis"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("target_kpi_definitions")
        .select("id, kpi_name, is_active")
        .order("kpi_name");
      if (error) throw error;
      return data ?? [];
    },
  });

export const useFocusedProductCount = () =>
  useQuery({
    queryKey: ["gam-focused-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("is_focused", true);
      if (error) throw error;
      return count ?? 0;
    },
  });
