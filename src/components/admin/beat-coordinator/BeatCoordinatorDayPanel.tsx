import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowUpRight, CalendarRange, RefreshCw, Share2, Edit3 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const sb = supabase as any;

type ScenarioId =
  | "full_day_cover" | "half_day" | "split_2" | "shared_beat"
  | "reschedule" | "date_range" | "cascading";

const SCENARIOS: { id: ScenarioId; label: string; helper: string }[] = [
  { id: "full_day_cover", label: "Full day cover", helper: "Coordinator selects all retailers from absent rep's beat and assigns to one cover rep. Writes to daily_retailer_assignments with type = leave_sub." },
  { id: "half_day", label: "Half-day AM/PM", helper: "Splits the absent day into morning and afternoon halves with different cover reps." },
  { id: "split_2", label: "Split between 2 reps", helper: "Pick a subset of retailers per cover rep until all are assigned, then confirm in one transaction." },
  { id: "shared_beat", label: "Shared beat (2 reps together)", helper: "Two reps work the same beat together for the day." },
  { id: "reschedule", label: "Reschedule missed beat", helper: "Move the day's plan to another date for the same rep." },
  { id: "date_range", label: "Assign date range", helper: "Repeat the selected beat assignment across a date range, skipping Sundays." },
  { id: "cascading", label: "Cascading leave", helper: "Detect and resolve cases where the assigned cover rep is also on leave." },
];

interface Props {
  repId: string | null;
  repName: string;
  selectedDate: string;
  onOpenAssign: () => void;
  onOpenLeaveCover: () => void;
  onOpenAIRoute: () => void;
}

export function BeatCoordinatorDayPanel({ repId, repName, selectedDate, onOpenAssign, onOpenLeaveCover, onOpenAIRoute }: Props) {
  const [scenario, setScenario] = useState<ScenarioId>("full_day_cover");

  const { data: dayData } = useQuery({
    queryKey: ["bc-day", repId, selectedDate],
    enabled: !!repId,
    queryFn: async () => {
      const [plansRes, leavesRes] = await Promise.all([
        sb.from("daily_beat_plans")
          .select("beat_id, assignment_type, assigned_user_id")
          .eq("plan_date", selectedDate).eq("assigned_user_id", repId),
        sb.from("leave_applications")
          .select("status, start_date, end_date")
          .eq("user_id", repId).eq("status", "approved")
          .lte("start_date", selectedDate).gte("end_date", selectedDate),
      ]);
      const beatIds = (plansRes.data || []).map((p: any) => p.beat_id);
      const { data: beats = [] } = beatIds.length
        ? await supabase.from("beats").select("beat_id, beat_name").in("beat_id", beatIds)
        : { data: [] as any[] };
      const beatMap = new Map<string, string>((beats || []).map((b: any) => [b.beat_id, b.beat_name]));
      const { data: rcounts = [] } = beatIds.length
        ? await supabase.from("retailers").select("beat_id").in("beat_id", beatIds)
        : { data: [] as any[] };
      const counts = new Map<string, number>();
      (rcounts || []).forEach((r: any) => counts.set(r.beat_id, (counts.get(r.beat_id) || 0) + 1));

      return {
        onLeave: (leavesRes.data || []).length > 0,
        plans: (plansRes.data || []).map((p: any) => ({
          ...p,
          beat_name: beatMap.get(p.beat_id) || p.beat_id,
          retailer_count: counts.get(p.beat_id) || 0,
        })),
      };
    },
  });

  const dateLabel = format(parseISO(selectedDate), "EEE d MMM");
  const onLeave = dayData?.onLeave;
  const plans = dayData?.plans || [];
  const helper = SCENARIOS.find((s) => s.id === scenario)?.helper || "";

  if (!repId) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Select a rep on the left to see their day plan.
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-base font-semibold">{dateLabel} — {repName}</div>
          <div className="text-xs text-muted-foreground">Day plan & quick actions</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onOpenAssign}>
            <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit plan
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenLeaveCover}>
            <Share2 className="h-3.5 w-3.5 mr-1" /> Share beat
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenAIRoute}>
            <ArrowUpRight className="h-3.5 w-3.5 mr-1" /> AI route
          </Button>
        </div>
      </div>

      {onLeave && (
        <div className="flex items-start justify-between gap-3 rounded-md border-2 border-beat-uncovered/40 bg-beat-uncovered/10 p-3">
          <div className="flex gap-2">
            <AlertTriangle className="h-4 w-4 text-beat-uncovered mt-0.5" />
            <div className="text-sm">
              <div className="font-medium text-beat-uncovered">{repName} is on leave</div>
              <div className="text-xs text-muted-foreground">Retailers for this date need coverage.</div>
            </div>
          </div>
          <Button size="sm" variant="destructive" onClick={onOpenLeaveCover}>Cover now</Button>
        </div>
      )}

      <div className="space-y-2">
        {plans.length === 0 ? (
          <div className="text-sm text-muted-foreground border border-dashed rounded-md p-4 text-center">
            No beats planned for this day.
            <Button variant="link" size="sm" onClick={onOpenAssign}>Assign a beat</Button>
          </div>
        ) : (
          plans.map((p: any) => (
            <div key={p.beat_id} className="flex items-center justify-between border rounded-md px-3 py-2">
              <div>
                <div className="font-medium text-sm">{p.beat_name}</div>
                <div className="text-xs text-muted-foreground">{p.retailer_count} retailers</div>
              </div>
              <Badge variant="outline" className="capitalize text-[10px]">
                {(p.assignment_type || "assigned").replace("_", " ")}
              </Badge>
            </div>
          ))
        )}
      </div>

      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Quick actions for this day
        </div>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setScenario(s.id);
                if (s.id === "full_day_cover" || s.id === "half_day" || s.id === "split_2" || s.id === "cascading") onOpenLeaveCover();
                else if (s.id === "date_range" || s.id === "reschedule" || s.id === "shared_beat") onOpenAssign();
              }}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs border transition-colors",
                scenario === s.id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        {helper && (
          <div className="mt-3 text-xs text-muted-foreground bg-muted/40 rounded-md p-3 leading-relaxed">
            {helper}
          </div>
        )}
      </div>
    </Card>
  );
}
