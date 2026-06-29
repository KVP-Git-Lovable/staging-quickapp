import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface EditInvoiceDialogProps {
  orderId: string;
  invoiceNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface InvoiceItem {
  id?: string;
  description: string;
  hsn_sac: string;
  quantity: number;
  unit: string;
  price_per_unit: number;
  gst_rate: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  total_amount: number;
}

export default function EditInvoiceDialog({ orderId, invoiceNumber, open, onOpenChange, onSaved }: EditInvoiceDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [terms, setTerms] = useState("");

  useEffect(() => {
    if (open && orderId) {
      loadInvoiceData();
    }
  }, [open, orderId]);

  const loadInvoiceData = async () => {
    setLoading(true);
    try {
      // Check if edited invoice exists
      const { data: existingInvoice } = await supabase
        .from("invoices")
        .select("*, invoice_items(*)")
        .eq("order_id", orderId)
        .eq("is_edited", true)
        .single();

      if (existingInvoice) {
        // Load from edited invoice
        setInvoiceData(existingInvoice);
        setItems(existingInvoice.invoice_items.map((item: any) => ({
          id: item.id,
          description: item.description,
          hsn_sac: item.hsn_sac || "",
          quantity: item.quantity,
          unit: item.unit,
          price_per_unit: item.price_per_unit,
          gst_rate: item.gst_rate,
          taxable_amount: item.taxable_amount,
          cgst_amount: item.cgst_amount,
          sgst_amount: item.sgst_amount,
          total_amount: item.total_amount,
        })));
        setTerms(existingInvoice.terms || "");
      } else {
        // Load from order
        const { data: order, error: orderError } = await supabase
          .from("orders")
          .select("*")
          .eq("id", orderId)
          .single();

        if (orderError) throw orderError;

        const { data: cartItems, error: cartError } = await supabase
          .from("order_items")
          .select("*")
          .eq("order_id", orderId);

        if (cartError) throw cartError;

        // Phase 4: read stored per-line tax from order_items; fall back to helper for legacy lines.
        const { resolveLineTax } = await import("@/utils/taxCalc");

        const itemsData = (cartItems || []).map((item: any) => {
          const quantity = Number(item.quantity) || 0;
          const pricePerUnit = Number(item.rate) || 0;
          const taxableAmount = Number(item.total ?? quantity * pricePerUnit) || 0;

          const lt = resolveLineTax(item);
          const cgstAmount = lt.cgst;
          const sgstAmount = lt.sgst;
          const gstRate = Number(item.tax_rate_snapshot ?? lt.taxRate) || 0;
          const totalAmount = taxableAmount + cgstAmount + sgstAmount + lt.igst + lt.cess;

          return {
            description: item.product_name,
            hsn_sac: item.hsn_code || "",
            quantity,
            unit: item.unit,
            price_per_unit: pricePerUnit,
            gst_rate: gstRate,
            taxable_amount: taxableAmount,
            cgst_amount: cgstAmount,
            sgst_amount: sgstAmount,
            total_amount: totalAmount,
          };
        });


        setItems(itemsData);
        setInvoiceData({ ...order });
        
        // Load company terms
        const { data: company } = await supabase
          .from("companies")
          .select("terms_conditions")
          .limit(1)
          .single();
        
        setTerms(company?.terms_conditions || "");
      }
    } catch (error: any) {
      console.error("Error loading invoice data:", error);
      toast.error("Failed to load invoice data");
    } finally {
      setLoading(false);
    }
  };

  const updateItemCalculations = (item: InvoiceItem): InvoiceItem => {
    const taxableAmount = item.quantity * item.price_per_unit;
    const gstRate = item.gst_rate / 100;
    const cgstAmount = taxableAmount * (gstRate / 2);
    const sgstAmount = taxableAmount * (gstRate / 2);
    const totalAmount = taxableAmount + cgstAmount + sgstAmount;

    return {
      ...item,
      taxable_amount: taxableAmount,
      cgst_amount: cgstAmount,
      sgst_amount: sgstAmount,
      total_amount: totalAmount,
    };
  };

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    newItems[index] = updateItemCalculations(newItems[index]);
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, {
      description: "",
      hsn_sac: "",
      quantity: 1,
      unit: "Piece",
      price_per_unit: 0,
      gst_rate: 5,
      taxable_amount: 0,
      cgst_amount: 0,
      sgst_amount: 0,
      total_amount: 0,
    }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (items.length === 0) {
      toast.error("Please add at least one item");
      return;
    }

    setSaving(true);
    try {
      const subTotal = items.reduce((sum, item) => sum + item.taxable_amount, 0);
      const totalTax = items.reduce((sum, item) => sum + item.cgst_amount + item.sgst_amount, 0);
      const totalAmount = items.reduce((sum, item) => sum + item.total_amount, 0);

      // Check if invoice already exists
      const { data: existingInvoice } = await supabase
        .from("invoices")
        .select("id")
        .eq("order_id", orderId)
        .eq("is_edited", true)
        .single();

      let invoiceId: string;

      if (existingInvoice) {
        // Update existing invoice
        const { error: invoiceError } = await supabase
          .from("invoices")
          .update({
            sub_total: subTotal,
            total_tax: totalTax,
            total_amount: totalAmount,
            terms: terms,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingInvoice.id);

        if (invoiceError) throw invoiceError;
        invoiceId = existingInvoice.id;

        // Delete old items
        await supabase
          .from("invoice_items")
          .delete()
          .eq("invoice_id", invoiceId);
      } else {
        // Create new invoice
        const { data: newInvoice, error: invoiceError } = await supabase
          .from("invoices")
          .insert({
            invoice_number: invoiceNumber,
            order_id: orderId,
            is_edited: true,
            invoice_date: new Date().toISOString().split('T')[0],
            sub_total: subTotal,
            total_tax: totalTax,
            total_amount: totalAmount,
            terms: terms,
          })
          .select()
          .single();

        if (invoiceError) throw invoiceError;
        invoiceId = newInvoice.id;
      }

      // Insert new items
      const itemsToInsert = items.map(item => ({
        invoice_id: invoiceId,
        description: item.description,
        hsn_sac: item.hsn_sac,
        quantity: item.quantity,
        unit: item.unit,
        price_per_unit: item.price_per_unit,
        gst_rate: item.gst_rate,
        taxable_amount: item.taxable_amount,
        cgst_amount: item.cgst_amount,
        sgst_amount: item.sgst_amount,
        total_amount: item.total_amount,
      }));

      const { error: itemsError } = await supabase
        .from("invoice_items")
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      toast.success("Invoice saved successfully!");
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving invoice:", error);
      toast.error("Failed to save invoice");
    } finally {
      setSaving(false);
    }
  };

  const totalAmount = items.reduce((sum, item) => sum + item.total_amount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Invoice: {invoiceNumber}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Invoice Items Table */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>Invoice Items</Label>
                <Button size="sm" onClick={addItem} variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[250px]">Product</TableHead>
                      <TableHead className="w-[100px]">HSN/SAC</TableHead>
                      <TableHead className="w-[80px]">Qty</TableHead>
                      <TableHead className="w-[80px]">Unit</TableHead>
                      <TableHead className="w-[100px]">Rate</TableHead>
                      <TableHead className="w-[80px]">GST%</TableHead>
                      <TableHead className="w-[100px]">Amount</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Input
                            value={item.description}
                            onChange={(e) => handleItemChange(index, "description", e.target.value)}
                            placeholder="Product name"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.hsn_sac}
                            onChange={(e) => handleItemChange(index, "hsn_sac", e.target.value)}
                            placeholder="HSN/SAC"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(index, "quantity", parseFloat(e.target.value) || 0)}
                            min="0"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.unit}
                            onChange={(e) => handleItemChange(index, "unit", e.target.value)}
                            placeholder="Unit"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.price_per_unit}
                            onChange={(e) => handleItemChange(index, "price_per_unit", parseFloat(e.target.value) || 0)}
                            min="0"
                            step="0.01"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.gst_rate}
                            onChange={(e) => handleItemChange(index, "gst_rate", parseFloat(e.target.value) || 0)}
                            min="0"
                            max="28"
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          ₹{item.total_amount.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeItem(index)}
                            className="h-8 w-8 p-0"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Total */}
            <div className="flex justify-end">
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-lg font-bold">
                  Total Amount: ₹{totalAmount.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Terms & Conditions */}
            <div>
              <Label htmlFor="terms">Terms & Conditions</Label>
              <Textarea
                id="terms"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                rows={3}
                placeholder="Enter terms and conditions"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Invoice
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
