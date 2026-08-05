import { Coins, Gamepad2, Gift, Sparkles, Star, Zap } from "lucide-react";
import { useActivities, useGamSettings, usePointsIssuedYtd, usePrograms } from "./hooks";
import { TrophyMark } from "@/components/gamification/TrophyMark";


/**
 * Compact hero band. Same content as the original full-height hero — gradient,
 * glow orbs, pixel wordmark, trophy and the four stat tiles — laid out as a
 * horizontal band so it costs ~170px instead of ~300px, and sits above the tab
 * bar on every section of the module.
 */
export function GamificationHero() {
  const { data: programs = [] } = usePrograms();
  const { data: allActivities = [] } = useActivities();
  const { data: settings } = useGamSettings();
  const { data: pointsYtd = 0 } = usePointsIssuedYtd();

  const activeActivities = allActivities.filter((a: any) => a.is_enabled).length;

  const stats = [
    { icon: Gamepad2, bg: "#3b82f6", value: programs.length, label: "Programs" },
    { icon: Zap, bg: "#14b8a6", value: activeActivities, label: "Active activities" },
    { icon: Coins, bg: "#f59e0b", value: pointsYtd.toLocaleString(), label: "Points issued YTD" },
    { icon: Gift, bg: "#8b5cf6", value: settings?.engine_enabled ? "On" : "Off", label: "Rewards engine" },
  ];

  return (
    <div
      className="relative overflow-hidden rounded-[20px] px-5 sm:px-7 py-4 sm:py-5"
      style={{ background: "linear-gradient(120deg,#2B1E72 0%,#4526AE 55%,#5A2DD8 100%)" }}
    >
      <div
        className="pointer-events-none absolute -top-[90px] -left-[60px] w-[240px] h-[240px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,.16) 0%, rgba(255,255,255,0) 70%)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-[120px] right-[28%] w-[300px] h-[300px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(124,58,237,.55) 0%, rgba(124,58,237,0) 70%)" }}
      />
      <Sparkles className="pointer-events-none absolute h-3.5 w-3.5 text-white/40 animate-pulse" style={{ left: "46%", top: "14%" }} />
      <Star className="pointer-events-none absolute h-3 w-3 text-amber-300/70 animate-pulse" style={{ left: "58%", top: "70%" }} />
      <Coins className="pointer-events-none absolute h-3.5 w-3.5 text-amber-200/60 animate-pulse" style={{ left: "38%", top: "82%" }} />

      <div className="relative flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
        <div className="flex-1 min-w-0 w-full">
          <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/70">Rewards engine</div>

          <h1
            className="font-pixel text-[18px] sm:text-[22px] xl:text-[25px] leading-none mt-1.5 mb-0 text-white"
            style={{ textShadow: "2px 2px 0 rgba(124,58,237,.75), 0 0 16px rgba(167,139,250,.5)" }}
          >
            GAMIFICATION
          </h1>

          <p className="text-[11.5px] xl:text-[12.5px] mt-2 max-w-[560px] leading-snug text-white/75">
            Build reward programs, define activities that earn points, and automatically reward your field teams.
          </p>

          <div className="mt-3 -mx-1 px-1 flex gap-2 overflow-x-auto sm:overflow-visible sm:flex-wrap">
            {stats.map((s) => (
              <div
                key={s.label}
                className="min-w-[136px] sm:min-w-0 shrink-0 flex items-center gap-2.5 rounded-[12px] px-3 py-2 bg-white/10 backdrop-blur-md"
                style={{ border: "1px solid rgba(255,255,255,.16)" }}
              >
                <div
                  className="w-[22px] h-[22px] rounded-[7px] flex items-center justify-center text-white shrink-0"
                  style={{ background: s.bg }}
                >
                  <s.icon className="h-[13px] w-[13px]" />
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] font-extrabold leading-none text-white">{s.value}</div>
                  <div className="text-[9px] mt-1 text-white/65 truncate">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="shrink-0">
          <TrophyMark
            float
            alt="Rewards trophy illustration"
            className="w-[92px] sm:w-[112px] xl:w-[128px] h-auto"
          />
        </div>

      </div>
    </div>
  );
}
