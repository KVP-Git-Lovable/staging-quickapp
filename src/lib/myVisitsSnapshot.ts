import { Preferences } from '@capacitor/preferences';

// My Visits Snapshot Cache
// Saves the full page state when data loads successfully from network
// Loads instantly on app restart or slow/no network

interface SnapshotData {
  userId: string; // CRITICAL: Store userId to validate snapshot belongs to correct user
  beatPlans: any[];
  visits: any[];
  retailers: any[];
  orders: any[];
  progressStats: {
    planned: number;
    productive: number;
    unproductive: number;
    totalOrders: number;
    totalOrderValue: number;
    totalPlanned?: number; // Total planned visits (doesn't change)
  };
  currentBeatName: string;
  timestamp: number;
  pointsTotal?: number; // Total points earned for the day
  pointsByRetailer?: Array<[string, { name: string; points: number; visitId: string | null }]>; // Points by retailer
}

// Bump the version segment whenever the retailer/beat-plan computation logic
// changes. This snapshot persists via Capacitor Preferences — across page
// reloads and app restarts — with no staleness check on load beyond a user-id
// match, so a snapshot saved under old (buggy) logic for a date already
// visited would otherwise keep being trusted indefinitely. An old-format key
// never matches, so it's treated as absent and a fresh save runs instead.
const SNAPSHOT_KEY_PREFIX = 'myvisits_snapshot_v2_';

// Get snapshot key for user+date
const getSnapshotKey = (userId: string, date: string): string => {
  return `${SNAPSHOT_KEY_PREFIX}${userId}_${date}`;
};

// Save snapshot when data loads successfully from network
export const saveMyVisitsSnapshot = async (
  userId: string,
  date: string,
  data: {
    beatPlans: any[];
    visits: any[];
    retailers: any[];
    orders: any[];
    progressStats: {
      planned: number;
      productive: number;
      unproductive: number;
      totalOrders: number;
      totalOrderValue: number;
      totalPlanned?: number;
    };
    currentBeatName: string;
    pointsTotal?: number;
    pointsByRetailer?: Array<[string, { name: string; points: number; visitId: string | null }]>;
  }
): Promise<void> => {
  try {
    const snapshot: SnapshotData = {
      userId, // CRITICAL: Store userId in snapshot for validation on load
      ...data,
      timestamp: Date.now()
    };
    
    const key = getSnapshotKey(userId, date);
    await Preferences.set({
      key,
      value: JSON.stringify(snapshot)
    });
    
    console.log('📸 [SNAPSHOT] Saved My Visits snapshot for', date, 'userId:', userId, 'retailers:', data.retailers.length);
  } catch (error) {
    console.error('[SNAPSHOT] Failed to save:', error);
  }
};

// Load snapshot instantly on app start
export const loadMyVisitsSnapshot = async (
  userId: string,
  date: string
): Promise<SnapshotData | null> => {
  try {
    const key = getSnapshotKey(userId, date);
    const { value } = await Preferences.get({ key });
    
    if (value) {
      const snapshot: SnapshotData = JSON.parse(value);
      
      // CRITICAL: Validate snapshot belongs to the requesting user
      // This prevents data leakage when switching between user accounts
      if (snapshot.userId && snapshot.userId !== userId) {
        console.warn('📸 [SNAPSHOT] ⚠️ Snapshot belongs to different user! Expected:', userId, 'Found:', snapshot.userId);
        // Clean up stale snapshot from different user
        await Preferences.remove({ key });
        return null;
      }
      
      // Also validate visits belong to the correct user
      const hasWrongUserVisits = snapshot.visits?.some((v: any) => v.user_id && v.user_id !== userId);
      if (hasWrongUserVisits) {
        console.warn('📸 [SNAPSHOT] ⚠️ Snapshot contains visits from different user, invalidating');
        await Preferences.remove({ key });
        return null;
      }
      
      // Snapshots are valid for 7 days
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - snapshot.timestamp < sevenDaysMs) {
        console.log('📸 [SNAPSHOT] Loaded My Visits snapshot for', date, 'userId:', userId, 'retailers:', snapshot.retailers.length);
        return snapshot;
      } else {
        console.log('📸 [SNAPSHOT] Snapshot expired for', date);
        // Clean up expired snapshot
        await Preferences.remove({ key });
      }
    }
    
    return null;
  } catch (error) {
    console.error('[SNAPSHOT] Failed to load:', error);
    return null;
  }
};

// Update a specific visit's status in the snapshot (for real-time cache updates)
export const updateVisitStatusInSnapshot = async (
  userId: string,
  date: string,
  retailerId: string,
  newStatus: 'productive' | 'unproductive' | 'planned',
  noOrderReason?: string
): Promise<void> => {
  try {
    const snapshot = await loadMyVisitsSnapshot(userId, date);
    if (!snapshot) {
      console.log('📸 [SNAPSHOT] No snapshot to update for', date);
      return;
    }

    // Find and update the visit in the snapshot
    const existingVisitIndex = snapshot.visits.findIndex(
      (v: any) => v.retailer_id === retailerId
    );

    if (existingVisitIndex >= 0) {
      snapshot.visits[existingVisitIndex] = {
        ...snapshot.visits[existingVisitIndex],
        status: newStatus,
        no_order_reason: noOrderReason || null,
        updated_at: new Date().toISOString()
      };
    } else {
      // Add a new visit entry if it doesn't exist
      snapshot.visits.push({
        id: `visit-${retailerId}-${Date.now()}`,
        retailer_id: retailerId,
        user_id: userId,
        status: newStatus,
        no_order_reason: noOrderReason || null,
        planned_date: date,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    // Update progress stats
    if (newStatus === 'unproductive') {
      // Move from planned to unproductive
      if (snapshot.progressStats.planned > 0) {
        snapshot.progressStats.planned -= 1;
      }
      snapshot.progressStats.unproductive += 1;
    } else if (newStatus === 'productive') {
      // Move from planned to productive
      if (snapshot.progressStats.planned > 0) {
        snapshot.progressStats.planned -= 1;
      }
      snapshot.progressStats.productive += 1;
    }

    // Save updated snapshot
    const key = getSnapshotKey(userId, date);
    await Preferences.set({
      key,
      value: JSON.stringify({ ...snapshot, timestamp: Date.now() })
    });

    console.log('📸 [SNAPSHOT] Updated visit status in snapshot:', retailerId, '->', newStatus);
  } catch (error) {
    console.error('[SNAPSHOT] Failed to update visit status:', error);
  }
};

// FIX: Add or update order in snapshot (called when order is placed offline)
export const addOrderToSnapshot = async (
  userId: string,
  date: string,
  order: {
    id: string;
    retailer_id: string;
    user_id: string;
    total_amount: number;
    order_date: string;
    status: string;
    visit_id?: string;
  }
): Promise<void> => {
  try {
    // CRITICAL: Ensure consistent rounding of total_amount
    const roundedOrder = {
      ...order,
      total_amount: Math.round(Number(order.total_amount) || 0)
    };
    
    const snapshot = await loadMyVisitsSnapshot(userId, date);
    if (!snapshot) {
      // Create new snapshot with this order
      console.log('📸 [SNAPSHOT] Creating new snapshot for order add');
      await saveMyVisitsSnapshot(userId, date, {
        beatPlans: [],
        visits: [],
        retailers: [],
        orders: [roundedOrder],
        progressStats: {
          planned: 0,
          productive: 1,
          unproductive: 0,
          totalOrders: 1,
          totalOrderValue: roundedOrder.total_amount
        },
        currentBeatName: ''
      });
      return;
    }

    // Check if order already exists
    const existingOrderIndex = snapshot.orders.findIndex(o => o.id === roundedOrder.id);
    if (existingOrderIndex >= 0) {
      // Update existing order
      snapshot.orders[existingOrderIndex] = roundedOrder;
    } else {
      // Check for existing order for same retailer on same date
      const existingRetailerOrder = snapshot.orders.findIndex(o => 
        o.retailer_id === roundedOrder.retailer_id && o.order_date === roundedOrder.order_date
      );
      if (existingRetailerOrder >= 0) {
        // Update existing order instead of adding duplicate
        snapshot.orders[existingRetailerOrder] = roundedOrder;
      } else {
        // Add new order
        snapshot.orders.push(roundedOrder);
      }
    }

    // Recalculate progress stats with rounded values
    const totalOrders = snapshot.orders.length;
    const totalOrderValue = Math.round(snapshot.orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0));
    
    // Update productive count based on unique retailers with orders
    const retailersWithOrders = new Set(snapshot.orders.map(o => o.retailer_id));
    
    snapshot.progressStats = {
      ...snapshot.progressStats,
      totalOrders,
      totalOrderValue,
      productive: retailersWithOrders.size
    };

    // Save updated snapshot
    const key = getSnapshotKey(userId, date);
    await Preferences.set({
      key,
      value: JSON.stringify({ ...snapshot, timestamp: Date.now() })
    });

    console.log('📸 [SNAPSHOT] Added/updated order in snapshot:', roundedOrder.id, 'Total:', snapshot.orders.length, 'Value:', totalOrderValue);
  } catch (error) {
    console.error('[SNAPSHOT] Failed to add order:', error);
  }
};

// Sync order value from database to snapshot (call when DB value is confirmed)
export const syncOrderValueInSnapshot = async (
  userId: string,
  date: string,
  retailerId: string,
  confirmedTotalAmount: number
): Promise<void> => {
  try {
    const snapshot = await loadMyVisitsSnapshot(userId, date);
    if (!snapshot) return;

    // Find and update the order for this retailer
    const orderIndex = snapshot.orders.findIndex(o => o.retailer_id === retailerId);
    if (orderIndex >= 0) {
      const roundedAmount = Math.round(confirmedTotalAmount);
      snapshot.orders[orderIndex].total_amount = roundedAmount;
      
      // Recalculate total value
      const totalOrderValue = Math.round(snapshot.orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0));
      snapshot.progressStats.totalOrderValue = totalOrderValue;
      
      // Save updated snapshot
      const key = getSnapshotKey(userId, date);
      await Preferences.set({
        key,
        value: JSON.stringify({ ...snapshot, timestamp: Date.now() })
      });
      
      console.log('📸 [SNAPSHOT] Synced order value from DB:', retailerId, '->', roundedAmount);
    }
  } catch (error) {
    console.error('[SNAPSHOT] Failed to sync order value:', error);
  }
};

// FIX: Add retailer directly to snapshot (called from AddRetailerInlineToBeat)
export const addRetailerToSnapshot = async (
  userId: string,
  date: string,
  retailer: any
): Promise<void> => {
  try {
    const snapshot = await loadMyVisitsSnapshot(userId, date);
    
    if (!snapshot) {
      // Create new snapshot if none exists
      console.log('📸 [SNAPSHOT] Creating new snapshot for retailer add');
      await saveMyVisitsSnapshot(userId, date, {
        beatPlans: [],
        visits: [],
        retailers: [retailer],
        orders: [],
        progressStats: {
          planned: 1,
          productive: 0,
          unproductive: 0,
          totalOrders: 0,
          totalOrderValue: 0
        },
        currentBeatName: retailer.beat_name || ''
      });
      return;
    }

    // Check if retailer already exists
    if (snapshot.retailers.some(r => r.id === retailer.id)) {
      console.log('📸 [SNAPSHOT] Retailer already in snapshot:', retailer.id);
      return;
    }

    // Add retailer to snapshot
    snapshot.retailers.push(retailer);
    snapshot.progressStats.planned += 1;

    // Save updated snapshot
    const key = getSnapshotKey(userId, date);
    await Preferences.set({
      key,
      value: JSON.stringify({ ...snapshot, timestamp: Date.now() })
    });

    console.log('📸 [SNAPSHOT] Added retailer to snapshot:', retailer.name, 'Total:', snapshot.retailers.length);
  } catch (error) {
    console.error('[SNAPSHOT] Failed to add retailer:', error);
  }
};

// FIX: Update beat plan in snapshot (called when beat plan is created/updated offline)
export const updateBeatPlanInSnapshot = async (
  userId: string,
  date: string,
  beatPlan: any
): Promise<void> => {
  try {
    const snapshot = await loadMyVisitsSnapshot(userId, date);
    
    if (!snapshot) {
      // Create new snapshot with this beat plan
      await saveMyVisitsSnapshot(userId, date, {
        beatPlans: [beatPlan],
        visits: [],
        retailers: [],
        orders: [],
        progressStats: {
          planned: 0,
          productive: 0,
          unproductive: 0,
          totalOrders: 0,
          totalOrderValue: 0
        },
        currentBeatName: beatPlan.beat_name || ''
      });
      return;
    }

    // Update or add beat plan
    const existingIndex = snapshot.beatPlans.findIndex(bp => bp.id === beatPlan.id || bp.beat_id === beatPlan.beat_id);
    if (existingIndex >= 0) {
      snapshot.beatPlans[existingIndex] = beatPlan;
    } else {
      snapshot.beatPlans.push(beatPlan);
    }

    snapshot.currentBeatName = snapshot.beatPlans.map(bp => bp.beat_name).join(', ');

    // Save updated snapshot
    const key = getSnapshotKey(userId, date);
    await Preferences.set({
      key,
      value: JSON.stringify({ ...snapshot, timestamp: Date.now() })
    });

    console.log('📸 [SNAPSHOT] Updated beat plan in snapshot:', beatPlan.beat_name);
  } catch (error) {
    console.error('[SNAPSHOT] Failed to update beat plan:', error);
  }
};

// Clear old snapshots (keep only last 7 days)
// Can be called with userId to clean specific user, or without to clean all old snapshots
export const cleanupOldSnapshots = async (userId?: string): Promise<void> => {
  try {
    const { keys } = await Preferences.keys();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let cleaned = 0;
    
    for (const key of keys) {
      // If userId provided, only clean that user's snapshots
      const shouldCheck = userId 
        ? key.startsWith(`${SNAPSHOT_KEY_PREFIX}${userId}_`)
        : key.startsWith(SNAPSHOT_KEY_PREFIX);
      
      if (shouldCheck) {
        const { value } = await Preferences.get({ key });
        if (value) {
          try {
            const snapshot: SnapshotData = JSON.parse(value);
            if (snapshot.timestamp < sevenDaysAgo) {
              await Preferences.remove({ key });
              cleaned++;
            }
          } catch {
            // Invalid JSON, remove it
            await Preferences.remove({ key });
            cleaned++;
          }
        }
      }
    }
    
    if (cleaned > 0) {
      console.log(`📸 [SNAPSHOT] Cleaned up ${cleaned} old snapshots`);
    }
  } catch (error) {
    console.error('[SNAPSHOT] Cleanup failed:', error);
  }
};

// Remove an order from snapshot (used when order is cancelled)
export const removeOrderFromSnapshot = async (
  userId: string,
  date: string,
  orderId: string
): Promise<void> => {
  try {
    const snapshot = await loadMyVisitsSnapshot(userId, date);
    if (!snapshot) {
      console.log('📸 [SNAPSHOT] No snapshot to remove order from for', date);
      return;
    }

    // Find the order to get retailer info before removing
    const orderToRemove = snapshot.orders.find(o => o.id === orderId);
    
    if (!orderToRemove) {
      console.log('📸 [SNAPSHOT] Order not found in snapshot:', orderId);
      return;
    }

    // Remove the order
    snapshot.orders = snapshot.orders.filter(o => o.id !== orderId);

    // Recalculate progress stats
    const totalOrders = snapshot.orders.length;
    const totalOrderValue = Math.round(
      snapshot.orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
    );
    const retailersWithOrders = new Set(snapshot.orders.map(o => o.retailer_id));
    
    // Update productive count based on remaining orders
    // Also check if we need to update the visit for this retailer
    const remainingOrderForRetailer = snapshot.orders.find(
      o => o.retailer_id === orderToRemove.retailer_id
    );
    
    // If no remaining orders for this retailer, decrement productive count
    let productiveCount = retailersWithOrders.size;
    let plannedCount = snapshot.progressStats.planned;
    
    if (!remainingOrderForRetailer) {
      // Retailer no longer has orders, move back to planned
      plannedCount += 1;
      
      // Also update the visit status in snapshot
      const visitIndex = snapshot.visits.findIndex(
        v => v.retailer_id === orderToRemove.retailer_id
      );
      if (visitIndex >= 0) {
        snapshot.visits[visitIndex] = {
          ...snapshot.visits[visitIndex],
          status: 'planned',
          no_order_reason: null,
          updated_at: new Date().toISOString()
        };
      }
    }

    snapshot.progressStats = {
      ...snapshot.progressStats,
      totalOrders,
      totalOrderValue,
      productive: productiveCount,
      planned: plannedCount
    };

    // Save updated snapshot
    const key = getSnapshotKey(userId, date);
    await Preferences.set({
      key,
      value: JSON.stringify({ ...snapshot, timestamp: Date.now() })
    });

    console.log('📸 [SNAPSHOT] Removed order from snapshot:', orderId, 'Remaining orders:', totalOrders);
  } catch (error) {
    console.error('[SNAPSHOT] Failed to remove order:', error);
  }
};

// Clear snapshot for a specific date (when beats are cleared)
export const clearMyVisitsSnapshot = async (
  userId: string,
  date: string
): Promise<void> => {
  try {
    const key = getSnapshotKey(userId, date);
    await Preferences.remove({ key });
    console.log('📸 [SNAPSHOT] Cleared snapshot for', date, 'userId:', userId);
  } catch (error) {
    console.error('[SNAPSHOT] Failed to clear snapshot:', error);
  }
};
