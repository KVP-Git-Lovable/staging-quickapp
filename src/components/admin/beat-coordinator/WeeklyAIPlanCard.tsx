import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, CalendarDays, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, startOfWeek } from "date-fns";
import { useAuth } from "@/hooks/useAuth";

const sb = supabase as any;

interface Props {
  repId: string | null;
  repName?: string | null;
}

interface DayPlan {
  date: string;
  day: string;
  beats: { beat_id: string; beat_name: string }[];
  reason: string;
}

export function WeeklyAIPlanCard({ repId, repName }: Props) {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState<string>(
    format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<DayPlan[] | null>(null);
  const [summary, setSummary] = useState("");

  const { data: beats = [] } = useQuery({
    queryKey: ["weekly-ai-beats", repId],
    enabled: !!repId,
    queryFn: async () => {
      const { data: ownedBeats = [] } = await supabase
        .from("beats")
        .select("beat_id, beat_name")
        .eq("owner_id", repId!)
        .eq("is_active", true);
      if (!ownedBeats.length) return [];
      const beatIds = ownedBeats.map((b: any) => b.beat_id);
      const { data: retailers = [] } = await supabase
        .from("retailers")
        .select("id, beat_id, latitude, longitude, pending_amount, last_visit_date")
        .in("beat_id", beatIds);
      const byBeat = new Map<string, any[]>();
      (retailers || []).forEach((r: any) => {
        const arr = byBeat.get(r.beat_id) || [];
        arr.push(r);
        byBeat.set(r.beat_id, arr);
      });
      return ownedBeats.map((b: any) => {
        const rs = byBeat.get(b.beat_id) || [];
        const valid = rs.filter((r: any) => r.latitude && r.longitude);
        const cLat = valid.length ? valid.reduce((s, r) => s + Number(r.latitude), 0) / valid.length : null;
        const cLng = valid.length ? valid.reduce((s, r) => s + Number(r.longitude), 0) / valid.length : null;
        const pending = rs.reduce((s, r) => s + Number(r.pending_amount || 0), 0);
        const lastDates = rs.map((r) => r.last_visit_date).filter(Boolean) as string[];
        const maxLast = lastDates.sort().pop();
        const daysAgo = maxLast ? Math.floor((Date.now() - new Date(maxLast).getTime()) / 86400000) : null;
        return {
          beat_id: b.beat_id,
          beat_name: b.beat_name,
          retailer_count: rs.length,
          centroid_lat: cLat,
          centroid_lng: cLng,
          pending_dues: pending,
          last_served_days_ago: daysAgo,
        };
      });
    },
  });

  const generate = async () => {
    if (!repId || !beats.length) {
      toast.error("Pick a rep with owned beats first");
      return;
    }
    setLoading(true);
    setPlan(null);
    setSummary("");
    try {
      const { data, error } = await supabase.functions.invoke("ai-weekly-route-plan", {
        body: { repName: repName || "Rep", weekStart, beats },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setPlan((data as any)?.days || []);
      setSummary((data as any)?.summary || "");
    } catch (e: any) {
      toast.error(e.message || "AI failed");
    } finally {
      setLoading(false);
    }
  };

  const applyPlan = async () => {
    if (!plan || !repId) return;
    setSaving(true);
    try {
      const rows: any[] = [];
      plan.forEach((d) =>
        (d.beats || []).forEach((b) =>
          rows.push({
            plan_date: d.date,
            beat_id: b.beat_id,
            assigned_user_id: repId,
            assigned_by: user?.id,
            assignment_type: "permanent",
            status: "active",
          }),
        ),
      );
      if (!rows.length) return;
      const { error } = await sb
        .from("daily_beat_plans")
        .upsert(rows, { onConflict: "plan_date,beat_id,assigned_user_id" });
      if (error) throw error;
      toast.success(`Applied ${rows.length} beat assignments to calendar`);
    } catch (e: any) {
      toast.error(e.message || "Failed to apply");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> AI Weekly Plan
        </CardTitle>
        <CardDescription className="text-xs">
          Suggest a Mon–Sat beat plan using retailer geography, last-served, and pending dues.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <Label className="text-xs">Week start (Mon)</Label>
            <Input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              className="w-40"
            />
          </div>
          <Button size="sm" onClick={generate} disabled={loading || !repId || beats.length === 0}>
            {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CalendarDays className="h-3.5 w-3.5 mr-1" />}
            Generate week
          </Button>
          {plan && plan.length > 0 && (
            <Button size="sm" variant="outline" onClick={applyPlan} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Apply to calendar
            </Button>
          )}
        </div>

        {summary && (
          <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2">{summary}</p>
        )}

        {plan && plan.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {plan.map((d) => (
              <div key={d.date} className="border rounded-md p-2">
                <div className="text-[10px] uppercase text-muted-foreground">{d.day}</div>
                <div className="text-xs font-semibold mb-1">{d.date.slice(5)}</div>
                <div className="space-y-1">
                  {d.beats.map((b) => (
                    <Badge key={b.beat_id} variant="outline" className="text-[10px] block truncate w-full text-left">
                      {b.beat_name}
                    </Badge>
                  ))}
                </div>
                {d.reason && <div className="text-[10px] text-muted-foreground mt-1">{d.reason}</div>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
