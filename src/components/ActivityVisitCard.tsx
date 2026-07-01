import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Activity as ActivityIcon, Clock, CalendarDays, CheckCircle2, Play, Timer, XCircle, LogIn, LogOut, Loader2,
} from 'lucide-react';
import { useActivityTypes } from '@/hooks/useActivityTypes';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ActivityVisitCardModel } from '@/hooks/useActivityVisits';

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
const humanize = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

interface Props {
  activity: ActivityVisitCardModel;
  onOpen?: (activity: ActivityVisitCardModel) => void;
  onChanged?: () => void;
}

async function tryGetPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    const t = setTimeout(() => resolve(null), 6000);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { clearTimeout(t); resolve(null); },
      { enableHighAccuracy: true, timeout: 6000 },
    );
  });
}

export const ActivityVisitCard = ({ activity, onOpen, onChanged }: Props) => {
  const { types } = useActivityTypes();
  const [busy, setBusy] = useState<'check_in' | 'complete' | null>(null);
  const [tick, setTick] = useState(0);

  const meta = (() => {
    const key = activity.activityType;
    if (!key) return { label: 'Other', colorClass: NEUTRAL };
    const hit = types.find(t => t.name === key || t.code === key);
    return {
      label: hit?.name ?? humanize(key),
      colorClass: (hit?.color && COLOR_CLASS[hit.color]) || NEUTRAL,
    };
  })();

  const isCancelled = activity.status === 'cancelled';
  const isCompleted = !isCancelled && (!!activity.checkOutTime || activity.status === 'productive' || activity.status === 'completed');
  const isInProgress = !isCancelled && !isCompleted && (!!activity.checkInTime || activity.status === 'in-progress');

  const state = (() => {
    if (isCancelled) return { label: 'Cancelled', Icon: XCircle, cls: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/30 dark:text-rose-300' };
    if (isCompleted) return { label: 'Completed', Icon: CheckCircle2, cls: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300' };
    if (isInProgress) return { label: 'In progress', Icon: Play, cls: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300' };
    return { label: 'Not started', Icon: CalendarDays, cls: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300' };
  })();

  const fmtTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

  const fmtDuration = (m: number | null) => {
    if (m == null || m < 0) return null;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return h > 0 ? `${h}h ${rem}m` : `${rem}m`;
  };

  // Live elapsed clock while in progress
  useEffect(() => {
    if (!isInProgress) return;
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, [isInProgress]);

  const liveDuration = (() => {
    if (isInProgress && activity.checkInTime) {
      const mins = Math.max(0, Math.round((Date.now() - new Date(activity.checkInTime).getTime()) / 60000));
      return mins;
    }
    return activity.durationMinutes;
  })();
  // reference tick so eslint keeps interval; not otherwise needed
  void tick;

  const title = activity.activityName && activity.activityName !== 'Activity'
    ? activity.activityName
    : meta.label;

  const runAction = async (action: 'check_in' | 'complete', e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(action);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const actor = userRes?.user?.id;
      if (!actor) { toast.error('Not signed in'); return; }
      const pos = await tryGetPosition();
      const { data, error } = await supabase.rpc('activity_visit_action', {
        p_visit_id: activity.visitId,
        p_activity_event_id: activity.activityEventId,
        p_action: action,
        p_actor: actor,
        p_lat: pos?.lat ?? null,
        p_lng: pos?.lng ?? null,
      });
      if (error) throw error;
      if ((data as any)?.success === false) throw new Error((data as any)?.error || 'Action failed');
      toast.success(action === 'check_in' ? 'Checked in' : 'Activity completed');
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  const StateIcon = state.Icon;

  return (
    <Card
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={() => onOpen?.(activity)}
      onKeyDown={(e) => {
        if (onOpen && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen(activity);
        }
      }}
      className="shadow-card border-primary/10 cursor-pointer hover:shadow-md transition-shadow"
    >
      <CardContent className="p-3 sm:p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <ActivityIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className="text-[10px]">Activity</Badge>
                <Badge className={`text-[10px] ${meta.colorClass}`}>{meta.label}</Badge>
              </div>
              <h4 className="font-semibold text-sm truncate mt-1">{title}</h4>
            </div>
          </div>
          <Badge className={`text-[10px] border ${state.cls} flex items-center gap-1 shrink-0`}>
            <StateIcon className="h-3 w-3" />
            {state.label}
          </Badge>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            {activity.plannedDate}
          </span>
          {fmtTime(activity.checkInTime) && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              In {fmtTime(activity.checkInTime)}
              {fmtTime(activity.checkOutTime) && ` · Out ${fmtTime(activity.checkOutTime)}`}
            </span>
          )}
          {fmtDuration(liveDuration) && (
            <span className="flex items-center gap-1">
              <Timer className="h-3 w-3" />
              {fmtDuration(liveDuration)}{isInProgress ? ' (live)' : ''}
            </span>
          )}
        </div>

        {!isCancelled && !isCompleted && (
          <div className="flex items-center gap-2 pt-1">
            {!isInProgress ? (
              <Button
                size="sm"
                variant="default"
                className="h-7 px-2 text-xs"
                disabled={busy !== null}
                onClick={(e) => runAction('check_in', e)}
              >
                {busy === 'check_in' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <LogIn className="h-3 w-3 mr-1" />}
                Check-In
              </Button>
            ) : (
              <Button
                size="sm"
                variant="default"
                className="h-7 px-2 text-xs"
                disabled={busy !== null}
                onClick={(e) => runAction('complete', e)}
              >
                {busy === 'complete' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <LogOut className="h-3 w-3 mr-1" />}
                Check-Out
              </Button>
            )}
            {onOpen && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={(e) => { e.stopPropagation(); onOpen(activity); }}
              >
                Details
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
