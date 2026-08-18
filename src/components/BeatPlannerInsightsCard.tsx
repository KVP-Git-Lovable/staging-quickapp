import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import {
  CalendarPlus, ChevronDown, ChevronUp, Loader2, RefreshCw, Sparkles, Wand2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { runSimulation } from "@/modules/quickapp-ai/hooks/useAiWorkflows";

/**
 * Actionable Beat Planner insights for the My Beats page.
 *
 * Pure CONSUMER of the existing QuickApp AI Beat Planner agent: it calls the
 * same ai-workflow-run flow (deterministic beat-coverage analysis under the
 * user's RLS + Together.ai narration) and renders the stored result. The
 * agent's logic, prompts and execution logging are untouched — on load the
 * card shows the user's latest successful run, and Refresh triggers a new
 * run through the exact same pipeline the AI Workflows page uses.
 */

interface BeatPlanRow {
  beat: string;
  retailers: number;
  visited30d: number;
  coveragePct: number;
  pending: number;
  orderValue: number;
  avgDaysSinceVisit: number | null;
  suggestedDays: number;
}

interface BeatPlanResult {
  kind: string;
  rows: BeatPlanRow[];
  date?: string;
  totalRetailers?: number;
  summary?: string;
}

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const coverageTone = (pct: number) =>
  pct < 30
    ? { bar: "[&>div]:bg-rose-500", badge: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300" }
    : pct < 60
      ? { bar: "[&>div]:bg-amber-500", badge: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300" }
      : { bar: "[&>div]:bg-emerald-500", badge: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300" };

const fmtWhen = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString([], { day: "2-digit", month: "short" });
};

const PREVIEW_COUNT = 4;

export function BeatPlannerInsightsCard() {
  const navigate = useNavigate();
  const [result, setResult] = useState<BeatPlanResult | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Latest successful Beat Planner run for this user (RLS-scoped).
  const loadLatest = useCallback(async () => {
    try {
      const { data: agent } = await supabase
        .from("ai_agents")
        .select("id")
        .eq("key", "beat_planner")
        .maybeSingle();
      if (!agent?.id) return;
      const { data } = await supabase
        .from("workflow_executions")
        .select("result, started_at")
        .eq("agent_id", agent.id)
        .eq("status", "success")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const res = (data?.result ?? null) as BeatPlanResult | null;
      if (res?.kind === "beat_plan") {
        setResult(res);
        setLastRunAt(data?.started_at ?? null);
      }
    } catch (e) {
      console.error("[BeatPlannerInsights] load latest failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  const handleRun = async () => {
    setRunning(true);
    try {
      const data = await runSimulation("beat_planner");
      if (data?.kind === "beat_plan") {
        setResult(data as BeatPlanResult);
        setLastRunAt(new Date().toISOString());
      }
      toast.success("Beat insights updated");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not generate beat insights");
    } finally {
      setRunning(false);
    }
  };

  const rows = useMemo(() => result?.rows ?? [], [result]);
  const visibleRows = showAll ? rows : rows.slice(0, PREVIEW_COUNT);
  const needsAttention = rows.filter((r) => r.coveragePct < 60).length;

  return (
    <Card className="overflow-hidden border-violet-200/70 dark:border-violet-900/40">
      <div className="h-1 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400" />
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/15 to-fuchsia-500/15">
              <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight">AI Beat Planner</p>
              <p className="text-xs text-muted-foreground leading-tight">
                {lastRunAt
                  ? `Coverage insights for your beats · updated ${fmtWhen(lastRunAt)}`
                  : "Coverage insights for your beats"}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant={result ? "outline" : "default"}
            className="gap-1.5"
            onClick={handleRun}
            disabled={running}
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : result ? <RefreshCw className="h-3.5 w-3.5" /> : <Wand2 className="h-3.5 w-3.5" />}
            {running ? "Analysing…" : result ? "Refresh" : "Generate insights"}
          </Button>
        </div>

        {loading && !result && (
          <p className="mt-3 text-xs text-muted-foreground">Checking your latest beat analysis…</p>
        )}

        {!loading && !result && !running && (
          <p className="mt-3 text-xs text-muted-foreground">
            Get a prioritised, data-driven view of which beats need attention — coverage, pending
            dues and suggested visit days per beat, computed from your own visits and orders.
          </p>
        )}

        {result && (
          <div className="mt-3 space-y-3">
            {result.summary && (
              <div className="rounded-lg bg-violet-50/70 p-3 dark:bg-violet-950/30">
                <div className="prose prose-sm max-w-none text-xs leading-relaxed dark:prose-invert [&_p]:my-1 [&_ul]:my-1">
                  <ReactMarkdown>{result.summary}</ReactMarkdown>
                </div>
              </div>
            )}

            {rows.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Beats to prioritise
                  </p>
                  {needsAttention > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      {needsAttention} beat{needsAttention === 1 ? "" : "s"} under 60% coverage
                    </Badge>
                  )}
                </div>
                <div className="grid gap-2 lg:grid-cols-2">
                  {visibleRows.map((r) => {
                    const tone = coverageTone(r.coveragePct);
                    return (
                      <div key={r.beat} className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{r.beat}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone.badge}`}>
                            {r.coveragePct}% covered
                          </span>
                        </div>
                        <Progress value={r.coveragePct} className={`mt-2 h-1.5 ${tone.bar}`} />
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {r.visited30d}/{r.retailers} retailers visited in 30d
                          {r.avgDaysSinceVisit != null ? ` · avg ${r.avgDaysSinceVisit}d since visit` : ""}
                          {` · pending ${inr(r.pending)} · 90d sales ${inr(r.orderValue)}`}
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-violet-700 dark:text-violet-300">
                            Suggested: {r.suggestedDays} visit day{r.suggestedDays === 1 ? "" : "s"} next month
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 px-2 text-xs text-primary"
                            onClick={() => navigate("/beat-planning")}
                          >
                            <CalendarPlus className="h-3.5 w-3.5" />
                            Plan
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {rows.length > PREVIEW_COUNT && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full gap-1 text-xs text-muted-foreground"
                    onClick={() => setShowAll((s) => !s)}
                  >
                    {showAll ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {showAll ? "Show fewer" : `Show all ${rows.length} beats`}
                  </Button>
                )}
              </>
            )}

            {rows.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No beat data to analyse yet — add retailers to your beats and start visiting to get
                coverage insights.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
