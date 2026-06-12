import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { useManagedInterval } from "@/utils/intervalManager";
import { Download, Share, FileText, Clock, MapPin, CalendarIcon, ExternalLink, Users, X, CreditCard, Wallet, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, parse } from "date-fns";
import { offlineStorage, STORES } from "@/lib/offlineStorage";
import { loadMyVisitsSnapshot } from "@/lib/myVisitsSnapshot";
import { isSlowConnection } from "@/utils/internetSpeedCheck";
import { getLocalTodayDate } from "@/utils/dateUtils";
import { getOrdersForDate } from "@/utils/ordersForDate";
// jspdf, jspdf-autotable loaded dynamically in handler
import { downloadPDF } from "@/utils/fileDownloader";
import { ReportGenerator } from "@/components/ReportGenerator";
import { calculateJointVisitScore } from "@/components/JointSalesFeedbackModal";
import { JointSalesFeedbackViewModal } from "@/components/JointSalesFeedbackViewModal";
import { useAuth } from "@/hooks/useAuth";
import { FeedbackSummarySection } from "@/components/FeedbackSummarySection";
import { UserSelector } from "@/components/UserSelector";
import { useSubordinates } from "@/hooks/useSubordinates";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

type DateFilterType = 'today' | 'week' | 'lastWeek' | 'month' | 'custom' | 'dateRange';

export const TodaySummary = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef(false);
  const { user } = useAuth();
  const isAdmin = false; // No longer used for gating; kept for backward compat in data loading
  
  // Hierarchical user filter (for managers)
  const { isManager, subordinateIds, subordinates } = useSubordinates();
  const [managerSelectedUserId, setManagerSelectedUserId] = useState<string>('self');
  
  // Get selected user's name for report generation
  const selectedUserName = useMemo(() => {
    if (managerSelectedUserId === 'self' || managerSelectedUserId === user?.id) {
      return 'My Data';
    }
    if (managerSelectedUserId === 'all') {
      return 'All Team';
    }
    const sub = subordinates.find(s => s.subordinate_user_id === managerSelectedUserId);
    return sub?.full_name || 'Unknown';
  }, [managerSelectedUserId, user?.id, subordinates]);
  
  // Date filtering state
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(),
    to: new Date()
  });
  const [filterType, setFilterType] = useState<DateFilterType>('today');
  const [calendarOpen, setCalendarOpen] = useState(false);
  
  // Real data state
  const [summaryData, setSummaryData] = useState({
    date: selectedDate.toLocaleDateString('en-IN', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }),
    beat: "Loading...",
    beatNames: [] as string[],
    startTime: "Loading...",
    endTime: "Loading...",
    plannedVisits: 0,
    completedVisits: 0,
    productiveVisits: 0,
    unproductiveVisits: 0,
    totalRetailers: 0,
    totalOrders: 0,
    totalOrderValue: 0,
    avgOrderValue: 0,
    totalKgSold: 0,
    totalKgSoldFormatted: "0 KG",
    visitEfficiency: 0,
    orderConversionRate: 0,
    distanceCovered: 0,
    travelTime: "0h 0m",
  });

  const [visitBreakdown, setVisitBreakdown] = useState([
    { status: "Planned", count: 0, color: "primary" },
    { status: "Productive", count: 0, color: "success" },
    { status: "Unproductive", count: 0, color: "destructive" },
    { status: "Pending", count: 0, color: "warning" }
  ]);

  const [topRetailers, setTopRetailers] = useState<Array<{ name: string; orderValue: number; location: string }>>([]);
  const [productSales, setProductSales] = useState<Array<{ name: string; kgSold: number; kgFormatted: string; revenue: number }>>([]);
  const [orders, setOrders] = useState<Array<{ retailer: string; amount: number; kgSold: number; kgFormatted: string; creditAmount: number; cashInHand: number; paymentMethod: string }>>([]);
  const [visitsByStatus, setVisitsByStatus] = useState<Record<string, Array<{ retailer: string; note?: string; totalValue?: number; beatName?: string; address?: string; planDate?: string }>>>({});
  const [productGroupedOrders, setProductGroupedOrders] = useState<Array<{ product: string; kgSold: number; kgFormatted: string; value: number; orders: number }>>([]);
  const [showAllProducts, setShowAllProducts] = useState(false);
  
  // Joint Sales Data
  const [jointSalesData, setJointSalesData] = useState<{
    totalVisits: number;
    retailersCovered: number;
    memberName: string;
    orderIncrease: number;
    avgScore: number;
    feedback: Array<{ retailerId: string; retailerName: string; impact: string; orderIncrease: number; score: number; feedbackDate: string }>;
  } | null>(null);
  
  // Retailer-based report data
  const [retailerReportData, setRetailerReportData] = useState<Array<{
    retailerName: string;
    address: string;
    phoneNumber: string;
    visitStatus: string;
    orderPerKG: number;
    totalValue: number;
    invoiceDate?: string;
    invoiceNumber?: string;
    productName?: string;
    paymentMode?: string;
  }>>([]);

  // General report data (day-by-day summary)
  const [generalReportData, setGeneralReportData] = useState<Array<{
    date: string;
    day: string;
    beatName: string;
    plannedVisits: number;
    actualVisits: number;
    productiveVisits: number;
    unproductiveVisits: number;
    orderValue: number;
    firstCheckIn: string;
    lastCheckOut: string;
    totalMarketHours: string;
    newRetailersAdded: number;
  }>>([]);

  const [pointsEarnedToday, setPointsEarnedToday] = useState(0);
  const [completedActivitiesCount, setCompletedActivitiesCount] = useState(0);
  
  // Payment method breakdown data for pie chart
  const [paymentMethodBreakdown, setPaymentMethodBreakdown] = useState<Array<{
    method: string;
    amount: number;
    count: number;
    color: string;
  }>>([]);
  
  // First and last retailer visit data for Time at Retailers modal
  const [firstLastRetailerVisit, setFirstLastRetailerVisit] = useState<{
    first: { retailerName: string; time: string } | null;
    last: { retailerName: string; time: string } | null;
  }>({ first: null, last: null });
  const [timeAtRetailersModalOpen, setTimeAtRetailersModalOpen] = useState(false);

  // Dialog state and data sources for details
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState<string>("");
  const [dialogContentType, setDialogContentType] = useState<"orders" | "visits" | "efficiency" | "products" | "kgBreakdown" | "retailerValue">("orders");
  const [dialogFilter, setDialogFilter] = useState<string | null>(null);
  
  // Joint Sales Feedback View Modal state
  const [jointFeedbackViewOpen, setJointFeedbackViewOpen] = useState(false);
  const [selectedJointFeedback, setSelectedJointFeedback] = useState<{ retailerId: string; retailerName: string; feedbackDate: string } | null>(null);

  // Handle URL query parameter for date - default to Today if no date or if date is today
  useEffect(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      try {
        const parsedDate = parse(dateParam, 'yyyy-MM-dd', new Date());
        const today = new Date();
        // Check if the date is today
        if (format(parsedDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) {
          handleDateFilterChange('today');
        } else {
          handleDateFilterChange('custom', parsedDate);
        }
      } catch (error) {
        console.error('Error parsing date from URL:', error);
        handleDateFilterChange('today');
      }
    } else {
      // No date param - default to today
      handleDateFilterChange('today');
    }
  }, [searchParams]);

  // Use primitive values for dependencies to avoid infinite loops
  const dateRangeKey = `${dateRange.from.toISOString()}-${dateRange.to.toISOString()}`;
  const managerFilterKey = isManager ? managerSelectedUserId : 'not-manager';
  
  useEffect(() => {
    // Reset initial load flag when filter changes to show loading state
    initialLoadDone.current = false;
    fetchTodaysData();
  }, [dateRangeKey, filterType, managerFilterKey]);

  // Use managed interval for auto-refresh (pauses when app is hidden)
  // Increased from 30s to 60s to reduce CPU usage
  useManagedInterval(
    'today-summary-refresh',
    useCallback(() => {
      if (navigator.onLine) {
        console.log('⏰ [SUMMARY] 60s auto-refresh for today');
        fetchTodaysData(true); // Background refresh
      }
    }, []),
    60000, // Increased to 60 seconds
    { enabled: filterType === 'today', runWhenHidden: false }
  );

  // SIMPLIFIED: Event listeners for immediate UI updates only (no sync event listeners)
  // Per event-based sync architecture: syncComplete and visitDataChanged should NOT trigger refreshes
  useEffect(() => {
    // Listen for immediate order updates (visitStatusChanged includes order value)
    // This is a SURGICAL update - only update specific counters, no full refresh
    const handleVisitStatusChanged = (event: CustomEvent) => {
      const detail = event.detail;
      
      // If we have an order, update summary counters immediately (no full refresh)
      if (detail?.orderValue && filterType === 'today') {
        console.log('📢 [SUMMARY] visitStatusChanged - surgical update', detail);
        setSummaryData(prev => ({
          ...prev,
          totalOrderValue: (prev.totalOrderValue || 0) + Math.round(Number(detail.orderValue) || 0),
          totalOrders: (prev.totalOrders || 0) + 1,
          productiveVisits: (prev.productiveVisits || 0) + 1,
          completedVisits: (prev.completedVisits || 0) + 1
        }));
        // NO background refresh - this was the surgical update
      }
      // For non-order status changes, no refresh needed - UI already reflects local state
    };

    // Listen for globalDataRefresh (e.g. after order cancellation) — do full re-fetch
    const handleGlobalDataRefresh = () => {
      console.log('📢 [SUMMARY] globalDataRefresh - full re-fetch');
      if (filterType === 'today') {
        fetchTodaysData(true);
      }
    };
    
    window.addEventListener('visitStatusChanged', handleVisitStatusChanged as EventListener);
    window.addEventListener('globalDataRefresh', handleGlobalDataRefresh);
    
    return () => {
      window.removeEventListener('visitStatusChanged', handleVisitStatusChanged as EventListener);
      window.removeEventListener('globalDataRefresh', handleGlobalDataRefresh);
    };
  }, [filterType]);

  // Real-time subscription for points updates
  useEffect(() => {
    if (filterType !== 'today') return;

    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel('points-updates')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'gamification_points',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            console.log('New points earned:', payload);
            setPointsEarnedToday(prev => prev + (payload.new.points || 0));
          }
        )
        .subscribe();
    };

    setupSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [filterType]);

  const handleDateFilterChange = (type: DateFilterType, date?: Date, rangeTo?: Date) => {
    setFilterType(type);
    
    const now = new Date();
    
    switch (type) {
      case 'today':
        setDateRange({ from: now, to: now });
        setSelectedDate(now);
        break;
      case 'week':
        setDateRange({ 
          from: startOfWeek(now, { weekStartsOn: 1 }), 
          to: endOfWeek(now, { weekStartsOn: 1 }) 
        });
        setSelectedDate(now);
        break;
      case 'lastWeek':
        const lastWeek = subWeeks(now, 1);
        setDateRange({ 
          from: startOfWeek(lastWeek, { weekStartsOn: 1 }), 
          to: endOfWeek(lastWeek, { weekStartsOn: 1 }) 
        });
        setSelectedDate(lastWeek);
        break;
      case 'month':
        setDateRange({ 
          from: startOfMonth(now), 
          to: endOfMonth(now) 
        });
        setSelectedDate(now);
        break;
      case 'custom':
        if (date) {
          setDateRange({ from: date, to: date });
          setSelectedDate(date);
        }
        break;
      case 'dateRange':
        if (date && rangeTo) {
          setDateRange({ from: date, to: rangeTo });
          setSelectedDate(date);
        }
        break;
    }
  };

  const fetchTodaysData = async (isBackgroundRefresh = false) => {
    try {
      // Only show loading spinner on initial load, not background refreshes
      if (!isBackgroundRefresh && !initialLoadDone.current) {
        setLoading(true);
      }
      const { data: { user: authUser } } = await supabase.auth.getUser();
      
      if (!authUser) return;

      // Determine which user IDs to fetch data for
      let targetUserIds: string[];
      
      console.log('[FETCH DEBUG] managerSelectedUserId:', managerSelectedUserId);
      console.log('[FETCH DEBUG] isManager:', isManager);
      console.log('[FETCH DEBUG] subordinateIds:', subordinateIds);
      
      if (isManager) {
        // Manager (including admin managers) using hierarchy filter
        if (managerSelectedUserId === 'all') {
          // All team: self + all subordinates
          targetUserIds = [authUser.id, ...subordinateIds];
        } else if (managerSelectedUserId === 'self' || managerSelectedUserId === authUser.id) {
          // Only self
          targetUserIds = [authUser.id];
        } else {
          // Specific subordinate selected
          targetUserIds = [managerSelectedUserId];
        }
      } else {
        // Regular user - only self
        targetUserIds = [authUser.id];
      }
      
      console.log('[FETCH DEBUG] targetUserIds (final):', targetUserIds);

      // Check for slow/offline - load from unified orders source
      const isTodayFilter = filterType === 'today';
      const targetDate = format(dateRange.from, 'yyyy-MM-dd');
      
      // Use unified orders source for today filter (merges DB + offline + snapshot)
      let todayOrders: any[] = [];
      
      if (isTodayFilter && targetUserIds.length === 1 && targetUserIds[0] === authUser.id) {
        // For single user "today" filter, use unified orders source
        console.log('📊 [SUMMARY] Using unified orders source for today');
        const ordersResult = await getOrdersForDate(authUser.id, targetDate, {
          includeSnapshot: true,
          forceOfflineFirst: false
        });
        todayOrders = ordersResult.orders;
        console.log(`📊 [SUMMARY] Got ${ordersResult.totalCount} orders from unified source`, ordersResult.sourceBreakdown);
      } else {
        // For date ranges or multiple users, fetch from DB directly
        const orderFromDate = new Date(dateRange.from);
        orderFromDate.setHours(0, 0, 0, 0);
        const orderToDate = new Date(dateRange.to);
        orderToDate.setHours(23, 59, 59, 999);
        
        if (navigator.onLine) {
          const { data: fetchedOrders } = await supabase
            .from('orders')
            .select(`
              *,
              order_items!order_items_order_id_fkey(*)
            `)
            .in('user_id', targetUserIds)
            .eq('status', 'confirmed')
            .gte('created_at', orderFromDate.toISOString())
            .lte('created_at', orderToDate.toISOString());
          
          todayOrders = fetchedOrders || [];
          console.log(`📡 [SUMMARY] Fetched ${todayOrders.length} orders from DB for date range`);
        }
      }

      // Fetch attendance data for the selected period
      let attendanceQuery = supabase
        .from('attendance')
        .select('*')
        .in('user_id', targetUserIds);

      if (filterType === 'today' || filterType === 'custom') {
        attendanceQuery = attendanceQuery.eq('date', targetDate);
      } else {
        const fromDate = format(dateRange.from, 'yyyy-MM-dd');
        const toDate = format(dateRange.to, 'yyyy-MM-dd');
        attendanceQuery = attendanceQuery.gte('date', fromDate).lte('date', toDate);
      }

      const { data: attendanceData } = await attendanceQuery;

      // Fetch van_stock for distance (start_km and end_km)
      let vanStockQuery = supabase
        .from('van_stock')
        .select('start_km, end_km, total_km, stock_date, user_id')
        .in('user_id', targetUserIds);

      if (filterType === 'today' || filterType === 'custom') {
        vanStockQuery = vanStockQuery.eq('stock_date', targetDate);
      } else {
        const fromDate = format(dateRange.from, 'yyyy-MM-dd');
        const toDate = format(dateRange.to, 'yyyy-MM-dd');
        vanStockQuery = vanStockQuery.gte('stock_date', fromDate).lte('stock_date', toDate);
      }

      const { data: vanStockData } = await vanStockQuery;

      // Fetch retailer_visit_logs for time at retailers (first to last visit time)
      let visitLogsQuery = supabase
        .from('retailer_visit_logs')
        .select('time_spent_seconds, retailer_id, visit_date, start_time, end_time, user_id')
        .in('user_id', targetUserIds)
        .order('start_time', { ascending: true });

      if (filterType === 'today' || filterType === 'custom') {
        visitLogsQuery = visitLogsQuery.eq('visit_date', targetDate);
      } else {
        const fromDate = format(dateRange.from, 'yyyy-MM-dd');
        const toDate = format(dateRange.to, 'yyyy-MM-dd');
        visitLogsQuery = visitLogsQuery.gte('visit_date', fromDate).lte('visit_date', toDate);
      }

      const { data: visitLogsData } = await visitLogsQuery;

      // Determine date query based on filter type
      let visitsQuery = supabase
        .from('visits')
        .select('*')
        .in('user_id', targetUserIds);

      if (filterType === 'today' || filterType === 'custom') {
        visitsQuery = visitsQuery.eq('planned_date', targetDate);
      } else {
        // For week/lastWeek/month, use date range
        const fromDate = format(dateRange.from, 'yyyy-MM-dd');
        const toDate = format(dateRange.to, 'yyyy-MM-dd');
        visitsQuery = visitsQuery.gte('planned_date', fromDate).lte('planned_date', toDate);
      }

      // Execute visits query first
      const { data: visits } = await visitsQuery;

      // Note: todayOrders was already populated by unified orders source above

      // Fetch beat plans for the date range (moved earlier to get retailer IDs)
      let beatPlansQuery = supabase
        .from('beat_plans')
        .select('*')
        .in('user_id', targetUserIds);

      if (filterType === 'today' || filterType === 'custom') {
        const targetDate = format(dateRange.from, 'yyyy-MM-dd');
        beatPlansQuery = beatPlansQuery.eq('plan_date', targetDate);
      } else {
        const fromDate = format(dateRange.from, 'yyyy-MM-dd');
        const toDate = format(dateRange.to, 'yyyy-MM-dd');
        beatPlansQuery = beatPlansQuery.gte('plan_date', fromDate).lte('plan_date', toDate);
      }

      const { data: beatPlans } = await beatPlansQuery;
      const beatPlan = beatPlans && beatPlans.length > 0 ? beatPlans[0] : null;

      // Get all retailer IDs from beat plans
      // For date range views (week/month), count each retailer-date combo as a separate planned visit
      // For single day views, just count unique retailers
      const beatPlanRetailerIds: string[] = [];
      const beatPlanRetailersByDate: Array<{ retailerId: string; planDate: string; beatName: string }> = [];
      
      // Always fetch ALL retailers from the beats by beat_id for accurate "Planned" count
      const beatIds = beatPlans?.map(bp => bp.beat_id).filter(Boolean) || [];
      
      if (beatIds.length > 0) {
        // Fetch ALL retailers that belong to these beats
        const { data: beatRetailers } = await supabase
          .from('retailers')
          .select('id, name, beat_id, user_id')
          .in('user_id', targetUserIds)
          .in('beat_id', beatIds);
        
        if (beatRetailers && beatRetailers.length > 0) {
          beatPlans?.forEach(bp => {
            const retailersForBeat = beatRetailers.filter(r => r.beat_id === bp.beat_id);
            retailersForBeat.forEach(r => {
              // For date range views, include each retailer-date combination
              // For single day views, deduplicate by retailer ID
              const key = `${r.id}_${bp.plan_date}`;
              const alreadyExists = beatPlanRetailersByDate.some(
                item => item.retailerId === r.id && item.planDate === bp.plan_date
              );
              
              if (!alreadyExists) {
                if (!beatPlanRetailerIds.includes(r.id)) {
                  beatPlanRetailerIds.push(r.id);
                }
                beatPlanRetailersByDate.push({
                  retailerId: r.id,
                  planDate: bp.plan_date,
                  beatName: bp.beat_name
                });
              }
            });
          });
        }
      }
      
      // Combine retailer IDs from visits and beat plans
      const visitRetailerIds = visits?.map(v => v.retailer_id) || [];
      const allRetailerIds = [...new Set([...visitRetailerIds, ...beatPlanRetailerIds])];
      
      let retailers: any[] = [];
      if (allRetailerIds.length > 0) {
        const { data } = await supabase
          .from('retailers')
          .select('id, name, address, phone')
          .in('id', allRetailerIds);
        retailers = data || [];
      }

      // Fetch points earned for the date range
      const pointsFromDate = new Date(dateRange.from);
      pointsFromDate.setHours(0, 0, 0, 0);
      const pointsToDate = new Date(dateRange.to);
      pointsToDate.setHours(23, 59, 59, 999);
      
      console.log('Fetching points from', pointsFromDate.toISOString(), 'to', pointsToDate.toISOString());
      
      const { data: pointsData, error: pointsError } = await supabase
        .from('gamification_points')
        .select('points, earned_at')
        .in('user_id', targetUserIds)
        .gte('earned_at', pointsFromDate.toISOString())
        .lte('earned_at', pointsToDate.toISOString());
      
      if (pointsError) {
        console.error('Error fetching points:', pointsError);
      }
      
      console.log('Points data fetched:', pointsData);
      const totalPointsEarned = pointsData?.reduce((sum, item) => sum + item.points, 0) || 0;
      console.log('Total points earned:', totalPointsEarned);
      setPointsEarnedToday(totalPointsEarned);
      
      // Fetch ALL joint sales feedback for the user in the date range
      // This includes both beat plan-linked and independently recorded feedback
      const jointFromDate = format(dateRange.from, 'yyyy-MM-dd');
      const jointToDate = format(dateRange.to, 'yyyy-MM-dd');
      
      const { data: jointSalesFeedback } = await supabase
        .from('joint_sales_feedback')
        .select('*, retailers(name)')
        .in('fse_user_id', targetUserIds)
        .gte('feedback_date', jointFromDate)
        .lte('feedback_date', jointToDate);
      
      if (jointSalesFeedback && jointSalesFeedback.length > 0) {
        // Get unique manager IDs and fetch their names
        const uniqueManagerIds = [...new Set(jointSalesFeedback.map(f => f.manager_id).filter(Boolean))];
        
        let memberNames: string[] = [];
        if (uniqueManagerIds.length > 0) {
          const { data: memberProfiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', uniqueManagerIds);
          
          memberNames = memberProfiles?.map(p => p.full_name || 'Unknown') || [];
        }
        
        const totalOrderIncrease = jointSalesFeedback.reduce((sum, f) => sum + (f.order_increase_amount || 0), 0);
        const uniqueRetailers = new Set(jointSalesFeedback.map(f => f.retailer_id)).size;
        
        // Create a map of manager names for feedback display
        const managerNameMap = new Map();
        if (uniqueManagerIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', uniqueManagerIds);
          profiles?.forEach(p => managerNameMap.set(p.id, p.full_name || 'Unknown'));
        }
        
        // Calculate scores for each feedback
        const feedbackWithScores = jointSalesFeedback.map(f => ({
          retailerId: f.retailer_id,
          retailerName: (f.retailers as any)?.name || 'Unknown',
          impact: f.joint_sales_impact || 'No impact notes',
          orderIncrease: f.order_increase_amount || 0,
          score: calculateJointVisitScore(f),
          feedbackDate: f.feedback_date
        }));
        
        const avgScore = feedbackWithScores.length > 0 
          ? Math.round((feedbackWithScores.reduce((sum, f) => sum + f.score, 0) / feedbackWithScores.length) * 10) / 10
          : 0;
        
        setJointSalesData({
          totalVisits: jointSalesFeedback.length,
          retailersCovered: uniqueRetailers,
          memberName: memberNames.length > 0 ? memberNames.join(', ') : 'Unknown',
          orderIncrease: totalOrderIncrease,
          avgScore,
          feedback: feedbackWithScores
        });
      } else {
        setJointSalesData(null);
      }
      
      // Collect all unique beat names
      const uniqueBeatNames = beatPlans 
        ? Array.from(new Set(beatPlans.map(bp => bp.beat_name).filter(Boolean)))
        : [];
      const beatNamesDisplay = uniqueBeatNames.length > 0 ? uniqueBeatNames : ['No beat planned'];

      // Create retailer lookup map
      const retailerMap = new Map();
      retailers?.forEach(retailer => {
        retailerMap.set(retailer.id, retailer);
      });

      // Process visits data - track by date for accurate planned count
      // Create a map of visited retailer+date combos with their status
      const visitedByDateMap = new Map<string, string>();
      visits?.forEach(v => {
        if (v.retailer_id && v.planned_date) {
          visitedByDateMap.set(`${v.retailer_id}_${v.planned_date}`, v.status);
        }
      });
      
      // Get set of planned retailer+date combinations for accurate counting
      const plannedRetailerDateSet = new Set(
        beatPlanRetailersByDate.map(bp => `${bp.retailerId}_${bp.planDate}`)
      );
      
      // All visits filtered by status (for display purposes)
      const allProductiveVisits = visits?.filter(v => v.status === 'productive') || [];
      const pendingVisitsFromDb = visits?.filter(v => v.status === 'planned') || [];
      const allClosedVisits = visits?.filter(v => v.status === 'store_closed') || [];
      const allUnproductiveVisits = visits?.filter(v => v.status === 'unproductive') || [];
      
      // Count UNIQUE RETAILERS per status category, ensuring no double-counting
      // Priority: productive (visit OR order) > unproductive > store_closed > planned
      // A retailer can only be in ONE category based on their best/final status
      // CRITICAL FIX: Use retailer_id only (not retailer_id_date) since queries already filter by date
      const productiveRetailerIds = new Set<string>();
      const unproductiveRetailerIds = new Set<string>();
      const closedRetailerIds = new Set<string>();
      
      // CRITICAL: Get retailers with confirmed orders (these are ALWAYS productive)
      todayOrders?.forEach(order => {
        if (order.retailer_id) {
          productiveRetailerIds.add(order.retailer_id);
        }
      });
      
      // Also add retailers from productive visits
      allProductiveVisits.forEach(v => {
        if (v.retailer_id) {
          productiveRetailerIds.add(v.retailer_id);
        }
      });
      
      // Collect unproductive retailers (excluding productive ones)
      allUnproductiveVisits.forEach(v => {
        if (v.retailer_id && !productiveRetailerIds.has(v.retailer_id)) {
          unproductiveRetailerIds.add(v.retailer_id);
        }
      });
      
      // Collect store_closed retailers (excluding productive and unproductive)
      allClosedVisits.forEach(v => {
        if (v.retailer_id && !productiveRetailerIds.has(v.retailer_id) && !unproductiveRetailerIds.has(v.retailer_id)) {
          closedRetailerIds.add(v.retailer_id);
        }
      });
      
      // Get actual visit objects for display purposes (deduplicated by retailer_id)
      const seenProductiveIds = new Set<string>();
      const productiveVisits = allProductiveVisits.filter(v => {
        if (!seenProductiveIds.has(v.retailer_id)) {
          seenProductiveIds.add(v.retailer_id);
          return true;
        }
        return false;
      });
      
      const seenUnproductiveIds = new Set<string>();
      const unproductiveVisits = allUnproductiveVisits.filter(v => {
        if (unproductiveRetailerIds.has(v.retailer_id) && !seenUnproductiveIds.has(v.retailer_id)) {
          seenUnproductiveIds.add(v.retailer_id);
          return true;
        }
        return false;
      });
      
      const seenClosedIds = new Set<string>();
      const closedVisits = allClosedVisits.filter(v => {
        if (closedRetailerIds.has(v.retailer_id) && !seenClosedIds.has(v.retailer_id)) {
          seenClosedIds.add(v.retailer_id);
          return true;
        }
        return false;
      });
      
      // Completed retailers = unique productive + unproductive + store_closed (no double-counting)
      const completedVisits = [...productiveVisits, ...unproductiveVisits, ...closedVisits];
      
      // Find retailers from beat plans that don't have a visit record OR have 'planned' status
      const beatPlanRetailersWithoutVisits = beatPlanRetailersByDate.filter(bp => {
        const key = `${bp.retailerId}_${bp.planDate}`;
        const visitStatus = visitedByDateMap.get(key);
        return !visitStatus || visitStatus === 'planned';
      });
      
      // Total planned = all unique retailers from beat plans for the date range
      const totalPlannedFromBeatPlans = beatPlanRetailersByDate.length;
      
      // CRITICAL: Productive count = unique retailers with productive visit OR confirmed order
      const productiveCount = productiveRetailerIds.size;
      
      // Unproductive = unique unproductive + store_closed retailers
      const unproductiveCount = unproductiveRetailerIds.size + closedRetailerIds.size;
      
      // Pending = Planned - Productive - Unproductive
      // This ensures: Planned = Productive + Unproductive + Pending
      const totalPendingCount = Math.max(0, totalPlannedFromBeatPlans - productiveCount - unproductiveCount);
      const totalPlanned = totalPlannedFromBeatPlans;
      
      console.log('🎯 [USER FILTER DEBUG]', {
        targetUserIds,
        filterType,
        dateRange: { from: format(dateRange.from, 'yyyy-MM-dd'), to: format(dateRange.to, 'yyyy-MM-dd') },
        beatPlansCount: beatPlans?.length || 0,
        beatIds,
        beatPlanRetailersCount: beatPlanRetailersByDate.length,
        visitsCount: visits?.length || 0,
        ordersCount: todayOrders?.length || 0,
        productiveCount,
        unproductiveCount,
        totalPlanned
      });

      // Get attendance start/end times from attendance table
      const allAttendanceCheckIns = attendanceData?.filter(a => a.check_in_time).map(a => new Date(a.check_in_time!)) || [];
      const allAttendanceCheckOuts = attendanceData?.filter(a => a.check_out_time).map(a => new Date(a.check_out_time!)) || [];
      
      const firstCheckIn = allAttendanceCheckIns.length > 0 
        ? new Date(Math.min(...allAttendanceCheckIns.map(t => t.getTime())))
        : null;
      const lastCheckOut = allAttendanceCheckOuts.length > 0 
        ? new Date(Math.max(...allAttendanceCheckOuts.map(t => t.getTime())))
        : null;

      const formatTime = (date: Date | null) => {
        if (!date) return "Not started";
        return date.toLocaleTimeString('en-IN', { 
          hour: 'numeric', 
          minute: '2-digit', 
          hour12: true 
        });
      };

      // Process orders data
      const totalOrderValue = todayOrders?.reduce((sum, order) => sum + Number(order.total_amount || 0), 0) || 0;
      const totalOrdersCount = todayOrders?.length || 0;
      const avgOrderValue = totalOrdersCount > 0 ? totalOrderValue / totalOrdersCount : 0;
      
      // Calculate total KG sold (convert all units to KG)
      const convertToKg = (quantity: number, unit: string): number => {
        const lowerUnit = unit.toLowerCase();
        if (lowerUnit === 'kg' || lowerUnit === 'kilogram' || lowerUnit === 'kilograms') {
          return quantity;
        } else if (lowerUnit === 'g' || lowerUnit === 'gram' || lowerUnit === 'grams') {
          return quantity / 1000;
        } else if (lowerUnit === 'l' || lowerUnit === 'liter' || lowerUnit === 'liters' || lowerUnit === 'litre' || lowerUnit === 'litres') {
          return quantity; // Treat liters as KG for beverages
        } else if (lowerUnit === 'ml' || lowerUnit === 'milliliter' || lowerUnit === 'milliliters' || lowerUnit === 'millilitre' || lowerUnit === 'millilitres') {
          return quantity / 1000; // Convert ml to liters/kg
        }
        return 0; // For pieces and other units, don't count towards KG
      };
      
      // Count items (pieces) instead of weight
      // Each order_item = 1 piece (PC)
      let totalItemsCount = 0;
      todayOrders?.forEach(order => {
        order.order_items?.forEach((item: any) => {
          totalItemsCount += 1; // Count each item as 1 piece
        });
      });
      
      const totalKgSoldFormatted = `${totalItemsCount} PC`; // Display as pieces

      // Calculate distance from van_stock (start_km to end_km)
      let totalDistance = 0;
      if (vanStockData && vanStockData.length > 0) {
        vanStockData.forEach(vs => {
          // Use total_km if it's a valid positive number
          if (vs.total_km && Number(vs.total_km) > 0) {
            totalDistance += Number(vs.total_km);
          } 
          // Otherwise calculate from start_km and end_km if both are valid numbers and end_km > start_km
          else if (vs.start_km != null && vs.end_km != null && Number(vs.end_km) > Number(vs.start_km)) {
            totalDistance += Number(vs.end_km) - Number(vs.start_km);
          }
        });
      }
      
      // Calculate total market hours from first visit start_time to last visit start_time
      // Using start_time for both because end_time gets batch-updated when user clicks "End Day"
      let timeAtRetailersStr = '0h 0m';
      let firstRetailerVisitData: { retailerName: string; time: string } | null = null;
      let lastRetailerVisitData: { retailerName: string; time: string } | null = null;
      
      if (visitLogsData && visitLogsData.length > 0) {
        // Filter logs with valid start_time
        const validLogs = visitLogsData.filter(log => log.start_time);
        
        if (validLogs.length > 0) {
          // Get the first log (earliest visit - already sorted by start_time ascending)
          const firstLog = validLogs[0];
          const firstStartTime = new Date(firstLog.start_time);
          
          // Get the last retailer by latest start_time (actual last visit, not end_time which may be batch updated by End Day)
          const lastLogByStartTime = validLogs.reduce((latest, log) => {
            const startTime = new Date(log.start_time);
            return (!latest || startTime > new Date(latest.start_time)) ? log : latest;
          }, null as typeof validLogs[0] | null);
          
          // Fetch retailer names for first and last visits
          const retailerIdsToFetch = [firstLog.retailer_id];
          if (lastLogByStartTime && lastLogByStartTime.retailer_id !== firstLog.retailer_id) {
            retailerIdsToFetch.push(lastLogByStartTime.retailer_id);
          }
          
          const { data: visitRetailersData } = await supabase
            .from('retailers')
            .select('id, name')
            .in('id', retailerIdsToFetch);
          
          const retailerNameMap = new Map<string, string>();
          visitRetailersData?.forEach(r => retailerNameMap.set(r.id, r.name));
          
          // Set first retailer visit data
          firstRetailerVisitData = {
            retailerName: retailerNameMap.get(firstLog.retailer_id) || 'Unknown Retailer',
            time: format(firstStartTime, 'hh:mm a')
          };
          
          // Calculate total market hours from first visit start_time to last visit start_time
          if (lastLogByStartTime) {
            const lastVisitStartTime = new Date(lastLogByStartTime.start_time);
            const diffMs = lastVisitStartTime.getTime() - firstStartTime.getTime();
            const diffMinutes = Math.max(0, diffMs / (1000 * 60));
            const hours = Math.floor(diffMinutes / 60);
            const minutes = Math.round(diffMinutes % 60);
            timeAtRetailersStr = `${hours}h ${minutes}m`;
            
            // Set last retailer visit data
            lastRetailerVisitData = {
              retailerName: retailerNameMap.get(lastLogByStartTime.retailer_id) || 'Unknown Retailer',
              time: format(lastVisitStartTime, 'hh:mm a')
            };
          }
        }
      }
      
      // Update first/last retailer visit state
      setFirstLastRetailerVisit({
        first: firstRetailerVisitData,
        last: lastRetailerVisitData
      });
      
      console.log('📊 Today\'s Summary Data:', {
        totalVisits: visits?.length || 0,
        completedVisits: completedVisits.length,
        totalOrders: totalOrdersCount,
        totalOrderValue,
        distanceFromVan: totalDistance,
        timeFromVisitLogs: timeAtRetailersStr
      });

      // Update summary data with dynamic title
      const getDateTitle = () => {
        if (filterType === 'today') return 'Today';
        if (filterType === 'week') return 'This Week';
        if (filterType === 'lastWeek') return 'Last Week';
        if (filterType === 'month') return 'This Month';
        return format(selectedDate, 'dd MMM yyyy');
      };

      setSummaryData({
        date: filterType === 'today' || filterType === 'custom' 
          ? selectedDate.toLocaleDateString('en-IN', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })
          : `${format(dateRange.from, 'dd MMM')} - ${format(dateRange.to, 'dd MMM yyyy')}`,
        beat: beatPlan?.beat_name || "No beat planned",
        beatNames: beatNamesDisplay,
        startTime: formatTime(firstCheckIn),
        endTime: lastCheckOut ? formatTime(lastCheckOut) : (firstCheckIn ? "In Progress" : "Not started"),
        plannedVisits: totalPlanned,
        completedVisits: completedVisits.length,
        productiveVisits: productiveCount,
        unproductiveVisits: unproductiveCount,
        totalRetailers: totalPlannedFromBeatPlans,
        totalOrders: totalOrdersCount,
        totalOrderValue,
        avgOrderValue,
        totalKgSold: totalKgFromOrders,
        totalKgSoldFormatted,
        visitEfficiency: totalPlanned > 0 ? Math.round((completedVisits.length / totalPlanned) * 100) : 0,
        orderConversionRate: completedVisits.length > 0 ? Math.round((productiveCount / completedVisits.length) * 100) : 0,
        distanceCovered: totalDistance > 0 ? Math.round(totalDistance * 10) / 10 : 0,
        travelTime: timeAtRetailersStr
      });
      
      console.log('📈 Calculated Metrics:', {
        distanceCovered: Math.round(totalDistance * 10) / 10,
        timeAtRetailers: timeAtRetailersStr,
        visitEfficiency: totalPlanned > 0 ? Math.round((completedVisits.length / totalPlanned) * 100) : 0,
        orderConversionRate: completedVisits.length > 0 ? Math.round((productiveVisits.length / completedVisits.length) * 100) : 0
      });

      // Update visit breakdown - Planned (total), Productive, Unproductive, Pending
      // CRITICAL: Use productiveCount (retailers with orders OR productive visits) not productiveVisits.length
      setVisitBreakdown([
        { status: "Planned", count: totalPlannedFromBeatPlans, color: "primary" },
        { status: "Productive", count: productiveCount, color: "success" },
        { status: "Unproductive", count: unproductiveVisits.length + closedVisits.length, color: "destructive" },
        { status: "Pending", count: totalPendingCount, color: "warning" }
      ]);

      // Process top retailers (based on order value)
      const retailerOrderMap = new Map();
      todayOrders?.forEach(order => {
        const retailer = retailerMap.get(order.retailer_id);
        const existing = retailerOrderMap.get(order.retailer_name) || { value: 0, location: '' };
        retailerOrderMap.set(order.retailer_name, {
          value: existing.value + Number(order.total_amount || 0),
          location: retailer?.address || 'Location not available'
        });
      });

      const topRetailersData = Array.from(retailerOrderMap.entries())
        .map(([name, data]) => ({ name, orderValue: data.value, location: data.location }))
        .sort((a, b) => b.orderValue - a.orderValue)
        .slice(0, 4);

      setTopRetailers(topRetailersData);

      // Process product sales with KG conversion
      const productSalesMap = new Map();
      todayOrders?.forEach(order => {
        order.order_items?.forEach((item: any) => {
          const existing = productSalesMap.get(item.product_name) || { kgSold: 0, revenue: 0 };
          const itemKg = convertToKg(item.quantity, item.unit || 'piece');
          productSalesMap.set(item.product_name, {
            kgSold: existing.kgSold + itemKg,
            revenue: existing.revenue + Number(item.total || 0)
          });
        });
      });

      const productSalesData = Array.from(productSalesMap.entries())
        .map(([name, data]) => ({ 
          name, 
          kgSold: data.kgSold,
          kgFormatted: data.kgSold > 0 ? formatKg(data.kgSold) : 'N/A',
          revenue: data.revenue 
        }))
        .sort((a, b) => b.revenue - a.revenue);

      setProductSales(productSalesData);

      // Process orders for dialog
      const ordersData = todayOrders?.map(order => {
        let kgSum = 0;
        order.order_items?.forEach((item: any) => {
          kgSum += convertToKg(item.quantity, item.unit || 'piece');
        });
        
        // Derive credit from multiple fields with safe fallbacks
        const totalAmount = Number(order.total_amount ?? 0);
        const paid = Number(order.credit_paid_amount ?? order.amount_paid ?? 0);
        const pendingField = order.pending_amount ?? order.credit_pending_amount;
        const derivedPending = (order.is_credit_order ? Math.max(0, totalAmount - paid) : 0);
        const creditAmount = Number(pendingField ?? derivedPending ?? 0);
        
        // Format payment method for display
        const paymentMethod = order.payment_method 
          ? order.payment_method.charAt(0).toUpperCase() + order.payment_method.slice(1)
          : 'N/A';
        
        // Debug log to verify credit calculation in runtime
        try {
          console.log('[TodaySummary] Order credit calc', {
            order_id: order.id,
            retailer: order.retailer_name,
            totalAmount,
            paid,
            pending_amount: order.pending_amount,
            credit_pending_amount: order.credit_pending_amount,
            is_credit_order: order.is_credit_order,
            derivedPending,
            creditAmount
          });
        } catch (e) {}
        
        return {
          retailer: order.retailer_name,
          amount: totalAmount,
          kgSold: kgSum,
          kgFormatted: kgSum > 0 ? formatKg(kgSum) : '0 KG',
          creditAmount: creditAmount,
          cashInHand: totalAmount - creditAmount,
          paymentMethod: paymentMethod
        };
      }) || [];

      setOrders(ordersData);

      // Calculate payment method breakdown for pie chart
      const paymentMethodMap = new Map<string, { amount: number; count: number }>();
      const paymentMethodColors: Record<string, string> = {
        'cash': 'hsl(142, 76%, 36%)', // green
        'credit': 'hsl(0, 84%, 60%)',  // red
        'upi': 'hsl(280, 67%, 50%)',   // purple
        'neft': 'hsl(220, 90%, 56%)',  // blue
        'cheque': 'hsl(38, 92%, 50%)', // orange
        'check': 'hsl(38, 92%, 50%)',  // orange (alternate spelling)
        'rtgs': 'hsl(190, 90%, 45%)',  // cyan
        'n/a': 'hsl(220, 14%, 70%)',   // gray
      };
      
      todayOrders?.forEach(order => {
        const totalAmount = Number(order.total_amount ?? 0);
        const paid = Number(order.credit_paid_amount ?? order.amount_paid ?? 0);
        const isCreditOrder = order.is_credit_order;
        const paymentMethod = order.payment_method?.toLowerCase() || '';
        
        // Determine the primary payment method
        let primaryMethod = 'n/a';
        
        if (isCreditOrder) {
          // If credit order with partial payment
          if (paid > 0) {
            // Add the paid portion to the payment method used
            const paidMethod = paymentMethod || 'cash';
            const existingPaid = paymentMethodMap.get(paidMethod) || { amount: 0, count: 0 };
            paymentMethodMap.set(paidMethod, {
              amount: existingPaid.amount + paid,
              count: existingPaid.count
            });
            // Add the credit portion
            const creditAmount = totalAmount - paid;
            if (creditAmount > 0) {
              const existingCredit = paymentMethodMap.get('credit') || { amount: 0, count: 0 };
              paymentMethodMap.set('credit', {
                amount: existingCredit.amount + creditAmount,
                count: existingCredit.count + 1
              });
            }
          } else {
            // Full credit order
            primaryMethod = 'credit';
            const existing = paymentMethodMap.get(primaryMethod) || { amount: 0, count: 0 };
            paymentMethodMap.set(primaryMethod, {
              amount: existing.amount + totalAmount,
              count: existing.count + 1
            });
          }
        } else {
          // Non-credit order - use payment method
          primaryMethod = paymentMethod || 'cash';
          const existing = paymentMethodMap.get(primaryMethod) || { amount: 0, count: 0 };
          paymentMethodMap.set(primaryMethod, {
            amount: existing.amount + totalAmount,
            count: existing.count + 1
          });
        }
      });

      const paymentBreakdownData = Array.from(paymentMethodMap.entries())
        .filter(([_, data]) => data.amount > 0)
        .map(([method, data]) => ({
          method: method.charAt(0).toUpperCase() + method.slice(1),
          amount: Math.round(data.amount),
          count: data.count,
          color: paymentMethodColors[method.toLowerCase()] || 'hsl(220, 14%, 50%)'
        }))
        .sort((a, b) => b.amount - a.amount);

      setPaymentMethodBreakdown(paymentBreakdownData);
      const productOrderMap = new Map();
      todayOrders?.forEach(order => {
        order.order_items?.forEach((item: any) => {
          const existing = productOrderMap.get(item.product_name) || { itemCount: 0, value: 0, orderCount: 0 };
          productOrderMap.set(item.product_name, {
            itemCount: existing.itemCount + 1, // Count each item as 1 piece
            value: existing.value + Number(item.total || 0),
            orderCount: existing.orderCount + 1
          });
        });
      });

      const productGroupedData = Array.from(productOrderMap.entries())
        .map(([product, data]) => ({ 
          product, 
          kgSold: data.itemCount, // Now represents item count (PC)
          kgFormatted: `${data.itemCount} PC`, // Format as pieces
          value: data.value,
          orders: data.orderCount
        }))
        .sort((a, b) => b.value - a.value);

      setProductGroupedOrders(productGroupedData);

      // Process visits by status for dialog
      // For Productive: include retailer name and total order value
      const productiveVisitsWithValue = productiveVisits.map(v => {
        const retailerOrders = todayOrders?.filter(o => o.retailer_id === v.retailer_id) || [];
        const totalValue = retailerOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
        return { 
          retailer: retailerMap.get(v.retailer_id)?.name || 'Unknown',
          totalValue 
        };
      });
      
      // For Unproductive: combine unproductive + store_closed, show reason
      const unproductiveVisitsForDisplay = [
        ...unproductiveVisits.map(v => ({ 
          retailer: retailerMap.get(v.retailer_id)?.name || 'Unknown', 
          note: v.no_order_reason || 'No reason provided' 
        })),
        ...closedVisits.map(v => ({ 
          retailer: retailerMap.get(v.retailer_id)?.name || 'Unknown', 
          note: 'Store Closed' 
        }))
      ];
      
      // All retailers from beat plans (total planned for the period)
      const allBeatPlanRetailers = beatPlanRetailersByDate.map(bp => {
        const retailer = retailerMap.get(bp.retailerId);
        return { 
          retailer: retailer?.name || 'Unknown',
          beatName: bp.beatName || 'N/A',
          address: retailer?.address || 'Address not available',
          planDate: bp.planDate || 'N/A'
        };
      });
      
      // Pending visits - beat plan retailers without visits yet
      const pendingRetailers = [
        ...pendingVisitsFromDb.map(v => {
          const retailer = retailerMap.get(v.retailer_id);
          const beatForRetailer = beatPlans?.find(bp => {
            const beatData = bp.beat_data as any;
            return beatData?.retailers?.some((r: any) => r.id === v.retailer_id);
          });
          return { 
            retailer: retailer?.name || 'Unknown',
            beatName: beatForRetailer?.beat_name || 'N/A',
            address: retailer?.address || 'Address not available',
            planDate: v.planned_date || 'N/A'
          };
        }),
        ...beatPlanRetailersWithoutVisits.map(bp => {
          const retailer = retailerMap.get(bp.retailerId);
          return { 
            retailer: retailer?.name || 'Unknown',
            beatName: bp.beatName || 'N/A',
            address: retailer?.address || 'Address not available',
            planDate: bp.planDate || 'N/A'
          };
        })
      ];
      
      const visitsByStatusData = {
        Planned: allBeatPlanRetailers,
        Productive: productiveVisitsWithValue,
        Unproductive: unproductiveVisitsForDisplay,
        Pending: pendingRetailers
      };

      setVisitsByStatus(visitsByStatusData);

      // Prepare retailer-based report data - now includes invoice details
      const retailerReportDataArray: Array<{
        retailerName: string;
        address: string;
        phoneNumber: string;
        visitStatus: string;
        orderPerKG: number;
        totalValue: number;
        invoiceDate?: string;
        invoiceNumber?: string;
        productName?: string;
        paymentMode?: string;
      }> = [];
      
      // Process each order to build comprehensive report data with invoice details
      // This creates one row per order item for detailed product-level reporting
      for (const order of (todayOrders || [])) {
        const retailer = retailerMap.get(order.retailer_id);
        const visit = visits?.find(v => v.retailer_id === order.retailer_id);
        
        // Determine visit status
        let visitStatus = 'Productive';
        if (visit) {
          if (visit.status === 'productive') visitStatus = 'Productive';
          else if (visit.status === 'unproductive') visitStatus = 'Non-Productive';
          else if (visit.status === 'store_closed') visitStatus = 'Store Closed';
          else if (visit.status === 'canceled') visitStatus = 'Canceled';
          else if (visit.status === 'planned') visitStatus = 'Planned';
        }
        
        // Format invoice date
        const invoiceDate = order.created_at 
          ? new Date(order.created_at).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric'
            })
          : '-';
        
        // Determine payment mode
        let paymentMode = 'Cash';
        if (order.is_credit_order) {
          paymentMode = order.credit_paid_amount > 0 ? 'Partial Credit' : 'Full Credit';
        }
        if (order.payment_method) {
          paymentMode = order.payment_method;
        }
        
        // If order has items, create a row for each product
        if (order.order_items && order.order_items.length > 0) {
          for (const item of order.order_items) {
            const itemKg = convertToKg(item.quantity, item.unit || 'piece');
            
            retailerReportDataArray.push({
              retailerName: retailer?.name || order.retailer_name || 'Unknown Retailer',
              address: retailer?.address || 'Address not available',
              phoneNumber: retailer?.phone || 'Phone not available',
              visitStatus,
              orderPerKG: itemKg,
              totalValue: Number(item.total || 0),
              invoiceDate,
              invoiceNumber: order.invoice_number || '-',
              productName: item.product_name || '-',
              paymentMode
            });
          }
        } else {
          // No items, create a single row for the order
          retailerReportDataArray.push({
            retailerName: retailer?.name || order.retailer_name || 'Unknown Retailer',
            address: retailer?.address || 'Address not available',
            phoneNumber: retailer?.phone || 'Phone not available',
            visitStatus,
            orderPerKG: 0,
            totalValue: Number(order.total_amount || 0),
            invoiceDate,
            invoiceNumber: order.invoice_number || '-',
            productName: '-',
            paymentMode
          });
        }
      }
      
      // Also add visits without orders (non-productive visits)
      for (const visit of (visits || [])) {
        const hasOrder = todayOrders?.some(o => o.retailer_id === visit.retailer_id);
        if (!hasOrder && visit.status !== 'planned') {
          const retailer = retailerMap.get(visit.retailer_id);
          
          let visitStatus = 'Pending';
          if (visit.status === 'unproductive') visitStatus = 'Non-Productive';
          else if (visit.status === 'store_closed') visitStatus = 'Store Closed';
          else if (visit.status === 'canceled') visitStatus = 'Canceled';
          
          retailerReportDataArray.push({
            retailerName: retailer?.name || 'Unknown Retailer',
            address: retailer?.address || 'Address not available',
            phoneNumber: retailer?.phone || 'Phone not available',
            visitStatus,
            orderPerKG: 0,
            totalValue: 0,
            invoiceDate: '-',
            invoiceNumber: '-',
            productName: '-',
            paymentMode: '-'
          });
        }
      }
      
      console.log('[REPORT DATA] targetUserIds:', targetUserIds);
      console.log('[REPORT DATA] managerSelectedUserId:', managerSelectedUserId);
      console.log('[REPORT DATA] isManager:', isManager);
      console.log('[REPORT DATA] retailerReportDataArray count:', retailerReportDataArray.length);
      console.log('[REPORT DATA] Final report data:', retailerReportDataArray);
      setRetailerReportData(retailerReportDataArray);

      // Generate General Report Data (day-by-day summary)
      const generalReportDataArray: Array<{
        date: string;
        day: string;
        beatName: string;
        plannedVisits: number;
        actualVisits: number;
        productiveVisits: number;
        unproductiveVisits: number;
        orderValue: number;
        firstCheckIn: string;
        lastCheckOut: string;
        totalMarketHours: string;
        newRetailersAdded: number;
      }> = [];

      // Generate dates between from and to
      const datesInRange: Date[] = [];
      const rangeFromDate = new Date(dateRange.from);
      rangeFromDate.setHours(0, 0, 0, 0);
      const rangeToDate = new Date(dateRange.to);
      rangeToDate.setHours(23, 59, 59, 999);
      
      let currentDate = new Date(rangeFromDate);
      while (currentDate <= rangeToDate) {
        datesInRange.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      console.log('[GENERAL REPORT] Date range:', {
        from: format(dateRange.from, 'yyyy-MM-dd'),
        to: format(dateRange.to, 'yyyy-MM-dd'),
        datesInRangeCount: datesInRange.length,
        dates: datesInRange.map(d => format(d, 'yyyy-MM-dd'))
      });

      // Process each date for general report
      for (const reportDate of datesInRange) {
        const dateStr = format(reportDate, 'yyyy-MM-dd');
        const dayName = format(reportDate, 'EEEE');
        const displayDate = format(reportDate, 'dd-MM-yyyy');

        // Get beat names for this date
        const beatsForDate = beatPlans?.filter(bp => bp.plan_date === dateStr) || [];
        const beatNamesForDate = beatsForDate.map(bp => bp.beat_name).filter(Boolean).join(', ') || '-';

        // Get planned visits for this date (retailers in the beats planned for this date)
        const plannedForDate = beatPlanRetailersByDate.filter(item => item.planDate === dateStr).length;

        // Get productive visits for this date
        const productiveForDate = visits?.filter(v => v.planned_date === dateStr && v.status === 'productive').length || 0;

        // Get unproductive visits for this date (includes store_closed, unproductive, canceled)
        const unproductiveForDate = visits?.filter(v => 
          v.planned_date === dateStr && 
          (v.status === 'unproductive' || v.status === 'store_closed' || v.status === 'canceled')
        ).length || 0;

        // Actual visits = productive + unproductive (completed visits)
        const actualVisitsForDate = productiveForDate + unproductiveForDate;

        // Planned visits = total count from beat plan (should equal productive + unproductive + pending)
        const totalPlannedForDate = plannedForDate;

        // Get order value for this date
        const ordersForDate = todayOrders?.filter(o => {
          const orderDate = format(new Date(o.created_at), 'yyyy-MM-dd');
          return orderDate === dateStr;
        }) || [];
        const orderValueForDate = ordersForDate.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

        // Get attendance for this date
        const attendanceForDate = attendanceData?.filter(a => a.date === dateStr) || [];
        const checkIns = attendanceForDate.filter(a => a.check_in_time).map(a => new Date(a.check_in_time!));
        const checkOuts = attendanceForDate.filter(a => a.check_out_time).map(a => new Date(a.check_out_time!));
        
        const firstCheckInTime = checkIns.length > 0 
          ? format(new Date(Math.min(...checkIns.map(t => t.getTime()))), 'hh:mm a')
          : '-';
        const lastCheckOutTime = checkOuts.length > 0 
          ? format(new Date(Math.max(...checkOuts.map(t => t.getTime()))), 'hh:mm a')
          : '-';

        // Calculate total market hours from visit logs for this date
        let marketHoursStr = '-';
        const logsForDate = visitLogsData?.filter(log => log.visit_date === dateStr && log.start_time) || [];
        if (logsForDate.length > 0) {
          const sortedLogs = logsForDate.sort((a, b) => 
            new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
          );
          const firstVisitTime = new Date(sortedLogs[0].start_time);
          const lastVisitTime = new Date(sortedLogs[sortedLogs.length - 1].start_time);
          const diffMs = lastVisitTime.getTime() - firstVisitTime.getTime();
          const diffMinutes = Math.max(0, diffMs / (1000 * 60));
          const hours = Math.floor(diffMinutes / 60);
          const minutes = Math.round(diffMinutes % 60);
          marketHoursStr = `${hours}h ${minutes}m`;
        }

        // Count new retailers added on this date
        const newRetailersCount = 0; // Will be enhanced if needed

        generalReportDataArray.push({
          date: displayDate,
          day: dayName,
          beatName: beatNamesForDate,
          plannedVisits: totalPlannedForDate,
          actualVisits: actualVisitsForDate,
          productiveVisits: productiveForDate,
          unproductiveVisits: unproductiveForDate,
          orderValue: orderValueForDate,
          firstCheckIn: firstCheckInTime,
          lastCheckOut: lastCheckOutTime,
          totalMarketHours: marketHoursStr,
          newRetailersAdded: newRetailersCount
        });
      }

      setGeneralReportData(generalReportDataArray);

    } catch (error) {
      console.error('Error fetching today\'s data:', error);
      toast({
        title: "Error",
        description: "Failed to load today's data",
        variant: "destructive"
      });
    } finally {
      // Fetch completed activities count
      try {
        const activityUserId = managerSelectedUserId !== 'self' ? managerSelectedUserId : user?.id;
        if (activityUserId) {
          const { data: activityVisits } = await supabase
            .from('visits')
            .select('id')
            .eq('user_id', activityUserId)
            .eq('visit_type', 'activity')
            .eq('status', 'productive')
            .gte('planned_date', format(dateRange.from, 'yyyy-MM-dd'))
            .lte('planned_date', format(dateRange.to, 'yyyy-MM-dd'));
          setCompletedActivitiesCount(activityVisits?.length || 0);
        }
      } catch {
        setCompletedActivitiesCount(0);
      }
      setLoading(false);
      initialLoadDone.current = true;
    }
  };

  const openProductsDialog = () => {
    setDialogTitle("Orders by Product");
    setDialogContentType("products");
    setDialogFilter(null);
    setDialogOpen(true);
  };

  const openRetailerValueDialog = () => {
    setDialogTitle("Order Value by Retailer");
    setDialogContentType("retailerValue");
    setDialogFilter(null);
    setDialogOpen(true);
  };

  const openKgBreakdownDialog = () => {
    setDialogTitle("Total Items Sold - Product-wise Breakdown");
    setDialogContentType("kgBreakdown");
    setDialogFilter(null);
    setDialogOpen(true);
  };

  const openOrdersDialog = (title: string) => {
    setDialogTitle(title);
    setDialogContentType("orders");
    setDialogFilter(null);
    setDialogOpen(true);
  };

  const openEfficiencyDialog = () => {
    setDialogTitle("Visit Efficiency Details");
    setDialogContentType("efficiency");
    setDialogFilter(null);
    setDialogOpen(true);
  };

  const openVisitsDialog = (status: string) => {
    setDialogTitle(`${status} Visits`);
    setDialogContentType("visits");
    setDialogFilter(status);
    setDialogOpen(true);
  };

  const sanitizeText = (text: string): string => {
    // Remove or replace non-ASCII characters that don't render well in PDFs
    return text
      .replace(/[^\x00-\x7F]/g, '') // Remove non-ASCII characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  };

  const handleDownloadPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPosition = 20;

      // Header - matches the card display
      doc.setFontSize(20);
      doc.setTextColor(79, 70, 229); // Primary color
      doc.text(
        filterType === 'today' ? "Today's Summary" : 
        filterType === 'week' ? "This Week's Summary" :
        filterType === 'lastWeek' ? "Last Week's Summary" :
        filterType === 'month' ? "Monthly Summary" :
        filterType === 'dateRange' ? "Date Range Summary" : "Visit Summary", 
        pageWidth / 2, 
        yPosition, 
        { align: 'center' }
      );
      
      yPosition += 8;
      doc.setFontSize(11);
      doc.setTextColor(100, 100, 100);
      doc.text(summaryData.date, pageWidth / 2, yPosition, { align: 'center' });
      
      // Selected Period Information - Beat & Times (matches the card display)
      yPosition += 12;
      doc.setFillColor(245, 245, 250);
      doc.roundedRect(14, yPosition - 5, pageWidth - 28, 20, 3, 3, 'F');
      
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      const beatNames = summaryData.beatNames.length > 0 ? summaryData.beatNames.join(', ') : 'No beat';
      doc.text(`Beat: ${sanitizeText(beatNames)}`, 18, yPosition + 3);
      
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.text(`Start: ${summaryData.startTime}  |  End: ${summaryData.endTime}`, 18, yPosition + 11);
      
      yPosition += 25;
      
      // Key Metrics Section - matches the page display
      doc.setFontSize(14);
      doc.setTextColor(60, 60, 60);
      doc.text("Key Metrics", 14, yPosition);
      yPosition += 8;
      
      const metricsData = [
        ['Total Retailers', summaryData.totalRetailers.toString()],
        ['Productive', summaryData.productiveVisits.toString()],
        ['Unproductive', summaryData.unproductiveVisits.toString()],
        ['Total Order Value', `Rs. ${Math.round(summaryData.totalOrderValue).toLocaleString('en-IN')}`],
        ['Orders Placed', summaryData.totalOrders.toString()],
        ['Total Items Sold (PC)', summaryData.totalKgSoldFormatted],
        ['Avg Order Value', `Rs. ${Math.round(summaryData.avgOrderValue).toLocaleString('en-IN')}`],
        ['Points Earned', pointsEarnedToday.toString()]
      ];
      
      autoTable(doc, {
        startY: yPosition,
        head: [['Metric', 'Value']],
        body: metricsData,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        styles: { fontSize: 10, cellPadding: 4 },
        margin: { left: 14, right: 14 }
      });
      
      yPosition = (doc as any).lastAutoTable.finalY + 12;
      
      // Performance Summary Section - matches the page display exactly
      doc.setFontSize(14);
      doc.setTextColor(60, 60, 60);
      doc.text("Performance Summary", 14, yPosition);
      yPosition += 8;
      
      // Visit breakdown data matching page display
      const visitBreakdownData = visitBreakdown.map(item => {
        const percentage = item.status === "Planned" 
          ? "100%" 
          : (visitBreakdown[0]?.count > 0 ? Math.round((item.count / visitBreakdown[0].count) * 100) : 0) + "%";
        return [
          item.status,
          `${item.count} ${item.status === "Planned" ? "retailers" : "visits"}`,
          percentage
        ];
      });
      
      // Add additional performance metrics
      visitBreakdownData.push(
        ['Order Conversion Rate', `${summaryData.orderConversionRate}%`, ''],
        ['Distance Covered', summaryData.distanceCovered > 0 ? `${summaryData.distanceCovered} km` : 'No data', ''],
        ['Time at Retailers', summaryData.travelTime, '']
      );
      
      autoTable(doc, {
        startY: yPosition,
        head: [['Status/Metric', 'Count/Value', 'Percentage']],
        body: visitBreakdownData,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        styles: { fontSize: 10, cellPadding: 4 },
        margin: { left: 14, right: 14 }
      });
      
      yPosition = (doc as any).lastAutoTable.finalY + 12;
      
      // Check if we need a new page
      if (yPosition > 230) {
        doc.addPage();
        yPosition = 20;
      }
      
      // Top Performing Retailers - matches page display (top 3)
      if (topRetailers.length > 0) {
        doc.setFontSize(14);
        doc.setTextColor(60, 60, 60);
        doc.text("Top Performing Retailers", 14, yPosition);
        yPosition += 8;
        
        const retailersData = topRetailers.slice(0, 3).map((retailer, index) => [
          `#${index + 1}`,
          sanitizeText(retailer.name) || 'Unknown Retailer',
          `Rs. ${Math.round(retailer.orderValue).toLocaleString('en-IN')}`
        ]);
        
        autoTable(doc, {
          startY: yPosition,
          head: [['Rank', 'Retailer', 'Order Value']],
          body: retailersData,
          theme: 'striped',
          headStyles: { fillColor: [34, 197, 94], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          styles: { fontSize: 10, cellPadding: 4 },
          margin: { left: 14, right: 14 }
        });
        
        yPosition = (doc as any).lastAutoTable.finalY + 12;
      }
      
      // Check if we need a new page
      if (yPosition > 230) {
        doc.addPage();
        yPosition = 20;
      }
      
      // Joint Sales Highlight - matches page display
      if (jointSalesData) {
        doc.setFontSize(14);
        doc.setTextColor(147, 51, 234); // Purple
        doc.text("Joint Sales Visit", 14, yPosition);
        doc.setFontSize(10);
        doc.text(`with ${sanitizeText(jointSalesData.memberName)}`, 14, yPosition + 6);
        yPosition += 14;
        
        const jointSalesMetrics = [
          ['Retailers Covered', jointSalesData.retailersCovered.toString()],
          ['Order Increase', `Rs. ${Math.round(jointSalesData.orderIncrease).toLocaleString('en-IN')}`],
          ['Avg Score', jointSalesData.avgScore > 0 ? `${jointSalesData.avgScore}/10` : '-']
        ];
        
        autoTable(doc, {
          startY: yPosition,
          head: [['Metric', 'Value']],
          body: jointSalesMetrics,
          theme: 'striped',
          headStyles: { fillColor: [147, 51, 234], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [250, 245, 255] },
          styles: { fontSize: 10, cellPadding: 4 },
          margin: { left: 14, right: 14 }
        });
        
        yPosition = (doc as any).lastAutoTable.finalY + 8;
        
        // Joint Sales Feedback Details
        if (jointSalesData.feedback.length > 0) {
          const feedbackData = jointSalesData.feedback.map(f => [
            sanitizeText(f.retailerName),
            `${f.score}/10`,
            `Rs. ${Math.round(f.orderIncrease).toLocaleString('en-IN')}`
          ]);
          
          autoTable(doc, {
            startY: yPosition,
            head: [['Retailer', 'Score', 'Order Increase']],
            body: feedbackData,
            theme: 'striped',
            headStyles: { fillColor: [147, 51, 234], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [250, 245, 255] },
            styles: { fontSize: 9, cellPadding: 3 },
            margin: { left: 14, right: 14 }
          });
          
          yPosition = (doc as any).lastAutoTable.finalY + 12;
        }
      }
      
      // Check if we need a new page
      if (yPosition > 230) {
        doc.addPage();
        yPosition = 20;
      }
      
      // Product-wise Sales - matches page display
      if (productSales.length > 0) {
        doc.setFontSize(14);
        doc.setTextColor(60, 60, 60);
        doc.text("Product-wise Sales", 14, yPosition);
        yPosition += 8;
        
        const productsData = productSales.map(p => [
          sanitizeText(p.name) || 'Unknown Product',
          p.kgFormatted,
          `Rs. ${Math.round(p.revenue).toLocaleString('en-IN')}`
        ]);
        
        autoTable(doc, {
          startY: yPosition,
          head: [['Product', 'KG Sold', 'Revenue']],
          body: productsData,
          theme: 'striped',
          headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          styles: { fontSize: 9, cellPadding: 3 },
          margin: { left: 14, right: 14 }
        });
      }
      
      // Save the PDF using cross-platform downloader
      const fileName = `Summary_${format(selectedDate, 'yyyy-MM-dd')}.pdf`;
      const pdfBlob = doc.output('blob');
      await downloadPDF(pdfBlob, fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Error",
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleShare = () => {
    toast({
      title: "Summary Shared",
      description: "Today's summary has been shared with your team",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading today's summary...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen">
        <div className="container mx-auto p-4 space-y-4">
        {/* Header */}
        <Card className="shadow-card bg-gradient-primary text-primary-foreground">
          <CardHeader className="pb-3 space-y-3">
            <div className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold">
                  {filterType === 'today' ? "Today's Summary" : 
                   filterType === 'week' ? "This Week's Summary" :
                   filterType === 'lastWeek' ? "Last Week's Summary" :
                   filterType === 'month' ? "Monthly Summary" :
                   filterType === 'dateRange' ? "Date Range Summary" :
                   "Visit Summary"}
                </CardTitle>
                <p className="text-primary-foreground/80">{summaryData.date}</p>
              </div>
              <FileText size={24} />
            </div>
            {/* User Selector for managers - placed below the heading */}
            {isManager && (
              <UserSelector
                selectedUserId={managerSelectedUserId}
                onUserChange={setManagerSelectedUserId}
                showAllOption={true}
                allOptionLabel="All Team"
                variant="onDark"
                className="w-fit"
              />
            )}
          </CardHeader>
        </Card>

        {/* Date Filter Controls */}
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="space-y-3">
              {/* Quick Filter Buttons */}
              <div className="grid grid-cols-4 gap-2">
                <Button
                  variant={filterType === 'today' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleDateFilterChange('today')}
                  className="text-xs"
                >
                  Today
                </Button>
                <Button
                  variant={filterType === 'week' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleDateFilterChange('week')}
                  className="text-xs"
                >
                  Week
                </Button>
                <Button
                  variant={filterType === 'month' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleDateFilterChange('month')}
                  className="text-xs"
                >
                  Month
                </Button>
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant={filterType === 'dateRange' || filterType === 'custom' ? 'default' : 'outline'}
                      size="sm"
                      className="text-xs"
                    >
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      Range
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="range"
                      selected={dateRange}
                      onSelect={(range) => {
                        if (range?.from) {
                          if (range.to) {
                            handleDateFilterChange('dateRange', range.from, range.to);
                            setCalendarOpen(false);
                          } else {
                            // Single date selected - treat as custom single day
                            handleDateFilterChange('custom', range.from);
                          }
                        }
                      }}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              {/* Date Display with Navigation */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => {
                    const newDate = new Date(selectedDate);
                    if (filterType === 'today' || filterType === 'custom') {
                      newDate.setDate(newDate.getDate() - 1);
                      handleDateFilterChange('custom', newDate);
                    } else if (filterType === 'week') {
                      newDate.setDate(newDate.getDate() - 7);
                      handleDateFilterChange('week', newDate);
                    } else if (filterType === 'month') {
                      newDate.setMonth(newDate.getMonth() - 1);
                      handleDateFilterChange('month', newDate);
                    }
                  }}
                >
                  ←
                </Button>
                <div className="flex-1 text-center font-medium text-sm">
                  {filterType === 'today' ? format(selectedDate, 'EEEE, d MMMM yyyy') :
                   filterType === 'custom' ? format(selectedDate, 'EEEE, d MMMM yyyy') :
                   filterType === 'week' ? `${format(dateRange.from, 'd MMM')} - ${format(dateRange.to, 'd MMM yyyy')}` :
                   filterType === 'month' ? format(selectedDate, 'MMMM yyyy') :
                   filterType === 'dateRange' ? `${format(dateRange.from, 'd MMM')} - ${format(dateRange.to, 'd MMM yyyy')}` :
                   format(selectedDate, 'd MMM yyyy')}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => {
                    const newDate = new Date(selectedDate);
                    if (filterType === 'today' || filterType === 'custom') {
                      newDate.setDate(newDate.getDate() + 1);
                      handleDateFilterChange('custom', newDate);
                    } else if (filterType === 'week') {
                      newDate.setDate(newDate.getDate() + 7);
                      handleDateFilterChange('week', newDate);
                    } else if (filterType === 'month') {
                      newDate.setMonth(newDate.getMonth() + 1);
                      handleDateFilterChange('month', newDate);
                    }
                  }}
                >
                  →
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button 
            onClick={handleDownloadPDF}
            className="flex items-center gap-2 text-xs sm:text-sm"
          >
            <Download size={16} />
            <span className="hidden sm:inline">Download PDF</span>
            <span className="sm:hidden">PDF</span>
          </Button>
          <ReportGenerator 
            data={retailerReportData}
            generalReportData={generalReportData}
            selectedUserName={isManager ? selectedUserName : undefined}
            dateRange={
              filterType === 'today' ? format(selectedDate, 'MMM dd, yyyy') :
              filterType === 'week' ? `${format(dateRange.from, 'MMM dd')} - ${format(dateRange.to, 'MMM dd, yyyy')}` :
              filterType === 'lastWeek' ? `${format(dateRange.from, 'MMM dd')} - ${format(dateRange.to, 'MMM dd, yyyy')}` :
              filterType === 'month' ? format(selectedDate, 'MMMM yyyy') :
              filterType === 'dateRange' ? `${format(dateRange.from, 'MMM dd')} - ${format(dateRange.to, 'MMM dd, yyyy')}` :
              format(selectedDate, 'MMM dd, yyyy')
            }
          />
        </div>

        {/* Selected Period Information - Beat on top, times below */}
        <Card className="shadow-card">
          <CardContent className="p-3 space-y-2">
            {/* Beat Name - Top */}
            <div className="flex items-center gap-1.5">
              <MapPin size={14} className="text-primary shrink-0" />
              <span className="font-semibold text-sm">
                {summaryData.beatNames.length > 0 
                  ? summaryData.beatNames.join(', ')
                  : 'No beat'}
              </span>
            </div>
            
            {/* Start & End Time - Below */}
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-green-600">▶</span>
                <span className="text-muted-foreground">Start:</span>
                <span className="font-semibold">{summaryData.startTime}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-red-600">■</span>
                <span className="text-muted-foreground">End:</span>
                <span className="font-semibold">{summaryData.endTime}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Key Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div
                role="button"
                onClick={openRetailerValueDialog}
                className="text-center p-4 bg-primary/10 rounded-lg cursor-pointer hover:bg-primary/20 transition overflow-hidden"
              >
                <div className="text-xl font-bold text-primary break-words">
                  {loading ? "Loading..." : `₹${Math.round(summaryData.totalOrderValue).toLocaleString('en-IN')}`}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Total Order Value</div>
              </div>
              <div
                role="button"
                onClick={() => openOrdersDialog("Orders Placed")}
                className="text-center p-4 bg-success/10 rounded-lg cursor-pointer hover:bg-success/20 transition"
              >
                <div className="text-2xl font-bold text-success">
                  {loading ? "Loading..." : summaryData.totalOrders}
                </div>
                <div className="text-sm text-muted-foreground">Orders Placed</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div
                role="button"
                onClick={openKgBreakdownDialog}
                className="text-center p-3 bg-warning/10 rounded-lg cursor-pointer hover:bg-warning/20 transition"
              >
                <div className="text-lg font-bold text-warning">
                  {loading ? "Loading..." : summaryData.totalKgSoldFormatted}
                </div>
                <div className="text-sm text-muted-foreground">Total Items Sold (PC)</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-lg font-bold">
                  {loading ? "Loading..." : `₹${Math.round(summaryData.avgOrderValue).toLocaleString('en-IN')}`}
                </div>
                <div className="text-sm text-muted-foreground">Avg Order Value</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div
                role="button"
                onClick={() => navigate('/leaderboard')}
                className="text-center p-4 bg-gradient-to-r from-amber-500/10 to-yellow-500/10 rounded-lg cursor-pointer hover:from-amber-500/15 hover:to-yellow-500/15 transition border border-amber-500/20"
              >
                <div className="text-2xl font-bold text-amber-600">
                  {loading ? "Loading..." : pointsEarnedToday}
                </div>
                <div className="text-sm text-amber-600/80 font-medium">Points Earned</div>
                <div className="text-xs text-muted-foreground mt-1">Tap to view Leaderboard</div>
              </div>
            </div>

            {/* Activities Completed */}
            {completedActivitiesCount > 0 && (
              <div className="grid grid-cols-1 gap-4">
                <div className="text-center p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                  <div className="text-xl font-bold text-purple-600">
                    {completedActivitiesCount}
                  </div>
                  <div className="text-sm text-purple-600/80 font-medium">
                    {completedActivitiesCount === 1 ? '1 activity was completed' : `${completedActivitiesCount} activities were completed`}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performance Summary */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Performance Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {loading ? (
                <div className="text-center text-muted-foreground">Loading visit data...</div>
              ) : visitBreakdown.length === 0 || visitBreakdown[0]?.count === 0 ? (
                <div className="text-center text-muted-foreground py-4">
                  <p>No visits planned for this period</p>
                  {isManager && managerSelectedUserId !== 'self' && (
                    <p className="text-xs mt-1">Try selecting a different user or date range</p>
                  )}
                </div>
              ) : (
                visitBreakdown.map((item) => (
                <div
                  key={item.status}
                  onClick={() => openVisitsDialog(item.status)}
                  role="button"
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition"
                >
                  <div className="flex items-center gap-3">
                    <Badge 
                      className={
                        item.color === "primary" ? "bg-primary text-primary-foreground" :
                        item.color === "success" ? "bg-success text-success-foreground" :
                        item.color === "destructive" ? "bg-destructive text-destructive-foreground" :
                        item.color === "warning" ? "bg-warning text-warning-foreground" :
                        "bg-muted text-muted-foreground"
                      }
                    >
                      {item.status}
                    </Badge>
                    <span className="text-sm">
                      {item.count} {item.status === "Planned" ? (filterType === 'today' || filterType === 'custom' ? "retailers" : "planned visits") : "visits"}
                    </span>
                  </div>
                  <div className="text-sm font-medium">
                    {item.status === "Planned" 
                      ? "100%" 
                      : (visitBreakdown[0]?.count > 0 ? Math.round((item.count / visitBreakdown[0].count) * 100) : 0) + "%"
                    }
                  </div>
                </div>
              ))
              )}
              
              {/* Additional Metrics in Visit Breakdown */}
              <div className="border-t pt-3 mt-3 space-y-2">
                <div className="flex items-center justify-between p-2 bg-primary/10 rounded-lg">
                  <div className="flex items-center gap-2">
                    <MapPin size={14} className="text-primary" />
                    <span className="text-sm">Distance Covered</span>
                  </div>
                  <span className="font-semibold text-primary">
                    {summaryData.distanceCovered > 0 ? `${summaryData.distanceCovered} km` : 'No data'}
                  </span>
                </div>
                <div 
                  className="flex items-center justify-between p-2 bg-warning/10 rounded-lg cursor-pointer hover:bg-warning/20 transition-colors"
                  onClick={() => setTimeAtRetailersModalOpen(true)}
                >
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-warning" />
                    <span className="text-sm">Time at Retailers</span>
                    <ExternalLink size={12} className="text-warning/60" />
                  </div>
                  <span className="font-semibold text-warning">{summaryData.travelTime}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Performing Retailers */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Top Performing Retailers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {loading ? (
                <div className="text-center text-muted-foreground">Loading retailers...</div>
              ) : topRetailers.length === 0 ? (
                <div className="text-center text-muted-foreground">No orders placed today</div>
              ) : (
                topRetailers.slice(0, 3).map((retailer, index) => (
                <div key={retailer.name} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="font-semibold">{retailer.name}</div>
                  <div className="text-right">
                    <div className="font-bold text-success">₹{Math.round(retailer.orderValue).toLocaleString('en-IN')}</div>
                    <div className="text-xs text-muted-foreground">#{index + 1}</div>
                  </div>
                </div>
              ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Joint Sales Highlight Section */}
        {jointSalesData && (
          <Card className="shadow-card border-purple-200 bg-purple-50/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <span className="text-purple-600">🤝</span>
                  Joint Sales Visit
                </CardTitle>
                {jointSalesData.avgScore > 0 && (
                  <Badge className={`text-sm px-3 py-1 ${
                    jointSalesData.avgScore >= 8 ? 'bg-green-100 text-green-700' :
                    jointSalesData.avgScore >= 6 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-orange-100 text-orange-700'
                  }`}>
                    Score: {jointSalesData.avgScore}/10
                  </Badge>
                )}
              </div>
              <p className="text-sm text-purple-600 font-medium mt-1">
                with {jointSalesData.memberName}
              </p>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-purple-100 rounded-lg">
                  <div className="text-xl font-bold text-purple-700">
                    {jointSalesData.retailersCovered}
                  </div>
                  <div className="text-xs text-purple-600">Retailers</div>
                </div>
                <div className="text-center p-3 bg-green-100 rounded-lg">
                  <div className="text-lg font-bold text-green-700">
                    ₹{Math.round(jointSalesData.orderIncrease).toLocaleString('en-IN')}
                  </div>
                  <div className="text-xs text-green-600">Order Increase</div>
                </div>
                <div className="text-center p-3 bg-blue-100 rounded-lg">
                  <div className="text-xl font-bold text-blue-700">
                    {jointSalesData.avgScore > 0 ? jointSalesData.avgScore : '-'}
                  </div>
                  <div className="text-xs text-blue-600">Avg Score</div>
                </div>
              </div>

              {jointSalesData.feedback.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-purple-700">Feedback Summary</div>
                  {jointSalesData.feedback.slice(0, 3).map((feedback, index) => (
                    <div 
                      key={index} 
                      className="p-3 bg-card rounded-lg border border-purple-100 text-sm cursor-pointer hover:border-purple-300 transition-colors"
                      onClick={() => {
                        setSelectedJointFeedback({
                          retailerId: feedback.retailerId,
                          retailerName: feedback.retailerName,
                          feedbackDate: feedback.feedbackDate
                        });
                        setJointFeedbackViewOpen(true);
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{feedback.retailerName}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-xs ${
                            feedback.score >= 8 ? 'border-green-300 text-green-700' :
                            feedback.score >= 6 ? 'border-yellow-300 text-yellow-700' :
                            'border-orange-300 text-orange-700'
                          }`}>
                            {feedback.score}/10
                          </Badge>
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="text-muted-foreground text-xs line-clamp-1">{feedback.impact}</div>
                      {feedback.orderIncrease > 0 && (
                        <div className="text-green-600 font-medium text-xs mt-1">
                          +₹{Math.round(feedback.orderIncrease).toLocaleString('en-IN')} increase
                        </div>
                      )}
                    </div>
                  ))}
                  {jointSalesData.feedback.length > 3 && (
                    <div className="text-xs text-center text-purple-600 font-medium">
                      +{jointSalesData.feedback.length - 3} more entries
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}


        {/* Product-wise Sales */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Product-wise Sales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">KG Sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Loading product sales...
                    </TableCell>
                  </TableRow>
                ) : productSales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No product sales today
                    </TableCell>
                  </TableRow>
                ) : (
                  (showAllProducts ? productSales : productSales.slice(0, 5)).map((p) => (
                   <TableRow key={p.name}>
                     <TableCell className="font-medium">{p.name}</TableCell>
                     <TableCell className="text-right">{p.kgFormatted}</TableCell>
                     <TableCell className="text-right">₹{Math.round(p.revenue).toLocaleString('en-IN')}</TableCell>
                   </TableRow>
                 ))
               )}
               </TableBody>
            </Table>
            {productSales.length > 5 && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full text-primary"
                onClick={() => setShowAllProducts(!showAllProducts)}
              >
                {showAllProducts ? `View Less` : `View More (${productSales.length - 5} more)`}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Feedback Summary Section */}
        <FeedbackSummarySection 
          dateFrom={dateRange.from} 
          dateTo={dateRange.to}
          userId={isManager && managerSelectedUserId !== 'self' && managerSelectedUserId !== 'all' ? managerSelectedUserId : user?.id}
        />

        {/* Payment Method Breakdown */}
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Payment Method Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="text-center text-muted-foreground py-8">Loading payment data...</div>
            ) : paymentMethodBreakdown.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Wallet className="h-12 w-12 mx-auto mb-2 text-muted-foreground/50" />
                <p>No payment data for this period</p>
              </div>
            ) : (
              <>
                {/* Pie Chart with Legend */}
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {/* Pie Chart */}
                  <div className="h-[160px] w-[160px] flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paymentMethodBreakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                          paddingAngle={2}
                          dataKey="amount"
                          nameKey="method"
                        >
                          {paymentMethodBreakdown.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Amount']}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '12px'
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Legend */}
                  <div className="flex-1 space-y-2">
                    {paymentMethodBreakdown.map((item, index) => {
                      const total = paymentMethodBreakdown.reduce((sum, p) => sum + p.amount, 0);
                      const percent = total > 0 ? ((item.amount / total) * 100).toFixed(0) : 0;
                      return (
                        <div 
                          key={index}
                          className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                        >
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            <div className="flex items-center gap-1.5">
                              {item.method.toLowerCase() === 'cash' && <Banknote className="h-3.5 w-3.5" style={{ color: item.color }} />}
                              {item.method.toLowerCase() === 'credit' && <CreditCard className="h-3.5 w-3.5" style={{ color: item.color }} />}
                              {item.method.toLowerCase() === 'upi' && <Wallet className="h-3.5 w-3.5" style={{ color: item.color }} />}
                              {!['cash', 'credit', 'upi'].includes(item.method.toLowerCase()) && <CreditCard className="h-3.5 w-3.5" style={{ color: item.color }} />}
                              <span className="text-sm font-medium">{item.method}</span>
                              <span className="text-xs text-muted-foreground">({percent}%)</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold" style={{ color: item.color }}>
                              ₹{item.amount.toLocaleString('en-IN')}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {item.count} {item.count === 1 ? 'order' : 'orders'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Totals Summary */}
                <div className="border-t pt-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-success/10 rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1">Cash in Hand</div>
                      <div className="text-lg font-bold text-success">
                        ₹{paymentMethodBreakdown
                          .filter(p => !['credit'].includes(p.method.toLowerCase()))
                          .reduce((sum, p) => sum + p.amount, 0)
                          .toLocaleString('en-IN')}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        (Cash + UPI + NEFT + Cheque)
                      </div>
                    </div>
                    <div className="text-center p-3 bg-destructive/10 rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1">Credit (Pending)</div>
                      <div className="text-lg font-bold text-destructive">
                        ₹{paymentMethodBreakdown
                          .filter(p => p.method.toLowerCase() === 'credit')
                          .reduce((sum, p) => sum + p.amount, 0)
                          .toLocaleString('en-IN')}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        To be collected
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-center p-3 bg-primary/10 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">Total Order Value</div>
                    <div className="text-xl font-bold text-primary">
                      ₹{paymentMethodBreakdown.reduce((sum, p) => sum + p.amount, 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{dialogTitle}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh] pr-2">
              {dialogContentType === "kgBreakdown" && (
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Total Items: {summaryData.totalKgSoldFormatted} • {productGroupedOrders.length} products
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Items Sold (PC)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productGroupedOrders.length > 0 ? (
                        productGroupedOrders
                          .filter(p => p.kgSold > 0)
                          .map((p, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{p.product}</TableCell>
                              <TableCell className="text-right">{p.kgFormatted}</TableCell>
                            </TableRow>
                          ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center text-muted-foreground">
                            No items sold today
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              {dialogContentType === "products" && (
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Total: ₹{Math.round(productGroupedOrders.reduce((sum, p) => sum + p.value, 0)).toLocaleString('en-IN')} • {productGroupedOrders.length} products
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">KG</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productGroupedOrders.length > 0 ? (
                        productGroupedOrders.map((p, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{p.product}</TableCell>
                            <TableCell className="text-right">{p.kgFormatted}</TableCell>
                            <TableCell className="text-right">₹{Math.round(p.value).toLocaleString('en-IN')}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground">
                            No orders placed today
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              {dialogContentType === "orders" && (
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Total: ₹{Math.round(orders.reduce((sum, o) => sum + o.amount, 0)).toLocaleString('en-IN')} • {orders.length} orders
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Retailer</TableHead>
                        <TableHead className="text-right">KG</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((o, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{o.retailer}</TableCell>
                          <TableCell className="text-right">{o.kgFormatted}</TableCell>
                          <TableCell className="text-right">₹{Math.round(o.amount).toLocaleString('en-IN')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {dialogContentType === "retailerValue" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center p-3 bg-primary/10 rounded-lg overflow-hidden">
                      <div className="text-sm font-bold text-primary whitespace-nowrap">
                        ₹{Math.round(orders.reduce((sum, o) => sum + o.amount, 0)).toLocaleString('en-IN')}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Total</div>
                    </div>
                    <div className="text-center p-3 bg-destructive/10 rounded-lg overflow-hidden">
                      <div className="text-sm font-bold text-destructive whitespace-nowrap">
                        ₹{Math.round(orders.reduce((sum, o) => sum + o.creditAmount, 0)).toLocaleString('en-IN')}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Credit</div>
                    </div>
                    <div className="text-center p-3 bg-success/10 rounded-lg overflow-hidden">
                      <div className="text-sm font-bold text-success whitespace-nowrap">
                        ₹{Math.round(orders.reduce((sum, o) => sum + o.cashInHand, 0)).toLocaleString('en-IN')}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Amount Collected</div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[120px]">Retailer</TableHead>
                          <TableHead className="text-right min-w-[100px]">Total Value</TableHead>
                          <TableHead className="text-right min-w-[100px]">Credit</TableHead>
                          <TableHead className="text-right min-w-[100px]">Cash in Hand</TableHead>
                          <TableHead className="text-center min-w-[80px]">Payment</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.length > 0 ? (
                          orders.map((o, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{o.retailer}</TableCell>
                              <TableCell className="text-right">₹{Math.round(o.amount).toLocaleString('en-IN')}</TableCell>
                              <TableCell className="text-right text-warning">
                                {o.creditAmount > 0 ? `₹${Math.round(o.creditAmount).toLocaleString('en-IN')}` : '-'}
                              </TableCell>
                              <TableCell className="text-right text-success">
                                ₹{Math.round(o.cashInHand).toLocaleString('en-IN')}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="text-xs">
                                  {o.paymentMethod}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground">
                              No orders placed today
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {dialogContentType === "visits" && (
                <div className="space-y-2">
                  {dialogFilter === "Productive" ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Store Name</TableHead>
                          <TableHead className="text-right">Total Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(visitsByStatus["Productive"] || []).map((v, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{v.retailer}</TableCell>
                            <TableCell className="text-right text-success font-semibold">
                              ₹{Math.round(v.totalValue || 0).toLocaleString('en-IN')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : dialogFilter === "Unproductive" ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Store Name</TableHead>
                          <TableHead className="text-right">Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(visitsByStatus["Unproductive"] || []).map((v, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{v.retailer}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{v.note}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : dialogFilter === "Planned" ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Store Name</TableHead>
                          <TableHead>Beat</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Address</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(visitsByStatus["Planned"] || []).map((v, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{v.retailer}</TableCell>
                            <TableCell className="text-muted-foreground">{v.beatName || 'N/A'}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {v.planDate ? format(new Date(v.planDate), 'dd MMM') : 'N/A'}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground text-xs max-w-[120px] truncate">{v.address || 'N/A'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : dialogFilter === "Pending" ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Store Name</TableHead>
                          <TableHead>Beat</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Address</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(visitsByStatus["Pending"] || []).map((v, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{v.retailer}</TableCell>
                            <TableCell className="text-muted-foreground">{v.beatName || 'N/A'}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {v.planDate ? format(new Date(v.planDate), 'dd MMM') : 'N/A'}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground text-xs max-w-[120px] truncate">{v.address || 'N/A'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Store Name</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(visitsByStatus[dialogFilter || ""] || []).map((v, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{v.retailer}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  {(!visitsByStatus[dialogFilter || ""] || visitsByStatus[dialogFilter || ""].length === 0) && (
                    <div className="text-sm text-muted-foreground text-center py-4">No records available.</div>
                  )}
                </div>
              )}

              {dialogContentType === "efficiency" && (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span>Planned Visits</span>
                    <span className="font-semibold">{summaryData.plannedVisits}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Completed Visits</span>
                    <span className="font-semibold">{summaryData.completedVisits}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Visit Efficiency</span>
                    <span className="font-semibold">{summaryData.visitEfficiency}%</span>
                  </div>
                  <div className="pt-2">
                    <div className="mb-2 text-muted-foreground">Completed Visits</div>
                    <div className="space-y-2">
                      {(visitsByStatus["Productive"] || []).map((v, idx) => (
                        <div key={idx} className="p-3 rounded-md bg-muted/50">
                          <div className="font-medium">{v.retailer}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* Joint Sales Feedback View Modal */}
        {selectedJointFeedback && (
          <JointSalesFeedbackViewModal
            isOpen={jointFeedbackViewOpen}
            onClose={() => {
              setJointFeedbackViewOpen(false);
              setSelectedJointFeedback(null);
            }}
            retailerId={selectedJointFeedback.retailerId}
            retailerName={selectedJointFeedback.retailerName}
            feedbackDate={selectedJointFeedback.feedbackDate}
            onEdit={() => {}}
            onDeleted={() => {
              setJointFeedbackViewOpen(false);
              setSelectedJointFeedback(null);
            }}
          />
        )}

        {/* Time at Retailers Modal */}
        <Dialog open={timeAtRetailersModalOpen} onOpenChange={setTimeAtRetailersModalOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Clock size={18} className="text-warning" />
                Time at Retailers
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="text-center text-2xl font-bold text-warning mb-4">
                {summaryData.travelTime}
              </div>
              
              {firstLastRetailerVisit.first ? (
                <div className="space-y-3">
                  <div className="p-3 bg-success/10 rounded-lg border border-success/20">
                    <div className="text-xs text-muted-foreground mb-1">First Visit</div>
                    <div className="font-semibold">{firstLastRetailerVisit.first.retailerName}</div>
                    <div className="text-sm text-success flex items-center gap-1 mt-1">
                      <Clock size={12} />
                      {firstLastRetailerVisit.first.time}
                    </div>
                  </div>
                  
                  {firstLastRetailerVisit.last && (
                    <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                      <div className="text-xs text-muted-foreground mb-1">Last Visit</div>
                      <div className="font-semibold">{firstLastRetailerVisit.last.retailerName}</div>
                      <div className="text-sm text-destructive flex items-center gap-1 mt-1">
                        <Clock size={12} />
                        {firstLastRetailerVisit.last.time}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-4">
                  No retailer visits recorded for this period
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </div>
    </Layout>
  );
};