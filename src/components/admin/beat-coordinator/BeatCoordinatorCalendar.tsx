import { useMemo } from "react";
import {
  startOfMonth, endOfMonth, eachDayOfInterval, format, isSameDay, isSameMonth, addMonths, subMonths, startOfWeek, endOfWeek,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBeatCoordinatorMonth, type DayBeatChip } from "@/hooks/useBeatCoordinatorMonth";

interface Props {
  repId: string | null;
  repName: string;
  selectedDate: string;
  onSelectDate: (d: string) => void;
  monthAnchor: Date;
  onMonthChange: (d: Date) => void;
}

const STATUS_BG: Record<DayBeatChip["status"], string> = {
  assigned: "bg-beat-assigned/15 text-beat-assigned border-beat-assigned/30",
  served: "bg-beat-served/15 text-beat-served border-beat-served/30",
  stale: "bg-beat-stale/15 text-beat-stale border-beat-stale/30",
  uncovered: "bg-beat-uncovered/15 text-beat-uncovered border-beat-uncovered/40",
  shared: "bg-beat-shared/15 text-beat-shared border-beat-shared/30",
  planned: "bg-muted text-muted-foreground border-border",
};

export function BeatCoordinatorCalendar({ repId, repName, selectedDate, onSelectDate, monthAnchor, onMonthChange }: Props) {
  const { data, isLoading } = useBeatCoordinatorMonth(repId, monthAnchor);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthAnchor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(monthAnchor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [monthAnchor]);

  const today = new Date();

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => onMonthChange(subMonths(monthAnchor, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-lg font-semibold w-32 text-center">{format(monthAnchor, "MMMM yyyy")}</div>
          <Button variant="outline" size="icon" onClick={() => onMonthChange(addMonths(monthAnchor, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-sm text-muted-foreground">
          {repId ? <>Showing: <span className="font-medium text-foreground">{repName}</span></> : "Pick a rep from the left"}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-xs font-medium text-muted-foreground mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-2 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const dateStr = format(d, "yyyy-MM-dd");
          const inMonth = isSameMonth(d, monthAnchor);
          const isSun = d.getDay() === 0;
          const isToday = isSameDay(d, today);
          const isSelected = dateStr === selectedDate;
          const chips = data?.byDate[dateStr] || [];
          const onLeave = data?.leaveDates.has(dateStr);
          const hasAlert = onLeave && chips.length === 0;

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className={cn(
                "relative min-h-[88px] rounded-lg border p-1.5 text-left transition-colors",
                "hover:border-primary/50",
                !inMonth && "opacity-40",
                isSun && "bg-muted/40",
                isSelected ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border",
                isToday && !isSelected && "border-beat-assigned/60",
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn("text-xs font-semibold", isToday && "text-beat-assigned")}>
                  {format(d, "d")}
                </span>
                {(hasAlert || onLeave) && <span className="h-1.5 w-1.5 rounded-full bg-beat-stale" />}
              </div>
              <div className="mt-1 space-y-0.5">
                {onLeave && chips.length === 0 && (
                  <div className={cn("text-[10px] px-1.5 py-0.5 rounded border truncate", STATUS_BG.uncovered)}>
                    ⚠ Not covered
                  </div>
                )}
                {chips.slice(0, 2).map((c) => (
                  <div key={c.beat_id} className={cn("text-[10px] px-1.5 py-0.5 rounded border truncate", STATUS_BG[c.status])}>
                    {c.beat_name}
                  </div>
                ))}
                {chips.length > 2 && (
                  <div className="text-[10px] text-muted-foreground px-1">+{chips.length - 2} more</div>
                )}
                {!onLeave && chips.length === 0 && inMonth && !isSun && (
                  <div className="text-[10px] text-muted-foreground px-1">Not planned</div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 text-xs text-muted-foreground">
        {[
          ["bg-beat-assigned", "Assigned"],
          ["bg-beat-served", "Served"],
          ["bg-beat-stale", "Stale"],
          ["bg-beat-uncovered", "Uncovered"],
          ["bg-beat-shared", "Shared"],
        ].map(([bg, lbl]) => (
          <span key={lbl} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", bg)} /> {lbl}
          </span>
        ))}
      </div>

      {isLoading && <div className="mt-3 text-xs text-muted-foreground">Loading…</div>}
    </Card>
  );
}
