import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSubordinates } from "@/hooks/useSubordinates";
import { useCoordinatorAlerts } from "@/hooks/useCoordinatorAlerts";

const sb = supabase as any;
const HEAVY = 70;

interface RepRow {
  id: string;
  full_name: string;
  status: "leave" | "shared" | "overload" | "ok" | "unplanned";
  load: number;
}

interface Props {
  selectedRepId: string | null;
  selectedDate: string;
  onSelect: (id: string) => void;
}

export function RepSidebar({ selectedRepId, selectedDate, onSelect }: Props) {
  const { subordinates, isLoading: lSubs } = useSubordinates();
  const repIds = subordinates.map((s) => s.subordinate_user_id);

  const { data: rows = [] } = useQuery<RepRow[]>({
    queryKey: ["rep-sidebar", selectedDate, repIds.sort().join(",")],
    enabled: repIds.length > 0,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const [profilesRes, leavesRes, draRes, retsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, user_status")
          .in("id", repIds)
          .order("full_name"),
        sb
          .from("leave_applications")
          .select("user_id, start_date, end_date, status")
          .in("user_id", repIds)
          .eq("status", "approved")
          .lte("start_date", selectedDate)
          .gte("end_date", selectedDate),
        sb
          .from("daily_retailer_assignments")
          .select("assigned_to, assignment_type")
          .eq("plan_date", selectedDate)
          .in("assigned_to", repIds),
        supabase.from("retailers").select("user_id").in("user_id", repIds),
      ]);

      const active = (profilesRes.data || []).filter(
        (p: any) => (p.user_status ?? "active") === "active",
      );
      const leaveSet = new Set<string>(
        (leavesRes.data || []).map((l: any) => l.user_id),
      );
      const sharedSet = new Set<string>();
      const dailyLoad = new Map<string, number>();
      const seenDaily = new Set<string>();
      (draRes.data || []).forEach((r: any) => {
        seenDaily.add(r.assigned_to);
        dailyLoad.set(r.assigned_to, (dailyLoad.get(r.assigned_to) || 0) + 1);
        if (r.assignment_type === "split") sharedSet.add(r.assigned_to);
      });
      const ownedMap = new Map<string, number>();
      (retsRes.data || []).forEach((r: any) => {
        if (r.user_id) ownedMap.set(r.user_id, (ownedMap.get(r.user_id) || 0) + 1);
      });
      return active.map((p: any) => {
        const load = seenDaily.has(p.id)
          ? dailyLoad.get(p.id) || 0
          : ownedMap.get(p.id) || 0;
        let status: RepRow["status"];
        if (leaveSet.has(p.id)) status = "leave";
        else if (sharedSet.has(p.id)) status = "shared";
        else if (load > HEAVY) status = "overload";
        else if (load === 0) status = "unplanned";
        else status = "ok";
        return { id: p.id, full_name: p.full_name, status, load };
      });
    },
  });

  const { data: alerts = [], markRead } = useCoordinatorAlerts();
  const initials = (n: string) =>
    n
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase();

  const onLeaveCount = rows.filter((r) => r.status === "leave").length;
  const overloadReps = rows.filter((r) => r.status === "overload");

  const badgeFor = (r: RepRow) => {
    switch (r.status) {
      case "leave":
        return <Badge variant="outline" className="border-beat-uncovered text-beat-uncovered text-[10px]">Leave</Badge>;
      case "shared":
        return <Badge variant="outline" className="border-beat-shared text-beat-shared text-[10px]">Shared</Badge>;
      case "overload":
        return <Badge variant="outline" className="border-beat-stale text-beat-stale text-[10px]">{r.load}</Badge>;
      case "unplanned":
        return <Badge variant="outline" className="text-[10px] text-muted-foreground">No plan</Badge>;
      default:
        return <Badge variant="outline" className="border-beat-served text-beat-served text-[10px]">{r.load}</Badge>;
    }
  };

  return (
    <div className="flex flex-col h-full gap-3 min-h-0">
      <Card className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">
          Your team
        </div>
        <ScrollArea className="flex-1">
          <ul className="divide-y">
            {lSubs && <li className="p-3 text-xs text-muted-foreground">Loading…</li>}
            {!lSubs && rows.length === 0 && (
              <li className="p-3 text-xs text-muted-foreground">No reps under you</li>
            )}
            {rows.map((r) => {
              const isSel = r.id === selectedRepId;
              return (
                <li key={r.id}>
                  <button
                    onClick={() => onSelect(r.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors",
                      isSel && "bg-primary/10",
                    )}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs bg-muted">{initials(r.full_name)}</AvatarFallback>
                    </Avatar>
                    <span className="flex-1 text-sm font-medium truncate">{r.full_name}</span>
                    {badgeFor(r)}
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </Card>

      <Card className="flex-shrink-0">
        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">
          Alerts
        </div>
        <ul className="divide-y text-sm max-h-48 overflow-y-auto">
          {onLeaveCount > 0 && (
            <li className="px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-beat-uncovered mt-0.5 flex-shrink-0" />
              <span><strong>{onLeaveCount}</strong> rep{onLeaveCount > 1 ? "s" : ""} on leave today</span>
            </li>
          )}
          {overloadReps.slice(0, 3).map((r) => (
            <li key={r.id} className="px-3 py-2 flex items-start gap-2">
              <Users className="h-4 w-4 text-beat-stale mt-0.5 flex-shrink-0" />
              <span><strong>{r.full_name}</strong> overload — {r.load}</span>
            </li>
          ))}
          {alerts.slice(0, 3).map((a) => (
            <li key={a.id} className="px-3 py-2">
              <button
                onClick={() => markRead(a.id)}
                className="text-left w-full hover:underline"
              >
                <div className="font-medium text-xs">{a.title}</div>
                <div className="text-[11px] text-muted-foreground line-clamp-2">{a.message}</div>
              </button>
            </li>
          ))}
          {onLeaveCount === 0 && overloadReps.length === 0 && alerts.length === 0 && (
            <li className="px-3 py-2 text-muted-foreground text-xs">No alerts.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
