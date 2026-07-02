import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  CalendarIcon, Loader2, Activity as ActivityIcon, Sparkles, CalendarDays,
  Clock, Sun, Moon, Sunrise, Rocket, Check,
} from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useActivityEvents } from '@/hooks/useActivityEvents';
import { useActivityTypes } from '@/hooks/useActivityTypes';
import { useConnectivity } from '@/hooks/useConnectivity';
import { toast } from 'sonner';

interface AddActivityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Palette maps keyed by the master's `color` string.
const COLOR_SOFT: Record<string, string> = {
  rose:   'bg-rose-50 text-rose-700 border-rose-200',
  amber:  'bg-amber-50 text-amber-800 border-amber-200',
  blue:   'bg-blue-50 text-blue-700 border-blue-200',
  green:  'bg-green-50 text-green-700 border-green-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  teal:   'bg-teal-50 text-teal-700 border-teal-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  gray:   'bg-gray-50 text-gray-700 border-gray-200',
};
const COLOR_SOLID: Record<string, string> = {
  rose:   'bg-gradient-to-br from-rose-500 to-rose-600 text-white border-rose-600',
  amber:  'bg-gradient-to-br from-amber-500 to-orange-500 text-white border-amber-600',
  blue:   'bg-gradient-to-br from-blue-500 to-blue-600 text-white border-blue-600',
  green:  'bg-gradient-to-br from-emerald-500 to-green-600 text-white border-green-600',
  purple: 'bg-gradient-to-br from-purple-500 to-purple-600 text-white border-purple-600',
  indigo: 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white border-indigo-600',
  teal:   'bg-gradient-to-br from-teal-500 to-teal-600 text-white border-teal-600',
  orange: 'bg-gradient-to-br from-orange-500 to-orange-600 text-white border-orange-600',
  gray:   'bg-gradient-to-br from-slate-500 to-slate-600 text-white border-slate-600',
};
const COLOR_RING: Record<string, string> = {
  rose: 'ring-rose-300', amber: 'ring-amber-300', blue: 'ring-blue-300',
  green: 'ring-green-300', purple: 'ring-purple-300', indigo: 'ring-indigo-300',
  teal: 'ring-teal-300', orange: 'ring-orange-300', gray: 'ring-slate-300',
};
const soft = (c?: string | null) => COLOR_SOFT[c || ''] || COLOR_SOFT.gray;
const solid = (c?: string | null) => COLOR_SOLID[c || ''] || COLOR_SOLID.gray;
const ring = (c?: string | null) => COLOR_RING[c || ''] || COLOR_RING.gray;

type DurationType = 'single_day' | 'multiple_days';
type HalfDay = 'full' | 'first_half' | 'second_half';
type DurationPreset = 30 | 60 | 120 | 240 | 480 | 'custom';

const SectionCard = ({
  step, title, icon: Icon, children, tone = 'from-slate-50 to-white',
}: {
  step: number; title: string; icon: any; children: React.ReactNode; tone?: string;
}) => (
  <div className={cn('rounded-xl border p-2.5 bg-gradient-to-br shadow-sm', tone)}>
    <div className="flex items-center gap-1.5 mb-1.5">
      <div className="h-5 w-5 rounded-full bg-white border shadow-sm flex items-center justify-center text-[10px] font-bold text-primary">
        {step}
      </div>
      <Icon className="h-3 w-3 text-muted-foreground" />
      <span className="text-xs font-semibold">{title}</span>
    </div>
    {children}
  </div>
);



export const AddActivityModal = ({ open, onOpenChange }: AddActivityModalProps) => {
  const { user } = useAuth();
  const { createActivity } = useActivityEvents();
  const { types: activityTypes } = useActivityTypes();
  const connectivity = useConnectivity();
  const isOnline = connectivity === 'online';
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');

  const pickerTypes = activityTypes.filter(t => t.is_active && t.show_in_picker);
  const categoryOptions = pickerTypes.filter(t => t.is_category).slice(0, 5);
  const activeCategory = categoryOptions.find(c => c.id === selectedCategoryId) || null;
  const subtypeOptions = selectedCategoryId
    ? pickerTypes.filter(t => !t.is_category && t.parent_id === selectedCategoryId)
    : [];

  const [activityDate, setActivityDate] = useState<Date>(new Date());
  const [durationType, setDurationType] = useState<DurationType>('single_day');
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [durationPreset, setDurationPreset] = useState<DurationPreset>(60);
  const [customMinutes, setCustomMinutes] = useState<number>(45);
  const [halfDay, setHalfDay] = useState<HalfDay>('full');

  const resetForm = () => {
    setSelectedCategoryId(''); setSelectedType('');
    setActivityDate(new Date()); setDurationType('single_day');
    setFromDate(new Date()); setToDate(new Date());
    setDurationPreset(60); setCustomMinutes(45); setHalfDay('full');
  };

  useEffect(() => { if (!open) resetForm(); }, [open]);

  const expectedMinutes = (): number | undefined => {
    if (durationPreset === 'custom') {
      return Number.isFinite(customMinutes) && customMinutes > 0 ? Math.round(customMinutes) : undefined;
    }
    return durationPreset;
  };

  const handleSubmit = async () => {
    if (!user?.id) return toast.error('Please log in first');
    if (!isOnline) return toast.error('Scheduling requires internet');
    if (!selectedCategoryId) return toast.error('Pick a category');
    if (!selectedType) return toast.error('Pick an activity type');
    if (durationType === 'multiple_days') {
      if (!fromDate || !toDate) return toast.error('Select from and to dates');
      if (differenceInCalendarDays(toDate, fromDate) < 0) return toast.error('To date must be on or after From date');
    }

    setIsSubmitting(true);
    try {
      const isMulti = durationType === 'multiple_days';
      const totalDays = isMulti ? differenceInCalendarDays(toDate, fromDate) + 1 : undefined;
      const activity_date = isMulti ? format(fromDate, 'yyyy-MM-dd') : format(activityDate, 'yyyy-MM-dd');

      const res = await createActivity({
        activity_name: selectedType,
        activity_type: selectedType,
        visit_category: selectedType,
        activity_sub_type: selectedType,
        duration_type: isMulti ? 'multiple_days' : 'single_day',
        activity_date,
        from_date: isMulti ? format(fromDate, 'yyyy-MM-dd') : undefined,
        to_date:   isMulti ? format(toDate,   'yyyy-MM-dd') : undefined,
        total_days: totalDays,
        half_day_type: halfDay === 'full' ? undefined : halfDay,
        expected_duration_minutes: expectedMinutes(),
      });

      if (!res) throw new Error('Failed to schedule activity');
      toast.success('Activity scheduled');
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Failed to schedule activity');
    } finally {
      setIsSubmitting(false);
    }
  };

  const durationPresets: [DurationPreset, string, any][] = [
    [30, '30 min', Clock], [60, '1 hr', Clock], [120, '2 hr', Clock],
    [240, '4 hr', Clock], [480, 'Full day', Sun], ['custom', 'Custom', Sparkles],
  ];
  const halves: [HalfDay, string, any][] = [
    ['full', 'Full day', Sun], ['first_half', 'First half', Sunrise], ['second_half', 'Second half', Moon],
  ];

  const durationLabel = () => {
    const m = expectedMinutes();
    if (!m) return '—';
    if (m >= 480) return 'Full day';
    return m >= 60 ? `${Math.round(m / 60 * 10) / 10} hr` : `${m} min`;
  };

  const canSubmit = !!selectedCategoryId && !!selectedType && !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* Gradient header */}
        <div className="relative overflow-hidden rounded-t-lg bg-gradient-to-br from-primary/15 via-fuchsia-500/10 to-amber-400/10 border-b px-4 py-3">
          <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
          <div className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-fuchsia-400/10 blur-2xl" />
          <DialogHeader className="relative">
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-fuchsia-500 text-white flex items-center justify-center shadow-sm">
                <ActivityIcon className="h-4 w-4" />
              </div>
              <div>
                <div className="font-bold">Schedule Activity</div>
                <div className="text-[10px] font-normal text-muted-foreground">
                  Pick a category, choose when, and you're set.
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="p-2.5 space-y-2.5">
          {/* 1. Category */}
          <SectionCard step={1} title="Category" icon={Sparkles} tone="from-primary/5 to-white">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {categoryOptions.map(cat => {
                const active = selectedCategoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategoryId(cat.id);
                      setSelectedType('');
                    }}
                    className={cn(
                      'relative p-2 rounded-lg border-2 text-left transition-all hover:scale-[1.02] hover:shadow-sm',
                      active
                        ? cn(solid(cat.color), 'ring-2 ring-offset-1 shadow-md', ring(cat.color))
                        : cn(soft(cat.color), 'hover:brightness-95'),
                    )}
                  >
                    {active && (
                      <div className="absolute top-1 right-1 h-4 w-4 rounded-full bg-white/90 text-primary flex items-center justify-center shadow">
                        <Check className="h-2.5 w-2.5" />
                      </div>
                    )}
                    <div className="text-xs font-semibold leading-tight pr-4">{cat.name}</div>
                    {cat.description && (
                      <p className={cn('text-[9px] mt-0.5 line-clamp-1', active ? 'text-white/80' : 'opacity-70')}>
                        {cat.description}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </SectionCard>

          {/* 2. Sub-type */}
          <SectionCard step={2} title="Activity type" icon={ActivityIcon} tone="from-fuchsia-50 to-white">
            {!selectedCategoryId ? (
              <p className="text-[10px] text-muted-foreground italic">Pick a category above to see activity types.</p>
            ) : subtypeOptions.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">No sub-types configured for {activeCategory?.name}.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {subtypeOptions.map(t => {
                  const active = selectedType === t.name;
                  const c = activeCategory?.color;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedType(t.name)}
                      className={cn(
                        'px-2 py-1 rounded-full text-[11px] border-2 transition-all leading-none',
                        active
                          ? cn(solid(c), 'shadow-sm scale-105')
                          : cn(soft(c), 'hover:brightness-95'),
                      )}
                    >
                      {active && <Check className="inline h-2.5 w-2.5 mr-0.5" />}
                      {t.name}
                    </button>
                  );
                })}
              </div>
            )}
          </SectionCard>


          {/* 3. When */}
          <SectionCard step={3} title="When" icon={CalendarDays} tone="from-blue-50 to-white">
            <div className="flex gap-1.5 mb-1.5">
              {(['single_day', 'multiple_days'] as DurationType[]).map(dt => (
                <button
                  key={dt}
                  type="button"
                  onClick={() => setDurationType(dt)}
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-medium border-2 transition',
                    durationType === dt
                      ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white border-blue-600 shadow'
                      : 'bg-white border-border hover:bg-blue-50',
                  )}
                >
                  {dt === 'single_day' ? 'Single day' : 'Multiple days'}
                </button>
              ))}
            </div>

            {durationType === 'single_day' ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal bg-white h-7 text-[11px]">
                    <CalendarIcon className="mr-1.5 h-3 w-3 text-blue-500" />
                    {format(activityDate, 'PP')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={activityDate}
                    onSelect={(d) => d && setActivityDate(d)} initialFocus
                    className={cn('p-3 pointer-events-auto')} />
                </PopoverContent>
              </Popover>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal bg-white h-7 text-[11px]">
                      <CalendarIcon className="mr-1.5 h-3 w-3 text-blue-500" />
                      From: {format(fromDate, 'PP')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={fromDate}
                      onSelect={(d) => {
                        if (!d) return;
                        setFromDate(d);
                        if (differenceInCalendarDays(toDate, d) < 0) setToDate(d);
                      }} initialFocus className={cn('p-3 pointer-events-auto')} />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal bg-white h-7 text-[11px]">
                      <CalendarIcon className="mr-1.5 h-3 w-3 text-indigo-500" />
                      To: {format(toDate, 'PP')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={toDate}
                      onSelect={(d) => d && setToDate(d)}
                      disabled={(d) => differenceInCalendarDays(d, fromDate) < 0}
                      initialFocus className={cn('p-3 pointer-events-auto')} />
                  </PopoverContent>
                </Popover>
                <p className="col-span-2 text-[10px] text-blue-600 font-medium">
                  {differenceInCalendarDays(toDate, fromDate) + 1} day(s)
                </p>
              </div>
            )}
          </SectionCard>

          {/* 4. Duration */}
          <SectionCard step={4} title="Expected duration" icon={Clock} tone="from-emerald-50 to-white">
            <div className="flex flex-wrap gap-1">
              {durationPresets.map(([val, label, Icon]) => {
                const active = durationPreset === val;
                return (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => setDurationPreset(val)}
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] font-medium border-2 transition flex items-center gap-1',
                      active
                        ? 'bg-gradient-to-br from-emerald-500 to-green-600 text-white border-green-600 shadow'
                        : 'bg-white border-border hover:bg-emerald-50 text-slate-700',
                    )}
                  >
                    <Icon className="h-2.5 w-2.5" />
                    {label}
                  </button>
                );
              })}
            </div>
            {durationPreset === 'custom' && (
              <div className="mt-1.5 flex items-center gap-2">
                <Input type="number" min={1} value={customMinutes}
                  onChange={(e) => setCustomMinutes(Number(e.target.value))}
                  className="w-24 h-7 bg-white text-[11px]" />
                <span className="text-[10px] text-muted-foreground">min</span>
              </div>
            )}
          </SectionCard>

          {/* 5. Time of day */}
          <SectionCard step={5} title="Time of day" icon={Sun} tone="from-amber-50 to-white">
            <div className="flex flex-wrap gap-1">
              {halves.map(([val, label, Icon]) => {
                const active = halfDay === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setHalfDay(val)}
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] font-medium border-2 transition flex items-center gap-1',
                      active
                        ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white border-orange-500 shadow'
                        : 'bg-white border-border hover:bg-amber-50 text-slate-700',
                    )}
                  >
                    <Icon className="h-2.5 w-2.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </SectionCard>

          {/* Summary strip */}
          <div className="rounded-lg border bg-gradient-to-r from-slate-50 via-white to-slate-50 p-1.5 flex flex-wrap items-center gap-1">
            <span className="text-[9px] text-muted-foreground font-medium">Summary:</span>
            {activeCategory && (
              <Badge className={cn('text-[9px] py-0 px-1 border', soft(activeCategory.color))}>{activeCategory.name}</Badge>
            )}
            {selectedType && (
              <Badge className={cn('text-[9px] py-0 px-1 border', soft(activeCategory?.color))}>{selectedType}</Badge>
            )}
            <Badge variant="outline" className="text-[9px] py-0 px-1 gap-0.5">
              <CalendarDays className="h-2 w-2" />
              {durationType === 'single_day'
                ? format(activityDate, 'MMM d')
                : `${format(fromDate, 'MMM d')} → ${format(toDate, 'MMM d')}`}
            </Badge>
            <Badge variant="outline" className="text-[9px] py-0 px-1 gap-0.5"><Clock className="h-2 w-2" />{durationLabel()}</Badge>
            <Badge variant="outline" className="text-[9px] py-0 px-1 gap-0.5">
              {halfDay === 'first_half' ? <Sunrise className="h-2 w-2" /> :
                halfDay === 'second_half' ? <Moon className="h-2 w-2" /> : <Sun className="h-2 w-2" />}
              {halfDay === 'full' ? 'Full day' : halfDay === 'first_half' ? '1st half' : '2nd half'}
            </Badge>
          </div>


          {/* Footer */}
          <div className="flex justify-end gap-1.5">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSubmitting} className="h-7 text-xs px-2.5">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="h-7 px-3 bg-gradient-to-br from-primary to-fuchsia-600 hover:brightness-110 text-white shadow-sm text-xs"
            >
              {isSubmitting
                ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                : <Rocket className="h-3 w-3 mr-1" />}
              Schedule
            </Button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
};
