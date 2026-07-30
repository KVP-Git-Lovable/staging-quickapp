import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Loader2, Tag, Info, Hourglass, Gauge, Gift, Trophy, SlidersHorizontal, Calendar, Target as TargetIcon } from "lucide-react";
import { categoryMeta, LINKED_MODULE_NOTE, ProgramCategory } from "./constants";
import { useActivities, useFocusedProductCount, useProgram } from "./hooks";
import { ActivityForm } from "./ActivityForm";
import { CategoryIcon } from "./CategoryIcon";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const PAGE = "#eef0f4";
const INK = "#1c2440";
const MUT = "#9aa1b5";
const SEC = "#5a6284";
const LINE = "#e7e9f0";

const POLICY_ICON: Record<string, any> = {
  Expiry: Hourglass, Cap: Gauge, Redemption: Gift, Leaderboard: Trophy,
  Award: SlidersHorizontal, Validity: Calendar, KPI: TargetIcon, Period: Calendar,
};

export function ProgramDetail() {
  const { programId } = useParams();
  const navigate = useNavigate();
  const { data: program, isLoading } = useProgram(programId);
  const { data: activities = [] } = useActivities(programId);
  const { data: focusedCount = 0 } = useFocusedProductCount();
  const [editing, setEditing] = useState<any | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const { data: tierRanges = {} } = useQuery({
    queryKey: ["gam-tier-ranges", programId, activities.length],
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
  const note = LINKED_MODULE_NOTE[program.category as ProgramCategory]
    ?? "Each activity below is configured independently — its own trigger, points, expiry, caps and behaviour.";

  const policyOf = (a: any) => {
    const rows: [string, string][] = [
      ["Expiry", a.expiry_type === "days" ? `${a.expiry_days} days` : a.expiry_type === "never" ? "Never" : "FY end"],
      ["Cap", a.cap_scope && a.cap_scope !== "none" ? `${a.cap_value ?? "—"} · ${a.cap_scope.replace("_", " / ")}` : "—"],
      ["Redemption", a.redemption_min ? `min ${a.redemption_min}` : "—"],
      ["Award", a.award_mode === "approval" ? "Approval" : "Auto"],
      ["Leaderboard", a.leaderboard ? "On" : "Off"],
      ["Validity", a.validity_from || a.validity_to ? `${a.validity_from ?? "—"} → ${a.validity_to ?? "—"}` : "Always"],
    ];
    return rows;
  };

  return (
    <div className="-mx-2 sm:-mx-4 -my-4 sm:-my-6 px-4 py-5 min-h-screen" style={{ background: PAGE, color: INK }}>
      <div className="mx-auto w-full max-w-[940px] xl:max-w-none xl:px-6 2xl:px-12">
        <button onClick={() => navigate("/gamification-admin")}
                className="inline-flex items-center gap-1.5 text-[12.5px] mb-4" style={{ color: SEC }}>
          <ArrowLeft className="h-4 w-4" /> All programs
        </button>

        {/* HEAD */}
        <div className="flex items-center gap-3.5 rounded-[16px] px-4 py-4 mb-4"
             style={{ background: cat.fill, color: cat.tx }}>
          <div className="w-[46px] h-[46px] rounded-[13px] bg-white/55 flex items-center justify-center">
            <CategoryIcon name={cat.icon} className="h-[22px] w-[22px]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[20px] font-bold tracking-tight truncate">{program.name}</div>
            <div className="text-[12px] opacity-75 mt-0.5">{cat.label} · program grouping</div>
          </div>
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/55">
            {program.is_active ? "Active" : "Draft"}
          </span>
        </div>

        <div className="bg-white rounded-[13px] px-4 py-3 text-[12.5px] flex items-start gap-2.5 mb-6 leading-relaxed"
             style={{ border: `1px solid ${LINE}`, color: SEC }}>
          <Info className="h-4 w-4 shrink-0 mt-0.5" style={{ color: cat.ac }} />
          <span>{note}</span>
        </div>

        <div className="flex items-baseline justify-between mb-3.5 px-0.5">
          <span className="font-pixel text-[9.5px] uppercase tracking-[0.06em]" style={{ color: MUT }}>
            Activities · {activities.length}
          </span>
          <button onClick={() => { setEditing(null); setFormOpen(true); }}
                  className="text-[12.5px] inline-flex items-center gap-1.5" style={{ color: SEC }}>
            <Plus className="h-4 w-4" /> Add activity
          </button>
        </div>

        <div className="space-y-3">
          {activities.map((a: any) => {
            const range = tierRanges[a.id];
            const isTiered = a.is_tiered;
            const pts = isTiered && range ? `${range.min}–${range.max}` : String(a.points ?? 0);
            const trigger = (a.trigger_type ?? a.action_type ?? "").replace(/_/g, " ");
            return (
              <div key={a.id} className={`bg-white rounded-[15px] overflow-hidden ${a.is_enabled ? "" : "opacity-60"}`}
                   style={{ border: `1px solid ${LINE}` }}>
                <div className="flex items-center gap-3.5 px-4 py-3.5 cursor-pointer"
                     onClick={() => { setEditing(a); setFormOpen(true); }}>
                  <div className="min-w-[52px] h-11 rounded-[11px] flex flex-col items-center justify-center shrink-0"
                       style={{ background: cat.fill, color: cat.tx }}>
                    <span className={`${isTiered ? "text-[12px]" : "text-[16px]"} font-bold leading-none`}>{pts}</span>
                    <span className="text-[8.5px] uppercase tracking-[0.1em] mt-0.5 opacity-70">{isTiered ? "tiered" : "pts"}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-medium tracking-tight truncate">{a.action_name}</div>
                    <div className="text-[11.5px] mt-0.5 truncate" style={{ color: SEC }}>{a.description || trigger}</div>
                  </div>
                  <span className="text-[10.5px] px-2.5 py-0.5 rounded-full shrink-0"
                        style={a.is_enabled
                          ? { background: "#e3f3ea", color: "#178a5a" }
                          : { background: PAGE, color: MUT, border: `1px solid ${LINE}` }}>
                    {a.is_enabled ? "On" : "Off"}
                  </span>
                </div>

                {(a.trigger_type === "focused_product_sales") && (
                  <div className="px-4 py-2.5 text-[11.5px] flex items-center gap-2"
                       style={{ background: cat.fill, color: cat.tx }}>
                    <Tag className="h-3.5 w-3.5" />
                    Reads focus flag · {focusedCount} products flagged · set in Product Management
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3" style={{ borderTop: `1px solid ${LINE}` }}>
                  {policyOf(a).map(([k, v]) => {
                    const Icon = POLICY_ICON[k] ?? Hourglass;
                    return (
                      <div key={k} className="px-3.5 py-2.5" style={{ borderRight: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
                        <div className="text-[10px] uppercase tracking-[0.06em] flex items-center gap-1.5 mb-1" style={{ color: MUT }}>
                          <Icon className="h-3 w-3" /> {k}
                        </div>
                        <div className="text-[12.5px] font-medium truncate">{v}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!activities.length && (
            <div className="bg-white rounded-[15px] p-8 text-center text-sm" style={{ border: `1px solid ${LINE}`, color: MUT }}>
              No activities yet — add the first one.
            </div>
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
    </div>
  );
}
