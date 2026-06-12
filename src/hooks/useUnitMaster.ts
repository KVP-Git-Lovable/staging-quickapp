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
 * Fetch all units from uom_master table.
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
        const { data, error: fetchError } = await supabase
          .from('uom_master')
          .select('id, code, name, category, is_base, is_system')
          .order('name');

        if (fetchError) throw fetchError;
        if (!cancelled && data) {
          setUnits(data as Unit[]);
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
