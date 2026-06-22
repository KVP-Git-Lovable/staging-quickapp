import { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { 
  Phone, MapPin, Edit2, ExternalLink, TrendingUp, Trash2, ShoppingCart, 
  Check, ChevronsUpDown, FileText, Download, Send, Loader2, ChevronLeft, 
  ChevronRight, Calendar, BarChart3, User, Building, Gift, Target, CreditCard
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { fetchAndGenerateInvoice } from "@/utils/invoiceGenerator";

import { moveToRecycleBin } from "@/utils/recycleBinUtils";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from "recharts";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths, startOfWeek, endOfWeek, startOfQuarter, endOfQuarter, subQuarters, subMonths as subM, startOfDay, subDays, startOfYear } from "date-fns";
import { RetailerLoyaltySection } from "./loyalty/RetailerLoyaltySection";
import { TargetVsActualCard } from "./performance/TargetVsActualCard";
import { CreditScoreDisplay } from "./CreditScoreDisplay";
import { CreditHistorySection } from "./CreditHistorySection";
import { RetailerCustomerPortalSection } from "./retailer/RetailerCustomerPortalSection";


interface RetailerInvoice {
  id: string;
  invoice_number: string;
  created_at: string;
  total_amount: number;
  status: string;
}

interface Visit {
  id: string;
  planned_date: string;
  status: string;
  check_in_time?: string;
  check_out_time?: string;
}

interface OrderItem {
  product_name: string;
  quantity: number;
  total_price: number;
}

interface Retailer {
  id: string;
  name: string;
  contact_name?: string | null;
  contact_title?: string | null;
  address: string;
  phone: string | null;
  category: string | null;
  priority: string | null;
  status: string | null;
  beat_id: string;
  territory_id?: string | null;
  created_at: string;
  last_visit_date?: string | null;
  notes?: string | null;
  parent_type?: string | null;
  parent_name?: string | null;
  location_tag?: string | null;
  retail_type?: string | null;
  potential?: string | null;
  competitors?: string[] | null;
  gst_number?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  photo_url?: string | null;
  alternate_phone?: string | null;
  distributor_id?: string | null;
  state?: string | null;
  order_value?: number | null;
  manual_credit_score?: number | null;
  last_order_date?: string | null;
  last_order_value?: number | null;
  avg_monthly_orders_3m?: number | null;
  avg_order_per_visit_3m?: number | null;
  total_visits_3m?: number | null;
  productive_visits_3m?: number | null;
  total_lifetime_order_value?: number | null;
  revenue_growth_12m?: number | null;
  total_order_value_fy?: number | null;
}

const contactTitles = ["Shop owner", "Support staff", "Family member", "Others"];

interface RetailerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  retailer: Retailer | null;
  onSuccess: () => void;
  startInEditMode?: boolean;
}

type DateFilter = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_fy';

const getDateRange = (filter: DateFilter): { start: Date; end: Date } => {
  const today = new Date();
  switch (filter) {
    case 'today':
      return { start: startOfDay(today), end: today };
    case 'yesterday':
      const yesterday = subDays(today, 1);
      return { start: startOfDay(yesterday), end: endOfMonth(yesterday) };
    case 'this_week':
      return { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) };
    case 'this_month':
      return { start: startOfMonth(today), end: endOfMonth(today) };
    case 'last_month':
      const lastMonth = subMonths(today, 1);
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    case 'this_quarter':
      return { start: startOfQuarter(today), end: endOfQuarter(today) };
    case 'last_quarter':
      const lastQuarter = subQuarters(today, 1);
      return { start: startOfQuarter(lastQuarter), end: endOfQuarter(lastQuarter) };
    case 'this_fy':
      const currentYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
      return { start: new Date(currentYear, 3, 1), end: new Date(currentYear + 1, 2, 31) };
    default:
      return { start: startOfMonth(today), end: endOfMonth(today) };
  }
};

export const RetailerDetailModal = ({ isOpen, onClose, retailer, onSuccess, startInEditMode = false }: RetailerDetailModalProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<Retailer | null>(null);
  const [isEditing, setIsEditing] = useState(startInEditMode);
  const [loading, setLoading] = useState(false);
  const [beats, setBeats] = useState<{ beat_id: string; beat_name: string }[]>([]);
  const [territories, setTerritories] = useState<{ id: string; name: string; region: string }[]>([]);
  const [distributors, setDistributors] = useState<{ id: string; name: string }[]>([]);
  const [distributorOpen, setDistributorOpen] = useState(false);
  const [territoryOpen, setTerritoryOpen] = useState(false);
  const [creditConfig, setCreditConfig] = useState<{is_enabled: boolean, scoring_mode: string} | null>(null);
  const [invoices, setInvoices] = useState<RetailerInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);
  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null);
  const [invoicesDisplayCount, setInvoicesDisplayCount] = useState(5);
  const [associatedDistributor, setAssociatedDistributor] = useState<string | null>(null);
  const [ownership, setOwnership] = useState<{
    beatName: string | null;
    createdByName: string | null;
    ownerName: string | null;
    currentUserName: string | null;
  }>({ beatName: null, createdByName: null, ownerName: null, currentUserName: null });

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [visits, setVisits] = useState<Visit[]>([]);
  const [feedbacks, setFeedbacks] = useState<Map<string, boolean>>(new Map());
  const [ordersByVisit, setOrdersByVisit] = useState<Map<string, { total: number; items: OrderItem[] }>>(new Map());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Charts state
  const [chartFilter, setChartFilter] = useState<DateFilter>('this_month');
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [allOrderItems, setAllOrderItems] = useState<any[]>([]);

  // Calculated metrics
  const [totalLifetimeValue, setTotalLifetimeValue] = useState(0);
  const [avgMonthlyRevenue6M, setAvgMonthlyRevenue6M] = useState(0);
  const [lastVisitDate, setLastVisitDate] = useState<string | null>(null);
  const [lastVisitOrderValue, setLastVisitOrderValue] = useState(0);
  const [avgOrderValuePerVisit, setAvgOrderValuePerVisit] = useState(0);
  const [avgMonthlyProductiveVisits6M, setAvgMonthlyProductiveVisits6M] = useState(0);
  const [viewingInvoice, setViewingInvoice] = useState<{ id: string; number: string } | null>(null);
  const [invoicePreviewLoading, setInvoicePreviewLoading] = useState(false);
  const [invoicePreviewUrl, setInvoicePreviewUrl] = useState<string | null>(null);
  const [showSelectedDayDetails, setShowSelectedDayDetails] = useState(false);

  // Format number for mobile display
  const formatCompactNumber = (num: number) => {
    if (num >= 10000000) return `${(num / 10000000).toFixed(1)}Cr`;
    if (num >= 100000) return `${(num / 100000).toFixed(1)}L`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(0);
  };

  useEffect(() => {
    if (retailer) {
      setFormData({ ...retailer });
      setIsEditing(startInEditMode);
    }
  }, [retailer, startInEditMode]);

  useEffect(() => {
    if (user && isOpen) {
      loadBeats();
      loadTerritories();
      loadCreditConfig();
      loadDistributors();
    }
  }, [user, isOpen]);

  useEffect(() => {
    if (retailer?.id && isOpen) {
      loadInvoices(retailer.id);
      loadVisitsAndOrders(retailer.id);
      loadAssociatedDistributor(retailer.id);
      loadOwnership(retailer.id);
    }
  }, [retailer?.id, isOpen]);

  const loadOwnership = async (retailerId: string) => {
    try {
      const { data: r } = await supabase
        .from('retailers')
        .select('beat_id, created_by, owner_id, owner_name, user_id')
        .eq('id', retailerId)
        .maybeSingle();
      if (!r) return;

      const userIds = Array.from(
        new Set([r.created_by, r.owner_id, r.user_id].filter(Boolean) as string[])
      );

      const [beatRes, profilesRes] = await Promise.all([
        r.beat_id
          ? supabase.from('beats').select('beat_name').eq('beat_id', r.beat_id).maybeSingle()
          : Promise.resolve({ data: null } as any),
        userIds.length
          ? supabase.from('profiles').select('id, full_name, username').in('id', userIds)
          : Promise.resolve({ data: [] } as any),
      ]);

      const nameMap = new Map<string, { full_name: string | null; username: string | null }>();
      (profilesRes.data || []).forEach((p: any) =>
        nameMap.set(p.id, { full_name: p.full_name, username: p.username })
      );
      const resolve = (uid: string | null | undefined) => {
        if (!uid) return null;
        const p = nameMap.get(uid);
        return p?.full_name || p?.username || null;
      };

      setOwnership({
        beatName: (beatRes.data as any)?.beat_name || null,
        createdByName: resolve(r.created_by),
        ownerName: (r.owner_name as string) || resolve(r.owner_id),
        currentUserName: resolve(r.user_id),
      });
    } catch (e) {
      console.error('Error loading retailer ownership:', e);
    }
  };

  const loadAssociatedDistributor = async (retailerId: string) => {
    try {
      const { data, error } = await supabase
        .from('distributor_retailer_mappings')
        .select('distributor_id')
        .eq('retailer_id', retailerId)
        .maybeSingle();
      
      if (error) throw error;
      
      if (data?.distributor_id) {
        const { data: distData } = await supabase
          .from('distributors')
          .select('name')
          .eq('id', data.distributor_id)
          .maybeSingle();
        
        setAssociatedDistributor(distData?.name || null);
      } else {
        setAssociatedDistributor(null);
      }
    } catch (error) {
      console.error('Error loading distributor:', error);
      setAssociatedDistributor(null);
    }
  };

  const loadVisitsAndOrders = async (retailerId: string) => {
    try {
      // Load visits
      const { data: visitsData, error: visitsError } = await supabase
        .from('visits')
        .select('id, planned_date, status, check_in_time, check_out_time')
        .eq('retailer_id', retailerId)
        .order('planned_date', { ascending: false });

      if (visitsError) throw visitsError;
      setVisits(visitsData || []);

      // Load feedbacks
      const { data: feedbacksData } = await supabase
        .from('retailer_feedback')
        .select('visit_id')
        .eq('retailer_id', retailerId);

      const feedbackMap = new Map<string, boolean>();
      feedbacksData?.forEach((f: any) => feedbackMap.set(f.visit_id, true));
      setFeedbacks(feedbackMap);

      // Load ALL orders for this retailer (both confirmed and delivered)
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('id, visit_id, total_amount, order_date, created_at, status')
        .eq('retailer_id', retailerId)
        .in('status', ['confirmed', 'delivered'])
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;
      setAllOrders(ordersData || []);

      // Calculate total lifetime value from ALL confirmed/delivered orders
      const total = ordersData?.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0) || 0;
      setTotalLifetimeValue(total);

      // Calculate avg monthly revenue (last 6 months) - get actual months with orders
      const sixMonthsAgo = subM(new Date(), 6);
      const recentOrders = ordersData?.filter(o => new Date(o.created_at) >= sixMonthsAgo) || [];
      const recentTotal = recentOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
      // Divide by 6 months
      setAvgMonthlyRevenue6M(recentTotal / 6);

      // Calculate avg order VALUE per visit (total revenue / productive visits)
      const productiveVisitsWithOrders = visitsData?.filter(v => 
        v.status === 'productive' && ordersData?.some(o => o.visit_id === v.id)
      ) || [];
      const visitsWithOrdersCount = productiveVisitsWithOrders.length;
      setAvgOrderValuePerVisit(visitsWithOrdersCount > 0 ? total / visitsWithOrdersCount : 0);

      // Calculate avg monthly productive visits (last 6 months)
      const productiveVisits6M = visitsData?.filter(v => 
        v.status === 'productive' && new Date(v.planned_date) >= sixMonthsAgo
      ) || [];
      setAvgMonthlyProductiveVisits6M(productiveVisits6M.length / 6);

      // Get last completed visit and last order value (from most recent invoice)
      const completedVisits = visitsData?.filter(v => v.status === 'productive' || v.status === 'unproductive') || [];
      if (completedVisits.length > 0) {
        setLastVisitDate(completedVisits[0].planned_date);
      } else {
        setLastVisitDate(null);
      }
      
      // Last order value from most recent invoice
      if (ordersData && ordersData.length > 0) {
        setLastVisitOrderValue(Number(ordersData[0].total_amount) || 0);
      } else {
        setLastVisitOrderValue(0);
      }

      // Map orders by visit
      const orderMap = new Map<string, { total: number; items: OrderItem[] }>();
      for (const order of ordersData || []) {
        if (order.visit_id) {
          const { data: itemsData } = await supabase
            .from('order_items')
            .select('product_name, quantity, total')
            .eq('order_id', order.id);
          
          orderMap.set(order.visit_id, {
            total: Number(order.total_amount) || 0,
            items: (itemsData || []).map((item: any) => ({
              product_name: item.product_name,
              quantity: item.quantity,
              total_price: Number(item.total) || 0
            }))
          });
        }
      }
      setOrdersByVisit(orderMap);

      // Load all order items for charts
      const allItems: any[] = [];
      for (const order of ordersData || []) {
        const { data: itemsData } = await supabase
          .from('order_items')
          .select('product_name, quantity, total')
          .eq('order_id', order.id);
        
        if (itemsData) {
          itemsData.forEach((item: any) => {
            allItems.push({ 
              product_name: item.product_name, 
              quantity: item.quantity, 
              total_price: Number(item.total) || 0, 
              order_date: order.order_date || order.created_at 
            });
          });
        }
      }
      setAllOrderItems(allItems);

    } catch (error) {
      console.error('Error loading visits and orders:', error);
    }
  };

  const handleViewInvoice = async (orderId: string, invoiceNumber: string) => {
    setViewingInvoice({ id: orderId, number: invoiceNumber });
    setInvoicePreviewLoading(true);
    setInvoicePreviewUrl(null);
    try {
      const result = await fetchAndGenerateInvoice(orderId);
      if (!result || !result.blob) {
        throw new Error('Failed to generate invoice');
      }
      const url = URL.createObjectURL(result.blob);
      setInvoicePreviewUrl(url);
    } catch (error: any) {
      console.error('Error loading invoice:', error);
      toast({
        title: "Failed to load invoice",
        description: error.message || "Could not load invoice preview. Try downloading instead.",
        variant: "destructive",
      });
      // Don't close the dialog - show the fallback UI
    } finally {
      setInvoicePreviewLoading(false);
    }
  };

  const closeInvoicePreview = () => {
    if (invoicePreviewUrl) {
      URL.revokeObjectURL(invoicePreviewUrl);
    }
    setInvoicePreviewUrl(null);
    setViewingInvoice(null);
  };

  const loadInvoices = async (retailerId: string) => {
    setInvoicesLoading(true);
    try {
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('id, invoice_number, created_at, total_amount, status')
        .eq('retailer_id', retailerId)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;
      setInvoices(ordersData || []);
    } catch (error: any) {
      console.error('Error loading invoices:', error);
      setInvoices([]);
    } finally {
      setInvoicesLoading(false);
    }
  };

  const handleDownloadInvoice = async (orderId: string, invoiceNumber: string) => {
    setDownloadingInvoiceId(orderId);
    try {
      const { blob } = await fetchAndGenerateInvoice(orderId);
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoiceNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      
      toast({
        title: "Invoice Downloaded",
        description: `${invoiceNumber} has been downloaded successfully`,
      });
    } catch (error: any) {
      console.error('Error downloading invoice:', error);
      toast({
        title: "Download Failed",
        description: error.message || "Failed to download invoice",
        variant: "destructive",
      });
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  const handleSendInvoice = async (orderId: string, invoiceNumber: string) => {
    if (!formData?.phone) {
      toast({
        title: "Cannot Send Invoice",
        description: "Retailer phone number is not available",
        variant: "destructive",
      });
      return;
    }

    setSendingInvoiceId(orderId);
    try {
      const { blob } = await fetchAndGenerateInvoice(orderId);
      
      const fileName = `${invoiceNumber}_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(fileName, blob, { contentType: 'application/pdf', upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('invoices')
        .getPublicUrl(fileName);

      const { error: sendError } = await supabase.functions.invoke('send-invoice-whatsapp', {
        body: {
          invoiceId: orderId,
          customerPhone: formData.phone,
          pdfUrl: publicUrl,
          invoiceNumber
        }
      });

      if (sendError) throw sendError;

      toast({
        title: "Invoice Sent",
        description: `${invoiceNumber} has been sent to ${formData.phone}`,
      });
    } catch (error: any) {
      console.error('Error sending invoice:', error);
      toast({
        title: "Send Failed",
        description: error.message || "Failed to send invoice",
        variant: "destructive",
      });
    } finally {
      setSendingInvoiceId(null);
    }
  };

  const loadCreditConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('credit_management_config')
        .select('is_enabled, scoring_mode')
        .single();
      
      if (!error && data) {
        setCreditConfig(data);
      }
    } catch (error) {
      console.error('Error loading credit config:', error);
    }
  };

  const loadBeats = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('beats')
        .select('beat_id, beat_name')
        .eq('created_by', user.id)
        .eq('is_active', true)
        .order('beat_name');
      
      if (error) throw error;
      setBeats(data || []);
    } catch (error: any) {
      console.error('Error loading beats:', error);
    }
  };

  const loadTerritories = async () => {
    try {
      const { data, error } = await supabase
        .from('territories')
        .select('id, name, region')
        .order('name');
      
      if (error) throw error;
      setTerritories(data || []);
    } catch (error: any) {
      console.error('Error loading territories:', error);
    }
  };

  const loadDistributors = async () => {
    try {
      const { data, error } = await supabase
        .from('distributors')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      
      if (error) throw error;
      setDistributors(data || []);
    } catch (error: any) {
      console.error('Error loading distributors:', error);
    }
  };

  const handleSave = async () => {
    if (!formData || !user) return;

    setLoading(true);
    try {
      const selectedBeat = beats.find(b => b.beat_id === formData.beat_id);
      
      const { error, count } = await supabase
        .from('retailers')
        .update({
          name: formData.name,
          contact_name: formData.contact_name,
          contact_title: formData.contact_title,
          phone: formData.phone,
          alternate_phone: (formData as any).alternate_phone ?? null,
          address: formData.address,
          state: (formData as any).state ?? null,
          category: formData.category,
          priority: formData.priority,
          status: formData.status,
          notes: formData.notes,
          parent_type: formData.parent_type,
          parent_name: formData.parent_name,
          location_tag: formData.location_tag,
          retail_type: formData.retail_type,
          potential: formData.potential,
          competitors: formData.competitors,
          gst_number: formData.gst_number,
          latitude: formData.latitude,
          longitude: formData.longitude,
          beat_id: formData.beat_id,
          beat_name: selectedBeat?.beat_name || formData.beat_id,
          territory_id: formData.territory_id || null,
          distributor_id: (formData as any).distributor_id ?? null,
          photo_url: (formData as any).photo_url ?? null,
          manual_credit_score: formData.manual_credit_score,
        }, { count: 'exact' })
        .eq('id', formData.id)
        .eq('user_id', user.id);

      if (error) throw error;

      if ((count ?? 0) === 0) {
        toast({
          title: "Permission denied",
          description: "You don't have permission to edit this retailer.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Retailer updated",
        description: "Changes saved successfully",
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      toast({
        title: "Failed to update",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDeleteClick = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  const handleDeleteConfirm = async () => {
    if (!formData || !user) return;

    setLoading(true);
    try {
      const movedToRecycleBin = await moveToRecycleBin({
        tableName: 'retailers',
        recordId: formData.id,
        recordData: formData,
        moduleName: 'Retailers',
        recordName: formData.name
      });

      if (!movedToRecycleBin) {
        throw new Error("Could not move to recycle bin");
      }

      const { error } = await supabase
        .from('retailers')
        .delete()
        .eq('id', formData.id)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Moved to Recycle Bin",
        description: `${formData.name} can be restored from Recycle Bin`,
      });

      setShowDeleteConfirm(false);
      onSuccess();
      onClose();
    } catch (error: any) {
      toast({
        title: "Failed to delete",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Calendar logic
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    return eachDayOfInterval({ start: monthStart, end: monthEnd });
  }, [currentMonth]);

  const visitsByDate = useMemo(() => {
    const map = new Map<string, Visit[]>();
    visits.forEach(visit => {
      const dateKey = visit.planned_date;
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(visit);
    });
    return map;
  }, [visits]);

  const getVisitStatusColor = (visit: Visit) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    if (visit.planned_date > today) return 'bg-blue-100 text-blue-800 border-blue-300';
    if (visit.status === 'productive') return 'bg-green-100 text-green-800 border-green-300';
    if (visit.status === 'unproductive') return 'bg-red-100 text-red-800 border-red-300';
    return 'bg-muted text-muted-foreground';
  };

  const selectedDayVisits = selectedDate ? visitsByDate.get(selectedDate) || [] : [];

  // Charts data
  const { revenueByDateData, revenueByProductData } = useMemo(() => {
    const { start, end } = getDateRange(chartFilter);
    
    const filteredOrders = allOrders.filter(o => {
      const orderDate = new Date(o.order_date || o.created_at);
      return orderDate >= start && orderDate <= end;
    });

    // Revenue by date
    const byDate = new Map<string, number>();
    filteredOrders.forEach(o => {
      const dateKey = format(new Date(o.order_date || o.created_at), 'dd MMM');
      byDate.set(dateKey, (byDate.get(dateKey) || 0) + (o.total_amount || 0));
    });
    const revenueByDateData = Array.from(byDate.entries()).map(([date, amount]) => ({ date, amount }));

    // Revenue by product
    const filteredItems = allOrderItems.filter(item => {
      const orderDate = new Date(item.order_date);
      return orderDate >= start && orderDate <= end;
    });
    const byProduct = new Map<string, number>();
    filteredItems.forEach(item => {
      byProduct.set(item.product_name, (byProduct.get(item.product_name) || 0) + (item.total_price || 0));
    });
    const revenueByProductData = Array.from(byProduct.entries())
      .map(([product, amount]) => ({ product, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    return { revenueByDateData, revenueByProductData };
  }, [allOrders, allOrderItems, chartFilter]);

  if (!formData) return null;

  const getGoogleMapsLink = () => {
    if (formData.latitude && formData.longitude) {
      return `https://www.google.com/maps?q=${formData.latitude},${formData.longitude}`;
    }
    return null;
  };

  const chartColors = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-xl">Retailer Overview</DialogTitle>
        </DialogHeader>
        
        {/* Header Section - Name, Beat, Territory, Distributor */}
        <div className="flex items-start gap-4 pb-3 border-b">
          {formData.photo_url && (
            <div className="w-16 h-16 rounded-lg overflow-hidden border-2 border-border flex-shrink-0">
              <img src={formData.photo_url} alt={formData.name} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold truncate">{formData.name}</h3>
            <div className="grid grid-cols-3 gap-2 mt-1.5 text-xs">
              <div>
                <span className="text-muted-foreground">Beat:</span>{' '}
                <span className="font-medium">
                  {ownership.beatName
                    || beats.find(b => b.beat_id === formData.beat_id)?.beat_name
                    || 'Unassigned'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Territory:</span>{' '}
                <span className="font-medium">
                  {territories.find(t => t.id === formData.territory_id)?.name || 'Not assigned'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Distributor:</span>{' '}
                <span className="font-medium">{associatedDistributor || formData.parent_name || 'Not mapped'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Created by:</span>{' '}
                <span className="font-medium">{ownership.createdByName || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Owner:</span>{' '}
                <span className="font-medium">{ownership.ownerName || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Currently operated by:</span>{' '}
                <span className="font-medium">{ownership.currentUserName || '—'}</span>
              </div>
            </div>
          </div>

          {/* Phone Order Button - Prominent */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="default"
                  size="sm"
                  onClick={() => {
                    navigate(`/order-entry?phoneOrder=true&retailerId=${formData.id}&retailer=${encodeURIComponent(formData.name)}`);
                    onClose();
                  }}
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90"
                >
                  <ShoppingCart className="h-4 w-4" />
                  <span className="hidden sm:inline">Phone Order</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="text-sm">Click here to add phone order. After placing the order - this will be added to today's beat and add to your today's performance</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="details" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-6 h-9">
            <TabsTrigger value="details" className="text-xs">
              <User className="h-3 w-3 mr-1" /> Details
            </TabsTrigger>
            <TabsTrigger value="highlight" className="text-xs">
              <TrendingUp className="h-3 w-3 mr-1" /> Highlight
            </TabsTrigger>
            <TabsTrigger value="credit" className="text-xs">
              <CreditCard className="h-3 w-3 mr-1" /> Credit
            </TabsTrigger>
            <TabsTrigger value="calendar" className="text-xs">
              <Calendar className="h-3 w-3 mr-1" /> Calendar
            </TabsTrigger>
            <TabsTrigger value="loyalty" className="text-xs">
              <Gift className="h-3 w-3 mr-1" /> Loyalty
            </TabsTrigger>
            <TabsTrigger value="charts" className="text-xs">
              <BarChart3 className="h-3 w-3 mr-1" /> Charts
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-3">
            {/* Highlight Tab */}
            <TabsContent value="highlight" className="mt-0 space-y-4">
              {/* Key Metrics - Mobile responsive with truncation */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <Card className="p-2 sm:p-3">
                  <p className="text-base sm:text-xl font-bold text-primary truncate" title={`₹${totalLifetimeValue.toLocaleString()}`}>
                    <span className="sm:hidden">₹{formatCompactNumber(totalLifetimeValue)}</span>
                    <span className="hidden sm:inline">₹{totalLifetimeValue.toLocaleString()}</span>
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Total Lifetime Value</p>
                </Card>
                <Card className="p-2 sm:p-3">
                  <p className="text-base sm:text-xl font-bold truncate" title={`₹${avgMonthlyRevenue6M.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}>
                    <span className="sm:hidden">₹{formatCompactNumber(avgMonthlyRevenue6M)}</span>
                    <span className="hidden sm:inline">₹{avgMonthlyRevenue6M.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Avg Monthly Revenue (6M)</p>
                </Card>
              </div>

              {/* Last Visit Info */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <Card className="p-2 sm:p-3">
                  <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">Last Visit Date</p>
                  <p className="text-sm sm:text-base font-semibold">
                    {lastVisitDate ? format(new Date(lastVisitDate), 'dd/MM/yyyy') : 'No visits'}
                  </p>
                </Card>
                <Card className="p-2 sm:p-3">
                  <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">Last Order Value</p>
                  <p className="text-sm sm:text-base font-semibold text-primary truncate" title={`₹${lastVisitOrderValue.toLocaleString()}`}>
                    <span className="sm:hidden">₹{formatCompactNumber(lastVisitOrderValue)}</span>
                    <span className="hidden sm:inline">₹{lastVisitOrderValue.toLocaleString()}</span>
                  </p>
                </Card>
              </div>

              {/* Visit Stats & Avg Order per Visit */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <Card className="p-2 sm:p-3">
                  <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">Avg Order Value/Visit</p>
                  <p className="text-sm sm:text-base font-semibold truncate" title={`₹${avgOrderValuePerVisit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}>
                    <span className="sm:hidden">₹{formatCompactNumber(avgOrderValuePerVisit)}</span>
                    <span className="hidden sm:inline">₹{avgOrderValuePerVisit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </p>
                </Card>
                <Card className="p-2 sm:p-3">
                  <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">Avg Productive Visits/Mo (6M)</p>
                  <p className="text-sm sm:text-base font-semibold">{avgMonthlyProductiveVisits6M.toFixed(1)}</p>
                </Card>
              </div>
              
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <Card className="p-2 sm:p-3">
                  <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">Total Visits</p>
                  <p className="text-sm sm:text-base font-semibold">{visits.length}</p>
                </Card>
                <Card className="p-2 sm:p-3">
                  <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">Total Orders</p>
                  <p className="text-sm sm:text-base font-semibold">{allOrders.length}</p>
                </Card>
              </div>

              {/* Target vs Actual */}
              <TargetVsActualCard entityType="retailer" entityId={formData.id} userId={user?.id} />

              {/* Invoices */}
              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" /> All Invoices ({invoices.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  {invoicesLoading ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">Loading...</div>
                  ) : invoices.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">No invoices found</div>
                  ) : (
                    <div className="max-h-40 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs h-8">Invoice #</TableHead>
                            <TableHead className="text-xs h-8">Date</TableHead>
                            <TableHead className="text-xs h-8">Amount</TableHead>
                            <TableHead className="text-xs h-8 text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoices.slice(0, invoicesDisplayCount).map((invoice) => (
                            <TableRow key={invoice.id}>
                              <TableCell className="text-xs py-1">{invoice.invoice_number}</TableCell>
                              <TableCell className="text-xs py-1">{format(new Date(invoice.created_at), 'dd/MM/yy')}</TableCell>
                              <TableCell className="text-xs py-1">₹{(invoice.total_amount || 0).toLocaleString()}</TableCell>
                              <TableCell className="text-right py-1">
                                <div className="flex items-center justify-end gap-0.5">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleViewInvoice(invoice.id, invoice.invoice_number)}>
                                          <ExternalLink className="h-3 w-3" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent><p>View Invoice</p></TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDownloadInvoice(invoice.id, invoice.invoice_number)} disabled={downloadingInvoiceId === invoice.id}>
                                          {downloadingInvoiceId === invoice.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent><p>Download</p></TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleSendInvoice(invoice.id, invoice.invoice_number)} disabled={sendingInvoiceId === invoice.id || !formData?.phone}>
                                          {sendingInvoiceId === invoice.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent><p>Send via WhatsApp</p></TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {invoices.length > invoicesDisplayCount && (
                        <div className="flex justify-center pt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setInvoicesDisplayCount(prev => prev + 10)}
                            className="text-xs text-primary hover:text-primary/80"
                          >
                            Load More ({invoices.length - invoicesDisplayCount} remaining)
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Loyalty Tab */}
            <TabsContent value="loyalty" className="mt-0">
              <RetailerLoyaltySection 
                retailerId={formData.id} 
                retailerName={formData.name}
                territoryId={formData.territory_id}
              />
            </TabsContent>

            {/* Credit Tab */}
            <TabsContent value="credit" className="mt-0 space-y-3">
              <CreditScoreDisplay 
                retailerId={formData.id} 
                variant="full" 
                showCreditLimit 
              />
              <CreditHistorySection retailerId={formData.id} />
            </TabsContent>

            {/* Calendar Tab */}
            <TabsContent value="calendar" className="mt-0 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h3 className="font-semibold text-sm">{format(currentMonth, 'MMMM yyyy')}</h3>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                  <div key={day} className="text-xs font-medium text-muted-foreground py-1">{day}</div>
                ))}
                
                {calendarDays.map(day => {
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const dayVisits = visitsByDate.get(dateKey) || [];
                  const hasVisit = dayVisits.length > 0;
                  const todayStr = format(new Date(), 'yyyy-MM-dd');
                  
                  return (
                    <button
                      key={dateKey}
                      onClick={() => {
                        if (hasVisit) {
                          setSelectedDate(dateKey);
                          setShowSelectedDayDetails(true);
                        }
                      }}
                      className={cn(
                        "p-1 rounded text-xs min-h-[50px] flex flex-col items-center transition-colors",
                        !isSameMonth(day, currentMonth) && "text-muted-foreground/50",
                        isToday(day) && "ring-1 ring-primary",
                        hasVisit && "cursor-pointer hover:bg-muted",
                        selectedDate === dateKey && "bg-primary/20 ring-2 ring-primary"
                      )}
                    >
                      <span className="font-medium">{format(day, 'd')}</span>
                      {dayVisits.map((visit, i) => (
                        <div key={i} className={cn("mt-0.5 w-full text-[10px] px-1 rounded truncate", getVisitStatusColor(visit))}>
                          {visit.status === 'productive' ? 'P' : visit.status === 'unproductive' ? 'U' : visit.planned_date > todayStr ? 'Plan' : '-'}
                          {ordersByVisit.get(visit.id) && <span> ₹{(ordersByVisit.get(visit.id)!.total / 1000).toFixed(1)}k</span>}
                          {feedbacks.get(visit.id) && <span> ✓</span>}
                        </div>
                      ))}
                    </button>
                  );
                })}
              </div>

              {/* Selected Day Details - Show as prominent modal-like card on mobile */}
              {selectedDate && selectedDayVisits.length > 0 && showSelectedDayDetails && (
                <div className="fixed inset-x-0 bottom-0 z-50 sm:relative sm:inset-auto sm:z-auto">
                  <Card className="mt-3 rounded-t-2xl sm:rounded-lg shadow-2xl sm:shadow border-t-2 border-primary sm:border animate-in slide-in-from-bottom-5 sm:animate-none">
                    <CardHeader className="py-2 px-3 flex flex-row items-center justify-between">
                      <CardTitle className="text-sm">Visit Details - {format(new Date(selectedDate), 'dd MMM yyyy')}</CardTitle>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 sm:hidden" onClick={() => setShowSelectedDayDetails(false)}>
                        ✕
                      </Button>
                    </CardHeader>
                    <CardContent className="p-3 space-y-3 max-h-[50vh] sm:max-h-none overflow-y-auto">
                      {selectedDayVisits.map(visit => {
                        const orderData = ordersByVisit.get(visit.id);
                        return (
                          <div key={visit.id} className="border rounded p-2 space-y-2">
                            <div className="flex items-center justify-between">
                              <Badge className={getVisitStatusColor(visit)}>
                                {visit.status === 'productive' ? 'Productive' : visit.status === 'unproductive' ? 'Unproductive' : visit.planned_date > format(new Date(), 'yyyy-MM-dd') ? 'Planned' : visit.status}
                              </Badge>
                              {feedbacks.get(visit.id) && <Badge variant="outline" className="text-xs">Feedback ✓</Badge>}
                            </div>
                            {orderData && (
                              <>
                                <p className="text-sm font-medium">Order Value: ₹{orderData.total.toLocaleString()}</p>
                                <div className="text-xs space-y-1">
                                  <p className="font-medium text-muted-foreground">Products:</p>
                                  {orderData.items.map((item, i) => (
                                    <div key={i} className="flex justify-between">
                                      <span>{item.product_name} x{item.quantity}</span>
                                      <span>₹{item.total_price.toLocaleString()}</span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                            {!orderData && (
                              <p className="text-xs text-muted-foreground">No order placed during this visit</p>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            {/* Charts Tab */}
            <TabsContent value="charts" className="mt-0 space-y-4">
              <div className="flex justify-end">
                <Select value={chartFilter} onValueChange={(v) => setChartFilter(v as DateFilter)}>
                  <SelectTrigger className="w-40 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="this_week">This Week</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="last_month">Last Month</SelectItem>
                    <SelectItem value="this_quarter">This Quarter</SelectItem>
                    <SelectItem value="last_quarter">Last Quarter</SelectItem>
                    <SelectItem value="this_fy">This Financial Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm">Revenue by Date</CardTitle>
                </CardHeader>
                <CardContent className="p-2 h-48">
                  {revenueByDateData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueByDateData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                        <RechartsTooltip formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Revenue']} />
                        <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No data for selected period</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm">Revenue by Product</CardTitle>
                </CardHeader>
                <CardContent className="p-2 h-48">
                  {revenueByProductData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueByProductData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="product" tick={{ fontSize: 9 }} width={80} />
                        <RechartsTooltip formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Revenue']} />
                        <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                          {revenueByProductData.map((_, index) => (
                            <Cell key={index} fill={chartColors[index % chartColors.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No data for selected period</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Details Tab - Owner & Location */}
            <TabsContent value="details" className="mt-0 space-y-4">
              {/* Owner Details */}
              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4" /> Owner Details</CardTitle>
                </CardHeader>
                <CardContent className="p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Owner's Name</Label>
                      {isEditing ? (
                        <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="h-8 text-sm mt-1" />
                      ) : (
                        <p className="text-sm font-medium">{formData.name}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Owner's Number</Label>
                      {isEditing ? (
                        <Input value={formData.phone || ''} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="h-8 text-sm mt-1" />
                      ) : formData.phone ? (
                        <a href={`tel:${formData.phone}`} className="flex items-center gap-1 text-sm hover:text-primary">
                          <Phone size={12} className="text-primary" /> {formData.phone}
                        </a>
                      ) : (
                        <p className="text-sm text-muted-foreground">-</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Contact Name and Title */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Contact Name</Label>
                      {isEditing ? (
                        <Input value={formData.contact_name || ''} onChange={(e) => setFormData({...formData, contact_name: e.target.value})} className="h-8 text-sm mt-1" placeholder="Contact person name" />
                      ) : (
                        <p className="text-sm">{formData.contact_name || '-'}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Title</Label>
                      {isEditing ? (
                        <Select value={formData.contact_title || ''} onValueChange={(value) => setFormData({...formData, contact_title: value})}>
                          <SelectTrigger className="h-8 text-sm mt-1">
                            <SelectValue placeholder="Select title" />
                          </SelectTrigger>
                          <SelectContent className="bg-background border z-50">
                            {contactTitles.map((title) => (
                              <SelectItem key={title} value={title}>{title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm">{formData.contact_title || '-'}</p>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-xs text-muted-foreground">GST Number</Label>
                    {isEditing ? (
                      <Input value={formData.gst_number || ''} onChange={(e) => setFormData({...formData, gst_number: e.target.value})} className="h-8 text-sm mt-1" />
                    ) : (
                      <p className="text-sm">{formData.gst_number || '-'}</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Location Details */}
              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4" /> Location Details</CardTitle>
                </CardHeader>
                <CardContent className="p-3 space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Address</Label>
                    {isEditing ? (
                      <Input value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} className="h-8 text-sm mt-1" />
                    ) : (
                      <a href={getGoogleMapsLink() || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formData.address || '')}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                        {formData.address}
                      </a>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Location Tag</Label>
                      {isEditing ? (
                        <Input value={formData.location_tag || ''} onChange={(e) => setFormData({...formData, location_tag: e.target.value})} className="h-8 text-sm mt-1" />
                      ) : (
                        <p className="text-sm">{formData.location_tag || '-'}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Coordinates</Label>
                      <p className="text-sm">{formData.latitude && formData.longitude ? `${formData.latitude}, ${formData.longitude}` : '-'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Beat</Label>
                      {isEditing ? (
                        <Select value={formData.beat_id || 'unassigned'} onValueChange={(v) => setFormData({...formData, beat_id: v === 'unassigned' ? '' : v})}>
                          <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select beat" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {beats.map((beat) => (
                              <SelectItem key={beat.beat_id} value={beat.beat_id}>{beat.beat_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm">{beats.find(b => b.beat_id === formData.beat_id)?.beat_name || '-'}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Territory</Label>
                      {isEditing ? (
                        <Select value={formData.territory_id || 'none'} onValueChange={(v) => setFormData({...formData, territory_id: v === 'none' ? null : v})}>
                          <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select territory" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {territories.map((t) => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm">{territories.find(t => t.id === formData.territory_id)?.name || '-'}</p>
                      )}
                    </div>
                  </div>
                  {getGoogleMapsLink() && (
                    <a href={getGoogleMapsLink()!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <MapPin size={12} /> View on Google Maps <ExternalLink size={10} />
                    </a>
                  )}
                </CardContent>
              </Card>

              {/* Customer Portal */}
              <RetailerCustomerPortalSection
                retailerId={formData.id}
                retailerPhone={formData.phone}
                portalEnabled={(formData as any).portal_enabled}
                portalPin={(formData as any).portal_pin}
              />

              {/* Distributor Mapping */}

              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm flex items-center gap-2"><Building className="h-4 w-4" /> Distributor Mapping</CardTitle>
                </CardHeader>
                <CardContent className="p-3 grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Parent Type</Label>
                    {isEditing ? (
                      <Select value={formData.parent_type || 'Distributor'} onValueChange={(v) => setFormData({...formData, parent_type: v})}>
                        <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Company">Company</SelectItem>
                          <SelectItem value="Super Stockist">Super Stockist</SelectItem>
                          <SelectItem value="Distributor">Distributor</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm">{formData.parent_type || '-'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Parent Name / Distributor</Label>
                    {isEditing ? (
                      <Popover open={distributorOpen} onOpenChange={setDistributorOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" role="combobox" aria-expanded={distributorOpen} className="w-full h-8 text-sm mt-1 justify-between font-normal">
                            {formData.parent_name || "Select distributor..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[250px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search distributors..." className="h-9" />
                            <CommandList>
                              <CommandEmpty>No distributor found.</CommandEmpty>
                              <CommandGroup>
                                {distributors.map((dist) => (
                                  <CommandItem
                                    key={dist.id}
                                    value={dist.name}
                                    onSelect={() => {
                                      setFormData({...formData, parent_name: dist.name});
                                      setDistributorOpen(false);
                                    }}
                                  >
                                    <Check className={cn("mr-2 h-4 w-4", formData.parent_name === dist.name ? "opacity-100" : "opacity-0")} />
                                    {dist.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <p className="text-sm">{formData.parent_name || associatedDistributor || '-'}</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Outlet Details */}
              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm flex items-center gap-2"><Building className="h-4 w-4" /> Outlet Details</CardTitle>
                </CardHeader>
                <CardContent className="p-3 grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Outlet Type</Label>
                    {isEditing ? (
                      <Select value={formData.retail_type || 'none'} onValueChange={(v) => setFormData({...formData, retail_type: v === 'none' ? null : v})}>
                        <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="Individual stall">Individual stall</SelectItem>
                          <SelectItem value="Kirana store">Kirana store</SelectItem>
                          <SelectItem value="Super market">Super market</SelectItem>
                          <SelectItem value="Bakery">Bakery</SelectItem>
                          <SelectItem value="Milk Parlour">Milk Parlour</SelectItem>
                          <SelectItem value="Hotel">Hotel</SelectItem>
                          <SelectItem value="Restaurants">Restaurants</SelectItem>
                          <SelectItem value="Catering Services">Catering Services</SelectItem>
                          <SelectItem value="Business Office">Business Office</SelectItem>
                          <SelectItem value="Others">Others</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm">{formData.retail_type || '-'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Category</Label>
                    {isEditing ? (
                      <Select value={formData.category || 'none'} onValueChange={(v) => setFormData({...formData, category: v === 'none' ? null : v})}>
                        <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="Category A">Category A</SelectItem>
                          <SelectItem value="Category B">Category B</SelectItem>
                          <SelectItem value="Category C">Category C</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm">{formData.category || '-'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Potential</Label>
                    {isEditing ? (
                      <Select value={formData.potential || 'none'} onValueChange={(v) => setFormData({...formData, potential: v === 'none' ? null : v})}>
                        <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="Low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm capitalize">{formData.potential || '-'}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    {isEditing ? (
                      <Select value={formData.status || 'active'} onValueChange={(v) => setFormData({...formData, status: v})}>
                        <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm capitalize">{formData.status || '-'}</p>
                    )}
                  </div>
                  {creditConfig?.is_enabled && creditConfig?.scoring_mode === 'manual' && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Credit Score</Label>
                      {isEditing ? (
                        <Input type="number" min="0" max="10" step="0.1" value={formData.manual_credit_score || ''} onChange={(e) => setFormData({...formData, manual_credit_score: e.target.value ? parseFloat(e.target.value) : null})} className="h-8 text-sm mt-1" />
                      ) : (
                        <p className="text-sm">{formData.manual_credit_score ? `${formData.manual_credit_score} / 10` : '-'}</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Notes */}
              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4" /> Notes</CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  {isEditing ? (
                    <textarea 
                      value={formData.notes || ''} 
                      onChange={(e) => setFormData({...formData, notes: e.target.value})} 
                      className="w-full h-20 text-sm p-2 border rounded-md resize-none bg-background" 
                      placeholder="Add notes about this retailer..."
                    />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{formData.notes || 'No notes added'}</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          {!isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} disabled={loading}>
                <Edit2 className="h-4 w-4 mr-1" /> Edit
              </Button>
              <Button variant="destructive" size="sm" onClick={(e) => { e.stopPropagation(); handleDeleteClick(); }} disabled={loading}>
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => { setFormData({ ...retailer! }); setIsEditing(false); }} disabled={loading}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={loading}>
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>

      {/* Invoice Preview Dialog */}
      <Dialog open={!!viewingInvoice} onOpenChange={() => closeInvoicePreview()}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center justify-between">
              <span>Invoice {viewingInvoice?.number}</span>
              <div className="flex items-center gap-2 mr-6">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => viewingInvoice && handleDownloadInvoice(viewingInvoice.id, viewingInvoice.number)}
                  disabled={downloadingInvoiceId === viewingInvoice?.id}
                >
                  {downloadingInvoiceId === viewingInvoice?.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Download className="h-4 w-4 mr-1" />
                  )}
                  Download
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => viewingInvoice && handleSendInvoice(viewingInvoice.id, viewingInvoice.number)}
                  disabled={sendingInvoiceId === viewingInvoice?.id || !formData?.phone}
                >
                  {sendingInvoiceId === viewingInvoice?.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Send className="h-4 w-4 mr-1" />
                  )}
                  Share
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {invoicePreviewLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : invoicePreviewUrl ? (
              <>
                <iframe
                  src={invoicePreviewUrl}
                  className="w-full h-[70vh] border rounded hidden sm:block"
                  title="Invoice Preview"
                />
                {/* Mobile fallback - show download prompt */}
                <div className="sm:hidden flex flex-col items-center justify-center h-[50vh] gap-4">
                  <FileText className="h-16 w-16 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground text-center px-4">
                    Invoice preview may not display on mobile. Use the buttons above to download or share.
                  </p>
                  <Button
                    onClick={() => viewingInvoice && handleDownloadInvoice(viewingInvoice.id, viewingInvoice.number)}
                    disabled={downloadingInvoiceId === viewingInvoice?.id}
                  >
                    {downloadingInvoiceId === viewingInvoice?.id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    Download Invoice
                  </Button>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground">
                <p>Could not load preview</p>
                <Button
                  variant="outline"
                  onClick={() => viewingInvoice && handleDownloadInvoice(viewingInvoice.id, viewingInvoice.number)}
                  disabled={downloadingInvoiceId === viewingInvoice?.id}
                >
                  {downloadingInvoiceId === viewingInvoice?.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Download Instead
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={handleDeleteConfirm}
        title="Delete Retailer"
        description={`Are you sure you want to delete "${formData?.name}"? This will move it to the recycle bin.`}
        isLoading={loading}
      />
    </Dialog>
  );
};
