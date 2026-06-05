// OPTIMIZED DATA LOADING FUNCTIONS FOR MY VISITS
// This file contains cache-first loading logic for instant performance
// SLOW CONNECTION AWARE: Skips network sync entirely on slow connections

import { offlineStorage, STORES } from '@/lib/offlineStorage';
import { supabase } from '@/integrations/supabase/client';
import { shouldSuppressError } from '@/utils/offlineErrorHandler';
import { toast } from 'sonner';
import { isSlowConnection, getConnectionQuality } from '@/utils/internetSpeedCheck';

// Helper: Create a timeout promise - reduced for slow networks
const createTimeout = (ms: number = 5000) => new Promise((_, reject) => 
  setTimeout(() => reject(new Error('Network timeout')), ms)
);

// Get appropriate timeout based on connection quality
const getNetworkTimeout = (): number => {
  const quality = getConnectionQuality();
  if (quality === 'slow') return 0; // Don't even try
  if (quality === 'medium') return 3000; // 3 seconds for medium
  return 5000; // 5 seconds for fast
};

// CACHE-FIRST load planned beats (instant display)
export const loadPlannedBeatsOptimized = async (
  user: any,
  date: string,
  setPlannedBeats: (beats: any[]) => void,
  setCurrentBeatName: (name: string) => void,
  loadAllVisitsForDate: (date: string, beatPlans: any[], preserveOrder?: boolean) => Promise<void>,
  preserveOrder: boolean = false
) => {
  if (!user) return;
  try {
    let beatPlans: any[] = [];
    let hasLoadedFromCache = false;

    // STEP 1: ALWAYS load from cache FIRST (instant, non-blocking)
    try {
      const cachedPlans = await offlineStorage.getAll<any>(STORES.BEAT_PLANS);
      beatPlans = cachedPlans.filter(
        (p: any) => p.user_id === user.id && p.plan_date === date
      );
      
      // Always set cached data immediately
      setPlannedBeats(beatPlans);
      if (beatPlans.length > 0) {
        const beatNames = beatPlans.map(plan => plan.beat_name).join(', ');
        setCurrentBeatName(beatNames);
        hasLoadedFromCache = true;
      } else {
        setCurrentBeatName("No beats planned");
      }
      // Load visits with whatever beat plans we have from cache
      await loadAllVisitsForDate(date, beatPlans, preserveOrder);
      console.log('✅ Beats loaded from cache instantly');
    } catch (cacheError) {
      console.log('Cache read error (non-critical):', cacheError);
      setCurrentBeatName("No beats planned");
      await loadAllVisitsForDate(date, [], preserveOrder);
    }

    // STEP 2: Background network sync (non-blocking)
    // SLOW CONNECTION CHECK: Skip network sync entirely on slow connections
    const timeoutMs = getNetworkTimeout();
    if (navigator.onLine && timeoutMs > 0 && !isSlowConnection()) {
      // Use requestIdleCallback or setTimeout to not block UI
      const syncFromNetwork = async () => {
        try {
          const result = await Promise.race([
            supabase
              .from('beat_plans')
              .select('*')
              .eq('user_id', user.id)
              .eq('plan_date', date),
            createTimeout(timeoutMs).then(() => null)
          ]).catch(() => null);
          
          if (!result || result.error) {
            console.log('Network sync skipped (timeout or error)');
            return;
          }
          
          const networkBeatPlans = result.data || [];
          
          // Cache for next time
          for (const plan of networkBeatPlans) {
            await offlineStorage.save(STORES.BEAT_PLANS, plan);
          }
          
          // Only update UI if data is different
          if (JSON.stringify(networkBeatPlans) !== JSON.stringify(beatPlans)) {
            setPlannedBeats(networkBeatPlans);
            if (networkBeatPlans.length > 0) {
              const beatNames = networkBeatPlans.map(plan => plan.beat_name).join(', ');
              setCurrentBeatName(beatNames);
            } else {
              setCurrentBeatName("No beats planned");
            }
            await loadAllVisitsForDate(date, networkBeatPlans, preserveOrder);
            console.log('🔄 Beats updated from network');
          }
        } catch (networkError) {
          console.log('Background network sync failed:', networkError);
        }
      };
      
      // Run in background without blocking
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => syncFromNetwork());
      } else {
        setTimeout(() => syncFromNetwork(), 100);
      }
    } else if (isSlowConnection()) {
      console.log('[LoadBeats] ⚡ Skipping network sync - slow connection, using cache');
    }
  } catch (error) {
    if (!shouldSuppressError(error)) {
      console.error('Error loading beat plans:', error);
    }
  }
};

// CACHE-FIRST load all visits for date (instant display)
export const loadAllVisitsForDateOptimized = async (
  user: any,
  date: string,
  beatPlans: any[],
  setRetailers: (retailers: any[]) => void,
  setRetailerStats: (stats: Map<string, any>) => void,
  setInitialRetailerOrder: (order: string[]) => void,
  preserveOrder: boolean = false
) => {
  if (!user) return;
  try {
    const selectedDateObj = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    selectedDateObj.setHours(0, 0, 0, 0);
    const isFutureDate = selectedDateObj > today;

    const plannedBeatIds = beatPlans.map(plan => plan.beat_id);
    
    let visits: any[] = [];
    let retailersData: any[] = [];
    let ordersForDate: any[] = [];
    let hasLoadedFromCache = false;

    // STEP 1: Load from cache immediately (instant)
    try {
      const cachedVisits = await offlineStorage.getAll<any>(STORES.VISITS);
      visits = cachedVisits.filter(
        (v: any) => v.user_id === user.id && v.planned_date === date
      );

      const cachedRetailers = await offlineStorage.getAll<any>(STORES.RETAILERS);
      const visitRetailerIds = visits.map(v => v.retailer_id);
      const plannedRetailers = cachedRetailers.filter((r: any) =>
        r.user_id === user.id && plannedBeatIds.includes(r.beat_id)
      );
      const plannedRetailerIds = plannedRetailers.map(r => r.id);
      const allRetailerIds = Array.from(new Set([...visitRetailerIds, ...plannedRetailerIds]));

      retailersData = cachedRetailers.filter((r: any) =>
        allRetailerIds.includes(r.id)
      );

      if (!isFutureDate) {
        const cachedOrders = await offlineStorage.getAll<any>(STORES.ORDERS);
        const dateStart = new Date(date);
        dateStart.setHours(0, 0, 0, 0);
        const dateEnd = new Date(date);
        dateEnd.setHours(23, 59, 59, 999);

        ordersForDate = cachedOrders.filter((o: any) => {
          const orderDate = new Date(o.created_at);
          return (
            o.user_id === user.id &&
            allRetailerIds.includes(o.retailer_id) &&
            orderDate >= dateStart &&
            orderDate <= dateEnd
          );
        });
      }

      // Always display cached data (even if empty)
      processAndSetRetailers(
        visits,
        retailersData,
        ordersForDate,
        beatPlans,
        date,
        isFutureDate,
        setRetailers,
        setRetailerStats,
        setInitialRetailerOrder,
        preserveOrder
      );
      hasLoadedFromCache = retailersData.length > 0;
      console.log('✅ Retailers loaded from cache instantly');
    } catch (cacheError) {
      console.log('Cache read error (non-critical):', cacheError);
      // Set empty state if cache fails
      setRetailers([]);
      setRetailerStats(new Map());
      setInitialRetailerOrder([]);
    }

    // STEP 2: Background network sync (non-blocking)
    // SLOW CONNECTION CHECK: Skip network sync entirely on slow connections
    const timeoutMs = getNetworkTimeout();
    if (navigator.onLine && timeoutMs > 0 && !isSlowConnection()) {
      const syncFromNetwork = async () => {
        try {
          // Race against timeout based on connection quality
          const result = await Promise.race([
            Promise.all([
              supabase.from('visits').select('*').eq('user_id', user.id).eq('planned_date', date),
              plannedBeatIds.length > 0
                ? supabase.from('retailers').select('id').in('beat_id', plannedBeatIds)
                : Promise.resolve({ data: [], error: null }),
            ]),
            createTimeout(timeoutMs).then(() => null)
          ]).catch(() => null);
          
          if (!result) {
            console.log('Network sync skipped (timeout)');
            return;
          }
          
          const [visitsResult, plannedRetailersResult] = result as any[];
          if (visitsResult?.error) return;
          
          const networkVisits = visitsResult?.data || [];
          const plannedRetailersData = plannedRetailersResult?.data || [];

          // Cache visits
          for (const visit of networkVisits) {
            await offlineStorage.save(STORES.VISITS, visit);
          }

          // Get all retailer IDs
          const visitRetailerIds = networkVisits.map((v: any) => v.retailer_id);
          const allRetailerIds = Array.from(
            new Set([...visitRetailerIds, ...plannedRetailersData.map((r: any) => r.id)])
          );

          if (allRetailerIds.length > 0) {
            const dateStart = new Date(date);
            dateStart.setHours(0, 0, 0, 0);
            const dateEnd = new Date(date);
            dateEnd.setHours(23, 59, 59, 999);

            const secondResult = await Promise.race([
              Promise.all([
                supabase.from('retailers').select('*').in('id', allRetailerIds),
                !isFutureDate
                  ? supabase
                      .from('orders')
                      .select('id, retailer_id, total_amount, pending_amount, created_at')
                      .eq('user_id', user.id)
                      .eq('status', 'confirmed')
                      .in('retailer_id', allRetailerIds)
                      .gte('created_at', dateStart.toISOString())
                      .lte('created_at', dateEnd.toISOString())
                  : Promise.resolve({ data: [], error: null }),
              ]),
              createTimeout(timeoutMs).then(() => null)
            ]).catch(() => null);

            if (!secondResult) {
              console.log('Network sync skipped (timeout on retailers)');
              return;
            }

            const [retailersResult, ordersResult] = secondResult as any[];
            if (retailersResult?.error) return;
            
            const networkRetailers = retailersResult?.data || [];
            const networkOrders = ordersResult?.data || [];

            // Cache retailers and orders (single write per store)
            await Promise.all([
              networkRetailers.length
                ? offlineStorage.mergeData(STORES.RETAILERS, networkRetailers)
                : Promise.resolve(),
              networkOrders.length
                ? offlineStorage.mergeData(STORES.ORDERS, networkOrders)
                : Promise.resolve(),
            ]);

            // Update UI with fresh data
            processAndSetRetailers(
              networkVisits,
              networkRetailers,
              networkOrders,
              beatPlans,
              date,
              isFutureDate,
              setRetailers,
              setRetailerStats,
              setInitialRetailerOrder,
              preserveOrder
            );
            console.log('🔄 Retailers updated from network');
          }
        } catch (networkError) {
          console.log('Background network sync failed:', networkError);
        }
      };
      
      // Run in background without blocking
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => syncFromNetwork());
      } else {
        setTimeout(() => syncFromNetwork(), 100);
      }
    } else if (isSlowConnection()) {
      console.log('[LoadVisits] ⚡ Skipping network sync - slow connection, using cache');
    }
  } catch (error) {
    if (!shouldSuppressError(error)) {
      console.error('Failed to load visits data:', error);
    }
  }
};

// Helper function to process and set retailers
const processAndSetRetailers = (
  visits: any[],
  retailersData: any[],
  ordersForDate: any[],
  beatPlans: any[],
  date: string,
  isFutureDate: boolean,
  setRetailers: (retailers: any[]) => void,
  setRetailerStats: (stats: Map<string, any>) => void,
  setInitialRetailerOrder: (order: string[]) => void,
  preserveOrder: boolean
) => {
  const plannedBeatIds = beatPlans.map(plan => plan.beat_id);
  
  // Create order map
  const orderMap = new Map();
  ordersForDate.forEach(order => {
    const existing = orderMap.get(order.retailer_id);
    orderMap.set(order.retailer_id, {
      value: (existing?.value || 0) + Number(order.total_amount || 0),
      pending: (existing?.pending || 0) + Number(order.pending_amount || 0),
    });
  });

  // Create visit status map
  const visitMap = new Map();
  visits.forEach(v => {
    visitMap.set(v.retailer_id, v);
  });

  // Process retailers with enriched data
  const enrichedRetailers = retailersData.map(r => {
    const visit = visitMap.get(r.id);
    const order = orderMap.get(r.id);
    const isPlanned = plannedBeatIds.includes(r.beat_id);
    const beatName = beatPlans.find(bp => bp.beat_id === r.beat_id)?.beat_name || '';

    return {
      ...r,
      hasOrder: !!order,
      orderValue: order?.value || 0,
      pendingAmount: order?.pending || 0,
      status: visit?.status || (isPlanned ? 'planned' : 'not-visited'),
      visitId: visit?.id,
      checkInTime: visit?.check_in_time,
      checkOutTime: visit?.check_out_time,
      noOrderReason: visit?.no_order_reason,
      isPlanned,
      beatName,
      location: {
        latitude: r.latitude,
        longitude: r.longitude,
      },
    };
  });

  if (!preserveOrder) {
    setRetailers(enrichedRetailers);
    setInitialRetailerOrder(enrichedRetailers.map(r => r.id));
  }

  // Update stats
  const stats = new Map();
  enrichedRetailers.forEach(r => {
    stats.set(r.id, {
      hasOrder: r.hasOrder,
      orderValue: r.orderValue,
      pendingAmount: r.pendingAmount,
    });
  });
  setRetailerStats(stats);
};
