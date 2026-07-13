/**
 * useOfflineQuery — reactive reads from the offline store (Offline Architecture v2 · Phase 4).
 *
 * Reads a store via offlineStorage (SQLite when v2 is on) and re-runs automatically
 * whenever that store changes (emitOfflineChange). Makes the local DB a single,
 * reactive source of truth — pending amount, unit lists, order items, etc. become
 * derived queries instead of ad-hoc per-screen reconciliation.
 *
 * Additive & incremental: existing screens keep working; adopt this where you want
 * live updates. Usage:
 *   const products = useOfflineQuery<Product>(STORES.PRODUCTS);
 *   const line = useOfflineQuery(STORES.ORDERS, o => o.filter(x => x.retailer_id === id));
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { offlineStorage } from '@/lib/offlineStorage';

export function useOfflineQuery<T = any>(
  store: string,
  selector?: (items: T[]) => T[],
): { data: T[]; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const load = useCallback(async () => {
    try {
      const items = await offlineStorage.getAll<T>(store);
      const sel = selectorRef.current;
      setData(sel ? sel(items) : items);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    let alive = true;
    const run = () => { if (alive) load(); };
    run();
    const onChange = (e: Event) => {
      const changed = (e as CustomEvent).detail?.store;
      if (!changed || changed === store) run();
    };
    if (typeof window !== 'undefined') window.addEventListener('offlineStoreChanged', onChange);
    return () => {
      alive = false;
      if (typeof window !== 'undefined') window.removeEventListener('offlineStoreChanged', onChange);
    };
  }, [store, load]);

  return { data, loading, refresh: load };
}
