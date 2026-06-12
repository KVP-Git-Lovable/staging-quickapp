import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateTemplate4Invoice } from "@/utils/invoiceGenerator";

interface OrderInvoicePDFGeneratorProps {
  orderId: string;
  invoiceNumber: string;
  className?: string;
}

/**
 * Generates invoice PDF directly from order data (no invoices table record needed).
 * Used for direct orders where invoice_number is on the order but no invoices row exists.
 */
export const OrderInvoicePDFGenerator = ({
  orderId,
  invoiceNumber,
  className,
}: OrderInvoicePDFGeneratorProps) => {
  const [loading, setLoading] = useState(false);

  const generatePDF = async () => {
    setLoading(true);
    try {
      // Fetch order with items
      const { data: order, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("id", orderId)
        .single();

      if (error || !order) throw error || new Error("Order not found");

      // Fetch company
      const { data: company } = await supabase
        .from("companies")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      // Fetch retailer
      let retailer: any = {};
      if (order.retailer_id) {
        const { data: retailerData } = await supabase
          .from("retailers")
          .select("name, address, phone, gst_number")
          .eq("id", order.retailer_id)
          .single();
        retailer = retailerData || {};
      }

      const cartItems = (order.order_items || []).map((it: any) => ({
        name: it.product_name,
        product_name: it.product_name,
        quantity: Number(it.quantity) || 0,
        price: Number(it.rate) || 0,
        rate: Number(it.rate) || 0,
        total: Number(it.total) || 0,
        hsn_code: it.hsn_code || "-",
        unit: it.unit || "Piece",
        base_unit: it.base_unit || it.unit || "Piece",
      }));

      const blob = await generateTemplate4Invoice({
        orderId: invoiceNumber,
        company: company || {},
        retailer,
        cartItems,
      });

      const filename = `${invoiceNumber}.pdf`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Invoice downloaded");
    } catch (err: any) {
      console.error("Invoice generation failed", err);
      toast.error(err?.message || "Failed to generate invoice");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={generatePDF} disabled={loading} className={className} variant="outline" size="sm">
      <Download className="mr-1.5 h-3.5 w-3.5" />
      {loading ? "Processing..." : "Download"}
    </Button>
  );
};
