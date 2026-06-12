import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { RefreshCw, X, Store, MapPin, Package, Scale, PieChartIcon, BarChart3, Sparkles, TrendingUp, AlertTriangle, Target, CheckCircle2, ChevronDown, Users, Download, Loader2, Activity, Volume2, ShoppingCart, IndianRupee, CreditCard, Eye, EyeOff, FileText } from 'lucide-react';
import { fetchAndGenerateInvoice } from '@/utils/invoiceGenerator';
import { downloadPDF } from '@/utils/fileDownloader';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { RevenueBySKUSection } from './RevenueBySKUSection';
import { ProductivitySummarySection } from './ProductivitySummarySection';
import { AttendanceMarketHoursSection } from './AttendanceMarketHoursSection';
import { OrderDetailsAIInsights } from './OrderDetailsAIInsights';
import { Badge } from '@/components/ui/badge';
import { ReportSummaryDialog } from './ReportSummaryDialog';
import { BusinessSummaryCard, BeatDetailsDialog, RetailerDetailsDialog, OrderDetailsDialog, ProductBreakdownDialog, PendingPaymentsDialog, useBusinessMetrics } from '.';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
 import { useHindiToEnglish } from '@/hooks/useHindiToEnglish';
 import { RetailerSummarySection } from './RetailerSummarySection';
 import { LeaderboardSection } from './LeaderboardSection';
interface UserOrderSummary {
  full_name: string;
  total_order_value: number;
  total_kg: number;
}

interface UserOrderDetails {
  order_date: string;
  beat_names: string;
  total_amount: number;
  invoice_count: number;
  retailers_count: number;
  products_count: number;
  total_kg: number;
}

interface UserProfile {
  id: string;
  full_name: string | null;
}

interface SupervisorReportProps {
  users: UserProfile[];
  selectedUserIds: string[];
  dateRange: { from: Date; to: Date };
  isScopeReady?: boolean;
}

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#84cc16'];

export const SupervisorReport = ({ users, selectedUserIds, dateRange, isScopeReady = true }: SupervisorReportProps) => {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  
  // Refs to track previous values and prevent duplicate fetches
  const prevFetchKeyRef = useRef<string>('');
  const isFetchingRef = useRef(false);
  const prevScopeReadyRef = useRef(isScopeReady);
  const reportContentRef = useRef<HTMLDivElement>(null); // kept for potential future use
  const [downloadingPDF, setDownloadingPDF] = useState(false);
   
   // Hindi to English translation for retailer/beat names in Productivity section
   const { translateTexts, getTranslated } = useHindiToEnglish();

  // Memoize stable keys to prevent unnecessary re-fetches
  const userIdsKey = useMemo(() => selectedUserIds.slice().sort().join(','), [selectedUserIds]);
  const dateRangeKey = useMemo(() => `${dateRange.from.getTime()}-${dateRange.to.getTime()}`, [dateRange.from, dateRange.to]);
  const usersKey = useMemo(() => users.length.toString(), [users.length]);

  // Derive selected user names from IDs for filtering
  const selectedUsers = useMemo(() => {
    if (selectedUserIds.length === 0) return [];
    return selectedUserIds
      .map(id => users.find(u => u.id === id)?.full_name)
      .filter((name): name is string => !!name);
  }, [selectedUserIds, users]);

  // Derived value for backward compatibility with single-user components
  const selectedUser = useMemo(() => {
    if (selectedUsers.length === 0) return 'all';
    if (selectedUsers.length === 1) return selectedUsers[0];
    return 'all'; // Multiple users = show all of them
  }, [selectedUsers]);
  const [summaryData, setSummaryData] = useState<UserOrderSummary[]>([]);
  const [selectedUserDetails, setSelectedUserDetails] = useState<string | null>(null);
  const [userDetails, setUserDetails] = useState<UserOrderDetails[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsSummary, setDetailsSummary] = useState<{
    retailers: number;
    beats: number;
    products: number;
    totalKg: number;
    productivityPercent: number | null;
    quantityByUnit: { [unit: string]: number }; // Track quantities by actual unit
    totalPieces?: number;

  } | null>(null);
  const [allUsersSummary, setAllUsersSummary] = useState<{
    retailers: number;
    beats: number;
    products: number;
    totalKg: number;
    quantityByUnit: { [unit: string]: number };
  } | null>(null);
  const [expandedBox, setExpandedBox] = useState<string | null>(null);
  const [retailersList, setRetailersList] = useState<{
    name: string;
    created_date: string;
  }[]>([]);
  const [beatsList, setBeatsList] = useState<{
    beat_name: string;
    category: string | null;
    is_active: boolean;
    created_date: string;
  }[]>([]);
  const [productKgList, setProductKgList] = useState<{
    order_date: string;
    raw_date: string; // Store raw date for querying
    quantity_kg: number;
    revenue: number;
  }[]>([]);
  const [selectedProductDate, setSelectedProductDate] = useState<string | null>(null);
  const [productDayDetails, setProductDayDetails] = useState<{
    product_name: string;
    quantity: number;
    unit: string;
    total: number;
  }[]>([]);
  const [productDayLoading, setProductDayLoading] = useState(false);
  
  // State for order details beat breakdown (retailers/beats boxes)
  const [orderDetailsBeatBreakdown, setOrderDetailsBeatBreakdown] = useState<{
    beat_name: string;
    order_count: number;
    total_retailers: number;
    total_value: number;
  }[]>([]);
  const [orderDetailsBeatLoading, setOrderDetailsBeatLoading] = useState(false);
  const [chartType, setChartType] = useState<'pie' | 'bar'>('pie');
  const [hideOrderChart, setHideOrderChart] = useState(false);
  const [orderUserFilter, setOrderUserFilter] = useState<'all' | 'top5' | 'bottom5'>('all');

  // State for beat-wise split view in User Order Summary
  const [selectedSummaryUser, setSelectedSummaryUser] = useState<string | null>(null);
  const [beatBreakdownData, setBeatBreakdownData] = useState<{
    beat_name: string;
    total_value: number;
    order_count: number;
  }[]>([]);
  const [beatBreakdownLoading, setBeatBreakdownLoading] = useState(false);

  // State for retailer details popup (drill-down from beat)
  const [retailerDetailsOpen, setRetailerDetailsOpen] = useState(false);
  const [selectedBeatForDetails, setSelectedBeatForDetails] = useState<string | null>(null);
  const [retailerDetailsData, setRetailerDetailsData] = useState<{
    retailer_name: string;
    order_count: number;
    total_value: number;
    order_ids: string[];
  }[]>([]);
  const [retailerDetailsLoading, setRetailerDetailsLoading] = useState(false);
  const [downloadingInvoice, setDownloadingInvoice] = useState<string | null>(null);
  const [loadingInvoiceView, setLoadingInvoiceView] = useState<string | null>(null);

  // State for SKU filter from chart clicks - when a user is clicked in Order Summary charts
  const [skuFilterUser, setSkuFilterUser] = useState<string | null>(null);
  
  // State for productivity drilldown from Order Details card
  const [productivityDrilldownUser, setProductivityDrilldownUser] = useState<string | null>(null);
  const [productivityDrilldownData, setProductivityDrilldownData] = useState<{
    planned_date: string;
    productive_visits: number;
    unproductive_visits: number;
    total_visits: number;
    productivity_percentage: number;
  }[]>([]);
  const [productivityDrilldownLoading, setProductivityDrilldownLoading] = useState(false);

  // State for report summary dialog
  const [reportSummaryOpen, setReportSummaryOpen] = useState(false);
  const [skuDataForSummary, setSkuDataForSummary] = useState<{
    product_name: string;
    quantity_sold: number;
    revenue: number;
    unit: string;
  }[]>([]);
  const [productivityDataForSummary, setProductivityDataForSummary] = useState<{
    full_name: string;
    productivity_percentage: number;
    productive_visits: number;
    total_visits: number;
  }[]>([]);

  // Business metrics hook for dashboard summary
  const {
    summary: businessSummary,
    isLoading: businessLoading,
    fetchSummary: fetchBusinessSummary,
    beatDetails,
    retailerDetails: businessRetailerDetails,
    orderDetails: businessOrderDetails,
    productDetails,
    pendingPaymentDetails,
    detailsLoading: businessDetailsLoading,
    fetchBeatDetails,
    fetchRetailerDetails: fetchBusinessRetailerDetails,
    fetchOrderDetails: fetchBusinessOrderDetails,
    fetchProductDetails,
    fetchPendingPaymentDetails
  } = useBusinessMetrics();

  // Dialog states for business summary cards
  const [showBeatDetails, setShowBeatDetails] = useState(false);
  const [showRetailerDetailsDialog, setShowRetailerDetailsDialog] = useState(false);
  const [showOrderDetailsDialog, setShowOrderDetailsDialog] = useState(false);
  const [showProductBreakdown, setShowProductBreakdown] = useState(false);
  const [showPendingPayments, setShowPendingPayments] = useState(false);

  // Memoized callbacks to prevent infinite loops in child components
  const handleSkuDataLoaded = useCallback((data: typeof skuDataForSummary) => {
    setSkuDataForSummary(data);
  }, []);

  const handleProductivityDataLoaded = useCallback((data: typeof productivityDataForSummary) => {
    setProductivityDataForSummary(data);
  }, []);

  const handleClearSkuFilter = useCallback(() => {
    setSkuFilterUser(null);
  }, []);

  const aiInsights = useMemo(() => {
    if (summaryData.length === 0) return [];

    const insights: { type: 'success' | 'warning' | 'opportunity' | 'info'; title: string; description: string }[] = [];
    const totalValue = summaryData.reduce((sum, item) => sum + item.total_order_value, 0);
    const avgValue = totalValue / summaryData.length;
    
    // Find top performer
    const topPerformer = summaryData[0];
    if (topPerformer && summaryData.length > 1) {
      const topShare = (topPerformer.total_order_value / totalValue) * 100;
      insights.push({
        type: 'success',
        title: 'Top Performer',
        description: `${topPerformer.full_name} leads with ₹${topPerformer.total_order_value.toLocaleString()} (${topShare.toFixed(1)}% of total)`
      });
    }

    // Find underperformers (below 50% of average)
    const underperformers = summaryData.filter(u => u.total_order_value < avgValue * 0.5);
    if (underperformers.length > 0) {
      insights.push({
        type: 'warning',
        title: 'Attention Needed',
        description: `${underperformers.length} user(s) performing below 50% average: ${underperformers.map(u => u.full_name.split(' ')[0]).slice(0, 3).join(', ')}${underperformers.length > 3 ? '...' : ''}`
      });
    }

    // Revenue distribution insight
    if (summaryData.length >= 3) {
      const top3Share = (summaryData.slice(0, 3).reduce((s, u) => s + u.total_order_value, 0) / totalValue) * 100;
      if (top3Share > 70) {
        insights.push({
          type: 'info',
          title: 'Concentrated Revenue',
          description: `Top 3 users contribute ${top3Share.toFixed(0)}% of revenue. Consider diversifying sales coverage.`
        });
      }
    }

    // Growth opportunity
    const midPerformers = summaryData.filter(u => 
      u.total_order_value >= avgValue * 0.5 && u.total_order_value < avgValue * 0.9
    );
    if (midPerformers.length > 0) {
      insights.push({
        type: 'opportunity',
        title: 'Growth Potential',
        description: `${midPerformers.length} user(s) near average can improve with targeted coaching: ${midPerformers.map(u => u.full_name.split(' ')[0]).slice(0, 2).join(', ')}`
      });
    }

    return insights.slice(0, 4); // Limit to 4 insights
  }, [summaryData]);

  // Auto-fetch data when props change
  useEffect(() => {
    // Reset fetch key when scope transitions from not ready to ready
    if (isScopeReady && !prevScopeReadyRef.current) {
      prevFetchKeyRef.current = '';
    }
    prevScopeReadyRef.current = isScopeReady;
    
    const fetchKey = `${userIdsKey}-${dateRangeKey}-${usersKey}`;
    
    // Skip if already fetching, if the key hasn't changed, if users not loaded, or if scope not ready
    if (isFetchingRef.current || fetchKey === prevFetchKeyRef.current || users.length === 0 || !isScopeReady) {
      return;
    }
    
    prevFetchKeyRef.current = fetchKey;
    isFetchingRef.current = true;
    
    const doFetch = async () => {
      fetchSummaryData();
      // Also fetch business summary metrics
      fetchBusinessSummary(selectedUserIds, dateRange);
      isFetchingRef.current = false;
    };
    
    doFetch();
  }, [userIdsKey, dateRangeKey, usersKey, selectedUserIds, dateRange, fetchBusinessSummary, isScopeReady]);

  // Fetch productivity data for drilldown
  useEffect(() => {
    const fetchProductivityDrilldown = async () => {
      if (!productivityDrilldownUser) {
        setProductivityDrilldownData([]);
        return;
      }

      setProductivityDrilldownLoading(true);
      try {
        const fromDate = format(dateRange.from, 'yyyy-MM-dd');
        const toDate = format(dateRange.to, 'yyyy-MM-dd');

        const { data, error } = await (supabase as any).rpc('get_productivity_summary', {
          user_full_name: productivityDrilldownUser,
          start_date: fromDate,
          end_date: toDate
        });

        if (error) {
          console.error('Error fetching productivity drilldown:', error);
          setProductivityDrilldownData([]);
        } else {
          setProductivityDrilldownData(data || [] as any);
        }
      } catch (err) {
        console.error('Error in productivity drilldown:', err);
        setProductivityDrilldownData([]);
      } finally {
        setProductivityDrilldownLoading(false);
      }
    };

    fetchProductivityDrilldown();
  }, [productivityDrilldownUser, dateRange]);

  // Fetch summary data - uses order_items.total for accurate revenue calculation
  const fetchSummaryData = async () => {
    setLoading(true);
    try {
      const fromDate = format(dateRange.from, 'yyyy-MM-dd');
      const toDate = format(dateRange.to, 'yyyy-MM-dd');

      // Build query with batch pagination to avoid 1000-row limit
      const BATCH_SIZE = 1000;
      let allOrdersData: any[] = [];
      let batchIndex = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('orders')
          .select(`
            id,
            user_id,
            total_amount,
            order_items(quantity, unit)
          `)
          .eq('status', 'confirmed')
          .gte('order_date', fromDate)
          .lte('order_date', toDate)
          .range(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE - 1);
        
        // Filter by user IDs if specific users are selected
        if (selectedUserIds.length > 0) {
          query = query.in('user_id', selectedUserIds);
        }

        const { data: batchData, error: batchError } = await query;

        if (batchError) {
          console.error('Error fetching orders batch:', batchError);
          break;
        }

        if (batchData && batchData.length > 0) {
          allOrdersData = [...allOrdersData, ...batchData];
          hasMore = batchData.length === BATCH_SIZE;
          batchIndex++;
        } else {
          hasMore = false;
        }
      }

      const ordersData = allOrdersData;
      const ordersError = allOrdersData.length === 0 && batchIndex === 0 ? true : null;

      if (ordersError) {
        console.error('Error fetching orders:', ordersError);
        setSummaryData([]);
        setLoading(false);
        return;
      }

      if (!ordersData || ordersData.length === 0) {
        setSummaryData([]);
        setLoading(false);
        return;
      }

      // Get unique user IDs
      const userIds = [...new Set(ordersData.map(o => o.user_id))];

      // Fetch profiles for these users - use the selector RPC that works for all authenticated users
      let profilesData: { id: string; full_name: string | null }[] = [];
      
      // Use the selector RPC (works for all authenticated users)
      const { data: selectorProfiles, error: selectorError } = await (supabase as any).rpc('get_profiles_for_selector');
      
      if (!selectorError && selectorProfiles) {
        // Filter to only the user IDs we need
        profilesData = (selectorProfiles as any[]).filter((p: any) => userIds.includes(p.id));
      } else {
        // Fallback to admin function if selector fails
        const { data: adminProfiles, error: adminError } = await supabase.rpc('get_basic_profiles_for_admin');
        
        if (!adminError && adminProfiles) {
          profilesData = adminProfiles.filter((p: any) => userIds.includes(p.id));
        }
      }

      // Create a map of user_id to full_name
      const userNameMap: Record<string, string> = {};
      profilesData?.forEach(p => {
        userNameMap[p.id] = p.full_name || 'Unknown';
      });

      // Group by user and calculate totals (total_amount and total_kg)
      const userTotals: Record<string, { total_order_value: number; total_kg: number }> = {};
      ordersData.forEach((order) => {
        const userName = userNameMap[order.user_id] || 'Unknown';
        
        // Use total_amount directly (includes taxes and charges)
        const orderRevenue = Number(order.total_amount || 0);
        
        // Calculate KG from order_items
        let orderKg = 0;
        (order.order_items as any[])?.forEach((item: any) => {
          const qty = Number(item.quantity || 0);
          const unit = (item.unit || '').toLowerCase().trim();
          
          if (unit === 'kg' || unit.includes('kilo')) {
            orderKg += qty;
          } else if (unit === 'grams' || unit === 'gram' || unit === 'g') {
            orderKg += qty / 1000;
          }
          // Ignore pieces/pcs - not included in KG
        });
        
        if (!userTotals[userName]) {
          userTotals[userName] = { total_order_value: 0, total_kg: 0 };
        }
        userTotals[userName].total_order_value += orderRevenue;
        userTotals[userName].total_kg += orderKg;
      });

      // Convert to array and sort by total_kg (for ranking by quantity)
      const summaryArray = Object.entries(userTotals)
        .map(([full_name, data]) => ({ 
          full_name, 
          total_order_value: data.total_order_value,
          total_kg: Math.round(data.total_kg * 100) / 100 
        }))
        .sort((a, b) => b.total_kg - a.total_kg);

      setSummaryData(summaryArray);
      setSelectedUserDetails(null);
      setUserDetails([]);
      setDetailsSummary(null);

      // Fetch all-users summary when loading data
      await fetchAllUsersSummary(fromDate, toDate);
    } catch (error) {
      console.error('Error in supervisor report:', error);
      setSummaryData([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch user order details when a user is selected
  const fetchUserDetails = async (userName: string) => {
    setDetailsLoading(true);
    setSelectedUserDetails(userName);
    setExpandedBox(null);
    setRetailersList([]);
    setBeatsList([]);
    setProductKgList([]);
    setOrderDetailsBeatBreakdown([]);
    
    // Immediately start fetching beat breakdown for retailers/beats counts
    fetchOrderDetailsBeatBreakdownForUser(userName);
    
    try {
      const fromDate = format(dateRange.from, 'yyyy-MM-dd');
      const toDate = format(dateRange.to, 'yyyy-MM-dd');

      // Get user ID first
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('full_name', userName)
        .single();

      if (!userProfile) {
        setUserDetails([]);
        setDetailsSummary(null);
        setDetailsLoading(false);
        return;
      }

      const userId = userProfile.id;

      // Fetch all data in parallel using the user's SQL query logic
      const [retailersResult, beatsResult, ordersResult, productRevenueResult, productivityResult] = await Promise.all([
        // Retailers created by user in date range
        supabase
          .from('retailers')
          .select('id', { count: 'exact' })
          .eq('user_id', userId)
          .gte('created_at', `${fromDate}T00:00:00`)
          .lte('created_at', `${toDate}T23:59:59`),
        
        // Beats created by user (using beats.created_by)
        supabase
          .from('beats')
          .select('id', { count: 'exact' })
          .eq('created_by', userId)
          .gte('created_at', `${fromDate}T00:00:00`)
          .lte('created_at', `${toDate}T23:59:59`),
        
        // Orders for this user (confirmed) - use order_date as per SQL query
        supabase
          .from('orders')
          .select(`
            id,
            order_date,
            total_amount,
            status,
            retailer_id,
            retailers(beat_id, beats(beat_name))
          `)
          .eq('user_id', userId)
          .eq('status', 'confirmed')
          .gte('order_date', fromDate)
          .lte('order_date', toDate)
          .order('order_date', { ascending: true }),
        
        // Use the same RPC as Product and Revenue Performance report
        (supabase as any).rpc('get_product_revenue_performance', {
          user_full_name: userName,
          start_date: fromDate,
          end_date: toDate
        }),
        
        // Get productivity summary using the RPC
        (supabase as any).rpc('get_productivity_summary', {
          user_full_name: userName,
          start_date: fromDate,
          end_date: toDate
        })
      ]);

      // Get beats count from beats table
      const totalBeatsCreated = beatsResult.count || 0;

      // Calculate products and total KG from the RPC result (same logic as SQL Report)
      const productData = productRevenueResult.data || [];
      const totalProductsSold = productData.length; // Count of distinct products
      let totalQuantityKgFromRpc = 0;
      
      productData.forEach((row: any) => {
        const qty = Number(row.quantity_sold || 0);
        const unit = (row.unit || '').toLowerCase();
        // Same conversion logic as Analytics.tsx line 2391-2393
        if (unit === 'grams') {
          totalQuantityKgFromRpc += qty / 1000;
        } else {
          totalQuantityKgFromRpc += qty;
        }
      });

      // Calculate Overall Productivity % (productive / planned) using beat_plans
      const productivityData = productivityResult.data || [];
      let productivityPercent: number | null = null;
      
      const totalProductive = productivityData.reduce((sum: number, row: any) => 
        sum + Number(row.productive_visits || 0), 0);

      // Fetch beat_plans for this user in the date range to compute planned visits
      const { data: userBeatPlans } = await supabase
        .from('beat_plans')
        .select('beat_id, plan_date')
        .eq('user_id', userId)
        .gte('plan_date', fromDate)
        .lte('plan_date', toDate);

      if (userBeatPlans && userBeatPlans.length > 0) {
        const uniqueBeatIds = [...new Set(userBeatPlans.map(bp => bp.beat_id))];
        
        // Fetch retailers assigned to these beats
        const { data: beatRetailers } = await supabase
          .from('retailers')
          .select('id, beat_id')
          .in('beat_id', uniqueBeatIds);

        if (beatRetailers && beatRetailers.length > 0) {
          // Group retailers by beat
          const retailersByBeat = new Map<string, string[]>();
          beatRetailers.forEach(r => {
            if (!retailersByBeat.has(r.beat_id)) retailersByBeat.set(r.beat_id, []);
            retailersByBeat.get(r.beat_id)!.push(r.id);
          });

          // Count planned visits: for each plan_date, count retailers in that beat
          let totalPlanned = 0;
          userBeatPlans.forEach(bp => {
            const retailers = retailersByBeat.get(bp.beat_id) || [];
            totalPlanned += retailers.length;
          });

          if (totalPlanned > 0) {
            productivityPercent = Math.round((totalProductive / totalPlanned) * 100 * 100) / 100;
          }
        }
      }

      // Fetch order_items separately for the daily breakdown table
      const orderIds = ordersResult.data?.map(o => o.id) || [];
      let orderItemsData: any[] = [];
      
      if (orderIds.length > 0) {
        const { data: items } = await supabase
          .from('order_items')
          .select('order_id, product_id, quantity, unit, total')
          .in('order_id', orderIds);
        orderItemsData = items || [];
      }
      
      // Create a map of order_id to items
      const orderItemsMap: Record<string, any[]> = {};
      orderItemsData.forEach(item => {
        if (!orderItemsMap[item.order_id]) {
          orderItemsMap[item.order_id] = [];
        }
        orderItemsMap[item.order_id].push(item);
      });

      // Calculate retailer count
      const totalRetailersCreated = retailersResult.count || 0;

      // Process orders for products and KG
      const orders = ordersResult.data || [];
      const allProducts = new Set<string>();
      let totalQuantityKg = 0;
      let totalRevenue = 0;

      // Group by date for the details table
      const dateGroups: Record<string, {
        orders: any[];
        totalAmount: number;
        beats: Set<string>;
        retailers: Set<string>;
        products: Set<string>;
        totalKg: number;
        invoiceCount: number;
      }> = {};

      orders.forEach((order: any) => {
        const dateKey = order.order_date;
        if (!dateGroups[dateKey]) {
          dateGroups[dateKey] = {
            orders: [],
            totalAmount: 0,
            beats: new Set(),
            retailers: new Set(),
            products: new Set(),
            totalKg: 0,
            invoiceCount: 0
          };
        }

        dateGroups[dateKey].orders.push(order);
        dateGroups[dateKey].totalAmount += Number(order.total_amount || 0);
        dateGroups[dateKey].invoiceCount += 1;
        totalRevenue += Number(order.total_amount || 0);

        if (order.retailer_id) {
          dateGroups[dateKey].retailers.add(order.retailer_id);
        }

        const beatName = order.retailers?.beats?.beat_name;
        if (beatName) {
          dateGroups[dateKey].beats.add(beatName);
        }

        // Use order items from the separate query
        const items = orderItemsMap[order.id] || [];
        items.forEach((item: any) => {
          if (item.product_id) {
            dateGroups[dateKey].products.add(item.product_id);
            allProducts.add(item.product_id);
          }
          
          const qty = Number(item.quantity || 0);
          const unit = (item.unit || '').toLowerCase();
          let kg = 0;
          
          // Match SQL logic: if unit is 'Grams', divide by 1000
          if (unit === 'grams' || unit === 'gram' || unit === 'g') {
            kg = qty / 1000;
          } else {
            // For KG or other units, use quantity directly
            kg = qty;
          }
          
          dateGroups[dateKey].totalKg += kg;
          totalQuantityKg += kg;
        });
      });

      // Convert to array
      const detailsArray = Object.entries(dateGroups).map(([date, data]) => ({
        order_date: date,
        beat_names: Array.from(data.beats).join(', ') || 'N/A',
        total_amount: data.totalAmount,
        invoice_count: data.invoiceCount,
        retailers_count: data.retailers.size,
        products_count: data.products.size,
        total_kg: data.totalKg
      }));

      setUserDetails(detailsArray);
      setDetailsSummary({
        retailers: totalRetailersCreated,
        beats: totalBeatsCreated,
        products: totalProductsSold, // Use RPC result count
        totalKg: Math.round(totalQuantityKgFromRpc * 100) / 100, // Use RPC calculated KG, round to 2 decimals
        productivityPercent,
        quantityByUnit: {},
      });
    } catch (error) {
      console.error('Error fetching user details:', error);
      setUserDetails([]);
      setDetailsSummary(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  // Fetch summary for all users combined (no user selected)
  const fetchAllUsersSummary = async (fromDate: string, toDate: string) => {
    try {
      // Use selectedUserIds to filter data - if empty, we still show aggregated data for all visible users
      const userIdsToFilter = selectedUserIds.length > 0 ? selectedUserIds : [];
      
      // Fetch retailers created in date range (filtered by selected users if any)
      let retailersQuery = supabase
        .from('retailers')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', `${fromDate}T00:00:00`)
        .lte('created_at', `${toDate}T23:59:59`);
      
      if (userIdsToFilter.length > 0) {
        retailersQuery = retailersQuery.in('user_id', userIdsToFilter);
      }
      
      const { count: retailersCount } = await retailersQuery;

      // Fetch beats created in date range (filtered by selected users if any)
      let beatsQuery = supabase
        .from('beats')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', `${fromDate}T00:00:00`)
        .lte('created_at', `${toDate}T23:59:59`);
      
      if (userIdsToFilter.length > 0) {
        beatsQuery = beatsQuery.in('created_by', userIdsToFilter);
      }
      
      const { count: beatsCount } = await beatsQuery;

      // Fetch confirmed orders in date range (filtered by selected users if any)
      let ordersQuery = supabase
        .from('orders')
        .select('id')
        .eq('status', 'confirmed')
        .gte('order_date', fromDate)
        .lte('order_date', toDate);
      
      if (userIdsToFilter.length > 0) {
        ordersQuery = ordersQuery.in('user_id', userIdsToFilter);
      }
      
      const { data: orders } = await ordersQuery;

      if (!orders || orders.length === 0) {
        setAllUsersSummary({
          retailers: retailersCount || 0,
          beats: beatsCount || 0,
          products: 0,
          totalKg: 0,
          quantityByUnit: {},
        });
        return;
      }
      const orderIds = orders.map(o => o.id);

      // Fetch order items in batches to avoid URL length limits
      const BATCH_SIZE = 200;
      const productSet = new Set<string>();
      let totalKg = 0;
      const quantityByUnit: { [unit: string]: number } = {};

      for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
        const batchIds = orderIds.slice(i, i + BATCH_SIZE);
        const { data: orderItems, error: itemsError } = await supabase
          .from('order_items')
          .select('product_name, quantity, unit')
          .in('order_id', batchIds);

        if (itemsError) {
          console.error('Error fetching order items batch:', itemsError);
          continue;
        }

        (orderItems || []).forEach((item: any) => {
          if (item.product_name) {
            productSet.add(item.product_name);
          }
          const qty = Number(item.quantity || 0);
          const unit = (item.unit || 'Unknown').trim();
          
          // Track quantity by actual unit
          quantityByUnit[unit] = (quantityByUnit[unit] || 0) + qty;
          
          // Also calculate KG for backward compatibility
          const unitLower = unit.toLowerCase();
          if (unitLower === 'kg' || unitLower.includes('kilo')) {
            totalKg += qty;
          } else if (unitLower === 'grams' || unitLower === 'gram' || unitLower === 'g') {
            totalKg += qty / 1000;
          }
          // Ignore pieces/pcs - not included in KG calculation
        });
      }

      setAllUsersSummary({
        retailers: retailersCount || 0,
        beats: beatsCount || 0,
        products: productSet.size,
        totalKg: Math.round(totalKg * 100) / 100,
        quantityByUnit
      });
    } catch (error) {
      console.error('Error fetching all users summary:', error);
      setAllUsersSummary(null);
    }
  };


  const totalOrderValue = summaryData.reduce((sum, item) => sum + item.total_order_value, 0);
  const totalKgAll = summaryData.reduce((sum, item) => sum + item.total_kg, 0);

  // State for "Others" dialog
  const [othersDialogOpen, setOthersDialogOpen] = useState(false);
  const [othersData, setOthersData] = useState<{ name: string; value: number; kg: number; percentage: string }[]>([]);

  // Raw pie chart data (all users) - now ranked by total_kg
  const rawPieChartData = summaryData.map((item, index) => ({
    name: item.full_name,
    value: item.total_kg, // Use KG as the chart value for ranking
    orderValue: item.total_order_value,
    kg: item.total_kg,
    percentage: totalKgAll > 0 ? ((item.total_kg / totalKgAll) * 100).toFixed(0) : '0',
    color: COLORS[index % COLORS.length]
  }));

  // Apply filtering and "Others" grouping
  const pieChartData = useMemo(() => {
    // Apply top 5 / bottom 5 filter first
    let filteredData = [...rawPieChartData];
    if (orderUserFilter === 'top5' && rawPieChartData.length > 5) {
      filteredData = rawPieChartData.slice(0, 5);
    } else if (orderUserFilter === 'bottom5' && rawPieChartData.length > 5) {
      filteredData = rawPieChartData.slice(-5);
    }
    
    // Apply "Others" grouping when more than 8 users (only in 'all' mode)
    if (orderUserFilter === 'all' && filteredData.length > 8) {
      const topCount = filteredData.length - 5;
      const topUsers = filteredData.slice(0, topCount);
      const bottomUsers = filteredData.slice(topCount);
      
      const othersValue = bottomUsers.reduce((sum, u) => sum + u.value, 0);
      const othersKg = bottomUsers.reduce((sum, u) => sum + u.kg, 0);
      const othersPercentage = totalKgAll > 0 ? ((othersKg / totalKgAll) * 100).toFixed(0) : '0';
      
      return [
        ...topUsers,
        {
          name: 'Others',
          value: othersValue,
          orderValue: bottomUsers.reduce((sum, u) => sum + u.orderValue, 0),
          kg: othersKg,
          percentage: othersPercentage,
          color: '#9ca3af', // gray-400 for "Others"
          isOthers: true,
          othersDetails: bottomUsers
        }
      ];
    }
    
    return filteredData;
  }, [rawPieChartData, totalKgAll, orderUserFilter]);

  // Filtered summary data for the table - sorted by total_kg and filtered by Top 5 / Bottom 5
  const filteredSummaryData = useMemo(() => {
    // summaryData is already sorted by total_kg descending
    const sortedData = [...summaryData].sort((a, b) => b.total_kg - a.total_kg);
    
    if (orderUserFilter === 'top5' && sortedData.length > 5) {
      return sortedData.slice(0, 5);
    } else if (orderUserFilter === 'bottom5' && sortedData.length > 5) {
      return sortedData.slice(-5);
    }
    return sortedData;
  }, [summaryData, orderUserFilter]);

  const handlePieClick = (data: any) => {
    if (data && data.name) {
      // Check if this is the "Others" segment
      if (data.name === 'Others' || data.isOthers) {
        // Show "Others" dialog instead of drilling down
        const othersItem = pieChartData.find(d => d.name === 'Others');
        if (othersItem && (othersItem as any).othersDetails) {
          setOthersData((othersItem as any).othersDetails);
          setOthersDialogOpen(true);
        }
        return;
      }
      
      // For regular users, show beat breakdown like handleSummaryRowClick
      // Toggle off if same user clicked
      if (selectedSummaryUser === data.name) {
        setSelectedSummaryUser(null);
        setBeatBreakdownData([]);
      } else {
        setSelectedSummaryUser(data.name);
        fetchBeatBreakdown(data.name);
      }
      // Also show detailed section below and set SKU filter
      fetchUserDetails(data.name);
      setSkuFilterUser(data.name);
    }
  };

  const handleRowClick = (userName: string) => {
    fetchUserDetails(userName);
    // Also set SKU filter to show this user's data in Revenue Summary by SKU
    setSkuFilterUser(userName);
  };

  // Handle click on a user from "Others" dialog
  const handleOthersUserClick = (userName: string) => {
    setOthersDialogOpen(false);
    // Show beat breakdown
    setSelectedSummaryUser(userName);
    fetchBeatBreakdown(userName);
    // Show detailed section
    fetchUserDetails(userName);
    setSkuFilterUser(userName);
  };

  // Fetch beat breakdown with retailers and beats count for Order Details
  // Can optionally pass userName directly for immediate fetch before state updates
  const fetchOrderDetailsBeatBreakdownForUser = async (userName?: string) => {
    const targetUser = userName || selectedUserDetails;
    if (!targetUser) return;
    
    setOrderDetailsBeatLoading(true);
    setOrderDetailsBeatBreakdown([]);
    
    try {
      const fromDate = format(dateRange.from, 'yyyy-MM-dd');
      const toDate = format(dateRange.to, 'yyyy-MM-dd');
      const nextDay = format(new Date(new Date(toDate).getTime() + 86400000), 'yyyy-MM-dd');

      // Get user ID from profile
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('id')
        .ilike('full_name', `${targetUser}%`)
        .limit(1)
        .maybeSingle();

      if (!userProfile) {
        setOrderDetailsBeatBreakdown([]);
        setOrderDetailsBeatLoading(false);
        return;
      }

      // Fetch orders with retailer info and total_amount (confirmed orders in date range)
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          retailer_id,
          total_amount,
          retailers!inner(id, beat_name)
        `)
        .eq('user_id', userProfile.id)
        .eq('status', 'confirmed')
        .gte('created_at', `${fromDate}T00:00:00`)
        .lt('created_at', `${nextDay}T00:00:00`);

      if (ordersError || !orders || orders.length === 0) {
        setOrderDetailsBeatBreakdown([]);
        setOrderDetailsBeatLoading(false);
        return;
      }

      // Group by beat_name and calculate: order_count, total_retailers, total_value
      const beatGroups: Record<string, { 
        order_ids: Set<string>; 
        retailer_ids: Set<string>; 
        total_value: number;
      }> = {};
      
      orders.forEach((order: any) => {
        const beatName = order.retailers?.beat_name || 'Unassigned';
        const retailerId = order.retailers?.id || order.retailer_id;
        // Use total_amount directly (includes taxes and charges)
        const orderTotal = Number(order.total_amount || 0);
        
        if (!beatGroups[beatName]) {
          beatGroups[beatName] = { order_ids: new Set(), retailer_ids: new Set(), total_value: 0 };
        }
        
        beatGroups[beatName].order_ids.add(order.id);
        beatGroups[beatName].retailer_ids.add(retailerId);
        beatGroups[beatName].total_value += orderTotal;
      });

      // Convert to array and sort by total_value descending
      const breakdownData = Object.entries(beatGroups)
        .map(([beat_name, data]) => ({
          beat_name,
          order_count: data.order_ids.size,
          total_retailers: data.retailer_ids.size,
          total_value: data.total_value
        }))
        .sort((a, b) => b.total_value - a.total_value);

      setOrderDetailsBeatBreakdown(breakdownData);
       
       // Trigger translation for Hindi beat names
       translateTexts(breakdownData.map(b => b.beat_name));
    } catch (error) {
      console.error('Error fetching order details beat breakdown:', error);
      setOrderDetailsBeatBreakdown([]);
    } finally {
      setOrderDetailsBeatLoading(false);
    }
  };

  // Handle click on Retailers or Beats box - show beat breakdown table
  // Don't clear orderDetailsBeatBreakdown when toggling - keep counts stable
  const handleRetailersBeatsBoxClick = async () => {
    if (!selectedUserDetails) return;
    
    if (expandedBox === 'retailersBeats') {
      setExpandedBox(null);
      // Don't clear orderDetailsBeatBreakdown - keep the data for stable counts
      return;
    }

    setExpandedBox('retailersBeats');
    // Only fetch if not already loaded
    if (orderDetailsBeatBreakdown.length === 0) {
      await fetchOrderDetailsBeatBreakdownForUser();
    }
  };

  // Fetch retailers list when clicking on Retailers box (legacy - now redirects to beat breakdown)
  const handleRetailersBoxClick = async () => {
    await handleRetailersBeatsBoxClick();
  };

  // Fetch beats list when clicking on Beats box (legacy - now redirects to beat breakdown)
  const handleBeatsBoxClick = async () => {
    await handleRetailersBeatsBoxClick();
  };

  // Fetch products/kg list when clicking on Products or Total KG box
  const handleProductsKgBoxClick = async () => {
    if (!selectedUserDetails) return;
    
    if (expandedBox === 'productsKg') {
      setExpandedBox(null);
      setProductKgList([]);
      return;
    }

    setExpandedBox('productsKg');
    
    const fromDate = format(dateRange.from, 'yyyy-MM-dd');
    const toDate = format(dateRange.to, 'yyyy-MM-dd');

    // Get user profile by name
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('id, full_name')
      .ilike('full_name', `${selectedUserDetails}%`)
      .limit(1)
      .single();

    if (!userProfile) return;

    // Fetch orders with order_items for confirmed orders
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, created_at')
      .eq('user_id', userProfile.id)
      .eq('status', 'confirmed')
      .gte('created_at', `${fromDate}T00:00:00`)
      .lt('created_at', `${format(new Date(new Date(toDate).getTime() + 86400000), 'yyyy-MM-dd')}T00:00:00`)
      .order('created_at', { ascending: true });

    if (ordersError || !orders || orders.length === 0) {
      setProductKgList([]);
      return;
    }

    const orderIds = orders.map(o => o.id);

    // Fetch order items for these orders
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('order_id, quantity, unit, total')
      .in('order_id', orderIds);

    if (itemsError || !orderItems) {
      setProductKgList([]);
      return;
    }

    // Create a map of order_id to created_at date
    const orderDateMap: Record<string, string> = {};
    orders.forEach(o => {
      orderDateMap[o.id] = format(new Date(o.created_at), 'yyyy-MM-dd');
    });

    // Group by date
    const dateGroups: Record<string, { quantity_kg: number; revenue: number }> = {};
    let grandTotalKg = 0;
    let grandTotalRevenue = 0;

    orderItems.forEach(item => {
      const dateKey = orderDateMap[item.order_id];
      if (!dateKey) return;

      if (!dateGroups[dateKey]) {
        dateGroups[dateKey] = { quantity_kg: 0, revenue: 0 };
      }

      const qty = Number(item.quantity || 0);
      const unit = (item.unit || '').toLowerCase();
      let kg = 0;

      if (unit === 'grams' || unit === 'gram' || unit === 'g') {
        kg = qty / 1000;
      } else {
        kg = qty;
      }

      dateGroups[dateKey].quantity_kg += kg;
      dateGroups[dateKey].revenue += Number(item.total || 0);
      grandTotalKg += kg;
      grandTotalRevenue += Number(item.total || 0);
    });

    // Convert to array and add total row
    const resultArray = Object.entries(dateGroups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        order_date: format(new Date(date), 'dd MMM yy'),
        raw_date: date,
        quantity_kg: Math.round(data.quantity_kg * 100) / 100,
        revenue: data.revenue
      }));

    // Add TOTAL row
    resultArray.push({
      order_date: 'TOTAL',
      raw_date: '',
      quantity_kg: Math.round(grandTotalKg * 100) / 100,
      revenue: grandTotalRevenue
    });

    setProductKgList(resultArray);
    setSelectedProductDate(null);
    setProductDayDetails([]);
  };

  // Fetch product-wise data for a specific date
  const handleProductDateClick = async (rawDate: string, displayDate: string) => {
    if (!selectedUserDetails || rawDate === '' || displayDate === 'TOTAL') return;
    
    if (selectedProductDate === displayDate) {
      setSelectedProductDate(null);
      setProductDayDetails([]);
      return;
    }

    setSelectedProductDate(displayDate);
    setProductDayLoading(true);

    try {
      // Get user profile by name
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('id')
        .ilike('full_name', `${selectedUserDetails}%`)
        .limit(1)
        .single();

      if (!userProfile) {
        setProductDayDetails([]);
        setProductDayLoading(false);
        return;
      }

      // Calculate next day for date range query (matches SQL: created_at < date + 1 day)
      const nextDay = format(new Date(new Date(rawDate).getTime() + 86400000), 'yyyy-MM-dd');

      // Fetch orders for that specific date
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id')
        .eq('user_id', userProfile.id)
        .eq('status', 'confirmed')
        .gte('created_at', `${rawDate}T00:00:00`)
        .lt('created_at', `${nextDay}T00:00:00`);

      if (ordersError || !orders || orders.length === 0) {
        setProductDayDetails([]);
        setProductDayLoading(false);
        return;
      }

      const orderIds = orders.map(o => o.id);

      // Fetch order items - use product_name directly from order_items table
      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .select('product_name, quantity, unit, total')
        .in('order_id', orderIds);

      if (itemsError || !orderItems) {
        setProductDayDetails([]);
        setProductDayLoading(false);
        return;
      }

      // Group by product_name and count items as pieces (PC)
      const productGroups: Record<string, { 
        product_name: string; 
        quantity: number; 
        unit: string; 
        total: number;
      }> = {};

      orderItems.forEach((item: any) => {
        const productName = item.product_name || 'Unknown Product';
        
        if (!productGroups[productName]) {
          productGroups[productName] = {
            product_name: productName,
            quantity: 0,
            unit: 'PC',
            total: 0
          };
        }

        // Count each order_item as 1 piece (PC), regardless of unit or quantity
        productGroups[productName].quantity += 1;
        productGroups[productName].total += Number(item.total || 0);
      });

      // Sort by revenue DESC (quantity is now item count, no decimals needed)
      const productArray = Object.values(productGroups)
        .sort((a, b) => b.total - a.total);

      setProductDayDetails(productArray);
    } catch (error) {
      console.error('Error fetching product day details:', error);
      setProductDayDetails([]);
    } finally {
      setProductDayLoading(false);
    }
  };

  // Fetch beat-wise breakdown for a selected user in the summary table
  const fetchBeatBreakdown = async (userName: string) => {
    setBeatBreakdownLoading(true);
    try {
      const fromDate = format(dateRange.from, 'yyyy-MM-dd');
      const toDate = format(dateRange.to, 'yyyy-MM-dd');

      // Get user ID from profile
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('id')
        .ilike('full_name', `${userName}%`)
        .limit(1)
        .maybeSingle();

      if (!userProfile) {
        setBeatBreakdownData([]);
        return;
      }

      // Calculate next day for date range query
      const nextDay = format(new Date(new Date(toDate).getTime() + 86400000), 'yyyy-MM-dd');

      // Fetch orders with retailer beat info and total_amount
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          retailer_id,
          total_amount,
          retailers!inner(beat_name, beat_id)
        `)
        .eq('user_id', userProfile.id)
        .eq('status', 'confirmed')
        .gte('created_at', `${fromDate}T00:00:00`)
        .lt('created_at', `${nextDay}T00:00:00`);

      if (ordersError || !orders || orders.length === 0) {
        setBeatBreakdownData([]);
        return;
      }

      // Group by beat_name and calculate totals using total_amount directly
      const beatTotals: Record<string, { total_value: number; order_count: number }> = {};
      
      orders.forEach((order: any) => {
        const beatName = order.retailers?.beat_name || 'Unassigned';
        // Use total_amount directly (includes taxes and charges)
        const orderTotal = Number(order.total_amount || 0);
        
        if (!beatTotals[beatName]) {
          beatTotals[beatName] = { total_value: 0, order_count: 0 };
        }
        beatTotals[beatName].total_value += orderTotal;
        beatTotals[beatName].order_count += 1;
      });

      // Convert to array and sort by total_value descending
      const breakdown = Object.entries(beatTotals)
        .map(([beat_name, data]) => ({
          beat_name,
          total_value: data.total_value,
          order_count: data.order_count
        }))
        .sort((a, b) => b.total_value - a.total_value);

      setBeatBreakdownData(breakdown);
       
       // Trigger translation for Hindi beat names
       translateTexts(breakdown.map(b => b.beat_name));
    } catch (error) {
      console.error('Error fetching beat breakdown:', error);
      setBeatBreakdownData([]);
    } finally {
      setBeatBreakdownLoading(false);
    }
  };

  // Handle click on user row in summary table to show beat split
  const handleSummaryRowClick = (userName: string) => {
    // Toggle off if same user clicked
    if (selectedSummaryUser === userName) {
      setSelectedSummaryUser(null);
      setBeatBreakdownData([]);
    } else {
      setSelectedSummaryUser(userName);
      fetchBeatBreakdown(userName);
    }
    // Also show detailed section below
    handleRowClick(userName);
  };

  // Fetch retailer details for a specific beat (drill-down from beat-wise split)
  const fetchRetailerDetailsForBeat = async (beatName: string) => {
    if (!selectedSummaryUser) return;
    
    setRetailerDetailsLoading(true);
    setSelectedBeatForDetails(beatName);
    setRetailerDetailsOpen(true);
    
    try {
      const fromDate = format(dateRange.from, 'yyyy-MM-dd');
      const toDate = format(dateRange.to, 'yyyy-MM-dd');

      // Get user ID from profile
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('id')
        .ilike('full_name', `${selectedSummaryUser}%`)
        .limit(1)
        .maybeSingle();

      if (!userProfile) {
        setRetailerDetailsData([]);
        return;
      }

      // Calculate next day for date range query
      const nextDay = format(new Date(new Date(toDate).getTime() + 86400000), 'yyyy-MM-dd');

      // Fetch orders with retailer info and total_amount for this beat
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          retailer_id,
          total_amount,
          retailers!inner(id, name, beat_name)
        `)
        .eq('user_id', userProfile.id)
        .eq('status', 'confirmed')
        .gte('created_at', `${fromDate}T00:00:00`)
        .lt('created_at', `${nextDay}T00:00:00`);

      if (ordersError || !orders || orders.length === 0) {
        setRetailerDetailsData([]);
        return;
      }

      // Filter orders for this specific beat
      const beatOrders = orders.filter((order: any) => {
        const orderBeatName = order.retailers?.beat_name || 'Unassigned';
        return orderBeatName === beatName;
      });

      if (beatOrders.length === 0) {
        setRetailerDetailsData([]);
        return;
      }

      // Group by retailer and calculate totals using total_amount directly
      const retailerTotals: Record<string, { name: string; total_value: number; order_count: number; order_ids: string[] }> = {};
      
      beatOrders.forEach((order: any) => {
        const retailerId = order.retailer_id;
        const retailerName = order.retailers?.name || 'Unknown Retailer';
        // Use total_amount directly (includes taxes and charges)
        const orderTotal = Number(order.total_amount || 0);
        
        if (!retailerTotals[retailerId]) {
          retailerTotals[retailerId] = { name: retailerName, total_value: 0, order_count: 0, order_ids: [] };
        }
        retailerTotals[retailerId].total_value += orderTotal;
        retailerTotals[retailerId].order_count += 1;
        retailerTotals[retailerId].order_ids.push(order.id);
      });

      // Convert to array and sort by total_value descending
      const details = Object.values(retailerTotals)
        .map(data => ({
          retailer_name: data.name,
          total_value: data.total_value,
          order_count: data.order_count,
          order_ids: data.order_ids
        }))
        .sort((a, b) => b.total_value - a.total_value);

      setRetailerDetailsData(details);
       
       // Trigger translation for Hindi retailer names  
       translateTexts(details.map(r => r.retailer_name));
    } catch (error) {
      console.error('Error fetching retailer details:', error);
      setRetailerDetailsData([]);
    } finally {
      setRetailerDetailsLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    setDownloadingPDF(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;

      const pdf = new jsPDF('p', 'pt', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      const addSectionHeader = (text: string) => {
        if (y > pdf.internal.pageSize.getHeight() - 60) {
          pdf.addPage();
          y = margin;
        }
        y += 10;
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(30, 30, 30);
        pdf.text(text, margin, y);
        y += 6;
        pdf.setDrawColor(100, 100, 100);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 12;
      };

      const addKeyValue = (key: string, value: string) => {
        if (y > pdf.internal.pageSize.getHeight() - 30) {
          pdf.addPage();
          y = margin;
        }
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(60, 60, 60);
        pdf.text(key + ':', margin, y);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(30, 30, 30);
        pdf.text(value, margin + 140, y);
        y += 16;
      };

      // --- Header ---
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 30, 30);
      pdf.text('Analytics & Insights Report', margin, y + 4);
      y += 22;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Period: ${format(dateRange.from, 'MMM dd, yyyy')} – ${format(dateRange.to, 'MMM dd, yyyy')}`, margin, y);
      y += 14;
      const userFilterText = selectedUserIds.length === 0
        ? 'All Users'
        : selectedUsers.length <= 5
          ? selectedUsers.join(', ')
          : `${selectedUsers.length} users selected`;
      pdf.text(`Users: ${userFilterText}`, margin, y);
      y += 20;

      // --- Section 1: Business Summary ---
      addSectionHeader('Business Summary');
      addKeyValue('Total Order Value', `₹${businessSummary.totalRevenue.toLocaleString()}`);
      addKeyValue('Total Quantity (PC)', `${businessSummary.totalPieces.toLocaleString()} PC`);
      addKeyValue('Total KG', businessSummary.totalKg.toLocaleString());
      addKeyValue('Total Orders', businessSummary.totalOrders.toLocaleString());
      addKeyValue('Total Beats', businessSummary.totalBeats.toLocaleString());
      addKeyValue('Total Retailers', businessSummary.totalRetailers.toLocaleString());
      addKeyValue('Pending Payments', `₹${businessSummary.pendingPayments.toLocaleString()}`);

      // --- Section 2: Order Summary by User ---
      addSectionHeader('Order Summary by User');
      if (summaryData.length > 0) {
        const orderTableData = summaryData.map((u, i) => [
          (i + 1).toString(),
          u.full_name,
          u.total_kg.toLocaleString(),
          `₹${u.total_order_value.toLocaleString()}`
        ]);

        autoTable(pdf, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [['#', 'User Name', 'Total PC', 'Total Order Value']],
          body: orderTableData,
          styles: { fontSize: 9, cellPadding: 4 },
          headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 245, 255] },
        });
        y = (pdf as any).lastAutoTable.finalY + 16;
      } else {
        pdf.setFontSize(10);
        pdf.text('No order data available for the selected period.', margin, y);
        y += 16;
      }

      // --- Section 3: Revenue by SKU ---
      addSectionHeader('Revenue by SKU');
      const fromDate = format(dateRange.from, 'yyyy-MM-dd');
      const toDate = format(dateRange.to, 'yyyy-MM-dd');

      // Get selected user IDs
      const selectedUserIds = selectedUsers.length > 0 
        ? summaryData.filter(u => selectedUsers.includes(u.full_name)).map(u => u.user_id)
        : summaryData.map(u => u.user_id);

      // Step 1: Fetch orders for selected users and date range
      let ordersQuery = supabase
        .from('orders')
        .select('id')
        .gte('order_date', fromDate)
        .lte('order_date', toDate)
        .eq('status', 'confirmed');

      if (selectedUserIds.length > 0) {
        ordersQuery = ordersQuery.in('user_id', selectedUserIds);
      }

      const { data: orders = [] } = await ordersQuery;
      const orderIds = orders.map((o: any) => o.id);

      // Step 2: Fetch order_items for these orders
      let allOrderItems: any[] = [];
      if (orderIds.length > 0) {
        const { data: items = [] } = await supabase
          .from('order_items')
          .select('product_name, unit, total')
          .in('order_id', orderIds);
        allOrderItems = items;
      }

      // Group by product and count items (each row = 1 item/piece)
      const skuMap = new Map<string, { unit: string; itemCount: number; revenue: number }>();
      allOrderItems.forEach((item: any) => {
        const key = `${item.product_name}||${item.unit}`;
        const existing = skuMap.get(key);
        if (existing) {
          existing.itemCount += 1; // Count items, not quantities
          existing.revenue += Number(item.total || 0);
        } else {
          skuMap.set(key, {
            unit: item.unit || 'PC',
            itemCount: 1,
            revenue: Number(item.total || 0)
          });
        }
      });

      const skuTableData = Array.from(skuMap.entries())
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .map(([key, v]) => [
          key.split('||')[0],
          'PC', // Always show as PC
          v.itemCount.toString(),
          `₹${v.revenue.toLocaleString()}`
        ]);

      if (skuTableData.length > 0) {
        autoTable(pdf, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [['Product', 'Unit', 'Qty Sold', 'Revenue']],
          body: skuTableData,
          styles: { fontSize: 9, cellPadding: 4 },
          headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [240, 253, 244] },
        });
        y = (pdf as any).lastAutoTable.finalY + 16;
      } else {
        pdf.setFontSize(10);
        pdf.text('No SKU data available.', margin, y);
        y += 16;
      }

      // --- Section 4: Attendance & Market Hours ---
      addSectionHeader('Attendance & Market Hours');
      
      // Fetch attendance data for all users in date range
      let attendanceQuery = supabase
        .from('attendance')
        .select('user_id, total_hours, date')
        .gte('date', fromDate)
        .lte('date', toDate)
        .in('status', ['present', 'regularized']);

      if (selectedUserIds.length > 0) {
        attendanceQuery = attendanceQuery.in('user_id', selectedUserIds);
      }

      const { data: attendanceData } = await attendanceQuery;

      // Fetch market hours from visits
      let visitsHoursQuery = supabase
        .from('visits')
        .select('user_id, check_in_time, check_out_time, planned_date')
        .gte('planned_date', fromDate)
        .lte('planned_date', toDate)
        .in('status', ['productive', 'unproductive']);

      if (selectedUserIds.length > 0) {
        visitsHoursQuery = visitsHoursQuery.in('user_id', selectedUserIds);
      }

      const { data: visitsHoursData } = await visitsHoursQuery;

      // Build user name lookup
      const allUserIds = new Set<string>();
      attendanceData?.forEach(a => allUserIds.add(a.user_id));
      visitsHoursData?.forEach(v => allUserIds.add(v.user_id));

      const userNameLookup: Record<string, string> = {};
      users.forEach(u => { if (u.full_name) userNameLookup[u.id] = u.full_name; });

      // Aggregate attendance per user
      const attMap = new Map<string, { totalHours: number; days: number }>();
      attendanceData?.forEach(a => {
        const name = userNameLookup[a.user_id] || 'Unknown';
        const existing = attMap.get(name) || { totalHours: 0, days: 0 };
        existing.totalHours += Number(a.total_hours || 0);
        existing.days += 1;
        attMap.set(name, existing);
      });

      // Aggregate market hours per user from visits
      const marketMap = new Map<string, { totalMinutes: number; days: Set<string> }>();
      visitsHoursData?.forEach(v => {
        if (v.check_in_time && v.check_out_time) {
          const name = userNameLookup[v.user_id] || 'Unknown';
          const existing = marketMap.get(name) || { totalMinutes: 0, days: new Set<string>() };
          const inTime = new Date(v.check_in_time).getTime();
          const outTime = new Date(v.check_out_time).getTime();
          existing.totalMinutes += (outTime - inTime) / 60000;
          existing.days.add(v.planned_date);
          marketMap.set(name, existing);
        }
      });

      const attendanceTableData: string[][] = [];
      const allAttNames = new Set([...attMap.keys(), ...marketMap.keys()]);
      allAttNames.forEach(name => {
        const att = attMap.get(name);
        const market = marketMap.get(name);
        const avgWorkHrs = att && att.days > 0 ? (att.totalHours / att.days).toFixed(1) : '-';
        const avgMarketHrs = market && market.days.size > 0 ? (market.totalMinutes / market.days.size / 60).toFixed(1) : '-';
        const days = att?.days || 0;
        attendanceTableData.push([name, `${avgWorkHrs} hrs`, `${avgMarketHrs} hrs`, days.toString()]);
      });

      if (attendanceTableData.length > 0) {
        autoTable(pdf, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [['User', 'Avg Working Hours', 'Avg Retailer Hours', 'Days']],
          body: attendanceTableData,
          styles: { fontSize: 9, cellPadding: 4 },
          headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [239, 246, 255] },
        });
        y = (pdf as any).lastAutoTable.finalY + 16;
      } else {
        pdf.setFontSize(10);
        pdf.text('No attendance data available.', margin, y);
        y += 16;
      }

      // --- Section 5: Productivity Summary ---
      addSectionHeader('Productivity Summary');

      let prodQuery = supabase
        .from('visits')
        .select('user_id, status, planned_date')
        .gte('planned_date', fromDate)
        .lte('planned_date', toDate);

      if (selectedUserIds.length > 0) {
        prodQuery = prodQuery.in('user_id', selectedUserIds);
      }

      const { data: prodData } = await prodQuery;

      // Aggregate per user
      const prodMap = new Map<string, { planned: number; productive: number; unproductive: number; pending: number }>();
      prodData?.forEach(v => {
        const name = userNameLookup[v.user_id] || 'Unknown';
        const existing = prodMap.get(name) || { planned: 0, productive: 0, unproductive: 0, pending: 0 };
        existing.planned += 1;
        if (v.status === 'productive') existing.productive += 1;
        else if (v.status === 'unproductive') existing.unproductive += 1;
        else existing.pending += 1;
        prodMap.set(name, existing);
      });

      const prodTableData = Array.from(prodMap.entries())
        .sort((a, b) => {
          const pctA = a[1].planned > 0 ? (a[1].productive / a[1].planned) * 100 : 0;
          const pctB = b[1].planned > 0 ? (b[1].productive / b[1].planned) * 100 : 0;
          return pctB - pctA;
        })
        .map(([name, d]) => {
          const pct = d.planned > 0 ? ((d.productive / d.planned) * 100).toFixed(1) + '%' : '-';
          return [name, d.planned.toString(), d.productive.toString(), d.unproductive.toString(), d.pending.toString(), pct];
        });

      if (prodTableData.length > 0) {
        autoTable(pdf, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [['User', 'Planned', 'Productive', 'Unproductive', 'Pending', 'Productivity %']],
          body: prodTableData,
          styles: { fontSize: 9, cellPadding: 4 },
          headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [255, 251, 235] },
        });
        y = (pdf as any).lastAutoTable.finalY + 16;
      } else {
        pdf.setFontSize(10);
        pdf.text('No productivity data available.', margin, y);
        y += 16;
      }

      // --- Section 6: AI Insights ---
      if (aiInsights.length > 0) {
        addSectionHeader('AI Insights');
        pdf.setFontSize(10);
        aiInsights.forEach(insight => {
          if (y > pdf.internal.pageSize.getHeight() - 40) {
            pdf.addPage();
            y = margin;
          }
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(60, 60, 60);
          pdf.text(`• ${insight.title}`, margin, y);
          y += 14;
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(80, 80, 80);
          const lines = pdf.splitTextToSize(insight.description, contentWidth - 10);
          pdf.text(lines, margin + 10, y);
          y += lines.length * 12 + 6;
        });
      }

      // --- Footer: page numbers ---
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.text(`Page ${i} of ${totalPages}`, pageWidth - margin - 60, pdf.internal.pageSize.getHeight() - 10);
      }

      const pdfBlob = pdf.output('blob');
      await downloadPDF(pdfBlob, `Analytics_Report_${format(dateRange.from, 'yyyy-MM-dd')}_to_${format(dateRange.to, 'yyyy-MM-dd')}.pdf`);
      toast.success('Report PDF downloaded');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to generate PDF');
    } finally {
      setDownloadingPDF(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Show loading while scope is being determined */}
      {!isScopeReady ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex items-center justify-center gap-2">
              <RefreshCw className="animate-spin h-6 w-6 text-primary" />
              <span className="text-muted-foreground">Loading team data...</span>
            </div>
          </CardContent>
        </Card>
      ) : (
      <>
      {/* Summarize Report & Download PDF Buttons */}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadPDF}
          disabled={downloadingPDF}
          className="gap-2"
        >
          {downloadingPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {downloadingPDF ? 'Generating...' : 'Download PDF'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setReportSummaryOpen(true)}
          className="gap-2"
        >
          <Volume2 className="h-4 w-4" />
          Summarize Report
        </Button>
      </div>

      <div ref={reportContentRef} className="space-y-4">
      {/* Total Order Value Banner - Dashboard visualization */}
       <div className="grid grid-cols-2 gap-2 md:gap-4">
         {/* Total Order Value Banner */}
         <Card className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg cursor-pointer hover:shadow-xl transition-shadow border-2 border-yellow-400/70" onClick={() => { fetchBusinessOrderDetails(selectedUserIds, dateRange); setShowOrderDetailsDialog(true); }}>
        <CardContent className="p-3 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] md:text-sm opacity-90">Total Order Value</p>
              <p className="text-xl md:text-3xl lg:text-4xl font-bold">
                ₹{(businessSummary.totalRevenue / 100000).toFixed(2)} Lac
              </p>
              <p className="text-[8px] md:text-xs opacity-75 mt-0.5 md:mt-1">
                {format(dateRange.from, 'MMM dd')} - {format(dateRange.to, 'MMM dd, yyyy')}
              </p>
            </div>
            <div className="md:text-right space-y-0.5 md:space-y-1 mt-1 md:mt-0">
              <p className="text-[9px] md:text-sm opacity-90">{businessSummary.totalOrders} Orders</p>
              <p className="text-[9px] md:text-sm opacity-90">{businessSummary.totalRetailers} Retailers</p>
            </div>
          </div>
        </CardContent>
      </Card>

         {/* Total Quantity Banner - Matching prominent style */}
         <Card className="bg-gradient-to-r from-indigo-700 to-indigo-600 text-white shadow-lg cursor-pointer hover:shadow-xl transition-shadow border-2 border-yellow-400/70" onClick={() => { fetchProductDetails(selectedUserIds, dateRange); setShowProductBreakdown(true); }}>
           <CardContent className="p-3 md:p-6">
             <div className="flex flex-col md:flex-row md:items-center md:justify-between">
               <div>
                 <p className="text-[10px] md:text-sm opacity-90">Total Quantity</p>
                 <p className="text-xl md:text-3xl lg:text-4xl font-bold">
                   {businessSummary.totalPieces > 0
                     ? `${businessSummary.totalPieces} PC`
                     : 'No Data'
                   }
                 </p>
                 <p className="text-[8px] md:text-xs opacity-75 mt-0.5 md:mt-1">
                   {format(dateRange.from, 'MMM dd')} - {format(dateRange.to, 'MMM dd, yyyy')}
                 </p>
               </div>
               <div className="md:text-right space-y-0.5 md:space-y-1 mt-1 md:mt-0">
                 {businessSummary.totalPieces > 0 && (
                   <p className="text-[9px] md:text-sm opacity-90">+ {businessSummary.totalPieces} pcs</p>
                 )}
                 <p className="text-[9px] md:text-sm opacity-90">{businessSummary.totalBeats} Beats</p>
               </div>
             </div>
           </CardContent>
         </Card>
       </div>

      {/* Business Summary Cards */}
       <div className="space-y-2">
         {/* Row 1: Total Beats, Total Retailers, Total Orders */}
         <div className="grid grid-cols-3 md:grid-cols-5 gap-2 md:gap-3">
           <BusinessSummaryCard
             title="Total Beats"
             value={businessSummary.totalBeats}
             icon={<MapPin size={14} className="text-primary md:w-[18px] md:h-[18px]" />}
             onClick={() => { fetchBeatDetails(selectedUserIds, dateRange); setShowBeatDetails(true); }}
             isLoading={businessLoading}
             className="md:col-span-1"
           />
           <BusinessSummaryCard
             title="Total Retailers"
             value={businessSummary.totalRetailers}
             icon={<Store size={14} className="text-blue-600 md:w-[18px] md:h-[18px]" />}
             iconBgClass="bg-blue-500/10"
             onClick={() => { fetchBusinessRetailerDetails(selectedUserIds, dateRange); setShowRetailerDetailsDialog(true); }}
             isLoading={businessLoading}
             className="md:col-span-1"
           />
           <BusinessSummaryCard
             title="Total Orders"
             value={businessSummary.totalOrders}
             icon={<ShoppingCart size={14} className="text-green-600 md:w-[18px] md:h-[18px]" />}
             iconBgClass="bg-green-500/10"
             onClick={() => { fetchBusinessOrderDetails(selectedUserIds, dateRange); setShowOrderDetailsDialog(true); }}
             isLoading={businessLoading}
             className="md:col-span-1"
           />
           {/* These two are hidden on mobile, shown on md+ */}
           <BusinessSummaryCard
             title="Total Revenue"
             value={`₹${(businessSummary.totalRevenue / 1000).toFixed(0)}K`}
             icon={<IndianRupee size={14} className="text-purple-600 md:w-[18px] md:h-[18px]" />}
             iconBgClass="bg-purple-500/10"
             onClick={() => { fetchBusinessOrderDetails(selectedUserIds, dateRange); setShowOrderDetailsDialog(true); }}
             isLoading={businessLoading}
             className="hidden md:block"
           />
           <BusinessSummaryCard
             title="Pending Payments"
             value={`₹${(businessSummary.pendingPayments / 1000).toFixed(0)}K`}
             icon={<CreditCard size={14} className="text-red-600 md:w-[18px] md:h-[18px]" />}
             iconBgClass="bg-red-500/10"
             onClick={() => { fetchPendingPaymentDetails(selectedUserIds, dateRange); setShowPendingPayments(true); }}
             isLoading={businessLoading}
             className="hidden md:block"
           />
         </div>
         {/* Row 2: Total Revenue, Pending Payments (mobile only) */}
         <div className="grid grid-cols-2 gap-2 md:hidden">
           <BusinessSummaryCard
             title="Total Revenue"
             value={`₹${(businessSummary.totalRevenue / 1000).toFixed(0)}K`}
             icon={<IndianRupee size={14} className="text-purple-600" />}
             iconBgClass="bg-purple-500/10"
             onClick={() => { fetchBusinessOrderDetails(selectedUserIds, dateRange); setShowOrderDetailsDialog(true); }}
             isLoading={businessLoading}
           />
           <BusinessSummaryCard
             title="Pending Payments"
             value={`₹${(businessSummary.pendingPayments / 1000).toFixed(0)}K`}
             icon={<CreditCard size={14} className="text-red-600" />}
             iconBgClass="bg-red-500/10"
             onClick={() => { fetchPendingPaymentDetails(selectedUserIds, dateRange); setShowPendingPayments(true); }}
             isLoading={businessLoading}
           />
         </div>
       </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg md:text-xl">Order Summary by User</CardTitle>
          <p className="text-sm text-muted-foreground">
            View confirmed order totals grouped by user
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Results */}
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="animate-spin mx-auto mb-2" size={24} />
              <p className="text-muted-foreground">Loading data...</p>
            </div>
          ) : summaryData.length > 0 ? (
            <>
              {/* Filter Buttons - Always visible */}
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <div className="flex items-center gap-1">
                  <Button
                    variant={orderUserFilter === 'top5' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => setOrderUserFilter(orderUserFilter === 'top5' ? 'all' : 'top5')}
                  >
                    Top 5
                  </Button>
                  <Button
                    variant={orderUserFilter === 'bottom5' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => setOrderUserFilter(orderUserFilter === 'bottom5' ? 'all' : 'bottom5')}
                  >
                    Bottom 5
                  </Button>
                </div>
                <div className="flex items-center gap-1">
                  {!hideOrderChart && (
                    <ToggleGroup type="single" value={chartType} onValueChange={(v) => v && setChartType(v as 'pie' | 'bar')}>
                      <ToggleGroupItem value="pie" aria-label="Pie Chart" className="h-8 w-8 p-0">
                        <PieChartIcon className="h-4 w-4" />
                      </ToggleGroupItem>
                      <ToggleGroupItem value="bar" aria-label="Bar Chart" className="h-8 w-8 p-0">
                        <BarChart3 className="h-4 w-4" />
                      </ToggleGroupItem>
                    </ToggleGroup>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setHideOrderChart(!hideOrderChart)}
                    title={hideOrderChart ? "Show Visual" : "Hide Visual"}
                  >
                    {hideOrderChart ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className={cn(
                "grid grid-cols-1 gap-6 transition-all duration-300",
                hideOrderChart ? "" : (selectedSummaryUser ? "lg:grid-cols-5" : "lg:grid-cols-2")
              )}>
              {/* Chart Section - shrinks when beat split is open, hidden when hideOrderChart is true */}
              {!hideOrderChart && (
              <div className={cn(
                "space-y-2 transition-all duration-300",
                selectedSummaryUser ? "lg:col-span-2" : "lg:col-span-1"
              )}>
                <ResponsiveContainer width="100%" height={isMobile ? 280 : (selectedSummaryUser ? 280 : 350)}>
                  {chartType === 'pie' ? (
                    <PieChart margin={isMobile ? { top: 20, right: 20, bottom: 20, left: 20 } : undefined}>
                      <Pie
                        data={pieChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={isMobile ? 70 : (selectedSummaryUser ? 90 : 120)}
                        label={false}
                        labelLine={false}
                        onClick={handlePieClick}
                        style={{ cursor: 'pointer' }}
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.color}
                            stroke={selectedUserDetails === entry.name ? '#000' : 'transparent'}
                            strokeWidth={selectedUserDetails === entry.name ? 3 : 0}
                          />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number, name: string, props: any) => {
                          const entry = props.payload;
                          return [`${value.toLocaleString()} KG`, name];
                        }}
                        labelFormatter={() => ''}
                      />
                      <Legend wrapperStyle={{ fontSize: isMobile ? '6px' : (selectedSummaryUser ? '10px' : '12px') }} />
                    </PieChart>
                  ) : (
                    <BarChart data={pieChartData} layout="vertical" margin={{ left: isMobile ? 10 : 20, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                      <XAxis type="number" tickFormatter={(value) => `${value.toLocaleString()} KG`} />
                      <YAxis 
                        type="category" 
                        dataKey="name" 
                        width={isMobile ? 70 : (selectedSummaryUser ? 60 : 80)} 
                        tick={{ fontSize: isMobile ? 9 : (selectedSummaryUser ? 10 : 12) }}
                        tickFormatter={(value) => {
                          if (isMobile && value.length > 10) {
                            return value.substring(0, 10) + '...';
                          }
                          return value;
                        }}
                      />
                      <Tooltip 
                        formatter={(value: number, name: string) => [`${value.toLocaleString()} KG`, name]}
                        labelFormatter={() => ''}
                      />
                      <Bar 
                        dataKey="value" 
                        onClick={(data) => handlePieClick(data)}
                        style={{ cursor: 'pointer' }}
                        label={isMobile ? undefined : undefined}
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.color}
                            stroke={selectedUserDetails === entry.name ? '#000' : 'transparent'}
                            strokeWidth={selectedUserDetails === entry.name ? 2 : 0}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
              )}

              {/* Summary Table with Beat-wise Split View - expands when beat split is open or chart is hidden */}
              <div className={cn(
                "transition-all duration-300",
                hideOrderChart ? "" : (selectedSummaryUser ? "lg:col-span-3" : "lg:col-span-1")
              )}>
                <h3 className="font-semibold mb-2">User Order Summary</h3>
                <p className="text-xs text-muted-foreground mb-3">Click a row to see beat-wise breakdown</p>
                <div className={cn(
                  "grid gap-4 transition-all duration-300",
                  selectedSummaryUser ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
                )}>
                  {/* Left: User Summary Table */}
                  <div className={cn(
                    "border rounded-lg scrollbar-always-visible",
                    filteredSummaryData.length > 6 && "max-h-[320px]"
                  )}>
                    <div className="min-w-max">
                      <table className={cn("w-full caption-bottom", isMobile ? "text-[9px]" : "text-sm")}>
                        <thead className="sticky top-0 bg-muted/50 z-10">
                          <tr className="bg-muted/50 border-b">
                            <th className={cn("text-left font-medium text-muted-foreground whitespace-nowrap", isMobile ? "py-1 px-2" : "h-12 px-4")}>Full Name</th>
                            <th className={cn("text-right font-medium text-muted-foreground whitespace-nowrap", isMobile ? "py-1 px-2" : "h-12 px-4")}>Qty (PC)</th>
                            <th className={cn("text-right font-medium text-muted-foreground whitespace-nowrap", isMobile ? "py-1 px-2" : "h-12 px-4")}>Total Order Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSummaryData.map((row, index) => (
                            <tr 
                              key={index} 
                              className={cn(
                                "cursor-pointer hover:bg-muted/50 transition-colors border-b",
                                selectedSummaryUser === row.full_name && "bg-primary/10 border-l-2 border-l-primary"
                              )}
                              onClick={() => handleSummaryRowClick(row.full_name)}
                            >
                              <td className={cn("align-middle whitespace-nowrap", isMobile ? "py-0.5 px-2" : "p-4")}>
                                <div className="flex items-center gap-2">
                                  <div 
                                    className={cn(isMobile ? "w-2 h-2" : "w-3 h-3", "rounded-full shrink-0")}
                                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                  />
                                  {row.full_name}
                                </div>
                              </td>
                              <td className={cn("text-right font-semibold text-primary align-middle whitespace-nowrap", isMobile ? "py-0.5 px-2" : "p-4")}>
                                {row.total_kg.toLocaleString()}
                              </td>
                              <td className={cn("text-right font-semibold align-middle whitespace-nowrap", isMobile ? "py-0.5 px-2" : "p-4")}>
                                ₹{row.total_order_value.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-background sticky bottom-0 z-10">
                          <tr className="border-t">
                            <td className={cn("font-semibold align-middle whitespace-nowrap", isMobile ? "py-1 px-2" : "p-4")}>
                              Total{orderUserFilter !== 'all' ? ` (${filteredSummaryData.length})` : ''}
                            </td>
                            <td className={cn("text-right font-bold text-primary align-middle whitespace-nowrap", isMobile ? "py-1 px-2" : "p-4")}>
                              {filteredSummaryData.reduce((sum, r) => sum + r.total_kg, 0).toLocaleString()}
                            </td>
                            <td className={cn("text-right font-bold align-middle whitespace-nowrap", isMobile ? "py-1 px-2" : "p-4")}>
                              ₹{filteredSummaryData.reduce((sum, r) => sum + r.total_order_value, 0).toLocaleString()}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Right: Beat-wise Breakdown Panel */}
                  {selectedSummaryUser && (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-primary/10 px-4 py-2 border-b flex items-center justify-between">
                        <h5 className="font-semibold text-sm">
                          Beat-wise Split - {selectedSummaryUser}
                        </h5>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSummaryUser(null);
                            setBeatBreakdownData([]);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      {beatBreakdownLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <RefreshCw className="animate-spin h-5 w-5" />
                        </div>
                      ) : beatBreakdownData.length > 0 ? (
                        <div className="max-h-[300px] overflow-auto">
                          <p className="text-xs text-muted-foreground px-4 py-1">Click a beat to see retailer details</p>
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/30">
                                <TableHead className="text-xs py-1.5 px-2">Beat Name</TableHead>
                                <TableHead className="text-xs py-1.5 px-2 text-right w-[60px]">Orders</TableHead>
                                <TableHead className="text-xs py-1.5 px-2 text-right w-[80px]">Value</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {beatBreakdownData.map((beat, index) => (
                                <TableRow 
                                  key={index}
                                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                                  onClick={() => fetchRetailerDetailsForBeat(beat.beat_name)}
                                >
                                   <TableCell className="text-xs py-1.5 px-2 text-primary underline-offset-2 hover:underline">{getTranslated(beat.beat_name)}</TableCell>
                                  <TableCell className="text-xs py-1.5 px-2 text-right">{beat.order_count}</TableCell>
                                  <TableCell className="text-xs py-1.5 px-2 text-right font-semibold">
                                    ₹{beat.total_value.toLocaleString()}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                            <tfoot className="bg-muted/30 sticky bottom-0">
                              <TableRow>
                                <TableCell className="text-xs py-1.5 px-2 font-semibold">Total</TableCell>
                                <TableCell className="text-xs py-1.5 px-2 text-right font-semibold">
                                  {beatBreakdownData.reduce((s, b) => s + b.order_count, 0)}
                                </TableCell>
                                <TableCell className="text-xs py-1.5 px-2 text-right font-bold text-primary">
                                  ₹{beatBreakdownData.reduce((s, b) => s + b.total_value, 0).toLocaleString()}
                                </TableCell>
                              </TableRow>
                            </tfoot>
                          </Table>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          No beat data found
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No data found for the selected filters
            </div>
          )}
        </CardContent>
      </Card>

      {/* Retailer Details Dialog (drill-down from beat row) */}
      <Dialog open={retailerDetailsOpen} onOpenChange={setRetailerDetailsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              Retailer Details - {selectedBeatForDetails}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {selectedSummaryUser} • {format(dateRange.from, 'MMM dd')} - {format(dateRange.to, 'MMM dd, yyyy')}
            </p>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {retailerDetailsLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="animate-spin h-6 w-6" />
              </div>
            ) : retailerDetailsData.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Retailer Name</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-center">Invoice</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {retailerDetailsData.map((retailer, index) => {
                    const isLoading = retailer.order_ids.some(id => loadingInvoiceView === id);
                    
                    const handleShowInvoice = async () => {
                      if (retailer.order_ids.length === 0) return;
                      
                      try {
                        const orderId = retailer.order_ids[0];
                        setLoadingInvoiceView(orderId);
                        const { blob, invoiceNumber } = await fetchAndGenerateInvoice(orderId);
                        const url = URL.createObjectURL(blob);
                        // Open PDF in new tab instead of iframe (Chrome blocks blob iframes)
                        const newTab = window.open(url, '_blank', 'noopener,noreferrer');
                        if (!newTab) {
                          // Fallback: download directly
                          await downloadPDF(blob, `Invoice-${invoiceNumber}.pdf`);
                          toast.success('Invoice downloaded');
                        }
                        // Clean up blob URL after a delay
                        setTimeout(() => URL.revokeObjectURL(url), 60000);
                      } catch (error) {
                        console.error('Error generating invoice:', error);
                        toast.error('Failed to generate invoice');
                      } finally {
                        setLoadingInvoiceView(null);
                      }
                    };
                    
                    return (
                      <TableRow key={index}>
                         <TableCell>{getTranslated(retailer.retailer_name)}</TableCell>
                        <TableCell className="text-right">{retailer.order_count}</TableCell>
                        <TableCell className="text-right font-semibold">
                          ₹{retailer.total_value.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={handleShowInvoice}
                            disabled={isLoading}
                            title={`Show invoice`}
                          >
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <FileText className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <tfoot className="bg-muted/30">
                  <TableRow>
                    <TableCell className="font-semibold">Total ({retailerDetailsData.length} retailers)</TableCell>
                    <TableCell className="text-right font-semibold">
                      {retailerDetailsData.reduce((s, r) => s + r.order_count, 0)}
                    </TableCell>
                    <TableCell className="text-right font-bold text-primary">
                      ₹{retailerDetailsData.reduce((s, r) => s + r.total_value, 0).toLocaleString()}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </tfoot>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No retailer data found for this beat
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>





      <Dialog open={othersDialogOpen} onOpenChange={setOthersDialogOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Others - {othersData.length} Users
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Click a user to view their details
            </p>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>User Name</TableHead>
                  <TableHead className="text-right">Order Value</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {othersData.map((user, index) => (
                  <TableRow 
                    key={index}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleOthersUserClick(user.name)}
                  >
                    <TableCell className="text-primary hover:underline">{user.name}</TableCell>
                    <TableCell className="text-right font-semibold">
                      ₹{user.value.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {user.percentage}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <tfoot className="bg-muted/30">
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-bold text-primary">
                    ₹{othersData.reduce((s, u) => s + u.value, 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground font-semibold">
                    {othersData.length > 0 && totalOrderValue > 0 
                      ? ((othersData.reduce((s, u) => s + u.value, 0) / totalOrderValue) * 100).toFixed(0)
                      : 0}%
                  </TableCell>
                </TableRow>
              </tfoot>
            </Table>
          </div>
        </DialogContent>
      </Dialog>


      {/* User Details Section */}
      {selectedUserDetails && (
        <Card className="shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base sm:text-lg md:text-xl">Order Details - {selectedUserDetails}</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => {
              setSelectedUserDetails(null);
              setUserDetails([]);
              setDetailsSummary(null);
              setOrderDetailsBeatBreakdown([]);
              setExpandedBox(null);
            }}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {detailsLoading ? (
              <div className="text-center py-8">
                <RefreshCw className="animate-spin mx-auto mb-2" size={24} />
                <p className="text-muted-foreground">Loading details...</p>
              </div>
            ) : (
              <>
                {/* Summary Cards */}
                {detailsSummary && (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 sm:gap-4 mb-4 sm:mb-6">
                    <Card 
                      className={cn(
                        "p-1.5 sm:p-4 cursor-pointer transition-colors hover:bg-muted/50",
                        expandedBox === 'retailersBeats' && "ring-2 ring-primary"
                      )}
                      onClick={handleRetailersBoxClick}
                    >
                      <div className="flex items-center gap-1 sm:gap-2 text-muted-foreground text-[10px] sm:text-sm mb-0.5 sm:mb-1">
                        <Store className="h-3 w-3 sm:h-4 sm:w-4" />
                        Retailers
                      </div>
                      <div className="text-sm sm:text-2xl font-bold">
                        {orderDetailsBeatBreakdown.length > 0 
                          ? orderDetailsBeatBreakdown.reduce((sum, b) => sum + b.total_retailers, 0)
                          : detailsSummary.retailers}
                      </div>
                    </Card>
                    <Card 
                      className={cn(
                        "p-1.5 sm:p-4 cursor-pointer transition-colors hover:bg-muted/50",
                        expandedBox === 'retailersBeats' && "ring-2 ring-primary"
                      )}
                      onClick={handleBeatsBoxClick}
                    >
                      <div className="flex items-center gap-1 sm:gap-2 text-muted-foreground text-[10px] sm:text-sm mb-0.5 sm:mb-1">
                        <MapPin className="h-3 w-3 sm:h-4 sm:w-4" />
                        Beats
                      </div>
                      <div className="text-sm sm:text-2xl font-bold">
                        {orderDetailsBeatBreakdown.length > 0 
                          ? orderDetailsBeatBreakdown.length
                          : detailsSummary.beats}
                      </div>
                    </Card>
                    <Card 
                      className={cn(
                        "p-1.5 sm:p-4 cursor-pointer transition-colors hover:bg-muted/50",
                        expandedBox === 'productsKg' && "ring-2 ring-primary"
                      )}
                      onClick={handleProductsKgBoxClick}
                    >
                      <div className="flex items-center gap-1 sm:gap-2 text-muted-foreground text-[10px] sm:text-sm mb-0.5 sm:mb-1">
                        <Package className="h-3 w-3 sm:h-4 sm:w-4" />
                        Products
                      </div>
                      <div className="text-sm sm:text-2xl font-bold">{detailsSummary.products}</div>
                    </Card>
                    <Card 
                      className={cn(
                        "p-1.5 sm:p-4 cursor-pointer transition-colors hover:bg-muted/50",
                        expandedBox === 'productsKg' && "ring-2 ring-primary"
                      )}
                      onClick={handleProductsKgBoxClick}
                    >
                      <div className="flex items-center gap-1 sm:gap-2 text-muted-foreground text-[10px] sm:text-sm mb-0.5 sm:mb-1">
                        <Scale className="h-3 w-3 sm:h-4 sm:w-4" />
                        Total PC
                      </div>
                      <div className="text-sm sm:text-2xl font-bold">{detailsSummary.totalPieces || 0}</div>
                    </Card>
                    <Card 
                      className="p-1.5 sm:p-4 cursor-pointer transition-colors hover:bg-muted/50"
                      onClick={() => setProductivityDrilldownUser(selectedUserDetails)}
                    >
                      <div className="flex items-center gap-1 sm:gap-2 text-muted-foreground text-[10px] sm:text-sm mb-0.5 sm:mb-1">
                        <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4" />
                        Productivity
                      </div>
                      <div className="text-sm sm:text-2xl font-bold">
                        {detailsSummary.productivityPercent !== null 
                          ? `${detailsSummary.productivityPercent}%` 
                          : 'N/A'}
                      </div>
                    </Card>
                  </div>
                )}

                {/* AI Insights */}
                <OrderDetailsAIInsights userName={selectedUserDetails} dateRange={dateRange} />

                {/* Beat-wise Breakdown Subtable (for Retailers/Beats boxes) */}
                {expandedBox === 'retailersBeats' && (
                  <div className="mb-6">
                    <h4 className="font-semibold mb-3 text-sm flex items-center gap-2">
                      Beat-wise Breakdown
                      {orderDetailsBeatBreakdown.length > 8 && <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </h4>
                    {orderDetailsBeatLoading ? (
                      <div className="flex items-center justify-center py-8 border rounded-lg">
                        <RefreshCw className="animate-spin h-5 w-5 mr-2" />
                        <span className="text-muted-foreground">Loading...</span>
                      </div>
                    ) : orderDetailsBeatBreakdown.length > 0 ? (
                      <div className={cn(
                        "border rounded-lg overflow-hidden",
                        orderDetailsBeatBreakdown.length > 8 && "max-h-[360px] overflow-y-auto"
                      )}>
                        <Table>
                          <TableHeader className="sticky top-0 bg-muted/50 z-10">
                            <TableRow>
                              <TableHead>Beat Name</TableHead>
                              <TableHead className="text-right">Orders</TableHead>
                              <TableHead className="text-right">Retailers</TableHead>
                              <TableHead className="text-right">Value</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {orderDetailsBeatBreakdown.map((beat, index) => (
                              <TableRow key={index} className="hover:bg-muted/30">
                                 <TableCell className="font-medium">{getTranslated(beat.beat_name)}</TableCell>
                                <TableCell className="text-right">{beat.order_count}</TableCell>
                                <TableCell className="text-right">{beat.total_retailers}</TableCell>
                                <TableCell className="text-right font-semibold">
                                  ₹{beat.total_value.toLocaleString()}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                          <tfoot className="bg-muted/30 sticky bottom-0">
                            <TableRow>
                              <TableCell className="font-semibold">TOTAL</TableCell>
                              <TableCell className="text-right font-semibold">
                                {orderDetailsBeatBreakdown.reduce((s, b) => s + b.order_count, 0)}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {orderDetailsBeatBreakdown.reduce((s, b) => s + b.total_retailers, 0)}
                              </TableCell>
                              <TableCell className="text-right font-bold text-primary">
                                ₹{orderDetailsBeatBreakdown.reduce((s, b) => s + b.total_value, 0).toLocaleString()}
                              </TableCell>
                            </TableRow>
                          </tfoot>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground border rounded-lg text-sm">
                        No beat data found for this period
                      </div>
                    )}
                  </div>
                )}

                {/* Products/KG Subtable with Split View */}
                {expandedBox === 'productsKg' && productKgList.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-semibold mb-3 text-sm flex items-center gap-2">
                      Daily Sales Summary ({productKgList.length - 1} days)
                      {productKgList.length > 9 && <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </h4>
                    <div className={cn(
                      "grid gap-4 transition-all duration-300",
                      selectedProductDate ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
                    )}>
                      {/* Left: Daily Summary Table */}
                      <div className={cn(
                        "border rounded-lg overflow-hidden",
                        productKgList.length > 9 && "max-h-[360px] overflow-y-auto"
                      )}>
                        <Table>
                          <TableHeader className="sticky top-0 bg-muted/50 z-10">
                            <TableRow>
                              <TableHead className="text-xs py-1.5 px-2 whitespace-nowrap">Date</TableHead>
                              <TableHead className="text-xs py-1.5 px-2 text-right whitespace-nowrap">Qty (PC)</TableHead>
                              <TableHead className="text-xs py-1.5 px-2 text-right whitespace-nowrap">Revenue</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {productKgList.map((row, index) => (
                              <TableRow 
                                key={index} 
                                className={cn(
                                  "transition-colors",
                                  row.order_date !== 'TOTAL' && "cursor-pointer hover:bg-muted/30",
                                  row.order_date === 'TOTAL' && "bg-muted/50 font-semibold",
                                  selectedProductDate === row.order_date && "bg-primary/10 ring-1 ring-primary"
                                )}
                                onClick={() => handleProductDateClick(row.raw_date, row.order_date)}
                              >
                                <TableCell className={cn("text-xs py-1.5 px-2 whitespace-nowrap", row.order_date === 'TOTAL' ? 'font-bold' : '')}>
                                  {row.order_date}
                                </TableCell>
                                <TableCell className="text-xs py-1.5 px-2 text-right">{row.quantity_kg.toFixed(2)}</TableCell>
                                <TableCell className="text-xs py-1.5 px-2 text-right">₹{row.revenue.toLocaleString()}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Right: Product-wise breakdown for selected date */}
                      {selectedProductDate && (
                        <div className="border rounded-lg overflow-hidden">
                          <div className="bg-primary/10 px-4 py-2 border-b flex items-center justify-between">
                            <h5 className="font-semibold text-sm">
                              Products on {selectedProductDate}
                            </h5>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6"
                              onClick={() => {
                                setSelectedProductDate(null);
                                setProductDayDetails([]);
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          {productDayLoading ? (
                            <div className="flex items-center justify-center py-8">
                              <RefreshCw className="animate-spin h-5 w-5 text-muted-foreground" />
                            </div>
                          ) : productDayDetails.length > 0 ? (
                            <div className={cn(
                              productDayDetails.length > 8 && "max-h-[320px] overflow-y-auto"
                            )}>
                              <Table>
                                <TableHeader className="sticky top-0 bg-muted/50 z-10">
                                  <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead className="text-right">Qty</TableHead>
                                    <TableHead className="text-right">Revenue</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {productDayDetails.map((product, index) => (
                                    <TableRow key={index} className="hover:bg-muted/30">
                                      <TableCell className="max-w-[150px] truncate" title={product.product_name}>
                                        {product.product_name}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        {product.quantity} {product.unit}
                                      </TableCell>
                                      <TableCell className="text-right">₹{product.total.toLocaleString()}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                                <tfoot className="bg-muted/30">
                                  <TableRow>
                                    <TableCell className="font-semibold">Total</TableCell>
                                    <TableCell />
                                    <TableCell className="text-right font-bold text-primary">
                                      ₹{productDayDetails.reduce((sum, p) => sum + p.total, 0).toLocaleString()}
                                    </TableCell>
                                  </TableRow>
                                </tfoot>
                              </Table>
                            </div>
                          ) : (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                              No product data found
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Details Table */}
                <p className="text-sm text-muted-foreground">Click a row to see product breakdown</p>
                {userDetails.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Date</TableHead>
                          <TableHead>Beat</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Invoice</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {userDetails.map((row, index) => (
                          <TableRow key={index} className="hover:bg-muted/30">
                            <TableCell>
                              <div>
                                <div className="font-medium">{format(new Date(row.order_date), 'MMM dd')}</div>
                                <div className="text-xs text-muted-foreground">{format(new Date(row.order_date), 'EEEE')}</div>
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[300px] truncate" title={row.beat_names}>
                              {row.beat_names}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              ₹{row.total_amount.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              ZIP({row.invoice_count})
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <tfoot className="bg-muted/30">
                        <TableRow>
                          <TableCell className="font-semibold" colSpan={2}>
                            Total ({userDetails.length} days)
                          </TableCell>
                          <TableCell className="text-right font-bold text-primary">
                            ₹{userDetails.reduce((sum, row) => sum + row.total_amount, 0).toLocaleString()}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </tfoot>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No order details found for this user
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Revenue Summary by SKU Section */}
      <RevenueBySKUSection 
        selectedUsers={skuFilterUser ? [skuFilterUser] : selectedUsers} 
        dateRange={dateRange}
        filteredUserName={skuFilterUser}
        onClearFilter={handleClearSkuFilter}
        onDataLoaded={handleSkuDataLoaded}
        allUsers={users}
      />

      {/* Attendance & Market Hours Section */}
      <AttendanceMarketHoursSection 
        selectedUsers={selectedUserIds} 
        dateRange={dateRange}
        allUsers={users}
      />

      {/* Productivity Summary Section */}
      <ProductivitySummarySection 
        selectedUsers={selectedUsers} 
        selectedUserIds={selectedUserIds}
        dateRange={dateRange}
        allUsers={users}
        onDataLoaded={handleProductivityDataLoaded}
      />

      {/* Leaderboard Section */}
      <LeaderboardSection
        selectedUserIds={selectedUserIds}
        dateRange={dateRange}
        allUsers={users}
      />

       {/* Retailer Summary Section - Hidden
       <RetailerSummarySection 
         selectedUsers={selectedUsers} 
         dateRange={dateRange}
         allUsers={users}
       />
       */}

      {/* AI Insights Section - Moved to bottom */}
      {aiInsights.length > 0 && (
        <Card className="shadow-lg bg-gradient-to-r from-violet-50/50 to-purple-50/50 dark:from-violet-950/20 dark:to-purple-950/20 border-violet-200/50 dark:border-violet-800/50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">AI Insights</CardTitle>
                <p className="text-xs text-muted-foreground">Analysis based on user performance data</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              {aiInsights.map((insight, index) => (
                <div 
                  key={index}
                  className={cn(
                    "p-3 rounded-lg border",
                    insight.type === 'success' && "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
                    insight.type === 'warning' && "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
                    insight.type === 'opportunity' && "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
                    insight.type === 'info' && "bg-slate-50 border-slate-200 dark:bg-slate-950/30 dark:border-slate-800"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className={cn(
                      "p-1.5 rounded-md flex-shrink-0",
                      insight.type === 'success' && "bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-400",
                      insight.type === 'warning' && "bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-400",
                      insight.type === 'opportunity' && "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400",
                      insight.type === 'info' && "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400"
                    )}>
                      {insight.type === 'success' && <TrendingUp className="h-3.5 w-3.5" />}
                      {insight.type === 'warning' && <AlertTriangle className="h-3.5 w-3.5" />}
                      {insight.type === 'opportunity' && <Target className="h-3.5 w-3.5" />}
                      {insight.type === 'info' && <Users className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-medium text-sm">{insight.title}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{insight.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Day-wise Productivity Drilldown Dialog (from Order Details Productivity card) */}
      <Dialog open={!!productivityDrilldownUser} onOpenChange={() => setProductivityDrilldownUser(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Day-wise Productivity - {productivityDrilldownUser}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {format(dateRange.from, 'MMM dd')} - {format(dateRange.to, 'MMM dd, yyyy')}
            </p>
          </DialogHeader>
          <div className="flex-1 overflow-auto border rounded-lg">
            {productivityDrilldownLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="animate-spin h-5 w-5 mr-2" />
                <span className="text-muted-foreground">Loading...</span>
              </div>
            ) : productivityDrilldownData.length > 0 ? (
              <Table>
                <TableHeader className="sticky top-0 bg-muted/50 z-10">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Productive</TableHead>
                    <TableHead className="text-right">Unproductive</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Productivity %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productivityDrilldownData.map((row, index) => (
                    <TableRow key={index} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{row.planned_date}</TableCell>
                      <TableCell className="text-right text-green-600 font-medium">
                        {row.productive_visits}
                      </TableCell>
                      <TableCell className="text-right text-orange-600 font-medium">
                        {row.unproductive_visits}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {row.total_visits}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        <span className={cn(
                          row.productivity_percentage >= 70 ? 'text-green-600' :
                          row.productivity_percentage >= 50 ? 'text-yellow-600' : 'text-red-600'
                        )}>
                          {row.productivity_percentage}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <tfoot className="bg-muted/30 sticky bottom-0">
                  <TableRow>
                    <TableCell className="font-semibold">Total ({productivityDrilldownData.length} days)</TableCell>
                    <TableCell className="text-right font-bold text-green-600">
                      {productivityDrilldownData.reduce((sum, row) => sum + row.productive_visits, 0)}
                    </TableCell>
                    <TableCell className="text-right font-bold text-orange-600">
                      {productivityDrilldownData.reduce((sum, row) => sum + row.unproductive_visits, 0)}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {productivityDrilldownData.reduce((sum, row) => sum + row.total_visits, 0)}
                    </TableCell>
                    <TableCell className="text-right font-bold text-primary">
                      {(() => {
                        const totalProd = productivityDrilldownData.reduce((s, r) => s + r.productive_visits, 0);
                        const totalVisits = productivityDrilldownData.reduce((s, r) => s + r.total_visits, 0);
                        return totalVisits > 0 ? Math.round((totalProd / totalVisits) * 100 * 100) / 100 : 0;
                      })()}%
                    </TableCell>
                  </TableRow>
                </tfoot>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No productivity data found for this user
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      </div>{/* end reportContentRef */}

      {/* Report Summary Dialog */}
      <ReportSummaryDialog
        open={reportSummaryOpen}
        onClose={() => setReportSummaryOpen(false)}
        dateRange={dateRange}
        allUsersSummary={allUsersSummary}
        orderSummaryData={summaryData}
        skuData={skuDataForSummary}
        productivityData={productivityDataForSummary}
      />

      {/* Business Summary Dialogs */}
      <BeatDetailsDialog
        open={showBeatDetails}
        onOpenChange={setShowBeatDetails}
        data={beatDetails}
        isLoading={businessDetailsLoading}
        selectedUsers={selectedUsers}
        dateRange={dateRange}
      />
      <RetailerDetailsDialog
        open={showRetailerDetailsDialog}
        onOpenChange={setShowRetailerDetailsDialog}
        data={businessRetailerDetails}
        isLoading={businessDetailsLoading}
        selectedUsers={selectedUsers}
        dateRange={dateRange}
      />
      <OrderDetailsDialog
        open={showOrderDetailsDialog}
        onOpenChange={setShowOrderDetailsDialog}
        data={businessOrderDetails}
        isLoading={businessDetailsLoading}
        selectedUsers={selectedUsers}
        dateRange={dateRange}
      />
      <ProductBreakdownDialog
        open={showProductBreakdown}
        onOpenChange={setShowProductBreakdown}
        data={productDetails}
        isLoading={businessDetailsLoading}
        selectedUsers={selectedUsers}
        dateRange={dateRange}
      />
      <PendingPaymentsDialog
        open={showPendingPayments}
        onOpenChange={setShowPendingPayments}
        data={pendingPaymentDetails}
        isLoading={businessDetailsLoading}
        selectedUsers={selectedUsers}
        dateRange={dateRange}
      />
      </>
      )}
    </div>
  );
};
