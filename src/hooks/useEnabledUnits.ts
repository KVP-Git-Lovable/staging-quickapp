import { useQuery } from '@tanstack/react-query';
import { loadEnabledUnits, type EnabledUnit, type UomCategory } from '@/lib/uomEngine';

export function useEnabledUnits(category?: UomCategory | null) {
  return useQuery<EnabledUnit[]>({
    queryKey: ['uom', 'enabled', category ?? '__ALL__'],
    queryFn: () => loadEnabledUnits(category ?? null),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
