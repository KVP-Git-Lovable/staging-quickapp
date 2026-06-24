import { Fragment, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  format,
  startOfWeek,
  startOfMonth,
  startOfQuarter,
  endOfQuarter,
} from "date-fns";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { useRetailerCreditHistory } from "@/hooks/useRetailerCreditHistory";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

type RangeKey = "week" | "month" | "quarter" | "custom";

interface Props {
  retailerId: string | null | undefined;
}

const fmtINR = (n: number | null | undefined) =>
  n == null ? "—" : `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd MMM yyyy");
  } catch {
    return d as string;
  }
};

const toIsoDate = (d: Date) => format(d, "yyyy-MM-dd");

function rangeBounds(
  range: RangeKey,
  fromStr: string,
  toStr: string
): { from: string | null; to: string | null } {
  const now = new Date();
  if (range === "week")
    return { from: toIsoDate(startOfWeek(now, { weekStartsOn: 1 })), to: toIsoDate(now) };
  if (range === "month") return { from: toIsoDate(startOfMonth(now)), to: toIsoDate(now) };
  if (range === "quarter")
    return { from: toIsoDate(startOfQuarter(now)), to: toIsoDate(endOfQuarter(now)) };
  return {
    from: fromStr || null,
    to: toStr || null,
  };
}

export function CreditHistorySection({ retailerId }: Props) {
  const [range, setRange] = useState<RangeKey>("quarter");
  const [fromStr, setFromStr] = useState<string>("");
  const [toStr, setToStr] = useState<string>("");

  const { from, to } = useMemo(
    () => rangeBounds(range, fromStr, toStr),
    [range, fromStr, toStr]
  );

  const { data, isLoading, refetch } = useRetailerCreditHistory(retailerId || null, {
    from,
    to,
  });

  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [collectionsOpen, setCollectionsOpen] = useState(false);

  const orders = data?.orders || [];
  const collections = data?.collections || [];

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

  const terms = data?.creditTerms;
  const canEditTerms = !!data?.distributorId && !!retailerId;

  return (
    <div className="space-y-3">
      {/* Header panel */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="rounded-md border bg-card p-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-muted-foreground">Credit Terms</div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => setEditOpen(true)}
              disabled={!canEditTerms}
              title={
                canEditTerms
                  ? "Edit credit terms"
                  : "Retailer has no distributor assigned"
              }
            >
              <Pencil className="w-3 h-3 mr-1" /> Edit
            </Button>
          </div>
          <div className="text-xs font-semibold mt-0.5">
            Limit {fmtINR(terms?.credit_limit ?? null)} ·{" "}
            {terms?.credit_days == null ? "—" : `${terms.credit_days} days`}
          </div>
          {terms?.source && terms.source !== "none" && (
            <div className="text-[10px] text-muted-foreground capitalize">
              source: {terms.source}
            </div>
          )}
        </div>
        <div className="rounded-md border bg-card p-2">
          <div className="text-[10px] text-muted-foreground">Current Outstanding</div>
          <div className="text-xs font-semibold mt-0.5 text-warning">
            {fmtINR(data?.kpis.currentPending || 0)}
          </div>
        </div>
        <div className="rounded-md border bg-card p-2">
          <div className="text-[10px] text-muted-foreground">Avg days to clear</div>
          <div className="text-xs font-semibold mt-0.5">
            {data?.kpis.avgDaysToClear == null ? "—" : `${data.kpis.avgDaysToClear}d`}
          </div>
        </div>
      </div>

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

      {/* Order-wise credit table */}
      <section>
        <h4 className="text-xs font-semibold mb-1.5">
          Credit orders ({orders.length})
        </h4>
        {orders.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No credit orders in this range.
          </p>
        ) : (
          <div className="border rounded-md overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 px-2 text-[10px]"></TableHead>
                  <TableHead className="h-8 px-2 text-[10px]">Order Date</TableHead>
                  <TableHead className="h-8 px-2 text-[10px]">Order No</TableHead>
                  <TableHead className="h-8 px-2 text-[10px] text-right">
                    Order Value
                  </TableHead>
                  <TableHead className="h-8 px-2 text-[10px] text-right">
                    Credit Amount
                  </TableHead>
                  <TableHead className="h-8 px-2 text-[10px]">Collection</TableHead>
                  <TableHead className="h-8 px-2 text-[10px] text-right">
                    Pending
                  </TableHead>
                  <TableHead className="h-8 px-2 text-[10px]">
                    Last Collection
                  </TableHead>
                  <TableHead className="h-8 px-2 text-[10px]">Days to Clear</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => {
                  const isOpen = !!expanded[o.id];
                  const allocs = allocByOrder.get(o.id) || [];
                  const isPaid = (o.payment_status || "").toLowerCase() === "paid";
                  return (
                    <Fragment key={o.id}>
                      <TableRow className="text-[11px]">

                        <TableCell className="px-2 py-1.5">
                          <button
                            className="p-0.5 hover:bg-muted rounded"
                            onClick={() =>
                              setExpanded((s) => ({ ...s, [o.id]: !s[o.id] }))
                            }
                            aria-label="Toggle"
                          >
                            {isOpen ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
                          {fmtDate(o.order_date)}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 font-medium">
                          {o.invoice_number || o.order_number || o.id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right">
                          {fmtINR(o.total_amount)}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right">
                          {fmtINR(o.original_credit_amount)}
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
                          <div className="flex flex-col leading-tight">
                            <span className="text-[10px]">
                              {fmtINR(o.paid_at_order_time)} at order
                            </span>
                            <span className="text-[10px] text-success">
                              {fmtINR(o.collected_after_order)} later
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right text-warning">
                          {fmtINR(o.credit_pending_amount)}
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
                          {fmtDate(o.last_collection_date)}
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
                          {isPaid ? (
                            <span>
                              {o.days_to_clear == null ? "—" : `${o.days_to_clear}d`}
                            </span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span>
                                {o.days_outstanding == null
                                  ? "—"
                                  : `${o.days_outstanding}d outstanding`}
                              </span>
                              {o.is_overdue && (
                                <Badge className="text-[9px] bg-destructive text-destructive-foreground">
                                  OVERDUE
                                </Badge>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow key={`${o.id}-exp`} className="bg-muted/30">
                          <TableCell colSpan={9} className="px-3 py-2">
                            {allocs.length === 0 ? (
                              <div className="text-[11px] text-muted-foreground">
                                No collections applied to this order yet.
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                {allocs.map((a) => {
                                  const c = collectionById.get(a.collection_id);
                                  return (
                                    <div
                                      key={a.id}
                                      className="flex items-center justify-between text-[11px]"
                                    >
                                      <span className="flex items-center gap-2">
                                        <span>{fmtDate(a.applied_at)}</span>
                                        <span className="text-muted-foreground uppercase">
                                          {c?.payment_method || "—"}
                                        </span>
                                        {c?.payment_proof_url && (
                                          <a
                                            href={c.payment_proof_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-primary underline"
                                          >
                                            proof
                                          </a>
                                        )}
                                      </span>
                                      <span className="font-medium">
                                        {fmtINR(a.amount_applied)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Collections collapsible */}
      <Collapsible open={collectionsOpen} onOpenChange={setCollectionsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs">
            {collectionsOpen ? (
              <ChevronDown className="w-3 h-3 mr-1" />
            ) : (
              <ChevronRight className="w-3 h-3 mr-1" />
            )}
            All collections ({collections.length})
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          {collections.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No collections in this range.
            </p>
          ) : (
            <div className="border rounded-md divide-y">
              {collections.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px]"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{fmtINR(c.amount)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {fmtDate(c.created_at)} ·{" "}
                      {(c.payment_method || "cash").toUpperCase()}
                      {c.collected_by_name ? ` · by ${c.collected_by_name}` : ""}
                    </div>
                  </div>
                  {c.payment_proof_url && (
                    <a
                      href={c.payment_proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline shrink-0"
                    >
                      Proof
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      <EditCreditTermsDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        retailerId={retailerId || null}
        distributorId={data?.distributorId || null}
        currentLimit={terms?.credit_limit ?? null}
        currentDays={terms?.credit_days ?? null}
        onSaved={() => {
          refetch();
          queryClient.invalidateQueries({
            queryKey: ["retailer-credit-history", retailerId],
          });
        }}
      />
    </div>
  );
}

function EditCreditTermsDialog({
  open,
  onOpenChange,
  retailerId,
  distributorId,
  currentLimit,
  currentDays,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  retailerId: string | null;
  distributorId: string | null;
  currentLimit: number | null;
  currentDays: number | null;
  onSaved: () => void;
}) {
  const [limit, setLimit] = useState<string>("");
  const [days, setDays] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Reset when opening
  useEffect(() => {
    if (open) {
      setLimit(currentLimit == null ? "" : String(currentLimit));
      setDays(currentDays == null ? "" : String(currentDays));
    }
  }, [open, currentLimit, currentDays]);

  const onSave = async () => {
    if (!retailerId || !distributorId) return;
    const parsedLimit = limit === "" ? null : Number(limit);
    const parsedDays = days === "" ? null : Number(days);
    if (
      (parsedLimit != null && (!Number.isFinite(parsedLimit) || parsedLimit < 0)) ||
      (parsedDays != null && (!Number.isInteger(parsedDays) || parsedDays < 0))
    ) {
      toast({ title: "Invalid values", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("distributor_retailer_credit_limits")
        .upsert(
          {
            distributor_id: distributorId,
            retailer_id: retailerId,
            credit_limit: parsedLimit,
            credit_days: parsedDays,
            is_active: true,
          },
          { onConflict: "distributor_id,retailer_id" }
        );
      if (error) throw error;
      toast({ title: "Credit terms updated" });
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast({
        title: "Failed to save",
        description: e?.message || String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Credit Terms</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Credit Limit (₹)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="e.g. 50000"
            />
          </div>
          <div>
            <Label className="text-xs">Credit Days</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="e.g. 30"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving || !distributorId}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
