import { offlineStorage, STORES } from '@/lib/offlineStorage';
import { supabase } from '@/integrations/supabase/client';
import { visitStatusCache } from '@/lib/visitStatusCache';
import { addOrderToSnapshot } from '@/lib/myVisitsSnapshot';
import { getLocalTodayDate } from '@/utils/dateUtils';
import { isSlowConnection } from '@/utils/internetSpeedCheck';
import { markVisitDataChanged } from '@/lib/visitChangeMarker';

const SYNC_TIMEOUT_MS = 5000; // 5 second timeout for all sync operations

// DUPLICATE FIX: Prevent multiple sync attempts for the same order in one session
const syncAttemptLock = new Map<string, number>(); // orderId -> timestamp
const LOCK_DURATION_MS = 30000; // 30 seconds lock per order

/**
 * Ensure an order payload carries beat_id, beat_name_snapshot and owner_id_snapshot.
 * These columns are set ONCE at creation and never updated; they preserve the
 * beat link, beat name and owner at the moment the order was taken, even if the
 * beat is later renamed or transferred. Safe to call on already-enriched
 * payloads (existing non-undefined values are preserved).
 */
export async function enrichWithBeatSnapshots(order: any): Promise<any> {
  if (!order || typeof order !== 'object') return order;
  const hasBeatId = order.beat_id !== undefined && order.beat_id !== null;
  const hasBeat = order.beat_name_snapshot !== undefined && order.beat_name_snapshot !== null;
  const hasOwner = order.owner_id_snapshot !== undefined && order.owner_id_snapshot !== null;
  if (hasBeatId && hasBeat && hasOwner) return order;
  if (!order.retailer_id) {
    return {
      ...order,
      beat_id: order.beat_id ?? null,
      beat_name_snapshot: order.beat_name_snapshot ?? null,
      owner_id_snapshot: order.owner_id_snapshot ?? null,
    };
  }

  let beatTextId: string | null = order.beat_id ?? null;
  let beatName: string | null = order.beat_name_snapshot ?? null;
  let ownerId: string | null = order.owner_id_snapshot ?? null;

  // Try IDB cache first for offline safety
  try {
    const cached = await offlineStorage.getAll<any>(STORES.RETAILERS).catch(() => [] as any[]);
    const match = (cached ?? []).find((r: any) => r.id === order.retailer_id);
    if (match) {
      if (!beatTextId) beatTextId = match.beat_id ?? null;
      if (!beatName) beatName = match.beat_name ?? null;
    }
  } catch { /* ignore */ }

  if (!beatTextId || !beatName) {
    try {
      const { data: r } = await supabase
        .from('retailers')
        .select('beat_id, beat_name')
        .eq('id', order.retailer_id)
        .maybeSingle();
      if (r) {
        if (!beatTextId) beatTextId = (r as any).beat_id ?? null;
        if (!beatName) beatName = (r as any).beat_name ?? null;
      }
    } catch { /* ignore */ }
  }

  if (beatTextId && (!ownerId || !beatName)) {
    try {
      const { data: b } = await supabase
        .from('beats')
        .select('owner_id, user_id, beat_name')
        .eq('beat_id', beatTextId)
        .maybeSingle();
      if (b) {
        ownerId = ownerId ?? (b as any).owner_id ?? (b as any).user_id ?? null;
        if (!beatName) beatName = (b as any).beat_name ?? null;
      }
    } catch { /* ignore */ }
  }

  return {
    ...order,
    beat_id: order.beat_id ?? beatTextId ?? null,
    beat_name_snapshot: order.beat_name_snapshot ?? beatName ?? null,
    owner_id_snapshot: order.owner_id_snapshot ?? ownerId ?? null,
  };
}


/**
 * Submit an order with offline support
 * Automatically falls back to offline mode on slow connections or timeouts
 * 5-second timeout auto-queues to offline sync if network is slow
 */
export async function submitOrderWithOfflineSupport(
  orderData: any,
  orderItems: any[],
  options: { 
    onOffline?: () => void;
    onOnline?: () => void;
    connectivityStatus?: 'online' | 'offline' | 'unknown';
  } = {}
) {
  // STEP 1: Generate order ID and prepare data FIRST
  const orderId = crypto.randomUUID();
  const orderDate = orderData.order_date || getLocalTodayDate();
  const orderValue = Math.round(Number(orderData.total_amount) || orderItems.reduce((sum, item) => sum + (Number(item.total) || 0), 0));

  const isValidUUID = (id?: string | null): boolean => {
    if (!id) return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  };

  // Inject beat/owner snapshots (set once at creation; never updated downstream)
  orderData = await enrichWithBeatSnapshots(orderData);

  const normalizedOrder = {
    ...orderData,
    id: orderId,
    total_amount: orderValue,
    order_date: orderDate,
    status: orderData.status || 'confirmed',
    created_at: new Date().toISOString(),
  };


  // Sanitize payload for direct DB insert (queue sync path already sanitizes separately)
  const { scheme_details, pending_amount, ...orderWithoutExtraFields } = normalizedOrder as any;
  const orderForDirectInsert: any = { ...orderWithoutExtraFields };
  if (orderForDirectInsert.visit_id && !isValidUUID(orderForDirectInsert.visit_id)) {
    delete orderForDirectInsert.visit_id;
  }

  const normalizedItems = orderItems.map(item => ({
    ...item,
    order_id: orderId
  }));

  // STEP 2: Save to local cache FIRST (await this for instant local display)
  // This ensures "Today's Order" section can show items immediately
  if (orderData.retailer_id && orderData.user_id) {
    try {
      // Save order with items to local storage (critical for immediate display)
      await offlineStorage.save(STORES.ORDERS, { ...normalizedOrder, items: normalizedItems });
    } catch (e) {
      // Non-critical - continue even if local save fails
    }
    
    // Fire-and-forget cache updates (these are secondary)
    Promise.allSettled([
      visitStatusCache.set(
        orderData.visit_id || orderId,
        orderData.retailer_id,
        orderData.user_id,
        orderDate,
        'productive',
        orderValue
      ),
      addOrderToSnapshot(orderData.user_id, orderDate, {
        id: orderId,
        retailer_id: orderData.retailer_id,
        user_id: orderData.user_id,
        total_amount: orderValue,
        order_date: orderDate,
        status: normalizedOrder.status,
        visit_id: orderData.visit_id,
      })
    ]);
    
    // STEP 3: Dispatch events IMMEDIATELY for instant UI update
    // Include COMPLETE order data with items for proper state updates
    window.dispatchEvent(new CustomEvent('visitStatusChanged', {
      detail: {
        visitId: orderData.visit_id || orderId,
        status: 'productive',
        retailerId: orderData.retailer_id,
        orderValue,
        order: {
          id: orderId,
          retailer_id: orderData.retailer_id,
          user_id: orderData.user_id,
          total_amount: orderValue,
          order_date: orderDate,
          status: 'confirmed',
          visit_id: orderData.visit_id || orderId,
          created_at: normalizedOrder.created_at,
          updated_at: normalizedOrder.created_at,
          items: normalizedItems // Include items for complete order data
        }
      }
    }));
    
    // Note: Removed visitDataChanged event - visitStatusChanged already handles immediate UI updates
    // visitDataChanged was causing redundant snapshot loads and potential delays
    
    // STEP 3.5: Mark data changed for cross-page state sync
    markVisitDataChanged(orderDate);
  }

  // STEP 4: Immediate sync when online, queue only when truly offline
  // Orders are critical - always attempt direct sync first
  const syncOrder = async () => {
    // DUPLICATE FIX: Check sync attempt lock
    const lastAttempt = syncAttemptLock.get(orderId);
    if (lastAttempt && Date.now() - lastAttempt < LOCK_DURATION_MS) {
      console.log('[offlineOrderUtils] Sync attempt locked for order:', orderId);
      return;
    }
    syncAttemptLock.set(orderId, Date.now());
    
    // Only queue to offline when genuinely offline (not on slow connections)
    if (!navigator.onLine) {
      console.log('📴 Device offline - queuing order for later sync:', orderId);
      await offlineStorage.addToSyncQueue('CREATE_ORDER', {
        order: normalizedOrder,
        items: normalizedItems,
        visitId: orderData.visit_id
      });
      options.onOffline?.();
      return;
    }

    try {
      const submitPromise = (async () => {
        // Atomic insert: order header + items in a single transaction.
        // Guarantees an order row can never exist without its items, which
        // prevents empty orders from falsely marking visits as productive.
        const { data: rpcResult, error: rpcError } = await supabase.rpc('sync_order_with_items', {
          p_order: { ...orderForDirectInsert, id: orderId },
          p_items: normalizedItems,
        });
        if (rpcError) throw rpcError;
        // CRITICAL: RPC returns HTTP success even on validation_error.
        // Treat anything other than 'ok'/'duplicate' as a hard failure so the order
        // is queued for retry and logged for support — never silently "synced".
        const status = (rpcResult as any)?.status;
        if (status !== 'ok' && status !== 'duplicate') {
          const errs = (rpcResult as any)?.errors || [(rpcResult as any)?.error || 'unknown_validation_error'];
          try {
            await supabase.from('failed_sync_log').upsert({
              idempotency_key: (orderForDirectInsert as any).idempotency_key || orderId,
              user_id: orderData.user_id,
              payload: { order: { ...orderForDirectInsert, id: orderId }, items: normalizedItems } as any,
              error: JSON.stringify(errs),
              retry_count: 0,
              last_failed_at: new Date().toISOString(),
            } as any, { onConflict: 'idempotency_key' });
          } catch (logErr) {
            console.warn('[offlineOrderUtils] failed_sync_log write failed (non-fatal):', logErr);
          }
          throw new Error(`RPC ${status || 'error'}: ${JSON.stringify(errs)}`);
        }
      })();
      
      
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('10s timeout')), 10000)
      );
      
      await Promise.race([submitPromise, timeoutPromise]);
      console.log('✅ Order synced immediately to database:', orderId);
      options.onOnline?.();
    } catch (syncError: any) {
      // On any error/timeout, queue for retry - never lose order data
      console.error(`⚠️ ORDER SYNC FAILED - queuing for retry:`, {
        orderId,
        retailerId: orderData.retailer_id,
        userId: orderData.user_id,
        totalAmount: orderValue,
        error: syncError?.message || syncError,
        timestamp: new Date().toISOString()
      });
      await offlineStorage.addToSyncQueue('CREATE_ORDER', {
        order: normalizedOrder,
        items: normalizedItems,
        visitId: orderData.visit_id
      });
      // Only show "Saved Offline" toast when genuinely offline
      // If device is online but sync failed (timeout/server error), 
      // silently queue - don't alarm the user with a false offline message
      if (!navigator.onLine) {
        options.onOffline?.();
      } else {
        // Device is online but sync failed - show success since data is safely cached
        // The sync queue will retry automatically in the background
        console.log('📡 Order queued for background retry (device is online, sync will retry)');
        options.onOnline?.();
      }
    }
  };

  // Start sync immediately (non-blocking - don't await, let UI return instantly)
  syncOrder();

  // Return IMMEDIATELY - don't wait for network
  return { 
    success: true, 
    offline: !navigator.onLine || options.connectivityStatus === 'offline', 
    order: normalizedOrder 
  };
}

/**
 * Fetch products with offline caching support
 * Uses timeout to fall back to cache on slow connections
 * @returns Products data from online or cache
 */
export async function fetchProductsWithOfflineSupport() {
  const isOnline = navigator.onLine;
  const slowConnection = isSlowConnection();
  
  // On slow connections or offline, use cache directly for instant response
  if (!isOnline || slowConnection) {
    console.log(slowConnection ? '📶 Slow connection - using cached products' : '📴 Offline - using cached products');
    return loadProductsFromCache();
  }
  
  // Online with good connection: try to fetch with timeout
  try {
    const timeoutMs = 8000; // 8 second timeout for product fetch
    
    const fetchPromise = (async () => {
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select(`
          *,
          category:product_categories(name)
        `)
        .eq('is_active', true)
        .order('name');

      if (productsError) throw productsError;

      // Fetch schemes and variants in parallel for speed
      const [schemesResult, variantsResult] = await Promise.all([
        supabase.from('product_schemes').select('*').eq('is_active', true),
        supabase.from('product_variants').select('*').eq('is_active', true)
      ]);

      const schemesData = schemesResult.data;
      const variantsData = variantsResult.data;

      // Enrich products
      const enrichedProducts = (productsData || []).map((product: any) => ({
        ...product,
        schemes: (schemesData || []).filter((s: any) => s.product_id === product.id),
        variants: (variantsData || []).filter((v: any) => v.product_id === product.id)
      }));

      // Cache for offline use (fire and forget - don't block return)
      cacheProductsInBackground(enrichedProducts, variantsData || [], schemesData || []);

      return {
        products: enrichedProducts,
        fromCache: false
      };
    })();
    
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Product fetch timeout')), timeoutMs)
    );
    
    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch (error: any) {
    console.warn('⚠️ Product fetch failed/timeout, using cache:', error.message);
    return loadProductsFromCache();
  }
}

/**
 * Load products from offline cache
 */
async function loadProductsFromCache() {
  const cachedProducts = await offlineStorage.getAll(STORES.PRODUCTS);
  const cachedVariants = await offlineStorage.getAll(STORES.VARIANTS);
  const cachedSchemes = await offlineStorage.getAll(STORES.SCHEMES);

  // Filter only active products and their active variants/schemes
  const activeProducts = (cachedProducts || []).filter((p: any) => p.is_active === true);
  const activeVariants = (cachedVariants || []).filter((v: any) => v.is_active === true);
  const activeSchemes = (cachedSchemes || []).filter((s: any) => s.is_active === true);

  const enrichedProducts = activeProducts.map((product: any) => ({
    ...product,
    variants: activeVariants.filter((v: any) => v.product_id === product.id),
    schemes: activeSchemes.filter((s: any) => s.product_id === product.id)
  }));

  return {
    products: enrichedProducts,
    fromCache: true
  };
}

/**
 * Cache products in background (non-blocking)
 */
function cacheProductsInBackground(products: any[], variants: any[], schemes: any[]) {
  // Use setTimeout to not block the main thread
  setTimeout(async () => {
    try {
      for (const product of products) {
        await offlineStorage.save(STORES.PRODUCTS, product);
      }
      for (const variant of variants) {
        await offlineStorage.save(STORES.VARIANTS, variant);
      }
      for (const scheme of schemes) {
        await offlineStorage.save(STORES.SCHEMES, scheme);
      }
      console.log('✅ Products cached for offline use');
    } catch (error) {
      console.warn('⚠️ Failed to cache products:', error);
    }
  }, 100);
}
