import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  ArrowLeft, Calendar, MapPin, Users, IndianRupee, Clock,
  CheckCircle, Lock, Sparkles, TrendingUp, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Layout } from '@/components/Layout';
import {
  format, parseISO, subDays, addMonths, subMonths,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
} from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

interface DayPlan {
  day: string;
  date: string;
  beat_id: string;
  beat_name: string;
  retailers: Array<{
    retailer_id: string;
    retailer_name: string;
    priority_score: number;
    reasons: string[];
    pending_amount: number;
    avg_order_value: number;
  }>;
  estimated_value: number;
  is_prescheduled: boolean;
  rationale: string;
}

interface PlanResult {
  userId: string;
  userName: string;
  status: string;
  plansCreated: number;
  prescheduledPreserved: number;
  planningPeriod: { start: string; end: string };
  weeklyPlan: DayPlan[];
  rationales: Array<any>;
}

type CalEntry = {
  date: string;
  beat_name: string;
  source: 'new' | 'prescheduled' | 'history';
  rationale?: string;
};

export default function AutoPlanRationale() {
  const location = useLocation();
  const navigate = useNavigate();
  const [planResult, setPlanResult] = useState<PlanResult | null>(null);
  const [history, setHistory] = useState<CalEntry[]>([]);
  const [cursorMonth, setCursorMonth] = useState<Date>(new Date());

  useEffect(() => {
    const state = location.state as { planResult?: PlanResult };
    if (state?.planResult) {
      setPlanResult(state.planResult);
      try { sessionStorage.setItem('lastAutoPlanResult', JSON.stringify(state.planResult)); } catch {}
      return;
    }
    try {
      const cached = sessionStorage.getItem('lastAutoPlanResult');
      if (cached) setPlanResult(JSON.parse(cached));
    } catch {}
  }, [location.state]);

  // Fetch 90 days of history for the calendar
  useEffect(() => {
    if (!planResult?.userId || !planResult?.planningPeriod?.start) return;
    const planStart = parseISO(planResult.planningPeriod.start);
    setCursorMonth(planStart);
    const from = format(subDays(planStart, 90), 'yyyy-MM-dd');
    const to = planResult.planningPeriod.start;
    (async () => {
      const { data, error } = await supabase
        .from('beat_plans')
        .select('plan_date, beat_name')
        .eq('user_id', planResult.userId)
        .gte('plan_date', from)
        .lt('plan_date', to)
        .order('plan_date', { ascending: true });
      if (error) {
        console.error('Failed to load beat plan history', error);
        return;
      }
      setHistory(
        (data || []).map((r: any) => ({
          date: r.plan_date,
          beat_name: r.beat_name || 'Beat',
          source: 'history' as const,
        }))
      );
    })();
  }, [planResult?.userId, planResult?.planningPeriod?.start]);

  const calMap = useMemo(() => {
    const m = new Map<string, CalEntry>();
    history.forEach((h) => m.set(h.date, h));
    (planResult?.weeklyPlan || []).forEach((p) => {
      m.set(p.date, {
        date: p.date,
        beat_name: p.beat_name || 'No beat',
        source: p.is_prescheduled ? 'prescheduled' : 'new',
        rationale: p.rationale,
      });
    });
    return m;
  }, [history, planResult?.weeklyPlan]);

  if (!planResult) {
    return (
      <Layout>
        <div className="p-4 flex flex-col items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground mb-4">No plan data available</p>
          <Button onClick={() => navigate('/beat-planning')}>
            <ArrowLeft size={16} className="mr-2" />
            Go to Beat Planning
          </Button>
        </div>
      </Layout>
    );
  }

  const { weeklyPlan, planningPeriod, plansCreated, prescheduledPreserved } = planResult;

  const thisWeekPlans = weeklyPlan.filter((p) => {
    const planDate = parseISO(p.date);
    const today = new Date();
    const endOfThisWeek = new Date(today);
    endOfThisWeek.setDate(today.getDate() + (6 - today.getDay()));
    return planDate <= endOfThisWeek;
  });

  const nextWeekPlans = weeklyPlan.filter((p) => {
    const planDate = parseISO(p.date);
    const today = new Date();
    const endOfThisWeek = new Date(today);
    endOfThisWeek.setDate(today.getDate() + (6 - today.getDay()));
    return planDate > endOfThisWeek;
  });

  const totalEstimatedValue = weeklyPlan.reduce((sum, p) => sum + p.estimated_value, 0);
  const totalRetailers = weeklyPlan.reduce((sum, p) => sum + p.retailers.length, 0);

  const renderDayCard = (plan: DayPlan) => (
    <Card
      key={plan.date}
      className={`border-l-4 ${plan.is_prescheduled ? 'border-l-amber-500' : 'border-l-primary'}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{plan.beat_name || 'No beat'}</h3>
              {plan.is_prescheduled && (
                <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                  <Lock size={10} className="mr-1" />
                  Pre-scheduled
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <Calendar size={12} />
              {plan.day}, {format(parseISO(plan.date), 'MMM d')}
            </p>
          </div>
          {plan.estimated_value > 0 && (
            <Badge variant="secondary" className="text-xs">
              <IndianRupee size={10} className="mr-0.5" />
              {Math.round(plan.estimated_value).toLocaleString()}
            </Badge>
          )}
        </div>

        {plan.rationale && (
          <div className="bg-muted/50 rounded-lg p-3 mb-3">
            <p className="text-sm flex items-start gap-2">
              <Sparkles size={14} className="text-primary mt-0.5 shrink-0" />
              <span>{plan.rationale}</span>
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users size={12} />
            {plan.retailers.length} retailers
          </span>
          {plan.retailers.filter((r) => r.priority_score > 70).length > 0 && (
            <span className="flex items-center gap-1 text-amber-600">
              <TrendingUp size={12} />
              {plan.retailers.filter((r) => r.priority_score > 70).length} high priority
            </span>
          )}
          {plan.retailers.reduce((sum, r) => sum + r.pending_amount, 0) > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <IndianRupee size={12} />
              {Math.round(plan.retailers.reduce((sum, r) => sum + r.pending_amount, 0)).toLocaleString()} pending
            </span>
          )}
        </div>

        {plan.retailers.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-2">Top retailers:</p>
            <div className="flex flex-wrap gap-1">
              {plan.retailers.slice(0, 5).map((r) => (
                <Badge key={r.retailer_id} variant="outline" className="text-xs font-normal">
                  {r.retailer_name}
                </Badge>
              ))}
              {plan.retailers.length > 5 && (
                <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                  +{plan.retailers.length - 5} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // ===== Calendar rendering =====
  const monthStart = startOfMonth(cursorMonth);
  const monthEnd = endOfMonth(cursorMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const sourceClasses: Record<CalEntry['source'], string> = {
    new: 'bg-primary/10 text-primary border-primary/30',
    prescheduled: 'bg-amber-50 text-amber-700 border-amber-300',
    history: 'bg-muted text-muted-foreground border-border',
  };

  const sourceLabel: Record<CalEntry['source'], string> = {
    new: 'New auto-plan',
    prescheduled: 'Pre-scheduled',
    history: 'Historical',
  };

  const renderCalendar = () => (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar size={18} /> Calendar View
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setCursorMonth(subMonths(cursorMonth, 1))}>
              <ChevronLeft size={16} />
            </Button>
            <div className="text-sm font-medium w-32 text-center">
              {format(cursorMonth, 'MMMM yyyy')}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setCursorMonth(addMonths(cursorMonth, 1))}>
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 pt-2 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-primary/30 border border-primary/40" /> New plan
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-200 border border-amber-400" /> Pre-scheduled
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-muted border border-border" /> Past 90 days
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="text-center py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const key = format(d, 'yyyy-MM-dd');
            const entry = calMap.get(key);
            const inMonth = isSameMonth(d, cursorMonth);
            const todayFlag = isToday(d);
            const cell = (
              <div
                className={`min-h-[68px] rounded-md border p-1 text-left transition-colors ${
                  inMonth ? '' : 'opacity-40'
                } ${entry ? 'cursor-pointer hover:ring-1 hover:ring-primary/50' : 'cursor-default'} ${
                  entry ? sourceClasses[entry.source] : 'bg-background'
                } ${todayFlag ? 'ring-1 ring-primary' : ''}`}
              >
                <div className="text-[11px] font-medium">{format(d, 'd')}</div>
                {entry && (
                  <div className="mt-0.5 text-[10px] leading-tight line-clamp-2 font-medium">
                    {entry.beat_name}
                  </div>
                )}
              </div>
            );
            if (!entry) return <div key={key}>{cell}</div>;
            return (
              <Popover key={key}>
                <PopoverTrigger asChild>{cell}</PopoverTrigger>
                <PopoverContent className="w-64 text-sm">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{entry.beat_name}</div>
                      <Badge variant="outline" className="text-[10px]">
                        {sourceLabel[entry.source]}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(parseISO(entry.date), 'EEE, MMM d, yyyy')}
                    </div>
                    {entry.rationale && (
                      <div className="text-xs bg-muted/50 rounded p-2 flex gap-1.5">
                        <Sparkles size={12} className="text-primary mt-0.5 shrink-0" />
                        <span>{entry.rationale}</span>
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

  return (
    <Layout>
      <div className="p-4 space-y-6 pb-20">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/beat-planning')}>
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Auto Plan Created</h1>
            <p className="text-sm text-muted-foreground">
              {format(parseISO(planningPeriod.start), 'MMM d')} - {format(parseISO(planningPeriod.end), 'MMM d, yyyy')}
            </p>
          </div>
        </div>

        {/* Summary Card */}
        <Card className="bg-gradient-primary text-primary-foreground">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle size={20} />
              <span className="font-semibold">Plan Generated Successfully</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-2xl font-bold">{plansCreated}</p>
                <p className="text-xs text-primary-foreground/80">New Plans</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{prescheduledPreserved}</p>
                <p className="text-xs text-primary-foreground/80">Pre-scheduled Kept</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{totalRetailers}</p>
                <p className="text-xs text-primary-foreground/80">Total Retailers</p>
              </div>
              <div>
                <p className="text-2xl font-bold">₹{Math.round(totalEstimatedValue / 1000)}K</p>
                <p className="text-xs text-primary-foreground/80">Est. Value</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-6 mt-4">
            {thisWeekPlans.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Calendar size={18} />
                  This Week
                </h2>
                <div className="space-y-3">{thisWeekPlans.map(renderDayCard)}</div>
              </div>
            )}

            {nextWeekPlans.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Calendar size={18} />
                  Next Week
                </h2>
                <div className="space-y-3">{nextWeekPlans.map(renderDayCard)}</div>
              </div>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">How Auto Plan Works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <Lock size={14} className="text-amber-500 mt-0.5 shrink-0" />
                  <p><strong>Pre-scheduled beats are preserved.</strong> Any beats you manually planned remain unchanged.</p>
                </div>
                <div className="flex items-start gap-2">
                  <TrendingUp size={14} className="text-primary mt-0.5 shrink-0" />
                  <p><strong>Priority-based selection.</strong> Beats are scored based on pending collections, days since last visit, retailer potential, and order history.</p>
                </div>
                <div className="flex items-start gap-2">
                  <Clock size={14} className="text-primary mt-0.5 shrink-0" />
                  <p><strong>Historical patterns.</strong> The AI learns from your past scheduling patterns to recommend familiar day-beat combinations.</p>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin size={14} className="text-primary mt-0.5 shrink-0" />
                  <p><strong>Coverage optimization.</strong> Each beat is assigned to only one day to maximize coverage across the week.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="calendar" className="mt-4">{renderCalendar()}</TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() =>
              navigate('/auto-plan-preview', {
                state: { fromDate: planningPeriod.start, toDate: planningPeriod.end },
              })
            }
          >
            Edit Plans
          </Button>
          <Button className="flex-1" onClick={() => navigate('/visits/retailers')}>
            Start Visits
          </Button>
        </div>
      </div>
    </Layout>
  );
}
