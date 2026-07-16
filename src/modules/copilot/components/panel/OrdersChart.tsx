import { useNavigate } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMyOrdersLast7Days } from "../../hooks/useMyOrdersLast7Days";
import { TrendingUp } from "lucide-react";

export function OrdersChart() {
  const navigate = useNavigate();
  const { data, loading } = useMyOrdersLast7Days();
  const total = data.reduce((s, d) => s + d.kg, 0);

  return (
    <button
      type="button"
      onClick={() => navigate("/analytics")}
      className="group w-full rounded-xl border border-border bg-card p-3 text-left shadow-sm transition hover:ring-2 hover:ring-primary/30"
      aria-label="Open analytics"
    >
      <div className="mb-1 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Orders · 7 days</p>
          <p className="text-sm font-semibold text-foreground">
            {loading ? "…" : `${total.toLocaleString("en-IN", { maximumFractionDigits: 0 })} KG`}
          </p>
        </div>
        <TrendingUp className="h-4 w-4 text-primary/70 transition group-hover:text-primary" />
      </div>
      <div className="h-[140px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="copilotOrdersGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              width={30}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, padding: "4px 8px", borderRadius: 6 }}
              formatter={(v: number) => [`${v} KG`, "Orders"]}
              labelStyle={{ fontSize: 11 }}
            />
            <Area
              type="monotone"
              dataKey="kg"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#copilotOrdersGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground/80">Tap to open Analytics</p>
    </button>
  );
}
