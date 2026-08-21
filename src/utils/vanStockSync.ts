import { supabase } from '@/integrations/supabase/client';

// Van stock items store, for a variant line, the variant's own id in
// product_id — never a composite string. order_items keeps product_id
// (the base product FK) and variant_id as separate columns, so the id
// that matches a variant's van_stock_items row is order_items.variant_id,
// falling back to product_id for a simple (non-variant) line.

/**
 * Convert quantity from one unit to a target unit
 * Returns quantity in the target unit
 */
function convertQuantity(quantity: number, fromUnit: string, toUnit: string): number {
  const from = (fromUnit || '').toLowerCase().trim();
  const to = (toUnit || '').toLowerCase().trim();
  
  // Same unit, no conversion needed
  if (from === to) return quantity;
  
  // Convert to grams first (base unit for weight)
  let inGrams = quantity;
  
  if (from === 'kg' || from === 'kilogram' || from === 'kilograms') {
    inGrams = quantity * 1000;
  } else if (from === 'g' || from === 'gram' || from === 'grams') {
    inGrams = quantity;
  } else if (from === 'l' || from === 'liter' || from === 'liters' || from === 'litre' || from === 'litres') {
    inGrams = quantity * 1000; // Treat liters as equivalent to KG for beverages
  } else if (from === 'ml' || from === 'milliliter' || from === 'milliliters') {
    inGrams = quantity;
  } else {
    // pieces or unknown - no conversion
    return quantity;
  }
  
  // Now convert from grams to target unit
  if (to === 'kg' || to === 'kilogram' || to === 'kilograms') {
    return inGrams / 1000;
  } else if (to === 'g' || to === 'gram' || to === 'grams') {
    return inGrams;
  } else if (to === 'l' || to === 'liter' || to === 'liters' || to === 'litre' || to === 'litres') {
    return inGrams / 1000;
  } else if (to === 'ml' || to === 'milliliter' || to === 'milliliters') {
    return inGrams;
  }
  
  // Default - return as is
  return quantity;
}

/**
 * Fix corrupted van stock items where unit is 'kg' but ordered_qty contains gram values
 * This is a one-time fix for records corrupted by the previous sync bug
 */
async function fixCorruptedStockUnits(stockItems: any[]): Promise<void> {
  for (const item of stockItems) {
    const unit = (item.unit || '').toLowerCase().trim();
    const orderedQty = item.ordered_qty || 0;
    const startQty = item.start_qty || 0;
    
    // Detect corruption: unit is 'kg' but ordered_qty is suspiciously large (> 100 times start_qty)
    // This indicates ordered_qty was stored in grams but unit says kg
    if ((unit === 'kg' || unit === 'kgs') && orderedQty > 100 && startQty > 0 && orderedQty > startQty * 100) {
      console.log(`🔧 Fixing corrupted record: ${item.product_name} - unit:${unit}, ordered:${orderedQty}, start:${startQty}`);
      
      // Convert unit to grams and adjust start_qty accordingly
      const newStartQty = startQty * 1000; // Convert kg to grams
      const newLeftQty = Math.max(0, newStartQty - orderedQty + (item.returned_qty || 0));
      
      const { error } = await supabase
        .from('van_stock_items')
        .update({
          unit: 'grams',
          start_qty: newStartQty,
          left_qty: newLeftQty
        })
        .eq('id', item.id);
      
      if (error) {
        console.error(`Failed to fix corrupted record ${item.id}:`, error);
      } else {
        console.log(`✅ Fixed: ${item.product_name} - now unit:grams, start:${newStartQty}, left:${newLeftQty}`);
      }
    }
  }
}

/**
 * Calculate and update van stock ordered quantities based on orders placed
 * This syncs order quantities to van_stock_items for the given date
 * IMPORTANT: Quantities are stored in the van stock item's native unit, not always in grams
 */
export async function syncOrdersToVanStock(stockDate: string, userId?: string): Promise<boolean> {
  try {
    // Get current user if not provided
    let currentUserId = userId;
    if (!currentUserId) {
      const { data: session } = await supabase.auth.getSession();
      currentUserId = session.session?.user?.id;
    }
    
    if (!currentUserId) {
      console.log('No user ID available for van stock sync');
      return false;
    }

    console.log(`🔄 Syncing orders to van stock for date: ${stockDate}, user: ${currentUserId}`);

    // Get ALL van stocks for the date (user may have multiple vans)
    const { data: vanStocks, error: stockError } = await supabase
      .from('van_stock')
      .select('id, van_id, van_stock_items(*)')
      .eq('stock_date', stockDate)
      .eq('user_id', currentUserId);

    if (stockError) {
      console.error('Error fetching van stock:', stockError);
      return false;
    }

    if (!vanStocks || vanStocks.length === 0) {
      console.log('No van stock found for this date — nothing to sync (no-op success)');
      return true;
    }

    // Get all orders for today by this user using order_date (DATE column) for reliable filtering
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, status')
      .eq('user_id', currentUserId)
      .eq('order_date', stockDate)
      .in('status', ['confirmed', 'pending', 'delivered']);

    if (ordersError) {
      console.error('Error fetching orders:', ordersError);
      return false;
    }

    const orderIds = orders?.map(o => o.id) || [];
    
    // Get all order items for these orders with their units
    let orderQuantitiesInGrams: { [productId: string]: number } = {};
    
    if (orderIds.length > 0) {
      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .select('product_id, variant_id, quantity, unit')
        .in('order_id', orderIds);

      if (itemsError) {
        console.error('Error fetching order items:', itemsError);
        return false;
      }

      // Sum quantities by the matching product ID (variant ID if variant, else product ID)
      // Van stock items store variant IDs directly, so we need to match on variant ID
      orderItems?.forEach(item => {
        // Van stock items track variants under the variant's own id.
        const matchingProductId = item.variant_id || item.product_id;
        const orderUnit = item.unit || 'piece';
        
        // Convert to grams as intermediate unit for consistency
        const qtyInGrams = convertQuantity(item.quantity, orderUnit, 'g');
        orderQuantitiesInGrams[matchingProductId] = (orderQuantitiesInGrams[matchingProductId] || 0) + qtyInGrams;
        
        console.log(`📋 Order item: ${item.product_id} -> matching ID: ${matchingProductId}, qty: ${item.quantity} ${orderUnit} = ${qtyInGrams}g`);
      });
    }

    console.log('📦 Order quantities by matching product ID (in grams):', orderQuantitiesInGrams);

    // Process ALL van stocks for the user on this date
    let totalUpdateCount = 0;
    
    for (const vanStock of vanStocks) {
      if (!vanStock.van_stock_items || vanStock.van_stock_items.length === 0) {
        continue;
      }

      // First, fix any corrupted records from previous sync bug
      await fixCorruptedStockUnits(vanStock.van_stock_items as any[]);

      // Update each van stock item with calculated ordered quantity
      // CRITICAL: Convert the order quantity to match the van stock item's unit
      for (const stockItem of vanStock.van_stock_items as any[]) {
        const stockItemUnit = (stockItem.unit || 'g').toLowerCase().trim();
        const orderedGrams = orderQuantitiesInGrams[stockItem.product_id] || 0;
        
        // Convert ordered quantity from grams to the van stock item's native unit
        const orderedQtyInStockUnit = convertQuantity(orderedGrams, 'g', stockItemUnit);
        
        // Calculate left quantity in the stock item's native unit
        // Formula: left = start - ordered + returned (all in same unit)
        const startQty = stockItem.start_qty || 0;
        const returnedQty = stockItem.returned_qty || 0;
        const leftQty = Math.max(0, startQty - orderedQtyInStockUnit + returnedQty);

        console.log(`📊 Product ${stockItem.product_name}: unit=${stockItemUnit}, orderedGrams=${orderedGrams}, orderedInUnit=${orderedQtyInStockUnit.toFixed(3)}, start=${startQty}, returned=${returnedQty}, left=${leftQty.toFixed(3)}`);

        // Only update if values changed (with small tolerance for floating point)
        const orderedChanged = Math.abs((stockItem.ordered_qty || 0) - orderedQtyInStockUnit) > 0.001;
        const leftChanged = Math.abs((stockItem.left_qty || 0) - leftQty) > 0.001;
        
        if (orderedChanged || leftChanged) {
          const { error: updateError } = await supabase
            .from('van_stock_items')
            .update({
              ordered_qty: orderedQtyInStockUnit,
              left_qty: leftQty
            })
            .eq('id', stockItem.id);

          if (updateError) {
            console.error('Error updating van stock item:', updateError);
          } else {
            totalUpdateCount++;
            console.log(`✅ Updated stock item ${stockItem.product_name}: ordered=${orderedQtyInStockUnit.toFixed(3)} ${stockItemUnit}, left=${leftQty.toFixed(3)} ${stockItemUnit}`);
          }
        }
      }
    }

    console.log(`✅ Updated ${totalUpdateCount} van stock items with order quantities`);
    
    // Dispatch event to notify UI components
    window.dispatchEvent(new CustomEvent('vanStockUpdated', { 
      detail: { stockDate, updateCount: totalUpdateCount } 
    }));
    
    return true;
  } catch (error) {
    console.error('Error syncing orders to van stock:', error);
    return false;
  }
}

/**
 * Force recalculate ALL van stock items for a given date
 * This fixes any corrupted data from previous sync issues
 */
export async function recalculateVanStock(stockDate: string): Promise<boolean> {
  console.log(`🔧 Force recalculating van stock for date: ${stockDate}`);
  
  // The syncOrdersToVanStock now properly recalculates everything
  // Force it to run by calling it directly
  return await syncOrdersToVanStock(stockDate);
}

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}
