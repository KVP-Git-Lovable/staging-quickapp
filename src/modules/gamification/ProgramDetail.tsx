import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Plus, Loader2, Star } from "lucide-react";
import { categoryMeta, LINKED_MODULE_NOTE, ProgramCategory } from "./constants";
import { useActivities, useFocusedProductCount, useProgram } from "./hooks";
import { ActivityForm } from "./ActivityForm";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function ProgramDetail() {
  const { programId } = useParams();
  const navigate = useNavigate();
  const { data: program, isLoading } = useProgram(programId);
  const { data: activities = [] } = useActivities(programId);
  const { data: focusedCount = 0 } = useFocusedProductCount();
  const [editing, setEditing] = useState<any | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const { data: tierRanges = {} } = useQuery({
    queryKey: ["gam-tier-ranges", programId],
    enabled: activities.some((a: any) => a.is_tiered),
    queryFn: async () => {
      const ids = activities.filter((a: any) => a.is_tiered).map((a: any) => a.id);
      const { data } = await supabase.from("activity_tiers").select("action_id, points").in("action_id", ids);
      const map: Record<string, { min: number; max: number }> = {};
      (data ?? []).forEach((t: any) => {
        const p = Number(t.points);
        map[t.action_id] = map[t.action_id]
          ? { min: Math.min(map[t.action_id].min, p), max: Math.max(map[t.action_id].max, p) }
          : { min: p, max: p };
      });
      return map;
    },
  });

  if (isLoading || !program) {
    return <div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const cat = categoryMeta(program.category);
  const note = LINKED_MODULE_NOTE[program.category as ProgramCategory];
  const activeCount = activities.filter((a: any) => a.is_enabled).length;

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (a: any) => { setEditing(a); setFormOpen(true); };

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate("/gamification-admin")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> All programs
      </Button>

      <div className={`rounded-2xl border ${cat.border} ${cat.tint} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className={`font-pixel text-sm ${cat.text}`}>{program.name?.toUpperCase()}</h1>
            <p className="text-sm text-muted-foreground mt-2">{cat.label} · program grouping</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{activeCount}/{activities.length} activities active</Badge>
            <Badge className={program.is_active ? "bg-emerald-600" : "bg-slate-400"}>
              {program.is_active ? "Active" : "Draft"}
            </Badge>
          </div>
        </div>
        {note && <p className="mt-3 text-xs text-muted-foreground border-t pt-3">{note}</p>}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-pixel text-xs text-orange-600">ACTIVITIES · {activities.length}</h2>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add activity</Button>
      </div>

      <div className="space-y-3">
        {activities.map((a: any) => {
          const range = tierRanges[a.id];
          const badge = a.is_tiered && range ? `${range.min}–${range.max} · tiered` : String(a.points ?? 0);
          const trigger = a.trigger_type ?? a.action_type;
          return (
            <Card
              key={a.id}
              onClick={() => openEdit(a)}
              className="p-4 cursor-pointer hover:shadow-md transition-shadow flex items-center gap-4"
            >
              <div className={`shrink-0 rounded-xl ${cat.tint} ${cat.text} px-3 py-2 text-sm font-semibold min-w-[64px] text-center`}>
                {badge}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{a.action_name}</p>
                <p className="text-xs text-muted-foreground truncate">{a.description || `Triggers on ${trigger?.replace(/_/g, " ")}`}</p>
                {trigger === "focused_product_sales" && (
                  <p className="text-xs text-purple-700 mt-1 flex items-center gap-1">
                    <Star className="h-3 w-3" /> Reads focus flag · {focusedCount} products flagged · set in Product Management
                  </p>
                )}
              </div>
              <Badge className={a.is_enabled ? "bg-emerald-600" : "bg-slate-400"}>{a.is_enabled ? "On" : "Off"}</Badge>
            </Card>
          );
        })}
        {!activities.length && (
          <Card className="p-8 text-center text-sm text-muted-foreground">No activities yet — add the first one.</Card>
        )}
      </div>

      <ActivityForm
        open={formOpen}
        onOpenChange={setFormOpen}
        programId={program.id}
        category={(program.category ?? "orders") as ProgramCategory}
        activity={editing}
      />
    </div>
  );
}
