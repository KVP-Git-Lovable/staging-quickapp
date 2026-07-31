import { useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, Coins, Gamepad2, Gift, LayoutDashboard, Settings, Trophy, Zap,
} from "lucide-react";

const PAGE = "#eef0f4";
const LINE = "#e7e9f0";

type TabItem = { key: string; label: string; short: string; icon: any; to: string };

const TABS: TabItem[] = [
  { key: "overview",    label: "Overview",    short: "Overview", icon: LayoutDashboard, to: "/gamification-admin" },
  { key: "programs",    label: "Programs",    short: "Programs", icon: Gamepad2,        to: "/gamification-admin/programs" },
  { key: "activities",  label: "Activities",  short: "Activity", icon: Zap,             to: "/gamification-admin/activities" },
  { key: "points",      label: "Points",      short: "Points",   icon: Coins,           to: "/gamification-admin/points" },
  { key: "rewards",     label: "Rewards",     short: "Rewards",  icon: Gift,            to: "/gamification-admin/rewards" },
  { key: "leaderboard", label: "Leaderboard", short: "Leaders",  icon: Trophy,          to: "/gamification-admin/leaderboard" },
];

/**
 * Routes stay the source of truth — the tab bar reads the active section from
 * the URL and navigates on change, so deep links and browser-back keep working.
 */
export function activeTabKey(pathname: string) {
  if (pathname.includes("/focus-products")) return "rewards";
  if (pathname.includes("/program/")) return "programs";
  if (pathname.includes("/programs")) return "programs";
  if (pathname.includes("/activities")) return "activities";
  if (pathname.includes("/points")) return "points";
  if (pathname.includes("/rewards")) return "rewards";
  if (pathname.includes("/leaderboard")) return "leaderboard";
  if (pathname.includes("/reports")) return "reports";
  return "overview";
}

interface GamificationTabsProps {
  /** Toggles the Global configuration panel that sits directly below this bar. */
  onToggleSettings: () => void;
  settingsOpen: boolean;
}

export function GamificationTabs({ onToggleSettings, settingsOpen }: GamificationTabsProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = activeTabKey(pathname);
  const onReports = active === "reports";

  return (
    <div className="sticky top-0 z-30 pt-1 pb-3" style={{ background: PAGE }}>
      <div className="flex items-center gap-2">
        <Tabs
          value={active}
          onValueChange={(v) => {
            const next = TABS.find((t) => t.key === v);
            if (next) navigate(next.to);
          }}
          className="flex-1 min-w-0"
        >
          <TabsList
            className="grid w-full h-auto grid-cols-3 sm:grid-cols-6 gap-1 p-1 rounded-[11px] text-[#6b7288]"
            style={{ background: "#e3e6ef" }}
          >
            {TABS.map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className="flex items-center justify-center gap-1.5 rounded-[8px] px-2 py-2 text-[12px] font-semibold data-[state=active]:bg-white data-[state=active]:text-[#5A2DD8]"
              >
                <t.icon className="h-[13px] w-[13px] shrink-0" />
                <span className="hidden sm:inline truncate">{t.label}</span>
                <span className="sm:hidden truncate">{t.short}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div
          className="flex gap-0.5 bg-white rounded-[11px] p-0.5 shrink-0"
          style={{ border: `1px solid ${LINE}` }}
        >
          <button
            type="button"
            title="Reports"
            aria-label="Reports"
            onClick={() => navigate("/gamification-admin/reports")}
            className={`w-[31px] h-[31px] rounded-[8px] flex items-center justify-center transition-colors ${
              onReports ? "bg-[#f2edff] text-[#5A2DD8]" : "text-[#8f96ab] hover:bg-[#f2edff] hover:text-[#5A2DD8]"
            }`}
          >
            <BarChart3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Global settings"
            aria-label="Global settings"
            aria-expanded={settingsOpen}
            onClick={onToggleSettings}
            className={`w-[31px] h-[31px] rounded-[8px] flex items-center justify-center transition-colors ${
              settingsOpen ? "bg-[#f2edff] text-[#5A2DD8]" : "text-[#8f96ab] hover:bg-[#f2edff] hover:text-[#5A2DD8]"
            }`}
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
