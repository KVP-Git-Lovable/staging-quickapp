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
import heroTrophy from "./assets/hero-trophy.png";


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
    view === "grid3" ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-6"
    : view === "grid2" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    : "grid gap-4 grid-cols-1 2xl:grid-cols-2";

  return (
    <div className="min-h-screen" style={{ color: INK }}>
      <div className="mx-auto w-full max-w-[1600px]">
        {/* HERO */}
        <div
          className="relative overflow-hidden rounded-[24px] px-6 sm:px-10 py-8 xl:py-10 mb-6 xl:min-h-[300px] flex"
          style={{ background: "linear-gradient(120deg,#2B1E72 0%,#4526AE 55%,#5A2DD8 100%)" }}
        >
          <div
            className="pointer-events-none absolute -top-24 -left-16 w-[420px] h-[420px] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,.16) 0%, rgba(255,255,255,0) 70%)" }}
          />
          <div
            className="pointer-events-none absolute -bottom-32 right-1/3 w-[520px] h-[520px] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(124,58,237,.55) 0%, rgba(124,58,237,0) 70%)" }}
          />
          <Sparkles className="pointer-events-none absolute h-4 w-4 text-white/40 animate-pulse" style={{ left: "44%", top: "18%" }} />
          <Star className="pointer-events-none absolute h-3.5 w-3.5 text-amber-300/70 animate-pulse" style={{ left: "56%", top: "68%" }} />
          <Coins className="pointer-events-none absolute h-4 w-4 text-amber-200/60 animate-pulse" style={{ left: "36%", top: "78%" }} />

          <div className="relative flex flex-col lg:flex-row items-center gap-8 w-full">
            <div className="flex-1 min-w-0 w-full">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/70 mb-3">Rewards engine</div>
              <h1 className="font-pixel text-[22px] sm:text-[32px] xl:text-[40px] leading-[1.25] m-0 text-white"
                  style={{ textShadow: "3px 3px 0 rgba(124,58,237,.75), 0 0 22px rgba(167,139,250,.55)" }}>
                GAMIFICATION
              </h1>

              <p className="text-[13.5px] xl:text-[15px] mt-3.5 max-w-[560px] leading-relaxed text-white/75">
                Build reward programs, define activities that earn points, and automatically reward your field teams.
              </p>

              <div className="mt-7 -mx-1 px-1 flex gap-3 overflow-x-auto sm:overflow-visible sm:grid sm:grid-cols-2 xl:grid-cols-4">
                {stats.map((s) => (
                  <div
                    key={s.label}
                    className="min-w-[168px] sm:min-w-0 flex items-center gap-3 rounded-[16px] px-4 py-3.5 bg-white/10 backdrop-blur-md"
                    style={{ border: "1px solid rgba(255,255,255,.16)" }}
                  >
                    <div className="w-9 h-9 rounded-[11px] flex items-center justify-center text-white shrink-0" style={{ background: s.bg }}>
                      <s.icon className="h-[17px] w-[17px]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[19px] font-extrabold leading-none text-white">{s.value}</div>
                      <div className="text-[10.5px] mt-1 text-white/65 truncate">{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full lg:w-[36%] flex justify-center lg:justify-end shrink-0">
              <img
                src={heroTrophy}
                alt="Rewards trophy illustration"
                width={1024}
                height={1024}
                className="w-[190px] sm:w-[240px] xl:w-[290px] h-auto drop-shadow-[0_20px_40px_rgba(0,0,0,.25)]"
              />
            </div>
          </div>
        </div>

        <GlobalConfigBar />

        {/* SECTION LABEL */}
        <div className="sticky top-0 z-10 -mx-1 px-1 py-3 mb-4 backdrop-blur" style={{ background: `${PAGE}f0` }}>
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
    </div>
  );
}

