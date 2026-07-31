import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Gamepad2, Plus, Trophy, Loader2, HelpCircle, ExternalLink,
  LayoutGrid, Columns2, List, ChevronRight,
} from "lucide-react";
import { categoryMeta } from "./constants";
import { useActivities, usePrograms } from "./hooks";
import { ProgramForm } from "./ProgramForm";


const PAGE = "#eef0f4";
const INK = "#1c2440";
const MUT = "#9aa1b5";
const SEC = "#5a6284";
const LINE = "#e7e9f0";

type ViewMode = "grid3" | "grid2" | "list";

export function GamificationHome() {
  const navigate = useNavigate();
  const { data: programs = [], isLoading } = usePrograms();
  const { data: allActivities = [] } = useActivities();
  const [createOpen, setCreateOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("grid3");

  const gridClass =
    view === "grid3" ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-6"
    : view === "grid2" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    : "grid gap-4 grid-cols-1 2xl:grid-cols-2";

  return (
    <div style={{ color: INK }}>
      {/* SECTION LABEL — sticks below the tab bar (taller on mobile, where tabs wrap to two rows) */}
      <div className="sticky top-[94px] sm:top-[57px] z-10 -mx-1 px-1 py-3 mb-4 backdrop-blur" style={{ background: `${PAGE}f0` }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-[30px] h-[30px] rounded-[10px] bg-[#f2edff] text-[#5A2DD8] flex items-center justify-center">
              <Gamepad2 className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[15px] font-bold tracking-tight leading-tight" style={{ color: INK }}>Reward Programs</div>
              <div className="text-[11.5px] mt-0.5" style={{ color: MUT }}>Manage and monitor your reward programs</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="inline-flex bg-white rounded-[10px] p-0.5" style={{ border: `1px solid ${LINE}` }}>
              {([["grid3", LayoutGrid], ["grid2", Columns2], ["list", List]] as const).map(([v, Icon]) => (
                <button key={v} onClick={() => setView(v as ViewMode)} title={v}
                        className={`w-[30px] h-7 rounded-[8px] flex items-center justify-center transition-colors ${view === v ? "bg-[#f2edff] text-[#5A2DD8]" : "text-[#9aa1b5]"}`}>
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
            <button onClick={() => setCreateOpen(true)}
                    className="text-[12.5px] font-semibold text-white rounded-[12px] px-4 py-2.5 inline-flex items-center gap-1.5 transition-opacity hover:opacity-90"
                    style={{ background: "linear-gradient(135deg,#5A2DD8,#2B1E72)" }}>
              <Plus className="h-4 w-4" /> New program
            </button>
          </div>
        </div>
      </div>

      {/* PROGRAM CARDS */}
      {isLoading ? (
        <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className={gridClass}>
          {programs.map((p: any) => {
            const cat = categoryMeta(p.category);
            const acts = allActivities.filter((a: any) => a.game_id === p.id);
            const on = acts.filter((a: any) => a.is_enabled).length;
            const isList = view === "list";
            return (
              <div
                key={p.id}
                onClick={() => navigate(`/gamification-admin/program/${p.id}`)}
                className={`group rounded-[20px] p-5 relative cursor-pointer bg-white transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_18px_40px_-24px_rgba(28,36,64,.45)] ${
                  isList ? "flex flex-row items-center gap-4 min-h-0 px-5 py-4" : "flex flex-col min-h-[186px]"
                }`}
                style={{ border: `1px solid ${LINE}` }}
              >
                <div className={`${isList ? "" : "mb-3"} w-[42px] h-[42px] rounded-[13px] flex items-center justify-center shrink-0`}
                     style={{ background: cat.fill, color: cat.ac }}>
                  <Trophy className="h-[20px] w-[20px]" />
                </div>
                <div className={isList ? "flex-1 min-w-0" : ""}>
                  <div className="text-[15px] font-bold tracking-tight truncate" style={{ color: INK }}>{p.name}</div>
                  <div className="text-[11.5px] mt-0.5" style={{ color: MUT }}>{cat.label}</div>
                </div>
                <div className={`flex items-center gap-5 ${isList ? "" : "mt-auto pt-3.5"}`}
                     style={isList ? undefined : { borderTop: `1px solid ${LINE}` }}>
                  <div className="flex flex-col">
                    <span className="text-[19px] font-extrabold leading-none" style={{ color: cat.tx }}>{on}</span>
                    <span className="text-[9px] uppercase tracking-[0.08em] mt-1" style={{ color: MUT }}>active</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[19px] font-extrabold leading-none" style={{ color: INK }}>{acts.length}</span>
                    <span className="text-[9px] uppercase tracking-[0.08em] mt-1" style={{ color: MUT }}>total</span>
                  </div>
                  <div className="ml-auto w-[28px] h-[28px] rounded-[9px] flex items-center justify-center transition-colors"
                       style={{ background: cat.fill, color: cat.ac }}>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </div>
                <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${isList ? "order-3" : "absolute top-4 right-4"}`}
                      style={{ background: p.is_active ? "#e9f7ef" : "#f1f2f7", color: p.is_active ? "#178a5a" : MUT }}>
                  {p.is_active ? "Active" : "Draft"}
                </span>
              </div>
            );
          })}
          {!programs.length && (
            <div className="bg-white rounded-[20px] p-8 text-center text-sm col-span-full" style={{ border: `1px solid ${LINE}`, color: MUT }}>
              No programs yet — create your first reward program.
            </div>
          )}
        </div>
      )}

      {/* HELP */}
      <div className="bg-white rounded-[20px] px-5 py-4 flex items-center gap-4 mt-6" style={{ border: `1px solid ${LINE}` }}>
        <div className="w-[38px] h-[38px] rounded-[12px] bg-[#fdf3e3] text-amber-500 flex items-center justify-center shrink-0">
          <HelpCircle className="h-5 w-5" />
        </div>
        <div>
          <div className="text-[13px] font-semibold">Focus products &amp; rewards setup</div>
          <div className="text-[11.5px] mt-0.5" style={{ color: SEC }}>
            Flag the products that earn extra points, then configure programs and activities.
          </div>
        </div>
        <button onClick={() => navigate("/gamification-admin/focus-products")}
                className="ml-auto text-[12.5px] rounded-[10px] px-3.5 py-2 inline-flex items-center gap-1.5 hover:bg-[#f4f5f9] transition-colors"
                style={{ border: `1px solid ${LINE}`, color: SEC }}>
          Focus products <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>

      <ProgramForm open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
