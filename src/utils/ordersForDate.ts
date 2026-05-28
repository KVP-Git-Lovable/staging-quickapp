/**
 * Unified Orders Source Utility
 * Merges orders from DB, offline storage, and snapshot for consistent data across the app
 */

import { supabase } from '@/integrations/supabase/client';
import { offlineStorage, STORES } from '@/lib/offlineStorage';
import { loadMyVisitsSnapshot, saveMyVisitsSnapshot } from '@/lib/myVisitsSnapshot';
import { isSlowConnection } from '@/utils/internetSpeedCheck';

export interface OrderItem {
  id?: string;
  order_id?: string;
  product_id: string;
  product_name: string;
  quantity: number;
  rate: number;
  unit: string;
  total?: number;
  discount_amount?: number;
}

export interface Order {
  id: string;
  user_id: string;
  retailer_id?: string;
  retailer_name?: string;
  order_date: string;
  total_amount: number;
  status: string;
  visit_id?: string;
  created_at: string;
  order_items?: OrderItem[];
  items?: OrderItem[]; // Offline orders use 'items' instead of 'order_items'
  idempotency_key?: string; // For deduplication across offline/DB
  _source?: 'db' | 'offline' | 'snapshot';
}

export interface OrdersResult {
  orders: Order[];
  totalValue: number;
  totalCount: number;
  sourceBreakdown: {
    db: number;
    offline: number;
    snapshot: number;
  };
}

/**
 * Get merged orders for a specific date
 * Priority: DB orders > Offline orders > Snapshot orders
 * Deduplicates by order ID
 */
export async function getOrdersForDate(
  userId: string,
  targetDate: string,
  options: {
    includeSnapshot?: boolean;
    forceOfflineFirst?: boolean;
  } = {}
): Promise<OrdersResult> {
  const { includeSnapshot = true, forceOfflineFirst = false } = options;
  
  const allOrders: Order[] = [];
  const seenIds = new Set<string>();
  const seenIdempotencyKeys = new Set<string>(); // DUPLICATE FIX: Track idempotency keys
  const sourceBreakdown = { db: 0, offline: 0, snapshot: 0 };

  const isOfflineOrSlow = !navigator.onLine || isSlowConnection() || forceOfflineFirst;

  // Step 1: Try loading from offline storage first (for instant display)
  try {
    const cachedOrders = await offlineStorage.getAll<any>(STORES.ORDERS);
    const todayOfflineOrders = cachedOrders.filter((o: any) => 
      o.user_id === userId && 
      (o.order_date === targetDate || (o.created_at && o.created_at.startsWith(targetDate)))
    );

    todayOfflineOrders.forEach((order: any) => {
      // DUPLICATE FIX: Check both id AND idempotency_key
      const idemKey = order.idempotency_key;
      if (!seenIds.has(order.id) && (!idemKey || !seenIdempotencyKeys.has(idemKey))) {
        seenIds.add(order.id);
        if (idemKey) seenIdempotencyKeys.add(idemKey);
        allOrders.push({
          ...order,
          order_items: order.items || order.order_items || [],
          _source: 'offline' as const
        });
        sourceBreakdown.offline++;
      }
    });
    
    console.log(`📴 [ordersForDate] Loaded ${todayOfflineOrders.length} orders from offline storage`);
  } catch (e) {
    console.warn('[ordersForDate] Error loading from offline storage:', e);
  }

  // Step 2: Load from snapshot if enabled
  if (includeSnapshot) {
    try {
      const snapshot = await loadMyVisitsSnapshot(userId, targetDate);
      if (snapshot?.orders && snapshot.orders.length > 0) {
        snapshot.orders.forEach((order: any) => {
          // DUPLICATE FIX: Check both id AND idempotency_key
          const idemKey = order.idempotency_key;
          if (!seenIds.has(order.id) && (!idemKey || !seenIdempotencyKeys.has(idemKey))) {
            seenIds.add(order.id);
            if (idemKey) seenIdempotencyKeys.add(idemKey);
            allOrders.push({
              ...order,
              order_items: order.items || order.order_items || [],
              _source: 'snapshot' as const
            });
            sourceBreakdown.snapshot++;
          }
        });
        console.log(`📸 [ordersForDate] Loaded ${snapshot.orders.length} orders from snapshot`);
      }
    } catch (e) {
      console.warn('[ordersForDate] Error loading from snapshot:', e);
    }
  }

  // Step 3: Fetch from DB if online (and merge)
  if (navigator.onLine && !forceOfflineFirst) {
    try {
      // Use order_date column (DATE type) for reliable date filtering
      const { data: dbOrders, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items!order_items_order_id_fkey(*)
        `)
        .eq('user_id', userId)
        .eq('status', 'confirmed')
        .eq('order_date', targetDate);

      if (!error && dbOrders) {
        // Create sets for cleanup
        const dbOrderIds = new Set(dbOrders.map(o => o.id));
        const dbIdempotencyKeysMap = new Map(
          dbOrders.filter(o => o.idempotency_key).map(o => [o.idempotency_key, o.id])
        );
        
        // DB orders take priority - remove duplicates from offline/snapshot
        // DUPLICATE FIX: Match by BOTH id AND idempotency_key
        dbOrders.forEach((order: any) => {
          const idemKey = order.idempotency_key;
          
          // Find existing order by ID or by idempotency_key
          let existingIndex = allOrders.findIndex(o => o.id === order.id);
          if (existingIndex === -1 && idemKey) {
            existingIndex = allOrders.findIndex(o => o.idempotency_key === idemKey);
          }
          
          if (existingIndex !== -1) {
            // Remove the existing offline/snapshot version (DB wins)
            const existingSource = allOrders[existingIndex]._source;
            if (existingSource === 'offline') sourceBreakdown.offline--;
            if (existingSource === 'snapshot') sourceBreakdown.snapshot--;
            allOrders.splice(existingIndex, 1);
          }
          
          seenIds.add(order.id);
          if (idemKey) seenIdempotencyKeys.add(idemKey);
          allOrders.push({
            ...order,
            _source: 'db' as const
          });
          sourceBreakdown.db++;
        });
        console.log(`📡 [ordersForDate] Loaded ${dbOrders.length} orders from DB`);
        
        // CLEANUP: Actively remove synced orders from local storage
        // This prevents duplicates on next load
        if (dbOrders.length > 0) {
          cleanupSyncedOrdersFromLocal(dbOrderIds, dbIdempotencyKeysMap, userId, targetDate)
            .catch(err => console.warn('[ordersForDate] Cleanup error (non-fatal):', err));
        }
      }
    } catch (e) {
      console.warn('[ordersForDate] Error fetching from DB:', e);
    }
  }

  // Calculate totals
  const totalValue = allOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const totalCount = allOrders.length;

  console.log(`📊 [ordersForDate] Final result: ${totalCount} orders, ₹${totalValue}`, sourceBreakdown);

  return {
    orders: allOrders,
    totalValue,
    totalCount,
    sourceBreakdown
  };
}

/**
 * Get order items from merged orders
 * Handles both 'order_items' and 'items' field names
 */
export function getOrderItemsFromOrders(orders: Order[]): OrderItem[] {
  const allItems: OrderItem[] = [];
  
  orders.forEach(order => {
    const items = order.order_items || order.items || [];
    items.forEach(item => {
      allItems.push({
        ...item,
        order_id: order.id
      });
    });
  });
  
  return allItems;
}

/**
 * Calculate ordered quantities by product from merged orders
 * Returns a map of product_id -> total quantity
 * 
 * NOTE: product_id in order_items should now be:
 * - For variants: the VARIANT UUID directly (matches van_stock_items.product_id)
 * - For base products: the product UUID directly
 */
export function calculateOrderedQuantitiesByProduct(orders: Order[]): Record<string, number> {
  const quantities: Record<string, number> = {};
  
  orders.forEach(order => {
    const items = order.order_items || order.items || [];
    items.forEach((item: any) => {
      const productId = item.product_id;
      if (productId) {
        // Simply aggregate by product_id - it should already be the correct ID
        // (variant UUID for variants, product UUID for base products)
        quantities[productId] = (quantities[productId] || 0) + Number(item.quantity || 0);
      }
    });
  });
  
  return quantities;
}

/**
 * Clean up synced orders from local storage
 * Called after successfully fetching from DB
 */
async function cleanupSyncedOrdersFromLocal(
  dbOrderIds: Set<string>,
  dbIdempotencyKeysMap: Map<string, string>,
  userId: string,
  targetDate: string
): Promise<void> {
  try {
    // Get local orders
    const localOrders = await offlineStorage.getAll<any>(STORES.ORDERS);
    const localOrdersForDate = localOrders.filter((o: any) => 
      o.user_id === userId && 
      (o.order_date === targetDate || (o.created_at && o.created_at.startsWith(targetDate)))
    );
    
    let cleanedCount = 0;
    
    for (const localOrder of localOrdersForDate) {
      // Check if this local order exists in DB (by ID or idempotency_key)
      const existsById = dbOrderIds.has(localOrder.id);
      const existsByKey = localOrder.idempotency_key && dbIdempotencyKeysMap.has(localOrder.idempotency_key);
      
      if (existsById || existsByKey) {
        await offlineStorage.delete(STORES.ORDERS, localOrder.id);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 [ordersForDate] Cleaned ${cleanedCount} synced orders from local storage`);
    }
    
    // Also clean snapshot duplicates
    if (dbOrderIds.size > 0) {
      const snapshot = await loadMyVisitsSnapshot(userId, targetDate);
      if (snapshot && snapshot.orders && snapshot.orders.length > 0) {
        const originalCount = snapshot.orders.length;
        
        // Remove orders that exist in DB
        snapshot.orders = snapshot.orders.filter(o => 
          !dbOrderIds.has(o.id) && 
          !(o.idempotency_key && dbIdempotencyKeysMap.has(o.idempotency_key))
        );
        
        const removedCount = originalCount - snapshot.orders.length;
        
        if (removedCount > 0) {
          // Recalculate stats
          snapshot.progressStats.totalOrders = snapshot.orders.length;
          snapshot.progressStats.totalOrderValue = Math.round(
            snapshot.orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
          );
          
          // Save updated snapshot
          await saveMyVisitsSnapshot(userId, targetDate, {
            beatPlans: snapshot.beatPlans,
            visits: snapshot.visits,
            retailers: snapshot.retailers,
            orders: snapshot.orders,
            progressStats: snapshot.progressStats,
            currentBeatName: snapshot.currentBeatName,
            pointsTotal: snapshot.pointsTotal,
            pointsByRetailer: snapshot.pointsByRetailer
          });
          
          console.log(`🧹 [ordersForDate] Removed ${removedCount} duplicate orders from snapshot`);
        }
      }
    }
  } catch (error) {
    console.error('[ordersForDate] Error in cleanupSyncedOrdersFromLocal:', error);
  }
}
