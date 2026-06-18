import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { History, IndianRupee, TrendingDown, Clock, Receipt } from "lucide-react";
import { useRetailerCreditHistory } from "@/hooks/useRetailerCreditHistory";
import { useMemo } from "react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  retailerId: string | null;
  retailerName?: string;
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

export function RetailerCreditHistoryDrawer({ open, onOpenChange, retailerId, retailerName }: Props) {
  const { data, isLoading } = useRetailerCreditHistory(open ? retailerId : null);

  const allocByCollection = useMemo(() => {
    const m = new Map<string, typeof data extends infer T ? any[] : any[]>();
    (data?.allocations || []).forEach((a) => {
      const arr = (m.get(a.collection_id) as any[]) || [];
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Credit History {retailerName ? `— ${retailerName}` : ""}
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-3 mt-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-6 mt-4">
            {/* KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <KpiTile
                icon={<IndianRupee className="w-3.5 h-3.5" />}
                label="On credit (lifetime)"
                value={fmtINR(data?.kpis.totalCreditTaken || 0)}
              />
              <KpiTile
                icon={<TrendingDown className="w-3.5 h-3.5" />}
                label="Collected after order"
                value={fmtINR(data?.kpis.totalCleared || 0)}
                tone="success"
              />
              <KpiTile
                icon={<Receipt className="w-3.5 h-3.5" />}
                label="Currently pending"
                value={fmtINR(data?.kpis.currentPending || 0)}
                tone="warning"
              />
              <KpiTile
                icon={<Clock className="w-3.5 h-3.5" />}
                label="Avg days to clear"
                value={
                  data?.kpis.avgDaysToClear == null
                    ? "—"
                    : `${data.kpis.avgDaysToClear}d`
                }
              />
            </div>

            {/* Credit orders timeline */}
            <section>
              <h3 className="text-sm font-semibold mb-2">Credit orders</h3>
              {(data?.orders || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No credit orders yet.</p>
              ) : (
                <div className="space-y-2">
                  {data!.orders.map((o) => {
                    const allocs = allocByOrder.get(o.id) || [];
                    return (
                      <Card key={o.id}>
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-medium text-sm">
                                {o.order_number || o.id.slice(0, 8)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {fmtDate(o.order_date)}
                              </div>
                            </div>
                            <PaymentStatusBadge status={o.payment_status} />
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <Stat label="Order total" value={fmtINR(o.total_amount)} />
                            <Stat
                              label="On credit"
                              value={fmtINR(o.original_credit_amount)}
                            />
                            <Stat
                              label="Collected later"
                              value={fmtINR(o.collected_after_order)}
                              tone="success"
                            />
                            <Stat
                              label="Still pending"
                              value={fmtINR(o.credit_pending_amount)}
                              tone="warning"
                            />
                          </div>
                          {o.paid_at_order_time > 0 && (
                            <div className="text-[11px] text-muted-foreground">
                              Paid at order time: {fmtINR(o.paid_at_order_time)}
                            </div>
                          )}
                          {allocs.length > 0 && (
                            <div className="border-t pt-2 space-y-1">
                              <div className="text-[11px] uppercase text-muted-foreground">
                                Settlements
                              </div>
                              {allocs.map((a) => {
                                const c = collectionById.get(a.collection_id);
                                return (
                                  <div
                                    key={a.id}
                                    className="flex items-center justify-between text-xs"
                                  >
                                    <span>
                                      {fmtDate(a.applied_at)} ·{" "}
                                      <span className="text-muted-foreground">
                                        {c?.payment_method || "—"}
                                      </span>
                                    </span>
                                    <span className="font-medium">
                                      {fmtINR(a.amount_applied)}
                                    </span>
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

            {/* Collections timeline */}
            <section>
              <h3 className="text-sm font-semibold mb-2">Collections</h3>
              {(data?.collections || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments collected yet.</p>
              ) : (
                <div className="space-y-2">
                  {data!.collections.map((c) => {
                    const allocs = (allocByCollection.get(c.id) as any[]) || [];
                    return (
                      <Card key={c.id}>
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-medium text-sm">{fmtINR(c.amount)}</div>
                              <div className="text-xs text-muted-foreground">
                                {fmtDate(c.created_at)} ·{" "}
                                {(c.payment_method || "cash").toUpperCase()}
                              </div>
                              {c.collected_by_name && (
                                <div className="text-[11px] text-muted-foreground">
                                  By {c.collected_by_name}
                                </div>
                              )}
                            </div>
                            {c.payment_proof_url && (
                              <a
                                href={c.payment_proof_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-primary underline"
                              >
                                Proof
                              </a>
                            )}
                          </div>
                          {allocs.length > 0 && (
                            <div className="border-t pt-2 space-y-1">
                              <div className="text-[11px] uppercase text-muted-foreground">
                                Applied to
                              </div>
                              {allocs.map((a) => (
                                <div
                                  key={a.id}
                                  className="flex items-center justify-between text-xs"
                                >
                                  <span className="font-mono">
                                    {a.order_id.slice(0, 8)}
                                  </span>
                                  <span className="font-medium">
                                    {fmtINR(a.amount_applied)}
                                  </span>
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
        )}
      </SheetContent>
    </Sheet>
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
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : "text-foreground";
  return (
    <div className="rounded-md border bg-card p-2">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-sm font-semibold mt-0.5 ${toneClass}`}>{value}</div>
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
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : "text-foreground";
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
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
  return <Badge className={`text-[10px] ${cls}`}>{s}</Badge>;
}
