import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const sb = supabase as any;
const today = () => new Date().toISOString().slice(0, 10);
const HEAVY = 70;

interface RepListItem {
  id: string;
  full_name: string;
  status: "leave" | "shared" | "ok";
  load: number;
  heavy: boolean;
}

interface Props {
  selectedRepId: string | null;
  onSelect: (id: string) => void;
}

export function BeatCoordinatorSidebar({ selectedRepId, onSelect }: Props) {
  const { data: reps = [] } = useQuery<RepListItem[]>({
    queryKey: ["bc-sidebar-reps", today()],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const date = today();
      const [profilesRes, leavesRes, draRes, retsRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, user_status").order("full_name"),
        sb.from("leave_applications").select("user_id, start_date, end_date, status")
          .eq("status", "approved").lte("start_date", date).gte("end_date", date),
        sb.from("daily_retailer_assignments").select("assigned_to, assignment_type").eq("plan_date", date),
        supabase.from("retailers").select("user_id"),
      ]);
      const active = (profilesRes.data || []).filter((p: any) => (p.user_status ?? "active") === "active");
      const leaveSet = new Set<string>((leavesRes.data || []).map((l: any) => l.user_id));
      const sharedSet = new Set<string>();
      const loadMap = new Map<string, number>();
      (draRes.data || []).forEach((r: any) => {
        loadMap.set(r.assigned_to, (loadMap.get(r.assigned_to) || 0) + 1);
        if (r.assignment_type === "split" || r.assignment_type === "leave_sub") sharedSet.add(r.assigned_to);
      });
      const ownedMap = new Map<string, number>();
      (retsRes.data || []).forEach((r: any) => {
        if (r.user_id) ownedMap.set(r.user_id, (ownedMap.get(r.user_id) || 0) + 1);
      });
      return active.map((p: any) => {
        const load = loadMap.get(p.id) || ownedMap.get(p.id) || 0;
        const status: RepListItem["status"] = leaveSet.has(p.id)
          ? "leave"
          : sharedSet.has(p.id)
            ? "shared"
            : "ok";
        return { id: p.id, full_name: p.full_name, status, load, heavy: load >= HEAVY };
      });
    },
  });

  const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  const uncovered = reps.filter((r) => r.status === "leave").length;
  const heavyReps = reps.filter((r) => r.heavy);

  return (
    <div className="flex flex-col h-full gap-4">
      <Card className="flex-1 overflow-hidden flex flex-col">
        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">
          Your team
        </div>
        <ScrollArea className="flex-1">
          <ul className="divide-y">
            {reps.map((r) => {
              const isSelected = r.id === selectedRepId;
              return (
                <li key={r.id}>
                  <button
                    onClick={() => onSelect(r.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors",
                      isSelected && "bg-primary/10",
                    )}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs bg-muted">{initials(r.full_name)}</AvatarFallback>
                    </Avatar>
                    <span className="flex-1 text-sm font-medium truncate">{r.full_name}</span>
                    {r.status === "leave" ? (
                      <Badge variant="outline" className="border-beat-uncovered text-beat-uncovered text-[10px]">Leave</Badge>
                    ) : r.status === "shared" ? (
                      <Badge variant="outline" className="border-beat-shared text-beat-shared text-[10px]">Shared</Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          r.heavy ? "border-beat-stale text-beat-stale" : "border-beat-served text-beat-served",
                        )}
                      >
                        {r.load}
                      </Badge>
                    )}
                  </button>
                </li>
              );
            })}
            {reps.length === 0 && <li className="p-4 text-sm text-muted-foreground">No active reps</li>}
          </ul>
        </ScrollArea>
      </Card>

      <Card className="flex-shrink-0">
        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">
          Alerts
        </div>
        <ul className="divide-y text-sm">
          {uncovered > 0 && (
            <li className="px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-beat-uncovered mt-0.5 flex-shrink-0" />
              <span><strong>{uncovered}</strong> rep{uncovered > 1 ? "s" : ""} on leave today</span>
            </li>
          )}
          {heavyReps.slice(0, 3).map((r) => (
            <li key={r.id} className="px-3 py-2 flex items-start gap-2">
              <Users className="h-4 w-4 text-beat-stale mt-0.5 flex-shrink-0" />
              <span><strong>{r.full_name}</strong> heavy load — {r.load} retailers</span>
            </li>
          ))}
          {uncovered === 0 && heavyReps.length === 0 && (
            <li className="px-3 py-2 text-muted-foreground text-xs">No alerts. All clear today.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
