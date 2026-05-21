import { supabase } from '@/integrations/supabase/client';

type StateCountTable = 'retailer_external_db' | 'retailer_external_unsorted';

interface FetchStateCountsByStatesOptions {
  table: StateCountTable;
  column: 'state';
  states: string[];
}

export const normalizeStateName = (value: string | null | undefined) =>
  value?.trim().replace(/\s+/g, ' ').toUpperCase() ?? '';

export const fetchStateCountsByStates = async ({
  table,
  column,
  states,
}: FetchStateCountsByStatesOptions): Promise<Record<string, number>> => {
  const normalizedStates = Array.from(
    new Set(states.map((state) => normalizeStateName(state)).filter(Boolean))
  );

  if (normalizedStates.length === 0) {
    return {};
  }

  const counts = await Promise.all(
    normalizedStates.map(async (state) => {
      const { count, error } = await (supabase as any)
        .from(table)
        .select('*', { count: 'exact', head: true })
        .ilike(column, state);

      if (error) {
        throw error;
      }

      return [state, count ?? 0] as const;
    })
  );

  return Object.fromEntries(counts);
};
