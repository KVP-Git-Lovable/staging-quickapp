import { useState, useEffect, useMemo } from 'react';
import { Package, AlertTriangle, Loader2, ArrowDownUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { OrderForPacking } from '@/hooks/usePackingList';
import { previewBatchAvailability } from '@/services/inventoryAllocationService';

interface ProductAggregation {
  product_id: string;
  product_name: string;
  unit?: string;
  required_qty: number;
  available_qty: number;
  shortage: number;
}

interface Props {
  selectedOrders: OrderForPacking[];
  distributorId: string | null;
  allocationStrategy: 'FIFO' | 'FEFO';
  onStrategyChange: (s: 'FIFO' | 'FEFO') => void;
  onCreatePackingList: () => void;
  creating: boolean;
  retailerCount: number;
}

export default function SecondaryInventoryPanel({
  selectedOrders,
  distributorId,
  allocationStrategy,
  onStrategyChange,
  onCreatePackingList,
  creating,
  retailerCount,
}: Props) {
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [loadingStock, setLoadingStock] = useState(false);

  // Aggregate items from selected orders by product
  const productAggregations = useMemo(() => {
    const map: Record<string, ProductAggregation> = {};
    selectedOrders.forEach(order => {
      order.items.forEach(item => {
        if (!map[item.product_id]) {
          map[item.product_id] = {
            product_id: item.product_id,
            product_name: item.product_name,
            unit: item.unit,
            required_qty: 0,
            available_qty: stockMap[item.product_id] ?? 0,
            shortage: 0,
          };
        }
        map[item.product_id].required_qty += item.quantity;
      });
    });
    // Calculate shortage and available
    Object.values(map).forEach(p => {
      p.available_qty = stockMap[p.product_id] ?? 0;
      p.shortage = Math.max(0, p.required_qty - p.available_qty);
    });
    return Object.values(map).sort((a, b) => b.shortage - a.shortage);
  }, [selectedOrders, stockMap]);

  // Fetch stock for all products in selected orders
  useEffect(() => {
    if (!distributorId || selectedOrders.length === 0) return;
    const productIds = [...new Set(selectedOrders.flatMap(o => o.items.map(i => i.product_id)))];
    if (productIds.length === 0) return;

    let cancelled = false;
    setLoadingStock(true);

    const fetchStock = async () => {
      const newMap: Record<string, number> = {};
      // Fetch in batches of 10
      for (let i = 0; i < productIds.length; i += 10) {
        const batch = productIds.slice(i, i + 10);
          const results = await Promise.all(
          batch.map(pid => previewBatchAvailability(distributorId, pid))
        );
        batch.forEach((pid, idx) => {
          const result = results[idx];
          const batches = Array.isArray(result) ? result : (result as any)?.batches || [];
          newMap[pid] = batches.reduce((s: number, b: any) => s + (b.available_qty || 0), 0);
        });
      }
      if (!cancelled) {
        setStockMap(newMap);
        setLoadingStock(false);
      }
    };
    fetchStock();
    return () => { cancelled = true; };
  }, [distributorId, selectedOrders]);

  const totalQty = productAggregations.reduce((s, p) => s + p.required_qty, 0);
  const totalAllocated = productAggregations.reduce((s, p) => s + Math.min(p.required_qty, p.available_qty), 0);
  const totalShortage = productAggregations.reduce((s, p) => s + p.shortage, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Package className="h-4 w-4" />
          Inventory & Allocation
        </h3>
      </div>

      {/* Allocation Strategy */}
      <div className="p-4 border-b">
        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
          <ArrowDownUp className="h-3 w-3" /> Allocation Strategy
        </p>
        <RadioGroup value={allocationStrategy} onValueChange={(v) => onStrategyChange(v as 'FIFO' | 'FEFO')} className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <RadioGroupItem value="FIFO" id="fifo" />
            <Label htmlFor="fifo" className="text-xs cursor-pointer">FIFO</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <RadioGroupItem value="FEFO" id="fefo" />
            <Label htmlFor="fefo" className="text-xs cursor-pointer">FEFO</Label>
          </div>
        </RadioGroup>
      </div>

      {/* Product Stock List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-2">
          {selectedOrders.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Select orders to see inventory</p>
          ) : loadingStock ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : productAggregations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No products</p>
          ) : (
            productAggregations.map(p => (
              <Card key={p.product_id} className={p.shortage > 0 ? 'border-destructive/50 bg-destructive/5' : ''}>
                <CardContent className="p-3">
                  <p className="text-xs font-medium truncate">{p.product_name}</p>
                  <div className="flex items-center justify-between mt-1.5 text-xs">
                    <span className="text-muted-foreground">Need: <span className="font-semibold text-foreground">{p.required_qty}</span></span>
                    <span className="text-muted-foreground">Avail: <span className="font-semibold text-foreground">{p.available_qty}</span></span>
                    {p.shortage > 0 && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                        <AlertTriangle className="h-3 w-3 mr-0.5" />
                        -{p.shortage}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Summary & CTA */}
      <div className="border-t p-4 space-y-3 bg-muted/30">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Total Qty</p>
            <p className="font-semibold">{totalQty}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Allocated</p>
            <p className="font-semibold text-green-600">{totalAllocated}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Shortage</p>
            <p className={`font-semibold ${totalShortage > 0 ? 'text-destructive' : ''}`}>{totalShortage}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Retailers</p>
            <p className="font-semibold">{retailerCount}</p>
          </div>
        </div>

        <Separator />

        <Button
          onClick={onCreatePackingList}
          disabled={creating || selectedOrders.length === 0}
          className="w-full"
          size="sm"
        >
          {creating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Package className="h-4 w-4 mr-2" />
          )}
          Create Packing List
        </Button>
      </div>
    </div>
  );
}
