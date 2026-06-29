// jspdf, jspdf-autotable loaded dynamically in handler
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { downloadPDF } from "@/utils/fileDownloader";
import { resolveLineTax } from "@/utils/taxCalc";


interface InvoiceTemplate2Props {
  company: any;
  retailer: any;
  cartItems: any[];
  orderId?: string;
}

export default function InvoiceTemplate2({
  company,
  retailer,
  cartItems,
  orderId,
}: InvoiceTemplate2Props) {
  const generatePDF = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      let yPos = 15;

      // Modern Header with Color Band
      doc.setFillColor(52, 73, 94);
      doc.rect(0, 0, pageWidth, 40, "F");

      // Company Name in Header
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(company.name || "Company Name", pageWidth / 2, 15, { align: "center" });
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`${company.address || ""} | GSTIN: ${company.gstin || "N/A"}`, pageWidth / 2, 22, { align: "center" });
      doc.text(`${company.contact_phone || ""} | ${company.email || ""}`, pageWidth / 2, 28, { align: "center" });

      // Reset text color
      doc.setTextColor(0, 0, 0);
      yPos = 50;

      // Invoice Details Box
      doc.setFillColor(236, 240, 241);
      doc.rect(15, yPos, pageWidth - 30, 25, "F");
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("INVOICE", 20, yPos + 8);
      doc.text(`#${orderId?.slice(0, 8) || "N/A"}`, pageWidth - 20, yPos + 8, { align: "right" });
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, yPos + 15);
      
      yPos += 35;

      // Bill To Section
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("BILL TO:", 15, yPos);
      yPos += 6;
      
      doc.setFont("helvetica", "normal");
      doc.text(retailer.name || "Retailer", 15, yPos);
      yPos += 5;
      doc.setFontSize(9);
      doc.text(retailer.address || "", 15, yPos, { maxWidth: 80 });
      yPos += 5;
      if (retailer.gst_number) {
        doc.text(`GSTIN: ${retailer.gst_number}`, 15, yPos);
        yPos += 5;
      }
      
      yPos += 10;

      // Items Table - Minimalist Style
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
        head: [["#", "Description", "HSN/SAC", "Unit", "Qty", "Rate", "Amount"]],
        body: tableData,
        theme: "plain",
        headStyles: { 
          fillColor: [52, 73, 94],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 8,
          halign: "left",
        },
        bodyStyles: { textColor: 50, fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          0: { cellWidth: 10 },
          2: { cellWidth: 20 },
          3: { cellWidth: 15 },
          4: { cellWidth: 15 },
          6: { halign: "right" },
        },
        margin: { left: 15, right: 15 },
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      // Totals Section with Box
      const subtotal = cartItems.reduce((sum, item) => sum + (item.quantity || 0) * (item.rate || item.price || 0), 0);
      const lineTaxes = cartItems.map((it: any) => resolveLineTax(it));
      const cgst = lineTaxes.reduce((s, l) => s + l.cgst, 0);
      const sgst = lineTaxes.reduce((s, l) => s + l.sgst, 0);
      const igst = lineTaxes.reduce((s, l) => s + l.igst, 0);
      const cess = lineTaxes.reduce((s, l) => s + l.cess, 0);
      const total = subtotal + cgst + sgst + igst + cess;

      const rightCol = pageWidth - 15;
      const labelX = pageWidth - 75;

      const extraRows = (igst > 0 ? 1 : 0) + (cess > 0 ? 1 : 0);
      doc.setFillColor(245, 247, 250);
      doc.rect(labelX - 10, yPos - 5, rightCol - labelX + 25, 35 + extraRows * 6, "F");

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
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

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Total:", labelX, yPos);
      doc.text(`₹${total.toFixed(2)}`, rightCol, yPos, { align: "right" });

      
      yPos += 20;

      // Bank Details
      if (company.bank_name) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("BANK DETAILS", 15, yPos);
        yPos += 5;
        doc.setFont("helvetica", "normal");
        doc.text(`Bank: ${company.bank_name} | A/c: ${company.bank_account || ""} | IFSC: ${company.ifsc || ""}`, 15, yPos);
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
            doc.addImage(base64, imgFormat, pageWidth - 45, yPos - 15, 30, 30);
            doc.setFontSize(7);
            doc.text("Scan to Pay", pageWidth - 30, yPos + 17, { align: "center" });
          } catch (error) {
            console.error("Error loading QR code:", error);
          }
        }
      }

      // Footer
      yPos = doc.internal.pageSize.getHeight() - 20;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text("Thank you for your business!", pageWidth / 2, yPos, { align: "center" });

      // Save PDF using cross-platform downloader
      const pdfBlob = doc.output('blob');
      await downloadPDF(pdfBlob, `Invoice_${orderId?.slice(0, 8) || Date.now()}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate invoice");
    }
  };

  return (
    <Button onClick={generatePDF} className="w-full" variant="secondary">
      <Download className="w-4 h-4 mr-2" />
      Download Invoice (Template 2)
    </Button>
  );
}
