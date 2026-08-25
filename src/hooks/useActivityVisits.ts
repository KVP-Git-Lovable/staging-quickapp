import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ActivityVisitCardModel {
  visitId: string;
  activityEventId: string;
  activityName: string;
  activityType: string | null;
  status: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  durationMinutes: number | null;
  remarks: string | null;
  plannedDate: string;
}

/**
 * Fetches "activity" visits for a user/date as visit-card models.
 * Activities always have a `visits` row with visit_type='activity' and
 * retailer_id=null, linked to activity_events via activity_events.visit_id.
 */
export function useActivityVisits(userId: string | undefined, date: string | undefined) {
  const [items, setItems] = useState<ActivityVisitCardModel[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !date) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      // Start from the EVENTS covering this date, not from visits dated today.
      //
      // These two used to ask different questions and so disagreed. The card
      // list matches an event by its span, so a 12-13 Aug event shows on both
      // days; this hook matched visits.planned_date, and a participant's visit
      // sits only on the start date. Result: three cards, two planned visits.
      // Same predicate as fetchActivitiesForDate, deliberately.
      const { data: events, error: evErr } = await supabase
        .from('activity_events')
        .select('*')
        .or(`user_id.eq.${userId},sales_reps.cs.{${userId}}`)
        .or(`activity_date.eq.${date},and(from_date.lte.${date},to_date.gte.${date})`)
        .limit(500);

      if (evErr || !events || events.length === 0) {
        setItems([]);
        return;
      }

      // This user's own visit row for each — their check-in, not the owner's.
      // Matched by the event link, or by visit id for events predating it.
      const eventIds = events.map(e => e.id).filter(Boolean);
      const ownerVisitIds = events.map((e: any) => e.visit_id).filter(Boolean);
      const { data: visits } = await supabase
        .from('visits')
        .select('id, planned_date, check_in_time, check_out_time, status, visit_type, activity_event_id')
        .eq('user_id', userId)
        .eq('visit_type', 'activity')
        .or(
          [
            ...(eventIds.length ? [`activity_event_id.in.(${eventIds.join(',')})`] : []),
            ...(ownerVisitIds.length ? [`id.in.(${ownerVisitIds.join(',')})`] : []),
          ].join(',')
        )
        .limit(500);

      const byEvent = new Map<string, any>();
      (visits || []).forEach((v: any) => {
        if (v.activity_event_id) byEvent.set(v.activity_event_id, v);
      });
      const byVisitId = new Map<string, any>();
      (visits || []).forEach((v: any) => byVisitId.set(v.id, v));

      const rows: ActivityVisitCardModel[] = events
        .map((ev: any) => {
          const v = byEvent.get(ev.id) ?? (ev.visit_id ? byVisitId.get(ev.visit_id) : undefined);
          // No visit row means this user cannot check in to it, so it is not
          // one of their planned visits and must not be counted as one.
          if (!v) return null;
          return {
            visitId: v.id,
            activityEventId: ev.id,
            activityName: ev.activity_name || 'Activity',
            activityType: ev.activity_type ?? null,
            status: v.status ?? null,
            checkInTime: v.check_in_time ?? null,
            checkOutTime: v.check_out_time ?? null,
            durationMinutes: ev.duration_minutes ?? null,
            remarks: ev.remarks ?? null,
            plannedDate: v.planned_date,
          } as ActivityVisitCardModel;
        })
        .filter((r): r is ActivityVisitCardModel => r !== null);

      setItems(rows);
    } finally {
      setLoading(false);
    }
  }, [userId, date]);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, refresh: load };
}
