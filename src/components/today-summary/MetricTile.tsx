import { ReactNode, useMemo } from "react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { cn } from "@/lib/utils";

export type MetricTone = "indigo" | "emerald" | "amber" | "rose" | "slate";

const TONE_STYLES: Record<MetricTone, { bg: string; ring: string; icon: string; text: string; stroke: string; fill: string }> = {
  indigo: {
    bg: "bg-[#eef2ff]",
    ring: "ring-indigo-100",
    icon: "bg-white text-indigo-600 ring-1 ring-indigo-100",
    text: "text-indigo-700",
    stroke: "#6366f1",
    fill: "#6366f1",
  },
  emerald: {
    bg: "bg-[#ecfdf5]",
    ring: "ring-emerald-100",
    icon: "bg-white text-emerald-600 ring-1 ring-emerald-100",
    text: "text-emerald-700",
    stroke: "#10b981",
    fill: "#10b981",
  },
  amber: {
    bg: "bg-[#fef3c7]",
    ring: "ring-amber-100",
    icon: "bg-white text-amber-600 ring-1 ring-amber-100",
    text: "text-amber-700",
    stroke: "#f59e0b",
    fill: "#f59e0b",
  },
  rose: {
    bg: "bg-[#fee2e2]",
    ring: "ring-rose-100",
    icon: "bg-white text-rose-600 ring-1 ring-rose-100",
    text: "text-rose-700",
    stroke: "#f43f5e",
    fill: "#f43f5e",
  },
  slate: {
    bg: "bg-slate-100",
    ring: "ring-slate-200",
    icon: "bg-white text-slate-700 ring-1 ring-slate-200",
    text: "text-slate-800",
    stroke: "#64748b",
    fill: "#64748b",
  },
};

interface MetricTileProps {
  tone: MetricTone;
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  loading?: boolean;
  onClick?: () => void;
  series?: number[];
  seed?: number;
}

// Deterministic pseudo-random 7-point wave from a seed. Used as a light-touch
// placeholder trendline until real 7-day series is wired in.
function synthSeries(seed: number, points = 7): number[] {
  const s = Math.max(1, Math.abs(seed) || 1);
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = (Math.sin(s * 0.13 + i * 0.9) + Math.cos(s * 0.07 + i * 1.7)) / 2;
    out.push(0.55 + 0.45 * (t + 1) / 2);
  }
  return out;
}

export function MetricTile({
  tone,
  icon,
  label,
  value,
  hint,
  loading,
  onClick,
  series,
  seed = 1,
}: MetricTileProps) {
  const s = TONE_STYLES[tone];
  const data = useMemo(
    () => (series?.length ? series : synthSeries(seed)).map((v, i) => ({ i, v })),
    [series, seed]
  );
  const interactive = !!onClick;

  return (
    <div
      role={interactive ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-2xl p-4 ring-1 transition-all",
        s.bg,
        s.ring,
        interactive && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg shadow-sm", s.icon)}>
          {icon}
        </div>
      </div>

      <div className="mt-3">
        <div className={cn("text-xl font-semibold tracking-tight break-words leading-tight", s.text)}>
          {loading ? <span className="inline-block h-6 w-20 animate-pulse rounded bg-white/60" /> : value}
        </div>
        <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-600/80">
          {label}
        </div>
        {hint && <div className="mt-0.5 text-[10px] text-slate-500">{hint}</div>}
      </div>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 opacity-70">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <YAxis hide domain={[0, 1.05]} />
            <Line
              type="monotone"
              dataKey="v"
              stroke={s.stroke}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
