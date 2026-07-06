import { useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, CalendarClock, CalendarIcon, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useMissedBeatDays, useRescheduleMissedDay, type MissedBeatDay } from "@/hooks/useMissedDays";

interface Props {
  userId: string;
  variant?: "banner" | "chip";
  lookback?: number;
}

export function MissedBeatsSection({ userId, variant = "banner", lookback = 14 }: Props) {
  const { toast } = useToast();
  const { data: rows = [], isLoading } = useMissedBeatDays(userId, lookback);
  const rescheduleMut = useRescheduleMissedDay();
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pickerDate, setPickerDate] = useState<Date | undefined>();

  if (isLoading || rows.length === 0) return null;

  const doReschedule = async (row: MissedBeatDay, toDate?: string) => {
    try {
      const res = await rescheduleMut.mutateAsync({
        userId,
        fromDate: row.missed_date,
        toDate: toDate ?? null,
      });
      if (res.moved === 0) {
        toast({ title: "Nothing to move", description: "Retailers already planned on target day." });
      } else {
        toast({
          title: "Rescheduled",
          description: `Moved ${res.moved} retailer${res.moved === 1 ? "" : "s"} to ${format(parseISO(res.toDate), "d MMM")}`,
        });
      }
      window.dispatchEvent(new Event("visitDataChanged"));
      setPickerFor(null);
      setPickerDate(undefined);
    } catch (e: any) {
      toast({
        title: "Failed to reschedule",
        description: e?.message || "Try again",
        variant: "destructive",
      });
    }
  };

  const list = (
    <div className="space-y-1.5 max-h-72 overflow-y-auto">
      {rows.map((r) => (
        <div
          key={r.missed_date}
          className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-sm"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{format(parseISO(r.missed_date), "EEE d MMM")}</span>
              {r.on_leave && (
                <Badge variant="outline" className="text-[10px] border-warning/40 bg-warning/10">
                  on leave
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {r.retailer_count} retailer{r.retailer_count === 1 ? "" : "s"} unvisited
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => doReschedule(r)}
              disabled={rescheduleMut.isPending}
            >
              {rescheduleMut.isPending && rescheduleMut.variables?.fromDate === r.missed_date && !rescheduleMut.variables?.toDate ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : null}
              Next free day
            </Button>
            <Popover
              open={pickerFor === r.missed_date}
              onOpenChange={(o) => {
                setPickerFor(o ? r.missed_date : null);
                if (!o) setPickerDate(undefined);
              }}
            >
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Pick date">
                  <CalendarIcon className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={pickerDate}
                  onSelect={(d) => {
                    setPickerDate(d);
                    if (d) doReschedule(r, format(d, "yyyy-MM-dd"));
                  }}
                  disabled={(d) => d <= parseISO(r.missed_date)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      ))}
    </div>
  );

  if (variant === "chip") {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 border-destructive/40 text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="text-xs">{rows.length} not covered</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-3 space-y-2">
          <div className="text-sm font-medium">Beats not covered</div>
          {list}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Alert className="border-destructive/40 bg-destructive/5">
      <CalendarClock className="h-4 w-4" />
      <div className="flex-1">
        <AlertTitle>
          Beats not covered ({rows.length} day{rows.length === 1 ? "" : "s"})
        </AlertTitle>
        <AlertDescription>
          <div className="mt-2">{list}</div>
        </AlertDescription>
      </div>
    </Alert>
  );
}
