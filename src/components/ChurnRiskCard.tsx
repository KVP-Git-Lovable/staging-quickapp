import { Loader2, RefreshCw, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useChurnRisk, type ChurnResult } from "@/hooks/useChurnRisk";

/**
 * Churn Risk card for My Retailers — consumer of the frozen churn_detector
 * agent via useChurnRisk. Displays 2-4 nudging sentences computed
 * deterministically from the agent's stored result; observed decline only,
 * no prediction claims, assistant tone (not alarmist).
 */

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const fmtWhen = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString([], { day: "2-digit", month: "short" });
};

/** 2-4 sentences, scaled to how many retailers are actually declining. */
function churnSentences(result: ChurnResult): string[] {
  const rows = result.rows ?? [];
  const analysed = result.analysed ?? 0;

  if (rows.length === 0) {
    return [
      `All ${analysed} retailer${analysed === 1 ? "" : "s"} analysed are holding steady — none has cut their orders compared with the previous 30-day period.`,
      "Keep the momentum going with your regular visit rhythm.",
    ];
  }

  const [worst, second, third] = rows;
  const sentences: string[] = [];

  sentences.push(
    rows.length === 1
      ? `1 of your ${analysed} retailers has reduced their orders in the last 30 days — they may need a little extra attention.`
      : `${rows.length} of your ${analysed} retailers have reduced their orders in the last 30 days — they may need a little extra attention.`,
  );

  sentences.push(
    `${worst.name} stands out: orders are down ${worst.dropPct}% (${inr(worst.priorValue)} → ${inr(worst.recentValue)}) — a visit this week could be a good opportunity to reconnect.`,
  );

  if (rows.length === 2) {
    sentences.push(
      `${second.name} (−${second.dropPct}%) is ordering less too — worth adding to your next beat plan.`,
    );
  } else if (rows.length >= 3) {
    sentences.push(
      `${second.name} (−${second.dropPct}%) and ${third.name} (−${third.dropPct}%) are also ordering less than before.`,
    );
    const stake = rows.reduce((s, r) => s + (Number(r.priorValue) || 0), 0);
    sentences.push(
      `Together, these stores generated ${inr(stake)} in orders in the previous 30-day period — a good reason to reconnect before the dip grows.`,
    );
  }

  return sentences;
}

export function ChurnRiskCard() {
  const { result, loading, running, failed, lastRunAt, refresh } = useChurnRisk();

  return (
    <Card className="overflow-hidden border-amber-200/70 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-100 dark:border-amber-900/40 dark:from-amber-950/40 dark:via-yellow-950/30 dark:to-orange-950/30">
      <div className="h-1 bg-gradient-to-r from-amber-400 via-yellow-400 to-orange-400" />
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15">
              <TrendingDown className="h-5 w-5 text-amber-700 dark:text-amber-400" />
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight text-amber-950 dark:text-amber-100">
                Churn Risk
              </p>
              <p className="text-xs leading-tight text-amber-900/70 dark:text-amber-200/70">
                {lastRunAt
                  ? `From your order history · updated ${fmtWhen(lastRunAt)}`
                  : "From your order history"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {running && (
              <span className="flex items-center gap-1.5 text-xs text-amber-900/70 dark:text-amber-200/70">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analysing…
              </span>
            )}
            {!running && result && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-amber-900/60 hover:text-amber-900 dark:text-amber-200/60"
                title="Re-run churn analysis"
                onClick={refresh}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {(loading || running) && !result && (
          <p className="mt-3 text-xs text-amber-900/80 dark:text-amber-100/80">
            Analysing your retailers — comparing each store's last 30 days of orders with the 30
            days before…
          </p>
        )}

        {!loading && !running && !result && failed && (
          <p className="mt-3 text-xs text-amber-900/80 dark:text-amber-100/80">
            Churn insights are unavailable right now — use the refresh icon to try again.
          </p>
        )}

        {result && (
          <ul className="mt-3 space-y-1.5">
            {churnSentences(result).map((s, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[13px] leading-snug text-amber-950 dark:text-amber-100"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
