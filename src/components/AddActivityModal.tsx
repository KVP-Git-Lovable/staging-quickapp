import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2, Activity as ActivityIcon, ChevronLeft } from 'lucide-react';
import { format, differenceInCalendarDays, addDays } from 'date-fns';
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

const COLOR_CLASS: Record<string, string> = {
  rose:   'bg-rose-100 text-rose-800 border-rose-500',
  amber:  'bg-amber-100 text-amber-800 border-amber-500',
  blue:   'bg-blue-100 text-blue-800 border-blue-500',
  green:  'bg-green-100 text-green-800 border-green-500',
  purple: 'bg-purple-100 text-purple-800 border-purple-500',
  indigo: 'bg-indigo-100 text-indigo-800 border-indigo-500',
  teal:   'bg-teal-100 text-teal-800 border-teal-500',
  orange: 'bg-orange-100 text-orange-800 border-orange-500',
  gray:   'bg-gray-100 text-gray-800 border-gray-500',
};
const ACTIVE_COLOR = (color?: string | null) => COLOR_CLASS[color || ''] || COLOR_CLASS.gray;

type DurationType = 'single_day' | 'multiple_days';
type HalfDay = 'full' | 'first_half' | 'second_half';
type DurationPreset = 30 | 60 | 120 | 240 | 480 | 'custom';

export const AddActivityModal = ({ open, onOpenChange }: AddActivityModalProps) => {
  const { user } = useAuth();
  const { createActivity } = useActivityEvents();
  const { types: activityTypes } = useActivityTypes();
  const connectivity = useConnectivity();
  const isOnline = connectivity === 'online';
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Two-level picker
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');

  const pickerTypes = activityTypes.filter(t => t.is_active && t.show_in_picker);
  const categoryOptions = pickerTypes.filter(t => t.is_category).slice(0, 5);
  const activeCategory = categoryOptions.find(c => c.id === selectedCategoryId) || null;
  const subtypeOptions = selectedCategoryId
    ? pickerTypes.filter(t => !t.is_category && t.parent_id === selectedCategoryId)
    : [];

  // Scheduling fields
  const [activityDate, setActivityDate] = useState<Date>(new Date());
  const [durationType, setDurationType] = useState<DurationType>('single_day');
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [durationPreset, setDurationPreset] = useState<DurationPreset>(60);
  const [customMinutes, setCustomMinutes] = useState<number>(45);
  const [halfDay, setHalfDay] = useState<HalfDay>('full');

  const resetForm = () => {
    setSelectedCategoryId('');
    setSelectedType('');
    setActivityDate(new Date());
    setDurationType('single_day');
    setFromDate(new Date());
    setToDate(new Date());
    setDurationPreset(60);
    setCustomMinutes(45);
    setHalfDay('full');
  };

  useEffect(() => {
    if (!open) resetForm();
  }, [open]);

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

  const showTypePicker = !!selectedCategoryId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ActivityIcon className="h-5 w-5" />
            Schedule Activity
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Step 1: Category boxes */}
          {!showTypePicker && (
            <div>
              <Label className="mb-2 block">Choose a category</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {categoryOptions.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={cn(
                      'p-3 rounded-lg border-2 text-left transition-all hover:shadow-sm',
                      'border-border bg-card'
                    )}
                  >
                    <Badge className={cn('text-[10px] mb-1', ACTIVE_COLOR(cat.color))}>{cat.name}</Badge>
                    {cat.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2">{cat.description}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Sub-type picker */}
          {showTypePicker && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>
                  <span className="text-muted-foreground text-xs mr-2">Category:</span>
                  <span className="font-medium">{activeCategory?.name}</span>
                </Label>
                <Button
                  size="sm" variant="ghost"
                  onClick={() => { setSelectedCategoryId(''); setSelectedType(''); }}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Change
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {subtypeOptions.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedType(t.name)}
                    className={cn(
                      'p-3 rounded-lg border-2 text-left text-sm transition-all',
                      selectedType === t.name
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:bg-muted/50'
                    )}
                  >
                    <div className="font-medium">{t.name}</div>
                    {t.description && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>
                    )}
                  </button>
                ))}
                {subtypeOptions.length === 0 && (
                  <p className="col-span-full text-xs text-muted-foreground">No sub-types configured.</p>
                )}
              </div>
            </div>
          )}

          {/* Scheduling section */}
          {selectedType && (
            <div className="space-y-4 border-t pt-4">
              {/* Single vs multi-day */}
              <div>
                <Label className="mb-2 block">Duration</Label>
                <div className="flex gap-2">
                  {(['single_day', 'multiple_days'] as DurationType[]).map(dt => (
                    <button
                      key={dt}
                      type="button"
                      onClick={() => setDurationType(dt)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-sm border',
                        durationType === dt ? 'border-primary bg-primary/10' : 'border-border'
                      )}
                    >
                      {dt === 'single_day' ? 'Single day' : 'Multiple days'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dates */}
              {durationType === 'single_day' ? (
                <div>
                  <Label className="mb-2 block">Activity date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(activityDate, 'PPP')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={activityDate}
                        onSelect={(d) => d && setActivityDate(d)}
                        initialFocus
                        className={cn('p-3 pointer-events-auto')}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-2 block">From</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(fromDate, 'PP')}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={fromDate}
                          onSelect={(d) => {
                            if (!d) return;
                            setFromDate(d);
                            if (differenceInCalendarDays(toDate, d) < 0) setToDate(d);
                          }}
                          initialFocus
                          className={cn('p-3 pointer-events-auto')}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label className="mb-2 block">To</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(toDate, 'PP')}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={toDate}
                          onSelect={(d) => d && setToDate(d)}
                          disabled={(d) => differenceInCalendarDays(d, fromDate) < 0}
                          initialFocus
                          className={cn('p-3 pointer-events-auto')}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <p className="col-span-2 text-xs text-muted-foreground">
                    {differenceInCalendarDays(toDate, fromDate) + 1} day(s) scheduled
                  </p>
                </div>
              )}

              {/* Expected duration */}
              <div>
                <Label className="mb-2 block">Expected duration</Label>
                <div className="flex flex-wrap gap-2">
                  {([
                    [30, '30 min'],
                    [60, '1 hr'],
                    [120, '2 hr'],
                    [240, '4 hr'],
                    [480, 'Full day'],
                    ['custom', 'Custom'],
                  ] as [DurationPreset, string][]).map(([val, label]) => (
                    <button
                      key={String(val)}
                      type="button"
                      onClick={() => setDurationPreset(val)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-sm border',
                        durationPreset === val ? 'border-primary bg-primary/10' : 'border-border'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {durationPreset === 'custom' && (
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(Number(e.target.value))}
                      className="w-32"
                    />
                    <span className="text-sm text-muted-foreground">minutes</span>
                  </div>
                )}
              </div>

              {/* Time of day */}
              <div>
                <Label className="mb-2 block">Time of day</Label>
                <div className="flex gap-2">
                  {([
                    ['full', 'Full day'],
                    ['first_half', 'First half'],
                    ['second_half', 'Second half'],
                  ] as [HalfDay, string][]).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setHalfDay(val)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-sm border',
                        halfDay === val ? 'border-primary bg-primary/10' : 'border-border'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || !selectedType}>
              {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Schedule
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
