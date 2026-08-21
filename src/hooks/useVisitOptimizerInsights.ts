import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

interface LatestRun {
  result: RouteResult;
  startedAt: string | null;
}

// Visits can be planned or removed at any point in the day, so a stored run
// only represents the route for a short while (same policy as the Beat
// Planner insights).
const STALE_AFTER_MS = 10 * 60 * 1000;

/** Usable = successful, right shape, carries the newRetailers field, the
 * per-stop typicalOrderHour field, and the routeNote field (runs stored
 * before any of these existed must be regenerated), run today, non-empty,
 * and recent enough. */
const isFresh = (run: LatestRun | null): boolean => {
  const res = run?.result ?? null;
  if (!res || res.kind !== "route" || !Array.isArray(res.newRetailers)) return false;
  const stops = res.stops ?? [];
  // A zero-stop run is only a placeholder (e.g. the morning prewarm before
  // any visits were planned) — treat it as stale so planning visits later
  // in the day triggers a fresh run instead of hiding the card until
  // tomorrow.
  if (stops.length === 0) return false;
  if (!("typicalOrderHour" in stops[0])) return false;
  if (!("insightLine" in stops[0])) return false;
  if (!("routeNote" in res)) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (res.date !== today && res.date !== localToday()) return false;
  const startedAt = run?.startedAt ? new Date(run.startedAt).getTime() : 0;
  return Date.now() - startedAt < STALE_AFTER_MS;
};

/** Newest successful visit_optimiser execution belonging to this user. */
async function fetchLatestRun(userId: string): Promise<LatestRun | null> {
  const { data: agent } = await supabase
    .from("ai_agents")
    .select("id")
    .eq("key", "visit_optimiser")
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
  const res = (data?.result ?? null) as RouteResult | null;
  if (res?.kind !== "route") return null;
  return { result: res, startedAt: (data?.started_at as string) ?? null };
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

/**
 * @param expectedRetailerIds When the caller knows which retailers are on
 *   today's visit list (e.g. the My Visits page viewing self/today), pass
 *   their ids. A stored run whose stops don't cover exactly this set is
 *   treated as stale — adding or removing a retailer/beat from today's
 *   visits refreshes the route immediately instead of waiting out the TTL.
 *   Pass null/undefined when the day's visit set is unknown.
 */
export function useVisitOptimizerInsights(
  expectedRetailerIds?: string[] | null,
): VisitOptimizerInsights {
  const { user } = useAuth();
  const [result, setResult] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  // Signature of the expected visit set, order-insensitive and deduped.
  const expectedKey = useMemo(() => {
    if (!expectedRetailerIds || expectedRetailerIds.length === 0) return null;
    return [...new Set(expectedRetailerIds.map(String))].sort().join(",");
  }, [expectedRetailerIds]);
  // A run whose stops can never equal the expected set (e.g. a retailer
  // without coordinates history still appears, but a cancelled visit does
  // not) must not re-trigger forever: one refresh attempt per distinct set.
  const attemptedSetsRef = useRef<Set<string>>(new Set());

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

    // Order-insensitive comparison of a run's stops against the expected
    // visit set; without an expected set every run matches.
    const matchesExpected = (run: LatestRun | null): boolean => {
      if (!expectedKey || !run) return true;
      const got = [...new Set((run.result.stops ?? []).map((s) => String(s.retailerId)))]
        .sort()
        .join(",");
      return got === expectedKey;
    };

    void (async () => {
      try {
        const latest = await loadLatest(userId);
        if (cancelled) return;
        if (latest) setResult(latest.result);
        if (isFresh(latest) && matchesExpected(latest)) return;
        if (isFresh(latest) && !matchesExpected(latest)) {
          // Visit set changed since the run — refresh, but at most once per
          // distinct set so an unsatisfiable set can't loop runs.
          if (expectedKey && attemptedSetsRef.current.has(expectedKey)) return;
          if (expectedKey) attemptedSetsRef.current.add(expectedKey);
        }
        if (autoRunInFlight) return;
        autoRunInFlight = true;
        try {
          // Re-check first — a run may have completed while we queried.
          const recheck = await loadLatest(userId);
          if (cancelled) return;
          if (isFresh(recheck) && matchesExpected(recheck)) {
            setResult(recheck!.result);
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
  }, [user?.id, loadLatest, runNow, expectedKey]);

  return {
    newRetailers: result?.newRetailers ?? [],
    stops: result?.stops ?? [],
    totalKm: Number(result?.totalKm ?? 0),
    routeNote: String(result?.routeNote ?? ""),
    routeDate: result?.date ?? null,
    loading,
  };
}
