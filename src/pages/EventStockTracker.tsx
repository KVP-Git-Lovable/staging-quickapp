import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { ArrowLeft, Plus, Loader2, Trash2, Package, IndianRupee, MapPin, Calendar, Save, Search, ChevronDown, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchEventByRouteId } from "@/lib/eventLookup";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import LineItemUomSelect, { type LineItemUomSelection } from "@/components/uom/LineItemUomSelect";
import UomLabel from "@/components/uom/UomLabel";

interface EventInfo {
  id: string;
  event_name: string;
  activity_name: string | null;
  activity_date: string;
  from_date: string | null;
  to_date: string | null;
  total_days: number | null;
  activity_place: string | null;
}

interface DayRow { id: string; day_number: number; date: string; }

interface Product {
  id: string;
  name: string;
  sku: string | null;
  rate: number | null;
  base_unit: string | null;
}

type RowState = "idle" | "saving" | "saved" | "error";

interface StockItem {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  unit: string;
  stock_taken: number;
  sold_qty: number;
  price: number;
  updated_at: string;
  state: RowState;
  error?: string;
}

interface DraftRow {
  key: string;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  unit: string;
  stock_taken: string;
  sold_qty: string;
  price: number;
  // UOM-master snapshot for the selected unit (mirrors order entry).
  conversion_to_base?: number | null;
  price_basis_conversion?: number | null;
}

// Price for 1 selected unit = price-basis rate × (selected conversion / price-basis conversion).
const uomUnitPrice = (baseRate: number, sel: LineItemUomSelection) => {
  const factor =
    sel.conversionToBase && sel.priceBasisConversionToBase
      ? sel.conversionToBase / sel.priceBasisConversionToBase
      : 1;
  return +(baseRate * factor).toFixed(2);
};

function buildDays(ev: EventInfo) {
  const start = ev.from_date || ev.activity_date;
  const end = ev.to_date || ev.activity_date;
  const out: { day_number: number; date: string }[] = [];
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  let i = 1;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push({ day_number: i++, date: d.toISOString().slice(0, 10) });
  }
  return out;
}

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const newDraft = (): DraftRow => ({
  key: Math.random().toString(36).slice(2),
  product_id: null,
  product_name: "",
  product_sku: null,
  unit: "",
  stock_taken: "",
  sold_qty: "",
  price: 0,
});

export default function EventStockTracker() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [days, setDays] = useState<DayRow[]>([]);
  const [activeDayId, setActiveDayId] = useState<string>("");
  const [items, setItems] = useState<StockItem[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([newDraft()]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const debounceMap = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Load event + ensure days
  useEffect(() => {
    (async () => {
      if (!id || !user?.id) return;
      setLoading(true);
      const evData = await fetchEventByRouteId(
        id,
        "id,visit_id,event_name,activity_name,activity_date,from_date,to_date,total_days,activity_place"
      );
      if (!evData) { toast.error("Event not found"); setLoading(false); return; }
      const ev = evData as EventInfo;
      setEvent(ev);

      const { data: existing } = await supabase
        .from("event_stock_days")
        .select("id,day_number,date")
        .eq("event_id", ev.id)
        .order("day_number");
      let dayRows: DayRow[] = (existing as DayRow[]) || [];
      const expected = buildDays(ev);
      const missing = expected.filter((d) => !dayRows.find((r) => r.day_number === d.day_number));
      if (missing.length) {
        const { data: created } = await supabase
          .from("event_stock_days")
          .insert(missing.map((m) => ({
            event_id: ev.id, user_id: user.id, day_number: m.day_number, date: m.date,
          })))
          .select("id,day_number,date");
        if (created) dayRows = [...dayRows, ...(created as DayRow[])];
      }
      dayRows.sort((a, b) => a.day_number - b.day_number);
      // Pick today if matches, else first
      const today = new Date().toISOString().slice(0, 10);
      const todayRow = dayRows.find((d) => d.date === today);
      setDays(dayRows);
      setActiveDayId((todayRow || dayRows[0])?.id || "");
      setLoading(false);
    })();
  }, [id, user?.id]);

  // Load products — same source and filter as order entry (products master:
  // is_active true or null; there is no `unit` column, units live in the UOM master).
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,sku,rate,base_unit")
        .or("is_active.eq.true,is_active.is.null")
        .order("name")
        .limit(1000);
      if (error) console.error("[EventStockTracker] products load failed:", error.message);
      setProducts((data as Product[]) || []);
    })();
  }, []);

  const loadItems = useCallback(async (dayId: string) => {
    if (!dayId) return;
    const { data } = await supabase
      .from("event_stock_items")
      .select("id,product_id,unit,stock_taken,sold_qty,price,updated_at,products(name,sku,base_unit)")
      .eq("event_stock_day_id", dayId)
      .order("created_at");
    const mapped: StockItem[] = (data || []).map((r: any) => ({
      id: r.id,
      product_id: r.product_id,
      product_name: r.products?.name || "Product",
      product_sku: r.products?.sku || null,
      unit: r.unit || "",
      stock_taken: Number(r.stock_taken) || 0,
      sold_qty: Number(r.sold_qty) || 0,
      price: Number(r.price) || 0,
      updated_at: r.updated_at,
      state: "idle",
    }));
    setItems(mapped);
    setDrafts([newDraft()]);
  }, []);

  useEffect(() => { if (activeDayId) loadItems(activeDayId); }, [activeDayId, loadItems]);

  // Real-time sync: refresh items when event stock changes (orders submitted, etc.)
  useEffect(() => {
    if (!activeDayId) return;
    const handler = () => loadItems(activeDayId);
    window.addEventListener("event-stock:changed", handler);
    const channel = supabase
      .channel(`event-stock-items-${activeDayId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_stock_items", filter: `event_stock_day_id=eq.${activeDayId}` },
        () => loadItems(activeDayId)
      )
      .subscribe();
    return () => {
      window.removeEventListener("event-stock:changed", handler);
      supabase.removeChannel(channel);
    };
  }, [activeDayId, loadItems]);

  // KPIs
  const kpis = useMemo(() => {
    const taken = items.reduce((s, i) => s + i.stock_taken, 0);
    const sold = items.reduce((s, i) => s + i.sold_qty, 0);
    return { taken, sold, remaining: taken - sold, value: items.reduce((s, i) => s + i.sold_qty * i.price, 0) };
  }, [items]);

  // Persist single field (debounced)
  const persistField = (itemId: string, patch: Partial<Pick<StockItem, "stock_taken" | "sold_qty">>) => {
    setItems((prev) => prev.map((it) => it.id === itemId ? { ...it, state: "saving" } : it));
    if (debounceMap.current[itemId]) clearTimeout(debounceMap.current[itemId]);
    debounceMap.current[itemId] = setTimeout(async () => {
      const { data, error } = await supabase
        .from("event_stock_items")
        .update(patch)
        .eq("id", itemId)
        .select("updated_at")
        .single();
      if (error) {
        setItems((prev) => prev.map((it) => it.id === itemId ? { ...it, state: "error", error: error.message } : it));
        toast.error(error.message);
        return;
      }
      setItems((prev) => prev.map((it) => it.id === itemId
        ? { ...it, state: "saved", updated_at: data?.updated_at || new Date().toISOString() }
        : it));
      setTimeout(() => {
        setItems((prev) => prev.map((it) => it.id === itemId && it.state === "saved" ? { ...it, state: "idle" } : it));
      }, 1500);
    }, 500);
  };

  const updateField = (itemId: string, field: "stock_taken" | "sold_qty", raw: string) => {
    const num = Math.max(0, Number(raw) || 0);
    setItems((prev) => prev.map((it) => {
      if (it.id !== itemId) return it;
      const next = { ...it, [field]: num } as StockItem;
      if (field === "sold_qty" && num > next.stock_taken) {
        return { ...it, sold_qty: num, state: "error", error: "Sold cannot exceed Stock Taken" };
      }
      if (field === "stock_taken" && it.sold_qty > num) {
        return { ...next, state: "error", error: "Stock Taken cannot be less than Sold" };
      }
      return { ...next, error: undefined };
    }));
    // Validate before persisting
    const cur = items.find((i) => i.id === itemId);
    if (!cur) return;
    const projected = { ...cur, [field]: num } as StockItem;
    if (projected.sold_qty > projected.stock_taken) return;
    persistField(itemId, { [field]: num });
  };

  const removeItem = async (itemId: string) => {
    await supabase.from("event_stock_items").delete().eq("id", itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    toast.success("Removed");
  };

  // Drafts
  const updateDraft = (key: string, patch: Partial<DraftRow>) => {
    setDrafts((prev) => prev.map((d) => d.key === key ? { ...d, ...patch } : d));
  };
  const addDraftRow = () => setDrafts((prev) => [...prev, newDraft()]);

  // UOM conversion factors (code → conversion_to_base) for one product.
  const fetchConvFactors = async (productId: string, codes: string[]) => {
    const { data } = await supabase
      .from("product_uom_mapping")
      .select("conversion_to_base, uom_master(code)")
      .eq("product_id", productId)
      .neq("is_active", false);
    const map: Record<string, number> = {};
    (data || []).forEach((r: any) => {
      const code = (r.uom_master?.code || "").toLowerCase();
      if (code && codes.some((c) => c.toLowerCase() === code)) {
        map[code] = Number(r.conversion_to_base) || 0;
      }
    });
    return map;
  };

  const saveDrafts = async () => {
    const valid = drafts.filter((d) => d.product_id && Number(d.stock_taken) > 0);
    if (!valid.length) {
      toast.error("Add at least one product with stock");
      return;
    }
    for (const d of valid) {
      const taken = Number(d.stock_taken) || 0;

      // Orders may already have auto-created this product's row (sold_qty is
      // being counted by the order trigger). Merge the entered Stock Taken
      // onto it instead of rejecting the save — never overwrite sold_qty.
      const existing = items.find((i) => i.product_id === d.product_id);
      if (existing) {
        let sold = existing.sold_qty;
        let unit = existing.unit || d.unit || "";
        if (d.unit && existing.unit && d.unit.toLowerCase() !== existing.unit.toLowerCase()) {
          // Move the row to the unit chosen here, converting the auto-counted
          // sold quantity so Remaining stays comparable.
          const factors = await fetchConvFactors(d.product_id!, [existing.unit, d.unit]);
          const from = factors[existing.unit.toLowerCase()];
          const to = factors[d.unit.toLowerCase()];
          if (from && to) {
            sold = +((sold * from) / to).toFixed(3);
            unit = d.unit;
          } else {
            toast.message(`${d.product_name}: kept unit ${existing.unit} (no conversion found)`);
          }
        }
        const { data, error } = await supabase
          .from("event_stock_items")
          .update({
            stock_taken: taken,
            sold_qty: sold,
            unit: unit || null,
            price: d.price || existing.price,
          })
          .eq("id", existing.id)
          .select("updated_at")
          .single();
        if (error) { toast.error(error.message); continue; }
        setItems((prev) => prev.map((it) => it.id === existing.id
          ? { ...it, stock_taken: taken, sold_qty: sold, unit, price: d.price || existing.price, updated_at: data?.updated_at || it.updated_at, state: "saved" }
          : it));
        continue;
      }

      const sold = Math.min(Number(d.sold_qty) || 0, taken);
      const { data, error } = await supabase
        .from("event_stock_items")
        .insert({
          event_stock_day_id: activeDayId,
          product_id: d.product_id!,
          unit: d.unit || null,
          stock_taken: taken,
          sold_qty: sold,
          price: d.price,
        })
        .select("id,updated_at")
        .single();
      if (error) { toast.error(error.message); continue; }
      setItems((prev) => [...prev, {
        id: data.id,
        product_id: d.product_id!,
        product_name: d.product_name,
        product_sku: d.product_sku,
        unit: d.unit,
        stock_taken: taken,
        sold_qty: sold,
        price: d.price,
        updated_at: data.updated_at,
        state: "saved",
      }]);
    }
    setDrafts([newDraft()]);
    toast.success("Stock saved");
  };

  if (loading || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const dateRangeLabel = event.from_date && event.to_date
    ? `${fmtDate(event.from_date)} – ${fmtDate(event.to_date)}`
    : fmtDate(event.activity_date);

  const usedProductIds = new Set([
    ...items.map((i) => i.product_id),
    ...drafts.map((d) => d.product_id).filter(Boolean) as string[],
  ]);

  return (
    <div className="min-h-screen bg-muted/30">
      <Navbar />
      <div className="p-3 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" className="p-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-xl sm:text-2xl font-bold">Event Stock Tracking</h1>
          <p className="text-sm text-muted-foreground">Track stock flow for this event</p>
        </div>
        <Button variant="outline" onClick={() => setSummaryOpen(true)} className="gap-2">
          <Save className="h-4 w-4" />
          View All Days Summary
        </Button>
        <Button onClick={saveDrafts} className="gap-2">
          <Save className="h-4 w-4" />
          Save Stock
        </Button>
      </div>

      {/* Event Info Bar */}
      <Card className="rounded-2xl">
        <CardContent className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="font-semibold text-base">
            {event.event_name || event.activity_name || "Event"}
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {dateRangeLabel}
          </div>
          {event.activity_place && (
            <div className="text-sm text-muted-foreground flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {event.activity_place}
            </div>
          )}
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">Ongoing</Badge>
        </CardContent>
      </Card>

      {/* Day Tabs */}
      {days.length > 1 && (
        <Tabs value={activeDayId} onValueChange={setActiveDayId}>
          <TabsList className="flex flex-wrap h-auto">
            {days.map((d) => (
              <TabsTrigger key={d.id} value={d.id} className="text-xs">
                Day {d.day_number} ({fmtDate(d.date)})
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Stock Taken" value={`${kpis.taken}`} suffix="Units" iconBg="bg-sky-100 text-sky-700" icon={<Package className="h-4 w-4" />} />
        <KpiCard label="Total Sold" value={`${kpis.sold}`} suffix="Units" iconBg="bg-amber-100 text-amber-700" icon={<Package className="h-4 w-4" />} />
        <KpiCard label="Remaining" value={`${kpis.remaining}`} suffix="Units" iconBg="bg-emerald-100 text-emerald-700" icon={<Package className="h-4 w-4" />} valueClass="text-emerald-700" />
        <KpiCard label="Sold Value" value={inr(kpis.value)} iconBg="bg-violet-100 text-violet-700" icon={<IndianRupee className="h-4 w-4" />} valueClass="text-violet-700" />
      </div>

      {/* Inline Entry Section */}
      <Card className="rounded-2xl">
        <CardContent className="p-4 space-y-3">
          <div className="hidden md:grid grid-cols-[2fr,1fr,1fr] gap-3 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            <div>Product</div>
            <div>Unit</div>
            <div>Stock Taken</div>
          </div>
          {drafts.map((d) => {
            const mobileLabel = "md:hidden text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block";
            return (
              <div
                key={d.key}
                className="rounded-xl border border-border p-3 space-y-2.5 md:rounded-none md:border-0 md:p-0 md:space-y-0 md:grid md:grid-cols-[2fr,1fr,1fr] md:gap-3 md:items-center"
              >
                <div>
                  <span className={mobileLabel}>Product</span>
                  <ProductPicker
                    products={products}
                    excludeIds={usedProductIds}
                    selectedName={d.product_name}
                    onSelect={(p) => updateDraft(d.key, {
                      product_id: p.id,
                      product_name: p.name,
                      product_sku: p.sku,
                      // Unit comes from the UOM master via LineItemUomSelect — never
                      // from the legacy products.base_unit text column.
                      unit: "",
                      price: Number(p.rate) || 0,
                      conversion_to_base: null,
                      price_basis_conversion: null,
                    })}
                  />
                </div>
                <div>
                  <span className={mobileLabel}>Unit</span>
                  {d.product_id ? (
                    <LineItemUomSelect
                      productId={d.product_id}
                      value={d.unit || undefined}
                      context="sales"
                      hideWhenSingle={false}
                      className="h-10 w-full"
                      onChange={(sel) => {
                        if (
                          d.unit === sel.uomCode &&
                          (d.conversion_to_base ?? null) === (sel.conversionToBase ?? null) &&
                          (d.price_basis_conversion ?? null) === (sel.priceBasisConversionToBase ?? null)
                        ) {
                          return;
                        }
                        const prod = products.find((p) => p.id === d.product_id);
                        const patch: Partial<DraftRow> = {
                          unit: sel.uomCode,
                          conversion_to_base: sel.conversionToBase ?? null,
                          price_basis_conversion: sel.priceBasisConversionToBase ?? null,
                        };
                        if (prod) patch.price = uomUnitPrice(Number(prod.rate) || 0, sel);
                        // Convert already-entered quantities between mapped units (12 PIECE → BOX).
                        if (d.conversion_to_base && sel.conversionToBase && d.unit && d.unit !== sel.uomCode) {
                          const conv = (v: string) => {
                            const n = Number(v);
                            if (!n || n <= 0) return v;
                            return String(+((n * d.conversion_to_base!) / sel.conversionToBase).toFixed(3));
                          };
                          patch.stock_taken = conv(d.stock_taken);
                        }
                        updateDraft(d.key, patch);
                      }}
                    />
                  ) : (
                    <div className="h-10 flex items-center text-xs text-muted-foreground">—</div>
                  )}
                </div>
                <div>
                  <span className={mobileLabel}>Stock Taken</span>
                  <Input type="number" min={0} placeholder="Enter qty"
                    value={d.stock_taken}
                    onChange={(e) => updateDraft(d.key, { stock_taken: e.target.value })}
                    className="h-10" />
                </div>
              </div>
            );
          })}
          <button
            onClick={addDraftRow}
            className="w-full border-2 border-dashed border-border rounded-xl py-3 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition flex items-center justify-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Add Row
          </button>
        </CardContent>
      </Card>

      {/* Saved Items — cards on mobile */}
      <Card className="rounded-2xl overflow-hidden md:hidden">
        {items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No saved entries yet. Add rows above and tap "Save Stock".
          </div>
        ) : (
          <div className="divide-y">
            {items.map((it, idx) => {
              const remaining = it.stock_taken - it.sold_qty;
              const value = it.sold_qty * it.price;
              return (
                <div
                  key={it.id}
                  className={cn(
                    "p-3 space-y-2.5 transition-colors",
                    it.state === "saving" && "bg-amber-50/40",
                    it.state === "saved" && "bg-emerald-50/40"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-snug">
                        <span className="text-muted-foreground mr-1.5">{idx + 1}.</span>
                        {it.product_name}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                        {it.product_sku && <span>SKU: {it.product_sku}</span>}
                        <UomLabel productId={it.product_id} snapshotCode={it.unit || null} />
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="p-2 -mr-1 text-rose-500 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                      onClick={() => removeItem(it.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">Stock Taken</span>
                      <Input type="number" min={0} value={it.stock_taken}
                        onChange={(e) => updateField(it.id, "stock_taken", e.target.value)}
                        className="h-10" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">Sold</span>
                      <Input type="number" min={0} max={it.stock_taken} value={it.sold_qty}
                        onChange={(e) => updateField(it.id, "sold_qty", e.target.value)}
                        className={cn("h-10", it.error && "border-rose-400 focus-visible:ring-rose-300")} />
                    </div>
                  </div>
                  {it.error && (
                    <div className="text-[11px] text-rose-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {it.error}
                    </div>
                  )}
                  <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
                    <span>
                      Remaining: <span className="font-semibold text-emerald-700">{remaining}</span>
                    </span>
                    <span className="font-semibold">{inr(value)}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    {it.state === "saving" && (<><Loader2 className="h-3 w-3 animate-spin" /> Updating…</>)}
                    {it.state === "saved" && (<><CheckCircle2 className="h-3 w-3 text-emerald-600" /> Saved</>)}
                    {it.state === "error" && (<><AlertCircle className="h-3 w-3 text-rose-600" /> Error</>)}
                    {it.state === "idle" && <>Updated {fmtTime(it.updated_at)}</>}
                  </div>
                </div>
              );
            })}
            <div className="p-3 flex items-center justify-between bg-muted/40 text-sm font-semibold">
              <span>Total · {kpis.taken} taken · {kpis.sold} sold</span>
              <span className="text-emerald-700">{kpis.remaining} left · {inr(kpis.value)}</span>
            </div>
          </div>
        )}
      </Card>

      {/* Saved Items Table — desktop */}
      <Card className="rounded-2xl overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-3 w-10">#</th>
                <th className="px-3 py-3">Product</th>
                <th className="px-3 py-3 w-24">Unit</th>
                <th className="px-3 py-3 w-32">Stock Taken</th>
                <th className="px-3 py-3 w-32">Sold</th>
                <th className="px-3 py-3 w-24 text-right">Remaining</th>
                <th className="px-3 py-3 w-32 text-right">Sold Value</th>
                <th className="px-3 py-3 w-32">Last Updated</th>
                <th className="px-3 py-3 w-12">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                    No saved entries yet. Add rows above and click "Save Stock".
                  </td>
                </tr>
              ) : items.map((it, idx) => {
                const remaining = it.stock_taken - it.sold_qty;
                const value = it.sold_qty * it.price;
                return (
                  <tr key={it.id} className={cn("border-t transition-colors", it.state === "saving" && "bg-amber-50/40", it.state === "saved" && "bg-emerald-50/40")}>
                    <td className="px-3 py-3 text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{it.product_name}</div>
                      {it.product_sku && <div className="text-xs text-muted-foreground">SKU: {it.product_sku}</div>}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      <UomLabel productId={it.product_id} snapshotCode={it.unit || null} />
                    </td>
                    <td className="px-3 py-3">
                      <Input type="number" min={0} value={it.stock_taken}
                        onChange={(e) => updateField(it.id, "stock_taken", e.target.value)}
                        className="h-9" />
                    </td>
                    <td className="px-3 py-3">
                      <Input type="number" min={0} max={it.stock_taken} value={it.sold_qty}
                        onChange={(e) => updateField(it.id, "sold_qty", e.target.value)}
                        className={cn("h-9", it.error && "border-rose-400 focus-visible:ring-rose-300")} />
                      {it.error && (
                        <div className="text-[11px] text-rose-600 flex items-center gap-1 mt-1">
                          <AlertCircle className="h-3 w-3" /> {it.error}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-emerald-700">{remaining}</td>
                    <td className="px-3 py-3 text-right font-medium">{inr(value)}</td>
                    <td className="px-3 py-3">
                      <div className="text-xs">{fmtTime(it.updated_at)}</div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                        {it.state === "saving" && (<><Loader2 className="h-3 w-3 animate-spin" /> Updating…</>)}
                        {it.state === "saved" && (<><CheckCircle2 className="h-3 w-3 text-emerald-600" /> Saved</>)}
                        {it.state === "error" && (<><AlertCircle className="h-3 w-3 text-rose-600" /> Error</>)}
                        {it.state === "idle" && "—"}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Button variant="ghost" size="sm" className="p-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                        onClick={() => removeItem(it.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {items.length > 0 && (
              <tfoot className="bg-muted/40 font-semibold">
                <tr className="border-t">
                  <td className="px-3 py-3" colSpan={3}>Total</td>
                  <td className="px-3 py-3">{kpis.taken}</td>
                  <td className="px-3 py-3">{kpis.sold}</td>
                  <td className="px-3 py-3 text-right text-emerald-700">{kpis.remaining}</td>
                  <td className="px-3 py-3 text-right">{inr(kpis.value)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <AlertCircle className="h-3.5 w-3.5" />
        "Sold" updates automatically as event orders are submitted; you can still adjust it manually. Remaining and Sold Value are calculated automatically.
      </div>

      <AllDaysSummaryDialog open={summaryOpen} onOpenChange={setSummaryOpen} eventId={event.id} days={days} />
    </div>
  </div>
);
}

function KpiCard({ label, value, suffix, iconBg, icon, valueClass }: {
  label: string; value: string; suffix?: string; iconBg: string; icon: React.ReactNode; valueClass?: string;
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <div className={cn("h-7 w-7 rounded-md flex items-center justify-center", iconBg)}>{icon}</div>
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <div className={cn("text-2xl font-bold", valueClass)}>{value}</div>
          {suffix && <div className="text-xs text-muted-foreground">{suffix}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function ProductPicker({ products, excludeIds, selectedName, onSelect }: {
  products: Product[]; excludeIds: Set<string>; selectedName: string;
  onSelect: (p: Product) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => !excludeIds.has(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q))
      .slice(0, 50);
  }, [products, excludeIds, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between h-10 font-normal text-left">
          <span className="flex items-center gap-2 truncate">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className={cn("truncate", !selectedName && "text-muted-foreground")}>
              {selectedName || "Search product by name, SKU or scan..."}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <div className="p-2 border-b">
          <Input autoFocus placeholder="Search products..." value={search}
            onChange={(e) => setSearch(e.target.value)} className="h-9" />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No products</div>
          ) : filtered.map((p) => (
            <button key={p.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
              onClick={() => { onSelect(p); setOpen(false); setSearch(""); }}>
              <div className="font-medium">{p.name}</div>
              {p.sku && <div className="text-xs text-muted-foreground">SKU: {p.sku}</div>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AllDaysSummaryDialog({ open, onOpenChange, eventId, days }: {
  open: boolean; onOpenChange: (o: boolean) => void; eventId: string; days: DayRow[];
}) {
  const [rows, setRows] = useState<{ day: DayRow; taken: number; sold: number; value: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const dayIds = days.map((d) => d.id);
      const { data } = await supabase
        .from("event_stock_items")
        .select("event_stock_day_id,stock_taken,sold_qty,price")
        .in("event_stock_day_id", dayIds);
      const acc: Record<string, { taken: number; sold: number; value: number }> = {};
      (data || []).forEach((r: any) => {
        const k = r.event_stock_day_id;
        if (!acc[k]) acc[k] = { taken: 0, sold: 0, value: 0 };
        acc[k].taken += Number(r.stock_taken) || 0;
        acc[k].sold += Number(r.sold_qty) || 0;
        acc[k].value += (Number(r.sold_qty) || 0) * (Number(r.price) || 0);
      });
      setRows(days.map((d) => ({ day: d, ...(acc[d.id] || { taken: 0, sold: 0, value: 0 }) })));
      setLoading(false);
    })();
  }, [open, days, eventId]);

  const totals = rows.reduce((a, r) => ({ taken: a.taken + r.taken, sold: a.sold + r.sold, value: a.value + r.value }), { taken: 0, sold: 0, value: 0 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>All Days Summary</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2">Day</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Stock Taken</th>
                  <th className="px-3 py-2 text-right">Sold</th>
                  <th className="px-3 py-2 text-right">Remaining</th>
                  <th className="px-3 py-2 text-right">Sold Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.day.id} className="border-t">
                    <td className="px-3 py-2">Day {r.day.day_number}</td>
                    <td className="px-3 py-2">{fmtDate(r.day.date)}</td>
                    <td className="px-3 py-2 text-right">{r.taken}</td>
                    <td className="px-3 py-2 text-right">{r.sold}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{r.taken - r.sold}</td>
                    <td className="px-3 py-2 text-right">{inr(r.value)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/40 font-semibold">
                <tr className="border-t">
                  <td className="px-3 py-2" colSpan={2}>Total</td>
                  <td className="px-3 py-2 text-right">{totals.taken}</td>
                  <td className="px-3 py-2 text-right">{totals.sold}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{totals.taken - totals.sold}</td>
                  <td className="px-3 py-2 text-right">{inr(totals.value)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
