import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, RefreshCw, Maximize2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface PincodeAIInsightCardProps {
  pincode: string;
  territories: string[];
  taluka: string;
  retailerCount: number;
}

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getCacheKey(pincode: string) {
  return `pincode_ai_insight_${pincode}`;
}

function getCachedInsight(pincode: string): string | null {
  try {
    const raw = localStorage.getItem(getCacheKey(pincode));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(getCacheKey(pincode));
      return null;
    }
    return parsed.insight;
  } catch {
    return null;
  }
}

function setCachedInsight(pincode: string, insight: string) {
  localStorage.setItem(getCacheKey(pincode), JSON.stringify({ insight, timestamp: Date.now() }));
}

export const PincodeAIInsightCard: React.FC<PincodeAIInsightCardProps> = ({
  pincode, territories, taluka, retailerCount,
}) => {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const cached = getCachedInsight(pincode);
    if (cached) {
      setInsight(cached);
      setFromCache(true);
    }
  }, [pincode]);

  const fetchInsight = async () => {
    setLoading(true);
    setFromCache(false);
    try {
      const { data: cats } = await (supabase as any)
        .from('company_product_categories')
        .select('categories')
        .limit(1)
        .maybeSingle();

      const categories = cats?.categories || [];

      const { data, error } = await supabase.functions.invoke('pincode-market-intelligence', {
        body: { pincode, territories, taluka, retailer_count: retailerCount, categories },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const text = data?.insight || 'No insights available.';
      setInsight(text);
      setCachedInsight(pincode, text);
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate insights');
    } finally {
      setLoading(false);
    }
  };

  if (!insight && !loading) {
    return (
      <Button
        onClick={fetchInsight}
        variant="outline"
        className="w-full gap-2 border-dashed border-2"
      >
        <Sparkles className="h-4 w-4" />
        Generate AI Market Intelligence
      </Button>
    );
  }

  if (loading) {
    return (
      <Card className="border-dashed border-2">
        <CardContent className="flex items-center justify-center py-6 gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Generating market insights…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-primary">AI Market Intelligence</span>
              {fromCache && (
                <span className="text-[10px] text-muted-foreground">(cached)</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setExpanded(true)} className="h-7 text-xs gap-1">
                <Maximize2 className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" onClick={fetchInsight} className="h-7 text-xs gap-1">
                <RefreshCw className="h-3 w-3" /> Refresh
              </Button>
            </div>
          </div>
          <div className="text-sm text-foreground whitespace-pre-line leading-relaxed max-h-32 overflow-y-auto">
            {insight}
          </div>
        </CardContent>
      </Card>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Market Intelligence — PIN {pincode}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-foreground whitespace-pre-line leading-relaxed">
            {insight}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
