import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Churn Risk data for the My Retailers card.
 *
 * Isolated consumer of the frozen churn_detector agent: it calls the existing
 * ai-workflow-run edge function directly with { agentKey: "churn_detector" }
 * and reads that agent's stored executions. It deliberately does NOT import
 * or duplicate anything from src/modules/quickapp-ai/hooks/useAiWorkflows.ts —
 * there is exactly one Churn Detector brain, server-side.
 *
 * Run policy: if a successful execution exists FOR THE CURRENT USER, display
 * it and never auto-run; only when the user has no successful execution at
 * all (failed-only history included) is a single automatic run triggered.
 * The refresh() callback is the only other way to start a run.
 */

export interface ChurnRow {
  retailerId: string;
  name: string;
  recentValue: number;
  priorValue: number;
  dropPct: number;
}

export interface ChurnResult {
  kind: string;
  rows: ChurnRow[];
  analysed: number;
  date?: string;
}

export interface ChurnRisk {
  result: ChurnResult | null;
  loading: boolean;
  running: boolean;
  failed: boolean;
  lastRunAt: string | null;
  refresh: () => void;
}

// Module-level guard: at most one automatic first-run in flight, even across
// StrictMode double-mounts, fast navigation, or duplicate card mounts.
let autoRunInFlight = false;

export function useChurnRisk(): ChurnRisk {
  const { user } = useAuth();
  const [result, setResult] = useState<ChurnResult | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Newest successful churn_detector execution belonging to this user. */
  const loadLatest = useCallback(async (userId: string) => {
    const { data: agent } = await supabase
      .from("ai_agents")
      .select("id")
      .eq("key", "churn_detector")
      .maybeSingle();
    if (!agent?.id) return null;
    const { data } = await supabase
      .from("workflow_executions")
      .select("result, started_at")
      .eq("agent_id", agent.id)
      .eq("status", "success")
      .eq("triggered_by", userId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const res = (data?.result ?? null) as ChurnResult | null;
    if (res?.kind === "churn") {
      return { result: res, startedAt: (data?.started_at as string) ?? null };
    }
    return null;
  }, []);

  const runNow = useCallback(async () => {
    setRunning(true);
    setFailed(false);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("signed out");
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-workflow-run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ agentKey: "churn_detector" }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Run failed (${res.status})`);
      if (mountedRef.current && body?.kind === "churn") {
        setResult(body as ChurnResult);
        setLastRunAt(new Date().toISOString());
      }
    } catch (e) {
      console.error("[useChurnRisk] run failed:", e);
      if (mountedRef.current) setFailed(true);
    } finally {
      if (mountedRef.current) setRunning(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const userId = user.id;

    void (async () => {
      try {
        const latest = await loadLatest(userId);
        if (cancelled) return;
        if (latest) {
          setResult(latest.result);
          setLastRunAt(latest.startedAt);
          return;
        }
        // No successful run for this user. Auto-run exactly once: re-check
        // first (one may have completed while our query was in flight), and
        // never start a second automatic run concurrently.
        if (autoRunInFlight) return;
        autoRunInFlight = true;
        try {
          const recheck = await loadLatest(userId);
          if (cancelled) return;
          if (recheck) {
            setResult(recheck.result);
            setLastRunAt(recheck.startedAt);
            return;
          }
          await runNow();
        } finally {
          autoRunInFlight = false;
        }
      } catch (e) {
        console.error("[useChurnRisk] load failed:", e);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, loadLatest, runNow]);

  return { result, loading, running, failed, lastRunAt, refresh: runNow };
}
