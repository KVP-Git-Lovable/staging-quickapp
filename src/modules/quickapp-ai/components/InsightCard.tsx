import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { AiInsight } from "../data/insightSeeds";

const priorityStyles: Record<AiInsight["priority"], string> = {
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-warning/10 text-warning border-warning/20",
  low: "bg-muted text-muted-foreground border-border",
};

/** Renders bare **bold** markers without pulling in a markdown renderer. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function InsightCard({ insight }: { insight: AiInsight }) {
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-2 pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">{insight.title}</CardTitle>
          <Badge variant="outline" className={cn("shrink-0 capitalize", priorityStyles[insight.priority])}>
            {insight.priority}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          <RichText text={insight.explanation} />
        </p>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3 pt-0">
        <div className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Impact: </span>
          {insight.impact}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Confidence</span>
            <span>{insight.confidence}%</span>
          </div>
          <Progress value={insight.confidence} className="h-1.5" />
        </div>

        {expanded && (
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {insight.details.map((d) => (
              <li key={d} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                <span>{d}</span>
              </li>
            ))}
            {insight.citations?.length ? (
              <li className="pt-1 text-[11px] italic">
                Sources: {insight.citations.map((c) => c.label).join(", ")}
              </li>
            ) : null}
          </ul>
        )}

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline"
        >
          {expanded ? "Hide details" : "Show details"}
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7", feedback === "up" && "text-primary")}
              aria-label="Helpful"
              onClick={() => {
                setFeedback("up");
                toast.success("Thanks — feedback noted.");
              }}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7", feedback === "down" && "text-destructive")}
              aria-label="Not helpful"
              onClick={() => {
                setFeedback("down");
                toast.success("Thanks — we'll tune this insight.");
              }}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="gap-1"
            onClick={() => toast.info("Actions for this insight are coming soon.")}
          >
            {insight.actionLabel ?? "Take action"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
