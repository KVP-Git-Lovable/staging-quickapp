import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, MessageSquare, Mail, Eye } from "lucide-react";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fetchAndGenerateInvoice } from "@/utils/invoiceGenerator";
import { autoSendInvoiceWhatsApp } from "@/utils/autoSendInvoice";
import { useConnectivity } from "@/hooks/useConnectivity";
import { offlineStorage, STORES } from "@/lib/offlineStorage";
import { downloadPDF } from "@/utils/fileDownloader";
import { InvoicePreviewDialog } from "@/components/invoice/InvoicePreviewDialog";

import { InvoiceSelectionModal, OrderForInvoice } from "./InvoiceSelectionModal";

interface VisitInvoicePDFGeneratorProps {
  orders: OrderForInvoice[];
  customerPhone?: string;
  className?: string;
}

export const VisitInvoicePDFGenerator = ({ orders, customerPhone, className }: VisitInvoicePDFGeneratorProps) => {
  const [loading, setLoading] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingSMS, setSendingSMS] = useState(false);
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [actionType, setActionType] = useState<'download' | 'whatsapp' | 'email' | 'sms' | 'view'>('download');
  const [previewOrder, setPreviewOrder] = useState<OrderForInvoice | null>(null);
  const connectivityStatus = useConnectivity();

  const generatePDFForOrder = async (orderId: string) => {
    setLoading(true);
    try {
      const { blob, invoiceNumber } = await fetchAndGenerateInvoice(orderId);
      await downloadPDF(blob, `invoice-${invoiceNumber}.pdf`);


      toast.success("Invoice downloaded successfully!");
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      toast.error(error.message || "Failed to generate invoice");
    } finally {
      setLoading(false);
      setShowSelectionModal(false);
    }
  };

  const generateAllPDFs = async () => {
    setLoading(true);
    try {
      for (const order of orders) {
        const { blob, invoiceNumber } = await fetchAndGenerateInvoice(order.id);
        await downloadPDF(blob, `invoice-${invoiceNumber}.pdf`);
      }
      toast.success(`${orders.length} invoices downloaded successfully!`);
    } catch (error: any) {
      console.error('Error generating PDFs:', error);
      toast.error(error.message || "Failed to generate invoices");
    } finally {
      setLoading(false);
      setShowSelectionModal(false);
    }
  };

  const handleDownloadClick = () => {
    if (orders.length === 0) {
      toast.error("No orders to generate invoice for");
      return;
    }
    
    if (orders.length === 1) {
      generatePDFForOrder(orders[0].id);
    } else {
      setActionType('download');
      setShowSelectionModal(true);
    }
  };

  const sendViaWhatsAppForOrder = async (orderId: string) => {
    if (!customerPhone) {
      toast.error("Customer phone number not available");
      return;
    }

    setSendingWhatsApp(true);
    try {
      const { blob, invoiceNumber } = await fetchAndGenerateInvoice(orderId);
      const fileName = `${invoiceNumber || orderId}.pdf`;
      const filePath = `public/${fileName}`;

      if (connectivityStatus === 'offline') {
        console.log('📴 Offline: Queueing invoice send for later');
        
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        
        const base64Blob = await base64Promise;
        
        await offlineStorage.addToSyncQueue('SEND_INVOICE', {
          orderId,
          customerPhone,
          invoiceNumber,
          fileName,
          invoiceBlob: base64Blob
        });
        
        toast.success("📤 Invoice queued - Will send when online");
        setSendingWhatsApp(false);
        setShowSelectionModal(false);
        return;
      }

      // Upload to public/ path (same as AllInvoicesList)
      const { error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(filePath, blob, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('invoices')
        .getPublicUrl(filePath);

      // Send via WhatsApp using the same template-based approach as AllInvoicesList
      await autoSendInvoiceWhatsApp({ invoiceNumber, pdfUrl: urlData.publicUrl });
      
      toast.success("Invoice sent via WhatsApp!");
    } catch (error: any) {
      console.error('Error sending invoice via WhatsApp:', error);
      toast.error(error.message || "Failed to send invoice via WhatsApp");
    } finally {
      setSendingWhatsApp(false);
      setShowSelectionModal(false);
    }
  };

  const handleWhatsAppClick = () => {
    if (!customerPhone) {
      toast.error("Customer phone number not available");
      return;
    }
    
    if (orders.length === 0) {
      toast.error("No orders to share invoice for");
      return;
    }
    
    if (orders.length === 1) {
      sendViaWhatsAppForOrder(orders[0].id);
    } else {
      setActionType('whatsapp');
      setShowSelectionModal(true);
    }
  };

  const handleEmailClick = () => {
    if (orders.length === 0) {
      toast.error("No orders to share invoice for");
      return;
    }
    
    if (orders.length === 1) {
      sendViaEmail();
    } else {
      setActionType('email');
      setShowSelectionModal(true);
    }
  };

  const handleSMSClick = () => {
    if (orders.length === 0) {
      toast.error("No orders to share invoice for");
      return;
    }
    
    if (orders.length === 1) {
      sendViaSMS();
    } else {
      setActionType('sms');
      setShowSelectionModal(true);
    }
  };

  const sendViaEmail = async () => {
    setSendingEmail(true);
    try {
      toast.info("Email sharing coming soon!");
    } catch (error: any) {
      console.error('Error sending email:', error);
      toast.error("Failed to send email");
    } finally {
      setSendingEmail(false);
      setShowSelectionModal(false);
    }
  };

  const sendViaSMS = async () => {
    setSendingSMS(true);
    try {
      toast.info("SMS sharing coming soon!");
    } catch (error: any) {
      console.error('Error sending SMS:', error);
      toast.error("Failed to send SMS");
    } finally {
      setSendingSMS(false);
      setShowSelectionModal(false);
    }
  };

  const openPreviewForOrder = (order: OrderForInvoice) => {
    setPreviewOrder(order);
  };

  const handleViewClick = () => {
    if (orders.length === 0) {
      toast.error("No orders to view");
      return;
    }
    if (orders.length === 1) {
      openPreviewForOrder(orders[0]);
    } else {
      setActionType('view');
      setShowSelectionModal(true);
    }
  };

  const handleModalSelect = (orderId: string) => {
    switch (actionType) {
      case 'download':
        generatePDFForOrder(orderId);
        break;
      case 'whatsapp':
        sendViaWhatsAppForOrder(orderId);
        break;
      case 'email':
        sendViaEmail();
        break;
      case 'sms':
        sendViaSMS();
        break;
      case 'view': {
        const o = orders.find(x => x.id === orderId);
        if (o) {
          setShowSelectionModal(false);
          openPreviewForOrder(o);
        }
        break;
      }
    }
  };

  if (orders.length === 0) {
    return null;
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        {/* View Invoice Button */}
        <Button
          variant="outline"
          size="sm"
          disabled={loading || sendingWhatsApp || sendingEmail || sendingSMS}
          onClick={handleViewClick}
          className="flex-1"
        >
          <Eye className="mr-2 h-4 w-4" />
          {orders.length > 1 ? `View (${orders.length})` : "View"}
        </Button>

        {/* Invoice Download Button */}
        <Button
          variant="outline"
          size="sm"
          disabled={loading || sendingWhatsApp || sendingEmail || sendingSMS}
          onClick={handleDownloadClick}
          className="flex-1"
        >
          <Download className="mr-2 h-4 w-4" />
          {loading ? "Generating..." : orders.length > 1 ? `Invoice (${orders.length})` : "Invoice"}
        </Button>

        {/* Share Options */}
        {customerPhone && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Share:</span>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={loading || sendingWhatsApp}
                onClick={handleWhatsAppClick}
                title="Share via WhatsApp"
              >
                <MessageCircle className="h-4 w-4 text-green-600" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={loading || sendingEmail}
                onClick={handleEmailClick}
                title="Share via Email"
              >
                <Mail className="h-4 w-4 text-blue-600" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={loading || sendingSMS}
                onClick={handleSMSClick}
                title="Share via SMS"
              >
                <MessageSquare className="h-4 w-4 text-orange-600" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Selection Modal for Multiple Orders */}
      <InvoiceSelectionModal
        open={showSelectionModal}
        onOpenChange={setShowSelectionModal}
        orders={orders}
        actionType={actionType}
        onSelectOrder={handleModalSelect}
        onSelectAll={actionType === 'download' ? generateAllPDFs : undefined}
        isLoading={loading || sendingWhatsApp || sendingEmail || sendingSMS}
      />
    </>
  );
};
