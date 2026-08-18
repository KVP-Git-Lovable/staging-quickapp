import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, IndianRupee, ShoppingCart, Users, Package, TrendingUp,
  Download, Play, BarChart3, Calendar, Clock, MapPin, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchEventByRouteId } from "@/lib/eventLookup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { renderEventReportToPdfBlob } from "@/utils/renderEventReportPdf";
import type { EventReportAiInsights } from "@/components/invoice/EventReportPreview";

interface EventInfo {
  id: string;
  visit_id: string | null;
  event_name: string | null;
  activity_name: string | null;
  activity_type: string | null;
  activity_date: string;
  from_date: string | null;
  to_date: string | null;
  start_time: string | null;
  end_time: string | null;
  activity_place: string | null;
}

interface OrderRow {
  id: string;
  total_amount: number | null;
  retailer_id: string | null;
  retailer_name: string | null;
  counter_customer_id: string | null;
  order_date: string | null;
  created_at: string;
  status: string | null;
}

interface OrderItemRow {
  order_id: string;
  product_id: string | null;
  product_name: string | null;
  quantity: number | null;
  total: number | null;
  rate: number | null;
  original_rate: number | null;
}

const inr = (n: number) =>
  `₹ ${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const fmtDate = (iso: string) =>
  new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString([], {
    day: "2-digit", month: "short", year: "numeric",
  });

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function dayKey(d: string | null, granularity: "day" | "week" | "month") {
  if (!d) return "";
  const dt = new Date(d.length === 10 ? d + "T00:00:00" : d);
  if (granularity === "day") return dt.toISOString().slice(0, 10);
  if (granularity === "month") return dt.toISOString().slice(0, 7);
  // week — ISO week start (Monday)
  const day = (dt.getDay() + 6) % 7;
  const monday = new Date(dt);
  monday.setDate(dt.getDate() - day);
  return monday.toISOString().slice(0, 10);
}

export default function EventSummary() {
  const { id } = useParams<{ id: string }>(); // visit_id (matches existing event routes)
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [stockPriceMap, setStockPriceMap] = useState<Record<string, number>>({}); // product_id -> price, for margin proxy
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day");
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [showAllCustomers, setShowAllCustomers] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const ev = await fetchEventByRouteId(
          id,
          "id,visit_id,event_name,activity_name,activity_type,activity_date,from_date,to_date,start_time,end_time,activity_place"
        );
        if (!alive) return;
        if (!ev) { toast.error("Event not found"); setLoading(false); return; }
        setEvent(ev as EventInfo);

        // Deliberately NOT filtered by user: Summary is the team view, showing
        // what everyone working the event has taken. Keyed on the event's own
        // visit id so a participant opening it through their own visit still
        // sees the whole event.
        const { data: ordRows } = await supabase
          .from("orders")
          .select("id,total_amount,retailer_id,retailer_name,counter_customer_id,order_date,created_at,status,user_id")
          .eq("visit_id", (ev as any).visit_id ?? id)
          .neq("status", "cancelled")
          .order("created_at", { ascending: true });
        const ords = (ordRows || []) as OrderRow[];
        if (!alive) return;
        setOrders(ords);

        if (ords.length) {
          const ids = ords.map((o) => o.id);
          const { data: itemRows } = await supabase
            .from("order_items")
            .select("order_id,product_id,product_name,quantity,total,rate,original_rate")
            .in("order_id", ids);
          if (!alive) return;
          setItems((itemRows || []) as OrderItemRow[]);
        } else {
          setItems([]);
        }

        // Per-product price proxy for gross margin. Quantities come from the
        // real order_items (the authoritative sale record) below, not from
        // event_stock_items.sold_qty — that field is a separately-maintained
        // tally that can drift from what was actually ordered.
        const { data: dayRows } = await supabase
          .from("event_stock_days")
          .select("id")
          .eq("event_id", (ev as EventInfo).id);
        const dayIds = (dayRows || []).map((d: any) => d.id);
        if (dayIds.length) {
          const { data: stockRows } = await supabase
            .from("event_stock_items")
            .select("product_id,price")
            .in("event_stock_day_id", dayIds);
          const priceMap: Record<string, number> = {};
          (stockRows || []).forEach((r: any) => {
            if (r.product_id) priceMap[r.product_id] = Number(r.price) || 0;
          });
          setStockPriceMap(priceMap);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  // KPIs
  const kpis = useMemo(() => {
    const totalRevenue = orders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    const totalOrders = orders.length;
    const customers = new Set<string>();
    orders.forEach((o) => {
      const key = o.retailer_id || o.counter_customer_id || o.retailer_name || o.id;
      if (key) customers.add(String(key));
    });
    const itemsSold = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    // Cost basis: real quantities sold (order_items) x per-product stock price,
    // with the same 0.7 assumed-COGS factor used when no explicit cost is captured.
    const qtyByProduct: Record<string, number> = {};
    items.forEach((i: any) => {
      if (!i.product_id) return;
      qtyByProduct[i.product_id] = (qtyByProduct[i.product_id] || 0) + (Number(i.quantity) || 0);
    });
    const stockCost = Object.entries(qtyByProduct).reduce(
      (s, [pid, qty]) => s + qty * (stockPriceMap[pid] || 0) * 0.7,
      0,
    );
    const margin = totalRevenue > 0 ? ((totalRevenue - stockCost) / totalRevenue) * 100 : 0;
    return { totalRevenue, totalOrders, customers: customers.size, itemsSold, margin };
  }, [orders, items, stockPriceMap]);

  // Day-wise summary
  const dayWise = useMemo(() => {
    const map = new Map<string, { date: string; orders: number; items: number; revenue: number }>();
    orders.forEach((o) => {
      const dk = (o.order_date || o.created_at?.slice(0, 10)) || "";
      if (!dk) return;
      const cur = map.get(dk) || { date: dk, orders: 0, items: 0, revenue: 0 };
      cur.orders += 1;
      cur.revenue += Number(o.total_amount) || 0;
      map.set(dk, cur);
    });
    items.forEach((it) => {
      const ord = orders.find((o) => o.id === it.order_id);
      const dk = (ord?.order_date || ord?.created_at?.slice(0, 10)) || "";
      if (!dk) return;
      const cur = map.get(dk);
      if (cur) cur.items += Number(it.quantity) || 0;
    });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [orders, items]);

  // Revenue chart series (by granularity)
  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach((o) => {
      const k = dayKey(o.order_date || o.created_at, granularity);
      if (!k) return;
      map.set(k, (map.get(k) || 0) + (Number(o.total_amount) || 0));
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({ label: k, revenue: v }));
  }, [orders, granularity]);

  // Top products
  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    items.forEach((it) => {
      const key = (it.product_id || it.product_name || "unknown") as string;
      const cur = map.get(key) || { name: it.product_name || "Product", qty: 0, revenue: 0 };
      cur.qty += Number(it.quantity) || 0;
      cur.revenue += Number(it.total) || (Number(it.rate) || 0) * (Number(it.quantity) || 0);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
  }, [items]);

  // Top customers
  const topCustomers = useMemo(() => {
    const map = new Map<string, { name: string; orders: number; revenue: number }>();
    orders.forEach((o) => {
      const key = (o.retailer_id || o.counter_customer_id || o.retailer_name || "walkin") as string;
      const name = o.retailer_name || (o.counter_customer_id ? "Walk-in Customer" : "Customer");
      const cur = map.get(key) || { name, orders: 0, revenue: 0 };
      cur.orders += 1;
      cur.revenue += Number(o.total_amount) || 0;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [orders]);

  const isCompleted = useMemo(() => {
    if (!event) return false;
    if (event.end_time) return new Date(event.end_time).getTime() < Date.now();
    if (event.to_date) return new Date(event.to_date + "T23:59:59").getTime() < Date.now();
    return false;
  }, [event]);

  const handleDownload = async () => {
    if (!event || downloading) return;
    setDownloading(true);
    try {
      // Same company lookup pattern invoices use — single active company row.
      const { data: company } = await supabase
        .from("companies")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const eventPayload = {
        name: event.event_name || event.activity_name || "Event",
        place: event.activity_place || null,
        type: event.activity_type || null,
        date: event.from_date || event.activity_date || null,
        status: isCompleted ? "Completed" : "Active",
      };

      // AI summary is best-effort — a slow or failed AI call should never
      // block the report download, just ship without that section.
      let aiInsights: EventReportAiInsights | null = null;
      try {
        const { data: aiData, error: aiError } = await supabase.functions.invoke(
          "generate-event-summary-insights",
          { body: { event: eventPayload, kpis, dayWise, topProducts, topCustomers } }
        );
        if (!aiError && aiData?.insights) aiInsights = aiData.insights;
      } catch (aiErr) {
        console.error("Event report AI summary failed, continuing without it:", aiErr);
      }

      const dateLabel =
        fmtDate(event.from_date || event.activity_date) +
        (event.to_date && event.to_date !== event.from_date ? ` – ${fmtDate(event.to_date)}` : "");

      const blob = await renderEventReportToPdfBlob({
        company: company || {},
        event: {
          name: eventPayload.name,
          type: eventPayload.type || undefined,
          place: eventPayload.place || undefined,
          dateLabel,
          status: eventPayload.status as "Completed" | "Active",
        },
        kpis,
        dayWise,
        topProducts,
        topCustomers,
        aiInsights,
        generatedAt: new Date().toLocaleString([], {
          day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
        }),
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `event-report-${eventPayload.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch (err) {
      console.error("Failed to generate event report:", err);
      toast.error("Failed to generate report");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/20">
        <Navbar />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-muted/20">
        <Navbar />
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <p className="text-sm text-muted-foreground">Event not found.</p>
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>Go back</Button>
        </div>
      </div>
    );
  }

  const eventTitle = event.event_name || event.activity_name || "Event";
  const timeLabel = event.start_time ? fmtTime(event.start_time) : fmtDate(event.from_date || event.activity_date);

  return (
    <div className="min-h-screen bg-muted/20">
      <Navbar />
      {/* Top bar */}
      <div className="bg-background border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-semibold truncate">{eventTitle}</h1>
            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
              <Badge
                variant="outline"
                className={isCompleted ? "bg-muted text-muted-foreground" : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300"}
              >
                {isCompleted ? "Completed" : "Active"}
              </Badge>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeLabel}</span>
              {event.activity_type && (
                <Badge variant="outline" className="text-[10px]">{event.activity_type}</Badge>
              )}
              {event.activity_place && (
                <span className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3" />{event.activity_place}</span>
              )}
            </div>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleDownload} disabled={downloading}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">{downloading ? "Generating…" : "Download Report"}</span>
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        {/* Event overview compact card */}
        <Card className="rounded-2xl">
          <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-semibold text-sm">{eventTitle}</h2>
                <Badge variant="outline" className="text-[10px]">{event.activity_type || "Event"}</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(event.from_date || event.activity_date)}{event.to_date && event.to_date !== event.from_date ? ` → ${fmtDate(event.to_date)}` : ""}</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeLabel}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:min-w-[280px]">
              <div className="rounded-xl border bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Revenue</div>
                <div className="text-emerald-700 dark:text-emerald-400 font-semibold text-sm flex items-center gap-1"><IndianRupee className="h-3.5 w-3.5" />{kpis.totalRevenue.toLocaleString("en-IN")}</div>
              </div>
              <div className="rounded-xl border bg-sky-50/60 dark:bg-sky-950/20 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Orders</div>
                <div className="text-sky-700 dark:text-sky-400 font-semibold text-sm">{kpis.totalOrders}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button size="sm" className="h-8 text-xs gap-1" onClick={() => navigate(`/event/${id}/orders`)}>
                <Play className="h-3.5 w-3.5" /> Open Event
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => navigate(`/event/${id}/stock`)}>
                <Package className="h-3.5 w-3.5" /> Stock Tracker
              </Button>
              <Button size="sm" variant="secondary" className="h-8 text-xs gap-1" disabled>
                <BarChart3 className="h-3.5 w-3.5" /> View Summary
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="Total Revenue" value={inr(kpis.totalRevenue)} accent="emerald" Icon={IndianRupee} />
          <KpiCard label="Total Orders" value={String(kpis.totalOrders)} accent="sky" Icon={ShoppingCart} />
          <KpiCard label="Total Customers" value={String(kpis.customers)} accent="violet" Icon={Users} />
          <KpiCard label="Total Items Sold" value={String(kpis.itemsSold)} accent="amber" Icon={Package} />
          <KpiCard label="Gross Margin" value={`${kpis.margin.toFixed(1)}%`} accent="rose" Icon={TrendingUp} />
        </div>

        {/* Two-column section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Revenue Over Time */}
          <Card className="rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm">Revenue Over Time</CardTitle>
              <Select value={granularity} onValueChange={(v: any) => setGranularity(v)}>
                <SelectTrigger className="h-8 w-[110px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">By Day</SelectItem>
                  <SelectItem value="week">By Week</SelectItem>
                  <SelectItem value="month">By Month</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="pt-0">
              {chartData.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-xs text-muted-foreground">
                  No revenue yet.
                </div>
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} className="opacity-40" />
                      <XAxis dataKey="label" fontSize={11} tickMargin={6} />
                      <YAxis fontSize={11} width={48} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(v: any) => inr(Number(v))}
                        contentStyle={{ borderRadius: 8, fontSize: 12 }}
                      />
                      <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="url(#rev)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Day-wise summary */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Day-wise Summary</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left py-2 pr-2 font-medium">Day</th>
                    <th className="text-left py-2 px-2 font-medium">Date</th>
                    <th className="text-right py-2 px-2 font-medium">Orders</th>
                    <th className="text-right py-2 px-2 font-medium">Items Sold</th>
                    <th className="text-right py-2 pl-2 font-medium">Revenue (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {dayWise.length === 0 ? (
                    <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No orders yet.</td></tr>
                  ) : dayWise.map((r, idx) => (
                    <tr key={r.date} className="border-b last:border-0">
                      <td className="py-2 pr-2">Day {idx + 1}</td>
                      <td className="py-2 px-2">{fmtDate(r.date)}</td>
                      <td className="py-2 px-2 text-right">{r.orders}</td>
                      <td className="py-2 px-2 text-right">{r.items}</td>
                      <td className="py-2 pl-2 text-right">{r.revenue.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                  {dayWise.length > 0 && (
                    <tr className="font-semibold">
                      <td className="py-2 pr-2">Total</td>
                      <td className="py-2 px-2">—</td>
                      <td className="py-2 px-2 text-right">{dayWise.reduce((s, r) => s + r.orders, 0)}</td>
                      <td className="py-2 px-2 text-right">{dayWise.reduce((s, r) => s + r.items, 0)}</td>
                      <td className="py-2 pl-2 text-right text-emerald-700 dark:text-emerald-400">
                        {dayWise.reduce((s, r) => s + r.revenue, 0).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Top Selling Products */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Top Selling Products</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left py-2 pr-2 font-medium w-8">#</th>
                    <th className="text-left py-2 px-2 font-medium">Product</th>
                    <th className="text-right py-2 px-2 font-medium">Qty Sold</th>
                    <th className="text-right py-2 pl-2 font-medium">Revenue (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.length === 0 ? (
                    <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No products sold yet.</td></tr>
                  ) : (showAllProducts ? topProducts : topProducts.slice(0, 5)).map((p, i) => (
                    <tr key={p.name + i} className="border-b last:border-0">
                      <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 px-2 truncate">{p.name}</td>
                      <td className="py-2 px-2 text-right">{p.qty}</td>
                      <td className="py-2 pl-2 text-right">{p.revenue.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {topProducts.length > 5 && (
                <div className="text-center pt-2">
                  <Button variant="link" size="sm" className="text-xs h-7" onClick={() => setShowAllProducts((v) => !v)}>
                    {showAllProducts ? "Show Top 5" : "View All Products"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Customers */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Top Customers</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left py-2 pr-2 font-medium w-8">#</th>
                    <th className="text-left py-2 px-2 font-medium">Customer</th>
                    <th className="text-right py-2 px-2 font-medium">Orders</th>
                    <th className="text-right py-2 pl-2 font-medium">Revenue (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {topCustomers.length === 0 ? (
                    <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No customers yet.</td></tr>
                  ) : (showAllCustomers ? topCustomers : topCustomers.slice(0, 5)).map((c, i) => (
                    <tr key={c.name + i} className="border-b last:border-0">
                      <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 px-2 truncate">{c.name}</td>
                      <td className="py-2 px-2 text-right">{c.orders}</td>
                      <td className="py-2 pl-2 text-right">{c.revenue.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {topCustomers.length > 5 && (
                <div className="text-center pt-2">
                  <Button variant="link" size="sm" className="text-xs h-7" onClick={() => setShowAllCustomers((v) => !v)}>
                    {showAllCustomers ? "Show Top 5" : "View All Customers"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label, value, accent, Icon,
}: {
  label: string;
  value: string;
  accent: "emerald" | "sky" | "violet" | "amber" | "rose";
  Icon: any;
}) {
  const accentMap: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    sky: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    rose: "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  };
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">{label}</div>
          <div className="font-semibold text-sm truncate">{value}</div>
        </div>
        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${accentMap[accent]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}