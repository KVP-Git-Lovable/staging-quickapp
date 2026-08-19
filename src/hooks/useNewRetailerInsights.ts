import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Newly-added-retailer pitch reminders for the My Visits banners.
 *
 * Isolated consumer of the visit_optimiser agent: it calls the existing
 * ai-workflow-run edge function with { agentKey: "visit_optimiser" } and reads
 * that agent's stored executions — the agent computes which retailers are
 * newly added and generates one friendly AI pitch line per newcomer. This
 * hook never computes or generates anything itself.
 *
 * Run policy: display the latest successful execution for the current user.
 * Auto-run (at most once, concurrency-guarded) only when there is no usable
 * run for TODAY — the Visit Optimiser is inherently about today's visits, so
 * a run from a previous day is stale for this surface. Older runs still
 * display while a fresh one is generated.
 */

export interface NewRetailerInsight {
  retailerId: string;
  name: string;
  beat: string;
  category: string;
  createdAt: string;
  daysOld: number;
  line: string;
}

export interface RouteResult {
  kind: string;
  date?: string;
  newRetailers?: NewRetailerInsight[];
}

export interface NewRetailerInsights {
  newRetailers: NewRetailerInsight[];
  loading: boolean;
}

// Module-level guard: at most one automatic run in flight, even across
// StrictMode double-mounts, fast navigation, or duplicate consumers.
let autoRunInFlight = false;

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Usable = successful, right shape, carries the newRetailers field (runs
 * stored before the field existed must be regenerated), and run today. */
const isFresh = (res: RouteResult | null): boolean => {
  if (!res || res.kind !== "route" || !Array.isArray(res.newRetailers)) return false;
  const today = new Date().toISOString().slice(0, 10);
  return res.date === today || res.date === localToday();
};

export function useNewRetailerInsights(): NewRetailerInsights {
  const { user } = useAuth();
  const [result, setResult] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Newest successful visit_optimiser execution belonging to this user. */
  const loadLatest = useCallback(async (userId: string) => {
    const { data: agent } = await supabase
      .from("ai_agents")
      .select("id")
      .eq("key", "visit_optimiser")
      .maybeSingle();
    if (!agent?.id) return null;
    const { data } = await supabase
      .from("workflow_executions")
      .select("result")
      .eq("agent_id", agent.id)
      .eq("status", "success")
      .eq("triggered_by", userId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const res = (data?.result ?? null) as RouteResult | null;
    return res?.kind === "route" ? res : null;
  }, []);

  const runNow = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("signed out");
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-workflow-run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ agentKey: "visit_optimiser" }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? `Run failed (${res.status})`);
    if (mountedRef.current && body?.kind === "route") setResult(body as RouteResult);
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
        if (latest) setResult(latest);
        if (isFresh(latest)) return;
        if (autoRunInFlight) return;
        autoRunInFlight = true;
        try {
          // Re-check first — a run may have completed while we queried.
          const recheck = await loadLatest(userId);
          if (cancelled) return;
          if (isFresh(recheck)) {
            setResult(recheck);
            return;
          }
          await runNow();
        } finally {
          autoRunInFlight = false;
        }
      } catch (e) {
        console.error("[useNewRetailerInsights] load failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, loadLatest, runNow]);

  return { newRetailers: result?.newRetailers ?? [], loading };
}
