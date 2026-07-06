import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Territory IDs derived from beats the current user owns
 * (beats.user_id = me OR beats.owner_id = me, is_active).
 * Used to widen the retailer picker when oob_visibility is 'territory' or 'all'.
 */
export function useMyTerritoryIds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-territory-ids', user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      if (!user?.id) return [];
      const uid = user.id;
      const [a, b] = await Promise.all([
        supabase.from('beats').select('territory_id').eq('user_id', uid).eq('is_active', true),
        supabase.from('beats').select('territory_id').eq('owner_id', uid).eq('is_active', true),
      ]);
      const set = new Set<string>();
      (a.data || []).forEach((r: any) => r.territory_id && set.add(r.territory_id));
      (b.data || []).forEach((r: any) => r.territory_id && set.add(r.territory_id));
      return Array.from(set);
    },
  });
}
