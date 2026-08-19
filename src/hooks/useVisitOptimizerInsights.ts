import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Visit Optimiser insights for the My Visits banners.
 *
 * Isolated consumer of the visit_optimiser agent: it calls the existing
 * ai-workflow-run edge function with { agentKey: "visit_optimiser" } and reads
 * that agent's stored executions. The agent computes today's scored stop
 * order AND which retailers are newly added (with one friendly AI pitch line
 * per newcomer). This hook never computes or generates anything itself.
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

export interface RouteStop {
  retailerId: string;
  name: string;
  beat: string | null;
  sequence: number;
  score: number;
  pending: number;
  daysSinceLastVisit: number | null;
  visits: number;
  orders: number;
  productivityPct: number;
  /** Median hour of day this store places orders (IST); absent on old runs. */
  typicalOrderHour?: number | null;
  /** Display label for typicalOrderHour, e.g. "10 AM". */
  typicalOrderTime?: string | null;
  /** AI-written warm one-liner for this stop ("" = use client fallback wording). */
  insightLine?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface RouteResult {
  kind: string;
  date?: string;
  stops?: RouteStop[];
  totalKm?: number;
  newRetailers?: NewRetailerInsight[];
  /** AI's one-line explanation of the chosen stop order ("" when the
   * deterministic baseline order was used). */
  routeNote?: string;
}

export interface VisitOptimizerInsights {
  newRetailers: NewRetailerInsight[];
  stops: RouteStop[];
  /** Estimated travel distance for the suggested order, km. */
  totalKm: number;
  /** AI's one-line explanation of the chosen stop order (may be empty). */
  routeNote: string;
  /** The agent-run date the stops belong to (stop ranks are day-specific). */
  routeDate: string | null;
  loading: boolean;
}

// Module-level guard: at most one automatic run in flight, even across
// StrictMode double-mounts, fast navigation, or duplicate consumers.
let autoRunInFlight = false;

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Usable = successful, right shape, carries the newRetailers field, the
 * per-stop typicalOrderHour field, and the routeNote field (runs stored
 * before any of these existed must be regenerated), and run today. */
const isFresh = (res: RouteResult | null): boolean => {
  if (!res || res.kind !== "route" || !Array.isArray(res.newRetailers)) return false;
  const stops = res.stops ?? [];
  if (stops.length > 0 && !("typicalOrderHour" in stops[0])) return false;
  if (stops.length > 0 && !("insightLine" in stops[0])) return false;
  if (!("routeNote" in res)) return false;
  const today = new Date().toISOString().slice(0, 10);
  return res.date === today || res.date === localToday();
};

/** Newest successful visit_optimiser execution belonging to this user. */
async function fetchLatestRun(userId: string): Promise<RouteResult | null> {
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
}

/** Trigger one visit_optimiser run and return its result (null on failure). */
async function triggerRun(): Promise<RouteResult | null> {
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
  return body?.kind === "route" ? (body as RouteResult) : null;
}

/**
 * Warm today's Visit Optimiser run ahead of time (e.g. from the home page)
 * so the AI Visit Optimizer section on /visits/retailers renders instantly.
 * Same policy and concurrency guard as the hook: if a fresh run for today
 * already exists nothing happens; otherwise exactly one run is triggered.
 * Best-effort — never throws.
 */
export async function prewarmVisitOptimizerInsights(userId: string): Promise<void> {
  if (!userId || autoRunInFlight) return;
  autoRunInFlight = true;
  try {
    const latest = await fetchLatestRun(userId);
    if (isFresh(latest)) return;
    await triggerRun();
  } catch (e) {
    console.warn("[useVisitOptimizerInsights] prewarm failed:", e);
  } finally {
    autoRunInFlight = false;
  }
}

export function useVisitOptimizerInsights(): VisitOptimizerInsights {
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

  const loadLatest = useCallback((userId: string) => fetchLatestRun(userId), []);

  const runNow = useCallback(async () => {
    const body = await triggerRun();
    if (mountedRef.current && body) setResult(body);
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
        console.error("[useVisitOptimizerInsights] load failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, loadLatest, runNow]);

  return {
    newRetailers: result?.newRetailers ?? [],
    stops: result?.stops ?? [],
    totalKm: Number(result?.totalKm ?? 0),
    routeNote: String(result?.routeNote ?? ""),
    routeDate: result?.date ?? null,
    loading,
  };
}
