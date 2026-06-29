import { useState, useEffect, useCallback } from 'react';
import { offlineStorage, STORES } from '@/lib/offlineStorage';
import { supabase } from '@/integrations/supabase/client';

export interface ProductScheme {
  id: string;
  name: string;
  description: string | null;
  scheme_type: string;
  product_id: string | null;
  variant_id: string | null;
  discount_percentage: number | null;
  discount_amount: number | null;
  buy_quantity: number | null;
  buy_quantity_unit?: string | null;
  free_quantity: number | null;
  free_quantity_unit?: string | null;
  free_product_id: string | null;
  condition_quantity: number | null;
  condition_unit?: string | null;
  quantity_condition_type: string | null;
  min_order_value: number | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean | null;
  is_first_order_only: boolean | null;
  product_name?: string;
  free_product_name?: string;
  // Manual per-unit discount support
  max_discount_per_unit?: number | null;
  discount_unit?: string | null;
  discount_value_type?: string | null;
  // Multi-product targeting
  target_product_ids?: string[] | null;
}

export const useOfflineSchemes = () => {
  const [schemes, setSchemes] = useState<ProductScheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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

  // Sync schemes from Supabase
  const syncSchemesFromSupabase = useCallback(async () => {
    try {
      console.log('[useOfflineSchemes] Syncing schemes from Supabase...');
      const { data: schemesData, error } = await supabase
        .from('product_schemes')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!schemesData || schemesData.length === 0) {
        // Clear cache if no active schemes
        await offlineStorage.clear(STORES.SCHEMES);
        setSchemes([]);
        setLoading(false);
        return;
      }

      // Fetch product names for display
      const productIds = [...new Set(schemesData
        .map(s => s.product_id)
        .filter(Boolean))] as string[];
      
      const freeProductIds = [...new Set(schemesData
        .map(s => s.free_product_id)
        .filter(Boolean))] as string[];

      let productsMap: Record<string, string> = {};

      if (productIds.length > 0 || freeProductIds.length > 0) {
        const allProductIds = [...new Set([...productIds, ...freeProductIds])];
        const { data: productsData } = await supabase
          .from('products')
          .select('id, name')
          .in('id', allProductIds);
        
        productsMap = (productsData || []).reduce((acc, p) => {
          acc[p.id] = p.name;
          return acc;
        }, {} as Record<string, string>);
      }

      // Format schemes with product names - use "Unknown Product" fallback for better offline clarity
      const formattedSchemes: ProductScheme[] = schemesData.map(scheme => ({
        ...scheme,
        product_name: scheme.product_id ? productsMap[scheme.product_id] || 'Unknown Product' : 'All Products',
        free_product_name: scheme.free_product_id ? productsMap[scheme.free_product_id] || 'Unknown Product' : null,
      }));
      
      console.log('[useOfflineSchemes] Formatted schemes with product names:', formattedSchemes.length);

      // Clear old cache and save new schemes in a SINGLE batched write
      // (avoids N sequential awaited puts that froze the UI on large catalogs).
      await offlineStorage.replaceAll(STORES.SCHEMES, formattedSchemes);

      console.log('[useOfflineSchemes] Synced', formattedSchemes.length, 'schemes');
      setSchemes(formattedSchemes);
    } catch (error) {
      console.error('[useOfflineSchemes] Error syncing from Supabase:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load schemes with offline-first approach
  const loadSchemes = useCallback(async () => {
    setLoading(true);
    
    try {
      // 1. Try to load from cache first for instant display
      const cachedSchemes = await offlineStorage.getAll<ProductScheme>(STORES.SCHEMES);
      
      if (cachedSchemes && cachedSchemes.length > 0) {
        // Filter active schemes and set immediately
        const activeSchemes = cachedSchemes.filter(s => s.is_active !== false);
        setSchemes(activeSchemes);
        setLoading(false);
      }

      // 2. If online, sync from Supabase in background
      if (isOnline) {
        await syncSchemesFromSupabase();
      } else if (!cachedSchemes || cachedSchemes.length === 0) {
        // Offline with no cache
        setSchemes([]);
        setLoading(false);
      }
    } catch (error) {
      console.error('[useOfflineSchemes] Error loading schemes:', error);
      setLoading(false);
    }
  }, [isOnline, syncSchemesFromSupabase]);

  // REMOVED: Real-time subscription
  // Per offline-first architecture: Schemes should NOT update mid-order
  // Scheme changes apply on next app launch/manual refresh, not in real-time
  // This prevents mid-order price changes and UI flickering

  // Initial load
  useEffect(() => {
    loadSchemes();
  }, [loadSchemes]);

  return {
    schemes,
    loading,
    isOnline,
    refreshSchemes: loadSchemes
  };
};
