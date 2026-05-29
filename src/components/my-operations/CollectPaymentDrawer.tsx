import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useOpenInvoices, useAllocatePayment } from "@/hooks/useMyOperations";
import { toast } from "sonner";
import { format } from "date-fns";

const sb = supabase as any;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  retailerId: string | null;
  retailerName?: string;
  distributorId?: string | null;
}

export function CollectPaymentDrawer({ open, onOpenChange, retailerId, retailerName, distributorId }: Props) {
  const { data: invoices = [] } = useOpenInvoices(retailerId);
  const allocate = useAllocatePayment();

  const [mode, setMode] = useState<"fifo" | "manual">("fifo");
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [reference, setReference] = useState("");
  const [allocMap, setAllocMap] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setAmount(""); setReference(""); setAllocMap({}); setMode("fifo");
    }
  }, [open]);

  const allocSum = useMemo(
    () => Object.values(allocMap).reduce((s, v) => s + (Number(v) || 0), 0),
    [allocMap]
  );

  const submit = async () => {
    if (!retailerId || !distributorId) { toast.error("Missing retailer/distributor"); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter amount"); return; }
    setSaving(true);
    try {
      const { data: pay, error } = await sb.from("distributor_payments").insert({
        distributor_id: distributorId,
        retailer_id: retailerId,
        payment_date: new Date().toISOString().slice(0, 10),
        amount: amt,
        payment_mode: paymentMode,
        reference_number: reference || null,
      }).select("id").single();
      if (error) throw error;

      if (mode === "fifo") {
        await allocate.mutateAsync({ paymentId: pay.id, mode: "fifo" });
      } else {
        const allocations = Object.entries(allocMap)
          .map(([invoice_id, v]) => ({ invoice_id, amount: Number(v) || 0 }))
          .filter((a) => a.amount > 0);
        if (allocations.length === 0) { toast.error("Allocate at least one invoice"); setSaving(false); return; }
        if (allocSum > amt) { toast.error("Allocations exceed amount"); setSaving(false); return; }
        await allocate.mutateAsync({ paymentId: pay.id, mode: "manual", allocations });
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Collect Payment {retailerName ? `— ${retailerName}` : ""}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Amount</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Mode</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="neft">NEFT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {paymentMode !== "cash" && (
            <div>
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / Cheque #" />
            </div>
          )}

          <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="fifo">Auto FIFO</TabsTrigger>
              <TabsTrigger value="manual">Manual Allocation</TabsTrigger>
            </TabsList>
            <TabsContent value="fifo">
              <div className="text-sm text-muted-foreground mb-2">
                Amount will settle oldest invoices first. Anything left over stays as advance.
              </div>
              <InvoiceTable invoices={invoices} />
            </TabsContent>
            <TabsContent value="manual">
              <div className="text-sm text-muted-foreground mb-2">
                Allocate exact amounts per invoice. Retailer can refuse old invoices and pay only newer ones.
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Allocate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv: any) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                      <TableCell className="text-xs">{format(new Date(inv.invoice_date), "dd MMM")}</TableCell>
                      <TableCell className="text-right">₹{Number(inv.balance_due).toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          className="h-8 w-28 ml-auto"
                          value={allocMap[inv.id] ?? ""}
                          onChange={(e) =>
                            setAllocMap({ ...allocMap, [inv.id]: e.target.value })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {invoices.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No open invoices</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              <div className="flex justify-between text-sm mt-2">
                <span>Allocated: ₹{allocSum.toLocaleString("en-IN")}</span>
                <span>Unallocated: ₹{Math.max((Number(amount) || 0) - allocSum, 0).toLocaleString("en-IN")}</span>
              </div>
            </TabsContent>
          </Tabs>

          <Button className="w-full" onClick={submit} disabled={saving}>
            {saving ? "Saving..." : "Record payment"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InvoiceTable({ invoices }: { invoices: any[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Outstanding</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((inv: any) => (
          <TableRow key={inv.id}>
            <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
            <TableCell className="text-xs">{format(new Date(inv.invoice_date), "dd MMM")}</TableCell>
            <TableCell className="text-right">₹{Number(inv.balance_due).toLocaleString("en-IN")}</TableCell>
          </TableRow>
        ))}
        {invoices.length === 0 && (
          <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No open invoices</TableCell></TableRow>
        )}
      </TableBody>
    </Table>
  );
}
