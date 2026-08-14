import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { offlineStorage, STORES, MIN_SYNC_INTERVAL_MS } from '@/lib/offlineStorage';
import { loadMyVisitsSnapshot, saveMyVisitsSnapshot, clearMyVisitsSnapshot } from '@/lib/myVisitsSnapshot';
import { getLocalTodayDate } from '@/utils/dateUtils';
import { isSlowConnection, getConnectionQuality, getManualSlowMode } from '@/utils/internetSpeedCheck';
import { getLastChangeTimestamp, clearChangeMarker } from '@/lib/visitChangeMarker';
import { getBeatTeammates } from '@/lib/beatTeammates';

interface UseVisitsDataOptimizedProps {
  userId: string | undefined;
  selectedDate: string;
  viewUserId?: string; // Optional: view another user's data (for managers viewing subordinates)
}

interface PointsData {
  total: number;
  byRetailer: Map<
    string,
    {
      name: string;
      points: number;
      visitId: string | null;
      entries: Array<{ gameName: string; actionName: string; points: number }>;
    }
  >;
}

interface ProgressStats {
  planned: number; // Pending visits (not yet visited)
  productive: number;
  unproductive: number;
  totalOrders: number;
  totalOrderValue: number;
  totalPlanned: number; // Total planned visits (doesn't change when status changes)
  // Teammate breakdown (shared beats). All zero when no shared activity exists.
  teamProductive: number;
  teamUnproductive: number;
  teamOrders: number;
  teamOrderValue: number;
}

// SMART SYNC: Track individual item changes by ID + timestamp
interface ItemFingerprint {
  id: string;
  updatedAt: string;
  hash: string;
}

// Generate a simple hash for an item to detect changes
const generateItemHash = (item: any): string => {
  if (!item) return '';
  // Use key fields that matter for display
  const relevantFields = {
    status: item.status,
    no_order_reason: item.no_order_reason,
    total_amount: item.total_amount,
    pending_amount: item.pending_amount,
    order_value: item.order_value,
  };
  return JSON.stringify(relevantFields);
};

// SMART COMPARE: Returns only items that actually changed
const getChangedItems = <T extends { id: string; updated_at?: string }>(
  existing: T[],
  incoming: T[]
): { changed: T[], unchanged: string[], added: T[], removed: string[] } => {
  const existingMap = new Map(existing.map(item => [item.id, item]));
  const incomingMap = new Map(incoming.map(item => [item.id, item]));
  
  const changed: T[] = [];
  const unchanged: string[] = [];
  const added: T[] = [];
  const removed: string[] = [];
  
  // Check incoming items
  for (const [id, item] of incomingMap) {
    const existingItem = existingMap.get(id);
    if (!existingItem) {
      added.push(item);
    } else {
      // Compare by updated_at and hash
      const existingHash = generateItemHash(existingItem);
      const incomingHash = generateItemHash(item);
      const existingTime = (existingItem as any).updated_at || '';
      const incomingTime = item.updated_at || '';
      
      if (incomingTime > existingTime || incomingHash !== existingHash) {
        changed.push(item);
      } else {
        unchanged.push(id);
      }
    }
  }
  
  // Check for removed items
  for (const id of existingMap.keys()) {
    if (!incomingMap.has(id)) {
      removed.push(id);
    }
  }
  
  return { changed, unchanged, added, removed };
};

// Calculate progress stats - PURE FUNCTION (no network calls)
// FIX: Added date parameter to filter visits by selectedDate to prevent stale data counts
const calculateStats = (visits: any[], orders: any[], retailers: any[], selectedDate?: string): ProgressStats => {
  // CRITICAL FIX: Filter visits to ONLY the selected date to prevent stale snapshot data from contaminating counts
  const dateFilteredVisits = selectedDate 
    ? visits.filter(v => v.planned_date === selectedDate)
    : visits;
  
  // Also filter orders by date, and to retailer orders only. Counter/event
  // orders carry retailer_id = null, so a set built from o.retailer_id gets a
  // literal `null` entry — never in countedRetailers, so it always reads as an
  // extra productive retailer, and the reduce below adds its amount straight
  // into a KPI titled "Today's Progress" for a beat that never saw it. This is
  // the retailer/beat widget; activity and event figures are added separately
  // by the caller (see actTotal/actProductive in MyVisits.tsx).
  const dateFilteredOrders = selectedDate
    ? orders.filter(o => o.order_date === selectedDate && o.retailer_id)
    : orders.filter(o => o.retailer_id);
  
  // Activity visits (events, meetings, leave) carry retailer_id = null. A caller
  // that derives its retailer list from visits therefore hands us an entry with
  // no id, and counting it as a planned retailer double-counts the activity —
  // once here and once again as an activity card in MyVisits.
  const realRetailers = retailers.filter(r => r?.id);

  const retailersWithOrders = new Set(dateFilteredOrders.map(o => o.retailer_id));
  const visitsByRetailer = new Map<string, any[]>();
  
  dateFilteredVisits.forEach(v => {
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

  realRetailers.forEach(r => {
    if (!countedRetailers.has(r.id)) planned++;
  });

  // Total planned = all retailers in the beat
  // SAFETY: If retailers array is momentarily empty (transient sync), use visited retailer count
  // This prevents totalPlanned from flashing to 0 during sync cycles
  const totalPlanned = realRetailers.length > 0 ? realRetailers.length : countedRetailers.size;

  // Teammate breakdown — rows tagged with _source === 'teammate' by the smart sync.
  const teamOrdersList = dateFilteredOrders.filter((o: any) => o?._source === 'teammate');
  const teamProductiveRetailers = new Set<string>(
    teamOrdersList.map((o: any) => o.retailer_id).filter(Boolean)
  );
  // First pass: teammate visits marked productive add to productive set.
  dateFilteredVisits.forEach((v: any) => {
    if (v?._source === 'teammate' && v.retailer_id && v.status === 'productive') {
      teamProductiveRetailers.add(v.retailer_id);
    }
  });
  // Second pass: unproductive only if NOT already productive.
  const teamUnproductiveRetailers = new Set<string>();
  dateFilteredVisits.forEach((v: any) => {
    if (v?._source !== 'teammate' || !v.retailer_id) return;
    if (teamProductiveRetailers.has(v.retailer_id)) return;
    if (v.status === 'unproductive' || !!v.no_order_reason) {
      teamUnproductiveRetailers.add(v.retailer_id);
    }
  });

  return {
    planned,
    productive,
    unproductive,
    totalOrders: dateFilteredOrders.length,
    totalOrderValue: dateFilteredOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0),
    totalPlanned,
    teamProductive: teamProductiveRetailers.size,
    teamUnproductive: teamUnproductiveRetailers.size,
    teamOrders: teamOrdersList.length,
    teamOrderValue: teamOrdersList.reduce((sum, o: any) => sum + Number(o.total_amount || 0), 0),
  };
};

// Helper to fetch points for a specific date
const fetchPointsForDate = async (uid: string, date: string): Promise<PointsData> => {
  // (defined below)
  return _fetchPointsForDateImpl(uid, date);
};

// Normalize a serialized byRetailer entry so older cached snapshots (which
// didn't include the per-game `entries[]` field) don't break the new type.
const normalizeByRetailerEntries = (raw: any): Map<string, {
  name: string;
  points: number;
  visitId: string | null;
  entries: Array<{ gameName: string; actionName: string; points: number }>;
}> => {
  const source: Iterable<[string, any]> =
    raw instanceof Map ? raw.entries() : Array.isArray(raw) ? raw : [];
  const normalized = new Map();
  for (const [rid, val] of source) {
    normalized.set(rid, {
      name: val?.name || '',
      points: val?.points || 0,
      visitId: val?.visitId ?? null,
      entries: Array.isArray(val?.entries) ? val.entries : [],
    });
  }
  return normalized;
};

const _fetchPointsForDateImpl = async (uid: string, date: string): Promise<PointsData> => {
  const dateStart = new Date(date);
  dateStart.setHours(0, 0, 0, 0);
  const dateEnd = new Date(date);
  dateEnd.setHours(23, 59, 59, 999);

  let { data: pointsRaw, error: pointsError } = await supabase
    .from('gamification_points')
    .select('points, reference_id, metadata, gamification_games(name), gamification_actions(action_name)')
    .eq('user_id', uid)
    .gte('earned_at', dateStart.toISOString())
    .lte('earned_at', dateEnd.toISOString());

  // Fallback: if the embedded relations fail (e.g. missing FK), still show totals
  if (pointsError) {
    console.warn('[points] embed query failed, falling back to plain select:', pointsError.message);
    const fallback = await supabase
      .from('gamification_points')
      .select('points, reference_id, metadata')
      .eq('user_id', uid)
      .gte('earned_at', dateStart.toISOString())
      .lte('earned_at', dateEnd.toISOString());
    pointsRaw = (fallback.data as any) || [];
  }

  const total = pointsRaw?.reduce((sum, p) => sum + (p.points || 0), 0) || 0;
  const byRetailer = new Map<
    string,
    {
      name: string;
      points: number;
      visitId: string | null;
      entries: Array<{ gameName: string; actionName: string; points: number }>;
    }
  >();
  
  // Group points by retailer from metadata
  if (pointsRaw) {
    for (const p of pointsRaw) {
      const retailerId = (p.metadata as any)?.retailer_id;
      if (retailerId) {
        const existing = byRetailer.get(retailerId) || {
          name: '',
          points: 0,
          visitId: null,
          entries: [] as Array<{ gameName: string; actionName: string; points: number }>,
        };
        const gameName = (p as any).gamification_games?.name || 'Game';
        const actionName = (p as any).gamification_actions?.action_name || '';
        const pts = p.points || 0;

        // Aggregate same (gameName, actionName) entries together for cleaner display
        const existingEntry = existing.entries.find(
          (e) => e.gameName === gameName && e.actionName === actionName
        );
        if (existingEntry) {
          existingEntry.points += pts;
        } else {
          existing.entries.push({ gameName, actionName, points: pts });
        }

        byRetailer.set(retailerId, {
          ...existing,
          points: existing.points + pts,
          visitId: p.reference_id || existing.visitId,
        });
      }
    }
  }

  return { total, byRetailer };
};

// ============================================================================
// PERSPECTIVE HELPERS
// _source/_actor are perspective-specific (teammate RELATIVE TO the fetching user).
// Never persist them: strip on write; re-derive on read using row.user_id vs
// the current effectiveUserId. A row is "mine" iff row.user_id === uid.
// ============================================================================
const stripPerspective = (rows: any[]): any[] =>
  (rows || []).map(r => {
    if (r && (r._source !== undefined || r._actor !== undefined)) {
      const { _source, _actor, ...rest } = r as any;
      return rest;
    }
    return r;
  });

const retagPerspective = (rows: any[], uid: string): any[] =>
  (rows || []).map(r => {
    if (!r) return r;
    if (r.user_id && r.user_id !== uid) {
      return {
        ...r,
        _source: 'teammate',
        _actor: r._actor || { user_id: r.user_id, name: 'Teammate' },
      };
    }
    if (r._source !== undefined || r._actor !== undefined) {
      const { _source, _actor, ...rest } = r as any;
      return rest;
    }
    return r;
  });

// Fetch teammate activity (visits + orders) on the user's beats for `date`.
// Extracted so doFullInitialLoad and smartDeltaSync produce identically-shaped data.
const fetchTeammateActivity = async (
  uid: string,
  date: string,
  seedBeatIds: Iterable<string>,
  ownVisitIds: Set<string>,
  ownOrderIds: Set<string>
): Promise<{ visits: any[]; orders: any[] }> => {
  const empty = { visits: [] as any[], orders: [] as any[] };
  try {
    const beatIdSet = new Set<string>();
    for (const id of seedBeatIds) if (id) beatIdSet.add(id);
    try {
      const [dailyRes, ownedRes] = await Promise.all([
        (supabase as any)
          .from('daily_beat_plans')
          .select('beat_id')
          .eq('assigned_user_id', uid)
          .eq('plan_date', date),
        supabase.from('beats').select('beat_id').eq('owner_id', uid).eq('is_active', true),
      ]);
      (dailyRes.data || []).forEach((r: any) => r.beat_id && beatIdSet.add(r.beat_id));
      (ownedRes.data || []).forEach((r: any) => r.beat_id && beatIdSet.add(r.beat_id));
    } catch (e) {
      console.warn('[TeammateFetch] Extra beat-source fetch failed (non-fatal):', e);
    }
    const todayBeatIds = Array.from(beatIdSet);
    if (!todayBeatIds.length) return empty;

    const teammates = await getBeatTeammates(uid, todayBeatIds, date);
    if (!teammates.userIds.length) return empty;

    const { data: sharedRetailers } = await supabase
      .from('retailers')
      .select('id, beat_id')
      .in('beat_id', todayBeatIds);
    const sharedRetailerIds = (sharedRetailers || []).map((r: any) => r.id);
    if (!sharedRetailerIds.length) return empty;

    const [tvRes, toRes] = await Promise.all([
      supabase.from('visits').select('*').eq('planned_date', date)
        .in('user_id', teammates.userIds).in('retailer_id', sharedRetailerIds),
      supabase.from('orders').select('*, order_items!order_items_order_id_fkey(*)').eq('order_date', date)
        .in('status', ['confirmed', 'delivered'])
        .in('user_id', teammates.userIds).in('retailer_id', sharedRetailerIds),
    ]);
    const tagActor = (row: any) => ({
      ...row,
      _source: 'teammate',
      _actor: { user_id: row.user_id, name: teammates.names.get(row.user_id) || 'Teammate' },
    });
    return {
      visits: (tvRes.data || []).filter((v: any) => !ownVisitIds.has(v.id)).map(tagActor),
      orders: (toRes.data || []).filter((o: any) => !ownOrderIds.has(o.id)).map(tagActor),
    };
  } catch (e) {
    console.warn('[TeammateFetch] failed:', e);
    return empty;
  }
};

// MODULE-LEVEL CACHE: Survives component unmount/remount to prevent flicker on navigation
// This is the key fix for flickering when switching modules and returning
const moduleCache = new Map<string, {
  beatPlans: any[];
  visits: any[];
  retailers: any[];
  orders: any[];
  points?: { total: number; byRetailer: [string, any][] };
  timestamp: number;
}>();

const getModuleCacheKey = (userId: string, date: string) => `${userId}:${date}`;

export const useVisitsDataOptimized = ({ userId, selectedDate, viewUserId }: UseVisitsDataOptimizedProps) => {
  // The effective user ID to fetch data for:
  // - If viewUserId is provided and not 'self', use that (manager viewing subordinate)
  // - Otherwise use the authenticated user's ID
  const effectiveUserId = viewUserId && viewUserId !== 'self' ? viewUserId : userId;
  
  // FIX: Initialize state from module-level cache to prevent flicker on remount
  const moduleCacheKey = effectiveUserId ? getModuleCacheKey(effectiveUserId, selectedDate) : '';
  const initialModuleCache = moduleCacheKey ? moduleCache.get(moduleCacheKey) : undefined;
  
  const [beatPlans, setBeatPlans] = useState<any[]>(() => initialModuleCache?.beatPlans || []);
  const [visits, setVisits] = useState<any[]>(() => initialModuleCache?.visits || []);
  const [retailers, setRetailers] = useState<any[]>(() => initialModuleCache?.retailers || []);
  const [orders, setOrders] = useState<any[]>(() => initialModuleCache?.orders || []);
  const [pointsData, setPointsData] = useState<PointsData>(() => {
    if (initialModuleCache?.points) {
      return {
        total: initialModuleCache.points.total,
        byRetailer: normalizeByRetailerEntries(initialModuleCache.points.byRetailer),
      };
    }
    return { total: 0, byRetailer: new Map() };
  });
  // FIX: If module cache has data, start with loading=false to prevent flicker
  const [isLoading, setIsLoading] = useState(() => !initialModuleCache);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(() => !!initialModuleCache);
  const [error, setError] = useState<any>(null);

  const lastDateRef = useRef<string>('');
  const lastUserRef = useRef<string>(''); // Track user changes for cache invalidation
  // FIX: Seed cacheRef from module cache so loadData finds data immediately
  const cacheRef = useRef<Map<string, any>>(
    initialModuleCache
      ? new Map([[selectedDate, { ...initialModuleCache, points: initialModuleCache.points ? { total: initialModuleCache.points.total, byRetailer: initialModuleCache.points.byRetailer } : undefined }]])
      : new Map()
  );
  const isFetchingRef = useRef(false);
  const mountedRef = useRef(true);
  const lastSyncTimeRef = useRef<Map<string, number>>(new Map());
  const syncInProgressRef = useRef(false);
  
  // SMART SYNC: Lock to prevent multiple syncs
  const smartSyncLockRef = useRef(false);
  
  // MEMORY OPTIMIZATION: Limit cached dates to prevent unbounded growth
  const MAX_CACHED_DATES = 7;
  
  const pruneDateCache = useCallback(() => {
    if (cacheRef.current.size <= MAX_CACHED_DATES) return;
    
    const entries = Array.from(cacheRef.current.entries())
      .sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
    
    const toRemove = entries.slice(0, entries.length - MAX_CACHED_DATES);
    for (const [key] of toRemove) {
      cacheRef.current.delete(key);
    }
    console.log(`[useVisitsData] Pruned ${toRemove.length} old date caches, remaining: ${cacheRef.current.size}`);
  }, []);
  
  // STALE CLOSURE FIX: Keep refs in sync with latest values for event handlers
  const userIdRef = useRef(effectiveUserId);
  const selectedDateRef = useRef(selectedDate);

  // FRESHNESS ORDERING: Older results (from any cache/network path) must never
  // overwrite newer results. Track the latest "producedAt" applied per uid+date.
  const lastAppliedAtRef = useRef<Map<string, number>>(new Map());
  const isFresh = useCallback((uid: string, date: string, producedAt: number): boolean => {
    if (!uid || !date) return false;
    const key = `${uid}:${date}`;
    const last = lastAppliedAtRef.current.get(key) || 0;
    if (producedAt < last) return false;
    lastAppliedAtRef.current.set(key, producedAt);
    return true;
  }, []);
  // Marks network-fetched data as always-winning (bumps the freshness stamp).
  const markNetworkApplied = useCallback((uid: string, date: string) => {
    if (!uid || !date) return Date.now();
    const now = Date.now();
    lastAppliedAtRef.current.set(`${uid}:${date}`, now);
    return now;
  }, []);
  
  // FIX: Sync state to module-level cache so it survives unmount/remount
  useEffect(() => {
    if (!effectiveUserId || !hasLoadedOnce) return;
    const key = getModuleCacheKey(effectiveUserId, selectedDate);
    moduleCache.set(key, {
      beatPlans,
      visits,
      retailers,
      orders,
      points: { total: pointsData.total, byRetailer: Array.from(pointsData.byRetailer.entries()) },
      timestamp: Date.now(),
    });
    // Prune module cache to prevent unbounded growth
    if (moduleCache.size > 14) {
      const firstKey = moduleCache.keys().next().value;
      if (firstKey) moduleCache.delete(firstKey);
    }
  }, [effectiveUserId, selectedDate, beatPlans, visits, retailers, orders, pointsData, hasLoadedOnce]);
  
  // Helper to clear all in-memory state and caches
  const clearAllCachesAndState = useCallback(() => {
    console.log('[useVisitsDataOptimized] CLEARING ALL CACHES AND STATE');
    cacheRef.current.clear();
    lastSyncTimeRef.current.clear();
    moduleCache.clear(); // Also clear module cache
    setBeatPlans([]);
    setVisits([]);
    setRetailers([]);
    setOrders([]);
    setPointsData({ total: 0, byRetailer: new Map() });
    setHasLoadedOnce(false);
    setIsLoading(true);
    isFetchingRef.current = false;
    lastDateRef.current = '';
    smartSyncLockRef.current = false;
  }, []);
  
  // CRITICAL: Clear ALL caches when viewing different user to prevent data leakage
  useEffect(() => {
    if (effectiveUserId && lastUserRef.current && effectiveUserId !== lastUserRef.current) {
      console.log('[useVisitsDataOptimized] User changed from', lastUserRef.current, 'to', effectiveUserId, '- CLEARING ALL CACHES');
      clearAllCachesAndState();
    }
    lastUserRef.current = effectiveUserId || '';
  }, [effectiveUserId, clearAllCachesAndState]);
  
  // CRITICAL: Listen for auth state changes (login/logout) to clear stale data
  // FIX: Only clear on SIGNED_OUT or when user identity actually changes.
  // On tab return, Supabase emits SIGNED_IN / TOKEN_REFRESHED for session refresh —
  // we must NOT wipe state for the same user.
  const lastAuthUserIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    // Seed with current effective user so first SIGNED_IN for same user is a no-op
    lastAuthUserIdRef.current = effectiveUserId || null;
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        console.log('[Auth] SIGNED_OUT — clearing all data');
        lastAuthUserIdRef.current = null;
        clearAllCachesAndState();
        return;
      }
      
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        const newUserId = session?.user?.id ?? null;
        const previousUserId = lastAuthUserIdRef.current;
        
        if (previousUserId && newUserId === previousUserId) {
          // Same user — session refresh / tab return. Do NOT clear state.
          console.log('[Auth]', event, '— same user, skipping state clear');
          return;
        }
        
        // Different user (or first login after sign-out) — clear + immediate reload
        console.log('[Auth]', event, '— user changed from', previousUserId, 'to', newUserId, '— clearing & reloading');
        lastAuthUserIdRef.current = newUserId;
        clearAllCachesAndState();
        
        // Reset sync throttle so reload isn't blocked
        lastSyncTimeRef.current.clear();
        
        // Schedule immediate reload (loadData will pick up new userId via effectiveUserId)
        // Don't await — let it run after React re-renders with new auth state
      }
    });
    return () => subscription.unsubscribe();
  }, [clearAllCachesAndState, effectiveUserId]);
  
  useEffect(() => {
    userIdRef.current = effectiveUserId;
    selectedDateRef.current = selectedDate;
  }, [effectiveUserId, selectedDate]);

  // Memoized progress stats - LOCAL CALCULATION ONLY
  // FIX: Pass selectedDate to calculateStats to ensure only matching visits are counted
  const progressStats = useMemo(() => {
    // Warn only if there's a data inconsistency (visits from wrong dates in state)
    const wrongDateVisits = visits.filter(v => v.planned_date !== selectedDate);
    if (wrongDateVisits.length > 0) {
      console.warn(`[ProgressStats] ⚠️ ${wrongDateVisits.length} visits with wrong dates found, expected: ${selectedDate}`);
    }
    
    // SAFETY: Never show 0 planned when retailers is temporarily empty during sync.
    // Use visits as fallback to keep stats visible during transient empty-retailer state.
    const safeRetailers = retailers.length > 0
      ? retailers
      : visits.filter((v: any) => v.planned_date === selectedDate && !v._source && v.retailer_id)
               .map((v: any) => ({ id: v.retailer_id }));
    return calculateStats(visits, orders, safeRetailers, selectedDate);
  }, [visits, orders, retailers, selectedDate]);

  // Check if date is today using centralized date logic
  const isToday = useCallback((dateStr: string): boolean => {
    return dateStr === getLocalTodayDate();
  }, []);

  // Check if should sync (time-based throttling)
  const shouldSyncNow = useCallback((date: string): boolean => {
    const lastSync = lastSyncTimeRef.current.get(date);
    if (!lastSync) return true;
    return (Date.now() - lastSync) >= MIN_SYNC_INTERVAL_MS;
  }, []);

  // Load from offline storage - ALWAYS INSTANT
  // FIX: Less restrictive filtering - include ALL user's retailers that match beats
  const loadFromOfflineStorage = useCallback(async (uid: string, date: string) => {
    try {
      const [cachedBeatPlans, cachedVisits, cachedRetailers, cachedOrders, cachedBeats] = await Promise.all([
        offlineStorage.getAll<any>(STORES.BEAT_PLANS),
        offlineStorage.getAll<any>(STORES.VISITS),
        offlineStorage.getAll<any>(STORES.RETAILERS),
        offlineStorage.getAll<any>(STORES.ORDERS),
        offlineStorage.getAll<any>(STORES.BEATS)
      ]);

      const filteredBeatPlans = cachedBeatPlans.filter(bp => 
        bp.user_id === uid && bp.plan_date === date
      );

      // Today's beat IDs from beat plans
      const todayBeatIds = filteredBeatPlans.map(bp => bp.beat_id);
      const todayBeatIdSet = new Set(todayBeatIds);

      // PERSPECTIVE FIX: never gate by the stale `_source` tag (that tag was written
      // from whichever user last synced the store — it does NOT belong to `uid`).
      // Include the row when either it's owned by `uid` OR its beat is one of
      // `uid`'s planned beats today (teammate row on a shared beat). Then re-derive
      // the perspective at the end using row.user_id vs uid.
      const filteredVisitsRaw = cachedVisits.filter(v =>
        v.planned_date === date &&
        (v.user_id === uid || (v.beat_id && todayBeatIdSet.has(v.beat_id)))
      );

      const visitRetailerIds = new Set(filteredVisitsRaw.map(v => v.retailer_id));
      
      // Get explicit retailer IDs from beat_data
      const explicitRetailerIds: string[] = [];
      for (const bp of filteredBeatPlans) {
        const beatData = bp.beat_data as any;
        if (beatData?.retailer_ids?.length > 0) {
          explicitRetailerIds.push(...beatData.retailer_ids);
        }
      }
      
      // Include retailers belonging to today's beats regardless of owner
      // (shared beats have retailers owned by the original beat owner, not the current user).
      // Offline-created retailers still need the user_id check.
      const filteredRetailers = cachedRetailers.filter(r =>
        todayBeatIds.includes(r.beat_id) ||                                // Today's beat plans (any owner)
        (r.user_id === uid && visitRetailerIds.has(r.id)) ||               // Has visit today
        (r.user_id === uid && explicitRetailerIds.includes(r.id)) ||       // Explicit in beat_data
        (r.id?.startsWith('offline_') && r.user_id === uid && todayBeatIds.includes(r.beat_id))
      );

      // Orders: own orders OR orders on `uid`'s planned beats (teammate orders).
      // Re-derive perspective at the end — do NOT trust persisted `_source`.
      const filteredOrdersRaw = cachedOrders.filter(o =>
        o.order_date === date && o.status === 'confirmed' &&
        (o.user_id === uid || (o.beat_id && todayBeatIdSet.has(o.beat_id)))
      );

      // Re-derive teammate tagging vs current uid
      const filteredVisits = retagPerspective(filteredVisitsRaw, uid);
      const filteredOrders = retagPerspective(filteredOrdersRaw, uid);

      console.log('[OfflineStorage] Loaded:', {
        beatPlans: filteredBeatPlans.length,
        visits: filteredVisits.length,
        retailers: filteredRetailers.length,
        orders: filteredOrders.length,
        todayBeatIds
      });

      return {
        beatPlans: filteredBeatPlans,
        visits: filteredVisits,
        retailers: filteredRetailers,
        orders: filteredOrders
      };
    } catch (e) {
      console.error('Offline storage error:', e);
      return null;
    }
  }, []);

  // GRANULAR UPDATE: Update only specific items that changed
  const applyGranularUpdate = useCallback(<T extends { id: string }>(
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    changes: { changed: T[], added: T[], removed: string[] }
  ) => {
    if (changes.changed.length === 0 && changes.added.length === 0 && changes.removed.length === 0) {
      return false; // No changes
    }
    
    setter(prev => {
      let updated = [...prev];
      
      // Apply changes (update existing items)
      if (changes.changed.length > 0) {
        const changedMap = new Map(changes.changed.map(item => [item.id, item]));
        updated = updated.map(item => changedMap.get(item.id) || item);
      }
      
      // Add new items
      if (changes.added.length > 0) {
        const existingIds = new Set(updated.map(item => item.id));
        const newItems = changes.added.filter(item => !existingIds.has(item.id));
        updated = [...updated, ...newItems];
      }
      
      // Remove deleted items
      if (changes.removed.length > 0) {
        const removedSet = new Set(changes.removed);
        updated = updated.filter(item => !removedSet.has(item.id));
      }
      
      return updated;
    });
    
    return true; // Changes applied
  }, []);

  // SMART DELTA SYNC: Fetch ALL visits/orders (no delta filter), fetch retailers by beat_id
  const smartDeltaSync = useCallback(async (uid: string, date: string) => {
    // Prevent concurrent syncs
    if (smartSyncLockRef.current || !navigator.onLine || !mountedRef.current) {
      return;
    }
    
    // SLOW CONNECTION CHECK: Skip network sync entirely on slow connections or manual slow mode
    // This prevents lag and ensures instant display from cache
    const connectionQuality = getConnectionQuality();
    const manualSlowMode = getManualSlowMode();
    
    if (isSlowConnection() || manualSlowMode) {
      console.log('[SmartSync] ⚡ Skipping sync - slow connection/mode detected:', {
        quality: connectionQuality,
        manualSlowMode,
        isSlowConnection: isSlowConnection()
      });
      return;
    }
    
    if (!shouldSyncNow(date)) {
      console.log('[SmartSync] Skipping - synced recently');
      return;
    }

    smartSyncLockRef.current = true;
    console.log('[SmartSync] Starting full sync for', date, '| Connection:', connectionQuality);

    try {
      // Reduce timeout for medium connections (5s), normal for fast (8s)
      const timeoutMs = connectionQuality === 'medium' ? 5000 : 8000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // FIX #1: ALWAYS fetch ALL visits and orders for the date (no delta filter)
      // This ensures unproductive visits are never missed due to stale delta timestamps
      const [bpRes, vRes, oRes, pointsFetched] = await Promise.all([
        supabase.from('beat_plans').select('*').eq('user_id', uid).eq('plan_date', date).abortSignal(controller.signal),
        supabase.from('visits').select('*').eq('user_id', uid).eq('planned_date', date).abortSignal(controller.signal),
        // Fetch own orders AND orders on own beats (beat owner sees all orders on their beats)
        supabase.from('orders').select('*, order_items!order_items_order_id_fkey(*)').eq('user_id', uid).eq('order_date', date).in('status', ['confirmed', 'delivered']).abortSignal(controller.signal),
        fetchPointsForDate(uid, date)
      ]);
      clearTimeout(timeoutId);

      if (!mountedRef.current || lastDateRef.current !== date || userIdRef.current !== uid) {
        smartSyncLockRef.current = false;
        return;
      }

      const newBeatPlans = bpRes.data || [];
      let newVisits: any[] = vRes.data || [];
      let newOrders: any[] = oRes.data || [];

      // === Teammate activity on shared beats ===
      // Surface visits/orders made by teammates (co-owner / operational / view-only
      // shares, or the original beat owner if the current user is a sharee) so the
      // user doesn't double-visit a retailer their teammate already covered today.
      try {
        // Union of beat sources for the day so both the beat owner AND a sharee
        // see teammate activity even when neither has a `beat_plans` row:
        //   - beat_plans / daily_beat_plans for the date
        //   - beats permanently owned by the user
        //   - beat_user_access shares active on the date (user is sharee)
        //   - beats referenced by any visit/order already fetched for the date
        const beatIdSet = new Set<string>();
        newBeatPlans.forEach((bp: any) => bp.beat_id && beatIdSet.add(bp.beat_id));
        try {
          const [dailyRes, ownedRes, shareRes] = await Promise.all([
            (supabase as any)
              .from('daily_beat_plans')
              .select('beat_id')
              .eq('assigned_user_id', uid)
              .eq('plan_date', date),
            supabase
              .from('beats')
              .select('beat_id')
              .eq('owner_id', uid)
              .eq('is_active', true),
            supabase
              .from('beat_user_access')
              .select('beat_id, effective_from, effective_to, is_active')
              .eq('user_id', uid)
              .eq('is_active', true)
              .lte('effective_from', `${date}T23:59:59.999Z`)
              .or(`effective_to.is.null,effective_to.gte.${date}T00:00:00.000Z`),
          ]);
          (dailyRes.data || []).forEach((r: any) => r.beat_id && beatIdSet.add(r.beat_id));
          (ownedRes.data || []).forEach((r: any) => r.beat_id && beatIdSet.add(r.beat_id));
          (shareRes.data || []).forEach((r: any) => r.beat_id && beatIdSet.add(r.beat_id));
        } catch (e) {
          console.warn('[SmartSync] Extra beat-source fetch failed (non-fatal):', e);
        }
        // Also include beats referenced by any already-fetched visit/order.
        newVisits.forEach((v: any) => v?.beat_id && beatIdSet.add(v.beat_id));
        newOrders.forEach((o: any) => o?.beat_id && beatIdSet.add(o.beat_id));

        const todayBeatIds: string[] = Array.from(beatIdSet);
        if (todayBeatIds.length > 0) {
          const teammates = await getBeatTeammates(uid, todayBeatIds, date);
          if (teammates.userIds.length > 0) {
            // Retailers belonging to the shared beats (RLS scopes results)
            const { data: sharedRetailers } = await supabase
              .from('retailers')
              .select('id, beat_id')
              .in('beat_id', todayBeatIds);
            const sharedRetailerIds = (sharedRetailers || []).map((r: any) => r.id);

            if (sharedRetailerIds.length > 0) {
              const [tvRes, toRes] = await Promise.all([
                supabase
                  .from('visits')
                  .select('*')
                  .eq('planned_date', date)
                  .in('user_id', teammates.userIds)
                  .in('retailer_id', sharedRetailerIds),
                supabase
                  .from('orders')
                  .select('*')
                  .eq('order_date', date)
                  .in('status', ['confirmed', 'delivered'])
                  .in('user_id', teammates.userIds)
                  .in('retailer_id', sharedRetailerIds),
              ]);

              const tagActor = (row: any) => ({
                ...row,
                _source: 'teammate',
                _actor: { user_id: row.user_id, name: teammates.names.get(row.user_id) || 'Teammate' },
              });

              const ownVisitIds = new Set(newVisits.map((v: any) => v.id));
              const ownOrderIds = new Set(newOrders.map((o: any) => o.id));
              const teammateVisits = (tvRes.data || [])
                .filter((v: any) => !ownVisitIds.has(v.id))
                .map(tagActor);
              const teammateOrders = (toRes.data || [])
                .filter((o: any) => !ownOrderIds.has(o.id))
                .map(tagActor);

              if (teammateVisits.length || teammateOrders.length) {
                console.log(
                  `[SmartSync] Teammate activity: +${teammateVisits.length} visits, +${teammateOrders.length} orders from ${teammates.userIds.length} teammate(s)`
                );
                newVisits = [...newVisits, ...teammateVisits];
                newOrders = [...newOrders, ...teammateOrders];
              }
            }
          }
        }
      } catch (e) {
        console.warn('[SmartSync] Teammate fetch failed (non-fatal):', e);
      }

      console.log(`[SmartSync] Fetched: ${newBeatPlans.length} beat plans, ${newVisits.length} visits, ${newOrders.length} orders, ${pointsFetched.total} points`);

      // FRESHNESS: network sync always wins over any cache/snapshot/offline path.
      markNetworkApplied(uid, date);

      // Update points state
      setPointsData(pointsFetched);

      // Get current state from cache
      const currentCache = cacheRef.current.get(date) || { beatPlans: [], visits: [], retailers: [], orders: [] };

      // GRANULAR COMPARISON
      let uiUpdated = false;

      // Update beat plans granularly
      const bpChanges = getChangedItems(currentCache.beatPlans || [], newBeatPlans);
      const beatPlansChanged = bpChanges.changed.length > 0 || bpChanges.added.length > 0 || bpChanges.removed.length > 0;
      
      // CRITICAL FIX: Track if beats themselves changed (not just content updates)
      const oldBeatIdsFromCache = (currentCache.beatPlans || []).map((bp: any) => bp.beat_id).sort().join(',');
      const newBeatIdsFromNetwork = newBeatPlans.map((bp: any) => bp.beat_id).sort().join(',');
      const beatsSelectionChanged = oldBeatIdsFromCache !== newBeatIdsFromNetwork;
      
      if (beatPlansChanged) {
        // When beat selection changes (beats added/removed), clear snapshot to force fresh load
        if (beatsSelectionChanged && uid) {
          console.log(`[SmartSync] Beat selection changed, clearing snapshot for ${date}`);
          clearMyVisitsSnapshot(uid, date).catch(e => console.error('Failed to clear snapshot:', e));
        }
        
        applyGranularUpdate(setBeatPlans, bpChanges);
        currentCache.beatPlans = newBeatPlans;
        uiUpdated = true;
      }

      // FIX: ALWAYS replace visits with network data - visits are the source of truth for status
      // This fixes the bug where unproductive visits marked yesterday night weren't showing
      const vChanges = getChangedItems(currentCache.visits, newVisits);
      const visitsChanged = vChanges.changed.length > 0 || vChanges.added.length > 0 || vChanges.removed.length > 0;
      
      // CRITICAL: Even if getChangedItems doesn't detect changes (due to hash issues),
      // ALWAYS replace visits if network data has different count - this catches missed updates
      const visitCountDifferent = currentCache.visits?.length !== newVisits.length;
      
      if (visitsChanged || visitCountDifferent) {
        // SAFETY: Never replace visits with an empty list if we had visits before,
        // unless the beat plans also cleared. Prevents transient empty fetches from
        // wiping the UI (fetch was partial / timeout / aborted).
        const hadVisits = (currentCache.visits || []).length > 0;
        const newVisitsEmpty = newVisits.length === 0;
        const beatsGenuinelyCleared = newBeatIdsFromNetwork === '' && oldBeatIdsFromCache !== '';
        if (newVisitsEmpty && hadVisits && !beatsGenuinelyCleared) {
          console.log(`[SmartSync] Skipping empty visits replacement (transient) old=${currentCache.visits?.length}`);
        } else {
          // FIX: Deep compare to avoid no-op replacements that cause re-renders
          const oldJson = JSON.stringify(currentCache.visits || []);
          const newJson = JSON.stringify(newVisits);
          if (oldJson !== newJson) {
            setVisits(newVisits);
            currentCache.visits = newVisits;
            uiUpdated = true;
            console.log(`[SmartSync] Visits REPLACED: ${currentCache.visits?.length || 0} → ${newVisits.length}`);
          } else {
            console.log('[SmartSync] Visits identical, skipping state update');
          }
        }
      }

      // Update orders granularly - ALWAYS compare full list
      // FIX: Preserve locally-cached orders that haven't synced to DB yet
      // These are orders saved to IndexedDB by offlineOrderUtils but not yet in Supabase
      const mergedOrders = [...newOrders];
      const dbOrderIds = new Set(newOrders.map(o => o.id));
      // Match already-synced local copies by their stable idempotency_key,
      // because the DB row's id differs from the local client UUID after sync.
      const dbIdemKeys = new Set(newOrders.map((o: any) => o.idempotency_key).filter(Boolean));

      // Check current state for locally-added orders not yet in DB
      const currentOrders = currentCache.orders || [];
      for (const localOrder of currentOrders) {
        const alreadyInDb =
          dbOrderIds.has(localOrder.id) ||
          (localOrder.idempotency_key && dbIdemKeys.has(localOrder.idempotency_key));
        if (!alreadyInDb &&
            localOrder.order_date === date &&
            localOrder.status === 'confirmed' &&
            localOrder.user_id === uid) {
          mergedOrders.push(localOrder);
          console.log('[SmartSync] Preserving unsynced local order:', localOrder.id, '₹' + localOrder.total_amount);
        }
      }

      // Safety net: collapse any residual duplicates by idempotency_key (fallback to id)
      const _seen = new Set<string>();
      const _deduped: any[] = [];
      for (const o of mergedOrders) {
        const k = (o as any).idempotency_key || o.id;
        if (_seen.has(k)) continue;
        _seen.add(k);
        _deduped.push(o);
      }

      const oChanges = getChangedItems(currentCache.orders, _deduped);
      if (oChanges.changed.length > 0 || oChanges.added.length > 0 || oChanges.removed.length > 0) {
        // SAFETY: Never replace orders with an empty list if we had orders before,
        // unless the beat plans also cleared. Prevents Total Order Value flashing ₹0.
        const hadOrders = (currentCache.orders || []).length > 0;
        const newOrdersEmpty = _deduped.length === 0;
        const beatsGenuinelyCleared = newBeatIdsFromNetwork === '' && oldBeatIdsFromCache !== '';
        if (newOrdersEmpty && hadOrders && !beatsGenuinelyCleared) {
          console.log(`[SmartSync] Skipping empty orders replacement (transient) old=${currentCache.orders?.length}`);
        } else {
          uiUpdated = applyGranularUpdate(setOrders, oChanges) || uiUpdated;
          currentCache.orders = _deduped;
        }
      }

      // FIX #2: ALWAYS fetch ALL retailers by beat_id (not just from visits/orders)
      // This ensures new retailers added to beats are always included
      const planBeatIds = newBeatPlans.map(bp => bp.beat_id);
      const visitRetailerIds = newVisits.map(v => v.retailer_id);
      const orderRetailerIds = newOrders.map(o => o.retailer_id);

      // Beats the user has PLANNED for today PLUS beats explicitly shared with the
      // user via an active `beat_user_access` grant covering today. An active dated
      // share is an intentional grant, so its retailers must load for the sharee —
      // otherwise Rep B (whom Rep A shared a beat with) sees an empty list while
      // Rep A still sees both sides.
      let sharedBeatIds: string[] = [];
      try {
        const { data: shareRows } = await supabase
          .from('beat_user_access')
          .select('beat_id')
          .eq('user_id', uid)
          .eq('is_active', true)
          .lte('effective_from', `${date}T23:59:59.999Z`)
          .or(`effective_to.is.null,effective_to.gte.${date}T00:00:00.000Z`);
        sharedBeatIds = (shareRows || [])
          .map((r: any) => r.beat_id)
          .filter(Boolean);
      } catch (e) {
        console.warn('[SmartSync] Shared-beat fetch failed (non-fatal):', e);
      }
      const beatIds = [...new Set([...planBeatIds, ...sharedBeatIds])];

      // Get explicit retailer IDs from beat_data
      const explicitRetailerIds: string[] = [];
      for (const bp of newBeatPlans) {
        const beatData = bp.beat_data as any;
        if (beatData?.retailer_ids?.length > 0) {
          explicitRetailerIds.push(...beatData.retailer_ids);
        }
      }
      
      // Combine all sources for retailer IDs
      const allRetailerIds = [...new Set([...visitRetailerIds, ...orderRetailerIds, ...explicitRetailerIds])];

      // Fetch retailers by beat_id AND by explicit IDs
      // FIX: Start fresh - don't keep old retailers from other beats/dates
      const retailerMap = new Map<string, any>();
      
      // Only keep offline-created retailers that match today's beats
      for (const r of currentCache.retailers) {
        if (r.id?.startsWith('offline_') && beatIds.includes(r.beat_id)) {
          retailerMap.set(r.id, r);
        }
      }
      
      // FIX: Drop user_id filter — shared/coverage beats have retailers owned by the
      // original beat owner. RLS still scopes results to what this user can access.
      if (beatIds.length > 0) {
        const { data: beatRetailers } = await supabase
          .from('retailers')
          .select('*')
          .in('beat_id', beatIds);
        if (beatRetailers) {
          for (const r of beatRetailers) {
            retailerMap.set(r.id, r);
          }
        }
      }

      if (allRetailerIds.length > 0) {
        const { data: explicitRetailers } = await supabase
          .from('retailers')
          .select('*')
          .in('id', allRetailerIds);
        if (explicitRetailers) {
          for (const r of explicitRetailers) {
            retailerMap.set(r.id, r);
          }
        }
      }

      // CRITICAL FIX: Always update retailers based on current beat plans
      // Even if retailerMap is empty (beat has no retailers), we must clear old retailers
      const allRetailers = Array.from(retailerMap.values());
      
      const rChanges = getChangedItems(currentCache.retailers || [], allRetailers);
      const retailersActuallyChanged = rChanges.changed.length > 0 || rChanges.added.length > 0 || rChanges.removed.length > 0;
      
      // FIX: Also detect if beats changed - if so, REPLACE retailers completely
      const oldBeatIds = (currentCache.beatPlans || []).map((bp: any) => bp.beat_id).sort().join(',');
      const newBeatIds = newBeatPlans.map((bp: any) => bp.beat_id).sort().join(',');
      const beatsChanged = oldBeatIds !== newBeatIds;
      
      if (retailersActuallyChanged || beatsChanged) {
        if (beatsChanged) {
          // SAFETY: Never replace retailers with an empty array if we had retailers before.
          // This prevents a race condition where a momentary empty beat_plans fetch
          // (e.g. network delay, timezone boundary) wipes all retailers from the UI.
          // Only do a full replacement if the new list is non-empty OR we have genuinely
          // cleared all beats (newBeatIds is also empty meaning user removed all plans).
          const hadRetailers = (currentCache.retailers || []).length > 0;
          const newListEmpty = allRetailers.length === 0;
          const beatsGenuinelyCleared = newBeatIds === '' && oldBeatIds !== '';
          
          if (newListEmpty && hadRetailers && !beatsGenuinelyCleared) {
            // Likely a race/transient empty fetch — skip to avoid flickering to 0
            console.log(`[SmartSync] Skipping empty retailer replacement (transient) old=${currentCache.retailers?.length}`);
          } else {
            console.log(`[SmartSync] Beats changed: "${oldBeatIds}" -> "${newBeatIds}", REPLACING retailers (${allRetailers.length})`);
            setRetailers(allRetailers);
            currentCache.retailers = allRetailers;
            uiUpdated = true;
          }
        } else {
          applyGranularUpdate(setRetailers, rChanges);
          currentCache.retailers = allRetailers;
          uiUpdated = true;
        }
        console.log(`[SmartSync] Retailers updated: ${allRetailers.length} total`);
      }

      // Update cache with timestamp and points
      currentCache.points = { total: pointsFetched.total, byRetailer: Array.from(pointsFetched.byRetailer.entries()) };
      currentCache.timestamp = Date.now();
      cacheRef.current.set(date, currentCache);

      // Save to offline storage (background, non-blocking).
      // PERSPECTIVE: strip _source/_actor before writing so the store never carries
      // teammate tags relative to another viewer (see stripPerspective).
      const persistVisits = stripPerspective(currentCache.visits);
      const persistOrders = stripPerspective(currentCache.orders);
      const persistOrdersForCache = (persistOrders || []).map((o: any) => ({
        ...o,
        items: o.items || o.order_items || [],
        sync_status: o.sync_status || 'synced',
      }));
      Promise.all([
        offlineStorage.mergeData(STORES.BEAT_PLANS, currentCache.beatPlans),
        offlineStorage.mergeData(STORES.VISITS, persistVisits),
        offlineStorage.mergeData(STORES.RETAILERS, currentCache.retailers),
        offlineStorage.mergeData(STORES.ORDERS, persistOrdersForCache)
      ]).catch(e => console.error('[SmartSync] Storage error:', e));

      // Save snapshot (background) - pass date to calculateStats for proper filtering
      // Include points for faster loading on next visit
      saveMyVisitsSnapshot(uid, date, {
        beatPlans: currentCache.beatPlans,
        visits: persistVisits,
        retailers: currentCache.retailers,
        orders: persistOrders,
        progressStats: calculateStats(currentCache.visits, currentCache.orders, currentCache.retailers, date),
        currentBeatName: currentCache.beatPlans.map((p: any) => p.beat_name).join(', '),
        pointsTotal: pointsFetched.total,
        pointsByRetailer: Array.from(pointsFetched.byRetailer.entries())
      }).catch(e => console.error('[SmartSync] Snapshot error:', e));

      // Update sync timestamp
      lastSyncTimeRef.current.set(date, Date.now());
      await offlineStorage.setSyncMetadata('visits', uid, date);
      
      console.log(`[SmartSync] Complete - UI updated: ${uiUpdated}`);

    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.log('[SmartSync] Timeout - continuing with cached data');
      } else {
        console.error('[SmartSync] Error:', e);
      }
    } finally {
      smartSyncLockRef.current = false;
    }
  }, [shouldSyncNow, applyGranularUpdate, markNetworkApplied]);

  // INITIAL LOAD: Local-first, instant display
  const loadData = useCallback(async () => {
    if (!effectiveUserId || !selectedDate) {
      // Don't leave isLoading stuck -- userId will arrive and re-trigger via loadData dependency
      // Don't set isLoading=false here; the safety guard (which only starts when userId is present) handles it
      return;
    }
    if (isFetchingRef.current && lastDateRef.current === selectedDate) return;
    
    // CRITICAL FIX: If date changed, immediately clear visits/orders to prevent
    // showing stale data from previous date while new data loads
    const dateChanged = lastDateRef.current !== '' && lastDateRef.current !== selectedDate;
    if (dateChanged) {
      console.log('[LoadData] Date changed from', lastDateRef.current, 'to', selectedDate, '- clearing stale data');
      // Filter existing state to only keep items matching new date
      setVisits(prev => prev.filter(v => v.planned_date === selectedDate));
      setOrders(prev => prev.filter(o => o.order_date === selectedDate));
    }
    
    isFetchingRef.current = true;
    lastDateRef.current = selectedDate;

    // FIX #3: Cache staleness check - for today, if cache is old, force full sync
    const MAX_CACHE_AGE_MS = 30 * 60 * 1000; // 30 minutes
    const isTodayDate = isToday(selectedDate);

    // CRITICAL FIX: Check for changes made on other pages while this component was unmounted
    // If changes were detected, invalidate the in-memory cache to force fresh snapshot load
    const changeMarker = await getLastChangeTimestamp();
    if (changeMarker && changeMarker.date === selectedDate) {
      const cached = cacheRef.current.get(selectedDate);
      if (cached && changeMarker.timestamp > (cached.timestamp || 0)) {
        console.log('[LoadData] 🔄 Change detected while unmounted, invalidating cache for', selectedDate);
        cacheRef.current.delete(selectedDate);
        await clearChangeMarker();
      }
    }

    // 1. Try in-memory cache FIRST (instant)
    const cached = cacheRef.current.get(selectedDate);
    // Check for ANY valid data (beat plans, retailers, visits, or orders)
    const hasValidCachedData = cached && (
      cached.beatPlans?.length > 0 || 
      cached.retailers?.length > 0 || 
      cached.visits?.length > 0 || 
      cached.orders?.length > 0
    );
    
    // CRITICAL FIX: Validate that cached visits actually match the selected date
    // This prevents stale data from wrong dates contaminating the display
    const cachedVisitsMatchDate = cached?.visits?.length
      ? cached.visits.every((v: any) => v.planned_date === selectedDate)
      : true;
    const cachedOrdersMatchDate = cached?.orders?.length
      ? cached.orders.every((o: any) => o.order_date === selectedDate)
      : true;
    const isCacheDataValid = cachedVisitsMatchDate && cachedOrdersMatchDate;
    
    if (!isCacheDataValid && cached) {
      console.warn('[LoadData] ⚠️ In-memory cache has mismatched dates, clearing cache for', selectedDate);
      cacheRef.current.delete(selectedDate);
    }
    
    // Check if cache is stale (for today only)
    const cacheAge = cached?.timestamp ? Date.now() - cached.timestamp : Infinity;
    const isCacheStale = isTodayDate && cacheAge > MAX_CACHE_AGE_MS;
    
    if (hasValidCachedData && isCacheDataValid) {
      // FRESHNESS: only apply if newer than what's been applied for this user+date.
      const producedAt = cached?.timestamp || Date.now();
      if (isFresh(effectiveUserId, selectedDate, producedAt)) {
        // Retag cached rows in case they came from another user's perspective.
        const cachedVisits = retagPerspective(cached.visits || [], effectiveUserId);
        const cachedOrders = retagPerspective(cached.orders || [], effectiveUserId);

        // MERGE locally-created offline retailers into the in-memory fast path.
        // The snapshot/offline branches already merge via loadFromOfflineStorage, but
        // this Priority-1 warm-cache path applied cached.retailers verbatim, so a
        // retailer added offline (still pending sync) was invisible in My Visits.
        // Only add offline retailers that (a) aren't already present and (b) belong
        // to a beat that's part of today's cached beat plans.
        const offlineData = await loadFromOfflineStorage(effectiveUserId, selectedDate);
        const cachedBeatIds = new Set((cached.beatPlans || []).map((bp: any) => bp.beat_id));
        let mergedRetailers = cached.retailers || [];
        if (offlineData?.retailers?.length) {
          const existingIds = new Set(mergedRetailers.map((r: any) => r.id));
          const extra = offlineData.retailers.filter((r: any) => !existingIds.has(r.id) && cachedBeatIds.has(r.beat_id));
          if (extra.length) { mergedRetailers = [...mergedRetailers, ...extra]; }
        }
        // Persist the merged list back so the warm module cache doesn't re-serve the
        // stale (offline-retailer-less) list on the next mount for this user+date.
        if (mergedRetailers !== (cached.retailers || [])) {
          cacheRef.current.set(selectedDate, { ...cached, retailers: mergedRetailers });
        }

        // FIX: Batch all state updates to prevent intermediate empty renders
        React.startTransition(() => {
          setBeatPlans(cached.beatPlans || []);
          setVisits(cachedVisits);
          setRetailers(mergedRetailers);
          setOrders(cachedOrders);
          if (cached.points) {
            setPointsData({
              total: cached.points.total,
              byRetailer: normalizeByRetailerEntries(cached.points.byRetailer),
            });
          }
          setIsLoading(false);
          setHasLoadedOnce(true);
        });
      } else {
        console.log('[LoadData] Skipping in-memory cache apply — newer data already applied');
        setIsLoading(false);
        setHasLoadedOnce(true);
      }
      
      // Background smart sync - force if cache is stale
      // SLOW CONNECTION CHECK: Skip background sync entirely on slow connections
      const slowConnection = isSlowConnection();
      if (!slowConnection && navigator.onLine && (isCacheStale || (isTodayDate && shouldSyncNow(selectedDate)))) {
        console.log('[LoadData] Triggering sync - cache stale:', isCacheStale);
        requestIdleCallback?.(() => smartDeltaSync(effectiveUserId, selectedDate)) ||
          setTimeout(() => smartDeltaSync(effectiveUserId, selectedDate), 100);
      } else if (slowConnection) {
        console.log('[LoadData] ⚡ Skipping background sync - slow connection, using cache');
      }
      isFetchingRef.current = false;
      return;
    }

    // 2. Try persistent snapshot (fast)
    try {
      const snapshot = await loadMyVisitsSnapshot(effectiveUserId, selectedDate);
      
      // CRITICAL FIX: Validate snapshot data matches the selectedDate
      // This prevents stale visits from other dates contaminating the current view
      const snapshotVisitsMatchDate = snapshot?.visits?.length 
        ? snapshot.visits.every((v: any) => v.planned_date === selectedDate)
        : true; // No visits = passes check
      
      const snapshotOrdersMatchDate = snapshot?.orders?.length
        ? snapshot.orders.every((o: any) => o.order_date === selectedDate)
        : true; // No orders = passes check
        
      const isSnapshotValid = snapshotVisitsMatchDate && snapshotOrdersMatchDate;
      
      if (!isSnapshotValid && snapshot) {
        console.warn('[LoadData] ⚠️ Snapshot has mismatched dates, ignoring snapshot data');
        console.log('[LoadData] Expected date:', selectedDate);
        console.log('[LoadData] Sample visit dates:', snapshot.visits?.slice(0, 3).map((v: any) => v.planned_date));
      }
      
      // Check for ANY valid data (beat plans, retailers, visits, or orders)
      const hasValidSnapshotData = isSnapshotValid && snapshot && (
        snapshot.beatPlans?.length > 0 || 
        snapshot.retailers?.length > 0 || 
        snapshot.visits?.length > 0 || 
        snapshot.orders?.length > 0
      );
      if (hasValidSnapshotData) {
        // CRITICAL FIX: Filter snapshot retailers to ONLY those matching snapshot's beat plans
        // This prevents stale retailers from removed beats appearing in the UI
        const snapshotBeatIds = (snapshot.beatPlans || []).map((bp: any) => bp.beat_id);
        const snapshotVisitRetailerIds = new Set((snapshot.visits || []).map((v: any) => v.retailer_id));
        
        // Filter retailers to those from current beat plans OR with visits today OR from shared beats
        // Include all retailers where user has beat access (not just owned beats)
        const filteredSnapshotRetailers = (snapshot.retailers || []).filter((r: any) => 
          snapshotBeatIds.includes(r.beat_id) || snapshotVisitRetailerIds.has(r.id)
        );
        // If snapshot has retailers but none match beat plans (shared beat scenario),
        // keep all snapshot retailers to avoid clearing shared-beat retailers
        const keepAll = filteredSnapshotRetailers.length === 0 && (snapshot.retailers || []).length > 0 && snapshotBeatIds.length > 0;
        const snapshotRetailersToUse = keepAll ? (snapshot.retailers || []) : filteredSnapshotRetailers;
        
        if (snapshotRetailersToUse.length !== (snapshot.retailers || []).length) {
          console.log(`[LoadData] Filtered snapshot retailers: ${snapshot.retailers?.length || 0} -> ${filteredSnapshotRetailers.length} (matching beat plans)`);
        }
        
        // FIX: Also check offline storage for NEW retailers that might not be in snapshot
        const offlineData = await loadFromOfflineStorage(effectiveUserId, selectedDate);
        
        // Merge: Add any offline retailers not in snapshot (only if they match beat plans)
        let mergedRetailers = [...snapshotRetailersToUse];
        if (offlineData?.retailers?.length) {
          const snapshotRetailerIds = new Set(mergedRetailers.map(r => r.id));
          const newRetailers = offlineData.retailers.filter(r => 
            !snapshotRetailerIds.has(r.id) && snapshotBeatIds.includes(r.beat_id)
          );
          if (newRetailers.length > 0) {
            mergedRetailers = [...mergedRetailers, ...newRetailers];
            console.log('[LoadData] Merged', newRetailers.length, 'new retailers from offline storage');
          }
        }
        
        // FIX: Also merge offline orders not yet in snapshot (handles race condition
        // where order is saved to IndexedDB but snapshot hasn't been updated yet)
        let mergedOrders = [...(snapshot.orders || [])];
        if (offlineData?.orders?.length) {
          const snapshotOrderIds = new Set(mergedOrders.map(o => o.id));
          const newOfflineOrders = offlineData.orders.filter(o => !snapshotOrderIds.has(o.id));
          if (newOfflineOrders.length > 0) {
            mergedOrders = [...mergedOrders, ...newOfflineOrders];
            console.log('[LoadData] Merged', newOfflineOrders.length, 'new orders from offline storage into snapshot');
          }
        }
        
        // Also merge visits from offline storage that may not be in snapshot
        let mergedVisits = [...(snapshot.visits || [])];
        if (offlineData?.visits?.length) {
          const snapshotVisitIds = new Set(mergedVisits.map(v => v.id));
          const newOfflineVisits = offlineData.visits.filter(v => !snapshotVisitIds.has(v.id));
          if (newOfflineVisits.length > 0) {
            mergedVisits = [...mergedVisits, ...newOfflineVisits];
            console.log('[LoadData] Merged', newOfflineVisits.length, 'new visits from offline storage into snapshot');
          }
        }
        
        // PERSPECTIVE: snapshot rows are user-agnostic — retag against current user.
        mergedVisits = retagPerspective(mergedVisits, effectiveUserId);
        mergedOrders = retagPerspective(mergedOrders, effectiveUserId);

        // FRESHNESS: skip if network sync already applied newer data.
        const snapshotStamp = (snapshot as any).timestamp || Date.now();
        if (isFresh(effectiveUserId, selectedDate, snapshotStamp)) {
          setBeatPlans(snapshot.beatPlans || []);
          setVisits(mergedVisits);
          setRetailers(mergedRetailers);
          setOrders(mergedOrders);

          // FIX: Load points from snapshot for instant display
          if (snapshot.pointsTotal !== undefined || snapshot.pointsByRetailer) {
            const normalizedByRetailer = normalizeByRetailerEntries(snapshot.pointsByRetailer);
            const pointsFromSnapshot: PointsData = {
              total: snapshot.pointsTotal || 0,
              byRetailer: normalizedByRetailer,
            };
            setPointsData(pointsFromSnapshot);
            console.log('[LoadData] Loaded points from snapshot:', pointsFromSnapshot.total);
          }
        } else {
          console.log('[LoadData] Skipping snapshot apply — newer data already applied');
        }

        
        setIsLoading(false);
        setHasLoadedOnce(true);
        
        // Update cache with merged data
        cacheRef.current.set(selectedDate, { 
          ...snapshot, 
          retailers: mergedRetailers,
          visits: mergedVisits,
          orders: mergedOrders,
          points: snapshot.pointsByRetailer ? { total: snapshot.pointsTotal || 0, byRetailer: snapshot.pointsByRetailer } : undefined,
          timestamp: Date.now() 
        });
        
        // CRITICAL FIX: Sync after loading snapshot for ANY date (not just today)
        const slowConnection = isSlowConnection();
        if (slowConnection) {
          console.log('[LoadData] ⚡ Using snapshot only - slow connection detected');
        } else if (navigator.onLine && isToday(selectedDate)) {
          // Skip throttle check for today - visit status must always be fresh
          requestIdleCallback?.(() => smartDeltaSync(effectiveUserId, selectedDate)) || 
            setTimeout(() => smartDeltaSync(effectiveUserId, selectedDate), 50);
        } else if (navigator.onLine && shouldSyncNow(selectedDate)) {
          // Also sync for historical dates when throttle allows
          requestIdleCallback?.(() => smartDeltaSync(effectiveUserId, selectedDate)) || 
            setTimeout(() => smartDeltaSync(effectiveUserId, selectedDate), 100);
        }
        isFetchingRef.current = false;
        return;
      }
    } catch (e) {
      // Continue to offline storage
    }

    // 3. Try offline storage
    const offlineData = await loadFromOfflineStorage(effectiveUserId, selectedDate);
    // Check for ANY valid offline data (beat plans, retailers, visits, or orders)
    const hasValidOfflineData = offlineData && (
      offlineData.beatPlans.length > 0 || 
      offlineData.retailers.length > 0 || 
      offlineData.visits.length > 0 || 
      offlineData.orders.length > 0
    );
    if (hasValidOfflineData) {
      const offlineStamp = Date.now();
      if (isFresh(effectiveUserId, selectedDate, offlineStamp)) {
        setBeatPlans(offlineData.beatPlans);
        setVisits(offlineData.visits);
        setRetailers(offlineData.retailers);
        setOrders(offlineData.orders);
      } else {
        console.log('[LoadData] Skipping offline apply — newer data already applied');
      }
      setIsLoading(false);
      setHasLoadedOnce(true);
      
      cacheRef.current.set(selectedDate, { ...offlineData, timestamp: offlineStamp });
      
      // SLOW NETWORK FIX: Check connection quality before triggering sync
      const slowConn = isSlowConnection();
      if (slowConn) {
        console.log('[LoadData] ⚡ Using offline data only - slow connection detected');
      } else if (navigator.onLine) {
        // FIX: Immediately fetch points for the selected date (not just today)
        fetchPointsForDate(effectiveUserId, selectedDate)
          .then((pointsFetched) => {
            if (mountedRef.current && lastDateRef.current === selectedDate && userIdRef.current === effectiveUserId) {
              setPointsData(pointsFetched);
              console.log('[LoadData] Fetched points for', selectedDate, ':', pointsFetched.total);
            }
          })
          .catch((e) => console.warn('[LoadData] Points fetch failed:', e));
        
        // Background sync for other data
        if (isToday(selectedDate)) {
          // Skip throttle check for today - visit status must always be fresh
          requestIdleCallback?.(() => smartDeltaSync(effectiveUserId, selectedDate)) || 
            setTimeout(() => smartDeltaSync(effectiveUserId, selectedDate), 50);
        } else if (shouldSyncNow(selectedDate)) {
          requestIdleCallback?.(() => smartDeltaSync(effectiveUserId, selectedDate)) || 
            setTimeout(() => smartDeltaSync(effectiveUserId, selectedDate), 100);
        }
      }
      isFetchingRef.current = false;
      return;
    }

    // 4. No local data - do initial full load from network
    // IMPORTANT: even on slow connections, attempt at least one network load
    // so hierarchy view does not appear empty for subordinates.
    if (navigator.onLine) {
      try {
        setIsLoading(true);
        await doFullInitialLoad(effectiveUserId, selectedDate);
      } finally {
        setIsLoading(false);
        setHasLoadedOnce(true);
      }
    } else {
      // No cache and offline - show empty state
      setIsLoading(false);
      setHasLoadedOnce(true);
    }

    isFetchingRef.current = false;
  }, [effectiveUserId, selectedDate, isToday, loadFromOfflineStorage, smartDeltaSync, shouldSyncNow]);

  // Full initial load - only used when no local data exists
  const doFullInitialLoad = useCallback(async (uid: string, date: string) => {
    // SLOW NETWORK FIX: Skip if slow connection detected mid-load
    if (isSlowConnection() || getManualSlowMode()) {
      console.log('[FullLoad] ⚡ Skipping - slow connection detected');
      return;
    }
    
    try {
      // SLOW NETWORK FIX: Add timeout to prevent hanging on slow networks
      const timeoutMs = 10000; // 10 second timeout for initial load
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const [bpRes, vRes, oRes, pointsFetched] = await Promise.all([
        supabase.from('beat_plans').select('*').eq('user_id', uid).eq('plan_date', date).abortSignal(controller.signal),
        supabase.from('visits').select('*').eq('user_id', uid).eq('planned_date', date).abortSignal(controller.signal),
        // FIX #1 (unify with smartDeltaSync): fetch OWN orders only. Teammate
        // activity is fetched below via fetchTeammateActivity and tagged with _source.
        supabase.from('orders').select('*, order_items!order_items_order_id_fkey(*)').eq('user_id', uid).eq('order_date', date).in('status', ['confirmed', 'delivered']).abortSignal(controller.signal),
        fetchPointsForDate(uid, date)
      ]);
      clearTimeout(timeoutId);

      const beatPlansData = bpRes.data || [];
      let visitsData: any[] = vRes.data || [];
      let ordersData: any[] = oRes.data || [];

      // === Teammate activity on shared beats (identical shape to smartDeltaSync) ===
      try {
        const seedBeatIds = new Set<string>();
        beatPlansData.forEach((bp: any) => bp.beat_id && seedBeatIds.add(bp.beat_id));
        visitsData.forEach((v: any) => v?.beat_id && seedBeatIds.add(v.beat_id));
        ordersData.forEach((o: any) => o?.beat_id && seedBeatIds.add(o.beat_id));

        const ownVisitIds = new Set(visitsData.map((v: any) => v.id));
        const ownOrderIds = new Set(ordersData.map((o: any) => o.id));
        const teamActivity = await fetchTeammateActivity(uid, date, seedBeatIds, ownVisitIds, ownOrderIds);
        if (teamActivity.visits.length || teamActivity.orders.length) {
          console.log(`[FullLoad] Teammate activity: +${teamActivity.visits.length} visits, +${teamActivity.orders.length} orders`);
          visitsData = [...visitsData, ...teamActivity.visits];
          ordersData = [...ordersData, ...teamActivity.orders];
        }
      } catch (e) {
        console.warn('[FullLoad] Teammate fetch failed (non-fatal):', e);
      }

      // Get retailer IDs
      const beatIds = beatPlansData.map(bp => bp.beat_id);
      const visitRetailerIds = visitsData.map(v => v.retailer_id);
      const orderRetailerIds = ordersData.map(o => o.retailer_id);
      
      const explicitRetailerIds: string[] = [];
      for (const bp of beatPlansData) {
        const beatData = bp.beat_data as any;
        if (beatData?.retailer_ids?.length > 0) {
          explicitRetailerIds.push(...beatData.retailer_ids);
        }
      }

      let allRetailerIds = [...new Set([...visitRetailerIds, ...orderRetailerIds, ...explicitRetailerIds])];

      if (beatIds.length > 0) {
        // FIX: Drop user_id filter — RLS user_has_beat_access() handles shared beats.
        const { data: beatRetailers } = await supabase
          .from('retailers')
          .select('id')
          .in('beat_id', beatIds);
        if (beatRetailers) {
          allRetailerIds = [...new Set([...allRetailerIds, ...beatRetailers.map(r => r.id)])];
        }
      }

      let retailersData: any[] = [];
      if (allRetailerIds.length > 0) {
        // FIX: Drop user_id filter — RLS enforces correct access for shared beats.
        const { data } = await supabase
          .from('retailers')
          .select('*')
          .in('id', allRetailerIds);
        retailersData = data || [];
      }

      if (!mountedRef.current || lastDateRef.current !== date || userIdRef.current !== uid) return;

      // FIX #1: Merge unsynced local orders with DB orders (local-first)
      let mergedOrders = ordersData;
      try {
        const localOrders = await offlineStorage.getAll<any>(STORES.ORDERS);
        const dbIds = new Set(ordersData.map((o: any) => o.id));
        const dbIdemKeys = new Set(ordersData.filter((o: any) => o.idempotency_key).map((o: any) => o.idempotency_key));
        const unsyncedLocal = localOrders.filter((o: any) => 
          o.user_id === uid && 
          o.order_date === date && 
          o.status === 'confirmed' &&
          !dbIds.has(o.id) &&
          !(o.idempotency_key && dbIdemKeys.has(o.idempotency_key))
        );
        if (unsyncedLocal.length > 0) {
          // Mark local orders with sync status
          const localWithStatus = unsyncedLocal.map((o: any) => ({ ...o, _syncStatus: 'pending' }));
          mergedOrders = [...ordersData.map((o: any) => (o._source ? o : { ...o, _syncStatus: 'synced' })), ...localWithStatus];
          console.log(`[FullLoad] Merged ${unsyncedLocal.length} unsynced local orders with ${ordersData.length} DB orders`);
        }
      } catch (e) {
        console.warn('[FullLoad] Error merging local orders:', e);
      }

      // FRESHNESS: network sync always wins.
      markNetworkApplied(uid, date);

      // Set state (visits/orders keep their _source tag for progressStats)
      setBeatPlans(beatPlansData);
      setVisits(visitsData);
      setRetailers(retailersData);
      setOrders(mergedOrders);
      setPointsData(pointsFetched);

      // Update cache with timestamp for staleness check
      const cacheData = {
        beatPlans: beatPlansData,
        visits: visitsData,
        retailers: retailersData,
        orders: mergedOrders,
        points: { total: pointsFetched.total, byRetailer: Array.from(pointsFetched.byRetailer.entries()) },
        timestamp: Date.now()
      };
      cacheRef.current.set(date, cacheData);
      
      // MEMORY: Prune old date caches to prevent unbounded growth
      pruneDateCache();

      // PERSPECTIVE: never persist teammate tags — they are per-viewer.
      const persistVisits = stripPerspective(visitsData);
      const persistOrders = stripPerspective(mergedOrders);

      const persistOrdersForCache = (persistOrders || []).map((o: any) => ({
        ...o,
        items: o.items || o.order_items || [],
        sync_status: o.sync_status || 'synced',
      }));
      await Promise.all([
        offlineStorage.mergeData(STORES.BEAT_PLANS, beatPlansData),
        offlineStorage.mergeData(STORES.VISITS, persistVisits),
        offlineStorage.mergeData(STORES.RETAILERS, retailersData),
        offlineStorage.mergeData(STORES.ORDERS, persistOrdersForCache)
      ]);

      // Save snapshot - include points for faster loading
      await saveMyVisitsSnapshot(uid, date, {
        beatPlans: beatPlansData,
        visits: persistVisits,
        retailers: retailersData,
        orders: persistOrders,
        progressStats: calculateStats(visitsData, mergedOrders, retailersData, date),
        currentBeatName: beatPlansData.map(p => p.beat_name).join(', '),
        pointsTotal: pointsFetched.total,
        pointsByRetailer: Array.from(pointsFetched.byRetailer.entries())
      });

      // Update sync timestamp
      lastSyncTimeRef.current.set(date, Date.now());
      await offlineStorage.setSyncMetadata('visits', uid, date);

    } catch (e) {
      console.error('[FullLoad] Error:', e);
    }
  }, [markNetworkApplied]);

  // Invalidate cache for date and reload from local
  const invalidateData = useCallback(async () => {
    cacheRef.current.delete(selectedDate);
    lastSyncTimeRef.current.delete(selectedDate);
    isFetchingRef.current = false;
    
    // ALWAYS verify with DB before clearing state.
    // invalidateData is called from many places (points modal close, auto-plan, etc.)
    // If we clear state based on stale offline storage, we get the "flash to 0" bug.
    if (effectiveUserId) {
      // First check DB directly - do NOT trust offline storage alone
      let dbHasPlans = false;
      try {
        const { data: dbPlans } = await supabase
          .from('beat_plans')
          .select('beat_id')
          .eq('user_id', effectiveUserId)
          .eq('plan_date', selectedDate)
          .limit(1);
        dbHasPlans = !!(dbPlans && dbPlans.length > 0);
      } catch (e) {
        console.warn('[InvalidateData] DB plan check failed, keeping current state');
        // On error, keep current state — do not clear
        return;
      }

      if (dbHasPlans) {
        // User has plans in DB — just trigger a smart sync, don't clear anything
        console.log('[InvalidateData] DB has plans for today — triggering sync without clearing');
        // Force smart sync by resetting last sync time
        lastSyncTimeRef.current.delete(selectedDate);
        return;
      }

      // No plans in DB — check shared beats before clearing
      const offlineData = await loadFromOfflineStorage(effectiveUserId, selectedDate);
      let hasSharedBeats = false;
      try {
        const { data: sharedBeats } = await supabase
          .from('beat_user_access')
          .select('beat_id')
          .eq('user_id', effectiveUserId)
          .eq('is_active', true)
          .limit(1);
        hasSharedBeats = !!(sharedBeats && sharedBeats.length > 0);
      } catch (e) {
        console.warn('[InvalidateData] shared beat check failed', e);
      }

      if (!hasSharedBeats) {
        console.log('[InvalidateData] No beat plans and no shared beats - clearing all data for date:', selectedDate);
        setBeatPlans([]);
        setVisits([]);
        setRetailers([]);
        setOrders([]);
        cacheRef.current.set(selectedDate, { beatPlans: [], visits: [], retailers: [], orders: [] });
      } else {
        // Has shared beats — keep retailers, just clear beat plans
        console.log('[InvalidateData] No own plans but shared beats exist - keeping retailers');
        setBeatPlans([]);
      }
      return;
    }

    // Legacy path — load from offline storage
    if (effectiveUserId) {
      const offlineData = await loadFromOfflineStorage(effectiveUserId, selectedDate);
      if (offlineData && offlineData.beatPlans.length === 0) {
        // Already handled above
      } else if (offlineData) {
        setBeatPlans(offlineData.beatPlans);
        setVisits(offlineData.visits);
        setRetailers(offlineData.retailers);
        setOrders(offlineData.orders);
        cacheRef.current.set(selectedDate, offlineData);
      }
      
      // SLOW NETWORK FIX: Only trigger background sync if connection is good
      const slowConn = isSlowConnection() || getManualSlowMode();
      if (navigator.onLine && !slowConn) {
        smartDeltaSync(effectiveUserId, selectedDate);
      } else if (slowConn) {
        console.log('[InvalidateData] ⚡ Skipping sync - slow connection, using local data');
      }
    }
  }, [selectedDate, effectiveUserId, loadFromOfflineStorage, smartDeltaSync]);

  // Load on mount and date change
  useEffect(() => {
    mountedRef.current = true;
    
    // FIX: Only reset loading state if no cached data exists for this date
    // This prevents a 1-frame flicker when switching dates with cached data
    const hasCachedData = cacheRef.current.has(selectedDate) && cacheRef.current.get(selectedDate)?.retailers?.length > 0;
    if (!hasCachedData) {
      setIsLoading(true);
      setHasLoadedOnce(false);
    }
    
    loadData();

    // CHANGE 4: Smart safety guard - only start timer when userId is available
    // Reduced to 10s since network timeouts are 8-10s and AbortSignals now actually cancel requests
    let safetyTimer: ReturnType<typeof setTimeout> | undefined;
    if (effectiveUserId) {
      safetyTimer = setTimeout(() => {
        if (mountedRef.current && isLoading && !hasLoadedOnce) {
          console.warn('[SafetyGuard] Loading stuck for 10s (userId present), forcing completion');
          setIsLoading(false);
          setHasLoadedOnce(true);
        }
      }, 10000);
    }
    // If effectiveUserId is undefined, NO safety timer runs — loadData will re-trigger when userId resolves

    // IMPORTANT: In React 18 StrictMode (dev), effects mount/unmount twice.
    // Reset in-flight flags on cleanup so the second mount can fetch data.
    return () => {
      mountedRef.current = false;
      isFetchingRef.current = false;
      smartSyncLockRef.current = false;
      if (safetyTimer) clearTimeout(safetyTimer);
    };
  }, [loadData, effectiveUserId]);

  // LOCAL-FIRST EVENT HANDLING: Update state directly without network
  useEffect(() => {
    const handleStatusChange = (event: CustomEvent) => {
      const { visitId, status, retailerId, order, orderValue, noOrderReason } = event.detail || {};
      if (!visitId && !retailerId) return;
      
      // STALE CLOSURE FIX: Use refs for current values
      const currentUserId = userIdRef.current;
      const currentDate = selectedDateRef.current;
      
      console.log('[LocalEvent] Status change:', { visitId, status, retailerId, noOrderReason, orderValue, hasOrder: !!order, currentDate });
      
      // Update visits state directly - NO NETWORK CALL
      setVisits(prev => {
        const existingVisit = prev.find(v => 
          (visitId && v.id === visitId) || (retailerId && v.retailer_id === retailerId)
        );
        
        let updated;
        if (existingVisit) {
          updated = prev.map(v => {
            if ((visitId && v.id === visitId) || (retailerId && v.retailer_id === retailerId)) {
              return { 
                ...v, 
                status: status || v.status,
                no_order_reason: noOrderReason || v.no_order_reason,
                updated_at: new Date().toISOString()
              };
            }
            return v;
          });
          console.log('[LocalEvent] Updated existing visit:', { visitId, status, noOrderReason });
        } else if (retailerId && status) {
          const newVisit = {
            id: visitId || `temp_${retailerId}_${Date.now()}`,
            retailer_id: retailerId,
            user_id: currentUserId,
            planned_date: currentDate,
            status,
            no_order_reason: noOrderReason,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          updated = [...prev, newVisit];
          console.log('[LocalEvent] Created new visit:', newVisit);
        } else {
          updated = prev;
        }
        
        // Update cache using ref value
        const cached = cacheRef.current.get(currentDate) || {
          beatPlans: [],
          visits: [],
          retailers: [],
          orders: []
        };
        const updatedCache = { ...cached, visits: updated, timestamp: Date.now() };
        cacheRef.current.set(currentDate, updatedCache);
        
        // Persist to offline storage (background)
        updated.forEach(v => {
          if ((visitId && v.id === visitId) || (retailerId && v.retailer_id === retailerId)) {
            offlineStorage.save(STORES.VISITS, v).catch(() => {});
          }
        });
        
        // FIX #4: Save snapshot for persistence across app restarts
        if (currentUserId) {
          saveMyVisitsSnapshot(currentUserId, currentDate, {
            beatPlans: updatedCache.beatPlans,
            visits: updated,
            retailers: updatedCache.retailers,
            orders: updatedCache.orders,
            progressStats: calculateStats(updated, updatedCache.orders, updatedCache.retailers, currentDate),
            currentBeatName: updatedCache.beatPlans?.map((p: any) => p.beat_name).join(', ') || ''
          }).catch(() => {});
        }
        
        return updated;
      });

      // FIX: Handle order data - either from order object or create from orderValue
      // Ensure all required fields are present for proper state updates
      const orderToProcess = order && order.id ? {
        ...order,
        retailer_id: order.retailer_id || retailerId,
        user_id: order.user_id || currentUserId,
        total_amount: Number(order.total_amount) || 0,
        order_date: order.order_date || currentDate,
        status: order.status || 'confirmed',
        visit_id: order.visit_id || visitId,
        created_at: order.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      } : (orderValue && retailerId && status === 'productive' ? {
        id: `order_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        retailer_id: retailerId,
        user_id: currentUserId,
        total_amount: Number(orderValue) || 0,
        order_date: currentDate,
        status: 'confirmed',
        visit_id: visitId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      } : null);
      
      if (orderToProcess && orderToProcess.total_amount > 0) {
        setOrders(prev => {
          // FIX #2: Deduplicate by ID or idempotency_key only (NOT retailer+amount)
          const orderWithStatus = { ...orderToProcess, _syncStatus: 'pending' };
          
          // Check for existing order by ID
          const existingById = prev.find(o => o.id === orderToProcess.id);
          // Check by idempotency_key if available
          const existingByKey = orderToProcess.idempotency_key 
            ? prev.find(o => o.idempotency_key === orderToProcess.idempotency_key)
            : null;
          
          let updated;
          
          if (existingById) {
            updated = prev.map(o => o.id === orderToProcess.id ? orderWithStatus : o);
            console.log('[LocalEvent] Updated existing order by ID:', orderToProcess.id);
          } else if (existingByKey) {
            updated = prev.map(o => o.idempotency_key === orderToProcess.idempotency_key ? orderWithStatus : o);
            console.log('[LocalEvent] Updated existing order by idempotency_key');
          } else {
            // Add new order — allows multiple orders for the same retailer
            updated = [...prev, orderWithStatus];
            console.log('[LocalEvent] Added new order:', orderToProcess.id);
          }
          
          // Update cache using ref value
          const cached = cacheRef.current.get(currentDate) || {
            beatPlans: [],
            visits: [],
            retailers: [],
            orders: []
          };
          const updatedCache = { ...cached, orders: updated, timestamp: Date.now() };
          cacheRef.current.set(currentDate, updatedCache);
          
          // Persist order to offline storage immediately
          offlineStorage.save(STORES.ORDERS, orderToProcess).catch(() => {});
          
          // FIX #4: Save snapshot for persistence
          if (currentUserId) {
            saveMyVisitsSnapshot(currentUserId, currentDate, {
              beatPlans: updatedCache.beatPlans,
              visits: updatedCache.visits,
              retailers: updatedCache.retailers,
              orders: updated,
              progressStats: calculateStats(updatedCache.visits, updated, updatedCache.retailers, currentDate),
              currentBeatName: updatedCache.beatPlans?.map((p: any) => p.beat_name).join(', ') || ''
            }).catch(() => {});
          }
          
          console.log('[LocalEvent] Order state updated. Total orders:', updated.length, 'Value:', orderToProcess.total_amount);
          return updated;
        });
      }
    };

    // Retailer added - add to local state immediately
    const handleRetailerAdded = (event: CustomEvent) => {
      const { retailer } = event.detail || {};
      // Use refs to avoid stale closure issues
      const currentUserId = userIdRef.current;
      const currentDate = selectedDateRef.current;
      
      if (!retailer || !currentUserId) {
        console.log('[LocalEvent] Retailer skipped - no retailer or userId');
        return;
      }
      
      // FIX: Allow shared-beat retailers (beat owner's retailers on plans of current user)
      const _plannedBeatIds = (cacheRef.current.get(currentDate)?.beatPlans || []).map((bp: any) => bp.beat_id);
      if (retailer.user_id !== currentUserId && !_plannedBeatIds.includes(retailer.beat_id)) {
        console.log('[LocalEvent] Retailer skipped - not owned and not in planned beats');
        return;
      }
      
      console.log('[LocalEvent] Retailer added:', retailer.name, 'for date:', currentDate);
      
      setRetailers(prev => {
        if (prev.some(r => r.id === retailer.id)) {
          console.log('[LocalEvent] Retailer already exists in state:', retailer.id);
          return prev;
        }
        const updated = [...prev, retailer];
        
        // FIXED: Create cache if it doesn't exist, then update it
        const cached = cacheRef.current.get(currentDate) || {
          beatPlans: [],
          visits: [],
          retailers: [],
          orders: []
        };
        const updatedCache = { ...cached, retailers: updated, timestamp: Date.now() };
        cacheRef.current.set(currentDate, updatedCache);
        
        // FIXED: Persist retailer to offline storage for app restarts
        offlineStorage.save(STORES.RETAILERS, retailer).catch(e => {
          console.error('[LocalEvent] Failed to save retailer to offline storage:', e);
        });
        
        // FIX #4: Save snapshot for persistence across app restarts
        saveMyVisitsSnapshot(currentUserId, currentDate, {
          beatPlans: updatedCache.beatPlans,
          visits: updatedCache.visits,
          retailers: updated,
          orders: updatedCache.orders,
          progressStats: calculateStats(updatedCache.visits, updatedCache.orders, updated, currentDate),
          currentBeatName: updatedCache.beatPlans?.map((p: any) => p.beat_name).join(', ') || ''
        }).catch(() => {});
        
        console.log('[LocalEvent] Retailer added to state, cache, and snapshot. Total retailers:', updated.length);
        return updated;
      });
    };

    // Sync complete - only trigger delta sync if needed
    const handleSyncComplete = () => {
      const currentDate = selectedDateRef.current;
      const currentUserId = userIdRef.current;
      if (currentUserId && isToday(currentDate) && navigator.onLine && shouldSyncNow(currentDate)) {
        // Delayed to avoid rapid-fire
        setTimeout(() => smartDeltaSync(currentUserId, currentDate), 1000);
      }
    };

    // FIX: Listen to visitDataChanged - force local reload for progress stats refresh
    // Now date-aware: events carry { date } in detail, and we handle any date (not just today)
    // DEBOUNCED: Prevents rapid-fire reloads from multiple sync events
    let visitDataChangedTimer: ReturnType<typeof setTimeout> | null = null;
    const handleVisitDataChanged = async (event: Event) => {
      // Debounce: if multiple events fire within 500ms, only process the last one
      if (visitDataChangedTimer) clearTimeout(visitDataChangedTimer);
      visitDataChangedTimer = setTimeout(async () => {
      const currentDate = selectedDateRef.current;
      const currentUserId = userIdRef.current;
      
      if (!currentUserId) return;
      
      // Extract date + source from event detail (if CustomEvent with context)
      const detail = (event as CustomEvent)?.detail || {};
      const eventDate = detail.date;
      const eventSource = detail.source;
      
      // If event has a specific date and it doesn't match our selected date, skip reload
      if (eventDate && eventDate !== currentDate) {
        console.log('[LocalEvent] visitDataChanged for different date, skipping:', eventDate, '!=', currentDate);
        // Still invalidate cache for that date so it's fresh when user navigates to it
        cacheRef.current.delete(eventDate);
        lastSyncTimeRef.current.delete(eventDate);
        return;
      }

      // CLEANUP path: the startup cleanup routine just touched local stores.
      // Do NOT reload from snapshot/IndexedDB (that's what cleanup mutated) —
      // go straight to the network so DB truth wins and the "Total Order
      // Value" tile doesn't briefly show the wrong (post-cleanup, pre-sync)
      // local state.
      if (eventSource === 'cleanup') {
        console.log('[LocalEvent] visitDataChanged (cleanup) - triggering network sync directly');
        if (navigator.onLine) {
          lastSyncTimeRef.current.delete(currentDate);
          smartDeltaSync(currentUserId, currentDate);
        }
        return;
      }
      
      console.log('[LocalEvent] visitDataChanged - reloading from local cache/storage for date:', currentDate);
      
      // Reload from snapshot first (most up-to-date for offline changes)
      try {
        const snapshot = await loadMyVisitsSnapshot(currentUserId, currentDate);
        if (snapshot) {
          console.log('[LocalEvent] Reloaded from snapshot:', {
            beatPlans: snapshot.beatPlans?.length || 0,
            visits: snapshot.visits?.length || 0,
            retailers: snapshot.retailers?.length || 0,
            progressStats: snapshot.progressStats
          });
          
          // CRITICAL FIX: Filter retailers to only those matching snapshot's beat plans
          const snapshotBeatIds = (snapshot.beatPlans || []).map((bp: any) => bp.beat_id);
          const snapshotVisitRetailerIds = new Set((snapshot.visits || []).map((v: any) => v.retailer_id));
          const filteredRetailers = (snapshot.retailers || []).filter((r: any) => 
            snapshotBeatIds.includes(r.beat_id) || snapshotVisitRetailerIds.has(r.id)
          );
          
          setBeatPlans(snapshot.beatPlans || []);
          setVisits(snapshot.visits || []);
          setRetailers(filteredRetailers);
          
          // FIX #3: Merge snapshot orders with current local orders to preserve unsynced ones
          const snapshotOrders = snapshot.orders || [];
          const snapshotIds = new Set(snapshotOrders.map((o: any) => o.id));
          const snapshotIdemKeys = new Set(
            snapshotOrders.filter((o: any) => o.idempotency_key).map((o: any) => o.idempotency_key)
          );
          let mergedOrdersForCache: any[] = snapshotOrders;
          setOrders(prev => {
            const preserveLocal = prev.filter((o: any) =>
              o.order_date === currentDate &&
              !snapshotIds.has(o.id) &&
              !(o.idempotency_key && snapshotIdemKeys.has(o.idempotency_key))
            );
            if (preserveLocal.length > 0) {
              console.log(`[LocalEvent] Preserved ${preserveLocal.length} local orders not in snapshot`);
            }
            const merged = [...snapshotOrders, ...preserveLocal];
            mergedOrdersForCache = merged;
            return merged;
          });
          
          // FIX #6: Store the SAME merged array in cacheRef that we passed to
          // setOrders — otherwise the next smartDeltaSync diffs against a
          // different set than what's actually on screen.
          cacheRef.current.set(currentDate, {
            beatPlans: snapshot.beatPlans || [],
            visits: snapshot.visits || [],
            retailers: filteredRetailers,
            orders: mergedOrdersForCache,
            timestamp: Date.now()
          });
          
          // CRITICAL FIX: Trigger background network sync for ANY date (not just today)
          if (navigator.onLine && !isSlowConnection()) {
            lastSyncTimeRef.current.delete(currentDate);
            setTimeout(() => smartDeltaSync(currentUserId, currentDate), 300);
          }
          return;
        } else {
          console.log('[LocalEvent] No snapshot found - will trigger network sync');
        }
      } catch (e) {
        console.error('[LocalEvent] Snapshot load failed:', e);
      }
      
      // Fallback: reload from offline storage
      const offlineData = await loadFromOfflineStorage(currentUserId, currentDate);
      if (offlineData) {
        console.log('[LocalEvent] Reloaded from offline storage:', {
          beatPlans: offlineData.beatPlans.length,
          visits: offlineData.visits.length,
          retailers: offlineData.retailers.length
        });
        setBeatPlans(offlineData.beatPlans);
        setVisits(offlineData.visits);
        setRetailers(offlineData.retailers);
        setOrders(offlineData.orders);
        
        cacheRef.current.set(currentDate, {
          beatPlans: offlineData.beatPlans,
          visits: offlineData.visits,
          retailers: offlineData.retailers,
          orders: offlineData.orders,
          timestamp: Date.now()
        });
      } else {
        console.log('[LocalEvent] No offline data - clearing state and triggering network sync');
        setBeatPlans([]);
        setVisits([]);
        setRetailers([]);
        setOrders([]);
        cacheRef.current.delete(currentDate);
        
        if (navigator.onLine && !isSlowConnection()) {
          smartDeltaSync(currentUserId, currentDate);
        }
      }
      }, 500); // 500ms debounce
    };

    // Visibility change - sync when app comes to foreground (any date, not just today)
    // FIX: Bypass throttle when UI state is empty (e.g. after unexpected clear)
    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return;
      const currentDate = selectedDateRef.current;
      const currentUserId = userIdRef.current;
      if (!currentUserId || !navigator.onLine || isSlowConnection()) return;
      
      // Check if in-memory state is empty — if so, bypass sync throttle
      const cached = cacheRef.current.get(currentDate);
      const isStateEmpty = !cached || (
        (!cached.beatPlans || cached.beatPlans.length === 0) &&
        (!cached.retailers || cached.retailers.length === 0) &&
        (!cached.visits || cached.visits.length === 0)
      );
      
      if (isStateEmpty) {
        console.log('[Visibility] App foregrounded with EMPTY state — forcing immediate reload for:', currentDate);
        // Try snapshot first for instant display, then sync
        try {
          const snapshot = await loadMyVisitsSnapshot(currentUserId, currentDate);
          if (snapshot) {
            setBeatPlans(snapshot.beatPlans || []);
            setVisits(snapshot.visits || []);
            setRetailers(snapshot.retailers || []);
            setOrders(snapshot.orders || []);
            setHasLoadedOnce(true);
            setIsLoading(false);
            cacheRef.current.set(currentDate, {
              beatPlans: snapshot.beatPlans || [],
              visits: snapshot.visits || [],
              retailers: snapshot.retailers || [],
              orders: snapshot.orders || [],
              timestamp: Date.now()
            });
            console.log('[Visibility] Restored from snapshot');
          }
        } catch (e) {
          console.log('[Visibility] Snapshot restore failed:', e);
        }
        // Always sync after restoring (or if no snapshot)
        lastSyncTimeRef.current.delete(currentDate);
        setTimeout(() => smartDeltaSync(currentUserId, currentDate), 300);
      } else if (shouldSyncNow(currentDate)) {
        console.log('[Visibility] App foregrounded, syncing for date:', currentDate);
        setTimeout(() => smartDeltaSync(currentUserId, currentDate), 500);
      }
    };

    // Handle beat deletion - remove retailers whose beat was deleted
    const handleBeatDeleted = (event: CustomEvent) => {
      const { beatId } = event.detail || {};
      if (!beatId) return;
      
      console.log('[LocalEvent] beatDeleted - removing retailers for beat:', beatId);
      
      // Remove retailers that belong to the deleted beat
      setRetailers(prev => {
        const filtered = prev.filter(r => r.beat_id !== beatId);
        console.log('[LocalEvent] Removed', prev.length - filtered.length, 'retailers from deleted beat');
        return filtered;
      });
      
      // Remove beat plans for deleted beat
      setBeatPlans(prev => prev.filter(bp => bp.beat_id !== beatId));
      
      // Clear cache for current date to force fresh load
      const currentDate = selectedDateRef.current;
      cacheRef.current.delete(currentDate);
    };

    // Force full refresh - clear all caches and reload from network
    const handleForceRefresh = async () => {
      const currentDate = selectedDateRef.current;
      const currentUserId = userIdRef.current;
      
      if (!currentUserId) return;
      
      console.log('[LocalEvent] forceVisitsRefresh - clearing all caches and reloading');
      
      // Clear all in-memory caches
      cacheRef.current.clear();
      lastSyncTimeRef.current.clear();
      
      // Clear offline storage for beat plans
      try {
        const cachedPlans = await offlineStorage.getAll(STORES.BEAT_PLANS);
        for (const plan of cachedPlans) {
          if ((plan as any).plan_date === currentDate && (plan as any).user_id === currentUserId) {
            await offlineStorage.delete(STORES.BEAT_PLANS, (plan as any).id);
          }
        }
      } catch (e) {
        console.error('[LocalEvent] Failed to clear beat plan cache:', e);
      }
      
      // Force fresh network load
      if (navigator.onLine) {
        setIsLoading(true);
        try {
          await doFullInitialLoad(currentUserId, currentDate);
        } finally {
          setIsLoading(false);
        }
      } else {
        // Offline - just reload from storage
        const offlineData = await loadFromOfflineStorage(currentUserId, currentDate);
        if (offlineData) {
          setBeatPlans(offlineData.beatPlans);
          setVisits(offlineData.visits);
          setRetailers(offlineData.retailers);
          setOrders(offlineData.orders);
        }
      }
    };

    // Handle points earned - immediately refresh points data for instant UI update
    const handlePointsEarned = async (event: CustomEvent) => {
      const currentDate = selectedDateRef.current;
      const currentUserId = userIdRef.current;
      
      if (!currentUserId) return;
      
      // Only refresh if the points are for today (the date we're viewing)
      const eventDate = (event.detail?.date || new Date().toISOString().split('T')[0]);
      if (eventDate !== currentDate) {
        console.log('[LocalEvent] pointsEarned for different date, skipping:', eventDate, '!=', currentDate);
        return;
      }
      
      console.log('[LocalEvent] pointsEarned - refreshing points immediately');
      
      try {
        const freshPoints = await fetchPointsForDate(currentUserId, currentDate);
        setPointsData(freshPoints);
        
        // Update cache with new points
        const cached = cacheRef.current.get(currentDate);
        if (cached) {
          cached.points = { 
            total: freshPoints.total, 
            byRetailer: Array.from(freshPoints.byRetailer.entries()) 
          };
          cached.timestamp = Date.now();
          cacheRef.current.set(currentDate, cached);
        }
        
        console.log('[LocalEvent] Points refreshed:', freshPoints.total);
      } catch (e) {
        console.error('[LocalEvent] Failed to refresh points:', e);
      }
    };

    window.addEventListener('visitStatusChanged', handleStatusChange as EventListener);
    window.addEventListener('retailerAdded', handleRetailerAdded as EventListener);
    window.addEventListener('visitDataChanged', handleVisitDataChanged as EventListener);
    window.addEventListener('syncComplete', handleSyncComplete);
    window.addEventListener('beatDeleted', handleBeatDeleted as EventListener);
    window.addEventListener('forceVisitsRefresh', handleForceRefresh);
    window.addEventListener('globalDataRefresh', handleForceRefresh);
    window.addEventListener('pointsEarned', handlePointsEarned as EventListener);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('visitStatusChanged', handleStatusChange as EventListener);
      window.removeEventListener('retailerAdded', handleRetailerAdded as EventListener);
      window.removeEventListener('visitDataChanged', handleVisitDataChanged as EventListener);
      window.removeEventListener('syncComplete', handleSyncComplete);
      window.removeEventListener('beatDeleted', handleBeatDeleted as EventListener);
      window.removeEventListener('forceVisitsRefresh', handleForceRefresh);
      window.removeEventListener('globalDataRefresh', handleForceRefresh);
      window.removeEventListener('pointsEarned', handlePointsEarned as EventListener);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (visitDataChangedTimer) clearTimeout(visitDataChangedTimer);
    };
  }, [selectedDate, isToday, userId, smartDeltaSync, shouldSyncNow, loadFromOfflineStorage, doFullInitialLoad]);

  return {
    beatPlans,
    visits,
    retailers,
    orders,
    pointsData,
    progressStats,
    isLoading,
    hasLoadedOnce,
    error,
    invalidateData,
  };
};
