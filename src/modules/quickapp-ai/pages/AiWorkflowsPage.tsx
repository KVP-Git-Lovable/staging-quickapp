import { useMemo, useState } from "react";
import {
  Play, Users, BarChart3, Lightbulb, CheckCircle2, Rocket, ChevronRight,
  GraduationCap, Route, AlertTriangle, Wallet, Boxes, MapPinned, Plus, Activity,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RUNNABLE_AGENTS, STATUS_LABEL, useAiAgents, useWorkflowExecutions, useWorkflowMetrics,
  type AiAgentRow,
} from "../hooks/useAiWorkflows";
import { useCustomWorkflows, useIsWorkflowAdmin, type AiWorkflowRow } from "../hooks/useCustomWorkflows";
import { AgentDetailSheet } from "../components/AgentDetailSheet";
import { CreateAgentDialog } from "../components/CreateAgentDialog";
import { CreateWorkflowDialog } from "../components/CreateWorkflowDialog";
import { WorkflowDetailSheet } from "../components/WorkflowDetailSheet";

const builderSteps = [
  { label: "Start", icon: Play },
  { label: "Fetch Retailers", icon: Users },
  { label: "Analyse Orders", icon: BarChart3 },
  { label: "Generate Insights", icon: Lightbulb },
  { label: "Review", icon: CheckCircle2 },
  { label: "Deploy", icon: Rocket },
];

const agents = [
  { key: "sales_coach", name: "Sales Coach", icon: GraduationCap, desc: "Coaches reps on pitch and product mix per retailer.", status: "Coming Soon" },
  { key: "visit_optimiser", name: "Visit Optimiser", icon: Route, desc: "Reorders the day's beat to cut travel and add visits.", status: "Prototype" },
  { key: "churn_detector", name: "Churn Detector", icon: AlertTriangle, desc: "Flags retailers going quiet before they stop ordering.", status: "Prototype" },
  { key: "collections_assistant", name: "Collections Assistant", icon: Wallet, desc: "Prioritises overdue balances for the next visit.", status: "Coming Soon" },
  { key: "stock_advisor", name: "Stock Advisor", icon: Boxes, desc: "Suggests distributor stock ahead of demand spikes.", status: "Coming Soon" },
  { key: "beat_planner", name: "Beat Planner", icon: MapPinned, desc: "Drafts monthly beat plans from coverage targets.", status: "Coming Soon" },
];

const AGENT_ICONS: Record<string, React.ElementType> = {
  sales_coach: GraduationCap,
  visit_optimiser: Route,
  churn_detector: AlertTriangle,
  collections_assistant: Wallet,
  stock_advisor: Boxes,
  beat_planner: MapPinned,
};

const pipeline = ["Workflow", "Validation", "Simulation", "Production", "Monitoring"];

function StepChain({
  steps,
  activeIndex,
}: {
  steps: { label: string; icon?: React.ElementType }[];
  activeIndex?: number;
}) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-0">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-2 md:flex-1 md:flex-col md:gap-2">
          <div
            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 md:flex-col md:gap-1.5 md:px-2 md:py-3 md:text-center ${
              activeIndex === i
                ? "border-primary bg-primary/10"
                : "border-border bg-muted/40"
            }`}
          >
            {step.icon ? <step.icon className="h-4 w-4 shrink-0 text-primary" /> : null}
            <span className="text-xs font-medium leading-tight">{step.label}</span>
          </div>
          {i < steps.length - 1 && (
            <ChevronRight className="h-4 w-4 shrink-0 rotate-90 text-muted-foreground md:rotate-0 md:-mt-6" />
          )}
        </div>
      ))}
    </div>
  );
}

export default function AiWorkflowsPage() {
  const dbAgents = useAiAgents();
  const { executions, refresh } = useWorkflowExecutions();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Custom workflows ("Create Workflow"). Kept separate from the seed-agent
  // system: agent metrics/pipeline below are scoped to agent executions only,
  // so custom runs never change what the existing tiles mean.
  const { workflows, refresh: refreshWorkflows } = useCustomWorkflows();
  const isAdmin = useIsWorkflowAdmin();
  const [createOpen, setCreateOpen] = useState(false);
  // "Create AI Agent" builder (scaffold stage — drafts only, no server writes).
  const [createAgentOpen, setCreateAgentOpen] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const selectedWorkflow: AiWorkflowRow | null =
    workflows.find((w) => w.id === selectedWorkflowId) ?? null;
  const agentExecutions = useMemo(
    () => executions.filter((e) => e.agent_id != null),
    [executions],
  );

  const cards = useMemo(() => {
    if (!dbAgents?.length) {
      return agents.map((a) => ({
        id: null as string | null,
        key: a.key,
        name: a.name,
        desc: a.desc,
        status: a.status,
        icon: a.icon,
      }));
    }
    return dbAgents.map((a) => ({
      id: a.id,
      key: a.key,
      name: a.name,
      desc: a.description,
      status: STATUS_LABEL[a.status] ?? a.status,
      icon: AGENT_ICONS[a.key] ?? Activity,
    }));
  }, [dbAgents]);

  const selectedAgent: AiAgentRow | null =
    dbAgents?.find((a) => a.id === selectedId) ?? null;

  const metrics = useWorkflowMetrics(agentExecutions, selectedId);
  const latestForSelection = selectedId
    ? agentExecutions.find((e) => e.agent_id === selectedId)
    : agentExecutions[0];
  const activeStageIndex = latestForSelection
    ? pipeline.findIndex((p) => p.toLowerCase() === latestForSelection.stage)
    : -1;

  const metricTiles = [
    { label: "Success Rate", value: metrics.successRate, hint: "Once workflows run" },
    { label: "Avg Response Time", value: metrics.avgResponse, hint: "Per execution" },
    { label: "Executions Today", value: metrics.executionsToday, hint: "Across all agents" },
  ];

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold md:text-2xl">AI Workflows</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Design, review and deploy AI-assisted automations across your sales operation.
        </p>
      </header>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Workflow Builder</CardTitle>
          </CardHeader>
          <CardContent>
            <StepChain steps={builderSteps} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">AI Agents</CardTitle>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCreateAgentOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Create AI Agent
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((a) => {
              const runnable = RUNNABLE_AGENTS.has(a.key) && !!a.id;
              const isPrototype = a.status === "Prototype";
              return (
                <div
                  key={a.name}
                  onClick={runnable ? () => setSelectedId(a.id) : undefined}
                  className={`rounded-lg border p-3 ${
                    isPrototype
                      ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/30"
                      : "border-border"
                  } ${
                    runnable
                      ? `cursor-pointer transition-colors ${
                          isPrototype
                            ? "hover:bg-emerald-100/70 dark:hover:bg-emerald-950/50"
                            : "hover:bg-muted/50"
                        }`
                      : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                        <a.icon className="h-4 w-4 text-primary" />
                      </span>
                      <span className="text-sm font-medium">{a.name}</span>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">{a.status}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{a.desc}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <WorkflowIcon className="h-4 w-4 text-primary" />
              Custom Workflows
            </CardTitle>
          </CardHeader>
          <CardContent>
            {workflows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No custom workflows yet.
                {isAdmin === true
                  ? " Use Create Workflow below to compose one from analysis blocks."
                  : " An administrator can create one with the Create Workflow button."}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {workflows.map((w) => (
                  <div
                    key={w.id}
                    onClick={() => setSelectedWorkflowId(w.id)}
                    className="cursor-pointer rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                          <WorkflowIcon className="h-4 w-4 text-primary" />
                        </span>
                        <span className="text-sm font-medium">{w.name}</span>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {w.config?.blocks?.length ?? 0} block{(w.config?.blocks?.length ?? 0) === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {w.description || "Custom analysis workflow."}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              Deployment Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StepChain
              steps={pipeline.map((label) => ({ label }))}
              activeIndex={activeStageIndex >= 0 ? activeStageIndex : undefined}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              {metricTiles.map((m) => (
                <div key={m.label} className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-lg font-semibold">{m.value}</p>
                  <p className="text-[11px] text-muted-foreground">{m.hint}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {isAdmin === true && (
          <div className="flex justify-center pb-2">
            <Button size="lg" className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create Workflow
            </Button>
          </div>
        )}
      </div>

      <AgentDetailSheet
        agent={selectedAgent}
        executions={executions}
        onOpenChange={(open) => !open && setSelectedId(null)}
        onExecuted={refresh}
      />

      <CreateWorkflowDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={refreshWorkflows}
      />

      <CreateAgentDialog
        open={createAgentOpen}
        onOpenChange={setCreateAgentOpen}
        onCreated={refreshWorkflows}
      />

      <WorkflowDetailSheet
        workflow={selectedWorkflow}
        executions={executions}
        isAdmin={isAdmin === true}
        onOpenChange={(open) => !open && setSelectedWorkflowId(null)}
        onExecuted={refresh}
        onDeactivated={refreshWorkflows}
      />
    </div>
  );
}
