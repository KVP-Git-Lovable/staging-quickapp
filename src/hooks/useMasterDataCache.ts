import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { offlineStorage, STORES } from '@/lib/offlineStorage';
import { useConnectivity } from './useConnectivity';
import { useAuth } from './useAuth';
import { getLocalTodayDate } from '@/utils/dateUtils';
import { useManagedInterval } from '@/utils/intervalManager';

// Progress callback type for cache warming UI
export type CacheProgressCallback = (stepId: string, status: 'loading' | 'done' | 'error') => void;

/**
 * Hook to cache ONLY essential offline data (products, beats, retailers)
 * Does NOT cache historical data, visits, or orders - only what's needed for offline operations
 */
export function useMasterDataCache() {
  const connectivityStatus = useConnectivity();
  const isOnline = connectivityStatus === 'online';
  const { user } = useAuth();

  // Cache ONLY active products and related data needed for order entry
  const cacheProducts = useCallback(async (onProgress?: CacheProgressCallback) => {
    try {
      onProgress?.('products', 'loading');
      console.log('[Cache] Syncing active products for offline order entry...');
      
      // Fetch data FIRST, only clear cache if fetch succeeds
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('*')
        .or('is_active.eq.true,is_active.is.null');

      if (productsError) throw productsError;

      // Cache only active variants
      const { data: variants } = await supabase
        .from('product_variants')
        .select('*')
        .or('is_active.eq.true,is_active.is.null');

      // Only clear and update cache if all fetches succeeded
      if (products) {
        await offlineStorage.clear(STORES.PRODUCTS);
        for (const product of products) {
          await offlineStorage.save(STORES.PRODUCTS, product);
        }
        console.log(`[Cache] ✅ ${products.length} active products cached`);
      }

      if (variants) {
        await offlineStorage.clear(STORES.VARIANTS);
        for (const variant of variants) {
          await offlineStorage.save(STORES.VARIANTS, variant);
        }
        console.log(`[Cache] ✅ ${variants.length} variants cached`);
      }

      onProgress?.('products', 'done');
    } catch (error) {
      console.error('[Cache] Error caching products, keeping existing cache:', error);
      onProgress?.('products', 'error');
    }
  }, []);

  // Cache schemes separately for progress tracking
  const cacheSchemes = useCallback(async (onProgress?: CacheProgressCallback) => {
    try {
      onProgress?.('schemes', 'loading');
      console.log('[Cache] Syncing schemes...');

      // Cache only active schemes
      const { data: schemes } = await supabase
        .from('product_schemes')
        .select('*')
        .eq('is_active', true);

      // Cache categories
      const { data: categories } = await supabase
        .from('product_categories')
        .select('*');

      if (schemes) {
        await offlineStorage.clear(STORES.SCHEMES);
        for (const scheme of schemes) {
          await offlineStorage.save(STORES.SCHEMES, scheme);
        }
        console.log(`[Cache] ✅ ${schemes.length} schemes cached`);
      }

      if (categories) {
        await offlineStorage.clear(STORES.CATEGORIES);
        for (const category of categories) {
          await offlineStorage.save(STORES.CATEGORIES, category);
        }
        console.log(`[Cache] ✅ ${categories.length} categories cached`);
      }

      localStorage.setItem('master_data_cached_at', Date.now().toString());
      onProgress?.('schemes', 'done');
    } catch (error) {
      console.error('[Cache] Error caching schemes, keeping existing cache:', error);
      onProgress?.('schemes', 'error');
    }
  }, []);

  // Cache ONLY active beats for current user
  const cacheBeats = useCallback(async (onProgress?: CacheProgressCallback) => {
    if (!user) return;
    
    try {
      onProgress?.('beats', 'loading');
      console.log('[Cache] Syncing active beats...');

      // Re-check session — auth may have dropped between hook init and this call
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id || session.user.id !== user.id) {
        console.warn('[Cache] Skipping beats sync — session not ready / user changed');
        onProgress?.('beats', 'error');
        return;
      }
      
      const { data: beats, error } = await supabase
        .from('beats')
        .select('*')
        .eq('is_active', true)
        .eq('created_by', user.id);

      if (error) throw error;

      // Only clear and update cache if fetch succeeded
      if (beats) {
        await offlineStorage.clear(STORES.BEATS);
        for (const beat of beats) {
          await offlineStorage.save(STORES.BEATS, beat);
        }
        console.log(`[Cache] ✅ ${beats.length} active beats cached`);
      }
      onProgress?.('beats', 'done');
    } catch (error: any) {
      // SECURITY: On permission errors (42501) the cached data may belong to another
      // user — clear it instead of preserving to avoid cross-user data leakage.
      if (error?.code === '42501') {
        console.warn('[Cache] Permission denied on beats — clearing stale cache');
        await offlineStorage.clear(STORES.BEATS).catch(() => undefined);
      } else {
        console.error('[Cache] Error caching beats, keeping existing cache:', error);
      }
      onProgress?.('beats', 'error');
    }
  }, [user]);

  // Cache competition data (competitors and SKUs)
  const cacheCompetitionData = useCallback(async (onProgress?: CacheProgressCallback) => {
    try {
      onProgress?.('competition', 'loading');
      console.log('Caching competition data...');
      
      // Cache competition master (competitors)
      const { data: competitors, error: competitorsError } = await supabase
        .from('competition_master')
        .select('*');

      if (competitorsError) throw competitorsError;

      if (competitors) {
        for (const competitor of competitors) {
          await offlineStorage.save(STORES.COMPETITION_MASTER, competitor);
        }
        console.log(`Cached ${competitors.length} competitors`);
      }

      // Cache competition SKUs
      const { data: skus, error: skusError } = await supabase
        .from('competition_skus')
        .select('*')
        .eq('is_active', true);

      if (skusError) throw skusError;

      if (skus) {
        for (const sku of skus) {
          await offlineStorage.save(STORES.COMPETITION_SKUS, sku);
        }
        console.log(`Cached ${skus.length} competition SKUs`);
      }
      onProgress?.('competition', 'done');
    } catch (error) {
      console.error('Error caching competition data:', error);
      onProgress?.('competition', 'error');
    }
  }, []);

  // Cache ONLY retailers for current user
  const cacheRetailers = useCallback(async (onProgress?: CacheProgressCallback) => {
    if (!user) return;
    
    try {
      onProgress?.('retailers', 'loading');
      console.log('[Cache] Syncing retailers...');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id || session.user.id !== user.id) {
        console.warn('[Cache] Skipping retailers sync — session not ready / user changed');
        onProgress?.('retailers', 'error');
        return;
      }
      
      const { data: retailers, error } = await supabase
        .from('retailers')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      // Only clear and update cache if fetch succeeded
      if (retailers) {
        await offlineStorage.replaceAll(STORES.RETAILERS, retailers);
        console.log(`[Cache] ✅ ${retailers.length} retailers cached`);
      }
      onProgress?.('retailers', 'done');
    } catch (error: any) {
      if (error?.code === '42501') {
        console.warn('[Cache] Permission denied on retailers — clearing stale cache');
        await offlineStorage.clear(STORES.RETAILERS).catch(() => undefined);
      } else {
        console.error('[Cache] Error caching retailers, keeping existing cache:', error);
      }
      onProgress?.('retailers', 'error');
    }
  }, [user]);

  // Cache ONLY today's and next 3 days beat plans (not historical)
  const cacheBeatPlans = useCallback(async (onProgress?: CacheProgressCallback): Promise<number> => {
    if (!user) return 0;
    
    try {
      onProgress?.('beatPlans', 'loading');
      console.log('[Cache] Syncing upcoming beat plans...');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id || session.user.id !== user.id) {
        console.warn('[Cache] Skipping beat plans sync — session not ready / user changed');
        onProgress?.('beatPlans', 'error');
        return 0;
      }
      
      // Get only today and next 3 days
      const today = new Date();
      const threeDaysLater = new Date(today);
      threeDaysLater.setDate(today.getDate() + 3);
      
      const { data: beatPlans, error } = await supabase
        .from('beat_plans')
        .select('*')
        .eq('user_id', user.id)
        .gte('plan_date', today.toISOString().split('T')[0])
        .lte('plan_date', threeDaysLater.toISOString().split('T')[0]);

      if (error) throw error;

      // Only clear and update cache if fetch succeeded
      if (beatPlans) {
        await offlineStorage.clear(STORES.BEAT_PLANS);
        for (const plan of beatPlans) {
          await offlineStorage.save(STORES.BEAT_PLANS, plan);
        }
        console.log(`[Cache] ✅ ${beatPlans.length} beat plans cached (today + 3 days)`);
      }
      onProgress?.('beatPlans', 'done');
      return beatPlans?.length || 0;
    } catch (error: any) {
      if (error?.code === '42501') {
        console.warn('[Cache] Permission denied on beat_plans — clearing stale cache');
        await offlineStorage.clear(STORES.BEAT_PLANS).catch(() => undefined);
      } else {
        console.error('[Cache] Error caching beat plans, keeping existing cache:', error);
      }
      onProgress?.('beatPlans', 'error');
      return 0;
    }
  }, [user]);

  // Cache today's visits from network
  const cacheVisits = useCallback(async (onProgress?: CacheProgressCallback): Promise<number> => {
    if (!user) return 0;
    
    try {
      onProgress?.('visits', 'loading');
      console.log('[Cache] Syncing today\'s visits...');
      
      // FIX: Use local date instead of UTC to prevent timezone mismatch
      const today = getLocalTodayDate();
      
      const { data: visits, error } = await supabase
        .from('visits')
        .select('*')
        .eq('user_id', user.id)
        .eq('planned_date', today);

      if (error) throw error;

      if (visits) {
        await offlineStorage.clear(STORES.VISITS);
        for (const visit of visits) {
          await offlineStorage.save(STORES.VISITS, visit);
        }
        console.log(`[Cache] ✅ ${visits.length} visits cached`);
      }
      onProgress?.('visits', 'done');
      return visits?.length || 0;
    } catch (error: any) {
      if (error?.code === '42501') {
        console.warn('[Cache] Permission denied on visits — clearing stale cache');
        await offlineStorage.clear(STORES.VISITS).catch(() => undefined);
      } else {
        console.error('[Cache] Error caching visits:', error);
      }
      onProgress?.('visits', 'error');
      return 0;
    }
  }, [user]);

  // Cache today's orders from network
  const cacheOrders = useCallback(async (onProgress?: CacheProgressCallback): Promise<number> => {
    if (!user) return 0;
    
    try {
      onProgress?.('orders', 'loading');
      console.log('[Cache] Syncing today\'s orders...');
      
      // FIX: Use local date instead of UTC to prevent timezone mismatch
      const today = getLocalTodayDate();
      
      const { data: orders, error } = await supabase
        .from('orders')
        .select('*, order_items!order_items_order_id_fkey(*)')
        .eq('user_id', user.id)
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`);

      if (error) throw error;

      if (orders) {
        await offlineStorage.clear(STORES.ORDERS);
        for (const order of orders) {
          await offlineStorage.save(STORES.ORDERS, order);
        }
        console.log(`[Cache] ✅ ${orders.length} orders cached`);
      }
      onProgress?.('orders', 'done');
      return orders?.length || 0;
    } catch (error: any) {
      if (error?.code === '42501') {
        console.warn('[Cache] Permission denied on orders — clearing stale cache');
        await offlineStorage.clear(STORES.ORDERS).catch(() => undefined);
      } else {
        console.error('[Cache] Error caching orders:', error);
      }
      onProgress?.('orders', 'error');
      return 0;
    }
  }, [user]);

  // Sequential cache warming with progress callback for UI
  const warmCacheWithProgress = useCallback(async (onProgress: CacheProgressCallback) => {
    if (!navigator.onLine || !user) {
      console.log('[Cache] Cannot warm cache - offline or no user');
      return false;
    }

    console.log('[Cache] 🔥 Starting cache warming with progress...');
    try {
      // Run sequentially so progress updates are visible
      await cacheProducts(onProgress);
      await cacheSchemes(onProgress);
      await cacheBeats(onProgress);
      await cacheRetailers(onProgress);
      await cacheBeatPlans(onProgress);
      await cacheCompetitionData(onProgress);
      await cacheVisits(onProgress);
      await cacheOrders(onProgress);
      
      localStorage.setItem('master_data_cached_at', Date.now().toString());
      localStorage.setItem('cache_warmed_at', Date.now().toString());
      
      // Dispatch event so My Visits and other components can reload from updated storage
      window.dispatchEvent(new CustomEvent('masterDataRefreshed'));
      
      console.log('[Cache] ✅ Cache warming complete');
      return true;
    } catch (error) {
      console.error('[Cache] Cache warming failed:', error);
      return false;
    }
  }, [user, cacheProducts, cacheSchemes, cacheBeats, cacheRetailers, cacheBeatPlans, cacheCompetitionData, cacheVisits, cacheOrders]);

  // Full sync with item counts - returns summary for UI
  type SyncSummaryLocal = {
    products: number;
    schemes: number;
    beats: number;
    retailers: number;
    beatPlans: number;
    competition: number;
    visits: number;
    orders: number;
    total: number;
  };

  const fullOfflineSync = useCallback(async (
    onProgress: CacheProgressCallback,
    onItemCount?: (stepId: string, count: number) => void
  ): Promise<SyncSummaryLocal> => {
    if (!navigator.onLine || !user) {
      console.log('[Cache] Cannot sync - offline or no user');
      return { products: 0, schemes: 0, beats: 0, retailers: 0, beatPlans: 0, competition: 0, visits: 0, orders: 0, total: 0 };
    }

    console.log('[Cache] 🔄 Starting full offline sync...');
    const summary: SyncSummaryLocal = {
      products: 0,
      schemes: 0,
      beats: 0,
      retailers: 0,
      beatPlans: 0,
      competition: 0,
      visits: 0,
      orders: 0,
      total: 0
    };

    try {
      // Products
      onProgress('products', 'loading');
      const { data: products } = await supabase.from('products').select('*').or('is_active.eq.true,is_active.is.null');
      const { data: variants } = await supabase.from('product_variants').select('*').or('is_active.eq.true,is_active.is.null');
      if (products) {
        await offlineStorage.clear(STORES.PRODUCTS);
        for (const p of products) await offlineStorage.save(STORES.PRODUCTS, p);
      }
      if (variants) {
        await offlineStorage.clear(STORES.VARIANTS);
        for (const v of variants) await offlineStorage.save(STORES.VARIANTS, v);
      }
      summary.products = (products?.length || 0) + (variants?.length || 0);
      onItemCount?.('products', summary.products);
      onProgress('products', 'done');

      // Schemes
      onProgress('schemes', 'loading');
      const { data: schemes } = await supabase.from('product_schemes').select('*').or('is_active.eq.true,is_active.is.null');
      const { data: categories } = await supabase.from('product_categories').select('*');
      if (schemes) {
        await offlineStorage.clear(STORES.SCHEMES);
        for (const s of schemes) await offlineStorage.save(STORES.SCHEMES, s);
      }
      if (categories) {
        await offlineStorage.clear(STORES.CATEGORIES);
        for (const c of categories) await offlineStorage.save(STORES.CATEGORIES, c);
      }
      summary.schemes = (schemes?.length || 0) + (categories?.length || 0);
      onItemCount?.('schemes', summary.schemes);
      onProgress('schemes', 'done');

      // Beats
      onProgress('beats', 'loading');
      const { data: beats } = await supabase.from('beats').select('*').eq('is_active', true).eq('user_id', user.id);
      if (beats) {
        await offlineStorage.clear(STORES.BEATS);
        for (const b of beats) await offlineStorage.save(STORES.BEATS, b);
      }
      summary.beats = beats?.length || 0;
      onItemCount?.('beats', summary.beats);
      onProgress('beats', 'done');

      // Retailers
      onProgress('retailers', 'loading');
      // FIX: No user_id filter - includes shared beat retailers via RLS
      const { data: retailers } = await supabase.from('retailers').select('*');
      if (retailers) {
        await offlineStorage.replaceAll(STORES.RETAILERS, retailers);
      }
      summary.retailers = retailers?.length || 0;
      onItemCount?.('retailers', summary.retailers);
      onProgress('retailers', 'done');

      // Beat Plans - FIX: Use local date
      onProgress('beatPlans', 'loading');
      const todayStr = getLocalTodayDate();
      const todayDate = new Date(todayStr);
      const threeDaysLater = new Date(todayDate);
      threeDaysLater.setDate(todayDate.getDate() + 3);
      const threeDaysStr = threeDaysLater.toISOString().split('T')[0];
      
      const { data: beatPlans } = await supabase
        .from('beat_plans')
        .select('*')
        .eq('user_id', user.id)
        .gte('plan_date', todayStr)
        .lte('plan_date', threeDaysStr);
      if (beatPlans) {
        await offlineStorage.clear(STORES.BEAT_PLANS);
        for (const bp of beatPlans) await offlineStorage.save(STORES.BEAT_PLANS, bp);
      }
      summary.beatPlans = beatPlans?.length || 0;
      onItemCount?.('beatPlans', summary.beatPlans);
      onProgress('beatPlans', 'done');

      // Competition
      onProgress('competition', 'loading');
      const { data: competitors } = await supabase.from('competition_master').select('*');
      const { data: skus } = await supabase.from('competition_skus').select('*').eq('is_active', true);
      if (competitors) {
        for (const c of competitors) await offlineStorage.save(STORES.COMPETITION_MASTER, c);
      }
      if (skus) {
        for (const s of skus) await offlineStorage.save(STORES.COMPETITION_SKUS, s);
      }
      summary.competition = (competitors?.length || 0) + (skus?.length || 0);
      onItemCount?.('competition', summary.competition);
      onProgress('competition', 'done');

      // Today's Visits - FIX: Use local date
      onProgress('visits', 'loading');
      const { data: visits } = await supabase.from('visits').select('*').eq('user_id', user.id).eq('planned_date', todayStr);
      if (visits) {
        await offlineStorage.clear(STORES.VISITS);
        for (const v of visits) await offlineStorage.save(STORES.VISITS, v);
      }
      summary.visits = visits?.length || 0;
      onItemCount?.('visits', summary.visits);
      onProgress('visits', 'done');

      // Today's Orders - FIX: Use local date
      onProgress('orders', 'loading');
      const { data: orders } = await supabase
        .from('orders')
        .select('*, order_items!order_items_order_id_fkey(*)')
        .eq('user_id', user.id)
        .gte('created_at', `${todayStr}T00:00:00`)
        .lte('created_at', `${todayStr}T23:59:59`);
      if (orders) {
        await offlineStorage.clear(STORES.ORDERS);
        for (const o of orders) await offlineStorage.save(STORES.ORDERS, o);
      }
      summary.orders = orders?.length || 0;
      onItemCount?.('orders', summary.orders);
      onProgress('orders', 'done');

      // Calculate total
      summary.total = summary.products + summary.schemes + summary.beats + summary.retailers + 
                      summary.beatPlans + summary.competition + summary.visits + summary.orders;

      localStorage.setItem('master_data_cached_at', Date.now().toString());
      localStorage.setItem('cache_warmed_at', Date.now().toString());
      localStorage.setItem('full_sync_at', Date.now().toString());
      
      window.dispatchEvent(new CustomEvent('masterDataRefreshed'));
      
      console.log(`[Cache] ✅ Full sync complete - ${summary.total} items cached`);
      return summary;
    } catch (error) {
      console.error('[Cache] Full sync failed:', error);
      return summary;
    }
  }, [user]);

  // Cache essential master data with priority loading
  // Critical data loads first (beat plans, retailers) for My Visit to work
  // Then important data (products, schemes) for order entry
  // Finally defer non-essential data (competition) to background
  const cacheAllMasterData = useCallback(async () => {
    if (!isOnline || !user) {
      console.log('[Cache] Offline or no user - skipping cache update');
      return;
    }

    console.log('[Cache] 🔄 Syncing essential offline data with priority...');
    try {
      // Phase 1: CRITICAL - Load beat plans and retailers first (needed for My Visit)
      console.log('[Cache] Phase 1: Loading critical data (beat plans + retailers)...');
      await Promise.all([
        cacheBeatPlans(),
        cacheRetailers(),
        cacheBeats()
      ]);
      
      // Phase 2: IMPORTANT - Load products and schemes (needed for order entry)
      console.log('[Cache] Phase 2: Loading important data (products + schemes)...');
      await Promise.all([
        cacheProducts(),
        cacheSchemes()
      ]);
      
      // Phase 3: DEFERRED - Load competition data in background (not urgent)
      // Use setTimeout to defer and not block UI
      setTimeout(() => {
        console.log('[Cache] Phase 3: Loading deferred data (competition)...');
        cacheCompetitionData();
      }, 2000);
      
      console.log('[Cache] ✅ Essential offline data synced successfully');
    } catch (error) {
      console.error('[Cache] Error syncing offline data:', error);
    }
  }, [isOnline, user, cacheProducts, cacheSchemes, cacheBeats, cacheRetailers, cacheBeatPlans, cacheCompetitionData]);

  // Force refresh master data AND notify UI to reload from storage
  const forceRefreshMasterData = useCallback(async () => {
    if (!navigator.onLine || !user) {
      console.log('[Cache] Cannot force refresh - offline or no user');
      return false;
    }

    console.log('[Cache] 🔄 Force refreshing all master data...');
    try {
      await Promise.all([
        cacheProducts(),
        cacheSchemes(),
        cacheBeats(),
        cacheRetailers(),
        cacheBeatPlans(),
        cacheCompetitionData()
      ]);
      
      localStorage.setItem('master_data_cached_at', Date.now().toString());
      
      // Dispatch event so My Visits and other components can reload from updated storage
      window.dispatchEvent(new CustomEvent('masterDataRefreshed'));
      
      console.log('[Cache] ✅ Force refresh complete, UI notified');
      return true;
    } catch (error) {
      console.error('[Cache] Force refresh failed:', error);
      return false;
    }
  }, [user, cacheProducts, cacheSchemes, cacheBeats, cacheRetailers, cacheBeatPlans, cacheCompetitionData]);

  // Load cached data (used when offline)
  const loadCachedData = useCallback(async (storeName: string) => {
    try {
      const data = await offlineStorage.getAll(storeName);
      return data;
    } catch (error) {
      console.error(`Error loading cached data from ${storeName}:`, error);
      return [];
    }
  }, []);

  // Auto-sync when online (not too frequently to save storage)
  useEffect(() => {
    if (!user) return;
    
    // Check if we need to refresh cache (every 4 hours) or if never cached
    const lastCached = localStorage.getItem('master_data_cached_at');
    const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);
    
    if (isOnline) {
      if (!lastCached || parseInt(lastCached) < fourHoursAgo) {
        console.log('[Cache] Cache expired or missing, syncing offline data...');
        // Use forceRefreshMasterData to also notify UI
        forceRefreshMasterData();
      } else {
        console.log('[Cache] Using recent cache, no sync needed');
      }
    } else if (!lastCached) {
      console.warn('[Cache] ⚠️ Offline with no cached data. Connect online to enable offline mode.');
    }
  }, [isOnline, user, forceRefreshMasterData]);

  // Use managed interval for background sync (pauses when app is hidden)
  // Increased from 30 min to 45 min to reduce network usage
  useManagedInterval(
    'master-data-cache-sync',
    useCallback(() => {
      console.log('[Cache] Background sync triggered (45-min interval)');
      forceRefreshMasterData();
    }, [forceRefreshMasterData]),
    45 * 60 * 1000, // 45 minutes (increased from 30)
    { enabled: isOnline && !!user, runWhenHidden: false }
  );

  return {
    cacheProducts,
    cacheSchemes,
    cacheBeats,
    cacheRetailers,
    cacheBeatPlans,
    cacheCompetitionData,
    cacheVisits,
    cacheOrders,
    cacheAllMasterData,
    forceRefreshMasterData,
    warmCacheWithProgress,
    fullOfflineSync,
    loadCachedData,
    isOnline
  };
}

// Export type for use in components
export type SyncSummary = {
  products: number;
  schemes: number;
  beats: number;
  retailers: number;
  beatPlans: number;
  competition: number;
  visits: number;
  orders: number;
  total: number;
};
