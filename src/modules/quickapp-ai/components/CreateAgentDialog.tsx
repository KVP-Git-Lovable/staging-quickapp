import { useMemo, useState } from "react";
import { Bot, Cpu, Database, Loader2, Save, Sparkles, Table2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HIERARCHICAL_MODULES } from "@/components/security/hierarchicalPermissions";
import { tablesForModule } from "../data/moduleTableMap";
import { useIsWorkflowAdmin } from "../hooks/useCustomWorkflows";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * "Create AI Agent" builder — scaffold stage.
 *
 * Lets the user describe a custom AI agent against any application module:
 * source module (same list the Security & Access Control → Role
 * Permissions → Module Permission subtab shows), a read-only preview of
 * that module's database tables, a destination display module, and a
 * free-text objective. Save Draft keeps everything in local component
 * state and reveals the AI model/endpoint that will power the agent —
 * NOTHING is persisted to the server yet; execution wiring is a later
 * phase. No existing agents or workflows are touched.
 */

// Display constants mirroring the frozen server config
// (supabase/functions/_shared/together/config.ts). The edge module can't be
// imported into the client bundle, so the values are restated here verbatim.
const AI_MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo";
const AI_PROVIDER_ENDPOINT = "https://api.together.ai/v1/chat/completions";
const AI_EDGE_FUNCTION = "ai-workflow-run (Supabase Edge Function)";

interface AgentDraft {
  sourceModule: string;
  sourceLabel: string;
  tables: readonly string[];
  destModule: string;
  destLabel: string;
  objective: string;
}

interface CreatedAgent {
  name: string;
  description: string;
  blocks: string[];
}

export function CreateAgentDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const isAdmin = useIsWorkflowAdmin();
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedAgent | null>(null);
  const [sourceModule, setSourceModule] = useState("");
  const [destModule, setDestModule] = useState("");
  const [objective, setObjective] = useState("");
  const [draft, setDraft] = useState<AgentDraft | null>(null);

  const moduleOptions = useMemo(
    () => HIERARCHICAL_MODULES.map((m) => ({ name: m.name, label: m.label })),
    [],
  );
  const destOptions = useMemo(
    () => moduleOptions.filter((m) => m.name !== sourceModule),
    [moduleOptions, sourceModule],
  );
  const sourceTables = tablesForModule(sourceModule);
  const labelOf = (name: string) => moduleOptions.find((m) => m.name === name)?.label ?? name;

  const reset = () => {
    setSourceModule("");
    setDestModule("");
    setObjective("");
    setDraft(null);
    setCreated(null);
  };

  const canSave = !!sourceModule && !!destModule && objective.trim().length > 0;

  const saveDraft = () => {
    if (!canSave) return;
    setDraft({
      sourceModule,
      sourceLabel: labelOf(sourceModule),
      tables: sourceTables,
      destModule,
      destLabel: labelOf(destModule),
      objective: objective.trim(),
    });
  };

  const submitAgent = async () => {
    if (!canSave || submitting) return;
    setSubmitting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("You are signed out. Please log in again.");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-agent-builder`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceModule,
            sourceLabel: labelOf(sourceModule),
            destModule,
            destLabel: labelOf(destModule),
            objective: objective.trim(),
            tables: [...sourceTables],
          }),
        },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const message = body?.code === "admin_only"
          ? "Only administrators can create AI agents"
          : body?.error ?? `Submit failed (${res.status})`;
        throw new Error(message);
      }
      setCreated({
        name: body?.workflow?.name ?? "AI agent",
        description: body?.workflow?.description ?? "",
        blocks: Array.isArray(body?.blocks) ? body.blocks : [],
      });
      toast({
        title: "Agent created",
        description: "Your agent now appears under Custom Workflows on this page.",
      });
      onCreated?.();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not create agent",
        description: e instanceof Error ? e.message : "Unexpected error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-[100vw] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 left-0 top-0 sm:rounded-none">
        <DialogHeader className="border-b px-6 py-4 text-left">
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Create AI Agent
          </DialogTitle>
          <DialogDescription>
            Compose a custom AI agent for any application module — pick where it reads from,
            where its output is displayed, and what it should do. This stage saves a draft
            blueprint only; nothing is stored on the server yet.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto w-full max-w-3xl space-y-8">
            {/* 1 — source module */}
            <section className="space-y-3">
              <Label className="text-sm font-semibold">1. Select Module</Label>
              <p className="text-xs text-muted-foreground">
                The module this AI agent will work on. Same module list as Security &amp;
                Access Control → Role Permissions → Module Permission.
              </p>
              <Select
                value={sourceModule}
                onValueChange={(v) => {
                  setSourceModule(v);
                  if (destModule === v) setDestModule("");
                  setDraft(null);
                }}
              >
                <SelectTrigger className="w-full sm:w-96">
                  <SelectValue placeholder="Choose a module…" />
                </SelectTrigger>
                <SelectContent>
                  {moduleOptions.map((m) => (
                    <SelectItem key={m.name} value={m.name}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {sourceModule && (
                <div className="rounded-lg border border-dashed bg-muted/40 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Database className="h-3.5 w-3.5" />
                    Data tables in this module (reference only)
                  </p>
                  {sourceTables.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {sourceTables.map((t) => (
                        <span
                          key={t}
                          className="pointer-events-none inline-flex select-none items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground opacity-60"
                        >
                          <Table2 className="h-3 w-3" />
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs italic text-muted-foreground opacity-70">
                      No tables mapped yet for this module.
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* 2 — destination module */}
            <section className="space-y-3">
              <Label className="text-sm font-semibold">2. Destination display module</Label>
              <p className="text-xs text-muted-foreground">
                Where this agent's output should be displayed. The module selected above is
                excluded.
              </p>
              <Select
                value={destModule}
                onValueChange={(v) => {
                  setDestModule(v);
                  setDraft(null);
                }}
              >
                <SelectTrigger className="w-full sm:w-96">
                  <SelectValue placeholder="Choose the destination module…" />
                </SelectTrigger>
                <SelectContent>
                  {destOptions.map((m) => (
                    <SelectItem key={m.name} value={m.name}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            {/* 3 — objective */}
            <section className="space-y-3">
              <Label className="text-sm font-semibold">3. What should this AI agent do?</Label>
              <p className="text-xs text-muted-foreground">
                Describe, in your own words, what you expect of the AI agent that will work on
                the module selected in step 1.
              </p>
              <Textarea
                value={objective}
                onChange={(e) => {
                  setObjective(e.target.value);
                  setDraft(null);
                }}
                placeholder="e.g. Watch for retailers whose ordering pattern changes and suggest the best day and pitch for the next visit…"
                className="min-h-32"
              />
              <div className="flex items-center gap-3">
                <Button className="gap-2" disabled={!canSave} onClick={saveDraft}>
                  <Save className="h-4 w-4" />
                  Save Draft
                </Button>
                {isAdmin === true ? (
                  <Button
                    variant="default"
                    className="gap-2"
                    disabled={!canSave || submitting}
                    onClick={submitAgent}
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {submitting ? "Submitting…" : "Submit"}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Submit requires administrator access
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  Draft only — no server persistence at this stage.
                </span>
              </div>
            </section>

            {/* created agent — revealed after Submit */}
            {created && (
              <section className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Agent created
                </p>
                <dl className="space-y-2 text-sm">
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                    <dt className="w-44 shrink-0 text-muted-foreground">Agent name</dt>
                    <dd className="font-medium">{created.name}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                    <dt className="w-44 shrink-0 text-muted-foreground">Description</dt>
                    <dd className="whitespace-pre-wrap">{created.description}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                    <dt className="w-44 shrink-0 text-muted-foreground">Analysis blocks</dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {created.blocks.map((b) => (
                        <Badge key={b} variant="outline" className="font-mono text-[10px]">
                          {b}
                        </Badge>
                      ))}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                    <dt className="w-44 shrink-0 text-muted-foreground">AI model</dt>
                    <dd className="flex items-center gap-1.5 font-mono text-xs sm:text-sm">
                      <Cpu className="h-3.5 w-3.5 text-primary" />
                      {AI_MODEL}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                    <dt className="w-44 shrink-0 text-muted-foreground">AI endpoint</dt>
                    <dd className="break-all font-mono text-xs sm:text-sm">{AI_PROVIDER_ENDPOINT}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                    <dt className="w-44 shrink-0 text-muted-foreground">Invoked through</dt>
                    <dd className="font-mono text-xs sm:text-sm">{AI_EDGE_FUNCTION}</dd>
                  </div>
                </dl>
              </section>
            )}

            {/* blueprint — revealed after Save Draft */}
            {draft && (
              <section className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Agent blueprint (draft)
                </p>
                <dl className="space-y-2 text-sm">
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                    <dt className="w-44 shrink-0 text-muted-foreground">AI model</dt>
                    <dd className="flex items-center gap-1.5 font-mono text-xs sm:text-sm">
                      <Cpu className="h-3.5 w-3.5 text-primary" />
                      {AI_MODEL}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                    <dt className="w-44 shrink-0 text-muted-foreground">AI endpoint</dt>
                    <dd className="break-all font-mono text-xs sm:text-sm">{AI_PROVIDER_ENDPOINT}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                    <dt className="w-44 shrink-0 text-muted-foreground">Invoked through</dt>
                    <dd className="font-mono text-xs sm:text-sm">{AI_EDGE_FUNCTION}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                    <dt className="w-44 shrink-0 text-muted-foreground">Execution style</dt>
                    <dd>Deterministic SQL facts first — the AI only narrates and selects.</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                    <dt className="w-44 shrink-0 text-muted-foreground">Works on</dt>
                    <dd>
                      {draft.sourceLabel}{" "}
                      {draft.tables.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          ({draft.tables.join(", ")})
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                    <dt className="w-44 shrink-0 text-muted-foreground">Displays in</dt>
                    <dd>{draft.destLabel}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                    <dt className="w-44 shrink-0 text-muted-foreground">Objective</dt>
                    <dd className="whitespace-pre-wrap">{draft.objective}</dd>
                  </div>
                </dl>
                <Badge variant="outline" className="mt-3 text-[10px]">
                  Draft — execution wiring comes in a later phase
                </Badge>
              </section>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
