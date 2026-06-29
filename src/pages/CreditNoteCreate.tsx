import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import RetailerInvoiceList, { SelectedItem } from "@/components/credit-note/RetailerInvoiceList";
import CreditNoteReview from "@/components/credit-note/CreditNoteReview";
import { generateCreditNotePDF, getNextCreditNoteNumber, CreditNoteItem } from "@/utils/creditNoteGenerator";
import { downloadPDF } from "@/utils/fileDownloader";
import { useAuth } from "@/hooks/useAuth";
import { computeLineTax } from "@/utils/taxCalc";

const REASONS = [
  { value: "unsold_stock", label: "Unsold Stock" },
  { value: "damaged", label: "Damaged" },
  { value: "expired", label: "Expired" },
  { value: "quality_issue", label: "Quality Issue" },
  { value: "other", label: "Other" },
];

export default function CreditNoteCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const preselectedRetailerId = searchParams.get("retailerId") || "";

  const [retailers, setRetailers] = useState<any[]>([]);
  const [retailerId, setRetailerId] = useState(preselectedRetailerId);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [reason, setReason] = useState("unsold_stock");
  const [reasonNotes, setReasonNotes] = useState("");
  const [step, setStep] = useState<"select" | "review">("select");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchRetailers = async () => {
      const { data } = await supabase.from("retailers").select("id, name").order("name");
      if (data) setRetailers(data);
    };
    fetchRetailers();
  }, []);

  // Per-line tax via shared helper using each item's original GST% (snapshot or product fallback).
  const lineTaxes = selectedItems.map((i) =>
    computeLineTax({ taxableAmount: i.returnQuantity * i.rate, gstPercentage: i.gstRate })
  );
  const subTotal = selectedItems.reduce((s, i) => s + i.returnQuantity * i.rate, 0);
  const sgst = lineTaxes.reduce((s, l) => s + l.sgst, 0);
  const cgst = lineTaxes.reduce((s, l) => s + l.cgst, 0);
  const total = subTotal + sgst + cgst;

  const handleGenerate = async () => {
    if (selectedItems.length === 0) {
      toast.error("Select at least one item to return");
      return;
    }
    setSaving(true);
    try {
      const cnNumber = await getNextCreditNoteNumber();
      const retailer = retailers.find((r) => r.id === retailerId);

      // Save to DB
      const { data: cn, error } = await supabase
        .from("credit_notes")
        .insert({
          credit_note_number: cnNumber,
          credit_note_date: new Date().toISOString().split("T")[0],
          retailer_id: retailerId,
          retailer_name: retailer?.name || "",
          reason,
          reason_notes: reasonNotes || null,
          sub_total: subTotal,
          sgst_total: sgst,
          cgst_total: cgst,
          total_amount: total,
          amount_in_words: "",
          status: "issued",
          created_by: user?.id,
        } as any)
        .select()
        .single();

      if (error) throw error;

      // Insert items
      const itemRows = selectedItems.map((item, idx) => {
        const lt = lineTaxes[idx];
        return {
          credit_note_id: cn.id,
          original_order_id: item.orderId,
          original_invoice_number: item.invoiceNumber,
          product_id: item.productId,
          product_name: item.productName,
          hsn_code: item.hsnCode,
          unit: item.unit,
          quantity: item.returnQuantity,
          rate: item.rate,
          total: item.returnQuantity * item.rate,
          taxable_amount: lt.taxableAmount,
          sgst_amount: lt.sgst,
          cgst_amount: lt.cgst,
          barcode: item.barcode || null,
        };
      });

      const { error: itemError } = await supabase.from("credit_note_items").insert(itemRows as any);
      if (itemError) throw itemError;

      // Generate PDF
      const { data: companies } = await supabase.from("companies").select("*").limit(1);
      const company = companies?.[0] || {};
      let retailerData: any = {};
      if (retailerId) {
        const { data } = await supabase.from("retailers").select("name, address, phone, gst_number").eq("id", retailerId).single();
        retailerData = data || {};
      }

      const pdfItems: CreditNoteItem[] = selectedItems.map((i, idx) => {
        const lt = lineTaxes[idx];
        return {
          product_name: i.productName,
          hsn_code: i.hsnCode,
          unit: i.unit,
          quantity: i.returnQuantity,
          rate: i.rate,
          total: i.returnQuantity * i.rate,
          taxable_amount: lt.taxableAmount,
          sgst_amount: lt.sgst,
          cgst_amount: lt.cgst,
          original_invoice_number: i.invoiceNumber,
          barcode: i.barcode,
        };
      });

      const referenceInvoices = [...new Set(selectedItems.map((i) => i.invoiceNumber))];

      const blob = await generateCreditNotePDF({
        creditNoteNumber: cnNumber,
        creditNoteDate: new Date().toLocaleDateString("en-GB"),
        referenceInvoices,
        company,
        retailer: retailerData,
        items: pdfItems,
        reason,
        reasonNotes,
        subTotal,
        sgstTotal: sgst,
        cgstTotal: cgst,
        totalAmount: total,
      });

      await downloadPDF(blob, `${cnNumber.replace(/\//g, '-')}.pdf`);
      toast.success("Credit note generated successfully!");
      navigate("/invoice-management");
    } catch (err: any) {
      console.error("Credit note error:", err);
      toast.error(err.message || "Failed to create credit note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="container mx-auto p-4 max-w-2xl space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Create Credit Note</h1>
            <p className="text-sm text-muted-foreground">Select returned items from invoices</p>
          </div>
        </div>

        {step === "select" && (
          <div className="space-y-4">
            {/* Retailer selector */}
            <div className="space-y-2">
              <Label>Select Retailer</Label>
              <Select value={retailerId} onValueChange={(v) => { setRetailerId(v); setSelectedItems([]); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose retailer..." />
                </SelectTrigger>
                <SelectContent>
                  {retailers.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Invoice items */}
            {retailerId && (
              <RetailerInvoiceList
                retailerId={retailerId}
                selectedItems={selectedItems}
                onSelectionChange={setSelectedItems}
              />
            )}

            {/* Reason */}
            {selectedItems.length > 0 && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Return Reason</Label>
                  <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REASONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    value={reasonNotes}
                    onChange={(e) => setReasonNotes(e.target.value)}
                    placeholder="Additional details about the return..."
                    rows={2}
                  />
                </div>

                <Button onClick={() => setStep("review")} className="w-full">
                  Review Credit Note ({selectedItems.length} items)
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            <CreditNoteReview items={selectedItems} reason={reason} reasonNotes={reasonNotes} />
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("select")} className="flex-1">
                Back
              </Button>
              <Button onClick={handleGenerate} disabled={saving} className="flex-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                {saving ? "Generating..." : "Generate Credit Note"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
