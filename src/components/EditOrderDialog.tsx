import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUnitMaster } from "@/hooks/useUnitMaster";

interface EditOrderDialogProps {
  orderId: string;
  retailerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface OrderItem {
  id?: string;
  product_name: string;
  quantity: number;
  rate: number;
  unit: string;
  total: number;
  discount_percent: number;
  gst_percent: number;
  hsn_code?: string;
  originalUnit?: string;
  originalRate?: number;
}

export default function EditOrderDialog({ orderId, retailerName, open, onOpenChange, onSaved }: EditOrderDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orderData, setOrderData] = useState<any>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [orderDiscount, setOrderDiscount] = useState(0);
  
  // Fetch units from uom_master
  const { units } = useUnitMaster();

  useEffect(() => {
    if (open && orderId) {
      loadOrderData();
    }
  }, [open, orderId]);

  const loadOrderData = async () => {
    setLoading(true);
    try {
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

      if (orderError) throw orderError;

      const { data: orderItems, error: itemsError } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId);

      if (itemsError) throw itemsError;

      setOrderData(order);
      setOrderDiscount(Number(order.discount_amount) || 0);
      setItems(
        (orderItems || []).map((item: any) => {
          const qty = Number(item.quantity) || 0;
          const rate = Number(item.rate) || 0;
          const gross = qty * rate;
          const itemDisc = Number(item.discount_amount) || 0;
          const discPct = gross > 0 ? (itemDisc / gross) * 100 : 0;
          return {
            id: item.id,
            product_name: item.product_name,
            quantity: qty,
            rate,
            unit: item.unit || "Piece",
            total: Number(item.total) || gross,
            discount_percent: parseFloat(discPct.toFixed(2)),
            gst_percent: Number(item.gst_percentage ?? item.tax_rate ?? 18) || 18,
            hsn_code: item.hsn_code || "",
            originalUnit: item.unit || "Piece",
            originalRate: rate,
          } as OrderItem;
        })
      );
    } catch (error: any) {
      console.error("Error loading order data:", error);
      toast.error("Failed to load order data");
    } finally {
      setLoading(false);
    }
  };

  const getUnitConversionFactor = (fromUnit: string, toUnit: string): number => {
    const weightInGrams: Record<string, number> = { Gram: 1, KG: 1000 };
    const volumeInML: Record<string, number> = { ML: 1, Liter: 1000 };
    if (weightInGrams[fromUnit] !== undefined && weightInGrams[toUnit] !== undefined) {
      return weightInGrams[toUnit] / weightInGrams[fromUnit];
    }
    if (volumeInML[fromUnit] !== undefined && volumeInML[toUnit] !== undefined) {
      return volumeInML[toUnit] / volumeInML[fromUnit];
    }
    return 1;
  };

  const recomputeTotal = (item: OrderItem): OrderItem => ({
    ...item,
    total: item.quantity * item.rate,
  });

  const handleItemChange = (index: number, field: keyof OrderItem, value: any) => {
    const newItems = [...items];
    const currentItem = newItems[index];

    if (field === "unit" && currentItem.originalRate !== undefined) {
      const conversionFactor = getUnitConversionFactor(currentItem.originalUnit || "Piece", value);
      const newRate = currentItem.originalRate * conversionFactor;
      newItems[index] = {
        ...currentItem,
        unit: value,
        rate: parseFloat(newRate.toFixed(4)),
      };
    } else {
      newItems[index] = { ...currentItem, [field]: value };
    }

    newItems[index] = recomputeTotal(newItems[index]);
    setItems(newItems);
  };

  const addItem = () => {
    setItems([
      ...items,
      {
        product_name: "",
        quantity: 1,
        rate: 0,
        unit: "Piece",
        total: 0,
        discount_percent: 0,
        gst_percent: 18,
      },
    ]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // ===== Detailed totals (matches Cart breakdown) =====
  const totals = useMemo(() => {
    let subtotal = 0;
    let itemDiscountTotal = 0;
    let taxable = 0;
    let cgst = 0;
    let sgst = 0;

    items.forEach((it) => {
      const gross = it.quantity * it.rate;
      const disc = (gross * (it.discount_percent || 0)) / 100;
      const afterDisc = gross - disc;
      const gst = (afterDisc * (it.gst_percent || 0)) / 100;
      subtotal += gross;
      itemDiscountTotal += disc;
      taxable += afterDisc;
      cgst += gst / 2;
      sgst += gst / 2;
    });

    const totalDiscount = itemDiscountTotal + (orderDiscount || 0);
    const finalTaxable = Math.max(0, taxable - (orderDiscount || 0));
    // Re-derive GST after order-level discount proportionally
    const gstScale = taxable > 0 ? finalTaxable / taxable : 0;
    const cgstFinal = cgst * gstScale;
    const sgstFinal = sgst * gstScale;
    const taxAmount = cgstFinal + sgstFinal;
    const rawGrand = finalTaxable + taxAmount;
    const grandTotal = Math.round(rawGrand);
    const roundOff = parseFloat((grandTotal - rawGrand).toFixed(2));

    return {
      subtotal,
      itemDiscountTotal,
      totalDiscount,
      taxable: finalTaxable,
      cgst: cgstFinal,
      sgst: sgstFinal,
      taxAmount,
      roundOff,
      grandTotal,
    };
  }, [items, orderDiscount]);

  const handleSave = async () => {
    if (items.length === 0) {
      toast.error("Please add at least one item");
      return;
    }
    if (items.some((it) => !it.product_name.trim())) {
      toast.error("All items must have a product name");
      return;
    }

    setSaving(true);
    try {
      const { data: existingItems } = await supabase
        .from("order_items")
        .select("product_id, category")
        .eq("order_id", orderId)
        .limit(1);

      const defaultProductId = existingItems?.[0]?.product_id || orderId;
      const defaultCategory = existingItems?.[0]?.category || "General";

      const { error: orderError } = await supabase
        .from("orders")
        .update({
          subtotal: totals.subtotal,
          discount_amount: totals.totalDiscount,
          tax_amount: totals.taxAmount,
          total_amount: totals.grandTotal,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (orderError) throw orderError;

      const { error: deleteError } = await supabase
        .from("order_items")
        .delete()
        .eq("order_id", orderId);

      if (deleteError) throw deleteError;

      const itemsToInsert = items.map((item) => {
        const gross = item.quantity * item.rate;
        const disc = (gross * (item.discount_percent || 0)) / 100;
        const afterDisc = gross - disc;
        const gst = (afterDisc * (item.gst_percent || 0)) / 100;
        return {
          order_id: orderId,
          product_id: defaultProductId,
          product_name: item.product_name,
          quantity: item.quantity,
          rate: item.rate,
          unit: item.unit || "Piece",
          total: item.total,
          category: defaultCategory,
          discount_amount: disc,
          tax_amount: gst,
          gst_percentage: item.gst_percent,
          hsn_code: item.hsn_code || null,
        };
      });

      const { error: insertError } = await supabase
        .from("order_items")
        .insert(itemsToInsert);

      if (insertError) throw insertError;

      toast.success("Order updated successfully!");
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving order:", error);
      toast.error("Failed to save order: " + (error?.message || ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit Order: {retailerName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>Order Items</Label>
                <Button size="sm" onClick={addItem} variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[220px]">Product Name</TableHead>
                      <TableHead className="w-[90px]">Qty</TableHead>
                      <TableHead className="w-[110px]">Unit</TableHead>
                      <TableHead className="w-[110px]">Rate (₹)</TableHead>
                      <TableHead className="w-[90px]">Disc %</TableHead>
                      <TableHead className="w-[90px]">GST %</TableHead>
                      <TableHead className="w-[140px]">Total (₹)</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => {
                      const gross = item.quantity * item.rate;
                      const disc = (gross * (item.discount_percent || 0)) / 100;
                      const afterDisc = gross - disc;
                      const gst = (afterDisc * (item.gst_percent || 0)) / 100;
                      return (
                        <TableRow key={index}>
                          <TableCell>
                            <Input
                              value={item.product_name}
                              onChange={(e) => handleItemChange(index, "product_name", e.target.value)}
                              placeholder="Product name"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) =>
                                handleItemChange(index, "quantity", parseFloat(e.target.value) || 0)
                              }
                              min="0"
                              step="0.01"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={item.unit}
                              onValueChange={(value) => handleItemChange(index, "unit", value)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {units.map((u) => (
                                  <SelectItem key={u.id} value={u.name}>
                                    {u.name} ({u.code})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.rate}
                              onChange={(e) =>
                                handleItemChange(index, "rate", parseFloat(e.target.value) || 0)
                              }
                              min="0"
                              step="0.01"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.discount_percent}
                              onChange={(e) =>
                                handleItemChange(index, "discount_percent", parseFloat(e.target.value) || 0)
                              }
                              min="0"
                              max="100"
                              step="0.01"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.gst_percent}
                              onChange={(e) =>
                                handleItemChange(index, "gst_percent", parseFloat(e.target.value) || 0)
                              }
                              min="0"
                              max="100"
                              step="0.01"
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            <div>₹{(afterDisc + gst).toFixed(2)}</div>
                            <div className="text-[11px] text-muted-foreground leading-tight">
                              Gross ₹{gross.toFixed(2)} · Disc ₹{disc.toFixed(2)}
                              <br />
                              Taxable ₹{afterDisc.toFixed(2)} · GST ₹{gst.toFixed(2)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeItem(index)}
                              className="h-8 w-8 p-0"
                              disabled={items.length === 1}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Detailed totals panel (matches Cart) */}
            <div className="flex justify-end">
              <div className="w-full max-w-sm border rounded-md p-4 bg-muted/30 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal (Gross)</span>
                  <span>₹{totals.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-destructive">
                  <span>Item Discount</span>
                  <span>- ₹{totals.itemDiscountTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <Label className="text-sm">Order Discount</Label>
                  <Input
                    type="number"
                    value={orderDiscount}
                    onChange={(e) => setOrderDiscount(parseFloat(e.target.value) || 0)}
                    min="0"
                    step="0.01"
                    className="w-28 h-8"
                  />
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span>Taxable Value</span>
                  <span>₹{totals.taxable.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>CGST</span>
                  <span>₹{totals.cgst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST</span>
                  <span>₹{totals.sgst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Round Off</span>
                  <span>
                    {totals.roundOff >= 0 ? "+" : ""}
                    ₹{totals.roundOff.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Grand Total</span>
                  <span>₹{totals.grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
