import { useEffect, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { offlineStorage, STORES } from '@/lib/offlineStorage';
import { useConnectivity } from './useConnectivity';
import { useAuth } from './useAuth';
import { getLocalTodayDate } from '@/utils/dateUtils';
import { useManagedInterval } from '@/utils/intervalManager';
import { fetchAllPaginated, chunkIds } from '@/utils/fetchAllPaginated';
import type { AvailabilityRow, TerritoryLookupEntry } from '@/utils/productAvailability';
import { prefetchAllProductUnits } from '@/lib/uomEngine';

// Trimmed columns for picker / order-entry use case (avoids select('*')
// pulling rarely-used heavy fields). Kept in sync with TableOrderForm needs.
const PRODUCT_PICKER_COLUMNS =
  'id, name, sku, product_number, rate, base_unit, base_unit_category, category_id, closing_stock, gst_percentage, hsn_code, tax_master_id, default_sales_uom_id, price_basis_uom_id, is_active';

// Progress callback type for cache warming UI
export type CacheProgressCallback = (stepId: string, status: 'loading' | 'done' | 'error') => void;

// Bump to force every device to re-warm master data once (overwrites stale
// UOM blob + header-only order rows from before the fetch fixes).
const MASTER_CACHE_SCHEMA_VERSION = '2';

/**
 * Hook to cache ONLY essential offline data (products, beats, retailers)
 * Does NOT cache historical data, visits, or orders - only what's needed for offline operations
 */
export function useMasterDataCache() {
  const connectivityStatus = useConnectivity();
  const isOnline = connectivityStatus === 'online';
  const { user } = useAuth();

  // Phase 7-1: reactive maps for the availability resolver. Loaded from the
  // offline cache (filled by cacheProductAvailability) so consumers can call
  // isProductAvailable / buildRetailerContext without an extra round-trip.
  const [availabilityByProductId, setAvailabilityByProductId] = useState<Map<string, AvailabilityRow[]>>(new Map());
  const [territoriesById, setTerritoriesById] = useState<Map<string, TerritoryLookupEntry>>(new Map());

  const reloadAvailabilityMaps = useCallback(async () => {
    try {
      const [rows, terrs] = await Promise.all([
        offlineStorage.getAll(STORES.PRODUCT_AVAILABILITY) as Promise<AvailabilityRow[]>,
        offlineStorage.getAll(STORES.TERRITORIES_LOOKUP) as Promise<Array<{ id: string; region: string | null; zone: string | null }>>,
      ]);

      const byProduct = new Map<string, AvailabilityRow[]>();
      for (const r of rows ?? []) {
        const list = byProduct.get(r.product_id) ?? [];
        list.push(r);
        byProduct.set(r.product_id, list);
      }
      setAvailabilityByProductId(byProduct);

      const terrMap = new Map<string, TerritoryLookupEntry>();
      for (const t of terrs ?? []) {
        terrMap.set(t.id, { region: t.region, zone: t.zone });
      }
      setTerritoriesById(terrMap);
    } catch (err) {
      console.warn('[Cache] Failed to load availability maps from offline cache:', err);
    }
  }, []);

  useEffect(() => {
    reloadAvailabilityMaps();
    const onRefresh = () => reloadAvailabilityMaps();
    window.addEventListener('masterDataRefreshed', onRefresh);
    return () => window.removeEventListener('masterDataRefreshed', onRefresh);
  }, [reloadAvailabilityMaps]);


  // Cache ONLY active products and related data needed for order entry
  const cacheProducts = useCallback(async (onProgress?: CacheProgressCallback) => {
    onProgress?.('products', 'loading');
    console.log('[Cache] Syncing active products for offline order entry...');

    const MAX_ATTEMPTS = 3;
    const BACKOFF_MS = [1000, 2000, 4000];
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        // PAGINATED: PostgREST caps individual requests at 1,000 rows — loop until short page.
        // Smaller pageSize (500) keeps each request lighter on slow mobile networks.
        const products = await fetchAllPaginated<any>((from, to) =>
          supabase
            .from('products')
            .select(`${PRODUCT_PICKER_COLUMNS}, category:product_categories(name)`)
            .or('is_active.eq.true,is_active.is.null')
            .order('name')
            .range(from, to),
          500
        );

        const variants = await fetchAllPaginated<any>((from, to) =>
          supabase
            .from('product_variants')
            .select('*')
            .or('is_active.eq.true,is_active.is.null')
            .range(from, to),
          500
        );

        // Only clear and update cache if all fetches succeeded.
        if (products) {
          await offlineStorage.replaceAll(STORES.PRODUCTS, products);
          console.log(`[Cache] ✅ ${products.length} active products cached`);
        }
        if (variants) {
          await offlineStorage.replaceAll(STORES.VARIANTS, variants);
          console.log(`[Cache] ✅ ${variants.length} variants cached`);
        }

        onProgress?.('products', 'done');
        return;
      } catch (error) {
        lastError = error;
        console.warn(`[Cache] Products fetch attempt ${attempt}/${MAX_ATTEMPTS} failed:`, error);
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1] ?? 2000));
        }
      }
    }

    console.error('[Cache] Error caching products after retries, keeping existing cache:', lastError);
    onProgress?.('products', 'error');
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
        await offlineStorage.replaceAll(STORES.SCHEMES, schemes);
        console.log(`[Cache] ✅ ${schemes.length} schemes cached`);
      }

      if (categories) {
        await offlineStorage.replaceAll(STORES.CATEGORIES, categories);
        console.log(`[Cache] ✅ ${categories.length} categories cached`);
      }

      localStorage.setItem('master_data_cached_at', Date.now().toString());
      onProgress?.('schemes', 'done');
    } catch (error) {
      console.error('[Cache] Error caching schemes, keeping existing cache:', error);
      onProgress?.('schemes', 'error');
    }
  }, []);

  // Cache UOM master (enabled units) + product↔UOM mappings so the unit
  // selector works offline. Mirrors the schemes-caching block above.
  const cacheUomData = useCallback(async (onProgress?: CacheProgressCallback) => {
    try {
      onProgress?.('uom', 'loading');
      console.log('[Cache] Syncing UOM master + product UOM mappings...');

      // 1) Small, reliable: enabled uom_master — cache it IMMEDIATELY.
      const { data: uomRows } = await supabase
        .from('uom_master')
        .select('id, code, name, category, is_base, is_system, enabled_units!inner(enabled)')
        .eq('enabled_units.enabled', true)
        .order('name');

      const enabledUnits = (uomRows || []).map((r: any) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        category: r.category,
        is_base: r.is_base,
        is_system: r.is_system,
      }));

      if (enabledUnits.length > 0) {
        await offlineStorage.replaceAll(STORES.UOM_MASTER, enabledUnits);
        console.log(`[Cache] ✅ ${enabledUnits.length} enabled UOM units cached`);
      }

      // 2) Big & fragile: product_uom_mapping — ISOLATED so a failure here
      //    can't wipe out the UOM_MASTER cache (base-unit fallback depends on it).
      try {
        const activeProducts = await offlineStorage.getAll<any>(STORES.PRODUCTS);
        const activeIds = (activeProducts || []).map((p: any) => p.id).filter(Boolean);
        const mappings: any[] = [];
        for (const chunk of chunkIds(activeIds)) {
          const part = await fetchAllPaginated<any>((from, to) =>
            supabase.from('product_uom_mapping')
              .select('id, product_id, uom_id, conversion_to_base, is_default_sales, is_price_basis, is_default_purchase, is_active')
              .in('product_id', chunk)
              .order('id', { ascending: true })   // deterministic pagination — no dropped rows
              .range(from, to));
          if (part) mappings.push(...part);
        }
        await offlineStorage.replaceAll(STORES.PRODUCT_UOM_MAPPING, mappings);
        console.log(`[Cache] ✅ ${mappings.length} product UOM mappings cached`);
      } catch (mapErr) {
        console.warn('[Cache] product_uom_mapping fetch failed; UOM_MASTER + base-unit fallback still available', mapErr);
      }

      // 3) Bulk-prefetch complete per-product unit blobs via one RPC.
      //    Immune to pagination — populates in-memory + IndexedDB caches.
      try {
        await prefetchAllProductUnits();
        console.log('[Cache] ✅ all product units prefetched');
      } catch (e) {
        console.warn('[Cache] prefetch units failed', e);
      }

      onProgress?.('uom', 'done');
    } catch (error) {
      console.error('[Cache] Error caching UOM data, keeping existing cache:', error);
      onProgress?.('uom', 'error');
    }
  }, []);


  // Cache profiles + distributors + distributor↔beat mappings so the
  // AddRetailer form (Owner dropdown, Distributor selector) works offline.
  const cacheOrgData = useCallback(async (onProgress?: CacheProgressCallback) => {
    try {
      onProgress?.('org', 'loading');
      console.log('[Cache] Syncing profiles + distributors + beat mappings...');

      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name');
      if (profs) {
        await offlineStorage.replaceAll(STORES.PROFILES, profs.filter((p: any) => p.full_name));
        console.log(`[Cache] ✅ ${profs.length} profiles cached`);
      }

      const { data: dists } = await supabase
        .from('distributors')
        .select('id, name, status')
        .eq('status', 'active')
        .order('name');
      if (dists) {
        await offlineStorage.replaceAll(STORES.DISTRIBUTORS, dists);
        console.log(`[Cache] ✅ ${dists.length} distributors cached`);
      }

      const maps = await fetchAllPaginated<any>((from, to) =>
        supabase
          .from('distributor_beat_mappings')
          .select('beat_id, distributor_id, distributors(id, name)')
          .range(from, to)
      );
      if (maps) {
        // Ensure each row has an id for offlineStorage keying
        const withIds = maps.map((m: any, idx: number) => ({
          id: `${m.beat_id}__${m.distributor_id}__${idx}`,
          ...m,
        }));
        await offlineStorage.replaceAll(STORES.DISTRIBUTOR_BEAT_MAPPINGS, withIds);
        console.log(`[Cache] ✅ ${withIds.length} distributor-beat mappings cached`);
      }

      onProgress?.('org', 'done');
    } catch (error) {
      console.error('[Cache] Error caching org data, keeping existing cache:', error);
      onProgress?.('org', 'error');
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
      
      const nowIso = new Date().toISOString();
      const [ownedRes, accessRes] = await Promise.all([
        supabase
          .from('beats')
          .select('*')
          .eq('is_active', true)
          .eq('user_id', user.id),
        supabase
          .from('beat_user_access')
          .select('access_type, beat_id, effective_from, effective_to, is_active, beats:beats!beat_user_access_beat_id_fkey(*)')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .or(`effective_to.is.null,effective_to.gt.${nowIso}`),
      ]);

      if (ownedRes.error) throw ownedRes.error;

      // Fallback if FK relation name differs: the shared-access embed
      // (beats:beats!beat_user_access_beat_id_fkey) errors because that FK
      // does not exist, so re-query without the alias and stitch client-side.
      let accessRows: any[] = (accessRes?.data ?? []) as any[];
      if (accessRes?.error || accessRes?.data == null) {
        try {
          const alt = await supabase
            .from('beat_user_access')
            .select('access_type, beat_id, effective_from, effective_to, is_active')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .or(`effective_to.is.null,effective_to.gt.${nowIso}`);
          if (alt.error) throw alt.error;
          const textIds = (alt.data ?? []).map((r: any) => r.beat_id);
          if (textIds.length) {
            const { data: beatRows, error: beatErr } = await supabase
              .from('beats')
              .select('*')
              .in('beat_id', textIds);
            if (beatErr) throw beatErr;
            const beatMap = new Map<string, any>();
            for (const b of (beatRows ?? [])) beatMap.set(b.beat_id, b);
            accessRows = (alt.data ?? []).map((r: any) => ({
              ...r,
              beats: beatMap.get(r.beat_id),
            }));
          } else {
            accessRows = [];
          }
        } catch (fallbackErr) {
          console.error('[Cache] Shared-beat access fallback failed:', fallbackErr);
          accessRows = [];
        }
      }

      const WRITE_ACCESS = new Set(['OWNED', 'CO_OWNER', 'OPERATIONAL', 'COVERAGE']);
      const byId = new Map<string, any>();
      for (const b of (ownedRes.data ?? [])) {
        byId.set(b.beat_id, { ...b, access_type: 'OWNED' });
      }
      for (const row of accessRows) {
        const at = String(row.access_type || '').toUpperCase();
        if (!WRITE_ACCESS.has(at)) continue;
        const beat = row.beats;
        if (!beat?.beat_id || beat.is_active === false) continue;
        if (byId.has(beat.beat_id)) continue;
        byId.set(beat.beat_id, { ...beat, access_type: at });
      }
      const beats = Array.from(byId.values());

      // Only clear and update cache if fetch succeeded (single batched write)
      if (beats) {
        await offlineStorage.replaceAll(STORES.BEATS, beats);
        console.log(`[Cache] ✅ ${beats.length} active beats cached (owned + shared)`);
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
        await offlineStorage.replaceAll(STORES.COMPETITION_MASTER, competitors);
        console.log(`Cached ${competitors.length} competitors`);
      }

      // Cache competition SKUs
      const { data: skus, error: skusError } = await supabase
        .from('competition_skus')
        .select('*')
        .eq('is_active', true);

      if (skusError) throw skusError;

      if (skus) {
        await offlineStorage.replaceAll(STORES.COMPETITION_SKUS, skus);
        console.log(`Cached ${skus.length} competition SKUs`);
      }
      onProgress?.('competition', 'done');
    } catch (error) {
      console.error('Error caching competition data:', error);
      onProgress?.('competition', 'error');
    }
  }, []);

  // Phase 7-1: cache product availability rules + a small territories lookup
  // (id -> {region, zone}) so the resolver can build a retailer context offline.
  const cacheProductAvailability = useCallback(async (onProgress?: CacheProgressCallback) => {
    try {
      onProgress?.('productAvailability', 'loading');
      console.log('[Cache] Syncing product availability + territories lookup...');

      // PAGINATED — never a 1k-cap raw query.
      const availability = await fetchAllPaginated<AvailabilityRow>((from, to) =>
        supabase
          .from('product_availability')
          .select('product_id, scope_type, scope_value, mode')
          .range(from, to)
      );

      const territories = await fetchAllPaginated<{ id: string; region: string | null; zone: string | null }>((from, to) =>
        supabase
          .from('territories')
          .select('id, region, zone')
          .range(from, to)
      );

      if (availability) {
        await offlineStorage.replaceAll(STORES.PRODUCT_AVAILABILITY, availability);
        console.log(`[Cache] ✅ ${availability.length} product availability rows cached`);
      }
      if (territories) {
        await offlineStorage.replaceAll(STORES.TERRITORIES_LOOKUP, territories);
        console.log(`[Cache] ✅ ${territories.length} territories cached`);
      }
      onProgress?.('productAvailability', 'done');
    } catch (error) {
      console.error('[Cache] Error caching product availability, keeping existing cache:', error);
      onProgress?.('productAvailability', 'error');
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

      // Only clear and update cache if fetch succeeded (single batched write)
      if (beatPlans) {
        await offlineStorage.replaceAll(STORES.BEAT_PLANS, beatPlans);
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
        await offlineStorage.replaceAll(STORES.VISITS, visits);
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
        await offlineStorage.replaceAll(STORES.ORDERS, orders);
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
      await cacheUomData(onProgress);
      await cacheOrgData(onProgress);
      await cacheBeats(onProgress);
      await cacheRetailers(onProgress);
      await cacheBeatPlans(onProgress);
      await cacheCompetitionData(onProgress);
      await cacheProductAvailability(onProgress);
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
  }, [user, cacheProducts, cacheSchemes, cacheUomData, cacheOrgData, cacheBeats, cacheRetailers, cacheBeatPlans, cacheCompetitionData, cacheProductAvailability, cacheVisits, cacheOrders]);


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
      // PAGINATED to load EVERY active product/variant (no 1k cap)
      const products = await fetchAllPaginated<any>((from, to) =>
        supabase.from('products').select(`${PRODUCT_PICKER_COLUMNS}, category:product_categories(name)`).or('is_active.eq.true,is_active.is.null').order('name').range(from, to)
      );
      const variants = await fetchAllPaginated<any>((from, to) =>
        supabase.from('product_variants').select('*').or('is_active.eq.true,is_active.is.null').range(from, to)
      );
      if (products) {
        await offlineStorage.replaceAll(STORES.PRODUCTS, products);
      }
      if (variants) {
        await offlineStorage.replaceAll(STORES.VARIANTS, variants);
      }
      summary.products = (products?.length || 0) + (variants?.length || 0);
      onItemCount?.('products', summary.products);
      onProgress('products', 'done');

      // Schemes
      onProgress('schemes', 'loading');
      const { data: schemes } = await supabase.from('product_schemes').select('*').or('is_active.eq.true,is_active.is.null');
      const { data: categories } = await supabase.from('product_categories').select('*');
      if (schemes) {
        await offlineStorage.replaceAll(STORES.SCHEMES, schemes);
      }
      if (categories) {
        await offlineStorage.replaceAll(STORES.CATEGORIES, categories);
      }
      summary.schemes = (schemes?.length || 0) + (categories?.length || 0);
      onItemCount?.('schemes', summary.schemes);
      onProgress('schemes', 'done');

      // UOM master + product UOM mappings (unit selector needs these offline)
      onProgress('uom', 'loading');
      try {
        await cacheUomData();
      } catch (e) {
        console.error('[Cache] UOM sync error:', e);
      }
      onProgress('uom', 'done');


      // Beats (owned + shared with access_type — mirrors AddRetailer online query)
      onProgress('beats', 'loading');
      const beatsNowIso = new Date().toISOString();
      const [ownedBeatsRes, sharedBeatsRes] = await Promise.all([
        supabase.from('beats').select('*').eq('is_active', true).eq('user_id', user.id),
        supabase
          .from('beat_user_access')
          .select('access_type, beat_id, effective_from, effective_to, is_active, beats:beats!beat_user_access_beat_id_fkey(*)')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .or(`effective_to.is.null,effective_to.gt.${beatsNowIso}`),
      ]);
      const WRITE_ACCESS_FULL = new Set(['OWNED', 'CO_OWNER', 'OPERATIONAL', 'COVERAGE']);
      const beatsById = new Map<string, any>();
      for (const b of (ownedBeatsRes.data ?? [])) {
        beatsById.set(b.beat_id, { ...b, access_type: 'OWNED' });
      }
      for (const row of ((sharedBeatsRes.data ?? []) as any[])) {
        const at = String(row.access_type || '').toUpperCase();
        if (!WRITE_ACCESS_FULL.has(at)) continue;
        const beat = row.beats;
        if (!beat?.beat_id || beat.is_active === false) continue;
        if (beatsById.has(beat.beat_id)) continue;
        beatsById.set(beat.beat_id, { ...beat, access_type: at });
      }
      const beats = Array.from(beatsById.values());
      await offlineStorage.replaceAll(STORES.BEATS, beats);
      summary.beats = beats.length;
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
        await offlineStorage.replaceAll(STORES.BEAT_PLANS, beatPlans);
      }
      summary.beatPlans = beatPlans?.length || 0;
      onItemCount?.('beatPlans', summary.beatPlans);
      onProgress('beatPlans', 'done');

      // Competition
      onProgress('competition', 'loading');
      const { data: competitors } = await supabase.from('competition_master').select('*');
      const { data: skus } = await supabase.from('competition_skus').select('*').eq('is_active', true);
      if (competitors) {
        await offlineStorage.replaceAll(STORES.COMPETITION_MASTER, competitors);
      }
      if (skus) {
        await offlineStorage.replaceAll(STORES.COMPETITION_SKUS, skus);
      }
      summary.competition = (competitors?.length || 0) + (skus?.length || 0);
      onItemCount?.('competition', summary.competition);
      onProgress('competition', 'done');

      // Today's Visits - FIX: Use local date
      onProgress('visits', 'loading');
      const { data: visits } = await supabase.from('visits').select('*').eq('user_id', user.id).eq('planned_date', todayStr);
      if (visits) {
        await offlineStorage.replaceAll(STORES.VISITS, visits);
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
        await offlineStorage.replaceAll(STORES.ORDERS, orders);
      }
      summary.orders = orders?.length || 0;
      onItemCount?.('orders', summary.orders);
      onProgress('orders', 'done');

      // Phase 7-1: product availability + territories lookup (best-effort).
      try {
        await cacheProductAvailability(onProgress);
      } catch (e) {
        console.warn('[Cache] availability sync (full) failed:', e);
      }

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
  }, [user, cacheProductAvailability]);

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
      
      // Phase 2: IMPORTANT - Load products, schemes, availability rules (order entry)
      console.log('[Cache] Phase 2: Loading important data (products + schemes + availability)...');
      await Promise.all([
        cacheProducts(),
        cacheSchemes(),
        cacheUomData(),
        cacheOrgData(),
        cacheProductAvailability()
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
  }, [isOnline, user, cacheProducts, cacheSchemes, cacheUomData, cacheOrgData, cacheBeats, cacheRetailers, cacheBeatPlans, cacheCompetitionData, cacheProductAvailability]);


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
        cacheUomData(),
        cacheOrgData(),
        cacheBeats(),
        cacheRetailers(),
        cacheBeatPlans(),
        cacheCompetitionData(),
        cacheProductAvailability()
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
  }, [user, cacheProducts, cacheSchemes, cacheUomData, cacheOrgData, cacheBeats, cacheRetailers, cacheBeatPlans, cacheCompetitionData, cacheProductAvailability]);


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
    
    const cachedSchemaVersion = localStorage.getItem('master_cache_schema_version');
    const schemaChanged = cachedSchemaVersion !== MASTER_CACHE_SCHEMA_VERSION;

    if (isOnline) {
      if (schemaChanged) {
        console.log('[Cache] Schema version changed, forcing one-time re-warm...');
        forceRefreshMasterData();
        localStorage.setItem('master_cache_schema_version', MASTER_CACHE_SCHEMA_VERSION);
      } else if (!lastCached || parseInt(lastCached) < fourHoursAgo) {
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
    cacheUomData,
    cacheBeats,
    cacheRetailers,
    cacheBeatPlans,
    cacheCompetitionData,
    cacheProductAvailability,
    cacheVisits,
    cacheOrders,
    cacheAllMasterData,
    forceRefreshMasterData,
    warmCacheWithProgress,
    fullOfflineSync,
    loadCachedData,
    // Phase 7-1 — exposed for the resolver (consumed in Phase 7-3).
    availabilityByProductId,
    territoriesById,
    reloadAvailabilityMaps,
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
