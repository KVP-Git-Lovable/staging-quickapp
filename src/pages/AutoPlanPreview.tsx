import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, addDays, parseISO, differenceInCalendarDays, startOfWeek, isSameDay } from 'date-fns';
import { ArrowLeft, CalendarIcon, Sparkles, Lock, Trash2, RefreshCw, Save, X, MapPin, Users, IndianRupee } from 'lucide-react';
import { toast } from 'sonner';

import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

export default function AutoPlanPreview() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Date range — default: today → end of next week
  const today = useMemo(() => new Date(), []);
  const defaultTo = useMemo(() => {
    const monday = startOfWeek(today, { weekStartsOn: 1 });
    return addDays(monday, 13); // end of next week
  }, [today]);

  const [fromDate, setFromDate] = useState<Date>(today);
  const [toDate, setToDate] = useState<Date>(defaultTo);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [days, setDays] = useState<DayPlan[]>([]);
  const [hasPreview, setHasPreview] = useState(false);
  const [beats, setBeats] = useState<BeatOption[]>([]);

  // Load user beats for the Replace/Add dropdown
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

  const handleGenerate = async () => {
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

  const handleSave = async () => {
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
        toast.success(`Saved ${result.plansCreated} beat plans`);
        navigate('/auto-plan-rationale', { state: { planResult: result } });
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

  // Drag and drop between days
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
    setDays((prev) => {
      const src = prev.find((d) => d.date === sourceDate);
      const tgt = prev.find((d) => d.date === targetDate);
      if (!src || src.is_prescheduled || tgt?.is_prescheduled) return prev;
      // Build a swap/move map
      return prev.map((d) => {
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
    });
  };

  const removeBeat = (date: string) => {
    setDays((prev) =>
      prev.map((d) =>
        d.date === date && !d.is_prescheduled
          ? { ...d, beat_id: '', beat_name: '', retailers: [], estimated_value: 0, rationale: '' }
          : d
      )
    );
  };

  const replaceBeat = (date: string, newBeatId: string) => {
    const beat = beats.find((b) => b.id === newBeatId);
    if (!beat) return;
    setDays((prev) => {
      const exists = prev.find((d) => d.date === date);
      if (exists) {
        if (exists.is_prescheduled) return prev;
        return prev.map((d) =>
          d.date === date
            ? { ...d, beat_id: beat.id, beat_name: beat.beat_name, retailers: [], estimated_value: 0, rationale: 'Manually selected' }
            : d
        );
      }
      // Add new day entry (user added beat on an empty day)
      const parsed = parseISO(date);
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return [
        ...prev,
        {
          date,
          day: dayNames[parsed.getDay()],
          beat_id: beat.id,
          beat_name: beat.beat_name,
          retailers: [],
          estimated_value: 0,
          rationale: 'Manually added',
          is_prescheduled: false,
        },
      ].sort((a, b) => a.date.localeCompare(b.date));
    });
  };

  // Build full date grid (every day in range, even if no plan for that date)
  const dateGrid = useMemo(() => {
    const grid: string[] = [];
    const span = differenceInCalendarDays(toDate, fromDate);
    if (span < 0) return grid;
    for (let i = 0; i <= span; i++) {
      grid.push(format(addDays(fromDate, i), 'yyyy-MM-dd'));
    }
    return grid;
  }, [fromDate, toDate]);

  const dayByDate = useMemo(() => {
    const m: Record<string, DayPlan> = {};
    days.forEach((d) => { m[d.date] = d; });
    return m;
  }, [days]);

  const totalBeats = days.filter((d) => d.beat_id).length;
  const totalRetailers = days.reduce((acc, d) => acc + (d.retailers?.length || 0), 0);
  const totalValue = days.reduce((acc, d) => acc + (d.estimated_value || 0), 0);

  return (
    <Layout>
      <div className="min-h-screen bg-background pb-24">
        {/* Header */}
        <div className="bg-card border-b sticky top-0 z-10">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
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
        </div>

        {/* Date range controls */}
        <div className="p-4 space-y-4">
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
              <Button onClick={handleGenerate} disabled={generating} className="gap-2">
                <RefreshCw className={cn('h-4 w-4', generating && 'animate-spin')} />
                {generating ? 'Generating…' : hasPreview ? 'Regenerate Preview' : 'Generate Preview'}
              </Button>
            </CardContent>
          </Card>

          {/* Summary chips */}
          {hasPreview && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="gap-1">
                <CalendarIcon className="h-3 w-3" /> {totalBeats} days planned
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <Users className="h-3 w-3" /> {totalRetailers} retailers
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <IndianRupee className="h-3 w-3" /> ₹{totalValue.toLocaleString('en-IN')} est.
              </Badge>
            </div>
          )}

          {/* Calendar grid */}
          {hasPreview ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {dateGrid.map((date) => {
                const plan = dayByDate[date];
                const parsed = parseISO(date);
                const isLocked = plan?.is_prescheduled;
                const hasBeat = !!plan?.beat_id;
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
                      !hasBeat && 'border-dashed bg-muted/30'
                    )}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-muted-foreground">{format(parsed, 'EEE')}</div>
                          <div className="text-sm font-semibold">{format(parsed, 'dd MMM')}</div>
                        </div>
                        {isLocked && (
                          <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-700 dark:text-amber-300">
                            <Lock className="h-3 w-3" /> Locked
                          </Badge>
                        )}
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
                          </div>
                          {!isLocked && (
                            <div className="flex items-center gap-2 pt-1">
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
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground italic">No beat scheduled</div>
                          <Select onValueChange={(v) => replaceBeat(date, v)}>
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Add beat…" />
                            </SelectTrigger>
                            <SelectContent>
                              {beats.map((b) => (
                                <SelectItem key={b.id} value={b.id} className="text-xs">
                                  {b.beat_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
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
        </div>

        {/* Footer */}
        {hasPreview && (
          <div className="fixed bottom-0 left-0 right-0 border-t bg-card p-3 flex items-center justify-end gap-2 z-20">
            <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
              <X className="h-4 w-4" /> Discard
            </Button>
            <Button onClick={handleSave} disabled={saving || totalBeats === 0} className="gap-2">
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save Plan'}
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
