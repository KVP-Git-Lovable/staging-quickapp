// jspdf, jspdf-autotable loaded dynamically in handler
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { downloadPDF } from "@/utils/fileDownloader";
import { resolveLineTax } from "@/utils/taxCalc";


interface InvoiceTemplate1Props {
  company: any;
  retailer: any;
  cartItems: any[];
  orderId?: string;
}

export default function InvoiceTemplate1({
  company,
  retailer,
  cartItems,
  orderId,
}: InvoiceTemplate1Props) {
  const generatePDF = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Add border
      doc.setLineWidth(1);
      doc.rect(10, 10, pageWidth - 20, doc.internal.pageSize.getHeight() - 20);

      let yPos = 20;

      // Company Logo and Header
      if (company.logo_url) {
        try {
          doc.addImage(company.logo_url, "PNG", 15, yPos, 30, 15);
        } catch (e) {
          console.log("Logo load failed");
        }
      }

      // Company Details
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(company.name || "Company Name", pageWidth / 2, yPos + 5, { align: "center" });
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(company.address || "", pageWidth / 2, yPos + 12, { align: "center" });
      doc.text(`GSTIN: ${company.gstin || "N/A"}`, pageWidth / 2, yPos + 17, { align: "center" });
      doc.text(`Phone: ${company.contact_phone || ""} | Email: ${company.email || ""}`, pageWidth / 2, yPos + 22, { align: "center" });

      yPos += 35;

      // Invoice Title
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("TAX INVOICE", pageWidth / 2, yPos, { align: "center" });
      yPos += 10;

      // Bill To and Invoice Details
      doc.setFontSize(10);
      doc.text("Bill To:", 15, yPos);
      doc.text(`Invoice No: ${orderId?.slice(0, 8) || "N/A"}`, pageWidth - 80, yPos);
      yPos += 5;
      
      doc.setFont("helvetica", "normal");
      doc.text(retailer.name || "Retailer", 15, yPos);
      doc.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - 80, yPos);
      yPos += 5;
      
      doc.text(retailer.address || "", 15, yPos, { maxWidth: 80 });
      if (retailer.gst_number) {
        yPos += 5;
        doc.text(`GSTIN: ${retailer.gst_number}`, 15, yPos);
      }
      
      yPos += 15;

      // Items Table
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
        head: [["#", "Item Description", "HSN/SAC", "Unit", "Qty", "Rate", "Amount"]],
        body: tableData,
        theme: "grid",
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 8 },
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

      // Totals
      const subtotal = cartItems.reduce((sum, item) => sum + (item.quantity || 0) * (item.rate || item.price || 0), 0);
      const lineTaxes = cartItems.map((it: any) => resolveLineTax(it));
      const cgst = lineTaxes.reduce((s, l) => s + l.cgst, 0);
      const sgst = lineTaxes.reduce((s, l) => s + l.sgst, 0);
      const igst = lineTaxes.reduce((s, l) => s + l.igst, 0);
      const cess = lineTaxes.reduce((s, l) => s + l.cess, 0);
      const total = subtotal + cgst + sgst + igst + cess;

      const rightCol = pageWidth - 15;
      const labelX = pageWidth - 75;

      doc.setFontSize(9);
      doc.text("Subtotal:", labelX, yPos);
      doc.text(`₹${subtotal.toFixed(2)}`, rightCol, yPos, { align: "right" });
      yPos += 7;
      
      doc.text("CGST:", labelX, yPos);
      doc.text(`₹${cgst.toFixed(2)}`, rightCol, yPos, { align: "right" });
      yPos += 7;
      
      doc.text("SGST:", labelX, yPos);
      doc.text(`₹${sgst.toFixed(2)}`, rightCol, yPos, { align: "right" });
      yPos += 7;

      if (igst > 0) {
        doc.text("IGST:", labelX, yPos);
        doc.text(`₹${igst.toFixed(2)}`, rightCol, yPos, { align: "right" });
        yPos += 7;
      }
      if (cess > 0) {
        doc.text("CESS:", labelX, yPos);
        doc.text(`₹${cess.toFixed(2)}`, rightCol, yPos, { align: "right" });
        yPos += 7;
      }

      doc.setFont("helvetica", "bold");
      doc.text("Total:", labelX, yPos);
      doc.text(`₹${total.toFixed(2)}`, rightCol, yPos, { align: "right" });

      
      yPos += 15;

      // Bank Details
      if (company.bank_name) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("Bank Details:", 15, yPos);
        yPos += 5;
        doc.setFont("helvetica", "normal");
        doc.text(`Bank: ${company.bank_name}`, 15, yPos);
        yPos += 5;
        doc.text(`A/c: ${company.bank_account || ""} | IFSC: ${company.ifsc || ""}`, 15, yPos);
        yPos += 5;
        if (company.qr_upi) {
          doc.text(`UPI ID: ${company.qr_upi}`, 15, yPos);
          yPos += 5;
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
            doc.addImage(base64, imgFormat, pageWidth - 45, yPos - 20, 30, 30);
            doc.setFontSize(7);
            doc.text("Scan to Pay", pageWidth - 30, yPos + 12, { align: "center" });
          } catch (error) {
            console.error("Error loading QR code:", error);
          }
        }
      }

      // Save PDF using cross-platform downloader
      const pdfBlob = doc.output('blob');
      await downloadPDF(pdfBlob, `Invoice_${orderId?.slice(0, 8) || Date.now()}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate invoice");
    }
  };

  return (
    <Button onClick={generatePDF} className="w-full">
      <Download className="w-4 h-4 mr-2" />
      Download Invoice (Template 1)
    </Button>
  );
}
