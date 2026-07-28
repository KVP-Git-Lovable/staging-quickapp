import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, subMonths } from "date-fns";
import { 
  MapPin, Sparkles, Users, Volume2, VolumeX, TrendingUp, TrendingDown, 
  Calendar, ShoppingCart, AlertTriangle, Target, Star, Package, 
  UserPlus, CreditCard, Lightbulb, Loader2, ChevronDown, ChevronUp,
  ThumbsUp, ThumbsDown
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTranslation } from "react-i18next";
import { useCurrency } from "@/contexts/CurrencyContext";

interface TomorrowBeatPlanProps {
  userId: string;
}

interface BeatInsights {
  lastVisitedDate: string | null;
  lastOrderValue: number;
  averageSales: number;
  beatGrowth: number;
  isAboveAverage: boolean;
  userAverageSales: number;
  topRetailers: Array<{
    name: string;
    lastOrderValue: number;
    category: string;
    pendingPayment: number;
  }>;
  retailersAdded: number;
  hotProducts: string[];
  slowProducts: string[];
  unattendedRetailers: string[];
  pendingPaymentRetailers: Array<{
    name: string;
    amount: number;
  }>;
  totalRetailers: number;
}

export const TomorrowBeatPlan = ({ userId }: TomorrowBeatPlanProps) => {
  const { format: fmtMoney, displayCurrency } = useCurrency();
  const [beatPlan, setBeatPlan] = useState<any>(null);
  const [insights, setInsights] = useState<BeatInsights | null>(null);
  const [aiRecommendation, setAiRecommendation] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const { t } = useTranslation('common');

  const tomorrow = addDays(new Date(), 1);
  const tomorrowDate = format(tomorrow, 'yyyy-MM-dd');

  useEffect(() => {
    fetchTomorrowBeatPlan();
  }, [userId]);

  const fetchTomorrowBeatPlan = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('beat_plans')
        .select('*')
        .eq('user_id', userId)
        .eq('plan_date', tomorrowDate)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      setBeatPlan(data);
      
      if (data) {
        await fetchBeatInsights(data.beat_id);
      }
    } catch (error) {
      console.error('Error fetching tomorrow beat plan:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBeatInsights = async (beatId: string) => {
    try {
      const threeMonthsAgo = format(subMonths(new Date(), 3), 'yyyy-MM-dd');
      const oneMonthAgo = format(subMonths(new Date(), 1), 'yyyy-MM-dd');
      const twoMonthsAgo = format(subMonths(new Date(), 2), 'yyyy-MM-dd');

      // Fetch retailers in beat
      const { data: retailers } = await supabase
        .from('retailers')
        .select('id, name, category, last_order_date, created_at')
        .eq('beat_id', beatId)
        .eq('user_id', userId);

      // Fetch last visit to this beat
      const { data: lastVisit } = await supabase
        .from('beat_plans')
        .select('plan_date')
        .eq('beat_id', beatId)
        .eq('user_id', userId)
        .lt('plan_date', format(new Date(), 'yyyy-MM-dd'))
        .order('plan_date', { ascending: false })
        .limit(1)
        .single();

      // Fetch orders for this beat's retailers
      const retailerIds = retailers?.map(r => r.id) || [];
      
      let orders: any[] = [];
      let lastMonthOrders: any[] = [];
      let twoMonthsOrders: any[] = [];
      
      if (retailerIds.length > 0) {
        const { data: allOrders } = await supabase
          .from('orders')
          .select('retailer_id, total_amount, created_at, items, payment_status')
          .in('retailer_id', retailerIds)
          .gte('created_at', threeMonthsAgo);
        
        orders = allOrders || [];
        lastMonthOrders = orders.filter(o => o.created_at >= oneMonthAgo);
        twoMonthsOrders = orders.filter(o => o.created_at >= twoMonthsAgo && o.created_at < oneMonthAgo);
      }

      // Fetch visits to identify unattended retailers
      const { data: recentVisits } = await supabase
        .from('visits')
        .select('retailer_id, status')
        .eq('user_id', userId)
        .in('retailer_id', retailerIds)
        .gte('visit_date', oneMonthAgo);

      // Fetch user's overall average for comparison
      const { data: userOrders } = await supabase
        .from('orders')
        .select('total_amount')
        .eq('user_id', userId)
        .gte('created_at', threeMonthsAgo);

      // Calculate insights
      const totalOrderValue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const lastMonthTotal = lastMonthOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const twoMonthsTotal = twoMonthsOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const averageSales = orders.length > 0 ? totalOrderValue / 3 : 0;
      const growth = twoMonthsTotal > 0 ? ((lastMonthTotal - twoMonthsTotal) / twoMonthsTotal) * 100 : 0;

      const userTotalOrders = userOrders?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;
      const userAverageSales = userOrders?.length ? userTotalOrders / 3 : 0;

      // Top retailers by order value
      const retailerOrderMap = new Map<string, number>();
      const retailerPendingMap = new Map<string, number>();
      
      orders.forEach(o => {
        const current = retailerOrderMap.get(o.retailer_id) || 0;
        retailerOrderMap.set(o.retailer_id, current + (o.total_amount || 0));
        
        // Track unpaid orders
        if (o.payment_status !== 'paid') {
          const pendingCurrent = retailerPendingMap.get(o.retailer_id) || 0;
          retailerPendingMap.set(o.retailer_id, pendingCurrent + (o.total_amount || 0));
        }
      });

      const topRetailers = (retailers || [])
        .map(r => ({
          name: r.name,
          lastOrderValue: retailerOrderMap.get(r.id) || 0,
          category: r.category || 'General',
          pendingPayment: retailerPendingMap.get(r.id) || 0
        }))
        .sort((a, b) => b.lastOrderValue - a.lastOrderValue)
        .slice(0, 3);

      // Retailers with pending payments from unpaid orders
      const pendingPaymentRetailers = (retailers || [])
        .map(r => ({ 
          name: r.name, 
          amount: retailerPendingMap.get(r.id) || 0 
        }))
        .filter(r => r.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3);

      // Unattended retailers
      const visitedRetailerIds = new Set(recentVisits?.map(v => v.retailer_id) || []);
      const unattendedRetailers = (retailers || [])
        .filter(r => !visitedRetailerIds.has(r.id))
        .map(r => r.name)
        .slice(0, 5);

      // New retailers in last 3 months
      const retailersAdded = (retailers || []).filter(r => 
        r.created_at && r.created_at >= threeMonthsAgo
      ).length;

      // Product analysis
      const productCount = new Map<string, number>();
      orders.forEach(o => {
        const items = o.items as any[];
        items?.forEach((item: any) => {
          const name = item.product_name || item.name || 'Unknown';
          productCount.set(name, (productCount.get(name) || 0) + (item.quantity || 1));
        });
      });

      const sortedProducts = Array.from(productCount.entries()).sort((a, b) => b[1] - a[1]);
      const hotProducts = sortedProducts.slice(0, 3).map(([name]) => name);
      const slowProducts = sortedProducts.slice(-3).map(([name]) => name).reverse();

      // Get last order value
      const lastOrderValue = lastMonthOrders.length > 0 
        ? lastMonthOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0) 
        : 0;

      setInsights({
        lastVisitedDate: lastVisit?.plan_date || null,
        lastOrderValue,
        averageSales,
        beatGrowth: growth,
        isAboveAverage: averageSales > userAverageSales,
        userAverageSales,
        topRetailers,
        retailersAdded,
        hotProducts,
        slowProducts,
        unattendedRetailers,
        pendingPaymentRetailers,
        totalRetailers: retailers?.length || 0
      });

    } catch (error) {
      console.error('Error fetching beat insights:', error);
    }
  };

  const generateAIRecommendation = useCallback(async () => {
    if (!beatPlan || !insights) return;

    try {
      setGeneratingAI(true);
      
      const prompt = `Based on the following beat data, provide actionable recommendations for tomorrow's visit:
      
Beat: ${beatPlan.beat_name}
Last Visited: ${insights.lastVisitedDate || 'Never'}
Total Retailers: ${insights.totalRetailers}
Average Monthly Sales: ${fmtMoney(insights.averageSales)}
Growth: ${insights.beatGrowth.toFixed(1)}%
Performance: ${insights.isAboveAverage ? 'Above' : 'Below'} user average
Top Retailers: ${insights.topRetailers.map(r => r.name).join(', ')}
Unattended Retailers: ${insights.unattendedRetailers.join(', ')}
Hot Products: ${insights.hotProducts.join(', ')}
Slow Products: ${insights.slowProducts.join(', ')}
Pending Payments: ${insights.pendingPaymentRetailers.map(r => `${r.name}: ${fmtMoney(r.amount)}`).join(', ')}
New Retailers Added: ${insights.retailersAdded}

Provide 4-5 specific, actionable recommendations for a productive day. Focus on:
1. Priority retailers to visit
2. Products to push
3. Collections to follow up
4. Territory expansion opportunities
5. Key talking points for retailers

Keep it concise and practical.`;

      const { data, error } = await supabase.functions.invoke('chat-assistant', {
        body: { 
          message: prompt,
          context: 'beat_planning'
        }
      });

      if (error) throw error;
      
      setAiRecommendation(data?.response || "Focus on your top retailers first, follow up on pending payments, and explore new retailer opportunities.");
      
    } catch (error) {
      console.error('Error generating AI recommendation:', error);
      // Fallback recommendation
      const fallback = generateFallbackRecommendation();
      setAiRecommendation(fallback);
    } finally {
      setGeneratingAI(false);
    }
  }, [beatPlan, insights]);

  const generateFallbackRecommendation = () => {
    if (!insights) return "Prepare for tomorrow by reviewing your beat plan.";
    
    let rec = "🎯 Tomorrow's Focus:\n\n";
    
    if (insights.topRetailers.length > 0) {
      rec += `• Start with ${insights.topRetailers[0].name} - your top performer\n`;
    }
    
    if (insights.pendingPaymentRetailers.length > 0) {
      rec += `• Collect ${fmtMoney(insights.pendingPaymentRetailers.reduce((s, r) => s + r.amount, 0))} in pending payments\n`;
    }
    
    if (insights.hotProducts.length > 0) {
      rec += `• Push ${insights.hotProducts[0]} - it's selling well\n`;
    }
    
    if (insights.unattendedRetailers.length > 0) {
      rec += `• Don't miss ${insights.unattendedRetailers[0]} - hasn't been visited recently\n`;
    }
    
    if (!insights.isAboveAverage) {
      rec += `• Focus on increasing order values - currently below your average\n`;
    }
    
    return rec;
  };

  const toggleSpeech = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const textToSpeak = aiRecommendation || generateSummaryText();
    
    if (!textToSpeak) {
      toast.error("No content to read");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 0.95;
    utterance.pitch = 1.1;
    
    // Try to find Indian English female voice
    const voices = window.speechSynthesis.getVoices();
    const indianVoice = voices.find(v => 
      (v.lang === 'en-IN' || v.lang.includes('IN')) && v.name.toLowerCase().includes('female')
    ) || voices.find(v => 
      v.lang === 'en-IN' || v.lang.includes('IN')
    ) || voices.find(v => 
      v.name.toLowerCase().includes('indian')
    ) || voices.find(v => 
      v.lang.startsWith('en') && v.name.toLowerCase().includes('female')
    );
    
    if (indianVoice) {
      utterance.voice = indianVoice;
    }
    
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => {
      setIsSpeaking(false);
      toast.error("Speech synthesis failed");
    };
    
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  const handleFeedback = async (type: 'up' | 'down') => {
    setFeedback(type);
    toast.success(type === 'up' ? "Thanks for your feedback!" : "We'll improve our recommendations");
    
    // Store feedback in database
    try {
      await supabase.from('ai_feature_feedback').insert({
        user_id: userId,
        feature: 'tomorrow_beat_plan',
        feedback_type: type
      });
    } catch (error) {
      console.error('Error storing feedback:', error);
    }
  };

  const generateSummaryText = () => {
    if (!beatPlan || !insights) return "";
    
    return `Tomorrow you're visiting ${beatPlan.beat_name}. 
    This beat has ${insights.totalRetailers} retailers with average monthly sales of ${insights.averageSales.toLocaleString()} rupees.
    Your top retailer is ${insights.topRetailers[0]?.name || 'not yet identified'}.
    ${insights.pendingPaymentRetailers.length > 0 ? `You have ${insights.pendingPaymentRetailers.reduce((s, r) => s + r.amount, 0).toLocaleString()} rupees in pending collections.` : ''}
    ${insights.beatGrowth > 0 ? `Good news - this beat is growing at ${insights.beatGrowth.toFixed(1)} percent.` : `This beat needs attention - it's down ${Math.abs(insights.beatGrowth).toFixed(1)} percent.`}`;
  };

  // Auto-generate insights when data is loaded
  useEffect(() => {
    if (beatPlan && insights && !aiRecommendation && !generatingAI) {
      generateAIRecommendation();
    }
  }, [beatPlan, insights, aiRecommendation, generatingAI, generateAIRecommendation]);

  if (loading) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-2 bg-gradient-to-r from-blue-500/10 to-purple-500/10">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            {t('home.tomorrowsBeatPlan')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!beatPlan) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            {t('home.tomorrowsBeatPlan')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{t('home.noBeatPlannedForTomorrow')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={!isCollapsed} onOpenChange={(open) => setIsCollapsed(!open)}>
      <Card className="overflow-hidden border-2 border-primary/20">
        <CardHeader className="pb-2 bg-gradient-to-r from-blue-500/10 to-purple-500/10">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              {t('home.tomorrowsBeatPlan')}
            </CardTitle>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSpeech}
                className="h-7 w-7 p-0"
                title={isSpeaking ? "Stop" : "Listen"}
              >
                {isSpeaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={generateAIRecommendation}
                disabled={generatingAI}
                className="h-7 w-7 p-0"
                title="Regenerate"
              >
                {generatingAI ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              </Button>
              {aiRecommendation && (
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title={isCollapsed ? "Expand" : "Collapse"}>
                    {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-3">
        {/* Beat Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{format(tomorrow, 'EEEE, MMM dd')}</p>
            <p className="font-bold text-lg">{beatPlan.beat_name}</p>
          </div>
          {insights && (
            <Badge variant={insights.isAboveAverage ? "default" : "secondary"} className="text-xs">
              {insights.isAboveAverage ? (
                <><TrendingUp className="h-3 w-3 mr-1" /> {t('home.aboveAvg')}</>
              ) : (
                <><TrendingDown className="h-3 w-3 mr-1" /> {t('home.belowAvg')}</>
              )}
            </Badge>
          )}
        </div>

        {insights && (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-muted/50 rounded-lg p-2 text-center">
                <Users className="h-3 w-3 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm font-bold">{insights.totalRetailers}</p>
                <p className="text-[10px] text-muted-foreground">Retailers</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2 text-center">
                <ShoppingCart className="h-3 w-3 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm font-bold">{displayCurrency === 'INR' ? `₹${(insights.averageSales / 1000).toFixed(0)}K` : fmtMoney(insights.averageSales)}</p>
                <p className="text-[10px] text-muted-foreground">Avg/Month</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2 text-center">
                <TrendingUp className="h-3 w-3 mx-auto mb-1 text-muted-foreground" />
                <p className={`text-sm font-bold ${insights.beatGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {insights.beatGrowth >= 0 ? '+' : ''}{insights.beatGrowth.toFixed(0)}%
                </p>
                <p className="text-[10px] text-muted-foreground">Growth</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2 text-center">
                <UserPlus className="h-3 w-3 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm font-bold">{insights.retailersAdded}</p>
                <p className="text-[10px] text-muted-foreground">New (3M)</p>
              </div>
            </div>

            {/* Last Visit Info */}
            {insights.lastVisitedDate && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1">
                <Calendar className="h-3 w-3" />
                Last visited: {format(new Date(insights.lastVisitedDate), 'MMM dd, yyyy')}
                <span className="ml-auto">Last order: {fmtMoney(insights.lastOrderValue)}</span>
              </div>
            )}

            {/* Top Retailers */}
            {insights.topRetailers.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold flex items-center gap-1">
                  <Star className="h-3 w-3 text-yellow-500" /> Top 3 Retailers
                </p>
                {insights.topRetailers.map((r, i) => (
                  <div key={i} className="flex items-center justify-between bg-gradient-to-r from-yellow-500/5 to-orange-500/5 rounded px-2 py-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-yellow-600">{i + 1}</span>
                      <div>
                        <p className="font-medium">{r.name}</p>
                        <p className="text-[10px] text-muted-foreground">{r.category}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{fmtMoney(r.lastOrderValue)}</p>
                      {r.pendingPayment > 0 && (
                        <p className="text-[10px] text-red-500">Due: {fmtMoney(r.pendingPayment)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pending Payments */}
            {insights.pendingPaymentRetailers.length > 0 && (
              <div className="bg-red-500/10 rounded-lg p-2 space-y-1">
                <p className="text-xs font-semibold flex items-center gap-1 text-red-600">
                  <CreditCard className="h-3 w-3" /> Pending Collections
                </p>
                <div className="space-y-1">
                  {insights.pendingPaymentRetailers.map((r, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span>{r.name}</span>
                      <span className="font-medium">{fmtMoney(r.amount)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-red-600 font-medium border-t border-red-500/20 pt-1 mt-1">
                  Total: {fmtMoney(insights.pendingPaymentRetailers.reduce((s, r) => s + r.amount, 0))}
                </p>
              </div>
            )}

            {/* Products */}
            <div className="grid grid-cols-2 gap-2">
              {insights.hotProducts.length > 0 && (
                <div className="bg-green-500/10 rounded-lg p-2">
                  <p className="text-[10px] font-semibold text-green-600 flex items-center gap-1 mb-1">
                    <Package className="h-3 w-3" /> Hot Products
                  </p>
                  {insights.hotProducts.slice(0, 2).map((p, i) => (
                    <p key={i} className="text-xs truncate">{p}</p>
                  ))}
                </div>
              )}
              {insights.slowProducts.length > 0 && (
                <div className="bg-orange-500/10 rounded-lg p-2">
                  <p className="text-[10px] font-semibold text-orange-600 flex items-center gap-1 mb-1">
                    <AlertTriangle className="h-3 w-3" /> Slow Movers
                  </p>
                  {insights.slowProducts.slice(0, 2).map((p, i) => (
                    <p key={i} className="text-xs truncate">{p}</p>
                  ))}
                </div>
              )}
            </div>

            {/* Unattended Retailers */}
            {insights.unattendedRetailers.length > 0 && (
              <div className="bg-yellow-500/10 rounded-lg p-2">
                <p className="text-[10px] font-semibold text-yellow-600 flex items-center gap-1 mb-1">
                  <Target className="h-3 w-3" /> Unvisited Last Month
                </p>
                <p className="text-xs">
                  {insights.unattendedRetailers.slice(0, 3).join(', ')}
                  {insights.unattendedRetailers.length > 3 && ` +${insights.unattendedRetailers.length - 3} more`}
                </p>
              </div>
            )}
          </>
        )}

        {/* AI Recommendation */}
        {(aiRecommendation || generatingAI) && (
          <div className="bg-gradient-to-r from-primary/10 to-purple-500/10 rounded-lg p-3 border border-primary/20">
            <p className="text-xs font-semibold flex items-center gap-1 mb-2 text-primary">
              <Lightbulb className="h-3 w-3" /> AI Recommendations
            </p>
            {generatingAI ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ) : (
              <p className="text-xs whitespace-pre-line leading-relaxed">{aiRecommendation}</p>
            )}
          </div>
        )}

        {/* Feedback Buttons */}
        {aiRecommendation && !generatingAI && (
          <div className="flex items-center justify-center gap-3 pt-2 border-t border-border/50">
            <span className="text-xs text-muted-foreground">Was this helpful?</span>
            <Button
              variant={feedback === 'up' ? "default" : "outline"}
              size="sm"
              className="h-7 px-3"
              onClick={() => handleFeedback('up')}
              disabled={feedback !== null}
            >
              <ThumbsUp className="h-3 w-3 mr-1" />
              Yes
            </Button>
            <Button
              variant={feedback === 'down' ? "destructive" : "outline"}
              size="sm"
              className="h-7 px-3"
              onClick={() => handleFeedback('down')}
              disabled={feedback !== null}
            >
              <ThumbsDown className="h-3 w-3 mr-1" />
              No
            </Button>
          </div>
        )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
