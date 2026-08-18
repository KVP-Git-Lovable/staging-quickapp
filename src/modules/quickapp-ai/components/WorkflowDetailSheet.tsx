import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Info, Loader2, Play, Sparkles, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { WorkflowExecution } from "../hooks/useAiWorkflows";
import {
  BLOCK_CATALOG, deactivateWorkflow, runWorkflow, type AiWorkflowRow,
} from "../hooks/useCustomWorkflows";

interface Props {
  workflow: AiWorkflowRow | null;
  executions: WorkflowExecution[];
  isAdmin: boolean;
  onOpenChange: (open: boolean) => void;
  onExecuted: () => void;
  onDeactivated: () => void;
}

function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function WorkflowDetailSheet({
  workflow, executions, isAdmin, onOpenChange, onExecuted, onDeactivated,
}: Props) {
  const [running, setRunning] = useState(false);
  const [liveResult, setLiveResult] = useState<any>(null);

  const latest = useMemo(
    () => (workflow ? executions.find((e) => e.workflow_id === workflow.id) ?? null : null),
    [workflow, executions],
  );

  const result = liveResult ?? latest?.result ?? null;

  const blockInfo = useMemo(() => {
    if (!workflow) return [];
    return (workflow.config?.blocks ?? []).map((b) => {
      const cat = BLOCK_CATALOG.find((c) => c.type === b.type);
      return {
        type: b.type,
        label: cat?.label ?? b.type,
        description: cat?.description ?? "",
        params: Object.entries(b.params ?? {}).map(([k, v]) => `${k}: ${v}`).join(" · "),
      };
    });
  }, [workflow]);

  const handleRun = async () => {
    if (!workflow) return;
    setRunning(true);
    setLiveResult(null);
    try {
      const data = await runWorkflow(workflow.id);
      setLiveResult(data);
      toast.success("Workflow run complete");
    } catch (e: any) {
      toast.error(e?.message ?? "Run failed");
    } finally {
      setRunning(false);
      onExecuted();
    }
  };

  const handleDeactivate = async () => {
    if (!workflow) return;
    try {
      await deactivateWorkflow(workflow.id);
      toast.success("Workflow deactivated — its run history is retained");
      onDeactivated();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not deactivate");
    }
  };

  return (
    <Sheet open={!!workflow} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-base">{workflow?.name}</SheetTitle>
          <SheetDescription className="text-xs">{workflow?.description}</SheetDescription>
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

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200">
              <Info className="h-3.5 w-3.5" />
              Analysis Blocks
            </div>
            <ul className="space-y-1.5 text-[11px] text-amber-900/90 dark:text-amber-100/80">
              {blockInfo.map((b) => (
                <li key={b.type} className="flex items-start gap-1.5">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                  <span>
                    <span className="font-medium">{b.label}</span>
                    {b.params ? ` (${b.params})` : ""} — {b.description}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 border-t border-amber-200/70 pt-2 text-[11px] leading-relaxed text-amber-800/90 dark:border-amber-900/50 dark:text-amber-100/70">
              Every number is computed deterministically from the running user's own data. AI only
              narrates the results — nothing is modified.
            </p>
          </div>

          <Button className="w-full gap-2" onClick={handleRun} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Running workflow…" : "Run Workflow"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Runs are read-only — real results are computed without changing any plans, visits or orders.
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

          {result?.kind === "custom" && Array.isArray(result.sections) &&
            result.sections.map((section: any) => (
              <div key={section.type} className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">{section.title}</p>
                {(!section.rows || section.rows.length === 0) && (
                  <p className="text-xs text-muted-foreground">No data for this block.</p>
                )}
                {(section.rows ?? []).map((row: any, i: number) => (
                  <div key={`${section.type}-${i}`} className="rounded-lg border border-border p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">{row.label}</span>
                      {row.badge && (
                        <Badge variant="outline" className="shrink-0 text-[10px]">{row.badge}</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{row.value}</p>
                  </div>
                ))}
              </div>
            ))}

          {isAdmin && workflow && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="w-full gap-2 text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                  Deactivate Workflow
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Deactivate “{workflow.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The workflow disappears from everyone's list. Its run history is kept for audit
                    — workflows are never deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeactivate}>Deactivate</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
