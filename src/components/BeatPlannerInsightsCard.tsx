import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { CalendarCheck2, Loader2, RefreshCw, Sparkles, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toLocalISODate } from "@/utils/dateUtils";
import type { BeatPlannerInsights, BeatPlanRow } from "@/hooks/useBeatPlannerInsights";

/**
 * AI Beat Planner narrative card for the My Beats page.
 *
 * Presentational consumer of useBeatPlannerInsights (called once by the page
 * and shared with the beat cards). Two phases: while working days remain in
 * the CURRENT week (and this week hasn't been auto-planned yet) the card is
 * "Prioritize Beats for This Week" and Take Action plans those remaining
 * days; once applied — or when the week is over — it becomes "Prioritize
 * Beats for Next Week" and plans next week's working days (Mon–Sat, Sundays
 * skipped). Existing beat plans in the chosen range are overwritten after
 * explicit confirmation, written through the app's standard save-beat-plan
 * flow.
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

/** Display-only reframe: the stored agent output speaks of "next month". */
const reframeToWeek = (text: string, phase: "this" | "next") =>
  text.replace(/next month/gi, (m) => {
    const target = phase === "this" ? "this week" : "next week";
    return m[0] === "N" ? target[0].toUpperCase() + target.slice(1) : target;
  });

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Working days left in the current week AFTER today — tomorrow through this
 * Saturday, Sundays skipped. Empty on Saturdays (week is over). */
function remainingThisWeekWorkingDays(): Date[] {
  const days: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const saturday = new Date(today);
  saturday.setDate(today.getDate() + (6 - today.getDay()));
  const cur = new Date(today);
  while (cur < saturday) {
    cur.setDate(cur.getDate() + 1);
    if (cur.getDay() === 0) continue;
    days.push(new Date(cur));
  }
  return days;
}

/** All working days of NEXT week: next Monday through next Saturday. */
function nextWeekWorkingDays(): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() + (((8 - today.getDay()) % 7) || 7));
  const days: Date[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

/** Per-week marker so "this week planned" resets automatically next week. */
const thisWeekAppliedKey = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const saturday = new Date(today);
  saturday.setDate(today.getDate() + (6 - today.getDay()));
  return `beat_plan_thisweek_applied_${toLocalISODate(saturday)}`;
};

interface PlannedDay {
  date: string;
  day: string;
  beat_id: string;
  beat_name: string;
  reason: string;
}

export function BeatPlannerInsightsCard({ insights }: { insights: BeatPlannerInsights }) {
  const { result, rows, loading, running, failed, lastRunAt, refresh } = insights;
  const { user } = useAuth();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [plannedDays, setPlannedDays] = useState<PlannedDay[]>([]);
  const [unmatchedBeats, setUnmatchedBeats] = useState<string[]>([]);

  // Phase: plan the rest of THIS week first; after that's applied (or when
  // no working days remain this week), switch to planning next week.
  const [thisWeekApplied, setThisWeekApplied] = useState<boolean>(() => {
    try {
      return localStorage.getItem(thisWeekAppliedKey()) === "1";
    } catch {
      return false;
    }
  });
  const remainingDays = useMemo(() => remainingThisWeekWorkingDays(), []);
  const phase: "this" | "next" = remainingDays.length > 0 && !thisWeekApplied ? "this" : "next";
  const phaseLabel = phase === "this" ? "This Week" : "Next Week";

  const displaySummary = useMemo(
    () => (result?.summary ? reframeToWeek(result.summary, phase) : null),
    [result?.summary, phase],
  );

  // Build the 7-working-day assignment from the prioritised rows (lowest
  // coverage first, expanded by each beat's suggested visit days, cycling if
  // fewer beats than days). Only beats the user actually owns can be planned.
  const prepareTakeAction = async () => {
    if (!user?.id || rows.length === 0) return;
    setPreparing(true);
    try {
      const { data: myBeats, error } = await supabase
        .from("beats")
        .select("id, beat_name")
        .eq("user_id", user.id)
        .neq("is_active", false);
      if (error) throw error;

      const byName = new Map<string, { id: string; name: string }>();
      (myBeats ?? []).forEach((b: any) => {
        if (b.beat_name) byName.set(String(b.beat_name).trim().toLowerCase(), { id: String(b.id), name: String(b.beat_name) });
      });

      const matched: Array<{ beat: { id: string; name: string }; row: BeatPlanRow }> = [];
      const unmatched: string[] = [];
      rows.forEach((r) => {
        const key = String(r.beat ?? "").trim().toLowerCase();
        if (!key || key === "unassigned") return;
        const beat = byName.get(key);
        if (beat) matched.push({ beat, row: r });
        else unmatched.push(r.beat);
      });

      if (!matched.length) {
        toast.error("None of the prioritised beats match beats you own — nothing to plan.");
        return;
      }

      // Priority queue: each beat appears suggestedDays times, then the list
      // cycles so every day in the chosen range gets an assignment.
      const queue: Array<{ beat: { id: string; name: string }; row: BeatPlanRow }> = [];
      matched.forEach((m) => {
        const repeats = Math.max(1, Math.min(3, m.row.suggestedDays || 1));
        for (let i = 0; i < repeats; i++) queue.push(m);
      });
      const days = phase === "this" ? remainingThisWeekWorkingDays() : nextWeekWorkingDays();
      if (!days.length) {
        toast.error("No working days left to plan in this range.");
        return;
      }
      const planned: PlannedDay[] = days.map((d, i) => {
        const pick = queue[i % queue.length];
        return {
          date: toLocalISODate(d),
          day: DAY_NAMES[d.getDay()],
          beat_id: pick.beat.id,
          beat_name: pick.beat.name,
          reason: `${pick.row.coveragePct}% coverage, ₹${Number(pick.row.pending || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })} pending`,
        };
      });

      setPlannedDays(planned);
      setUnmatchedBeats(unmatched);
      setConfirmOpen(true);
    } catch (e: any) {
      console.error("[BeatPlannerInsights] prepare take-action failed:", e);
      toast.error(e?.message ?? "Could not prepare the plan");
    } finally {
      setPreparing(false);
    }
  };

  // Confirmed: overwrite existing plans in the range, then save through the
  // app's standard save-beat-plan flow (marks plans auto_generated and logs
  // the autonomous action).
  const applyPlan = async () => {
    if (!user?.id || plannedDays.length === 0) return;
    setApplying(true);
    try {
      const fromDate = plannedDays[0].date;
      const toDate = plannedDays[plannedDays.length - 1].date;

      const { error: delError } = await supabase
        .from("beat_plans")
        .delete()
        .eq("user_id", user.id)
        .gte("plan_date", fromDate)
        .lte("plan_date", toDate);
      if (delError) throw delError;

      const { data, error } = await supabase.functions.invoke("save-beat-plan", {
        body: {
          userId: user.id,
          fromDate,
          toDate,
          days: plannedDays.map((p) => ({
            date: p.date,
            day: p.day,
            beat_id: p.beat_id,
            beat_name: p.beat_name,
            rationale: `AI Beat Planner: ${p.reason}`,
            retailers: [],
          })),
        },
      });
      if (error) throw new Error(error.message ?? "Failed to save plan");
      if ((data as any)?.error) throw new Error((data as any).error);

      if (phase === "this") {
        // Flip the card to "Next Week" — the marker resets itself next week.
        try {
          localStorage.setItem(thisWeekAppliedKey(), "1");
        } catch { /* ignore */ }
        setThisWeekApplied(true);
      }
      setConfirmOpen(false);
      toast.success(
        `Beat plan saved for ${plannedDays.length} working day${plannedDays.length === 1 ? "" : "s"} (${fromDate} → ${toDate})`,
      );
    } catch (e: any) {
      console.error("[BeatPlannerInsights] apply plan failed:", e);
      toast.error(e?.message ?? "Could not save the beat plan");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card className="overflow-hidden border-2 border-red-500 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-100 dark:border-red-600 dark:from-amber-950/40 dark:via-yellow-950/30 dark:to-orange-950/30">
      <div className="h-1 bg-gradient-to-r from-red-500 via-amber-400 to-orange-500" />
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-red-500/15 to-amber-500/20">
              <Sparkles className="h-5 w-5 text-amber-700 dark:text-amber-400" />
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight text-amber-950 dark:text-amber-100">
                Prioritize Beats for {phaseLabel}
              </p>
              <p className="text-xs leading-tight text-amber-900/70 dark:text-amber-200/70">
                {lastRunAt
                  ? `AI Beat Planner · updated ${fmtWhen(lastRunAt)}`
                  : "AI Beat Planner"}
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
            {!running && result && rows.length > 0 && (
              <Button
                size="sm"
                className="gap-1.5 bg-black text-white hover:bg-black/85 dark:bg-black dark:text-white dark:hover:bg-black/85"
                onClick={prepareTakeAction}
                disabled={preparing}
              >
                {preparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                Take Action
              </Button>
            )}
            {!running && result && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-amber-900/60 hover:text-amber-950 dark:text-amber-200/60"
                title="Refresh insights"
                onClick={refresh}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {(loading || running) && !result && (
          <p className="mt-3 text-xs text-amber-900/80 dark:text-amber-100/80">
            Analysing your beats — coverage, pending dues and suggested visit days are being
            computed from your visits and orders…
          </p>
        )}

        {!loading && !running && !result && failed && (
          <p className="mt-3 text-xs text-amber-900/80 dark:text-amber-100/80">
            Beat insights are unavailable right now — they will refresh automatically the next time
            you open this page.
          </p>
        )}

        {displaySummary && (
          <div className="mt-3 rounded-lg bg-white/60 p-3 dark:bg-black/20">
            <div className="prose prose-sm max-w-none text-xs leading-relaxed dark:prose-invert [&_p]:my-1 [&_ul]:my-1">
              <ReactMarkdown>{displaySummary}</ReactMarkdown>
            </div>
          </div>
        )}
      </CardContent>

      {/* Confirmation before overwriting the chosen week's plans */}
      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!applying) setConfirmOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarCheck2 className="h-4 w-4 text-amber-600" />
              {phase === "this"
                ? `Auto-plan the remaining ${plannedDays.length} working day${plannedDays.length === 1 ? "" : "s"} of this week?`
                : "Auto-plan next week's working days?"}
            </DialogTitle>
            <DialogDescription>
              The prioritised beats below will be planned for{" "}
              {phase === "this" ? "the rest of this week" : "next week"} (Sundays skipped).{" "}
              <span className="font-medium text-foreground">Any existing beat plans in this
              period will be overwritten.</span>
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {plannedDays.map((p) => (
              <div key={p.date} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.beat_name}</p>
                  <p className="text-[11px] text-muted-foreground">{p.reason}</p>
                </div>
                <span className="shrink-0 text-right text-xs text-muted-foreground">
                  {p.day.slice(0, 3)}<br />
                  {new Date(p.date + "T00:00:00").toLocaleDateString([], { day: "2-digit", month: "short" })}
                </span>
              </div>
            ))}
          </div>

          {unmatchedBeats.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Skipped (not beats you own): {unmatchedBeats.join(", ")}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={applying}>
              Cancel
            </Button>
            <Button onClick={applyPlan} disabled={applying} className="gap-1.5">
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarCheck2 className="h-3.5 w-3.5" />}
              Confirm &amp; Overwrite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
