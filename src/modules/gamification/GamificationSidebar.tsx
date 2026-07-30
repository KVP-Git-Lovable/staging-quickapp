import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Gamepad2, Zap, Users, Coins, Gift, BarChart3, Settings, Trophy, Package,
} from "lucide-react";

const LINE = "#e7e9f0";
const MUT = "#8a90a5";
const INK = "#1c2440";

type Item = { key: string; label: string; icon: any; to?: string };

const ITEMS: Item[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, to: "/gamification-admin" },
  { key: "programs", label: "Programs", icon: Gamepad2, to: "/gamification-admin" },
  { key: "activities", label: "Activities", icon: Zap },
  { key: "leaderboard", label: "Leaderboard", icon: Trophy },
  { key: "users", label: "Users", icon: Users },
  { key: "points", label: "Points", icon: Coins },
  { key: "rewards", label: "Rewards", icon: Gift },
  { key: "focus", label: "Focus products", icon: Package, to: "/gamification-admin/focus-products" },
  { key: "reports", label: "Reports", icon: BarChart3 },
  { key: "settings", label: "Settings", icon: Settings },
];

export function GamificationSidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const activeKey = pathname.includes("focus-products")
    ? "focus"
    : pathname.includes("/program/")
      ? "programs"
      : "dashboard";

  return (
    <aside
      className="hidden lg:flex w-[68px] xl:w-[212px] shrink-0 flex-col gap-1 rounded-[24px] bg-white/90 backdrop-blur px-2.5 xl:px-3 py-5 self-start sticky top-4"
      style={{ border: `1px solid ${LINE}` }}
    >
      <div className="flex items-center gap-2.5 px-1.5 pb-4 mb-2" style={{ borderBottom: `1px solid ${LINE}` }}>
        <div className="w-9 h-9 rounded-[12px] flex items-center justify-center text-white shrink-0"
             style={{ background: "linear-gradient(135deg,#5A2DD8,#2B1E72)" }}>
          <Zap className="h-[18px] w-[18px]" />
        </div>
        <span className="hidden xl:block text-[13px] font-semibold tracking-tight" style={{ color: INK }}>
          Gamification
        </span>
      </div>

      {ITEMS.map((it) => {
        const isActive = it.key === activeKey;
        const clickable = Boolean(it.to);
        return (
          <button
            key={it.key}
            type="button"
            title={it.label}
            onClick={() => it.to && navigate(it.to)}
            className={`flex items-center gap-3 rounded-[12px] px-2.5 xl:px-3 py-2.5 text-[13px] transition-colors text-left ${
              isActive ? "bg-[#f2edff] font-semibold" : clickable ? "hover:bg-[#f4f5f9]" : "opacity-55 cursor-default"
            }`}
            style={{ color: isActive ? "#5A2DD8" : MUT }}
          >
            <it.icon className="h-[18px] w-[18px] shrink-0" />
            <span className="hidden xl:block truncate">{it.label}</span>
          </button>
        );
      })}
    </aside>
  );
}
