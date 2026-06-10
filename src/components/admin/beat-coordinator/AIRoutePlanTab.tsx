import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubordinates } from "@/hooks/useSubordinates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Loader2, Sparkles, MapPin, AlertTriangle, ChevronDown, Send, Copy, Save, CircleDot,
} from "lucide-react";
import { toast } from "sonner";
import {
  optimizeRouteByDistance, calculateDistance, formatDistance,
} from "@/utils/gpsRouteOptimizer";
import { WeeklyAIPlanCard } from "./WeeklyAIPlanCard";

const sb = supabase as any;
const today = () => new Date().toISOString().slice(0, 10);
const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

type SortMode = "smart" | "geo" | "priority" | "pending";
type DataSource = "daily_assignment" | "beat_plan" | "permanent_owner" | "none";

interface Props {
  initialRepId?: string;
  initialDate?: string;
}

export function AIRoutePlanTab({ initialRepId, initialDate }: Props) {
  const { user } = useAuth();
  const { subordinates, isLoading: loadingSubs } = useSubordinates();

  const [rep, setRep] = useState<string>(initialRepId || "");
  const [planDate, setPlanDate] = useState<string>(initialDate || today());
  const [sortMode, setSortMode] = useState<SortMode>("smart");
  const [generating, setGenerating] = useState(false);

  // Generated route state
  const [routeStops, setRouteStops] = useState<any[]>([]);
  const [totalKm, setTotalKm] = useState(0);
  const [estHours, setEstHours] = useState(0);
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [aiError, setAiError] = useState("");
  const [startPos, setStartPos] = useState<{ lat: number; lng: number; label: string; source: string } | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  // Load subordinate profile details (designation)
  const { data: repProfiles = [] } = useQuery({
    queryKey: ["airoute-rep-profiles", subordinates.map((s) => s.subordinate_user_id).join(",")],
    enabled: subordinates.length > 0,
    queryFn: async () => {
      const ids = subordinates.map((s) => s.subordinate_user_id);
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, designation, user_status")
        .in("id", ids);
      return (data || []).filter((p: any) => (p.user_status ?? "active") === "active");
    },
  });

  const repIds = useMemo(() => repProfiles.map((p: any) => p.id), [repProfiles]);

  // Per-rep enrichment for date: leave + today retailer count + last gps
  const { data: repMeta = {} } = useQuery<Record<string, any>>({
    queryKey: ["airoute-rep-meta", planDate, repIds.join(",")],
    enabled: repIds.length > 0,
    queryFn: async () => {
      const [leavesRes, draRes, gpsRes] = await Promise.all([
        sb.from("leave_applications")
          .select("user_id, status, start_date, end_date")
          .in("user_id", repIds)
          .lte("start_date", planDate)
          .gte("end_date", planDate)
          .in("status", ["approved"]),
        sb.from("daily_retailer_assignments")
          .select("assigned_to, retailer_id")
          .in("assigned_to", repIds)
          .eq("plan_date", planDate),
        sb.from("gps_tracking")
          .select("user_id, timestamp")
          .in("user_id", repIds)
          .eq("date", planDate)
          .order("timestamp", { ascending: false }),
      ]);
      const leaves = new Set<string>((leavesRes.data || []).map((r: any) => r.user_id));
      const counts: Record<string, number> = {};
      (draRes.data || []).forEach((r: any) => {
        counts[r.assigned_to] = (counts[r.assigned_to] || 0) + 1;
      });
      const lastGps: Record<string, string> = {};
      (gpsRes.data || []).forEach((r: any) => {
        if (!lastGps[r.user_id]) lastGps[r.user_id] = r.timestamp;
      });
      const out: Record<string, any> = {};
      repIds.forEach((id: string) => {
        out[id] = {
          isOnLeave: leaves.has(id),
          todayCount: counts[id] || 0,
          lastGps: lastGps[id] || null,
          isLive: lastGps[id] && Date.now() - new Date(lastGps[id]).getTime() < 30 * 60_000,
        };
      });
      return out;
    },
  });

  const selectedRep = useMemo(
    () => repProfiles.find((r: any) => r.id === rep),
    [rep, repProfiles],
  );

  // Load retailers for selected rep+date (preview before generation)
  const { data: loaded, isLoading: loadingRetailers } = useQuery({
    queryKey: ["airoute-retailers", rep, planDate],
    enabled: !!rep,
    queryFn: async () => {
      let source: DataSource = "daily_assignment";
      let retailerIds: string[] = [];

      const { data: dra } = await sb
        .from("daily_retailer_assignments")
        .select("retailer_id")
        .eq("assigned_to", rep)
        .eq("plan_date", planDate);
      retailerIds = (dra || []).map((d: any) => d.retailer_id);

      if (!retailerIds.length) {
        source = "beat_plan";
        const { data: bp } = await sb
          .from("beat_plans")
          .select("beat_id")
          .eq("user_id", rep)
          .eq("plan_date", planDate);
        const beatIds = (bp || []).map((b: any) => b.beat_id);
        if (beatIds.length) {
          const { data: br } = await supabase
            .from("retailers").select("id")
            .in("beat_id", beatIds).eq("status", "active");
          retailerIds = (br || []).map((r: any) => r.id);
        }
      }

      if (!retailerIds.length) {
        source = "permanent_owner";
        const { data: own } = await supabase
          .from("retailers").select("id")
          .eq("user_id", rep).eq("status", "active");
        retailerIds = (own || []).map((r: any) => r.id);
      }

      if (!retailerIds.length) {
        return { retailers: [], source: "none" as DataSource };
      }

      // Batch fetch (Supabase 1000 row limit safety)
      const all: any[] = [];
      for (let i = 0; i < retailerIds.length; i += 500) {
        const chunk = retailerIds.slice(i, i + 500);
        const { data } = await supabase
          .from("retailers")
          .select(
            "id, name, beat_id, address, latitude, longitude, priority, status, pending_amount, last_visit_date, last_order_date, avg_order_per_visit_3m, productive_visits_3m, total_visits_3m, retail_type, category",
          )
          .in("id", chunk);
        if (data) all.push(...data);
      }
      return { retailers: all, source };
    },
  });

  const retailers = loaded?.retailers || [];
  const dataSource: DataSource = (loaded?.source as DataSource) || "none";
  const noCoords = retailers.filter((r: any) => !r.latitude || !r.longitude);
  const validRetailers = retailers.filter((r: any) => r.latitude && r.longitude);

  // Live GPS poll for today
  const { data: liveGps } = useQuery({
    queryKey: ["airoute-live-gps", rep, planDate],
    enabled: !!rep,
    refetchInterval: planDate === today() ? 60_000 : false,
    queryFn: async () => {
      const { data } = await sb.from("gps_tracking")
        .select("latitude, longitude, timestamp")
        .eq("user_id", rep).eq("date", planDate)
        .order("timestamp", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  // Reset route when inputs change
  useEffect(() => {
    setRouteStops([]); setTotalKm(0); setEstHours(0);
    setAiSuggestion(""); setAiError(""); setStartPos(null);
  }, [rep, planDate, sortMode]);

  async function getStartingPosition() {
    if (liveGps?.latitude && liveGps?.longitude) {
      return {
        lat: Number(liveGps.latitude), lng: Number(liveGps.longitude),
        source: "live_gps", label: `Live position (${fmtTime(liveGps.timestamp)})`,
      };
    }
    // Fallback: latest GPS (not date-restricted)
    const { data: latest } = await sb.from("gps_tracking")
      .select("latitude, longitude, timestamp").eq("user_id", rep)
      .order("timestamp", { ascending: false }).limit(1).maybeSingle();
    if (latest) {
      return {
        lat: Number(latest.latitude), lng: Number(latest.longitude),
        source: "last_gps", label: `Last known GPS (${new Date(latest.timestamp).toLocaleDateString()})`,
      };
    }
    // Centroid of retailers
    const valid = validRetailers;
    if (valid.length) {
      const lat = valid.reduce((s: number, r: any) => s + Number(r.latitude), 0) / valid.length;
      const lng = valid.reduce((s: number, r: any) => s + Number(r.longitude), 0) / valid.length;
      return { lat, lng, source: "centroid", label: "Retailer cluster centroid" };
    }
    return { lat: 0, lng: 0, source: "none", label: "Unknown" };
  }

  async function fetchAvgVisitDurations(retailerIds: string[]): Promise<Record<string, number>> {
    if (!retailerIds.length) return {};
    const { data } = await sb.from("retailer_visit_logs")
      .select("retailer_id, time_spent_seconds")
      .in("retailer_id", retailerIds)
      .not("time_spent_seconds", "is", null)
      .order("created_at", { ascending: false })
      .limit(2000);
    const acc: Record<string, { sum: number; n: number }> = {};
    (data || []).forEach((r: any) => {
      if (!acc[r.retailer_id]) acc[r.retailer_id] = { sum: 0, n: 0 };
      if (acc[r.retailer_id].n < 10) {
        acc[r.retailer_id].sum += r.time_spent_seconds;
        acc[r.retailer_id].n += 1;
      }
    });
    const out: Record<string, number> = {};
    Object.entries(acc).forEach(([k, v]) => {
      out[k] = Math.round(v.sum / v.n / 60);
    });
    return out;
  }

  function applySort(geoOrdered: any[], mode: SortMode): any[] {
    if (mode === "geo" || mode === "smart") return geoOrdered;
    if (mode === "priority") {
      const groups: Record<string, any[]> = { A: [], B: [], C: [], _: [] };
      geoOrdered.forEach((s) => {
        const p = (s.priority || "").toUpperCase();
        if (p === "A" || p === "B" || p === "C") groups[p].push(s);
        else groups._.push(s);
      });
      return [...groups.A, ...groups.B, ...groups.C, ...groups._];
    }
    if (mode === "pending") {
      const withDues = geoOrdered
        .filter((s) => (s.pending_amount ?? 0) > 0)
        .sort((a, b) => (b.pending_amount ?? 0) - (a.pending_amount ?? 0));
      const noDues = geoOrdered.filter((s) => !(s.pending_amount > 0));
      return [...withDues, ...noDues];
    }
    return geoOrdered;
  }

  async function generate() {
    if (!rep) { toast.error("Pick a rep"); return; }
    if (!validRetailers.length) { toast.error("No retailers with GPS to plan"); return; }

    setGenerating(true); setAiSuggestion(""); setAiError("");
    try {
      const start = await getStartingPosition();
      setStartPos(start);

      const geoOrdered = optimizeRouteByDistance(
        validRetailers.map((r: any) => ({ ...r, retailer_name: r.name })),
        { latitude: start.lat, longitude: start.lng },
      );
      const ordered = applySort(geoOrdered, sortMode);

      // Fetch avg visit times
      const avgTimes = await fetchAvgVisitDurations(ordered.map((r: any) => r.id));

      // Enrich with distFromPrev, days since visit, avg time
      let prev = { latitude: start.lat, longitude: start.lng };
      let total = 0; let estMin = 0;
      const enriched = ordered.map((r: any, i: number) => {
        const d = calculateDistance(prev as any, { latitude: r.latitude, longitude: r.longitude });
        const valid = Number.isFinite(d);
        if (valid) total += d;
        prev = { latitude: r.latitude, longitude: r.longitude };
        const avgTimeMin = avgTimes[r.id] ?? 15;
        const driveMin = valid ? (d / 40) * 60 : 0;
        estMin += driveMin + avgTimeMin;
        const daysSinceLastVisit = r.last_visit_date
          ? Math.floor((Date.now() - new Date(r.last_visit_date).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        return {
          ...r, stopNumber: i + 1, distFromPrev: valid ? d : 0,
          avgTimeMin, daysSinceLastVisit,
        };
      });
      setRouteStops(enriched); setTotalKm(total); setEstHours(estMin / 60);

      if (sortMode === "geo" || sortMode === "priority" || sortMode === "pending") {
        setGenerating(false); return;
      }

      // Smart mode: call AI
      let alreadyTravelledKm: number | null = null;
      if (planDate === today()) {
        const { data: gpsDay } = await sb.from("daily_gps_distance")
          .select("total_km").eq("user_id", rep).eq("date", planDate).maybeSingle();
        alreadyTravelledKm = gpsDay?.total_km ?? null;
      }

      const { data, error } = await supabase.functions.invoke("ai-route-suggestion", {
        body: {
          repName: selectedRep?.full_name || "Rep",
          designation: selectedRep?.designation || "",
          startLabel: start.label,
          startLat: start.lat, startLng: start.lng,
          sortMode,
          stops: enriched.map((s) => ({
            name: s.name, priority: s.priority, pending_amount: s.pending_amount,
            last_visit_date: s.last_visit_date, daysSinceLastVisit: s.daysSinceLastVisit,
            avg_order_per_visit_3m: s.avg_order_per_visit_3m,
            productive_visits_3m: s.productive_visits_3m,
            total_visits_3m: s.total_visits_3m,
            avgTimeMin: s.avgTimeMin, distFromPrev: s.distFromPrev,
          })),
          totalDistanceKm: total, totalStops: enriched.length,
          priorityACount: enriched.filter((s) => (s.priority || "").toUpperCase() === "A").length,
          totalPendingDues: enriched.reduce((acc, s) => acc + (s.pending_amount || 0), 0),
          alreadyTravelledKm,
        },
      });
      if (error) throw error;
      setAiSuggestion((data as any)?.suggestion || "");
    } catch (e: any) {
      console.error(e);
      setAiError(e.message || "Could not reach AI — showing geo-optimised route only.");
    } finally {
      setGenerating(false);
    }
  }

  async function pushToRep() {
    if (!routeStops.length) return;
    setPushBusy(true);
    try {
      const rows = routeStops.map((s, i) => ({
        plan_date: planDate, retailer_id: s.id, beat_id: s.beat_id,
        assigned_to: rep, assignment_type: "permanent",
        stop_order: i + 1, created_by: user?.id,
      }));
      const { error } = await sb.from("daily_retailer_assignments")
        .upsert(rows, { onConflict: "plan_date,retailer_id" });
      if (error) throw error;

      await sb.from("notifications").insert({
        user_id: rep,
        title: "Route plan ready",
        message: `Your coordinator has optimised your route — ${routeStops.length} stops, ${totalKm.toFixed(1)} km.`,
        type: "route_plan_ready",
        target_portal: "field_sales_app",
        is_read: false,
      });
      toast.success("Route pushed to rep's mobile app");
    } catch (e: any) {
      toast.error(e.message || "Failed to push route");
    } finally {
      setPushBusy(false);
    }
  }

  function exportText() {
    const lines = [
      `Route plan for ${selectedRep?.full_name} — ${planDate}`,
      `${routeStops.length} stops · ${totalKm.toFixed(1)} km · ~${estHours.toFixed(1)} hrs`,
      "",
      ...routeStops.map((s, i) =>
        `${i + 1}. ${s.name}${s.priority ? ` (P${s.priority})` : ""}` +
        `${s.pending_amount ? ` — ₹${s.pending_amount} pending` : ""}`,
      ),
      "",
      aiSuggestion ? `AI note: ${aiSuggestion}` : "",
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(lines);
    toast.success("Route copied to clipboard");
  }

  async function saveRoute() {
    if (!routeStops.length) return;
    setSaveBusy(true);
    try {
      const primaryBeat = routeStops.find((s) => s.beat_id)?.beat_id;
      if (!primaryBeat) { toast.error("No beat to save against"); return; }
      const { error } = await sb.from("daily_beat_plans").upsert({
        plan_date: planDate, beat_id: primaryBeat,
        assigned_user_id: rep, assigned_by: user?.id,
        assignment_type: "temp_cover",
        notes: JSON.stringify({
          ai_suggestion: aiSuggestion, total_km: totalKm,
          stop_count: routeStops.length,
          generated_at: new Date().toISOString(), sort_mode: sortMode,
        }),
        status: "active",
      }, { onConflict: "plan_date,beat_id,assigned_user_id" });
      if (error) throw error;
      toast.success("Route plan saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaveBusy(false);
    }
  }

  const priorityACount = routeStops.filter((s) => (s.priority || "").toUpperCase() === "A").length;
  const totalPending = routeStops.reduce((acc, s) => acc + (s.pending_amount || 0), 0);

  const sourceLabel: Record<DataSource, string> = {
    daily_assignment: "Today's assigned retailers (coordinator-planned)",
    beat_plan: "Rep's self-planned beat for this date",
    permanent_owner: "Rep's permanent retailers (no daily plan found)",
    none: "No retailers found for this rep on this date",
  };

  const urgencyClass = (s: any) => {
    if ((s.pending_amount ?? 0) > 1000) return "border-l-4 border-l-destructive";
    if ((s.priority || "").toUpperCase() === "A") return "border-l-4 border-l-emerald-500";
    if ((s.daysSinceLastVisit ?? 0) > 14) return "border-l-4 border-l-amber-500";
    return "border-l-4 border-l-border";
  };
  const lastVisitClass = (d: number | null) => {
    if (d == null || d > 14) return "text-destructive";
    if (d > 7) return "text-amber-600";
    return "text-muted-foreground";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-3">
      {/* LEFT PANEL */}
      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Rep</CardTitle></CardHeader>
          <CardContent className="p-2">
            {loadingSubs ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : repProfiles.length === 0 ? (
              <p className="text-sm text-muted-foreground p-3">No reps under your hierarchy.</p>
            ) : (
              <div className="space-y-1 max-h-[340px] overflow-y-auto">
                {repProfiles.map((r: any) => {
                  const m = repMeta[r.id] || {};
                  const selected = rep === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setRep(r.id)}
                      className={`w-full text-left px-2 py-2 rounded-md border transition ${
                        selected ? "bg-primary/10 border-primary" : "border-transparent hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {(r.full_name || "?").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium truncate">{r.full_name}</span>
                            {m.isLive && <CircleDot className="h-3 w-3 text-emerald-500 shrink-0" />}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {r.designation || "—"} · {m.todayCount || 0} retailers
                          </div>
                          {m.isOnLeave && (
                            <div className="text-[10px] mt-0.5 text-amber-600 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> On leave — {planDate}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Plan options</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Plan date</Label>
              <Input
                type="date" value={planDate}
                max={new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)}
                onChange={(e) => setPlanDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Sort priority</Label>
              <RadioGroup value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)} className="mt-2 space-y-1.5">
                {[
                  { v: "smart", l: "Smart (AI decides)" },
                  { v: "geo", l: "Geo only (distance)" },
                  { v: "priority", l: "Priority A first" },
                  { v: "pending", l: "Pending dues first" },
                ].map((o) => (
                  <div key={o.v} className="flex items-center gap-2">
                    <RadioGroupItem value={o.v} id={`sort-${o.v}`} />
                    <Label htmlFor={`sort-${o.v}`} className="text-sm font-normal cursor-pointer">{o.l}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <Button onClick={generate} disabled={generating || !rep} className="w-full">
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Generate route
            </Button>
          </CardContent>
        </Card>

        {routeStops.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Summary</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>{routeStops.length} retailers · {formatDistance(totalKm)} est.</div>
              <div>~{estHours.toFixed(1)} hrs · {priorityACount} Priority A</div>
              <div>₹{totalPending.toLocaleString("en-IN")} pending dues</div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* RIGHT PANEL */}
      <div className="space-y-3">
        {!rep && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Select a rep on the left to load their retailers.</p>
            </CardContent>
          </Card>
        )}

        {rep && (
          <>
            {/* Source + start info bar */}
            <Card>
              <CardContent className="py-3 text-xs flex flex-wrap gap-x-4 gap-y-1 items-center">
                <Badge variant="outline">{sourceLabel[dataSource]}</Badge>
                {startPos && <span>Starting: <strong>{startPos.label}</strong></span>}
                {liveGps && (
                  <span className="flex items-center gap-1">
                    <CircleDot className="h-3 w-3 text-emerald-500" />
                    Live GPS at {fmtTime(liveGps.timestamp)}
                  </span>
                )}
                {loadingRetailers && <Loader2 className="h-3 w-3 animate-spin" />}
              </CardContent>
            </Card>

            {noCoords.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>{noCoords.length} retailer{noCoords.length > 1 ? "s" : ""} excluded — no GPS coordinates.</span>
              </div>
            )}

            {/* AI suggestion */}
            {(aiSuggestion || aiError || (generating && sortMode === "smart")) && (
              <Card>
                <Collapsible defaultOpen>
                  <CardHeader className="pb-2">
                    <CollapsibleTrigger className="flex items-center justify-between w-full">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" /> AI Route Suggestion
                      </CardTitle>
                      <ChevronDown className="h-4 w-4" />
                    </CollapsibleTrigger>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="text-sm whitespace-pre-wrap leading-relaxed">
                      {generating && !aiSuggestion ? (
                        <span className="text-muted-foreground italic">Analysing route... (geo-optimised route shown below)</span>
                      ) : aiError ? (
                        <span className="text-amber-600">{aiError}</span>
                      ) : (
                        <>
                          {aiSuggestion}
                          <p className="text-xs text-muted-foreground mt-3">Powered by Gemini via Lovable AI Gateway</p>
                        </>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            )}

            {/* Stops or pre-generation list */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">
                  {routeStops.length > 0 ? "Ordered stops" : `Retailers (${validRetailers.length})`}
                </CardTitle>
                {routeStops.length > 0 && (
                  <div className="flex gap-1.5 text-xs">
                    <Badge variant="outline">{formatDistance(totalKm)}</Badge>
                    <Badge variant="outline">~{estHours.toFixed(1)}h</Badge>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {routeStops.length === 0 && validRetailers.length > 0 && (
                  <div className="space-y-1.5 max-h-[460px] overflow-y-auto">
                    {validRetailers.slice(0, 200).map((r: any) => (
                      <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 border rounded-md text-sm">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate">{r.name}</span>
                        {r.priority && <Badge variant="secondary" className="text-[10px]">{r.priority}</Badge>}
                        {r.pending_amount > 0 && <span className="text-xs text-muted-foreground">₹{r.pending_amount}</span>}
                      </div>
                    ))}
                    {validRetailers.length > 200 && (
                      <p className="text-xs text-muted-foreground text-center pt-2">+{validRetailers.length - 200} more — generate route to see all ordered</p>
                    )}
                  </div>
                )}

                {routeStops.length > 0 && (
                  <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                    {routeStops.map((s, i) => (
                      <div key={s.id}>
                        <div className={`flex items-start gap-3 rounded-md bg-card border px-3 py-2 ${urgencyClass(s)}`}>
                          <div className="font-bold w-6 text-center text-sm pt-0.5">{i + 1}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">{s.name}</span>
                              {s.priority && <Badge variant="secondary" className="text-[10px]">P{s.priority}</Badge>}
                              {s.pending_amount > 1000 && <Badge variant="destructive" className="text-[10px]">High dues</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{s.address || "—"}</div>
                            <div className="text-xs mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                              <span className={lastVisitClass(s.daysSinceLastVisit)}>
                                Last visit: {s.daysSinceLastVisit != null ? `${s.daysSinceLastVisit}d ago` : "never"}
                              </span>
                              {s.pending_amount > 0 && <span>₹{s.pending_amount} pending</span>}
                              {s.avg_order_per_visit_3m > 0 && <span>Avg ₹{Math.round(s.avg_order_per_visit_3m)}/visit</span>}
                              {s.productive_visits_3m != null && (
                                <span>{s.productive_visits_3m}/{s.total_visits_3m || 0} productive (3m)</span>
                              )}
                              <span>~{s.avgTimeMin}min</span>
                            </div>
                          </div>
                        </div>
                        {i < routeStops.length - 1 && (
                          <div className="text-[11px] text-muted-foreground pl-9 py-0.5">
                            ↓ {formatDistance(routeStops[i + 1].distFromPrev || 0)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Action bar */}
            {routeStops.length > 0 && (
              <Card>
                <CardContent className="py-3 flex flex-wrap gap-2">
                  <Button onClick={pushToRep} disabled={pushBusy} size="sm">
                    {pushBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Push to rep
                  </Button>
                  <Button onClick={exportText} variant="outline" size="sm">
                    <Copy className="mr-2 h-4 w-4" /> Export
                  </Button>
                  <Button onClick={saveRoute} variant="outline" size="sm" disabled={saveBusy}>
                    {saveBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save route
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AIRoutePlanTab;
