import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, addDays, differenceInCalendarDays } from "date-fns";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertTriangle, CheckCircle2, ChevronDown, Loader2, X, Users, MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubordinates } from "@/hooks/useSubordinates";
import { useBeatAssignment, type AssignmentType } from "@/hooks/useBeatAssignment";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

const sb = supabase as any;
const todayStr = () => format(new Date(), "yyyy-MM-dd");

interface Props {
  initialRepId?: string;
  initialDate?: string;
  /** Kept for backward compat with the page wiring; not used as a hard filter. */
  restrictToOwnerId?: string;
}

const WEEKDAYS = [
  { d: 1, label: "M" }, { d: 2, label: "T" }, { d: 3, label: "W" },
  { d: 4, label: "T" }, { d: 5, label: "F" }, { d: 6, label: "S" }, { d: 0, label: "S" },
];

const TYPE_BADGE: Record<AssignmentType, string> = {
  temp_cover: "bg-beat-stale/15 text-beat-stale border-beat-stale/40",
  split: "bg-beat-shared/15 text-beat-shared border-beat-shared/40",
  permanent: "bg-beat-assigned/15 text-beat-assigned border-beat-assigned/40",
};

function lastServedTone(dateStr: string | null): { label: string; cls: string } {
  if (!dateStr) return { label: "Never served", cls: "text-beat-uncovered" };
  const days = differenceInCalendarDays(new Date(), parseISO(dateStr));
  if (days <= 0) return { label: "Served today", cls: "text-beat-served" };
  if (days <= 3) return { label: `Served ${days}d ago`, cls: "text-beat-served" };
  if (days <= 7) return { label: `${days}d ago`, cls: "text-muted-foreground" };
  if (days <= 14) return { label: `⚠ ${days}d ago`, cls: "text-beat-stale" };
  return { label: `⚠ ${days}d ago — needs attention`, cls: "text-beat-uncovered" };
}

export function BeatAssignmentTab({ initialRepId, initialDate }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { subordinates } = useSubordinates();
  const subIds = useMemo(() => subordinates.map((s) => s.subordinate_user_id), [subordinates]);

  const form = useBeatAssignment({ initialRepId, initialDate });

  // Filters
  const [territory, setTerritory] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);
  // revoke target stored later as RevokeTarget

  // -------- Beat list --------
  const { data: beatsRaw = [], isLoading: lb } = useQuery({
    queryKey: ["bc-tab-beats", subIds.join(",")],
    enabled: subIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Scope to coordinator's subordinates' owned beats
      const { data, error } = await supabase
        .from("beats")
        .select("beat_id, beat_name, category, average_km, average_time_minutes, territory_id, owner_id, owner_name, is_active")
        .eq("is_active", true)
        .in("owner_id", subIds.length ? subIds : ["00000000-0000-0000-0000-000000000000"])
        .order("beat_name");
      if (error) throw error;
      return data || [];
    },
  });

  const beatIds = useMemo(() => beatsRaw.map((b: any) => b.beat_id), [beatsRaw]);

  const { data: retailerCounts = {} as Record<string, number> } = useQuery({
    queryKey: ["bc-tab-retailer-counts", beatIds.join(",")],
    enabled: beatIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("retailers")
        .select("beat_id")
        .in("beat_id", beatIds);
      const out: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        out[r.beat_id] = (out[r.beat_id] || 0) + 1;
      });
      return out;
    },
  });

  const { data: lastServedMap = {} as Record<string, string> } = useQuery({
    queryKey: ["bc-tab-last-served", beatIds.join(",")],
    enabled: beatIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("retailers")
        .select("beat_id, last_visit_date")
        .in("beat_id", beatIds)
        .not("last_visit_date", "is", null)
        .order("last_visit_date", { ascending: false });
      const out: Record<string, string> = {};
      (data || []).forEach((r: any) => {
        if (!out[r.beat_id]) out[r.beat_id] = r.last_visit_date;
      });
      return out;
    },
  });

  const { data: territoryNames = {} as Record<string, string> } = useQuery({
    queryKey: ["bc-tab-territory-names"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("territories").select("id, name");
      const out: Record<string, string> = {};
      (data || []).forEach((t: any) => (out[t.id] = t.name));
      return out;
    },
  });

  // Filter options
  const territoryOptions = useMemo(() => {
    const ids = Array.from(new Set(beatsRaw.map((b: any) => b.territory_id).filter(Boolean)));
    return ids.map((id) => ({ id, name: territoryNames[id as string] || "—" }));
  }, [beatsRaw, territoryNames]);
  const categoryOptions = useMemo(
    () => Array.from(new Set(beatsRaw.map((b: any) => b.category).filter(Boolean))) as string[],
    [beatsRaw],
  );

  const filteredBeats = useMemo(() => {
    const q = search.trim().toLowerCase();
    return beatsRaw.filter((b: any) => {
      if (territory !== "all" && b.territory_id !== territory) return false;
      if (category !== "all" && b.category !== category) return false;
      if (q && !b.beat_name?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [beatsRaw, territory, category, search]);
  const visibleBeats = filteredBeats.slice(0, pageSize);

  const allVisibleSelected =
    visibleBeats.length > 0 &&
    visibleBeats.every((b: any) =>
      form.selectedBeats.some((s) => s.beat_id === b.beat_id),
    );
  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      const visIds = new Set(visibleBeats.map((b: any) => b.beat_id));
      form.setSelectedBeats(form.selectedBeats.filter((b) => !visIds.has(b.beat_id)));
    } else {
      const additions = visibleBeats
        .filter((b: any) => !form.selectedBeats.some((s) => s.beat_id === b.beat_id))
        .map((b: any) => ({ beat_id: b.beat_id, beat_name: b.beat_name }));
      form.setSelectedBeats([...form.selectedBeats, ...additions]);
    }
  };

  const toggleBeat = (b: any) => {
    const exists = form.selectedBeats.some((s) => s.beat_id === b.beat_id);
    form.setSelectedBeats(
      exists
        ? form.selectedBeats.filter((s) => s.beat_id !== b.beat_id)
        : [...form.selectedBeats, { beat_id: b.beat_id, beat_name: b.beat_name }],
    );
  };

  // -------- Reps --------
  const { data: reps = [] } = useQuery({
    queryKey: ["bc-tab-reps", subIds.join(",")],
    enabled: subIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, designation, user_status")
        .in("id", subIds)
        .order("full_name");
      return (data || []).filter((p: any) => (p.user_status ?? "active") === "active");
    },
  });

  // Workload (own + cover) for today
  const { data: workload = {} as Record<string, { own: number; cover: number }> } = useQuery({
    queryKey: ["bc-tab-workload", subIds.join(",")],
    enabled: subIds.length > 0,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const date = todayStr();
      const [draRes, retsRes] = await Promise.all([
        sb
          .from("daily_retailer_assignments")
          .select("assigned_to, assignment_type")
          .eq("plan_date", date)
          .in("assigned_to", subIds),
        supabase.from("retailers").select("user_id").in("user_id", subIds),
      ]);
      const out: Record<string, { own: number; cover: number }> = {};
      subIds.forEach((id) => (out[id] = { own: 0, cover: 0 }));
      const seenDaily = new Set<string>();
      (draRes.data || []).forEach((r: any) => {
        seenDaily.add(r.assigned_to);
        if (r.assignment_type === "leave_sub") out[r.assigned_to].cover += 1;
        else out[r.assigned_to].own += 1;
      });
      (retsRes.data || []).forEach((r: any) => {
        if (r.user_id && !seenDaily.has(r.user_id)) out[r.user_id].own += 1;
      });
      return out;
    },
  });

  // Leave overlap warning for the selected rep within the chosen range
  const { data: leaveOverlap = [] } = useQuery({
    queryKey: ["bc-tab-leave-overlap", form.targetRepId, form.effectiveDates[0], form.effectiveDates[form.effectiveDates.length - 1]],
    enabled: !!form.targetRepId && form.effectiveDates.length > 0,
    queryFn: async () => {
      const start = form.effectiveDates[0];
      const end = form.effectiveDates[form.effectiveDates.length - 1];
      const { data } = await sb
        .from("leave_applications")
        .select("start_date, end_date, status")
        .eq("user_id", form.targetRepId)
        .eq("status", "approved")
        .lte("start_date", end)
        .gte("end_date", start);
      return (data || []) as any[];
    },
  });

  // -------- Today's assignments (next 7 days, by this coordinator) --------
  const { data: nextAssignments = [] } = useQuery({
    queryKey: ["todayAssignments", user?.id],
    enabled: !!user?.id,
    refetchInterval: 30_000,
    queryFn: async () => {
      const start = todayStr();
      const end = format(addDays(new Date(), 7), "yyyy-MM-dd");
      const { data } = await sb
        .from("daily_beat_plans")
        .select("id, plan_date, beat_id, assignment_type, status, notes, assigned_user_id, assigned_by, created_at")
        .eq("assigned_by", user!.id)
        .eq("status", "active")
        .gte("plan_date", start)
        .lte("plan_date", end)
        .order("plan_date", { ascending: true });
      const rows = (data || []) as any[];
      if (!rows.length) return rows;
      const repIds = Array.from(new Set(rows.map((r) => r.assigned_user_id)));
      const beatIdsRow = Array.from(new Set(rows.map((r) => r.beat_id)));
      const [profilesRes, beatsRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", repIds),
        supabase.from("beats").select("beat_id, beat_name, average_km").in("beat_id", beatIdsRow),
      ]);
      const pName = new Map<string, string>();
      (profilesRes.data || []).forEach((p: any) => pName.set(p.id, p.full_name));
      const bMap = new Map<string, any>();
      (beatsRes.data || []).forEach((b: any) => bMap.set(b.beat_id, b));
      return rows.map((r) => ({
        ...r,
        assigned_user_name: pName.get(r.assigned_user_id) || "—",
        beat_name: bMap.get(r.beat_id)?.beat_name || r.beat_id,
        average_km: bMap.get(r.beat_id)?.average_km || 0,
      }));
    },
  });

  // Group: collapse split pairs into a single row carrying both reps
  const groupedByDate = useMemo(() => {
    const out = new Map<string, any[]>();
    const splitMerge = new Map<string, any>(); // key date|beat
    (nextAssignments as any[]).forEach((r) => {
      if (r.assignment_type === "split") {
        const k = `${r.plan_date}|${r.beat_id}`;
        const cur = splitMerge.get(k);
        if (!cur) {
          splitMerge.set(k, {
            ...r,
            __isSplit: true,
            reps: [{ id: r.assigned_user_id, name: r.assigned_user_name, row_id: r.id }],
          });
        } else {
          cur.reps.push({ id: r.assigned_user_id, name: r.assigned_user_name, row_id: r.id });
        }
        return;
      }
      if (!out.has(r.plan_date)) out.set(r.plan_date, []);
      out.get(r.plan_date)!.push(r);
    });
    splitMerge.forEach((v) => {
      if (!out.has(v.plan_date)) out.set(v.plan_date, []);
      out.get(v.plan_date)!.push(v);
    });
    return Array.from(out.entries())
      .map(([d, rows]) => [d, rows.sort((a, b) => a.beat_name.localeCompare(b.beat_name))] as [string, any[]])
      .sort(([a], [b]) => (a < b ? -1 : 1));
  }, [nextAssignments]);

  type RevokeTarget =
    | { kind: "single"; row_id: string }
    | { kind: "split"; row_ids: string[]; reps: { id: string; name: string; row_id: string }[]; date: string; beat_id: string; beat_name: string };
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);

  const revokeRowIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    const { error } = await sb
      .from("daily_beat_plans")
      .update({ status: "cancelled" })
      .in("id", ids);
    if (error) {
      toast.error(error.message || "Failed to revoke");
    } else {
      toast.success(`Revoked ${ids.length} assignment${ids.length > 1 ? "s" : ""}`);
      qc.invalidateQueries({ queryKey: ["todayAssignments"] });
      qc.invalidateQueries({ queryKey: ["calendarData"] });
      qc.invalidateQueries({ queryKey: ["bc-month"] });
    }
    setRevokeTarget(null);
  };

  const repWorkloadFor = (id: string) => workload[id] || { own: 0, cover: 0 };
  const projectedAfter = (id: string) =>
    repWorkloadFor(id).own + repWorkloadFor(id).cover + form.selectedBeats.length;

  if (subIds.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No reps under your hierarchy. Contact your admin.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={territory} onValueChange={setTerritory}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Territory" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All territories</SelectItem>
              {territoryOptions.map((t) => (
                <SelectItem key={t.id as string} value={t.id as string}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categoryOptions.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="h-8 text-xs flex-1 min-w-[160px]"
          placeholder="Search beat name…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPageSize(20); }}
        />
        <Badge variant="outline" className="text-[10px]">
          {filteredBeats.length} beat{filteredBeats.length === 1 ? "" : "s"}
        </Badge>
      </Card>

      <div className="grid gap-3 lg:grid-cols-[1fr_420px]">
        {/* Left — beat list */}
        <Card className="overflow-hidden">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">Beats</CardTitle>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} />
                  Select all visible
                </label>
                <Badge variant="secondary" className="text-[10px]">
                  {form.selectedBeats.length} selected
                </Badge>
              </div>
            </div>
          </CardHeader>
          <ScrollArea className="h-[520px]">
            <div className="divide-y">
              {lb && <div className="p-4 text-sm text-muted-foreground">Loading beats…</div>}
              {!lb && visibleBeats.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">No beats match your filters.</div>
              )}
              {visibleBeats.map((b: any) => {
                const checked = form.selectedBeats.some((s) => s.beat_id === b.beat_id);
                const ls = lastServedTone(lastServedMap[b.beat_id] ?? null);
                const retailers = retailerCounts[b.beat_id] || 0;
                return (
                  <label
                    key={b.beat_id}
                    className={cn(
                      "flex items-start gap-3 p-3 hover:bg-muted/40 cursor-pointer",
                      checked && "bg-primary/5",
                    )}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggleBeat(b)} className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{b.beat_name}</span>
                        {b.territory_id && (
                          <Badge variant="outline" className="text-[10px]">
                            {territoryNames[b.territory_id] || "Territory"}
                          </Badge>
                        )}
                        {b.category && (
                          <Badge variant="outline" className="text-[10px]">{b.category}</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {retailers} retailer{retailers === 1 ? "" : "s"}
                        {b.average_km ? ` · ${b.average_km} km` : ""}
                        {b.average_time_minutes ? ` · ~${b.average_time_minutes} min` : ""}
                      </div>
                      <div className="text-xs mt-0.5">
                        <span className="text-muted-foreground">Owner: </span>
                        <span>{b.owner_name || "Unassigned"}</span>
                        <span className={cn("ml-2", ls.cls)}>{ls.label}</span>
                      </div>
                    </div>
                  </label>
                );
              })}
              {filteredBeats.length > visibleBeats.length && (
                <div className="p-3 text-center">
                  <Button variant="ghost" size="sm" onClick={() => setPageSize((p) => p + 20)}>
                    Load more ({filteredBeats.length - visibleBeats.length} remaining)
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Right — assignment form */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Assignment</CardTitle>
            <CardDescription className="text-xs">
              {form.selectedBeats.length} beat{form.selectedBeats.length === 1 ? "" : "s"} selected
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Type */}
            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">Type</Label>
              <RadioGroup
                value={form.assignmentType}
                onValueChange={(v) => form.setAssignmentType(v as AssignmentType)}
                className="space-y-1.5"
              >
                {[
                  { v: "temp_cover", t: "Temp Cover", d: "Cover this beat temporarily. Owner unchanged." },
                  { v: "split", t: "Split (2 reps)", d: "Two reps share this beat. Both see the same retailers." },
                  { v: "permanent", t: "Permanent", d: "Updates beats.owner_id — master data change." },
                ].map((opt) => (
                  <label key={opt.v} className="flex items-start gap-2 text-sm cursor-pointer">
                    <RadioGroupItem value={opt.v} id={`atype-${opt.v}`} className="mt-0.5" />
                    <div>
                      <div className="font-medium">{opt.t}</div>
                      <div className="text-xs text-muted-foreground">{opt.d}</div>
                    </div>
                  </label>
                ))}
              </RadioGroup>
              {form.assignmentType === "permanent" && (
                <div className="rounded-md border border-beat-stale/40 bg-beat-stale/10 text-xs p-2 flex gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-beat-stale flex-shrink-0 mt-0.5" />
                  This will change the permanent owner of all selected beats.
                </div>
              )}
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">Date</Label>
              <Tabs value={form.dateMode} onValueChange={(v) => form.setDateMode(v as any)}>
                <TabsList className="grid grid-cols-2 h-8">
                  <TabsTrigger value="single" className="text-xs">Single</TabsTrigger>
                  <TabsTrigger value="range" className="text-xs">Range</TabsTrigger>
                </TabsList>
                <TabsContent value="single" className="mt-2">
                  <Input type="date" value={form.singleDate} onChange={(e) => form.setSingleDate(e.target.value)} />
                </TabsContent>
                <TabsContent value="range" className="mt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="date" value={form.rangeStart} onChange={(e) => form.setRangeStart(e.target.value)} />
                    <Input type="date" value={form.rangeEnd} onChange={(e) => form.setRangeEnd(e.target.value)} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {WEEKDAYS.map((wd) => {
                      const active = form.selectedWeekdays.includes(wd.d);
                      return (
                        <button
                          key={wd.d}
                          type="button"
                          onClick={() =>
                            form.setSelectedWeekdays(
                              active
                                ? form.selectedWeekdays.filter((x) => x !== wd.d)
                                : [...form.selectedWeekdays, wd.d].sort(),
                            )
                          }
                          className={cn(
                            "h-7 w-7 text-xs rounded-md border transition-colors",
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-border text-muted-foreground",
                          )}
                        >
                          {wd.label}
                        </button>
                      );
                    })}
                  </div>
                  {form.rangeTooBig && (
                    <div className="text-xs text-beat-uncovered">Range is too long. Max 90 days.</div>
                  )}
                </TabsContent>
              </Tabs>
              <div className="text-xs text-muted-foreground">
                Preview: {form.previewCount} assignment{form.previewCount === 1 ? "" : "s"} ·{" "}
                {form.selectedBeats.length} beat{form.selectedBeats.length === 1 ? "" : "s"} ×{" "}
                {form.effectiveDates.length} date{form.effectiveDates.length === 1 ? "" : "s"}
                {form.assignmentType === "split" && form.rep2Id ? " × 2 reps" : ""}
              </div>
            </div>

            {/* Rep selectors */}
            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">
                {form.assignmentType === "split" ? "Reps (2 required)" : "Target rep"}
              </Label>
              <Select
                value={form.targetRepId}
                onValueChange={(v) => {
                  form.setTargetRepId(v);
                  form.setTargetRepName(reps.find((r: any) => r.id === v)?.full_name || "");
                }}
              >
                <SelectTrigger><SelectValue placeholder="Pick a rep" /></SelectTrigger>
                <SelectContent>
                  {reps.map((r: any) => {
                    const w = repWorkloadFor(r.id);
                    const total = w.own + w.cover;
                    const projected = total + form.selectedBeats.length;
                    return (
                      <SelectItem key={r.id} value={r.id}>
                        <span className={cn(projected > 70 && "text-beat-stale")}>
                          {r.full_name} — {w.own} own + {w.cover} cover = {total}
                          {form.selectedBeats.length > 0 ? ` → ${projected}` : ""}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {form.targetRepId && projectedAfter(form.targetRepId) > 70 && (
                <div className="text-xs text-beat-stale flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> Near overload after this assignment
                  ({projectedAfter(form.targetRepId)}).
                </div>
              )}
              {form.assignmentType === "split" && (
                <>
                  <Select value={form.rep2Id} onValueChange={form.setRep2Id}>
                    <SelectTrigger><SelectValue placeholder="Pick second rep" /></SelectTrigger>
                    <SelectContent>
                      {reps.map((r: any) => {
                        const w = repWorkloadFor(r.id);
                        const total = w.own + w.cover;
                        const projected = total + form.selectedBeats.length;
                        const sameAsRep1 = r.id === form.targetRepId;
                        return (
                          <SelectItem key={r.id} value={r.id} disabled={sameAsRep1}>
                            <span className={cn(projected > 70 && "text-beat-stale")}>
                              {r.full_name} — {w.own} own + {w.cover} cover = {total}
                              {form.selectedBeats.length > 0 ? ` → ${projected}` : ""}
                              {sameAsRep1 ? " (Rep 1)" : ""}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {form.rep2Id && form.rep2Id === form.targetRepId && (
                    <div className="text-xs text-beat-uncovered flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Rep 1 and Rep 2 must be different
                    </div>
                  )}
                  {form.rep2Id && projectedAfter(form.rep2Id) > 70 && (
                    <div className="text-xs text-beat-stale flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" /> Rep 2 near overload
                      ({projectedAfter(form.rep2Id)}).
                    </div>
                  )}
                </>
              )}
              {leaveOverlap.length > 0 && (
                <div className="text-xs text-beat-uncovered flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span>
                    Rep on leave {leaveOverlap.map((l: any) => `${l.start_date}–${l.end_date}`).join(", ")} (overlaps your range).
                  </span>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">Notes (optional)</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => form.setNotes(e.target.value)} />
            </div>

            {/* Conflicts */}
            <div className="space-y-1.5">
              {form.conflicts.length === 0 ? (
                form.selectedBeats.length > 0 && form.targetRepId && form.effectiveDates.length > 0 && (
                  <div className="text-xs text-beat-served flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" /> No conflicts — ready to assign
                  </div>
                )
              ) : (
                <Collapsible>
                  <CollapsibleTrigger className="text-xs text-beat-stale flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {form.conflicts.length} conflict{form.conflicts.length === 1 ? "" : "s"} — show details
                    <ChevronDown className="h-3 w-3" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-1.5 space-y-1">
                    <div className="rounded-md border bg-muted/30 p-2 max-h-32 overflow-auto text-xs space-y-1">
                      {form.conflicts.map((c, i) => (
                        <div key={i} className="text-muted-foreground">{c.message}</div>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={form.overwriteConflicts}
                        onCheckedChange={(v) => form.setOverwriteConflicts(!!v)}
                      />
                      Overwrite existing assignments on conflicting dates
                    </label>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={form.reset} disabled={form.submitting}>Clear</Button>
              <Button className="flex-1" onClick={form.handleConfirm} disabled={!form.canConfirm || form.submitting}>
                {form.submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm assignment ({form.previewCount})
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom — today's & upcoming assignments */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Your recent assignments (next 7 days)</CardTitle>
          <CardDescription className="text-xs">Auto-refreshes every 30s.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {groupedByDate.length === 0 && (
            <div className="text-sm text-muted-foreground">No assignments in the next 7 days.</div>
          )}
          {groupedByDate.map(([date, rows]) => {
            const days = differenceInCalendarDays(parseISO(date), new Date());
            const label =
              days === 0 ? "TODAY"
              : days === 1 ? "TOMORROW"
              : format(parseISO(date), "EEE d MMM").toUpperCase();
            return (
              <div key={date}>
                <div className="text-[11px] font-semibold text-muted-foreground tracking-wide mb-1.5">
                  {label} — {rows.length} assignment{rows.length === 1 ? "" : "s"}
                </div>
                <ul className="border rounded-md divide-y">
                  {rows.map((r: any) => (
                    <li key={r.__isSplit ? `split-${r.plan_date}-${r.beat_id}` : r.id} className="p-2.5 flex items-center gap-3 flex-wrap">
                      <Badge variant="outline" className="text-xs">{r.beat_name}</Badge>
                      {r.__isSplit ? (
                        <>
                          <span className="text-sm">
                            → {r.reps.map((x: any) => x.name).join(" + ")}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[10px] border-0"
                            style={{ background: "#EEEDFE", color: "#534AB7" }}
                          >
                            Split
                          </Badge>
                        </>
                      ) : (
                        <>
                          <span className="text-sm">→ {r.assigned_user_name}</span>
                          <Badge variant="outline" className={cn("text-[10px]", TYPE_BADGE[r.assignment_type as AssignmentType] || "")}>
                            {r.assignment_type}
                          </Badge>
                        </>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {format(parseISO(r.plan_date), "d MMM")}
                        {r.average_km ? ` · ${r.average_km} km` : ""}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          r.__isSplit
                            ? setRevokeTarget({
                                kind: "split",
                                row_ids: r.reps.map((x: any) => x.row_id),
                                reps: r.reps,
                                date: r.plan_date,
                                beat_id: r.beat_id,
                                beat_name: r.beat_name,
                              })
                            : setRevokeTarget({ kind: "single", row_id: r.id })
                        }
                        title="Revoke"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Single revoke */}
      <DeleteConfirmDialog
        open={revokeTarget?.kind === "single"}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        onConfirm={() =>
          revokeTarget?.kind === "single" && revokeRowIds([revokeTarget.row_id])
        }
        title="Revoke assignment?"
        description="The rep will no longer see this beat for the assigned date. The original master ownership stays untouched."
        confirmText="Revoke"
      />

      {/* Split revoke — pick one or both */}
      {revokeTarget?.kind === "split" && (
        <SplitRevokeDialog
          target={revokeTarget}
          onClose={() => setRevokeTarget(null)}
          onPick={revokeRowIds}
        />
      )}
    </div>
  );
}

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

function SplitRevokeDialog({
  target,
  onClose,
  onPick,
}: {
  target: { row_ids: string[]; reps: { id: string; name: string; row_id: string }[]; beat_name: string; date: string };
  onClose: () => void;
  onPick: (ids: string[]) => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke split assignment</DialogTitle>
          <DialogDescription>
            {target.beat_name} on {format(parseISO(target.date), "EEE d MMM")} — pick which rep(s) to revoke.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {target.reps.map((rep) => (
            <Button
              key={rep.id}
              variant="outline"
              className="w-full justify-start"
              onClick={() => onPick([rep.row_id])}
            >
              Remove {rep.name} only
            </Button>
          ))}
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => onPick(target.row_ids)}
          >
            Remove both
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BeatAssignmentTab;
