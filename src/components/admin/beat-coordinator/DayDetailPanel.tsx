import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { AlertTriangle, ArrowRight, Calendar as CalIcon, Users, Split, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useCalendarData, type DayBeatStatus } from "@/hooks/useCalendarData";
import { formatLastServed } from "@/utils/beatCalendarUtils";
import { usePermissions } from "@/hooks/usePermissions";

const sb = supabase as any;

interface Props {
  repId: string | null;
  repName: string;
  selectedDate: string;
  monthAnchor: Date;
  onOpenAssign: () => void;
  onOpenLeaveCover: () => void;
  onOpenAIRoute: () => void;
  onOpenRangeAssign: (mode?: "split" | "permanent" | "temp_cover") => void;
  onOpenRescheduleMissed: () => void;
}

const STATUS_LABEL: Record<DayBeatStatus, string> = {
  assigned: "Assigned",
  served: "Served",
  in_progress: "In progress",
  uncovered: "Uncovered",
  shared: "Shared",
  unplanned: "Unplanned",
};
const STATUS_CLS: Record<DayBeatStatus, string> = {
  assigned: "border-beat-assigned text-beat-assigned",
  served: "border-beat-served text-beat-served",
  in_progress: "border-beat-stale text-beat-stale",
  uncovered: "border-beat-uncovered text-beat-uncovered",
  shared: "border-beat-shared text-beat-shared",
  unplanned: "border-muted text-muted-foreground",
};

export function DayDetailPanel({
  repId, repName, selectedDate, monthAnchor,
  onOpenAssign, onOpenLeaveCover, onOpenAIRoute, onOpenRangeAssign, onOpenRescheduleMissed,
}: Props) {
  const { data } = useCalendarData(repId, monthAnchor);
  const beats = data?.byDate[selectedDate] || [];
  const onLeave = data?.leaveDates.has(selectedDate);
  const uncoveredBeats = beats.filter((b) => b.status === "uncovered");
  const dateLabel = format(parseISO(selectedDate), "EEE d MMM");

  const splitBeatIds = useMemo(
    () => beats.filter((b) => b.status === "shared" || b.assignment_type === "split").map((b) => b.beat_id),
    [beats],
  );

  const { data: splitPartners = {} as Record<string, { id: string; name: string }[]> } = useQuery({
    queryKey: ["dayPanel-splits", selectedDate, splitBeatIds.sort().join(",")],
    enabled: splitBeatIds.length > 0,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data: rows } = await sb
        .from("daily_beat_plans")
        .select("beat_id, assigned_user_id")
        .eq("plan_date", selectedDate)
        .eq("assignment_type", "split")
        .eq("status", "active")
        .in("beat_id", splitBeatIds);
      const ids = Array.from(new Set((rows || []).map((r: any) => r.assigned_user_id)));
      const nameById = new Map<string, string>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        (profs || []).forEach((p: any) => nameById.set(p.id, p.full_name));
      }
      const out: Record<string, { id: string; name: string }[]> = {};
      (rows || []).forEach((r: any) => {
        const arr = out[r.beat_id] || [];
        if (!arr.some((x) => x.id === r.assigned_user_id)) {
          arr.push({ id: r.assigned_user_id, name: nameById.get(r.assigned_user_id) || "—" });
        }
        out[r.beat_id] = arr;
      });
      return out;
    },
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-base font-semibold">
            {dateLabel}{repName ? ` — ${repName}` : ""}
          </div>
          <div className="text-xs text-muted-foreground">
            {beats.length} beat{beats.length === 1 ? "" : "s"} on this day
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Button size="sm" variant="outline" onClick={onOpenRescheduleMissed}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reschedule missed
          </Button>
          <Button size="sm" variant="outline" onClick={() => onOpenRangeAssign("split")}>
            <Split className="h-3.5 w-3.5 mr-1" /> Share beat
          </Button>
          <Button size="sm" variant="outline" onClick={onOpenAssign}>
            <CalIcon className="h-3.5 w-3.5 mr-1" /> Edit plan
          </Button>
        </div>
      </div>

      {(onLeave || uncoveredBeats.length > 0) && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-beat-uncovered/10 border border-beat-uncovered/30">
          <AlertTriangle className="h-4 w-4 text-beat-uncovered mt-0.5 flex-shrink-0" />
          <div className="flex-1 text-sm">
            {repName} on leave {dateLabel}
            {uncoveredBeats.length > 0 && (
              <>. {uncoveredBeats.length} beat{uncoveredBeats.length > 1 ? "s" : ""} uncovered.</>
            )}
          </div>
          <Button size="sm" variant="default" onClick={onOpenLeaveCover}>
            Cover now <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      )}

      {beats.length === 0 && !onLeave && (
        <div className="text-sm text-muted-foreground">
          Nothing planned. Use <strong>Assign range</strong> to add beats for this day.
        </div>
      )}

      <ul className="divide-y border rounded-md">
        {beats.map((b) => {
          const ls = formatLastServed(b.last_served);
          const isSplit = b.status === "shared" || b.assignment_type === "split";
          const partners = splitPartners[b.beat_id] || [];
          return (
            <li key={b.beat_id} className="p-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <div className="font-medium text-sm flex items-center gap-1.5">
                  {b.beat_name}
                  {isSplit && (
                    <span className="text-xs text-beat-shared inline-flex items-center gap-1">
                      <Split className="h-3 w-3" /> (split)
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {b.retailer_count}</span>
                  <span className={cn(
                    ls.tone === "bad" && "text-beat-uncovered",
                    ls.tone === "warn" && "text-beat-stale",
                  )}>
                    Last served: {ls.label}
                  </span>
                </div>
                {isSplit && partners.length > 0 && (
                  <div className="text-xs mt-1 flex flex-wrap items-center gap-1.5">
                    {partners.map((p, i) => (
                      <span key={p.id} className="inline-flex items-center gap-1">
                        <span className="h-5 w-5 rounded-full bg-beat-shared/20 text-beat-shared text-[10px] font-semibold flex items-center justify-center">
                          {p.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span>{p.name}</span>
                        {i < partners.length - 1 && <span className="text-muted-foreground">+</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  isSplit ? "border-0" : STATUS_CLS[b.status],
                )}
                style={isSplit ? { background: "#EEEDFE", color: "#534AB7" } : undefined}
              >
                {isSplit ? "Split" : STATUS_LABEL[b.status]}
              </Badge>
              {b.status === "uncovered" && (
                <Button size="sm" variant="outline" onClick={onOpenLeaveCover}>
                  Assign cover
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {/* Quick scenario pills */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {[
          { label: "Full day cover", action: onOpenLeaveCover },
          { label: "Half-day AM", action: onOpenLeaveCover },
          { label: "Half-day PM", action: onOpenLeaveCover },
          { label: "Split 2 reps", action: () => onOpenRangeAssign("split") },
          { label: "Shared beat", action: () => onOpenRangeAssign("split") },
          { label: "Reschedule missed", action: onOpenRescheduleMissed },
          { label: "Assign date range", action: () => onOpenRangeAssign() },
          { label: "AI route", action: onOpenAIRoute },
        ].map((p) => (
          <Button key={p.label} size="sm" variant="secondary" className="h-7 text-xs" onClick={p.action}>
            {p.label}
          </Button>
        ))}
      </div>
    </Card>
  );
}
