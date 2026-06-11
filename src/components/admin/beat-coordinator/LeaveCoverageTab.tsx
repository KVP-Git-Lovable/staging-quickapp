import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Bell, ChevronLeft, ChevronRight, Loader2, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubordinates } from "@/hooks/useSubordinates";
import { useRepWorkloadToday } from "@/hooks/useRepWorkloadToday";
import { useCoordinatorAlerts } from "@/hooks/useCoordinatorAlerts";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { applyHalfDayFilter } from "@/utils/halfDayRouteUtils";
import { cn } from "@/lib/utils";

const sb = supabase as any;
const todayStr = () => new Date().toISOString().slice(0, 10);
const HEAVY_LOAD_THRESHOLD = 70;
const HIGH_PENDING = 500;

interface RepRow {
  id: string;
  full_name: string;
}
interface RetailerRow {
  id: string;
  name: string;
  beat_id: string;
  beat_name?: string | null;
  user_id: string;
  priority: string | null;
  pending_amount: number | null;
  last_visit_date: string | null;
}
interface LeaveRow {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  is_half_day: boolean | null;
  half_day_period: string | null;
}
interface Batch { coverRepId: string; retailerIds: string[]; }

interface Props {
  initialDate?: string;
  initialRepId?: string;
}

function addDays(date: string, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function thisWeekRange(date: string): [string, string] {
  const d = new Date(date);
  const dow = d.getDay(); // 0=Sun..6=Sat
  const diffToMon = (dow + 6) % 7;
  const mon = new Date(d); mon.setDate(d.getDate() - diffToMon);
  const sat = new Date(mon); sat.setDate(mon.getDate() + 5);
  return [mon.toISOString().slice(0, 10), sat.toISOString().slice(0, 10)];
}
function priorityRank(p: string | null) {
  if (!p) return 9;
  const v = p.toUpperCase();
  if (v.includes("A")) return 0;
  if (v.includes("B")) return 1;
  if (v.includes("C")) return 2;
  return 3;
}
function daysAgo(d: string | null) {
  if (!d) return null;
  const ms = Date.now() - new Date(d).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

export function LeaveCoverageTab({ initialDate, initialRepId }: Props = {}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { subordinateIds } = useSubordinates();
  const { data: alerts = [], markRead } = useCoordinatorAlerts();

  const [mode, setMode] = useState<"today" | "week" | "custom">("today");
  const [planDate, setPlanDate] = useState<string>(initialDate || todayStr());
  const [highlightRep, setHighlightRep] = useState<string | null>(initialRepId || null);

  // Allowed scope: subordinates + self (so a flat-team coordinator still sees their team).
  // Falls back to "all profiles" if user has no subordinate hierarchy yet.
  const teamScope = useMemo(() => {
    const ids = new Set<string>(subordinateIds);
    if (user?.id) ids.add(user.id);
    return Array.from(ids);
  }, [subordinateIds, user?.id]);

  // All active reps (used to render names + pick cover)
  const [aiSuggesting, setAiSuggesting] = useState<string | null>(null); // aid being suggested
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, any[]>>({});

  const { data: reps = [] } = useQuery<RepRow[]>({
    queryKey: ["bc-reps", teamScope],
    queryFn: async () => {
      let q = supabase.from("profiles").select("id, full_name, user_status").order("full_name");
      const { data, error } = await q;
      if (error) throw error;
      return ((data || []) as any[])
        .filter((p) => (p.user_status ?? "active") === "active")
        .map((p) => ({ id: p.id, full_name: p.full_name }));
    },
    staleTime: 5 * 60 * 1000,
  });
  const repMap = useMemo(() => Object.fromEntries(reps.map((r) => [r.id, r.full_name])), [reps]);
  const teamReps = useMemo(
    () => (teamScope.length ? reps.filter((r) => teamScope.includes(r.id)) : reps),
    [reps, teamScope],
  );

  // ── Approved leave for the date ────────────────────────────────────
  const { data: leaves = [] } = useQuery<LeaveRow[]>({
    queryKey: ["bc-leaves", planDate, teamScope],
    queryFn: async () => {
      let q = supabase
        .from("leave_applications")
        .select("id, user_id, start_date, end_date, is_half_day, half_day_period, status")
        .eq("status", "approved")
        .lte("start_date", planDate)
        .gte("end_date", planDate);
      if (teamScope.length) q = q.in("user_id", teamScope);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as LeaveRow[];
    },
  });

  // ── Unplanned absentees: team reps with no attendance and no leave ─
  // Only meaningful for today/past dates (we can't predict the future).
  const isPastOrToday = planDate <= todayStr();
  const { data: presentIds = new Set<string>() } = useQuery<Set<string>>({
    queryKey: ["bc-attendance-present", planDate, teamScope],
    enabled: isPastOrToday && teamScope.length > 0,
    queryFn: async () => {
      const { data } = await sb
        .from("attendance")
        .select("user_id, status")
        .eq("date", planDate)
        .in("user_id", teamScope);
      // Anyone with an attendance row that isn't explicitly "absent" counts as covered
      return new Set<string>(
        (data || [])
          .filter((r: any) => (r.status || "present") !== "absent")
          .map((r: any) => r.user_id),
      );
    },
  });

  const onLeaveSet = useMemo(() => new Set(leaves.map((l) => l.user_id)), [leaves]);
  const unplannedAbsentees = useMemo(() => {
    if (!isPastOrToday) return [] as string[];
    return teamScope.filter((id) => !onLeaveSet.has(id) && !presentIds.has(id) && id !== user?.id);
  }, [isPastOrToday, teamScope, onLeaveSet, presentIds, user?.id]);

  const absentees = useMemo(
    () => Array.from(new Set([...leaves.map((l) => l.user_id), ...unplannedAbsentees])),
    [leaves, unplannedAbsentees],
  );
  const leaveByRep = useMemo(() => {
    const m: Record<string, LeaveRow & { unplanned?: boolean }> = {};
    leaves.forEach((l) => (m[l.user_id] = l));
    unplannedAbsentees.forEach((uid) => {
      if (!m[uid]) {
        m[uid] = {
          id: `unplanned-${uid}`,
          user_id: uid,
          start_date: planDate,
          end_date: planDate,
          is_half_day: false,
          half_day_period: null,
          unplanned: true,
        };
      }
    });
    return m;
  }, [leaves, unplannedAbsentees, planDate]);

  // ── Retailers owned by absentees ───────────────────────────────────
  const { data: retailerByRep = {} } = useQuery<Record<string, RetailerRow[]>>({
    queryKey: ["bc-absent-retailers", absentees],
    enabled: absentees.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("retailers")
        .select("id, name, beat_id, beat_name, user_id, priority, pending_amount, last_visit_date")
        .in("user_id", absentees as string[])
        .eq("status", "active");
      const map: Record<string, RetailerRow[]> = {};
      (data || []).forEach((r: any) => {
        (map[r.user_id] ||= []).push(r as RetailerRow);
      });
      return map;
    },
  });

  // Already-visited retailers per absent rep (mid-day leave)
  const { data: visitedByRep = {} } = useQuery<Record<string, Set<string>>>({
    queryKey: ["bc-visited", absentees, planDate],
    enabled: absentees.length > 0,
    queryFn: async () => {
      const { data } = await sb
        .from("visits")
        .select("user_id, retailer_id, status, planned_date")
        .in("user_id", absentees as string[])
        .eq("planned_date", planDate)
        .eq("status", "completed");
      const m: Record<string, Set<string>> = {};
      (data || []).forEach((v: any) => {
        (m[v.user_id] ||= new Set()).add(v.retailer_id);
      });
      return m;
    },
  });

  // Cascading: absentees who were themselves cover reps for today
  const { data: cascadingMap = {} } = useQuery<Record<string, Set<string>>>({
    queryKey: ["bc-cascading", absentees, planDate],
    enabled: absentees.length > 0,
    queryFn: async () => {
      const { data } = await sb
        .from("daily_retailer_assignments")
        .select("assigned_to, retailer_id")
        .in("assigned_to", absentees as string[])
        .eq("plan_date", planDate)
        .eq("assignment_type", "leave_sub");
      const m: Record<string, Set<string>> = {};
      (data || []).forEach((d: any) => {
        (m[d.assigned_to] ||= new Set()).add(d.retailer_id);
      });
      return m;
    },
  });

  // Existing leave_sub coverage for the day (for live list)
  const { data: existingCover = [], refetch: refetchCover } = useQuery({
    queryKey: ["bc-dra", planDate],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await sb
        .from("daily_retailer_assignments")
        .select("id, plan_date, retailer_id, beat_id, assigned_to, assignment_type, created_by, created_at")
        .eq("plan_date", planDate)
        .eq("assignment_type", "leave_sub")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Half-day filtered IDs cache
  const [halfDayFilter, setHalfDayFilter] = useState<Record<string, { ids: Set<string>; hasHistory: boolean } | null>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: typeof halfDayFilter = {};
      for (const aid of absentees) {
        const lv = leaveByRep[aid];
        if (!lv?.is_half_day || !lv?.half_day_period) continue;
        const all = (retailerByRep[aid] || []).map((r) => r.id);
        const { filtered, hasHistory } = await applyHalfDayFilter(all, aid, lv.half_day_period);
        next[aid] = { ids: new Set(filtered), hasHistory };
      }
      if (!cancelled) setHalfDayFilter(next);
    })();
    return () => { cancelled = true; };
  }, [absentees.join(","), retailerByRep, leaveByRep]);

  // Workload for cover-rep selector
  const { data: workload = {} } = useRepWorkloadToday(reps.map((r) => r.id), planDate);

  // ── Card-local state ───────────────────────────────────────────────
  const [batchesByAbsent, setBatchesByAbsent] = useState<Record<string, Batch[]>>({});
  const [stagedByAbsent, setStagedByAbsent] = useState<Record<string, Set<string>>>({});
  const [coverPickByAbsent, setCoverPickByAbsent] = useState<Record<string, string>>({});
  const [searchByAbsent, setSearchByAbsent] = useState<Record<string, string>>({});
  const [filterByAbsent, setFilterByAbsent] = useState<Record<string, "all" | "priority_a" | "high_pending">>({});
  const [submittingFor, setSubmittingFor] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [bulkCancelFor, setBulkCancelFor] = useState<string | null>(null);

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Auto-scroll to highlighted rep
  useEffect(() => {
    if (!highlightRep) return;
    const el = cardRefs.current[highlightRep];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => setHighlightRep(null), 2500);
    }
  }, [highlightRep, absentees]);

  // ── Helpers ────────────────────────────────────────────────────────
  function getEligible(absent: string): RetailerRow[] {
    const all = retailerByRep[absent] || [];
    const visited = visitedByRep[absent] || new Set();
    let list = all.filter((r) => !visited.has(r.id));

    const lv = leaveByRep[absent];
    if (lv?.is_half_day && halfDayFilter[absent]?.hasHistory) {
      const halfIds = halfDayFilter[absent]!.ids;
      list = list.filter((r) => halfIds.has(r.id));
    }
    return list.sort(
      (a, b) => priorityRank(a.priority) - priorityRank(b.priority) ||
                (b.pending_amount || 0) - (a.pending_amount || 0),
    );
  }
  function visualList(absent: string): RetailerRow[] {
    const search = (searchByAbsent[absent] || "").toLowerCase().trim();
    const filter = filterByAbsent[absent] || "all";
    return getEligible(absent).filter((r) => {
      if (search && !r.name.toLowerCase().includes(search)) return false;
      if (filter === "priority_a" && priorityRank(r.priority) !== 0) return false;
      if (filter === "high_pending" && (r.pending_amount || 0) <= HIGH_PENDING) return false;
      return true;
    });
  }
  function assignedIdsFor(absent: string): Set<string> {
    const s = new Set<string>();
    (batchesByAbsent[absent] || []).forEach((b) => b.retailerIds.forEach((id) => s.add(id)));
    return s;
  }
  function unassignedFor(absent: string): RetailerRow[] {
    const taken = assignedIdsFor(absent);
    return getEligible(absent).filter((r) => !taken.has(r.id));
  }
  function unassignedVisible(absent: string): RetailerRow[] {
    const taken = assignedIdsFor(absent);
    return visualList(absent).filter((r) => !taken.has(r.id));
  }

  function toggleStaged(absent: string, rid: string) {
    setStagedByAbsent((prev) => {
      const s = new Set(prev[absent] || []);
      s.has(rid) ? s.delete(rid) : s.add(rid);
      return { ...prev, [absent]: s };
    });
  }
  function selectAllSmart(absent: string) {
    const visible = unassignedVisible(absent);
    const current = stagedByAbsent[absent] || new Set();
    const priorityA = visible.filter((r) => priorityRank(r.priority) === 0);
    // Click 1: select all Priority A; Click 2: all visible; Click 3: clear
    if (current.size === 0 && priorityA.length > 0) {
      setStagedByAbsent((prev) => ({ ...prev, [absent]: new Set(priorityA.map((r) => r.id)) }));
    } else if (current.size < visible.length) {
      setStagedByAbsent((prev) => ({ ...prev, [absent]: new Set(visible.map((r) => r.id)) }));
    } else {
      setStagedByAbsent((prev) => ({ ...prev, [absent]: new Set() }));
    }
  }
  function clearStaged(absent: string) {
    setStagedByAbsent((prev) => ({ ...prev, [absent]: new Set() }));
  }
  function preselectCascade(absent: string) {
    const ids = cascadingMap[absent];
    if (!ids || ids.size === 0) return;
    setStagedByAbsent((prev) => ({ ...prev, [absent]: new Set(ids) }));
    toast.message(`${ids.size} retailer(s) pre-selected — pick a cover rep`);
  }
  function addBatch(absent: string) {
    const cover = coverPickByAbsent[absent];
    const ids = Array.from(stagedByAbsent[absent] || []);
    if (!cover) return toast.error("Pick a cover rep first");
    if (ids.length === 0) return toast.error("Select retailers first");
    setBatchesByAbsent((prev) => ({
      ...prev,
      [absent]: [...(prev[absent] || []), { coverRepId: cover, retailerIds: ids }],
    }));
    clearStaged(absent);
    setCoverPickByAbsent((prev) => ({ ...prev, [absent]: "" }));
  }
  function removeBatch(absent: string, idx: number) {
    setBatchesByAbsent((prev) => ({
      ...prev,
      [absent]: (prev[absent] || []).filter((_, i) => i !== idx),
    }));
  }

  async function confirmFor(absent: string, alertId?: string) {
    if (!user) return;
    const batches = batchesByAbsent[absent] || [];
    if (batches.length === 0) return toast.error("Add at least one batch");
    setSubmittingFor(absent);
    try {
      const eligible = retailerByRep[absent] || [];
      const beatById = Object.fromEntries(eligible.map((r) => [r.id, r.beat_id]));
      const rows: any[] = [];
      batches.forEach((b) => {
        b.retailerIds.forEach((rid) => {
          rows.push({
            plan_date: planDate,
            retailer_id: rid,
            beat_id: beatById[rid] || "unknown",
            assigned_to: b.coverRepId,
            assignment_type: "leave_sub",
            created_by: user.id,
          });
        });
      });
      const { error } = await sb
        .from("daily_retailer_assignments")
        .upsert(rows, { onConflict: "plan_date,retailer_id" });
      if (error) throw error;

      // Mark coverage alert as read
      const matchAlert = alerts.find((a) => leaveByRep[absent]?.id === a.related_id);
      if (matchAlert) await markRead(matchAlert.id);

      toast.success(`Covered ${rows.length} retailer(s) across ${batches.length} batch(es)`);
      setBatchesByAbsent((prev) => ({ ...prev, [absent]: [] }));
      qc.invalidateQueries({ queryKey: ["bc-dra"] });
      qc.invalidateQueries({ queryKey: ["rep-workload-today"] });
      qc.invalidateQueries({ queryKey: ["calendarData"] });
      refetchCover();
    } catch (e: any) {
      toast.error(e.message || "Failed to assign coverage");
    } finally {
      setSubmittingFor(null);
    }
  }

  async function skipUncovered(absent: string) {
    const matchAlert = alerts.find((a) => leaveByRep[absent]?.id === a.related_id);
    if (matchAlert) await markRead(matchAlert.id);
    toast.info("Marked as leave day — no coverage assigned");
  }

  async function doRevoke() {
    if (!revokeId) return;
    const { error } = await sb.from("daily_retailer_assignments").delete().eq("id", revokeId);
    if (error) return toast.error(error.message);
    toast.success("Coverage removed — retailer returned to original owner");
    setRevokeId(null);
    qc.invalidateQueries({ queryKey: ["bc-dra"] });
    qc.invalidateQueries({ queryKey: ["rep-workload-today"] });
    qc.invalidateQueries({ queryKey: ["calendarData"] });
    refetchCover();
  }

  async function doBulkCancel() {
    if (!bulkCancelFor) return;
    const ownedIds = (retailerByRep[bulkCancelFor] || []).map((r) => r.id);
    const ids = (existingCover as any[])
      .filter((c) => ownedIds.includes(c.retailer_id))
      .map((c) => c.id);
    if (ids.length === 0) {
      setBulkCancelFor(null);
      return toast.message("No coverage rows linked to this rep.");
    }
    const { error } = await sb.from("daily_retailer_assignments").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Cancelled ${ids.length} coverage row(s)`);
    setBulkCancelFor(null);
    qc.invalidateQueries({ queryKey: ["bc-dra"] });
    qc.invalidateQueries({ queryKey: ["rep-workload-today"] });
    qc.invalidateQueries({ queryKey: ["calendarData"] });
    refetchCover();
  }

  function projectedWorkload(repId: string, addCount: number) {
    const w = workload[repId] || { ownCount: 0, coverCount: 0 };
    const before = w.ownCount + w.coverCount;
    const after = before + addCount;
    return { before, after, heavy: after > HEAVY_LOAD_THRESHOLD };
  }

  // Group existingCover by absent rep (= owner of retailer)
  const ownerByRetailer = useMemo(() => {
    const m: Record<string, string> = {};
    Object.entries(retailerByRep).forEach(([uid, rs]) => rs.forEach((r) => (m[r.id] = uid)));
    return m;
  }, [retailerByRep]);
  const retailerNameById = useMemo(() => {
    const m: Record<string, string> = {};
    Object.values(retailerByRep).forEach((rs) => rs.forEach((r) => (m[r.id] = r.name)));
    return m;
  }, [retailerByRep]);

  const groupedCover = useMemo(() => {
    const g: Record<string, any[]> = {};
    (existingCover as any[]).forEach((c) => {
      const owner = ownerByRetailer[c.retailer_id] || "unknown";
      (g[owner] ||= []).push(c);
    });
    return g;
  }, [existingCover, ownerByRetailer]);

  // ── Render ─────────────────────────────────────────────────────────
  const handleAISuggestCoverage = async (aid: string) => {
    setAiSuggesting(aid);
    try {
      const absentRep = repMap[aid] || aid;
      const repBeats = (retailerByRep[aid] || []).reduce((acc: any[], r: any) => {
        if (!acc.find((b: any) => b.beat_id === r.beat_id)) {
          acc.push({ beat_id: r.beat_id, beat_name: r.beat_name || r.beat_id, retailer_count: 0 });
        }
        return acc;
      }, []);

      // Build candidates from subordinates excluding the absent rep
      const candidates = reps
        .filter((r: RepRow) => r.id !== aid)
        .map((r: RepRow) => ({
          user_id: r.id,
          full_name: r.full_name,
          current_workload: 0,
          proximity_km: null,
          covered_recent_count: 0,
        }));

      const { data, error } = await supabase.functions.invoke("ai-coverage-suggestion", {
        body: {
          leaveRepName: absentRep,
          beatsToCover: repBeats,
          dateRange: { start: planDate, end: planDate },
          candidates,
        },
      });

      if (error) throw error;
      const suggestions = data?.suggestions || [];
      setAiSuggestions((prev) => ({ ...prev, [aid]: suggestions }));
      if (suggestions.length > 0) {
        toast.success(`AI found ${suggestions.length} coverage suggestion(s)`);
      } else {
        toast.info("No strong suggestions found — please assign manually");
      }
    } catch (e: any) {
      toast.error("AI suggestion failed: " + (e?.message || "unknown error"));
    } finally {
      setAiSuggesting(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Alert banner */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <Card key={a.id} className="border-amber-500/60 bg-amber-50/50 dark:bg-amber-950/20">
              <CardContent className="p-3 flex items-start gap-3">
                <Bell className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.message}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => {
                      // Resolve rep + date from the related leave application
                      sb.from("leave_applications").select("user_id, start_date").eq("id", a.related_id).single()
                        .then(({ data }: any) => {
                          if (data) {
                            setMode("custom");
                            setPlanDate(data.start_date);
                            setHighlightRep(data.user_id);
                          }
                        });
                    }}
                  >
                    Cover now
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => markRead(a.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Date selector */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setPlanDate((d) => addDays(d, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={planDate}
              onChange={(e) => { setPlanDate(e.target.value); setMode("custom"); }}
              className="w-44"
            />
            <Button variant="outline" size="icon" onClick={() => setPlanDate((d) => addDays(d, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant={mode === "today" ? "default" : "outline"}
                onClick={() => { setMode("today"); setPlanDate(todayStr()); }}>
                Today
              </Button>
              <Button size="sm" variant={mode === "week" ? "default" : "outline"}
                onClick={() => {
                  setMode("week");
                  const [mon] = thisWeekRange(planDate);
                  setPlanDate(mon);
                }}>
                This week
              </Button>
              <Button size="sm" variant={mode === "custom" ? "default" : "outline"}
                onClick={() => setMode("custom")}>
                Custom
              </Button>
            </div>
          </div>
          {mode === "week" && (
            <CardDescription className="mt-2">
              Showing leave starting from {thisWeekRange(planDate)[0]} → {thisWeekRange(planDate)[1]}.
              Use ◀/▶ to step through individual days.
            </CardDescription>
          )}
        </CardHeader>
      </Card>

      {absentees.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No reps absent or on leave for {planDate}.
            {teamScope.length > 0 && ` (Showing your team of ${teamScope.length} rep(s).)`}
          </CardContent>
        </Card>
      )}

      {absentees.map((aid) => {
        const lv = leaveByRep[aid];
        const all = retailerByRep[aid] || [];
        const visited = visitedByRep[aid] || new Set();
        const eligible = getEligible(aid);
        const visible = visualList(aid);
        const unassignedVis = unassignedVisible(aid);
        const unassignedAll = unassignedFor(aid);
        const staged = stagedByAbsent[aid] || new Set();
        const batches = batchesByAbsent[aid] || [];
        const cover = coverPickByAbsent[aid] || "";
        const cascadeIds = cascadingMap[aid];
        const isCascading = !!cascadeIds && cascadeIds.size > 0;
        const isHighlighted = highlightRep === aid;
        const halfDayInfo = halfDayFilter[aid];
        const isUnplanned = (lv as any)?.unplanned === true;
        const halfDayLabel =
          lv?.is_half_day
            ? lv.half_day_period === "first_half"
              ? "Half-day AM"
              : lv.half_day_period === "second_half"
                ? "Half-day PM"
                : "Half-day"
            : isUnplanned ? "Absent — no check-in" : "Full day leave";

        return (
          <Card
            key={aid}
            ref={(el) => { cardRefs.current[aid] = el; }}
            className={cn(
              "border-muted transition-shadow",
              isHighlighted && "ring-2 ring-primary",
              isUnplanned && "border-red-500/60",
            )}
          >
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                    {repMap[aid] || aid}
                    <Badge
                      variant={isUnplanned ? "destructive" : "secondary"}
                    >
                      {halfDayLabel}
                    </Badge>
                    {isCascading && (
                      <Badge
                        variant="outline"
                        className="border-amber-500 text-amber-600 cursor-pointer"
                        onClick={() => preselectCascade(aid)}
                      >
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Also covering {cascadeIds.size} — click to reassign
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {all.length} retailer(s) · {eligible.length} need coverage · {batches.reduce((s, b) => s + b.retailerIds.length, 0)} assigned · {unassignedAll.length} unassigned
                    {visited.size > 0 && ` · ${visited.size} visited before leave (hidden)`}
                    {lv?.is_half_day && halfDayInfo && !halfDayInfo.hasHistory &&
                      ` · No route history found — please select manually`}
                  </CardDescription>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-purple-600 border-purple-300 hover:bg-purple-50"
                    onClick={() => handleAISuggestCoverage(aid)}
                    disabled={aiSuggesting === aid}
                  >
                    {aiSuggesting === aid
                      ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                    AI Suggest
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => skipUncovered(aid)}>
                    Skip — leave day
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setBulkCancelFor(aid)} className="text-destructive">
                    Cancel all coverage
                  </Button>
                </div>
              </div>

              {/* Tally bar */}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {batches.map((b, i) => (
                  <Badge key={i} variant="secondary">
                    {b.retailerIds.length} → {repMap[b.coverRepId] || b.coverRepId}
                  </Badge>
                ))}
                <Badge
                  variant={unassignedAll.length === 0 ? "default" : "destructive"}
                  className={unassignedAll.length === 0 ? "bg-emerald-600 hover:bg-emerald-600" : ""}
                >
                  {unassignedAll.length} unassigned
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => selectAllSmart(aid)}>
                  Select all (A → all)
                </Button>
                <Button
                  size="sm"
                  variant={filterByAbsent[aid] === "priority_a" ? "default" : "outline"}
                  onClick={() => setFilterByAbsent((p) => ({ ...p, [aid]: p[aid] === "priority_a" ? "all" : "priority_a" }))}
                >
                  Priority A only
                </Button>
                <Button
                  size="sm"
                  variant={filterByAbsent[aid] === "high_pending" ? "default" : "outline"}
                  onClick={() => setFilterByAbsent((p) => ({ ...p, [aid]: p[aid] === "high_pending" ? "all" : "high_pending" }))}
                >
                  High pending (&gt;₹{HIGH_PENDING})
                </Button>
                <div className="relative ml-auto">
                  <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search retailer"
                    value={searchByAbsent[aid] || ""}
                    onChange={(e) => setSearchByAbsent((p) => ({ ...p, [aid]: e.target.value }))}
                    className="pl-7 h-8 w-48"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Retailer list */}
                <div className="md:col-span-2 border rounded-md">
                  <div className="flex items-center justify-between p-2 border-b">
                    <span className="text-sm font-medium">
                      Unassigned · {unassignedVis.length}{visible.length !== unassignedVis.length && ` of ${visible.length} shown`}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => clearStaged(aid)}>Clear selection</Button>
                  </div>
                  <ScrollArea className="h-72">
                    <div className="divide-y">
                      {unassignedVis.length === 0 && (
                        <div className="p-3 text-xs text-muted-foreground">
                          {visible.length === 0 ? "No retailers match the current filters." : "Everything visible is assigned."}
                        </div>
                      )}
                      {unassignedVis.map((r) => {
                        const dAgo = daysAgo(r.last_visit_date);
                        return (
                          <label key={r.id} className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/40">
                            <Checkbox checked={staged.has(r.id)} onCheckedChange={() => toggleStaged(aid, r.id)} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm truncate">{r.name}</div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {r.beat_name || r.beat_id}
                                {r.pending_amount ? ` · ₹${Number(r.pending_amount).toLocaleString()} pending` : ""}
                                {dAgo !== null ? ` · last visit ${dAgo}d ago` : ""}
                              </div>
                            </div>
                            {r.priority && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs",
                                  priorityRank(r.priority) === 0 && "border-red-500 text-red-600",
                                  priorityRank(r.priority) === 1 && "border-amber-500 text-amber-600",
                                )}
                              >
                                {r.priority}
                              </Badge>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {/* Batch composer */}
                <div className="space-y-2">
                  <Label>Cover rep</Label>
                  <Select value={cover} onValueChange={(v) => setCoverPickByAbsent((p) => ({ ...p, [aid]: v }))}>
                    <SelectTrigger><SelectValue placeholder="Pick cover rep" /></SelectTrigger>
                    <SelectContent>
                      {teamReps
                        .filter((r) => r.id !== aid)
                        .map((r) => {
                          const proj = projectedWorkload(r.id, staged.size);
                          const onLeave = leaves.some((l) => l.user_id === r.id);
                          return (
                            <SelectItem key={r.id} value={r.id}>
                              <span className={proj.heavy ? "text-amber-600" : ""}>
                                {r.full_name} — {proj.before} today
                                {staged.size > 0 ? ` (+${staged.size} → ${proj.after})` : ""}
                                {onLeave ? " ⚠ on leave" : ""}
                              </span>
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                  <Button
                    className="w-full"
                    size="sm"
                    onClick={() => addBatch(aid)}
                    disabled={!cover || staged.size === 0}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add batch ({staged.size})
                  </Button>

                  <div className="space-y-1 pt-2">
                    {batches.map((b, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs border rounded-md px-2 py-1">
                        <span className="flex-1 truncate">
                          {b.retailerIds.length} → {repMap[b.coverRepId] || b.coverRepId}
                        </span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeBatch(aid, i)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {unassignedAll.length > 0 && batches.length > 0 && (
                    <p className="text-xs text-amber-600">
                      {unassignedAll.length} retailer(s) not yet assigned — confirm anyway if intentional (e.g. closed shops).
                    </p>
                  )}

                  <Button
                    className={cn(
                      "w-full",
                      unassignedAll.length === 0 && batches.length > 0 && "bg-emerald-600 hover:bg-emerald-700",
                    )}
                    onClick={() => confirmFor(aid)}
                    disabled={submittingFor === aid || batches.length === 0}
                  >
                    {submittingFor === aid && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {batches.length === 0
                      ? "Add retailers to batches first"
                      : unassignedAll.length === 0
                        ? "Confirm coverage ✓"
                        : `Confirm coverage (${unassignedAll.length} unassigned)`}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Coverage created list */}
      <Card>
        <CardHeader>
          <CardTitle>Coverage created on {planDate}</CardTitle>
          <CardDescription>{(existingCover as any[]).length} assignment(s)</CardDescription>
        </CardHeader>
            <CardContent>
          {(existingCover as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground">No coverage assignments yet.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedCover).map(([owner, rows]) => (
                <div key={owner}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium">
                      {repMap[owner] || "Unknown rep"} · {planDate}
                    </h4>
                    <Button size="sm" variant="ghost" className="text-destructive"
                      onClick={() => setBulkCancelFor(owner)}>
                      Cancel all coverage
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {rows.map((c: any) => (
                      <div key={c.id} className="border rounded-md px-3 py-2 text-sm flex justify-between items-center gap-2">
                        <span className="truncate flex-1">
                          {retailerNameById[c.retailer_id] || c.retailer_id.slice(0, 8) + "…"}
                        </span>
                        <span className="text-muted-foreground text-xs shrink-0">
                          → {repMap[c.assigned_to] || "—"}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">Leave Sub</Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive shrink-0"
                          onClick={() => setRevokeId(c.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DeleteConfirmDialog
        open={!!revokeId}
        onOpenChange={(o) => !o && setRevokeId(null)}
        onConfirm={doRevoke}
        title="Revoke coverage?"
        description="The retailer will return to its original owner."
        confirmText="Revoke"
      />
      <DeleteConfirmDialog
        open={!!bulkCancelFor}
        onOpenChange={(o) => !o && setBulkCancelFor(null)}
        onConfirm={doBulkCancel}
        title="Cancel all coverage?"
        description="All leave-sub assignments for this rep on this date will be removed."
        confirmText="Cancel all"
      />
    </div>
  );
}

export default LeaveCoverageTab;
