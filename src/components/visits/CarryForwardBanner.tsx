import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarClock, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import {
  useCarryForwardEnabled,
  useCarryForwardRetailers,
  useAddCarryForward,
} from "@/hooks/useCarryForward";

interface Props {
  userId: string;
  date: string;
  variant?: "banner" | "chip";
  onAdded?: (count: number) => void;
}

function isToday(date: string) {
  const today = new Date();
  const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate(),
  ).padStart(2, "0")}`;
  return date === t;
}

export function CarryForwardBanner({ userId, date, variant = "banner", onAdded }: Props) {
  const { toast } = useToast();
  const { data: enabled } = useCarryForwardEnabled();
  const gate = variant === "banner" ? isToday(date) : true;
  const { data: rows = [], isLoading } = useCarryForwardRetailers(userId, date, {
    enabled: !!enabled && gate,
  });
  const addMut = useAddCarryForward();
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Set<string> | null>(null);

  const effectiveSelected = useMemo(() => {
    if (selected) return selected;
    return new Set(rows.map((r) => r.retailer_id));
  }, [selected, rows]);

  if (!enabled || isLoading || rows.length === 0) return null;

  const toggle = (id: string) => {
    const next = new Set(effectiveSelected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleAdd = async () => {
    const ids = Array.from(effectiveSelected);
    if (ids.length === 0) return;
    try {
      const n = await addMut.mutateAsync({ userId, date, retailerIds: ids });
      toast({ title: "Added to plan", description: `${n} retailer${n === 1 ? "" : "s"} added` });
      setExpanded(false);
      setSelected(null);
      onAdded?.(n);
      // Notify legacy consumers (MyVisits event bus)
      window.dispatchEvent(new Event("visitDataChanged"));
    } catch (e: any) {
      toast({ title: "Failed to add", description: e?.message || "Try again", variant: "destructive" });
    }
  };

  const list = (
    <div className="space-y-1 max-h-64 overflow-y-auto">
      {rows.map((r) => (
        <label
          key={r.retailer_id}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted cursor-pointer text-sm"
        >
          <Checkbox
            checked={effectiveSelected.has(r.retailer_id)}
            onCheckedChange={() => toggle(r.retailer_id)}
          />
          <span className="flex-1 truncate">{r.retailer_name}</span>
          <span className="text-xs text-muted-foreground">
            {format(parseISO(r.cancelled_on), "d MMM")}
          </span>
        </label>
      ))}
    </div>
  );

  if (variant === "chip") {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="h-7 gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" />
            <span className="text-xs">{rows.length} carried over</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3 space-y-2">
          <div className="text-sm font-medium">Carried over from earlier</div>
          {list}
          <Button
            size="sm"
            className="w-full"
            onClick={handleAdd}
            disabled={addMut.isPending || effectiveSelected.size === 0}
          >
            {addMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Add to plan ({effectiveSelected.size})
          </Button>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Alert className="border-warning/40 bg-warning/10">
      <CalendarClock className="h-4 w-4" />
      <div className="flex-1">
        <AlertTitle className="flex items-center gap-2">
          <span>
            {rows.length} retailer{rows.length === 1 ? "" : "s"} carried over from earlier
          </span>
          <Badge variant="outline" className="text-[10px]">eod</Badge>
        </AlertTitle>
        <AlertDescription>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={addMut.isPending || effectiveSelected.size === 0}
            >
              {addMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Add to today's plan ({effectiveSelected.size})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpanded((v) => !v)}
              className="gap-1"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {expanded ? "Hide" : "Review"} list
            </Button>
          </div>
          {expanded && <div className="mt-2">{list}</div>}
        </AlertDescription>
      </div>
    </Alert>
  );
}
