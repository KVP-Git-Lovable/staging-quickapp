import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Download, X, Plus, TrendingDown, UserX, AlertCircle } from "lucide-react";
import { downloadCSV } from "@/utils/fileDownloader";
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfQuarter, endOfQuarter, startOfYear, endOfYear, subWeeks, subMonths, subQuarters, subYears,
} from "date-fns";

/* ------------------------------------------------------------------ periods */

export type Preset = "week" | "month" | "quarter" | "half" | "year" | "custom";

export interface Period { key: string; label: string; from: string; to: string }

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Last `count` periods of the given granularity, oldest first. */
export const buildPeriods = (preset: Preset, count: number, anchor = new Date()): Period[] => {
  const out: Period[] = [];
  for (let i = count - 1; i >= 0; i--) {
    let from: Date, to: Date, label: string, key: string;
    switch (preset) {
      case "week": {
        const d = subWeeks(anchor, i);
        from = startOfWeek(d, { weekStartsOn: 1 }); to = endOfWeek(d, { weekStartsOn: 1 });
        label = `W/c ${format(from, "dd MMM")}`; key = `w-${iso(from)}`; break;
      }
      case "quarter": {
        const d = subQuarters(anchor, i);
        from = startOfQuarter(d); to = endOfQuarter(d);
        label = `Q${Math.floor(from.getMonth() / 3) + 1} ${format(from, "yyyy")}`; key = `q-${iso(from)}`; break;
      }
      case "half": {
        // Half-years are not a date-fns primitive; derive from the month.
        const d = subMonths(anchor, i * 6);
        const h = d.getMonth() < 6 ? 0 : 1;
        from = new Date(d.getFullYear(), h * 6, 1);
        to = new Date(d.getFullYear(), h * 6 + 6, 0);
        label = `${h === 0 ? "H1" : "H2"} ${from.getFullYear()}`; key = `h-${iso(from)}`; break;
      }
      case "year": {
        const d = subYears(anchor, i);
        from = startOfYear(d); to = endOfYear(d);
        label = format(from, "yyyy"); key = `y-${iso(from)}`; break;
      }
      default: {
        const d = subMonths(anchor, i);
        from = startOfMonth(d); to = endOfMonth(d);
        label = format(from, "MMM yyyy"); key = `m-${iso(from)}`; break;
      }
    }
    out.push({ key, label, from: iso(from), to: iso(to) });
  }
  return out;
};

/* ------------------------------------------------------------------ metrics */

type Fmt = "currency" | "number" | "kg" | "percent" | "rate";

interface MetricDef { key: string; label: string; fmt: Fmt; invert?: boolean }

const SECTIONS: { title: string; metrics: MetricDef[] }[] = [
  {
    title: "Sales and volume",
    metrics: [
      { key: "order_value", label: "Total order value", fmt: "currency" },
      { key: "volume_kg", label: "Total volume (KG)", fmt: "kg" },
      { key: "orders", label: "Orders", fmt: "number" },
      { key: "line_items", label: "Line items", fmt: "number" },
      { key: "avg_order_value", label: "Avg order value", fmt: "currency" },
      { key: "kg_per_order", label: "KG per order", fmt: "kg" },
      { key: "realised_per_kg", label: "Realised ₹ per KG", fmt: "rate" },
      { key: "volume_under_250_pct", label: "Volume under ₹250/kg", fmt: "percent", invert: true },
      { key: "cancelled_orders", label: "Cancelled orders", fmt: "number", invert: true },
    ],
  },
  {
    title: "Coverage and team",
    metrics: [
      { key: "retailers_billed", label: "Retailers billed", fmt: "number" },
      { key: "new_retailers", label: "New retailers added", fmt: "number" },
      { key: "active_reps", label: "Active reps", fmt: "number" },
      { key: "orders_per_rep", label: "Orders per rep", fmt: "number" },
      { key: "value_per_rep", label: "Value per rep", fmt: "currency" },
    ],
  },
  {
    title: "Credit and collection",
    metrics: [
      { key: "credit_sales", label: "Credit sales", fmt: "currency" },
      { key: "cash_sales", label: "Cash / paid sales", fmt: "currency" },
      { key: "credit_share_pct", label: "Credit share of sales", fmt: "percent", invert: true },
      { key: "unpaid_on_orders", label: "Still unpaid on these orders", fmt: "currency", invert: true },
      { key: "collections", label: "Collections received", fmt: "currency" },
    ],
  },
];

const LENSES = [
  { key: "retailers_declining", label: "Retailers declining", icon: TrendingDown },
  { key: "retailers_stopped", label: "Stopped ordering", icon: AlertCircle },
  { key: "reps_underusing", label: "Reps under-using app", icon: UserX },
];

const fmtVal = (v: unknown, f: Fmt): string => {
  const n = Number(v);
  if (v === null || v === undefined || !Number.isFinite(n)) return "—";
  switch (f) {
    case "currency":
      return n >= 100000 ? `₹${(n / 100000).toFixed(2)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`;
    case "kg": return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    case "percent": return `${n.toFixed(1)}%`;
    case "rate": return `₹${Math.round(n)}`;
    default: return n.toLocaleString("en-IN");
  }
};

/** First → last period movement. Percent for values, points for shares. */
const movement = (metrics: any, m: MetricDef, periods: Period[]) => {
  if (periods.length < 2) return null;
  const a = Number(metrics?.[m.key]?.[periods[0].key]);
  const b = Number(metrics?.[m.key]?.[periods[periods.length - 1].key]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) return null;
  if (m.fmt === "percent") {
    const pts = b - a;
    return { text: `${pts >= 0 ? "+" : ""}${pts.toFixed(1)} pts`, good: m.invert ? pts <= 0 : pts >= 0 };
  }
  const pct = ((b - a) / Math.abs(a)) * 100;
  return { text: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`, good: m.invert ? pct <= 0 : pct >= 0 };
};

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/* ---------------------------------------------------------------- component */

interface Props { userIds: string[] }

export const SalesComparisonSection = ({ userIds }: Props) => {
  const [preset, setPreset] = useState<Preset>("month");
  const [periods, setPeriods] = useState<Period[]>(() => buildPeriods("month", 3));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [drill, setDrill] = useState<{ metric: string; label: string; period: Period } | null>(null);
  const [drillData, setDrillData] = useState<any>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  const filters = useMemo(
    () => (userIds.length > 0 ? { user_ids: userIds } : {}),
    [userIds],
  );

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: res, error: err } = await supabase.rpc("get_sales_comparison_summary" as any, {
        p_periods: periods, p_filters: filters,
      });
      if (err) throw err;
      setData(res);
    } catch (e: any) {
      setError(e?.message ?? "Could not load the comparison");
      setData(null);
    } finally { setLoading(false); }
  }, [periods, filters]);

  useEffect(() => { load(); }, [load]);

  const openDrill = useCallback(async (metric: string, label: string, period: Period) => {
    setDrill({ metric, label, period });
    setDrillData(null); setDrillLoading(true);
    // Lenses compare against the period immediately before the one clicked.
    const idx = periods.findIndex(p => p.key === period.key);
    const prev = idx > 0 ? periods[idx - 1] : null;
    try {
      const { data: res, error: err } = await supabase.rpc("get_sales_comparison_detail" as any, {
        p_metric: metric, p_from: period.from, p_to: period.to, p_filters: filters,
        p_compare_from: prev?.from ?? null, p_compare_to: prev?.to ?? null,
      });
      if (err) throw err;
      setDrillData(res);
    } catch (e: any) {
      setDrillData({ error: e?.message ?? "Could not load the detail" });
    } finally { setDrillLoading(false); }
  }, [filters, periods]);

  const exportDrill = async () => {
    if (!drillData?.columns) return;
    const cols = drillData.columns as { key: string; label: string }[];
    const rows = (drillData.rows ?? []) as Record<string, unknown>[];
    const csv = [
      cols.map(c => csvCell(c.label)).join(","),
      ...rows.map(r => cols.map(c => csvCell(r[c.key])).join(",")),
    ].join("\n");
    await downloadCSV("\ufeff" + csv, `${drill?.metric}-${drill?.period.from}-to-${drill?.period.to}`);
  };

  const exportSummary = async () => {
    if (!data?.metrics) return;
    const head = ["Metric", ...periods.map(p => p.label)];
    const lines = [head.map(csvCell).join(",")];
    SECTIONS.forEach(sec => {
      lines.push(csvCell(sec.title.toUpperCase()) + ",".repeat(periods.length));
      sec.metrics.forEach(m =>
        lines.push([csvCell(m.label), ...periods.map(p => csvCell(data.metrics?.[m.key]?.[p.key] ?? ""))].join(",")));
    });
    await downloadCSV("\ufeff" + lines.join("\n"), `sales-comparison-${iso(new Date())}`);
  };

  const skuRows = useMemo(() => {
    if (!data?.sku) return [];
    const last = periods[periods.length - 1]?.key;
    return Object.entries(data.sku as Record<string, any>)
      .map(([name, v]) => ({ name, v, kg: Number(v?.[last] ?? 0), rate: Number(v?.[`${last}_per_kg`] ?? 0) }))
      .filter(r => r.kg > 0)
      .sort((a, b) => b.kg - a.kg)
      .slice(0, 25);
  }, [data, periods]);

  return (
    <div className="space-y-4">
      {/* controls */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold w-16">Compare</span>
            {([["week", "Week on week"], ["month", "Month on month"], ["quarter", "Quarter"],
               ["half", "Half year"], ["year", "Annual"]] as [Preset, string][]).map(([p, lbl]) => (
              <Badge key={p} variant={preset === p ? "default" : "outline"}
                     className="cursor-pointer font-normal"
                     onClick={() => { setPreset(p); setPeriods(buildPeriods(p, 3)); }}>
                {lbl}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold w-16">Periods</span>
            {periods.map(p => (
              <Badge key={p.key} variant="secondary" className="font-normal gap-1">
                {p.label}
                {periods.length > 1 && (
                  <X size={11} className="cursor-pointer opacity-60 hover:opacity-100"
                     onClick={() => setPeriods(periods.filter(x => x.key !== p.key))} />
                )}
              </Badge>
            ))}
            {periods.length < 6 && (
              <Badge variant="outline" className="cursor-pointer font-normal gap-1 border-dashed"
                     onClick={() => setPeriods(buildPeriods(preset, periods.length + 1))}>
                <Plus size={11} /> Add period
              </Badge>
            )}
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={exportSummary} disabled={!data}>
              <Download size={13} className="mr-1.5" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{error}</CardContent></Card>
      )}

      {loading && (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      )}

      {!loading && data && (
        <>
          {SECTIONS.map(sec => (
            <Card key={sec.title}>
              <CardContent className="p-0">
                <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {sec.title}
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[180px]">Metric</TableHead>
                        {periods.map(p => <TableHead key={p.key} className="text-right">{p.label}</TableHead>)}
                        {periods.length > 1 && <TableHead className="text-right">Change</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sec.metrics.map(m => {
                        const mv = movement(data.metrics, m, periods);
                        return (
                          <TableRow key={m.key}>
                            <TableCell className="text-muted-foreground">{m.label}</TableCell>
                            {periods.map(p => (
                              <TableCell key={p.key} className="text-right tabular-nums">
                                <button
                                  className="text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid"
                                  onClick={() => openDrill(m.key, m.label, p)}>
                                  {fmtVal(data.metrics?.[m.key]?.[p.key], m.fmt)}
                                </button>
                              </TableCell>
                            ))}
                            {periods.length > 1 && (
                              <TableCell className={`text-right tabular-nums font-medium ${
                                mv ? (mv.good ? "text-green-600" : "text-red-600") : "text-muted-foreground"}`}>
                                {mv?.text ?? "—"}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* problem lenses */}
          <Card>
            <CardContent className="p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                Problem lenses
              </div>
              <div className="flex flex-wrap gap-2">
                {LENSES.map(l => (
                  <Button key={l.key} variant="outline" size="sm"
                          disabled={periods.length < 2 && l.key !== "reps_underusing"}
                          onClick={() => openDrill(l.key, l.label, periods[periods.length - 1])}>
                    <l.icon size={13} className="mr-1.5" /> {l.label}
                  </Button>
                ))}
              </div>
              {periods.length < 2 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Add a second period to compare against.
                </p>
              )}
            </CardContent>
          </Card>

          {/* SKU movement */}
          {skuRows.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                  SKU movement — kilos shipped
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[180px]">SKU</TableHead>
                        {periods.map(p => <TableHead key={p.key} className="text-right">{p.label}</TableHead>)}
                        <TableHead className="text-right">₹/KG</TableHead>
                        <TableHead>Band</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {skuRows.map(r => (
                        <TableRow key={r.name}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          {periods.map(p => (
                            <TableCell key={p.key} className="text-right tabular-nums">
                              {fmtVal(r.v?.[p.key], "kg")}
                            </TableCell>
                          ))}
                          <TableCell className="text-right tabular-nums">{fmtVal(r.rate, "rate")}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`font-normal text-[10px] ${
                              r.rate < 250 ? "text-orange-700 border-orange-300" : "text-emerald-700 border-emerald-300"}`}>
                              {r.rate < 250 ? "Bulk / HORECA" : "Core & premium"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* drilldown */}
      <Dialog open={!!drill} onOpenChange={o => { if (!o) { setDrill(null); setDrillData(null); } }}>
        <DialogContent className="max-w-5xl max-h-[82vh]">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle>{drill?.label}</DialogTitle>
                <DialogDescription>
                  {drill?.period.label}
                  {drillData?.row_count != null && ` • ${drillData.row_count} row(s)`}
                  {drillData?.truncated && " • showing the first 1,000"}
                </DialogDescription>
              </div>
              <Button variant="outline" size="sm" onClick={exportDrill}
                      disabled={!drillData?.rows?.length}>
                <Download size={13} className="mr-1.5" /> Export CSV
              </Button>
            </div>
          </DialogHeader>
          {drillLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : drillData?.error ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{drillData.error}</p>
          ) : (
            <ScrollArea className="max-h-[62vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    {(drillData?.columns ?? []).map((c: any) => (
                      <TableHead key={c.key} className={c.align === "right" ? "text-right" : ""}>{c.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(drillData?.rows ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={(drillData?.columns ?? []).length || 1}
                                 className="text-center py-8 text-muted-foreground">
                        Nothing to show for this period
                      </TableCell>
                    </TableRow>
                  ) : (
                    (drillData.rows as any[]).map((row, i) => (
                      <TableRow key={i}>
                        {(drillData.columns as any[]).map(c => {
                          const raw = row[c.key];
                          const isNum = typeof raw === "number";
                          const looksMoney = /amount|value|pending|prev|curr|change/.test(c.key);
                          return (
                            <TableCell key={c.key}
                                       className={`${c.align === "right" ? "text-right tabular-nums" : ""} ${
                                         c.key === "change" && Number(raw) < 0 ? "text-red-600 font-medium" : ""}`}>
                              {raw === null || raw === undefined || raw === ""
                                ? "—"
                                : isNum && looksMoney
                                  ? `₹${Math.round(raw).toLocaleString("en-IN")}`
                                  : String(raw).length > 10 && /T\d\d:/.test(String(raw))
                                    ? format(new Date(String(raw)), "dd MMM yyyy")
                                    : String(raw)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
