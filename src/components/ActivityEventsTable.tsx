import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarDays, Clock, MapPin, MessageSquare, Loader2, Play, CheckCircle2, Navigation, Timer, IndianRupee, ShoppingCart, Package, BarChart3, Pencil } from 'lucide-react';
import { useActivityEvents, ActivityEvent, formatActivityDuration } from '@/hooks/useActivityEvents';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getLocalTodayDate } from '@/utils/dateUtils';
import { Geolocation } from '@capacitor/geolocation';
import { useNavigate } from 'react-router-dom';
import { useActivityTypes } from '@/hooks/useActivityTypes';
import { ActivityCompletionDialog } from '@/components/ActivityCompletionDialog';

interface ActivityEventsTableProps {
  userId: string;
  selectedDate: string;
  onActivitiesLoaded?: (count: number) => void;
  onActivityChanged?: () => void;
  onOpenDetail?: (
    activity: ActivityEvent,
    visitStatus?: { status: string | null; check_in_time: string | null; check_out_time: string | null } | null,
  ) => void;
  /** Opens the scheduling dialog in edit mode for a not-yet-started activity. */
  /** Shows Edit on Event cards. Events only — other activity types are not
   *  editable from this list. */
  canEditEvent?: boolean;
}

interface VisitStatus {
  check_in_time: string | null;
  check_out_time: string | null;
  status: string | null;
}

// Tailwind class map by named color. Master activity_types may store either
// a color name (e.g. "purple") or a hex string — we only use the name buckets.
const COLOR_CLASS: Record<string, string> = {
  rose:   'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  amber:  'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  blue:   'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  green:  'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  teal:   'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  gray:   'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};
const NEUTRAL = COLOR_CLASS.gray;

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Play }> = {
  planned: {
    label: 'Planned',
    color: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
    icon: CalendarDays,
  },
  'in-progress': {
    label: 'In Progress',
    color: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
    icon: Play,
  },
  productive: {
    label: 'Completed',
    color: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700',
    icon: CheckCircle2,
  },
};

export const ActivityEventsTable = ({ userId, selectedDate, onActivitiesLoaded, onActivityChanged, onOpenDetail, canEditEvent }: ActivityEventsTableProps) => {
  const { fetchActivitiesForDate, updateActivityLocation } = useActivityEvents();
  const { types: activityTypeMaster } = useActivityTypes();
  const navigate = useNavigate();

  // Match incoming activity_type by name or code → master row.
  const humanize = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const resolveTypeMeta = (key: string | null | undefined): { label: string; colorClass: string } => {
    if (!key) return { label: 'Other', colorClass: NEUTRAL };
    const hit = activityTypeMaster.find((t) => t.name === key || t.code === key);
    return {
      label: hit?.name ?? humanize(key),
      colorClass: (hit?.color && COLOR_CLASS[hit.color]) || NEUTRAL,
    };
  };
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [visitStatuses, setVisitStatuses] = useState<Record<string, VisitStatus>>({});
  const [eventTotals, setEventTotals] = useState<Record<string, { revenue: number; orders: number }>>({});
  // event id -> the viewer's own visit row for it. Check-in, check-out and
  // Complete all act on this, never on the event's shared visit.
  const [myVisitIds, setMyVisitIds] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [completionTarget, setCompletionTarget] = useState<{ id: string; visitId: string } | null>(null);

  const isToday = selectedDate === getLocalTodayDate();
  
  const onActivitiesLoadedRef = useRef(onActivitiesLoaded);
  onActivitiesLoadedRef.current = onActivitiesLoaded;

  const loadActivities = useCallback(async () => {
    if (!userId || !selectedDate) return;
    if (!hasLoadedOnce && activities.length === 0) {
      setIsLoading(true);
    }
    try {
      const data = await fetchActivitiesForDate(userId, selectedDate);

      // Fetch visit statuses.
      //
      // Two different visit ids are in play on a team event and mixing them up
      // is the easy mistake here. `activity.visit_id` is the EVENT's visit —
      // orders and totals hang off it and it is shared by the whole team. But
      // check-in/check-out is per person: each rep has their own visit row for
      // the event, so reading status off the shared id would show every rep the
      // owner's progress. Status is keyed on the viewer's own row.
      const visitIds = data.map(a => a.visit_id).filter(Boolean);
      const eventIds = data.map(a => a.id).filter(Boolean);
      const visitMap: Record<string, VisitStatus> = {};
      const mineMap: Record<string, string> = {};
      const totalsMap: Record<string, { revenue: number; orders: number }> = {};

      if (visitIds.length > 0) {
        const { data: visits } = await supabase
          .from('visits')
          .select('id, check_in_time, check_out_time, status, activity_event_id')
          .or(
            [
              `id.in.(${visitIds.join(',')})`,
              ...(eventIds.length ? [`activity_event_id.in.(${eventIds.join(',')})`] : []),
            ].join(',')
          )
          .eq('user_id', userId);

        if (visits) {
          visits.forEach(v => {
            const st = {
              check_in_time: v.check_in_time,
              check_out_time: v.check_out_time,
              status: v.status,
            };
            visitMap[v.id] = st;
            // Also file it under the event, so a participant whose own visit id
            // differs from the event's still finds their own status.
            if ((v as any).activity_event_id) {
              visitMap[(v as any).activity_event_id] = st;
              mineMap[(v as any).activity_event_id] = v.id;
            }
          });
        }

        // Totals for the whole event, every team member's orders included —
        // these are keyed on the event's shared visit id, so all three reps see
        // the same figure on their card.
        const { data: orderRows } = await supabase
          .from('orders')
          .select('visit_id, total_amount, status')
          .in('visit_id', visitIds);

        (orderRows || []).forEach((o: any) => {
          if (!o.visit_id) return;
          if (o.status === 'cancelled') return;
          const t = totalsMap[o.visit_id] || { revenue: 0, orders: 0 };
          t.revenue += Number(o.total_amount) || 0;
          t.orders += 1;
          totalsMap[o.visit_id] = t;
        });
      }

      // Commit activities together with the visit status/totals derived from
      // them. Setting activities first (as a separate render) let the Start/
      // Edit buttons flash based on stale or empty visit status for a beat
      // before the real status landed a render later.
      setActivities(data);
      setVisitStatuses(visitMap);
      setMyVisitIds(mineMap);
      setEventTotals(totalsMap);
      onActivitiesLoadedRef.current?.(data.length);
    } catch (err) {
      console.error('[ActivityEventsTable] Failed to load activities:', err);
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }, [userId, selectedDate, fetchActivitiesForDate, hasLoadedOnce, activities.length]);

  useEffect(() => {
    loadActivities();
  }, [userId, selectedDate]);

  useEffect(() => {
    const handler = () => loadActivities();
    window.addEventListener('visitDataChanged', handler);
    return () => window.removeEventListener('visitDataChanged', handler);
  }, [loadActivities]);

  const captureGPS = async (): Promise<{ lat: number; lng: number } | null> => {
    try {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });
      return { lat: position.coords.latitude, lng: position.coords.longitude };
    } catch {
      // Fallback to browser
      return new Promise((resolve) => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 10000 }
          );
        } else {
          resolve(null);
        }
      });
    }
  };

  // The viewer's OWN visit row for this activity. On a team event that is not
  // activity.visit_id — that one belongs to the owner and is shared for orders.
  // Starting or completing through it would check the owner in instead.
  const myVisitFor = (activity: ActivityEvent): string | null =>
    myVisitIds[activity.id] ?? activity.visit_id ?? null;

  const isOwnerOf = (activity: ActivityEvent): boolean =>
    !activity.user_id || activity.user_id === userId;

  const handleStartActivity = async (activity: ActivityEvent) => {
    const myVisitId = myVisitFor(activity);
    if (!myVisitId) return;
    setActionLoading(activity.id + '-start');
    try {
      const now = new Date().toISOString();
      const gps = await captureGPS();

      // Where you started goes on YOUR visit row, so three reps working one
      // stall each record their own arrival rather than overwriting each other.
      const { data: startedRows, error: visitError } = await supabase
        .from('visits')
        .update({
          check_in_time: now,
          status: 'in-progress',
          ...(gps ? { check_in_location: { lat: gps.lat, lng: gps.lng, at: now } } : {}),
        } as any)
        .eq('id', myVisitId)
        .select('id');

      if (visitError) throw visitError;
      // RLS filters a rejected row instead of raising, so an update can report
      // success having changed nothing.
      if (!startedRows || startedRows.length === 0) {
        throw new Error('You do not have permission to start this activity');
      }

      // The event row records the ACTUAL start in check_in_*, never in
      // start_time — start_time holds the planned schedule the event was
      // created with and is what the card shows. Owner only: the event has one
      // official start, and RLS would refuse a participant here anyway.
      if (isOwnerOf(activity)) {
        await updateActivityLocation(activity.id, {
          check_in_time: now,
          ...(gps ? { check_in_latitude: gps.lat, check_in_longitude: gps.lng } : {}),
        });
      }

      toast.success(
        gps ? 'Started — time and location recorded' : 'Started — location unavailable, time recorded'
      );
      window.dispatchEvent(new CustomEvent('visitDataChanged'));
      onActivityChanged?.();
      await loadActivities();
    } catch (err) {
      console.error('[ActivityEventsTable] Start failed:', err);
      toast.error('Failed to start activity');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCompleteActivity = (activity: ActivityEvent) => {
    const myVisitId = myVisitFor(activity);
    if (!myVisitId) return;
    setCompletionTarget({ id: activity.id, visitId: myVisitId });
  };


  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const calculateDuration = (checkIn: string, checkOut: string): string => {
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diffMs = end.getTime() - start.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getActivityStatus = (activity: ActivityEvent): string => {
    const visit = visitStatuses[activity.id] ?? (activity.visit_id ? visitStatuses[activity.visit_id] : null);
    if (!visit) return 'planned';
    if (visit.status === 'productive' || visit.check_out_time) return 'productive';
    if (visit.status === 'in-progress' || visit.check_in_time) return 'in-progress';
    return 'planned';
  };

  if (!hasLoadedOnce || (isLoading && activities.length === 0)) {
    return null;
  }

  if (activities.length === 0) return null;

  return (
    <Card className="shadow-card border-amber-200/50 dark:border-amber-800/30">
      <CardHeader className="pb-2 px-4 pt-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-amber-600" />
          <span>Activities & Events</span>
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs ml-auto">
            {activities.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        {activities.map((activity) => {
          const visitStatus = visitStatuses[activity.id] ?? (activity.visit_id ? visitStatuses[activity.visit_id] : null);
          const status = getActivityStatus(activity);
          const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.planned;
          const StatusIcon = statusConfig.icon;
          const isCheckedIn = !!visitStatus?.check_in_time;
          const isCheckedOut = !!visitStatus?.check_out_time;

          // Dedicated card layout for Event-type activities
          if (activity.activity_type === 'Event') {
            const name = activity.activity_name || 'Event';
            const initials = name
              .split(/\s+/)
              .map((w) => w[0])
              .filter(Boolean)
              .slice(0, 2)
              .join('')
              .toUpperCase();
            const timeLabel = activity.start_time
              ? new Date(activity.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : formatActivityDuration(activity);
            const statusBadgeClass =
              status === 'productive'
                ? 'bg-muted text-muted-foreground border-border'
                : status === 'in-progress'
                ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300'
                : 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300';
            const statusLabel =
              status === 'productive' ? 'Completed' : status === 'in-progress' ? 'Active' : 'Upcoming';
            // Drives both the button and the Open Event column span, so the grid
            // never leaves a half-width orphan on a phone.
            // Owner only. An assigned rep works the event but does not get to
            // rename or re-date it — and the RLS update policy would refuse
            // them anyway, so showing the button would only produce an error.
            const isOwner = !activity.user_id || activity.user_id === userId;
            const showEdit = !!canEditEvent && isOwner && status !== 'productive';
            const totals = activity.visit_id ? eventTotals[activity.visit_id] : undefined;
            const revenue = totals?.revenue || 0;
            const orderCount = totals?.orders || 0;
            const formattedRevenue = new Intl.NumberFormat('en-IN', {
              style: 'currency',
              currency: 'INR',
              maximumFractionDigits: 0,
            }).format(revenue);

            return (
              <div
                key={activity.id}
                id={`activity-event-${activity.id}`}
                className="rounded-2xl border bg-card p-4 hover:shadow-md transition-shadow scroll-mt-24"
              >

                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  {/* Left: identity */}
                  <div className="flex items-center gap-3 min-w-0 lg:min-w-[220px]">
                    <div className="h-11 w-11 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 flex items-center justify-center text-sm font-semibold shrink-0">
                      {initials || 'EV'}
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* Name, type, status and time on one line. The badges and the
                          time keep their size and the name is the only thing that
                          gives, so a long event name truncates instead of pushing
                          the status onto a second row. */}
                      <div className="flex items-center gap-2 min-w-0">
                        <h4 className="font-semibold text-sm truncate min-w-0">{name}</h4>
                        <Badge variant="outline" className="shrink-0 whitespace-nowrap text-[10px] bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300">
                          Event
                        </Badge>
                        <Badge className={`shrink-0 whitespace-nowrap text-[10px] px-2 py-0.5 border ${statusBadgeClass}`}>
                          {statusLabel}
                        </Badge>
                        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {timeLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Middle: metrics */}
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    <div className="rounded-xl border bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-xs">
                        <IndianRupee className="h-3.5 w-3.5" />
                        <span>{formattedRevenue}</span>
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">Total Revenue</div>
                    </div>
                    <div className="rounded-xl border bg-sky-50/60 dark:bg-sky-950/20 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-sky-700 dark:text-sky-400 text-xs">
                        <ShoppingCart className="h-3.5 w-3.5" />
                        <span>{orderCount}</span>
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">Orders</div>
                    </div>
                  </div>

                  {/* Right: actions.
                      Two even columns on a phone rather than flex-wrap: the four
                      labels are different lengths, so wrapping left ragged rows
                      with buttons of mismatched widths. Back to a single row from
                      lg up, where there is width for all four. */}
                  <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-nowrap lg:justify-end">
                    {/* An Event runs for hours or days, so it stays editable while it is
                        live — that is precisely when a wrong name or date needs fixing.
                        It locks once completed. */}
                    {showEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full lg:w-auto h-9 lg:h-8 text-xs gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Events go to their own form, not the generic activity
                          // modal — that modal would overwrite activity_name with
                          // the type ("test" becomes "Event") and cannot touch the
                          // venue, budget, target, footfall or assigned reps.
                          navigate(`/event/${activity.visit_id ?? activity.id}/edit`);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className={`w-full lg:w-auto h-9 lg:h-8 text-xs gap-1 ${showEdit ? '' : 'col-span-2 lg:col-span-1'}`}
                      onClick={() => activity.visit_id && navigate(`/event/${activity.visit_id}/orders`)}
                    >
                      <Play className="h-3.5 w-3.5" />
                      Open Event
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full lg:w-auto h-9 lg:h-8 text-xs gap-1"
                      onClick={() => activity.visit_id && navigate(`/event/${activity.visit_id}/stock`)}
                    >
                      <Package className="h-3.5 w-3.5" />
                      Stock Tracker
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full lg:w-auto h-9 lg:h-8 text-xs gap-1"
                      onClick={() => activity.visit_id && navigate(`/event/${activity.visit_id}/summary`)}
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      View Summary
                    </Button>
                  </div>
                </div>

                {/* Optional: Start/Complete controls */}
                {activity.visit_id && isToday && status !== 'productive' && (
                  <div className="flex items-center gap-2 pt-3 mt-3 border-t">
                    {status === 'planned' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs gap-1"
                        onClick={() => handleStartActivity(activity)}
                        disabled={actionLoading === activity.id + '-start'}
                      >
                        {actionLoading === activity.id + '-start' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                        Start
                      </Button>
                    )}
                    {status === 'in-progress' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs gap-1"
                        onClick={() => handleCompleteActivity(activity)}
                        disabled={actionLoading === activity.id + '-complete'}
                      >
                        {actionLoading === activity.id + '-complete' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        Complete
                      </Button>
                    )}
                    {activity.activity_place && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto truncate">
                        <MapPin className="h-3 w-3" />
                        {activity.activity_place}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div
              key={activity.id}
              id={`activity-event-${activity.id}`}
              role={onOpenDetail ? 'button' : undefined}
              tabIndex={onOpenDetail ? 0 : undefined}
              onClick={onOpenDetail ? () => onOpenDetail(activity, visitStatus) : undefined}
              onKeyDown={onOpenDetail ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDetail(activity, visitStatus); }
              } : undefined}
              className={`rounded-lg border border-amber-200/60 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2 scroll-mt-24 ${onOpenDetail ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
            >

              {/* Top row: Name + Type Badge + Status */}
              {(() => {
                const meta = resolveTypeMeta(activity.activity_type);
                return (
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm leading-tight">
                        {activity.activity_name || activity.retailer_name || activity.distributor_name || activity.beat_name || meta.label}
                      </h4>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge className={`text-[10px] px-2 py-0.5 ${meta.colorClass}`}>
                        {meta.label}
                      </Badge>
                    </div>
                  </div>
                );
              })()}

              {/* Per-type summary lines */}
              {activity.activity_type === 'customer_visit' && (activity.outcome || activity.follow_up_date) && (
                <div className="text-xs text-muted-foreground">
                  {activity.outcome && <span className="mr-2">Outcome: <span className="font-medium">{activity.outcome.replace(/_/g, ' ')}</span></span>}
                  {activity.follow_up_date && <span>Follow-up: {activity.follow_up_date}</span>}
                </div>
              )}
              {activity.activity_type === 'beat_visit' && (
                <div className="text-xs text-muted-foreground">
                  {activity.shops_visited ?? 0}/{activity.shops_planned ?? '?'} shops
                  {activity.km_travelled ? ` · ${activity.km_travelled} km` : ''}
                </div>
              )}
              {activity.activity_type === 'joint_beat_visit' && (
                <div className="text-xs text-muted-foreground">
                  {activity.beat_name && <span>{activity.beat_name}</span>}
                  {activity.rep_overall_outcome && <span className="ml-2">· {activity.rep_overall_outcome}</span>}
                </div>
              )}
              {activity.activity_type === 'new_beat_survey' && (
                <div className="text-xs text-muted-foreground">
                  {activity.survey_total_shops ? `${activity.survey_total_shops} shops surveyed` : ''}
                  {activity.survey_suggested_beat_count ? ` · ${activity.survey_suggested_beat_count} beats` : ''}
                  {activity.survey_priority ? ` · ${activity.survey_priority} priority` : ''}
                </div>
              )}

              {/* Status Card */}
              <div className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium ${statusConfig.color}`}>
                <StatusIcon className="h-3.5 w-3.5" />
                <span>{statusConfig.label}</span>
                {/* Duration for completed */}
                {status === 'productive' && visitStatus?.check_in_time && visitStatus?.check_out_time && (
                  <span className="ml-auto flex items-center gap-1 text-[10px] opacity-80">
                    <Timer className="h-3 w-3" />
                    {calculateDuration(visitStatus.check_in_time, visitStatus.check_out_time)}
                  </span>
                )}
              </div>

              {/* Details row */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatActivityDuration(activity)}
                </span>
                {(activity.activity_place || activity.retailer_name) && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {activity.activity_place || activity.retailer_name}
                  </span>
                )}
                {activity.start_latitude && activity.start_longitude && (
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <Navigation className="h-3 w-3" />
                    GPS
                  </span>
                )}
              </div>

              {/* Remarks */}
              {activity.remarks && (
                <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-background/60 rounded px-2 py-1.5">
                  <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{activity.remarks}</span>
                </div>
              )}

              {/* Timestamps */}
              {(isCheckedIn || isCheckedOut) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                  {isCheckedIn && (
                    <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                      <Play className="h-3 w-3" />
                      Started: {formatTime(visitStatus!.check_in_time!)}
                    </span>
                  )}
                  {isCheckedOut && (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Ended: {formatTime(visitStatus!.check_out_time!)}
                    </span>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              {activity.visit_id && isToday && (
                <div className="flex items-center gap-2 pt-1">
                  {/* Start Activity (Planned → In Progress) */}
                  {status === 'planned' && (
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={(e) => { e.stopPropagation(); handleStartActivity(activity); }}
                      disabled={actionLoading === activity.id + '-start'}
                    >
                      {actionLoading === activity.id + '-start' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                      Start Activity
                    </Button>
                  )}

                  {/* Complete Activity (In Progress → Completed) */}
                  {status === 'in-progress' && (
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                      onClick={(e) => { e.stopPropagation(); handleCompleteActivity(activity); }}
                      disabled={actionLoading === activity.id + '-complete'}
                    >
                      {actionLoading === activity.id + '-complete' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      Complete Activity
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
      {completionTarget && (
        <ActivityCompletionDialog
          open={!!completionTarget}
          onOpenChange={(o) => { if (!o) setCompletionTarget(null); }}
          activityId={completionTarget.id}
          visitId={completionTarget.visitId}
          onCompleted={() => { setCompletionTarget(null); onActivityChanged?.(); loadActivities(); }}
        />
      )}
    </Card>
  );
};

