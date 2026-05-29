import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubordinates } from "@/hooks/useSubordinates";
import { generateDateRange } from "@/utils/beatCalendarUtils";

const sb = supabase as any;

type AssignType = "permanent" | "temp_cover" | "split";

interface Props {
  open: boolean;
  onClose: () => void;
  initialRepId?: string | null;
  initialDate?: string;
  initialType?: AssignType;
  /** Restrict beat list to those owned by this rep */
  restrictToOwnerId?: string | null;
}

const WEEKDAYS = [
  { d: 1, label: "Mon" },
  { d: 2, label: "Tue" },
  { d: 3, label: "Wed" },
  { d: 4, label: "Thu" },
  { d: 5, label: "Fri" },
  { d: 6, label: "Sat" },
  { d: 0, label: "Sun" },
];

export function DateRangeAssignDrawer({
  open, onClose, initialRepId, initialDate, initialType = "permanent", restrictToOwnerId,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { subordinates } = useSubordinates();

  const [search, setSearch] = useState("");
  const [selectedBeats, setSelectedBeats] = useState<string[]>([]);
  const [rep1, setRep1] = useState<string>(initialRepId || "");
  const [rep2, setRep2] = useState<string>("");
  const [start, setStart] = useState<string>(initialDate || new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState<string>(initialDate || new Date().toISOString().slice(0, 10));
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [type, setType] = useState<AssignType>(initialType);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRep1(initialRepId || "");
    setRep2("");
    setStart(initialDate || new Date().toISOString().slice(0, 10));
    setEnd(initialDate || new Date().toISOString().slice(0, 10));
    setType(initialType);
    setSelectedBeats([]);
    setNotes("");
  }, [open, initialRepId, initialDate, initialType]);

  const { data: beats = [] } = useQuery({
    queryKey: ["range-assign-beats", restrictToOwnerId || "all"],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let q = supabase
        .from("beats")
        .select("beat_id, beat_name, owner_id, owner_name, is_active")
        .eq("is_active", true)
        .order("beat_name");
      if (restrictToOwnerId) q = q.eq("owner_id", restrictToOwnerId);
      const { data } = await q;
      return data || [];
    },
  });

  const { data: reps = [] } = useQuery({
    queryKey: ["range-assign-reps", subordinates.map((s) => s.subordinate_user_id).join(",")],
    enabled: open && subordinates.length > 0,
    queryFn: async () => {
      const ids = subordinates.map((s) => s.subordinate_user_id);
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, designation")
        .in("id", ids)
        .order("full_name");
      return data || [];
    },
  });

  const filtered = useMemo(
    () =>
      beats.filter(
        (b: any) =>
          b.beat_name?.toLowerCase().includes(search.toLowerCase()) ||
          b.beat_id?.toLowerCase().includes(search.toLowerCase()),
      ),
    [beats, search],
  );

  const dates = useMemo(() => generateDateRange(start, end, weekdays), [start, end, weekdays]);

  const repsForRows = type === "split" && rep2 ? [rep1, rep2].filter(Boolean) : [rep1].filter(Boolean);
  const totalRows = dates.length * selectedBeats.length * repsForRows.length;

  const toggleBeat = (id: string) =>
    setSelectedBeats((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleWd = (d: number) =>
    setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort()));

  const handleConfirm = async () => {
    if (!user) return;
    if (!rep1) return toast.error("Pick a rep");
    if (type === "split" && !rep2) return toast.error("Pick a second rep for split");
    if (selectedBeats.length === 0) return toast.error("Select at least one beat");
    if (dates.length === 0) return toast.error("No dates in range");

    setSubmitting(true);
    try {
      const planRows: any[] = [];
      for (const date of dates) {
        for (const bid of selectedBeats) {
          for (const rep of repsForRows) {
            planRows.push({
              plan_date: date,
              beat_id: bid,
              assigned_user_id: rep,
              assigned_by: user.id,
              assignment_type: type,
              notes: notes || null,
            });
          }
        }
      }
      const { error } = await sb.from("daily_beat_plans").upsert(planRows, {
        onConflict: "plan_date,beat_id,assigned_user_id",
      });
      if (error) throw error;

      toast.success(`Created ${planRows.length} assignment${planRows.length > 1 ? "s" : ""}`);
      qc.invalidateQueries({ queryKey: ["calendarData"] });
      qc.invalidateQueries({ queryKey: ["bc-month"] });
      qc.invalidateQueries({ queryKey: ["rep-sidebar"] });
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to assign");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>Assign beats for a date range</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Beats</Label>
            <Input placeholder="Search beat name / id…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <ScrollArea className="h-48 rounded-md border">
              <div className="divide-y">
                {filtered.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground">No beats match.</div>
                )}
                {filtered.map((b: any) => (
                  <label key={b.beat_id} className="flex items-center gap-3 p-2.5 hover:bg-muted/40 cursor-pointer">
                    <Checkbox checked={selectedBeats.includes(b.beat_id)} onCheckedChange={() => toggleBeat(b.beat_id)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{b.beat_name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{b.beat_id} · {b.owner_name || "—"}</div>
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>
            <div className="text-xs text-muted-foreground">{selectedBeats.length} selected</div>
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as AssignType)} className="flex gap-4">
              {(["temp_cover", "split", "permanent"] as AssignType[]).map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <RadioGroupItem value={t} id={`drt-${t}`} />
                  <Label htmlFor={`drt-${t}`} className="capitalize text-sm">{t.replace("_", " ")}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className={`grid gap-3 ${type === "split" ? "grid-cols-2" : "grid-cols-1"}`}>
            <div className="space-y-1.5">
              <Label>{type === "split" ? "Rep 1" : "Rep"}</Label>
              <Select value={rep1} onValueChange={setRep1}>
                <SelectTrigger><SelectValue placeholder="Pick rep" /></SelectTrigger>
                <SelectContent>
                  {reps.map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {type === "split" && (
              <div className="space-y-1.5">
                <Label>Rep 2</Label>
                <Select value={rep2} onValueChange={setRep2}>
                  <SelectTrigger><SelectValue placeholder="Pick rep" /></SelectTrigger>
                  <SelectContent>
                    {reps.filter((r: any) => r.id !== rep1).map((r: any) => (
                      <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End date</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Repeat on</Label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((wd) => (
                <button
                  key={wd.d}
                  type="button"
                  onClick={() => toggleWd(wd.d)}
                  className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                    weekdays.includes(wd.d)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-muted-foreground"
                  }`}
                >
                  {wd.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="rounded-md bg-muted/40 p-3 text-sm">
            Will create <strong>{totalRows}</strong> assignment{totalRows === 1 ? "" : "s"} across{" "}
            <strong>{dates.length}</strong> day{dates.length === 1 ? "" : "s"}.
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={submitting || totalRows === 0}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm assignments
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
