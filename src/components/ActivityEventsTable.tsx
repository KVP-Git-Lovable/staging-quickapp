import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarDays, Clock, MapPin, MessageSquare, Loader2, Play, CheckCircle2, Navigation, Timer, IndianRupee, ShoppingCart, Package, BarChart3 } from 'lucide-react';
import { useActivityEvents, ActivityEvent, formatActivityDuration } from '@/hooks/useActivityEvents';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getLocalTodayDate } from '@/utils/dateUtils';
import { Geolocation } from '@capacitor/geolocation';
import { useNavigate } from 'react-router-dom';

interface ActivityEventsTableProps {
  userId: string;
  selectedDate: string;
  onActivitiesLoaded?: (count: number) => void;
}

interface VisitStatus {
  check_in_time: string | null;
  check_out_time: string | null;
  status: string | null;
}

const ACTIVITY_TYPE_COLORS: Record<string, string> = {
  'Doctor Visit': 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  Celebration: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  Event: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Promotion: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  Demo: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  Meeting: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  Other: 'bg-muted text-muted-foreground',
  // New 7-type visit categories
  customer_visit:    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  beat_visit:        'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  joint_beat_visit:  'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  new_beat_survey:   'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  distributor_visit: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  event_promotion:   'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  meeting_training:  'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

const TYPE_LABELS: Record<string, string> = {
  customer_visit: 'Customer',
  beat_visit: 'Beat',
  joint_beat_visit: 'Joint',
  new_beat_survey: 'Route survey',
  distributor_visit: 'Distributor',
  event_promotion: 'Event',
  meeting_training: 'Meeting',
};

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

export const ActivityEventsTable = ({ userId, selectedDate, onActivitiesLoaded }: ActivityEventsTableProps) => {
  const { fetchActivitiesForDate, updateActivityLocation } = useActivityEvents();
  const navigate = useNavigate();
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [visitStatuses, setVisitStatuses] = useState<Record<string, VisitStatus>>({});
  const [eventTotals, setEventTotals] = useState<Record<string, { revenue: number; orders: number }>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

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
      setActivities(data);
      onActivitiesLoadedRef.current?.(data.length);

      // Fetch visit statuses
      const visitIds = data.map(a => a.visit_id).filter(Boolean);
      if (visitIds.length > 0) {
        const { data: visits } = await supabase
          .from('visits')
          .select('id, check_in_time, check_out_time, status')
          .in('id', visitIds);

        if (visits) {
          const map: Record<string, VisitStatus> = {};
          visits.forEach(v => {
            map[v.id] = {
              check_in_time: v.check_in_time,
              check_out_time: v.check_out_time,
              status: v.status,
            };
          });
          setVisitStatuses(map);
        }

        // Fetch real revenue/order totals per visit (events)
        const { data: orderRows } = await supabase
          .from('orders')
          .select('visit_id, total_amount, status')
          .in('visit_id', visitIds);

        const totals: Record<string, { revenue: number; orders: number }> = {};
        (orderRows || []).forEach((o: any) => {
          if (!o.visit_id) return;
          if (o.status === 'cancelled') return;
          const t = totals[o.visit_id] || { revenue: 0, orders: 0 };
          t.revenue += Number(o.total_amount) || 0;
          t.orders += 1;
          totals[o.visit_id] = t;
        });
        setEventTotals(totals);
      }
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

  const handleStartActivity = async (activity: ActivityEvent) => {
    if (!activity.visit_id) return;
    setActionLoading(activity.id + '-start');
    try {
      const now = new Date().toISOString();
      const gps = await captureGPS();

      // Update visit to in-progress with check_in_time
      const { error: visitError } = await supabase
        .from('visits')
        .update({ 
          check_in_time: now, 
          status: 'in-progress',
        } as any)
        .eq('id', activity.visit_id);

      if (visitError) throw visitError;

      // Update activity_events with start location and time
      await updateActivityLocation(activity.id, {
        start_time: now,
        ...(gps ? { start_latitude: gps.lat, start_longitude: gps.lng } : {}),
      });

      toast.success('Activity started — tracking in progress');
      window.dispatchEvent(new CustomEvent('visitDataChanged'));
      await loadActivities();
    } catch (err) {
      console.error('[ActivityEventsTable] Start failed:', err);
      toast.error('Failed to start activity');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCompleteActivity = async (activity: ActivityEvent) => {
    if (!activity.visit_id) return;
    setActionLoading(activity.id + '-complete');
    try {
      const now = new Date().toISOString();
      const gps = await captureGPS();

      // Update visit to productive/completed with check_out_time
      const { error: visitError } = await supabase
        .from('visits')
        .update({ 
          check_out_time: now, 
          status: 'productive',
        } as any)
        .eq('id', activity.visit_id);

      if (visitError) throw visitError;

      // Update activity_events with end location and time
      await updateActivityLocation(activity.id, {
        end_time: now,
        ...(gps ? { end_latitude: gps.lat, end_longitude: gps.lng } : {}),
      });

      toast.success('Activity completed!');
      window.dispatchEvent(new CustomEvent('visitDataChanged'));
      await loadActivities();
    } catch (err) {
      console.error('[ActivityEventsTable] Complete failed:', err);
      toast.error('Failed to complete activity');
    } finally {
      setActionLoading(null);
    }
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
    const visit = activity.visit_id ? visitStatuses[activity.visit_id] : null;
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
          const visitStatus = activity.visit_id ? visitStatuses[activity.visit_id] : null;
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
                className="rounded-2xl border bg-card p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  {/* Left: identity */}
                  <div className="flex items-center gap-3 lg:min-w-[220px]">
                    <div className="h-11 w-11 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 flex items-center justify-center text-sm font-semibold shrink-0">
                      {initials || 'EV'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-sm truncate">{name}</h4>
                        <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300">
                          Event
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge className={`text-[10px] px-2 py-0.5 border ${statusBadgeClass}`}>
                          {statusLabel}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
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

                  {/* Right: actions */}
                  <div className="flex flex-wrap lg:flex-nowrap gap-2 lg:justify-end">
                    <Button
                      size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={() => activity.visit_id && navigate(`/event/${activity.visit_id}/orders`)}
                    >
                      <Play className="h-3.5 w-3.5" />
                      Open Event
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1"
                      onClick={() => activity.visit_id && navigate(`/event/${activity.visit_id}/stock`)}
                    >
                      <Package className="h-3.5 w-3.5" />
                      Stock Tracker
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1"
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
              className="rounded-lg border border-amber-200/60 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2"
            >
              {/* Top row: Name + Type Badge + Status */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm leading-tight">
                    {activity.activity_name || activity.retailer_name || activity.distributor_name || activity.beat_name || TYPE_LABELS[activity.activity_type] || activity.activity_type}
                  </h4>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge className={`text-[10px] px-2 py-0.5 ${ACTIVITY_TYPE_COLORS[activity.activity_type] || ACTIVITY_TYPE_COLORS.Other}`}>
                    {TYPE_LABELS[activity.activity_type] || activity.activity_type}
                  </Badge>
                </div>
              </div>

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
                      onClick={() => handleStartActivity(activity)}
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
                      onClick={() => handleCompleteActivity(activity)}
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
    </Card>
  );
};
