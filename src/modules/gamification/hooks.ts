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

export const useToggleActivity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
      const { error } = await supabase
        .from("gamification_actions")
        .update({ is_enabled })
        .eq("id", id);
      if (error) throw error;
      return is_enabled;
    },
    onSuccess: (is_enabled) => {
      // prefix match — clears both the "all" list and any per-program list
      qc.invalidateQueries({ queryKey: ["gam-activities"] });
      toast.success(is_enabled ? "Activity enabled" : "Activity disabled");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not update the activity"),
  });
};

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
      // Paged rather than a flat .limit() — a fixed cap silently plateaus the
      // tile once the year's ledger outgrows it, with no sign anything is wrong.
      const PAGE_SIZE = 1000;
      const MAX_PAGES = 100;
      let total = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const from = page * PAGE_SIZE;
        const { data, error } = await supabase
          .from("gamification_points")
          .select("points")
          .gte("earned_at", start)
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const rows = data ?? [];
        total = rows.reduce((s: number, r: any) => s + Number(r.points || 0), total);
        if (rows.length < PAGE_SIZE) break;
      }
      return total;
    },
  });

/** id → full_name for the ledger. gamification_points.user_id has no FK to profiles,
 *  so the join has to happen client-side. */
export const useGamProfiles = () =>
  useQuery({
    queryKey: ["gam-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

/** Detail rows for the ledger table, newest first. Paged from the UI via `limit`. */
export const usePointsLedger = (limit = 100) =>
  useQuery({
    queryKey: ["gam-points-ledger", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gamification_points")
        .select(
          "id, points, earned_at, expires_at, status, reference_type, reference_id, retailer_id, user_id, game_id, action_id, gamification_actions(action_name, is_tiered), gamification_games(name, category)"
        )
        .order("earned_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });

/** Totals and per-user balances over the WHOLE ledger — deliberately separate from
 *  usePointsLedger so the headline figures stay correct no matter how few rows the
 *  table has loaded. Paged for the same reason usePointsIssuedYtd is. */
export const usePointsSummary = () =>
  useQuery({
    queryKey: ["gam-points-summary"],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      const MAX_PAGES = 100;
      const byUser = new Map<string, { points: number; awards: number; last: string | null }>();
      let total = 0;
      let awards = 0;
      let earliest: string | null = null;

      for (let page = 0; page < MAX_PAGES; page++) {
        const from = page * PAGE_SIZE;
        const { data, error } = await supabase
          .from("gamification_points")
          .select("points, user_id, earned_at")
          .order("earned_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const rows = data ?? [];
        rows.forEach((r: any) => {
          const p = Number(r.points || 0);
          total += p;
          awards += 1;
          const key = r.user_id ?? "__none__";
          const cur = byUser.get(key) ?? { points: 0, awards: 0, last: null };
          cur.points += p;
          cur.awards += 1;
          if (!cur.last || r.earned_at > cur.last) cur.last = r.earned_at;
          byUser.set(key, cur);
          if (!earliest || r.earned_at < earliest) earliest = r.earned_at;
        });
        if (rows.length < PAGE_SIZE) break;
      }

      return {
        total,
        awards,
        earliest,
        byUser: Array.from(byUser.entries())
          .map(([userId, v]) => ({ userId, ...v }))
          .sort((a, b) => b.points - a.points),
      };
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
