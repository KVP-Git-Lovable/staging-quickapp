import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface OrderItem {
  product_name: string;
  quantity: number;
  rate: number;
  actualRate: number;
  displayQty?: number;
  displayUnit?: string;
  order_id?: string;
}

interface OrderItemsExpandedProps {
  orderId: string;
  displayItems: OrderItem[];
  onItemsLoaded: (items: OrderItem[]) => void;
}

const getDisplayValues = (qty: number, rate: number, originalRate: number, unit: string) => {
  const unitLower = (unit || '').toLowerCase().trim();
  const displayRateBase = originalRate || rate;
  if (unitLower === 'grams' || unitLower === 'g' || unitLower === 'gram') {
    return { displayQty: qty / 1000, displayUnit: 'KG', displayRate: displayRateBase * 1000 };
  }
  return { displayQty: qty, displayUnit: unit, displayRate: displayRateBase };
};

export const OrderItemsExpanded = ({ orderId, displayItems, onItemsLoaded }: OrderItemsExpandedProps) => {
  const [items, setItems] = useState<OrderItem[]>(displayItems);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (displayItems.length > 0) {
      setItems(displayItems);
      return;
    }
    // Fetch items from DB if none available
    const fetchItems = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('order_items')
          .select('product_name, quantity, rate, original_rate, total, unit, tax_rate_snapshot, cgst_rate, sgst_rate, igst_rate')
          .eq('order_id', orderId);

        if (data && data.length > 0) {
          const mapped = data.map(it => {
            // Rate/original_rate are stored tax-exclusive — show GST-inclusive prices here.
            const gstMultiplier = 1 + (Number(it.tax_rate_snapshot) || (Number(it.cgst_rate || 0) + Number(it.sgst_rate || 0) + Number(it.igst_rate || 0))) / 100;
            const rateInclGst = it.rate * gstMultiplier;
            const originalRateInclGst = (it.original_rate || it.rate) * gstMultiplier;
            const { displayQty, displayUnit, displayRate } = getDisplayValues(
              it.quantity, rateInclGst, originalRateInclGst, it.unit || 'piece'
            );
            return {
              product_name: it.product_name,
              quantity: it.quantity,
              rate: rateInclGst,
              actualRate: displayRate,
              displayQty,
              displayUnit,
              order_id: orderId
            };
          });
          setItems(mapped);
          onItemsLoaded(mapped);
        }
      } catch (e) {
        console.log('[OrderItemsExpanded] Error fetching items:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, [orderId, displayItems.length]);

  if (loading) {
    return (
      <div className="px-2 pb-2 border-t border-border/30">
        <div className="text-xs text-muted-foreground py-1">Loading items...</div>
      </div>
    );
  }

  return (
    <div className="px-2 pb-2 space-y-1 border-t border-border/30">
      {items.length === 0 && <div className="text-xs text-muted-foreground py-1">No items found.</div>}
      {items.map((it, idx) => {
        const displayQty = it.displayQty ?? it.quantity;
        const displayUnit = it.displayUnit || '';
        const qtyStr = Number.isInteger(displayQty) ? displayQty.toString() : displayQty.toFixed(2).replace(/\.?0+$/, '');
        const qtyDisplay = displayUnit ? `${qtyStr} ${displayUnit}` : qtyStr;
        return (
          <div key={idx} className="flex justify-between items-start gap-2 text-xs py-1">
            <span className="flex-1 min-w-0 break-words">{it.product_name}</span>
            <div className="flex-shrink-0 text-right">
              <span className="font-medium">{qtyDisplay} × ₹{it.actualRate.toFixed(2)}</span>
              {it.actualRate.toFixed(2) !== it.rate.toFixed(2) && it.rate > 0 && (
                <div className="text-[10px] text-muted-foreground line-through">₹{it.rate.toFixed(2)}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
