import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Calendar, MapPin, Users, IndianRupee, Clock, CheckCircle, Lock, Sparkles, TrendingUp } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { format, parseISO } from 'date-fns';

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
  planningPeriod: {
    start: string;
    end: string;
  };
  weeklyPlan: DayPlan[];
  rationales: Array<{
    beat_id: string;
    beat_name: string;
    date: string;
    day: string;
    is_prescheduled: boolean;
    rationale: string;
    factors: {
      retailer_count: number;
      high_priority_count: number;
      pending_collections: number;
      avg_days_since_visit: number;
      estimated_value: number;
    };
  }>;
}

export default function AutoPlanRationale() {
  const location = useLocation();
  const navigate = useNavigate();
  const [planResult, setPlanResult] = useState<PlanResult | null>(null);

  useEffect(() => {
    const state = location.state as { planResult?: PlanResult };
    if (state?.planResult) {
      setPlanResult(state.planResult);
      try {
        sessionStorage.setItem('lastAutoPlanResult', JSON.stringify(state.planResult));
      } catch {}
      return;
    }
    // Fallback: restore from sessionStorage (handles page refresh / direct nav)
    try {
      const cached = sessionStorage.getItem('lastAutoPlanResult');
      if (cached) setPlanResult(JSON.parse(cached));
    } catch {}
  }, [location.state]);

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
  
  // Group by week
  const thisWeekPlans = weeklyPlan.filter(p => {
    const planDate = parseISO(p.date);
    const today = new Date();
    const endOfThisWeek = new Date(today);
    endOfThisWeek.setDate(today.getDate() + (6 - today.getDay()));
    return planDate <= endOfThisWeek;
  });

  const nextWeekPlans = weeklyPlan.filter(p => {
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
          {plan.retailers.filter(r => r.priority_score > 70).length > 0 && (
            <span className="flex items-center gap-1 text-amber-600">
              <TrendingUp size={12} />
              {plan.retailers.filter(r => r.priority_score > 70).length} high priority
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
              {plan.retailers.slice(0, 5).map(r => (
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

        {/* This Week */}
        {thisWeekPlans.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Calendar size={18} />
              This Week
            </h2>
            <div className="space-y-3">
              {thisWeekPlans.map(renderDayCard)}
            </div>
          </div>
        )}

        {/* Next Week */}
        {nextWeekPlans.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Calendar size={18} />
              Next Week
            </h2>
            <div className="space-y-3">
              {nextWeekPlans.map(renderDayCard)}
            </div>
          </div>
        )}

        {/* How it works */}
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

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={() => navigate('/beat-planning')}
          >
            Edit Plans
          </Button>
          <Button 
            className="flex-1"
            onClick={() => navigate('/visits/retailers')}
          >
            Start Visits
          </Button>
        </div>
      </div>
    </Layout>
  );
}
