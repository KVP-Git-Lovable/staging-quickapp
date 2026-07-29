import { toast } from "sonner";
import {
  Play, Users, BarChart3, Lightbulb, CheckCircle2, Rocket, ChevronRight,
  GraduationCap, Route, AlertTriangle, Wallet, Boxes, MapPinned, Plus, Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const builderSteps = [
  { label: "Start", icon: Play },
  { label: "Fetch Retailers", icon: Users },
  { label: "Analyse Orders", icon: BarChart3 },
  { label: "Generate Insights", icon: Lightbulb },
  { label: "Review", icon: CheckCircle2 },
  { label: "Deploy", icon: Rocket },
];

const agents = [
  { name: "Sales Coach", icon: GraduationCap, desc: "Coaches reps on pitch and product mix per retailer.", status: "Coming Soon" },
  { name: "Visit Optimiser", icon: Route, desc: "Reorders the day's beat to cut travel and add visits.", status: "Prototype" },
  { name: "Churn Detector", icon: AlertTriangle, desc: "Flags retailers going quiet before they stop ordering.", status: "Prototype" },
  { name: "Collections Assistant", icon: Wallet, desc: "Prioritises overdue balances for the next visit.", status: "Coming Soon" },
  { name: "Stock Advisor", icon: Boxes, desc: "Suggests distributor stock ahead of demand spikes.", status: "Coming Soon" },
  { name: "Beat Planner", icon: MapPinned, desc: "Drafts monthly beat plans from coverage targets.", status: "Coming Soon" },
];

const pipeline = ["Workflow", "Validation", "Simulation", "Production", "Monitoring"];

const metrics = [
  { label: "Success Rate", value: "—", hint: "Once workflows run" },
  { label: "Avg Response Time", value: "—", hint: "Per execution" },
  { label: "Executions Today", value: "—", hint: "Across all agents" },
];

function StepChain({ steps }: { steps: { label: string; icon?: React.ElementType }[] }) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-0">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-2 md:flex-1 md:flex-col md:gap-2">
          <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 md:flex-col md:gap-1.5 md:px-2 md:py-3 md:text-center">
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
            <CardTitle className="text-base">AI Agents</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {agents.map((a) => (
              <div key={a.name} className="rounded-lg border border-border p-3">
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
            ))}
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
            <StepChain steps={pipeline.map((label) => ({ label }))} />
            <div className="grid gap-3 sm:grid-cols-3">
              {metrics.map((m) => (
                <div key={m.label} className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-lg font-semibold">{m.value}</p>
                  <p className="text-[11px] text-muted-foreground">{m.hint}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center pb-2">
          <Button size="lg" className="gap-2" onClick={() => toast.info("Workflow creation is coming soon.")}>
            <Plus className="h-4 w-4" />
            Create Workflow
          </Button>
        </div>
      </div>
    </div>
  );
}
