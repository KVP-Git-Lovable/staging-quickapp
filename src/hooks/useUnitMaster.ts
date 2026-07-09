import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { offlineStorage, STORES } from '@/lib/offlineStorage';

export interface Unit {
  id: string;
  code: string;
  name: string;
  category: string;
  is_base: boolean;
  is_system: boolean;
}

async function loadUnitsFromCache(): Promise<Unit[]> {
  try {
    const cached = await offlineStorage.getAll<Unit>(STORES.UOM_MASTER);
    return (cached || []).map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      category: r.category,
      is_base: !!r.is_base,
      is_system: !!r.is_system,
    }));
  } catch (err) {
    console.warn('[useUnitMaster] Failed to load units from offline cache:', err);
    return [];
  }
}

/**
 * Fetch all ENABLED units from uom_master table.
 * Only returns units where enabled_units.enabled = true.
 * Falls back to the offline cache (STORES.UOM_MASTER) when offline
 * or when the Supabase fetch fails.
 */
export function useUnitMaster() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        // Offline: read directly from the offline cache — no network attempt.
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          const cached = await loadUnitsFromCache();
          if (!cancelled) setUnits(cached);
          return;
        }

        const { data, error: fetchError } = await supabase
          .from('uom_master')
          .select(`
            id,
            code,
            name,
            category,
            is_base,
            is_system,
            enabled_units!inner(enabled)
          `)
          .eq('enabled_units.enabled', true)
          .order('name');

        if (fetchError) throw fetchError;

        if (!cancelled && data) {
          const mappedUnits = data.map((item) => ({
            id: item.id,
            code: item.code,
            name: item.name,
            category: item.category,
            is_base: item.is_base,
            is_system: item.is_system,
          })) as Unit[];

          setUnits(mappedUnits);
        }
      } catch (err) {
        // Network / RLS / any other error → fall back to offline cache
        const cached = await loadUnitsFromCache();
        if (!cancelled) {
          if (cached.length > 0) {
            setUnits(cached);
          } else {
            setError(err instanceof Error ? err : new Error('Failed to fetch units'));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { units, loading, error };
}
