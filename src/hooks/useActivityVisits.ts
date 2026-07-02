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
      const { data: visits, error } = await supabase
        .from('visits')
        .select('id, planned_date, check_in_time, check_out_time, status, visit_type')
        .eq('user_id', userId)
        .eq('planned_date', date)
        .eq('visit_type', 'activity')
        .order('created_at', { ascending: true })
        .limit(200);

      if (error || !visits || visits.length === 0) {
        setItems([]);
        return;
      }

      const visitIds = visits.map(v => v.id);
      const { data: events } = await supabase
        .from('activity_events')
        .select('*')
        .in('visit_id', visitIds)
        .limit(500);

      const byVisit = new Map<string, any>();
      (events || []).forEach(e => { if (e.visit_id) byVisit.set(e.visit_id, e); });

      const rows: ActivityVisitCardModel[] = visits
        .map(v => {
          const ev = byVisit.get(v.id);
          if (!ev) return null;
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
