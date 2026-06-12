import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Unit {
  id: string;
  code: string;
  name: string;
  category: string;
  is_base: boolean;
  is_system: boolean;
}

/**
 * Fetch all ENABLED units from uom_master table.
 * Only returns units where enabled_units.enabled = true
 * Units are cached in component state.
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
        // Join uom_master with enabled_units to get only enabled units
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
          // Map the result to flatten the structure
          const mappedUnits = data.map(item => ({
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
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to fetch units'));
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
