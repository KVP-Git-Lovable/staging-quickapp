import { useState, useEffect, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Save,
  Lock,
  ArrowLeft,
  Search,
  FileText,
  Pencil,
  Loader2,
  User,
  Phone,
  Camera,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useOfflineOrderEntry } from "@/hooks/useOfflineOrderEntry";
import { submitOrderWithOfflineSupport } from "@/utils/offlineOrderUtils";
import { getLocalTodayDate } from "@/utils/dateUtils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CameraCapture } from "@/components/CameraCapture";
import { usePaymentProofMandatory } from "@/hooks/usePaymentProofMandatory";
import { offlineStorage } from "@/lib/offlineStorage";
import { useCurrency } from "@/contexts/CurrencyContext";
import LineItemUomSelect, { type LineItemUomSelection } from "@/components/uom/LineItemUomSelect";

// ---------- types ----------
interface CounterCustomer {
  id: string;
  name: string;
  phone?: string | null;
}

// ===================================================================
// MOBILE CUSTOMER CARD — accordion-style, bottom-sheet pickers
// ===================================================================
function MobileCustomerCard({
  index,
  row,
  products,
  customers,
  submitting,
  onToggleExpand,
  onPickCustomer,
  onCreateRetailer,
  onAddItemRow,
  onUpdateItem,
  onRemoveItem,
  onSave,
  onSubmit,
  onEdit,
  onDelete,
}: {
  index: number;
  row: CounterRow;
  products: any[];
  customers: CounterCustomer[];
  submitting?: boolean;
  onToggleExpand: () => void;
  onPickCustomer: (r: CounterCustomer) => void;
  onCreateRetailer: (r: CounterCustomer) => void;
  onAddItemRow: () => void;
  onUpdateItem: (itemUid: string, patch: Partial<CounterLineItem>) => void;
  onRemoveItem: (itemUid: string) => void;
  onSave: () => void;
  onSubmit: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { format } = useCurrency();
  const [pickerOpen, setPickerOpen] = useState(false);
  const locked = row.status === "saved" || row.status === "submitted";
  const total = rowAmount(row);

  return (
    <Card className="rounded-2xl shadow-sm border overflow-hidden">
      {/* COLLAPSED HEADER — tappable */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center gap-3 px-3 py-3 text-left active:bg-muted/40 transition-colors"
      >
        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
          {index}
        </div>
        <div className="min-w-0 flex-1">
          {row.customer ? (
            <>
              <div className="text-sm font-semibold truncate">{row.customer.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {row.phoneOverride || row.customer.phone || "—"}
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-medium text-primary">Select Customer</div>
              <div className="text-xs text-muted-foreground">Tap to choose or create</div>
            </>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <div className="text-[11px] text-muted-foreground">
            {row.items.length} item{row.items.length !== 1 ? "s" : ""}
          </div>
          <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            {format(total)}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
            row.expanded && "rotate-180"
          )}
        />
      </button>

      {/* EXPANDED BODY */}
      {row.expanded && (
        <div className="px-3 pb-3 pt-1 border-t bg-muted/10 space-y-3">
          {/* Customer selector tile if not yet picked, or change link */}
          {!row.customer ? (
            <Button
              variant="outline"
              className="w-full rounded-xl h-10 justify-start"
              onClick={() => setPickerOpen(true)}
              disabled={locked}
            >
              <User className="h-4 w-4 mr-2" /> Select Customer
            </Button>
          ) : (
            <div className="flex items-center justify-between rounded-xl bg-background border px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Customer</div>
                <div className="text-sm font-medium truncate">{row.customer.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {row.phoneOverride || row.customer.phone || "—"}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-primary"
                onClick={() => setPickerOpen(true)}
                disabled={locked}
              >
                Change
              </Button>
            </div>
          )}

          {/* Products */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
              Products ({row.items.length})
            </div>

            {row.items.length === 0 ? (
              <div className="rounded-xl bg-background border border-dashed py-6 text-center text-xs text-muted-foreground">
                No products yet
              </div>
            ) : (
              row.items.map((item) => (
                <div
                  key={item.uid}
                  className="rounded-xl bg-background border p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <InlineProductSelect
                        value={item}
                        products={products}
                        disabled={locked}
                        onPick={(p) =>
                          onUpdateItem(item.uid, {
                            product_id: p.id,
                            product_name: p.name,
                            category: p.category?.name || null,
                            sku: p.sku || null,
                            unit: p.unit || "Unit",
                            rate: Number(p.rate) || 0,
                            original_rate: Number(p.rate) || 0,
                            conversion_to_base: null,
                            price_basis_conversion: null,
                          })
                        }
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                      disabled={locked || row.items.length === 1}
                      onClick={() => onRemoveItem(item.uid)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Qty</label>
                      <Input
                        type="number"
                        min={0}
                        inputMode="decimal"
                        value={item.quantity}
                        disabled={locked}
                        onChange={(e) =>
                          onUpdateItem(item.uid, { quantity: Number(e.target.value) || 0 })
                        }
                        className="h-8 text-sm px-2"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Unit</label>
                      {item.product_id ? (
                        <LineItemUomSelect
                          productId={item.product_id}
                          value={item.unit}
                          context="sales"
                          hideWhenSingle={false}
                          disabled={locked}
                          className="h-8 text-sm px-2 w-full"
                          onChange={(sel) => {
                            const patch = uomSelectionPatch(
                              item,
                              products.find((p) => p.id === item.product_id),
                              sel,
                            );
                            if (patch) onUpdateItem(item.uid, patch);
                          }}
                        />
                      ) : (
                        <Select value={item.unit} disabled>
                          <SelectTrigger className="h-8 text-sm px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={item.unit}>{item.unit}</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Price</label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={item.rate}
                        disabled={locked}
                        onChange={(e) =>
                          onUpdateItem(item.uid, { rate: Number(e.target.value) || 0 })
                        }
                        className="h-8 text-sm px-2"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Amount</label>
                      <div className="h-8 flex items-center text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        {format(item.product_id ? itemAmount(item) : 0)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <Button
            variant="outline"
            onClick={onAddItemRow}
            disabled={locked}
            className="w-full rounded-xl h-10 border-dashed text-primary"
          >
            <Plus className="h-4 w-4 mr-1" /> Add Row
          </Button>

          <Button
            variant="ghost"
            onClick={onDelete}
            disabled={row.status === "submitted"}
            className="w-full rounded-xl h-10 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4 mr-1" /> Delete Row
          </Button>

          {/* Save / Submit actions */}
          {row.status === "submitted" ? (
            <Badge className="w-full justify-center bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15 h-10 rounded-xl">
              Submitted
            </Badge>
          ) : row.status === "saved" ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={onEdit} className="flex-1 rounded-xl h-10">
                <Pencil className="h-4 w-4 mr-1" /> Edit
              </Button>
              <Button onClick={onSubmit} disabled={submitting} className="flex-1 rounded-xl h-10">
                {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Submit
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={onSave} className="flex-1 rounded-xl h-10">
                <Save className="h-4 w-4 mr-1" /> Save
              </Button>
              <Button onClick={onSubmit} disabled={submitting} className="flex-1 rounded-xl h-10">
                {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Submit
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Customer picker bottom sheet */}
      <CustomerPickerDrawer
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        customers={customers}
        onPick={(c) => {
          onPickCustomer(c);
          setPickerOpen(false);
        }}
        onCreated={(c) => {
          onCreateRetailer(c);
          onPickCustomer(c);
          setPickerOpen(false);
        }}
      />
    </Card>
  );
}

// ===================================================================
// COUNTER CUSTOMER CARD — premium unified card matching reference design
// ===================================================================
function CounterCustomerCard({
  index,
  row,
  products,
  customers,
  submitting,
  onToggleExpand,
  onPickCustomer,
  onCreateRetailer,
  onAddItemRow,
  onUpdateItem,
  onRemoveItem,
  onPaymentModeChange,
  onPaymentMethodChange,
  onCustomerTypeChange,
  onWalkInChange,
  onPatchRow,
  onOpenCamera,
  companyQrCode,
  isPaymentProofMandatory,
  onSave,
  onSubmit,
  onEdit,
  onDelete,
  eventMode,
}: {
  index: number;
  row: CounterRow;
  products: any[];
  customers: CounterCustomer[];
  submitting?: boolean;
  onToggleExpand: () => void;
  onPickCustomer: (r: CounterCustomer) => void;
  onCreateRetailer: (r: CounterCustomer) => void;
  onAddItemRow: () => void;
  onUpdateItem: (itemUid: string, patch: Partial<CounterLineItem>) => void;
  onRemoveItem: (itemUid: string) => void;
  onPaymentModeChange: (mode: "" | "full" | "partial" | "credit") => void;
  onPaymentMethodChange: (method: "" | "cash" | "upi" | "neft" | "cheque") => void;
  onCustomerTypeChange: (t: "existing" | "walkin") => void;
  onWalkInChange: (patch: { walkInName?: string; walkInPhone?: string; saveWalkIn?: boolean }) => void;
  onPatchRow: (patch: Partial<CounterRow>) => void;
  onOpenCamera: (mode: "cheque" | "upi" | "neft") => void;
  companyQrCode: string | null;
  isPaymentProofMandatory: boolean;
  onSave: () => void;
  onSubmit: () => void;
  onEdit: () => void;
  onDelete: () => void;
  eventMode?: boolean;
}) {
  const { format } = useCurrency();
  const currencySymbol = format(0).replace(/[\d.,\s]/g, '') || '';
  const [pickerOpen, setPickerOpen] = useState(false);
  const locked = row.status === "saved" || row.status === "submitted";
  const itemCount = rowItemCount(row);

  const subtotal = row.items.reduce(
    (s, i) => s + (i.product_id ? itemSubtotal(i) : 0),
    0
  );
  const discountTotal = row.items.reduce(
    (s, i) => s + (i.product_id ? itemDiscount(i) : 0),
    0
  );
  const taxTotal = row.items.reduce((s, i) => s + (i.product_id ? itemTax(i) : 0), 0);
  const total = subtotal - discountTotal + taxTotal;

  const isWalkIn = row.customerType === "walkin";
  const walkInDisplayName = (row.walkInName || "").trim();
  const headerName = isWalkIn
    ? walkInDisplayName || "Walk-in Customer"
    : row.customer?.name;
  const headerSub = isWalkIn
    ? walkInDisplayName
      ? "Walk-in Customer"
      : "Guest Customer"
    : row.customer
    ? `Retailer • ${row.phoneOverride || row.customer.phone || "—"}`
    : "Tap to choose or create";
  const initials = headerName
    ? headerName
        .split(" ")
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : `#${index}`;

  const paymentMode = row.paymentMode || "";
  const paymentMethod = row.paymentMethod || "";
  const paymentLabel: Record<string, { label: string; cls: string }> = {
    full: { label: "Full Payment", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
    partial: { label: "Partial Payment", cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
    credit: { label: "Full Credit", cls: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  };

  const updatedTime = row.updatedAt
    ? new Date(row.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <Card className="rounded-2xl shadow-sm border bg-card overflow-hidden">
      {/* HEADER */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="relative shrink-0">
          <div className="h-8 w-8 rounded-full bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 text-[11px] font-bold flex items-center justify-center">
            {initials}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-card" />
        </div>
        <div className="min-w-0 flex-1">
          {isWalkIn ? (
            <>
              <div className="text-[13px] font-semibold truncate text-foreground leading-tight">{headerName}</div>
              <div className="text-[10px] text-muted-foreground truncate leading-tight">{headerSub}</div>
            </>
          ) : row.customer ? (
            <>
              <div className="text-[13px] font-semibold truncate text-foreground leading-tight">{row.customer.name}</div>
              <div className="text-[10px] text-muted-foreground truncate leading-tight">
                Retailer <span className="opacity-50">•</span>{" "}
                {row.phoneOverride || row.customer.phone || "—"}
              </div>
            </>
          ) : (
            <>
              <div className="text-[13px] font-semibold text-blue-600 dark:text-blue-400 leading-tight">Select Customer</div>
              <div className="text-[10px] text-muted-foreground leading-tight">Tap to choose or create</div>
            </>
          )}
        </div>
        <div className="flex flex-col items-end gap-0 shrink-0 leading-tight">
          <span className="text-[10px] text-muted-foreground">
            {itemCount} item{itemCount !== 1 ? "s" : ""}
          </span>
          <div className="text-[13px] font-bold text-emerald-600 dark:text-emerald-400">
            {format(total)}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ml-0.5",
            row.expanded && "rotate-180"
          )}
        />
      </button>

      {/* META row (under header) */}
      <div className="flex items-center gap-1.5 flex-wrap px-3 pb-1.5 -mt-0.5">
        {paymentMode && paymentLabel[paymentMode] && (
          <span className={cn("text-[9px] px-1.5 py-0 rounded-full font-medium leading-4", paymentLabel[paymentMode].cls)}>
            {paymentLabel[paymentMode].label}
          </span>
        )}
        <span className="text-[9px] px-1.5 py-0 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 font-medium leading-4">
          {row.status === "submitted" ? "Submitted" : row.status === "saved" ? "Saved" : "Active"}
        </span>
        {updatedTime && (
          <span className="text-[9px] text-muted-foreground leading-4">
            • {updatedTime}
          </span>
        )}
      </div>

      {/* EXPANDED BODY */}
      {row.expanded && (
        <div className="border-t bg-muted/10">
          {/* Customer pick / change tile (Existing) OR Walk-in optional fields */}
          <div className="px-3 pt-3">
            {isWalkIn ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="min-w-0">
                    <label className="block text-[10px] text-muted-foreground uppercase tracking-wide truncate whitespace-nowrap">Name (optional)</label>
                    <Input
                      value={row.walkInName || ""}
                      disabled={locked}
                      onChange={(e) => onWalkInChange({ walkInName: e.target.value })}
                      placeholder="e.g. Suresh"
                      className="h-8 rounded-lg text-sm"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-[10px] text-muted-foreground uppercase tracking-wide truncate whitespace-nowrap">Phone (optional)</label>
                    <Input
                      value={row.walkInPhone || ""}
                      disabled={locked}
                      onChange={(e) => onWalkInChange({ walkInPhone: e.target.value })}
                      placeholder="91234 56789"
                      inputMode="tel"
                      className="h-8 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-foreground/80 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={!!row.saveWalkIn}
                      onChange={(e) => onWalkInChange({ saveWalkIn: e.target.checked })}
                      className="h-4 w-4 rounded border-input"
                    />
                    Save for future
                  </label>
                  {!eventMode && (
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => onCustomerTypeChange("existing")}
                      className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                    >
                      Use Existing Customer →
                    </button>
                  )}
                </div>
              </div>
            ) : !row.customer ? (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full rounded-xl h-9 justify-start"
                  onClick={() => setPickerOpen(true)}
                  disabled={locked}
                >
                  <User className="h-4 w-4 mr-2" /> Select Customer
                </Button>
                {!eventMode && (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => onCustomerTypeChange("walkin")}
                    className="text-[11px] font-medium text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
                  >
                    ← Back to Walk-in Customer
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-xl bg-background border px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Customer</div>
                  <div className="text-sm font-medium truncate">{row.customer.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {row.phoneOverride || row.customer.phone || "—"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-blue-600 dark:text-blue-400"
                  onClick={() => setPickerOpen(true)}
                  disabled={locked}
                >
                  Change
                </Button>
              </div>
            )}
          </div>

          {/* PRODUCTS */}
          <div className="px-4 pt-4">
            <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground mb-2">
              Products
            </div>

            {/* column headers */}
            <div className="grid grid-cols-[minmax(0,1fr)_60px_44px_72px] sm:grid-cols-[minmax(0,1.6fr)_90px_70px_120px] gap-1.5 sm:gap-3 px-1 pb-1.5 text-[9px] sm:text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              <div>Product</div>
              <div>Unit</div>
              <div>Qty</div>
              <div>Price ({currencySymbol})</div>
            </div>

            <div className="space-y-3">
              {row.items.map((item, idx) => {
                const lineTotal = item.product_id ? itemAmount(item) : 0;
                const product = products.find((p) => p.id === item.product_id);
                const mrp = product?.mrp || product?.MRP;
                return (
                  <div key={item.uid} className="space-y-1">
                    <div className="grid grid-cols-[minmax(0,1fr)_60px_44px_72px] sm:grid-cols-[minmax(0,1.6fr)_90px_70px_120px] gap-1.5 sm:gap-3 items-center">
                      <div className="min-w-0">
                        <InlineProductSelect
                          value={item}
                          products={products}
                          disabled={locked}
                          onPick={(p) =>
                            onUpdateItem(item.uid, {
                              product_id: p.id,
                              product_name: p.name,
                              category: p.category?.name || null,
                              sku: p.sku || null,
                              unit: p.unit || "Unit",
                              rate: Number(p.rate) || 0,
                              original_rate: Number(p.rate) || 0,
                              conversion_to_base: null,
                              price_basis_conversion: null,
                            })
                          }
                          onEnter={() => {
                            if (idx === row.items.length - 1) onAddItemRow();
                          }}
                        />
                      </div>
                      {item.product_id ? (
                        <LineItemUomSelect
                          productId={item.product_id}
                          value={item.unit}
                          context="sales"
                          hideWhenSingle={false}
                          disabled={locked}
                          className="h-9 rounded-lg text-xs sm:text-sm px-2 w-full"
                          onChange={(sel) => {
                            const patch = uomSelectionPatch(
                              item,
                              products.find((p) => p.id === item.product_id),
                              sel,
                            );
                            if (patch) onUpdateItem(item.uid, patch);
                          }}
                        />
                      ) : (
                        <Select value={item.unit} disabled>
                          <SelectTrigger className="h-9 rounded-lg text-xs sm:text-sm px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={item.unit}>{item.unit}</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <Input
                        type="number"
                        min={0}
                        inputMode="decimal"
                        value={item.quantity}
                        disabled={locked}
                        onChange={(e) => onUpdateItem(item.uid, { quantity: Number(e.target.value) || 0 })}
                        className="h-9 rounded-lg text-xs sm:text-sm px-1.5 sm:px-2"
                      />
                      <div className="relative">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          value={item.rate}
                          disabled={locked}
                          onChange={(e) => onUpdateItem(item.uid, { rate: Number(e.target.value) || 0 })}
                          className="h-9 rounded-lg text-xs sm:text-sm px-1.5 sm:px-2"
                        />
                      </div>
                    </div>

                    {/* SKU/MRP/Total meta line */}
                    <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground px-1">
                      <div className="flex items-center gap-2">
                        {item.sku && (
                          <span>
                            SKU: <span className="font-medium text-foreground/80">{item.sku}</span>
                          </span>
                        )}
                        {item.product_id && (
                          <>
                            {item.sku && <span className="opacity-40">|</span>}
                            <span>
                              Price:{" "}
                              <span className="font-medium text-foreground/80">
                                {format(Number(item.original_rate ?? item.rate) || 0)}
                              </span>
                            </span>
                          </>
                        )}
                        {mrp && (
                          <>
                            <span className="opacity-40">|</span>
                            <span>
                              MRP: <span className="font-medium text-foreground/80">{format(Number(mrp))}</span>
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span>
                          Total:{" "}
                          <span className="font-semibold text-foreground">
                            {format(lineTotal)}
                          </span>
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          disabled={locked || row.items.length === 1}
                          onClick={() => onRemoveItem(item.uid)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              variant="ghost"
              onClick={onAddItemRow}
              disabled={locked}
              className="mt-2 h-8 text-blue-600 dark:text-blue-400 px-2 text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Product
            </Button>
          </div>

          {/* PAYMENT MODE */}
          <div className="px-4 pt-4">
            {eventMode ? (
              /* At an event stall the customer pays on the spot and walks away
                 with the goods — there is no credit relationship with a walk-in.
                 So Full/Partial/Credit is a decision that never has a second
                 answer here; the only real question is cash or UPI. Choosing a
                 method IS the payment mode, recorded as a full payment. */
              <>
                <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground mb-2">
                  Payment
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["cash", "upi"] as const).map((method) => {
                    const active = paymentMethod === method;
                    return (
                      <button
                        key={method}
                        type="button"
                        disabled={locked}
                        onClick={() => {
                          onPaymentMethodChange(method);
                          onPaymentModeChange("full");
                          onPatchRow({ partialAmount: "" });
                        }}
                        className={cn(
                          "h-11 rounded-xl border text-sm font-medium transition-colors",
                          active
                            ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-500/15 dark:border-blue-500/40 dark:text-blue-300"
                            : "bg-background border-border text-foreground/80 hover:bg-muted/40"
                        )}
                      >
                        {method === "cash" ? "Cash" : "UPI"}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
            <>
            <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground mb-2">
              Payment Mode
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["full", "partial", "credit"] as const).map((mode) => {
                const labels = { full: "Full Payment", partial: "Partial Payment", credit: "Full Credit" };
                const active = paymentMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={locked}
                    onClick={() => {
                      onPaymentModeChange(mode);
                      // Reset method when switching modes (cart-style flow)
                      onPaymentMethodChange("");
                      onPatchRow({ partialAmount: "" });
                    }}
                    className={cn(
                      "h-10 rounded-xl border text-xs font-medium transition-colors",
                      active
                        ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-500/15 dark:border-blue-500/40 dark:text-blue-300"
                        : "bg-background border-border text-foreground/80 hover:bg-muted/40"
                    )}
                  >
                    {labels[mode]}
                  </button>
                );
              })}
            </div>

            {/* PARTIAL AMOUNT INPUT */}
            {paymentMode === "partial" && (
              <div className="mt-3 space-y-1.5">
                <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
                  Partial Payment Amount
                </div>
                <Input
                  type="number"
                  placeholder="Enter amount"
                  value={row.partialAmount || ""}
                  onChange={(e) => onPatchRow({ partialAmount: e.target.value })}
                  max={total}
                  disabled={locked}
                  className="h-8 text-sm border-primary ring-2 ring-primary/20 focus:ring-primary/40"
                />
                {row.partialAmount && parseFloat(row.partialAmount) > 0 && (
                  <div className="p-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-emerald-700 dark:text-emerald-400">Paying Now:</span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">{format(parseFloat(row.partialAmount))}</span>
                    </div>
                    <div className="flex justify-between text-xs pt-1 border-t border-amber-200 dark:border-amber-800">
                      <span className="font-medium text-amber-700 dark:text-amber-400">Remaining:</span>
                      <span className="font-bold text-amber-700 dark:text-amber-400">{format(Math.max(0, total - parseFloat(row.partialAmount)))}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PAYMENT METHOD — only when full or partial selected */}
            {!eventMode && (paymentMode === "full" || paymentMode === "partial") && (
              <div className="mt-3 space-y-2 p-2.5 border rounded-xl bg-muted/40">
                <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
                  Payment Method
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {(["cash", "cheque", "upi", "neft"] as const).map((method) => {
                    const labels = { cash: "Cash", cheque: "Cheque", upi: "UPI", neft: "NEFT" };
                    const active = paymentMethod === method;
                    return (
                      <label
                        key={method}
                        className={cn(
                          "flex items-center gap-1.5 cursor-pointer select-none text-xs font-medium",
                          locked && "opacity-60 cursor-not-allowed"
                        )}
                      >
                        <input
                          type="radio"
                          name={`pm-${row.uid}`}
                          disabled={locked}
                          checked={active}
                          onChange={() => onPaymentMethodChange(method)}
                          className="h-3.5 w-3.5 accent-primary"
                        />
                        <span>{labels[method]}</span>
                      </label>
                    );
                  })}
                </div>

                {/* Cheque Bank Details + Photo */}
                {paymentMethod === "cheque" && (
                  <div className="space-y-1.5 pt-1">
                    <div className="p-2 bg-background rounded-md border">
                      <p className="text-xs font-medium mb-1.5">Bank Details for Cheque</p>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p><span className="font-medium">Bank Name:</span> HDFC Bank</p>
                        <p><span className="font-medium">Account Name:</span> Bharath Beverages Pvt Ltd</p>
                        <p><span className="font-medium">Account Number:</span> 1234567890</p>
                        <p><span className="font-medium">IFSC Code:</span> HDFC0001234</p>
                      </div>
                    </div>
                    <Button
                      onClick={() => onOpenCamera("cheque")}
                      variant="outline"
                      disabled={locked}
                      className="w-full h-8 text-xs"
                    >
                      <Camera className="mr-1.5" size={12} />
                      {row.chequePhotoUrl ? "Retake Cheque" : "Capture Cheque"}
                    </Button>
                    {row.chequePhotoUrl && <p className="text-[10px] text-emerald-600">✓ Cheque photo captured</p>}
                  </div>
                )}

                {/* UPI QR + last-4 + photo */}
                {paymentMethod === "upi" && (
                  <div className="space-y-1.5 pt-1">
                    <div className="p-2 bg-background rounded-md border">
                      <p className="text-xs font-medium mb-1.5 text-center">Scan QR for Payment</p>
                      <div className="flex items-center justify-center bg-white p-2 rounded">
                        {companyQrCode ? (
                          <img src={companyQrCode} alt="UPI QR Code" className="w-32 h-32 object-contain" />
                        ) : (
                          <div className="w-32 h-32 flex items-center justify-center bg-muted rounded">
                            <p className="text-xs text-muted-foreground">No QR Code</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">UPI Last-4 Code</div>
                      <Input
                        type="text"
                        maxLength={4}
                        value={row.upiLastFourCode || ""}
                        onChange={(e) => onPatchRow({ upiLastFourCode: e.target.value.replace(/\D/g, "") })}
                        placeholder="Enter last 4 digits"
                        disabled={locked}
                        className="h-8 text-xs"
                      />
                    </div>
                    <Button
                      onClick={() => onOpenCamera("upi")}
                      variant="outline"
                      disabled={locked}
                      className="w-full h-8 text-xs"
                    >
                      <Camera className="mr-1.5" size={12} />
                      {row.upiPhotoUrl ? "Retake Proof" : "Capture Proof"}
                    </Button>
                    {row.upiPhotoUrl && <p className="text-[10px] text-emerald-600">✓ Payment proof captured</p>}
                  </div>
                )}

                {/* NEFT Bank Details + Photo */}
                {paymentMethod === "neft" && (
                  <div className="space-y-1.5 pt-1">
                    <div className="p-2 bg-background rounded-md border">
                      <p className="text-xs font-medium mb-1.5">Bank Details for NEFT</p>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p><span className="font-medium">Bank Name:</span> HDFC Bank</p>
                        <p><span className="font-medium">Account Name:</span> Bharath Beverages Pvt Ltd</p>
                        <p><span className="font-medium">Account Number:</span> 1234567890</p>
                        <p><span className="font-medium">IFSC Code:</span> HDFC0001234</p>
                      </div>
                    </div>
                    <Button
                      onClick={() => onOpenCamera("neft")}
                      variant="outline"
                      disabled={locked}
                      className="w-full h-8 text-xs"
                    >
                      <Camera className="mr-1.5" size={12} />
                      {row.neftPhotoUrl ? "Retake NEFT Proof" : "Capture NEFT Proof"}
                    </Button>
                    {row.neftPhotoUrl && <p className="text-[10px] text-emerald-600">✓ NEFT confirmation captured</p>}
                  </div>
                )}
              </div>
            )}
            </>
            )}
          </div>

          {/* TOTALS */}
          <div className="px-4 pt-4 pb-3">
            <div className="rounded-xl bg-background border px-3 py-3">
              <div className="grid grid-cols-4 gap-3 text-center">
                <div>
                  <div className="text-[10px] text-muted-foreground">Subtotal</div>
                  <div className="text-sm font-semibold">{format(subtotal)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Discount</div>
                  <div className="text-sm font-semibold text-destructive">- {format(discountTotal)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">GST</div>
                  <div className="text-sm font-semibold">{format(taxTotal)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Total</div>
                  <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {format(total)}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t">
                {row.status === "submitted" ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15 h-9 px-4 rounded-xl">
                    Submitted
                  </Badge>
                ) : row.status === "saved" ? (
                  <>
                    <Button variant="outline" onClick={onEdit} className="rounded-xl h-9">
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    <Button onClick={onSubmit} disabled={submitting} className="rounded-xl h-9 bg-primary text-primary-foreground hover:bg-primary/90 px-5">
                      {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                      Submit
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={onSave} className="rounded-xl h-9">
                      <Save className="h-3.5 w-3.5 mr-1" /> Save
                    </Button>
                    <Button onClick={onSubmit} disabled={submitting} className="rounded-xl h-9 bg-primary text-primary-foreground hover:bg-primary/90 px-5">
                      {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                      Submit
                    </Button>
                  </>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-destructive hover:text-destructive"
                  onClick={onDelete}
                  disabled={row.status === "submitted"}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <CustomerPickerDrawer
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        customers={customers}
        onPick={(c) => {
          onPickCustomer(c);
          setPickerOpen(false);
        }}
        onCreated={(c) => {
          onCreateRetailer(c);
          onPickCustomer(c);
          setPickerOpen(false);
        }}
      />
    </Card>
  );
}

// ===================================================================
// CUSTOMER PICKER — bottom sheet with search + inline create
// ===================================================================
function CustomerPickerDrawer({
  open,
  onOpenChange,
  customers,
  onPick,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: CounterCustomer[];
  onPick: (r: CounterCustomer) => void;
  onCreated: (r: CounterCustomer) => void;
}) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"search" | "create">("search");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setMode("search");
      setNewName("");
      setNewPhone("");
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers.slice(0, 100);
    return customers
      .filter(
        (r) =>
          r.name?.toLowerCase().includes(q) || r.phone?.toLowerCase().includes(q)
      )
      .slice(0, 100);
  }, [customers, search]);

  const handleCreate = async () => {
    const name = newName.trim();
    const ph = newPhone.trim();
    if (!name) return toast.error("Customer name is required");
    if (!ph) return toast.error("Phone number is required");
    const dup = customers.find((r) => (r.phone || "").trim() === ph);
    if (dup) {
      toast.error("Customer already exists. Selecting it instead.");
      onPick(dup);
      return;
    }
    if (!user) return toast.error("You must be signed in");
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("counter_customers")
        .insert({ name, phone: ph, user_id: user.id })
        .select("id,name,phone")
        .single();
      if (error) throw error;
      onCreated({ id: data.id, name: data.name, phone: data.phone });
      toast.success("Customer created");
    } catch (e: any) {
      toast.error(e?.message || "Could not create customer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>
            {mode === "search" ? "Select Customer" : "New Customer"}
          </DrawerTitle>
        </DrawerHeader>

        {mode === "search" ? (
          <div className="px-4 pb-2 flex flex-col min-h-0">
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 pl-8 rounded-xl"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto rounded-xl border divide-y max-h-[45vh]">
              {filtered.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">
                  No customers found
                </div>
              ) : (
                filtered.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onPick(r)}
                    className="w-full text-left px-3 py-3 hover:bg-muted/50 active:bg-muted"
                  >
                    <div className="text-sm font-medium truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.phone || "—"}
                    </div>
                  </button>
                ))
              )}
            </div>
            <Button
              variant="outline"
              className="w-full mt-3 rounded-xl h-11 text-primary border-dashed"
              onClick={() => {
                setNewName(search);
                setMode("create");
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Create New Customer
            </Button>
          </div>
        ) : (
          <div className="px-4 pb-2 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Name *</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-10 rounded-xl"
                placeholder="Customer name"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Phone *</label>
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="h-10 rounded-xl"
                placeholder="10-digit number"
                inputMode="tel"
              />
            </div>
          </div>
        )}

        <DrawerFooter className="pt-2">
          {mode === "create" ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl h-11"
                onClick={() => setMode("search")}
                disabled={saving}
              >
                Back
              </Button>
              <Button
                className="flex-1 rounded-xl h-11"
                onClick={handleCreate}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Done
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full rounded-xl h-11"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

interface CounterLineItem {
  uid: string; // local row id
  product_id: string;
  product_name: string;
  category?: string | null;
  sku?: string | null;
  unit: string;
  quantity: number;
  rate: number;
  discount: number;
  tax_rate: number;
  original_rate?: number;
  // UOM-master snapshot for the selected unit (mirrors order entry).
  conversion_to_base?: number | null;
  price_basis_conversion?: number | null;
}

type RowStatus = "draft" | "saved" | "submitted";

interface CounterRow {
  uid: string;
  customer: CounterCustomer | null;
  phoneOverride?: string;
  items: CounterLineItem[];
  status: RowStatus;
  expanded: boolean;
  paymentMode?: "" | "full" | "partial" | "credit";
  paymentMethod?: "" | "cash" | "upi" | "neft" | "cheque";
  partialAmount?: string;
  chequePhotoUrl?: string;
  upiPhotoUrl?: string;
  upiLastFourCode?: string;
  neftPhotoUrl?: string;
  updatedAt?: number;
  customerType?: "existing" | "walkin";
  walkInName?: string;
  walkInPhone?: string;
  saveWalkIn?: boolean;
}

const DRAFT_KEY = "counter_sales_draft_v1";
const TAX_OPTIONS = [0, 5, 12, 18, 28];

// Price for 1 selected unit = price-basis rate × (selected conversion / price-basis conversion).
const uomUnitPrice = (baseRate: number, sel: LineItemUomSelection) => {
  const factor =
    sel.conversionToBase && sel.priceBasisConversionToBase
      ? sel.conversionToBase / sel.priceBasisConversionToBase
      : 1;
  return +(baseRate * factor).toFixed(2);
};

/** Patch for a UOM change on a line item, mirroring order entry: the unit list
 *  comes from the UOM master, price recomputes for the selected unit, and an
 *  already-entered quantity converts between mapped units (12 PCS → 1 DOZEN).
 *  Returns null when the selection matches the item — LineItemUomSelect
 *  re-emits the current unit on load, which must not reset an edited rate. */
const uomSelectionPatch = (
  item: CounterLineItem,
  product: { rate?: number | string } | undefined,
  sel: LineItemUomSelection,
): Partial<CounterLineItem> | null => {
  if (
    item.unit === sel.uomCode &&
    (item.conversion_to_base ?? null) === (sel.conversionToBase ?? null) &&
    (item.price_basis_conversion ?? null) === (sel.priceBasisConversionToBase ?? null)
  ) {
    return null;
  }
  const patch: Partial<CounterLineItem> = {
    unit: sel.uomCode,
    conversion_to_base: sel.conversionToBase ?? null,
    price_basis_conversion: sel.priceBasisConversionToBase ?? null,
  };
  const baseRate = Number(product?.rate);
  if (Number.isFinite(baseRate) && baseRate >= 0) {
    const catalog = uomUnitPrice(baseRate, sel);
    patch.rate = catalog;
    patch.original_rate = catalog;
  }
  if (
    item.conversion_to_base &&
    sel.conversionToBase &&
    item.quantity > 0 &&
    item.unit !== sel.uomCode
  ) {
    patch.quantity = +((item.quantity * item.conversion_to_base) / sel.conversionToBase).toFixed(3);
  }
  return patch;
};

const newItem = (): CounterLineItem => ({
  uid: crypto.randomUUID(),
  product_id: "",
  product_name: "",
  category: null,
  sku: null,
  unit: "Unit",
  quantity: 1,
  rate: 0,
  discount: 0,
  tax_rate: 5,
  original_rate: 0,
});

const newRow = (): CounterRow => ({
  uid: crypto.randomUUID(),
  customer: null,
  items: [newItem()],
  status: "draft",
  expanded: true,
  paymentMode: "",
  paymentMethod: "",
  partialAmount: "",
  chequePhotoUrl: "",
  upiPhotoUrl: "",
  upiLastFourCode: "",
  neftPhotoUrl: "",
  updatedAt: Date.now(),
  customerType: "walkin",
  walkInName: "",
  walkInPhone: "",
  saveWalkIn: false,
});

const itemGrossRate = (i: CounterLineItem) => {
  const r = Number(i.rate) || 0;
  const o = Number(i.original_rate) || 0;
  return o > r ? o : r;
};
const itemSubtotal = (i: CounterLineItem) =>
  (Number(i.quantity) || 0) * itemGrossRate(i);
const itemDiscount = (i: CounterLineItem) => {
  const qty = Number(i.quantity) || 0;
  const drop = itemGrossRate(i) - (Number(i.rate) || 0);
  return Math.max(0, qty * drop);
};
const itemTaxable = (i: CounterLineItem) =>
  Math.max(0, (Number(i.quantity) || 0) * (Number(i.rate) || 0));
const itemTax = (i: CounterLineItem) =>
  itemTaxable(i) * ((Number(i.tax_rate) || 0) / 100);
const itemAmount = (i: CounterLineItem) => itemTaxable(i) + itemTax(i);

const rowAmount = (r: CounterRow) =>
  r.items.reduce((s, i) => s + (i.product_id ? itemAmount(i) : 0), 0);

const rowItemCount = (r: CounterRow) => r.items.filter((i) => i.product_id).length;

const hasRestorableContent = (row: CounterRow) =>
  !!row.customer ||
  !!(row.walkInName || "").trim() ||
  !!(row.walkInPhone || "").trim() ||
  row.items.some((i) => i.product_id);

// ---------- main page ----------
export interface EventContext {
  visitId: string;
  eventName: string;
  eventDate?: string;
  location?: string;
}

export default function CounterSales({ eventContext }: { eventContext?: EventContext } = {}) {
  const { format } = useCurrency();
  const currencySymbol = format(0).replace(/[\d.,\s]/g, '') || '';
  const navigate = useNavigate();
  const { user } = useAuth();
  const { products, fetchProducts } = useOfflineOrderEntry();

  const [tab, setTab] = useState<"orders" | "summary">("orders");
  const [rows, setRows] = useState<CounterRow[]>([newRow()]);
  const [customers, setCustomers] = useState<CounterCustomer[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submittingRows, setSubmittingRows] = useState<Set<string>>(new Set());
  const [companyQrCode, setCompanyQrCode] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<"cheque" | "upi" | "neft">("cheque");
  const [cameraRowUid, setCameraRowUid] = useState<string | null>(null);
  const { isPaymentProofMandatory } = usePaymentProofMandatory();

  // Load company QR code (for UPI display)
  useEffect(() => {
    if (!navigator.onLine) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("companies")
          .select("qr_code_url")
          .limit(1)
          .single();
        if (data?.qr_code_url) setCompanyQrCode(data.qr_code_url);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const handleCameraCapture = async (blob: Blob) => {
    if (!cameraRowUid) {
      setIsCameraOpen(false);
      return;
    }
    try {
      const fileName = `payment-${Date.now()}.jpg`;
      let url = "";
      if (navigator.onLine) {
        const { data, error } = await supabase.storage
          .from("expense-bills")
          .upload(fileName, blob);
        if (error) throw error;
        const { data: pub } = supabase.storage.from("expense-bills").getPublicUrl(fileName);
        url = pub.publicUrl;
      } else {
        url = URL.createObjectURL(blob);
        const reader = new FileReader();
        reader.onloadend = async () => {
          await offlineStorage.addToSyncQueue("UPLOAD_PAYMENT_PROOF", {
            fileName,
            blobBase64: reader.result as string,
            type: cameraMode,
          });
        };
        reader.readAsDataURL(blob);
      }
      const patch: Partial<CounterRow> =
        cameraMode === "cheque"
          ? { chequePhotoUrl: url }
          : cameraMode === "upi"
          ? { upiPhotoUrl: url }
          : { neftPhotoUrl: url };
      updateRow(cameraRowUid, { ...patch, updatedAt: Date.now() });
      toast.success(
        cameraMode === "cheque"
          ? "Cheque photo captured"
          : cameraMode === "upi"
          ? "Payment proof captured"
          : "NEFT proof captured"
      );
    } catch (e: any) {
      toast.error(`Capture failed: ${e?.message || "unknown"}`);
    } finally {
      setIsCameraOpen(false);
    }
  };

  // inline create-new customer state shared with customers list
  const addRetailerLocal = (r: CounterCustomer) =>
    setCustomers((rs) => (rs.some((x) => x.id === r.id) ? rs : [r, ...rs]));

  // ---- load products + customers ----
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    (async () => {
      if (!user || !navigator.onLine) return;
      const { data } = await supabase
        .from("counter_customers")
        .select("id,name,phone")
        .eq("user_id", user.id)
        .order("name");
      if (data?.length) {
        setCustomers(data as CounterCustomer[]);
      }
    })();
  }, [user]);

  // ---- restore draft ----
  useEffect(() => {
    // Skip restoring counter draft when bound to an event — drafts are session-only.
    if (eventContext) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CounterRow[];
        if (Array.isArray(parsed) && parsed.length) setRows(parsed);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (eventContext) return;
    try {
      const restorableRows = rows.filter((row) => row.status !== "submitted" && hasRestorableContent(row));
      if (restorableRows.length > 0) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(restorableRows));
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch {}
  }, [eventContext, rows]);

  // ---- load already-submitted orders so the Summary tab persists across navigation ----
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        let query = supabase
          .from("orders")
          .select("id, retailer_name, counter_customer_id, total_amount, created_at")
          .neq("status", "cancelled")
          .order("created_at", { ascending: true });
        if (eventContext?.visitId) {
          // Own entries only. Three reps can be billing the same stall at once,
          // and this tab is the one you keep adding to — it must not fill up
          // with rows you cannot edit. The whole team's orders are on Summary.
          query = query.eq("visit_id", eventContext.visitId).eq("user_id", user.id);
        } else {
          // Regular counter sales: restore TODAY's counter orders for this user
          const today = getLocalTodayDate();
          query = query
            .eq("user_id", user.id)
            .eq("order_date", today)
            .is("retailer_id", null)
            .is("visit_id", null);
        }
        const { data: orders, error } = await query;
        if (error || !orders || orders.length === 0) return;

        const orderIds = orders.map((o: any) => o.id);
        const { data: itemsData } = await supabase
          .from("order_items")
          .select("order_id, product_id, product_name, category, rate, unit, quantity, discount_amount, total")
          .in("order_id", orderIds);
        const itemsByOrder = new Map<string, any[]>();
        (itemsData || []).forEach((it: any) => {
          const arr = itemsByOrder.get(it.order_id) || [];
          arr.push(it);
          itemsByOrder.set(it.order_id, arr);
        });

        const submittedRows: CounterRow[] = orders.map((o: any) => {
          const oItems = itemsByOrder.get(o.id) || [];
          return {
            uid: `db_${o.id}`,
            customer: {
              id: o.counter_customer_id || o.id,
              name: o.retailer_name || "Customer",
              phone: null,
            } as any,
            items: oItems.length
              ? oItems.map((it: any) => ({
                  uid: crypto.randomUUID(),
                  product_id: it.product_id || "",
                  product_name: it.product_name || "",
                  category: it.category || null,
                  sku: null,
                  unit: it.unit || "Unit",
                  quantity: Number(it.quantity) || 0,
                  rate: Number(it.rate) || 0,
                  discount: Number(it.discount_amount) || 0,
                  tax_rate: 0,
                }))
              : [newItem()],
            status: "submitted",
            expanded: false,
          };
        });

        if (cancelled) return;
        setRows((prev) => {
          // Keep any in-progress (draft/saved) rows from current session, replace prior submitted set
          const keepers = prev.filter((r) => r.status !== "submitted" && hasRestorableContent(r));
          const merged = [...submittedRows, ...keepers];
          return merged.length ? merged : [newRow()];
        });
      } catch (err) {
        console.warn("[CounterSales] failed to load event orders:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventContext?.visitId, user]);

  // ---- row helpers ----
  const updateRow = (uid: string, patch: Partial<CounterRow>) =>
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));

  const updateItem = (rowUid: string, itemUid: string, patch: Partial<CounterLineItem>) =>
    setRows((rs) =>
      rs.map((r) =>
        r.uid !== rowUid
          ? r
          : {
              ...r,
              items: r.items.map((i) => {
                if (i.uid !== itemUid) return i;
                const merged = { ...i, ...patch };
                // Auto-derive discount from price drop vs original_rate when
                // rate/quantity/product changes (user hasn't explicitly set discount in this patch).
                const touchesPriceQty =
                  "rate" in patch ||
                  "quantity" in patch ||
                  "product_id" in patch ||
                  "original_rate" in patch;
                if (touchesPriceQty && !("discount" in patch)) {
                  const orig = Number(merged.original_rate) || 0;
                  const rate = Number(merged.rate) || 0;
                  const qty = Number(merged.quantity) || 0;
                  if (orig > 0 && rate < orig) {
                    merged.discount = Math.max(0, (orig - rate) * qty);
                  } else {
                    merged.discount = 0;
                  }
                }
                return merged;
              }),
            }
      )
    );

  const removeItem = (rowUid: string, itemUid: string) =>
    setRows((rs) =>
      rs.map((r) =>
        r.uid !== rowUid ? r : { ...r, items: r.items.filter((i) => i.uid !== itemUid) }
      )
    );

  const addItemRow = (rowUid: string) =>
    setRows((rs) =>
      rs.map((r) => (r.uid !== rowUid ? r : { ...r, items: [...r.items, newItem()] }))
    );

  const addRow = () => setRows((rs) => [...rs, newRow()]);
  const deleteRow = (uid: string) =>
    setRows((rs) => (rs.length === 1 ? [newRow()] : rs.filter((r) => r.uid !== uid)));

  const toggleExpand = (uid: string) =>
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, expanded: !r.expanded } : r)));

  // ---- save / submit ----
  const validateRow = (r: CounterRow, requirePayment = false): string | null => {
    if (eventContext) {
      if (!(r.walkInName || "").trim()) return "Enter walk-in customer name";
    } else if ((r.customerType || "existing") === "existing") {
      if (!r.customer) return "Select a customer";
    }
    const filled = r.items.filter((i) => i.product_id);
    if (filled.length === 0) return "Add at least one product";
    if (filled.some((i) => !i.quantity || i.quantity <= 0)) return "Quantity must be > 0";
    if (requirePayment) {
      // At an event the screen only offers Cash or UPI, so say that rather than
      // asking for a "payment type" the rep was never shown.
      if (eventContext) {
        if (!r.paymentMethod) return "Select Cash or UPI";
      } else if (!r.paymentMode) {
        return "Please select payment type";
      }
      if ((r.paymentMode === "full" || r.paymentMode === "partial") && !r.paymentMethod) {
        return "Please select payment method";
      }
      if (r.paymentMode === "partial") {
        const amt = parseFloat(r.partialAmount || "");
        if (!amt || amt <= 0) return "Enter a valid partial payment amount";
      }
      if (isPaymentProofMandatory && navigator.onLine) {
        if (r.paymentMethod === "cheque" && !r.chequePhotoUrl) return "Capture cheque photo";
        if (r.paymentMethod === "upi" && !r.upiPhotoUrl) return "Capture payment confirmation";
        if (r.paymentMethod === "neft" && !r.neftPhotoUrl) return "Capture NEFT confirmation";
      }
    }
    return null;
  };

  const saveRow = (uid: string) => {
    const row = rows.find((r) => r.uid === uid);
    if (!row) return;
    const err = validateRow(row);
    if (err) {
      toast.error(err);
      return;
    }
    updateRow(uid, { status: "saved", expanded: false });
    toast.success("Order saved as draft");
  };

  const editRow = (uid: string) => updateRow(uid, { status: "draft", expanded: true });

  const submitSingleRow = async (uid: string) => {
    if (!user) {
      toast.error("You must be signed in");
      return;
    }
    const row = rows.find((r) => r.uid === uid);
    if (!row) return;
    const err = validateRow(row, true);
    if (err) {
      toast.error(err);
      return;
    }
    setSubmittingRows((s) => new Set(s).add(uid));
    const filledItems = row.items.filter((i) => i.product_id);
    const subtotal = filledItems.reduce((s, i) => s + itemAmount(i), 0);
    const total = Math.round(subtotal);
    const isWalkIn = (row.customerType || "existing") === "walkin";
    let walkInCustomerId: string | null = null;
    if (isWalkIn && row.saveWalkIn && (row.walkInName || "").trim() && user) {
      try {
        const { data: created } = await supabase
          .from("counter_customers")
          .insert({
            name: (row.walkInName || "").trim(),
            phone: (row.walkInPhone || "").trim() || null,
            user_id: user.id,
          })
          .select("id,name,phone")
          .single();
        if (created) {
          walkInCustomerId = created.id;
          addRetailerLocal({ id: created.id, name: created.name, phone: created.phone });
        }
      } catch (err: any) {
        console.warn("[counter-sales] save walk-in failed:", err?.message);
      }
    }
    const walkInName = (row.walkInName || "").trim();
    // ----- payment derivation (mirrors Cart flow) -----
    let isCreditOrder = false;
    let creditPending = 0;
    let creditPaid = 0;
    let orderPaymentMethod = "";
    let paymentProofUrl = "";
    if (row.paymentMode === "credit") {
      isCreditOrder = true;
      creditPending = total;
      creditPaid = 0;
      orderPaymentMethod = "credit";
    } else if (row.paymentMode === "full") {
      isCreditOrder = false;
      creditPaid = total;
      orderPaymentMethod = row.paymentMethod || "cash";
      paymentProofUrl =
        row.paymentMethod === "cheque"
          ? row.chequePhotoUrl || ""
          : row.paymentMethod === "upi"
          ? row.upiPhotoUrl || ""
          : row.paymentMethod === "neft"
          ? row.neftPhotoUrl || ""
          : "";
    } else if (row.paymentMode === "partial") {
      isCreditOrder = true;
      const paid = parseFloat(row.partialAmount || "0") || 0;
      creditPaid = paid;
      creditPending = Math.max(0, total - paid);
      orderPaymentMethod = row.paymentMethod || "cash";
      paymentProofUrl =
        row.paymentMethod === "cheque"
          ? row.chequePhotoUrl || ""
          : row.paymentMethod === "upi"
          ? row.upiPhotoUrl || ""
          : row.paymentMethod === "neft"
          ? row.neftPhotoUrl || ""
          : "";
    } else {
      orderPaymentMethod = "cash";
    }
    const orderData = {
      user_id: user.id,
      retailer_id: null as any,
      counter_customer_id: isWalkIn ? walkInCustomerId : row.customer!.id,
      retailer_name: isWalkIn
        ? walkInName || "Walk-in Customer"
        : row.customer!.name,
        order_date: getLocalTodayDate(),
      subtotal,
      discount_amount: 0,
      total_amount: total,
      status: "confirmed",
      payment_method: orderPaymentMethod,
      is_credit_order: isCreditOrder,
      credit_pending_amount: creditPending,
      credit_paid_amount: creditPaid,
      payment_proof_url: paymentProofUrl || null,
      upi_last_four_code: row.paymentMethod === "upi" ? row.upiLastFourCode || null : null,
      idempotency_key: `counter_${user.id}_${row.uid}_${Date.now()}`,
      ...(eventContext?.visitId ? { visit_id: eventContext.visitId } : {}),
    };
    const items = filledItems.map((i) => ({
      product_id: i.product_id,
      product_name: i.product_name,
      category: i.category || null,
      rate: i.rate,
      original_rate: i.rate,
      discount_amount: Number(i.discount) || 0,
      unit: i.unit,
      quantity: i.quantity,
      total: itemAmount(i),
      hsn_code: null,
      sgst_amount: 0,
      cgst_amount: 0,
    }));
    try {
      const res = await submitOrderWithOfflineSupport(orderData, items, {
        connectivityStatus: navigator.onLine ? "online" : "offline",
      });
      if (res?.success) {
        updateRow(uid, { status: "submitted", expanded: false });
        toast.success("Order submitted successfully");
        // Auto-update event stock tracker
        if (eventContext?.visitId && navigator.onLine) {
          try {
            const { data: stockRes, error: stockErr } = await supabase.rpc(
              "apply_event_stock_for_order" as any,
              {
                p_visit_id: eventContext.visitId,
                p_order_id: (res as any).order?.id ?? null,
                p_order_date: orderData.order_date,
                p_items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
              }
            );
            if (stockErr) console.warn("[event-stock] update failed:", stockErr.message);
            else if ((stockRes as any)?.skipped > 0) {
              toast.message(`Stock updated (${(stockRes as any).skipped} item(s) had no tracker row)`);
            }
            window.dispatchEvent(new CustomEvent("event-stock:changed", { detail: { visitId: eventContext.visitId } }));
          } catch (err) {
            console.warn("[event-stock] rpc error", err);
          }
        }
      } else {
        toast.error("Submission failed");
      }
    } catch (e: any) {
      toast.error(`Failed: ${e?.message || "unknown"}`);
    } finally {
      setSubmittingRows((s) => {
        const n = new Set(s);
        n.delete(uid);
        return n;
      });
    }
  };

  const saveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(rows));
      toast.success("Draft saved on this device");
    } catch (e: any) {
      toast.error("Could not save draft");
    }
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  };

  const submittableRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.status !== "submitted" &&
          r.items.some((i) => i.product_id) &&
          ((r.customerType || "existing") === "walkin" || !!r.customer)
      ),
    [rows]
  );

  const submitAll = async () => {
    if (!user) {
      toast.error("You must be signed in");
      return;
    }
    if (submittableRows.length === 0) {
      toast.error("Nothing to submit");
      return;
    }
    // validate all
    for (const r of submittableRows) {
      const err = validateRow(r, true);
      if (err) {
        toast.error(`Customer "${r.customer?.name || "?"}": ${err}`);
        return;
      }
    }
    setSubmitting(true);
    let successCount = 0;
    const updated = [...rows];
    for (const r of submittableRows) {
      const filledItems = r.items.filter((i) => i.product_id);
      const subtotal = filledItems.reduce((s, i) => s + itemAmount(i), 0);
      const total = Math.round(subtotal);
      const isWalkIn = (r.customerType || "existing") === "walkin";
      let walkInCustomerId: string | null = null;
      if (isWalkIn && r.saveWalkIn && (r.walkInName || "").trim() && user) {
        try {
          const { data: created } = await supabase
            .from("counter_customers")
            .insert({
              name: (r.walkInName || "").trim(),
              phone: (r.walkInPhone || "").trim() || null,
              user_id: user.id,
            })
            .select("id,name,phone")
            .single();
          if (created) {
            walkInCustomerId = created.id;
            addRetailerLocal({ id: created.id, name: created.name, phone: created.phone });
          }
        } catch (err: any) {
          console.warn("[counter-sales] save walk-in failed:", err?.message);
        }
      }
      const walkInName = (r.walkInName || "").trim();
      // payment derivation
      let isCreditOrder = false;
      let creditPending = 0;
      let creditPaid = 0;
      let orderPaymentMethod = "";
      let paymentProofUrl = "";
      if (r.paymentMode === "credit") {
        isCreditOrder = true;
        creditPending = total;
        orderPaymentMethod = "credit";
      } else if (r.paymentMode === "full") {
        creditPaid = total;
        orderPaymentMethod = r.paymentMethod || "cash";
        paymentProofUrl =
          r.paymentMethod === "cheque" ? r.chequePhotoUrl || ""
          : r.paymentMethod === "upi" ? r.upiPhotoUrl || ""
          : r.paymentMethod === "neft" ? r.neftPhotoUrl || ""
          : "";
      } else if (r.paymentMode === "partial") {
        isCreditOrder = true;
        const paid = parseFloat(r.partialAmount || "0") || 0;
        creditPaid = paid;
        creditPending = Math.max(0, total - paid);
        orderPaymentMethod = r.paymentMethod || "cash";
        paymentProofUrl =
          r.paymentMethod === "cheque" ? r.chequePhotoUrl || ""
          : r.paymentMethod === "upi" ? r.upiPhotoUrl || ""
          : r.paymentMethod === "neft" ? r.neftPhotoUrl || ""
          : "";
      } else {
        orderPaymentMethod = "cash";
      }
      const orderData = {
        user_id: user.id,
        retailer_id: null as any,
        counter_customer_id: isWalkIn ? walkInCustomerId : r.customer!.id,
        retailer_name: isWalkIn
          ? walkInName || "Walk-in Customer"
          : r.customer!.name,
        order_date: getLocalTodayDate(),
        subtotal,
        discount_amount: 0,
        total_amount: total,
        status: "confirmed",
        payment_method: orderPaymentMethod,
        is_credit_order: isCreditOrder,
        credit_pending_amount: creditPending,
        credit_paid_amount: creditPaid,
        payment_proof_url: paymentProofUrl || null,
        upi_last_four_code: r.paymentMethod === "upi" ? r.upiLastFourCode || null : null,
        idempotency_key: `counter_${user.id}_${r.uid}_${Date.now()}`,
        ...(eventContext?.visitId ? { visit_id: eventContext.visitId } : {}),
      };
      const items = filledItems.map((i) => ({
        product_id: i.product_id,
        product_name: i.product_name,
        category: i.category || null,
        rate: i.rate,
        original_rate: i.rate,
        discount_amount: Number(i.discount) || 0,
        unit: i.unit,
        quantity: i.quantity,
        total: itemAmount(i),
        hsn_code: null,
        sgst_amount: 0,
        cgst_amount: 0,
      }));
      try {
        const res = await submitOrderWithOfflineSupport(orderData, items, {
          connectivityStatus: navigator.onLine ? "online" : "offline",
        });
        if (res?.success) {
          successCount++;
          const idx = updated.findIndex((x) => x.uid === r.uid);
          if (idx >= 0) updated[idx] = { ...updated[idx], status: "submitted", expanded: false };
          if (eventContext?.visitId && navigator.onLine) {
            try {
              await supabase.rpc("apply_event_stock_for_order" as any, {
                p_visit_id: eventContext.visitId,
                p_order_id: (res as any).order?.id ?? null,
                p_order_date: orderData.order_date,
                p_items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
              });
              window.dispatchEvent(new CustomEvent("event-stock:changed", { detail: { visitId: eventContext.visitId } }));
            } catch (err) {
              console.warn("[event-stock] rpc error", err);
            }
          }
        }
      } catch (e: any) {
        toast.error(`Failed: ${r.customer?.name} — ${e?.message || "unknown"}`);
      }
    }
    setRows(updated);
    setSubmitting(false);
    if (successCount > 0) {
      toast.success(`Submitted ${successCount} order${successCount > 1 ? "s" : ""}`);
      clearDraft();
      setTab("summary");
    }
  };

  // ---- totals ----
  const totals = useMemo(() => {
    const customers = rows.filter(
      (r) => r.customer || (r.customerType === "walkin" && r.items.some((i) => i.product_id))
    ).length;
    const items = rows.reduce((s, r) => s + rowItemCount(r), 0);
    const grand = rows.reduce((s, r) => s + rowAmount(r), 0);
    const subtotal = rows.reduce(
      (s, r) =>
        s +
        r.items.reduce(
          (a, i) => a + (i.product_id ? itemSubtotal(i) : 0),
          0
        ),
      0
    );
    const discount = rows.reduce(
      (s, r) =>
        s + r.items.reduce((a, i) => a + (i.product_id ? itemDiscount(i) : 0), 0),
      0
    );
    const tax = rows.reduce(
      (s, r) => s + r.items.reduce((a, i) => a + (i.product_id ? itemTax(i) : 0), 0),
      0
    );
    return { customers, items, grand, subtotal, discount, tax };
  }, [rows]);

  const orderedRows = useMemo(
    () =>
      [...rows]
        .map((row, originalIdx) => ({ row, originalIdx }))
        .sort((a, b) => {
          const aDone = a.row.status === "saved" || a.row.status === "submitted" ? 1 : 0;
          const bDone = b.row.status === "saved" || b.row.status === "submitted" ? 1 : 0;
          if (aDone !== bDone) return aDone - bDone;
          return a.originalIdx - b.originalIdx;
        }),
    [rows]
  );

  return (
    <>
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-muted/40 to-background">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 max-w-3xl pb-32">
          {/* Page header */}
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (window.history.length > 1) navigate(-1);
                  else navigate("/");
                }}
                className="rounded-full h-8 w-8 sm:h-9 sm:w-9 -ml-1 shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-2xl font-bold tracking-tight text-foreground truncate">
                  {eventContext ? eventContext.eventName : "Counter Sales – Orders"}
                </h1>
                <p className="text-[11px] sm:text-sm text-muted-foreground truncate">
                  {eventContext
                    ? [eventContext.eventDate, eventContext.location].filter(Boolean).join(" • ") ||
                      "Event orders"
                    : "Add orders for multiple customers"}
                </p>
              </div>
            </div>
            <Button
              onClick={submitAll}
              disabled={submitting}
              className="rounded-xl h-9 sm:h-11 px-3 sm:px-4 text-xs sm:text-sm shrink-0 bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-1.5 animate-spin" />
              ) : (
                <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
              )}
              Submit All
            </Button>
          </div>

          {/* Orders / Summary tabs */}
          <Tabs value={tab} onValueChange={(v) => setTab(v as "orders" | "summary")} className="mb-3">
            <TabsList className="grid grid-cols-2 w-full rounded-xl h-9">
              <TabsTrigger value="orders" className="rounded-lg text-xs sm:text-sm">
                Orders
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">{rows.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="summary" className="rounded-lg text-xs sm:text-sm">
                Summary
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                  {rows.filter((r) => r.status === "saved" || r.status === "submitted").length}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {tab === "summary" ? (
            <SummaryView
              rows={rows.filter((r) => r.status === "saved" || r.status === "submitted")}
              onDelete={(uid) => deleteRow(uid)}
            />
          ) : (
          <>
          {/* Overview summary card */}
          <Card className="rounded-2xl border bg-card shadow-sm mb-4">
            <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3">
              <div className="grid grid-cols-3 flex-1 divide-x min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2.5 pr-2 sm:pr-3 min-w-0">
                  <div className="h-7 w-7 sm:h-9 sm:w-9 shrink-0 rounded-full bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center">
                    <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] sm:text-[11px] text-muted-foreground leading-tight whitespace-nowrap">Customers</div>
                    <div className="text-sm sm:text-base font-bold leading-tight">{totals.customers}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2.5 px-2 sm:px-3 min-w-0">
                  <div className="h-7 w-7 sm:h-9 sm:w-9 shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center">
                    <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] sm:text-[11px] text-muted-foreground leading-tight whitespace-nowrap">Total Items</div>
                    <div className="text-sm sm:text-base font-bold leading-tight">{totals.items}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2.5 pl-2 sm:pl-3 min-w-0">
                  <div className="h-7 w-7 sm:h-9 sm:w-9 shrink-0 rounded-full bg-amber-50 dark:bg-amber-500/15 flex items-center justify-center">
                    <span className="text-amber-600 dark:text-amber-400 text-xs sm:text-sm font-bold">{currencySymbol}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] sm:text-[11px] text-muted-foreground leading-tight whitespace-nowrap">Grand Total</div>
                    <div className="text-sm sm:text-base font-bold leading-tight whitespace-nowrap">{format(totals.grand)}</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Add Customer */}
          <Card className="rounded-2xl border-dashed border-2 mb-3 bg-card/40">
            <Button
              variant="ghost"
              onClick={addRow}
              className="w-full h-12 text-blue-600 dark:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-500/5 font-semibold rounded-2xl"
            >
              <Plus className="h-4 w-4 mr-1.5" /> Add Customer
            </Button>
          </Card>

          {/* Customer cards */}
          <div className="space-y-3">
            {orderedRows.map(({ row, originalIdx: idx }) => (
              <CounterCustomerCard
                key={row.uid}
                index={idx + 1}
                row={row}
                products={products}
                customers={customers}
                submitting={submittingRows.has(row.uid)}
                eventMode={!!eventContext}
                onToggleExpand={() => toggleExpand(row.uid)}
                onPickCustomer={(ret) =>
                  updateRow(row.uid, { customer: ret, phoneOverride: ret.phone || undefined, updatedAt: Date.now() })
                }
                onCreateRetailer={addRetailerLocal}
                onAddItemRow={() => addItemRow(row.uid)}
                onUpdateItem={(itemUid, patch) => updateItem(row.uid, itemUid, patch)}
                onRemoveItem={(itemUid) => removeItem(row.uid, itemUid)}
                onPaymentModeChange={(m) => updateRow(row.uid, { paymentMode: m, updatedAt: Date.now() })}
                onPaymentMethodChange={(pm) => updateRow(row.uid, { paymentMethod: pm, updatedAt: Date.now() })}
                onCustomerTypeChange={(t) =>
                  updateRow(row.uid, {
                    customerType: t,
                    ...(t === "walkin" ? { customer: null, phoneOverride: undefined } : {}),
                    updatedAt: Date.now(),
                  })
                }
                onWalkInChange={(patch) => updateRow(row.uid, { ...patch, updatedAt: Date.now() })}
                onPatchRow={(patch) => updateRow(row.uid, { ...patch, updatedAt: Date.now() })}
                onOpenCamera={(mode) => {
                  setCameraRowUid(row.uid);
                  setCameraMode(mode);
                  setIsCameraOpen(true);
                }}
                companyQrCode={companyQrCode}
                isPaymentProofMandatory={isPaymentProofMandatory}
                onSave={() => saveRow(row.uid)}
                onSubmit={() => submitSingleRow(row.uid)}
                onEdit={() => editRow(row.uid)}
                onDelete={() => deleteRow(row.uid)}
              />
            ))}
          </div>
          </>
          )}

        </div>

        {/* Sticky Submit bar */}
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="container mx-auto max-w-3xl px-3 sm:px-4 py-3">
            <Button
              onClick={submitAll}
              disabled={submitting}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 text-sm font-semibold"
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Submit All Orders <span className="opacity-60 mx-2">•</span> {format(totals.grand)}
            </Button>
          </div>
        </div>
      </div>
    </Layout>
    <CameraCapture
      isOpen={isCameraOpen}
      onClose={() => setIsCameraOpen(false)}
      onCapture={handleCameraCapture}
      title={
        cameraMode === "cheque"
          ? "Capture Cheque Photo"
          : cameraMode === "upi"
          ? "Capture Payment Confirmation"
          : "Capture NEFT Confirmation"
      }
    />
    </>
  );
}

// ===================================================================
// ORDER ROW — full-width expansion, no nested cards, flat grid
// ===================================================================
function OrderRow({
  row,
  products,
  customers,
  submitting,
  onToggleExpand,
  onPickCustomer,
  onCreateRetailer,
  onPhoneChange,
  onAddItemRow,
  onUpdateItem,
  onRemoveItem,
  onSave,
  onSubmit,
  onEdit,
  onDelete,
}: {
  row: CounterRow;
  products: any[];
  customers: CounterCustomer[];
  submitting?: boolean;
  onToggleExpand: () => void;
  onPickCustomer: (r: CounterCustomer) => void;
  onCreateRetailer: (r: CounterCustomer) => void;
  onPhoneChange: (p: string) => void;
  onAddItemRow: () => void;
  onUpdateItem: (itemUid: string, patch: Partial<CounterLineItem>) => void;
  onRemoveItem: (itemUid: string) => void;
  onSave: () => void;
  onSubmit: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { format } = useCurrency();
  const currencySymbol = format(0).replace(/[\d.,\s]/g, '') || '';
  const locked = row.status === "saved" || row.status === "submitted";
  const subtotal = row.items.reduce(
    (s, i) => s + (i.product_id ? itemSubtotal(i) : 0),
    0
  );
  const discountTotal = row.items.reduce(
    (s, i) => s + (i.product_id ? itemDiscount(i) : 0),
    0
  );
  const taxableTotal = row.items.reduce(
    (s, i) => s + (i.product_id ? itemTaxable(i) : 0),
    0
  );
  const taxTotal = row.items.reduce((s, i) => s + (i.product_id ? itemTax(i) : 0), 0);
  const total = taxableTotal + taxTotal;

  return (
    <div className={cn("border-b last:border-b-0", locked && "bg-muted/10")}>
      {/* main row */}
      <div className="grid grid-cols-[40px_1.6fr_1fr_1fr_220px] items-center gap-3 px-4 py-3">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleExpand}>
          {row.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>

        <div className="min-w-0">
          <InlineCustomerSelect
            value={row.customer}
            phone={row.phoneOverride}
            disabled={locked}
            customers={customers}
            onPick={onPickCustomer}
            onCreated={(r) => {
              onCreateRetailer(r);
              onPickCustomer(r);
            }}
          />
        </div>

        <div className="text-sm">
          {rowItemCount(row)} item{rowItemCount(row) !== 1 ? "s" : ""}
        </div>

        <div className="text-sm font-semibold">{format(total)}</div>

        <div className="flex items-center justify-end gap-2">
          {row.status === "submitted" ? (
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15">
              Submitted
            </Badge>
          ) : row.status === "saved" ? (
            <>
              <Badge variant="secondary">
                <Lock className="h-3 w-3 mr-1" /> Saved
              </Badge>
              <Button size="sm" variant="ghost" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" onClick={onSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                Submit
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={onSave}>
                <Save className="h-3.5 w-3.5 mr-1" /> Save
              </Button>
              <Button size="sm" onClick={onSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                Submit
              </Button>
            </>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onDelete}
            disabled={row.status === "submitted"}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* expanded — FULL WIDTH, flat */}
      {row.expanded && (
        <div className="bg-muted/20 border-t px-4 py-3">
          {/* products sub-table — header */}
          <div className="grid grid-cols-[2fr_90px_70px_100px_100px_40px] items-center gap-2 px-2 py-2 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
            <div>Product</div>
            <div>Unit</div>
            <div>Qty</div>
            <div>Price ({currencySymbol})</div>
            <div>Discount ({currencySymbol})</div>
            <div></div>
          </div>

          {row.items.map((item, idx) => (
            <div
              key={item.uid}
              className="grid grid-cols-[2fr_90px_70px_100px_100px_40px] items-start gap-2 px-2 py-1.5 border-t border-border/50"
            >
              <InlineProductSelect
                value={item}
                products={products}
                disabled={locked}
                onPick={(p) =>
                  onUpdateItem(item.uid, {
                    product_id: p.id,
                    product_name: p.name,
                    category: p.category?.name || null,
                    sku: p.sku || null,
                    unit: p.unit || "Unit",
                    rate: Number(p.rate) || 0,
                    original_rate: Number(p.rate) || 0,
                    conversion_to_base: null,
                    price_basis_conversion: null,
                  })
                }
                onEnter={() => {
                  if (idx === row.items.length - 1) onAddItemRow();
                }}
              />
              {item.product_id ? (
                <LineItemUomSelect
                  productId={item.product_id}
                  value={item.unit}
                  context="sales"
                  hideWhenSingle={false}
                  disabled={locked}
                  className="h-9 w-full"
                  onChange={(sel) => {
                    const patch = uomSelectionPatch(
                      item,
                      products.find((p) => p.id === item.product_id),
                      sel,
                    );
                    if (patch) onUpdateItem(item.uid, patch);
                  }}
                />
              ) : (
                <Select value={item.unit} disabled>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={item.unit}>{item.unit}</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Input
                type="number"
                min={0}
                value={item.quantity}
                disabled={locked}
                onChange={(e) =>
                  onUpdateItem(item.uid, { quantity: Number(e.target.value) || 0 })
                }
                className="h-9"
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                value={item.rate}
                disabled={locked}
                onChange={(e) => onUpdateItem(item.uid, { rate: Number(e.target.value) || 0 })}
                className="h-9"
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                value={itemDiscount(item).toFixed(2)}
                readOnly
                tabIndex={-1}
                title="Auto-calculated from price drop vs original rate"
                className="h-9 bg-muted/40"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-destructive hover:text-destructive"
                disabled={locked || row.items.length === 1}
                onClick={() => onRemoveItem(item.uid)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {/* Add row + totals */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-3 mt-3">
            <Button
              variant="outline"
              onClick={onAddItemRow}
              disabled={locked}
              className="border-dashed h-10 text-muted-foreground"
            >
              <Plus className="h-4 w-4 mr-1" /> Add Row
            </Button>
            <div className="rounded-xl border bg-background px-3 py-2 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{format(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="text-destructive">- {format(discountTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxable Amount</span>
                <span>{format(taxableTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Tax (incl. GST)</span>
                <span>{format(taxTotal)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 mt-1 font-semibold">
                <span>Total Amount</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {format(total)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===================================================================
// SUMMARY VIEW
// ===================================================================
function SummaryView({
  rows,
  onDelete,
}: {
  rows: CounterRow[];
  onDelete: (uid: string) => void;
}) {
  const { format } = useCurrency();
  const navigate = useNavigate();
  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground rounded-2xl">
        No submitted orders yet. Submit an order from the Orders tab to see it here.
      </Card>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-base font-semibold">Submitted orders</h3>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map((r) => {
          const initials = (r.customer?.name || "?")
            .split(" ")
            .map((s) => s[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();
          return (
            <Card key={r.uid} className="rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center shrink-0">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{r.customer?.name || "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {rowItemCount(r)} item{rowItemCount(r) !== 1 ? "s" : ""}
                  </div>
                </div>
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15 shrink-0">
                  Submitted
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3 pt-2 border-t">
                <div>
                  <div className="text-[11px] text-muted-foreground leading-none">Total Amount</div>
                  <div className="text-base font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                    {format(rowAmount(r))}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => navigate("/invoices")}
                >
                  <FileText className="h-3.5 w-3.5 mr-1" /> Download Invoice
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ===================================================================
// PRODUCT PICKER DIALOG
// ===================================================================
function ProductPickerDialog({
  open,
  onClose,
  products,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  products: any[];
  onAdd: (p: any, qty: number, unit: string, price: number) => void;
}) {
  const { format } = useCurrency();
  const currencySymbol = format(0).replace(/[\d.,\s]/g, '') || '';
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<any | null>(null);
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState("Pcs");
  const [price, setPrice] = useState(0);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setPicked(null);
      setQty(1);
      setPrice(0);
    }
  }, [open]);

  useEffect(() => {
    if (picked) {
      setUnit(picked.unit || "Pcs");
      setPrice(Number(picked.rate) || 0);
    }
  }, [picked]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 50);
    return products
      .filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.category?.name?.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [products, search]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Product</DialogTitle>
        </DialogHeader>

        {!picked ? (
          <>
            <Input
              placeholder="Search by name, SKU, or category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-80 overflow-y-auto border rounded-lg divide-y">
              {filtered.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">No products</div>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPicked(p)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {p.category?.name || "—"} · {p.unit || "Pcs"}
                      </div>
                    </div>
                    <div className="text-sm font-semibold">{format(Number(p.rate || 0))}</div>
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border p-3 bg-muted/30">
              <div className="font-medium">{picked.name}</div>
              <div className="text-xs text-muted-foreground">
                {picked.category?.name || "—"}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Quantity</label>
                <Input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Unit</label>
                <LineItemUomSelect
                  productId={picked.id}
                  value={unit}
                  context="sales"
                  hideWhenSingle={false}
                  className="h-10 w-full"
                  onChange={(sel) => {
                    if (sel.uomCode === unit) return;
                    setUnit(sel.uomCode);
                    setPrice(uomUnitPrice(Number(picked.rate) || 0, sel));
                  }}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Price ({currencySymbol})</label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="text-right text-sm">
              Amount: <span className="font-semibold">{format(qty * price)}</span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {picked && (
            <>
              <Button variant="ghost" onClick={() => setPicked(null)}>
                Back
              </Button>
              <Button
                onClick={() => {
                  if (!qty || qty <= 0) {
                    toast.error("Quantity must be > 0");
                    return;
                  }
                  onAdd(picked, qty, unit, price);
                }}
              >
                Add to order
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================================================================
// INLINE CUSTOMER SELECT — searchable dropdown + inline create
// ===================================================================
function InlineCustomerSelect({
  value,
  phone,
  disabled,
  customers,
  onPick,
  onCreated,
}: {
  value: CounterCustomer | null;
  phone?: string;
  disabled?: boolean;
  customers: CounterCustomer[];
  onPick: (r: CounterCustomer) => void;
  onCreated: (r: CounterCustomer) => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"search" | "create">("search");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setMode("search");
      setNewName("");
      setNewPhone("");
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers.slice(0, 50);
    return customers
      .filter(
        (r) =>
          r.name?.toLowerCase().includes(q) ||
          r.phone?.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [customers, search]);

  const handleCreate = async () => {
    const name = newName.trim();
    const ph = newPhone.trim();
    if (!name) return toast.error("Customer name is required");
    if (!ph) return toast.error("Phone number is required");
    // duplicate check (local)
    const dup = customers.find((r) => (r.phone || "").trim() === ph);
    if (dup) {
      toast.error("Customer already exists. Selecting it instead.");
      onPick(dup);
      setOpen(false);
      return;
    }
    if (!user) return toast.error("You must be signed in");
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("counter_customers")
        .insert({
          name,
          phone: ph,
          user_id: user.id,
        })
        .select("id,name,phone")
        .single();
      if (error) throw error;
      const created: CounterCustomer = {
        id: data.id,
        name: data.name,
        phone: data.phone,
      };
      onCreated(created);
      toast.success("Customer created");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Could not create customer");
    } finally {
      setSaving(false);
    }
  };

  // trigger
  const trigger = value ? (
    <button
      type="button"
      disabled={disabled}
      className="text-left w-full disabled:cursor-not-allowed"
    >
      <div className="font-medium truncate">{value.name}</div>
      <div className="text-xs text-muted-foreground truncate">
        {phone || value.phone || "—"}
      </div>
    </button>
  ) : (
    <Button variant="outline" size="sm" disabled={disabled} className="w-full justify-start">
      <Search className="h-3.5 w-3.5 mr-1" /> Select customer
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={(v) => !disabled && setOpen(v)}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        {mode === "search" ? (
          <div className="p-2">
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8"
                autoFocus
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {filtered.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground text-center">
                  No customers
                </div>
              ) : (
                filtered.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      onPick(r);
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50"
                  >
                    <div className="text-sm font-medium truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.phone || "—"}
                    </div>
                  </button>
                ))
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start mt-2 text-primary"
              onClick={() => {
                setNewName(search);
                setMode("create");
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Create New Customer
            </Button>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              New Customer
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Name *</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-9"
                placeholder="Customer name"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Phone *</label>
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="h-9"
                placeholder="10-digit number"
                inputMode="tel"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMode("search")}
                disabled={saving}
              >
                Back
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                Done
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ===================================================================
// INLINE PRODUCT SELECT — searchable dropdown with name, SKU, price
// ===================================================================
function InlineProductSelect({
  value,
  products,
  disabled,
  onPick,
  onEnter,
}: {
  value: CounterLineItem;
  products: any[];
  disabled?: boolean;
  onPick: (p: any) => void;
  onEnter?: () => void;
}) {
  const { format } = useCurrency();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = !q
      ? products
      : products.filter(
          (p) =>
            p.name?.toLowerCase().includes(q) ||
            p.sku?.toLowerCase().includes(q) ||
            p.category?.name?.toLowerCase().includes(q)
        );
    return list.slice(0, 50);
  }, [products, search]);

  return (
    <Popover open={open} onOpenChange={(v) => !disabled && setOpen(v)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "h-9 w-full rounded-md border border-input bg-background px-3 text-left text-sm",
            "flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60",
            !value.product_id && "text-muted-foreground"
          )}
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {value.product_id
              ? value.product_name
              : "Search product by name, SKU or scan…"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <div className="p-2">
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filtered[0]) {
                  onPick(filtered[0]);
                  setOpen(false);
                  onEnter?.();
                }
              }}
              className="h-9 pl-8"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
            {filtered.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground text-center">
                No products
              </div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onPick(p);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {p.sku ? `SKU: ${p.sku}` : p.category?.name || "—"}
                    </div>
                  </div>
                  <div className="text-sm font-semibold shrink-0">
                    {format(Number(p.rate || 0))}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}