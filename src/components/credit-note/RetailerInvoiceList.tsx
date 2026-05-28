import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, ScanLine } from "lucide-react";
import BarcodeScanInput from "./BarcodeScanInput";

export interface SelectedItem {
  orderId: string;
  invoiceNumber: string;
  productId: string;
  productName: string;
  hsnCode: string;
  unit: string;
  maxQuantity: number;
  returnQuantity: number;
  rate: number;
  barcode: string;
}

interface RetailerInvoiceListProps {
  retailerId: string;
  selectedItems: SelectedItem[];
  onSelectionChange: (items: SelectedItem[]) => void;
}

export default function RetailerInvoiceList({ retailerId, selectedItems, onSelectionChange }: RetailerInvoiceListProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [barcodeFilter, setBarcodeFilter] = useState("");

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select("id, invoice_number, created_at, total_amount, order_items!order_items_order_id_fkey(id, product_id, product_name, quantity, rate, total, hsn_code, unit, barcode, sku)")
        .eq("retailer_id", retailerId)
        .not("invoice_number", "is", null)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setOrders(data);
      }
      setLoading(false);
    };
    if (retailerId) fetchOrders();
  }, [retailerId]);

  // When barcode scanned, find matching products
  const matchingProductIds = useMemo(() => {
    if (!barcodeFilter) return new Set<string>();
    const code = barcodeFilter.toLowerCase();
    const ids = new Set<string>();
    orders.forEach((order) => {
      (order.order_items || []).forEach((item: any) => {
        const barcode = (item.barcode || "").toLowerCase();
        const sku = (item.sku || "").toLowerCase();
        const productName = (item.product_name || "").toLowerCase();
        if (barcode.includes(code) || sku.includes(code) || productName.includes(code)) {
          ids.add(item.product_id);
        }
      });
    });
    return ids;
  }, [barcodeFilter, orders]);

  const isItemSelected = (orderId: string, productId: string) =>
    selectedItems.some((s) => s.orderId === orderId && s.productId === productId);

  const getSelectedItem = (orderId: string, productId: string) =>
    selectedItems.find((s) => s.orderId === orderId && s.productId === productId);

  const toggleItem = (orderId: string, invoiceNumber: string, item: any) => {
    const exists = isItemSelected(orderId, item.product_id);
    if (exists) {
      onSelectionChange(selectedItems.filter((s) => !(s.orderId === orderId && s.productId === item.product_id)));
    } else {
      onSelectionChange([
        ...selectedItems,
        {
          orderId,
          invoiceNumber,
          productId: item.product_id,
          productName: item.product_name,
          hsnCode: item.hsn_code || "",
          unit: item.unit || "Piece",
          maxQuantity: Number(item.quantity) || 0,
          returnQuantity: Number(item.quantity) || 0,
          rate: Number(item.rate) || 0,
          barcode: item.barcode || item.sku || "",
        },
      ]);
    }
  };

  const updateReturnQty = (orderId: string, productId: string, qty: number) => {
    onSelectionChange(
      selectedItems.map((s) =>
        s.orderId === orderId && s.productId === productId
          ? { ...s, returnQuantity: Math.min(Math.max(0, qty), s.maxQuantity) }
          : s
      )
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="h-8 w-8 mx-auto mb-2" />
        <p>No invoices found for this retailer</p>
      </div>
    );
  }

  // Filter orders to show only those with matching items when barcode is active
  const filteredOrders = barcodeFilter
    ? orders.filter((o) =>
        (o.order_items || []).some((item: any) => matchingProductIds.has(item.product_id))
      )
    : orders;

  return (
    <div className="space-y-4">
      <BarcodeScanInput
        onScan={setBarcodeFilter}
        onClear={() => setBarcodeFilter("")}
        activeCode={barcodeFilter}
      />

      {barcodeFilter && (
        <div className="text-sm text-muted-foreground">
          Found matches in <span className="font-semibold">{filteredOrders.length}</span> invoice(s)
        </div>
      )}

      {filteredOrders.map((order) => (
        <Card key={order.id} className="border">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {order.invoice_number}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(order.created_at).toLocaleDateString("en-GB")}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            {(order.order_items || []).map((item: any) => {
              const isHighlighted = barcodeFilter && matchingProductIds.has(item.product_id);
              const selected = isItemSelected(order.id, item.product_id);
              const selItem = getSelectedItem(order.id, item.product_id);

              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-2 rounded-md border ${
                    isHighlighted ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"
                  } ${selected ? "bg-accent/30" : ""}`}
                >
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => toggleItem(order.id, order.invoice_number, item)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.product_name}</p>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span>Qty: {item.quantity}</span>
                      <span>Rate: ₹{Number(item.rate).toFixed(2)}</span>
                      {item.barcode && <Badge variant="outline" className="text-[10px] px-1">{item.barcode}</Badge>}
                    </div>
                  </div>
                  {selected && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">Return:</span>
                      <Input
                        type="number"
                        min={1}
                        max={selItem?.maxQuantity || 0}
                        value={selItem?.returnQuantity || 0}
                        onChange={(e) => updateReturnQty(order.id, item.product_id, Number(e.target.value))}
                        className="w-16 h-8 text-xs text-center"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
