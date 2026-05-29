import { useEffect, useMemo, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  generateDateRange,
  detectConflicts,
  type AssignmentConflict,
} from "@/utils/dateRangeUtils";

const sb = supabase as any;
const today = () => format(new Date(), "yyyy-MM-dd");

export type AssignmentType = "permanent" | "temp_cover" | "split";
export type DateMode = "single" | "range";

export interface BeatLite {
  beat_id: string;
  beat_name: string;
}

export function useBeatAssignment(opts?: { initialRepId?: string; initialDate?: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [selectedBeats, setSelectedBeats] = useState<BeatLite[]>([]);
  const [assignmentType, setAssignmentType] = useState<AssignmentType>("temp_cover");
  const [dateMode, setDateMode] = useState<DateMode>("single");
  const [singleDate, setSingleDate] = useState<string>(opts?.initialDate || today());
  const [rangeStart, setRangeStart] = useState<string>(opts?.initialDate || today());
  const [rangeEnd, setRangeEnd] = useState<string>(format(addDays(new Date(), 6), "yyyy-MM-dd"));
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [targetRepId, setTargetRepId] = useState<string>(opts?.initialRepId || "");
  const [targetRepName, setTargetRepName] = useState<string>("");
  const [rep2Id, setRep2Id] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [overwriteConflicts, setOverwriteConflicts] = useState(false);
  const [conflicts, setConflicts] = useState<AssignmentConflict[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const effectiveDates = useMemo(() => {
    if (dateMode === "single") return singleDate ? [singleDate] : [];
    return generateDateRange(rangeStart, rangeEnd, selectedWeekdays);
  }, [dateMode, singleDate, rangeStart, rangeEnd, selectedWeekdays]);

  const rangeTooBig = dateMode === "range" && effectiveDates.length > 90;

  // Re-run conflict detection when inputs change
  useEffect(() => {
    let cancelled = false;
    if (!selectedBeats.length || !targetRepId || !effectiveDates.length || rangeTooBig) {
      setConflicts([]);
      return;
    }
    const t = setTimeout(async () => {
      const c = await detectConflicts(
        selectedBeats.map((b) => b.beat_id),
        targetRepId,
        effectiveDates,
      );
      if (!cancelled) setConflicts(c);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [selectedBeats, targetRepId, effectiveDates, rangeTooBig]);

  const conflictDates = useMemo(
    () => new Set(conflicts.map((c) => `${c.date}|${c.beat_id}`)),
    [conflicts],
  );

  const previewCount = useMemo(() => {
    const datesUsed = overwriteConflicts
      ? effectiveDates
      : effectiveDates.filter((d) =>
          selectedBeats.some((b) => !conflictDates.has(`${d}|${b.beat_id}`)),
        );
    const reps = assignmentType === "split" && rep2Id ? 2 : 1;
    // Approx: count actual non-conflict (date, beat) pairs × reps
    let pairs = 0;
    for (const d of datesUsed) {
      for (const b of selectedBeats) {
        if (overwriteConflicts || !conflictDates.has(`${d}|${b.beat_id}`)) pairs++;
      }
    }
    return pairs * reps;
  }, [effectiveDates, selectedBeats, conflictDates, overwriteConflicts, assignmentType, rep2Id]);

  const canConfirm =
    !!user &&
    selectedBeats.length > 0 &&
    !!targetRepId &&
    effectiveDates.length > 0 &&
    !rangeTooBig &&
    previewCount > 0 &&
    (assignmentType !== "split" || (!!rep2Id && rep2Id !== targetRepId));

  const reset = useCallback(() => {
    setSelectedBeats([]);
    setNotes("");
    setOverwriteConflicts(false);
    setConflicts([]);
    setRep2Id("");
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!canConfirm || !user) return;
    setSubmitting(true);
    try {
      const reps =
        assignmentType === "split" && rep2Id ? [targetRepId, rep2Id] : [targetRepId];

      const rows: any[] = [];
      for (const date of effectiveDates) {
        for (const beat of selectedBeats) {
          if (!overwriteConflicts && conflictDates.has(`${date}|${beat.beat_id}`)) continue;
          for (const rep of reps) {
            rows.push({
              plan_date: date,
              beat_id: beat.beat_id,
              assigned_user_id: rep,
              assigned_by: user.id,
              assignment_type: assignmentType,
              status: "active",
              notes: notes || null,
            });
          }
        }
      }
      if (rows.length === 0) {
        toast.error("Nothing to assign — all dates conflict.");
        return;
      }

      const { error } = await sb
        .from("daily_beat_plans")
        .upsert(rows, { onConflict: "plan_date,beat_id,assigned_user_id" });
      if (error) throw error;

      // Permanent → also update beats master
      if (assignmentType === "permanent") {
        await supabase
          .from("beats")
          .update({ owner_id: targetRepId, owner_name: targetRepName || null })
          .in(
            "beat_id",
            selectedBeats.map((b) => b.beat_id),
          );
      }

      // Split → also propagate retailer-level visibility for both reps
      if (assignmentType === "split" && rep2Id) {
        const { data: retailers } = await supabase
          .from("retailers")
          .select("id, beat_id")
          .in(
            "beat_id",
            selectedBeats.map((b) => b.beat_id),
          );
        if ((retailers || []).length > 0) {
          const draRows: any[] = [];
          for (const date of effectiveDates) {
            for (const r of retailers as any[]) {
              for (const rep of reps) {
                draRows.push({
                  plan_date: date,
                  retailer_id: r.id,
                  beat_id: r.beat_id,
                  assigned_to: rep,
                  assignment_type: "split",
                  created_by: user.id,
                });
              }
            }
          }
          await sb
            .from("daily_retailer_assignments")
            .upsert(draRows, { onConflict: "plan_date,retailer_id" });
        }
      }

      toast.success(`Created ${rows.length} assignment${rows.length > 1 ? "s" : ""}`);
      reset();
      qc.invalidateQueries({ queryKey: ["calendarData"] });
      qc.invalidateQueries({ queryKey: ["bc-month"] });
      qc.invalidateQueries({ queryKey: ["todayAssignments"] });
      qc.invalidateQueries({ queryKey: ["rep-sidebar"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to assign");
    } finally {
      setSubmitting(false);
    }
  }, [
    canConfirm, user, assignmentType, rep2Id, targetRepId, targetRepName,
    effectiveDates, selectedBeats, overwriteConflicts, conflictDates, notes, qc, reset,
  ]);

  return {
    // state
    selectedBeats, assignmentType, dateMode, singleDate,
    rangeStart, rangeEnd, selectedWeekdays, targetRepId, targetRepName,
    rep2Id, notes, overwriteConflicts, conflicts, submitting,
    // setters
    setSelectedBeats, setAssignmentType, setDateMode, setSingleDate,
    setRangeStart, setRangeEnd, setSelectedWeekdays,
    setTargetRepId, setTargetRepName, setRep2Id, setNotes, setOverwriteConflicts,
    // computed
    effectiveDates, previewCount, canConfirm, rangeTooBig,
    // actions
    handleConfirm, reset,
  };
}
