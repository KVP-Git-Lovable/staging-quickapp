import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, RefreshCw, Sparkles, Target, MapPin, Store, Gift, Calendar, Loader2, Quote, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePerformanceSummary, type PerformancePeriod } from '@/hooks/usePerformanceSummary';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Period options grouped into Past (Review) and Future (Planning)
const pastPeriodOptions: { value: PerformancePeriod; label: string }[] = [
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_quarter', label: 'Last Quarter' },
];

const futurePeriodOptions: { value: PerformancePeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_year', label: 'This FY' },
];

interface PriorityAction {
  title: string;
  description: string;
  type: 'visit' | 'scheme' | 'focus' | 'strategy';
  priority: 'high' | 'medium' | 'low';
  retailer?: string;
  beat?: string;
  expectedImpact?: string;
}

interface RetailerFocus {
  name: string;
  reason: string;
  suggestedAction: string;
}

interface BeatStrategy {
  beatName: string;
  recommendation: string;
}

interface SchemeOpportunity {
  schemeName: string;
  howToLeverage: string;
}

interface Recommendations {
  summary: string;
  priorityActions: PriorityAction[];
  retailerFocus: RetailerFocus[];
  beatStrategy: BeatStrategy[];
  schemeOpportunities: SchemeOpportunity[];
  weeklyPlan: {
    day1?: string;
    day2?: string;
    day3?: string;
  };
}

const priorityColors = {
  high: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  medium: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  low: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
};

const typeIcons = {
  visit: MapPin,
  scheme: Gift,
  focus: Target,
  strategy: TrendingUp,
};

const TargetAchievementAdvisor = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const initialPeriod = (searchParams.get('period') || 'this_month') as PerformancePeriod;
  const [selectedPeriod, setSelectedPeriod] = useState<PerformancePeriod>(initialPeriod);
  
  const { overall, territories, beats, retailers, isLoading: dataLoading } = usePerformanceSummary(
    user?.id,
    selectedPeriod
  );

  // Update URL when period changes
  const handlePeriodChange = (newPeriod: PerformancePeriod) => {
    setSelectedPeriod(newPeriod);
    setSearchParams({ period: newPeriod });
    // Clear previous recommendations to trigger new generation
    setRecommendations(null);
    setQuote('');
  };

  const [quote, setQuote] = useState<string>('');
  const [recommendations, setRecommendations] = useState<Recommendations | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateAdvice = async () => {
    if (!user?.id || dataLoading) return;
    
    setIsGenerating(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-target-advice', {
        body: {
          period: selectedPeriod,
          overall,
          territories,
          beats,
          retailers,
        },
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setQuote(data.quote);
      setRecommendations(data.recommendations);
    } catch (err) {
      console.error('Error generating advice:', err);
      const message = err instanceof Error ? err.message : 'Failed to generate recommendations';
      setError(message);
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (!dataLoading && user?.id && !recommendations) {
      generateAdvice();
    }
  }, [dataLoading, user?.id, selectedPeriod]);

  const formatPeriodLabel = (p: string) => {
    const labels: Record<string, string> = {
      today: 'Today',
      yesterday: 'Yesterday',
      this_week: 'This Week',
      last_week: 'Last Week',
      this_month: 'This Month',
      last_month: 'Last Month',
      this_quarter: 'This Quarter',
      last_quarter: 'Last Quarter',
      this_year: 'This FY',
    };
    return labels[p] || p;
  };

  return (
    <Layout>
      <div className="pb-24">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Hero Header with Background */}
          <div className="relative overflow-hidden rounded-b-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/70">
            {/* Abstract pattern overlay */}
            <div className="absolute inset-0 opacity-10">
              <svg className="w-full h-full" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
                <defs>
                  <pattern id="advisor-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                    <circle cx="20" cy="20" r="1.5" fill="white" />
                    <path d="M 40 0 L 0 40" stroke="white" strokeWidth="0.5" opacity="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#advisor-grid)" />
                <circle cx="350" cy="50" r="80" fill="white" opacity="0.08" />
                <circle cx="50" cy="150" r="60" fill="white" opacity="0.05" />
              </svg>
            </div>
            
            {/* Floating icons decoration */}
            <div className="absolute right-4 top-8 opacity-20">
              <Target className="h-16 w-16 text-white" />
            </div>
            <div className="absolute right-20 bottom-4 opacity-15">
              <TrendingUp className="h-12 w-12 text-white" />
            </div>
            
            {/* Header content */}
            <div className="relative px-4 pt-4 pb-6">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
                      <Sparkles className="h-5 w-5 text-white" />
                    </div>
                    <h1 className="text-xl font-bold text-white">Target Achievement Advisor</h1>
                  </div>
                  <p className="text-sm text-white/80 mt-1 ml-9">
                    AI-powered recommendations for {formatPeriodLabel(selectedPeriod)}
                  </p>
                </div>
              </div>
              
              {/* Refresh button */}
              <div className="mt-4 ml-9">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={generateAdvice}
                  disabled={isGenerating || dataLoading}
                  className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm"
                >
                  <RefreshCw className={cn("h-4 w-4 mr-2", isGenerating && "animate-spin")} />
                  Refresh Advice
                </Button>
              </div>
            </div>
          </div>

          <div className="px-4 space-y-6">
            {/* Period Selector - Grouped */}
            <div className="p-4 bg-muted/50 rounded-xl border">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Select Period</span>
              </div>
              <Select value={selectedPeriod} onValueChange={(v) => handlePeriodChange(v as PerformancePeriod)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* Future / Current periods */}
                  <div className="px-2 py-1.5">
                    <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                      📈 Current & Future
                    </span>
                  </div>
                  {futurePeriodOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                  
                  {/* Past periods */}
                  <div className="px-2 py-1.5 mt-2 border-t">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      📊 Past Review
                    </span>
                  </div>
                  {pastPeriodOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          {/* Motivational Quote */}
          {quote && (
            <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <Quote className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-sm italic text-foreground">{quote}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Loading State */}
          {(isGenerating || dataLoading) && (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center gap-4">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-muted-foreground">
                    {dataLoading ? 'Loading performance data...' : 'Analyzing your performance and generating recommendations...'}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error State */}
          {error && !isGenerating && (
            <Card className="border-destructive/50">
              <CardContent className="py-8">
                <div className="flex flex-col items-center justify-center gap-4 text-center">
                  <AlertTriangle className="h-10 w-10 text-destructive" />
                  <p className="text-muted-foreground">{error}</p>
                  <Button onClick={generateAdvice} variant="outline">
                    Try Again
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          {recommendations && !isGenerating && (
            <div className="space-y-4">
              {/* Summary */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    Situation Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{recommendations.summary}</p>
                </CardContent>
              </Card>

              {/* Priority Actions */}
              {recommendations.priorityActions?.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      Priority Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {recommendations.priorityActions.map((action, idx) => {
                      const Icon = typeIcons[action.type] || Target;
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "p-3 rounded-lg border",
                            priorityColors[action.priority]
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{action.title}</span>
                                <span className="text-xs px-1.5 py-0.5 rounded bg-background/50 capitalize">
                                  {action.priority}
                                </span>
                              </div>
                              <p className="text-xs mt-1 opacity-90">{action.description}</p>
                              {action.expectedImpact && (
                                <p className="text-xs mt-1 font-medium">
                                  Impact: {action.expectedImpact}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              {/* Retailer Focus */}
              {recommendations.retailerFocus?.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Store className="h-4 w-4 text-primary" />
                      Retailers to Focus
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {recommendations.retailerFocus.map((retailer, idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-muted/50 border">
                        <p className="font-medium text-sm">{retailer.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">{retailer.reason}</p>
                        <p className="text-xs text-primary mt-1 font-medium">
                          → {retailer.suggestedAction}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Beat Strategy */}
              {recommendations.beatStrategy?.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      Beat Strategy
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {recommendations.beatStrategy.map((beat, idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-muted/50 border">
                        <p className="font-medium text-sm">{beat.beatName}</p>
                        <p className="text-xs text-muted-foreground mt-1">{beat.recommendation}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Scheme Opportunities */}
              {recommendations.schemeOpportunities?.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Gift className="h-4 w-4 text-primary" />
                      Scheme Opportunities
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {recommendations.schemeOpportunities.map((scheme, idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-muted/50 border">
                        <p className="font-medium text-sm">{scheme.schemeName}</p>
                        <p className="text-xs text-muted-foreground mt-1">{scheme.howToLeverage}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Weekly Plan */}
              {recommendations.weeklyPlan && Object.keys(recommendations.weeklyPlan).length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      Action Plan
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {recommendations.weeklyPlan.day1 && (
                        <div className="flex gap-3 items-start">
                          <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded">Day 1</span>
                          <p className="text-sm text-muted-foreground flex-1">{recommendations.weeklyPlan.day1}</p>
                        </div>
                      )}
                      {recommendations.weeklyPlan.day2 && (
                        <div className="flex gap-3 items-start">
                          <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded">Day 2</span>
                          <p className="text-sm text-muted-foreground flex-1">{recommendations.weeklyPlan.day2}</p>
                        </div>
                      )}
                      {recommendations.weeklyPlan.day3 && (
                        <div className="flex gap-3 items-start">
                          <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded">Day 3</span>
                          <p className="text-sm text-muted-foreground flex-1">{recommendations.weeklyPlan.day3}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default TargetAchievementAdvisor;
