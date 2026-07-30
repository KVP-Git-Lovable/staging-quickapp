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

const countPointsFor = async (actionIds: string[]) => {
  if (!actionIds.length) return 0;
  const { count, error } = await supabase
    .from("gamification_points")
    .select("id", { count: "exact", head: true })
    .in("action_id", actionIds);
  if (error) throw error;
  return count ?? 0;
};

/** Delete a single activity (and its tiers). Blocked when points were already awarded. */
export const useDeleteActivity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (actionId: string) => {
      const awarded = await countPointsFor([actionId]);
      if (awarded > 0) {
        throw new Error(
          `This activity has already awarded ${awarded} point record(s) and cannot be deleted. Turn it off instead to stop future awards.`,
        );
      }
      const { error: tErr } = await supabase.from("activity_tiers").delete().eq("action_id", actionId);
      if (tErr) throw tErr;
      const { error } = await supabase.from("gamification_actions").delete().eq("id", actionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gam-activities"] });
      qc.invalidateQueries({ queryKey: ["gam-tier-ranges"] });
      toast.success("Activity deleted");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not delete activity"),
  });
};

/** Delete a program with all its activities and tiers. Blocked when any points were awarded. */
export const useDeleteProgram = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (programId: string) => {
      const { data: actions, error: aErr } = await supabase
        .from("gamification_actions")
        .select("id")
        .eq("game_id", programId);
      if (aErr) throw aErr;
      const ids = (actions ?? []).map((a: any) => a.id);
      const awarded = await countPointsFor(ids);
      if (awarded > 0) {
        throw new Error(
          `This program's activities have already awarded ${awarded} point record(s) and cannot be deleted. Set the program to Draft instead.`,
        );
      }
      if (ids.length) {
        const { error: tErr } = await supabase.from("activity_tiers").delete().in("action_id", ids);
        if (tErr) throw tErr;
        const { error: acErr } = await supabase.from("gamification_actions").delete().in("id", ids);
        if (acErr) throw acErr;
      }
      const { error } = await supabase.from("gamification_games").delete().eq("id", programId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gam-programs"] });
      qc.invalidateQueries({ queryKey: ["gam-activities"] });
      toast.success("Program deleted");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not delete program"),
  });
};


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
        .select("id, kpi_name, is_active, display_order")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("kpi_name", { ascending: true });
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
