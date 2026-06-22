import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Loader2, Edit, MessageCircle, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { fetchAndGenerateInvoice } from "@/utils/invoiceGenerator";
import { autoSendInvoiceWhatsApp } from "@/utils/autoSendInvoice";
import EditInvoiceDialog from "./EditInvoiceDialog";
import InvoiceStatusBadge from "./InvoiceStatusBadge";

interface Invoice {
  id: string;
  invoice_number: string;
  created_at: string;
  retailer_id: string;
  total_amount: number;
  retailer_name?: string;
}

export default function AllInvoicesList() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [sendingWhatsAppId, setSendingWhatsAppId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<{ orderId: string; invoiceNumber: string } | null>(null);

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      // Fetch all orders from all users
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch retailer names for each order
      const orders: any[] = data || [];
      if (orders && orders.length > 0) {
        const retailerIds = [...new Set(orders.map((o: any) => o.retailer_id).filter(Boolean))];
        const { data: retailers } = await supabase
          .from("retailers")
          .select("id, name")
          .in("id", retailerIds);

        const retailerMap = new Map((retailers as any[])?.map((r: any) => [r.id, r.name]) || []);

        const invoicesWithRetailers = orders.map((order: any) => ({
          ...order,
          retailer_name: retailerMap.get(order.retailer_id) || "Unknown Retailer",
        })) as Invoice[];

        setInvoices(invoicesWithRetailers);
      } else {
        setInvoices([]);
      }
    } catch (error: any) {
      console.error("Error fetching invoices:", error);
      toast.error("Failed to load invoices");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadInvoice = async (orderId: string, invoiceNumber: string) => {
    setDownloadingId(orderId);
    try {
      const { blob } = await fetchAndGenerateInvoice(orderId);
      
      // Download the PDF
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoiceNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success("Invoice downloaded successfully!");
    } catch (error: any) {
      console.error('Error downloading invoice:', error);
      toast.error(error.message || "Failed to download invoice");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSendWhatsApp = async (orderId: string, invoiceNumber: string) => {
    setSendingWhatsAppId(orderId);
    try {
      // Generate and upload the PDF first so the correct invoice is available
      const { blob } = await fetchAndGenerateInvoice(orderId);
      const fileName = `${invoiceNumber || orderId}.pdf`;
      const filePath = `public/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(filePath, blob, {
          contentType: "application/pdf",
          upsert: true,
        });

      const { data: urlData } = supabase.storage
        .from("invoices")
        .getPublicUrl(filePath);

      // Now send via WhatsApp with explicit PDF URL + invoice number template variable
      await autoSendInvoiceWhatsApp({ invoiceNumber, pdfUrl: urlData.publicUrl });
      toast.success("Invoice sent via WhatsApp!");
    } catch (error: any) {
      console.error("Error sending invoice via WhatsApp:", error);
      toast.error("Failed to send invoice via WhatsApp");
    } finally {
      setSendingWhatsAppId(null);
    }
  };

  const handleUploadAndOpenLink = async (orderId: string, invoiceNumber: string) => {
    setUploadingId(orderId);
    try {
      const { blob } = await fetchAndGenerateInvoice(orderId);
      const fileName = `${invoiceNumber || orderId}.pdf`;
      const filePath = `public/${fileName}`;

      // Upload to invoices bucket (upsert to overwrite if exists)
      const { error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(filePath, blob, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("invoices")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;
      window.open(publicUrl, "_blank", "noopener,noreferrer");
      toast.success("Invoice PDF link opened!");
    } catch (error: any) {
      console.error("Error uploading invoice:", error);
      toast.error(error.message || "Failed to generate invoice link");
    } finally {
      setUploadingId(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Invoices</CardTitle>
        <p className="text-sm text-muted-foreground">
          View and download all generated invoices from all users
        </p>
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No invoices found
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice Number</TableHead>
                  <TableHead>Retailer Name</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.invoice_number || "N/A"}
                    </TableCell>
                    <TableCell>{invoice.retailer_name}</TableCell>
                    <TableCell>
                      {new Date(invoice.created_at).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric"
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      ₹{invoice.total_amount?.toFixed(2) || "0.00"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingInvoice({ orderId: invoice.id, invoiceNumber: invoice.invoice_number })}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={downloadingId === invoice.id}
                          onClick={() => handleDownloadInvoice(invoice.id, invoice.invoice_number)}
                        >
                          {downloadingId === invoice.id ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                          disabled={sendingWhatsAppId === invoice.id}
                          onClick={() => handleSendWhatsApp(invoice.id, invoice.invoice_number)}
                          title="Send invoice via WhatsApp"
                        >
                          {sendingWhatsAppId === invoice.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MessageCircle className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          disabled={uploadingId === invoice.id}
                          onClick={() => handleUploadAndOpenLink(invoice.id, invoice.invoice_number)}
                          title="Open public invoice PDF link"
                        >
                          {uploadingId === invoice.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <BookOpen className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {editingInvoice && (
        <EditInvoiceDialog
          orderId={editingInvoice.orderId}
          invoiceNumber={editingInvoice.invoiceNumber}
          open={!!editingInvoice}
          onOpenChange={(open) => !open && setEditingInvoice(null)}
          onSaved={fetchInvoices}
        />
      )}
    </Card>
  );
}
