import { offlineStorage, STORES } from '@/lib/offlineStorage';
import { getLocalTodayDate } from '@/utils/dateUtils';

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
    inGrams = quantity * 1000;
  } else if (from === 'ml' || from === 'milliliter' || from === 'milliliters') {
    inGrams = quantity;
  } else {
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
  
  return quantity;
}

/**
 * Local van stock calculation for offline orders
 * Uses cached van stock data from localStorage to calculate updates
 * Queues the actual sync for when the device comes back online
 */
export async function calculateLocalVanStockUpdate(
  orderItems: Array<{ product_id: string; variant_id?: string | null; quantity: number; unit?: string }>,
  userId: string,
  stockDate?: string
): Promise<void> {
  const targetDate = stockDate || getLocalTodayDate();
  
  console.log('📦 [LOCAL VAN STOCK] Calculating local update for offline order:', {
    itemCount: orderItems.length,
    date: targetDate
  });
  
  try {
    // Get cached van stock from localStorage
    const vanStockCacheKey = `van_stock_cache_${userId}_${targetDate}`;
    const cachedVanStock = localStorage.getItem(vanStockCacheKey);
    
    if (!cachedVanStock) {
      console.log('[LOCAL VAN STOCK] No cached van stock found, will sync when online');
      // Queue for sync when online
      await offlineStorage.addToSyncQueue('VAN_STOCK_SYNC', {
        stockDate: targetDate,
        userId
      });
      return;
    }
    
    const vanStockData = JSON.parse(cachedVanStock);
    
    // Calculate order quantities in grams
    const orderQuantitiesInGrams: { [productId: string]: number } = {};
    
    orderItems.forEach(item => {
      // Van stock items track variants under the variant's own id.
      const matchingProductId = item.variant_id || item.product_id;
      const orderUnit = item.unit || 'piece';
      const qtyInGrams = convertQuantity(item.quantity, orderUnit, 'g');
      orderQuantitiesInGrams[matchingProductId] = (orderQuantitiesInGrams[matchingProductId] || 0) + qtyInGrams;
    });
    
    // Update cached van stock items
    if (vanStockData.items && Array.isArray(vanStockData.items)) {
      vanStockData.items = vanStockData.items.map((stockItem: any) => {
        const stockItemUnit = (stockItem.unit || 'g').toLowerCase().trim();
        const additionalOrderedGrams = orderQuantitiesInGrams[stockItem.product_id] || 0;
        
        if (additionalOrderedGrams > 0) {
          // Convert additional ordered quantity to stock item's unit
          const additionalOrderedInStockUnit = convertQuantity(additionalOrderedGrams, 'g', stockItemUnit);
          
          // Add to existing ordered quantity
          const newOrderedQty = (stockItem.ordered_qty || 0) + additionalOrderedInStockUnit;
          
          // Recalculate left quantity
          const startQty = stockItem.start_qty || 0;
          const returnedQty = stockItem.returned_qty || 0;
          const newLeftQty = Math.max(0, startQty - newOrderedQty + returnedQty);
          
          console.log(`📊 [LOCAL VAN STOCK] Updated ${stockItem.product_name}: ordered ${stockItem.ordered_qty || 0} -> ${newOrderedQty}, left ${stockItem.left_qty || 0} -> ${newLeftQty}`);
          
          return {
            ...stockItem,
            ordered_qty: newOrderedQty,
            left_qty: newLeftQty
          };
        }
        
        return stockItem;
      });
      
      // Save updated cache
      localStorage.setItem(vanStockCacheKey, JSON.stringify({
        ...vanStockData,
        lastLocalUpdate: new Date().toISOString()
      }));
      
      console.log('✅ [LOCAL VAN STOCK] Local cache updated');
      
      // Dispatch event to notify UI
      window.dispatchEvent(new CustomEvent('vanStockUpdated', { 
        detail: { stockDate: targetDate, local: true } 
      }));
    }
    
    // Queue actual sync for when online
    await offlineStorage.addToSyncQueue('VAN_STOCK_SYNC', {
      stockDate: targetDate,
      userId
    });
    
  } catch (error) {
    console.error('[LOCAL VAN STOCK] Error calculating local update:', error);
  }
}

/**
 * Cache van stock data for offline use
 */
export function cacheVanStockForOffline(
  vanStockItems: any[],
  userId: string,
  stockDate: string
): void {
  try {
    const vanStockCacheKey = `van_stock_cache_${userId}_${stockDate}`;
    localStorage.setItem(vanStockCacheKey, JSON.stringify({
      items: vanStockItems,
      cachedAt: new Date().toISOString()
    }));
    console.log('💾 [VAN STOCK] Cached for offline use');
  } catch (error) {
    console.warn('[VAN STOCK] Error caching for offline:', error);
  }
}
