import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from "recharts";
import { ArrowLeft, TrendingUp, TrendingDown, Users, ShoppingCart, Target, Heart, RefreshCw, Activity, Info, Calendar as CalendarIcon, Sparkles, AlertTriangle, MessageSquare, X, MapPin, Store, Package, IndianRupee, CreditCard, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfDay, subDays, subWeeks, subMonths, subQuarters, startOfYear, endOfYear } from "date-fns";
import { cn } from "@/lib/utils";
import { PerformanceCalendar } from "@/components/PerformanceCalendar";
import {
  AttendanceCard,
  ActivitiesCard,
  ExpensesCard,
  ComplianceCard,
  TeamStatusCard,
  CurrentActivitiesCard,
  AdditionsCard,
  LeaderboardCard,
  BusinessSummaryCard,
  BeatDetailsDialog,
  RetailerDetailsDialog,
  OrderDetailsDialog,
  ProductBreakdownDialog,
  AnalyticsTargetDashboard,
  PendingPaymentsDialog,
  useBusinessMetrics
} from "@/components/analytics";
import { RetailerMonthlyProductivitySection } from "@/components/analytics/RetailerMonthlyProductivitySection";
import { SupervisorReport } from "@/components/analytics/SupervisorReport";
import { CoverageMapSection } from "@/components/analytics/CoverageMapSection";
import { useSubordinates } from "@/hooks/useSubordinates";
import { useAuth } from "@/hooks/useAuth";
import { useProfilePermissions } from "@/hooks/useProfilePermissions";
import { useAdminAccess } from "@/hooks/useAdminAccess";
interface UserProfile {
  id: string;
  full_name: string | null;
  profile_picture_url?: string | null;
}

const Analytics = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { permissions, hasPermission: hasFeaturePermission } = useProfilePermissions();
  const hasSecurityProfile = permissions.length > 0;
  const canShowTab = (featureName: string) => !hasSecurityProfile || hasFeaturePermission(featureName, 'can_read');
  
  const showProductivityTab = canShowTab('analytics_business_summary');
  const showTargetTab = canShowTab('analytics_order_details');
  const showProductsTab = canShowTab('analytics_product_breakdown');
  
  const { subordinateIds, isLoading: subordinatesLoading } = useSubordinates();
  const [hasLiked, setHasLiked] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userScopeMode, setUserScopeMode] = useState<'my_scope' | 'all' | 'custom'>('my_scope');
  const [userSelectOpen, setUserSelectOpen] = useState(false);
  const [showDatePickers, setShowDatePickers] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [dashboardDateRange, setDashboardDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfWeek(new Date(), { weekStartsOn: 1 }),
    to: new Date()
  });
  const [dashboardDateOpen, setDashboardDateOpen] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);

  const normalizeName = (name: string | null | undefined) => (name ?? '').trim().toUpperCase();

  // Memoize date range to prevent unnecessary re-renders in child components
  const stableDashboardDateRange = useMemo(() => dashboardDateRange, [
    dashboardDateRange.from.getTime(),
    dashboardDateRange.to.getTime()
  ]);

  // Determine if scope is ready (subordinates loaded when needed)
  const isScopeReady = userScopeMode !== 'my_scope' || !subordinatesLoading;

  // Calculate effective user IDs based on scope mode (matching Target Management logic)
  const effectiveUserIds = useMemo(() => {
    // Don't compute until subordinates are loaded for my_scope
    if (userScopeMode === 'my_scope' && subordinatesLoading) {
      return [];
    }
    
    switch (userScopeMode) {
      case 'my_scope':
        // Self + all subordinates (same as Target Management "team" scope)
        return currentUser?.id ? [currentUser.id, ...subordinateIds] : [];
      case 'all':
        // All users (empty array means "All Users" in the existing logic)
        return [];
      case 'custom':
        // Manually selected users
        return selectedUserIds;
      default:
        return [];
    }
  }, [userScopeMode, currentUser?.id, subordinateIds, selectedUserIds, subordinatesLoading]);

  const [kpiPeriod, setKpiPeriod] = useState<string>('current_month');
  const [kpiDateRange, setKpiDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });
  const [showCustomKpiDate, setShowCustomKpiDate] = useState(false);
  const [lastSynced, setLastSynced] = useState(new Date());
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'quarter' | 'custom'>('week');
  const [dashboardPeriod, setDashboardPeriod] = useState<string>('this_week');
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfWeek(new Date(), { weekStartsOn: 1 }),
    to: new Date()
  });
  
  // Dialog states for business metrics
  const [showBeatDetails, setShowBeatDetails] = useState(false);
  const [showRetailerDetails, setShowRetailerDetails] = useState(false);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [showProductBreakdown, setShowProductBreakdown] = useState(false);
  const [showPendingPayments, setShowPendingPayments] = useState(false);
  
  // Business metrics hook
  const {
    summary: businessSummary,
    isLoading: businessLoading,
    fetchSummary: fetchBusinessSummary,
    beatDetails,
    retailerDetails,
    orderDetails,
    productDetails,
    pendingPaymentDetails,
    detailsLoading,
    fetchBeatDetails,
    fetchRetailerDetails,
    fetchOrderDetails,
    fetchProductDetails,
    fetchPendingPaymentDetails
  } = useBusinessMetrics();

  // Auto-refresh business metrics when filters change
  useEffect(() => {
    // Don't fetch until scope is ready (subordinates loaded for my_scope)
    if (!isScopeReady) return;
    
    // Get user names for effective user IDs to use with RPC
    const selectedUserNames = effectiveUserIds
      .map(id => users.find(u => u.id === id)?.full_name)
      .filter((name): name is string => !!name);
    
    fetchBusinessSummary(effectiveUserIds, stableDashboardDateRange, selectedUserNames);
  }, [effectiveUserIds, stableDashboardDateRange, fetchBusinessSummary, users, isScopeReady]);

  const [kpiData, setKpiData] = useState({
    plannedCalls: 0,
    productiveCalls: 0,
    strikeRate: 0,
    geoCode: 0,
    deliveredVolume: 0,
    targetVolume: 10000,
    deliveredRevenue: 0,
    targetRevenue: 5000000,
    avgOrderValue: 0,
    newRetailers: 0,
  });
  const [loading, setLoading] = useState(false);
  const [weeklyProgress, setWeeklyProgress] = useState<any[]>([]);
  const [productData, setProductData] = useState<any[]>([]);
  const [productRevenueView, setProductRevenueView] = useState<'top5' | 'bottom5'>('top5');
  const [productQuantityView, setProductQuantityView] = useState<'top5' | 'bottom5'>('top5');
  const [topRetailers, setTopRetailers] = useState<any[]>([]);
  const [bottomRetailers, setBottomRetailers] = useState<any[]>([]);
  const [retailerFeedback, setRetailerFeedback] = useState<any[]>([]);
  const [predictions, setPredictions] = useState<any>({
    targetChance: 0,
    topRetailers: [],
    topProducts: [],
    topTerritories: []
  });

  // SQL Report state
  const [sqlReportUser, setSqlReportUser] = useState<string>('');
  const [sqlReportData, setSqlReportData] = useState<any[]>([]);
  const [sqlReportLoading, setSqlReportLoading] = useState(false);
  const [sqlReportDateRange, setSqlReportDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 7),
    to: new Date()
  });

  // Productivity Report state
  const [productivityUser, setProductivityUser] = useState<string>('');
  const [productivityData, setProductivityData] = useState<any[]>([]);
  const [productivityLoading, setProductivityLoading] = useState(false);
  const [productivityDateRange, setProductivityDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 7),
    to: new Date()
  });

  // Product Revenue Performance state
  const [productRevenueUser, setProductRevenueUser] = useState<string>('');
  const [productRevenueData, setProductRevenueData] = useState<any[]>([]);
  const [productRevenueLoading, setProductRevenueLoading] = useState(false);
  const [productRevenueDateRange, setProductRevenueDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 7),
    to: new Date()
  });

  // Dashboard data state
  const [dashboardData, setDashboardData] = useState({
    attendance: { totalUsers: 0, punchedIn: 0, onField: 0, inOffice: 0, expected: 0 },
    activities: { total: 0, completed: 0, ongoing: 0, scheduled: 0, missed: 0 },
    expenses: { totalClaimed: 0, pending: 0, approved: 0, rejected: 0 },
    compliance: { appNotInstalled: 0, gpsDisabled: 0, notLoggedIn: 0, locationSpoofing: 0, appNotUpdated: 0 },
    additions: { formsCount: 0, customersCount: 0 },
    teamMembers: [] as any[],
    currentActivities: [] as any[],
    leaderboard: [] as any[]
  });

  // Fetch all users for filtering
  useEffect(() => {
    const fetchUsers = async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, profile_picture_url')
        .order('full_name');
      
      if (profiles) {
        setUsers(profiles);
      }
    };
    fetchUsers();
  }, []);

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      // Build query conditions based on selected user
      const userFilter = selectedUserId !== 'all' ? selectedUserId : null;

      // Fetch attendance data
      let attendanceQuery = supabase
        .from('attendance')
        .select('*')
        .eq('date', today);
      
      if (userFilter) {
        attendanceQuery = attendanceQuery.eq('user_id', userFilter);
      }
      
      const { data: attendance } = await attendanceQuery;
      
      const punchedIn = attendance?.filter(a => a.check_in_time && !a.check_out_time).length || 0;
      const punchedOut = attendance?.filter(a => a.check_out_time).length || 0;

      // Fetch visits for activities
      let visitsQuery = supabase
        .from('visits')
        .select('*')
        .eq('planned_date', today);
      
      if (userFilter) {
        visitsQuery = visitsQuery.eq('user_id', userFilter);
      }
      
      const { data: visits } = await visitsQuery;

      const completed = visits?.filter(v => v.check_out_time).length || 0;
      const ongoing = visits?.filter(v => v.check_in_time && !v.check_out_time).length || 0;
      const scheduled = visits?.filter(v => !v.check_in_time && v.status !== 'cancelled').length || 0;
      const missed = visits?.filter(v => v.status === 'cancelled' || v.status === 'no_order').length || 0;

      // Fetch expenses
      let expensesQuery = supabase
        .from('additional_expenses')
        .select('*')
        .gte('expense_date', format(startOfMonth(new Date()), 'yyyy-MM-dd'))
        .lte('expense_date', format(endOfMonth(new Date()), 'yyyy-MM-dd'));
      
      if (userFilter) {
        expensesQuery = expensesQuery.eq('user_id', userFilter);
      }
      
      const { data: expenses } = await expensesQuery;
      
      const totalExpenses = expenses?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;

      // Fetch new retailers (customers) this month
      let retailersQuery = supabase
        .from('retailers')
        .select('id')
        .gte('created_at', startOfMonth(new Date()).toISOString())
        .lte('created_at', endOfMonth(new Date()).toISOString());
      
      if (userFilter) {
        retailersQuery = retailersQuery.eq('user_id', userFilter);
      }
      
      const { data: newRetailers } = await retailersQuery;

      // Fetch team members with their status
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, profile_picture_url');

      // Fetch retailers to get names for visits
      const retailerIds = visits?.map(v => v.retailer_id).filter(Boolean) || [];
      const { data: retailers } = await supabase
        .from('retailers')
        .select('id, name')
        .in('id', retailerIds);

      const teamMembers = await Promise.all((profiles || []).map(async (profile) => {
        const { data: att } = await supabase
          .from('attendance')
          .select('*')
          .eq('user_id', profile.id)
          .eq('date', today)
          .maybeSingle();

        let status: 'punched_in' | 'punched_out' | 'in_transit' | 'in_meeting' | 'on_leave' = 'punched_out';
        let punchTime = '';
        
        if (att?.check_in_time && !att?.check_out_time) {
          status = 'punched_in';
          punchTime = `Punched in ${format(new Date(att.check_in_time), 'h:mm a')}`;
        } else if (att?.check_out_time) {
          status = 'punched_out';
          punchTime = `Punched out ${format(new Date(att.check_out_time), 'h:mm a')}`;
        }

        return {
          id: profile.id,
          name: profile.full_name || 'Unknown',
          avatarUrl: profile.profile_picture_url,
          status,
          punchTime,
          location: att?.check_in_address || ''
        };
      }));

      // Current activities
      const currentActivities = (visits || []).slice(0, 10).map(v => {
        const retailer = retailers?.find(r => r.id === v.retailer_id);
        return {
          id: v.id,
          retailerName: retailer?.name || 'Unknown',
          userName: '',
          status: v.check_out_time ? 'completed' : v.check_in_time ? 'ongoing' : 'scheduled',
          time: v.check_in_time ? format(new Date(v.check_in_time), 'h:mm a') : ''
        };
      });

      // Leaderboard - based on order value
      let ordersQuery = supabase
        .from('orders')
        .select('user_id, total_amount')
        .gte('created_at', startOfMonth(new Date()).toISOString())
        .eq('status', 'confirmed');
      
      const { data: orders } = await ordersQuery;

      const userScores: Record<string, number> = {};
      orders?.forEach(order => {
        if (order.user_id) {
          userScores[order.user_id] = (userScores[order.user_id] || 0) + (order.total_amount || 0);
        }
      });

      const leaderboard = Object.entries(userScores)
        .map(([userId, score]) => {
          const profile = profiles?.find(p => p.id === userId);
          return {
            id: userId,
            name: profile?.full_name || 'Unknown',
            avatarUrl: profile?.profile_picture_url,
            score: Math.round(score),
            rank: 0
          };
        })
        .sort((a, b) => b.score - a.score)
        .map((item, index) => ({ ...item, rank: index + 1 }));

      setDashboardData({
        attendance: {
          totalUsers: profiles?.length || 0,
          punchedIn,
          onField: punchedIn,
          inOffice: 0,
          expected: (profiles?.length || 0) - punchedIn - punchedOut
        },
        activities: {
          total: visits?.length || 0,
          completed,
          ongoing,
          scheduled,
          missed
        },
        expenses: {
          totalClaimed: totalExpenses,
          pending: totalExpenses * 0.4,
          approved: totalExpenses * 0.5,
          rejected: totalExpenses * 0.1
        },
        compliance: {
          appNotInstalled: 3,
          gpsDisabled: 1,
          notLoggedIn: 5,
          locationSpoofing: 2,
          appNotUpdated: 16
        },
        additions: {
          formsCount: completed,
          customersCount: newRetailers?.length || 0
        },
        teamMembers: userFilter ? teamMembers.filter(m => m.id === userFilter) : teamMembers,
        currentActivities,
        leaderboard
      });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [selectedUserId]);

  // Auto-fetch when date range changes (from period selector or manual date picks)
  useEffect(() => {
    if (users.length > 0 && selectedUserIds.length > 0) {
      const selectedUserNames = selectedUserIds
        .map(id => users.find(u => u.id === id)?.full_name)
        .filter((name): name is string => !!name);
      fetchBusinessSummary(selectedUserIds, dashboardDateRange, selectedUserNames);
    }
  }, [dashboardDateRange]);

  // Fetch SQL Report data
  const fetchSqlReportData = async () => {
    if (!sqlReportUser) {
      setSqlReportData([]);
      return;
    }
    
    setSqlReportLoading(true);
    try {
      const fromDate = format(sqlReportDateRange.from, 'yyyy-MM-dd');
      const toDate = format(sqlReportDateRange.to, 'yyyy-MM-dd');
      
      const isManvith = sqlReportUser.trim().toUpperCase().startsWith('MANVITH');
      
      let orders: { order_date: string; total_amount: number | null }[] = [];
      
      if (isManvith) {
        // Special query for MANVITH - first get all user IDs matching MANVITH%
        const manvithProfiles = users.filter(u => 
          u.full_name?.trim().toUpperCase().startsWith('MANVITH')
        );
        
        if (manvithProfiles.length === 0) {
          setSqlReportData([]);
          setSqlReportLoading(false);
          return;
        }
        
        const manvithUserIds = manvithProfiles.map(p => p.id);
        
        const { data, error } = await supabase
          .from('orders')
          .select('order_date, total_amount')
          .in('user_id', manvithUserIds)
          .eq('status', 'confirmed')
          .gte('order_date', fromDate)
          .lte('order_date', toDate)
          .order('order_date', { ascending: true });
        
        if (error) {
          console.error('Error fetching SQL report for MANVITH:', error);
          setSqlReportData([]);
          setSqlReportLoading(false);
          return;
        }
        orders = data || [];
      } else {
        // Standard query for other users - find profile first
        const profile = users.find(u => u.full_name === sqlReportUser);
        
        if (!profile) {
          setSqlReportData([]);
          setSqlReportLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('orders')
          .select('order_date, total_amount')
          .eq('user_id', profile.id)
          .eq('status', 'confirmed')
          .gte('order_date', fromDate)
          .lte('order_date', toDate)
          .order('order_date', { ascending: true });

        if (error) {
          console.error('Error fetching SQL report:', error);
          setSqlReportData([]);
          setSqlReportLoading(false);
          return;
        }
        orders = data || [];
      }

      // Group by date and sum totals
      const groupedData: Record<string, { order_date: string; full_name: string; total_order_value: number }> = {};
      
      orders?.forEach(order => {
        const dateKey = order.order_date;
        if (!groupedData[dateKey]) {
          groupedData[dateKey] = {
            order_date: dateKey,
            full_name: sqlReportUser,
            total_order_value: 0
          };
        }
        groupedData[dateKey].total_order_value += Number(order.total_amount || 0);
      });

      setSqlReportData(Object.values(groupedData).sort((a, b) => 
        new Date(a.order_date).getTime() - new Date(b.order_date).getTime()
      ));
    } catch (error) {
      console.error('Error in SQL report:', error);
      setSqlReportData([]);
    } finally {
      setSqlReportLoading(false);
    }
  };

  useEffect(() => {
    if (sqlReportUser) {
      fetchSqlReportData();
    }
  }, [sqlReportUser, sqlReportDateRange]);

  // Fetch Productivity Report data
  const fetchProductivityData = async () => {
    if (!productivityUser) {
      setProductivityData([]);
      return;
    }
    
    setProductivityLoading(true);
    try {
      // Call the RPC function with the selected user's full_name and date range
      const { data, error } = await supabase.rpc('get_productivity_summary', {
        user_full_name: productivityUser,
        start_date: format(productivityDateRange.from, 'yyyy-MM-dd'),
        end_date: format(productivityDateRange.to, 'yyyy-MM-dd')
      });

      if (error) {
        console.error('Error fetching productivity report:', error);
        setProductivityData([]);
        setProductivityLoading(false);
        return;
      }

      setProductivityData(data || []);
    } catch (error) {
      console.error('Error in productivity report:', error);
      setProductivityData([]);
    } finally {
      setProductivityLoading(false);
    }
  };

  useEffect(() => {
    if (productivityUser) {
      fetchProductivityData();
    }
  }, [productivityUser, productivityDateRange]);

  // Fetch Product Revenue Performance data
  const fetchProductRevenueData = async () => {
    if (!productRevenueUser) {
      setProductRevenueData([]);
      return;
    }
    
    setProductRevenueLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_product_revenue_performance', {
        user_full_name: productRevenueUser,
        start_date: format(productRevenueDateRange.from, 'yyyy-MM-dd'),
        end_date: format(productRevenueDateRange.to, 'yyyy-MM-dd')
      });

      if (error) {
        console.error('Error fetching product revenue report:', error);
        setProductRevenueData([]);
        setProductRevenueLoading(false);
        return;
      }

      // Sort by revenue in descending order
      const sortedData = (data || []).sort((a: any, b: any) => (b.revenue || 0) - (a.revenue || 0));
      setProductRevenueData(sortedData);
    } catch (error) {
      console.error('Error in product revenue report:', error);
      setProductRevenueData([]);
    } finally {
      setProductRevenueLoading(false);
    }
  };

  useEffect(() => {
    if (productRevenueUser) {
      fetchProductRevenueData();
    }
  }, [productRevenueUser, productRevenueDateRange]);

  const handleKpiPeriodChange = (value: string) => {
    setKpiPeriod(value);
    const now = new Date();
    let from: Date, to: Date;

    switch (value) {
      case 'today':
        from = startOfDay(now);
        to = now;
        break;
      case 'yesterday':
        from = startOfDay(subDays(now, 1));
        to = startOfDay(now);
        break;
      case 'current_week':
        from = startOfWeek(now);
        to = endOfWeek(now);
        break;
      case 'last_week':
        from = startOfWeek(subWeeks(now, 1));
        to = endOfWeek(subWeeks(now, 1));
        break;
      case 'current_month':
        from = startOfMonth(now);
        to = endOfMonth(now);
        break;
      case 'last_month':
        from = startOfMonth(subMonths(now, 1));
        to = endOfMonth(subMonths(now, 1));
        break;
      case 'current_quarter':
        from = startOfQuarter(now);
        to = endOfQuarter(now);
        break;
      case 'last_quarter':
        from = startOfQuarter(subQuarters(now, 1));
        to = endOfQuarter(subQuarters(now, 1));
        break;
      case 'full_year':
        from = startOfYear(now);
        to = endOfYear(now);
        break;
      case 'custom':
        setShowCustomKpiDate(true);
        return;
      default:
        from = startOfMonth(now);
        to = endOfMonth(now);
    }

    setKpiDateRange({ from, to });
    setShowCustomKpiDate(false);
  };

  const fetchKPIData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const startDate = kpiDateRange.from;
      const endDate = kpiDateRange.to;

      const { data: visits } = await supabase
        .from('visits')
        .select('*')
        .eq('user_id', user.id)
        .gte('planned_date', format(startDate, 'yyyy-MM-dd'))
        .lte('planned_date', format(endDate, 'yyyy-MM-dd'));

      const { data: orders } = await supabase
        .from('orders')
        .select('*, order_items!order_items_order_id_fkey(*)')
        .eq('user_id', user.id)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      const { data: newRetailers } = await supabase
        .from('retailers')
        .select('id')
        .eq('user_id', user.id)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      const plannedCalls = visits?.length || 0;
      const completedVisits = visits?.filter(v => v.check_in_time && v.check_out_time) || [];
      const productiveCalls = completedVisits.filter(v => 
        orders?.some(o => o.visit_id === v.id)
      ).length;
      
      const strikeRate = plannedCalls > 0 ? (productiveCalls / plannedCalls) * 100 : 0;
      
      const visitsWithLocation = completedVisits.filter(v => v.location_match_in);
      const geoCode = completedVisits.length > 0 ? (visitsWithLocation.length / completedVisits.length) * 100 : 0;

      let totalQuantity = 0;
      let totalRevenue = 0;
      
      orders?.forEach(order => {
        totalRevenue += Number(order.total_amount || 0);
        order.order_items?.forEach((item: any) => {
          totalQuantity += Number(item.quantity || 0);
        });
      });

      const avgOrderValue = orders && orders.length > 0 ? totalRevenue / orders.length : 0;

      setKpiData({
        plannedCalls,
        productiveCalls,
        strikeRate: Math.round(strikeRate * 100) / 100,
        geoCode: Math.round(geoCode * 100) / 100,
        deliveredVolume: totalQuantity,
        targetVolume: 10000,
        deliveredRevenue: totalRevenue,
        targetRevenue: 5000000,
        avgOrderValue: Math.round(avgOrderValue),
        newRetailers: newRetailers?.length || 0,
      });

      setLastSynced(new Date());
    } catch (error) {
      console.error('Error fetching KPI data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch analytics data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchWeeklyProgress = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: visits } = await supabase
        .from('visits')
        .select('*')
        .eq('user_id', user.id)
        .gte('planned_date', format(dateRange.from, 'yyyy-MM-dd'))
        .lte('planned_date', format(dateRange.to, 'yyyy-MM-dd'))
        .order('planned_date', { ascending: true });

      const retailerIds = visits?.map(v => v.retailer_id) || [];
      const { data: retailers } = await supabase
        .from('retailers')
        .select('id, name, beat_name')
        .in('id', retailerIds);

      // Fetch orders by date range instead of visit_id
      const { data: orders } = await supabase
        .from('orders')
        .select('id, total_amount, created_at, visit_id')
        .eq('user_id', user.id)
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());

      const progressByDate: any = {};
      
      // First process visits
      visits?.forEach(visit => {
        const dateKey = visit.planned_date;
        const retailer = retailers?.find(r => r.id === visit.retailer_id);
        if (!progressByDate[dateKey]) {
          progressByDate[dateKey] = {
            date: dateKey,
            day: format(new Date(dateKey), 'EEE'),
            beatName: retailer?.beat_name || 'N/A',
            plannedVisits: 0,
            completedVisits: 0,
            productiveVisits: 0,
            orderValue: 0
          };
        }
        
        progressByDate[dateKey].plannedVisits += 1;
        
        if (visit.check_in_time && visit.check_out_time) {
          progressByDate[dateKey].completedVisits += 1;
          if (visit.status === 'productive') {
            progressByDate[dateKey].productiveVisits += 1;
          }
        }
      });

      // Then add order values by date (using created_at date)
      orders?.forEach(order => {
        const orderDate = format(new Date(order.created_at), 'yyyy-MM-dd');
        if (!progressByDate[orderDate]) {
          progressByDate[orderDate] = {
            date: orderDate,
            day: format(new Date(orderDate), 'EEE'),
            beatName: 'N/A',
            plannedVisits: 0,
            completedVisits: 0,
            productiveVisits: 0,
            orderValue: 0
          };
        }
        progressByDate[orderDate].orderValue += Number(order.total_amount || 0);
      });

      setWeeklyProgress(Object.values(progressByDate));
    } catch (error) {
      console.error('Error fetching weekly progress:', error);
    }
  };

  const fetchProductData = async (userIds: string[], dateRangeFilter: { from: Date; to: Date }) => {
    try {
      const fromDate = format(dateRangeFilter.from, 'yyyy-MM-dd');
      const toDate = format(dateRangeFilter.to, 'yyyy-MM-dd');

      // Query orders for date range - same logic as SKU Revenue Summary
      let query = supabase
        .from('orders')
        .select('id, order_date')
        .eq('status', 'confirmed')
        .gte('order_date', fromDate)
        .lte('order_date', toDate);

      // Only apply user filter if specific users are selected (not "All Users")
      // This matches the SKU Revenue Summary logic
      if (userIds.length > 0) {
        query = query.in('user_id', userIds);
      }

      const { data: orders } = await query;

      if (!orders || orders.length === 0) {
        setProductData([]);
        return;
      }

      const orderIds = orders.map((o: any) => o.id);

      // Fetch order items for these orders
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('order_id, product_name, quantity, unit, total')
        .in('order_id', orderIds);

      const productMap: any = {};
      
      orderItems?.forEach((item: any) => {
        const productName = item.product_name || 'Unknown';
        
        if (!productMap[productName]) {
          productMap[productName] = {
            name: productName,
            quantity: 0,
            revenue: 0,
            unit: 'KG'
          };
        }
        
        // Convert grams to KG - same logic as SKU Revenue Summary
        const qty = Number(item.quantity || 0);
        const unit = (item.unit || '').toLowerCase();
        if (unit === 'grams' || unit === 'gram' || unit === 'g') {
          productMap[productName].quantity += qty / 1000;
        } else {
          productMap[productName].quantity += qty;
        }
        productMap[productName].revenue += Number(item.total || 0);
      });

      const productArray = Object.values(productMap).sort((a: any, b: any) => b.revenue - a.revenue);
      setProductData(productArray);
    } catch (error) {
      console.error('Error fetching product data:', error);
    }
  };

  const fetchRetailerRankings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: visits } = await supabase
        .from('visits')
        .select('id, retailer_id')
        .eq('user_id', user.id)
        .gte('planned_date', format(dateRange.from, 'yyyy-MM-dd'))
        .lte('planned_date', format(dateRange.to, 'yyyy-MM-dd'))
        .not('check_in_time', 'is', null)
        .not('check_out_time', 'is', null);

      const retailerIds = [...new Set(visits?.map(v => v.retailer_id) || [])];
      const { data: retailers } = await supabase
        .from('retailers')
        .select('id, name, address')
        .in('id', retailerIds);

      const visitIds = visits?.map(v => v.id) || [];
      const { data: orders } = await supabase
        .from('orders')
        .select('visit_id, retailer_id, total_amount')
        .in('visit_id', visitIds);

      const { data: feedbackData } = await supabase
        .from('retailer_feedback')
        .select('*')
        .in('retailer_id', retailerIds)
        .eq('user_id', user.id);

      const retailerMap: any = {};
      
      visits?.forEach(visit => {
        const retailerId = visit.retailer_id;
        const retailer = retailers?.find(r => r.id === retailerId);
        if (!retailerMap[retailerId]) {
          retailerMap[retailerId] = {
            id: retailerId,
            name: retailer?.name || 'Unknown',
            address: retailer?.address || 'N/A',
            productiveVisits: 0,
            orderValue: 0,
            feedback: feedbackData?.filter(f => f.retailer_id === retailerId) || []
          };
        }
        
        const visitOrders = orders?.filter(o => o.visit_id === visit.id) || [];
        if (visitOrders.length > 0) {
          retailerMap[retailerId].productiveVisits += 1;
          retailerMap[retailerId].orderValue += visitOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
        }
      });

      const retailerArray = Object.values(retailerMap).filter((r: any) => r.productiveVisits > 0);
      retailerArray.sort((a: any, b: any) => b.orderValue - a.orderValue);

      setTopRetailers(retailerArray.slice(0, 10));
      setBottomRetailers(retailerArray.slice(-10).reverse());
      
      // Set retailer feedback
      const allFeedback = retailerArray.flatMap((r: any) => 
        r.feedback.map((f: any) => ({
          ...f,
          retailerName: r.name
        }))
      );
      setRetailerFeedback(allFeedback);
    } catch (error) {
      console.error('Error fetching retailer rankings:', error);
    }
  };

  const calculatePredictions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Calculate target achievement chance based on current progress
      const targetAchievement = kpiData.targetRevenue > 0 
        ? (kpiData.deliveredRevenue / kpiData.targetRevenue) * 100 
        : 0;
      
      // Simple prediction: if we're at X% achievement at current point in time period
      const daysInPeriod = Math.ceil((kpiDateRange.to.getTime() - kpiDateRange.from.getTime()) / (1000 * 60 * 60 * 24));
      const daysElapsed = Math.ceil((new Date().getTime() - kpiDateRange.from.getTime()) / (1000 * 60 * 60 * 24));
      const expectedProgress = daysInPeriod > 0 ? (daysElapsed / daysInPeriod) * 100 : 0;
      
      let targetChance = 50; // Default
      if (expectedProgress > 0) {
        targetChance = Math.min(100, Math.round((targetAchievement / expectedProgress) * 100));
      }

      // Predict top retailers based on order value growth
      const topRetailersPredicted = topRetailers.slice(0, 5).map(r => ({
        name: r.name,
        predictedGrowth: Math.round(10 + Math.random() * 20), // Simplified prediction
        currentValue: r.orderValue
      }));

      // Predict top products based on quantity trends
      const topProductsPredicted = productData.slice(0, 5).map(p => ({
        name: p.name,
        predictedDemand: Math.round(p.quantity * (1.1 + Math.random() * 0.3)),
        currentQuantity: p.quantity
      }));

      // Fetch territory data for predictions
      const { data: beats } = await supabase
        .from('beat_plans')
        .select('beat_name')
        .eq('user_id', user.id);

      const uniqueBeats = [...new Set(beats?.map(b => b.beat_name) || [])];
      const topTerritories = uniqueBeats.slice(0, 3).map(beat => ({
        name: beat,
        predictedGrowth: Math.round(15 + Math.random() * 25)
      }));

      setPredictions({
        targetChance,
        topRetailers: topRetailersPredicted,
        topProducts: topProductsPredicted,
        topTerritories
      });
    } catch (error) {
      console.error('Error calculating predictions:', error);
    }
  };

  const handlePeriodChange = (period: 'week' | 'month' | 'quarter' | 'custom') => {
    setSelectedPeriod(period);
    
    if (period !== 'custom') {
      const now = new Date();
      let from: Date, to: Date;
      
      switch (period) {
        case 'week':
          from = startOfWeek(now);
          to = endOfWeek(now);
          break;
        case 'month':
          from = startOfMonth(now);
          to = endOfMonth(now);
          break;
        case 'quarter':
          from = startOfQuarter(now);
          to = endOfQuarter(now);
          break;
      }
      
      setDateRange({ from, to });
    }
  };

  useEffect(() => {
    fetchKPIData();
  }, [kpiDateRange]);

  useEffect(() => {
    fetchWeeklyProgress();
    fetchRetailerRankings();
  }, [dateRange]);

  // Fetch product data when dashboard filters change
  useEffect(() => {
    fetchProductData(selectedUserIds, stableDashboardDateRange);
  }, [selectedUserIds, stableDashboardDateRange]);

  useEffect(() => {
    if (kpiData.deliveredRevenue > 0) {
      calculatePredictions();
    }
  }, [kpiData, topRetailers, productData]);

  useEffect(() => {
    const checkLikeStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from('analytics_likes')
            .select('id')
            .eq('user_id', user.id)
            .eq('page_type', 'general_analytics')
            .maybeSingle();
          
          if (data && !error) {
            setHasLiked(true);
          }
        }
      } catch (error) {
        console.log('Like status check error:', error);
      }
    };

    checkLikeStatus();
  }, []);

  const handleLike = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        if (hasLiked) {
          await supabase
            .from('analytics_likes')
            .delete()
            .eq('user_id', user.id)
            .eq('page_type', 'general_analytics');
          
          setHasLiked(false);
          toast({
            title: "Feedback Removed",
            description: "Thank you for your feedback!"
          });
        } else {
          await supabase
            .from('analytics_likes')
            .insert({
              user_id: user.id,
              page_type: 'general_analytics'
            });
          
          setHasLiked(true);
          toast({
            title: "Thank you!",
            description: "Your positive feedback helps us improve analytics!"
          });
        }
      }
    } catch (error) {
      console.log('Like action error:', error);
      toast({
        title: "Error",
        description: "Could not record feedback. Please try again.",
        variant: "destructive"
      });
    }
  };

  const getPeriodLabel = () => {
    switch (kpiPeriod) {
      case 'today': return 'Today';
      case 'yesterday': return 'Yesterday';
      case 'current_week': return 'Current Week';
      case 'last_week': return 'Last Week';
      case 'current_month': return 'Current Month';
      case 'last_month': return 'Last Month';
      case 'current_quarter': return 'Current Quarter';
      case 'last_quarter': return 'Last Quarter';
      case 'full_year': return 'Full Year';
      case 'custom': return 'Custom Range';
      default: return 'Current Month';
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <div className="relative overflow-hidden bg-gradient-primary text-primary-foreground">
          <div className="absolute inset-0 bg-gradient-to-r from-black/10 to-transparent"></div>
          <div className="relative p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(-1)}
                  className="text-primary-foreground hover:bg-primary-foreground/20"
                >
                  <ArrowLeft size={20} />
                </Button>
                <div>
                  <h1 className="text-2xl font-bold">Analytics & Insights</h1>
                  <p className="text-primary-foreground/80 text-sm">Real-time business analytics</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLike}
                  className={`text-primary-foreground hover:bg-primary-foreground/20 ${
                    hasLiked ? "bg-primary-foreground/20" : ""
                  }`}
                >
                  <Heart size={20} className={hasLiked ? "fill-current" : ""} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 -mt-4 relative z-10">
          {/* Multi-Select User Filter with Date Range */}
          <Card className="mb-4 shadow-lg">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                {/* Multi-select User Dropdown */}
                <Popover open={userSelectOpen} onOpenChange={setUserSelectOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-8 px-2 sm:px-3 min-w-0 sm:min-w-[150px] justify-between text-xs sm:text-sm">
                      <div className="flex items-center gap-1 sm:gap-2">
                        <Users size={14} className="shrink-0" />
                        <span className="hidden sm:inline">
                          {userScopeMode === 'my_scope' 
                            ? 'My Scope' 
                            : userScopeMode === 'all'
                            ? 'All Users'
                            : `${selectedUserIds.length} User${selectedUserIds.length > 1 ? 's' : ''}`}
                        </span>
                        <span className="sm:hidden">
                          {userScopeMode === 'my_scope' 
                            ? 'My' 
                            : userScopeMode === 'all'
                            ? 'All'
                            : selectedUserIds.length}
                        </span>
                      </div>
                      <ChevronDown size={14} className="shrink-0 ml-1" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-0" align="start">
                    <div className="p-2 border-b space-y-2">
                      {/* Scope Options */}
                      <div className="flex flex-col gap-1">
                        <div
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
                            userScopeMode === 'my_scope' ? "bg-primary/10 border border-primary" : "hover:bg-muted"
                          )}
                          onClick={() => {
                            setUserScopeMode('my_scope');
                            setSelectedUserIds([]);
                            setUserSelectOpen(false);
                            setUserSearchQuery('');
                          }}
                        >
                          <Checkbox 
                            checked={userScopeMode === 'my_scope'}
                            className="pointer-events-none"
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">My Scope</span>
                            <span className="text-xs text-muted-foreground">You + your team</span>
                          </div>
                        </div>
                        <div
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
                            userScopeMode === 'all' ? "bg-primary/10 border border-primary" : "hover:bg-muted"
                          )}
                          onClick={() => {
                            setUserScopeMode('all');
                            setSelectedUserIds([]);
                            setUserSelectOpen(false);
                            setUserSearchQuery('');
                          }}
                        >
                          <Checkbox 
                            checked={userScopeMode === 'all'}
                            className="pointer-events-none"
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">All Users</span>
                            <span className="text-xs text-muted-foreground">Everyone in the organization</span>
                          </div>
                        </div>
                      </div>
                      <div className="border-t pt-2 mt-2">
                        <span className="text-xs text-muted-foreground font-medium px-1">Or select specific users:</span>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search users..."
                          value={userSearchQuery}
                          onChange={(e) => setUserSearchQuery(e.target.value)}
                          className="w-full h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>
                    <ScrollArea className="h-[250px]">
                      <div className="p-2 space-y-1">
                        {users
                          .filter(user => 
                            !userSearchQuery || 
                            (user.full_name?.toLowerCase() || '').includes(userSearchQuery.toLowerCase())
                          )
                          .map((user) => (
                          <div
                            key={user.id}
                            className="flex items-center gap-2 p-2 hover:bg-muted rounded-md cursor-pointer"
                            onClick={() => {
                              setUserScopeMode('custom');
                              const groupIds = users
                                .filter(u => normalizeName(u.full_name) === normalizeName(user.full_name))
                                .map(u => u.id);

                              setSelectedUserIds(prev => {
                                const hasAll = groupIds.every(id => prev.includes(id));
                                const newSelection = hasAll
                                  ? prev.filter(id => !groupIds.includes(id))
                                  : Array.from(new Set([...prev, ...groupIds]));
                                // If no users selected after removal, default back to my_scope
                                if (newSelection.length === 0) {
                                  setUserScopeMode('my_scope');
                                }
                                return newSelection;
                              });
                            }}
                          >
                            <Checkbox 
                              checked={userScopeMode === 'custom' && selectedUserIds.includes(user.id)}
                              className="pointer-events-none"
                            />
                            <span className="text-sm truncate">{user.full_name || 'Unknown'}</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    <div className="p-2 border-t">
                      <Button 
                        size="sm" 
                        className="w-full"
                        onClick={() => setUserSelectOpen(false)}
                      >
                        <Check size={14} className="mr-2" />
                        Apply
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Period Selector */}
                <Select
                  value={dashboardPeriod}
                  onValueChange={(value) => {
                    setDashboardPeriod(value);
                    const today = new Date();
                    let from: Date;
                    let to: Date = today;

                    const getWeekStart = (d: Date) => {
                      const day = d.getDay();
                      const diff = (day === 0 ? -6 : 1) - day;
                      const start = new Date(d);
                      start.setDate(d.getDate() + diff);
                      start.setHours(0, 0, 0, 0);
                      return start;
                    };

                    const getMonthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
                    
                    const getFYStart = (d: Date) => {
                      // FY starts April 1st
                      const year = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
                      return new Date(year, 3, 1); // April 1st
                    };

                    const getQuarterStart = (d: Date) => {
                      // FY quarters: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
                      const month = d.getMonth();
                      if (month >= 3 && month <= 5) return new Date(d.getFullYear(), 3, 1); // Q1
                      if (month >= 6 && month <= 8) return new Date(d.getFullYear(), 6, 1); // Q2
                      if (month >= 9 && month <= 11) return new Date(d.getFullYear(), 9, 1); // Q3
                      return new Date(d.getFullYear(), 0, 1); // Q4 (Jan-Mar)
                    };

                    switch (value) {
                      case 'today':
                        from = new Date(today);
                        from.setHours(0, 0, 0, 0);
                        break;
                      case 'yesterday':
                        from = new Date(today);
                        from.setDate(today.getDate() - 1);
                        from.setHours(0, 0, 0, 0);
                        to = new Date(from);
                        to.setHours(23, 59, 59, 999);
                        break;
                      case 'this_week':
                        from = getWeekStart(today);
                        break;
                      case 'this_month':
                        from = getMonthStart(today);
                        break;
                      case 'this_quarter':
                        from = getQuarterStart(today);
                        break;
                      case 'this_fy':
                        from = getFYStart(today);
                        break;
                      case 'last_week': {
                        const lastWeekDate = new Date(today);
                        lastWeekDate.setDate(today.getDate() - 7);
                        from = getWeekStart(lastWeekDate);
                        to = new Date(from);
                        to.setDate(from.getDate() + 6);
                        to.setHours(23, 59, 59, 999);
                        break;
                      }
                      case 'last_month': {
                        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                        from = lastMonth;
                        to = new Date(today.getFullYear(), today.getMonth(), 0);
                        to.setHours(23, 59, 59, 999);
                        break;
                      }
                      case 'last_quarter': {
                        const currentQStart = getQuarterStart(today);
                        const lastQEnd = new Date(currentQStart);
                        lastQEnd.setDate(lastQEnd.getDate() - 1);
                        from = getQuarterStart(lastQEnd);
                        to = lastQEnd;
                        to.setHours(23, 59, 59, 999);
                        break;
                      }
                      case 'last_fy': {
                        const currentFYStart = getFYStart(today);
                        const lastFYEnd = new Date(currentFYStart);
                        lastFYEnd.setDate(lastFYEnd.getDate() - 1);
                        from = getFYStart(lastFYEnd);
                        to = lastFYEnd;
                        to.setHours(23, 59, 59, 999);
                        break;
                      }
                      case 'last_60_days':
                        from = new Date(today);
                        from.setDate(today.getDate() - 60);
                        from.setHours(0, 0, 0, 0);
                        break;
                      case 'last_90_days':
                        from = new Date(today);
                        from.setDate(today.getDate() - 90);
                        from.setHours(0, 0, 0, 0);
                        break;
                      case 'last_180_days':
                        from = new Date(today);
                        from.setDate(today.getDate() - 180);
                        from.setHours(0, 0, 0, 0);
                        break;
                      default:
                        from = new Date(today);
                        from.setHours(0, 0, 0, 0);
                    }

                    setDashboardDateRange({ from, to });
                  }}
                >
                  <SelectTrigger className="h-8 min-w-[90px] sm:min-w-[120px] w-auto text-xs sm:text-sm px-2 sm:px-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="this_week">This Week</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="this_quarter">This Quarter</SelectItem>
                    <SelectItem value="this_fy">This FY</SelectItem>
                    <SelectItem value="last_week">Last Week</SelectItem>
                    <SelectItem value="last_month">Last Month</SelectItem>
                    <SelectItem value="last_quarter">Last Quarter</SelectItem>
                    <SelectItem value="last_fy">Last FY</SelectItem>
                    <SelectItem value="last_60_days">Last 60 Days</SelectItem>
                    <SelectItem value="last_90_days">Last 90 Days</SelectItem>
                    <SelectItem value="last_180_days">Last 180 Days</SelectItem>
                  </SelectContent>
                </Select>

                {/* OR Text Separator */}
                <span className="text-xs text-muted-foreground font-medium shrink-0">OR</span>

                {/* Select Dates Toggle Button */}
                <Button 
                  variant={showDatePickers ? "secondary" : "outline"} 
                  size="sm" 
                  className="h-8 px-2 sm:px-3 text-xs sm:text-sm"
                  onClick={() => setShowDatePickers(!showDatePickers)}
                >
                  <CalendarIcon size={14} className="sm:mr-1 shrink-0" />
                  <span className="hidden sm:inline">Select Dates</span>
                </Button>

                {/* From and To Date Pickers - shown when toggled */}
                {showDatePickers && (
                  <>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 w-[70px] sm:w-[100px] justify-start px-2 text-xs sm:text-sm">
                          <CalendarIcon size={12} className="mr-0.5 sm:mr-1 shrink-0" />
                          {format(dashboardDateRange.from, 'dd MMM')}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dashboardDateRange.from}
                          onSelect={(date) => date && setDashboardDateRange(prev => ({ ...prev, from: date }))}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>

                    <span className="text-muted-foreground text-xs shrink-0">-</span>

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 w-[70px] sm:w-[100px] justify-start px-2 text-xs sm:text-sm">
                          <CalendarIcon size={12} className="mr-0.5 sm:mr-1 shrink-0" />
                          {format(dashboardDateRange.to, 'dd MMM')}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dashboardDateRange.to}
                          onSelect={(date) => date && setDashboardDateRange(prev => ({ ...prev, to: date }))}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </>
                )}

                <Button 
                  variant="outline" 
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => {
                    fetchDashboardData();
                    const selectedUserNames = effectiveUserIds
                      .map(id => users.find(u => u.id === id)?.full_name)
                      .filter((name): name is string => !!name);
                    fetchBusinessSummary(effectiveUserIds, stableDashboardDateRange, selectedUserNames);
                  }}
                >
                  <RefreshCw size={14} />
                </Button>
              </div>

              {/* Selected Filters Summary */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Showing:</span>
                {userScopeMode === 'my_scope' ? (
                  <Badge variant="secondary" className="text-xs">My Scope ({effectiveUserIds.length} users)</Badge>
                ) : userScopeMode === 'all' ? (
                  <Badge variant="secondary" className="text-xs">All Users</Badge>
                ) : (
                  <>
                    {selectedUserIds.slice(0, 3).map(id => {
                      const user = users.find(u => u.id === id);
                      return (
                        <Badge key={id} variant="secondary" className="text-xs gap-1">
                          {user?.full_name || 'Unknown'}
                          <X 
                            size={12} 
                            className="cursor-pointer hover:text-destructive"
                            onClick={() => {
                              const newSelection = selectedUserIds.filter(uid => uid !== id);
                              setSelectedUserIds(newSelection);
                              if (newSelection.length === 0) {
                                setUserScopeMode('my_scope');
                              }
                            }}
                          />
                        </Badge>
                      );
                    })}
                    {selectedUserIds.length > 3 && (
                      <Badge variant="outline" className="text-xs">+{selectedUserIds.length - 3} more</Badge>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue={showProductivityTab ? "supervisor-report" : showTargetTab ? "kpi" : "products"} className="space-y-4">
            <div className="relative flex items-center gap-1">
              <button
                onClick={() => {
                  const container = document.getElementById('analytics-tabs-container');
                  if (container) container.scrollBy({ left: -150, behavior: 'smooth' });
                }}
                className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-md bg-muted hover:bg-muted/80 border"
                aria-label="Scroll left"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div 
                id="analytics-tabs-container"
                className="flex-1 overflow-x-auto scrollbar-hide"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                <TabsList className="inline-flex w-max gap-1 p-1">
                  {showProductivityTab && <TabsTrigger value="supervisor-report" className="text-xs sm:text-sm px-2 sm:px-3 whitespace-nowrap">Productivity</TabsTrigger>}
                  {showTargetTab && <TabsTrigger value="kpi" className="text-xs sm:text-sm px-2 sm:px-3 whitespace-nowrap">Target</TabsTrigger>}
                  {/* Calendar tab hidden per user request */}
                  {showProductsTab && <TabsTrigger value="products" className="text-xs sm:text-sm px-2 sm:px-3 whitespace-nowrap">Products</TabsTrigger>}
                  {/* Coverage tab hidden per user request */}
                </TabsList>
              </div>
              <button
                onClick={() => {
                  const container = document.getElementById('analytics-tabs-container');
                  if (container) container.scrollBy({ left: 150, behavior: 'smooth' });
                }}
                className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-md bg-muted hover:bg-muted/80 border"
                aria-label="Scroll right"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* KPI Dashboard */}
            <TabsContent value="kpi" className="space-y-4">
              <AnalyticsTargetDashboard 
                selectedUserIds={effectiveUserIds}
                dateRange={stableDashboardDateRange}
                periodFilter={dashboardPeriod}
                isScopeReady={isScopeReady}
              />
            </TabsContent>

            {/* Calendar Tab */}
            <TabsContent value="calendar" className="space-y-4">
              <PerformanceCalendar />
            </TabsContent>

            {/* Progress Tab - Dashboard View */}
            <TabsContent value="progress" className="space-y-4">
              {/* Total Order Value Banner */}
              <Card className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm opacity-90">Total Order Value</p>
                      <p className="text-3xl md:text-4xl font-bold">
                        ₹{(businessSummary.totalRevenue / 100000).toFixed(2)} Lac
                      </p>
                      <p className="text-xs opacity-75 mt-1">
                        {format(stableDashboardDateRange.from, 'MMM dd')} - {format(stableDashboardDateRange.to, 'MMM dd, yyyy')}
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="text-sm opacity-90">{businessSummary.totalOrders} Orders</p>
                      <p className="text-sm opacity-90">{Math.round(businessSummary.totalKg).toLocaleString()} Units</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Business Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <BusinessSummaryCard
                  title="Total Beats"
                  value={businessSummary.totalBeats}
                  icon={<MapPin size={16} className="text-primary" />}
                  onClick={() => { fetchBeatDetails(effectiveUserIds, stableDashboardDateRange); setShowBeatDetails(true); }}
                  isLoading={businessLoading}
                />
                <BusinessSummaryCard
                  title="Total Retailers"
                  value={businessSummary.totalRetailers}
                  icon={<Store size={16} className="text-blue-600" />}
                  iconBgClass="bg-blue-500/10"
                  onClick={() => { fetchRetailerDetails(effectiveUserIds, stableDashboardDateRange); setShowRetailerDetails(true); }}
                  isLoading={businessLoading}
                />
                <BusinessSummaryCard
                  title="Total Orders"
                  value={businessSummary.totalOrders}
                  icon={<ShoppingCart size={16} className="text-green-600" />}
                  iconBgClass="bg-green-500/10"
                  onClick={() => { fetchOrderDetails(effectiveUserIds, stableDashboardDateRange); setShowOrderDetails(true); }}
                  isLoading={businessLoading}
                />
                <BusinessSummaryCard
                  title="Total Qty"
                  value={`${businessSummary.totalKg.toFixed(1)} KG${businessSummary.totalPieces > 0 ? ` + ${businessSummary.totalPieces} pcs` : ''}`}
                  icon={<Package size={16} className="text-orange-600" />}
                  iconBgClass="bg-orange-500/10"
                  onClick={() => { fetchProductDetails(effectiveUserIds, stableDashboardDateRange); setShowProductBreakdown(true); }}
                  isLoading={businessLoading}
                />
                <BusinessSummaryCard
                  title="Total Revenue"
                  value={`₹${(businessSummary.totalRevenue / 1000).toFixed(0)}K`}
                  icon={<IndianRupee size={16} className="text-purple-600" />}
                  iconBgClass="bg-purple-500/10"
                  onClick={() => { fetchOrderDetails(effectiveUserIds, stableDashboardDateRange); setShowOrderDetails(true); }}
                  isLoading={businessLoading}
                />
                <BusinessSummaryCard
                  title="Pending Payments"
                  value={`₹${(businessSummary.pendingPayments / 1000).toFixed(0)}K`}
                  icon={<CreditCard size={16} className="text-red-600" />}
                  iconBgClass="bg-red-500/10"
                  onClick={() => { fetchPendingPaymentDetails(effectiveUserIds, stableDashboardDateRange); setShowPendingPayments(true); }}
                  isLoading={businessLoading}
                />
              </div>

            </TabsContent>

            {/* Products Tab */}
            <TabsContent value="products" className="space-y-4">
              <RetailerMonthlyProductivitySection 
                selectedUsers={effectiveUserIds} 
                dateRange={stableDashboardDateRange}
                allUsers={users}
                periodFilter={dashboardPeriod}
              />

              <Card className="shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Products by Revenue</CardTitle>
                  <div className="flex gap-1">
                    <Button size="sm" variant={productRevenueView === 'top5' ? 'default' : 'outline'} className="h-7 text-xs px-2" onClick={() => setProductRevenueView('top5')}>Top 5</Button>
                    <Button size="sm" variant={productRevenueView === 'bottom5' ? 'default' : 'outline'} className="h-7 text-xs px-2" onClick={() => setProductRevenueView('bottom5')}>Bottom 5</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const sortedByRevenue = [...productData].sort((a, b) => b.revenue - a.revenue);
                    const revenueChartData = productRevenueView === 'top5' ? sortedByRevenue.slice(0, 5) : sortedByRevenue.slice(-5).reverse();
                    return (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={revenueChartData} layout="vertical" margin={{ left: 10, right: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" tick={{ fontSize: 10 }} />
                          <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} interval={0} />
                          <Tooltip formatter={(value: any) => `₹${value.toLocaleString()}`} />
                          <Bar dataKey="revenue" fill="#8b5cf6" name="Revenue" barSize={16} />
                        </BarChart>
                      </ResponsiveContainer>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Products by Quantity (KG)</CardTitle>
                  <div className="flex gap-1">
                    <Button size="sm" variant={productQuantityView === 'top5' ? 'default' : 'outline'} className="h-7 text-xs px-2" onClick={() => setProductQuantityView('top5')}>Top 5</Button>
                    <Button size="sm" variant={productQuantityView === 'bottom5' ? 'default' : 'outline'} className="h-7 text-xs px-2" onClick={() => setProductQuantityView('bottom5')}>Bottom 5</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const sortedByQuantity = [...productData].sort((a, b) => b.quantity - a.quantity);
                    const quantityChartData = productQuantityView === 'top5' ? sortedByQuantity.slice(0, 5) : sortedByQuantity.slice(-5).reverse();
                    return (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={quantityChartData} layout="vertical" margin={{ left: 10, right: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" tick={{ fontSize: 10 }} />
                          <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} interval={0} />
                          <Tooltip formatter={(value: any) => `${Number(value).toFixed(2)} KG`} />
                          <Bar dataKey="quantity" fill="#10b981" name="Quantity (KG)" barSize={16} />
                        </BarChart>
                      </ResponsiveContainer>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Product-wise Business Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto max-h-[240px] overflow-y-auto scrollbar-always-visible">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-background z-10">
                        <tr className="border-b">
                          <th className="text-left p-2 text-sm font-medium">Product Name</th>
                          <th className="text-right p-2 text-sm font-medium">Quantity Sold (KG)</th>
                          <th className="text-right p-2 text-sm font-medium">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...productData].sort((a, b) => b.quantity - a.quantity).map((product: any, index: number) => (
                          <tr key={index} className="border-b hover:bg-muted/50">
                            <td className="p-2 text-sm">{product.name}</td>
                            <td className="p-2 text-sm text-right">{product.quantity.toFixed(2)}</td>
                            <td className="p-2 text-sm text-right font-semibold">₹{product.revenue.toLocaleString()}</td>
                          </tr>
                        ))}
                        {productData.length === 0 && (
                          <tr>
                            <td colSpan={3} className="p-4 text-center text-muted-foreground">
                              No product data available for selected period
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Coverage Tab - Hidden per user request */}

            {/* Predictive Analytics Tab - Hidden */}

            {/* Supervisor Report Tab */}
            <TabsContent value="supervisor-report" className="space-y-4">
              <SupervisorReport 
                users={users}
                selectedUserIds={effectiveUserIds}
                dateRange={stableDashboardDateRange}
                isScopeReady={isScopeReady}
              />
            </TabsContent>
          </Tabs>

          {/* Detail Dialogs */}
          <BeatDetailsDialog
            open={showBeatDetails}
            onOpenChange={setShowBeatDetails}
            selectedUsers={effectiveUserIds.length > 0 ? effectiveUserIds.map(id => users.find(u => u.id === id)?.full_name || 'Unknown') : ['All Users']}
            dateRange={stableDashboardDateRange}
            data={beatDetails}
            isLoading={detailsLoading}
          />
          <RetailerDetailsDialog
            open={showRetailerDetails}
            onOpenChange={setShowRetailerDetails}
            selectedUsers={effectiveUserIds.length > 0 ? effectiveUserIds.map(id => users.find(u => u.id === id)?.full_name || 'Unknown') : ['All Users']}
            dateRange={stableDashboardDateRange}
            data={retailerDetails}
            isLoading={detailsLoading}
          />
          <OrderDetailsDialog
            open={showOrderDetails}
            onOpenChange={setShowOrderDetails}
            selectedUsers={effectiveUserIds.length > 0 ? effectiveUserIds.map(id => users.find(u => u.id === id)?.full_name || 'Unknown') : ['All Users']}
            dateRange={stableDashboardDateRange}
            data={orderDetails}
            isLoading={detailsLoading}
          />
          <ProductBreakdownDialog
            open={showProductBreakdown}
            onOpenChange={setShowProductBreakdown}
            selectedUsers={effectiveUserIds.length > 0 ? effectiveUserIds.map(id => users.find(u => u.id === id)?.full_name || 'Unknown') : ['All Users']}
            dateRange={stableDashboardDateRange}
            data={productDetails}
            isLoading={detailsLoading}
          />
          <PendingPaymentsDialog
            open={showPendingPayments}
            onOpenChange={setShowPendingPayments}
            selectedUsers={effectiveUserIds.length > 0 ? effectiveUserIds.map(id => users.find(u => u.id === id)?.full_name || 'Unknown') : ['All Users']}
            dateRange={stableDashboardDateRange}
            data={pendingPaymentDetails}
            isLoading={detailsLoading}
          />
        </div>
      </div>
    </Layout>
  );
};

export default Analytics;