import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Navigation, RotateCcw, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { RouteStop } from "@/hooks/useVisitOptimizerInsights";

/**
 * "AI Visit Optimizer" section for /visits/retailers — consumer of the same
 * stored visit_optimiser run that powers the AI Workflows agent. The agent
 * computed the stop order server-side (recency, pending dues, productivity,
 * priority, typical order time of day, and nearest-neighbour GPS routing);
 * this card only narrates it and, on "Suggest Route", asks the page to
 * re-arrange the retailer list into that order. No agent runs are triggered
 * here and nothing is written to the database.
 */

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** One short reason line per stop, built from the agent's own numbers. */
function stopReason(s: RouteStop): string {
  const parts: string[] = [];
  if (s.typicalOrderTime) parts.push(`usually orders around ${s.typicalOrderTime}`);
  if (s.daysSinceLastVisit == null) parts.push("not visited yet");
  else if (s.daysSinceLastVisit > 0) parts.push(`last visit ${s.daysSinceLastVisit}d ago`);
  if (s.pending > 0) parts.push(`${inr(s.pending)} pending`);
  if (s.visits > 0) parts.push(`${s.productivityPct}% order strike rate`);
  return parts.join(" · ");
}

/** Runs of consecutive stops within ~1 km of each other — worth covering in
 * one stretch. Display-only grouping over the agent's geo-ordered route. */
function nearbyClusters(stops: RouteStop[]): string[][] {
  const clusters: string[][] = [];
  let run: string[] = [];
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (a.lat != null && a.lng != null && b.lat != null && b.lng != null &&
        haversineKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }) <= 1) {
      if (!run.length) run = [a.name];
      run.push(b.name);
    } else if (run.length) {
      clusters.push(run);
      run = [];
    }
  }
  if (run.length) clusters.push(run);
  return clusters.filter((c) => c.length >= 2).slice(0, 2);
}

interface Props {
  stops: RouteStop[];
  totalKm: number;
  /** AI's one-line explanation of the chosen order (empty = baseline copy). */
  routeNote?: string;
  loading: boolean;
  applied: boolean;
  onSuggestRoute: () => void;
  onReset: () => void;
}

export function VisitOptimizerRouteCard({ stops, totalKm, routeNote, loading, applied, onSuggestRoute, onReset }: Props) {
  // Details (subtitle, day summary, stop list, clusters) are collapsed by
  // default; only the title and Suggest Route stay visible until the user
  // opens "See more...".
  const [expanded, setExpanded] = useState(false);

  if (!loading && stops.length === 0) return null;

  const top = stops.slice(0, 5);
  const clusters = nearbyClusters(stops);

  return (
    <Card className="overflow-hidden border-2 border-red-500 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-100 dark:border-red-600 dark:from-amber-950/40 dark:via-yellow-950/30 dark:to-orange-950/30">
      <div className="h-1 bg-gradient-to-r from-red-500 via-amber-400 to-orange-500" />
      <CardContent className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-red-500/15 to-amber-500/20">
              <Navigation className="h-4 w-4 text-amber-700 dark:text-amber-400" />
            </span>
            <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">AI Visit Optimizer</p>
            {loading && (
              <span className="flex items-center gap-1 text-xs text-amber-900/70 dark:text-amber-200/70">
                <Loader2 className="h-3 w-3 animate-spin" /> planning…
              </span>
            )}
          </div>
          {!loading && stops.length > 0 && (
            <div className="flex items-center gap-1.5">
              {applied && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1 text-amber-900/70 hover:text-amber-950 dark:text-amber-200/70"
                  onClick={onReset}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </Button>
              )}
              <Button
                size="sm"
                className="gap-1.5 bg-black text-white hover:bg-black/85 dark:bg-black dark:text-white dark:hover:bg-black/85"
                onClick={onSuggestRoute}
                disabled={applied}
              >
                <Zap className="h-3.5 w-3.5" />
                {applied ? "Route Applied" : "Suggest Route"}
              </Button>
            </div>
          )}
        </div>

        {!loading && stops.length > 0 && expanded && (
          <div id="visit-optimizer-details">
            <p className="mt-2 text-[11px] leading-tight text-amber-900/70 dark:text-amber-200/70">
              Best visiting order from your order times, GPS distances and dues
            </p>

            <p className="mt-2.5 text-xs text-amber-950 dark:text-amber-100">
              {`${stops.length} stop${stops.length === 1 ? "" : "s"} planned today`}
              {totalKm > 0 ? ` — about ${totalKm.toFixed(1)} km if you follow this order.` : "."}
              {routeNote
                ? ` ${routeNote}`
                : " Start where the day starts: stores that order early come first, and nearby stores are chained together to cut travel."}
            </p>

            <ol className="mt-2 space-y-1">
              {top.map((s) => (
                <li key={s.retailerId} className="flex items-start gap-2 text-[12px] leading-snug text-amber-950 dark:text-amber-100">
                  <span className="mt-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500/20 px-1 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                    {s.sequence}
                  </span>
                  <span>
                    <span className="font-medium">{s.name}</span>
                    {stopReason(s) ? <span className="text-amber-900/80 dark:text-amber-200/80"> — {stopReason(s)}</span> : null}
                  </span>
                </li>
              ))}
              {stops.length > top.length && (
                <li className="pl-6 text-[11px] text-amber-900/70 dark:text-amber-200/70">
                  …and {stops.length - top.length} more in the suggested order.
                </li>
              )}
            </ol>

            {clusters.map((c, i) => (
              <p key={i} className="mt-2 text-[11px] text-amber-900/80 dark:text-amber-200/80">
                <span className="font-medium">Close together:</span>{" "}
                {c.slice(0, -1).join(", ")} and {c[c.length - 1]} are within about a kilometre of each other — cover them in one stretch.
              </p>
            ))}
          </div>
        )}

        {!loading && stops.length > 0 && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="visit-optimizer-details"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1.5 flex items-center gap-1 text-xs font-medium text-amber-900/80 hover:text-amber-950 dark:text-amber-200/80 dark:hover:text-amber-100"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? "See less" : "See more..."}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
