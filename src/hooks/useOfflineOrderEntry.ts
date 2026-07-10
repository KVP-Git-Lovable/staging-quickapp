import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { offlineStorage, STORES } from '@/lib/offlineStorage';
import { submitOrderWithOfflineSupport } from '@/utils/offlineOrderUtils';
import { fetchAllPaginated } from '@/utils/fetchAllPaginated';

interface Product {
  id: string;
  sku: string;
  name: string;
  category: { name: string } | null;
  rate: number;
  unit: string;
  base_unit?: string;
  closing_stock: number;
  schemes?: any[];
  variants?: any[];
}

/**
 * PRODUCT DISPLAY FLOW - ESTABLISHED STANDARD
 * 
 * This hook manages the complete product lifecycle from Product Master to Order Entry.
 * 
 * ACTIVE PRODUCT RULES:
 * - Products/variants with is_active = true OR null/undefined → SHOWN
 * - Products/variants with is_active = false → HIDDEN
 * - When new products are added to Product Master with active status, they automatically appear
 * 
 * DISPLAY NAMING CONVENTION (SYSTEM-WIDE):
 * - Base products (no variants): Display product.name
 * - Base products (with variants): Display product.name + all active variants
 * - Product variants: Display ONLY variant.variant_name (NOT "product.name - variant.variant_name")
 * 
 * SYNC FLOW:
 * 1. Product added/updated in Product Master (is_active = true)
 * 2. syncProductsInBackground() fetches and caches to IndexedDB
 * 3. Order Entry loads from cache instantly
 * 4. TableOrderForm dropdown shows all active products + variants
 * 5. Van Stock Management shows same products
 * 
 * This ensures consistent product display across:
 * - Order Entry (grid and table modes)
 * - Van Stock Management
 * - Cart
 * - Invoices
 */
export function useOfflineOrderEntry() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false); // CRITICAL: Start with false - don't block UI
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const hasFetchedRef = useRef(false);
  const isFetchingRef = useRef(false);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Background sync function - defined before fetchProducts
  const syncProductsInBackground = async () => {
    try {
      // Fetch all products where is_active is true OR null (PAGINATED — no 1k cap)
      const productsData = await fetchAllPaginated<any>((from, to) =>
        supabase
          .from('products')
          .select(`*, category:product_categories(name)`)
          .or('is_active.eq.true,is_active.is.null')
          .order('name')
          .range(from, to)
      );

      // Fetch all active schemes (is_active true or null) — paginated
      const schemesData = await fetchAllPaginated<any>((from, to) =>
        supabase
          .from('product_schemes')
          .select('*')
          .or('is_active.eq.true,is_active.is.null')
          .range(from, to)
      );

      // Fetch all active variants (paginated)
      const variantsData = await fetchAllPaginated<any>((from, to) =>
        supabase
          .from('product_variants')
          .select('*')
          .or('is_active.eq.true,is_active.is.null')
          .range(from, to)
      );

      const variantsByProductId = new Map<string, any[]>();

      (variantsData || []).forEach((variant: any) => {
        if (!variant?.product_id) return;
        const existing = variantsByProductId.get(variant.product_id) || [];
        existing.push(variant);
        variantsByProductId.set(variant.product_id, existing);
      });

      const enrichedProducts = (productsData || []).map((product: any) => ({
        ...product,
        schemes: (schemesData || []).filter((s: any) => s.product_id === product.id),
        variants: variantsByProductId.get(product.id) || []
      }));

      setProducts(enrichedProducts);
      setLoading(false);

      // Cache for offline use — BATCH writes (single underlying write per store)
      // to avoid the multi-second freeze caused by N awaited per-row puts.
      offlineStorage.replaceAll(STORES.PRODUCTS, enrichedProducts).catch(err =>
        console.warn('[useOfflineOrderEntry] cache products failed', err));
      offlineStorage.replaceAll(STORES.VARIANTS, variantsData || []).catch(err =>
        console.warn('[useOfflineOrderEntry] cache variants failed', err));
      offlineStorage.replaceAll(STORES.SCHEMES, schemesData || []).catch(err =>
        console.warn('[useOfflineOrderEntry] cache schemes failed', err));

      console.log(`✅ Synced ${enrichedProducts.length} products from network (background)`);
    } catch (error) {
      console.error('Background sync error:', error);
    }
  };

  // Fetch products with offline support - instant cache load, NO network blocking
  const fetchProducts = useCallback(async () => {
    // Prevent multiple simultaneous fetches
    if (isFetchingRef.current) {
      console.log('⏸️ Fetch already in progress, skipping...');
      return;
    }

    // Don't refetch if we already have products loaded
    if (hasFetchedRef.current) {
      console.log('✅ Products already loaded, skipping refetch');
      return;
    }

    isFetchingRef.current = true;
    
    // CRITICAL: Set loading false immediately - don't block UI
    // This ensures the page renders instantly even if cache operations take time
    setLoading(false);

    try {
      // 1. Load from cache INSTANTLY - no loading state blocking
      const cachedProducts = await offlineStorage.getAll(STORES.PRODUCTS);
      const cachedVariants = await offlineStorage.getAll(STORES.VARIANTS);
      const cachedSchemes = await offlineStorage.getAll(STORES.SCHEMES);

      const cachedCategories = await offlineStorage.getAll<any>(STORES.CATEGORIES);
      const categoryNameById = new Map((cachedCategories || []).map((c: any) => [c.id, c.name]));

      if (cachedProducts.length > 0) {
        // Filter only active products: is_active must be true or null/undefined (never false)
        const activeProducts = (cachedProducts || []).filter((p: any) => p.is_active !== false);
        const activeVariants = (cachedVariants || []).filter((v: any) => v.is_active !== false && !!v.product_id);
        const activeSchemes = (cachedSchemes || []).filter((s: any) => s.is_active !== false);

        const variantsByProductId = new Map<string, any[]>();
        activeVariants.forEach((variant: any) => {
          const existing = variantsByProductId.get(variant.product_id) || [];
          existing.push(variant);
          variantsByProductId.set(variant.product_id, existing);
        });
        
        const enrichedProducts = activeProducts.map((product: any) => ({
          ...product,
          category: product.category ?? (product.category_id
            ? { name: categoryNameById.get(product.category_id) || 'Uncategorized' }
            : null),
          variants: variantsByProductId.get(product.id) || [],
          schemes: activeSchemes.filter((s: any) => s.product_id === product.id)
        }));
        setProducts(enrichedProducts);
        hasFetchedRef.current = true;
        console.log(`✅ Loaded ${enrichedProducts.length} active products from cache instantly`);
        
        // Background sync if online - DO NOT await, fire and forget
        if (isOnline) {
          // Use requestIdleCallback or setTimeout to not block main thread
          requestIdleCallback?.(() => {
            syncProductsInBackground().catch(err => 
              console.error('Background sync failed:', err)
            );
          }) || setTimeout(() => {
            syncProductsInBackground().catch(err => 
              console.error('Background sync failed:', err)
            );
          }, 100);
        }
      } else {
        // No cache - still don't block, fetch in background
        console.log('📦 No cached products, fetching from network in background...');
        
        // CRITICAL: Don't await - fetch in background without blocking
        if (isOnline) {
          syncProductsInBackground().then(() => {
            hasFetchedRef.current = true;
          }).catch(err => {
            console.error('Background sync failed:', err);
          });
        }
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      
      // Try fallback to cache on error - non-blocking
      try {
        const cachedProducts = await offlineStorage.getAll(STORES.PRODUCTS);
        const cachedVariants = await offlineStorage.getAll(STORES.VARIANTS);
        const cachedSchemes = await offlineStorage.getAll(STORES.SCHEMES);

        const cachedCategories = await offlineStorage.getAll<any>(STORES.CATEGORIES);
        const categoryNameById = new Map((cachedCategories || []).map((c: any) => [c.id, c.name]));

        if (cachedProducts.length > 0) {
          const activeProducts = (cachedProducts || []).filter((p: any) => p.is_active !== false);
          const activeVariants = (cachedVariants || []).filter((v: any) => v.is_active !== false && !!v.product_id);
          const activeSchemes = (cachedSchemes || []).filter((s: any) => s.is_active !== false);

          const variantsByProductId = new Map<string, any[]>();
          activeVariants.forEach((variant: any) => {
            const existing = variantsByProductId.get(variant.product_id) || [];
            existing.push(variant);
            variantsByProductId.set(variant.product_id, existing);
          });
          
          const enrichedProducts = activeProducts.map((product: any) => ({
            ...product,
            category: product.category ?? (product.category_id
              ? { name: categoryNameById.get(product.category_id) || 'Uncategorized' }
              : null),
            variants: variantsByProductId.get(product.id) || [],
            schemes: activeSchemes.filter((s: any) => s.product_id === product.id)
          }));
          setProducts(enrichedProducts);
          hasFetchedRef.current = true;
        }
      } catch (cacheError) {
        console.error('Cache fallback also failed:', cacheError);
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [isOnline]);

  // Route all order saves through the shared atomic order+items flow.
  // This prevents header-only orders if item insertion fails on any screen.
  const submitOrder = async (orderData: any, orderItems: any[]) => {
    return submitOrderWithOfflineSupport(orderData, orderItems, {
      connectivityStatus: isOnline ? 'online' : 'offline',
      onOffline: () => {
        console.log('[useOfflineOrderEntry] Order queued safely for background sync');
      },
      onOnline: () => {
        console.log('[useOfflineOrderEntry] Order persisted via atomic sync flow');
      },
    });
  };

  // Force the next fetchProducts() to actually re-read the cache and re-sync,
  // bypassing the hasFetchedRef de-dupe guard. Used by the "Refresh products"
  // button so newly-added rows in the cache propagate to the picker.
  const resetFetchGuard = useCallback(() => {
    hasFetchedRef.current = false;
  }, []);

  // Auto-react to a global "masterDataRefreshed" event (dispatched by
  // useMasterDataCache.forceRefreshMasterData) so background refreshes that
  // happen elsewhere in the app also update the order-entry product list.
  useEffect(() => {
    const handler = () => {
      hasFetchedRef.current = false;
      fetchProducts().catch(err => console.warn('[useOfflineOrderEntry] reload after masterDataRefreshed failed', err));
    };
    window.addEventListener('masterDataRefreshed', handler);
    return () => window.removeEventListener('masterDataRefreshed', handler);
  }, [fetchProducts]);

  return {
    products,
    loading,
    isOnline,
    fetchProducts,
    resetFetchGuard,
    submitOrder
  };
}
