/**
 * Order Cleanup Utility
 * Cleans up orphan orders from local storage that have been synced to database
 * Prevents duplicate order display issues
 */

import { supabase } from '@/integrations/supabase/client';
import { offlineStorage, STORES } from '@/lib/offlineStorage';
import { loadMyVisitsSnapshot, saveMyVisitsSnapshot } from '@/lib/myVisitsSnapshot';

/**
 * Clean up orphan orders from local storage
 * Removes orders that already exist in the database by matching ID or idempotency_key
 */
export async function cleanupOrphanOrders(
  userId: string,
  targetDate: string
): Promise<{ cleaned: number; remaining: number }> {
  try {
    console.log('🧹 [orderCleanup] Starting orphan order cleanup for', targetDate);
    
    // Step 1: Get all local orders for this date
    const localOrders = await offlineStorage.getAll<any>(STORES.ORDERS);
    const localOrdersForDate = localOrders.filter((o: any) => 
      o.user_id === userId && 
      (o.order_date === targetDate || (o.created_at && o.created_at.startsWith(targetDate)))
    );
    
    if (localOrdersForDate.length === 0) {
      console.log('🧹 [orderCleanup] No local orders to cleanup');
      return { cleaned: 0, remaining: 0 };
    }
    
    console.log(`🧹 [orderCleanup] Found ${localOrdersForDate.length} local orders`);
    
    // Step 2: Fetch DB orders for comparison
    const { data: dbOrders, error } = await supabase
      .from('orders')
      .select('id, idempotency_key')
      .eq('user_id', userId)
      .eq('order_date', targetDate);
    
    if (error) {
      console.error('🧹 [orderCleanup] Error fetching DB orders:', error);
      return { cleaned: 0, remaining: localOrdersForDate.length };
    }
    
    const dbOrderIds = new Set(dbOrders?.map(o => o.id) || []);
    const dbById = new Map((dbOrders || []).map((o: any) => [o.id, o]));
    const dbByKey = new Map(
      (dbOrders || []).filter((o: any) => o.idempotency_key).map((o: any) => [o.idempotency_key, o])
    );
    
    console.log(`🧹 [orderCleanup] DB has ${dbOrderIds.size} orders, ${dbByKey.size} idempotency keys`);
    
    // Step 3: The IndexedDB orders store is BOTH pending-uploads queue AND offline read cache.
    // Only delete true duplicates: same idempotency_key as a DB row but a DIFFERENT id
    // (i.e. the local client-UUID copy of an order that now exists under a DB id).
    // If the local row's id matches the DB row, mark it _synced and update its fields — do NOT delete.
    let cleanedCount = 0;
    for (const localOrder of localOrdersForDate) {
      const idMatch = dbById.get(localOrder.id);
      const keyMatch = localOrder.idempotency_key ? dbByKey.get(localOrder.idempotency_key) : undefined;

      if (idMatch) {
        // Same id — this IS the DB row. Update in place, do not delete.
        await offlineStorage.save(STORES.ORDERS, {
          ...localOrder,
          ...idMatch,
          _synced: true,
        });
        continue;
      }

      if (keyMatch && keyMatch.id !== localOrder.id) {
        // True duplicate: local client-UUID copy of a now-persisted DB order.
        await offlineStorage.delete(STORES.ORDERS, localOrder.id);
        cleanedCount++;
        console.log(`🧹 [orderCleanup] Removed duplicate local copy: ${localOrder.id} (DB id ${keyMatch.id})`);
      }
    }
    
    console.log(`🧹 [orderCleanup] Cleaned ${cleanedCount} duplicates, ${localOrdersForDate.length - cleanedCount} preserved as read cache`);
    return { cleaned: cleanedCount, remaining: localOrdersForDate.length - cleanedCount };
  } catch (error) {
    console.error('🧹 [orderCleanup] Error in cleanupOrphanOrders:', error);
    return { cleaned: 0, remaining: 0 };
  }
}

/**
 * Clean up stale synced orders from local storage
 * Removes orders older than 24 hours that have already been synced
 */
export async function cleanupStaleSyncedOrders(): Promise<number> {
  try {
    const allLocalOrders = await offlineStorage.getAll<any>(STORES.ORDERS);
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    let cleanedCount = 0;
    
    for (const order of allLocalOrders) {
      const createdAt = order.created_at ? new Date(order.created_at).getTime() : 0;
      const isOld = createdAt < twentyFourHoursAgo;
      const isSynced = order._synced === true;
      
      // Remove old synced orders
      if (isOld && isSynced) {
        await offlineStorage.delete(STORES.ORDERS, order.id);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 [orderCleanup] Cleaned ${cleanedCount} stale synced orders`);
    }
    
    return cleanedCount;
  } catch (error) {
    console.error('🧹 [orderCleanup] Error in cleanupStaleSyncedOrders:', error);
    return 0;
  }
}

/**
 * Verify and clean local orders against database
 * For each local order, check if it exists in DB and remove if so
 */
export async function verifyAndCleanLocalOrders(userId: string): Promise<number> {
  try {
    const allLocalOrders = await offlineStorage.getAll<any>(STORES.ORDERS);
    const userOrders = allLocalOrders.filter((o: any) => o.user_id === userId);
    
    if (userOrders.length === 0) {
      return 0;
    }
    
    console.log(`🧹 [orderCleanup] Verifying ${userOrders.length} local orders against DB`);
    
    // Get all order IDs and idempotency keys
    const orderIds = userOrders.map(o => o.id).filter(Boolean);
    const idempotencyKeys = userOrders
      .map(o => o.idempotency_key)
      .filter(Boolean);
    
    // Batch check by IDs and idempotency keys, tracking DB rows by both keys.
    const dbById = new Map<string, any>();
    const dbByKey = new Map<string, any>();

    if (orderIds.length > 0) {
      const { data: dbOrders } = await supabase
        .from('orders')
        .select('id, idempotency_key')
        .in('id', orderIds);
      (dbOrders || []).forEach((o: any) => {
        dbById.set(o.id, o);
        if (o.idempotency_key) dbByKey.set(o.idempotency_key, o);
      });
    }

    if (idempotencyKeys.length > 0) {
      const { data: dbOrdersByKey } = await supabase
        .from('orders')
        .select('id, idempotency_key')
        .in('idempotency_key', idempotencyKeys);
      (dbOrdersByKey || []).forEach((o: any) => {
        dbById.set(o.id, o);
        if (o.idempotency_key) dbByKey.set(o.idempotency_key, o);
      });
    }

    // Only delete TRUE duplicates (same idempotency_key, different id).
    // If id matches DB, mark _synced and preserve as offline read cache.
    let cleanedCount = 0;
    for (const order of userOrders) {
      const idMatch = dbById.get(order.id);
      const keyMatch = order.idempotency_key ? dbByKey.get(order.idempotency_key) : undefined;

      if (idMatch) {
        await offlineStorage.save(STORES.ORDERS, { ...order, _synced: true });
        continue;
      }

      if (keyMatch && keyMatch.id !== order.id) {
        await offlineStorage.delete(STORES.ORDERS, order.id);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 [orderCleanup] Verified and removed ${cleanedCount} duplicate local copies`);
    }
    
    return cleanedCount;
  } catch (error) {
    console.error('🧹 [orderCleanup] Error in verifyAndCleanLocalOrders:', error);
    return 0;
  }
}

/**
 * Sync snapshot orders with database orders
 * IMPORTANT: This function now SYNCS (not removes) - it updates snapshot to match DB
 * This ensures Today's Progress always shows accurate order values
 */
export async function syncSnapshotWithDbOrders(
  userId: string,
  targetDate: string,
  dbOrders: Array<{ id: string; total_amount?: number; retailer_id?: string; order_date?: string; status?: string; user_id?: string }>
): Promise<number> {
  try {
    const snapshot = await loadMyVisitsSnapshot(userId, targetDate);
    if (!snapshot) {
      return 0;
    }
    
    // Replace ONLY the current user's rows; keep teammate rows (shared beats) intact.
    const originalCount = snapshot.orders?.length || 0;
    const preservedOthers = (snapshot.orders || []).filter(
      (o: any) => o && o.user_id && o.user_id !== userId
    );

    const mineFromDb = dbOrders.map(o => ({
      id: o.id,
      total_amount: Math.round(Number(o.total_amount || 0)),
      retailer_id: o.retailer_id,
      order_date: o.order_date || targetDate,
      status: o.status || 'confirmed',
      user_id: o.user_id || userId,
    }));

    snapshot.orders = [...mineFromDb, ...preservedOthers];

    // Recalculate stats from full (mine + teammate) list
    snapshot.progressStats.totalOrders = snapshot.orders.length;
    snapshot.progressStats.totalOrderValue = Math.round(
      snapshot.orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
    );
    
    // Update productive count based on unique retailers with orders
    const retailersWithOrders = new Set(snapshot.orders.map(o => o.retailer_id));
    
    // Recalculate productive/unproductive based on visits and orders
    const visitsByRetailer = new Map<string, any[]>();
    (snapshot.visits || []).forEach((v: any) => {
      if (!v?.retailer_id) return;
      const list = visitsByRetailer.get(v.retailer_id) || [];
      list.push(v);
      visitsByRetailer.set(v.retailer_id, list);
    });
    
    let productive = 0, unproductive = 0, planned = 0;
    const countedRetailers = new Set<string>();
    
    visitsByRetailer.forEach((group, retailerId) => {
      countedRetailers.add(retailerId);
      if (retailersWithOrders.has(retailerId)) productive++;
      else if (group.some((v: any) => v.status === 'productive')) productive++;
      else if (group.some((v: any) => v.status === 'unproductive' || !!v.no_order_reason)) unproductive++;
      else planned++;
    });
    
    retailersWithOrders.forEach(rid => {
      if (!countedRetailers.has(rid)) {
        productive++;
        countedRetailers.add(rid);
      }
    });
    
    // Retailers without visits or orders are planned
    (snapshot.retailers || []).forEach((r: any) => {
      if (!countedRetailers.has(r.id)) planned++;
    });
    
    snapshot.progressStats.productive = productive;
    snapshot.progressStats.unproductive = unproductive;
    snapshot.progressStats.planned = planned;
    
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
    
    const syncedCount = dbOrders.length;
    if (syncedCount !== originalCount) {
      console.log(`🧹 [orderCleanup] Synced snapshot orders: ${originalCount} → ${syncedCount}, value: ₹${snapshot.progressStats.totalOrderValue}`);
    }
    
    return syncedCount;
  } catch (error) {
    console.error('🧹 [orderCleanup] Error in syncSnapshotWithDbOrders:', error);
    return 0;
  }
}

/**
 * Run full cleanup routine
 * Cleans local storage orphans and SYNCS snapshot with DB orders
 * IMPORTANT: This syncs (not removes) snapshot orders to ensure Today's Progress is accurate
 */
export async function runFullOrderCleanup(userId: string, targetDate: string): Promise<void> {
  try {
    console.log('🧹 [orderCleanup] Running full cleanup for', userId, targetDate);
    
    // Step 1: Clean orphan orders from local storage (these are duplicates already in DB)
    const { cleaned: orphansCleaned } = await cleanupOrphanOrders(userId, targetDate);
    
    // Step 2: Clean stale synced orders (older than 24h)
    const staleCleaned = await cleanupStaleSyncedOrders();
    
    // Step 3: Verify remaining local orders against DB
    const verifiedCleaned = await verifyAndCleanLocalOrders(userId);
    
    // Step 4: SYNC snapshot with DB orders (not remove them!)
    // This ensures Today's Progress shows the correct order value
    const { data: dbOrders } = await supabase
      .from('orders')
      .select('id, total_amount, retailer_id, order_date, status, user_id')
      .eq('user_id', userId)
      .eq('order_date', targetDate)
      .eq('status', 'confirmed');
    
    if (dbOrders && dbOrders.length > 0) {
      await syncSnapshotWithDbOrders(userId, targetDate, dbOrders);
    }
    
    console.log(`🧹 [orderCleanup] Full cleanup complete: orphans=${orphansCleaned}, stale=${staleCleaned}, verified=${verifiedCleaned}, dbOrders=${dbOrders?.length || 0}`);
  } catch (error) {
    console.error('🧹 [orderCleanup] Error in runFullOrderCleanup:', error);
  }
}
