import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity as ActivityIcon, Clock, CalendarDays, CheckCircle2, Play, Timer } from 'lucide-react';
import { useActivityTypes } from '@/hooks/useActivityTypes';
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
}

export const ActivityVisitCard = ({ activity, onOpen }: Props) => {
  const { types } = useActivityTypes();

  const meta = (() => {
    const key = activity.activityType;
    if (!key) return { label: 'Other', colorClass: NEUTRAL };
    const hit = types.find(t => t.name === key || t.code === key);
    return {
      label: hit?.name ?? humanize(key),
      colorClass: (hit?.color && COLOR_CLASS[hit.color]) || NEUTRAL,
    };
  })();

  const state = (() => {
    if (activity.checkOutTime || activity.status === 'productive') {
      return { label: 'Completed', Icon: CheckCircle2, cls: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300' };
    }
    if (activity.checkInTime || activity.status === 'in-progress') {
      return { label: 'In progress', Icon: Play, cls: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300' };
    }
    return { label: 'Not started', Icon: CalendarDays, cls: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300' };
  })();

  const fmtTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

  const fmtDuration = (m: number | null) => {
    if (!m || m <= 0) return null;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return h > 0 ? `${h}h ${rem}m` : `${rem}m`;
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
              <h4 className="font-semibold text-sm truncate mt-1">{activity.activityName}</h4>
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
          {fmtDuration(activity.durationMinutes) && (
            <span className="flex items-center gap-1">
              <Timer className="h-3 w-3" />
              {fmtDuration(activity.durationMinutes)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
