import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Loader2, Play, Sparkles } from "lucide-react";
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
                    {Math.round(r.recentValue).toLocaleString("en-IN")} (90 days)
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
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
