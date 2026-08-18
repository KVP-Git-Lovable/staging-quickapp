import ReactMarkdown from "react-markdown";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { BeatPlannerInsights } from "@/hooks/useBeatPlannerInsights";

/**
 * AI Beat Planner narrative card for the My Beats page.
 *
 * Presentational only: the data comes from useBeatPlannerInsights (called
 * once by the page and shared with the beat cards). This card shows the
 * agent's narrative summary; the per-beat "beats to prioritise" details are
 * rendered as one-liners on each BeatCard instead.
 */

const fmtWhen = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString([], { day: "2-digit", month: "short" });
};

export function BeatPlannerInsightsCard({ insights }: { insights: BeatPlannerInsights }) {
  const { result, loading, running, failed, lastRunAt, refresh } = insights;

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
          <div className="flex items-center gap-1.5">
            {running && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analysing…
              </span>
            )}
            {!running && result && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground"
                title="Refresh insights"
                onClick={refresh}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {(loading || running) && !result && (
          <p className="mt-3 text-xs text-muted-foreground">
            Analysing your beats — coverage, pending dues and suggested visit days are being
            computed from your visits and orders…
          </p>
        )}

        {!loading && !running && !result && failed && (
          <p className="mt-3 text-xs text-muted-foreground">
            Beat insights are unavailable right now — they will refresh automatically the next time
            you open this page.
          </p>
        )}

        {result?.summary && (
          <div className="mt-3 rounded-lg bg-violet-50/70 p-3 dark:bg-violet-950/30">
            <div className="prose prose-sm max-w-none text-xs leading-relaxed dark:prose-invert [&_p]:my-1 [&_ul]:my-1">
              <ReactMarkdown>{result.summary}</ReactMarkdown>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
