import React, { useEffect, useState, useMemo } from 'react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { supabase } from '@/integrations/supabase/client';
import { moveToRecycleBin } from '@/utils/recycleBinUtils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, ShoppingCart, Building, Navigation, TrendingUp, Users, ArrowUp, ArrowDown, AlertTriangle, Target, Calendar, Activity, Award, AlertCircle, ChevronRight, Pencil, Trash2, MapPin, FileText, Clock, User, HeartHandshake, Eye, X, Plus, Store, Route } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, subMonths, subQuarters, startOfYear, endOfYear, subYears } from 'date-fns';
import TerritorySupportRequestForm from './TerritorySupportRequestForm';
import TerritoryPerformanceCalendar from './TerritoryPerformanceCalendar';
import { RetailerDetailModal } from './RetailerDetailModal';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { toast } from 'sonner';

const SUPPORT_TYPES = [
  { value: 'marketing_campaign', label: 'Marketing Campaign' },
  { value: 'branding_material', label: 'Branding Material' },
  { value: 'additional_manpower', label: 'Additional Manpower' },
  { value: 'training_program', label: 'Training Program' },
  { value: 'promotional_scheme', label: 'Promotional Scheme' },
  { value: 'infrastructure', label: 'Infrastructure Support' },
  { value: 'inventory_support', label: 'Inventory Support' },
  { value: 'technology_tools', label: 'Technology/Tools' },
  { value: 'other', label: 'Other' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const EXPECTED_IMPACTS = [
  { value: 'high_revenue', label: 'High Revenue Increase (>20%)' },
  { value: 'moderate_revenue', label: 'Moderate Revenue Increase (10-20%)' },
  { value: 'low_revenue', label: 'Low Revenue Increase (<10%)' },
  { value: 'market_share', label: 'Market Share Growth' },
  { value: 'retailer_coverage', label: 'Improved Retailer Coverage' },
  { value: 'brand_visibility', label: 'Enhanced Brand Visibility' },
  { value: 'customer_retention', label: 'Better Customer Retention' },
  { value: 'operational_efficiency', label: 'Operational Efficiency' },
];

interface TerritoryDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  territory: any;
  onEdit?: (territory: any) => void;
  onDelete?: (territory: any) => void;
}

const TerritoryDetailsModal: React.FC<TerritoryDetailsModalProps> = ({ open, onOpenChange, territory, onEdit, onDelete }) => {
  const { format: fmtMoney, displayCurrency } = useCurrency();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [distributors, setDistributors] = useState<any[]>([]);
  const [retailers, setRetailers] = useState<any[]>([]);
  const [beats, setBeats] = useState<any[]>([]);
  const [salesSummary, setSalesSummary] = useState({ totalSales: 0, totalOrders: 0, totalRetailers: 0, totalVisits: 0 });
  const [assignmentHistory, setAssignmentHistory] = useState<any[]>([]);
  const [salesTrendData, setSalesTrendData] = useState<any[]>([]);
  const [salesTrendFilter, setSalesTrendFilter] = useState<string>('6months');
  const [periodSummary, setPeriodSummary] = useState({ totalSales: 0, totalOrders: 0, totalVisits: 0 });
  const [allTerritoryOrders, setAllTerritoryOrders] = useState<any[]>([]);
  const [topSKUs, setTopSKUs] = useState<any[]>([]);
  const [bottomSKUs, setBottomSKUs] = useState<any[]>([]);
  const [topRetailers, setTopRetailers] = useState<any[]>([]);
  const [bottomRetailers, setBottomRetailers] = useState<any[]>([]);
  const [competitionData, setCompetitionData] = useState<any[]>([]);
  const [performanceFlag, setPerformanceFlag] = useState<string>('');
  const [parentTerritory, setParentTerritory] = useState<any>(null);
  const [grandparentTerritory, setGrandparentTerritory] = useState<any>(null);
  const [auditInfo, setAuditInfo] = useState<{ owner?: string; createdBy?: string; lastUpdatedBy?: string }>({});
  const [assignedUsers, setAssignedUsers] = useState<any[]>([]);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [supportRequests, setSupportRequests] = useState<any[]>([]);
  const [editingSupportRequest, setEditingSupportRequest] = useState<any>(null);
  const [topSKUsWithIds, setTopSKUsWithIds] = useState<any[]>([]);
  const [bottomSKUsWithIds, setBottomSKUsWithIds] = useState<any[]>([]);
  const [topRetailersWithIds, setTopRetailersWithIds] = useState<any[]>([]);
  const [bottomRetailersWithIds, setBottomRetailersWithIds] = useState<any[]>([]);
  const [entityFilter, setEntityFilter] = useState<'retailers' | 'distributors'>('retailers');
  const [selectedRetailerForModal, setSelectedRetailerForModal] = useState<any>(null);
  const [retailerDetailModalOpen, setRetailerDetailModalOpen] = useState(false);
  const [retailerCategoryFilter, setRetailerCategoryFilter] = useState<string>('all');
  const [retailerLastVisitFilter, setRetailerLastVisitFilter] = useState<string>('all');
  const [productSalesData, setProductSalesData] = useState<any[]>([]);
  const [retailerOrderStats, setRetailerOrderStats] = useState<Map<string, { last6Months: number; lifetime: number; lastOrderValue: number; lastOrderDate: string | null }>>(new Map());
  const [growthPotential, setGrowthPotential] = useState<string>('');
  const [growthPotentialDetails, setGrowthPotentialDetails] = useState<string>('');
  const [territoryTargets, setTerritoryTargets] = useState<{ revenueTarget: number; quantityTarget: number; actualRevenue: number; actualQuantity: number }>({ revenueTarget: 0, quantityTarget: 0, actualRevenue: 0, actualQuantity: 0 });
  
  // Financial Year state - year stored in DB is the END year of FY (e.g., 2026 for FY 2025-26)
  const getDefaultFY = () => {
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-11
    const currentYear = now.getFullYear();
    // If current month is April (3) or later, FY ends next year
    // If current month is Jan-Mar (0-2), FY ends this year
    return currentMonth >= 3 ? currentYear + 1 : currentYear;
  };
  const [selectedFY, setSelectedFY] = useState<number>(getDefaultFY());
  const [quantityUnit, setQuantityUnit] = useState<string>('units');
  
  // Generate available FY options (last 5 years)
  const fyOptions = useMemo(() => {
    const currentFY = getDefaultFY();
    const options = [];
    for (let i = 0; i < 5; i++) {
      const fy = currentFY - i;
      options.push({
        value: fy,
        label: `FY ${fy - 1}-${fy.toString().slice(-2)}`
      });
    }
    return options;
  }, []);

  const modalTitle = useMemo(() => territory ? `${territory.name}` : 'Territory Details', [territory]);

  useEffect(() => {
    if (open && territory) loadTerritoryData();
  }, [open, territory, selectedFY]);

  // Calculate sales trend based on filter
  useEffect(() => {
    if (!allTerritoryOrders || allTerritoryOrders.length === 0) {
      setSalesTrendData([]);
      setPeriodSummary({ totalSales: 0, totalOrders: 0, totalVisits: 0 });
      return;
    }

    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;
    let groupBy: 'month' | 'quarter' = 'month';

    switch (salesTrendFilter) {
      case 'monthly':
        startDate = subMonths(now, 1);
        startDate.setDate(1);
        break;
      case 'quarterly':
        startDate = subQuarters(now, 1);
        groupBy = 'quarter';
        break;
      case '6months':
        startDate = subMonths(now, 6);
        break;
      case 'currentyear':
        startDate = startOfYear(now);
        endDate = endOfYear(now);
        break;
      case 'lastyear':
        startDate = startOfYear(subYears(now, 1));
        endDate = endOfYear(subYears(now, 1));
        break;
      default:
        startDate = subMonths(now, 6);
    }

    const filteredOrders = allTerritoryOrders.filter(o => {
      const orderDate = new Date(o.created_at);
      return orderDate >= startDate && orderDate <= endDate;
    });

    // Group orders by period
    const periodMap = new Map<string, number>();
    
    filteredOrders.forEach(order => {
      const orderDate = new Date(order.created_at);
      let periodKey: string;
      
      if (groupBy === 'quarter') {
        const quarter = Math.floor(orderDate.getMonth() / 3) + 1;
        periodKey = `Q${quarter} ${orderDate.getFullYear()}`;
      } else {
        periodKey = format(orderDate, 'MMM yyyy');
      }
      
      const existing = periodMap.get(periodKey) || 0;
      periodMap.set(periodKey, existing + Number(order.total_amount || 0));
    });

    // Sort periods chronologically
    const chartData = Array.from(periodMap.entries())
      .map(([period, sales]) => ({ period, sales }))
      .sort((a, b) => {
        // Parse period to date for sorting
        if (a.period.startsWith('Q')) {
          const [qa, ya] = a.period.replace('Q', '').split(' ');
          const [qb, yb] = b.period.replace('Q', '').split(' ');
          return parseInt(ya) - parseInt(yb) || parseInt(qa) - parseInt(qb);
        }
        return new Date(a.period).getTime() - new Date(b.period).getTime();
      });

    setSalesTrendData(chartData);
    
    // Calculate period summary
    const totalSales = filteredOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    setPeriodSummary({
      totalSales,
      totalOrders: filteredOrders.length,
      totalVisits: 0, // Will fetch visits separately if needed
    });

    // Fetch visits for the period
    const fetchVisits = async () => {
      const retailerIds = retailers.map(r => r.id);
      if (retailerIds.length === 0) return;
      
      const { data: visitsData } = await supabase
        .from('visits')
        .select('id')
        .in('retailer_id', retailerIds)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      
      setPeriodSummary(prev => ({ ...prev, totalVisits: visitsData?.length || 0 }));
    };
    fetchVisits();

    // Calculate product-wise sales for the period
    const calculateProductSales = async () => {
      const orderIds = filteredOrders.map(o => o.id);
      if (orderIds.length === 0) {
        setProductSalesData([]);
        return;
      }

      const { data: orderItemsData } = await supabase
        .from('order_items')
        .select('product_name, quantity, total')
        .in('order_id', orderIds);

      if (!orderItemsData || orderItemsData.length === 0) {
        setProductSalesData([]);
        return;
      }

      const productMap = new Map<string, { name: string; quantity: number; sales: number }>();
      orderItemsData.forEach(item => {
        const existing = productMap.get(item.product_name) || { name: item.product_name, quantity: 0, sales: 0 };
        productMap.set(item.product_name, {
          name: item.product_name,
          quantity: existing.quantity + Number(item.quantity || 0),
          sales: existing.sales + Number(item.total || 0),
        });
      });

      const sortedProducts = Array.from(productMap.values())
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 10); // Top 10 products

      setProductSalesData(sortedProducts);
    };
    calculateProductSales();

  }, [salesTrendFilter, allTerritoryOrders, retailers]);

  const loadTerritoryData = async () => {
    if (!territory) return;
    setLoading(true);
    
    try {
      // Load hierarchy
      if (territory.parent_id) {
        const { data: parentData } = await supabase.from('territories').select('id, name, parent_id').eq('id', territory.parent_id).single();
        setParentTerritory(parentData);
        
        if (parentData?.parent_id) {
          const { data: grandparentData } = await supabase.from('territories').select('id, name').eq('id', parentData.parent_id).single();
          setGrandparentTerritory(grandparentData);
        }
      }

      // Get distributors from assigned_distributor_ids array
      let distributorsData: any[] = [];
      if (territory.assigned_distributor_ids && territory.assigned_distributor_ids.length > 0) {
        const { data } = await supabase
          .from('distributors')
          .select('id, name, contact_person, phone, status, outstanding_amount')
          .in('id', territory.assigned_distributor_ids);
        distributorsData = data || [];
      }
      setDistributors(distributorsData);

      // Load assigned users
      let usersData: any[] = [];
      if (territory.assigned_user_ids && territory.assigned_user_ids.length > 0) {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, username')
          .in('id', territory.assigned_user_ids);
        usersData = data || [];
      }
      setAssignedUsers(usersData);

      // Load competitors
      let competitorsData: any[] = [];
      if (territory.competitor_ids && territory.competitor_ids.length > 0) {
        const { data } = await supabase
          .from('competition_master')
          .select('id, competitor_name')
          .in('id', territory.competitor_ids);
        competitorsData = data || [];
      }
      setCompetitors(competitorsData);

      // Load audit info (owner, created_by, last_updated_by)
      const userIds = [territory.owner_id, territory.created_by, territory.last_updated_by].filter(Boolean);
      let auditUsers: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        if (profiles) {
          profiles.forEach(p => {
            auditUsers[p.id] = p.full_name || 'Unknown';
          });
        }
      }
      setAuditInfo({
        owner: territory.owner_id ? auditUsers[territory.owner_id] : undefined,
        createdBy: territory.created_by ? auditUsers[territory.created_by] : undefined,
        lastUpdatedBy: territory.last_updated_by ? auditUsers[territory.last_updated_by] : undefined,
      });

      // Load support requests for this territory
      const { data: supportData } = await supabase
        .from('support_requests')
        .select('*')
        .ilike('subject', `%${territory.name}%`)
        .eq('support_category', 'territory_support')
        .order('created_at', { ascending: false });
      setSupportRequests(supportData || []);
      
      // Load beats linked to this territory
      const { data: beatsData } = await supabase
        .from('beats')
        .select('id, beat_id, beat_name, category, is_active, average_km, average_time_minutes')
        .eq('territory_id', territory.id)
        .order('beat_name');
      setBeats(beatsData || []);

      // Fetch full retailer data for the territory
      const { data: retailersData } = await supabase
        .from('retailers')
        .select('id, name, category, address, phone, last_visit_date, last_order_value, last_order_date, priority, status, beat_id, territory_id, notes, parent_type, parent_name, location_tag, retail_type, potential, competitors, gst_number, latitude, longitude, photo_url, order_value, manual_credit_score')
        .eq('territory_id', territory.id);
      const matchingRetailers = retailersData || [];
      setRetailers(matchingRetailers);

      const retailerIds = matchingRetailers.map(r => r.id);
      
      // Get ALL orders for all time (for retailer count and filtering later)
      const { data: allOrdersData } = await supabase
        .from('orders')
        .select('id, total_amount, retailer_id, created_at, retailers(address, name)')
        .in('retailer_id', retailerIds)
        .order('created_at', { ascending: false });
      
      setAllTerritoryOrders(allOrdersData || []);

      // Calculate retailer order stats (last 6 months, lifetime, last order)
      const sixMonthsAgo = subMonths(new Date(), 6);
      const orderStatsMap = new Map<string, { last6Months: number; lifetime: number; lastOrderValue: number; lastOrderDate: string | null }>();
      
      matchingRetailers.forEach(retailer => {
        const retailerOrders = allOrdersData?.filter(o => o.retailer_id === retailer.id) || [];
        const lifetime = retailerOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
        const last6Months = retailerOrders
          .filter(o => new Date(o.created_at) >= sixMonthsAgo)
          .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
        
        // Get last order
        const lastOrder = retailerOrders.length > 0 ? retailerOrders[0] : null;
        const lastOrderValue = lastOrder ? Number(lastOrder.total_amount || 0) : 0;
        const lastOrderDate = lastOrder ? lastOrder.created_at : null;
        
        orderStatsMap.set(retailer.id, { last6Months, lifetime, lastOrderValue, lastOrderDate });
      });
      setRetailerOrderStats(orderStatsMap);

      setSalesSummary({
        totalSales: 0, // Will be set by period filter
        totalOrders: 0,
        totalRetailers: matchingRetailers.length,
        totalVisits: 0,
      });

      // Calculate performance flag based on last 6 months (reuse sixMonthsAgo)
      const recentOrders = allOrdersData?.filter(o => new Date(o.created_at) >= sixMonthsAgo) || [];
      const monthlyTotals: number[] = [];
      for (let i = 5; i >= 0; i--) {
        const monthStart = subMonths(new Date(), i);
        monthStart.setDate(1);
        const monthEnd = new Date(monthStart);
        monthEnd.setMonth(monthEnd.getMonth() + 1);
        const monthTotal = recentOrders
          .filter(o => new Date(o.created_at) >= monthStart && new Date(o.created_at) < monthEnd)
          .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
        monthlyTotals.push(monthTotal);
      }
      
      // Calculate performance with same logic as list view
      let currentPerformanceFlag = 'Stable';
      let currentGrowthRate = 0;
      if (matchingRetailers.length === 0 && monthlyTotals.every(m => m === 0)) {
        currentPerformanceFlag = 'New';
      } else if (monthlyTotals.length >= 2) {
        const currentMonth = monthlyTotals[monthlyTotals.length - 1];
        const previousMonth = monthlyTotals[monthlyTotals.length - 2];
        currentGrowthRate = previousMonth > 0 ? ((currentMonth - previousMonth) / previousMonth) * 100 : (currentMonth > 0 ? 100 : 0);
        
        if (currentGrowthRate > 25) currentPerformanceFlag = 'High Growth';
        else if (currentGrowthRate > 10) currentPerformanceFlag = 'Growth';
        else if (currentGrowthRate >= 5) currentPerformanceFlag = 'Stable';
        else if (currentGrowthRate >= 0) currentPerformanceFlag = 'Stable';
        else if (currentGrowthRate > -25) currentPerformanceFlag = 'Declining';
        else currentPerformanceFlag = 'Steep Decline';
      }
      setPerformanceFlag(currentPerformanceFlag);
      
      // Calculate Growth Potential
      const potentialRetailers = territory.retailer_count || 0;
      const coveragePercent = potentialRetailers > 0 ? (matchingRetailers.length / potentialRetailers) * 100 : 0;
      const totalSalesLast6Months = recentOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
      
      let calculatedGrowthPotential = 'Average growth territory';
      let calculatedGrowthPotentialDetails = '';
      
      if (matchingRetailers.length === 0 && potentialRetailers === 0) {
        calculatedGrowthPotential = 'Low growth territory';
        calculatedGrowthPotentialDetails = 'No retailer data available. Territory needs basic setup and market research.';
      } else if (currentGrowthRate > 15 && coveragePercent < 50) {
        calculatedGrowthPotential = 'High growth territory';
        calculatedGrowthPotentialDetails = `Strong growth rate of ${currentGrowthRate.toFixed(1)}% with only ${coveragePercent.toFixed(0)}% retailer coverage. Significant room for expansion with ${potentialRetailers - matchingRetailers.length} untapped retailers.`;
      } else if (currentGrowthRate > 10 || (coveragePercent < 30 && potentialRetailers > 10)) {
        calculatedGrowthPotential = 'High growth territory';
        calculatedGrowthPotentialDetails = `Territory shows ${currentGrowthRate.toFixed(1)}% growth. ${coveragePercent.toFixed(0)}% of ${potentialRetailers} potential retailers covered. Population: ${territory.population?.toLocaleString() || 'N/A'}.`;
      } else if (currentGrowthRate >= 0 && coveragePercent < 70) {
        calculatedGrowthPotential = 'Average growth territory';
        calculatedGrowthPotentialDetails = `Stable performance with ${coveragePercent.toFixed(0)}% coverage. Moderate expansion potential with ${potentialRetailers - matchingRetailers.length} retailers to target.`;
      } else if (currentGrowthRate < 0 && currentGrowthRate > -15) {
        calculatedGrowthPotential = 'Low growth territory';
        calculatedGrowthPotentialDetails = `Declining by ${Math.abs(currentGrowthRate).toFixed(1)}%. Focus on retention and service improvement before expansion.`;
      } else if (currentGrowthRate <= -15) {
        calculatedGrowthPotential = 'De-growth territory';
        calculatedGrowthPotentialDetails = `Steep decline of ${Math.abs(currentGrowthRate).toFixed(1)}%. Requires immediate intervention. Analyze competitor activity and retailer feedback.`;
      } else if (coveragePercent >= 70) {
        calculatedGrowthPotential = 'Low growth territory';
        calculatedGrowthPotentialDetails = `High coverage of ${coveragePercent.toFixed(0)}%. Focus on increasing wallet share from existing retailers rather than new acquisition.`;
      }
      
      setGrowthPotential(calculatedGrowthPotential);
      setGrowthPotentialDetails(calculatedGrowthPotentialDetails);

      // Use latest orders for current month summary (for top/bottom SKUs)
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      const ordersData = allOrdersData?.filter(o => new Date(o.created_at) >= startOfMonth) || [];

      // Top/Bottom SKUs with product IDs
      const { data: orderItemsData } = await supabase.from('order_items').select('product_id, product_name, quantity, total, order_id').in('order_id', ordersData?.map(o => o.id) || []);
      
      const skuMap = new Map();
      orderItemsData?.forEach(item => {
        const existing = skuMap.get(item.product_name) || { quantity: 0, total: 0, productId: item.product_id };
        skuMap.set(item.product_name, {
          quantity: existing.quantity + item.quantity,
          total: existing.total + item.total,
          productId: item.product_id || existing.productId,
        });
      });
      
      const skuArray = Array.from(skuMap.entries()).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.total - a.total);
      setTopSKUs(skuArray.slice(0, 5));
      setBottomSKUs(skuArray.slice(-5).reverse());
      setTopSKUsWithIds(skuArray.slice(0, 5));
      setBottomSKUsWithIds(skuArray.slice(-5).reverse());

      // Top/Bottom Retailers with IDs
      const retailerSalesMap = new Map();
      ordersData?.forEach(order => {
        const retailerId = order.retailer_id;
        const retailerName = (order.retailers as any)?.name || 'Unknown';
        const existing = retailerSalesMap.get(retailerId) || { name: retailerName, sales: 0 };
        retailerSalesMap.set(retailerId, { name: retailerName, sales: existing.sales + Number(order.total_amount || 0) });
      });
      
      const retailerArray = Array.from(retailerSalesMap.entries()).map(([id, data]) => ({ id, name: data.name, sales: data.sales })).sort((a, b) => b.sales - a.sales);
      setTopRetailers(retailerArray.slice(0, 5));
      setBottomRetailers(retailerArray.slice(-5).reverse());
      setTopRetailersWithIds(retailerArray.slice(0, 5));
      setBottomRetailersWithIds(retailerArray.slice(-5).reverse());

      // Competition data
      const { data: competitionEntries } = await supabase.from('competition_data').select('id, competitor_id, selling_price, stock_quantity, competition_master(competitor_name)').in('retailer_id', retailerIds).gte('created_at', startOfMonth.toISOString());
      
      const competitionMap = new Map();
      competitionEntries?.forEach(entry => {
        const name = (entry.competition_master as any)?.competitor_name || 'Unknown';
        const existing = competitionMap.get(name) || { count: 0, avgPrice: 0, totalStock: 0 };
        competitionMap.set(name, {
          count: existing.count + 1,
          avgPrice: existing.avgPrice + (entry.selling_price || 0),
          totalStock: existing.totalStock + (entry.stock_quantity || 0),
        });
      });
      
      const compArray = Array.from(competitionMap.entries()).map(([name, data]) => ({ 
        name, 
        entries: data.count,
        avgPrice: data.count > 0 ? (data.avgPrice / data.count).toFixed(2) : 0,
        totalStock: data.totalStock,
      })).sort((a, b) => b.entries - a.entries);
      setCompetitionData(compArray);

      const pincodeMap = new Map();
      territory.pincode_ranges?.forEach(pincode => {
        const pincodeOrders = ordersData?.filter(o => (o.retailers as any)?.address?.includes(pincode)) || [];
        const pincodeRetailers = matchingRetailers.filter(r => r.address?.includes(pincode));
        
        // Extract location name (text before the pincode)
        const sampleAddress = pincodeRetailers[0]?.address || '';
        const locationMatch = sampleAddress.match(new RegExp(`(.+?)\\s*${pincode}`));
        const locationName = locationMatch ? locationMatch[1].split(',').pop()?.trim() : '';
        
        pincodeMap.set(pincode, {
          sales: pincodeOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0),
          orders: pincodeOrders.length,
          retailers: pincodeRetailers.length,
          locationName,
        });
      });

      // Removed setPincodeSales - no longer needed
      
      // Get assignment history
      const { data: historyData } = await supabase.from('territory_assignment_history').select('*, profiles(full_name)').eq('territory_id', territory.id).order('assigned_from', { ascending: false });
      setAssignmentHistory(historyData || []);

      // Load territory targets for the selected Financial Year (April to March)
      // selectedFY is the END year of FY (e.g., 2026 for FY 2025-26)
      // So FY 2025-26 runs from April 2025 to March 2026
      const fyStartDate = new Date(selectedFY - 1, 3, 1); // April 1st of previous year
      const fyEndDate = new Date(selectedFY, 2, 31, 23, 59, 59); // March 31st of selected year
      
      // Get all territory targets for this territory (from all users' business plans)
      // Business plans are stored by the END year of FY (e.g., 2026 for FY 2025-26)
      const { data: targetsData } = await supabase
        .from('user_business_plan_territories')
        .select('quantity_target, revenue_target, user_business_plans!inner(year, quantity_unit)')
        .eq('territory_id', territory.id)
        .eq('user_business_plans.year', selectedFY);
      
      // Sum up all targets for this territory
      const totalRevenueTarget = targetsData?.reduce((sum, t) => sum + Number(t.revenue_target || 0), 0) || 0;
      const totalQuantityTarget = targetsData?.reduce((sum, t) => sum + Number(t.quantity_target || 0), 0) || 0;
      
      // Get quantity unit from business plan
      const planQuantityUnit = targetsData && targetsData.length > 0 
        ? (targetsData[0].user_business_plans as any)?.quantity_unit || 'units'
        : 'units';
      setQuantityUnit(planQuantityUnit);
      
      // Get actual revenue and quantity for the selected FY
      const fyOrders = allOrdersData?.filter(o => {
        const orderDate = new Date(o.created_at);
        return orderDate >= fyStartDate && orderDate <= fyEndDate;
      }) || [];
      
      const actualRevenue = fyOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
      
      // Get quantity from order items for FY orders
      let actualQuantity = 0;
      if (fyOrders.length > 0) {
        const fyOrderIds = fyOrders.map(o => o.id);
        const { data: orderItemsData } = await supabase
          .from('order_items')
          .select('quantity')
          .in('order_id', fyOrderIds);
        actualQuantity = orderItemsData?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;
      }
      
      setTerritoryTargets({
        revenueTarget: totalRevenueTarget,
        quantityTarget: totalQuantityTarget,
        actualRevenue,
        actualQuantity
      });
    } catch (error) {
      console.error('Error loading territory data:', error);
    }
    
    setLoading(false);
  };

  const getPerformanceBadgeColor = () => {
    if (performanceFlag === 'High Growth') return 'bg-green-500/10 text-green-600 border-green-500/20';
    if (performanceFlag === 'Growth') return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    if (performanceFlag === 'Stable') return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    if (performanceFlag === 'Declining') return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
    if (performanceFlag === 'Steep Decline') return 'bg-red-500/10 text-red-600 border-red-500/20';
    if (performanceFlag === 'New') return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
    return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
  };

  const getPerformanceIcon = () => {
    if (performanceFlag === 'High Growth' || performanceFlag === 'Growth') return <TrendingUp className="h-4 w-4" />;
    if (performanceFlag === 'Declining' || performanceFlag === 'Steep Decline') return <ArrowDown className="h-4 w-4" />;
    if (performanceFlag === 'New') return <Activity className="h-4 w-4" />;
    return <Activity className="h-4 w-4" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600">Open</Badge>;
      case 'in_progress':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600">In Progress</Badge>;
      case 'resolved':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600">Resolved</Badge>;
      case 'closed':
        return <Badge variant="outline" className="bg-gray-500/10 text-gray-600">Closed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleUpdateSupportRequest = async () => {
    if (!editingSupportRequest) return;
    
    try {
      // Get parsed data if available
      const parsedData = editingSupportRequest.parsedData || {};
      
      // Rebuild structured description with updated values
      const structuredDescription = JSON.stringify({
        support_type: editingSupportRequest.editSupportType || parsedData.support_type || '',
        priority: editingSupportRequest.editPriority || parsedData.priority || 'medium',
        estimated_budget: editingSupportRequest.editEstimatedBudget ?? parsedData.estimated_budget ?? null,
        expected_impact: editingSupportRequest.editExpectedImpact ?? parsedData.expected_impact ?? '',
        territory_id: parsedData.territory_id || '',
        territory_name: parsedData.territory_name || '',
        created_by_name: parsedData.created_by_name || '',
        description: editingSupportRequest.editDescription ?? parsedData.description ?? '',
      });

      // Get support type label for subject
      const supportTypeValue = editingSupportRequest.editSupportType || parsedData.support_type || '';
      const supportTypeLabel = SUPPORT_TYPES.find(t => t.value === supportTypeValue)?.label || supportTypeValue;
      const territoryName = parsedData.territory_name || '';
      const newSubject = supportTypeLabel && territoryName ? `${supportTypeLabel} - ${territoryName}` : editingSupportRequest.subject;

      const { error } = await supabase
        .from('support_requests')
        .update({
          subject: newSubject,
          description: structuredDescription,
          status: editingSupportRequest.editStatus || editingSupportRequest.status,
          resolution_notes: editingSupportRequest.resolution_notes,
        })
        .eq('id', editingSupportRequest.id);
      
      if (error) throw error;
      toast.success('Support request updated');
      setEditingSupportRequest(null);
      loadTerritoryData();
    } catch (error: any) {
      toast.error('Failed to update: ' + error.message);
    }
  };

  const handleDeleteSupportRequest = async () => {
    if (!editingSupportRequest) return;
    
    try {
      // Move to recycle bin
      const success = await moveToRecycleBin({
        tableName: 'support_requests',
        recordId: editingSupportRequest.id,
        recordData: editingSupportRequest,
        moduleName: 'Territory Support',
        recordName: editingSupportRequest.subject || 'Support Request'
      });
      
      if (success) {
        // Delete from database
        const { error: deleteError } = await supabase
          .from('support_requests')
          .delete()
          .eq('id', editingSupportRequest.id);
          
        if (deleteError) throw deleteError;
        
        toast.success('Support request moved to recycle bin');
        setEditingSupportRequest(null);
        loadTerritoryData();
      } else {
        toast.error('Failed to delete support request');
      }
    } catch (error: any) {
      toast.error('Failed to delete: ' + error.message);
    }
  };

  const navigateToProduct = (productId: string | undefined) => {
    if (productId) {
      onOpenChange(false);
      navigate(`/products?product=${productId}`);
    }
  };

  const navigateToRetailer = (retailerId: string | undefined) => {
    if (retailerId) {
      // Find the full retailer data from our list
      const retailerData = retailers.find(r => r.id === retailerId);
      if (retailerData) {
        setSelectedRetailerForModal(retailerData);
        setRetailerDetailModalOpen(true);
      }
    }
  };

  if (!territory) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto p-0">
        <div className="sticky top-0 z-10 bg-background border-b px-4 sm:px-6 py-4">
          <DialogHeader className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute -right-2 -top-2 h-8 w-8 rounded-full"
              onClick={() => onOpenChange(false)}
            >
              <span className="sr-only">Close</span>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
            <DialogTitle className="text-lg sm:text-xl pr-8">{modalTitle}</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">View territory details, analytics, and support requests</DialogDescription>
          </DialogHeader>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading territory data...</div>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6 px-4 sm:px-6 pb-6">
            {/* Hierarchy Display */}
            {(grandparentTerritory || parentTerritory) && (
              <Card className="shadow-lg bg-gradient-to-r from-primary/5 to-secondary/5">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-muted-foreground flex-wrap">
                    {grandparentTerritory && (
                      <>
                        <span className="font-medium truncate max-w-[100px] sm:max-w-none">{grandparentTerritory.name}</span>
                        <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                      </>
                    )}
                    {parentTerritory && (
                      <>
                        <span className="font-medium truncate max-w-[100px] sm:max-w-none">{parentTerritory.name}</span>
                        <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                      </>
                    )}
                    <span className="font-bold text-foreground truncate max-w-[120px] sm:max-w-none">{territory.name}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Action Buttons & Performance Flag */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
              <div className="flex items-center gap-2">
                {onEdit && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2"
                    onClick={() => {
                      onOpenChange(false);
                      setTimeout(() => onEdit(territory), 100);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                )}
                {onDelete && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => onDelete(territory)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                )}
              </div>
              {performanceFlag && (
                <Badge className={`${getPerformanceBadgeColor()} px-3 py-2 gap-2 justify-center sm:justify-start`}>
                  {getPerformanceIcon()}
                  <span className="text-xs sm:text-sm font-medium">Revenue: {performanceFlag}</span>
                </Badge>
              )}
              <div className="flex-1 sm:ml-auto">
                <TerritorySupportRequestForm territoryId={territory.id} territoryName={territory.name} onSuccess={loadTerritoryData} />
              </div>
            </div>

            {/* TERRITORY DETAILS SECTION - Shows all saved fields */}
            <Card className="shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Territory Details
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Name</p>
                    <p className="font-medium text-sm">{territory.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Region</p>
                    <p className="font-medium text-sm">{territory.region || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Territory Type</p>
                    <p className="font-medium text-sm">{territory.territory_type || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Parent Territory</p>
                    <p className="font-medium text-sm">{parentTerritory?.name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Population</p>
                    <p className="font-medium text-sm">{territory.population?.toLocaleString() || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Target Market Size</p>
                    <p className="font-medium text-sm">{territory.target_market_size ? fmtMoney(territory.target_market_size) : '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground"># of Retailers (Covered)</p>
                    <p className="font-medium text-sm">{salesSummary.totalRetailers}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Potential Retailers</p>
                    <p className="font-medium text-sm">{territory.retailer_count || '-'}</p>
                  </div>
                  {auditInfo.owner && (
                    <div>
                      <p className="text-xs text-muted-foreground">Owner</p>
                      <p className="font-medium text-sm">{auditInfo.owner}</p>
                    </div>
                  )}
                  {performanceFlag && (
                    <div>
                      <p className="text-xs text-muted-foreground">Revenue Growth Indicator</p>
                      <Badge className={`text-xs mt-1 ${getPerformanceBadgeColor()}`}>
                        {performanceFlag}
                      </Badge>
                    </div>
                  )}
                  {growthPotential && (
                    <div>
                      <p className="text-xs text-muted-foreground">Growth Potential</p>
                      <Badge className={`text-xs mt-1 ${
                        growthPotential === 'High growth territory' ? 'bg-green-500/20 text-green-700 border-green-500/30' :
                        growthPotential === 'Average growth territory' ? 'bg-blue-500/20 text-blue-700 border-blue-500/30' :
                        growthPotential === 'Low growth territory' ? 'bg-orange-500/20 text-orange-700 border-orange-500/30' :
                        'bg-red-500/20 text-red-700 border-red-500/30'
                      }`}>
                        {growthPotential}
                      </Badge>
                    </div>
                  )}
                  {growthPotentialDetails && (
                    <div className="col-span-full">
                      <p className="text-xs text-muted-foreground">Growth Potential Details</p>
                      <p className="text-sm text-muted-foreground mt-1">{growthPotentialDetails}</p>
                    </div>
                  )}
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">PIN Codes</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {territory.pincode_ranges?.length > 0 ? (
                        territory.pincode_ranges.map((pin: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="text-xs">{pin}</Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </div>
                  </div>
                  {assignedUsers.length > 0 && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Assigned Users</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {assignedUsers.map((user) => (
                          <Badge key={user.id} variant="secondary" className="text-xs">
                            <User className="h-3 w-3 mr-1" />
                            {user.full_name || user.username}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {distributors.length > 0 && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Assigned Distributors</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {distributors.map((d) => (
                          <Badge 
                            key={d.id} 
                            variant="secondary" 
                            className="text-xs cursor-pointer hover:bg-secondary/80 transition-colors"
                            onClick={() => {
                              onOpenChange(false);
                              navigate(`/distributor/${d.id}`);
                            }}
                          >
                            <Building className="h-3 w-3 mr-1" />
                            {d.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {competitors.length > 0 && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Key Competitors</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {competitors.map((c) => (
                          <Badge key={c.id} variant="outline" className="text-xs bg-red-500/10 text-red-600">
                            {c.competitor_name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {territory.description && (
                    <div className="col-span-full">
                      <p className="text-xs text-muted-foreground">Description</p>
                      <p className="font-medium text-sm">{territory.description}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Target vs Actual Section */}
            <Card className="shadow-lg">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    Target vs. Actual
                  </CardTitle>
                  <Select value={selectedFY.toString()} onValueChange={(val) => setSelectedFY(parseInt(val))}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="Select FY" />
                    </SelectTrigger>
                    <SelectContent>
                      {fyOptions.map(fy => (
                        <SelectItem key={fy.value} value={fy.value.toString()}>
                          {fy.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-4">
                {territoryTargets.revenueTarget > 0 || territoryTargets.quantityTarget > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Revenue Target vs Actual */}
                    <div className="p-4 rounded-lg bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-green-700">Revenue</span>
                        <Badge variant="outline" className={`text-xs ${
                          territoryTargets.actualRevenue >= territoryTargets.revenueTarget 
                            ? 'bg-green-500/20 text-green-700 border-green-500/30' 
                            : 'bg-orange-500/20 text-orange-700 border-orange-500/30'
                        }`}>
                          {territoryTargets.revenueTarget > 0 
                            ? `${((territoryTargets.actualRevenue / territoryTargets.revenueTarget) * 100).toFixed(0)}%` 
                            : '0%'}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Target</span>
                          <span className="font-medium">{fmtMoney(territoryTargets.revenueTarget)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Actual</span>
                          <span className="font-bold text-green-600">{fmtMoney(territoryTargets.actualRevenue)}</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2 mt-2">
                          <div 
                            className={`h-2 rounded-full transition-all ${
                              territoryTargets.actualRevenue >= territoryTargets.revenueTarget 
                                ? 'bg-green-500' 
                                : 'bg-orange-500'
                            }`}
                            style={{ width: `${Math.min((territoryTargets.actualRevenue / (territoryTargets.revenueTarget || 1)) * 100, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span>Gap: {territoryTargets.revenueTarget > territoryTargets.actualRevenue 
                            ? fmtMoney(territoryTargets.revenueTarget - territoryTargets.actualRevenue) 
                            : 'Target Achieved!'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Quantity Target vs Actual */}
                    <div className="p-4 rounded-lg bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-blue-700">Quantity</span>
                        <Badge variant="outline" className={`text-xs ${
                          territoryTargets.actualQuantity >= territoryTargets.quantityTarget 
                            ? 'bg-green-500/20 text-green-700 border-green-500/30' 
                            : 'bg-orange-500/20 text-orange-700 border-orange-500/30'
                        }`}>
                          {territoryTargets.quantityTarget > 0 
                            ? `${((territoryTargets.actualQuantity / territoryTargets.quantityTarget) * 100).toFixed(0)}%` 
                            : '0%'}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Target</span>
                          <span className="font-medium">{territoryTargets.quantityTarget.toLocaleString('en-IN')} {quantityUnit}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Actual</span>
                          <span className="font-bold text-blue-600">{territoryTargets.actualQuantity.toLocaleString('en-IN')} {quantityUnit}</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2 mt-2">
                          <div 
                            className={`h-2 rounded-full transition-all ${
                              territoryTargets.actualQuantity >= territoryTargets.quantityTarget 
                                ? 'bg-green-500' 
                                : 'bg-blue-500'
                            }`}
                            style={{ width: `${Math.min((territoryTargets.actualQuantity / (territoryTargets.quantityTarget || 1)) * 100, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span>Gap: {territoryTargets.quantityTarget > territoryTargets.actualQuantity 
                            ? `${(territoryTargets.quantityTarget - territoryTargets.actualQuantity).toLocaleString('en-IN')} ${quantityUnit}` 
                            : 'Target Achieved!'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No targets set for FY {selectedFY - 1}-{selectedFY.toString().slice(-2)}</p>
                )}
              </CardContent>
            </Card>

            {/* Audit Info */}
            <Card className="shadow-lg bg-muted/30">
              <CardContent className="p-3 sm:p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs sm:text-sm">
                  <div>
                    <p className="text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Created
                    </p>
                    <p className="font-medium">{territory.created_at ? format(new Date(territory.created_at), 'dd MMM yyyy, hh:mm a') : '-'}</p>
                    {auditInfo.createdBy && <p className="text-xs text-muted-foreground">by {auditInfo.createdBy}</p>}
                  </div>
                  <div>
                    <p className="text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Last Updated
                    </p>
                    <p className="font-medium">{territory.updated_at ? format(new Date(territory.updated_at), 'dd MMM yyyy, hh:mm a') : '-'}</p>
                    {auditInfo.lastUpdatedBy && <p className="text-xs text-muted-foreground">by {auditInfo.lastUpdatedBy}</p>}
                  </div>
                  {auditInfo.owner && (
                    <div>
                      <p className="text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" /> Owner
                      </p>
                      <p className="font-medium">{auditInfo.owner}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Performance Snapshot - Linked to Period */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <Card className="shadow-lg bg-gradient-to-br from-green-500/10 to-green-600/5">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-green-600 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground truncate">Total Sales</p>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-green-600 truncate">{fmtMoney(periodSummary.totalSales)}</p>
                </CardContent>
              </Card>

              <Card className="shadow-lg bg-gradient-to-br from-blue-500/10 to-blue-600/5">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ShoppingCart className="h-3 w-3 sm:h-4 sm:w-4 text-blue-600 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground truncate">Orders</p>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-blue-600">{periodSummary.totalOrders}</p>
                </CardContent>
              </Card>

              <Card className="shadow-lg bg-gradient-to-br from-purple-500/10 to-purple-600/5">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Building className="h-3 w-3 sm:h-4 sm:w-4 text-purple-600 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground truncate">Retailers</p>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-purple-600">{salesSummary.totalRetailers}</p>
                </CardContent>
              </Card>

              <Card className="shadow-lg bg-gradient-to-br from-orange-500/10 to-orange-600/5">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="h-3 w-3 sm:h-4 sm:w-4 text-orange-600 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground truncate">Visits</p>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-orange-600">{periodSummary.totalVisits}</p>
                </CardContent>
              </Card>
            </div>

            {/* Competition Activity */}
            {competitionData.length > 0 && (
              <Card className="shadow-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                    <Activity className="h-4 w-4 text-red-600" />
                    Competition Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 sm:p-4">
                  <div className="overflow-x-auto -mx-3 sm:mx-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs sm:text-sm">Competitor</TableHead>
                          <TableHead className="text-right text-xs sm:text-sm">Entries</TableHead>
                          <TableHead className="text-right text-xs sm:text-sm hidden sm:table-cell">Avg Price</TableHead>
                          <TableHead className="text-right text-xs sm:text-sm hidden sm:table-cell">Stock</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {competitionData.map((comp, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs sm:text-sm font-medium truncate max-w-[120px] sm:max-w-none">{comp.name}</TableCell>
                            <TableCell className="text-right text-xs sm:text-sm">
                              <Badge variant="outline">{comp.entries}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs sm:text-sm hidden sm:table-cell">{fmtMoney(Number(comp.avgPrice) || 0)}</TableCell>
                            <TableCell className="text-right text-xs sm:text-sm hidden sm:table-cell">{comp.totalStock}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tabs Section - Restructured */}
            <Tabs defaultValue="entities" className="w-full">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto gap-1 p-1">
                <TabsTrigger value="entities" className="text-xs sm:text-sm px-2 py-2">
                  <Store className="h-3 w-3 mr-1 hidden sm:inline" />
                  Retailers & Distributors
                </TabsTrigger>
                <TabsTrigger value="beats" className="text-xs sm:text-sm px-2 py-2">
                  <Route className="h-3 w-3 mr-1 hidden sm:inline" />
                  Beats ({beats.length})
                </TabsTrigger>
                <TabsTrigger value="performance" className="text-xs sm:text-sm px-2 py-2">
                  <TrendingUp className="h-3 w-3 mr-1 hidden sm:inline" />
                  Territory Performance
                </TabsTrigger>
                <TabsTrigger value="support" className="text-xs sm:text-sm px-2 py-2">
                  <HeartHandshake className="h-3 w-3 mr-1 hidden sm:inline" />
                  Support Requests
                </TabsTrigger>
              </TabsList>

              {/* Retailers & Distributors Tab */}
              <TabsContent value="entities" className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={entityFilter} onValueChange={(v: 'retailers' | 'distributors') => setEntityFilter(v)}>
                    <SelectTrigger className="w-[160px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="retailers">Retailers ({retailers.length})</SelectItem>
                      <SelectItem value="distributors">Distributors ({distributors.length})</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {entityFilter === 'retailers' && (
                    <>
                      <Select value={retailerCategoryFilter} onValueChange={setRetailerCategoryFilter}>
                        <SelectTrigger className="w-[130px] h-9">
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Categories</SelectItem>
                          {[...new Set(retailers.map(r => r.category).filter(Boolean))].map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <Select value={retailerLastVisitFilter} onValueChange={setRetailerLastVisitFilter}>
                        <SelectTrigger className="w-[140px] h-9">
                          <SelectValue placeholder="Last Visit" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Visits</SelectItem>
                          <SelectItem value="7days">Last 7 Days</SelectItem>
                          <SelectItem value="30days">Last 30 Days</SelectItem>
                          <SelectItem value="90days">Last 90 Days</SelectItem>
                          <SelectItem value="never">Never Visited</SelectItem>
                        </SelectContent>
                      </Select>
                    </>
                  )}
                </div>
                
                <Card className="shadow-lg">
                  <CardContent className="p-3 sm:p-4">
                    {entityFilter === 'retailers' ? (
                      (() => {
                        const filteredRetailers = retailers.filter(r => {
                          // Category filter
                          if (retailerCategoryFilter !== 'all' && r.category !== retailerCategoryFilter) return false;
                          
                          // Last visit filter
                          if (retailerLastVisitFilter !== 'all') {
                            const lastVisit = r.last_visit_date ? new Date(r.last_visit_date) : null;
                            const now = new Date();
                            
                            if (retailerLastVisitFilter === 'never' && lastVisit) return false;
                            if (retailerLastVisitFilter === '7days' && (!lastVisit || (now.getTime() - lastVisit.getTime()) > 7 * 24 * 60 * 60 * 1000)) return false;
                            if (retailerLastVisitFilter === '30days' && (!lastVisit || (now.getTime() - lastVisit.getTime()) > 30 * 24 * 60 * 60 * 1000)) return false;
                            if (retailerLastVisitFilter === '90days' && (!lastVisit || (now.getTime() - lastVisit.getTime()) > 90 * 24 * 60 * 60 * 1000)) return false;
                          }
                          
                          return true;
                        });
                        
                        return (
                          <div className="overflow-x-auto -mx-3 sm:mx-0">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs sm:text-sm">Name</TableHead>
                                  <TableHead className="text-xs sm:text-sm hidden sm:table-cell">Category</TableHead>
                                  <TableHead className="text-xs sm:text-sm hidden md:table-cell">Last Order</TableHead>
                                  <TableHead className="text-xs sm:text-sm hidden md:table-cell">Last Visit</TableHead>
                                  <TableHead className="text-xs sm:text-sm">Last 6 Months</TableHead>
                                  <TableHead className="text-xs sm:text-sm hidden lg:table-cell">Lifetime Value</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredRetailers.map(r => {
                                  const stats = retailerOrderStats.get(r.id) || { last6Months: 0, lifetime: 0, lastOrderValue: 0, lastOrderDate: null };
                                  return (
                                    <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigateToRetailer(r.id)}>
                                      <TableCell className="text-xs sm:text-sm font-medium text-primary">{r.name}</TableCell>
                                      <TableCell className="hidden sm:table-cell"><Badge variant="outline" className="text-xs">{r.category || '-'}</Badge></TableCell>
                                      <TableCell className="text-xs sm:text-sm text-muted-foreground hidden md:table-cell">
                                        {stats.lastOrderValue > 0 ? fmtMoney(stats.lastOrderValue) : '-'}
                                        {stats.lastOrderDate && <span className="block text-[10px]">{format(new Date(stats.lastOrderDate), 'dd MMM')}</span>}
                                      </TableCell>
                                      <TableCell className="text-xs sm:text-sm text-muted-foreground hidden md:table-cell">{r.last_visit_date ? format(new Date(r.last_visit_date), 'dd MMM yyyy') : '-'}</TableCell>
                                      <TableCell className="text-xs sm:text-sm font-medium">{fmtMoney(stats.last6Months)}</TableCell>
                                      <TableCell className="text-xs sm:text-sm text-muted-foreground hidden lg:table-cell">{fmtMoney(stats.lifetime)}</TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                            {filteredRetailers.length === 0 && <p className="text-center py-4 text-sm text-muted-foreground">No retailers match filters</p>}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="overflow-x-auto -mx-3 sm:mx-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs sm:text-sm">Name</TableHead>
                              <TableHead className="text-xs sm:text-sm">Contact</TableHead>
                              <TableHead className="text-xs sm:text-sm hidden sm:table-cell">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {distributors.map(d => (
                              <TableRow key={d.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { onOpenChange(false); navigate(`/distributor/${d.id}`); }}>
                                <TableCell className="text-xs sm:text-sm font-medium text-primary">{d.name}</TableCell>
                                <TableCell className="text-xs sm:text-sm">{d.contact_person}</TableCell>
                                <TableCell className="hidden sm:table-cell"><Badge variant={d.status === 'active' ? 'default' : 'secondary'} className="text-xs">{d.status || 'active'}</Badge></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {distributors.length === 0 && <p className="text-center py-4 text-sm text-muted-foreground">No distributors</p>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Beats Tab */}
              <TabsContent value="beats" className="mt-4">
                <Card className="shadow-lg">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Route className="h-4 w-4 text-primary" />
                      Beats Linked to Territory ({beats.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4">
                    {beats.length > 0 ? (
                      <div className="overflow-x-auto -mx-3 sm:mx-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs sm:text-sm">Beat Name</TableHead>
                              <TableHead className="text-xs sm:text-sm hidden sm:table-cell">Category</TableHead>
                              <TableHead className="text-xs sm:text-sm hidden md:table-cell">Avg KM</TableHead>
                              <TableHead className="text-xs sm:text-sm hidden md:table-cell">Avg Time</TableHead>
                              <TableHead className="text-xs sm:text-sm">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {beats.map((beat) => (
                              <TableRow 
                                key={beat.id} 
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() => {
                                  onOpenChange(false);
                                  navigate(`/beat/${beat.id}`);
                                }}
                              >
                                <TableCell className="text-xs sm:text-sm font-medium text-primary">{beat.beat_name}</TableCell>
                                <TableCell className="text-xs sm:text-sm hidden sm:table-cell">
                                  <Badge variant="outline" className="text-xs">{beat.category || 'General'}</Badge>
                                </TableCell>
                                <TableCell className="text-xs sm:text-sm text-muted-foreground hidden md:table-cell">
                                  {beat.average_km ? `${beat.average_km} km` : '-'}
                                </TableCell>
                                <TableCell className="text-xs sm:text-sm text-muted-foreground hidden md:table-cell">
                                  {beat.average_time_minutes ? `${beat.average_time_minutes} min` : '-'}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={beat.is_active !== false ? "default" : "secondary"} className="text-xs">
                                    {beat.is_active !== false ? 'Active' : 'Inactive'}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No beats linked to this territory</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Territory Performance Tab */}
              <TabsContent value="performance" className="mt-4 space-y-4">
                {/* Sales Trend Chart with Filter */}
                <Card className="shadow-lg">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <CardTitle className="text-sm sm:text-base">Sales Trend</CardTitle>
                      <Select value={salesTrendFilter} onValueChange={setSalesTrendFilter}>
                        <SelectTrigger className="w-full sm:w-[160px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="6months">Last 6 Months</SelectItem>
                          <SelectItem value="currentyear">Current Year</SelectItem>
                          <SelectItem value="lastyear">Last Year</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent className="p-2 sm:p-4">
                    {salesTrendData.length > 0 ? (
                      <div className="w-full overflow-x-auto">
                        <ResponsiveContainer width="100%" height={200} minWidth={300}>
                          <LineChart data={salesTrendData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="period" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                            <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => displayCurrency === 'INR' ? `₹${(value / 1000).toFixed(0)}k` : fmtMoney(value)} />
                            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(value: number) => [fmtMoney(value), 'Sales']} />
                            <Line type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))' }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p className="text-center py-8 text-sm text-muted-foreground">No order data for selected period</p>
                    )}
                  </CardContent>
                </Card>

                {/* Product-wise Sales Chart */}
                <Card className="shadow-lg">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm sm:text-base flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Award className="h-4 w-4 text-indigo-600" />
                        <span>Product-wise Sales</span>
                      </div>
                      <span className="text-xs text-muted-foreground font-normal">Based on selected period</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-2 sm:p-4">
                    {productSalesData.length > 0 ? (
                      <div className="w-full overflow-x-auto">
                        <ResponsiveContainer width="100%" height={250} minWidth={300}>
                          <BarChart data={productSalesData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => displayCurrency === 'INR' ? `₹${(value / 1000).toFixed(0)}k` : fmtMoney(value)} />
                            <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={100} />
                            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(value: number) => [fmtMoney(value), 'Sales']} />
                            <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p className="text-center py-8 text-sm text-muted-foreground">No product data for selected period</p>
                    )}
                  </CardContent>
                </Card>

                {/* Calendar */}
                <TerritoryPerformanceCalendar territoryId={territory.id} retailerIds={retailers.map(r => r.id)} />
                
                {/* Top/Bottom SKUs */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Award className="h-4 w-4 text-green-600" />Top 5 SKUs</CardTitle></CardHeader>
                    <CardContent className="p-3">{topSKUsWithIds.length > 0 ? topSKUsWithIds.map((sku, i) => (
                      <div key={i} className="flex justify-between p-2 bg-green-500/5 rounded mb-1 cursor-pointer hover:bg-green-500/10" onClick={() => navigateToProduct(sku.productId)}>
                        <span className="text-xs font-medium text-primary truncate">{sku.name}</span><span className="text-xs text-green-600 font-bold">{fmtMoney(sku.total)}</span>
                      </div>
                    )) : <p className="text-xs text-muted-foreground text-center py-2">No data</p>}</CardContent>
                  </Card>
                  <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4 text-red-600" />Bottom 5 SKUs</CardTitle></CardHeader>
                    <CardContent className="p-3">{bottomSKUsWithIds.length > 0 ? bottomSKUsWithIds.map((sku, i) => (
                      <div key={i} className="flex justify-between p-2 bg-red-500/5 rounded mb-1 cursor-pointer hover:bg-red-500/10" onClick={() => navigateToProduct(sku.productId)}>
                        <span className="text-xs font-medium text-primary truncate">{sku.name}</span><span className="text-xs text-red-600 font-bold">{fmtMoney(sku.total)}</span>
                      </div>
                    )) : <p className="text-xs text-muted-foreground text-center py-2">No data</p>}</CardContent>
                  </Card>
                </div>
                
                {/* Top/Bottom Retailers */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-blue-600" />Top 5 Retailers</CardTitle></CardHeader>
                    <CardContent className="p-3">{topRetailersWithIds.length > 0 ? topRetailersWithIds.map((r, i) => (
                      <div key={i} className="flex justify-between p-2 bg-blue-500/5 rounded mb-1 cursor-pointer hover:bg-blue-500/10" onClick={() => navigateToRetailer(r.id)}>
                        <span className="text-xs font-medium text-primary truncate">{r.name}</span><span className="text-xs text-blue-600 font-bold">{fmtMoney(r.sales)}</span>
                      </div>
                    )) : <p className="text-xs text-muted-foreground text-center py-2">No data</p>}</CardContent>
                  </Card>
                  <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-600" />Bottom 5 Retailers</CardTitle></CardHeader>
                    <CardContent className="p-3">{bottomRetailersWithIds.length > 0 ? bottomRetailersWithIds.map((r, i) => (
                      <div key={i} className="flex justify-between p-2 bg-orange-500/5 rounded mb-1 cursor-pointer hover:bg-orange-500/10" onClick={() => navigateToRetailer(r.id)}>
                        <span className="text-xs font-medium text-primary truncate">{r.name}</span><span className="text-xs text-orange-600 font-bold">{fmtMoney(r.sales)}</span>
                      </div>
                    )) : <p className="text-xs text-muted-foreground text-center py-2">No data</p>}</CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Support Requests Tab */}
              <TabsContent value="support" className="mt-4 space-y-4">
                <div className="flex justify-end">
                  <TerritorySupportRequestForm territoryId={territory.id} territoryName={territory.name} onSuccess={loadTerritoryData} />
                </div>
                <Card className="shadow-lg">
                  <CardContent className="p-3 sm:p-4">
                    {supportRequests.length > 0 ? (
                      <div className="space-y-2">
                        {supportRequests.map((request) => {
                          let parsedData: any = null;
                          try { parsedData = JSON.parse(request.description); } catch {}
                          const displayTitle = parsedData?.support_type ? SUPPORT_TYPES.find(t => t.value === parsedData.support_type)?.label || request.subject : request.subject;
                          return (
                            <div key={request.id} className="p-3 border rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50" onClick={() => setEditingSupportRequest({ ...request, parsedData })}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1"><p className="font-medium text-sm text-primary">{displayTitle}</p><p className="text-xs text-muted-foreground mt-1 line-clamp-1">{parsedData?.description || request.description}</p></div>
                                <div className="flex flex-col items-end gap-1">{getStatusBadge(request.status)}</div>
                              </div>
                              <p className="text-xs text-muted-foreground mt-2">{format(new Date(request.created_at), 'dd MMM yyyy')}</p>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No support requests</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>

      {/* Support Request Edit/View Dialog */}
      <Dialog open={!!editingSupportRequest} onOpenChange={(open) => !open && setEditingSupportRequest(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HeartHandshake className="h-5 w-5 text-primary" />
              Support Request Details
            </DialogTitle>
          </DialogHeader>
          {editingSupportRequest && (() => {
            // Parse structured data
            const parsedData = editingSupportRequest.parsedData || {};
            
            // Initialize edit fields from parsed data or existing values
            const supportType = editingSupportRequest.editSupportType ?? parsedData.support_type ?? '';
            const priority = editingSupportRequest.editPriority ?? parsedData.priority ?? 'medium';
            const status = editingSupportRequest.editStatus ?? editingSupportRequest.status ?? 'open';
            const description = editingSupportRequest.editDescription ?? parsedData.description ?? editingSupportRequest.description ?? '';
            const estimatedBudget = editingSupportRequest.editEstimatedBudget ?? parsedData.estimated_budget ?? '';
            const expectedImpact = editingSupportRequest.editExpectedImpact ?? parsedData.expected_impact ?? '';
            const createdByName = parsedData.created_by_name || 'Unknown';
            const territoryName = parsedData.territory_name || '';
            
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Support Type *</label>
                    <Select 
                      value={supportType}
                      onValueChange={(value) => setEditingSupportRequest({ ...editingSupportRequest, editSupportType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORT_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Priority *</label>
                    <Select 
                      value={priority}
                      onValueChange={(value) => setEditingSupportRequest({ ...editingSupportRequest, editPriority: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Status *</label>
                    <Select 
                      value={status}
                      onValueChange={(value) => setEditingSupportRequest({ ...editingSupportRequest, editStatus: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Expected Impact</label>
                    <Select 
                      value={expectedImpact}
                      onValueChange={(value) => setEditingSupportRequest({ ...editingSupportRequest, editExpectedImpact: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select expected impact" />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPECTED_IMPACTS.map(impact => (
                          <SelectItem key={impact.value} value={impact.value}>{impact.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Estimated Budget (₹)</label>
                  <Input 
                    type="number"
                    value={estimatedBudget}
                    onChange={(e) => setEditingSupportRequest({ ...editingSupportRequest, editEstimatedBudget: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="Enter budget"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Description *</label>
                  <Textarea 
                    value={description}
                    onChange={(e) => setEditingSupportRequest({ ...editingSupportRequest, editDescription: e.target.value })}
                    rows={4}
                    placeholder="Describe the support needed..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Resolution Notes</label>
                  <Textarea 
                    value={editingSupportRequest.resolution_notes || ''}
                    onChange={(e) => setEditingSupportRequest({ ...editingSupportRequest, resolution_notes: e.target.value })}
                    placeholder="Add notes about the resolution..."
                    rows={3}
                  />
                </div>

                {/* Audit Information */}
                <div className="bg-muted/30 p-3 rounded-lg space-y-1">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Audit Information</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <p><span className="font-medium">Created By:</span> {createdByName}</p>
                    <p><span className="font-medium">Territory:</span> {territoryName}</p>
                    <p><span className="font-medium">Created:</span> {format(new Date(editingSupportRequest.created_at), 'dd MMM yyyy, hh:mm a')}</p>
                    <p><span className="font-medium">Last Updated:</span> {format(new Date(editingSupportRequest.updated_at), 'dd MMM yyyy, hh:mm a')}</p>
                    {editingSupportRequest.resolved_at && (
                      <p className="text-green-600"><span className="font-medium">Resolved:</span> {format(new Date(editingSupportRequest.resolved_at), 'dd MMM yyyy, hh:mm a')}</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-between gap-2 pt-2">
                  <Button 
                    variant="destructive" 
                    onClick={() => setEditingSupportRequest({ ...editingSupportRequest, showDeleteConfirm: true })}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditingSupportRequest(null)}>
                      Cancel
                    </Button>
                    <Button onClick={handleUpdateSupportRequest}>
                      Save Changes
                    </Button>
                  </div>
                </div>

                {/* Delete Confirmation */}
                {editingSupportRequest.showDeleteConfirm && (
                  <div className="border border-destructive/50 bg-destructive/10 rounded-lg p-4 mt-4">
                    <p className="text-sm font-medium text-destructive mb-3">Are you sure you want to delete this support request?</p>
                    <p className="text-xs text-muted-foreground mb-4">This item will be moved to the recycle bin and can be restored later.</p>
                    <div className="flex gap-2 justify-end">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setEditingSupportRequest({ ...editingSupportRequest, showDeleteConfirm: false })}
                      >
                        Cancel
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={handleDeleteSupportRequest}
                      >
                        Confirm Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Retailer Detail Modal */}
      <RetailerDetailModal
        isOpen={retailerDetailModalOpen}
        onClose={() => {
          setRetailerDetailModalOpen(false);
          setSelectedRetailerForModal(null);
        }}
        retailer={selectedRetailerForModal}
        onSuccess={() => {
          setRetailerDetailModalOpen(false);
          loadTerritoryData();
        }}
      />
    </Dialog>
  );
};

export default TerritoryDetailsModal;