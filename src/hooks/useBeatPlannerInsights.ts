import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { runSimulation } from "@/modules/quickapp-ai/hooks/useAiWorkflows";

/**
 * Shared source of Beat Planner AI insights for the My Beats page.
 *
 * Pure CONSUMER of the existing QuickApp AI beat_planner agent — the same
 * ai-workflow-run flow (deterministic per-beat coverage analysis under the
 * user's RLS + Together.ai narration, execution logging) with zero changes
 * to the agent. Call this ONCE per page: it loads the user's latest
 * successful run instantly, silently triggers a fresh run when there is no
 * run yet or the newest is stale, and exposes a per-beat lookup so beat
 * cards can show their own one-line insight.
 */

export interface BeatPlanRow {
  beat: string;
  retailers: number;
  visited30d: number;
  coveragePct: number;
  pending: number;
  orderValue: number;
  avgDaysSinceVisit: number | null;
  suggestedDays: number;
  /** Retailers added to this beat in the last 14 days (absent on older runs). */
  newRetailers?: number;
}

export interface BeatPlanResult {
  kind: string;
  rows: BeatPlanRow[];
  date?: string;
  totalRetailers?: number;
  summary?: string;
}

export interface BeatPlannerInsights {
  result: BeatPlanResult | null;
  rows: BeatPlanRow[];
  /** Lookup by normalised beat name (trimmed, lower-cased). */
  insightFor: (beatName: string | null | undefined) => BeatPlanRow | null;
  loading: boolean;
  running: boolean;
  failed: boolean;
  lastRunAt: string | null;
  refresh: () => void;
}

/** Auto-refresh when the newest run is older than this. */
const STALE_AFTER_MS = 10 * 60 * 1000;

export function useBeatPlannerInsights(): BeatPlannerInsights {
  const [result, setResult] = useState<BeatPlanResult | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const autoRanRef = useRef(false);

  const runNow = useCallback(async () => {
    setRunning(true);
    setFailed(false);
    try {
      const data = await runSimulation("beat_planner");
      if (data?.kind === "beat_plan") {
        setResult(data as BeatPlanResult);
        setLastRunAt(new Date().toISOString());
      }
    } catch (e) {
      console.error("[useBeatPlannerInsights] run failed:", e);
      setFailed(true);
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let latestAt: string | null = null;
      try {
        const { data: agent } = await supabase
          .from("ai_agents")
          .select("id")
          .eq("key", "beat_planner")
          .maybeSingle();
        if (agent?.id) {
          const { data } = await supabase
            .from("workflow_executions")
            .select("result, started_at")
            .eq("agent_id", agent.id)
            .eq("status", "success")
            .order("started_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const res = (data?.result ?? null) as BeatPlanResult | null;
          if (!cancelled && res?.kind === "beat_plan") {
            setResult(res);
            setLastRunAt(data?.started_at ?? null);
            latestAt = data?.started_at ?? null;
          }
        }
      } catch (e) {
        console.error("[useBeatPlannerInsights] load latest failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }

      const isStale = !latestAt || Date.now() - new Date(latestAt).getTime() > STALE_AFTER_MS;
      if (!cancelled && isStale && !autoRanRef.current) {
        autoRanRef.current = true;
        void runNow();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runNow]);

  const rows = useMemo(() => result?.rows ?? [], [result]);

  const byBeat = useMemo(() => {
    const map = new Map<string, BeatPlanRow>();
    rows.forEach((r) => map.set(String(r.beat ?? "").trim().toLowerCase(), r));
    return map;
  }, [rows]);

  const insightFor = useCallback(
    (beatName: string | null | undefined) =>
      beatName ? byBeat.get(String(beatName).trim().toLowerCase()) ?? null : null,
    [byBeat],
  );

  return { result, rows, insightFor, loading, running, failed, lastRunAt, refresh: runNow };
}
