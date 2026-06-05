import { supabase } from '@/integrations/supabase/client';

export type AccessType = 'OWNED' | 'CO_OWNER' | 'OPERATIONAL' | 'VIEW_ONLY' | 'COVERAGE';

export interface BeatWithAccess {
  id: string;
  beat_id: string;
  beat_name: string;
  category: string | null;
  travel_allowance: number | null;
  average_km: number | null;
  average_time_minutes: number | null;
  is_active: boolean;
  user_id: string | null;
  owner_id: string | null;
  owner_name: string | null;
  territory_id: string | null;
  distributor_id: string | null;
  created_at: string;
  updated_at: string;
  accessType: AccessType;
  [key: string]: any;
}

export interface BeatStats {
  total: number;
  active: number;
  inactive: number;
  sharedWithMe: number;
  covering: number;
  emptyBeats: number;
}


export interface BeatHistory {
  ownership: any[];
  retailerTransfers: any[];
  coverage: any[];
}

function throwIfError(error: any, context: string) {
  if (error) {
    console.error(`[beatService.${context}]`, error);
    throw error;
  }
}

async function resolveBeatTextId(beatId: string): Promise<{ beat_id: string; beat_name: string; user_id: string | null }> {
  const { data, error } = await supabase
    .from('beats')
    .select('beat_id, beat_name, user_id')
    .eq('beat_id', beatId)
    .maybeSingle();
  throwIfError(error, 'resolveBeatTextId');
  if (!data) throw new Error(`Beat not found: ${beatId}`);
  return data as any;
}

async function getProfileName(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('full_name, name')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as any)?.full_name ?? (data as any)?.name ?? null;
}

// 1. getMyBeats
export async function getMyBeats(userId: string): Promise<BeatWithAccess[]> {
  const nowIso = new Date().toISOString();

  const [ownedRes, accessRes] = await Promise.all([
    supabase.from('beats').select('*').eq('user_id', userId),
    supabase
      .from('beat_user_access')
      .select('access_type, beat_id, effective_to, is_active, beats:beats!beat_user_access_beat_id_fkey(*)')
      .eq('user_id', userId)
      .eq('is_active', true)
      .or(`effective_to.is.null,effective_to.gt.${nowIso}`),
  ]);

  throwIfError(ownedRes.error, 'getMyBeats.owned');
  // Fallback if FK relation name differs: try second query without alias
  let accessRows: any[] = accessRes.data ?? [];
  if (accessRes.error) {
    const alt = await supabase
      .from('beat_user_access')
      .select('access_type, beat_id, effective_to, is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .or(`effective_to.is.null,effective_to.gt.${nowIso}`);
    throwIfError(alt.error, 'getMyBeats.access');
    const textIds = (alt.data ?? []).map((r: any) => r.beat_id);
    if (textIds.length) {
      const { data: beatRows, error: beatErr } = await supabase
        .from('beats')
        .select('*')
        .in('beat_id', textIds);
      throwIfError(beatErr, 'getMyBeats.access.beats');
      accessRows = (alt.data ?? []).map((r: any) => ({
        ...r,
        beats: (beatRows ?? []).find((b: any) => b.beat_id === r.beat_id),
      }));
    } else {
      accessRows = [];
    }
  }

  const byId = new Map<string, BeatWithAccess>();
  for (const b of (ownedRes.data ?? []) as any[]) {
    byId.set(b.beat_id, { ...b, accessType: 'OWNED' });
  }
  for (const row of accessRows) {
    const beat = row.beats ?? row;
    if (!beat?.beat_id) continue;
    if (byId.has(beat.beat_id)) continue; // owned wins
    const at = String(row.access_type).toUpperCase() as AccessType;
    byId.set(beat.beat_id, { ...beat, accessType: at });
  }
  return Array.from(byId.values());
}

// 2. reactivateBeat
export async function reactivateBeat(beatId: string, userId: string) {
  const { data, error } = await supabase
    .from('beats')
    .update({
      is_active: true,
      reactivated_at: new Date().toISOString(),
      reactivated_by: userId,
      updated_by: userId,
    })
    .eq('beat_id', beatId)
    .select()
    .maybeSingle();
  throwIfError(error, 'reactivateBeat');
  return data;
}

// 3. deactivateBeat
export async function deactivateBeat(beatId: string, userId: string) {
  const { data, error } = await supabase
    .from('beats')
    .update({
      is_active: false,
      deactivated_at: new Date().toISOString(),
      deactivated_by: userId,
      updated_by: userId,
    })
    .eq('beat_id', beatId)
    .select()
    .maybeSingle();
  throwIfError(error, 'deactivateBeat');
  return data;
}

// 4. transferRetailers
export async function transferRetailers(
  retailerIds: string[],
  fromBeatId: string,
  toBeatId: string,
  transferredBy: string,
  reason: string,
) {
  if (!retailerIds.length) return { moved: 0 };

  const [toBeat, fromBeat] = await Promise.all([
    resolveBeatTextId(toBeatId),
    resolveBeatTextId(fromBeatId),
  ]);

  const { data: retailers, error: rErr } = await supabase
    .from('retailers')
    .select('id, name')
    .in('id', retailerIds);
  throwIfError(rErr, 'transferRetailers.fetch');

  const nowIso = new Date().toISOString();

  const { error: upRetErr } = await supabase
    .from('retailers')
    .update({ beat_id: toBeat.beat_id, beat_name: toBeat.beat_name })
    .in('id', retailerIds);
  throwIfError(upRetErr, 'transferRetailers.updateRetailers');

  const { error: closeErr } = await supabase
    .from('retailer_beat_assignments')
    .update({
      is_current: false,
      assigned_to: nowIso,
      removed_by: transferredBy,
      transfer_reason: reason,
    })
    .in('retailer_id', retailerIds)
    .eq('is_current', true);
  throwIfError(closeErr, 'transferRetailers.closeAssignments');

  const newAssignments = (retailers ?? []).map((r: any) => ({
    retailer_id: r.id,
    beat_id: toBeat.beat_id,
    beat_name: toBeat.beat_name,
    assigned_from: nowIso,
    is_current: true,
    assigned_by: transferredBy,
    transfer_reason: reason,
    user_id: toBeat.user_id,
  }));
  if (newAssignments.length) {
    const { error: insAssignErr } = await supabase
      .from('retailer_beat_assignments')
      .insert(newAssignments);
    throwIfError(insAssignErr, 'transferRetailers.insertAssignments');
  }

  const history = (retailers ?? []).map((r: any) => ({
    retailer_id: r.id,
    retailer_name: r.name,
    from_beat_id: fromBeat.beat_id,
    from_beat_name: fromBeat.beat_name,
    to_beat_id: toBeat.beat_id,
    to_beat_name: toBeat.beat_name,
    transferred_by: transferredBy,
    transferred_at: nowIso,
  }));
  if (history.length) {
    const { error: histErr } = await supabase
      .from('retailer_beat_transfer_history')
      .insert(history);
    throwIfError(histErr, 'transferRetailers.history');
  }

  return { moved: retailerIds.length };
}

// 5. transferBeatOwnership
export async function transferBeatOwnership(
  beatId: string,
  newOwnerId: string,
  transferredBy: string,
  reason: string,
  effectiveDate?: string,
) {
  const { data, error } = await supabase.rpc('transfer_beat_complete' as any, {
    p_beat_id: beatId,
    p_new_owner_id: newOwnerId,
    p_transferred_by: transferredBy,
    p_reason: reason ?? '',
    p_effective_date: effectiveDate ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw new Error(error.message);
  return data;
}

// 6. grantBeatAccess
export async function grantBeatAccess(
  beatId: string,
  userId: string,
  accessType: Exclude<AccessType, 'OWNED'>,
  grantedBy: string,
  effectiveTo?: string | null,
) {
  const beat = await resolveBeatTextId(beatId);
  const { data, error } = await supabase
    .from('beat_user_access')
    .insert({
      beat_id: beat.beat_id,
      user_id: userId,
      access_type: accessType,
      granted_by: grantedBy,
      effective_from: new Date().toISOString(),
      effective_to: effectiveTo ?? null,
      is_active: true,
    })
    .select()
    .maybeSingle();
  throwIfError(error, 'grantBeatAccess');
  return data;
}

// 7. revokeBeatAccess
export async function revokeBeatAccess(
  beatId: string,
  userId: string,
  accessType: Exclude<AccessType, 'OWNED'>,
) {
  const beat = await resolveBeatTextId(beatId);
  const { error } = await supabase
    .from('beat_user_access')
    .update({ is_active: false })
    .eq('beat_id', beat.beat_id)
    .eq('user_id', userId)
    .eq('access_type', accessType)
    .eq('is_active', true);
  throwIfError(error, 'revokeBeatAccess');
  return { ok: true };
}

// 8. assignCoverage
export async function assignCoverage(
  beatId: string,
  primaryUserId: string,
  coverageUserId: string,
  startDate: string,
  endDate: string,
  reason: string,
  permissionSetId: string,
  assignedBy: string,
) {
  const beat = await resolveBeatTextId(beatId);

  const { data: cov, error: covErr } = await supabase
    .from('beat_coverage_assignments')
    .insert({
      beat_id: beat.beat_id,
      beat_name: beat.beat_name,
      primary_user_id: primaryUserId,
      coverage_user_id: coverageUserId,
      assigned_by: assignedBy,
      start_date: startDate,
      end_date: endDate,
      reason,
      is_active: true,
    })
    .select()
    .maybeSingle();
  throwIfError(covErr, 'assignCoverage.coverage');

  const { error: accErr } = await supabase.from('beat_user_access').insert({
    beat_id: beat.beat_id,
    user_id: coverageUserId,
    access_type: 'COVERAGE',
    granted_by: assignedBy,
    effective_from: startDate,
    effective_to: endDate,
    is_active: true,
    reason,
  });
  throwIfError(accErr, 'assignCoverage.access');

  const { error: permErr } = await supabase
    .from('coverage_permission_assignments')
    .insert({
      user_id: coverageUserId,
      permission_set_id: permissionSetId,
      start_date: startDate,
      end_date: endDate,
      granted_by: assignedBy,
      reason,
      is_active: true,
    });
  throwIfError(permErr, 'assignCoverage.permission');

  return cov;
}

// 9. endCoverage
export async function endCoverage(coverageId: string) {
  const { data: cov, error: covErr } = await supabase
    .from('beat_coverage_assignments')
    .select('id, beat_id, coverage_user_id, start_date, end_date')
    .eq('id', coverageId)
    .maybeSingle();
  throwIfError(covErr, 'endCoverage.fetch');
  if (!cov) throw new Error('Coverage assignment not found');

  const { error: e1 } = await supabase
    .from('beat_coverage_assignments')
    .update({ is_active: false })
    .eq('id', coverageId);
  throwIfError(e1, 'endCoverage.coverage');

  const { error: e2 } = await supabase
    .from('beat_user_access')
    .update({ is_active: false })
    .eq('beat_id', (cov as any).beat_id)
    .eq('user_id', (cov as any).coverage_user_id)
    .eq('access_type', 'COVERAGE')
    .eq('is_active', true);
  throwIfError(e2, 'endCoverage.access');

  const { error: e3 } = await supabase
    .from('coverage_permission_assignments')
    .update({ is_active: false })
    .eq('user_id', (cov as any).coverage_user_id)
    .eq('start_date', (cov as any).start_date)
    .eq('end_date', (cov as any).end_date)
    .eq('is_active', true);
  throwIfError(e3, 'endCoverage.permission');

  return { ok: true };
}

// 10. getBeatHistory
export async function getBeatHistory(beatId: string): Promise<BeatHistory> {
  const beat = await resolveBeatTextId(beatId);
  const textId = beat.beat_id;

  const [ownRes, retRes, covRes] = await Promise.all([
    supabase
      .from('beat_ownership_history')
      .select('*')
      .eq('beat_id', textId)
      .order('transferred_at', { ascending: false }),
    supabase
      .from('retailer_beat_transfer_history')
      .select('*')
      .or(`from_beat_id.eq.${textId},to_beat_id.eq.${textId}`)
      .order('transferred_at', { ascending: false }),
    supabase
      .from('beat_coverage_assignments')
      .select('*')
      .eq('beat_id', textId)
      .order('created_at', { ascending: false }),
  ]);
  throwIfError(ownRes.error, 'getBeatHistory.ownership');
  throwIfError(retRes.error, 'getBeatHistory.retailers');
  throwIfError(covRes.error, 'getBeatHistory.coverage');

  return {
    ownership: ownRes.data ?? [],
    retailerTransfers: retRes.data ?? [],
    coverage: covRes.data ?? [],
  };
}

// 11. getBeatStats
export async function getBeatStats(userId: string): Promise<BeatStats> {
  const nowIso = new Date().toISOString();
  const head = (q: any) => q.select('*', { count: 'exact', head: true });

  const [
    total, active, inactive, shared, covering,
    activeBeatsRes,
  ] = await Promise.all([
    head(supabase.from('beats')).eq('user_id', userId),
    head(supabase.from('beats')).eq('user_id', userId).eq('is_active', true),
    head(supabase.from('beats')).eq('user_id', userId).eq('is_active', false),
    head(supabase.from('beat_user_access'))
      .eq('user_id', userId)
      .in('access_type', ['CO_OWNER', 'VIEW_ONLY', 'OPERATIONAL'])
      .eq('is_active', true)
      .or(`effective_to.is.null,effective_to.gt.${nowIso}`),
    head(supabase.from('beat_user_access'))
      .eq('user_id', userId)
      .eq('access_type', 'COVERAGE')
      .eq('is_active', true)
      .or(`effective_to.is.null,effective_to.gt.${nowIso}`),
    supabase.from('beats').select('beat_id').eq('user_id', userId).eq('is_active', true),
  ]);

  const activeBeatIds = (activeBeatsRes.data ?? []).map((b: any) => b.beat_id);

  // Empty beats — active beats with no retailers
  let emptyBeats = 0;
  if (activeBeatIds.length) {
    const { data: retailerRows } = await supabase
      .from('retailers')
      .select('beat_id')
      .in('beat_id', activeBeatIds);
    const beatsWithRetailers = new Set((retailerRows ?? []).map((r: any) => r.beat_id));
    emptyBeats = activeBeatIds.filter((id) => !beatsWithRetailers.has(id)).length;
  }

  return {
    total: total.count ?? 0,
    active: active.count ?? 0,
    inactive: inactive.count ?? 0,
    sharedWithMe: shared.count ?? 0,
    covering: covering.count ?? 0,
    emptyBeats,
  };
}



// 12. cloneBeat
export async function cloneBeat(beatId: string, newBeatName: string, createdBy: string) {
  const { data: src, error: sErr } = await supabase
    .from('beats')
    .select('*')
    .eq('beat_id', beatId)
    .maybeSingle();
  throwIfError(sErr, 'cloneBeat.fetch');
  if (!src) throw new Error('Source beat not found');

  const ownerName = await getProfileName(createdBy);
  const newTextId = `${(src as any).beat_id}-COPY-${Date.now().toString(36)}`;

  const payload: any = {
    beat_id: newTextId,
    beat_name: newBeatName,
    category: (src as any).category,
    travel_allowance: (src as any).travel_allowance,
    average_km: (src as any).average_km,
    average_time_minutes: (src as any).average_time_minutes,
    territory_id: (src as any).territory_id,
    distributor_id: (src as any).distributor_id,
    user_id: createdBy,
    owner_id: createdBy,
    owner_name: ownerName,
    is_active: true,
    created_by: createdBy,
    updated_by: createdBy,
  };

  const { data, error } = await supabase.from('beats').insert(payload).select().maybeSingle();
  throwIfError(error, 'cloneBeat.insert');
  return data;
}
