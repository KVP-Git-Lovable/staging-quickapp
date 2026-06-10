import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { offlineStorage, STORES } from '@/lib/offlineStorage';
import { loadMyVisitsSnapshot, saveMyVisitsSnapshot } from '@/lib/myVisitsSnapshot';
import { isSlowConnection } from '@/utils/internetSpeedCheck';

interface UseVisitsDataProps {
  userId: string | undefined;
  selectedDate: string;
}

interface ProgressStats {
  planned: number;
  productive: number;
  unproductive: number;
  totalOrders: number;
  totalOrderValue: number;
}

// Calculate progress stats from data
const calculateStats = (visits: any[], orders: any[], retailers: any[]): ProgressStats => {
  const retailersWithOrders = new Set(orders.map(o => o.retailer_id));
  const visitsByRetailer = new Map<string, any[]>();
  
  visits.forEach(v => {
    if (!v?.retailer_id) return;
    const list = visitsByRetailer.get(v.retailer_id) || [];
    list.push(v);
    visitsByRetailer.set(v.retailer_id, list);
  });

  let planned = 0, productive = 0, unproductive = 0;
  const countedRetailers = new Set<string>();

  visitsByRetailer.forEach((group, retailerId) => {
    countedRetailers.add(retailerId);
    if (retailersWithOrders.has(retailerId)) productive++;
    else if (group.some(v => v.status === 'productive')) productive++;
    else if (group.some(v => v.status === 'unproductive' || !!v.no_order_reason)) unproductive++;
    else planned++;
  });

  retailersWithOrders.forEach(rid => {
    if (!countedRetailers.has(rid)) {
      productive++;
      countedRetailers.add(rid);
    }
  });

  retailers.forEach(r => {
    if (!countedRetailers.has(r.id)) planned++;
  });

  return {
    planned,
    productive,
    unproductive,
    totalOrders: orders.length,
    totalOrderValue: orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
  };
};

export const useVisitsData = ({ userId, selectedDate }: UseVisitsDataProps) => {
  const [beatPlans, setBeatPlans] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [retailers, setRetailers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  
  // FIX: Store progress stats from snapshot for immediate display (no network needed)
  const [snapshotStats, setSnapshotStats] = useState<ProgressStats | null>(null);
  
  const lastDateRef = useRef<string>('');
  const cacheRef = useRef<Map<string, any>>(new Map());
  const isFetchingRef = useRef(false);

  // Use snapshot stats if available (instant), otherwise calculate from current data
  const calculatedStats = useMemo(() => 
    calculateStats(visits, orders, retailers),
    [visits, orders, retailers]
  );
  
  // FIX: Prefer snapshot stats when data hasn't loaded yet, prevents ₹0 flicker
  const progressStats = useMemo(() => {
    // If we have calculated stats with actual data, use those
    if (calculatedStats.totalOrders > 0 || calculatedStats.productive > 0 || calculatedStats.unproductive > 0) {
      return calculatedStats;
    }
    // Otherwise use snapshot stats if available (prevents ₹0 on slow/no network)
    if (snapshotStats && (snapshotStats.totalOrders > 0 || snapshotStats.totalOrderValue > 0)) {
      return snapshotStats;
    }
    return calculatedStats;
  }, [calculatedStats, snapshotStats]);

  // Load data from cache instantly, then sync in background
  const loadData = useCallback(async () => {
    if (!userId || !selectedDate) return;
    if (isFetchingRef.current && lastDateRef.current === selectedDate) return;
    
    isFetchingRef.current = true;
    lastDateRef.current = selectedDate;

    // 1. Try in-memory cache first (instant)
    const cached = cacheRef.current.get(selectedDate);
    if (cached) {
      setBeatPlans(cached.beatPlans);
      setVisits(cached.visits);
      setRetailers(cached.retailers);
      setOrders(cached.orders);
      setIsLoading(false);
      
      // Background sync for today only - skip on slow connections
      if (navigator.onLine && isToday(selectedDate) && !isSlowConnection()) {
        setTimeout(() => syncFromNetwork(userId, selectedDate), 50);
      }
      isFetchingRef.current = false;
      return;
    }

    // 2. Try persistent snapshot (fast)
    try {
      const snapshot = await loadMyVisitsSnapshot(userId, selectedDate);
      if (snapshot) {
        // FIX: Always load progress stats from snapshot immediately (no network needed)
        if (snapshot.progressStats) {
          setSnapshotStats(snapshot.progressStats);
        }
        
        // FIX: If snapshot has no beat plans, clear everything (beats were cleared)
        if (snapshot.beatPlans?.length === 0) {
          setBeatPlans([]);
          setVisits([]);
          setRetailers([]);
          setOrders([]);
          setIsLoading(false);
          cacheRef.current.set(selectedDate, { beatPlans: [], visits: [], retailers: [], orders: [] });
          isFetchingRef.current = false;
          
          // Still do background sync for today
          if (navigator.onLine && isToday(selectedDate) && !isSlowConnection()) {
            setTimeout(() => syncFromNetwork(userId, selectedDate), 50);
          }
          return;
        }
        
        if (snapshot.retailers?.length > 0) {
          setBeatPlans(snapshot.beatPlans || []);
          setVisits(snapshot.visits || []);
          setRetailers(snapshot.retailers || []);
          setOrders(snapshot.orders || []);
          setIsLoading(false);
          
          cacheRef.current.set(selectedDate, snapshot);
          
          // Background sync for today - skip on slow connections
          if (navigator.onLine && isToday(selectedDate) && !isSlowConnection()) {
            setTimeout(() => syncFromNetwork(userId, selectedDate), 50);
          }
          isFetchingRef.current = false;
          return;
        }
      }
    } catch (e) {
      // Continue to offline storage
    }

    // 3. Try offline storage
    try {
      const [cachedBeatPlans, cachedVisits, cachedRetailers, cachedOrders] = await Promise.all([
        offlineStorage.getAll<any>(STORES.BEAT_PLANS),
        offlineStorage.getAll<any>(STORES.VISITS),
        offlineStorage.getAll<any>(STORES.RETAILERS),
        offlineStorage.getAll<any>(STORES.ORDERS)
      ]);

      const filteredBeatPlans = cachedBeatPlans.filter(bp => 
        bp.user_id === userId && bp.plan_date === selectedDate
      );
      const filteredVisits = cachedVisits.filter(v => 
        v.user_id === userId && v.planned_date === selectedDate
      );
      
      const beatIds = filteredBeatPlans.map(bp => bp.beat_id);
      const visitRetailerIds = new Set(filteredVisits.map(v => v.retailer_id));
      
      const filteredRetailers = cachedRetailers.filter(r => 
        r.user_id === userId && (beatIds.includes(r.beat_id) || visitRetailerIds.has(r.id))
      );
      
      const retailerIds = new Set(filteredRetailers.map(r => r.id));
      const filteredOrders = cachedOrders.filter(o => 
        o.user_id === userId && o.order_date === selectedDate && 
        o.status === 'confirmed' && retailerIds.has(o.retailer_id)
      );

      setBeatPlans(filteredBeatPlans);
      setVisits(filteredVisits);
      setRetailers(filteredRetailers);
      setOrders(filteredOrders);
      setIsLoading(false);

      cacheRef.current.set(selectedDate, {
        beatPlans: filteredBeatPlans,
        visits: filteredVisits,
        retailers: filteredRetailers,
        orders: filteredOrders
      });
    } catch (e) {
      console.error('Cache load error:', e);
    }

    // 4. Network sync in background - skip on slow connections
    if (navigator.onLine && !isSlowConnection()) {
      setTimeout(() => syncFromNetwork(userId, selectedDate), 100);
    } else if (isSlowConnection()) {
      console.log('[useVisitsData] ⚡ Skipping network sync - slow connection, using cache');
    }
    
    isFetchingRef.current = false;
  }, [userId, selectedDate]);

  // Background network sync - skip on slow connections
  const syncFromNetwork = useCallback(async (uid: string, date: string) => {
    // SLOW CONNECTION CHECK: Skip network sync entirely on slow connections
    if (!navigator.onLine || isSlowConnection()) {
      console.log('[useVisitsData] ⚡ Skipping syncFromNetwork - slow/offline');
      return;
    }
    
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000); // Reduced to 8s

      const [bpRes, vRes, oRes] = await Promise.all([
        supabase.from('beat_plans').select('*').eq('user_id', uid).eq('plan_date', date),
        supabase.from('visits').select('*').eq('user_id', uid).eq('planned_date', date),
        // FIX: No user_id filter - RLS scopes via beat_access + owner_id_snapshot
        supabase.from('orders').select('*').eq('order_date', date).in('status', ['confirmed','delivered'])
      ]);

      clearTimeout(timeout);

      if (bpRes.error || vRes.error || oRes.error) return;

      const beatPlansData = bpRes.data || [];
      const visitsData = vRes.data || [];
      const ordersData = oRes.data || [];

      // Get retailer IDs
      const beatIds = beatPlansData.map(bp => bp.beat_id);
      const visitRetailerIds = visitsData.map(v => v.retailer_id);
      const orderRetailerIds = ordersData.map(o => o.retailer_id);

      let retailerIds: string[] = [...visitRetailerIds, ...orderRetailerIds];

      if (beatIds.length > 0) {
        const { data: beatRetailers } = await supabase
          .from('retailers')
          .select('id')
          .in('beat_id', beatIds);
        retailerIds.push(...(beatRetailers || []).map(r => r.id));
      }

      const uniqueRetailerIds = [...new Set(retailerIds)];
      let retailersData: any[] = [];

      if (uniqueRetailerIds.length > 0) {
        const { data } = await supabase
          .from('retailers')
          .select('*')
          .in('id', uniqueRetailerIds);
        retailersData = data || [];
      }

      // Only update if this is still the current date
      if (lastDateRef.current === date) {
        setBeatPlans(beatPlansData);
        setVisits(visitsData);
        setRetailers(retailersData);
        setOrders(ordersData);

        // Update caches
        cacheRef.current.set(date, {
          beatPlans: beatPlansData,
          visits: visitsData,
          retailers: retailersData,
          orders: ordersData
        });

        // Save snapshot
        saveMyVisitsSnapshot(uid, date, {
          beatPlans: beatPlansData,
          visits: visitsData,
          retailers: retailersData,
          orders: ordersData,
          progressStats: calculateStats(visitsData, ordersData, retailersData),
          currentBeatName: beatPlansData.map(p => p.beat_name).join(', ')
        }).catch(() => {});
      }
    } catch (e) {
      console.log('Network sync error (silent):', e);
    }
  }, []);

  // Helper to check if date is today
  const isToday = (dateStr: string): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const check = new Date(dateStr);
    check.setHours(0, 0, 0, 0);
    return today.getTime() === check.getTime();
  };

  // Invalidate and reload
  const invalidateVisitsData = useCallback(() => {
    cacheRef.current.delete(selectedDate);
    loadData();
  }, [selectedDate, loadData]);

  // Load on mount and date change
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Listen for events
  useEffect(() => {
    const handleStatusChange = () => invalidateVisitsData();
    const handleSync = () => {
      if (isToday(selectedDate)) invalidateVisitsData();
    };

    window.addEventListener('visitStatusChanged', handleStatusChange);
    window.addEventListener('syncComplete', handleSync);

    return () => {
      window.removeEventListener('visitStatusChanged', handleStatusChange);
      window.removeEventListener('syncComplete', handleSync);
    };
  }, [invalidateVisitsData, selectedDate]);

  return {
    beatPlans,
    visits,
    retailers,
    orders,
    isLoading,
    error,
    progressStats,
    invalidateVisitsData,
  };
};
