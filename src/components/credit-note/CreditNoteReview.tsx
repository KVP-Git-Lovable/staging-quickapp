import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Link2 } from "lucide-react";
import { SelectedItem } from "./RetailerInvoiceList";
import { computeLineTax } from "@/utils/taxCalc";

interface CreditNoteReviewProps {
  items: SelectedItem[];
  reason: string;
  reasonNotes: string;
}

export default function CreditNoteReview({ items, reason, reasonNotes }: CreditNoteReviewProps) {
  // Per-line tax using each line's original GST% (from the order_item snapshot or product fallback).
  const lineTaxes = items.map((i) =>
    computeLineTax({ taxableAmount: i.returnQuantity * i.rate, gstPercentage: i.gstRate })
  );
  const subTotal = items.reduce((sum, i) => sum + i.returnQuantity * i.rate, 0);
  const sgst = lineTaxes.reduce((s, l) => s + l.sgst, 0);
  const cgst = lineTaxes.reduce((s, l) => s + l.cgst, 0);
  const total = subTotal + sgst + cgst;

  const groupedByInvoice = items.reduce((acc, item) => {
    if (!acc[item.invoiceNumber]) acc[item.invoiceNumber] = [];
    acc[item.invoiceNumber].push(item);
    return acc;
  }, {} as Record<string, SelectedItem[]>);

  const referenceInvoices = Object.keys(groupedByInvoice);

  return (
    <div className="space-y-4">
      {/* Reference Invoices - prominent display */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Linked Reference Invoice(s)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {referenceInvoices.map((inv) => (
            <div key={inv} className="flex items-center justify-between p-2 rounded-md bg-background border">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{inv || "N/A"}</span>
              </div>
              <Badge variant="secondary" className="text-xs">
                {groupedByInvoice[inv].length} item(s)
              </Badge>
            </div>
          ))}
          <p className="text-xs text-muted-foreground mt-1">
            This credit note will reference the above invoice(s)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Items to Credit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(groupedByInvoice).map(([inv, invItems]) => (
            <div key={inv}>
              <p className="text-xs font-semibold text-muted-foreground mb-1">From Invoice: {inv}</p>
              {invItems.map((item, idx) => {
                const lt = computeLineTax({ taxableAmount: item.returnQuantity * item.rate, gstPercentage: item.gstRate });
                return (
                  <div key={idx} className="py-1 border-b last:border-0 space-y-0.5">
                    <div className="flex justify-between items-center text-sm">
                      <div>
                        <span className="font-medium">{item.productName}</span>
                        <span className="text-muted-foreground text-xs ml-2">
                          {item.returnQuantity} × ₹{item.rate.toFixed(2)}
                        </span>
                      </div>
                      <span className="font-medium">₹{(item.returnQuantity * item.rate).toFixed(2)}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground pl-1">
                      CGST {(lt.taxRate / 2).toFixed(2)}% ₹{lt.cgst.toFixed(2)} • SGST {(lt.taxRate / 2).toFixed(2)}% ₹{lt.sgst.toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span>Sub Total</span>
            <span>₹{subTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>SGST</span>
            <span>₹{sgst.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>CGST</span>
            <span>₹{cgst.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold border-t pt-2">
            <span>Total Credit</span>
            <span className="text-destructive">₹{Math.round(total)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Reason:</span>
            <Badge variant="outline">{reason.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Badge>
          </div>
          {reasonNotes && <p className="text-sm text-muted-foreground">{reasonNotes}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
