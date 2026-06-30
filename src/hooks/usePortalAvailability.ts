/**
 * Phase 7-3: portal-side availability data.
 *
 * For portals that fetch their own products (customer portal, distributor
 * portal) without going through useMasterDataCache. Pulls
 * `product_availability` + the minimal `territories(id, region, zone)` lookup
 * and returns ready-to-use maps. Also enriches a passed-in retailer with
 * `state` (and falls back to its territory's region/zone) so callers can
 * build a RetailerContext without an extra round-trip.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaginated } from '@/utils/fetchAllPaginated';
import type {
  AvailabilityRow,
  TerritoryLookupEntry,
} from '@/utils/productAvailability';

export interface PortalAvailability {
  availabilityByProductId: Map<string, AvailabilityRow[]>;
  territoriesById: Map<string, TerritoryLookupEntry>;
  loading: boolean;
}

export function usePortalAvailability(): PortalAvailability {
  const [availabilityByProductId, setAvail] = useState<Map<string, AvailabilityRow[]>>(new Map());
  const [territoriesById, setTerrs] = useState<Map<string, TerritoryLookupEntry>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rules, terrs] = await Promise.all([
          fetchAllPaginated<AvailabilityRow>((from, to) =>
            supabase
              .from('product_availability')
              .select('product_id, scope_type, scope_value, mode')
              .range(from, to)
          ),
          fetchAllPaginated<{ id: string; region: string | null; zone: string | null }>(
            (from, to) =>
              supabase.from('territories').select('id, region, zone').range(from, to)
          ),
        ]);
        if (cancelled) return;
        const byProduct = new Map<string, AvailabilityRow[]>();
        for (const r of rules ?? []) {
          const list = byProduct.get(r.product_id) ?? [];
          list.push(r as AvailabilityRow);
          byProduct.set(r.product_id, list);
        }
        const tMap = new Map<string, TerritoryLookupEntry>();
        for (const t of terrs ?? []) {
          tMap.set(t.id, { region: t.region, zone: t.zone });
        }
        setAvail(byProduct);
        setTerrs(tMap);
      } catch (err) {
        console.warn('[usePortalAvailability] load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { availabilityByProductId, territoriesById, loading };
}

/**
 * Fetch a retailer's `state` (plus pass-through fields). Falls back to null
 * when not found. Use to enrich a CustomerPortalUser before buildRetailerContext.
 */
export function useRetailerStateLookup(retailerId: string | null | undefined) {
  const [state, setState] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!retailerId) {
      setState(null);
      return;
    }
    (async () => {
      try {
        const { data } = await supabase
          .from('retailers')
          .select('state')
          .eq('id', retailerId)
          .maybeSingle();
        if (!cancelled) setState((data as any)?.state ?? null);
      } catch {
        if (!cancelled) setState(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retailerId]);

  return state;
}
