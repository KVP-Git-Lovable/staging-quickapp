import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface BeatSharePeer {
  userId: string;
  name: string;
  beatIds: string[];
  beatNames: string[];
  /** Role of THIS peer on the shared beats ('OWNER' if the peer owns the beat we share). */
  roles: string[];
}

/**
 * Lists every user we currently share a beat with — symmetric, both directions:
 *  - owners of beats I was granted access to
 *  - grantees on beats I own (or was granted)
 *
 * Backed by public.get_beat_share_peers() which already enforces:
 *   is_active = true AND effective_from <= now() AND effective_to > now()
 *
 * Peers with no active share on any beat are excluded → no empty tabs.
 */
export function useBeatSharePeers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['beat-share-peers', user?.id],
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<BeatSharePeer[]> => {
      const { data, error } = await (supabase as any).rpc('get_beat_share_peers');
      if (error) {
        console.warn('[useBeatSharePeers] rpc failed', error);
        return [];
      }
      const rows = (data || []) as Array<{
        peer_user_id: string;
        peer_name: string | null;
        beat_id: string;
        beat_name: string | null;
        role: string | null;
      }>;
      const byUser = new Map<string, BeatSharePeer>();
      for (const r of rows) {
        if (!r.peer_user_id || !r.beat_id) continue;
        let entry = byUser.get(r.peer_user_id);
        if (!entry) {
          entry = {
            userId: r.peer_user_id,
            name: r.peer_name || 'Teammate',
            beatIds: [],
            beatNames: [],
            roles: [],
          };
          byUser.set(r.peer_user_id, entry);
        }
        if (!entry.beatIds.includes(r.beat_id)) {
          entry.beatIds.push(r.beat_id);
          entry.beatNames.push(r.beat_name || r.beat_id);
        }
        if (r.role && !entry.roles.includes(r.role)) entry.roles.push(r.role);
      }
      return Array.from(byUser.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    },
  });
}
