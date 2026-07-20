import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, Search, Users, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadCSV } from "@/utils/fileDownloader";

export interface RawOrder {
  id?: string;
  status?: string | null;
  replaced_by_order_id?: string | null;
  retailer_id?: string | null;
  retailer_name?: string | null;
  beat_name?: string | null;
  total_amount?: number | string | null;
  payment_method?: string | null;
  is_credit_order?: boolean | null;
  order_items?: Array<{
    product_name?: string | null;
    quantity?: number | string | null;
    unit?: string | null;
    rate?: number | string | null;
    total?: number | string | null;
  }> | null;
  items?: any;
}

interface RetailerAgg {
  retailerId: string;
  name: string;
  beat: string;
  orderCount: number;
  totalValue: number;
  hasCredit: boolean;
  hasCash: boolean;
  items: Map<
    string,
    { product: string; unit: string; qty: number; rate: number; amount: number }
  >;
}

interface Props {
  orders: RawOrder[];
  loading?: boolean;
  dateISO: string; // yyyy-MM-dd
  retailerBeatMap?: Map<string, string>;
}

type SortMode = "value" | "orders" | "beat";

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const fmtQty = (q: number) => {
  if (!Number.isFinite(q)) return "0";
  if (Number.isInteger(q)) return String(q);
  return q.toFixed(2).replace(/\.?0+$/, "");
};

const isCreditOrder = (o: RawOrder) => {
  const pm = (o.payment_method || "").toLowerCase();
  if (o.is_credit_order) return true;
  return pm === "credit";
};

export const RetailersDrilldown = ({
  orders,
  loading,
  dateISO,
  retailerBeatMap,
}: Props) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("value");

  const retailers = useMemo<RetailerAgg[]>(() => {
    const active = (orders || []).filter(
      (o) => (o.status || "").toLowerCase() !== "replaced" && !o.replaced_by_order_id,
    );
    const map = new Map<string, RetailerAgg>();
    for (const o of active) {
      const key = o.retailer_id || o.retailer_name || "unknown";
      const name = o.retailer_name || "Unknown retailer";
      const beat =
        o.beat_name ||
        (o.retailer_id && retailerBeatMap?.get(o.retailer_id)) ||
        "—";
      let agg = map.get(key);
      if (!agg) {
        agg = {
          retailerId: key,
          name,
          beat,
          orderCount: 0,
          totalValue: 0,
          hasCredit: false,
          hasCash: false,
          items: new Map(),
        };
        map.set(key, agg);
      }
      agg.orderCount += 1;
      agg.totalValue += num(o.total_amount);
      if (isCreditOrder(o)) agg.hasCredit = true;
      else agg.hasCash = true;

      for (const item of o.order_items || []) {
        const product = (item.product_name || "").trim() || "Unknown item";
        const unit = (item.unit || "").trim() || "Pcs";
        const k = `${product}|${unit.toLowerCase()}`;
        const cur = agg.items.get(k) || { product, unit, qty: 0, rate: 0, amount: 0 };
        cur.qty += num(item.quantity);
        cur.amount += num(item.total);
        cur.rate = num(item.rate) || cur.rate;
        agg.items.set(k, cur);
      }
    }
    return Array.from(map.values());
  }, [orders, retailerBeatMap]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const list = s
      ? retailers.filter((r) => r.name.toLowerCase().includes(s))
      : retailers.slice();
    list.sort((a, b) => {
      if (sortMode === "orders") return b.orderCount - a.orderCount;
      if (sortMode === "beat") return a.beat.localeCompare(b.beat);
      return b.totalValue - a.totalValue;
    });
    return list;
  }, [retailers, search, sortMode]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCSV = () => {
    const rows: string[] = [];
    const esc = (v: any) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    rows.push(
      ["Retailer", "Beat", "Payment", "Item", "Qty", "Unit", "Rate", "Amount"]
        .map(esc)
        .join(","),
    );
    for (const r of filtered) {
      const payment = r.hasCredit && r.hasCash ? "Mixed" : r.hasCredit ? "Credit" : "Cash";
      for (const it of r.items.values()) {
        rows.push(
          [
            r.name,
            r.beat,
            payment,
            it.product,
            fmtQty(it.qty),
            it.unit,
            Math.round(it.rate),
            Math.round(it.amount),
          ]
            .map(esc)
            .join(","),
        );
      }
    }
    downloadCSV(rows.join("\n"), `today-summary-${dateISO}.csv`);
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users size={18} className="text-primary" />
            Retailers ({filtered.length})
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCSV}
            disabled={!filtered.length}
            className="gap-1.5"
          >
            <FileSpreadsheet size={14} /> CSV
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search retailers…"
              className="h-9 pl-8 text-sm"
            />
          </div>
          <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
            {(["value", "orders", "beat"] as SortMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setSortMode(m)}
                className={cn(
                  "px-3 py-1.5 capitalize transition-colors",
                  sortMode === m
                    ? "bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted",
                )}
              >
                {m === "value" ? "By value" : m === "orders" ? "By orders" : "By beat"}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Loading retailers…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No retailer orders for this day.
          </div>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border overflow-hidden">
            {filtered.map((r) => {
              const isOpen = expanded.has(r.retailerId);
              const payment =
                r.hasCredit && r.hasCash
                  ? { label: "Mixed", cls: "bg-amber-100 text-amber-700 border-amber-200" }
                  : r.hasCredit
                  ? { label: "Credit", cls: "bg-amber-100 text-amber-700 border-amber-200" }
                  : { label: "Cash", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
              const items = Array.from(r.items.values());
              const totalQty = items.reduce((s, i) => s + i.qty, 0);
              return (
                <div key={r.retailerId}>
                  <button
                    type="button"
                    onClick={() => toggle(r.retailerId)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                  >
                    {isOpen ? (
                      <ChevronDown size={16} className="text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.beat}
                      </div>
                    </div>
                    <div className="hidden sm:block text-xs text-muted-foreground">
                      {r.orderCount} order{r.orderCount === 1 ? "" : "s"}
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] font-medium", payment.cls)}
                    >
                      {payment.label}
                    </Badge>
                    <div className="font-semibold text-sm tabular-nums text-right w-24">
                      {money(r.totalValue)}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="bg-muted/30 border-t border-border px-3 py-2">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="h-8 text-xs">Item</TableHead>
                            <TableHead className="h-8 text-xs text-right">Qty</TableHead>
                            <TableHead className="h-8 text-xs text-right">Rate</TableHead>
                            <TableHead className="h-8 text-xs text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((it, idx) => (
                            <TableRow key={idx} className="hover:bg-transparent">
                              <TableCell className="py-1.5 text-xs">{it.product}</TableCell>
                              <TableCell className="py-1.5 text-xs text-right tabular-nums">
                                {fmtQty(it.qty)} {it.unit}
                              </TableCell>
                              <TableCell className="py-1.5 text-xs text-right tabular-nums">
                                ₹{it.rate.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell className="py-1.5 text-xs text-right tabular-nums font-medium">
                                {money(it.amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="hover:bg-transparent border-t-2 border-border/60">
                            <TableCell className="py-1.5 text-xs font-semibold">
                              Subtotal
                            </TableCell>
                            <TableCell className="py-1.5 text-xs text-right font-semibold tabular-nums">
                              {fmtQty(totalQty)}
                            </TableCell>
                            <TableCell />
                            <TableCell className="py-1.5 text-xs text-right font-semibold tabular-nums">
                              {money(r.totalValue)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
