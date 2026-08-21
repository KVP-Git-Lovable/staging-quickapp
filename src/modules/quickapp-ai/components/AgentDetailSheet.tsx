import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Info, Loader2, Play, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { AiAgentRow, WorkflowExecution } from "../hooks/useAiWorkflows";
import { runSimulation } from "../hooks/useAiWorkflows";

interface Props {
  agent: AiAgentRow | null;
  executions: WorkflowExecution[];
  onOpenChange: (open: boolean) => void;
  onExecuted: () => void;
}

function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

/**
 * Read-only explanatory copy. Keep in step with the deterministic scoring
 * inputs in supabase/functions/ai-workflow-run — this list does not drive it.
 */
const SIMULATION_CONSIDERATIONS: Record<string, { signals: string[]; note: string }> = {
  visit_optimiser: {
    signals: [
      "Today's planned visits",
      "Days since each retailer was last visited",
      "Pending payment / outstanding dues",
      "Visit productivity — orders won per visit (30 days)",
      "Confirmed order value in the last 30 days",
      "Retailer priority class (A / B / C)",
      "GPS distance between stops (nearest-neighbour routing)",
      "Estimated total travel distance",
      "Typical time of day each retailer places orders (last 30 days) — early orderers come first on the route",
      "Retailers newly added to a beat (last 14 days) — flagged as fresh pitching opportunities with an AI reminder line each",
    ],
    note: "Each stop gets a deterministic score from recency, dues, productivity, order value and priority, then stops are ordered geographically to cut travel. AI only explains the computed route and writes the newcomer pitch reminders — no plans or visits are modified.",
  },
  churn_detector: {
    signals: [
      "Order value per retailer in the last 30 days",
      "Order value in the 30 days before that",
      "Percentage drop between the two periods",
      "Full 60-day order history (cancelled orders excluded)",
      "Ranking by steepest decline, then by lost value",
      "Top 10 at-risk retailers",
    ],
    note: "Churn risk is a pure period-over-period comparison of real order values — no visit or activity data is involved. AI only summarises the retailers the calculation flags — nothing is modified.",
  },
  beat_planner: {
    signals: [
      "Retailer count in each beat (plus an Unassigned bucket)",
      "Beat coverage — share of retailers visited in the last 30 days",
      "Average days since last visit per beat",
      "Pending dues totalled per beat",
      "Confirmed order value per beat (30 days)",
      "Field capacity of ~25 stops per visit day",
      "Suggested visit days per beat for next month",
      "Retailers newly added to each beat (last 14 days) — called out as fresh pitching opportunities",
    ],
    note: "Beats are ranked lowest-coverage-first and visit days are allocated from retailer counts and capacity. AI only turns the ranking into a recommendation — no beats, plans or visits are modified.",
  },
  sales_coach: {
    signals: [
      "Confirmed orders in the last 30 days",
      "Line-item value per product across all your orders",
      "Your top 5 products by sales value",
      "Order value and distinct products bought per retailer",
      "Each retailer's most-bought product",
      "Gap products — your top sellers a retailer is not yet buying",
      "Top 10 retailers by order value",
    ],
    note: "Product-mix gaps are computed by matching each retailer's purchases against your best sellers. AI only phrases the pitch suggestions — no orders or retailer data are modified.",
  },
};


export function AgentDetailSheet({ agent, executions, onOpenChange, onExecuted }: Props) {
  const [running, setRunning] = useState(false);
  const [liveResult, setLiveResult] = useState<any>(null);

  const latest = useMemo(
    () => (agent ? executions.find((e) => e.agent_id === agent.id) ?? null : null),
    [agent, executions],
  );

  const result = liveResult ?? latest?.result ?? null;

  const handleRun = async () => {
    if (!agent) return;
    setRunning(true);
    setLiveResult(null);
    try {
      const data = await runSimulation(agent.key);
      setLiveResult(data);
      toast.success("Simulation complete");
    } catch (e: any) {
      toast.error(e?.message ?? "Simulation failed");
    } finally {
      setRunning(false);
      onExecuted();
    }
  };

  return (
    <Sheet open={!!agent} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-base">{agent?.name}</SheetTitle>
          <SheetDescription className="text-xs">{agent?.description}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Status", value: latest?.status ?? "Not run" },
              { label: "Stage", value: latest?.stage ?? "workflow" },
              {
                label: "Duration",
                value: latest?.duration_ms ? `${(latest.duration_ms / 1000).toFixed(1)}s` : "—",
              },
              { label: "Last run", value: fmtTime(latest?.started_at) },
            ].map((m) => (
              <div key={m.label} className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="text-sm font-medium capitalize">{m.value}</p>
              </div>
            ))}
          </div>

          {latest?.error_message && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {latest.error_message}
            </p>
          )}

          {agent && SIMULATION_CONSIDERATIONS[agent.key] && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200">
                <Info className="h-3.5 w-3.5" />
                Simulation Considerations
              </div>
              <ul className="grid gap-x-3 gap-y-1 text-[11px] text-amber-900/90 dark:text-amber-100/80 sm:grid-cols-2">
                {SIMULATION_CONSIDERATIONS[agent.key].signals.map((s) => (
                  <li key={s} className="flex items-start gap-1.5">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 border-t border-amber-200/70 pt-2 text-[11px] leading-relaxed text-amber-800/90 dark:border-amber-900/50 dark:text-amber-100/70">
                {SIMULATION_CONSIDERATIONS[agent.key].note}
              </p>
            </div>
          )}


          <Button className="w-full gap-2" onClick={handleRun} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Running simulation…" : "Run Simulation"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Simulation is read-only — it computes real results without changing any plans, visits or orders.
          </p>

          {result?.summary && (
            <div className="rounded-lg border border-border p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Summary
              </div>
              <div className="prose prose-sm max-w-none text-xs dark:prose-invert">
                <ReactMarkdown>{result.summary}</ReactMarkdown>
              </div>
            </div>
          )}

          {result?.kind === "churn" && Array.isArray(result.rows) && (
            <div className="space-y-1.5">
              {result.rows.length === 0 && (
                <p className="text-xs text-muted-foreground">No declining retailers found.</p>
              )}
              {result.rows.map((r: any) => (
                <div key={r.retailerId} className="rounded-lg border border-border p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium">{r.name}</span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">-{r.dropPct}%</Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    ₹{Math.round(r.priorValue).toLocaleString("en-IN")} → ₹
                    {Math.round(r.recentValue).toLocaleString("en-IN")} (30 days)
                  </p>
                </div>
              ))}
            </div>
          )}

          {result?.kind === "route" && Array.isArray(result.stops) && (
            <div className="space-y-1.5">
              {result.stops.length === 0 && (
                <p className="text-xs text-muted-foreground">No visits planned for today.</p>
              )}
              {result.stops.map((s: any) => (
                <div key={s.retailerId} className="rounded-lg border border-border p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium">
                      {s.sequence}. {s.name}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">score {s.score}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {[
                      s.beat,
                      s.daysSinceLastVisit != null ? `${s.daysSinceLastVisit}d since visit` : null,
                      s.pending ? `₹${Math.round(s.pending).toLocaleString("en-IN")} pending` : null,
                      `${s.productivityPct}% productive`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              ))}
              {Array.isArray(result.newRetailers) && result.newRetailers.length > 0 && (
                <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/50 p-2.5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <p className="text-xs font-medium">
                    Newly added retailers ({result.newRetailers.length})
                  </p>
                  {result.newRetailers.map((n: any) => (
                    <p key={n.retailerId} className="mt-1 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">{n.name}</span>
                      {n.beat ? ` (${n.beat})` : ""} · added {n.daysOld}d ago — {n.line}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {result?.kind === "beat_plan" && Array.isArray(result.rows) && (
            <div className="space-y-1.5">
              {result.rows.length === 0 && (
                <p className="text-xs text-muted-foreground">No retailers found to plan beats for.</p>
              )}
              {result.rows.map((b: any) => (
                <div key={b.beat} className="rounded-lg border border-border p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium">{b.beat}</span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {b.coveragePct}% covered
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {[
                      `${b.retailers} retailers`,
                      `${b.visited30d} visited in 30d`,
                      b.newRetailers ? `${b.newRetailers} newly added` : null,
                      b.pending ? `₹${Math.round(b.pending).toLocaleString("en-IN")} pending` : null,
                      `${b.suggestedDays} visit day${b.suggestedDays !== 1 ? "s" : ""} suggested`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          )}

          {result?.kind === "coach" && Array.isArray(result.rows) && (
            <div className="space-y-1.5">
              {result.rows.length === 0 && (
                <p className="text-xs text-muted-foreground">No recent confirmed orders to coach on.</p>
              )}
              {result.rows.map((r: any) => (
                <div key={r.retailerId} className="rounded-lg border border-border p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium">{r.name}</span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {r.distinctProducts} product{r.distinctProducts !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {[
                      `₹${Math.round(r.orderValue).toLocaleString("en-IN")} in 30d`,
                      r.topProduct ? `top: ${r.topProduct}` : null,
                      r.gapProducts?.length ? `pitch: ${r.gapProducts.join(", ")}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
