import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useSubordinates } from "@/hooks/useSubordinates";
import { RepSidebar } from "./RepSidebar";
import { MonthGrid } from "./MonthGrid";
import { DayDetailPanel } from "./DayDetailPanel";
import { DateRangeAssignDrawer } from "./DateRangeAssignDrawer";
import { RescheduleMissedDrawer } from "./RescheduleMissedDrawer";
import { MonthlyKPIBar } from "./MonthlyKPIBar";

interface Props {
  onOpenAssign: (repId?: string | null) => void;
  onOpenLeaveCover: (repId?: string | null, date?: string) => void;
  onOpenAIRoute: (repId?: string | null, date?: string) => void;
}

type RangeType = "permanent" | "temp_cover" | "split";

export function CalendarTab({ onOpenAssign, onOpenLeaveCover, onOpenAIRoute }: Props) {
  const { subordinates } = useSubordinates();
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [monthAnchor, setMonthAnchor] = useState<Date>(new Date());
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeType, setRangeType] = useState<RangeType>("permanent");
  const [missedOpen, setMissedOpen] = useState(false);

  // Default selected rep = first subordinate
  useEffect(() => {
    if (!selectedRepId && subordinates.length > 0) {
      setSelectedRepId(subordinates[0].subordinate_user_id);
    }
  }, [subordinates, selectedRepId]);

  const { data: repName = "" } = useQuery({
    queryKey: ["bc-rep-name", selectedRepId],
    enabled: !!selectedRepId,
    queryFn: async () => {
      if (!selectedRepId) return "";
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", selectedRepId)
        .maybeSingle();
      return (data as any)?.full_name || "";
    },
  });

  const openRange = (mode?: RangeType) => {
    setRangeType(mode || "permanent");
    setRangeOpen(true);
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
      <div className="lg:sticky lg:top-[140px] lg:self-start lg:max-h-[calc(100vh-160px)]">
        <RepSidebar
          selectedRepId={selectedRepId}
          selectedDate={selectedDate}
          onSelect={setSelectedRepId}
        />
      </div>
      <div className="space-y-3 min-w-0">
        <MonthGrid
          repId={selectedRepId}
          repName={repName}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          monthAnchor={monthAnchor}
          onMonthChange={setMonthAnchor}
          onOpenRangeAssign={() => openRange()}
        />
        <DayDetailPanel
          repId={selectedRepId}
          repName={repName}
          selectedDate={selectedDate}
          monthAnchor={monthAnchor}
          onOpenAssign={() => onOpenAssign(selectedRepId)}
          onOpenLeaveCover={() => onOpenLeaveCover(selectedRepId, selectedDate)}
          onOpenAIRoute={() => onOpenAIRoute(selectedRepId, selectedDate)}
          onOpenRangeAssign={openRange}
          onOpenRescheduleMissed={() => setMissedOpen(true)}
        />
      </div>

      <RescheduleMissedDrawer
        open={missedOpen}
        onClose={() => setMissedOpen(false)}
        scopedRepId={selectedRepId}
        onOpenAssign={(repId) => {
          setMissedOpen(false);
          onOpenAssign(repId);
        }}
      />

      <DateRangeAssignDrawer
        open={rangeOpen}
        onClose={() => setRangeOpen(false)}
        initialRepId={selectedRepId}
        initialDate={selectedDate}
        initialType={rangeType}
        restrictToOwnerId={rangeType === "permanent" ? selectedRepId : null}
      />
    </div>
  );
}
