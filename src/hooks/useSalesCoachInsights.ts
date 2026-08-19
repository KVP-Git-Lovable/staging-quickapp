import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Sales Coach insights for the My Visits banners.
 *
 * Isolated consumer of the sales_coach agent: it calls the existing
 * ai-workflow-run edge function with { agentKey: "sales_coach" } and reads
 * that agent's stored executions — per-retailer 30-day product mix (order
 * value, favourite product, gap products worth pitching). This hook never
 * computes anything itself.
 *
 * Run policy: display the latest successful execution for the current user.
 * Auto-run (at most once, concurrency-guarded) only when there is no
 * successful run from today, so the 30-day mix stays a daily snapshot.
 */

export interface CoachRow {
  retailerId: string;
  name: string;
  orderValue: number;
  distinctProducts: number;
  topProduct: string | null;
  gapProducts: string[];
}

export interface CoachResult {
  kind: string;
  date?: string;
  rows?: CoachRow[];
}

export interface SalesCoachInsights {
  rows: CoachRow[];
  loading: boolean;
}

// Module-level guard: at most one automatic run in flight, even across
// StrictMode double-mounts, fast navigation, or duplicate consumers.
let autoRunInFlight = false;

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const isFresh = (res: CoachResult | null): boolean => {
  if (!res || res.kind !== "coach" || !Array.isArray(res.rows)) return false;
  const today = new Date().toISOString().slice(0, 10);
  return res.date === today || res.date === localToday();
};

export function useSalesCoachInsights(): SalesCoachInsights {
  const { user } = useAuth();
  const [result, setResult] = useState<CoachResult | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Newest successful sales_coach execution belonging to this user. */
  const loadLatest = useCallback(async (userId: string) => {
    const { data: agent } = await supabase
      .from("ai_agents")
      .select("id")
      .eq("key", "sales_coach")
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
    const res = (data?.result ?? null) as CoachResult | null;
    return res?.kind === "coach" ? res : null;
  }, []);

  const runNow = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("signed out");
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-workflow-run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ agentKey: "sales_coach" }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? `Run failed (${res.status})`);
    if (mountedRef.current && body?.kind === "coach") setResult(body as CoachResult);
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
        console.error("[useSalesCoachInsights] load failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, loadLatest, runNow]);

  return { rows: result?.rows ?? [], loading };
}
