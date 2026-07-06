import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getLocalTodayDate } from '@/utils/dateUtils';

const sb = supabase as any;

/**
 * Beat IDs the current user is "in-plan" for today. Union of:
 *  - daily_beat_plans (assigned_user_id, plan_date, active)
 *  - beat_plans (user_id, plan_date)
 *  - permanent ownership: beats.user_id = me OR beats.owner_id = me (active)
 *
 * Used to decide whether a chosen retailer is out-of-beat.
 */
export function useTodaysBeatIds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['todays-beat-ids', user?.id, getLocalTodayDate()],
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<Set<string>> => {
      if (!user?.id) return new Set();
      const today = getLocalTodayDate();
      const uid = user.id;

      const [dailyRes, planRes, ownedByUserRes, ownedByOwnerRes] = await Promise.all([
        sb.from('daily_beat_plans')
          .select('beat_id')
          .eq('assigned_user_id', uid)
          .eq('plan_date', today)
          .eq('status', 'active'),
        sb.from('beat_plans')
          .select('beat_id')
          .eq('user_id', uid)
          .eq('plan_date', today),
        supabase.from('beats')
          .select('beat_id')
          .eq('user_id', uid)
          .eq('is_active', true),
        supabase.from('beats')
          .select('beat_id')
          .eq('owner_id', uid)
          .eq('is_active', true),
      ]);

      const set = new Set<string>();
      (dailyRes.data || []).forEach((r: any) => r.beat_id && set.add(r.beat_id));
      (planRes.data || []).forEach((r: any) => r.beat_id && set.add(r.beat_id));
      (ownedByUserRes.data || []).forEach((r: any) => r.beat_id && set.add(r.beat_id));
      (ownedByOwnerRes.data || []).forEach((r: any) => r.beat_id && set.add(r.beat_id));
      return set;
    },
  });
}
