import { useCallback, useEffect, useRef, useState } from 'react';
import { useFeature } from '@/hooks/useFeature';
import { useAuth } from '@/hooks/useAuth';
import { useConnectivity } from '@/hooks/useConnectivity';
import {
  fetchAndCacheRetailerPrices,
  getCachedRetailerPrices,
  pickPriceRow,
  type ResolvedPriceRow,
} from '@/lib/priceBookCache';

/**
 * Phase 3 — price-book pricing for order entry.
 * Behind the `price_books_enabled` feature flag. When the flag is OFF, or when
 * no cached row matches, callers must fall back to the product default price.
 */
export function usePriceBookPrices(retailerId?: string | null) {
  const { enabled } = useFeature('price_books_enabled');
  const { user } = useAuth();
  const connectivity = useConnectivity();
  const isOnline = connectivity === 'online';
  const [rows, setRows] = useState<ResolvedPriceRow[] | null>(null);
  const rowsRef = useRef<ResolvedPriceRow[] | null>(null);
  rowsRef.current = rows;

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !retailerId) {
      setRows(null);
      return;
    }

    (async () => {
      // 1) Offline-first: serve whatever is cached immediately.
      const cached = await getCachedRetailerPrices(retailerId);
      if (!cancelled && cached) setRows(cached);

      // 2) Refresh in the background when online (never blocks order entry).
      if (isOnline) {
        const fresh = await fetchAndCacheRetailerPrices(retailerId, user?.id ?? null);
        if (!cancelled && fresh) setRows(fresh);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, retailerId, isOnline, user?.id]);

  /** Returns the matching price-book row for a line, or null to use the default price. */
  const resolveLinePrice = useCallback(
    (productId: string, variantId: string | null | undefined, quantity: number) => {
      if (!enabled) return null;
      return pickPriceRow(rowsRef.current, productId, variantId, quantity);
    },
    [enabled],
  );

  return { enabled, rows, resolveLinePrice };
}
