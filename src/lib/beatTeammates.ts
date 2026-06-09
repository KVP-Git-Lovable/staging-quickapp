import { supabase } from '@/integrations/supabase/client';

export interface TeammateInfo {
  userId: string;
  name: string;
}

export interface BeatTeammates {
  /** beat_id -> teammate user_ids active on that beat for the date */
  byBeat: Map<string, string[]>;
  /** unique teammate user_ids across all beats */
  userIds: string[];
  /** user_id -> display name (best-effort) */
  names: Map<string, string>;
}

/**
 * Resolves teammates for a set of beats on a specific date:
 *   - the beat owner (beats.user_id) if it isn't the current user
 *   - any user with an active beat_user_access row that overlaps the date
 *
 * Returns empty maps when there are no beats or no teammates.
 */
export async function getBeatTeammates(
  currentUserId: string,
  beatIds: string[],
  dateISO: string
): Promise<BeatTeammates> {
  const empty: BeatTeammates = { byBeat: new Map(), userIds: [], names: new Map() };
  if (!currentUserId || !beatIds.length) return empty;

  const byBeat = new Map<string, Set<string>>();
  const ensureSet = (beatId: string) => {
    let s = byBeat.get(beatId);
    if (!s) {
      s = new Set();
      byBeat.set(beatId, s);
    }
    return s;
  };

  try {
    // Owners of these beats (exclude self)
    const [ownersRes, sharesRes] = await Promise.all([
      supabase.from('beats').select('id, user_id').in('id', beatIds),
      supabase
        .from('beat_user_access')
        .select('beat_id, user_id, effective_from, effective_to, is_active, access_type')
        .in('beat_id', beatIds)
        .eq('is_active', true)
        .lte('effective_from', `${dateISO}T23:59:59.999Z`)
        .or(`effective_to.is.null,effective_to.gte.${dateISO}T00:00:00.000Z`),
    ]);

    (ownersRes.data || []).forEach((b: any) => {
      if (b.user_id && b.user_id !== currentUserId) ensureSet(b.id).add(b.user_id);
    });

    (sharesRes.data || []).forEach((row: any) => {
      if (row.user_id && row.user_id !== currentUserId && row.beat_id) {
        ensureSet(row.beat_id).add(row.user_id);
      }
    });

    const userIds = Array.from(new Set(Array.from(byBeat.values()).flatMap((s) => Array.from(s))));

    // Resolve display names (best effort; profiles.full_name)
    const names = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);
      (profiles || []).forEach((p: any) => {
        if (p?.user_id) names.set(p.user_id, p.full_name || 'Teammate');
      });
    }

    return {
      byBeat: new Map(Array.from(byBeat.entries()).map(([k, v]) => [k, Array.from(v)])),
      userIds,
      names,
    };
  } catch (e) {
    console.warn('[getBeatTeammates] failed', e);
    return empty;
  }
}
