import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format, startOfWeek, startOfMonth, startOfQuarter } from "date-fns";
import { IndianRupee, TrendingDown, Clock, Receipt } from "lucide-react";
import { useRetailerCreditHistory } from "@/hooks/useRetailerCreditHistory";

type RangeKey = "week" | "month" | "quarter" | "custom";

interface Props {
  retailerId: string | null | undefined;
}

const fmtINR = (n: number) =>
  `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd MMM yyyy");
  } catch {
    return d as string;
  }
};

function rangeBounds(range: RangeKey, fromStr: string, toStr: string): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (range === "week") return { from: startOfWeek(now, { weekStartsOn: 1 }), to: now };
  if (range === "month") return { from: startOfMonth(now), to: now };
  if (range === "quarter") return { from: startOfQuarter(now), to: now };
  return {
    from: fromStr ? new Date(fromStr) : null,
    to: toStr ? new Date(`${toStr}T23:59:59`) : null,
  };
}

export function CreditHistorySection({ retailerId }: Props) {
  const { data, isLoading } = useRetailerCreditHistory(retailerId || null);
  const [range, setRange] = useState<RangeKey>("month");
  const [fromStr, setFromStr] = useState<string>("");
  const [toStr, setToStr] = useState<string>("");

  const { from, to } = useMemo(() => rangeBounds(range, fromStr, toStr), [range, fromStr, toStr]);

  const filteredOrders = useMemo(() => {
    const orders = data?.orders || [];
    if (!from && !to) return orders;
    return orders.filter((o) => {
      if (!o.order_date) return false;
      const d = new Date(o.order_date);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [data?.orders, from, to]);

  const filteredCollections = useMemo(() => {
    const cs = data?.collections || [];
    if (!from && !to) return cs;
    return cs.filter((c) => {
      const d = new Date(c.created_at);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [data?.collections, from, to]);

  const filteredKpis = useMemo(() => {
    // Credit actually placed on credit at order time (not the full order value)
    const totalCreditTaken = filteredOrders.reduce(
      (s, o) => s + Number(o.original_credit_amount || 0),
      0
    );
    // Money collected AFTER the order via Mark Payment Received (matches collections in range)
    const totalCleared = filteredCollections.reduce((s, c) => s + Number(c.amount || 0), 0);
    return { totalCreditTaken, totalCleared };
  }, [filteredOrders, filteredCollections]);

  const allocByCollection = useMemo(() => {
    const m = new Map<string, any[]>();
    (data?.allocations || []).forEach((a) => {
      const arr = m.get(a.collection_id) || [];
      arr.push(a);
      m.set(a.collection_id, arr);
    });
    return m;
  }, [data?.allocations]);

  const allocByOrder = useMemo(() => {
    const m = new Map<string, any[]>();
    (data?.allocations || []).forEach((a) => {
      const arr = m.get(a.order_id) || [];
      arr.push(a);
      m.set(a.order_id, arr);
    });
    return m;
  }, [data?.allocations]);

  const collectionById = useMemo(() => {
    const m = new Map<string, any>();
    (data?.collections || []).forEach((c) => m.set(c.id, c));
    return m;
  }, [data?.collections]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter controls */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex gap-1">
          {(["week", "month", "quarter", "custom"] as RangeKey[]).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={range === k ? "default" : "outline"}
              className="h-7 px-2 text-xs capitalize"
              onClick={() => setRange(k)}
            >
              {k}
            </Button>
          ))}
        </div>
        {range === "custom" && (
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">From</Label>
              <Input
                type="date"
                value={fromStr}
                onChange={(e) => setFromStr(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">To</Label>
              <Input
                type="date"
                value={toStr}
                onChange={(e) => setToStr(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
          </div>
        )}
      </div>

      {/* KPI strip — lifetime + filtered */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiTile
          icon={<IndianRupee className="w-3 h-3" />}
          label="Credit taken (range)"
          value={fmtINR(filteredKpis.totalCreditTaken)}
        />
        <KpiTile
          icon={<TrendingDown className="w-3 h-3" />}
          label="Collected (range)"
          value={fmtINR(filteredKpis.totalCleared)}
          tone="success"
        />
        <KpiTile
          icon={<Receipt className="w-3 h-3" />}
          label="Pending (now)"
          value={fmtINR(data?.kpis.currentPending || 0)}
          tone="warning"
        />
        <KpiTile
          icon={<Clock className="w-3 h-3" />}
          label="Avg days to clear"
          value={data?.kpis.avgDaysToClear == null ? "—" : `${data.kpis.avgDaysToClear}d`}
        />
      </div>

      {/* Credit orders */}
      <section>
        <h4 className="text-xs font-semibold mb-1.5">Credit orders ({filteredOrders.length})</h4>
        {filteredOrders.length === 0 ? (
          <p className="text-xs text-muted-foreground">No credit orders in this range.</p>
        ) : (
          <div className="space-y-1.5">
            {filteredOrders.map((o) => {
              const allocs = allocByOrder.get(o.id) || [];
              return (
                <Card key={o.id}>
                  <CardContent className="p-2 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-xs truncate">
                          {o.order_number || o.id.slice(0, 8)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {fmtDate(o.order_date)}
                        </div>
                      </div>
                      <PaymentStatusBadge status={o.payment_status} />
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-[11px]">
                      <Stat label="Total" value={fmtINR(o.total_amount)} />
                      <Stat label="Paid" value={fmtINR(o.credit_paid_amount)} tone="success" />
                      <Stat label="Pending" value={fmtINR(o.credit_pending_amount)} tone="warning" />
                    </div>
                    {allocs.length > 0 && (
                      <div className="border-t pt-1 space-y-0.5">
                        {allocs.map((a) => {
                          const c = collectionById.get(a.collection_id);
                          return (
                            <div key={a.id} className="flex items-center justify-between text-[11px]">
                              <span>
                                {fmtDate(a.applied_at)} ·{" "}
                                <span className="text-muted-foreground">
                                  {c?.payment_method || "—"}
                                </span>
                              </span>
                              <span className="font-medium">{fmtINR(a.amount_applied)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Collections */}
      <section>
        <h4 className="text-xs font-semibold mb-1.5">Collections ({filteredCollections.length})</h4>
        {filteredCollections.length === 0 ? (
          <p className="text-xs text-muted-foreground">No collections in this range.</p>
        ) : (
          <div className="space-y-1.5">
            {filteredCollections.map((c) => {
              const allocs = (allocByCollection.get(c.id) as any[]) || [];
              return (
                <Card key={c.id}>
                  <CardContent className="p-2 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-xs">{fmtINR(c.amount)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {fmtDate(c.created_at)} · {(c.payment_method || "cash").toUpperCase()}
                        </div>
                        {c.collected_by_name && (
                          <div className="text-[10px] text-muted-foreground">
                            By {c.collected_by_name}
                          </div>
                        )}
                      </div>
                      {c.payment_proof_url && (
                        <a
                          href={c.payment_proof_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-primary underline shrink-0"
                        >
                          Proof
                        </a>
                      )}
                    </div>
                    {allocs.length > 0 && (
                      <div className="border-t pt-1 space-y-0.5">
                        {allocs.map((a) => (
                          <div key={a.id} className="flex items-center justify-between text-[11px]">
                            <span className="font-mono">{a.order_id.slice(0, 8)}</span>
                            <span className="font-medium">{fmtINR(a.amount_applied)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function KpiTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "success" | "warning";
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-md border bg-card p-1.5">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-xs font-semibold mt-0.5 ${toneClass}`}>{value}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning";
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`font-medium ${toneClass}`}>{value}</div>
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: string | null }) {
  const s = (status || "pending").toLowerCase();
  const cls =
    s === "paid"
      ? "bg-success text-success-foreground"
      : s === "partial"
        ? "bg-warning text-warning-foreground"
        : "bg-muted text-muted-foreground";
  return <Badge className={`text-[9px] ${cls}`}>{s}</Badge>;
}
