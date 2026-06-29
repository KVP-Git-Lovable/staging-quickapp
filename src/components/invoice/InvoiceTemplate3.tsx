// jspdf, jspdf-autotable loaded dynamically in handler
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { downloadPDF } from "@/utils/fileDownloader";
import { resolveLineTax } from "@/utils/taxCalc";


interface InvoiceTemplate3Props {
  company: any;
  retailer: any;
  cartItems: any[];
  orderId?: string;
}

export default function InvoiceTemplate3({
  company,
  retailer,
  cartItems,
  orderId,
}: InvoiceTemplate3Props) {
  const generatePDF = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      let yPos = 15;

      // Elegant Header with Line
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text(company.name || "Company Name", 15, yPos);
      
      yPos += 8;
      doc.setLineWidth(0.5);
      doc.line(15, yPos, pageWidth - 15, yPos);
      
      yPos += 8;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(company.address || "", 15, yPos);
      yPos += 5;
      doc.text(`GSTIN: ${company.gstin || "N/A"} | Phone: ${company.contact_phone || ""} | Email: ${company.email || ""}`, 15, yPos);
      
      yPos += 15;

      // Invoice Header
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("INVOICE", 15, yPos);
      
      doc.setFontSize(10);
      doc.text(`Invoice #: ${orderId?.slice(0, 8) || "N/A"}`, pageWidth - 15, yPos, { align: "right" });
      yPos += 6;
      doc.setFont("helvetica", "normal");
      doc.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - 15, yPos, { align: "right" });
      
      yPos += 15;

      // Two Column Layout - Bill To and Ship From
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("BILL TO:", 15, yPos);
      
      yPos += 6;
      doc.setFont("helvetica", "normal");
      doc.text(retailer.name || "Retailer", 15, yPos);
      yPos += 5;
      doc.text(retailer.address || "", 15, yPos, { maxWidth: 80 });
      yPos += 5;
      if (retailer.gst_number) {
        doc.text(`GSTIN: ${retailer.gst_number}`, 15, yPos);
      }
      
      yPos += 15;

      // Items Table - Professional Style
      const tableData = cartItems.map((item, index) => [
        index + 1,
        item.product_name || item.name,
        item.hsn_code || "-",
        item.unit || "Piece",
        item.quantity,
        `₹${(item.rate || item.price || 0).toFixed(2)}`,
        `₹${((item.quantity || 0) * (item.rate || item.price || 0)).toFixed(2)}`,
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [["#", "Item", "HSN/SAC", "Unit", "Qty", "Rate", "Amount"]],
        body: tableData,
        theme: "striped",
        headStyles: { 
          fillColor: [44, 62, 80],
          textColor: 255,
          fontSize: 8,
          fontStyle: "bold",
        },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 10 },
          2: { cellWidth: 20 },
          3: { cellWidth: 15 },
          4: { cellWidth: 15 },
          6: { halign: "right" },
        },
        margin: { left: 15, right: 15 },
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;

      // Totals with elegant spacing
      const subtotal = cartItems.reduce((sum, item) => sum + (item.quantity || 0) * (item.rate || item.price || 0), 0);
      const lineTaxes = cartItems.map((it: any) => resolveLineTax(it));
      const cgst = lineTaxes.reduce((s, l) => s + l.cgst, 0);
      const sgst = lineTaxes.reduce((s, l) => s + l.sgst, 0);
      const igst = lineTaxes.reduce((s, l) => s + l.igst, 0);
      const cess = lineTaxes.reduce((s, l) => s + l.cess, 0);
      const total = subtotal + cgst + sgst + igst + cess;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      
      const rightCol = pageWidth - 15;
      const labelX = pageWidth - 75;
      
      doc.text("Subtotal:", labelX, yPos);
      doc.text(`₹${subtotal.toFixed(2)}`, rightCol, yPos, { align: "right" });
      yPos += 6;
      
      doc.text("CGST:", labelX, yPos);
      doc.text(`₹${cgst.toFixed(2)}`, rightCol, yPos, { align: "right" });
      yPos += 6;
      
      doc.text("SGST:", labelX, yPos);
      doc.text(`₹${sgst.toFixed(2)}`, rightCol, yPos, { align: "right" });
      yPos += 6;

      if (igst > 0) {
        doc.text("IGST:", labelX, yPos);
        doc.text(`₹${igst.toFixed(2)}`, rightCol, yPos, { align: "right" });
        yPos += 6;
      }
      if (cess > 0) {
        doc.text("CESS:", labelX, yPos);
        doc.text(`₹${cess.toFixed(2)}`, rightCol, yPos, { align: "right" });
        yPos += 6;
      }
      yPos += 2;
      
      // Total with line
      doc.setLineWidth(0.5);
      doc.line(labelX, yPos - 2, rightCol, yPos - 2);
      
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("TOTAL:", labelX, yPos + 4);
      doc.text(`₹${total.toFixed(2)}`, rightCol, yPos + 4, { align: "right" });

      
      yPos += 15;

      // Bank Details Box
      if (company.bank_name) {
        const bankBoxHeight = company.qr_upi || company.qr_code_url ? 30 : 20;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.rect(15, yPos, pageWidth - 30, bankBoxHeight);
        
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("BANK DETAILS", 20, yPos + 6);
        yPos += 11;
        doc.setFont("helvetica", "normal");
        doc.text(`Bank: ${company.bank_name}`, 20, yPos);
        yPos += 5;
        doc.text(`Account: ${company.bank_account || ""} | IFSC: ${company.ifsc || ""}`, 20, yPos);
        if (company.qr_upi) {
          yPos += 5;
          doc.text(`UPI ID: ${company.qr_upi}`, 20, yPos);
        }
        
        // Add QR Code if available
        if (company.qr_code_url) {
          try {
            const response = await fetch(company.qr_code_url);
            const blob = await response.blob();
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve, reject) => {
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            
            const imgFormat = company.qr_code_url.toLowerCase().includes('.png') ? 'PNG' : 'JPEG';
            const qrYPos = yPos - (company.qr_upi ? 15 : 10);
            doc.addImage(base64, imgFormat, pageWidth - 45, qrYPos, 25, 25);
            doc.setFontSize(6);
            doc.text("Scan to Pay", pageWidth - 32, qrYPos + 27, { align: "center" });
          } catch (error) {
            console.error("Error loading QR code:", error);
          }
        }
        
        yPos += 5;
      }

      // Footer
      yPos = doc.internal.pageSize.getHeight() - 15;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text("This is a computer-generated invoice", pageWidth / 2, yPos, { align: "center" });

      // Save PDF using cross-platform downloader
      const pdfBlob = doc.output('blob');
      await downloadPDF(pdfBlob, `Invoice_${orderId?.slice(0, 8) || Date.now()}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate invoice");
    }
  };

  return (
    <Button onClick={generatePDF} className="w-full" variant="outline">
      <Download className="w-4 h-4 mr-2" />
      Download Invoice (Template 3)
    </Button>
  );
}
