import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useManagedInterval, debounce } from '@/utils/intervalManager';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Download, Search, Eye, RefreshCw, MapPin, Clock, Package, DollarSign, User, RotateCcw, Pencil, Ban, ChevronDown, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { getCurrentWeekRange, getCurrentMonthRange, getLastMonthRange, toLocalISODate } from '@/utils/dateUtils';
import { downloadCSV } from '@/utils/fileDownloader';
import { PaymentProofsView } from '@/components/admin/PaymentProofsView';
import { OperationsSummaryBoxes } from '@/components/operations/OperationsSummaryBoxes';
import EditOrderDialog from '@/components/EditOrderDialog';
import { CancelOrderDialog, CancelableOrder } from '@/components/CancelOrderDialog';
import { SignedImage } from '@/components/ui/signed-image';
import { InvoicePDFGenerator } from '@/components/invoice/InvoicePDFGenerator';
import { InvoicePreviewDialog, DownloadInvoiceButton } from '@/components/invoice/InvoicePreviewDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, Phone } from 'lucide-react';

interface CheckInOutData {
  id: string;
  user_id: string;
  user_name: string;
  retailer_name: string;
  retailer_id: string;
  check_in_time: string | null;
  check_out_time: string | null;
  check_in_location: any;
  check_out_location: any;
  check_in_address: string | null;
  check_out_address: string | null;
  check_in_photo_url: string | null;
  check_out_photo_url: string | null;
  planned_date: string;
  skip_check_in_time?: string | null;
  skip_check_in_reason?: string | null;
  no_order_reason?: string | null;
  status?: string;
  face_match_confidence?: number | null;
  face_verification_status?: string | null;
  attendance_photo_url?: string | null;
  profile_picture_url?: string | null;
  // New fields
  time_spent_seconds?: number | null;
  location_status?: string | null;
  return_data?: {
    product_name: string;
    quantity: number;
    reason?: string;
  }[];
}

interface OrderData {
  id: string;
  user_name: string;
  retailer_name: string;
  retailer_phone: string | null;
  created_at: string;
  updated_at: string;
  total_amount: number;
  subtotal: number;
  discount_amount: number;
  status: string;
  items: any[];
  is_edited: boolean;
  is_credit_order: boolean;
  credit_pending_amount: number;
  credit_paid_amount: number;
  payment_method: string | null;
  payment_status: string | null;
  invoice_number: string | null;
  invoice_id: string | null;
}

interface StockData {
  id: string;
  user_name: string;
  retailer_name: string;
  created_at: string;
  product_name: string;
  stock_quantity: number;
}

const Operations = () => {
  const { hasAdminAccess, loading } = useAdminAccess();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<string>(() => {
    try { return localStorage.getItem('operations_active_tab') || 'orders'; } catch { return 'orders'; }
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchTerm, setSearchTerm] = useState<string>(() => {
    try { return localStorage.getItem('operations_search_term') || ''; } catch { return ''; }
  });
  const [userFilter, setUserFilter] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('operations_user_filter');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === 'string');
      }
    } catch {}
    return [];
  });
  const [userSearch, setUserSearch] = useState('');
  useEffect(() => {
    try { localStorage.setItem('operations_user_filter', JSON.stringify(userFilter)); } catch {}
  }, [userFilter]);
  const [summaryDateFilter, setSummaryDateFilter] = useState<'today' | 'week' | 'month'>('today');

  // Helper: hydrate string filter from localStorage
  const hydrateString = (key: string, fallback: string): string => {
    try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
  };
  // Helper: hydrate {from,to} Date range from localStorage
  const hydrateRange = (key: string): { from: Date | null; to: Date | null } => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { from: null, to: null };
      const parsed = JSON.parse(raw);
      return {
        from: parsed?.from ? new Date(parsed.from) : null,
        to: parsed?.to ? new Date(parsed.to) : null,
      };
    } catch { return { from: null, to: null }; }
  };

  // Separate date filters for each section (persisted)
  const [checkinDateFilter, setCheckinDateFilter] = useState(() => hydrateString('operations_checkin_date_filter', 'today'));
  const [orderDateFilter, setOrderDateFilter] = useState(() => hydrateString('operations_order_date_filter', 'today'));
  const [stockDateFilter, setStockDateFilter] = useState(() => hydrateString('operations_stock_date_filter', 'today'));

  // Custom date ranges (persisted)
  const [checkinCustomRange, setCheckinCustomRange] = useState<{ from: Date | null; to: Date | null }>(() => hydrateRange('operations_checkin_custom_range'));
  const [orderCustomRange, setOrderCustomRange] = useState<{ from: Date | null; to: Date | null }>(() => hydrateRange('operations_order_custom_range'));
  const [stockCustomRange, setStockCustomRange] = useState<{ from: Date | null; to: Date | null }>(() => hydrateRange('operations_stock_custom_range'));
  
  // Data states
  const [checkInData, setCheckInData] = useState<CheckInOutData[]>([]);
  const [orderData, setOrderData] = useState<OrderData[]>([]);
  const [stockData, setStockData] = useState<StockData[]>([]);
  const [competitorData, setCompetitorData] = useState<any[]>([]);
  const [returnStockData, setReturnStockData] = useState<any[]>([]);
  const [cancelledOrders, setCancelledOrders] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  
  // Loading states
  const [loadingCheckins, setLoadingCheckins] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingStock, setLoadingStock] = useState(false);
  const [loadingCompetitor, setLoadingCompetitor] = useState(false);
  const [loadingReturnStock, setLoadingReturnStock] = useState(false);
  const [loadingCancelled, setLoadingCancelled] = useState(false);
  
  // Date filter for competitor and return stock
  const [competitorDateFilter, setCompetitorDateFilter] = useState(() => hydrateString('operations_competitor_date_filter', 'today'));
  const [returnStockDateFilter, setReturnStockDateFilter] = useState(() => hydrateString('operations_return_stock_date_filter', 'today'));
  const [cancelledDateFilter, setCancelledDateFilter] = useState(() => hydrateString('operations_cancelled_date_filter', 'today'));

  // Persist all filter state back to localStorage
  useEffect(() => { try { localStorage.setItem('operations_active_tab', activeTab); } catch {} }, [activeTab]);
  useEffect(() => { try { localStorage.setItem('operations_search_term', searchTerm); } catch {} }, [searchTerm]);
  useEffect(() => { try { localStorage.setItem('operations_checkin_date_filter', checkinDateFilter); } catch {} }, [checkinDateFilter]);
  useEffect(() => { try { localStorage.setItem('operations_order_date_filter', orderDateFilter); } catch {} }, [orderDateFilter]);
  useEffect(() => { try { localStorage.setItem('operations_stock_date_filter', stockDateFilter); } catch {} }, [stockDateFilter]);
  useEffect(() => { try { localStorage.setItem('operations_competitor_date_filter', competitorDateFilter); } catch {} }, [competitorDateFilter]);
  useEffect(() => { try { localStorage.setItem('operations_return_stock_date_filter', returnStockDateFilter); } catch {} }, [returnStockDateFilter]);
  useEffect(() => { try { localStorage.setItem('operations_cancelled_date_filter', cancelledDateFilter); } catch {} }, [cancelledDateFilter]);
  useEffect(() => {
    try {
      localStorage.setItem('operations_checkin_custom_range', JSON.stringify({
        from: checkinCustomRange.from?.toISOString() ?? null,
        to: checkinCustomRange.to?.toISOString() ?? null,
      }));
    } catch {}
  }, [checkinCustomRange]);
  useEffect(() => {
    try {
      localStorage.setItem('operations_order_custom_range', JSON.stringify({
        from: orderCustomRange.from?.toISOString() ?? null,
        to: orderCustomRange.to?.toISOString() ?? null,
      }));
    } catch {}
  }, [orderCustomRange]);
  useEffect(() => {
    try {
      localStorage.setItem('operations_stock_custom_range', JSON.stringify({
        from: stockCustomRange.from?.toISOString() ?? null,
        to: stockCustomRange.to?.toISOString() ?? null,
      }));
    } catch {}
  }, [stockCustomRange]);
  
  // Summary counters
  const [todayStats, setTodayStats] = useState({
    checkins: 0,
    orders: 0,
    stockUpdates: 0
  });

  const getPaymentTypeLabel = (o: { is_credit_order?: boolean; credit_paid_amount?: number; credit_pending_amount?: number; total_amount?: number; payment_status?: string | null }) => {
    const paid = Number(o.credit_paid_amount || 0);
    const pending = Number(o.credit_pending_amount || 0);
    const total = Number(o.total_amount || 0);
    if (o.is_credit_order) {
      if (paid <= 0) return 'Full Credit';
      if (pending > 0 || paid < total) return 'Partial Payment';
      return 'Full Payment';
    }
    // Non-credit order: derive from amount paid vs total (payment_status is unreliable)
    if (total > 0 && paid >= total) return 'Full Payment';
    if (paid > 0) return 'Partial Payment';
    if (o.payment_status === 'partial') return 'Partial Payment';
    return 'Pending';
  };

  // Format an order-item quantity using its stored unit.
  // Grams >= 1000 are shown as KG for readability.
  const formatItemQty = (qty: number | string | null | undefined, unit: string | null | undefined): string => {
    const n = Number(qty || 0);
    const u = String(unit || '').trim();
    const ul = u.toLowerCase();
    if ((ul === 'grams' || ul === 'gram' || ul === 'g') && n >= 1000) {
      const kg = n / 1000;
      return `${kg % 1 === 0 ? kg.toFixed(0) : kg.toFixed(2)} KG`;
    }
    if ((ul === 'ml' || ul === 'milliliter' || ul === 'milliliters') && n >= 1000) {
      const l = n / 1000;
      return `${l % 1 === 0 ? l.toFixed(0) : l.toFixed(2)} L`;
    }
    return u ? `${n} ${u}` : String(n);
  };
  
  // Edit order dialog state
  const [editOrderDialogOpen, setEditOrderDialogOpen] = useState(false);
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState<{ id: string; retailer_name: string } | null>(null);

  // Cancel order dialog state
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [selectedOrderForCancel, setSelectedOrderForCancel] = useState<{ order: CancelableOrder; retailerName: string } | null>(null);

  // Fetch users for filter (via Edge Function to bypass RLS logging issue)
  const fetchUsers = async () => {
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke('admin-get-users');
      if (fnError) throw fnError;

      // Normalize to expected shape
      const list = (fnData?.users || fnData || []).map((u: any) => ({
        id: u.id,
        full_name: u.full_name ?? u.fullName ?? u.username ?? '—',
        username: u.username ?? null,
        profile_picture_url: u.profile_picture_url ?? u.profilePictureUrl ?? null,
      }));
      setUsers(list);
    } catch (e1) {
      // Fallback to direct select (works for admins or self)
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, username, profile_picture_url')
          .order('full_name');
        if (error) throw error;
        setUsers(data || []);
      } catch (error) {
        console.warn('Could not fetch users list:', (error as any)?.message || error);
        setUsers([]);
      }
    }
  };
  // Fetch check-in/check-out data
  const fetchCheckInData = useCallback(async (silent = false) => {
    if (!silent) setLoadingCheckins(true);
    try {
      let query = supabase
        .from('visits')
        .select(`
          id,
          user_id,
          retailer_id,
          check_in_time,
          check_out_time,
          check_in_location,
          check_out_location,
          check_in_address,
          check_out_address,
          check_in_photo_url,
          check_out_photo_url,
          planned_date,
          skip_check_in_time,
          skip_check_in_reason,
          no_order_reason,
          status
        `)
        .or('check_in_time.not.is.null,skip_check_in_time.not.is.null');

      if (userFilter.length > 0) {
        query = query.in('user_id', userFilter);
      }

      // Apply date filter for check-ins
      const checkInToday = new Date();
      const checkInStartOfToday = new Date(checkInToday.getFullYear(), checkInToday.getMonth(), checkInToday.getDate());
      
      if (checkinDateFilter === 'today') {
        query = query.gte('planned_date', checkInStartOfToday.toISOString().split('T')[0]);
      } else if (checkinDateFilter === 'week') {
        const { start, end } = getCurrentWeekRange();
        query = query.gte('planned_date', toLocalISODate(start)).lte('planned_date', toLocalISODate(end));
      } else if (checkinDateFilter === 'month') {
        const { start, end } = getCurrentMonthRange();
        query = query.gte('planned_date', toLocalISODate(start)).lte('planned_date', toLocalISODate(end));
      } else if (checkinDateFilter === 'lastMonth') {
        const { start, end } = getLastMonthRange();
        query = query.gte('planned_date', toLocalISODate(start)).lte('planned_date', toLocalISODate(end));
      } else if (checkinDateFilter === 'custom' && checkinCustomRange.from) {
        query = query.gte('planned_date', checkinCustomRange.from.toISOString().split('T')[0]);
        if (checkinCustomRange.to) {
          query = query.lte('planned_date', checkinCustomRange.to.toISOString().split('T')[0]);
        }
      }

      const { data: visitsData, error } = await query;
      if (error) throw error;

      // Get user and retailer data separately with proper error handling
      const userIds = [...new Set(visitsData?.map(v => v.user_id).filter(Boolean) || [])];
      const retailerIds = [...new Set(visitsData?.map(v => v.retailer_id).filter(Boolean) || [])];

      let usersData: any[] = [];
      let retailersData: any[] = [];

      // Fetch users if we have user IDs
      if (userIds.length > 0) {
        try {
          const { data, error: usersError } = await supabase
            .from('profiles')
            .select('id, full_name, username, profile_picture_url')
            .in('id', userIds);
          
          if (!usersError && data) {
            usersData = data;
          } else if (usersError) {
            console.warn('Could not fetch user profiles:', usersError.message);
            // Set basic fallback data for users we couldn't fetch
            usersData = userIds.map(id => ({
              id,
              full_name: 'Unknown User',
              username: 'user',
              profile_picture_url: null
            }));
          }
        } catch (err) {
          console.error('Error fetching user profiles:', err);
          // Set basic fallback data
          usersData = userIds.map(id => ({
            id,
            full_name: 'Unknown User',
            username: 'user',
            profile_picture_url: null
          }));
        }
      }

      // Fetch retailers if we have retailer IDs
      if (retailerIds.length > 0) {
        const { data, error: retailersError } = await supabase
          .from('retailers')
          .select('id, name')
          .in('id', retailerIds);
        
        if (!retailersError && data) {
          retailersData = data;
        } else if (retailersError) {
          console.warn('Could not fetch retailers:', retailersError.message);
        }
      }

      const formattedData = await Promise.all(visitsData?.map(async (visit) => {
        const user = (usersData?.find(u => u.id === visit.user_id)) || (users.find(u => u.id === visit.user_id));
        const retailer = retailersData?.find(r => r.id === visit.retailer_id);
        
        // Get signed URLs for photos if they exist
        let checkInPhotoUrl = null;
        let checkOutPhotoUrl = null;

        if (visit.check_in_photo_url) {
          const { data: signedUrlData } = await supabase.storage
            .from('visit-photos')
            .createSignedUrl(visit.check_in_photo_url, 3600);
          if (signedUrlData?.signedUrl) {
            // Handle relative signed URLs
            checkInPhotoUrl = signedUrlData.signedUrl.startsWith('http') 
              ? signedUrlData.signedUrl 
              : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1${signedUrlData.signedUrl}`;
          }
        }

        if (visit.check_out_photo_url) {
          const { data: signedUrlData } = await supabase.storage
            .from('visit-photos')
            .createSignedUrl(visit.check_out_photo_url, 3600);
          if (signedUrlData?.signedUrl) {
            // Handle relative signed URLs
            checkOutPhotoUrl = signedUrlData.signedUrl.startsWith('http')
              ? signedUrlData.signedUrl
              : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1${signedUrlData.signedUrl}`;
          }
        }

        // Fetch face matching data from attendance table
        let faceMatchConfidence = null;
        let faceVerificationStatus = null;
        let attendancePhotoUrl = null;
        let profilePictureUrl = null;

        if (visit.check_in_time && visit.user_id) {
          try {
            const checkInDate = new Date(visit.check_in_time).toISOString().split('T')[0];
            const { data: attendanceData } = await supabase
              .from('attendance')
              .select('face_match_confidence, face_verification_status, check_in_photo_url')
              .eq('user_id', visit.user_id)
              .eq('date', checkInDate)
              .maybeSingle();

            if (attendanceData) {
              faceMatchConfidence = attendanceData.face_match_confidence;
              faceVerificationStatus = attendanceData.face_verification_status;
              
              // Get signed URL for attendance photo (bucket is private)
              if (attendanceData.check_in_photo_url) {
                const { data: signedUrlData } = await supabase.storage
                  .from('attendance-photos')
                  .createSignedUrl(attendanceData.check_in_photo_url, 3600);
                if (signedUrlData?.signedUrl) {
                  attendancePhotoUrl = signedUrlData.signedUrl.startsWith('http') 
                    ? signedUrlData.signedUrl 
                    : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1${signedUrlData.signedUrl}`;
                }
              }
            }

            // Get user's profile picture - use data from already fetched users
            const userProfile = (usersData?.find(u => u.id === visit.user_id)) || (users.find(u => u.id === visit.user_id));
            if (userProfile && (userProfile as any).profile_picture_url) {
              profilePictureUrl = (userProfile as any).profile_picture_url;
            }
          } catch (err) {
            console.warn('Error fetching face match data:', err);
          }
        }
        
        // Fetch visit log data for time spent and location status
        // Join by retailer_id, user_id, and visit_date since visit_id may be NULL
        let timeSpentSeconds: number | null = null;
        let locationStatus: string | null = null;
        
        try {
          const { data: visitLogData } = await supabase
            .from('retailer_visit_logs')
            .select('time_spent_seconds, location_status')
            .eq('retailer_id', visit.retailer_id)
            .eq('user_id', visit.user_id)
            .eq('visit_date', visit.planned_date)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (visitLogData) {
            timeSpentSeconds = visitLogData.time_spent_seconds;
            locationStatus = visitLogData.location_status;
          }
        } catch (err) {
          console.warn('Error fetching visit log data:', err);
        }

        // Calculate time spent from check-in/check-out if not from visit log
        if (!timeSpentSeconds && visit.check_in_time && visit.check_out_time) {
          const checkIn = new Date(visit.check_in_time).getTime();
          const checkOut = new Date(visit.check_out_time).getTime();
          timeSpentSeconds = Math.round((checkOut - checkIn) / 1000);
        }

        // Return stock data - we'll display from orders with return items if available
        let returnData: { product_name: string; quantity: number; reason?: string }[] = [];
        try {
          // Check for return items in orders associated with this visit
          const { data: orderData } = await supabase
            .from('orders')
            .select('id')
            .eq('visit_id', visit.id)
            .maybeSingle();
          
          if (orderData) {
            const { data: returnItems } = await supabase
              .from('order_items')
              .select('product_name, quantity')
              .eq('order_id', orderData.id)
              .lt('quantity', 0); // Negative quantities indicate returns
            
            if (returnItems && returnItems.length > 0) {
              returnData = returnItems.map(item => ({
                product_name: item.product_name,
                quantity: Math.abs(item.quantity),
                reason: 'Return'
              }));
            }
          }
        } catch (err) {
          console.warn('Error fetching return data:', err);
        }

        return {
          id: visit.id,
          user_id: visit.user_id,
          retailer_id: visit.retailer_id,
          user_name: user?.full_name || user?.username || 'Unknown',
          retailer_name: retailer?.name || 'Unknown',
          check_in_time: visit.check_in_time,
          check_out_time: visit.check_out_time,
          check_in_location: visit.check_in_location,
          check_out_location: visit.check_out_location,
          check_in_address: visit.check_in_address,
          check_out_address: visit.check_out_address,
          check_in_photo_url: checkInPhotoUrl,
          check_out_photo_url: checkOutPhotoUrl,
          planned_date: visit.planned_date,
          skip_check_in_time: visit.skip_check_in_time,
          skip_check_in_reason: visit.skip_check_in_reason,
          no_order_reason: visit.no_order_reason,
          status: visit.status,
          face_match_confidence: faceMatchConfidence,
          face_verification_status: faceVerificationStatus,
          attendance_photo_url: attendancePhotoUrl,
          profile_picture_url: profilePictureUrl,
          time_spent_seconds: timeSpentSeconds,
          location_status: locationStatus,
          return_data: returnData
        };
      }) || []);

      // Sort by the most recent check-in or skip check-in time
      formattedData.sort((a, b) => {
        const timeA = a.check_in_time || a.skip_check_in_time;
        const timeB = b.check_in_time || b.skip_check_in_time;
        
        if (!timeA && !timeB) return 0;
        if (!timeA) return 1;
        if (!timeB) return -1;
        
        return new Date(timeB).getTime() - new Date(timeA).getTime();
      });

      setCheckInData(formattedData);

      // Calculate today's check-ins (including phone orders and skip check-ins)
      const today = new Date().toISOString().split('T')[0];
      const todayCheckins = formattedData.filter(item => 
        (item.check_in_time && item.check_in_time.startsWith(today)) ||
        (item.skip_check_in_time && item.skip_check_in_time.startsWith(today))
      ).length;
      
      setTodayStats(prev => ({ ...prev, checkins: todayCheckins }));
    } catch (error) {
      console.error('Error fetching check-in data:', error);
      if (!silent) toast.error('Failed to fetch check-in data');
    } finally {
      if (!silent) setLoadingCheckins(false);
    }
  }, [userFilter, checkinDateFilter, checkinCustomRange, users]);

  // Fetch order data
  const fetchOrderData = useCallback(async (silent = false) => {
    if (!silent) setLoadingOrders(true);
    try {
      let query = supabase
        .from('orders')
        .select(`
          id,
          user_id,
          created_at,
          updated_at,
          subtotal,
          discount_amount,
          total_amount,
          status,
          retailer_name,
          retailer_id,
          counter_customer_id,
          is_credit_order,
          credit_pending_amount,
          credit_paid_amount,
          payment_method,
          payment_status,
          invoice_generated_at,
          is_edited,
          edited_at,
          edit_count
        `)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false });

      if (userFilter.length > 0) {
        query = query.in('user_id', userFilter);
      }

      // Apply date filter for orders
      const orderToday = new Date();
      const orderStartOfToday = new Date(orderToday.getFullYear(), orderToday.getMonth(), orderToday.getDate());
      
      if (orderDateFilter === 'today') {
        query = query.gte('created_at', orderStartOfToday.toISOString());
      } else if (orderDateFilter === 'week') {
        const { start, end } = getCurrentWeekRange();
        query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
      } else if (orderDateFilter === 'month') {
        const { start, end } = getCurrentMonthRange();
        query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
      } else if (orderDateFilter === 'lastMonth') {
        const { start, end } = getLastMonthRange();
        query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
      } else if (orderDateFilter === 'custom' && orderCustomRange.from) {
        query = query.gte('created_at', orderCustomRange.from.toISOString());
        if (orderCustomRange.to) {
          const endOfDay = new Date(orderCustomRange.to);
          endOfDay.setHours(23, 59, 59, 999);
          query = query.lte('created_at', endOfDay.toISOString());
        }
      }

      const { data: ordersData, error } = await query;
      if (error) throw error;

      // Get user data separately
      const userIds = [...new Set(ordersData?.map(o => o.user_id) || [])];
      const retailerIds = [...new Set((ordersData || []).map(o => o.retailer_id).filter(Boolean) as string[])];
      const counterIds = [...new Set((ordersData || []).map(o => o.counter_customer_id).filter(Boolean) as string[])];
      const orderIds = (ordersData || []).map(o => o.id);

      const [{ data: usersData }, { data: retailersData }, { data: counterData }, { data: invoicesData }, { data: itemsData }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, username').in('id', userIds),
        retailerIds.length
          ? supabase.from('retailers').select('id, phone').in('id', retailerIds)
          : Promise.resolve({ data: [] as any[] }),
        counterIds.length
          ? supabase.from('counter_customers').select('id, phone').in('id', counterIds)
          : Promise.resolve({ data: [] as any[] }),
        orderIds.length
          ? supabase.from('invoices').select('id, order_id, invoice_number').in('order_id', orderIds)
          : Promise.resolve({ data: [] as any[] }),
        orderIds.length
          ? supabase
              .from('order_items')
              .select('order_id, product_name, quantity, rate, total, sgst_amount, cgst_amount, hsn_code, unit')
              .in('order_id', orderIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const formattedData = ordersData?.map(order => {
        const user = usersData?.find(u => u.id === order.user_id);
        const retailer = retailersData?.find((r: any) => r.id === order.retailer_id);
        const counter = counterData?.find((c: any) => c.id === order.counter_customer_id);
        const invoice = invoicesData?.find((i: any) => i.order_id === order.id);
        const itemsForOrder = (itemsData || []).filter((it: any) => it.order_id === order.id);
        
        // Check if order was edited (updated_at differs from created_at by more than 5 seconds)
        const createdTime = new Date(order.created_at).getTime();
        const updatedTime = order.updated_at ? new Date(order.updated_at).getTime() : createdTime;
        const isEdited = Math.abs(updatedTime - createdTime) > 5000; // 5 second threshold
        
        return {
          id: order.id,
          user_name: user?.full_name || user?.username || 'Unknown',
          retailer_name: order.retailer_name || 'Unknown',
          retailer_phone: (retailer?.phone || counter?.phone || null) as string | null,
          created_at: order.created_at,
          updated_at: order.updated_at || order.created_at,
          total_amount: order.total_amount,
          subtotal: Number(order.subtotal || 0),
          discount_amount: Number(order.discount_amount || 0),
          status: order.status,
          items: itemsForOrder,
          is_edited: isEdited,
          is_credit_order: order.is_credit_order || false,
          credit_pending_amount: order.credit_pending_amount || 0,
          credit_paid_amount: Number(order.credit_paid_amount || 0),
          payment_method: order.payment_method || null,
          payment_status: order.payment_status || null,
          invoice_number: (invoice as any)?.invoice_number || null,
          invoice_id: invoice?.id || null,
        };
      }) || [];

      setOrderData(formattedData);

      // Calculate today's orders
      const todayOrders = formattedData.filter(item => 
        item.created_at.startsWith(orderToday.toISOString().split('T')[0])
      ).length;
      
      setTodayStats(prev => ({ ...prev, orders: todayOrders }));
    } catch (error) {
      console.error('Error fetching order data:', error);
      if (!silent) toast.error('Failed to fetch order data');
    } finally {
      if (!silent) setLoadingOrders(false);
    }
  }, [userFilter, orderDateFilter, orderCustomRange]);

  // Fetch stock data
  const fetchStockData = useCallback(async (silent = false) => {
    if (!silent) setLoadingStock(true);
    try {
      let query = supabase
        .from('stock')
        .select(`
          id,
          user_id,
          retailer_id,
          created_at,
          product_name,
          stock_quantity
        `)
        .order('created_at', { ascending: false });

      if (userFilter.length > 0) {
        query = query.in('user_id', userFilter);
      }

      // Apply date filter for stock
      const stockToday = new Date();
      const stockStartOfToday = new Date(stockToday.getFullYear(), stockToday.getMonth(), stockToday.getDate());
      
      if (stockDateFilter === 'today') {
        query = query.gte('created_at', stockStartOfToday.toISOString());
      } else if (stockDateFilter === 'week') {
        const { start, end } = getCurrentWeekRange();
        query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
      } else if (stockDateFilter === 'month') {
        const { start, end } = getCurrentMonthRange();
        query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
      } else if (stockDateFilter === 'lastMonth') {
        const { start, end } = getLastMonthRange();
        query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
      } else if (stockDateFilter === 'custom' && stockCustomRange.from) {
        query = query.gte('created_at', stockCustomRange.from.toISOString());
        if (stockCustomRange.to) {
          const endOfDay = new Date(stockCustomRange.to);
          endOfDay.setHours(23, 59, 59, 999);
          query = query.lte('created_at', endOfDay.toISOString());
        }
      }

      const { data: stockData, error } = await query;
      if (error) throw error;

      // Get user and retailer data separately
      const userIds = [...new Set(stockData?.map(s => s.user_id) || [])];
      const retailerIds = [...new Set(stockData?.map(s => s.retailer_id) || [])];

      const [{ data: usersData }, { data: retailersData }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, username').in('id', userIds),
        supabase.from('retailers').select('id, name').in('id', retailerIds)
      ]);

      const formattedData = stockData?.map(stock => {
        const user = usersData?.find(u => u.id === stock.user_id);
        const retailer = retailersData?.find(r => r.id === stock.retailer_id);
        
        return {
          id: stock.id,
          user_name: user?.full_name || user?.username || 'Unknown',
          retailer_name: retailer?.name || 'Unknown',
          created_at: stock.created_at,
          product_name: stock.product_name,
          stock_quantity: stock.stock_quantity
        };
      }) || [];

      setStockData(formattedData);

      // Calculate today's stock updates
      const todayStock = formattedData.filter(item => 
        item.created_at.startsWith(stockToday.toISOString().split('T')[0])
      ).length;
      
      setTodayStats(prev => ({ ...prev, stockUpdates: todayStock }));
    } catch (error) {
      console.error('Error fetching stock data:', error);
      if (!silent) toast.error('Failed to fetch stock data');
    } finally {
      if (!silent) setLoadingStock(false);
    }
  }, [userFilter, stockDateFilter, stockCustomRange]);

  // Fetch competitor data
  const fetchCompetitorData = useCallback(async (silent = false) => {
    if (!silent) setLoadingCompetitor(true);
    try {
      const competitorToday = new Date();
      const startOfToday = new Date(competitorToday.getFullYear(), competitorToday.getMonth(), competitorToday.getDate());
      
      let query = supabase
        .from('competition_data')
        .select(`
          id,
          user_id,
          retailer_id,
          competitor_id,
          sku_id,
          stock_quantity,
          selling_price,
          insight,
          impact_level,
          created_at,
          competition_master(competitor_name),
          competition_skus(sku_name)
        `)
        .order('created_at', { ascending: false });

      if (userFilter.length > 0) {
        query = query.in('user_id', userFilter);
      }

      // Apply date filter
      if (competitorDateFilter === 'today') {
        query = query.gte('created_at', startOfToday.toISOString());
      } else if (competitorDateFilter === 'week') {
        const { start, end } = getCurrentWeekRange();
        query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
      } else if (competitorDateFilter === 'month') {
        const { start, end } = getCurrentMonthRange();
        query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
      } else if (competitorDateFilter === 'lastMonth') {
        const { start, end } = getLastMonthRange();
        query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      // Get user names
      const userIds = [...new Set(data?.map(d => d.user_id).filter(Boolean) || [])];
      let usersData: any[] = [];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, username')
          .in('id', userIds);
        usersData = profiles || [];
      }

      // Fetch retailer names separately (no FK relationship for embed)
      const retailerIds = [...new Set((data || []).map(d => d.retailer_id).filter(Boolean) as string[])];
      let retailersData: any[] = [];
      if (retailerIds.length > 0) {
        const { data: rows } = await supabase
          .from('retailers')
          .select('id, name')
          .in('id', retailerIds);
        retailersData = rows || [];
      }

      const formattedData = data?.map(item => {
        const user = usersData.find(u => u.id === item.user_id);
        const retailer = retailersData.find(r => r.id === item.retailer_id);
        return {
          ...item,
          user_name: user?.full_name || user?.username || 'Unknown',
          retailer_name: retailer?.name || 'Unknown',
          competitor_name: (item.competition_master as any)?.competitor_name || 'Unknown',
          sku_name: (item.competition_skus as any)?.sku_name || '-'
        };
      }) || [];

      setCompetitorData(formattedData);
    } catch (error) {
      console.error('Error fetching competitor data:', error);
      if (!silent) toast.error('Failed to fetch competitor data');
    } finally {
      if (!silent) setLoadingCompetitor(false);
    }
  }, [userFilter, competitorDateFilter]);

  // Fetch return stock data
  const fetchReturnStockData = useCallback(async (silent = false) => {
    if (!silent) setLoadingReturnStock(true);
    try {
      const returnToday = new Date();
      const startOfToday = new Date(returnToday.getFullYear(), returnToday.getMonth(), returnToday.getDate());
      
      let query = supabase
        .from('van_return_grn')
        .select(`
          id,
          user_id,
          retailer_id,
          van_id,
          return_date,
          return_grn_number,
          notes,
          created_at,
          retailers(name),
          vans(registration_number, make_model)
        `)
        .order('created_at', { ascending: false });

      if (userFilter.length > 0) {
        query = query.in('user_id', userFilter);
      }

      // Apply date filter
      if (returnStockDateFilter === 'today') {
        query = query.gte('return_date', startOfToday.toISOString().split('T')[0]);
      } else if (returnStockDateFilter === 'week') {
        const { start, end } = getCurrentWeekRange();
        query = query.gte('return_date', toLocalISODate(start)).lte('return_date', toLocalISODate(end));
      } else if (returnStockDateFilter === 'month') {
        const { start, end } = getCurrentMonthRange();
        query = query.gte('return_date', toLocalISODate(start)).lte('return_date', toLocalISODate(end));
      } else if (returnStockDateFilter === 'lastMonth') {
        const { start, end } = getLastMonthRange();
        query = query.gte('return_date', toLocalISODate(start)).lte('return_date', toLocalISODate(end));
      }

      const { data, error } = await query;
      if (error) throw error;

      // Get user names
      const userIds = [...new Set(data?.map(d => d.user_id).filter(Boolean) || [])];
      let usersData: any[] = [];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, username')
          .in('id', userIds);
        usersData = profiles || [];
      }

      // Get return items for each GRN
      const grnIds = data?.map(d => d.id) || [];
      let returnItemsData: any[] = [];
      if (grnIds.length > 0) {
        const { data: items } = await supabase
          .from('van_return_grn_items')
          .select(`
            id,
            return_grn_id,
            product_id,
            variant_id,
            return_quantity,
            return_reason,
            products(name, rate),
            product_variants(variant_name, price)
          `)
          .in('return_grn_id', grnIds);
        returnItemsData = items || [];
      }

      const formattedData = data?.map(item => {
        const user = usersData.find(u => u.id === item.user_id);
        const itemDetails = returnItemsData.filter(ri => ri.return_grn_id === item.id);
        const totalQuantity = itemDetails.reduce((sum, i) => sum + (i.return_quantity || 0), 0);
        const totalValue = itemDetails.reduce((sum, i) => {
          const price = i.product_variants?.price || i.products?.rate || 0;
          return sum + (price * (i.return_quantity || 0) * 1.05);
        }, 0);
        
        return {
          ...item,
          user_name: user?.full_name || user?.username || 'Unknown',
          retailer_name: (item.retailers as any)?.name || 'Unknown',
          van_name: item.vans ? `${(item.vans as any).registration_number} - ${(item.vans as any).make_model}` : '-',
          items: itemDetails,
          total_quantity: totalQuantity,
          total_value: Math.round(totalValue)
        };
      }) || [];

      setReturnStockData(formattedData);
    } catch (error) {
      console.error('Error fetching return stock data:', error);
      if (!silent) toast.error('Failed to fetch return stock data');
    } finally {
      if (!silent) setLoadingReturnStock(false);
    }
  }, [userFilter, returnStockDateFilter]);

  // Fetch cancelled orders data
  const fetchCancelledOrders = useCallback(async (silent = false) => {
    if (!silent) setLoadingCancelled(true);
    try {
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      let query = supabase
        .from('order_cancellation_log')
        .select('id, order_id, reason, cancelled_by, cancelled_at, reversal_summary')
        .order('cancelled_at', { ascending: false });

      if (cancelledDateFilter === 'today') {
        query = query.gte('cancelled_at', startOfToday.toISOString());
      } else if (cancelledDateFilter === 'week') {
        const { start, end } = getCurrentWeekRange();
        query = query.gte('cancelled_at', start.toISOString()).lte('cancelled_at', end.toISOString());
      } else if (cancelledDateFilter === 'month') {
        const { start, end } = getCurrentMonthRange();
        query = query.gte('cancelled_at', start.toISOString()).lte('cancelled_at', end.toISOString());
      } else if (cancelledDateFilter === 'lastMonth') {
        const { start, end } = getLastMonthRange();
        query = query.gte('cancelled_at', start.toISOString()).lte('cancelled_at', end.toISOString());
      }

      const { data: logs, error } = await query;
      if (error) throw error;

      if (!logs || logs.length === 0) {
        setCancelledOrders([]);
        return;
      }

      // Fetch order details
      const orderIds = [...new Set(logs.map(l => l.order_id).filter(Boolean))];
      const cancelledByIds = [...new Set(logs.map(l => l.cancelled_by).filter(Boolean))];

      const [ordersRes, profilesRes] = await Promise.all([
        orderIds.length > 0
          ? supabase.from('orders').select('id, retailer_id, total_amount, order_date, user_id').in('id', orderIds)
          : { data: [] },
        cancelledByIds.length > 0
          ? supabase.from('profiles').select('id, full_name, username').in('id', cancelledByIds)
          : { data: [] },
      ]);

      const ordersMap = new Map((ordersRes.data || []).map((o: any) => [o.id, o]));
      const profilesMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));

      // Get retailer names
      const retailerIds = [...new Set((ordersRes.data || []).map((o: any) => o.retailer_id).filter(Boolean))];
      let retailerMap = new Map<string, string>();
      if (retailerIds.length > 0) {
        const { data: retailers } = await supabase.from('retailers').select('id, name').in('id', retailerIds);
        retailerMap = new Map((retailers || []).map((r: any) => [r.id, r.name]));
      }

      const formatted = logs.map(log => {
        const order = ordersMap.get(log.order_id) as any;
        const cancelledByProfile = profilesMap.get(log.cancelled_by) as any;
        const summary = (log.reversal_summary || {}) as any;
        return {
          id: log.id,
          order_id: log.order_id,
          retailer_name: order ? (retailerMap.get(order.retailer_id) || 'Unknown') : 'Unknown',
          cancelled_by_name: cancelledByProfile?.full_name || cancelledByProfile?.username || 'Unknown',
          reason: log.reason || '-',
          cancelled_at: log.cancelled_at,
          total_amount: order?.total_amount || 0,
          order_date: order?.order_date || '-',
          credit_reversed: Number(summary.credit_reversed) || 0,
          points_removed: Number(summary.gamification_points_reversed) || 0,
          invoice_cancelled: summary.invoice_cancelled === true,
          visit_reverted: summary.visit_reverted === true,
          loyalty_points_removed: Number(summary.loyalty_points_reversed) || 0,
        };
      });

      // Apply user filter
      if (userFilter.length > 0) {
        const filteredOrderIds = (ordersRes.data || []).filter((o: any) => userFilter.includes(o.user_id)).map((o: any) => o.id);
        setCancelledOrders(formatted.filter(f => filteredOrderIds.includes(f.order_id)));
      } else {
        setCancelledOrders(formatted);
      }
    } catch (error) {
      console.error('Error fetching cancelled orders:', error);
      if (!silent) toast.error('Failed to fetch cancelled orders');
    } finally {
      if (!silent) setLoadingCancelled(false);
    }
  }, [userFilter, cancelledDateFilter]);


  const filterData = (data: any[], searchFields: string[]) => {
    if (!searchTerm) return data;
    return data.filter(item =>
      searchFields.some(field =>
        item[field]?.toString().toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  };

  // Export to CSV
  const exportToCSV = async (data: any[], filename: string) => {
    if (data.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = Object.keys(data[0]).join(',');
    const csvContent = [
      headers,
      ...data.map(row => Object.values(row).map(val => `"${val}"`).join(','))
    ].join('\n');

    await downloadCSV(csvContent, `${filename}-${format(new Date(), 'yyyy-MM-dd')}`);
  };

  // Initial users fetch (once)
  useEffect(() => { fetchUsers(); }, []);

  // Per-dataset effects: only re-fetch when own filters change
  useEffect(() => { fetchOrderData(false); }, [fetchOrderData]);
  useEffect(() => { fetchCheckInData(false); }, [fetchCheckInData]);
  useEffect(() => { fetchStockData(false); }, [fetchStockData]);
  useEffect(() => { fetchCompetitorData(false); }, [fetchCompetitorData]);
  useEffect(() => { fetchReturnStockData(false); }, [fetchReturnStockData]);
  useEffect(() => { fetchCancelledOrders(false); }, [fetchCancelledOrders]);

  // Refs to latest fetch fns so realtime / interval don't resubscribe
  const fetchOrderDataRef = useRef(fetchOrderData);
  const fetchCheckInDataRef = useRef(fetchCheckInData);
  const fetchStockDataRef = useRef(fetchStockData);
  const fetchCompetitorDataRef = useRef(fetchCompetitorData);
  const fetchReturnStockDataRef = useRef(fetchReturnStockData);
  const fetchCancelledOrdersRef = useRef(fetchCancelledOrders);
  useEffect(() => { fetchOrderDataRef.current = fetchOrderData; }, [fetchOrderData]);
  useEffect(() => { fetchCheckInDataRef.current = fetchCheckInData; }, [fetchCheckInData]);
  useEffect(() => { fetchStockDataRef.current = fetchStockData; }, [fetchStockData]);
  useEffect(() => { fetchCompetitorDataRef.current = fetchCompetitorData; }, [fetchCompetitorData]);
  useEffect(() => { fetchReturnStockDataRef.current = fetchReturnStockData; }, [fetchReturnStockData]);
  useEffect(() => { fetchCancelledOrdersRef.current = fetchCancelledOrders; }, [fetchCancelledOrders]);

  // Silent 60s background refresh of the active tab only
  const refreshActiveTab = useCallback(() => {
    if (activeTab === 'checkins') fetchCheckInDataRef.current(true);
    if (activeTab === 'orders') fetchOrderDataRef.current(true);
    if (activeTab === 'stock') fetchStockDataRef.current(true);
    if (activeTab === 'competitor') fetchCompetitorDataRef.current(true);
    if (activeTab === 'returnstock') fetchReturnStockDataRef.current(true);
    if (activeTab === 'cancelled') fetchCancelledOrdersRef.current(true);
  }, [activeTab]);

  useManagedInterval(
    `operations-refresh-${activeTab}`,
    refreshActiveTab,
    60000,
    { enabled: autoRefresh, runWhenHidden: false }
  );

  // Real-time subscriptions — subscribe ONCE per autoRefresh toggle.
  // Callbacks read from refs so filter changes don't tear down channels.
  useEffect(() => {
    if (!autoRefresh) return;

    const silentRefetchOrders = debounce(() => fetchOrderDataRef.current(true), 800);
    const silentRefetchCheckins = debounce(() => fetchCheckInDataRef.current(true), 800);
    const silentRefetchStock = debounce(() => fetchStockDataRef.current(true), 800);
    const silentRefetchReturns = debounce(() => fetchReturnStockDataRef.current(true), 800);

    const ordersChannel = supabase
      .channel('operations-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, silentRefetchOrders)
      .subscribe();
    const visitsChannel = supabase
      .channel('operations-visits')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, silentRefetchCheckins)
      .subscribe();
    const stockChannel = supabase
      .channel('operations-stock')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock' }, silentRefetchStock)
      .subscribe();
    const returnChannel = supabase
      .channel('operations-returns')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'van_return_grn' }, silentRefetchReturns)
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(visitsChannel);
      supabase.removeChannel(stockChannel);
      supabase.removeChannel(returnChannel);
    };
  }, [autoRefresh]);

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  if (!hasAdminAccess) {
    navigate('/dashboard');
    return null;
  }

  const filteredCheckInData = useMemo(
    () => filterData(checkInData, ['user_name', 'retailer_name']),
    [checkInData, searchTerm]
  );
  const filteredOrderData = useMemo(
    () => filterData(orderData, ['user_name', 'retailer_name']),
    [orderData, searchTerm]
  );
  const filteredStockData = useMemo(
    () => filterData(stockData, ['user_name', 'retailer_name', 'product_name']),
    [stockData, searchTerm]
  );
  const filteredCompetitorData = useMemo(
    () => filterData(competitorData, ['user_name', 'retailer_name', 'competitor_name']),
    [competitorData, searchTerm]
  );
  const filteredReturnStockData = useMemo(
    () => filterData(returnStockData, ['user_name', 'retailer_name', 'van_name']),
    [returnStockData, searchTerm]
  );
  const filteredCancelledOrders = useMemo(
    () => filterData(cancelledOrders, ['retailer_name', 'cancelled_by_name', 'reason']),
    [cancelledOrders, searchTerm]
  );

  return (
    <Layout>
    <div className="min-h-screen bg-gradient-subtle p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Operations Dashboard</h1>
              <p className="text-muted-foreground">Monitor real-time operations and data</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Auto-refresh</span>
              <Switch 
                checked={autoRefresh} 
                onCheckedChange={setAutoRefresh}
              />
            </div>
          </div>
        </div>

        {/* Operations Summary Boxes */}
        <OperationsSummaryBoxes 
          dateFilter={summaryDateFilter}
          onDateFilterChange={setSummaryDateFilter}
        />

        {/* Main Content */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Operations Monitor</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (activeTab === 'checkins') fetchCheckInData();
                  if (activeTab === 'orders') fetchOrderData();
                  if (activeTab === 'stock') fetchStockData();
                  if (activeTab === 'competitor') fetchCompetitorData();
                  if (activeTab === 'returnstock') fetchReturnStockData();
                  if (activeTab === 'cancelled') fetchCancelledOrders();
                }}
              >
                <RefreshCw size={16} className="mr-2" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-7">
                <TabsTrigger value="checkins">Check-in/Out</TabsTrigger>
                <TabsTrigger value="orders">Orders</TabsTrigger>
                <TabsTrigger value="stock">Stock</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
                <TabsTrigger value="competitor">Competitor</TabsTrigger>
                <TabsTrigger value="returnstock">Return Stock</TabsTrigger>
                <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
              </TabsList>

              {/* Filters */}
              <div className="flex flex-wrap gap-4 mt-4 mb-6">
                <div className="flex items-center gap-2">
                  <Search size={16} />
                  <Input
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-64"
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-56 justify-between font-normal">
                      <span className="truncate">
                        {userFilter.length === 0
                          ? 'All Users'
                          : userFilter.length === 1
                            ? (users.find(u => u.id === userFilter[0])?.full_name
                                || users.find(u => u.id === userFilter[0])?.username
                                || '1 user selected')
                            : `${userFilter.length} users selected`}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50 ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="start">
                    <div className="flex items-center justify-between px-3 py-2 border-b">
                      <span className="text-xs font-medium text-muted-foreground">
                        {userFilter.length} selected
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => setUserFilter(users.map(u => u.id))}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:underline"
                          onClick={() => setUserFilter([])}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="px-2 pt-2 pb-1 border-b">
                      <Input
                        autoFocus
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Search user…"
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="max-h-64 overflow-y-auto py-1">
                      {users
                        .filter(u => {
                          const q = userSearch.trim().toLowerCase();
                          if (!q) return true;
                          return (
                            (u.full_name || '').toLowerCase().includes(q) ||
                            (u.username || '').toLowerCase().includes(q)
                          );
                        })
                        .map(user => {
                        const checked = userFilter.includes(user.id);
                        return (
                          <label
                            key={user.id}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50 cursor-pointer"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => {
                                setUserFilter(prev =>
                                  v ? [...prev, user.id] : prev.filter(id => id !== user.id)
                                );
                              }}
                            />
                            <span className="truncate">{user.full_name || user.username}</span>
                          </label>
                        );
                      })}
                      {users.length === 0 && (
                        <div className="px-3 py-4 text-xs text-muted-foreground text-center">No users</div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                
                {/* Date Filter for Check-ins */}
                {activeTab === 'checkins' && (
                  <>
                    <Select value={checkinDateFilter} onValueChange={(val) => {
                      setCheckinDateFilter(val);
                      if (val !== 'custom') {
                        setCheckinCustomRange({ from: null, to: null });
                      }
                    }}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Date Range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="week">This Week</SelectItem>
                        <SelectItem value="month">This Month</SelectItem>
                      <SelectItem value="lastMonth">Last Month</SelectItem>
                        <SelectItem value="custom">Custom Range</SelectItem>
                      </SelectContent>
                    </Select>
                    {checkinDateFilter === 'custom' && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          value={checkinCustomRange.from ? checkinCustomRange.from.toISOString().split('T')[0] : ''}
                          onChange={(e) => setCheckinCustomRange(prev => ({ ...prev, from: e.target.value ? new Date(e.target.value) : null }))}
                          className="w-40"
                        />
                        <span className="text-muted-foreground">to</span>
                        <Input
                          type="date"
                          value={checkinCustomRange.to ? checkinCustomRange.to.toISOString().split('T')[0] : ''}
                          onChange={(e) => setCheckinCustomRange(prev => ({ ...prev, to: e.target.value ? new Date(e.target.value) : null }))}
                          className="w-40"
                        />
                      </div>
                    )}
                  </>
                )}

                {/* Date Filter for Orders */}
                {activeTab === 'orders' && (
                  <>
                    <Select value={orderDateFilter} onValueChange={(val) => {
                      setOrderDateFilter(val);
                      if (val !== 'custom') {
                        setOrderCustomRange({ from: null, to: null });
                      }
                    }}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Date Range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="week">This Week</SelectItem>
                        <SelectItem value="month">This Month</SelectItem>
                      <SelectItem value="lastMonth">Last Month</SelectItem>
                        <SelectItem value="custom">Custom Range</SelectItem>
                      </SelectContent>
                    </Select>
                    {orderDateFilter === 'custom' && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          value={orderCustomRange.from ? orderCustomRange.from.toISOString().split('T')[0] : ''}
                          onChange={(e) => setOrderCustomRange(prev => ({ ...prev, from: e.target.value ? new Date(e.target.value) : null }))}
                          className="w-40"
                        />
                        <span className="text-muted-foreground">to</span>
                        <Input
                          type="date"
                          value={orderCustomRange.to ? orderCustomRange.to.toISOString().split('T')[0] : ''}
                          onChange={(e) => setOrderCustomRange(prev => ({ ...prev, to: e.target.value ? new Date(e.target.value) : null }))}
                          className="w-40"
                        />
                      </div>
                    )}
                  </>
                )}

                {/* Date Filter for Stock */}
                {activeTab === 'stock' && (
                  <>
                    <Select value={stockDateFilter} onValueChange={(val) => {
                      setStockDateFilter(val);
                      if (val !== 'custom') {
                        setStockCustomRange({ from: null, to: null });
                      }
                    }}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Date Range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="week">This Week</SelectItem>
                        <SelectItem value="month">This Month</SelectItem>
                      <SelectItem value="lastMonth">Last Month</SelectItem>
                        <SelectItem value="custom">Custom Range</SelectItem>
                      </SelectContent>
                    </Select>
                    {stockDateFilter === 'custom' && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          value={stockCustomRange.from ? stockCustomRange.from.toISOString().split('T')[0] : ''}
                          onChange={(e) => setStockCustomRange(prev => ({ ...prev, from: e.target.value ? new Date(e.target.value) : null }))}
                          className="w-40"
                        />
                        <span className="text-muted-foreground">to</span>
                        <Input
                          type="date"
                          value={stockCustomRange.to ? stockCustomRange.to.toISOString().split('T')[0] : ''}
                          onChange={(e) => setStockCustomRange(prev => ({ ...prev, to: e.target.value ? new Date(e.target.value) : null }))}
                          className="w-40"
                        />
                      </div>
                    )}
                  </>
                )}
                
                <Button
                  variant="outline"
                  onClick={() => {
                    if (activeTab === 'checkins') exportToCSV(filteredCheckInData, 'checkin-data');
                    if (activeTab === 'orders') exportToCSV(filteredOrderData, 'order-data');
                    if (activeTab === 'stock') exportToCSV(filteredStockData, 'stock-data');
                  }}
                >
                  <Download size={16} className="mr-2" />
                  Export CSV
                </Button>
              </div>

              {/* Check-in/Check-out Tab */}
              <TabsContent value="checkins">
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User Name</TableHead>
                        <TableHead>Retailer Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Total Time Spent</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Location Match</TableHead>
                        <TableHead>Return</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingCheckins && filteredCheckInData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                          </TableCell>
                        </TableRow>
                      ) : filteredCheckInData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            No check-in data found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredCheckInData.map((item) => {
                          // Format time spent
                          const formatTimeSpent = (seconds: number | null | undefined) => {
                            if (!seconds) return '-';
                            const hours = Math.floor(seconds / 3600);
                            const minutes = Math.floor((seconds % 3600) / 60);
                            if (hours > 0) {
                              return `${hours}h ${minutes}m`;
                            }
                            return `${minutes}m`;
                          };

                          // Get location match display
                          const getLocationMatchDisplay = (status: string | null | undefined) => {
                            if (!status) return { text: 'N/A', color: 'bg-gray-50 text-gray-700 border-gray-200' };
                            switch (status) {
                              case 'at_store':
                                return { text: 'At Store', color: 'bg-green-50 text-green-700 border-green-200' };
                              case 'within_range':
                                return { text: '<50m', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
                              case 'out_of_range':
                                return { text: 'Not at Store', color: 'bg-red-50 text-red-700 border-red-200' };
                              default:
                                return { text: status, color: 'bg-gray-50 text-gray-700 border-gray-200' };
                            }
                          };

                          const locationDisplay = getLocationMatchDisplay(item.location_status);

                          return (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.user_name}</TableCell>
                              <TableCell>{item.retailer_name}</TableCell>
                              <TableCell>
                                {item.skip_check_in_time ? (
                                  <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-200">
                                    {item.skip_check_in_reason === 'phone-order' ? 'Phone Order' : 'Other'}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                    Normal
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Clock size={14} className="text-muted-foreground" />
                                  <span className="font-medium">{formatTimeSpent(item.time_spent_seconds)}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {item.status === 'unproductive' ? (
                                  <Badge variant="destructive" className="bg-red-50 text-red-700 border-red-200">
                                    Unproductive
                                  </Badge>
                                ) : item.status === 'productive' ? (
                                  <Badge variant="default" className="bg-green-50 text-green-700 border-green-200">
                                    Productive
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">
                                    {item.status || 'Pending'}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={locationDisplay.color}>
                                  <MapPin size={12} className="mr-1" />
                                  {locationDisplay.text}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {item.return_data && item.return_data.length > 0 ? (
                                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                                    {item.return_data.length} item(s)
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground text-sm">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                      <Eye size={16} />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                                    <DialogHeader>
                                      <DialogTitle>Visit Details</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                      <div className="grid grid-cols-2 gap-4">
                                        <div>
                                          <label className="text-sm font-medium">User</label>
                                          <p className="text-sm text-muted-foreground">{item.user_name}</p>
                                        </div>
                                        <div>
                                          <label className="text-sm font-medium">Retailer</label>
                                          <p className="text-sm text-muted-foreground">{item.retailer_name}</p>
                                        </div>
                                        <div>
                                          <label className="text-sm font-medium">Visit Type</label>
                                          <p className="text-sm">
                                            {item.skip_check_in_time ? (
                                              <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-200">
                                                {item.skip_check_in_reason === 'phone-order' ? 'Phone Order' : 'Other Reason'}
                                              </Badge>
                                            ) : (
                                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                                Normal Visit
                                              </Badge>
                                            )}
                                          </p>
                                        </div>
                                        <div>
                                          <label className="text-sm font-medium">Status</label>
                                          <p className="text-sm">
                                            {item.status === 'unproductive' ? (
                                              <Badge variant="destructive" className="bg-red-50 text-red-700 border-red-200">
                                                Unproductive
                                              </Badge>
                                            ) : item.status === 'productive' ? (
                                              <Badge variant="default" className="bg-green-50 text-green-700 border-green-200">
                                                Productive
                                              </Badge>
                                            ) : (
                                              <Badge variant="secondary">{item.status || 'Pending'}</Badge>
                                            )}
                                          </p>
                                        </div>
                                      </div>

                                      {/* Time Details Section */}
                                      <div className="p-4 rounded-lg bg-muted/50 border">
                                        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                                          <Clock size={16} />
                                          Time Details
                                        </h4>
                                        <div className="grid grid-cols-3 gap-4">
                                          <div>
                                            <label className="text-xs text-muted-foreground">Check-in Time</label>
                                            <p className="text-sm font-medium">
                                              {item.check_in_time ? format(new Date(item.check_in_time), 'MMM dd, HH:mm') : 
                                               item.skip_check_in_time ? format(new Date(item.skip_check_in_time), 'MMM dd, HH:mm') : '-'}
                                            </p>
                                          </div>
                                          <div>
                                            <label className="text-xs text-muted-foreground">Check-out Time</label>
                                            <p className="text-sm font-medium">
                                              {item.check_out_time ? format(new Date(item.check_out_time), 'MMM dd, HH:mm') : 'In Progress'}
                                            </p>
                                          </div>
                                          <div>
                                            <label className="text-xs text-muted-foreground">Total Time Spent</label>
                                            <p className="text-sm font-medium text-primary">
                                              {formatTimeSpent(item.time_spent_seconds)}
                                            </p>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Location Details Section */}
                                      <div className="p-4 rounded-lg bg-muted/50 border">
                                        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                                          <MapPin size={16} />
                                          Location Details
                                        </h4>
                                        <div className="grid grid-cols-2 gap-4">
                                          <div>
                                            <label className="text-xs text-muted-foreground">Location Match</label>
                                            <p className="text-sm">
                                              <Badge variant="outline" className={locationDisplay.color}>
                                                {locationDisplay.text}
                                              </Badge>
                                            </p>
                                          </div>
                                          {item.check_in_address && (
                                            <div>
                                              <label className="text-xs text-muted-foreground">Check-in Address</label>
                                              <p className="text-sm text-muted-foreground">{item.check_in_address}</p>
                                            </div>
                                          )}
                                          {item.check_out_address && (
                                            <div>
                                              <label className="text-xs text-muted-foreground">Check-out Address</label>
                                              <p className="text-sm text-muted-foreground">{item.check_out_address}</p>
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* Return Data Section */}
                                      {item.return_data && item.return_data.length > 0 && (
                                        <div className="p-4 rounded-lg bg-orange-50 border border-orange-200">
                                          <h4 className="text-sm font-medium mb-3 flex items-center gap-2 text-orange-700">
                                            <Package size={16} />
                                            Return Stock
                                          </h4>
                                          <div className="space-y-2">
                                            {item.return_data.map((returnItem, idx) => (
                                              <div key={idx} className="flex justify-between items-center text-sm">
                                                <span>{returnItem.product_name}</span>
                                                <span className="font-medium">{returnItem.quantity} units</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Reasons Section */}
                                      {(item.skip_check_in_reason || item.no_order_reason) && (
                                        <div className="p-4 rounded-lg bg-muted/50 border">
                                          <h4 className="text-sm font-medium mb-3">Reasons</h4>
                                          {item.skip_check_in_reason && (
                                            <div className="mb-2">
                                              <label className="text-xs text-muted-foreground">Skip Check-in Reason</label>
                                              <p className="text-sm">
                                                {item.skip_check_in_reason === 'phone-order' ? 'Phone Order' : 
                                                 item.skip_check_in_reason.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                              </p>
                                            </div>
                                          )}
                                          {item.no_order_reason && (
                                            <div>
                                              <label className="text-xs text-muted-foreground">No Order Reason</label>
                                              <p className="text-sm">
                                                {item.no_order_reason.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                              </p>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* Face Verification Section */}
                                      {item.face_match_confidence !== null && item.face_match_confidence !== undefined && (
                                        <div className={`p-4 rounded-lg border ${
                                          item.face_match_confidence >= 70 ? 'bg-green-50 border-green-200' :
                                          item.face_match_confidence >= 40 ? 'bg-amber-50 border-amber-200' :
                                          'bg-red-50 border-red-200'
                                        }`}>
                                          <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                              <span className="text-2xl">
                                                {item.face_match_confidence >= 70 ? '✅' : 
                                                 item.face_match_confidence >= 40 ? '⚠️' : '❌'}
                                              </span>
                                              <div>
                                                <p className="font-medium">Face Verification</p>
                                                <p className="text-sm text-muted-foreground">
                                                  Confidence: {item.face_match_confidence.toFixed(1)}%
                                                </p>
                                              </div>
                                            </div>
                                            <Badge 
                                              variant={item.face_match_confidence >= 70 ? 'default' : item.face_match_confidence >= 40 ? 'secondary' : 'destructive'}
                                              className={item.face_match_confidence >= 70 ? 'bg-green-500' : item.face_match_confidence >= 40 ? 'bg-amber-500' : ''}
                                            >
                                              {Math.round(item.face_match_confidence)}%
                                            </Badge>
                                          </div>
                                          {(item.profile_picture_url || item.attendance_photo_url) && (
                                            <div className="grid grid-cols-2 gap-4 mt-3">
                                              {item.profile_picture_url && (
                                                <div className="space-y-2">
                                                  <p className="text-xs text-muted-foreground">Profile Photo</p>
                                                  <SignedImage src={item.profile_picture_url} alt="Profile" className="w-full h-32 object-cover rounded-lg border" />
                                                </div>
                                              )}
                                              {item.attendance_photo_url && (
                                                <div className="space-y-2">
                                                  <p className="text-xs text-muted-foreground">Check-in Photo</p>
                                                  <SignedImage src={item.attendance_photo_url} alt="Attendance" className="w-full h-32 object-cover rounded-lg border" />
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* Visit Photos */}
                                      {(item.check_in_photo_url || item.check_out_photo_url) && (
                                        <div className="space-y-3 pt-4 border-t">
                                          <label className="text-sm font-medium">Visit Photos</label>
                                          <div className="grid grid-cols-2 gap-4">
                                            {item.check_in_photo_url && (
                                              <div className="space-y-2">
                                                <p className="text-xs text-muted-foreground">Check-in Photo</p>
                                                <img src={item.check_in_photo_url} alt="Check-in" className="w-full h-48 object-cover rounded-lg border" />
                                              </div>
                                            )}
                                            {item.check_out_photo_url && (
                                              <div className="space-y-2">
                                                <p className="text-xs text-muted-foreground">Check-out Photo</p>
                                                <img src={item.check_out_photo_url} alt="Check-out" className="w-full h-48 object-cover rounded-lg border" />
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* Orders Tab */}
              <TabsContent value="orders">
                {/* Orders Tab Header */}
                {(() => {
                   const totalValue = filteredOrderData.reduce((s, o) => s + Number(o.total_amount || 0), 0);
                   const isFullyPaid = (o: OrderData) => {
                     const paid = Number(o.credit_paid_amount || 0);
                     const total = Number(o.total_amount || 0);
                     if (o.is_credit_order) return Number(o.credit_pending_amount || 0) <= 0 && paid >= total;
                     return total > 0 && paid >= total;
                   };
                   const paidCount = filteredOrderData.filter(isFullyPaid).length;
                   const creditCount = filteredOrderData.filter(o => o.is_credit_order && Number(o.credit_pending_amount || 0) > 0).length;
                   const pendingAmt = filteredOrderData.reduce((s, o) => s + Number(o.credit_pending_amount || 0), 0);
                  return (
                    <div className="mb-4 rounded-xl border bg-gradient-to-br from-primary/5 via-background to-accent/5 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Package size={20} className="text-primary" />
                          </div>
                          <div>
                            <h2 className="text-xl font-semibold tracking-tight">Order Management</h2>
                            <p className="text-sm text-muted-foreground">
                              Track confirmed orders, payment status, and download invoices in one place.
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full sm:w-auto">
                          <div className="rounded-lg border bg-card px-3 py-2">
                            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Orders</div>
                            <div className="text-lg font-semibold">{filteredOrderData.length}</div>
                          </div>
                          <div className="rounded-lg border bg-card px-3 py-2">
                            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Value</div>
                            <div className="text-lg font-semibold">₹{totalValue.toLocaleString('en-IN')}</div>
                          </div>
                          <div className="rounded-lg border bg-card px-3 py-2">
                            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Paid</div>
                            <div className="text-lg font-semibold text-emerald-600">{paidCount}</div>
                          </div>
                          <div className="rounded-lg border bg-card px-3 py-2">
                            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Credit Pending</div>
                            <div className="text-lg font-semibold text-amber-600">
                              {creditCount} <span className="text-xs font-normal text-muted-foreground">(₹{pendingAmt.toLocaleString('en-IN')})</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="rounded-xl border bg-card overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow className="hover:bg-transparent">
                        <TableHead>User Name</TableHead>
                        <TableHead>Retailer Name</TableHead>
                        <TableHead>Mobile</TableHead>
                        <TableHead>Order Date & Time</TableHead>
                        <TableHead className="text-right">Order Value</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead className="text-center">Invoice</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingOrders && filteredOrderData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                          </TableCell>
                        </TableRow>
                      ) : filteredOrderData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            No order data found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredOrderData.map((item) => (
                          <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="font-medium">{item.user_name}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {item.retailer_name}
                                {item.is_edited && (
                                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-xs">
                                    Edited
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {item.retailer_phone ? (
                                <a href={`tel:${item.retailer_phone}`} className="text-sm inline-flex items-center gap-1 text-primary hover:underline">
                                  <Phone size={12} /> {item.retailer_phone}
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                {format(new Date(item.created_at), 'MMM dd, HH:mm')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="font-semibold">₹{item.total_amount.toLocaleString('en-IN')}</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-0.5 text-xs">
                                <span className="font-medium capitalize">
                                  {getPaymentTypeLabel(item)}
                                </span>
                                {item.payment_method && (
                                  <span className="text-muted-foreground capitalize">
                                    Mode: {item.payment_method.replace(/_/g, ' ')}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{item.items.length} items</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="inline-flex items-center gap-0.5 rounded-md border bg-muted/30 p-0.5">
                                <InvoicePreviewDialog
                                  orderId={item.id}
                                  invoiceNumber={item.invoice_number}
                                  triggerLabel="View Invoice"
                                  iconOnly
                                />
                                <DownloadInvoiceButton
                                  orderId={item.id}
                                  invoiceNumber={item.invoice_number}
                                />
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex items-center gap-0.5 rounded-md border bg-muted/30 p-0.5">
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" title="View">
                                      <Eye size={16} />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                                    <DialogHeader>
                                      <DialogTitle className="flex items-center gap-2">
                                        Order Details
                                        {item.is_edited && (
                                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                                            Edited
                                          </Badge>
                                        )}
                                      </DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-5">
                                      {/* Customer & order meta */}
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer</div>
                                          <div>
                                            <div className="text-xs text-muted-foreground">User</div>
                                            <div className="text-sm font-medium">{item.user_name}</div>
                                          </div>
                                          <div>
                                            <div className="text-xs text-muted-foreground">Retailer</div>
                                            <div className="text-sm font-medium">{item.retailer_name}</div>
                                          </div>
                                          <div>
                                            <div className="text-xs text-muted-foreground">Mobile</div>
                                            <div className="text-sm font-medium">
                                              {item.retailer_phone ? (
                                                <a href={`tel:${item.retailer_phone}`} className="text-primary inline-flex items-center gap-1 hover:underline">
                                                  <Phone size={12} /> {item.retailer_phone}
                                                </a>
                                              ) : '—'}
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-xs text-muted-foreground">Order Date & Time</div>
                                            <div className="text-sm font-medium">{format(new Date(item.created_at), 'PPpp')}</div>
                                          </div>
                                        </div>
                                        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment</div>
                                          <div className="grid grid-cols-2 gap-2">
                                            <div>
                                              <div className="text-xs text-muted-foreground">Payment Type</div>
                                              <div className="text-sm font-medium capitalize">{getPaymentTypeLabel(item)}</div>
                                            </div>
                                            <div>
                                              <div className="text-xs text-muted-foreground">Payment Mode</div>
                                              <div className="text-sm font-medium capitalize">{item.payment_method ? item.payment_method.replace(/_/g, ' ') : '—'}</div>
                                            </div>
                                            <div>
                                              <div className="text-xs text-muted-foreground">Paid</div>
                                              <div className="text-sm font-medium text-emerald-600">₹{Number(item.credit_paid_amount || 0).toLocaleString('en-IN')}</div>
                                            </div>
                                            <div>
                                              <div className="text-xs text-muted-foreground">Pending</div>
                                              <div className={cn("text-sm font-medium", Number(item.credit_pending_amount || 0) > 0 ? "text-destructive" : "text-muted-foreground")}>
                                                ₹{Number(item.credit_pending_amount || 0).toLocaleString('en-IN')}
                                              </div>
                                            </div>
                                            <div className="col-span-2 pt-1 border-t">
                                              <div className="text-xs text-muted-foreground">Total Amount</div>
                                              <div className="text-base font-semibold">₹{Number(item.total_amount).toLocaleString('en-IN')}</div>
                                            </div>
                                          </div>
                                        </div>
                                        {item.is_edited && (
                                          <div className="md:col-span-2 text-xs text-muted-foreground">
                                            Last modified: {format(new Date(item.updated_at), 'PPpp')}
                                          </div>
                                        )}
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">Order Items (with GST breakdown)</label>
                                        <div className="mt-2 border rounded-md">
                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead>Product</TableHead>
                                                <TableHead className="text-right">Qty</TableHead>
                                                <TableHead className="text-right">Unit Price</TableHead>
                                                <TableHead className="text-right">Taxable (excl. GST)</TableHead>
                                                <TableHead className="text-right">SGST</TableHead>
                                                <TableHead className="text-right">CGST</TableHead>
                                                <TableHead className="text-right">Total (incl. GST)</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {item.items.map((orderItem: any, index: number) => {
                                                const qty = Number(orderItem.quantity || 0);
                                                const rate = Number(orderItem.rate || 0);
                                                const sgst = Number(orderItem.sgst_amount || 0);
                                                const cgst = Number(orderItem.cgst_amount || 0);
                                                const total = Number(orderItem.total || 0);
                                                const taxable = Math.max(0, total - sgst - cgst);
                                                return (
                                                  <TableRow key={index}>
                                                    <TableCell>{orderItem.product_name}</TableCell>
                                                    <TableCell className="text-right">{formatItemQty(qty, orderItem.unit)}</TableCell>
                                                    <TableCell className="text-right">
                                                      ₹{rate.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                      {orderItem.unit && (
                                                        <span className="text-xs text-muted-foreground"> /{String(orderItem.unit).toLowerCase()}</span>
                                                      )}
                                                    </TableCell>
                                                    <TableCell className="text-right">₹{taxable.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                                                    <TableCell className="text-right">₹{sgst.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                                                    <TableCell className="text-right">₹{cgst.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                                                    <TableCell className="text-right font-medium">₹{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                                                  </TableRow>
                                                );
                                              })}
                                            </TableBody>
                                          </Table>
                                        </div>
                                        {(() => {
                                          const totals = item.items.reduce((acc: any, it: any) => {
                                            const sgst = Number(it.sgst_amount || 0);
                                            const cgst = Number(it.cgst_amount || 0);
                                            const total = Number(it.total || 0);
                                            acc.sgst += sgst;
                                            acc.cgst += cgst;
                                            acc.taxable += Math.max(0, total - sgst - cgst);
                                            acc.total += total;
                                            return acc;
                                          }, { sgst: 0, cgst: 0, taxable: 0, total: 0 });
                                          return (
                                            <div className="mt-3 flex justify-end">
                                              <div className="text-sm space-y-1 min-w-[260px]">
                                                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal (excl. GST)</span><span>₹{totals.taxable.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
                                                <div className="flex justify-between"><span className="text-muted-foreground">SGST</span><span>₹{totals.sgst.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
                                                <div className="flex justify-between"><span className="text-muted-foreground">CGST</span><span>₹{totals.cgst.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
                                                {item.discount_amount > 0 && (
                                                  <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>- ₹{Number(item.discount_amount).toLocaleString()}</span></div>
                                                )}
                                                <div className="flex justify-between font-semibold border-t pt-1"><span>Grand Total</span><span>₹{Number(item.total_amount).toLocaleString()}</span></div>
                                              </div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                      <div className="flex justify-end gap-1">
                                        <InvoicePreviewDialog
                                          orderId={item.id}
                                          invoiceNumber={item.invoice_number}
                                          triggerLabel="View Invoice"
                                        />
                                        <DownloadInvoiceButton
                                          orderId={item.id}
                                          invoiceNumber={item.invoice_number}
                                        />
                                      </div>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Edit Order"
                                  onClick={() => {
                                    setSelectedOrderForEdit({ id: item.id, retailer_name: item.retailer_name });
                                    setEditOrderDialogOpen(true);
                                  }}
                                >
                                  <Pencil size={16} />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  title="Cancel Order"
                                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => {
                                    setSelectedOrderForCancel({
                                      order: {
                                        id: item.id,
                                        invoice_number: item.invoice_number || undefined,
                                        total_amount: item.total_amount,
                                        is_credit_order: item.is_credit_order,
                                        credit_pending_amount: item.credit_pending_amount,
                                      },
                                      retailerName: item.retailer_name,
                                    });
                                    setShowCancelDialog(true);
                                  }}
                                >
                                  <Ban size={16} />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* Stock Tab */}
              <TabsContent value="stock">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User Name</TableHead>
                        <TableHead>Retailer Name</TableHead>
                        <TableHead>Update Date & Time</TableHead>
                        <TableHead>Product Name</TableHead>
                        <TableHead>Stock Quantity</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingStock && filteredStockData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                          </TableCell>
                        </TableRow>
                      ) : filteredStockData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No stock data found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredStockData.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.user_name}</TableCell>
                            <TableCell>{item.retailer_name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                                {format(new Date(item.created_at), 'MMM dd, HH:mm')}
                              </Badge>
                            </TableCell>
                            <TableCell>{item.product_name}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{item.stock_quantity} units</Badge>
                            </TableCell>
                            <TableCell>
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <Eye size={16} />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Stock Update Details</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <label className="text-sm font-medium">User</label>
                                        <p className="text-sm text-muted-foreground">{item.user_name}</p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">Retailer</label>
                                        <p className="text-sm text-muted-foreground">{item.retailer_name}</p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">Update Date & Time</label>
                                        <p className="text-sm text-muted-foreground">
                                          {format(new Date(item.created_at), 'PPpp')}
                                        </p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">Product Name</label>
                                        <p className="text-sm text-muted-foreground">{item.product_name}</p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">Stock Quantity</label>
                                        <p className="text-sm font-medium">{item.stock_quantity} units</p>
                                      </div>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* Payment Proofs Tab */}
              <TabsContent value="payments">
                <PaymentProofsView />
              </TabsContent>

              {/* Competitor Tab */}
              <TabsContent value="competitor">
                <div className="flex gap-4 mb-4">
                  <Select value={competitorDateFilter} onValueChange={setCompetitorDateFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Date Range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">This Week</SelectItem>
                      <SelectItem value="month">This Month</SelectItem>
                      <SelectItem value="lastMonth">Last Month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Retailer</TableHead>
                        <TableHead>Competitor</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Stock</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingCompetitor && filteredCompetitorData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                          </TableCell>
                        </TableRow>
                      ) : filteredCompetitorData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            No competitor data found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredCompetitorData.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.user_name}</TableCell>
                            <TableCell>{item.retailer_name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-orange-50 text-orange-700">
                                {item.competitor_name}
                              </Badge>
                            </TableCell>
                            <TableCell>{item.sku_name}</TableCell>
                            <TableCell>₹{item.selling_price?.toLocaleString() || '-'}</TableCell>
                            <TableCell>{item.stock_quantity || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {format(new Date(item.created_at), 'MMM dd, HH:mm')}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* Return Stock Tab */}
              <TabsContent value="returnstock">
                <div className="flex gap-4 mb-4">
                  <Select value={returnStockDateFilter} onValueChange={setReturnStockDateFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Date Range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">This Week</SelectItem>
                      <SelectItem value="month">This Month</SelectItem>
                      <SelectItem value="lastMonth">Last Month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Retailer</TableHead>
                        <TableHead>Van</TableHead>
                        <TableHead>GRN No.</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Total Qty</TableHead>
                        <TableHead>Total Value</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingReturnStock && filteredReturnStockData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                          </TableCell>
                        </TableRow>
                      ) : filteredReturnStockData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            No return stock data found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredReturnStockData.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.user_name}</TableCell>
                            <TableCell>{item.retailer_name}</TableCell>
                            <TableCell>{item.van_name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-purple-50 text-purple-700">
                                {item.return_grn_number}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{item.items?.length || 0} items</Badge>
                            </TableCell>
                            <TableCell>{item.total_quantity}</TableCell>
                            <TableCell>₹{item.total_value?.toLocaleString() || 0}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {format(new Date(item.return_date), 'MMM dd, yyyy')}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <Eye size={16} />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-3xl">
                                  <DialogHeader>
                                    <DialogTitle>Return Stock Details - {item.return_grn_number}</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <label className="text-sm font-medium">User</label>
                                        <p className="text-sm text-muted-foreground">{item.user_name}</p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">Retailer</label>
                                        <p className="text-sm text-muted-foreground">{item.retailer_name}</p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">Van</label>
                                        <p className="text-sm text-muted-foreground">{item.van_name}</p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">Return Date</label>
                                        <p className="text-sm text-muted-foreground">
                                          {format(new Date(item.return_date), 'PPP')}
                                        </p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">Total Quantity</label>
                                        <p className="text-sm font-medium">{item.total_quantity}</p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">Total Value</label>
                                        <p className="text-sm font-medium">₹{item.total_value?.toLocaleString() || 0}</p>
                                      </div>
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium">Return Items</label>
                                      <div className="mt-2 border rounded-md">
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead>Product</TableHead>
                                              <TableHead>Quantity</TableHead>
                                              <TableHead>Reason</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {item.items?.map((returnItem: any, index: number) => (
                                              <TableRow key={index}>
                                                <TableCell>
                                                  {returnItem.product_variants?.variant_name || returnItem.products?.name || 'Unknown'}
                                                </TableCell>
                                                <TableCell>{returnItem.return_quantity}</TableCell>
                                                <TableCell>{returnItem.return_reason}</TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    </div>
                                    {item.notes && (
                                      <div>
                                        <label className="text-sm font-medium">Notes</label>
                                        <p className="text-sm text-muted-foreground">{item.notes}</p>
                                      </div>
                                    )}
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* Cancelled Orders Tab */}
              <TabsContent value="cancelled" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Select value={cancelledDateFilter} onValueChange={setCancelledDateFilter}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="week">This Week</SelectItem>
                        <SelectItem value="month">This Month</SelectItem>
                      <SelectItem value="lastMonth">Last Month</SelectItem>
                        <SelectItem value="all">All Time</SelectItem>
                      </SelectContent>
                    </Select>
                    <Badge variant="secondary">{filteredCancelledOrders.length} records</Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToCSV(filteredCancelledOrders.map(o => ({
                      order_id: o.order_id?.slice(0, 8),
                      retailer: o.retailer_name,
                      cancelled_by: o.cancelled_by_name,
                      reason: o.reason,
                      cancelled_at: o.cancelled_at ? format(new Date(o.cancelled_at), 'dd/MM/yyyy HH:mm') : '-',
                      order_amount: o.total_amount,
                      credit_reversed: o.credit_reversed,
                      points_removed: o.points_removed,
                      loyalty_removed: o.loyalty_points_removed,
                      invoice_cancelled: o.invoice_cancelled ? 'Yes' : 'No',
                      visit_reverted: o.visit_reverted ? 'Yes' : 'No',
                    })), 'cancelled-orders')}
                  >
                    <Download size={16} className="mr-2" />
                    Export CSV
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Retailer</TableHead>
                        <TableHead>Cancelled By</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Cancelled At</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Reversal Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingCancelled && filteredCancelledOrders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                          </TableCell>
                        </TableRow>
                      ) : filteredCancelledOrders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            No cancelled orders found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredCancelledOrders.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono text-xs">{item.order_id?.slice(0, 8)}...</TableCell>
                            <TableCell>{item.retailer_name}</TableCell>
                            <TableCell>{item.cancelled_by_name}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{item.reason}</TableCell>
                            <TableCell>
                              {item.cancelled_at ? format(new Date(item.cancelled_at), 'dd/MM/yyyy HH:mm') : '-'}
                            </TableCell>
                            <TableCell>₹{item.total_amount?.toLocaleString()}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {item.credit_reversed > 0 && (
                                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                                    Credit ₹{item.credit_reversed.toLocaleString()}
                                  </Badge>
                                )}
                                {item.points_removed > 0 && (
                                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">
                                    Points -{item.points_removed}
                                  </Badge>
                                )}
                                {item.loyalty_points_removed > 0 && (
                                  <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px]">
                                    Loyalty -{item.loyalty_points_removed}
                                  </Badge>
                                )}
                                {item.invoice_cancelled && (
                                  <Badge className="bg-red-100 text-red-800 border-red-200 text-[10px]">
                                    Invoice Cancelled
                                  </Badge>
                                )}
                                {item.visit_reverted && (
                                  <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px]">
                                    Visit Reverted
                                  </Badge>
                                )}
                                {!item.credit_reversed && !item.points_removed && !item.loyalty_points_removed && !item.invoice_cancelled && !item.visit_reverted && (
                                  <span className="text-xs text-muted-foreground">No reversals</span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Edit Order Dialog */}
      {selectedOrderForEdit && (
        <EditOrderDialog
          orderId={selectedOrderForEdit.id}
          retailerName={selectedOrderForEdit.retailer_name}
          open={editOrderDialogOpen}
          onOpenChange={setEditOrderDialogOpen}
          onSaved={() => {
            fetchOrderData();
            toast.success("Order updated - changes will reflect across the system");
          }}
        />
      )}

      {/* Cancel Order Dialog */}
      {selectedOrderForCancel && (
        <CancelOrderDialog
          isOpen={showCancelDialog}
          onClose={() => {
            setShowCancelDialog(false);
            setSelectedOrderForCancel(null);
          }}
          orders={[selectedOrderForCancel.order]}
          retailerName={selectedOrderForCancel.retailerName}
          onCancelled={() => {
            fetchOrderData();
            fetchCancelledOrders();
            toast.success("Order cancelled successfully");
          }}
        />
      )}
    </div>
    </Layout>
  );
};

export default Operations;
