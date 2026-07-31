import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronDown, Zap } from "lucide-react";
import { useGamSettings, useUpdateGamSettings } from "./hooks";

const INK = "#1c2440";
const MUT = "#9aa1b5";
const LINE = "#e7e9f0";

interface GlobalConfigBarProps {
  /** Controlled from the parent so the gear icon in the tab bar can open it too. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Global configuration. Moved out of GamificationHome so it can sit directly
 * below the tab bar and stay available on every section — it applies to every
 * program, so it shouldn't be reachable from only one screen.
 */
export function GlobalConfigBar({ open, onOpenChange }: GlobalConfigBarProps) {
  const { data: settings } = useGamSettings();
  const update = useUpdateGamSettings();
  const patch = (p: any) => settings && update.mutate({ id: settings.id, ...p });

  return (
    <div>
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
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
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
