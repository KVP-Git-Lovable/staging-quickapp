import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubordinates } from "@/hooks/useSubordinates";
import { useMissedBeats, MAX_AUTO_RESCHEDULE_DAYS, type MissedBeat } from "@/hooks/useMissedBeats";

const sb = supabase as any;

interface Props {
  open: boolean;
  onClose: () => void;
  /** When set, drawer initially scopes to this rep (toggleable). */
  scopedRepId?: string | null;
  /** Jump to Beat Assignment tab for "too old" items. */
  onOpenAssign?: (repId: string) => void;
}

export function RescheduleMissedDrawer({ open, onClose, scopedRepId, onOpenAssign }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { subordinates } = useSubordinates();

  const reps = useMemo(
    () => subordinates.map((s) => ({ id: s.subordinate_user_id, full_name: s.full_name })),
    [subordinates],
  );

  const [onlySelectedRep, setOnlySelectedRep] = useState(!!scopedRepId);
  useEffect(() => {
    if (open) setOnlySelectedRep(!!scopedRepId);
  }, [open, scopedRepId]);

  const { data: missed = [], isLoading, refetch } = useMissedBeats({
    reps,
    scopedRepId: onlySelectedRep ? scopedRepId : null,
    enabled: open,
  });

  // Per-row chosen date overrides (key = rep|beat|missed_date)
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  // Per-row selection for bulk confirm
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setOverrides({});
      setSelected({});
    }
  }, [open]);

  const rowKey = (m: MissedBeat) => `${m.rep_id}|${m.beat_id}|${m.missed_date}`;
  const dateForRow = (m: MissedBeat) => overrides[rowKey(m)] ?? m.suggested_date ?? "";

  // Group by rep
  const grouped = useMemo(() => {
    const map = new Map<string, { rep_name: string; rep_id: string; items: MissedBeat[] }>();
    missed.forEach((m) => {
      const g = map.get(m.rep_id) || { rep_name: m.rep_name, rep_id: m.rep_id, items: [] };
      g.items.push(m);
      map.set(m.rep_id, g);
    });
    return Array.from(map.values());
  }, [missed]);

  const eligible = missed.filter((m) => !m.too_old && dateForRow(m));
  const allSelected = eligible.length > 0 && eligible.every((m) => selected[rowKey(m)]);

  const toggleAll = () => {
    if (allSelected) {
      setSelected({});
    } else {
      const next: Record<string, boolean> = {};
      eligible.forEach((m) => (next[rowKey(m)] = true));
      setSelected(next);
    }
  };

  const confirmRows = async (rows: MissedBeat[]) => {
    if (!user || rows.length === 0) return;
    setSubmitting(true);
    try {
      const inserts = rows
        .filter((m) => !m.too_old && dateForRow(m))
        .map((m) => ({
          plan_date: dateForRow(m),
          beat_id: m.beat_id,
          assigned_user_id: m.rep_id,
          assigned_by: user.id,
          assignment_type: "temp_cover",
          notes: `Rescheduled from missed beat on ${m.missed_date}`,
          status: "active",
        }));
      if (inserts.length === 0) {
        toast.error("Nothing to reschedule");
        return;
      }
      const { error } = await sb
        .from("daily_beat_plans")
        .upsert(inserts, { onConflict: "plan_date,beat_id,assigned_user_id" });
      if (error) throw error;

      toast.success(`Rescheduled ${inserts.length} beat${inserts.length > 1 ? "s" : ""}`);
      setSelected({});
      setOverrides({});
      qc.invalidateQueries({ queryKey: ["missed-beats"] });
      qc.invalidateQueries({ queryKey: ["calendarData"] });
      qc.invalidateQueries({ queryKey: ["bc-month"] });
      qc.invalidateQueries({ queryKey: ["todayAssignments"] });
      refetch();
    } catch (e: any) {
      toast.error(e.message || "Failed to reschedule");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmAllSelected = () =>
    confirmRows(eligible.filter((m) => selected[rowKey(m)]));
  const confirmAllSuggested = () => confirmRows(eligible);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4" /> Reschedule missed beats
          </SheetTitle>
          <SheetDescription>
            Past {30} days · Beats planned but with no completed visits.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 py-2 border-b flex items-center justify-between gap-3">
          {scopedRepId ? (
            <div className="flex items-center gap-2">
              <Switch
                id="only-rep"
                checked={onlySelectedRep}
                onCheckedChange={setOnlySelectedRep}
              />
              <Label htmlFor="only-rep" className="text-xs">
                Only selected rep
              </Label>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              All {reps.length} subordinate{reps.length === 1 ? "" : "s"}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={toggleAll} disabled={eligible.length === 0}>
              {allSelected ? "Clear" : "Select all"}
            </Button>
            <Badge variant="secondary" className="text-[10px]">
              {missed.length} found
            </Badge>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {isLoading && (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Scanning…
              </div>
            )}

            {!isLoading && missed.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8">
                No missed beats in the last 30 days. 🎉
              </div>
            )}

            {grouped.map((g) => (
              <div key={g.rep_id} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.rep_name} · {g.items.length} missed
                </div>
                <ul className="border rounded-md divide-y">
                  {g.items.map((m) => {
                    const k = rowKey(m);
                    const date = dateForRow(m);
                    return (
                      <li key={k} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!selected[k]}
                          disabled={m.too_old || !date}
                          onChange={(e) =>
                            setSelected((s) => ({ ...s, [k]: e.target.checked }))
                          }
                          className="h-4 w-4 mt-1 sm:mt-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate flex items-center gap-2">
                            {m.beat_name}
                            {m.too_old && (
                              <Badge
                                variant="outline"
                                className="text-[10px] border-beat-uncovered text-beat-uncovered"
                              >
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                {m.age_days}d old
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Missed {format(new Date(m.missed_date + "T00:00:00"), "EEE d MMM")} ·{" "}
                            {m.age_days} day{m.age_days === 1 ? "" : "s"} ago
                          </div>
                          {m.too_old && (
                            <div className="text-[11px] text-beat-uncovered mt-1">
                              Older than {MAX_AUTO_RESCHEDULE_DAYS}d — assign manually.
                            </div>
                          )}
                        </div>
                        {m.too_old ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onOpenAssign?.(m.rep_id)}
                          >
                            Open assign
                          </Button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Input
                              type="date"
                              value={date}
                              min={format(new Date(), "yyyy-MM-dd")}
                              onChange={(e) =>
                                setOverrides((o) => ({ ...o, [k]: e.target.value }))
                              }
                              className="h-8 w-[150px] text-xs"
                            />
                            <Button
                              size="sm"
                              disabled={!date || submitting}
                              onClick={() => confirmRows([m])}
                            >
                              Confirm
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </ScrollArea>

        <Separator />
        <div className="p-3 flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Close
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={confirmAllSuggested}
              disabled={submitting || eligible.length === 0}
            >
              Confirm all suggested ({eligible.length})
            </Button>
            <Button
              onClick={confirmAllSelected}
              disabled={
                submitting ||
                Object.values(selected).filter(Boolean).length === 0
              }
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirm selected
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
