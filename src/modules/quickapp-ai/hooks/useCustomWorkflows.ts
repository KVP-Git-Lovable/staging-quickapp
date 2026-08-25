// Frontend logic for custom AI workflows ("Create Workflow").
//
// Deliberately separate from useAiWorkflows.ts, which serves the frozen seed
// agents — that file only carries the minimal type/select compatibility diff.
// Admins create shared workflow definitions (RLS enforces the admin gate);
// every user with module access can see and run them, and each run analyses
// only the running user's own RLS-scoped data.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type WorkflowTone = "encouraging" | "direct" | "formal";

export interface WorkflowBlockConfig {
  type: string;
  params: Record<string, number>;
}

export interface WorkflowConfig {
  version: 1;
  blocks: WorkflowBlockConfig[];
  narration: { focus: string; tone: WorkflowTone };
}

export interface AiWorkflowRow {
  id: string;
  name: string;
  description: string;
  config: WorkflowConfig;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** The block catalogue mirrored from the edge function's blocks.ts — labels,
 * descriptions and parameter bounds are cosmetic here; the server re-clamps
 * every parameter on each run. */
export const BLOCK_CATALOG: Array<{
  type: string;
  label: string;
  description: string;
  params: Array<{ key: string; label: string; min: number; max: number; default: number }>;
}> = [
  {
    type: "declining_retailers",
    label: "Declining retailers",
    description: "Retailers whose order value dropped vs the preceding window.",
    params: [
      { key: "windowDays", label: "Window (days)", min: 7, max: 180, default: 30 },
      { key: "topN", label: "Show top", min: 3, max: 15, default: 10 },
    ],
  },
  {
    type: "top_retailers",
    label: "Top retailers",
    description: "Highest confirmed order value in the window.",
    params: [
      { key: "windowDays", label: "Window (days)", min: 7, max: 180, default: 30 },
      { key: "topN", label: "Show top", min: 3, max: 15, default: 10 },
    ],
  },
  {
    type: "pending_dues",
    label: "Pending dues",
    description: "Retailers with the highest outstanding balances.",
    params: [
      { key: "minAmount", label: "Minimum amount (₹)", min: 0, max: 100000, default: 0 },
      { key: "topN", label: "Show top", min: 3, max: 15, default: 10 },
    ],
  },
  {
    type: "beat_coverage",
    label: "Beat coverage",
    description: "Share of each beat's retailers visited recently, lowest first.",
    params: [
      { key: "coverageDays", label: "Coverage window (days)", min: 7, max: 90, default: 30 },
      { key: "stopsPerDay", label: "Stops per day", min: 5, max: 60, default: 25 },
    ],
  },
  {
    type: "product_mix",
    label: "Product mix",
    description: "Top products by sales value across confirmed orders.",
    params: [
      { key: "windowDays", label: "Window (days)", min: 7, max: 180, default: 30 },
      { key: "topN", label: "Show top", min: 3, max: 10, default: 5 },
    ],
  },
  {
    type: "visit_productivity",
    label: "Visit productivity",
    description: "Orders won per visit, overall and per retailer.",
    params: [{ key: "windowDays", label: "Window (days)", min: 7, max: 90, default: 30 }],
  },
];

export function useCustomWorkflows() {
  const [workflows, setWorkflows] = useState<AiWorkflowRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("ai_workflows")
      .select("id, name, description, config, is_active, created_by, created_at, updated_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) console.error("[custom-workflows] load", error);
    setWorkflows((data ?? []) as unknown as AiWorkflowRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { workflows, loading, refresh };
}

export async function createWorkflow(input: {
  name: string;
  description: string;
  config: WorkflowConfig;
}) {
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess.session?.user?.id ?? null;
  const { data, error } = await supabase
    .from("ai_workflows")
    .insert({
      name: input.name,
      description: input.description,
      config: input.config as any,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) {
    // RLS rejects non-admin inserts with a row-level security violation.
    if (/row-level security/i.test(error.message)) {
      throw new Error("Only administrators can create workflows.");
    }
    throw new Error(error.message);
  }
  return data?.id as string;
}

export async function deactivateWorkflow(id: string) {
  const { error } = await supabase
    .from("ai_workflows")
    .update({ is_active: false })
    .eq("id", id);
  if (error) {
    if (/row-level security/i.test(error.message)) {
      throw new Error("Only administrators can deactivate workflows.");
    }
    throw new Error(error.message);
  }
}

/** Run a custom workflow via the same edge function the agents use — the
 * request body just carries workflowId instead of agentKey. */
export async function runWorkflow(workflowId: string) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("You are signed out. Please log in again.");

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-workflow-run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ workflowId }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Run failed (${res.status})`);
  return body;
}

/** Client-side gate for the Create button. Uses the is_system_admin RPC,
 * whose predicate is identical to the has_role('admin') check in the
 * ai_workflows RLS policies — so the UI and the database always agree. */
export function useIsWorkflowAdmin(): boolean | null {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setIsAdmin(null);
      return;
    }
    void (async () => {
      const { data, error } = await supabase.rpc("is_system_admin", { _user_id: user.id });
      if (cancelled) return;
      if (error) {
        console.error("[custom-workflows] admin check", error);
        setIsAdmin(false);
        return;
      }
      setIsAdmin(data === true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return isAdmin;
}
