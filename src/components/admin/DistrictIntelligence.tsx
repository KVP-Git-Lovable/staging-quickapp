import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, GraduationCap, Coffee, ShoppingBag, Landmark, Brain, Sparkles, CheckCircle2, Maximize2, Minimize2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface POICounts {
  education: { schools: number; colleges: number; universities: number; total: number };
  teaCoffee: { cafes: number; teaShops: number; coffeeShops: number; fastFood: number; total: number };
  retail: { clothing: number; supermarkets: number; convenience: number; general: number; total: number };
  landmarks: { hospitals: number; worship: number; attractions: number; parks: number; total: number };
}

interface IntelligenceData {
  counts: POICounts;
  aiSummary: string;
}

interface DistrictIntelligenceProps {
  state: string;
  district: string;
}

function isZeroCounts(counts: POICounts): boolean {
  return counts.education.total === 0
    && counts.teaCoffee.total === 0
    && counts.retail.total === 0
    && counts.landmarks.total === 0;
}

export const DistrictIntelligence: React.FC<DistrictIntelligenceProps> = ({ state, district }) => {
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [autoFetched, setAutoFetched] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setData(null);
    setLoading(false);
    setFromCache(false);
    setAutoFetched(false);
    setExpanded(false);

    const checkCache = async () => {
      try {
        const { data: cached } = await (supabase as any)
          .from('district_intelligence_cache')
          .select('counts, ai_summary')
          .eq('state', state)
          .eq('district', district)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        if (cached) {
          const counts = cached.counts as POICounts;
          // Treat all-zero cached entries as invalid — auto-fetch fresh
          if (isZeroCounts(counts)) {
            console.log('[DistrictIntelligence] Cached entry has all-zero counts, auto-fetching fresh data');
            setAutoFetched(true);
            fetchIntelligence(true);
            return;
          }
          setData({ counts, aiSummary: cached.ai_summary });
          setFromCache(true);
        }
      } catch (e) {
        // Silent fail
      }
    };
    checkCache();
  }, [state, district]);

  const fetchIntelligence = async (forceRefresh = true) => {
    setLoading(true);
    setData(null);
    setFromCache(false);
    try {
      const { data: result, error } = await supabase.functions.invoke('district-intelligence', {
        body: { state, district, forceRefresh },
      });
      if (error) {
        toast.error(error.message || 'Failed to fetch intelligence');
        return;
      }
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      // Final guard: don't render all-zero results even from fresh fetch
      if (result?.counts && isZeroCounts(result.counts)) {
        toast.error('Overpass API returned no data. Please try again later.');
        return;
      }
      setData(result);
    } catch (e: any) {
      toast.error(e.message || 'Failed to fetch intelligence');
    } finally {
      setLoading(false);
    }
  };

  if (!data && !loading) {
    return (
      <Button
        onClick={() => fetchIntelligence(true)}
        variant="outline"
        className="w-full gap-2 border-dashed border-2"
      >
        <Brain className="h-4 w-4" />
        Generate District Intelligence
      </Button>
    );
  }

  if (loading) {
    return (
      <Card className="border-dashed border-2">
        <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground text-center">
            Analyzing {district}…<br />
            <span className="text-xs">Fetching POI data & generating insights (may take 15-30s)</span>
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { counts, aiSummary } = data;

  const categories = [
    {
      label: 'Education',
      icon: GraduationCap,
      total: counts.education.total,
      details: [
        { label: 'Schools', value: counts.education.schools },
        { label: 'Colleges', value: counts.education.colleges },
        { label: 'Universities', value: counts.education.universities },
      ],
      color: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
      textColor: 'text-blue-700 dark:text-blue-300',
      labelColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Tea / Coffee',
      icon: Coffee,
      total: counts.teaCoffee.total,
      details: [
        { label: 'Cafes', value: counts.teaCoffee.cafes },
        { label: 'Tea Shops', value: counts.teaCoffee.teaShops },
        { label: 'Coffee Shops', value: counts.teaCoffee.coffeeShops },
        { label: 'Fast Food', value: counts.teaCoffee.fastFood },
      ],
      color: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
      textColor: 'text-amber-700 dark:text-amber-300',
      labelColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Retail',
      icon: ShoppingBag,
      total: counts.retail.total,
      details: [
        { label: 'Clothing', value: counts.retail.clothing },
        { label: 'Supermarkets', value: counts.retail.supermarkets },
        { label: 'Convenience', value: counts.retail.convenience },
        { label: 'General', value: counts.retail.general },
      ],
      color: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
      textColor: 'text-green-700 dark:text-green-300',
      labelColor: 'text-green-600 dark:text-green-400',
    },
    {
      label: 'Landmarks',
      icon: Landmark,
      total: counts.landmarks.total,
      details: [
        { label: 'Hospitals', value: counts.landmarks.hospitals },
        { label: 'Places of Worship', value: counts.landmarks.worship },
        { label: 'Attractions', value: counts.landmarks.attractions },
        { label: 'Parks', value: counts.landmarks.parks },
      ],
      color: 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800',
      textColor: 'text-purple-700 dark:text-purple-300',
      labelColor: 'text-purple-600 dark:text-purple-400',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          <Brain className="h-4 w-4 text-primary" />
          District Intelligence
          {fromCache && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <CheckCircle2 className="h-3 w-3 text-green-500" /> cached
            </span>
          )}
        </h4>
        <Button variant="ghost" size="sm" onClick={() => fetchIntelligence(true)} className="text-xs h-7">
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {categories.map((cat) => (
          <div key={cat.label} className={`rounded-lg border p-3 ${cat.color}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <cat.icon className={`h-3.5 w-3.5 ${cat.labelColor}`} />
              <p className={`text-[10px] font-medium uppercase tracking-wider ${cat.labelColor}`}>
                {cat.label}
              </p>
            </div>
            <p className={`text-xl font-bold ${cat.textColor}`}>
              {cat.total.toLocaleString()}
            </p>
            <div className="mt-1.5 space-y-0.5">
              {cat.details.map((d) => (
                <div key={d.label} className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{d.label}</span>
                  <span className="font-medium">{d.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-xs font-semibold text-primary">AI Market Insight</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(true)}
            className="h-7 w-7 shrink-0 p-0"
            aria-label="Expand AI Market Insight"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="text-sm text-foreground whitespace-pre-line leading-relaxed max-h-24 overflow-y-auto">
          {aiSummary}
        </div>
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-3xl">
          <DialogHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Market Insight — {district}
            </DialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(false)}
              className="h-8 w-8 p-0"
              aria-label="Collapse AI Market Insight"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto pr-1 text-sm text-foreground whitespace-pre-line leading-relaxed">
            {aiSummary}
          </div>
        </DialogContent>
      </Dialog>

      <p className="text-[9px] text-muted-foreground text-center italic">
        Source: OpenStreetMap POI data · AI analysis via Lovable AI
      </p>
    </div>
  );
};
