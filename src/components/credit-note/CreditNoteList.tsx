import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Download, Loader2, FileText, ChevronDown, ChevronUp, Check, X } from "lucide-react";
import { toast } from "sonner";
import { generateCreditNotePDF, CreditNoteItem } from "@/utils/creditNoteGenerator";
import { useMyPendingSteps, useProcessApprovalStep } from "@/hooks/useApprovalEngine";

export default function CreditNoteList() {
  const { data: pendingSteps = [], refetch: refetchPendingSteps } = useMyPendingSteps();
  const { processStep } = useProcessApprovalStep();

  const cnPendingSteps = useMemo(
    () => pendingSteps.filter((s) => s.entityType === "credit_note"),
    [pendingSteps]
  );
  const hasPendingApprovals = cnPendingSteps.length > 0;

  const [tab, setTab] = useState<"issued" | "pending">("issued");
  const [issued, setIssued] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Map credit_note_id -> approvalRequestId for engine calls
  const stepByCnId = useMemo(() => {
    const m = new Map<string, { approvalRequestId: string }>();
    cnPendingSteps.forEach((s) => m.set(s.entityId, { approvalRequestId: s.approvalRequestId }));
    return m;
  }, [cnPendingSteps]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const issuedQ = supabase
      .from("credit_notes")
      .select("*, credit_note_items(*)")
      .or("approval_status.is.null,approval_status.neq.pending")
      .order("created_at", { ascending: false })
      .limit(200);

    const pendingIds = cnPendingSteps.map((s) => s.entityId);
    const pendingQ = pendingIds.length
      ? supabase
          .from("credit_notes")
          .select("*, credit_note_items(*)")
          .in("id", pendingIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null } as any);

    const [iRes, pRes] = await Promise.all([issuedQ, pendingQ]);
    if (!iRes.error && iRes.data) setIssued(iRes.data);
    if (!pRes.error && pRes.data) setPending(pRes.data);
    setLoading(false);
  }, [cnPendingSteps]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleDownload = async (cn: any) => {
    setDownloadingId(cn.id);
    try {
      const { data: companies } = await supabase.from("companies").select("*").limit(1);
      const company = companies?.[0] || {};

      let retailer: any = {};
      if (cn.retailer_id) {
        const { data } = await supabase
          .from("retailers")
          .select("name, address, phone, gst_number")
          .eq("id", cn.retailer_id)
          .single();
        retailer = data || {};
      }

      const items: CreditNoteItem[] = (cn.credit_note_items || []).map((item: any) => ({
        product_name: item.product_name,
        hsn_code: item.hsn_code || "",
        unit: item.unit || "Piece",
        quantity: Number(item.quantity) || 0,
        rate: Number(item.rate) || 0,
        total: Number(item.total) || 0,
        taxable_amount: Number(item.taxable_amount) || 0,
        sgst_amount: Number(item.sgst_amount) || 0,
        cgst_amount: Number(item.cgst_amount) || 0,
        original_invoice_number: item.original_invoice_number || "",
        barcode: item.barcode,
      }));

      const referenceInvoices = [...new Set(items.map((i) => i.original_invoice_number).filter(Boolean))];

      const blob = await generateCreditNotePDF({
        creditNoteNumber: cn.credit_note_number,
        creditNoteDate: new Date(cn.credit_note_date).toLocaleDateString("en-GB"),
        referenceInvoices,
        company,
        retailer,
        items,
        reason: cn.reason || "other",
        reasonNotes: cn.reason_notes,
        subTotal: Number(cn.sub_total) || 0,
        sgstTotal: Number(cn.sgst_total) || 0,
        cgstTotal: Number(cn.cgst_total) || 0,
        totalAmount: Number(cn.total_amount) || 0,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${cn.credit_note_number}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Credit note downloaded");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to download credit note");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleApprove = async (cn: any) => {
    const step = stepByCnId.get(cn.id);
    if (!step) {
      toast.error("No pending approval step for you on this credit note");
      return;
    }
    setActingId(cn.id);
    try {
      await processStep(step.approvalRequestId, "approved");
      await refetchPendingSteps();
      await fetchAll();
    } catch (e: any) {
      toast.error(e.message || "Failed to approve");
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (cn: any) => {
    const step = stepByCnId.get(cn.id);
    if (!step) {
      toast.error("No pending approval step for you on this credit note");
      return;
    }
    const reason = window.prompt("Reason for rejection?");
    if (!reason || !reason.trim()) return;
    setActingId(cn.id);
    try {
      await processStep(step.approvalRequestId, "rejected", reason.trim());
      await refetchPendingSteps();
      await fetchAll();
    } catch (e: any) {
      toast.error(e.message || "Failed to reject");
    } finally {
      setActingId(null);
    }
  };

  const statusColor = (s: string) => {
    if (s === "issued") return "default";
    if (s === "cancelled" || s === "rejected") return "destructive";
    return "secondary";
  };

  const firstInvoice = (cn: any) =>
    cn.credit_note_items?.find((i: any) => i.original_invoice_number)?.original_invoice_number || "—";

  const renderItems = (cn: any) => (
    <div className="mt-3 border-t pt-3 space-y-1">
      {(cn.credit_note_items || []).map((it: any) => (
        <div key={it.id} className="flex justify-between text-xs">
          <span className="truncate mr-2">
            {it.product_name}
            {it.original_invoice_number ? ` · INV ${it.original_invoice_number}` : ""}
          </span>
          <span className="shrink-0 text-muted-foreground">
            {Number(it.quantity)} × ₹{Number(it.rate).toFixed(2)} = ₹{Number(it.total).toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );

  const renderRow = (cn: any, isPending: boolean) => {
    const expanded = expandedId === cn.id;
    const canAct = isPending && stepByCnId.has(cn.id);
    return (
      <Card key={cn.id}>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-3">
            <button
              className="flex-1 text-left"
              onClick={() => setExpandedId(expanded ? null : cn.id)}
            >
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{cn.credit_note_number}</p>
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </div>
              <p className="text-xs text-muted-foreground">
                {cn.retailer_name} • {new Date(cn.credit_note_date).toLocaleDateString("en-GB")} • INV {firstInvoice(cn)}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={statusColor(cn.status)}>{cn.status}</Badge>
                {cn.reason && (
                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                    {cn.reason}
                  </span>
                )}
                <span className="text-sm font-semibold">₹{Math.round(Number(cn.total_amount))}</span>
              </div>
            </button>
            <div className="flex items-center gap-2">
              {canAct ? (
                <>
                  <Button
                    size="sm"
                    variant="default"
                    disabled={actingId === cn.id}
                    onClick={() => handleApprove(cn)}
                  >
                    {actingId === cn.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-1" />
                    )}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={actingId === cn.id}
                    onClick={() => handleReject(cn)}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(cn)}
                  disabled={downloadingId === cn.id || cn.status === "cancelled" || cn.status === "rejected"}
                >
                  {downloadingId === cn.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-1" />
                  )}
                  PDF
                </Button>
              )}
            </div>
          </div>
          {expanded && renderItems(cn)}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const issuedList = issued.length === 0 ? (
    <div className="text-center py-12 text-muted-foreground">
      <FileText className="h-8 w-8 mx-auto mb-2" />
      <p>No credit notes yet</p>
    </div>
  ) : (
    <div className="space-y-3">{issued.map((cn) => renderRow(cn, false))}</div>
  );

  if (!hasPendingApprovals) return issuedList;

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
      <TabsList>
        <TabsTrigger value="issued">Issued</TabsTrigger>
        <TabsTrigger value="pending">
          Pending Approval
          {pending.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {pending.length}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="issued" className="mt-4">
        {issuedList}
      </TabsContent>
      <TabsContent value="pending" className="mt-4">
        {pending.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2" />
            <p>No credit notes pending approval</p>
          </div>
        ) : (
          <div className="space-y-3">{pending.map((cn) => renderRow(cn, true))}</div>
        )}
      </TabsContent>
    </Tabs>
  );
}
