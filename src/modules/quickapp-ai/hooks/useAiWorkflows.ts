import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppTimezone, getLocalDateString } from "@/hooks/useAppTimezone";

export type AgentStatus = "prototype" | "coming_soon" | "live";

export interface AiAgentRow {
  id: string;
  key: string;
  name: string;
  description: string;
  status: AgentStatus;
  category: string | null;
  sort_order: number;
}

export interface WorkflowExecution {
  id: string;
  agent_id: string | null;
  workflow_id: string | null;
  stage: string;
  status: "running" | "success" | "failed";
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  result: any | null;
}

export const RUNNABLE_AGENTS = new Set(["visit_optimiser", "churn_detector", "beat_planner", "sales_coach"]);

export const STATUS_LABEL: Record<AgentStatus, string> = {
  prototype: "Prototype",
  coming_soon: "Coming Soon",
  live: "Live",
};

export function useAiAgents() {
  const [agents, setAgents] = useState<AiAgentRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select("id, key, name, description, status, category, sort_order")
        .order("sort_order", { ascending: true });
      if (error) console.error("[ai-workflows] agents", error);
      if (!cancelled && data) setAgents(data as unknown as AiAgentRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return agents;
}

export function useWorkflowExecutions() {
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("workflow_executions")
      .select("id, agent_id, workflow_id, stage, status, started_at, completed_at, duration_ms, error_message, result")
      .order("started_at", { ascending: false })
      .limit(500);
    if (error) console.error("[ai-workflows] executions", error);
    setExecutions((data ?? []) as unknown as WorkflowExecution[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { executions, loading, refresh };
}

export function useWorkflowMetrics(executions: WorkflowExecution[], agentId?: string | null) {
  const { timezone } = useAppTimezone();

  return useMemo(() => {
    const rows = agentId ? executions.filter((e) => e.agent_id === agentId) : executions;
    const finished = rows.filter((e) => e.status === "success" || e.status === "failed");
    const success = finished.filter((e) => e.status === "success").length;

    const durations = finished
      .map((e) => e.duration_ms)
      .filter((d): d is number => typeof d === "number" && d > 0);

    const today = getLocalDateString(new Date(), timezone);
    const todayCount = rows.filter(
      (e) => getLocalDateString(new Date(e.started_at), timezone) === today,
    ).length;

    return {
      successRate: finished.length ? `${Math.round((success / finished.length) * 100)}%` : "—",
      avgResponse: durations.length
        ? `${(durations.reduce((a, b) => a + b, 0) / durations.length / 1000).toFixed(1)}s`
        : "—",
      executionsToday: rows.length ? String(todayCount) : "—",
    };
  }, [executions, agentId, timezone]);
}

export async function runSimulation(agentKey: string) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("You are signed out. Please log in again.");

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-workflow-run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ agentKey }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Simulation failed (${res.status})`);
  return body;
}
