import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  format, addDays, parseISO, differenceInCalendarDays, startOfWeek,
  subDays, addMonths, subMonths, startOfMonth, endOfMonth, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday,
} from 'date-fns';
import {
  ArrowLeft,
  CalendarIcon,
  Sparkles,
  Lock,
  Trash2,
  RefreshCw,
  Save,
  X,
  MapPin,
  Users,
  IndianRupee,
  AlertTriangle,
  MoreVertical,
  Plus,
  CheckCircle2,
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';

import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface DayPlan {
  day: string;
  date: string;
  beat_id: string;
  beat_name: string;
  retailers: Array<{
    retailer_id: string;
    retailer_name: string;
    priority_score?: number;
    reasons?: string[];
  }>;
  estimated_value: number;
  is_prescheduled?: boolean;
  rationale?: string;
}

interface BeatOption {
  id: string;
  beat_name: string;
}

const MAX_RANGE_DAYS = 31;
const MAX_RETAILERS_PER_DAY = 60;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function AutoPlanPreview() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Date range — default: today → end of next week
  const today = useMemo(() => new Date(), []);
  const defaultTo = useMemo(() => {
    const monday = startOfWeek(today, { weekStartsOn: 1 });
    return addDays(monday, 13);
  }, [today]);

  // Optional prefill from navigation state (e.g. "Edit Plans" on rationale page)
  const prefill = (location.state as { fromDate?: string; toDate?: string } | null) || null;
  const initialFrom = useMemo(
    () => (prefill?.fromDate ? new Date(prefill.fromDate) : today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const initialTo = useMemo(
    () => (prefill?.toDate ? new Date(prefill.toDate) : defaultTo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [fromDate, setFromDate] = useState<Date>(initialFrom);
  const [toDate, setToDate] = useState<Date>(initialTo);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [days, setDays] = useState<DayPlan[]>([]);
  const [hasPreview, setHasPreview] = useState(false);
  const [beats, setBeats] = useState<BeatOption[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // Calendar (month grid) state + 90-day history for visual pattern context
  const [cursorMonth, setCursorMonth] = useState<Date>(initialFrom);
  const [history, setHistory] = useState<Array<{ date: string; beat_name: string }>>([]);

  // Existing-plan replacement counts (refreshed on every generate)
  const [existingAutoCount, setExistingAutoCount] = useState(0);
  const [existingManualCount, setExistingManualCount] = useState(0);

  // Confirmation dialogs
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState<null | (() => void)>(null);
  const [saveSuccess, setSaveSuccess] = useState<{ created: number; from: string; to: string } | null>(null);

  // ---------------------------------------------------------------------------
  // Load user beats for Replace/Add
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('beats')
        .select('id, beat_name')
        .or(`owner_id.eq.${user.id},user_id.eq.${user.id}`)
        .eq('is_active', true)
        .order('beat_name', { ascending: true });
      setBeats((data || []) as BeatOption[]);
    })();
  }, [user?.id]);

  // ---------------------------------------------------------------------------
  // (1) Unsaved-changes warning — beforeunload
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Guarded internal navigation
  const safeNavigate = useCallback(
    (fn: () => void) => {
      if (isDirty) {
        setConfirmLeave(() => fn);
      } else {
        fn();
      }
    },
    [isDirty],
  );

  // ---------------------------------------------------------------------------
  // Count existing beat_plans rows in the chosen range (Rec #6)
  // ---------------------------------------------------------------------------
  const refreshExistingCounts = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from('beat_plans')
      .select('id, beat_data')
      .eq('user_id', user.id)
      .gte('plan_date', format(fromDate, 'yyyy-MM-dd'))
      .lte('plan_date', format(toDate, 'yyyy-MM-dd'));
    if (error) return;
    let auto = 0;
    let manual = 0;
    (data || []).forEach((row: any) => {
      const isAuto = row?.beat_data && (row.beat_data as any).auto_generated === true;
      if (isAuto) auto++;
      else manual++;
    });
    setExistingAutoCount(auto);
    setExistingManualCount(manual);
  }, [user?.id, fromDate, toDate]);

  // Load past 90 days of beat_plans for the merged calendar view (context only)
  useEffect(() => {
    if (!user?.id || !hasPreview) return;
    (async () => {
      const from = format(subDays(fromDate, 90), 'yyyy-MM-dd');
      const to = format(addDays(fromDate, -1), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('beat_plans')
        .select('plan_date, beat_name')
        .eq('user_id', user.id)
        .gte('plan_date', from)
        .lte('plan_date', to)
        .order('plan_date', { ascending: true });
      if (error) return;
      setHistory((data || []).map((r: any) => ({ date: r.plan_date, beat_name: r.beat_name || 'Beat' })));
      setCursorMonth(fromDate);
    })();
  }, [user?.id, hasPreview, fromDate]);


  // ---------------------------------------------------------------------------
  // Generate / Regenerate preview
  // ---------------------------------------------------------------------------
  const runGenerate = async () => {
    if (!user?.id) return;
    const span = differenceInCalendarDays(toDate, fromDate);
    if (span < 0) {
      toast.error('From Date must be on or before To Date');
      return;
    }
    if (span > MAX_RANGE_DAYS) {
      toast.error(`Please pick a range of at most ${MAX_RANGE_DAYS} days`);
      return;
    }
    setGenerating(true);
    try {
      await refreshExistingCounts();
      const { data, error } = await supabase.functions.invoke('auto-generate-beat-plan', {
        body: {
          userId: user.id,
          previewOnly: true,
          fromDate: format(fromDate, 'yyyy-MM-dd'),
          toDate: format(toDate, 'yyyy-MM-dd'),
        },
      });
      if (error) throw error;
      const result = data?.results?.[0];
      if (result?.status === 'success') {
        const plan: DayPlan[] = (result.weeklyPlan || []).map((d: any) => ({
          day: d.day,
          date: d.date,
          beat_id: d.beat_id,
          beat_name: d.beat_name,
          retailers: d.retailers || [],
          estimated_value: d.estimated_value || 0,
          is_prescheduled: !!d.is_prescheduled,
          rationale: d.rationale || '',
        }));
        setDays(plan);
        setHasPreview(true);
        setIsDirty(false);
        toast.success(`Preview ready: ${plan.length} days`);
      } else {
        toast.error(result?.reason || 'Could not generate preview');
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to generate preview');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateClick = () => {
    if (hasPreview && isDirty) {
      setConfirmRegen(true);
    } else {
      runGenerate();
    }
  };

  // ---------------------------------------------------------------------------
  // Save plan (with confirm dialog)
  // ---------------------------------------------------------------------------
  const runSave = async () => {
    if (!user?.id || days.length === 0) return;
    setSaving(true);
    try {
      const payload = days.filter((d) => d.beat_id);
      const { data, error } = await supabase.functions.invoke('save-beat-plan', {
        body: {
          userId: user.id,
          fromDate: format(fromDate, 'yyyy-MM-dd'),
          toDate: format(toDate, 'yyyy-MM-dd'),
          days: payload,
        },
      });
      if (error) throw error;
      const result = data?.results?.[0];
      if (result?.status === 'success') {
        setIsDirty(false);
        setSaveSuccess({
          created: result.plansCreated || payload.length,
          from: format(fromDate, 'dd-MMM-yyyy'),
          to: format(toDate, 'dd-MMM-yyyy'),
        });
      } else {
        toast.error('Failed to save plan');
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Drag and drop between days
  // ---------------------------------------------------------------------------
  const onDragStart = (e: React.DragEvent, date: string) => {
    e.dataTransfer.setData('text/plain', date);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const onDrop = (e: React.DragEvent, targetDate: string) => {
    e.preventDefault();
    const sourceDate = e.dataTransfer.getData('text/plain');
    if (!sourceDate || sourceDate === targetDate) return;
    swapDays(sourceDate, targetDate);
  };

  const swapDays = (sourceDate: string, targetDate: string) => {
    setDays((prev) => {
      const src = prev.find((d) => d.date === sourceDate);
      const tgt = prev.find((d) => d.date === targetDate);
      if (!src || src.is_prescheduled || tgt?.is_prescheduled) return prev;
      const next = prev.map((d) => {
        if (d.date === sourceDate) {
          return tgt
            ? { ...d, beat_id: tgt.beat_id, beat_name: tgt.beat_name, retailers: tgt.retailers, estimated_value: tgt.estimated_value, rationale: tgt.rationale }
            : { ...d, beat_id: '', beat_name: '', retailers: [], estimated_value: 0, rationale: '' };
        }
        if (d.date === targetDate) {
          return { ...d, beat_id: src.beat_id, beat_name: src.beat_name, retailers: src.retailers, estimated_value: src.estimated_value, rationale: src.rationale };
        }
        return d;
      });
      // If target date didn't exist as a row yet, inject
      if (!tgt && src) {
        const parsed = parseISO(targetDate);
        next.push({
          date: targetDate,
          day: DAY_NAMES[parsed.getDay()],
          beat_id: src.beat_id,
          beat_name: src.beat_name,
          retailers: src.retailers,
          estimated_value: src.estimated_value,
          rationale: src.rationale,
          is_prescheduled: false,
        });
      }
      return [...next].sort((a, b) => a.date.localeCompare(b.date));
    });
    setIsDirty(true);
  };

  const removeBeat = (date: string) => {
    setDays((prev) =>
      prev.map((d) =>
        d.date === date && !d.is_prescheduled
          ? { ...d, beat_id: '', beat_name: '', retailers: [], estimated_value: 0, rationale: '' }
          : d,
      ),
    );
    setIsDirty(true);
  };

  const replaceBeat = (date: string, newBeatId: string) => {
    const beat = beats.find((b) => b.id === newBeatId);
    if (!beat) return;
    setDays((prev) => {
      const exists = prev.find((d) => d.date === date);
      if (exists) {
        if (exists.is_prescheduled) return prev;
        // ALWAYS overwrite — never stack (Rec #3)
        return prev.map((d) =>
          d.date === date
            ? { ...d, beat_id: beat.id, beat_name: beat.beat_name, retailers: [], estimated_value: 0, rationale: 'Manually selected' }
            : d,
        );
      }
      const parsed = parseISO(date);
      return [
        ...prev,
        {
          date,
          day: DAY_NAMES[parsed.getDay()],
          beat_id: beat.id,
          beat_name: beat.beat_name,
          retailers: [],
          estimated_value: 0,
          rationale: 'Manually added',
          is_prescheduled: false,
        },
      ].sort((a, b) => a.date.localeCompare(b.date));
    });
    setIsDirty(true);
  };

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------
  const dateGrid = useMemo(() => {
    const grid: string[] = [];
    const span = differenceInCalendarDays(toDate, fromDate);
    if (span < 0) return grid;
    for (let i = 0; i <= span; i++) grid.push(format(addDays(fromDate, i), 'yyyy-MM-dd'));
    return grid;
  }, [fromDate, toDate]);

  const dayByDate = useMemo(() => {
    const m: Record<string, DayPlan> = {};
    days.forEach((d) => { m[d.date] = d; });
    return m;
  }, [days]);

  const totalDays = dateGrid.length;
  const totalBeats = days.filter((d) => d.beat_id).length;
  const lockedCount = days.filter((d) => d.is_prescheduled).length;
  const emptyDays = dateGrid.filter((d) => !dayByDate[d]?.beat_id).length;
  const totalRetailers = days.reduce((acc, d) => acc + (d.retailers?.length || 0), 0);
  const totalValue = days.reduce((acc, d) => acc + (d.estimated_value || 0), 0);

  // Movable target dates for the "Move to" menu (excludes self + locked)
  const movableDates = useCallback(
    (selfDate: string) =>
      dateGrid.filter((d) => d !== selfDate && !dayByDate[d]?.is_prescheduled),
    [dateGrid, dayByDate],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <Layout>
      <div className="min-h-screen bg-background pb-28">
        {/* Header */}
        <div className="bg-card border-b sticky top-0 z-10">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => safeNavigate(() => navigate(-1))}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-semibold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Auto Plan Preview
                </h1>
                <p className="text-sm text-muted-foreground">Review and edit before saving</p>
              </div>
            </div>
          </div>

          {/* (9) Draft banner */}
          {hasPreview && (
            <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/40 border-t border-amber-200/60 dark:border-amber-800/50 px-4 py-2 text-amber-800 dark:text-amber-200 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="font-medium">Draft Preview — Not yet saved.</span>
              <span className="text-amber-700/80 dark:text-amber-300/80 hidden sm:inline">
                Click <strong>Save Plan</strong> to apply.
              </span>
              {isDirty && (
                <Badge variant="outline" className="ml-auto border-amber-500/60 text-amber-800 dark:text-amber-200">
                  Unsaved changes
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Date range controls */}
          <Card>
            <CardContent className="p-4 flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">From Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[180px] justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(fromDate, 'PPP')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={fromDate}
                      onSelect={(d) => d && setFromDate(d)}
                      initialFocus
                      className={cn('p-3 pointer-events-auto')}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">To Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[180px] justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(toDate, 'PPP')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={toDate}
                      onSelect={(d) => d && setToDate(d)}
                      initialFocus
                      className={cn('p-3 pointer-events-auto')}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <Button onClick={handleGenerateClick} disabled={generating} className="gap-2">
                <RefreshCw className={cn('h-4 w-4', generating && 'animate-spin')} />
                {generating ? 'Generating…' : hasPreview ? 'Regenerate Preview' : 'Generate Preview'}
              </Button>
            </CardContent>
          </Card>

          {/* (6) Replacement warning */}
          {hasPreview && existingAutoCount + existingManualCount > 0 && (
            <Card className="border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/30">
              <CardContent className="p-3 flex items-start gap-2 text-sm text-amber-900 dark:text-amber-100">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  Saving will replace <strong>{existingAutoCount}</strong> existing auto-generated
                  {existingAutoCount === 1 ? ' plan' : ' plans'} in this date range.{' '}
                  <strong>{existingManualCount}</strong> manual / pre-scheduled
                  {existingManualCount === 1 ? ' visit' : ' visits'} will not be affected.
                </div>
              </CardContent>
            </Card>
          )}

          {/* (4) Summary panel */}
          {hasPreview && (
            <Card>
              <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <Stat label="Planning Period" value={`${totalDays} day${totalDays === 1 ? '' : 's'}`} hint={`${format(fromDate, 'dd MMM')} → ${format(toDate, 'dd MMM')}`} />
                <Stat label="Assigned Beats" value={String(totalBeats)} />
                <Stat label="Empty Days" value={String(emptyDays)} />
                <Stat label="Pre-scheduled" value={String(lockedCount)} />
                <Stat label="Est. Retailers" value={totalRetailers.toLocaleString('en-IN')} />
                <Stat label="Est. Value" value={`₹${totalValue.toLocaleString('en-IN')}`} />
              </CardContent>
            </Card>
          )}

          {/* (3) Helper text */}
          {hasPreview && (
            <p className="text-xs text-muted-foreground">
              Each day holds one beat. Drag to swap, use the menu to replace, move, or remove.
            </p>
          )}

          {/* Calendar grid */}
          {hasPreview ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {dateGrid.map((date) => {
                const plan = dayByDate[date];
                const parsed = parseISO(date);
                const isLocked = plan?.is_prescheduled;
                const hasBeat = !!plan?.beat_id;
                const overCap = (plan?.retailers?.length || 0) > MAX_RETAILERS_PER_DAY;
                return (
                  <Card
                    key={date}
                    draggable={hasBeat && !isLocked}
                    onDragStart={(e) => onDragStart(e, date)}
                    onDragOver={onDragOver}
                    onDrop={(e) => onDrop(e, date)}
                    className={cn(
                      'transition-all',
                      hasBeat && !isLocked && 'cursor-move hover:shadow-md',
                      isLocked && 'border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20',
                      !hasBeat && 'border-dashed bg-muted/30',
                    )}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-muted-foreground">{format(parsed, 'EEE')}</div>
                          <div className="text-sm font-semibold">{format(parsed, 'dd MMM')}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          {isLocked ? (
                            <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-700 dark:text-amber-300">
                              <Lock className="h-3 w-3" /> Locked
                            </Badge>
                          ) : hasBeat ? (
                            <>
                              <Badge variant="outline" className="text-[10px] uppercase tracking-wide border-amber-500/40 text-amber-700 dark:text-amber-300">
                                Draft
                              </Badge>
                              {/* (7) Mobile-friendly action menu */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Day actions">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56 bg-popover">
                                  <DropdownMenuLabel>Day actions</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                      <ArrowRightLeft className="h-4 w-4 mr-2" /> Move to…
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent className="max-h-72 overflow-y-auto bg-popover">
                                      {movableDates(date).map((d) => (
                                        <DropdownMenuItem key={d} onClick={() => swapDays(date, d)}>
                                          {format(parseISO(d), 'EEE, dd MMM')}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                      <MapPin className="h-4 w-4 mr-2" /> Replace beat…
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent className="max-h-72 overflow-y-auto bg-popover">
                                      {beats.map((b) => (
                                        <DropdownMenuItem key={b.id} onClick={() => replaceBeat(date, b.id)}>
                                          {b.beat_name}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => removeBeat(date)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" /> Remove beat
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </>
                          ) : null}
                        </div>
                      </div>

                      {hasBeat ? (
                        <>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-sm font-medium">
                              <MapPin className="h-3.5 w-3.5 text-primary" />
                              {plan.beat_name}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {plan.retailers?.length || 0}
                              </span>
                              <span className="flex items-center gap-1">
                                <IndianRupee className="h-3 w-3" />
                                {(plan.estimated_value || 0).toLocaleString('en-IN')}
                              </span>
                            </div>
                            {overCap && (
                              <div className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300">
                                <AlertTriangle className="h-3 w-3" />
                                Over {MAX_RETAILERS_PER_DAY} retailer cap
                              </div>
                            )}
                          </div>

                          {!isLocked && (
                            <div className="hidden lg:flex items-center gap-2 pt-1">
                              <Select onValueChange={(v) => replaceBeat(date, v)}>
                                <SelectTrigger className="h-7 text-xs flex-1">
                                  <SelectValue placeholder="Replace…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {beats.map((b) => (
                                    <SelectItem key={b.id} value={b.id} className="text-xs">
                                      {b.beat_name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => removeBeat(date)}
                                title="Remove beat from this day"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </>
                      ) : (
                        // (8) Empty-day quick fill
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-full h-16 border-dashed border-2 text-muted-foreground hover:text-foreground hover:border-primary/50 gap-2"
                            >
                              <Plus className="h-4 w-4" /> Add Beat
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto bg-popover">
                            <DropdownMenuLabel>Select a beat</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {beats.map((b) => (
                              <DropdownMenuItem key={b.id} onClick={() => replaceBeat(date, b.id)}>
                                {b.beat_name}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                <Sparkles className="h-8 w-8 mx-auto mb-3 text-primary/50" />
                <p className="text-sm">
                  Pick a date range and click <strong>Generate Preview</strong> to see the proposed plan.
                  You can drag beats between days, remove them, or replace them before saving.
                </p>
              </CardContent>
            </Card>
          )}

          {/* === Month Calendar (incl. past 90d history) === */}
          {hasPreview && (() => {
            const monthStart = startOfMonth(cursorMonth);
            const monthEnd = endOfMonth(cursorMonth);
            const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
            const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
            const monthDays = eachDayOfInterval({ start: gridStart, end: gridEnd });
            const calMap = new Map<string, { beat_name: string; source: 'new' | 'locked' | 'history'; rationale?: string }>();
            history.forEach(h => calMap.set(h.date, { beat_name: h.beat_name, source: 'history' }));
            days.forEach(d => {
              if (!d.beat_id) return;
              calMap.set(d.date, {
                beat_name: d.beat_name,
                source: d.is_prescheduled ? 'locked' : 'new',
                rationale: d.rationale,
              });
            });
            const cellCls = {
              new: 'bg-primary/10 text-primary border-primary/30',
              locked: 'bg-amber-50 text-amber-700 border-amber-300',
              history: 'bg-muted text-muted-foreground border-border',
            } as const;
            const srcLabel = { new: 'New auto-plan', locked: 'Pre-scheduled', history: 'Historical' } as const;
            return (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4" /> Calendar View
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" onClick={() => setCursorMonth(subMonths(cursorMonth, 1))}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <div className="text-sm font-medium w-32 text-center">{format(cursorMonth, 'MMMM yyyy')}</div>
                      <Button variant="ghost" size="icon" onClick={() => setCursorMonth(addMonths(cursorMonth, 1))}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-primary/30 border border-primary/40" /> New plan</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-200 border border-amber-400" /> Pre-scheduled</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-muted border border-border" /> Past 90 days</span>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                      <div key={d} className="text-center py-1">{d}</div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Drag a new-plan day onto another to swap, or use the menu to replace, move, or remove.
                  </p>
                  <div className="grid grid-cols-7 gap-1">
                    {monthDays.map(d => {
                      const key = format(d, 'yyyy-MM-dd');
                      const entry = calMap.get(key);
                      const inMonth = isSameMonth(d, cursorMonth);
                      const isEditable = entry?.source === 'new';
                      // An empty in-month day belongs to the planning range if dayByDate has it (no beat assigned yet)
                      const isEmptyInRange = !entry && !!dayByDate[key];
                      const cell = (
                        <div
                          draggable={isEditable}
                          onDragStart={isEditable ? (e) => onDragStart(e, key) : undefined}
                          onDragOver={isEditable || isEmptyInRange ? onDragOver : undefined}
                          onDrop={isEditable || isEmptyInRange ? (e) => onDrop(e, key) : undefined}
                          className={cn(
                            'min-h-[64px] rounded-md border p-1 text-left transition-colors',
                            !inMonth && 'opacity-40',
                            entry ? cellCls[entry.source] : 'bg-background',
                            (entry || isEmptyInRange) && 'cursor-pointer hover:ring-1 hover:ring-primary/50',
                            isEditable && 'cursor-move',
                            isToday(d) && 'ring-1 ring-primary',
                          )}
                        >
                          <div className="text-[11px] font-medium">{format(d, 'd')}</div>
                          {entry && (
                            <div className="mt-0.5 text-[10px] leading-tight line-clamp-2 font-medium">{entry.beat_name}</div>
                          )}
                          {isEmptyInRange && inMonth && (
                            <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground flex items-center gap-0.5">
                              <Plus className="h-2.5 w-2.5" /> Add
                            </div>
                          )}
                        </div>
                      );
                      if (!entry && !isEmptyInRange) return <div key={key}>{cell}</div>;

                      // Empty in-range day → quick add beat picker
                      if (!entry && isEmptyInRange) {
                        return (
                          <DropdownMenu key={key}>
                            <DropdownMenuTrigger asChild>{cell}</DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto bg-popover">
                              <DropdownMenuLabel>{format(parseISO(key), 'EEE, dd MMM')}</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {beats.map((b) => (
                                <DropdownMenuItem key={b.id} onClick={() => replaceBeat(key, b.id)}>
                                  {b.beat_name}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        );
                      }

                      return (
                        <Popover key={key}>
                          <PopoverTrigger asChild>{cell}</PopoverTrigger>
                          <PopoverContent className="w-72 text-sm">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="font-semibold">{entry!.beat_name}</div>
                                <Badge variant="outline" className="text-[10px]">{srcLabel[entry!.source]}</Badge>
                              </div>
                              <div className="text-xs text-muted-foreground">{format(parseISO(key), 'EEE, MMM d, yyyy')}</div>
                              {entry!.rationale && (
                                <div className="text-xs bg-muted/50 rounded p-2 flex gap-1.5">
                                  <Sparkles className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                                  <span>{entry!.rationale}</span>
                                </div>
                              )}
                              {isEditable && (
                                <div className="pt-1 border-t">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-8">
                                        <MoreVertical className="h-3.5 w-3.5" /> Day actions
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-56 bg-popover">
                                      <DropdownMenuLabel>Day actions</DropdownMenuLabel>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuSub>
                                        <DropdownMenuSubTrigger>
                                          <ArrowRightLeft className="h-4 w-4 mr-2" /> Move to…
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent className="max-h-72 overflow-y-auto bg-popover">
                                          {movableDates(key).map((dd) => (
                                            <DropdownMenuItem key={dd} onClick={() => swapDays(key, dd)}>
                                              {format(parseISO(dd), 'EEE, dd MMM')}
                                            </DropdownMenuItem>
                                          ))}
                                        </DropdownMenuSubContent>
                                      </DropdownMenuSub>
                                      <DropdownMenuSub>
                                        <DropdownMenuSubTrigger>
                                          <MapPin className="h-4 w-4 mr-2" /> Replace beat…
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent className="max-h-72 overflow-y-auto bg-popover">
                                          {beats.map((b) => (
                                            <DropdownMenuItem key={b.id} onClick={() => replaceBeat(key, b.id)}>
                                              {b.beat_name}
                                            </DropdownMenuItem>
                                          ))}
                                        </DropdownMenuSubContent>
                                      </DropdownMenuSub>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => removeBeat(key)}
                                        className="text-destructive focus:text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" /> Remove beat
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* === Per-Beat Details / Rationale === */}
          {hasPreview && days.some(d => d.beat_id) && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Why these beats?
                </div>
                <div className="space-y-3">
                  {days.filter(d => d.beat_id).map(plan => (
                    <div
                      key={plan.date}
                      className={cn(
                        'border-l-4 rounded-md bg-muted/30 p-3',
                        plan.is_prescheduled ? 'border-l-amber-500' : 'border-l-primary',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div>
                          <div className="font-medium text-sm flex items-center gap-2">
                            {plan.beat_name}
                            {plan.is_prescheduled && (
                              <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-[10px]">
                                <Lock className="h-2.5 w-2.5 mr-1" /> Pre-scheduled
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {plan.day}, {format(parseISO(plan.date), 'MMM d')}
                          </div>
                        </div>
                        {plan.estimated_value > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            <IndianRupee className="h-3 w-3 mr-0.5" />
                            {Math.round(plan.estimated_value).toLocaleString('en-IN')}
                          </Badge>
                        )}
                      </div>
                      {plan.rationale && (
                        <div className="text-xs text-muted-foreground mt-1 flex gap-1.5">
                          <Sparkles className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                          <span>{plan.rationale}</span>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{plan.retailers?.length || 0} retailers</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* === How Auto Plan Works === */}
          {hasPreview && (
            <Card>
              <CardContent className="p-4 space-y-2 text-sm text-muted-foreground">
                <div className="text-sm font-semibold text-foreground">How Auto Plan Works</div>
                <div className="flex items-start gap-2">
                  <Lock className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <p><strong>Pre-scheduled beats are preserved.</strong> Manually planned beats remain unchanged.</p>
                </div>
                <div className="flex items-start gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                  <p><strong>Priority-based selection.</strong> Beats are scored on pending collections, days since last visit, retailer potential, and order history.</p>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                  <p><strong>Historical patterns.</strong> The AI learns from your past scheduling to recommend familiar day-beat combinations.</p>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                  <p><strong>Coverage optimization.</strong> Each beat is assigned to only one day to maximize coverage across the week.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>


        {/* Footer */}
        {hasPreview && (
          <div className="fixed bottom-0 left-0 right-0 border-t bg-card p-3 flex items-center justify-end gap-2 z-20">
            <Button variant="outline" onClick={() => safeNavigate(() => navigate(-1))} className="gap-2">
              <X className="h-4 w-4" /> Discard
            </Button>
            <Button
              onClick={() => setConfirmSave(true)}
              disabled={saving || totalBeats === 0}
              className="gap-2"
            >
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save Plan'}
            </Button>
          </div>
        )}
      </div>

      {/* (2) Regenerate confirmation */}
      <AlertDialog open={confirmRegen} onOpenChange={setConfirmRegen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard manual changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This will discard your manual edits and generate a fresh draft for the selected date range.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my changes</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmRegen(false); runGenerate(); }}>
              Discard & Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* (6) Pre-save confirmation */}
      <AlertDialog open={confirmSave} onOpenChange={setConfirmSave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save this plan?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This will save <strong>{totalBeats}</strong> beat{totalBeats === 1 ? '' : 's'} between{' '}
                  <strong>{format(fromDate, 'dd-MMM-yyyy')}</strong> and{' '}
                  <strong>{format(toDate, 'dd-MMM-yyyy')}</strong>.
                </p>
                {existingAutoCount > 0 && (
                  <p>
                    It will replace <strong>{existingAutoCount}</strong> existing auto-generated
                    {existingAutoCount === 1 ? ' plan' : ' plans'} in this range.
                  </p>
                )}
                {existingManualCount > 0 && (
                  <p>
                    <strong>{existingManualCount}</strong> manual / pre-scheduled
                    {existingManualCount === 1 ? ' visit' : ' visits'} will not be affected.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmSave(false); runSave(); }}>
              Save Plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* (1) Leave-page confirmation */}
      <AlertDialog open={!!confirmLeave} onOpenChange={(o) => { if (!o) setConfirmLeave(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave this page? Your edits to the draft preview will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay on page</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const fn = confirmLeave;
                setConfirmLeave(null);
                setIsDirty(false);
                if (fn) setTimeout(fn, 0);
              }}
            >
              Leave anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* (5) Save success dialog */}
      <Dialog open={!!saveSuccess} onOpenChange={(o) => { if (!o) setSaveSuccess(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" /> Plan saved
            </DialogTitle>
            <DialogDescription>
              Plan successfully created for <strong>{saveSuccess?.from}</strong> to{' '}
              <strong>{saveSuccess?.to}</strong>.<br />
              <strong>{saveSuccess?.created}</strong> visit{saveSuccess?.created === 1 ? '' : 's'} scheduled.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setSaveSuccess(null); navigate('/visits/retailers'); }}>
              View My Visits
            </Button>
            <Button onClick={() => { const s = saveSuccess; setSaveSuccess(null); navigate('/auto-plan-rationale', { state: { planResult: { plansCreated: s?.created } } }); }}>
              View Rationale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

// -----------------------------------------------------------------------------
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-base font-semibold leading-tight">{value}</span>
      {hint && <span className="text-[11px] text-muted-foreground mt-0.5">{hint}</span>}
    </div>
  );
}
