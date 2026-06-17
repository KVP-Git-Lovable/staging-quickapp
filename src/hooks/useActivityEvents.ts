import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ActivityEvent {
  id: string;
  visit_id: string;
  user_id: string;
  activity_name: string | null;
  activity_type: string;
  visit_category: string | null;
  activity_sub_type: string | null;
  duration_type: string;
  activity_date: string;
  start_time: string | null;
  end_time: string | null;
  half_day_type: string | null;
  from_date: string | null;
  to_date: string | null;
  total_days: number | null;
  retailer_id: string | null;
  retailer_name: string | null;
  remarks: string | null;
  created_at: string;
  activity_place: string | null;
  start_latitude: number | null;
  start_longitude: number | null;
  end_latitude: number | null;
  end_longitude: number | null;
  // columns that existed before migration
  status: string | null;
  location: string | null;
  event_name: string | null;
  description: string | null;
  budget: number | null;
  sales_target: number | null;
  expected_footfall: string | null;
  // new columns added by migration
  beat_id: string | null;
  beat_name: string | null;
  subordinate_user_id: string | null;
  joint_session_id: string | null;
  distributor_id: string | null;
  distributor_name: string | null;
  visit_purpose: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  duration_minutes: number | null;
  shops_planned: number | null;
  shops_visited: number | null;
  km_travelled: number | null;
  outcome: string | null;
  contact_person: string | null;
  follow_up_date: string | null;
  actual_footfall: number | null;
  sales_achieved: number | null;
  topic: string | null;
  attendee_count: number | null;
  rep_rating_product_knowledge: number | null;
  rep_rating_retailer_relationship: number | null;
  rep_rating_scheme_communication: number | null;
  rep_rating_branding: number | null;
  rep_rating_market_intel: number | null;
  rep_overall_outcome: string | null;
  rep_strengths: string | null;
  rep_improvement_areas: string | null;
  rep_action_items: string | null;
  rep_followup_date: string | null;
  survey_total_shops: number | null;
  survey_our_stock_shops: number | null;
  survey_target_shops: number | null;
  survey_competitor_count: number | null;
  survey_estimated_monthly_value: number | null;
  survey_market_type: string | null;
  survey_priority: string | null;
  survey_suggested_beat_count: number | null;
  survey_shops_per_beat: number | null;
  survey_proposed_beat_names: string[] | null;
  survey_competition_brands: string | null;
  survey_observations: string | null;
  survey_recommendation: string | null;
}

interface CreateActivityParams {
  activity_name?: string;
  activity_type: string;
  visit_category?: string;
  activity_sub_type?: string;
  duration_type: string;
  activity_date: string;
  start_time?: string;
  end_time?: string;
  half_day_type?: string;
  from_date?: string;
  to_date?: string;
  total_days?: number;
  retailer_id?: string;
  retailer_name?: string;
  remarks?: string;
  activity_place?: string;
  start_latitude?: number;
  start_longitude?: number;
  beat_id?: string;
  beat_name?: string;
  subordinate_user_id?: string;
  distributor_id?: string;
  distributor_name?: string;
  visit_purpose?: string;
  check_in_time?: string;
  check_out_time?: string;
  check_in_latitude?: number;
  check_in_longitude?: number;
  duration_minutes?: number;
  shops_planned?: number;
  shops_visited?: number;
  km_travelled?: number;
  outcome?: string;
  contact_person?: string;
  follow_up_date?: string;
  actual_footfall?: number;
  sales_achieved?: number;
  topic?: string;
  attendee_count?: number;
  rep_rating_product_knowledge?: number;
  rep_rating_retailer_relationship?: number;
  rep_rating_scheme_communication?: number;
  rep_rating_branding?: number;
  rep_rating_market_intel?: number;
  rep_overall_outcome?: string;
  rep_strengths?: string;
  rep_improvement_areas?: string;
  rep_action_items?: string;
  rep_followup_date?: string;
  survey_total_shops?: number;
  survey_our_stock_shops?: number;
  survey_target_shops?: number;
  survey_competitor_count?: number;
  survey_estimated_monthly_value?: number;
  survey_market_type?: string;
  survey_priority?: string;
  survey_suggested_beat_count?: number;
  survey_shops_per_beat?: number;
  survey_proposed_beat_names?: string[];
  survey_competition_brands?: string;
  survey_observations?: string;
  survey_recommendation?: string;
}

// Simple in-memory cache keyed by visit_id
const activityCache = new Map<string, ActivityEvent>();

const opt = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : v);

export const useActivityEvents = () => {
  const { user } = useAuth();

  const fetchActivityForVisit = async (visitId: string): Promise<ActivityEvent | null> => {
    if (activityCache.has(visitId)) return activityCache.get(visitId) || null;
    const { data, error } = await supabase
      .from('activity_events')
      .select('*')
      .eq('visit_id', visitId)
      .maybeSingle();
    if (error) { console.error('[useActivityEvents] fetchActivityForVisit:', error); return null; }
    if (data) { const a = data as unknown as ActivityEvent; activityCache.set(visitId, a); return a; }
    return null;
  };

  const createActivity = async (
    params: CreateActivityParams
  ): Promise<{ visitId: string; activityId: string } | null> => {
    if (!user?.id) return null;
    try {
      const plannedDate =
        params.duration_type === 'multiple_days' && params.from_date
          ? params.from_date
          : params.activity_date;

      // 1. Insert visits row
      const visitInsert: Record<string, unknown> = {
        user_id: user.id,
        planned_date: plannedDate,
        status: 'planned',
        visit_type: params.visit_category || 'activity',
      };
      if (params.check_in_time) visitInsert.check_in_time = params.check_in_time;
      if (params.retailer_id)   visitInsert.retailer_id   = params.retailer_id;

      const { data: visitData, error: visitError } = await supabase
        .from('visits')
        .insert(visitInsert as any)
        .select('id')
        .single();
      if (visitError) { console.error('[useActivityEvents] visit insert:', visitError); throw visitError; }
      const visitId = visitData.id;

      // 2. Build activity_events insert — core fields
      const ae: Record<string, unknown> = {
        visit_id:       visitId,
        user_id:        user.id,
        activity_name:  params.activity_name  ?? null,
        activity_type:  params.activity_type,
        duration_type:  params.duration_type,
        activity_date:  params.activity_date,
        start_time:     params.start_time     ?? null,
        end_time:       params.end_time       ?? null,
        half_day_type:  params.half_day_type  ?? null,
        from_date:      params.from_date      ?? null,
        to_date:        params.to_date        ?? null,
        total_days:     params.total_days     ?? null,
        retailer_id:    params.retailer_id    ?? null,
        retailer_name:  params.retailer_name  ?? null,
        remarks:        params.remarks        ?? null,
        activity_place: params.activity_place ?? null,
        start_latitude: params.start_latitude ?? null,
        start_longitude:params.start_longitude?? null,
      };

      // 3. Spread all new nullable columns — only include if provided
      const extras: [string, unknown][] = [
        ['visit_category',                 opt(params.visit_category)],
        ['activity_sub_type',              opt(params.activity_sub_type)],
        ['beat_id',                        opt(params.beat_id)],
        ['beat_name',                      opt(params.beat_name)],
        ['subordinate_user_id',            opt(params.subordinate_user_id)],
        ['distributor_id',                 opt(params.distributor_id)],
        ['distributor_name',               opt(params.distributor_name)],
        ['visit_purpose',                  opt(params.visit_purpose)],
        ['check_in_time',                  opt(params.check_in_time)],
        ['check_out_time',                 opt(params.check_out_time)],
        ['check_in_latitude',              params.check_in_latitude   ?? undefined],
        ['check_in_longitude',             params.check_in_longitude  ?? undefined],
        ['duration_minutes',               params.duration_minutes    ?? undefined],
        ['shops_planned',                  params.shops_planned       ?? undefined],
        ['shops_visited',                  params.shops_visited       ?? undefined],
        ['km_travelled',                   params.km_travelled        ?? undefined],
        ['outcome',                        opt(params.outcome)],
        ['contact_person',                 opt(params.contact_person)],
        ['follow_up_date',                 opt(params.follow_up_date)],
        ['actual_footfall',                params.actual_footfall     ?? undefined],
        ['sales_achieved',                 params.sales_achieved      ?? undefined],
        ['topic',                          opt(params.topic)],
        ['attendee_count',                 params.attendee_count      ?? undefined],
        ['rep_rating_product_knowledge',   params.rep_rating_product_knowledge   ?? undefined],
        ['rep_rating_retailer_relationship',params.rep_rating_retailer_relationship ?? undefined],
        ['rep_rating_scheme_communication',params.rep_rating_scheme_communication ?? undefined],
        ['rep_rating_branding',            params.rep_rating_branding ?? undefined],
        ['rep_rating_market_intel',        params.rep_rating_market_intel ?? undefined],
        ['rep_overall_outcome',            opt(params.rep_overall_outcome)],
        ['rep_strengths',                  opt(params.rep_strengths)],
        ['rep_improvement_areas',          opt(params.rep_improvement_areas)],
        ['rep_action_items',               opt(params.rep_action_items)],
        ['rep_followup_date',              opt(params.rep_followup_date)],
        ['survey_total_shops',             params.survey_total_shops  ?? undefined],
        ['survey_our_stock_shops',         params.survey_our_stock_shops ?? undefined],
        ['survey_target_shops',            params.survey_target_shops ?? undefined],
        ['survey_competitor_count',        params.survey_competitor_count ?? undefined],
        ['survey_estimated_monthly_value', params.survey_estimated_monthly_value ?? undefined],
        ['survey_market_type',             opt(params.survey_market_type)],
        ['survey_priority',                opt(params.survey_priority)],
        ['survey_suggested_beat_count',    params.survey_suggested_beat_count ?? undefined],
        ['survey_shops_per_beat',          params.survey_shops_per_beat ?? undefined],
        ['survey_proposed_beat_names',     params.survey_proposed_beat_names?.length ? params.survey_proposed_beat_names : undefined],
        ['survey_competition_brands',      opt(params.survey_competition_brands)],
        ['survey_observations',            opt(params.survey_observations)],
        ['survey_recommendation',          opt(params.survey_recommendation)],
      ];
      for (const [k, v] of extras) { if (v !== undefined) ae[k] = v; }

      const { data: aeData, error: aeError } = await supabase
        .from('activity_events')
        .insert(ae as any)
        .select('id')
        .single();
      if (aeError) {
        console.error('[useActivityEvents] activity_events insert:', aeError);
        await supabase.from('visits').delete().eq('id', visitId);
        throw aeError;
      }

      window.dispatchEvent(new CustomEvent('visitDataChanged'));
      return { visitId, activityId: aeData.id };
    } catch (err) {
      console.error('[useActivityEvents] createActivity failed:', err);
      return null;
    }
  };

  const updateActivityLocation = async (
    activityId: string,
    updates: {
      start_latitude?: number;
      start_longitude?: number;
      end_latitude?: number;
      end_longitude?: number;
      start_time?: string;
      end_time?: string;
    }
  ): Promise<boolean> => {
    const { error } = await supabase
      .from('activity_events')
      .update(updates as any)
      .eq('id', activityId);
    if (error) { console.error('[useActivityEvents] updateActivityLocation:', error); return false; }
    return true;
  };

  /** Called when user taps "Log check-out" in the modal or card.
   *  Updates visits.check_out_time + activity_events.check_out_time + duration_minutes.
   *  Returns computed duration in minutes, or null on error. */
  const updateVisitCheckOut = async (
    visitId: string,
    activityId: string,
    checkOutTime: string
  ): Promise<number | null> => {
    // Update visits row
    const { error: ve } = await supabase
      .from('visits')
      .update({ check_out_time: checkOutTime, status: 'productive' } as any)
      .eq('id', visitId);
    if (ve) { console.error('[useActivityEvents] updateVisitCheckOut (visits):', ve); return null; }

    // Read check_in_time to compute duration
    const { data: row } = await supabase
      .from('activity_events')
      .select('check_in_time')
      .eq('id', activityId)
      .maybeSingle();
    let mins: number | null = null;
    const ci = (row as any)?.check_in_time as string | undefined;
    if (ci) mins = Math.max(0, Math.round((new Date(checkOutTime).getTime() - new Date(ci).getTime()) / 60000));

    // Update activity_events
    await supabase
      .from('activity_events')
      .update({ check_out_time: checkOutTime, ...(mins != null ? { duration_minutes: mins } : {}) } as any)
      .eq('id', activityId);

    return mins;
  };

  const fetchActivitiesForDate = useCallback(async (userId: string, date: string): Promise<ActivityEvent[]> => {
    const { data, error } = await supabase
      .from('activity_events')
      .select('*')
      .eq('user_id', userId)
      .or(`activity_date.eq.${date},and(from_date.lte.${date},to_date.gte.${date})`)
      .order('created_at', { ascending: false });
    if (error) { console.error('[useActivityEvents] fetchActivitiesForDate:', error); return []; }
    return (data || []) as unknown as ActivityEvent[];
  }, []);

  const clearCache = () => activityCache.clear();

  return {
    fetchActivityForVisit,
    fetchActivitiesForDate,
    createActivity,
    updateActivityLocation,
    updateVisitCheckOut,
    clearCache,
  };
};

export const formatActivityDuration = (activity: ActivityEvent): string => {
  switch (activity.duration_type) {
    case 'hour_based': {
      if (activity.start_time && activity.end_time) {
        const s = new Date(activity.start_time);
        const e = new Date(activity.end_time);
        const hrs = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60) * 10) / 10;
        return `${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${hrs}h)`;
      }
      return 'Hour-based';
    }
    case 'half_day':
      return activity.half_day_type === 'first_half' ? 'First half' : 'Second half';
    case 'full_day':
      return 'Full day';
    case 'multiple_days':
      if (activity.from_date && activity.to_date) {
        const f = new Date(activity.from_date + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' });
        const t = new Date(activity.to_date   + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' });
        return `${f} – ${t} (${activity.total_days ?? '?'} days)`;
      }
      return 'Multiple days';
    default:
      return activity.duration_type;
  }
};
