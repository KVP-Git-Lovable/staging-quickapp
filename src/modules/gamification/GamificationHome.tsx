import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown, Gamepad2, Plus, Star, Trophy, Loader2, HelpCircle, ExternalLink,
  Sparkles, Coins, LayoutGrid, Columns2, List, ChevronRight, Zap, Gift, Users,
} from "lucide-react";
import { categoryMeta } from "./constants";
import { useActivities, useGamSettings, usePointsIssuedYtd, usePrograms, useUpdateGamSettings } from "./hooks";
import { ProgramForm } from "./ProgramForm";

const PAGE = "#eef0f4";
const INK = "#1c2440";
const MUT = "#9aa1b5";
const SEC = "#5a6284";
const LINE = "#e7e9f0";

type ViewMode = "grid3" | "grid2" | "list";

function GlobalConfigBar() {
  const { data: settings } = useGamSettings();
  const update = useUpdateGamSettings();
  const [open, setOpen] = useState(false);
  const patch = (p: any) => settings && update.mutate({ id: settings.id, ...p });

  return (
    <div className="mb-6">
      <div
        className="flex items-center gap-3.5 bg-white rounded-[14px] px-4 py-3.5"
        style={{ border: `1px solid ${LINE}`, boxShadow: "0 4px 18px -14px rgba(20,18,10,.4)" }}
      >
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0"
             style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
          <Zap className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold" style={{ color: INK }}>Global configuration</div>
          <div className="text-[11px] mt-0.5" style={{ color: MUT }}>Applies to every program</div>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-[12.5px] rounded-full px-3.5 py-1.5 inline-flex items-center gap-1.5 bg-[#eef0f4] hover:bg-white transition-colors"
          style={{ border: "1px solid #d7dae6", color: INK }}
        >
          Edit <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && settings && (
        <div className="bg-white rounded-b-[14px] overflow-hidden" style={{ border: `1px solid ${LINE}`, borderTop: "none" }}>
          <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4" style={{ background: LINE }}>
            <div className="bg-white px-3.5 py-3">
              <div className="text-[10.5px] uppercase tracking-wider mb-1" style={{ color: MUT }}>Gamification engine</div>
              <Select value={settings.engine_enabled ? "on" : "off"} onValueChange={(v) => patch({ engine_enabled: v === "on" })}>
                <SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">Enabled</SelectItem>
                  <SelectItem value="off">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="bg-white px-3.5 py-3">
              <div className="text-[10.5px] uppercase tracking-wider mb-1" style={{ color: MUT }}>Point currency name</div>
              <Input className="h-8 text-[13px]" defaultValue={settings.currency_name} onBlur={(e) => patch({ currency_name: e.target.value })} />
            </div>
            <div className="bg-white px-3.5 py-3">
              <div className="text-[10.5px] uppercase tracking-wider mb-1" style={{ color: MUT }}>Point → rupee</div>
              <div className="flex items-center gap-1.5">
                <span className="text-[12.5px]">1 pt =</span>
                <Input className="h-8 w-16 text-[13px]" type="number" defaultValue={settings.point_conversion}
                       onBlur={(e) => patch({ point_conversion: Number(e.target.value) })} />
                <span className="text-[12.5px]">₹</span>
              </div>
            </div>
            <div className="bg-white px-3.5 py-3">
              <div className="text-[10.5px] uppercase tracking-wider mb-1" style={{ color: MUT }}>Default award mode</div>
              <Select value={settings.default_award_mode} onValueChange={(v) => patch({ default_award_mode: v })}>
                <SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="approval">Manager approval</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="bg-white px-3.5 py-3 flex items-center justify-between">
              <div className="text-[10.5px] uppercase tracking-wider" style={{ color: MUT }}>Leaderboard</div>
              <Switch checked={settings.leaderboard_enabled} onCheckedChange={(v) => patch({ leaderboard_enabled: v })} />
            </div>
            <div className="bg-white px-3.5 py-3 flex items-center justify-between">
              <div className="text-[10.5px] uppercase tracking-wider" style={{ color: MUT }}>Notifications</div>
              <Switch checked={settings.notifications_enabled} onCheckedChange={(v) => patch({ notifications_enabled: v })} />
            </div>
            <div className="bg-white px-3.5 py-3">
              <div className="text-[10.5px] uppercase tracking-wider mb-1" style={{ color: MUT }}>Approval fallback</div>
              <Select value={settings.approval_fallback} onValueChange={(v) => patch({ approval_fallback: v })}>
                <SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="bg-white px-3.5 py-3">
              <div className="text-[10.5px] uppercase tracking-wider mb-1" style={{ color: MUT }}>Default timezone</div>
              <Input className="h-8 text-[13px]" defaultValue={settings.timezone} onBlur={(e) => patch({ timezone: e.target.value })} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function GamificationHome() {
  const navigate = useNavigate();
  const { data: programs = [], isLoading } = usePrograms();
  const { data: allActivities = [] } = useActivities();
  const { data: settings } = useGamSettings();
  const { data: pointsYtd = 0 } = usePointsIssuedYtd();
  const [createOpen, setCreateOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("grid3");

  const activeActivities = allActivities.filter((a: any) => a.is_enabled).length;

  const stats = [
    { icon: Gamepad2, bg: "#3b82f6", value: programs.length, label: "Programs" },
    { icon: Zap, bg: "#14b8a6", value: activeActivities, label: "Active activities" },
    { icon: Coins, bg: "#f59e0b", value: pointsYtd.toLocaleString(), label: "Points issued YTD" },
    { icon: Gift, bg: "#8b5cf6", value: settings?.engine_enabled ? "On" : "Off", label: "Rewards engine" },
  ];

  const gridClass =
    view === "grid3" ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
    : view === "grid2" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
    : "grid gap-3 grid-cols-1 2xl:grid-cols-2";

  const statsStrip = (
    <div
      className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-2 bg-white rounded-[16px] overflow-hidden"
      style={{ border: `1px solid ${LINE}` }}
    >
      {stats.map((s, i) => (
        <div key={s.label} className="flex items-center gap-3 p-4 xl:p-5"
             style={{ borderRight: i < stats.length - 1 ? `1px solid ${LINE}` : "none", borderBottom: `1px solid ${LINE}` }}>
          <div className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center text-white shrink-0" style={{ background: s.bg }}>
            <s.icon className="h-[17px] w-[17px]" />
          </div>
          <div>
            <div className="text-[17px] font-extrabold leading-none" style={{ color: INK }}>{s.value}</div>
            <div className="text-[10.5px] mt-0.5" style={{ color: MUT }}>{s.label}</div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="-mx-2 sm:-mx-4 -my-4 sm:-my-6 px-4 py-5 xl:px-8 2xl:px-12 min-h-screen" style={{ background: PAGE, color: INK }}>
      <div className="mx-auto w-full max-w-[940px] xl:max-w-none">
        {/* HERO + STATS (side by side on desktop) */}
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,1fr)] xl:items-stretch mb-2.5">
          <div className="rounded-[20px] px-6 py-5 xl:px-10 xl:py-8 relative overflow-hidden"
               style={{ background: "linear-gradient(120deg,#fff4e6 0%,#ffeede 46%,#fdf0e7 100%)" }}>
            <Sparkles className="absolute h-3.5 w-3.5 text-amber-500" style={{ left: "52%", top: "26%" }} />
            <Star className="absolute h-3.5 w-3.5 text-pink-500" style={{ left: "64%", top: "60%" }} />
            <Coins className="absolute h-3 w-3 text-violet-500" style={{ left: "78%", top: "22%" }} />
            <div className="font-pixel text-[9px] uppercase tracking-[0.14em] mb-3.5 text-orange-600">Rewards engine</div>
            <h1 className="font-pixel text-[20px] sm:text-[26px] xl:text-[34px] leading-[1.15] m-0 text-orange-600"
                style={{ textShadow: "2px 2px 0 rgba(251,146,60,.4)" }}>
              GAMIFICATION
            </h1>
            <p className="text-[12.5px] xl:text-[14px] mt-3 max-w-[360px] xl:max-w-[520px] leading-relaxed" style={{ color: SEC }}>
              Build programs, define the activities that earn points, and let the engine reward your field team automatically.
            </p>
            <Trophy className="absolute right-5 top-1/2 -translate-y-1/2 h-14 w-14 xl:h-20 xl:w-20 text-amber-500 opacity-90" />
          </div>
          <div className="hidden xl:block">{statsStrip}</div>
        </div>

        <GlobalConfigBar />


        {/* SECTION LABEL */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3.5 px-0.5">
          <div className="flex items-center gap-2">
            <div className="w-[26px] h-[26px] rounded-lg bg-[#eaf2ff] text-[#3b82f6] flex items-center justify-center">
              <Gamepad2 className="h-4 w-4" />
            </div>
            <div>
              <div className="font-pixel text-[11px] leading-[1.3]" style={{ color: INK }}>Reward Programs</div>
              <div className="text-[11px] mt-1" style={{ color: MUT }}>Manage and monitor your reward programs</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="inline-flex bg-white rounded-[9px] p-0.5" style={{ border: `1px solid ${LINE}` }}>
              {([["grid3", LayoutGrid], ["grid2", Columns2], ["list", List]] as const).map(([v, Icon]) => (
                <button key={v} onClick={() => setView(v as ViewMode)} title={v}
                        className={`w-[30px] h-7 rounded-[7px] flex items-center justify-center ${view === v ? "bg-[#eaf2ff] text-[#3b82f6]" : "text-[#9aa1b5]"}`}>
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
            <button onClick={() => setCreateOpen(true)}
                    className="text-[12.5px] font-semibold text-white rounded-[10px] px-4 py-2.5 inline-flex items-center gap-1.5"
                    style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
              <Plus className="h-4 w-4" /> New program
            </button>
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
                  className={`rounded-[16px] p-4 relative cursor-pointer transition-transform hover:-translate-y-0.5 ${
                    isList ? "flex flex-row items-center gap-4 min-h-0 px-4 py-3.5" : "flex flex-col min-h-[128px]"
                  }`}
                  style={{
                    background: `linear-gradient(150deg, ${cat.fill}, ${cat.f2})`,
                    color: cat.tx,
                    border: `1px solid ${LINE}`,
                  }}
                >
                  <div className={`${isList ? "" : "mb-auto"} w-[38px] h-[38px] rounded-[11px] bg-white flex items-center justify-center shrink-0`}
                       style={{ color: cat.ac, boxShadow: "0 3px 8px -4px rgba(28,36,64,.3)" }}>
                    <Trophy className="h-[19px] w-[19px]" />
                  </div>
                  <div className={isList ? "flex-1 min-w-0" : "mt-1"}>
                    <div className="text-[14.5px] font-bold tracking-tight truncate">{p.name}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: SEC }}>{cat.label}</div>
                  </div>
                  <div className={`flex items-center gap-[18px] ${isList ? "" : "mt-auto pt-3 border-t border-white/70"}`}>
                    <div className="flex flex-col">
                      <span className="text-[19px] font-extrabold leading-none">{on}</span>
                      <span className="text-[9px] uppercase tracking-[0.08em] mt-0.5" style={{ color: SEC }}>active</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[19px] font-extrabold leading-none">{acts.length}</span>
                      <span className="text-[9px] uppercase tracking-[0.08em] mt-0.5" style={{ color: SEC }}>total</span>
                    </div>
                    {isList && (
                      <div className="ml-auto w-[26px] h-[26px] rounded-lg bg-white flex items-center justify-center" style={{ color: cat.ac }}>
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-white ${isList ? "order-3 ml-auto" : "absolute top-3.5 right-3.5"}`}
                        style={{ color: cat.tx }}>
                    {p.is_active ? "Active" : "Draft"}
                  </span>
                </div>
              );
            })}
            {!programs.length && (
              <div className="bg-white rounded-[16px] p-8 text-center text-sm col-span-full" style={{ border: `1px solid ${LINE}`, color: MUT }}>
                No programs yet — create your first reward program.
              </div>
            )}
          </div>
        )}

        {/* STATS STRIP (mobile / tablet only — desktop shows it next to the hero) */}
        <div className="xl:hidden mt-[18px] mb-3.5">{statsStrip}</div>


        {/* HELP */}
        <div className="bg-white rounded-[14px] px-4 py-3.5 flex items-center gap-3.5" style={{ border: `1px solid ${LINE}` }}>
          <div className="w-[38px] h-[38px] rounded-[11px] bg-[#fdf3e3] text-amber-500 flex items-center justify-center shrink-0">
            <HelpCircle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[13px] font-semibold">Focus products &amp; rewards setup</div>
            <div className="text-[11px] mt-0.5" style={{ color: SEC }}>
              Flag the products that earn extra points, then configure programs and activities.
            </div>
          </div>
          <button onClick={() => navigate("/gamification-admin/focus-products")}
                  className="ml-auto text-[12.5px] rounded-[9px] px-3.5 py-2 inline-flex items-center gap-1.5"
                  style={{ border: `1px solid ${LINE}`, color: SEC }}>
            Focus products <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>

        <ProgramForm open={createOpen} onOpenChange={setCreateOpen} />
      </div>
    </div>
  );
}
