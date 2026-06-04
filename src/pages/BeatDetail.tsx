import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Phone, Store, Calendar, TrendingUp, CalendarDays, Edit2, BarChart, Trash2, Sparkles, Target, Shield, AlertTriangle, Lightbulb, Users, Package, DollarSign, Clock, Zap, Search, IndianRupee, Info, ThumbsUp, ThumbsDown, CheckCircle } from "lucide-react";
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layout } from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { BeatVisitCalendar } from "@/components/BeatVisitCalendar";
import { useBeatMetrics } from "@/hooks/useBeatMetrics";
import { moveToRecycleBin } from "@/utils/recycleBinUtils";
import { useBeatLifecycle } from "@/hooks/useBeatLifecycle";
import { BeatDeleteDialog } from "@/components/BeatDeleteDialog";
import { BeatAuditTimeline } from "@/components/BeatAuditTimeline";
import { EditBeatModal } from "@/components/EditBeatModal";
import { BeatAnalyticsModal } from "@/components/BeatAnalyticsModal";
import { useRecommendations, Recommendation } from "@/hooks/useRecommendations";
import { BeatInsightModal } from "@/components/BeatInsightModal";
import { RetailerDetailModal } from "@/components/RetailerDetailModal";
import { BeatRetailerExport } from "@/components/BeatRetailerExport";
import { TargetVsActualCard } from "@/components/performance/TargetVsActualCard";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface BeatDetailData {
  id?: string; // Database UUID
  beat_id: string;
  beat_name: string;
  category?: string;
  created_at: string;
  travel_allowance?: number;
  average_km?: number;
  average_time_minutes?: number;
  territory_id?: string;
  territory_name?: string;
  retailers: Array<{
    id: string;
    name: string;
    address: string;
    phone?: string;
    category?: string;
    priority?: string;
    last_visit_date?: string;
    order_value?: number;
    fyOrderValue?: number;
  }>;
}

interface BeatSWOT {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export const BeatDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const beatLifecycle = useBeatLifecycle();
  const [beatData, setBeatData] = useState<BeatDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [swot, setSwot] = useState<BeatSWOT>({ strengths: [], weaknesses: [], opportunities: [], threats: [] });
  const [retailerSearch, setRetailerSearch] = useState("");
  const [selectedRetailer, setSelectedRetailer] = useState<any>(null);
  const [showRetailerModal, setShowRetailerModal] = useState(false);
  const [beatQueryId, setBeatQueryId] = useState<string>(id || "");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [availableBeats, setAvailableBeats] = useState<{ id: string; name: string; retailer_count?: number }[]>([]);
  const [availableUsers, setAvailableUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [upcomingVisitsCount, setUpcomingVisitsCount] = useState(0);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [showHealthInsight, setShowHealthInsight] = useState(false);

  const filteredRetailers = useMemo(() => {
    if (!beatData?.retailers) return [];
    if (!retailerSearch.trim()) return beatData.retailers;
    const searchLower = retailerSearch.toLowerCase();
    return beatData.retailers.filter(retailer => 
      retailer.name.toLowerCase().includes(searchLower) ||
      retailer.address?.toLowerCase().includes(searchLower) ||
      retailer.category?.toLowerCase().includes(searchLower)
    );
  }, [beatData?.retailers, retailerSearch]);
  const [performanceStats, setPerformanceStats] = useState({
    totalRevenue: 0,
    avgOrderValue: 0,
    totalVisits: 0,
    productiveVisits: 0,
    conversionRate: 0,
    growthRate: 0,
    currentMonthConversion: 0,
    previousMonthConversion: 0,
    lifetimeValue: 0,
    lastVisitedDate: null as string | null
  });
  const [beatChartData, setBeatChartData] = useState<{
    ordersByMonth: { month: string; orders: number; revenue: number }[];
    salesBySKU: { name: string; value: number }[];
    topRetailers: { name: string; revenue: number }[];
    retailersByMonth: { month: string; count: number }[];
  }>({
    ordersByMonth: [],
    salesBySKU: [],
    topRetailers: [],
    retailersByMonth: []
  });
  
  const { metrics, loading: metricsLoading } = useBeatMetrics(beatQueryId || "", user?.id || "");
  const { recommendations, generateRecommendation, provideFeedback, loading: recommendationsLoading } = useRecommendations('beat_visit', beatData?.id);

  useEffect(() => {
    if (id) setBeatQueryId(id);
  }, [id]);
  useEffect(() => {
    if (!user || !id) return;

    const fetchBeatData = async () => {
      try {
        setLoading(true);

        // Fetch beat from beats table (support both beats.id UUID and beats.beat_id code)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        let beatQuery = supabase.from('beats').select('*');
        if (isUUID) {
          beatQuery = beatQuery.or(`id.eq.${id},beat_id.eq.${id}`);
        } else {
          beatQuery = beatQuery.eq('beat_id', id);
        }
        const { data: beat, error: beatError } = await beatQuery.maybeSingle();

        if (beatError && beatError.code !== 'PGRST116') {
          console.error('Error fetching beat:', beatError);
        }

        const resolvedBeatId = beat?.beat_id ?? id;
        setBeatQueryId(resolvedBeatId);

        // If not found in beats, try beat_plans
        let beatInfo: any = beat;
        if (!beat) {
          const { data: beatPlan, error: beatPlanError } = await supabase
            .from('beat_plans')
            .select('beat_id, beat_name, beat_data, created_at')
            .eq('beat_id', resolvedBeatId)
            .eq('user_id', user.id)
            .single();

          if (!beatPlanError && beatPlan) {
            beatInfo = {
              beat_id: beatPlan.beat_id,
              beat_name: beatPlan.beat_name,
              created_at: beatPlan.created_at,
              category: 'General'
            };
          }
        }

        // Get territory name if territory_id exists
        let territoryName = null;
        if (beat?.territory_id) {
          const { data: territory } = await supabase
            .from('territories')
            .select('name')
            .eq('id', beat.territory_id)
            .single();
          territoryName = territory?.name;
        }

        // Get retailers for this beat
        const { data: retailers, error: retailersError } = await supabase
          .from('retailers')
          .select('id, name, address, phone, category, priority, last_visit_date, order_value')
          .eq('beat_id', resolvedBeatId)
          .eq('user_id', user.id);

        if (retailersError) {
          console.error('Error fetching retailers:', retailersError);
          throw retailersError;
        }

        // Calculate FY order value for each retailer
        const retailerIds = retailers?.map(r => r.id) || [];
        let retailersWithFY = retailers || [];

        if (retailerIds.length > 0) {
          // Determine current FY (April to March)
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentMonth = now.getMonth(); // 0-indexed
          const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1; // April is month 3
          const fyStart = new Date(fyStartYear, 3, 1); // April 1st

          const { data: fyOrders } = await supabase
            .from('orders')
            .select('retailer_id, total_amount')
            .in('retailer_id', retailerIds)
            .eq('status', 'confirmed')
            .gte('created_at', fyStart.toISOString());

          // Aggregate FY order value per retailer
          const fyOrderMap = new Map<string, number>();
          fyOrders?.forEach(order => {
            const current = fyOrderMap.get(order.retailer_id) || 0;
            fyOrderMap.set(order.retailer_id, current + (order.total_amount || 0));
          });

          retailersWithFY = (retailers || []).map(r => ({
            ...r,
            fyOrderValue: fyOrderMap.get(r.id) || 0
          }));
        }

        // Calculate performance stats
        await calculatePerformanceStats(resolvedBeatId, user.id, retailersWithFY);

        // Generate SWOT analysis
        generateSWOT(retailersWithFY, metrics);

        setBeatData({
          id: beat?.id, // Database UUID
          beat_id: resolvedBeatId,
          beat_name: beatInfo?.beat_name || resolvedBeatId,
          category: beatInfo?.category || 'General',
          created_at: beatInfo?.created_at || new Date().toISOString(),
          travel_allowance: beat?.travel_allowance,
          average_km: beat?.average_km,
          average_time_minutes: beat?.average_time_minutes,
          territory_id: beat?.territory_id,
          territory_name: territoryName,
          retailers: retailersWithFY
        });

      } catch (error) {
        console.error('Error loading beat data:', error);
        toast.error('Failed to load beat details');
      } finally {
        setLoading(false);
      }
    };

    fetchBeatData();
  }, [user, id, refreshKey]);

  const calculatePerformanceStats = async (beatId: string, userId: string, retailers: any[]) => {
    try {
      const retailerIds = retailers.map(r => r.id);
      
      const now = new Date();
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      // Count beat visits from beat_plans (how many times this beat was planned/visited)
      const { data: beatPlans } = await supabase
        .from('beat_plans')
        .select('plan_date')
        .eq('beat_id', beatId)
        .eq('user_id', userId)
        .gte('plan_date', threeMonthsAgo.toISOString().split('T')[0])
        .lte('plan_date', now.toISOString().split('T')[0]);

      const beatVisitCount = beatPlans?.length || 0;

      // Get last visited date for this beat
      const { data: lastBeatPlan } = await supabase
        .from('beat_plans')
        .select('plan_date')
        .eq('beat_id', beatId)
        .eq('user_id', userId)
        .lte('plan_date', now.toISOString().split('T')[0])
        .order('plan_date', { ascending: false })
        .limit(1);

      const lastVisitedDate = lastBeatPlan?.[0]?.plan_date || null;

      // Fetch all orders for lifetime value (include id for order_items query)
      const { data: allOrders } = await supabase
        .from('orders')
        .select('id, total_amount, created_at, retailer_id')
        .in('retailer_id', retailerIds.length > 0 ? retailerIds : ['none'])
        .eq('status', 'confirmed');

      const lifetimeValue = allOrders?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;

      // Fetch orders for last 3 months
      const orders = allOrders?.filter(o => new Date(o.created_at) >= threeMonthsAgo) || [];

      // Fetch visits for conversion calculation
      const { data: visits } = await supabase
        .from('visits')
        .select('status, created_at, retailer_id')
        .in('retailer_id', retailerIds.length > 0 ? retailerIds : ['none'])
        .gte('created_at', threeMonthsAgo.toISOString());

      const totalRevenue = orders?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;
      const totalOrders = orders?.length || 0;
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Calculate current month conversion
      const currentMonthVisits = visits?.filter(v => new Date(v.created_at) >= currentMonthStart) || [];
      const currentMonthProductiveVisits = currentMonthVisits.filter(v => v.status === 'completed').length;
      const currentMonthConversion = currentMonthVisits.length > 0 ? (currentMonthProductiveVisits / currentMonthVisits.length) * 100 : 0;

      // Calculate previous month conversion
      const prevMonthVisits = visits?.filter(v => {
        const d = new Date(v.created_at);
        return d >= previousMonthStart && d <= previousMonthEnd;
      }) || [];
      const prevMonthProductiveVisits = prevMonthVisits.filter(v => v.status === 'completed').length;
      const previousMonthConversion = prevMonthVisits.length > 0 ? (prevMonthProductiveVisits / prevMonthVisits.length) * 100 : 0;

      // Overall conversion rate
      const totalVisits = visits?.length || 0;
      const productiveVisits = visits?.filter(v => v.status === 'completed').length || 0;
      const conversionRate = totalVisits > 0 ? (productiveVisits / totalVisits) * 100 : 0;

      // Calculate growth rate
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

      const lastMonthRevenue = orders?.filter(o => new Date(o.created_at) >= oneMonthAgo)
        .reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;
      const prevMonthRevenue = orders?.filter(o => new Date(o.created_at) >= twoMonthsAgo && new Date(o.created_at) < oneMonthAgo)
        .reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;
      
      const growthRate = prevMonthRevenue > 0 ? ((lastMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100 : 0;

      setPerformanceStats({
        totalRevenue,
        avgOrderValue,
        totalVisits: beatVisitCount,
        productiveVisits,
        conversionRate,
        growthRate,
        currentMonthConversion,
        previousMonthConversion,
        lifetimeValue,
        lastVisitedDate
      });

      // Generate chart data
      await generateChartData(beatId, userId, retailerIds, sixMonthsAgo, allOrders || [], retailers);

    } catch (error) {
      console.error('Error calculating performance stats:', error);
    }
  };

  const generateChartData = async (beatId: string, userId: string, retailerIds: string[], sixMonthsAgo: Date, allOrders: any[], retailers: any[]) => {
    try {
      // Orders by month (last 6 months)
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const ordersByMonth: { month: string; orders: number; revenue: number }[] = [];
      
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        
        const monthOrders = allOrders.filter(o => {
          const orderDate = new Date(o.created_at);
          return orderDate >= monthStart && orderDate <= monthEnd;
        });
        
        ordersByMonth.push({
          month: monthNames[d.getMonth()],
          orders: monthOrders.length,
          revenue: monthOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
        });
      }

      // Get order items for SKU data
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('quantity, total, product_name')
        .in('order_id', allOrders.map(o => o.id || '').filter(Boolean));

      // Sales by SKU (aggregate by product)
      const skuMap = new Map<string, number>();
      orderItems?.forEach(item => {
        const productName = item.product_name || 'Unknown';
        const value = item.total || 0;
        skuMap.set(productName, (skuMap.get(productName) || 0) + value);
      });
      
      const salesBySKU = Array.from(skuMap.entries())
        .map(([name, value]) => ({ name: name.substring(0, 15), value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

      // Top 20 retailers by revenue
      const retailerRevenueMap = new Map<string, number>();
      allOrders.forEach(order => {
        const retailer = retailers.find(r => r.id === order.retailer_id);
        if (retailer) {
          retailerRevenueMap.set(retailer.name, (retailerRevenueMap.get(retailer.name) || 0) + (order.total_amount || 0));
        }
      });
      
      const topRetailers = Array.from(retailerRevenueMap.entries())
        .map(([name, revenue]) => ({ name: name.substring(0, 12), revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 20);

      // Retailers count by created date (last 6 months)
      const retailersByMonth: { month: string; count: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        
        const count = retailers.filter(r => {
          if (!r.created_at) return false;
          const createdDate = new Date(r.created_at);
          return createdDate >= monthStart && createdDate <= monthEnd;
        }).length;
        
        retailersByMonth.push({
          month: monthNames[d.getMonth()],
          count
        });
      }

      setBeatChartData({
        ordersByMonth,
        salesBySKU,
        topRetailers,
        retailersByMonth
      });

    } catch (error) {
      console.error('Error generating chart data:', error);
    }
  };

  const getCategoryByGrowth = (growthRate: number): string => {
    if (growthRate >= 50) return 'Hyper growth';
    if (growthRate >= 20) return 'Growing';
    if (growthRate >= 0) return 'Avg growth';
    if (growthRate >= -20) return 'Slow';
    return 'Very slow (risk)';
  };

  const getCategoryColor = (category: string): string => {
    switch (category) {
      case 'Hyper growth': return 'bg-green-500 text-white';
      case 'Growing': return 'bg-emerald-500 text-white';
      case 'Avg growth': return 'bg-blue-500 text-white';
      case 'Slow': return 'bg-orange-500 text-white';
      case 'Very slow (risk)': return 'bg-red-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const generateSWOT = (retailers: any[], beatMetrics: any) => {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const opportunities: string[] = [];
    const threats: string[] = [];

    // Analyze retailers
    const highPriorityCount = retailers.filter(r => r.priority === 'high').length;
    const retailerCount = retailers.length;
    const avgOrderValue = retailers.reduce((sum, r) => sum + (r.order_value || 0), 0) / (retailerCount || 1);

    // Strengths
    if (retailerCount >= 20) strengths.push(`Strong retailer base with ${retailerCount} retailers`);
    if (highPriorityCount >= 5) strengths.push(`${highPriorityCount} high-priority retailers`);
    if (beatMetrics.visitsPerMonth >= 4) strengths.push(`Consistent visit frequency (${beatMetrics.visitsPerMonth}/month)`);
    if (avgOrderValue >= 5000) strengths.push(`High average order value (₹${avgOrderValue.toLocaleString()})`);
    if (beatMetrics.retailersAdded3Months >= 3) strengths.push(`Growing network (+${beatMetrics.retailersAdded3Months} retailers in 3 months)`);

    // Weaknesses
    if (retailerCount < 10) weaknesses.push(`Low retailer coverage (${retailerCount} retailers)`);
    if (beatMetrics.visitsPerMonth < 2) weaknesses.push('Infrequent visits to this beat');
    if (avgOrderValue < 2000) weaknesses.push('Low average order value');
    const inactiveRetailers = retailers.filter(r => {
      if (!r.last_visit_date) return true;
      const daysSinceVisit = Math.floor((new Date().getTime() - new Date(r.last_visit_date).getTime()) / (1000 * 60 * 60 * 24));
      return daysSinceVisit > 30;
    }).length;
    if (inactiveRetailers > 5) weaknesses.push(`${inactiveRetailers} retailers not visited in 30+ days`);

    // Opportunities
    if (retailerCount >= 15 && retailerCount < 25) opportunities.push('Potential to expand to 25+ retailers');
    if (beatMetrics.revenueGrowth > 0) opportunities.push(`Positive revenue trend (${beatMetrics.revenueGrowth}% growth)`);
    opportunities.push('Introduce new product categories');
    opportunities.push('Cross-sell to existing high-value retailers');

    // Threats
    if (beatMetrics.revenueGrowth < 0) threats.push(`Revenue declining (${beatMetrics.revenueGrowth}% drop)`);
    if (inactiveRetailers > retailerCount * 0.3) threats.push('Risk of losing dormant retailers to competition');
    threats.push('Competition may target high-value retailers');

    setSwot({ strengths, weaknesses, opportunities, threats });
  };

  const handleDeleteClick = async () => {
    if (!beatData || !user) return;

    // Pre-check: does this beat have historical references?
    const { data: check, error: checkError } = await supabase
      .rpc('can_delete_beat' as any, { p_beat_id: beatData.beat_id });

    if (checkError) {
      console.error('can_delete_beat error', checkError);
      toast.error('Could not check beat data. Please try again.');
      return;
    }

    const checkResult: any = check || {};
    if (!checkResult.deletable) {
      const reasons: string[] = Array.isArray(checkResult.reasons) ? checkResult.reasons : [];
      const reasonText = reasons.length ? `\n\n• ${reasons.join('\n• ')}` : '';
      const confirmed = window.confirm(
        `"${beatData.beat_name}" has historical records and cannot be permanently deleted:${reasonText}\n\nThis beat can only be deactivated (hidden from view). Historical data will be preserved.\n\nDeactivate this beat instead?`
      );
      if (!confirmed) return;

      setIsDeleting(true);
      try {
        const { error: deactivateError } = await supabase
          .from('beats')
          .update({
            is_active: false,
            deactivated_at: new Date().toISOString(),
            deactivated_by: user.id,
          } as any)
          .eq('beat_id', beatData.beat_id);
        if (deactivateError) throw deactivateError;
        toast.success(`"${beatData.beat_name}" has been deactivated`);
        window.dispatchEvent(new CustomEvent('beatDeleted', { detail: { beatId: beatData.beat_id } }));
        navigate('/my-beats');
      } catch (e) {
        console.error(e);
        toast.error('Failed to deactivate beat');
      } finally {
        setIsDeleting(false);
      }
      return;
    }

    try {
      // Fetch available beats
      const { data: allBeats } = await supabase
        .from('beats')
        .select('beat_id, beat_name')
        .eq('is_active', true)
        .eq('created_by', user.id)
        .neq('beat_id', beatData.beat_id);

      if (allBeats) {
        const { data: retailerCounts } = await supabase
          .from('retailers')
          .select('beat_id')
          .eq('user_id', user.id)
          .in('beat_id', allBeats.map(b => b.beat_id));

        const countMap = new Map<string, number>();
        retailerCounts?.forEach(r => {
          countMap.set(r.beat_id, (countMap.get(r.beat_id) || 0) + 1);
        });

        setAvailableBeats(allBeats.map(b => ({
          id: b.beat_id,
          name: b.beat_name,
          retailer_count: countMap.get(b.beat_id) || 0
        })));
      }

      // Fetch impact counts
      const today = new Date().toISOString().split('T')[0];
      const { count: visitsCount } = await supabase
        .from('beat_plans')
        .select('id', { count: 'exact', head: true })
        .eq('beat_id', beatData.beat_id)
        .gte('plan_date', today);
      setUpcomingVisitsCount(visitsCount || 0);

      const { count: ordersCount } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('beat_id', beatData.beat_id)
        .eq('status', 'pending');
      setPendingOrdersCount(ordersCount || 0);

      // Fetch available users
      const { data: users } = await supabase.rpc('get_profiles_for_selector');
      setAvailableUsers(
        (users || []).filter((u: any) => u.id !== user.id).map((u: any) => ({ id: u.id, full_name: u.full_name }))
      );
    } catch (error) {
      console.error('Error fetching delete data:', error);
    }
    
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async (deleteOption: 'delete' | 'transfer' | 'reassign' | 'unassign', targetBeatId?: string, targetUserId?: string, createNewBeat?: boolean) => {
    if (!beatData || !user) return;

    setIsDeleting(true);
    try {
      // Move beat to recycle bin
      await moveToRecycleBin({
        tableName: 'beats',
        recordId: beatData.beat_id,
        recordData: {
          beat_id: beatData.beat_id,
          beat_name: beatData.beat_name
        },
        moduleName: 'beats',
        recordName: beatData.beat_name
      });

      // Handle retailers
      if (deleteOption === 'delete') {
        const { data: retailersToDelete } = await supabase
          .from('retailers')
          .select('*')
          .eq('beat_id', beatData.beat_id)
          .eq('user_id', user.id);

        if (retailersToDelete && retailersToDelete.length > 0) {
          for (const retailer of retailersToDelete) {
            await moveToRecycleBin({
              tableName: 'retailers',
              recordId: retailer.id,
              recordData: retailer,
              moduleName: 'Retailers',
              recordName: retailer.name || 'Unknown Retailer'
            });
          }

          await supabase
            .from('retailers')
            .delete()
            .eq('beat_id', beatData.beat_id)
            .eq('user_id', user.id);
        }
      } else if (deleteOption === 'transfer' && targetBeatId) {
        const targetBeat = availableBeats.find(b => b.id === targetBeatId);
        await supabase
          .from('retailers')
          .update({
            beat_id: targetBeatId,
            beat_name: targetBeat?.name || null
          })
          .eq('beat_id', beatData.beat_id)
          .eq('user_id', user.id);
      } else if (deleteOption === 'reassign' && targetUserId) {
        let newBeatId: string | null = null;
        if (createNewBeat) {
          const targetUser = availableUsers.find(u => u.id === targetUserId);
          const newBeatName = `${beatData.beat_name} - ${targetUser?.full_name || 'User'}`;
          newBeatId = `beat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          await supabase.from('beats').insert({
            beat_id: newBeatId,
            beat_name: newBeatName,
            created_by: targetUserId,
            is_active: true,
            category: 'General',
            owner_name: targetUser?.full_name || null,
          });
        }

        const updateData: any = { user_id: targetUserId };
        if (newBeatId) {
          updateData.beat_id = newBeatId;
        }

        await supabase
          .from('retailers')
          .update(updateData)
          .eq('beat_id', beatData.beat_id)
          .eq('user_id', user.id);
      } else if (deleteOption === 'unassign') {
        await supabase
          .from('retailers')
          .update({ beat_id: null, beat_name: null })
          .eq('beat_id', beatData.beat_id)
          .eq('user_id', user.id);
      }

      // Deactivate the beat
      await supabase
        .from('beats')
        .update({ is_active: false })
        .eq('beat_id', beatData.beat_id);

      // Insert audit log
      try {
        await supabase.from('beat_audit_log' as any).insert({
          beat_id: beatData.beat_id,
          action: 'delete',
          old_user_id: user.id,
          new_user_id: deleteOption === 'reassign' ? targetUserId : null,
          metadata: { beat_name: beatData.beat_name, delete_option: deleteOption, retailer_count: beatData.retailers.length },
          performed_by: user.id,
        });
      } catch (e) {
        console.error('Error inserting audit log:', e);
      }

      toast.success('Beat deleted successfully');
      
      window.dispatchEvent(new CustomEvent('visitDataChanged'));
      window.dispatchEvent(new CustomEvent('beatDeleted', { detail: { beatId: beatData.beat_id } }));
      
      navigate('/my-beats');
    } catch (error) {
      console.error('Error deleting beat:', error);
      toast.error('Failed to delete beat');
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  const handleAIInsights = () => {
    setShowHealthInsight(true);
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case "high":
        return "bg-destructive text-destructive-foreground";
      case "medium":
        return "bg-warning text-warning-foreground";
      case "low":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded"></div>
            <div className="h-32 bg-muted rounded"></div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!beatData) {
    return (
      <Layout>
        <div className="p-4">
          <div className="text-center py-8">
            <p className="text-muted-foreground">Beat not found</p>
            <Button onClick={() => navigate(-1)} className="mt-4">
              Go Back
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-4 space-y-4">
        {/* Header with Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="p-2"
            >
              <ArrowLeft size={20} />
            </Button>
            <div>
              <h1 className="text-xl font-bold">{beatData.beat_name}</h1>
              <p className="text-sm text-muted-foreground">Beat Details & Performance</p>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditOpen(true)}
              className="flex items-center gap-2"
            >
              <Edit2 size={16} />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAIInsights}
              className="flex items-center gap-2 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20"
            >
              <Sparkles size={16} className="text-primary" />
              AI Insights
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteClick}
              className="flex items-center gap-2"
            >
              <Trash2 size={16} />
              Delete
            </Button>
          </div>
        </div>

        {/* Key Performance Highlights */}
        <Card className="shadow-card bg-gradient-to-br from-primary/5 to-primary/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap size={20} className="text-primary" />
              Key Performance Highlights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="text-center p-3 bg-background rounded-lg shadow-sm">
                <IndianRupee className="h-5 w-5 mx-auto mb-1 text-green-600" />
                <div className="text-lg font-bold text-green-600">Rs. {(performanceStats.totalRevenue / 1000).toFixed(1)}K</div>
                <div className="text-xs text-muted-foreground">Total Revenue (3M)</div>
              </div>
              <div className="text-center p-3 bg-background rounded-lg shadow-sm">
                <Package className="h-5 w-5 mx-auto mb-1 text-blue-600" />
                <div className="text-lg font-bold text-blue-600">Rs. {performanceStats.avgOrderValue.toFixed(0)}</div>
                <div className="text-xs text-muted-foreground">Avg Order Value</div>
              </div>
              <div className="text-center p-3 bg-background rounded-lg shadow-sm">
                <Users className="h-5 w-5 mx-auto mb-1 text-purple-600" />
                <div className="text-lg font-bold text-purple-600">{beatData.retailers.length}</div>
                <div className="text-xs text-muted-foreground">Total Retailers</div>
              </div>
              <div className="text-center p-3 bg-background rounded-lg shadow-sm">
                <Calendar className="h-5 w-5 mx-auto mb-1 text-orange-600" />
                <div className="text-lg font-bold text-orange-600">{performanceStats.totalVisits}</div>
                <div className="text-xs text-muted-foreground">Beat Visits (3M)</div>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="text-center p-3 bg-background rounded-lg shadow-sm cursor-help">
                      <Target className="h-5 w-5 mx-auto mb-1 text-cyan-600" />
                      <div className="text-sm font-bold text-cyan-600">
                        {performanceStats.currentMonthConversion.toFixed(0)}% / {performanceStats.previousMonthConversion.toFixed(0)}%
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        Visit Conversion
                        <Info size={10} className="text-muted-foreground" />
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs max-w-48">% of visits that were productive (completed with orders) - Current month vs Previous month</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="text-center p-3 bg-background rounded-lg shadow-sm">
                <TrendingUp className="h-5 w-5 mx-auto mb-1 text-emerald-600" />
                <div className={`text-lg font-bold ${performanceStats.growthRate >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                  {performanceStats.growthRate >= 0 ? '+' : ''}{performanceStats.growthRate.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">Growth Rate</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Health Insight Modal */}
        <BeatInsightModal
          isOpen={showHealthInsight}
          onClose={() => setShowHealthInsight(false)}
          beatId={beatData?.id || beatData?.beat_id || ''}
          beatName={beatData?.beat_name || ''}
        />

        {/* Target vs Actual Section */}
        <TargetVsActualCard entityType="beat" entityId={beatData?.id || ''} beatTextId={beatData?.beat_id} userId={user?.id} />

        {/* Beat Info Card */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Beat Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Beat Name</p>
                <p className="font-semibold">{beatData.beat_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Category (Growth Based)</p>
                <Badge className={getCategoryColor(getCategoryByGrowth(performanceStats.growthRate))}>
                  {getCategoryByGrowth(performanceStats.growthRate)}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Retailers</p>
                <p className="font-semibold">{beatData.retailers.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="font-semibold">{new Date(beatData.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Visited</p>
                <p className="font-semibold">
                  {performanceStats.lastVisitedDate 
                    ? new Date(performanceStats.lastVisitedDate).toLocaleDateString() 
                    : 'Never'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Lifetime Value</p>
                <p className="font-semibold text-green-600">Rs. {performanceStats.lifetimeValue.toLocaleString()}</p>
              </div>
              {beatData.territory_name && (
                <div>
                  <p className="text-xs text-muted-foreground">Territory</p>
                  <p className="font-semibold">{beatData.territory_name}</p>
                </div>
              )}
              {beatData.travel_allowance !== undefined && beatData.travel_allowance !== null && Number(beatData.travel_allowance) > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Travel Allowance</p>
                  <p className="font-semibold">Rs. {Number(beatData.travel_allowance).toLocaleString()}</p>
                </div>
              )}
              {beatData.average_km !== undefined && beatData.average_km !== null && Number(beatData.average_km) > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Average Distance</p>
                  <p className="font-semibold">{Number(beatData.average_km)} km</p>
                </div>
              )}
              {beatData.average_time_minutes !== undefined && beatData.average_time_minutes !== null && Number(beatData.average_time_minutes) > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Avg Time</p>
                  <p className="font-semibold">{Number(beatData.average_time_minutes)} mins</p>
                </div>
              )}
            </div>
            
            {/* Recurring Info */}
            {metrics.isRecurring && (
              <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20 mt-3">
                <CalendarDays className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary">Recurring Schedule: {metrics.recurringDetails}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Beat Performance Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Orders by Month */}
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart size={20} className="text-primary" />
                Orders by Month (Last 6M)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={beatChartData.ordersByMonth}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" fontSize={12} />
                    <YAxis fontSize={12} />
                    <RechartsTooltip formatter={(value: number) => [`Rs. ${value.toLocaleString()}`, 'Revenue']} />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Sales by SKU */}
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Package size={20} className="text-primary" />
                Sales by Product SKU (Last 6M)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {beatChartData.salesBySKU.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={beatChartData.salesBySKU}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        labelLine={false}
                      >
                        {beatChartData.salesBySKU.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={`hsl(${index * 36}, 70%, 50%)`} />
                        ))}
                      </Pie>
                      <RechartsTooltip formatter={(value: number) => [`Rs. ${value.toLocaleString()}`, 'Value']} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    No product sales data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Top 20 Retailers Revenue */}
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users size={20} className="text-primary" />
                Top 20 Retailers by Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 overflow-auto">
                {beatChartData.topRetailers.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(264, beatChartData.topRetailers.length * 30)}>
                    <RechartsBarChart data={beatChartData.topRetailers} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" fontSize={10} tickFormatter={(v) => `Rs.${(v/1000).toFixed(0)}K`} />
                      <YAxis type="category" dataKey="name" fontSize={10} width={80} />
                      <RechartsTooltip formatter={(value: number) => [`Rs. ${value.toLocaleString()}`, 'Revenue']} />
                      <Bar dataKey="revenue" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    No retailer revenue data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Retailers Added by Month */}
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Store size={20} className="text-primary" />
                New Retailers by Month (Last 6M)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={beatChartData.retailersByMonth}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" fontSize={12} />
                    <YAxis fontSize={12} allowDecimals={false} />
                    <RechartsTooltip />
                    <Bar dataKey="count" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} name="New Retailers" />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* SWOT Analysis */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Target size={20} className="text-primary" />
              SWOT Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Strengths */}
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="h-5 w-5 text-green-600" />
                  <h3 className="font-semibold text-green-700 dark:text-green-400">Strengths</h3>
                </div>
                <ul className="space-y-2">
                  {swot.strengths.length > 0 ? swot.strengths.map((item, i) => (
                    <li key={i} className="text-sm text-green-700 dark:text-green-300 flex items-start gap-2">
                      <span className="text-green-500 mt-1">•</span>
                      {item}
                    </li>
                  )) : (
                    <li className="text-sm text-muted-foreground italic">No significant strengths identified yet</li>
                  )}
                </ul>
              </div>

              {/* Weaknesses */}
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  <h3 className="font-semibold text-red-700 dark:text-red-400">Weaknesses</h3>
                </div>
                <ul className="space-y-2">
                  {swot.weaknesses.length > 0 ? swot.weaknesses.map((item, i) => (
                    <li key={i} className="text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                      <span className="text-red-500 mt-1">•</span>
                      {item}
                    </li>
                  )) : (
                    <li className="text-sm text-muted-foreground italic">No significant weaknesses identified</li>
                  )}
                </ul>
              </div>

              {/* Opportunities */}
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="h-5 w-5 text-blue-600" />
                  <h3 className="font-semibold text-blue-700 dark:text-blue-400">Opportunities</h3>
                </div>
                <ul className="space-y-2">
                  {swot.opportunities.map((item, i) => (
                    <li key={i} className="text-sm text-blue-700 dark:text-blue-300 flex items-start gap-2">
                      <span className="text-blue-500 mt-1">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Threats */}
              <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  <h3 className="font-semibold text-orange-700 dark:text-orange-400">Threats</h3>
                </div>
                <ul className="space-y-2">
                  {swot.threats.map((item, i) => (
                    <li key={i} className="text-sm text-orange-700 dark:text-orange-300 flex items-start gap-2">
                      <span className="text-orange-500 mt-1">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Beat Visit History Calendar */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarDays size={20} className="text-primary" />
              Visit History Calendar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BeatVisitCalendar beatId={beatData.beat_id} beatName={beatData.beat_name} />
          </CardContent>
        </Card>

        {/* Retailers List */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Store size={20} className="text-primary" />
                Retailers in this Beat ({beatData.retailers.length})
              </CardTitle>
              <div className="flex items-center gap-2">
                {beatData.retailers.length > 0 && (
                  <>
                    <div className="relative w-full sm:w-48">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={16} />
                      <input
                        type="text"
                        placeholder="Search retailers..."
                        value={retailerSearch}
                        onChange={(e) => setRetailerSearch(e.target.value)}
                        className="w-full h-9 pl-9 pr-3 bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-md text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                      />
                    </div>
                    <BeatRetailerExport 
                      beatName={beatData.beat_name} 
                      retailers={beatData.retailers} 
                    />
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {beatData.retailers.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No retailers assigned to this beat</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => navigate('/add-retailer')}
                >
                  Add Retailers
                </Button>
              </div>
            ) : filteredRetailers.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No retailers match your search</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRetailers.map((retailer) => (
                  <Card key={retailer.id} className="border-l-4 border-l-primary">
                    <CardContent className="p-4">
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 
                              className="font-semibold text-primary cursor-pointer hover:underline"
                              onClick={() => {
                                setSelectedRetailer({
                                  id: retailer.id,
                                  name: retailer.name,
                                  address: retailer.address,
                                  phone: retailer.phone || null,
                                  category: retailer.category || null,
                                  priority: retailer.priority || null,
                                  beat_id: beatData?.beat_id || '',
                                  status: null,
                                  created_at: '',
                                  last_visit_date: retailer.last_visit_date || null,
                                  order_value: retailer.order_value || null
                                });
                                setShowRetailerModal(true);
                              }}
                            >
                              {retailer.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                              {retailer.category && (
                                <Badge variant="outline">{retailer.category}</Badge>
                              )}
                              {retailer.priority && (
                                <Badge className={getPriorityColor(retailer.priority)}>
                                  {retailer.priority}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-right space-y-1">
                            {retailer.order_value && (
                              <div>
                                <p className="text-xs text-muted-foreground">Last order value</p>
                                <p className="font-semibold text-primary">₹{retailer.order_value.toLocaleString()}</p>
                              </div>
                            )}
                            {retailer.fyOrderValue !== undefined && retailer.fyOrderValue > 0 && (
                              <div>
                                <p className="text-xs text-muted-foreground">Order value this FY</p>
                                <p className="font-semibold text-green-600">₹{retailer.fyOrderValue.toLocaleString()}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-start gap-2 text-sm text-muted-foreground">
                            <MapPin size={14} className="mt-0.5 flex-shrink-0" />
                            <span>{retailer.address}</span>
                          </div>
                          
                          {retailer.phone && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Phone size={14} />
                              <span>{retailer.phone}</span>
                            </div>
                          )}
                          
                          {retailer.last_visit_date && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar size={12} />
                              <span>Last visit: {new Date(retailer.last_visit_date).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity History (Audit Timeline) */}
        <Card>
          <CardContent className="p-0">
            <BeatAuditTimeline beatId={beatData.beat_id} />
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={() => navigate('/add-retailer')}>
            Add Retailers
          </Button>
          <Button onClick={() => navigate('/visits/retailers')}>
            Plan Visits
          </Button>
        </div>
      </div>

      {/* Edit Beat Modal */}
      {isEditOpen && beatData && (
        <EditBeatModal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          beat={{
            id: beatData.beat_id,
            name: beatData.beat_name,
            travel_allowance: beatData.travel_allowance,
            average_km: beatData.average_km,
            average_time_minutes: beatData.average_time_minutes
          }}
          onBeatUpdated={() => {
            setIsEditOpen(false);
            setRefreshKey(k => k + 1);
          }}
        />
      )}

      {/* Analytics Modal */}
      {showAnalytics && beatData && user && (
        <BeatAnalyticsModal
          isOpen={showAnalytics}
          onClose={() => setShowAnalytics(false)}
          beatId={beatData.beat_id}
          beatName={beatData.beat_name}
          userId={user.id}
        />
      )}

      {/* Retailer Detail Modal */}
      <RetailerDetailModal
        isOpen={showRetailerModal}
        onClose={() => {
          setShowRetailerModal(false);
          setSelectedRetailer(null);
        }}
        retailer={selectedRetailer}
        onSuccess={() => {
          setShowRetailerModal(false);
          setSelectedRetailer(null);
          setRefreshKey(k => k + 1);
        }}
      />

      {/* Beat Delete Dialog */}
      <BeatDeleteDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        beatName={beatData?.beat_name || null}
        affectedRetailerCount={beatData?.retailers?.length || 0}
        upcomingVisitsCount={upcomingVisitsCount}
        pendingOrdersCount={pendingOrdersCount}
        availableBeats={availableBeats}
        availableUsers={availableUsers}
        onConfirm={handleConfirmDelete}
        isLoading={isDeleting}
      />
    </Layout>
  );
};
