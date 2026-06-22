import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateTemplate4Invoice } from "@/utils/invoiceGenerator";
import { applyInvoiceWatermark } from "@/utils/invoiceWatermark";


interface InvoicePDFGeneratorProps {
  invoiceId: string;
  className?: string;
  buttonLabel?: string;
  buttonIcon?: React.ReactNode;
}

export const InvoicePDFGenerator = ({
  invoiceId,
  className,
  buttonLabel = "Download PDF",
  buttonIcon,
}: InvoicePDFGeneratorProps) => {
  const [loading, setLoading] = useState(false);

  const defaultIcon =
    buttonLabel === "Download PDF" ? (
      <Download className="mr-2 h-4 w-4" />
    ) : (
      <Eye className="mr-2 h-4 w-4" />
    );

  const generatePDF = async () => {
    setLoading(true);
    try {
      // Load invoice with items and company
      const { data: invoice, error } = await supabase
        .from("invoices")
        .select(`*, invoice_items(*), companies(*)`)
        .eq("id", invoiceId)
        .single();

      if (error || !invoice) throw error || new Error("Invoice not found");

      // Fetch retailer data
      let retailer: any = {};
      if (invoice.customer_id) {
        const { data: retailerData } = await supabase
          .from("retailers")
          .select("name, address, phone, gst_number")
          .eq("id", invoice.customer_id)
          .single();
        retailer = retailerData || {};
      }

      // Build cart items for the unified template
      const cartItems = (invoice.invoice_items || []).map((it: any) => ({
        name: it.description,
        product_name: it.description,
        quantity: Number(it.quantity) || 0,
        price: Number(it.price_per_unit) || 0,
        rate: Number(it.price_per_unit) || 0,
        total: Number(it.total_amount) || 0,
        hsn_code: it.hsn_sac || "-",
        unit: it.unit || "Piece",
        base_unit: it.base_unit || it.unit || "Piece",
        taxable_amount: it.taxable_amount,
        sgst_amount: it.sgst_amount,
        cgst_amount: it.cgst_amount,
        total_amount: it.total_amount,
      }));

      // Prepare company data
      const company = invoice.companies || {};

      // Use unified Template 4 generator
      const rawBlob = await generateTemplate4Invoice({
        orderId: invoice.invoice_number || invoice.id,
        company,
        retailer,
        cartItems,
      });
      const blob = await applyInvoiceWatermark(rawBlob, {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
      });

      const filename = `${invoice.invoice_number || "invoice"}.pdf`;
      const url = URL.createObjectURL(blob);

      // If the button is for viewing, open a new tab; otherwise download
      if (buttonLabel.toLowerCase().includes("view")) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      URL.revokeObjectURL(url);


      toast.success("Invoice ready");
    } catch (err: any) {
      console.error("Invoice generation failed", err);
      toast.error(err?.message || "Failed to generate invoice");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={generatePDF} disabled={loading} className={className} variant="outline" size="sm">
      {buttonIcon || defaultIcon}
      {loading ? "Processing..." : buttonLabel}
    </Button>
  );
};
