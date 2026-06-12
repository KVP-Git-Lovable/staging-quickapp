import { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, AlertTriangle, X, Package, Loader2, ChevronDown, ChevronRight, Layers, Calendar, Warehouse, ToggleLeft, ToggleRight, Eye } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { OrderForPacking } from '@/hooks/usePackingList';
import { previewAllocation, previewBatchAvailability, BatchAllocation, PreviewAllocation } from '@/services/inventoryAllocationService';
import { useToast } from '@/hooks/use-toast';
import { useWarehouses } from '@/hooks/useWarehouses';
import LineItemUomSelect, { type LineItemUomSelection } from '@/components/uom/LineItemUomSelect';
import UomLabel from '@/components/uom/UomLabel';

export interface ApprovedItemMap {
  [orderItemId: string]: {
    order_id: string;
    product_id: string;
    product_name: string;
    ordered_qty: number;
    approved_qty: number;
    backorder_qty: number;
    unit?: string;
    price: number;
    allocations?: BatchAllocation[];
    /** UOM snapshot — captured when the user picks a non-base UOM in the review dialog. */
    uom_id?: string | null;
    uom_code?: string | null;
    conversion_to_base?: number | null;
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: OrderForPacking[];
  orderType: 'primary' | 'secondary';
  distributorId?: string | null;
  onConfirm: (approvedItems: ApprovedItemMap, warehouseId?: string | null, strategy?: string, manualAllocations?: Record<string, ManualBatchEntry[]>) => void;
  confirming?: boolean;
}

interface StockMap {
  [productId: string]: number;
}

interface BatchPreview {
  id: string;
  batch_no: string;
  expiry_date: string | null;
  available_qty: number;
  warehouse_id: string | null;
}

interface ReviewItem {
  orderItemId: string;
  orderId: string;
  orderNumber: string;
  productId: string;
  productName: string;
  unit?: string;
  price: number;
  orderedQty: number;
  approvedQty: number;
  availableStock: number;
}

// Proposed allocation per product (preview mode - no DB writes)
interface ProposedAllocation {
  allocations: PreviewAllocation[];
  total_allocated: number;
  shortfall_qty: number;
}

// Manual allocation entry per batch
export interface ManualBatchEntry {
  batch_id: string;
  batch_no: string;
  expiry_date: string | null;
  available_qty: number;
  allocate_qty: number;
}

export default function OrderReviewApprovalDialog({
  open, onOpenChange, orders, orderType, distributorId, onConfirm, confirming
}: Props) {
  const { toast } = useToast();
  const [allocating, setAllocating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [stockMap, setStockMap] = useState<StockMap>({});
  const [loadingStock, setLoadingStock] = useState(false);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [allocationMode, setAllocationMode] = useState<'auto' | 'manual'>('auto');
  const [allocationStrategy, setAllocationStrategy] = useState<'FEFO' | 'FIFO' | 'LIFO'>('FEFO');
  const [batchPreviewMap, setBatchPreviewMap] = useState<Record<string, BatchPreview[]>>({});
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [loadingBatches, setLoadingBatches] = useState(false);

  // Preview state: proposed allocations per product (read-only, no DB writes)
  const [proposedAllocations, setProposedAllocations] = useState<Record<string, ProposedAllocation>>({});
  const [allocationPreviewed, setAllocationPreviewed] = useState(false);

  // Manual allocation state per product
  const [manualAllocations, setManualAllocations] = useState<Record<string, ManualBatchEntry[]>>({});

  // Per-line UOM selection (snapshot). Keyed by orderItemId.
  // Defaults to the product's BASE unit; user can switch via <LineItemUomSelect>.
  const [selectedUoms, setSelectedUoms] = useState<Record<string, LineItemUomSelection>>({});

  const { warehouses, defaultWarehouse, loading: warehousesLoading } = useWarehouses(distributorId || null);

  // Set default warehouse
  useEffect(() => {
    if (defaultWarehouse && !selectedWarehouseId) {
      setSelectedWarehouseId(defaultWarehouse.id);
    }
  }, [defaultWarehouse, selectedWarehouseId]);

  // Flatten orders into review items
  useEffect(() => {
    if (!open || orders.length === 0) return;

    const items: ReviewItem[] = [];
    orders.forEach(order => {
      order.items.forEach((item, idx) => {
        items.push({
          orderItemId: item.id || `${order.id}_${item.product_id}_${idx}`,
          orderId: order.id,
          orderNumber: order.order_number || order.id.slice(0, 8),
          productId: item.product_id,
          productName: item.product_name,
          unit: item.unit,
          price: item.price,
          orderedQty: item.quantity,
          approvedQty: item.quantity,
          availableStock: 0,
        });
      });
    });
    setReviewItems(items);
    setBatchPreviewMap({});
    setExpandedProducts(new Set());
    setProposedAllocations({});
    setAllocationPreviewed(false);
    setManualAllocations({});
    setSelectedUoms({});
  }, [open, orders]);

  // Fetch available stock (warehouse-filtered)
  useEffect(() => {
    if (!open || !distributorId) return;

    const fetchStock = async () => {
      setLoadingStock(true);
      try {
        const productIds = [...new Set(orders.flatMap(o => o.items.map(i => i.product_id)))];
        if (productIds.length === 0) return;

        let query = supabase
          .from('distributor_inventory')
          .select('product_id, quantity, reserved_quantity, damaged_quantity, expired_quantity')
          .eq('distributor_id', distributorId)
          .in('product_id', productIds);

        if (selectedWarehouseId && selectedWarehouseId !== 'all') {
          query = query.eq('warehouse_id', selectedWarehouseId);
        }

        const { data, error } = await query;
        if (error) {
          console.error('Failed to fetch distributor_inventory:', error);
        }

        const map: StockMap = {};
        (data || []).forEach((inv: any) => {
          const avail = (inv.quantity || 0)
            - (inv.reserved_quantity || 0)
            - (inv.damaged_quantity || 0)
            - (inv.expired_quantity || 0);
          map[inv.product_id] = (map[inv.product_id] || 0) + Math.max(0, avail);
        });
        setStockMap(map);

        setReviewItems(prev => prev.map(item => ({
          ...item,
          availableStock: map[item.productId] || 0,
        })));

        // Also fetch batch previews
        await fetchBatchPreviews(productIds);
      } finally {
        setLoadingStock(false);
      }
    };
    fetchStock();

    // Clear previewed allocations when warehouse changes
    setProposedAllocations({});
    setAllocationPreviewed(false);
    setManualAllocations({});
  }, [open, distributorId, orders, selectedWarehouseId]);

  const fetchBatchPreviews = async (productIds: string[]) => {
    if (!distributorId) return;
    setLoadingBatches(true);
    try {
      const whId = selectedWarehouseId && selectedWarehouseId !== 'all' ? selectedWarehouseId : null;
      const map: Record<string, BatchPreview[]> = {};
      for (const pid of productIds) {
        const result = await previewBatchAvailability(distributorId, pid, whId);
        map[pid] = result.batches;
      }
      setBatchPreviewMap(map);

      // Initialize manual allocations with zero qty for all batches
      const manualMap: Record<string, ManualBatchEntry[]> = {};
      for (const [pid, batches] of Object.entries(map)) {
        manualMap[pid] = batches.map(b => ({
          batch_id: b.id,
          batch_no: b.batch_no,
          expiry_date: b.expiry_date,
          available_qty: b.available_qty,
          allocate_qty: 0,
        }));
      }
      setManualAllocations(manualMap);
    } finally {
      setLoadingBatches(false);
    }
  };

  // -------------------- UOM helpers --------------------
  // Per-line UOM conversion. The UI shows quantities in the selected UOM,
  // but every value persisted to the DB stays in BASE units.

  /** Conversion factor for a row (defaults to 1 → no-op for single-UOM products). */
  const factorFor = (orderItemId: string): number => {
    const sel = selectedUoms[orderItemId];
    return sel && sel.conversionToBase > 0 ? sel.conversionToBase : 1;
  };

  /** Convert a base-unit qty into the UOM the user picked, for display. */
  const toDisplay = (orderItemId: string, baseQty: number): number => {
    const f = factorFor(orderItemId);
    if (f === 1) return baseQty;
    const v = baseQty / f;
    // keep up to 3 decimals when fractional, otherwise integer
    return Number.isInteger(v) ? v : Math.round(v * 1000) / 1000;
  };

  /** Round-trip a user-entered qty (in selected UOM) back into base units. */
  const fromDisplay = (orderItemId: string, displayQty: number): number => {
    const f = factorFor(orderItemId);
    return displayQty * f;
  };

  const handleUomChange = (orderItemId: string, sel: LineItemUomSelection) => {
    setSelectedUoms(prev => ({ ...prev, [orderItemId]: sel }));
    // Clear preview because available stock display will reformat
    setAllocationPreviewed(false);
    setProposedAllocations({});
  };

  const updateApprovedQty = (orderItemId: string, value: number) => {
    // `value` arrives in the SELECTED UOM — convert back to base before storing.
    const baseValue = fromDisplay(orderItemId, value);
    setReviewItems(prev => prev.map(item => {
      if (item.orderItemId !== orderItemId) return item;
      const approved = Math.max(0, Math.min(baseValue, item.orderedQty));
      return { ...item, approvedQty: approved };
    }));
    // Clear preview when qty changes
    setAllocationPreviewed(false);
    setProposedAllocations({});
  };

  const handleApproveAll = () => {
    setReviewItems(prev => prev.map(item => ({ ...item, approvedQty: item.orderedQty })));
    setAllocationPreviewed(false);
    setProposedAllocations({});
  };

  /**
   * Auto-fill by Stock: runs PREVIEW allocation (no DB writes).
   * Adjusts approved_qty based on available stock and shows proposed batch allocations.
   */
  const handleAutoFillByStock = async () => {
    if (!distributorId) {
      // No distributor — simple stock-based fill
      const remainingStock: Record<string, number> = {};
      Object.entries(stockMap).forEach(([pid, qty]) => { remainingStock[pid] = qty; });
      setReviewItems(prev => prev.map(item => {
        const remaining = remainingStock[item.productId] ?? 0;
        const approved = Math.min(item.orderedQty, remaining);
        remainingStock[item.productId] = Math.max(0, remaining - approved);
        return { ...item, approvedQty: approved };
      }));
      return;
    }

    setPreviewing(true);
    try {
      // Aggregate needed qty per product
      const productQtyMap = new Map<string, number>();
      reviewItems.forEach(item => {
        if (item.orderedQty <= 0) return;
        productQtyMap.set(item.productId, (productQtyMap.get(item.productId) || 0) + item.orderedQty);
      });

      const whId = selectedWarehouseId && selectedWarehouseId !== 'all' ? selectedWarehouseId : null;
      const newProposed: Record<string, ProposedAllocation> = {};

      for (const [productId, qty] of productQtyMap) {
        const result = await previewAllocation(distributorId, productId, qty, allocationStrategy, whId);
        newProposed[productId] = {
          allocations: result.allocations,
          total_allocated: result.total_allocated,
          shortfall_qty: result.shortfall_qty,
        };
      }

      setProposedAllocations(newProposed);
      setAllocationPreviewed(true);

      // Adjust approved_qty based on preview
      const remainingAllocated: Record<string, number> = {};
      Object.entries(newProposed).forEach(([pid, p]) => { remainingAllocated[pid] = p.total_allocated; });

      setReviewItems(prev => prev.map(item => {
        const available = remainingAllocated[item.productId] ?? 0;
        const approved = Math.min(item.orderedQty, available);
        remainingAllocated[item.productId] = Math.max(0, available - approved);
        return { ...item, approvedQty: approved };
      }));

      // Auto-expand products with allocations
      const newExpanded = new Set<string>();
      Object.entries(newProposed).forEach(([pid, p]) => {
        if (p.allocations.length > 0) newExpanded.add(pid);
      });
      setExpandedProducts(newExpanded);

      const shortfalls = Object.entries(newProposed)
        .filter(([, p]) => p.shortfall_qty > 0)
        .map(([pid, p]) => {
          const name = reviewItems.find(i => i.productId === pid)?.productName || pid;
          return `${name}: ${p.shortfall_qty} short`;
        });

      if (shortfalls.length > 0) {
        toast({ title: 'Partial Allocation Preview', description: shortfalls.join('; '), variant: 'destructive' });
      } else {
        toast({ title: 'Allocation Preview Ready', description: 'All items can be fully allocated. Click Confirm to commit.' });
      }
    } finally {
      setPreviewing(false);
    }
  };

  const toggleProductExpand = (productId: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      next.has(productId) ? next.delete(productId) : next.add(productId);
      return next;
    });
  };

  // Handle manual batch qty change
  const updateManualBatchQty = (productId: string, batchId: string, qty: number) => {
    setManualAllocations(prev => {
      const entries = (prev[productId] || []).map(e => 
        e.batch_id === batchId ? { ...e, allocate_qty: Math.max(0, Math.min(qty, e.available_qty)) } : e
      );
      return { ...prev, [productId]: entries };
    });
    setAllocationPreviewed(false);
  };

  // Summary stats
  const summary = useMemo(() => {
    let totalOrdered = 0, totalApproved = 0, totalBackorder = 0, totalRejectedOrders = 0;
    let fullyAllocated = 0, partiallyAllocated = 0, outOfStock = 0;
    const orderApprovalMap = new Map<string, boolean>();
    const seenProducts = new Set<string>();

    reviewItems.forEach(item => {
      totalOrdered += item.orderedQty;
      totalApproved += item.approvedQty;
      totalBackorder += (item.orderedQty - item.approvedQty);

      const hasApproval = orderApprovalMap.get(item.orderId);
      if (hasApproval === undefined) {
        orderApprovalMap.set(item.orderId, item.approvedQty > 0);
      } else if (item.approvedQty > 0) {
        orderApprovalMap.set(item.orderId, true);
      }

      if (!seenProducts.has(item.productId) && distributorId) {
        seenProducts.add(item.productId);
        const proposed = proposedAllocations[item.productId];
        if (proposed) {
          if (proposed.shortfall_qty === 0 && proposed.total_allocated > 0) fullyAllocated++;
          else if (proposed.total_allocated > 0) partiallyAllocated++;
          else outOfStock++;
        } else {
          const avail = item.availableStock;
          const needed = item.orderedQty;
          if (avail <= 0) outOfStock++;
          else if (avail >= needed) fullyAllocated++;
          else partiallyAllocated++;
        }
      }
    });

    orderApprovalMap.forEach(hasAny => { if (!hasAny) totalRejectedOrders++; });

    return { totalOrdered, totalApproved, totalBackorder, totalRejectedOrders, fullyAllocated, partiallyAllocated, outOfStock };
  }, [reviewItems, distributorId, proposedAllocations]);

  // Get allocation status dot color for a product
  const getAllocationDot = (productId: string) => {
    const proposed = proposedAllocations[productId];
    if (!proposed) {
      const avail = stockMap[productId] || 0;
      if (avail <= 0) return 'bg-red-500';
      const needed = reviewItems.filter(i => i.productId === productId).reduce((s, i) => s + i.orderedQty, 0);
      if (avail >= needed) return 'bg-green-500';
      return 'bg-amber-500';
    }
    if (proposed.total_allocated <= 0) return 'bg-red-500';
    if (proposed.shortfall_qty === 0) return 'bg-green-500';
    return 'bg-amber-500';
  };

  const handleConfirm = async () => {
    const approvedItems: ApprovedItemMap = {};
    reviewItems.forEach(item => {
      const sel = selectedUoms[item.orderItemId];
      approvedItems[item.orderItemId] = {
        order_id: item.orderId,
        product_id: item.productId,
        product_name: item.productName,
        ordered_qty: item.orderedQty,
        approved_qty: item.approvedQty,
        backorder_qty: item.orderedQty - item.approvedQty,
        unit: item.unit,
        price: item.price,
        // UOM snapshot — null when no selector was rendered (single-UOM products)
        uom_id: sel?.uomId ?? null,
        uom_code: sel?.uomCode ?? null,
        conversion_to_base: sel?.conversionToBase ?? null,
      };
    });

    // Validate allocation in preview mode only.
    // Actual reservation must happen only once inside create_packing_list_atomic.
    if (distributorId) {
      setAllocating(true);
      try {
        const whId = selectedWarehouseId && selectedWarehouseId !== 'all' ? selectedWarehouseId : null;

        if (allocationMode === 'manual') {
          // Manual mode: validate entered quantities before atomic create
          const productQtyMap = new Map<string, number>();
          Object.values(approvedItems).forEach(item => {
            if (item.approved_qty <= 0) return;
            productQtyMap.set(item.product_id, (productQtyMap.get(item.product_id) || 0) + item.approved_qty);
          });

          for (const [productId, needed] of productQtyMap) {
            const entries = manualAllocations[productId] || [];
            const totalManual = entries.reduce((s, e) => s + e.allocate_qty, 0);
            if (totalManual < needed) {
              const name = reviewItems.find(i => i.productId === productId)?.productName || productId;
              toast({ title: 'Manual Allocation Insufficient', description: `${name}: allocated ${totalManual} but approved ${needed}`, variant: 'destructive' });
              return;
            }
          }
        } else {
          // Auto mode: validate with preview only; atomic create will do the real reservation
          const productQtyMap = new Map<string, number>();
          Object.values(approvedItems).forEach(item => {
            if (item.approved_qty <= 0) return;
            productQtyMap.set(item.product_id, (productQtyMap.get(item.product_id) || 0) + item.approved_qty);
          });

          const shortfalls: string[] = [];

          for (const [productId, qty] of productQtyMap) {
            let proposed = proposedAllocations[productId];

            if (!proposed) {
              const previewResult = await previewAllocation(distributorId, productId, qty, allocationStrategy, whId);
              if (!previewResult.success) {
                // Preview failed but don't block — the atomic RPC will handle allocation
                console.warn('Preview allocation failed for', productId, previewResult.error);
                continue;
              }

              proposed = {
                allocations: previewResult.allocations,
                total_allocated: previewResult.total_allocated,
                shortfall_qty: previewResult.shortfall_qty,
              };
            }

            if (proposed.shortfall_qty && proposed.shortfall_qty > 0) {
              const productName = reviewItems.find(i => i.productId === productId)?.productName || productId;
              shortfalls.push(`${productName}: only ${proposed.total_allocated} available, ${proposed.shortfall_qty} short`);

              // Update backorder_qty to reflect shortfall, but do NOT zero out approved_qty
              // The atomic RPC will allocate what's available and track backorder
              Object.values(approvedItems).forEach(item => {
                if (item.product_id === productId && item.approved_qty > 0) {
                  const ratio = (proposed.total_allocated || 0) / qty;
                  if (ratio > 0 && ratio < 1) {
                    const adjusted = Math.floor(item.approved_qty * ratio);
                    item.backorder_qty += (item.approved_qty - adjusted);
                    item.approved_qty = adjusted;
                  } else if (ratio === 0) {
                    // No stock at all — convert the entire line to backorder so the atomic RPC
                    // does not attempt to reserve unavailable stock and fail the whole create.
                    item.approved_qty = 0;
                    item.backorder_qty = item.ordered_qty;
                  }
                }
              });
            }
          }

          if (shortfalls.length > 0) {
            toast({ title: 'Partial Allocation (Backorder)', description: shortfalls.join('; ') });
          }
        }
      } catch (err) {
        console.error('Allocation validation error:', err);
        toast({ title: 'Allocation Error', description: 'Failed to validate stock before creating packing list', variant: 'destructive' });
        return;
      } finally {
        setAllocating(false);
      }
    }

    onConfirm(
      approvedItems,
      selectedWarehouseId && selectedWarehouseId !== 'all' ? selectedWarehouseId : null,
      allocationMode === 'auto' ? allocationStrategy : 'MANUAL',
      allocationMode === 'manual' ? manualAllocations : undefined
    );
  };

  // Group items by order for display
  const groupedByOrder = useMemo(() => {
    const groups: Record<string, { orderNumber: string; orderId: string; items: ReviewItem[] }> = {};
    reviewItems.forEach(item => {
      if (!groups[item.orderId]) {
        groups[item.orderId] = { orderNumber: item.orderNumber, orderId: item.orderId, items: [] };
      }
      groups[item.orderId].items.push(item);
    });
    return Object.values(groups);
  }, [reviewItems]);

  // Helper: check if batch expires within 30 days
  const isNearExpiry = (expiryDate: string | null) => {
    if (!expiryDate) return false;
    const days = differenceInDays(new Date(expiryDate), new Date());
    return days <= 30 && days >= 0;
  };

  const isExpired = (expiryDate: string | null) => {
    if (!expiryDate) return false;
    return new Date(expiryDate) <= new Date();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Review & Approve Orders
          </DialogTitle>
          <DialogDescription>
            Review quantities, preview stock allocation, and approve orders for packing list creation.
          </DialogDescription>
        </DialogHeader>

        {/* Warehouse Selector & Allocation Mode */}
        {distributorId && (
          <div className="flex flex-wrap gap-3 items-end">
            {/* Warehouse */}
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                <Warehouse className="h-3 w-3" /> Warehouse
              </label>
              <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={warehousesLoading ? 'Loading...' : 'All Warehouses'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Warehouses</SelectItem>
                  {warehouses.map(wh => (
                    <SelectItem key={wh.id} value={wh.id}>
                      {wh.name} {wh.is_default ? '(Default)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Allocation Mode */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Mode</label>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => {
                  setAllocationMode(prev => prev === 'auto' ? 'manual' : 'auto');
                  setProposedAllocations({});
                  setAllocationPreviewed(false);
                }}
              >
                {allocationMode === 'auto' ? (
                  <><ToggleRight className="h-3.5 w-3.5 mr-1 text-primary" /> Auto</>
                ) : (
                  <><ToggleLeft className="h-3.5 w-3.5 mr-1" /> Manual</>
                )}
              </Button>
            </div>

            {/* Strategy Selector (auto mode only) */}
            {allocationMode === 'auto' && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Strategy</label>
                <Select value={allocationStrategy} onValueChange={(v) => { setAllocationStrategy(v as 'FEFO' | 'FIFO' | 'LIFO'); setProposedAllocations({}); setAllocationPreviewed(false); }}>
                  <SelectTrigger className="h-9 w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FEFO">FEFO</SelectItem>
                    <SelectItem value="FIFO">FIFO</SelectItem>
                    <SelectItem value="LIFO">LIFO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleApproveAll}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve All
          </Button>
          {distributorId && allocationMode === 'auto' && (
            <Button variant="outline" size="sm" onClick={handleAutoFillByStock} disabled={previewing}>
              {previewing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
              {previewing ? 'Previewing...' : 'Preview Allocation'}
            </Button>
          )}
          {allocationPreviewed && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border-blue-200 text-xs">
              ✓ Preview ready — click Confirm to commit
            </Badge>
          )}
        </div>

        {/* Stock Availability Summary */}
        {distributorId && (
          <div className="flex gap-2 text-xs">
            <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400 border-green-200">
              ✓ {summary.fullyAllocated} Fully Stocked
            </Badge>
            {summary.partiallyAllocated > 0 && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200">
                ⚠ {summary.partiallyAllocated} Partial
              </Badge>
            )}
            {summary.outOfStock > 0 && (
              <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 border-red-200">
                ✗ {summary.outOfStock} Out of Stock
              </Badge>
            )}
          </div>
        )}

        {/* Items Table */}
        <div className="flex-1 overflow-auto border rounded-md">
          {loadingStock ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading stock data...</span>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-semibold">Product</TableHead>
                  <TableHead className="text-xs font-semibold">UOM</TableHead>
                  <TableHead className="text-xs font-semibold">Order #</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Ordered</TableHead>
                  {distributorId && (
                    <TableHead className="text-xs font-semibold text-right">Available Stock</TableHead>
                  )}
                  <TableHead className="text-xs font-semibold text-right">Approved Qty</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Backorder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedByOrder.map(group => (
                  group.items.map((item, idx) => {
                    const isOverStock = distributorId && item.approvedQty > item.availableStock;
                    const hasBackorder = item.approvedQty < item.orderedQty;
                    const batches = batchPreviewMap[item.productId] || [];
                    const hasBatches = batches.length > 0;
                    const isProductExpanded = expandedProducts.has(item.productId);
                    const proposed = proposedAllocations[item.productId];
                    const dotColor = distributorId ? getAllocationDot(item.productId) : '';

                    return (
                      <>
                        <TableRow key={item.orderItemId} className={idx === 0 ? 'border-t-2' : ''}>
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-1.5">
                              {distributorId && (
                                <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                              )}
                              {hasBatches && distributorId && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleProductExpand(item.productId); }}
                                  className="p-0.5 hover:bg-muted rounded"
                                >
                                  {isProductExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                </button>
                              )}
                              <div>
                                <span className="font-medium">{item.productName}</span>
                                <span className="text-xs text-muted-foreground ml-1">
                                  (<UomLabel productId={item.productId} fallback={item.unit} snapshotCode={selectedUoms[item.orderItemId]?.uomCode} />)
                                </span>
                                {hasBatches && (
                                  <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">
                                    <Layers className="h-2.5 w-2.5 mr-0.5" />
                                    {batches.length}
                                  </Badge>
                                )}
                                {/* Show allocated/short info from preview (in selected UOM) */}
                                {proposed && proposed.total_allocated > 0 && (
                                  <span className="ml-1 text-[10px] text-muted-foreground">
                                    (Alloc: {toDisplay(item.orderItemId, proposed.total_allocated)}{proposed.shortfall_qty > 0 ? `, Short: ${toDisplay(item.orderItemId, proposed.shortfall_qty)}` : ''})
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          {/* UOM picker — auto-hides for single-UOM products */}
                          <TableCell>
                            <LineItemUomSelect
                              productId={item.productId}
                              context="packing"
                              value={selectedUoms[item.orderItemId]?.uomCode}
                              onChange={(sel) => handleUomChange(item.orderItemId, sel)}
                              hideWhenSingle={false}
                            />
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {idx === 0 ? item.orderNumber : ''}
                          </TableCell>
                          <TableCell className="text-sm text-right font-medium">
                            {toDisplay(item.orderItemId, item.orderedQty)}
                          </TableCell>
                          {distributorId && (
                            <TableCell className="text-sm text-right">
                              <div className="flex flex-col items-end gap-0.5">
                                <div className="flex items-center justify-end gap-1">
                                  <span className={item.availableStock < item.orderedQty ? 'text-destructive font-medium' : 'text-green-600 dark:text-green-400'}>
                                    {toDisplay(item.orderItemId, item.availableStock)}
                                  </span>
                                  {item.availableStock < item.orderedQty && item.availableStock > 0 && (
                                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                                  )}
                                  {item.availableStock === 0 && (
                                    <AlertTriangle className="h-3 w-3 text-destructive" />
                                  )}
                                </div>
                                {(() => {
                                  const batchSum = (batchPreviewMap[item.productId] || []).reduce((s, b) => s + (b.available_qty || 0), 0);
                                  if (item.availableStock > 0 && batchSum < item.availableStock) {
                                    return (
                                      <span className="text-[10px] text-muted-foreground" title="Batches eligible for FEFO allocation (excludes expired/fully-reserved)">
                                        batch: {toDisplay(item.orderItemId, batchSum)}
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </TableCell>
                          )}
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                max={toDisplay(item.orderItemId, item.orderedQty)}
                                value={toDisplay(item.orderItemId, item.approvedQty)}
                                onChange={e => updateApprovedQty(item.orderItemId, parseFloat(e.target.value) || 0)}
                                className="w-20 h-8 text-sm text-right"
                              />
                              {isOverStock && (
                                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-right">
                            {hasBackorder ? (
                              <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400">
                                {toDisplay(item.orderItemId, item.orderedQty - item.approvedQty)}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* Batch Expansion Row */}
                        {hasBatches && isProductExpanded && distributorId && (
                          <TableRow key={`${item.orderItemId}_batches`} className="bg-muted/20">
                            <TableCell colSpan={7} className="py-2 px-4">
                              <div className="border rounded-md bg-background divide-y text-xs">
                                <div className={`grid ${allocationMode === 'manual' ? 'grid-cols-5' : 'grid-cols-4'} gap-2 px-3 py-1.5 font-medium text-muted-foreground`}>
                                  <span>Batch No</span>
                                  <span>Expiry</span>
                                  <span className="text-right">Available</span>
                                  {allocationMode === 'manual' && (
                                    <span className="text-right">Allocate</span>
                                  )}
                                  <span className="text-right">
                                    {allocationPreviewed ? 'Proposed' : 'Status'}
                                  </span>
                                </div>
                                {batches.map(batch => {
                                  const nearExpiry = isNearExpiry(batch.expiry_date);
                                  const expired = isExpired(batch.expiry_date);
                                  // Find proposed allocation for this batch
                                  const proposedBatch = proposed?.allocations.find(a => a.batch_id === batch.id);
                                  const manualEntry = manualAllocations[item.productId]?.find(e => e.batch_id === batch.id);

                                  return (
                                    <div key={batch.id} className={`grid ${allocationMode === 'manual' ? 'grid-cols-5' : 'grid-cols-4'} gap-2 px-3 py-1.5 items-center`}>
                                      <span className="font-mono">{batch.batch_no}</span>
                                      <span className="flex items-center gap-1">
                                        {batch.expiry_date
                                          ? format(new Date(batch.expiry_date), 'dd MMM yy')
                                          : 'N/A'}
                                        {nearExpiry && !expired && (
                                          <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300">
                                            ⚠ Expiring
                                          </Badge>
                                        )}
                                        {expired && (
                                          <Badge variant="outline" className="text-[9px] px-1 py-0 text-destructive border-destructive/30">
                                            Expired
                                          </Badge>
                                        )}
                                      </span>
                                      <span className="text-right font-medium">{toDisplay(item.orderItemId, batch.available_qty)}</span>
                                      {allocationMode === 'manual' && (
                                        <span className="text-right">
                                          <Input
                                            type="number"
                                            min={0}
                                            step="any"
                                            max={toDisplay(item.orderItemId, batch.available_qty)}
                                            value={toDisplay(item.orderItemId, manualEntry?.allocate_qty || 0)}
                                            onChange={e => updateManualBatchQty(item.productId, batch.id, fromDisplay(item.orderItemId, parseFloat(e.target.value) || 0))}
                                            className="w-16 h-6 text-xs text-right"
                                          />
                                        </span>
                                      )}
                                      <span className="text-right">
                                        {allocationPreviewed && proposedBatch ? (
                                          <Badge variant="outline" className="text-[9px] px-1 py-0 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border-blue-200">
                                            → {toDisplay(item.orderItemId, proposedBatch.allocated_qty)}
                                          </Badge>
                                        ) : expired ? (
                                          <span className="text-destructive">Excluded</span>
                                        ) : (
                                          <span className="text-green-600 dark:text-green-400">Available</span>
                                        )}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-muted/30">
            <CardContent className="p-3 text-center">
              <p className="text-lg font-bold">{summary.totalOrdered}</p>
              <p className="text-xs text-muted-foreground">Total Ordered</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 dark:bg-green-950/30">
            <CardContent className="p-3 text-center">
              <p className="text-lg font-bold text-green-700 dark:text-green-300">{summary.totalApproved}</p>
              <p className="text-xs text-green-600 dark:text-green-400">Approved</p>
            </CardContent>
          </Card>
          <Card className="bg-amber-50 dark:bg-amber-950/30">
            <CardContent className="p-3 text-center">
              <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{summary.totalBackorder}</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">Backorder</p>
            </CardContent>
          </Card>
          <Card className="bg-red-50 dark:bg-red-950/30">
            <CardContent className="p-3 text-center">
              <p className="text-lg font-bold text-red-700 dark:text-red-300">{summary.totalRejectedOrders}</p>
              <p className="text-xs text-red-600 dark:text-red-400">Rejected Orders</p>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={confirming || allocating || summary.totalApproved === 0}>
            {confirming || allocating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Package className="h-4 w-4 mr-2" />
            )}
            {allocating ? 'Allocating Stock...' : 'Confirm & Create Packing List'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
