import { MapPin, Phone, Store, ShoppingCart, XCircle, BarChart3, Check, Users, MessageSquare, Paintbrush, Camera, LogIn, LogOut, Package, FileText, IndianRupee, Sparkles, Truck, UserCheck, Target, Gift, Ban } from "lucide-react";
import { compressImageFile } from "@/utils/imageCompression";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import { CompetitionDataForm } from "./CompetitionDataForm";
import { RetailerFeedbackModal } from "./RetailerFeedbackModal";
import { NoOrderModal } from "./NoOrderModal";
import { supabase } from "@/integrations/supabase/client";
import BrandingRequestModal from "./BrandingRequestModal";
import { JointSalesFeedbackModal } from "./JointSalesFeedbackModal";
import { JointSalesFeedbackViewModal } from "./JointSalesFeedbackViewModal";
import { StockCycleModal } from "./StockCycleModal";
import { AnalyticsModal } from "./AnalyticsModal";
import { StockDataModal } from "./StockDataModal";
import { RetailerAnalytics } from "./RetailerAnalytics";
import { VisitInvoicePDFGenerator } from "./VisitInvoicePDFGenerator";
import { OrderItemsExpanded } from "./OrderItemsExpanded";
import { PaymentMarkingModal } from "./PaymentMarkingModal";
import { VisitAIInsightsModal } from "./VisitAIInsightsModal";
import { VanSalesModal } from "./VanSalesModal";
import { useVanSales } from "@/hooks/useVanSales";
import { checkUploadSpeed } from "@/utils/internetSpeedCheck";
import { hasRecentUploadErrors, hasRecentUploadAttempts } from "@/utils/uploadErrorChecker";
import { CameraCapture } from "./CameraCapture";
import { useCheckInMandatory } from "@/hooks/useCheckInMandatory";
import { useLocationFeature } from "@/hooks/useLocationFeature";
import { useRetailerVisitTracking } from "@/hooks/useRetailerVisitTracking";
import { RetailerVisitDetailsModal } from "./RetailerVisitDetailsModal";
import { CreditScoreDisplay } from "./CreditScoreDisplay";
import { CollectionTalkingPoints } from "./credit/CollectionTalkingPoints";
import { offlineStorage, STORES } from "@/lib/offlineStorage";
import { visitStatusCache } from "@/lib/visitStatusCache";
import { retailerStatusRegistry } from "@/lib/retailerStatusRegistry";
import { updateVisitStatusInSnapshot, syncOrderValueInSnapshot } from "@/lib/myVisitsSnapshot";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { RetailerDetailModal } from "./RetailerDetailModal";
import { FeedbackListView } from "./FeedbackListView";
import { getLocalTodayDate, toLocalISODate } from "@/utils/dateUtils";
import { LoyaltyScoreBadge } from "./loyalty/LoyaltyScoreBadge";
import { VisitTrackingIndicator } from "./VisitTrackingIndicator";
import { VisitPointsDisplay, type VisitPointsBreakdown } from "./VisitPointsDisplay";
import { CancelOrderDialog } from "./CancelOrderDialog";
import { useActivityEvents, formatActivityDuration, type ActivityEvent } from "@/hooks/useActivityEvents";
import { useFeedbackPolicyCheck } from "@/hooks/useFeedbackPolicyCheck";
interface Visit {
  id: string;
  retailerId?: string;
  retailerName: string;
  address: string;
  phone: string;
  contactName?: string;
  retailerCategory: string;
  status: "planned" | "in-progress" | "productive" | "unproductive" | "store-closed" | "cancelled";
  visitType: string;
  time?: string;
  createdAt?: string;
  checkInStatus?: "not-checked-in" | "checked-in-correct" | "checked-in-wrong-location";
  hasOrder?: boolean;
  orderValue?: number;
  noOrderReason?: "over-stocked" | "owner-not-available" | "store-closed" | "permanently-closed";
  distributor?: string;
  retailerLat?: number;
  retailerLng?: number;
  lastVisitDate?: string;
  priority?: "high" | "medium" | "low";
  teammateActivity?: {
    userId: string;
    name: string;
    hasOrder: boolean;
    orderValue: number;
    visitTime?: string;
    ownActivity: boolean;
  };
}
interface VisitCardProps {
  visit: Visit;
  onViewDetails: (visitId: string) => void;
  selectedDate?: string; // Add selectedDate prop
  skipInitialCheck?: boolean; // Skip initial DB check when data is pre-loaded
  viewingUserId?: string; // The user whose data we're viewing (for subordinate view)
  /**
   * Pre-fetched gamification points breakdown for this visit's retailer on selectedDate.
   * Sourced from useVisitsDataOptimized so we never make a per-card DB call.
   */
  pointsBreakdown?: VisitPointsBreakdown | null;
}
export const VisitCard = ({
  visit,
  onViewDetails,
  selectedDate,
  skipInitialCheck = false,
  viewingUserId,
  pointsBreakdown
}: VisitCardProps) => {
  const navigate = useNavigate();
  const [showNoOrderModal, setShowNoOrderModal] = useState(false);
  const [noOrderReason, setNoOrderReason] = useState<string>(visit.noOrderReason || "");
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackActiveTab, setFeedbackActiveTab] = useState("menu");
  const [showStockCycleModal, setShowStockCycleModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [hasViewedAnalytics, setHasViewedAnalytics] = useState(false);
  const [showStockDataModal, setShowStockDataModal] = useState(false);
  const [showRetailerAnalytics, setShowRetailerAnalytics] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'in-progress' | 'completed'>(visit.status === 'in-progress' ? 'in-progress' : 'idle');
  const [locationMatchIn, setLocationMatchIn] = useState<boolean | null>(null);
  const [locationMatchOut, setLocationMatchOut] = useState<boolean | null>(null);
  const [currentVisitId, setCurrentVisitId] = useState<string | null>(null);
  const [orderPreviewOpen, setOrderPreviewOpen] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [lastOrderItems, setLastOrderItems] = useState<Array<{
    product_name: string;
    quantity: number;
    rate: number;
    actualRate: number;
  }>>([]);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showLocationCaptureModal, setShowLocationCaptureModal] = useState(false);
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const [retailerLat, setRetailerLat] = useState<number | undefined>(visit.retailerLat);
  const [retailerLng, setRetailerLng] = useState<number | undefined>(visit.retailerLng);
  const hasRetailerLocation = retailerLat != null && retailerLng != null;
  const [isNoOrderMarked, setIsNoOrderMarked] = useState(!!visit.noOrderReason);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isCheckedOut, setIsCheckedOut] = useState(false);
  const [isJointSalesVisit, setIsJointSalesVisit] = useState(false);
  const [jointSalesMemberId, setJointSalesMemberId] = useState<string | null>(null);
  const [beatPlanId, setBeatPlanId] = useState<string | null>(null);
  const [showJointSalesFeedback, setShowJointSalesFeedback] = useState(false);
  const [jointSalesChecked, setJointSalesChecked] = useState(false);
  const [hasJointSalesFeedback, setHasJointSalesFeedback] = useState(false);
  const [showJointSalesFeedbackView, setShowJointSalesFeedbackView] = useState(false);
  const [hasRetailerFeedback, setHasRetailerFeedback] = useState(false);
  const [hasBrandingRequest, setHasBrandingRequest] = useState(false);
  const [hasCompetitionData, setHasCompetitionData] = useState(false);
  const [feedbackViewMode, setFeedbackViewMode] = useState<'menu' | 'list'>('menu');
  const [feedbackListType, setFeedbackListType] = useState<'retailer' | 'branding' | 'competition' | 'joint-sales' | null>(null);
  const [feedbackEditId, setFeedbackEditId] = useState<string | null>(null);
  const [feedbackEditData, setFeedbackEditData] = useState<any>(null);
  const [activityEvent, setActivityEvent] = useState<ActivityEvent | null>(null);
  const { user } = useAuth();
  const { fetchActivityForVisit } = useActivityEvents();
  const { isFeedbackRequired, requiredAction: feedbackAction } = useFeedbackPolicyCheck(
    visit.retailerId || visit.id,
    user?.id,
    'visit'
  );
  // SOURCE PRIORITY for order values: db (4) > snapshot (3) > cache (2) > props (1)
  // This prevents lower-priority sources from overwriting higher-priority ones
  type OrderValueSource = 'db' | 'snapshot' | 'cache' | 'props' | null;
  const [orderValueSource, setOrderValueSource] = useState<OrderValueSource>(null);
  const orderValueSourceRef = useRef<OrderValueSource>(null);
  
  const getSourcePriority = (source: OrderValueSource): number => {
    switch (source) {
      case 'db': return 4;
      case 'snapshot': return 3;
      case 'cache': return 2;
      case 'props': return 1;
      default: return 0;
    }
  };

  // Initialize from cache or props - will be set after getInitialStatusData is called
  // FIX: Use selectedDate prop instead of getLocalTodayDate() for proper date-specific cache lookup
  const [hasOrderToday, setHasOrderToday] = useState<boolean>(() => {
    // Check cache first for order value - use selectedDate if available
    const retailerId = visit.retailerId || visit.id;
    const cachedUserId = typeof window !== 'undefined' ? localStorage.getItem('cached_user_id') : null;
    const targetDate = selectedDate && selectedDate.length > 0 ? selectedDate : getLocalTodayDate();
    if (cachedUserId && visitStatusCache.isReady()) {
      const cached = visitStatusCache.getSync(retailerId, cachedUserId, targetDate);
      if (cached?.orderValue && cached.orderValue > 0) {
        return true;
      }
    }
    // FIX: Also check prop values directly (these come from parent with DB data)
    return !!visit.hasOrder || (visit.orderValue !== undefined && visit.orderValue > 0);
  });
  const [actualOrderValue, setActualOrderValue] = useState<number>(() => {
    // Check cache first for order value - use selectedDate if available
    const retailerId = visit.retailerId || visit.id;
    const cachedUserId = typeof window !== 'undefined' ? localStorage.getItem('cached_user_id') : null;
    const targetDate = selectedDate && selectedDate.length > 0 ? selectedDate : getLocalTodayDate();
    if (cachedUserId && visitStatusCache.isReady()) {
      const cached = visitStatusCache.getSync(retailerId, cachedUserId, targetDate);
      if (cached?.orderValue && cached.orderValue > 0) {
        return cached.orderValue;
      }
    }
    // FIX: Ensure we use prop value directly - it comes from parent's DB fetch
    return visit.orderValue || 0;
  });

  // Consolidated order value update function with source priority
  // Use ref for orderValueSource to keep callback stable and prevent re-render cascades
  const updateOrderValue = useCallback((value: number, source: OrderValueSource) => {
    const roundedValue = Math.round(value); // Ensure consistent rounding
    const currentPriority = getSourcePriority(orderValueSourceRef.current);
    const newPriority = getSourcePriority(source);
    
    // Only update if new source has equal or higher priority
    if (newPriority >= currentPriority) {
      setActualOrderValue(roundedValue);
      setOrderValueSource(source);
      orderValueSourceRef.current = source;
      if (roundedValue > 0) {
        setHasOrderToday(true);
      }
    }
  }, []); // Stable callback - uses ref instead of state
  const [distributorName, setDistributorName] = useState<string>('');
  const [hasStockRecords, setHasStockRecords] = useState(false);
  const [stockRecordCount, setStockRecordCount] = useState(0);
  const [pendingAmount, setPendingAmount] = useState<number>(0);
  const [pendingSinceDate, setPendingSinceDate] = useState<string | null>(null);
  const [isCreditOrder, setIsCreditOrder] = useState(false);
  const [creditPendingAmount, setCreditPendingAmount] = useState<number>(0);
  const [creditPaidAmount, setCreditPaidAmount] = useState<number>(0);
  const [paidTodayAmount, setPaidTodayAmount] = useState<number>(0);
  const [ordersTodayList, setOrdersTodayList] = useState<Array<{
    id: string;
    created_at: string;
    total_amount: number;
    is_credit_order: boolean;
    credit_paid_amount: number;
    invoice_number?: string;
    distributor_name?: string | null;
  }>>([]);
  const [previousPendingCleared, setPreviousPendingCleared] = useState<number>(0);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCameraCapture, setShowCameraCapture] = useState(false);
  const pendingPhotoActionRef = useRef<'checkin' | 'checkout' | null>(null);
  const pendingCheckDataRef = useRef<{
    action: 'checkin' | 'checkout';
    timestamp: string;
    current: {
      latitude: number;
      longitude: number;
    };
    address: string;
    match: boolean | null;
    visitId: string;
    userId: string;
    retailerId: string;
    today: string;
  } | null>(null);
  const [proceedWithoutCheckIn, setProceedWithoutCheckIn] = useState(false);
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [skipCheckInReason, setSkipCheckInReason] = useState('');
  const [skipCheckInReasonType, setSkipCheckInReasonType] = useState<string>('');
  const [showAIInsights, setShowAIInsights] = useState(false);
  const [showVanSales, setShowVanSales] = useState(false);
  const [showRetailerOverview, setShowRetailerOverview] = useState(false);
  const [retailerOverviewData, setRetailerOverviewData] = useState<any>(null);
  const [showCreditTalkingPoints, setShowCreditTalkingPoints] = useState(false);
  const [creditLimitData, setCreditLimitData] = useState<{ creditLimit: number; score: number; avgDso: number } | null>(null);
  const [showCancelOrderDialog, setShowCancelOrderDialog] = useState(false);
  const {
    isVanSalesEnabled
  } = useVanSales();
  const {
    isCheckInMandatory
  } = useCheckInMandatory();
  const {
    isLocationEnabled,
    loading: locationFeatureLoading
  } = useLocationFeature();

  // Get user ID for visit tracking - INSTANT from localStorage, async fallback
  const [userId, setUserId] = useState<string>(() => {
    // Try localStorage first for instant availability (set by useAuth on login)
    return localStorage.getItem('cached_user_id') || user?.id || '';
  });
  
  useEffect(() => {
    // If we already have userId from localStorage, skip async fetch
    if (userId) return;
    
    const getUserId = async () => {
      // Use getSession() for offline support (reads from localStorage cache)
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
        // Ensure it's cached for next time
        localStorage.setItem('cached_user_id', session.user.id);
      }
    };
    getUserId();
  }, [userId]);

  // Visit tracking hook
  const {
    currentLog,
    locationStatus: trackingLocationStatus,
    distance: trackingDistance,
    timeSpent,
    formattedTimeSpent,
    startTracking,
    endTracking,
    endAllActiveLogs,
    recordAction
  } = useRetailerVisitTracking({
    retailerId: visit.retailerId || visit.id,
    retailerLat: visit.retailerLat,
    retailerLng: visit.retailerLng,
    visitId: currentVisitId || undefined,
    userId,
    selectedDate
  });

  // Handle logout - end all active logs
  useEffect(() => {
    const handleLogout = async () => {
      await endAllActiveLogs();
    };

    // Listen for auth state changes (logout)
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') {
        handleLogout();
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [endAllActiveLogs]);

  // Listen for order submission events to track checkout timing
  useEffect(() => {
    const handleOrderSubmitted = async (event: CustomEvent) => {
      const { retailerId: eventRetailerId } = event.detail;
      const currentRetailerId = visit.retailerId || visit.id;
      if (eventRetailerId === currentRetailerId) {
        await recordAction('order_submitted');
      }
    };
    
    window.addEventListener('orderSubmitted', handleOrderSubmitted as EventListener);
    return () => {
      window.removeEventListener('orderSubmitted', handleOrderSubmitted as EventListener);
    };
  }, [visit.retailerId, visit.id, recordAction]);

  const [showVisitDetailsModal, setShowVisitDetailsModal] = useState(false);
  
  // SYNC CACHE READ: Try to get status from cache OR use prop if it has authoritative status
  // Orders ALWAYS win: if there's an order, the visit must be shown as productive.
  const getInitialStatusData = (): {
    status: "planned" | "in-progress" | "productive" | "unproductive" | "store-closed" | "cancelled" | null;
    isFinal: boolean;
  } => {
    // PRIORITY 0: If parent already knows there's an order, force productive immediately
    if (visit.hasOrder || (typeof visit.orderValue === 'number' && visit.orderValue > 0)) {
      console.log('⚡ [VisitCard] Initial status from PROP order data: productive');
      return { status: 'productive', isFinal: true };
    }

    // PRIORITY 1: If prop already has an authoritative status from parent's database fetch
    const propStatus = visit.status;
    if (propStatus === 'productive') {
      console.log('⚡ [VisitCard] Initial status from PROP (productive):', propStatus);
      return { status: propStatus, isFinal: true };
    }
    if (propStatus === 'unproductive') {
      console.log('⚡ [VisitCard] Initial status from PROP (unproductive):', propStatus);
      // IMPORTANT: unproductive is NOT final (can be overridden by a later order)
      return { status: propStatus, isFinal: false };
    }

    // PRIORITY 2: Check sync cache
    const retailerId = visit.retailerId || visit.id;
    const cachedUserId = typeof window !== 'undefined' ? localStorage.getItem('cached_user_id') : null;
    const targetDate = selectedDate && selectedDate.length > 0 ? selectedDate : getLocalTodayDate();

    if (cachedUserId && visitStatusCache.isReady()) {
      const cached = visitStatusCache.getSync(retailerId, cachedUserId, targetDate);
      if (cached) {
        console.log('⚡ [VisitCard] Initial status from SYNC cache:', cached.status);
        return { status: cached.status, isFinal: !!cached.isFinal };
      }
    }

    // PRIORITY 3: Use prop status (could be 'planned' or other non-authoritative)
    return { status: propStatus, isFinal: false };
  };

  // Get initial status data (status + isFinal flag)
  const initialData = getInitialStatusData();

  // Track current visit status - initialize from prop or cache
  const [currentStatus, setCurrentStatus] = useState<"planned" | "in-progress" | "productive" | "unproductive" | "store-closed" | "cancelled" | null>(initialData.status);
  const [statusLoadedFromDB, setStatusLoadedFromDB] = useState(initialData.isFinal);

  // Track last fetched status to prevent redundant updates causing flicker
  const lastFetchedStatusRef = useRef<string | null>(null);
  const isRefreshingRef = useRef(false);
  const lastRefreshTimeRef = useRef<number>(0);

  // Display status - currentStatus is always initialized now (from prop or cache)
  // Only fall back to prop if currentStatus is somehow null (shouldn't happen)
  const displayStatus = currentStatus || visit.status;

  // CRITICAL: Sync currentStatus when parent prop changes (e.g., after orders are loaded)
  // BUT: Do NOT override if we've already set a truly final status locally (productive)
  // FIX: Use refs to avoid including currentStatus/statusLoadedFromDB in deps (they are set within this effect)
  const currentStatusRef = useRef(currentStatus);
  currentStatusRef.current = currentStatus;
  const statusLoadedFromDBRef = useRef(statusLoadedFromDB);
  statusLoadedFromDBRef.current = statusLoadedFromDB;

  useEffect(() => {
    const propStatus = visit.status;
    const propIsAuthoritative = propStatus === 'productive' || propStatus === 'unproductive';
    const currentIsTrulyFinal = currentStatusRef.current === 'productive';

    // If we already have productive locally, never downgrade from prop
    if (currentIsTrulyFinal && statusLoadedFromDBRef.current) {
      return;
    }

    // If parent has authoritative status, sync it in (unproductive is allowed, but not treated as final)
    if (propIsAuthoritative && currentStatusRef.current !== propStatus) {
      setCurrentStatus(propStatus);
      setStatusLoadedFromDB(propStatus === 'productive');
    }
  }, [visit.status]); // Only re-run when prop status changes

  // CRITICAL: Sync order data from props when parent updates (e.g., when orders load)
  // This ensures Order button turns green and shows value when parent has fresh order data
  // FIX: Use refs to avoid circular dependency on actualOrderValue/hasOrderToday
  const hasOrderTodayRef = useRef(hasOrderToday);
  hasOrderTodayRef.current = hasOrderToday;
  const actualOrderValueRef = useRef(actualOrderValue);
  actualOrderValueRef.current = actualOrderValue;

  useEffect(() => {
    // Only sync if prop has order data and local state doesn't
    if (visit.hasOrder && !hasOrderTodayRef.current) {
      setHasOrderToday(true);
      updateOrderValue(visit.orderValue || 0, 'props');
      setCurrentStatus('productive');
      setStatusLoadedFromDB(true);
      setPhase('completed');
    }
    // Also sync if order value increased (new order added) - only from props
    if (visit.hasOrder && visit.orderValue && visit.orderValue > actualOrderValueRef.current && orderValueSourceRef.current === 'props') {
      updateOrderValue(visit.orderValue, 'props');
    }
  }, [visit.hasOrder, visit.orderValue, updateOrderValue]); // Stable deps only

  // Check if the selected date is today's date (use local timezone for accurate comparison)
  const today = new Date();
  const localTodayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const isTodaysVisit = selectedDate === localTodayString;

  // Ensure visit tracking ends when this card unmounts or user navigates away
  // REMOVED: Do NOT call endTracking on unmount - it was incorrectly updating end_time to "now"
  // Unmount happens for UI reasons (navigation, scroll) and must not affect visit tracking times
  // The visit log's end_time is correctly updated only on actual user interactions via recordAction()

  // Load activity event data if this is an activity visit
  useEffect(() => {
    if (visit.visitType !== 'activity') return;
    const loadActivity = async () => {
      const visitId = currentVisitId || visit.id;
      const activity = await fetchActivityForVisit(visitId);
      if (activity) setActivityEvent(activity);
    };
    loadActivity();
  }, [visit.visitType, visit.id, currentVisitId]);

  // Load retailer data for overview modal
  useEffect(() => {
    const loadRetailerData = async () => {
      if (!showRetailerOverview) return;
      const retailerId = visit.retailerId || visit.id;
      try {
        const { data } = await supabase
          .from('retailers')
          .select('*')
          .eq('id', retailerId)
          .maybeSingle();
        if (data) setRetailerOverviewData(data);
      } catch (e) {
        console.error('Error loading retailer:', e);
      }
    };
    loadRetailerData();
  }, [showRetailerOverview, visit.retailerId, visit.id]);

  // AUTO-LOAD ORDERS FROM OFFLINE STORAGE ON MOUNT
  // This ensures orders persist across navigation (e.g., going to Attendance and back)
  useEffect(() => {
    const loadOfflineOrdersOnMount = async () => {
      if (!userId) return;
      
      const retailerId = visit.retailerId || visit.id;
      const targetDate = selectedDate && selectedDate.length > 0 ? selectedDate : getLocalTodayDate();
      const targetDateStr = targetDate.split('T')[0];
      
      try {
        // Load orders from offline storage immediately (no network required)
        const cachedOrders = await offlineStorage.getAll<any>(STORES.ORDERS);
        
        const matchingOrders = cachedOrders.filter((o: any) => {
          const orderDateStr = (o.order_date || o.created_at || '').split('T')[0];
          return o.user_id === userId && 
                 o.retailer_id === retailerId && 
                 orderDateStr === targetDateStr;
        });
        
        if (matchingOrders.length > 0) {
          console.log('[VisitCard] Auto-loaded orders from offline storage on mount:', matchingOrders.length);
          
          // Only set if current ordersTodayList is empty (don't override if already loaded)
          if (ordersTodayList.length === 0) {
            setOrdersTodayList(matchingOrders);
            setLastOrderId(matchingOrders[0].id);
            
            // Calculate totals
            const totalValue = matchingOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0);
            if (totalValue > 0) {
              updateOrderValue(totalValue, 'cache');
              setHasOrderToday(true);
              setCurrentStatus('productive');
              setStatusLoadedFromDB(true);
              setPhase('completed');
              
              // Also extract items for immediate display in "View More"
              let allItems: any[] = [];
              matchingOrders.forEach((order: any) => {
                const orderItems = order.items || order.order_items || [];
                if (Array.isArray(orderItems)) {
                  orderItems.forEach((item: any) => {
                    allItems.push({
                      product_name: item.product_name || item.name,
                      quantity: item.quantity,
                      rate: item.rate,
                      original_rate: item.original_rate || item.rate,
                      unit: item.unit || 'piece',
                      order_id: order.id
                    });
                  });
                }
              });
              
              if (allItems.length > 0) {
                // Group items for display - keep per-order when multiple orders
                const hasMultiOrders = matchingOrders.length > 1;
                const grouped = new Map<string, any>();
                allItems.forEach(it => {
                  const key = hasMultiOrders ? `${it.order_id}::${it.product_name}` : it.product_name;
                  const existing = grouped.get(key);
                  const qty = Number(it.quantity || 0);
                  const rate = Number(it.rate || 0);
                  const originalRate = Number(it.original_rate || it.rate || 0);
                  const unit = it.unit || 'piece';
                  const unitLower = unit.toLowerCase().trim();
                  
                  let displayQty = qty;
                  let displayUnit = unit;
                  let displayRate = originalRate || rate;
                  
                  if (unitLower === 'grams' || unitLower === 'g' || unitLower === 'gram') {
                    displayQty = qty / 1000;
                    displayUnit = 'KG';
                    displayRate = (originalRate || rate) * 1000;
                  }
                  
                  if (existing) {
                    existing.displayQty += displayQty;
                    existing.quantity += qty;
                  } else {
                    grouped.set(key, {
                      product_name: it.product_name,
                      quantity: qty,
                      rate: rate,
                      actualRate: displayRate,
                      displayQty: displayQty,
                      displayUnit: displayUnit,
                      order_id: it.order_id
                    });
                  }
                });
                
                setLastOrderItems(Array.from(grouped.values()));
              }
              
              // Calculate payment states
              const creditOrders = matchingOrders.filter((o: any) => !!o.is_credit_order);
              const cashOrders = matchingOrders.filter((o: any) => !o.is_credit_order);
              const paidFromCash = cashOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0);
              const totalPaidFromCredit = creditOrders.reduce((sum: number, o: any) => sum + Number(o.credit_paid_amount || 0), 0);
              const creditOrdersTotal = creditOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0);
              
              setPaidTodayAmount(paidFromCash + totalPaidFromCredit);
              setCreditPendingAmount(Math.max(0, creditOrdersTotal - totalPaidFromCredit));
              setIsCreditOrder(creditOrders.length > 0);
            }
          }
        }
      } catch (e) {
        console.log('[VisitCard] Error auto-loading offline orders:', e);
      }
    };
    
    loadOfflineOrdersOnMount();
  }, [userId, visit.retailerId, visit.id, selectedDate, updateOrderValue]); // Stable deps only

  // Memoized retailer ID for this card
  const myRetailerId = visit.retailerId || visit.id;

  // SMART STATUS CHECK: Only runs once initially OR when explicitly marked for refresh
  const checkStatus = useCallback(async (forceRefresh = false) => {
    // Get user and date info first
    const { data: { session } } = await supabase.auth.getSession();
    const currentUserId = viewingUserId || session?.user?.id || userId;
    const visitRetailerId = visit.retailerId || visit.id;
    const targetDate = selectedDate && selectedDate.length > 0 ? selectedDate : getLocalTodayDate();
    
    if (!currentUserId) return;
    
    // OFFLINE GUARD: When offline, use ONLY cached data - NO network calls
    if (!navigator.onLine) {
      console.log('📵 [VisitCard] OFFLINE - using cache only for:', visitRetailerId);
      const cachedStatus = await visitStatusCache.get(visitRetailerId, currentUserId, targetDate);
      if (cachedStatus) {
        if (currentStatus !== cachedStatus.status) {
          setCurrentStatus(cachedStatus.status);
        }
        if (currentVisitId !== cachedStatus.visitId) {
          setCurrentVisitId(cachedStatus.visitId);
        }
        if (!statusLoadedFromDB) {
          setStatusLoadedFromDB(true);
        }
        lastFetchedStatusRef.current = cachedStatus.status;
        if (cachedStatus.orderValue && actualOrderValue !== cachedStatus.orderValue) {
          updateOrderValue(cachedStatus.orderValue, 'cache');
        }
        if (cachedStatus.noOrderReason && noOrderReason !== cachedStatus.noOrderReason) {
          setIsNoOrderMarked(true);
          setNoOrderReason(cachedStatus.noOrderReason);
        }
        if ((cachedStatus.status === 'productive' || cachedStatus.status === 'unproductive') && phase !== 'completed') {
          setPhase('completed');
          setIsCheckedOut(true);
        }
      }
      // Also check offline storage for visits
      try {
        const cachedVisits = await offlineStorage.getAll(STORES.VISITS);
        const possibleRetailerIds = [visit.retailerId, visit.id].filter(Boolean);
        const matchingVisits = (cachedVisits as any[])?.filter((v: any) => 
          possibleRetailerIds.includes(v.retailer_id) && 
          v.user_id === currentUserId && 
          v.planned_date === targetDate
        ).sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        
        const cachedVisit = matchingVisits?.[0];
        if (cachedVisit) {
          console.log('📦 [VisitCard] OFFLINE - using cached visit:', cachedVisit.status);
          setCurrentVisitId(cachedVisit.id);
          if (cachedVisit.status) {
            const validStatus = cachedVisit.status as "planned" | "in-progress" | "productive" | "unproductive" | "store-closed" | "cancelled";
            setCurrentStatus(validStatus);
            setStatusLoadedFromDB(true);
            if (validStatus === 'unproductive' || validStatus === 'productive') {
              setPhase('completed');
              setIsCheckedOut(true);
            }
          }
          if (cachedVisit.no_order_reason) {
            setIsNoOrderMarked(true);
            setNoOrderReason(cachedVisit.no_order_reason);
          }
        }
      } catch (e) {
        console.log('Cache check error:', e);
      }
      retailerStatusRegistry.markInitialCheckDone(visitRetailerId);
      return; // EXIT EARLY - no network calls when offline
    }
    
    // ONLINE: Fetch pending amount - this is retailer-specific data independent of visit status caching
    try {
      const { data: retailerPendingData, error: pendingError } = await supabase
        .from('retailers')
        .select('pending_amount')
        .eq('id', visitRetailerId)
        .maybeSingle();
      
      if (!pendingError && retailerPendingData?.pending_amount) {
        const newPendingAmount = Number(retailerPendingData.pending_amount);
        if (pendingAmount !== newPendingAmount) {
          setPendingAmount(newPendingAmount);
        }
        
        // Fetch the oldest order with pending amount to get "pending since" date
        if (!pendingSinceDate) {
          const { data: oldestOrder } = await supabase
            .from('orders')
            .select('order_date')
            .eq('retailer_id', visitRetailerId)
            .gt('credit_pending_amount', 0)
            .order('order_date', { ascending: true })
            .limit(1)
            .maybeSingle();
          
          if (oldestOrder) {
            setPendingSinceDate(oldestOrder.order_date);
          }
        }
      } else if (!pendingError && !retailerPendingData?.pending_amount && pendingAmount !== 0) {
        // Reset pending amount if no longer pending
        setPendingAmount(0);
        setPendingSinceDate(null);
      }
    } catch (err) {
      console.error('Error fetching pending amount:', err);
    }
    
    // Skip if initial check is done and NOT a forced refresh (from registry notification)
    const hasInitialCheck = retailerStatusRegistry.hasInitialCheckDone(visitRetailerId);
    const needsRefresh = retailerStatusRegistry.needsRefresh(visitRetailerId);
    
    if (hasInitialCheck && !forceRefresh && !needsRefresh) {
      console.log('⏭️ [VisitCard] Skipping status check - already done, no changes for:', visitRetailerId);
      return;
    }
    
    // CACHE-FIRST: Check if we have cached status
    const cachedStatus = await visitStatusCache.get(visitRetailerId, currentUserId, targetDate);
    
    if (cachedStatus) {
      // Apply cached status immediately - no network needed
      // Only update state if values are different to prevent re-renders
      if (currentStatus !== cachedStatus.status) {
        console.log('⚡ [VisitCard] Using CACHED status:', cachedStatus.status, cachedStatus.isFinal ? '(FINAL)' : '');
        setCurrentStatus(cachedStatus.status);
      }
      if (currentVisitId !== cachedStatus.visitId) {
        setCurrentVisitId(cachedStatus.visitId);
      }
      if (!statusLoadedFromDB) {
        setStatusLoadedFromDB(true);
      }
      lastFetchedStatusRef.current = cachedStatus.status;
      
      if (cachedStatus.orderValue && actualOrderValue !== cachedStatus.orderValue) {
        updateOrderValue(cachedStatus.orderValue, 'cache');
      }
      if (cachedStatus.noOrderReason && noOrderReason !== cachedStatus.noOrderReason) {
        setIsNoOrderMarked(true);
        setNoOrderReason(cachedStatus.noOrderReason);
      }
      if ((cachedStatus.status === 'productive' || cachedStatus.status === 'unproductive') && phase !== 'completed') {
        setPhase('completed');
        setIsCheckedOut(true);
      }
      
      // Mark initial check done, clear refresh flag
      retailerStatusRegistry.markInitialCheckDone(visitRetailerId);
      retailerStatusRegistry.clearRefreshFlag(visitRetailerId);
      
      // Only 'productive' WITH order value is truly final - skip network refresh
      // If productive but no order value, we need to fetch it from network
      if (cachedStatus.status === 'productive' && cachedStatus.orderValue && cachedStatus.orderValue > 0) {
        console.log('⚡ [VisitCard] Cache has productive + orderValue, skipping network');
        isRefreshingRef.current = false;
        return;
      }
      
      // If not force refresh and no registry flag, use cache and skip network
      if (!forceRefresh && !needsRefresh) {
        isRefreshingRef.current = false;
        return;
      }
    }
    
    // Debounce: prevent rapid consecutive refreshes (minimum 200ms between refreshes)
    // Reduced from 500ms to 200ms for faster real-time updates
    const now = Date.now();
    if (now - lastRefreshTimeRef.current < 200) {
      console.log('⏳ [VisitCard] Debouncing checkStatus - too soon after last refresh');
      return;
    }
    
    // Prevent concurrent refreshes
    if (isRefreshingRef.current) {
      console.log('⏳ [VisitCard] Skipping checkStatus - already refreshing');
      return;
    }
    
    isRefreshingRef.current = true;
    lastRefreshTimeRef.current = now;
    
    try {
      console.log('🔍 [VisitCard] Checking status from network for visit:', visit.id);

      // Load distributor information - First try to get from distributor mapping
      const {
        data: distributorMapping,
        error: mappingError
      } = await supabase.from('distributor_retailer_mappings').select('distributor_id').eq('retailer_id', visitRetailerId).eq('user_id', currentUserId).maybeSingle();
      if (!mappingError && distributorMapping?.distributor_id) {
        // Try to get distributor from retailers table (distributors are stored as retailers with entity_type = 'distributor')
            const {
              data: distributorData,
              error: distributorError
            } = await supabase.from('retailers').select('name').eq('id', distributorMapping.distributor_id).eq('entity_type', 'distributor').maybeSingle();
            if (!distributorError && distributorData) {
              setDistributorName(distributorData.name);
            }
          }

          // NOTE: Pending amount is now fetched at the start of checkStatus (before cache check)
          // to ensure it's always displayed regardless of visit status caching

          // Check if analytics viewed
          const {
            data: analyticsView
          } = await supabase.from('analytics_views').select('id').eq('visit_id', visit.id).eq('user_id', currentUserId).maybeSingle();
          if (analyticsView) {
            setHasViewedAnalytics(true);
          }

            // Check if this is a joint sales visit
          const { data: beatPlanData } = await supabase
            .from('beat_plans')
            .select('id, joint_sales_manager_id')
            .eq('plan_date', targetDate)
            .or(`user_id.eq.${currentUserId},joint_sales_manager_id.eq.${currentUserId}`)
            .maybeSingle();
          
          if (beatPlanData) {
            setBeatPlanId(beatPlanData.id);
            if (beatPlanData.joint_sales_manager_id) {
              setIsJointSalesVisit(true);
              setJointSalesMemberId(beatPlanData.joint_sales_manager_id);
            }
          }

          // Check if joint feedback exists - either with beat plan or by date/retailer
          const { data: feedbackData } = await supabase
            .from('joint_sales_feedback')
            .select('id, manager_id')
            .eq('retailer_id', visitRetailerId)
            .eq('feedback_date', targetDate)
            .maybeSingle();
          
          if (feedbackData) {
            setHasJointSalesFeedback(true);
            // If we found feedback but didn't have joint sales visit from beat plan
            if (!beatPlanData?.joint_sales_manager_id && feedbackData.manager_id) {
              setJointSalesMemberId(feedbackData.manager_id);
            }
          }

          // Fetch visit data from database to get latest check-in/out status
          // Order by created_at DESC to get the most recent visit (handles duplicate visits)
          const {
            data: visitDataArr,
            error: visitError
          } = await supabase.from('visits').select('check_in_time, check_out_time, status, no_order_reason, location_match_in, location_match_out, id').eq('user_id', currentUserId).eq('retailer_id', visitRetailerId).eq('planned_date', targetDate).order('created_at', { ascending: false }).limit(1);
          
          const visitData = visitDataArr?.[0] || null;
          
          if (!visitError && visitData) {
            console.log('📊 Visit data from DB:', visitData);
            setCurrentVisitId(visitData.id);
            setIsCheckedIn(!!visitData.check_in_time);
            setIsCheckedOut(!!visitData.check_out_time);
            setLocationMatchIn(visitData.location_match_in || null);
            setLocationMatchOut(visitData.location_match_out || null);
            
            // Update current status from database with proper type assertion
            // ONLY update if status actually changed to prevent UI flicker
            const validStatus = visitData.status as "planned" | "in-progress" | "productive" | "unproductive" | "store-closed" | "cancelled";
            
            if (lastFetchedStatusRef.current !== validStatus) {
              console.log('📊 [VisitCard] Setting currentStatus from DB:', {
                visitId: visitData.id,
                oldStatus: currentStatus,
                newStatus: validStatus,
                hasCheckIn: !!visitData.check_in_time,
                hasCheckOut: !!visitData.check_out_time
              });
              setCurrentStatus(validStatus);
              lastFetchedStatusRef.current = validStatus;
              
              // Update cache with this status from DB
              await visitStatusCache.set(
                visitData.id,
                visitRetailerId,
                currentUserId,
                targetDate,
                validStatus,
                undefined, // orderValue will be set later if orders exist
                visitData.no_order_reason || undefined
              );
            } else {
              console.log('📊 [VisitCard] Status unchanged, skipping update:', validStatus);
            }
            setStatusLoadedFromDB(true); // Mark that we've loaded from DB
            
            if (visitData.no_order_reason) {
              setIsNoOrderMarked(true);
              setNoOrderReason(visitData.no_order_reason);
            } else {
              setIsNoOrderMarked(false);
              setNoOrderReason('');
            }
            if (visitData.check_in_time && !visitData.check_out_time) {
              setPhase('in-progress');
            } else if (visitData.check_out_time) {
              setPhase('completed');
            }
          } else {
            // No visit in database - check local cache for offline-created visits
            console.log('📵 No visit in DB, checking local cache...');
            try {
              const cachedVisits = await offlineStorage.getAll(STORES.VISITS);
              // Check multiple possible IDs for matching - sort by created_at DESC for duplicates
              const possibleRetailerIds = [visit.retailerId, visit.id].filter(Boolean);
              const matchingVisits = (cachedVisits as any[])?.filter((v: any) => 
                possibleRetailerIds.includes(v.retailer_id) && 
                v.user_id === currentUserId && 
                v.planned_date === targetDate
              ).sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
              
              const cachedVisit = matchingVisits?.[0];
              
              if (cachedVisit) {
                console.log('📦 Found cached visit:', cachedVisit);
                setCurrentVisitId(cachedVisit.id);
                if (cachedVisit.status) {
                  const validStatus = cachedVisit.status as "planned" | "in-progress" | "productive" | "unproductive" | "store-closed" | "cancelled";
                  setCurrentStatus(validStatus);
                  setStatusLoadedFromDB(true);
                  if (validStatus === 'unproductive') {
                    setPhase('completed');
                    setIsCheckedOut(true);
                  }
                }
                if (cachedVisit.no_order_reason) {
                  setIsNoOrderMarked(true);
                  setNoOrderReason(cachedVisit.no_order_reason);
                }
                if (cachedVisit.check_out_time) {
                  setPhase('completed');
                  setIsCheckedOut(true);
                }
              }
            } catch (cacheError) {
              console.log('Cache check error:', cacheError);
            }
          }

            // Check stock records - @ts-ignore to bypass TypeScript deep type inference issue
          // @ts-ignore
          const stockResponse = await supabase
            .from('stock')
            .select('id')
            .eq('retailer_id', visitRetailerId)
            .eq('user_id', currentUserId)
            .eq('stock_date', targetDate);
          
          const stockRecords = stockResponse.data;
          const stockError = stockResponse.error;
          
          if (!stockError && stockRecords) {
            setHasStockRecords(stockRecords.length > 0);
            setStockRecordCount(stockRecords.length);
          }

          // Fetch orders for today - CRITICAL: Filter by user_id for proper data visibility
          // Include distributor_name to show which distributor was mapped at order time
          // @ts-ignore to bypass TypeScript deep type inference issue
          const ordersResponse = await supabase
            .from('orders')
            .select('*, order_items!order_items_order_id_fkey(*), distributor_name')
            .eq('retailer_id', visitRetailerId)
            .eq('user_id', currentUserId)
            .eq('order_date', targetDate)
            .eq('status', 'confirmed');
          
          const ordersToday = ordersResponse.data;
          const ordersError = ordersResponse.error;
          
          if (!ordersError && ordersToday && ordersToday.length > 0) {
            setOrdersTodayList(ordersToday);
            // Store the most recent order ID for invoice generation
            setLastOrderId(ordersToday[0].id);
            // Calculate totals for today - round for consistency
            const totalOrderValue = Math.round(ordersToday.reduce((sum, order) => sum + Number((order as any).total_amount || 0), 0));
            console.log('💰 [VisitCard] Setting actualOrderValue from DB:', {
              visitId: visit.id,
              orderCount: ordersToday.length,
              totalOrderValue,
              orders: ordersToday.map((o: any) => ({ id: o.id, amount: o.total_amount }))
            });
            
            // Use updateOrderValue with 'db' source (highest priority)
            updateOrderValue(totalOrderValue, 'db');

            // ALSO sync this confirmed DB value back to snapshot to prevent future inconsistencies
            try {
              await syncOrderValueInSnapshot(currentUserId, targetDate, visitRetailerId, totalOrderValue);
            } catch (e) {
              console.warn('[VisitCard] Could not sync order value to snapshot:', e);
            }

            // Calculate total previous pending cleared
            const totalPendingCleared = ordersToday.reduce((sum, order) => sum + Number((order as any).previous_pending_cleared || 0), 0);
            setPreviousPendingCleared(totalPendingCleared);

            // Split cash vs credit orders and aggregate properly
            const creditOrders = ordersToday.filter((o: any) => !!o.is_credit_order);
            const cashOrders = ordersToday.filter((o: any) => !o.is_credit_order);
            const paidFromCash = cashOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0);
            const creditOrdersTotal = creditOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0);
            const totalPaidFromCredit = creditOrders.reduce((sum: number, o: any) => sum + Number(o.credit_paid_amount || 0), 0);
            const totalPaidToday = paidFromCash + totalPaidFromCredit;

            // Calculate pending using: (Previous pending + Current order) - Amount paid = Updated pending
            // Use the retailer's pending_amount from state as the previous pending
            const previousPending = pendingAmount || 0;
            const updatedPending = Math.max(0, previousPending + creditOrdersTotal - totalPaidFromCredit);
            setIsCreditOrder(creditOrders.length > 0);
            setCreditPaidAmount(totalPaidFromCredit); // Credit paid amount today (for reference)
            setPaidTodayAmount(totalPaidToday); // Total paid amount today (cash + credit)
            setCreditPendingAmount(updatedPending); // Updated pending after today's order

            // CRITICAL: Update local status to productive immediately when orders exist
            console.log('✅ [VisitCard] Orders exist - setting status to productive immediately');
            setCurrentStatus('productive');
            setStatusLoadedFromDB(true); // Mark that we've loaded from DB
            
            // Update cache with productive status and order value (using rounded value)
            await visitStatusCache.set(
              visitData?.id || currentVisitId || visit.id,
              visitRetailerId,
              currentUserId,
              targetDate,
              'productive',
              totalOrderValue,
              undefined
            );

            // ALSO update database if needed
            // This handles cases where visit was cancelled/planned but has orders
            if (visitData && visitData.status !== 'productive') {
              console.log('🔄 [VisitCard] Visit has orders but DB status is not productive - updating DB:', {
                visitId: visitData.id,
                currentStatus: visitData.status,
                orderCount: ordersToday.length,
                totalValue: totalOrderValue
              });
              const { error: updateError } = await supabase.from('visits').update({
                status: 'productive',
                check_out_time: visitData.check_out_time || new Date().toISOString(),
                no_order_reason: null
              }).eq('id', visitData.id);
              
              if (updateError) {
                console.error('❌ [VisitCard] Error updating visit status:', updateError);
              } else {
                console.log('✅ [VisitCard] Visit status updated to productive');
              }
            }
            
            setHasOrderToday(true);
          } else {
            // DB returned no orders - check offline storage as fallback before resetting
            try {
              const cachedOrders = await offlineStorage.getAll<any>(STORES.ORDERS);
              const offlineOrders = cachedOrders.filter((o: any) => {
                const orderDateStr = (o.order_date || o.created_at || '').split('T')[0];
                return o.user_id === currentUserId && 
                       o.retailer_id === visitRetailerId && 
                       orderDateStr === targetDate;
              });
              
              if (offlineOrders.length > 0) {
                console.log('[VisitCard] DB returned no orders but found in offline storage:', offlineOrders.length);
                setOrdersTodayList(offlineOrders);
                setLastOrderId(offlineOrders[0].id);
                
                const totalValue = offlineOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0);
                if (totalValue > 0) {
                  updateOrderValue(totalValue, 'cache');
                  setHasOrderToday(true);
                  setCurrentStatus('productive');
                  setStatusLoadedFromDB(true);
                  setPhase('completed');
                }
              } else {
                // Truly no orders anywhere - reset
                setHasOrderToday(false);
                setActualOrderValue(0);
                setOrderValueSource('db');
                console.log('💰 Reset actualOrderValue to 0 (confirmed from DB and offline)');
                setIsCreditOrder(false);
                setCreditPendingAmount(0);
                setCreditPaidAmount(0);
                setPaidTodayAmount(0);
                setOrdersTodayList([]);
                setPreviousPendingCleared(0);
              }
            } catch (cacheErr) {
              console.log('[VisitCard] Offline fallback error:', cacheErr);
              // Reset on error
              setHasOrderToday(false);
              setActualOrderValue(0);
              setOrderValueSource('db');
              setIsCreditOrder(false);
              setCreditPendingAmount(0);
              setCreditPaidAmount(0);
              setPaidTodayAmount(0);
              setOrdersTodayList([]);
              setPreviousPendingCleared(0);
            }
          }
    } catch (error) {
      console.log('❌ Status check error:', error);
    } finally {
      isRefreshingRef.current = false;
      // Mark initial check done after first successful network check
      retailerStatusRegistry.markInitialCheckDone(visitRetailerId);
      retailerStatusRegistry.clearRefreshFlag(visitRetailerId);
    }
  }, [visit.id, visit.retailerId, selectedDate, userId, viewingUserId]); // FIX: Removed state variables that are set within this callback to prevent re-render loopsps

  // Run initial status check and register for targeted refresh
  useEffect(() => {
    // Register this card to receive targeted refresh notifications
    // NOTE: The registry now immediately invokes callback if retailer is pending refresh
    const unregister = retailerStatusRegistry.register(myRetailerId, () => {
      console.log('🎯 [VisitCard] Received targeted refresh notification for:', myRetailerId);
      checkStatus(true); // Force refresh only for this retailer
    });
    
    // PERFORMANCE OPTIMIZATION: Skip initial checkStatus if data is pre-loaded by parent
    // The parent component (useVisitsDataOptimized) already loads status, orders, etc.
    // Only run checkStatus when explicitly triggered (e.g., after order placement)
    if (!skipInitialCheck) {
      // ALWAYS run checkStatus to load order data, status, and other visit details
      // The checkStatus function has internal optimizations to skip redundant network calls
      // But we need it to load order values, pending amounts, etc.
      console.log('🔍 [VisitCard] Running initial checkStatus for:', myRetailerId);
      checkStatus(false);
    } else {
      console.log('⚡ [VisitCard] Skipping initial checkStatus (data pre-loaded):', myRetailerId);
      // Initialize from visit props since they're pre-loaded
      if (visit.hasOrder) {
        setHasOrderToday(true);
        updateOrderValue(visit.orderValue || 0, 'props');
        setCurrentStatus('productive');
        setStatusLoadedFromDB(true);
        setPhase('completed');
      }
      if (visit.noOrderReason) {
        setIsNoOrderMarked(true);
        setNoOrderReason(visit.noOrderReason);
        setCurrentStatus('unproductive');
        setStatusLoadedFromDB(true);
        setPhase('completed');
      }
      
      // CRITICAL FIX: Even with skipInitialCheck, check if this retailer needs refresh
      // This handles the case where order was placed and we navigated back
      if (retailerStatusRegistry.needsRefresh(myRetailerId)) {
        console.log('🔄 [VisitCard] Retailer marked for refresh on mount:', myRetailerId);
        checkStatus(true);
      }
    }
    
    return () => {
      unregister();
    };
  }, [myRetailerId, skipInitialCheck]); // Removed checkStatus and visit.status from deps to prevent re-running

  // Fetch pending amount for retailer - ONLY when online
  // FIX: Defer to avoid initial render cascade that causes flickering
  useEffect(() => {
    // OFFLINE GUARD: Skip network calls when offline - use existing cached state
    if (!navigator.onLine) return;
    
    // Defer to avoid blocking initial paint
    const timer = setTimeout(async () => {
      const visitRetailerId = visit.retailerId || visit.id;
      
      try {
        const { data: retailerPendingData, error: pendingError } = await supabase
          .from('retailers')
          .select('pending_amount')
          .eq('id', visitRetailerId)
          .maybeSingle();
        
        if (!pendingError && retailerPendingData?.pending_amount) {
          const newPendingAmount = Number(retailerPendingData.pending_amount);
          if (pendingAmount !== newPendingAmount) {
            setPendingAmount(newPendingAmount);
          }
          
          // Fetch the oldest order with pending amount to get "pending since" date
          if (!pendingSinceDate && newPendingAmount > 0) {
            const { data: oldestOrder } = await supabase
              .from('orders')
              .select('order_date')
              .eq('retailer_id', visitRetailerId)
              .gt('credit_pending_amount', 0)
              .order('order_date', { ascending: true })
              .limit(1)
              .maybeSingle();
            
            if (oldestOrder) {
              setPendingSinceDate(oldestOrder.order_date);
            }
          }
        } else if (!pendingError && !retailerPendingData?.pending_amount) {
          setPendingAmount(0);
          setPendingSinceDate(null);
        }
      } catch (err) {
        console.log('📵 [VisitCard] Network error fetching pending - keeping cached state');
      }
    }, 500); // Delay 500ms to avoid blocking initial paint
    
    return () => clearTimeout(timer);
  }, [myRetailerId]); // Only depend on retailerId, run once per retailer

  // Check for existing feedback data to show tick marks - ONLY when online
  // FIX: Defer to avoid initial render cascade that causes flickering
  useEffect(() => {
    if (!navigator.onLine) return;
    
    const timer = setTimeout(async () => {
      const visitRetailerId = visit.retailerId || visit.id;
      const targetDate = selectedDate || getLocalTodayDate();
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        
        // Batch all feedback checks in parallel to minimize render cycles
        const [retailerFeedback, brandingRequest, competitionData, jointFeedback] = await Promise.all([
          supabase.from('retailer_feedback').select('id').eq('retailer_id', visitRetailerId).eq('feedback_date', targetDate).eq('user_id', session.user.id).maybeSingle(),
          supabase.from('branding_requests').select('id').eq('retailer_id', visitRetailerId).gte('created_at', `${targetDate}T00:00:00.000Z`).lte('created_at', `${targetDate}T23:59:59.999Z`).eq('user_id', session.user.id).maybeSingle(),
          supabase.from('competition_data').select('id').eq('retailer_id', visitRetailerId).gte('created_at', `${targetDate}T00:00:00.000Z`).lte('created_at', `${targetDate}T23:59:59.999Z`).eq('user_id', session.user.id).maybeSingle(),
          supabase.from('joint_sales_feedback').select('id').eq('retailer_id', visitRetailerId).eq('feedback_date', targetDate).eq('fse_user_id', session.user.id).maybeSingle(),
        ]);
        
        // Batch all state updates together
        setHasRetailerFeedback(!!retailerFeedback.data);
        setHasBrandingRequest(!!brandingRequest.data);
        setHasCompetitionData(!!competitionData.data);
        setHasJointSalesFeedback(!!jointFeedback.data);
      } catch (err) {
        console.log('📵 [VisitCard] Network error checking feedback - keeping cached state');
      }
    }, 800); // Delay 800ms - feedback ticks are non-critical UI
    
    return () => clearTimeout(timer);
  }, [myRetailerId, selectedDate]);

  // Listen for custom events to refresh status - trigger full data reload
  useEffect(() => {
    const handleStatusChange = async (event: any) => {
      console.log('🔔 [VisitCard] Received visitStatusChanged event:', {
        eventDetail: event.detail,
        currentVisitId: visit.id,
        currentRetailerId: myRetailerId
      });
      
      // Match by visitId, retailerId, OR if no detail provided (global refresh)
      const matchesVisit = event.detail?.visitId === visit.id || event.detail?.visitId === currentVisitId;
      const matchesRetailer = event.detail?.retailerId && (event.detail.retailerId === myRetailerId || event.detail.retailerId === visit.id || event.detail.retailerId === visit.retailerId);
      // Disable global refresh - only refresh if specifically targeted
      const isGlobalRefresh = false;
      
      if (matchesVisit || matchesRetailer || isGlobalRefresh) {
        console.log('✅ [VisitCard] Event matches - updating status');
        
        // CRITICAL: If event has status, update immediately and cache it
        if (event.detail?.status) {
          const newStatus = event.detail.status as "planned" | "in-progress" | "productive" | "unproductive" | "store-closed" | "cancelled";
          
          // Update status immediately - do NOT check if changed, always set to trigger re-render
          console.log('📊 [VisitCard] Setting status directly from event:', newStatus, 'orderValue:', event.detail?.orderValue);
          setCurrentStatus(newStatus);
          setStatusLoadedFromDB(true);
          lastFetchedStatusRef.current = newStatus;
          
          // If we have order value from the event, set it immediately (cache priority since it comes from local event)
          if (event.detail?.orderValue && event.detail.orderValue > 0) {
            console.log('💰 [VisitCard] Setting order value from event:', event.detail.orderValue);
            updateOrderValue(event.detail.orderValue, 'cache');
            setPhase('completed');
            setIsCheckedOut(true);
          }
          
          if (newStatus === 'unproductive') {
            setIsNoOrderMarked(true);
            setPhase('completed');
            setIsCheckedOut(true);
          }
          
          // Update cache with new status (background - don't block)
          const { data: { session } } = await supabase.auth.getSession();
          const currentUserId = session?.user?.id || userId;
          const targetDate = selectedDate && selectedDate.length > 0 ? selectedDate : getLocalTodayDate();
          
          if (currentUserId) {
            visitStatusCache.set(
              event.detail.visitId || currentVisitId || visit.id,
              myRetailerId,
              currentUserId,
              targetDate,
              newStatus,
              event.detail.orderValue,
              event.detail.noOrderReason
            );
          }
          
          // For 'productive' status, still fetch from network to get updated order list
          // This ensures the visit card shows the correct order count after multiple orders
          if (newStatus === 'productive') {
            console.log('🔄 [VisitCard] Status is PRODUCTIVE, refreshing order data from DB');
            checkStatus(true);
            return;
          }
        }
        
        // Only refresh if this specific retailer is marked
        if (retailerStatusRegistry.needsRefresh(myRetailerId)) {
          checkStatus(true);
        }
      } else {
        console.log('ℹ️ [VisitCard] Event is for different visit, ignoring');
      }
    };
    
    // SIMPLIFIED: Only respond to visitDataChanged if this retailer is specifically marked for refresh
    const handleDataChange = () => {
      const myRetailerId = visit.retailerId || visit.id;
      
      // ONLY refresh if this specific retailer is marked in the registry
      if (retailerStatusRegistry.needsRefresh(myRetailerId)) {
        console.log('🔔 [VisitCard] visitDataChanged - retailer marked for refresh:', myRetailerId);
        checkStatus(true);
      }
      // Otherwise, do nothing - prevents mass refresh of all cards
    };
    
    // SIMPLIFIED: syncComplete handler - only for retailers marked for refresh
    const handleSyncComplete = () => {
      const myRetailerId = visit.retailerId || visit.id;
      
      if (retailerStatusRegistry.needsRefresh(myRetailerId)) {
        console.log('🔔 [VisitCard] syncComplete - retailer marked for refresh:', myRetailerId);
        checkStatus(true);
      }
    };
    
    window.addEventListener('visitStatusChanged', handleStatusChange as EventListener);
    window.addEventListener('visitDataChanged', handleDataChange);
    window.addEventListener('syncComplete', handleSyncComplete);
    return () => {
      window.removeEventListener('visitStatusChanged', handleStatusChange as EventListener);
      window.removeEventListener('visitDataChanged', handleDataChange);
      window.removeEventListener('syncComplete', handleSyncComplete);
    };
  }, [visit.id, visit.retailerId, selectedDate, userId, myRetailerId, checkStatus]);

  // REMOVED: Real-time order listener disabled to prevent UI flickering
  // Status updates now happen through explicit navigation/actions only
  const getStatusColor = (status: string) => {
    switch (status) {
      case "productive":
        return "bg-success text-success-foreground";
      case "in-progress":
        return "bg-warning text-warning-foreground";
      case "planned":
        return "bg-primary text-primary-foreground";
      case "unproductive":
        return "bg-destructive text-destructive-foreground";
      case "store-closed":
        return "bg-muted text-muted-foreground";
      case "cancelled":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };
  const getStatusText = (status: string) => {
    switch (status) {
      case "productive":
        // Show order value if available (rounded), otherwise just "Productive"
        return actualOrderValue > 0 ? `₹${Math.round(actualOrderValue).toLocaleString()}` : "Productive";
      case "in-progress":
        return "In Progress";
      case "planned":
        return "Planned";
      case "unproductive":
        return "Unproductive";
      case "store-closed":
        return "Store Closed";
      case "cancelled":
        return "Cancelled";
      default:
        return "Not Started";
    }
  };
  const getLocationBtnClass = () => {
    if (isCheckedOut) {
      return "bg-success text-success-foreground hover:bg-success/90";
    }
    if (isCheckedIn || proceedWithoutCheckIn) {
      return "bg-warning text-warning-foreground hover:bg-warning/90";
    }
    // idle
    return "bg-muted text-muted-foreground hover:bg-muted/80";
  };
  const getLocationBtnTitle = () => {
    if (phase === 'completed') {
      return locationMatchOut ?? false ? 'Checked Out (Location match)' : 'Checked Out (Location mismatch)';
    }
    if (phase === 'in-progress') {
      return locationMatchIn ?? false ? 'In Progress (Location match)' : 'In Progress (Location mismatch)';
    }
    if (proceedWithoutCheckIn) {
      return 'Proceeding without Check-in';
    }
    return 'Check-In';
  };
  const toRad = (v: number) => v * Math.PI / 180;
  const distanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371000; // meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };
  const getPosition = () => new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 10000
    });
  });
  // FAST ensureVisit: Returns cached/temp ID immediately, syncs in background
  const ensureVisit = async (userId: string, retailerId: string, date: string): Promise<string> => {
    // STEP 1: INSTANT - Check local cache first (always, regardless of network)
    try {
      const allVisits = await offlineStorage.getAll(STORES.VISITS);
      const cachedVisit = allVisits.find((v: any) => 
        v.user_id === userId && 
        v.retailer_id === retailerId && 
        v.planned_date === date
      ) as any;
      
      if (cachedVisit) {
        console.log('⚡ [ensureVisit] INSTANT - Found cached visit:', cachedVisit.id);
        setCurrentVisitId(cachedVisit.id);
        if (cachedVisit.check_in_time || cachedVisit.skip_check_in_time) {
          setPhase('in-progress');
          setIsCheckedIn(true);
        }
        if (cachedVisit.location_match_in != null) setLocationMatchIn(cachedVisit.location_match_in);
        if (cachedVisit.location_match_out != null) setLocationMatchOut(cachedVisit.location_match_out);
        if (cachedVisit.skip_check_in_reason || cachedVisit.skip_check_in_time) {
          setProceedWithoutCheckIn(true);
          setSkipCheckInReason(cachedVisit.skip_check_in_reason || 'phone-order');
          setIsCheckedIn(true);
        }
        
        // BACKGROUND: Sync with network if online (non-blocking)
        if (navigator.onLine && !cachedVisit.id.startsWith('offline_') && !cachedVisit.id.startsWith('temp_')) {
          setTimeout(async () => {
            try {
              const networkPromise = supabase.from('visits')
                .select('id, status, check_in_time, location_match_in, location_match_out, skip_check_in_reason, skip_check_in_time')
                .eq('id', cachedVisit.id)
                .maybeSingle();
              
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('timeout')), 5000)
              );
              
              const result = await Promise.race([networkPromise, timeoutPromise]) as any;
              if (result?.data) {
                await offlineStorage.save(STORES.VISITS, { ...cachedVisit, ...result.data });
              }
            } catch (e) {
              console.log('⚠️ [ensureVisit] Background sync skipped:', e);
            }
          }, 0);
        }
        
        return cachedVisit.id;
      }
    } catch (cacheError) {
      console.log('⚠️ [ensureVisit] Cache check error:', cacheError);
    }
    
    // STEP 2: No cache found - create temp ID immediately for instant UI response
    const tempVisitId = `offline_${userId}_${retailerId}_${date}_${Date.now()}`;
    console.log('⚡ [ensureVisit] INSTANT - Creating temp visit:', tempVisitId);
    
    const tempVisit = {
      id: tempVisitId,
      user_id: userId,
      retailer_id: retailerId,
      planned_date: date,
      status: 'planned',
      created_at: new Date().toISOString(),
      is_offline_created: true
    };
    
    // Save temp visit to cache
    await offlineStorage.save(STORES.VISITS, tempVisit);
    setCurrentVisitId(tempVisitId);
    
    // STEP 3: BACKGROUND - Try network sync (non-blocking, with timeout)
    // CRITICAL FIX: Always check DB first before creating to prevent duplicates
    if (navigator.onLine) {
      setTimeout(async () => {
        try {
          // Try to get existing visit from network with timeout - CHECK FIRST, DON'T CREATE YET
          const networkPromise = supabase.from('visits')
            .select('id, status, check_in_time, check_out_time, location_match_in, location_match_out, skip_check_in_reason, skip_check_in_time, no_order_reason')
            .eq('user_id', userId)
            .eq('retailer_id', retailerId)
            .eq('planned_date', date)
            .order('updated_at', { ascending: false }) // Get most recent by updated_at
            .limit(1)
            .maybeSingle();
          
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('timeout')), 5000)
          );
          
          const { data, error } = await Promise.race([networkPromise, timeoutPromise]);
          
          if (error) throw error;
          
          if (data) {
            // Found existing visit - update cache with real ID, DON'T create duplicate
            console.log('🌐 [ensureVisit] Background found existing visit:', data.id);
            await offlineStorage.save(STORES.VISITS, data);
            // Delete the temp visit
            await offlineStorage.delete(STORES.VISITS, tempVisitId);
            setCurrentVisitId(data.id);
            
            // Update local state based on existing visit data
            if (data.status === 'productive' || data.status === 'unproductive') {
              setPhase('completed');
              setIsCheckedOut(true);
              setCurrentStatus(data.status);
            }
            if (data.check_in_time) {
              setIsCheckedIn(true);
              setPhase('in-progress');
            }
          } else {
            // No existing visit in DB - safe to create one
            console.log('🌐 [ensureVisit] No visit found in DB, creating new...');
            const insertPromise = supabase.from('visits')
              .insert({ user_id: userId, retailer_id: retailerId, planned_date: date })
              .select('id')
              .single();
            
            const insertTimeoutPromise = new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('timeout')), 5000)
            );
            
            const { data: inserted, error: insertError } = await Promise.race([insertPromise, insertTimeoutPromise]);
            
            if (!insertError && inserted) {
              console.log('🌐 [ensureVisit] Background created real visit:', inserted.id);
              await offlineStorage.save(STORES.VISITS, { 
                ...tempVisit, 
                id: inserted.id, 
                is_offline_created: false 
              });
              await offlineStorage.delete(STORES.VISITS, tempVisitId);
              setCurrentVisitId(inserted.id);
            }
          }
        } catch (e) {
          console.log('⚠️ [ensureVisit] Background network sync failed, keeping temp ID:', e);
          // Queue for sync when back online
          await offlineStorage.addToSyncQueue('CREATE_VISIT', {
            user_id: userId,
            retailer_id: retailerId,
            planned_date: date,
            status: 'planned'
          });
        }
      }, 0);
    } else {
      // Offline - queue for sync
      await offlineStorage.addToSyncQueue('CREATE_VISIT', {
        user_id: userId,
        retailer_id: retailerId,
        planned_date: date,
        status: 'planned'
      });
    }
    
    return tempVisitId;
  };
  const handlePhotoCaptured = async (photoBlob: Blob) => {
    try {
      const action = pendingPhotoActionRef.current;
      const checkData = pendingCheckDataRef.current;
      if (!action || !checkData) {
        setShowCameraCapture(false);
        pendingPhotoActionRef.current = null;
        pendingCheckDataRef.current = null;
        return;
      }
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) {
        setShowCameraCapture(false);
        pendingPhotoActionRef.current = null;
        pendingCheckDataRef.current = null;
        return;
      }
      const {
        visitId,
        userId,
        retailerId,
        today,
        timestamp,
        current,
        address,
        match
      } = checkData;

      // Compress and upload photo
      const compressedPhoto = await compressImageFile(photoBlob);
      const path = `${userId}/${visitId}-${action}-${Date.now()}.jpg`;
      const {
        error: uploadError
      } = await supabase.storage.from('visit-photos').upload(path, compressedPhoto, {
        contentType: 'image/jpeg',
        upsert: false
      });
      if (uploadError) {
        console.error('Photo upload error:', uploadError);
        toast({
          title: 'Photo upload failed',
          description: 'Could not upload photo. Please try again.',
          variant: 'destructive'
        });
        setShowCameraCapture(false);
        pendingPhotoActionRef.current = null;
        pendingCheckDataRef.current = null;
        return;
      }

      // NOW save check-in data with photo
      if (action === 'checkin') {
        // Auto check-out any previous in-progress visits
        await autoCheckOutPreviousVisit(userId, retailerId, today);

        // Update visit with check-in data INCLUDING photo
        const {
          error
        } = await supabase.from('visits').update({
          check_in_time: timestamp,
          check_in_location: current,
          check_in_address: address,
          check_in_photo_url: path,
          location_match_in: match,
          status: 'in-progress'
        }).eq('id', visitId);
        if (error) throw error;

        // Update attendance record with photo
        const {
          error: attendanceError
        } = await supabase.from('attendance').upsert({
          user_id: userId,
          date: today,
          check_in_time: timestamp,
          check_in_location: current,
          check_in_address: address,
          check_in_photo_url: path,
          status: 'present'
        }, {
          onConflict: 'user_id,date'
        });
        if (attendanceError) console.error('Attendance check-in error:', attendanceError);

        // Update UI state
        setPhase('in-progress');
        setLocationMatchIn(match);
        setIsCheckedIn(true);
        setShowCameraCapture(false);
        window.dispatchEvent(new CustomEvent('visitStatusChanged', {
          detail: {
            visitId: visitId,
            status: 'in-progress',
            retailerId: retailerId
          }
        }));
        toast({
          title: 'Check-in successful ✓',
          description: match === false ? 'Location mismatch detected' : 'Visit started successfully'
        });
      }
      pendingPhotoActionRef.current = null;
      pendingCheckDataRef.current = null;
    } catch (err: any) {
      console.error('Photo processing error', err);
      toast({
        title: 'Check-in failed',
        description: err.message || 'Could not complete check-in. Please try again.',
        variant: 'destructive'
      });
      setShowCameraCapture(false);
      pendingPhotoActionRef.current = null;
      pendingCheckDataRef.current = null;
    }
  };
  const handleLocationClick = () => {
    setShowLocationModal(true);
  };

  // Helper function to calculate distance between two GPS coordinates
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
  };
  const autoCheckOutPreviousVisit = async (userId: string, currentRetailerId: string, today: string) => {
    try {
      // Get current location for auto check-out
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });
      const currentLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };

      // Find any in-progress visit at a different retailer for today
      const {
        data: inProgressVisits
      } = await supabase.from('visits').select('id, retailer_id, check_in_time, updated_at').eq('user_id', userId).eq('planned_date', today).eq('status', 'in-progress').neq('retailer_id', currentRetailerId);
      if (inProgressVisits && inProgressVisits.length > 0) {
        for (const prevVisit of inProgressVisits) {
          console.log('Auto checking out previous visit:', prevVisit.id);

          // Use the visit's last activity time (updated_at) for check-out
          const checkOutTime = prevVisit.updated_at || new Date().toISOString();

          // Check if there are any orders for this visit
          const {
            data: ordersForVisit
          } = await supabase.from('orders').select('id').eq('user_id', userId).eq('retailer_id', prevVisit.retailer_id).eq('status', 'confirmed').gte('created_at', `${today}T00:00:00.000Z`).lte('created_at', `${today}T23:59:59.999Z`).limit(1);
          const finalStatus = ordersForVisit && ordersForVisit.length > 0 ? 'productive' : 'unproductive';

          // Auto check-out the previous visit with location (no photo required)
          await supabase.from('visits').update({
            check_out_time: checkOutTime,
            check_out_location: currentLocation,
            status: finalStatus
          }).eq('id', prevVisit.id);
          console.log(`Auto checked out visit ${prevVisit.id} at ${checkOutTime} with status ${finalStatus}`);

          // Award gamification points for visit completion
          if (finalStatus === 'productive') {
            const { awardPointsForVisitCompletion } = await import('@/utils/gamificationPointsAwarder');
            await awardPointsForVisitCompletion({
              userId,
              retailerId: prevVisit.retailer_id,
              hasOrder: true
            });
          }
        }
      }
    } catch (error) {
      console.error('Error auto checking out previous visit:', error);
    }
  };
  const handleCheckInOut = async (action: 'checkin' | 'checkout') => {
    try {
      console.log(`Starting ${action} process...`);
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Login required',
          description: 'Please sign in to record visits.',
          variant: 'destructive'
        });
        return;
      }

      // Check if geolocation is supported
      if (!navigator.geolocation) {
        toast({
          title: 'Location not supported',
          description: 'Your device does not support location services.',
          variant: 'destructive'
        });
        return;
      }
      const timestamp = new Date().toISOString();
      const today = timestamp.split('T')[0];
      const retailerId = visit.retailerId || visit.id;

      // Ensure visit exists and get visit ID
      const visitId = await ensureVisit(user.id, retailerId, today);
      setCurrentVisitId(visitId);

      // Get current location with better error handling
      let current: {
        latitude: number;
        longitude: number;
      };
      try {
        current = await new Promise<{
          latitude: number;
          longitude: number;
        }>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Location request timed out. Please ensure location services are enabled.'));
          }, 15000);
          navigator.geolocation.getCurrentPosition(position => {
            clearTimeout(timeoutId);
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            });
          }, error => {
            clearTimeout(timeoutId);
            let errorMessage = 'Unable to get your location.';
            switch (error.code) {
              case error.PERMISSION_DENIED:
                errorMessage = 'Location permission denied. Please enable location access in your device settings.';
                break;
              case error.POSITION_UNAVAILABLE:
                errorMessage = 'Location information is unavailable. Please check your GPS settings.';
                break;
              case error.TIMEOUT:
                errorMessage = 'Location request timed out. Please try again.';
                break;
            }
            reject(new Error(errorMessage));
          }, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
          });
        });
      } catch (locationError: any) {
        toast({
          title: 'Location Error',
          description: locationError.message || 'Failed to get location. Please enable location services.',
          variant: 'destructive'
        });
        return;
      }
      const address = `${current.latitude.toFixed(6)}, ${current.longitude.toFixed(6)}`;
      let match: boolean | null = null;
      if (visit.retailerLat && visit.retailerLng) {
        const distance = calculateDistance(current.latitude, current.longitude, visit.retailerLat, visit.retailerLng);
        match = distance <= 100;
      }

      // Close location modal
      setShowLocationModal(false);

      // For check-out: skip photo and process immediately
      if (action === 'checkout') {
        // Record checkout action for time tracking
        await recordAction('checkout');
        
        // Check-out process (no photo required)
        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);
        const {
          data: ordersToday
        } = await supabase.from('orders').select('id').eq('user_id', user.id).eq('retailer_id', retailerId).eq('status', 'confirmed').gte('created_at', todayStart.toISOString()).lte('created_at', todayEnd.toISOString()).limit(1);
        const finalStatus = ordersToday && ordersToday.length > 0 ? 'productive' : 'unproductive';

        // Update visit with check-out data (no photo)
        const {
          error
        } = await supabase.from('visits').update({
          check_out_time: timestamp,
          check_out_location: current,
          check_out_address: address,
          location_match_out: match,
          status: finalStatus
        }).eq('id', visitId);
        if (error) throw error;

        // Update attendance with check-out
        const {
          data: attendanceData
        } = await supabase.from('attendance').select('check_in_time').eq('user_id', user.id).eq('date', today).single();
        if (attendanceData?.check_in_time) {
          const checkInTime = new Date(attendanceData.check_in_time);
          const checkOutTime = new Date(timestamp);
          const totalHours = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
          const {
            error: attendanceError
          } = await supabase.from('attendance').update({
            check_out_time: timestamp,
            check_out_location: current,
            check_out_address: address,
            total_hours: totalHours
          }).eq('user_id', user.id).eq('date', today);
          if (attendanceError) console.error('Attendance check-out error:', attendanceError);
        }

        // Check if there are orders for this visit to award points
        const { data: ordersForVisit } = await supabase
          .from('orders')
          .select('id')
          .eq('user_id', user.id)
          .eq('retailer_id', retailerId)
          .eq('status', 'confirmed')
          .gte('created_at', `${today}T00:00:00.000Z`)
          .lte('created_at', `${today}T23:59:59.999Z`)
          .limit(1);
        
        const hasOrder = ordersForVisit && ordersForVisit.length > 0;
        
        // Award gamification points for visit completion
        if (hasOrder) {
          const { awardPointsForVisitCompletion } = await import('@/utils/gamificationPointsAwarder');
          await awardPointsForVisitCompletion({
            userId: user.id,
            retailerId,
            hasOrder: true
          });
        }

        // Update UI state
        setPhase('completed');
        setLocationMatchOut(match);
        setIsCheckedOut(true);
        toast({
          title: 'Checked out successfully',
          description: match === false ? 'Location mismatch detected' : 'Visit completed'
        });
        return;
      }

      // For check-in: require photo with front camera
      pendingPhotoActionRef.current = action;
      pendingCheckDataRef.current = {
        action,
        timestamp,
        current,
        address,
        match,
        visitId,
        userId: user.id,
        retailerId,
        today
      };

      // Open camera capture modal
      setShowCameraCapture(true);
    } catch (err: any) {
      console.error('Check-in/out error', err);

      // Provide user-friendly error messages
      let errorTitle = action === 'checkin' ? 'Check-in failed' : 'Check-out failed';
      let errorDescription = err.message || 'An unexpected error occurred. Please try again.';

      // Handle specific error types
      if (err.message?.includes('Location') || err.message?.includes('GPS')) {
        errorDescription = err.message;
      } else if (err.message?.includes('permission')) {
        errorDescription = 'Please enable location and camera permissions in your device settings.';
      } else if (err.message?.includes('timeout') || err.message?.includes('timed out')) {
        errorDescription = 'Request timed out. Please check your GPS and internet connection, then try again.';
      }
      toast({
        title: errorTitle,
        description: errorDescription,
        variant: 'destructive'
      });
    }
  };
  const handleNoOrderReasonSelect = async (reason: string) => {
    // =========================================================================
    // INSTANT UI UPDATE STRATEGY:
    // 1. Update ALL local state immediately (< 10ms)
    // 2. Update local caches immediately (< 50ms)
    // 3. Close modal and show toast immediately
    // 4. Run ALL network operations in background (non-blocking)
    // =========================================================================
    
    const today = selectedDate || (() => {
      // Use local timezone date (avoids UTC date mismatch around midnight)
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const retailerId = (visit.retailerId || visit.id) as string;
    const checkOutTime = new Date().toISOString();
    
    console.log('🚫 [NoOrder] INSTANT - Marking visit as unproductive:', {
      reason, retailerId, retailerName: visit.retailerName
    });
    
    // =====================================================
    // STEP 1: INSTANT UI STATE UPDATE (before any async)
    // =====================================================
    setNoOrderReason(reason);
    setIsNoOrderMarked(true);
    setPhase('completed');
    setIsCheckedOut(true);
    setCurrentStatus('unproductive');
    setStatusLoadedFromDB(true);
    lastFetchedStatusRef.current = 'unproductive';
    setShowNoOrderModal(false); // Close modal IMMEDIATELY
    
    // Show success toast IMMEDIATELY
    toast({
      title: "Visit Marked as Unproductive",
      description: `Reason: ${reason.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}`
    });
    
    // =====================================================
    // STEP 2: INSTANT LOCAL CACHE UPDATES (fast, local-only)
    // =====================================================
    // Get user ID from localStorage cache (instant, no network)
    const cachedUserId = userId || localStorage.getItem('cached_user_id') || user?.id;
    
    if (cachedUserId) {
      // Generate a temporary visit ID for cache operations
      const tempVisitId = currentVisitId || `offline_${cachedUserId}_${retailerId}_${today}_${Date.now()}`;
      
      // FIRE-AND-FORGET: Update local caches (don't await - makes response instant)
      Promise.allSettled([
        visitStatusCache.set(tempVisitId, retailerId, cachedUserId, today, 'unproductive', undefined, reason),
        updateVisitStatusInSnapshot(cachedUserId, today, retailerId, 'unproductive', reason),
        offlineStorage.save(STORES.VISITS, {
          id: tempVisitId,
          retailer_id: retailerId,
          user_id: cachedUserId,
          planned_date: today,
          status: 'unproductive',
          no_order_reason: reason,
          check_out_time: checkOutTime,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      ]);
    }
    
    // =====================================================
    // STEP 3: DISPATCH EVENT FOR OTHER COMPONENTS
    // =====================================================
    retailerStatusRegistry.markForRefresh(retailerId);
    window.dispatchEvent(new CustomEvent('visitStatusChanged', {
      detail: {
        visitId: currentVisitId || `temp_${retailerId}`,
        status: 'unproductive',
        retailerId,
        noOrderReason: reason
      }
    }));
    // Also refresh Home/Today progress cards (they listen to visitDataChanged)
    window.dispatchEvent(new Event('visitDataChanged'));
    
    // =====================================================
    // STEP 4: BACKGROUND NETWORK OPERATIONS (non-blocking)
    // =====================================================
    setTimeout(async () => {
      try {
        // Get fresh session
        const { data: { session } } = await supabase.auth.getSession();
        const currentUserId = session?.user?.id;
        
        if (!currentUserId) {
          console.log('⚠️ [NoOrder] No user session for background sync');
          return;
        }
        
        // Store userId for future instant lookups
        localStorage.setItem('cached_user_id', currentUserId);
        
        // Ensure visit exists (now fast - uses cache first)
        let visitId = await ensureVisit(currentUserId, retailerId, today);
        
        // CRITICAL FIX: If visit ID is offline-generated, we need to find or create a real visit in DB
        const isOfflineId = visitId?.startsWith('offline_') || visitId?.startsWith('temp_');
        if (isOfflineId && navigator.onLine) {
          console.log('⚠️ [NoOrder] Visit ID is offline-generated, finding/creating real visit...');
          
          // Try to find existing visit in DB
          const { data: existingVisit } = await supabase
            .from('visits')
            .select('id')
            .eq('retailer_id', retailerId)
            .eq('user_id', currentUserId)
            .eq('planned_date', today)
            .maybeSingle();
          
          if (existingVisit) {
            console.log('✅ [NoOrder] Found real visit:', existingVisit.id);
            visitId = existingVisit.id;
          } else {
            // Create new visit in DB
            const { data: newVisit, error: createError } = await supabase
              .from('visits')
              .insert({
                retailer_id: retailerId,
                user_id: currentUserId,
                planned_date: today,
                status: 'unproductive',
                no_order_reason: reason,
                check_out_time: checkOutTime
              })
              .select('id')
              .single();
            
            if (!createError && newVisit) {
              console.log('✅ [NoOrder] Created real visit:', newVisit.id);
              visitId = newVisit.id;
              
              // Update cache with real ID
              await offlineStorage.save(STORES.VISITS, {
                id: newVisit.id,
                retailer_id: retailerId,
                user_id: currentUserId,
                planned_date: today,
                status: 'unproductive',
                no_order_reason: reason,
                check_out_time: checkOutTime
              });
              await visitStatusCache.set(newVisit.id, retailerId, currentUserId, today, 'unproductive', undefined, reason);
              return; // Already saved, no need to update again
            }
          }
        }
        
        setCurrentVisitId(visitId);
        
        // Only attempt network update if online and have a valid UUID
        if (!navigator.onLine || isOfflineId) {
          console.log('📵 [NoOrder] Offline or no valid UUID - queued for sync');
          await offlineStorage.addToSyncQueue('UPDATE_VISIT_NO_ORDER', {
            visitId,
            retailerId,
            userId: currentUserId,
            noOrderReason: reason,
            checkOutTime,
            plannedDate: today,
            timestamp: new Date().toISOString()
          });
          return;
        }
        
        // Try network update with timeout using Promise.race
        try {
          const updatePromise = supabase.from('visits').update({
            status: 'unproductive',
            no_order_reason: reason,
            check_out_time: checkOutTime
          }).eq('id', visitId);
          
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('timeout')), 8000)
          );
          
          const { error } = await Promise.race([updatePromise, timeoutPromise]);
          
          if (error) throw error;
          console.log('✅ [NoOrder] Background network sync complete');
          
          // Update cache with confirmed visit ID
          await visitStatusCache.set(visitId, retailerId, currentUserId, today, 'unproductive', undefined, reason);
          
        } catch (networkError: any) {
          console.log('⚠️ [NoOrder] Network failed, queuing for sync:', networkError.message);
          
          // Queue for offline sync
          await offlineStorage.addToSyncQueue('UPDATE_VISIT_NO_ORDER', {
            visitId,
            retailerId,
            userId: currentUserId,
            noOrderReason: reason,
            checkOutTime,
            plannedDate: today,
            timestamp: new Date().toISOString()
          });
        }
      } catch (err: any) {
        console.error('⚠️ [NoOrder] Background sync error:', err);
        // UI is already updated - no need to show error to user
      }
    }, 0); // setTimeout 0 ensures UI updates first
  };
  const handleNoOrderClick = () => {
    if (isLocationEnabled && isCheckInMandatory && !isCheckedIn && !proceedWithoutCheckIn && isTodaysVisit) {
      toast({
        title: 'Check-in Required',
        description: 'Please check in or proceed without check-in first.',
        variant: 'destructive'
      });
      return;
    }
    if (isNoOrderMarked) {
      // Show unproductive result or navigate to results
      toast({
        title: "Unproductive Visit",
        description: `Reason: ${noOrderReason.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}`
      });
    } else {
      setShowNoOrderModal(true);
      // Record action for time tracking (offline-first, device time)
      recordAction('no_order').catch(err => console.error('No order tracking failed:', err));
    }
  };
  const handleViewAnalytics = async (visitId: string) => {
    try {
      const {
        data: user
      } = await supabase.auth.getUser();
      if (user.user) {
        // Record analytics view
        await supabase.from('analytics_views').insert({
          user_id: user.user.id,
          visit_id: visitId
        });
        setHasViewedAnalytics(true);
      }
    } catch (error) {
      console.log('Analytics view recording error:', error);
    }
    recordAction('analytics').catch(() => {});
    setShowAnalyticsModal(true);
  };
  const loadLastOrder = async () => {
    try {
      if (loadingOrder) return;
      setLoadingOrder(true);
      const {
        data: {
          user: authUser
        }
      } = await supabase.auth.getUser();
      const effectiveUserId = viewingUserId || authUser?.id;
      if (!effectiveUserId) {
        setLoadingOrder(false);
        return;
      }
      const retailerId = (visit.retailerId || visit.id) as string;

      // Use selectedDate if provided, otherwise use today's date
      const targetDate = selectedDate ? new Date(selectedDate) : new Date();
      const dayStart = new Date(targetDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(targetDate);
      dayEnd.setHours(23, 59, 59, 999);
      
      // Shared-beat awareness: when a teammate is active on this retailer today,
      // include their orders too so the items panel shows what they ordered.
      const teammateUserId = visit.teammateActivity?.userId;
      const allowedUserIds = teammateUserId && teammateUserId !== effectiveUserId
        ? [effectiveUserId, teammateUserId]
        : [effectiveUserId];

      // First try offline storage (instant) - always check this first for responsiveness
      let offlineOrders: any[] = [];
      try {
        const cachedOrders = await offlineStorage.getAll<any>(STORES.ORDERS);
        // Format target date as YYYY-MM-DD for comparison
        const targetDateStr = toLocalISODate(targetDate);
        
        offlineOrders = cachedOrders.filter((o: any) => {
          if (!allowedUserIds.includes(o.user_id)) return false;
          if (o.retailer_id !== retailerId) return false;
          // Check by order_date first (exact date match), fallback to created_at
          if (o.order_date) {
            const orderDateStr = o.order_date.split('T')[0];
            return orderDateStr === targetDateStr;
          }
          // Fallback to created_at timestamp comparison
          const orderDate = new Date(o.created_at);
          return orderDate >= dayStart && orderDate <= dayEnd;
        });
        console.log('[VisitCard] Offline orders found:', offlineOrders.length, 'for retailer:', retailerId, 'users:', allowedUserIds.length);
      } catch (e) {
        console.log('[VisitCard] Error reading offline orders:', e);
      }
      
      // Then try Supabase (if online) with timeout to avoid blocking
      let dbOrders: any[] = [];
      if (navigator.onLine) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
          
          const { data } = await supabase
            .from('orders')
            .select('id, user_id, created_at, total_amount, is_credit_order, credit_paid_amount, invoice_number, idempotency_key, order_items!order_items_order_id_fkey(product_name, quantity, rate, original_rate, total, unit)')
            .in('user_id', allowedUserIds)
            .eq('retailer_id', retailerId)
            .in('status', ['confirmed', 'delivered'])
            .eq('order_date', selectedDate || toLocalISODate(targetDate))
            .abortSignal(controller.signal);
          
          clearTimeout(timeoutId);
          // Tag each order with _source so the UI can label teammate rows
          dbOrders = (data || []).map((o: any) => ({
            ...o,
            _source: o.user_id && o.user_id !== effectiveUserId ? 'teammate' : 'mine',
          }));
        } catch (e: any) {
          if (e.name === 'AbortError') {
            console.log('[VisitCard] DB fetch timed out, using offline data');
          } else {
            console.log('[VisitCard] Error fetching orders from DB:', e);
          }
        }
      }
      
      // Merge orders: prioritize DB for metadata but preserve offline items
      // DUPLICATE FIX: Dedupe by BOTH id AND idempotency_key
      const mergedOrders: any[] = [];
      const dbOrderMap = new Map(dbOrders.map(o => [o.id, o]));
      const dbIdempotencyMap = new Map(dbOrders.filter(o => o.idempotency_key).map(o => [o.idempotency_key, o]));
      const offlineOrderMap = new Map(offlineOrders.map(o => [o.id, o]));
      
      // Add all DB orders, enriching with offline item data if available
      dbOrders.forEach(dbOrder => {
        // Check offline by ID or by idempotency_key
        let offlineVersion = offlineOrderMap.get(dbOrder.id);
        if (!offlineVersion && dbOrder.idempotency_key) {
          offlineVersion = offlineOrders.find((o: any) => o.idempotency_key === dbOrder.idempotency_key);
        }
        
        // If DB order has no items but offline version does, use offline items
        const hasDBItems = dbOrder.order_items && dbOrder.order_items.length > 0;
        const hasOfflineItems = offlineVersion?.items && offlineVersion.items.length > 0;
        
        if (!hasDBItems && hasOfflineItems) {
          mergedOrders.push({ ...dbOrder, items: offlineVersion.items });
        } else if (hasDBItems) {
          mergedOrders.push({ ...dbOrder, items: dbOrder.order_items });
        } else {
          mergedOrders.push(dbOrder);
        }
      });
      
      // Add offline-only orders (not in DB yet) - check by both id AND idempotency_key
      offlineOrders.forEach(offlineOrder => {
        const alreadyInDB = dbOrderMap.has(offlineOrder.id) || 
          (offlineOrder.idempotency_key && dbIdempotencyMap.has(offlineOrder.idempotency_key));
        if (!alreadyInDB) {
          mergedOrders.push(offlineOrder);
        }
      });
      
      console.log('[VisitCard] Merged orders:', mergedOrders.length, 'with items:', mergedOrders.filter(o => o.items?.length > 0).length);
      
      setOrdersTodayList(mergedOrders as any);
      if (mergedOrders.length > 0) {
        // CRITICAL FIX: Also calculate and set order totals when loading order details
        const totalOrderValue = mergedOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
        const creditOrders = mergedOrders.filter((o: any) => !!o.is_credit_order);
        const cashOrders = mergedOrders.filter((o: any) => !o.is_credit_order);
        const paidFromCash = cashOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0);
        const totalPaidFromCredit = creditOrders.reduce((sum: number, o: any) => sum + Number(o.credit_paid_amount || 0), 0);
        const totalPaidToday = paidFromCash + totalPaidFromCredit;
        const creditOrdersTotal = creditOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0);
        const updatedPending = Math.max(0, creditOrdersTotal - totalPaidFromCredit);
        
        // Update the order value and payment states
        if (totalOrderValue > 0) {
          updateOrderValue(totalOrderValue, 'db');
          setPaidTodayAmount(totalPaidToday);
          setCreditPendingAmount(updatedPending);
          setIsCreditOrder(creditOrders.length > 0);
        }
        
        // Store the most recent order ID for invoice generation
        setLastOrderId(mergedOrders[0].id);
        
        // Extract items from merged orders (items are already attached from merge logic above)
        let allItems: any[] = [];
        
        // Get items from all merged orders
        mergedOrders.forEach((order: any) => {
          const orderItems = order.items || order.order_items || [];
          if (Array.isArray(orderItems)) {
            orderItems.forEach((item: any) => {
              allItems.push({
                product_name: item.product_name || item.name,
                quantity: item.quantity,
                rate: item.rate,
                original_rate: item.original_rate || item.rate,
                total: item.total || (item.quantity * item.rate),
                order_id: order.id,
                unit: item.unit || 'piece'
              });
            });
          }
        });
        
        // If still no items, try fetching from DB directly (fallback)
        if (allItems.length === 0 && mergedOrders.length > 0 && navigator.onLine) {
          try {
            // Use ALL merged order ids (covers cases where the nested embed returned empty
            // due to RLS/PostgREST quirks, or where orders came from offline cache)
            const allOrderIds = mergedOrders.map((o: any) => o.id).filter(Boolean);
            const { data: items } = await supabase
              .from('order_items')
              .select('product_name, quantity, rate, original_rate, total, order_id, unit')
              .in('order_id', allOrderIds);
            if (items && items.length > 0) {
              allItems = items;
            }
          } catch (e) {
            console.log('[VisitCard] Error fetching order items from DB:', e);
          }
        }
        
        // Final fallback: check offline cache by retailer+date
        if (allItems.length === 0) {
          try {
            const allCachedOrders = await offlineStorage.getAll<any>(STORES.ORDERS);
            const targetDateStr = toLocalISODate(targetDate);
            const matchingOrder = allCachedOrders.find((o: any) => {
              if (o.retailer_id !== retailerId) return false;
              const orderDateStr = (o.order_date || o.created_at || '').split('T')[0];
              return orderDateStr === targetDateStr && o.items && o.items.length > 0;
            });
            
            if (matchingOrder && matchingOrder.items) {
              matchingOrder.items.forEach((item: any) => {
                allItems.push({
                  product_name: item.product_name || item.name,
                  quantity: item.quantity,
                  rate: item.rate,
                  original_rate: item.original_rate || item.rate,
                  total: item.total || (item.quantity * item.rate),
                  order_id: matchingOrder.id,
                  unit: item.unit || 'piece'
                });
              });
            }
          } catch (e) {
            console.log('[VisitCard] Fallback cache lookup failed:', e);
          }
        }
        
        console.log('[VisitCard] Total items found:', allItems.length);

        // Helper function to convert quantity and rate for display
        // Uses original_rate (MRP from product master) for accurate display
        const getDisplayValues = (qty: number, rate: number, originalRate: number, total: number, unit: string) => {
          const unitLower = (unit || '').toLowerCase().trim();
          // Use original_rate for display (full precision), fallback to rate
          const displayRateBase = originalRate || rate;
          
          // Always convert grams to kg for display (consistent with invoice)
          if (unitLower === 'grams' || unitLower === 'g' || unitLower === 'gram') {
            const kgQty = qty / 1000;
            // Use original rate * 1000 to get per KG rate (matches product master)
            const ratePerKg = displayRateBase * 1000;
            return { displayQty: kgQty, displayUnit: 'KG', displayRate: ratePerKg };
          }
          
          // For other units, use the original rate directly
          return { displayQty: qty, displayUnit: unit, displayRate: displayRateBase };
        };

        // Group items by product for a clean summary
        // When multiple orders exist, group per order to allow per-order display
        const hasMultipleOrders = mergedOrders.length > 1;
        const grouped = new Map<string, {
          product_name: string;
          quantity: number;
          rate: number;
          actualRate: number;
          displayQty: number;
          displayUnit: string;
          order_id?: string;
        }>();
        
        allItems.forEach(it => {
          // Use order_id in key when multiple orders so items stay separate per order
          const key = hasMultipleOrders ? `${it.order_id}::${it.product_name}` : it.product_name;
          const existing = grouped.get(key);
          const qty = Number(it.quantity || 0);
          const rate = Number(it.rate || 0);
          const originalRate = Number(it.original_rate || it.rate || 0);
          const total = Number(it.total || 0);
          const unit = it.unit || 'piece';
          
          const { displayQty, displayUnit, displayRate } = getDisplayValues(qty, rate, originalRate, total, unit);
          
          if (existing) {
            if (existing.displayUnit === displayUnit) {
              const oldTotal = existing.actualRate * existing.displayQty;
              const newTotal = total;
              existing.displayQty += displayQty;
              existing.quantity += qty;
              existing.actualRate = (oldTotal + newTotal) / existing.displayQty;
            } else {
              existing.displayQty += displayQty;
              existing.quantity += qty;
            }
          } else {
            grouped.set(key, {
              product_name: it.product_name,
              quantity: qty,
              rate: rate,
              actualRate: displayRate,
              displayQty: displayQty,
              displayUnit: displayUnit,
              order_id: it.order_id
            });
          }
        });
        setLastOrderItems(Array.from(grouped.values()).sort((a, b) => a.product_name.localeCompare(b.product_name)));
      } else {
        setLastOrderItems([]);
      }
    } finally {
      setLoadingOrder(false);
    }
  };
  return <Card className="shadow-card hover:shadow-xl transition-all duration-300 border-l-4 border-l-primary/30 bg-gradient-to-r from-card to-card/50">
      <CardContent className="p-3 sm:p-4">
        {/* Teammate activity banner (shared beats) */}
        {visit.teammateActivity && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-xs text-indigo-800 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-200">
            <span className="truncate">
              <span className="font-semibold">{visit.teammateActivity.name}</span>{' '}
              {visit.teammateActivity.hasOrder
                ? `placed an order${visit.teammateActivity.orderValue ? ` of ₹${Math.round(visit.teammateActivity.orderValue).toLocaleString('en-IN')}` : ''} here`
                : 'visited this retailer'}
              {visit.teammateActivity.visitTime &&
                ` · ${new Date(visit.teammateActivity.visitTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
            </span>
            <span className="shrink-0 rounded-full bg-indigo-200/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide dark:bg-indigo-800/60">
              Teammate
            </span>
          </div>
        )}
        {/* Header - Retailer info and status */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                <h3 className="font-semibold text-card-foreground text-sm sm:text-base truncate">
                  <button onClick={() => setShowRetailerOverview(true)} className="text-left hover:text-primary transition-colors cursor-pointer underline-offset-4 hover:underline" title="View retailer details">
                    {visit.retailerName}
                  </button>
                </h3>
                
                {/* Phone Order Badge - only shown if applicable */}
                {currentLog?.is_phone_order && (
                  <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                    📞 Phone Order
                  </span>
                )}
              </div>
              
              {/* Location and Phone icons - right aligned */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <a 
                  href={hasRetailerLocation ? `https://www.google.com/maps/search/?api=1&query=${retailerLat},${retailerLng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.address || '')}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className={`${hasRetailerLocation ? 'text-success hover:text-success/80' : 'text-destructive hover:text-destructive/80'} cursor-pointer p-1 rounded-full hover:bg-muted transition-colors`}
                  onClick={e => e.stopPropagation()} 
                  title={hasRetailerLocation ? "Open in Google Maps" : "Location not captured"}
                >
                  <MapPin size={16} />
                </a>
                <a 
                  href={`tel:${(visit.phone || '').replace(/\s+/g, '')}`} 
                  className="text-primary hover:text-primary/80 cursor-pointer p-1 rounded-full hover:bg-primary/10 transition-colors" 
                  onClick={e => {
                    e.stopPropagation();
                    const cleaned = (visit.phone || '').replace(/\s+/g, '');
                    if (cleaned) window.location.href = `tel:${cleaned}`;
                  }} 
                  title="Call"
                >
                  <Phone size={16} />
                </a>
              </div>
            </div>
            
            {/* Visit Tracking Indicator - shows after first action (check-in) */}
            {currentLog && (
              <div className="mt-1">
                <VisitTrackingIndicator
                  locationStatus={trackingLocationStatus}
                  checkInTime={currentLog.start_time}
                  distance={trackingDistance}
                  onClick={() => setShowVisitDetailsModal(true)}
                />
              </div>
            )}
            
            {visit.retailerId && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <CreditScoreDisplay retailerId={visit.retailerId} variant="compact" />
                <LoyaltyScoreBadge retailerId={visit.retailerId} />
              </div>
            )}
          </div>
          <div className="flex flex-col items-start sm:items-end gap-1">
            <div className="flex flex-wrap gap-1">
              <Badge className={`${getStatusColor(displayStatus)} text-xs px-2 py-1`}>
                {getStatusText(displayStatus)}
              </Badge>
              {skipCheckInReason === 'phone-order' && <Badge className="bg-blue-500 text-white hover:bg-blue-600 text-xs px-2 py-1">
                  <Phone size={12} className="mr-1" />
                  Phone Order
                </Badge>}
              {isJointSalesVisit && hasJointSalesFeedback && <Badge 
                  className="bg-purple-500 text-white hover:bg-purple-600 text-xs px-2 py-1 cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); setShowJointSalesFeedbackView(true); }}
                >
                  <UserCheck size={12} className="mr-1" />
                  Joint Sales
                </Badge>}
              {!isJointSalesVisit && hasJointSalesFeedback && <Badge 
                  className="bg-purple-500 text-white hover:bg-purple-600 text-xs px-2 py-1 cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); setShowJointSalesFeedbackView(true); }}
                >
                  <UserCheck size={12} className="mr-1" />
                  Joint Visit
                </Badge>}
              {hasStockRecords && <Badge className="bg-blue-500 text-white hover:bg-blue-600 text-xs px-2 py-1 cursor-pointer transition-all" variant="secondary" onClick={() => {
                  recordAction('view_stock').catch(() => {});
                  setShowStockDataModal(true);
                }}>
                  <Package size={12} className="mr-1" />
                  {stockRecordCount} Stock{stockRecordCount !== 1 ? 's' : ''}
                </Badge>}
              {isFeedbackRequired && (
                <Badge className="bg-destructive text-destructive-foreground text-xs px-2 py-1">
                  <MessageSquare size={12} className="mr-1" />
                  Feedback Required
                </Badge>
              )}
              {/* Activity Badge */}
              {visit.visitType === 'activity' && activityEvent && (
                <Badge className="bg-amber-500 text-white hover:bg-amber-600 text-xs px-2 py-1">
                  <Sparkles size={12} className="mr-1" />
                  {activityEvent.activity_type}
                </Badge>
              )}
              {/* Gamification points (with per-game breakdown popover) */}
              {displayStatus === 'productive' && pointsBreakdown && pointsBreakdown.totalPoints > 0 && (
                <VisitPointsDisplay breakdown={pointsBreakdown} />
              )}
            </div>
            {/* Activity duration info */}
            {visit.visitType === 'activity' && activityEvent && (
              <div className="text-xs text-amber-600 font-medium">
                {formatActivityDuration(activityEvent)}
              </div>
            )}
            <div className="text-xs text-muted-foreground">{visit.retailerCategory}</div>
          </div>
        </div>

        {/* Contact info */}
        <div className="mb-4">
          {pendingAmount > 0 && <div className="mb-3 p-2 bg-warning/10 border border-warning/30 rounded-md space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <p className="text-xs sm:text-sm font-medium text-warning flex items-center gap-1">
                    <span>⚠️</span>
                    Pending Amount: ₹{pendingAmount.toLocaleString()}
                  </p>
                  {pendingSinceDate && (
                    <p className="text-[10px] sm:text-xs text-warning/70">
                      Since: {new Date(pendingSinceDate).toLocaleDateString('en-IN', { 
                        day: 'numeric', 
                        month: 'short', 
                        year: 'numeric' 
                      })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 gap-1 text-xs text-primary"
                    onClick={() => {
                      recordAction('collection_tips').catch(() => {});
                      setShowCreditTalkingPoints(true);
                    }}
                  >
                    <MessageSquare className="w-3 h-3" />
                    Tips
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => {
                    setShowPaymentModal(true);
                    // Record action for time tracking
                    recordAction('payment').catch(err => console.error('Payment tracking failed:', err));
                  }}>
                    <IndianRupee className="w-3 h-3" />
                    Pay
                  </Button>
                </div>
              </div>
            </div>}
        </div>

        <div className="space-y-2">
          {/* First row - Check In, Order, Feedback, AI */}
          <div className={`grid gap-1.5 sm:gap-2 ${!locationFeatureLoading && isLocationEnabled ? 'grid-cols-4' : 'grid-cols-3'}`}>
            {!locationFeatureLoading && isLocationEnabled && (
              <Button
                size="sm"
                className={`${getLocationBtnClass()} p-1.5 sm:p-2 h-8 sm:h-10 text-xs sm:text-sm flex flex-col items-center gap-0.5`}
                onClick={handleLocationClick}
                title={getLocationBtnTitle()}
              >
                <MapPin size={12} className="sm:size-3.5" />
                <span className="text-xs">Check-In/Out</span>
              </Button>
            )}

            <Button
              variant={hasOrderToday ? "default" : "outline"}
              size="sm"
              className={`p-1.5 sm:p-2 h-8 sm:h-10 text-xs sm:text-sm flex flex-col items-center gap-0.5 ${
                hasOrderToday ? "bg-success text-success-foreground" : ""
              } ${
                (isCheckInMandatory && !isCheckedIn && !proceedWithoutCheckIn && isLocationEnabled) || !isTodaysVisit
                  ? "opacity-50 cursor-not-allowed"
                  : ""
              }`}
              onClick={() => {
                // INSTANT navigation - no awaits, no network blocking
                const retailerId = (visit.retailerId || visit.id) as string;
                
                // Check if it's not today's visit (sync check, no network)
                if (!isTodaysVisit) {
                  toast({
                    title: "Cannot Place Order",
                    description: "You can only place orders for today's visits. Please select today's date.",
                    variant: "destructive",
                  });
                  return;
                }

                // Check if check-in is required but not done (sync check, no network)
                if (isLocationEnabled && isCheckInMandatory && !isCheckedIn && !proceedWithoutCheckIn) {
                  toast({
                    title: "Check-in Required",
                    description: "Please check in first to place an order.",
                    variant: "destructive",
                  });
                  return;
                }

                // Check if feedback policy requires feedback before ordering
                if (isFeedbackRequired && (feedbackAction === 'block_order' || feedbackAction === 'mandatory_feedback')) {
                  toast({
                    title: "Feedback Required",
                    description: "Please submit feedback for this retailer before placing an order.",
                    variant: "destructive",
                  });
                  setShowFeedbackModal(true);
                  setFeedbackActiveTab("retailer");
                  return;
                }

                // Check if retailer location is missing - show capture modal
                if (!hasRetailerLocation) {
                  setShowLocationCaptureModal(true);
                  return;
                }

                // NAVIGATE IMMEDIATELY - this is the key to instant opening
                const retailerNameEncoded = encodeURIComponent(visit.retailerName);
                const retailerIdEncoded = encodeURIComponent(retailerId);
                navigate(`/order-entry?retailerId=${retailerIdEncoded}&retailer=${retailerNameEncoded}`);

                // ALL network operations in background (non-blocking)
                (async () => {
                  try {
                    // Use getSession (reads from localStorage, works offline) instead of getUser (network call)
                    const { data: { session } } = await supabase.auth.getSession();
                    const user = session?.user;
                    
                    // Fallback to cached user ID if session unavailable
                    const userId = user?.id || localStorage.getItem('cached_user_id');
                    
                    if (!userId) {
                      console.log('No user session available for background visit creation');
                      return;
                    }

                    const today = new Date().toISOString().split("T")[0];
                    const cachedVisitKey = `visit_${userId}_${retailerId}_${today}`;

                    // If already cached, no need to hit Supabase again
                    if (localStorage.getItem(cachedVisitKey)) {
                      return;
                    }

                    const visitId = await ensureVisit(userId, retailerId, today);
                    localStorage.setItem(cachedVisitKey, visitId);
                    setCurrentVisitId(visitId);

                    // Update URL with visitId without blocking initial navigation
                    navigate(
                      `/order-entry?retailerId=${retailerIdEncoded}&visitId=${encodeURIComponent(visitId)}&retailer=${retailerNameEncoded}`,
                      { replace: true },
                    );
                  } catch (err) {
                    console.error('Background ensureVisit failed:', err);
                  }

                  // NOTE: Tracking is now handled in OrderEntry on first user action
                  // Do NOT record action here - page open is not a meaningful interaction
                })();
              }}
              title={
                isLocationEnabled && !isCheckedIn && !proceedWithoutCheckIn
                  ? "Check in first to place order"
                  : `Order${
                      visit.orderValue || hasOrderToday
                        ? ` (₹${visit.orderValue ? visit.orderValue.toLocaleString() : "Order Placed"})`
                        : ""
                    }`
              }
            >
              <ShoppingCart size={12} className="sm:size-3.5" />
              <span className="text-xs">Order</span>
            </Button>

            <Button 
              variant={(hasRetailerFeedback || hasCompetitionData) ? "default" : "outline"} 
              size="sm" 
              className={`p-1.5 sm:p-2 h-8 sm:h-10 text-xs sm:text-sm flex flex-col items-center gap-0.5 ${
                (hasRetailerFeedback || hasCompetitionData) ? "bg-success text-success-foreground" : ""
              }`}
              onClick={() => {
                // Open instantly (do not block on slow network/offline)
                setShowFeedbackModal(true);
                // NOTE: Tracking is now handled when user clicks a specific feedback option
                // Do NOT record action here - modal open is not a meaningful interaction
              }}
              title="Feedback - Branding, Retailer Feedback & Competition Insights"
            >
              <MessageSquare size={12} className="sm:size-3.5" />
              <span className="text-xs">Feedback</span>
            </Button>

            <Button variant="outline" size="sm" className="p-1.5 sm:p-2 h-8 sm:h-10 text-xs sm:text-sm flex flex-col items-center gap-0.5 border-primary/50 hover:bg-primary/10" onClick={async () => {
            try {
              const {
                data: {
                  user
                }
              } = await supabase.auth.getUser();
              if (!user) {
                toast({
                  title: 'Login required',
                  description: 'Please sign in first.',
                  variant: 'destructive'
                });
                return;
              }
              const today = getLocalTodayDate();
              const retailerId = (visit.retailerId || visit.id) as string;
              const visitId = await ensureVisit(user.id, retailerId, today);
              setCurrentVisitId(visitId);

              // Record action for time tracking (offline-first, device time)
              await recordAction('ai');
              setShowAIInsights(true);
            } catch (err: any) {
              console.error('Open AI insights error', err);
              toast({
                title: 'Unable to open',
                description: err.message || 'Try again.',
                variant: 'destructive'
              });
            }
          }} title="AI Insights - Get personalized visit recommendations">
              <Sparkles size={12} className="sm:size-3.5 text-primary" />
              <span className="text-xs">AI</span>
            </Button>
          </div>

          {(visit.hasOrder || hasOrderToday) && <div className="mt-2 p-2 rounded-lg border border-primary/20 bg-primary/5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {selectedDate ? `${new Date(selectedDate).toDateString() === new Date().toDateString() ? "Today's" : new Date(selectedDate).toLocaleDateString()} Order` : "Today's Order"}
                  {ordersTodayList.length > 1 && (
                    <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">{ordersTodayList.length} orders</Badge>
                  )}
                </span>
              <Button variant="ghost" size="sm" className="h-7" onClick={async () => {
              recordAction('view_order').catch(() => {});
              const next = !orderPreviewOpen;
              setOrderPreviewOpen(next);
              if (next && lastOrderItems.length === 0) {
                await loadLastOrder();
              }
            }}>
                  {orderPreviewOpen ? 'Hide' : 'View'}
                </Button>
              </div>
              
              {orderPreviewOpen && <>
                  {/* Overall Summary (All payments) */}
                  <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md space-y-1">
                    {ordersTodayList.length > 0 && ordersTodayList[0]?.distributor_name && (
                      <div className="flex justify-between items-center text-xs pb-1 border-b border-amber-200 dark:border-amber-700">
                        <span className="text-muted-foreground">Distributor:</span>
                        <span className="font-medium text-primary">{ordersTodayList[0].distributor_name}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">Total Amount:</span>
                      <span className="font-semibold">₹{Math.round(actualOrderValue).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-success">Paid Amount:</span>
                      <span className="font-medium text-success">₹{Math.round(paidTodayAmount).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-warning">Pending Amount:</span>
                      <span className="font-medium text-warning">₹{Math.round(creditPendingAmount).toLocaleString()}</span>
                    </div>
                  </div>
                  
                  {/* Individual Orders - show each order separately when multiple exist */}
                  {loadingOrder && <div className="text-xs text-muted-foreground mt-2">Loading...</div>}
                  
                  {!loadingOrder && ordersTodayList.length > 1 ? (
                    <div className="mt-2 space-y-2">
                      {ordersTodayList.map((order, orderIdx) => {
                        const isExpanded = expandedOrderId === order.id;
                        // Match items to this order - try order_id first, then check if items have tags
                        const hasTaggedItems = lastOrderItems.some(it => (it as any).order_id);
                        let displayItems: typeof lastOrderItems;
                        if (hasTaggedItems) {
                          displayItems = lastOrderItems.filter(it => (it as any).order_id === order.id);
                        } else {
                          // Fallback: split items evenly or show all for first order
                          displayItems = orderIdx === 0 ? lastOrderItems : [];
                        }
                        
                        return (
                          <div key={order.id} className="border border-border/50 rounded-md overflow-hidden">
                            <button
                              className="w-full flex items-center justify-between p-2 text-xs hover:bg-muted/30 transition-colors"
                              onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                            >
                              <div className="flex items-center gap-2">
                                <Package size={12} className="text-primary" />
                                <span className="font-medium">Order {orderIdx + 1}</span>
                                {(order as any)._source === 'teammate' && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                                    by {visit.teammateActivity?.name || 'teammate'}
                                  </span>
                                )}
                                {order.invoice_number && (
                                  <span className="text-muted-foreground">({order.invoice_number})</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">₹{Math.round(order.total_amount).toLocaleString()}</span>
                                <span className="text-muted-foreground">{isExpanded ? '▲' : '▼'}</span>
                              </div>
                            </button>
                            
                            {isExpanded && (
                              <OrderItemsExpanded 
                                orderId={order.id} 
                                displayItems={displayItems} 
                                onItemsLoaded={(items) => {
                                  // Merge newly fetched items into lastOrderItems
                                  setLastOrderItems(prev => [...prev, ...items]);
                                }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : !loadingOrder ? (
                    /* Single order - show items directly as before */
                    <div className="mt-2 space-y-1 overflow-hidden">
                      {lastOrderItems.length === 0 && <div className="text-xs text-muted-foreground">No items found.</div>}
                      {lastOrderItems.map((it, idx) => {
                        const displayQty = (it as any).displayQty ?? it.quantity;
                        const displayUnit = (it as any).displayUnit || '';
                        const qtyStr = Number.isInteger(displayQty) ? displayQty.toString() : displayQty.toFixed(2).replace(/\.?0+$/, '');
                        const qtyDisplay = displayUnit ? `${qtyStr} ${displayUnit}` : qtyStr;
                        return (
                          <div key={idx} className="flex justify-between items-start gap-2 text-xs py-1">
                            <span className="flex-1 min-w-0 break-words">{it.product_name}</span>
                            <div className="flex-shrink-0 text-right">
                              <span className="font-medium">{qtyDisplay} × ₹{it.actualRate.toFixed(2)}</span>
                              {it.actualRate.toFixed(2) !== it.rate.toFixed(2) && it.rate > 0 && (
                                <div className="text-[10px] text-muted-foreground line-through">₹{it.rate.toFixed(2)}</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  
                  {/* Invoice & Cancel buttons */}
                  {ordersTodayList.length > 0 && <div className="mt-3 pt-2 border-t space-y-2">
                      {/* Show combined invoice for all orders */}
                      <VisitInvoicePDFGenerator orders={ordersTodayList.map(o => ({
                        id: o.id,
                        invoice_number: o.invoice_number,
                        total_amount: o.total_amount,
                        created_at: o.created_at
                      }))} customerPhone={visit.phone} className="w-full" />
                      
                      {/* Cancel Order Button */}
                      <Button 
                        variant="outline"
                        size="sm"
                        className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => setShowCancelOrderDialog(true)}
                      >
                        <Ban size={14} className="mr-2" />
                        Cancel Order
                      </Button>
                    </div>}
                </>}
            </div>}
        </div>

        {/* Camera Capture Modal */}
        <CameraCapture isOpen={showCameraCapture} onClose={() => {
        setShowCameraCapture(false);
        pendingPhotoActionRef.current = null;
        pendingCheckDataRef.current = null;
      }} onCapture={handlePhotoCaptured} title="Check-In Photo" description="Position yourself in the frame and capture your photo" />

        {/* Location Modal */}
        <Dialog open={showLocationModal} onOpenChange={setShowLocationModal}>
          <DialogContent className="w-[95%] max-w-sm mx-auto rounded-lg">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold text-center">Location Options</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-4">
              {isLocationEnabled && !isCheckedIn && isTodaysVisit && <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-200">
                  <p className="font-medium mb-1">📍 Location & Camera Required</p>
                  <p className="text-xs">Please allow location and camera access when prompted for check-in.</p>
                </div>}
            {isLocationEnabled && <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => {
                  recordAction('check_in').catch(() => {});
                  handleCheckInOut('checkin');
                }} className={`w-full h-12 text-base font-medium ${isCheckedIn || !isTodaysVisit ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary hover:bg-primary/90'}`} disabled={isCheckedIn || !isTodaysVisit}>
                  <LogIn className="mr-2 h-5 w-5" />
                  {isCheckedIn ? 'Checked In' : 'Check In'}
                </Button>
                <Button onClick={async () => {
                recordAction('phone_order').catch(() => {});
                try {
                  const {
                    data: {
                      user
                    }
                  } = await supabase.auth.getUser();
                  if (user) {
                    const today = getLocalTodayDate();
                    const retailerId = visit.retailerId || visit.id;

                    // Auto check-out any previous in-progress visit before phone order
                    await autoCheckOutPreviousVisit(user.id, retailerId, today);
                    const visitId = await ensureVisit(user.id, retailerId, today);

                    // Update visit with phone order reason and set to in-progress
                    await supabase.from('visits').update({
                      status: 'in-progress',
                      skip_check_in_reason: 'phone-order',
                      skip_check_in_time: new Date().toISOString()
                    } as any).eq('id', visitId);

                    // Dispatch event to notify parent components
                    window.dispatchEvent(new CustomEvent('visitStatusChanged', {
                      detail: {
                        visitId,
                        status: 'in-progress',
                        retailerId
                      }
                    }));
                  }
                  setProceedWithoutCheckIn(true);
                  setSkipCheckInReason('phone-order');
                  setPhase('in-progress');
                  setIsCheckedIn(true);
                  setShowLocationModal(false);
                  setShowReasonInput(false);
                  toast({
                    title: 'Phone Order',
                    description: 'You can now record order or no order.'
                  });
                } catch (err: any) {
                  console.error('Phone order error:', err);
                  toast({
                    title: 'Error',
                    description: 'Failed to proceed with phone order.',
                    variant: 'destructive'
                  });
                }
              }} variant={isCheckedIn || !isTodaysVisit ? "outline" : "default"} className={`w-full h-12 text-base font-medium ${isCheckedIn || !isTodaysVisit ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'}`} disabled={isCheckedIn || !isTodaysVisit}>
                    <Phone className="mr-2 h-5 w-5" />
                    Phone Order
                  </Button>
                </div>}
              
              {isLocationEnabled && <Button onClick={() => handleCheckInOut('checkout')} className={`w-full h-12 text-base font-medium ${isCheckedOut ? 'bg-success text-success-foreground hover:bg-success/90 border-success' : !isCheckedIn || !isTodaysVisit ? 'bg-muted text-muted-foreground cursor-not-allowed border-muted' : 'border-primary text-primary hover:bg-primary hover:text-primary-foreground'}`} variant={isCheckedOut ? "default" : "outline"} disabled={!isCheckedIn || isCheckedOut || !isTodaysVisit}>
                  <LogOut className="mr-2 h-5 w-5" />
                  {isCheckedOut ? 'Checked Out' : 'Check Out'}
                </Button>}
              
              {isLocationEnabled && <div className="pt-2 border-t">
                  {!showReasonInput && !proceedWithoutCheckIn && !isCheckedIn && <button onClick={() => setShowReasonInput(true)} className="w-full text-sm text-primary hover:underline text-center py-2">
                    Click here to proceed without Check-in
                  </button>}
                
                {showReasonInput && !proceedWithoutCheckIn && <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Reason for proceeding without check-in:
                      </label>
                      <Select value={skipCheckInReasonType} onValueChange={async value => {
                    setSkipCheckInReasonType(value);
                    // Clear custom reason when changing from "Other" to predefined
                    if (value !== 'other') {
                      setSkipCheckInReason('');
                    }

                    // If internet issue is selected, check speed immediately
                    if (value === 'internet-issue') {
                      toast({
                        title: 'Checking Internet Speed',
                        description: 'Please wait while we verify your connection...'
                      });
                      try {
                        const uploadSpeed = await checkUploadSpeed();
                        if (uploadSpeed >= 4) {
                          toast({
                            title: 'Internet Connection Sufficient',
                            description: `Your upload speed is good enough to proceed with normal check-in (above the 4 Mbps threshold)`,
                            variant: 'destructive',
                            duration: 8000
                          });
                          // Reset selection since internet is sufficient
                          setSkipCheckInReasonType('');
                        } else {
                          toast({
                            title: 'Low Internet Speed Confirmed',
                            description: `Upload speed: ${uploadSpeed.toFixed(2)} Mbps (below 4 Mbps threshold). You can proceed without check-in.`,
                            duration: 6000
                          });
                        }
                      } catch (error) {
                        console.error('Speed test failed:', error);
                        toast({
                          title: 'Speed Test Failed',
                          description: 'Could not verify internet speed. You can still proceed with this reason.',
                          duration: 5000
                        });
                      }
                    }

                    // If photo upload issue is selected, check for upload attempts and errors
                    if (value === 'photo-upload-issue') {
                      toast({
                        title: 'Checking Upload History',
                        description: 'Verifying recent upload attempts...'
                      });
                      try {
                        // First check if user has attempted any uploads in the last 5 minutes
                        const hasAttempts = hasRecentUploadAttempts();
                        if (!hasAttempts) {
                          toast({
                            title: 'No Upload Attempt Detected',
                            description: 'You have not tried to upload any photo in check-in. First try to upload using check-in, then use this option.',
                            variant: 'destructive',
                            duration: 8000
                          });
                          // Reset selection since no upload attempt was made
                          setSkipCheckInReasonType('');
                          return;
                        }

                        // If attempts were made, check for errors
                        const {
                          hasErrors,
                          errorCount,
                          errors
                        } = hasRecentUploadErrors();
                        if (!hasErrors) {
                          toast({
                            title: 'No Upload Issues Detected',
                            description: 'No issue detected with photo upload. Please proceed with normal check-in.',
                            variant: 'destructive',
                            duration: 8000
                          });
                          // Reset selection since no errors found
                          setSkipCheckInReasonType('');
                        } else {
                          toast({
                            title: 'Upload Errors Found',
                            description: `Detected ${errorCount} upload error(s) in recent logs. You can proceed without check-in.`,
                            duration: 6000
                          });
                          console.log('Recent upload errors:', errors);
                        }
                      } catch (error) {
                        console.error('Upload verification failed:', error);
                        toast({
                          title: 'Verification Failed',
                          description: 'Could not verify upload history. You can still proceed with this reason.',
                          duration: 5000
                        });
                      }
                    }
                  }}>
                        <SelectTrigger className="w-full bg-background z-50">
                          <SelectValue placeholder="Select a reason" />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50">
                          <SelectItem value="internet-issue">Internet issue</SelectItem>
                          <SelectItem value="system-slow">System is slow and not allowing checkin</SelectItem>
                          <SelectItem value="photo-upload-issue">Photo not getting uploaded</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {skipCheckInReasonType === 'other' && <div>
                        <label className="text-sm font-medium mb-2 block">
                          Enter your reason:
                        </label>
                        <textarea value={skipCheckInReason} onChange={e => setSkipCheckInReason(e.target.value)} className="w-full min-h-[80px] p-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Enter your reason here..." />
                      </div>}
                    
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => {
                    setShowReasonInput(false);
                    setSkipCheckInReason('');
                    setSkipCheckInReasonType('');
                  }}>
                        Cancel
                      </Button>
                      <Button size="sm" className="flex-1" onClick={async () => {
                    // Get the final reason: use dropdown value if not "other", otherwise use custom text
                    const finalReason = skipCheckInReasonType === 'other' ? skipCheckInReason.trim() : skipCheckInReasonType ? skipCheckInReasonType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
                    if (finalReason) {
                      try {
                        const {
                          data: {
                            user
                          }
                        } = await supabase.auth.getUser();
                        if (user) {
                          const today = getLocalTodayDate();
                          const retailerId = visit.retailerId || visit.id;

                          // Auto check-out any previous in-progress visit before proceeding
                          await autoCheckOutPreviousVisit(user.id, retailerId, today);
                          const visitId = await ensureVisit(user.id, retailerId, today);

                          // Update visit with skip check-in reason and set to in-progress
                          await supabase.from('visits').update({
                            status: 'in-progress',
                            skip_check_in_reason: finalReason,
                            skip_check_in_time: new Date().toISOString()
                          } as any).eq('id', visitId);
                          setProceedWithoutCheckIn(true);
                          setPhase('in-progress');
                          setIsCheckedIn(true);
                          setShowLocationModal(false);
                          setShowReasonInput(false);
                          setSkipCheckInReason('');
                          setSkipCheckInReasonType('');

                          // Dispatch event to notify parent components
                          window.dispatchEvent(new CustomEvent('visitStatusChanged', {
                            detail: {
                              visitId,
                              status: 'in-progress',
                              retailerId
                            }
                          }));
                          toast({
                            title: 'Proceeding without check-in',
                            description: 'You can now access Order and No Order options.'
                          });
                        }
                      } catch (err: any) {
                        console.error('Skip check-in error:', err);
                        toast({
                          title: 'Error',
                          description: 'Failed to record skip check-in reason.',
                          variant: 'destructive'
                        });
                      }
                    } else {
                      toast({
                        title: 'Reason required',
                        description: 'Please select or enter a reason to proceed.',
                        variant: 'destructive'
                      });
                    }
                  }} disabled={!skipCheckInReasonType || skipCheckInReasonType === 'other' && !skipCheckInReason.trim()}>
                        Submit
                      </Button>
                    </div>
                  </div>}
                
                  {proceedWithoutCheckIn && <div className="text-sm text-center py-2 text-muted-foreground">
                      Proceeding without check-in
                    </div>}
                </div>}
            </div>
          </DialogContent>
        </Dialog>

        {/* Modals */}
        <NoOrderModal isOpen={showNoOrderModal} onClose={() => setShowNoOrderModal(false)} onReasonSelect={handleNoOrderReasonSelect} currentReason={noOrderReason} />

         {/* Unified Feedback Modal with Tabs */}
        {showFeedbackModal && feedbackActiveTab === "retailer-feedback" && (
          <RetailerFeedbackModal 
            isOpen={true} 
            onClose={() => { 
              setShowFeedbackModal(false); 
              setFeedbackActiveTab("menu"); 
              setHasRetailerFeedback(true);
              setFeedbackEditId(null);
              setFeedbackEditData(null);
            }} 
            onBack={() => setFeedbackActiveTab("menu")} 
            visitId={currentVisitId || visit.id} 
            retailerId={(visit.retailerId || visit.id) as string} 
            retailerName={visit.retailerName}
            editId={feedbackEditId}
            editData={feedbackEditData}
          />
        )}

        {showFeedbackModal && feedbackActiveTab === "branding" && (
          <BrandingRequestModal 
            isOpen={true} 
            onClose={() => { 
              setShowFeedbackModal(false); 
              setFeedbackActiveTab("menu"); 
              setHasBrandingRequest(true);
              setFeedbackEditId(null);
              setFeedbackEditData(null);
            }} 
            onBack={() => setFeedbackActiveTab("menu")} 
            defaultVisitId={currentVisitId} 
            defaultRetailerId={(visit.retailerId || visit.id) as string} 
            defaultPincode={null}
            editId={feedbackEditId}
            editData={feedbackEditData}
          />
        )}

        {showFeedbackModal && feedbackActiveTab === "joint-sales-feedback" && (
          <JointSalesFeedbackModal 
            isOpen={true} 
            onClose={() => { 
              setShowFeedbackModal(false); 
              setFeedbackActiveTab("menu");
              setFeedbackEditId(null);
              setFeedbackEditData(null);
            }} 
            visitId={currentVisitId || visit.id} 
            retailerId={(visit.retailerId || visit.id) as string} 
            retailerName={visit.retailerName} 
            beatPlanId={beatPlanId} 
            managerId={jointSalesMemberId} 
            onFeedbackSubmitted={() => setHasJointSalesFeedback(true)}
            editId={feedbackEditId}
            editData={feedbackEditData}
          />
        )}

        {showFeedbackModal && feedbackActiveTab === "competition" && (
          <Dialog open={true} onOpenChange={(open) => {
            if (!open) {
              setShowFeedbackModal(false);
              setFeedbackActiveTab("menu");
              setHasCompetitionData(true);
            }
          }}>
            <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] p-0 overflow-hidden">
              <div className="bg-gradient-to-br from-red-500/10 via-red-400/5 to-background p-4 border-b">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-lg">
                    <Target className="h-5 w-5 text-red-600" />
                    Competition Data - {visit.retailerName}
                  </DialogTitle>
                </DialogHeader>
              </div>
              <ScrollArea className="max-h-[calc(90vh-80px)] p-4">
                <CompetitionDataForm 
                  retailerId={(visit.retailerId || visit.id) as string} 
                  visitId={currentVisitId || visit.id} 
                  onSave={() => { 
                    setShowFeedbackModal(false); 
                    setFeedbackActiveTab("menu"); 
                    setHasCompetitionData(true);
                  }} 
                />
              </ScrollArea>
            </DialogContent>
          </Dialog>
        )}

         {/* Tab Selector Modal */}
        <Dialog open={showFeedbackModal && !['retailer-feedback', 'branding', 'joint-sales-feedback', 'competition'].includes(feedbackActiveTab)} onOpenChange={open => {
        if (!open) {
          setShowFeedbackModal(false);
          setFeedbackActiveTab("menu");
        }
      }}>
          <DialogContent className="max-w-[95vw] sm:max-w-md p-0 overflow-hidden">
            <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-background p-6">
              <DialogHeader className="space-y-3">
                <DialogTitle className="text-xl font-bold text-center">Feedback Options</DialogTitle>
                <div className="text-center">
                  <p className="text-lg font-semibold text-primary">{visit.retailerName}</p>
                  <p className="text-xs text-muted-foreground mt-1">{visit.address}</p>
                </div>
              </DialogHeader>
            </div>
            <div className="p-5 space-y-3">
              <Button 
                variant="outline" 
                className={`w-full h-auto py-4 px-4 flex items-center gap-4 hover:bg-primary/5 hover:border-primary/50 transition-all group ${hasRetailerFeedback ? 'border-green-300 bg-green-50/50 dark:bg-green-900/20' : ''}`} 
                onClick={() => { recordAction('feedback').catch(() => {}); setFeedbackListType('retailer'); setShowFeedbackModal(false); }}
              >
                <div className={`h-12 w-12 rounded-full flex items-center justify-center transition-colors ${hasRetailerFeedback ? 'bg-green-100 dark:bg-green-900/50' : 'bg-blue-100 dark:bg-blue-900/30 group-hover:bg-blue-200 dark:group-hover:bg-blue-800/50'}`}>
                  <MessageSquare size={22} className={hasRetailerFeedback ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'} />
                </div>
                <div className="text-left flex-1">
                  <div className="font-semibold text-base flex items-center gap-2">
                    Retailer Feedback
                    {hasRetailerFeedback && <Check size={16} className="text-green-600" />}
                  </div>
                  <div className="text-xs text-muted-foreground">{hasRetailerFeedback ? 'View or update feedback' : 'Share feedback about the retailer'}</div>
                </div>
              </Button>
              
              <Button 
                variant="outline" 
                className={`w-full h-auto py-4 px-4 flex items-center gap-4 hover:bg-primary/5 hover:border-primary/50 transition-all group ${hasBrandingRequest ? 'border-green-300 bg-green-50/50 dark:bg-green-900/20' : ''}`} 
                onClick={() => { recordAction('feedback').catch(() => {}); setFeedbackListType('branding'); setShowFeedbackModal(false); }}
              >
                <div className={`h-12 w-12 rounded-full flex items-center justify-center transition-colors ${hasBrandingRequest ? 'bg-green-100 dark:bg-green-900/50' : 'bg-orange-100 dark:bg-orange-900/30 group-hover:bg-orange-200 dark:group-hover:bg-orange-800/50'}`}>
                  <Paintbrush size={22} className={hasBrandingRequest ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'} />
                </div>
                <div className="text-left flex-1">
                  <div className="font-semibold text-base flex items-center gap-2">
                    Branding Request
                    {hasBrandingRequest && <Check size={16} className="text-green-600" />}
                  </div>
                  <div className="text-xs text-muted-foreground">{hasBrandingRequest ? 'View or update request' : 'Request branding materials'}</div>
                </div>
              </Button>
              
              {isJointSalesVisit && (
                <Button 
                  variant="outline" 
                  className={`w-full h-auto py-4 px-4 flex items-center gap-4 hover:bg-primary/5 hover:border-primary/50 transition-all group ${hasJointSalesFeedback ? 'border-green-300 bg-green-50/50 dark:bg-green-900/20' : ''}`} 
                  onClick={() => { recordAction('feedback').catch(() => {}); setFeedbackListType('joint-sales'); setShowFeedbackModal(false); }}
                >
                  <div className={`h-12 w-12 rounded-full flex items-center justify-center transition-colors ${hasJointSalesFeedback ? 'bg-green-100 dark:bg-green-900/50' : 'bg-green-100 dark:bg-green-900/30 group-hover:bg-green-200 dark:group-hover:bg-green-800/50'}`}>
                    <Users size={22} className={hasJointSalesFeedback ? 'text-green-600 dark:text-green-400' : 'text-green-600 dark:text-green-400'} />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-semibold text-base flex items-center gap-2">
                      Joint Sales Feedback
                      {hasJointSalesFeedback && <Check size={16} className="text-green-600" />}
                    </div>
                    <div className="text-xs text-muted-foreground">{hasJointSalesFeedback ? 'View or update feedback' : 'Record joint visit feedback'}</div>
                  </div>
                </Button>
              )}
              
              {!isJointSalesVisit && (
                <Button 
                  variant="outline" 
                  className={`w-full h-auto py-4 px-4 flex items-center gap-4 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-700 transition-all group ${hasJointSalesFeedback ? 'border-green-300 bg-green-50/50 dark:bg-green-900/20' : ''}`} 
                  onClick={() => { recordAction('feedback').catch(() => {}); setFeedbackListType('joint-sales'); setShowFeedbackModal(false); }}
                >
                  <div className={`h-12 w-12 rounded-full flex items-center justify-center transition-colors ${hasJointSalesFeedback ? 'bg-green-100 dark:bg-green-900/50' : 'bg-purple-100 dark:bg-purple-900/30 group-hover:bg-purple-200 dark:group-hover:bg-purple-800/50'}`}>
                    <UserCheck size={22} className={hasJointSalesFeedback ? 'text-green-600 dark:text-green-400' : 'text-purple-600 dark:text-purple-400'} />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-semibold text-base flex items-center gap-2">
                      Joint Visit Feedback
                      {hasJointSalesFeedback && <Check size={16} className="text-green-600" />}
                    </div>
                    <div className="text-xs text-muted-foreground">{hasJointSalesFeedback ? 'View or update feedback' : 'Record feedback from joint visit'}</div>
                  </div>
                </Button>
              )}
              
              <Button 
                variant="outline" 
                className={`w-full h-auto py-4 px-4 flex items-center gap-4 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-700 transition-all group ${hasCompetitionData ? 'border-green-300 bg-green-50/50 dark:bg-green-900/20' : ''}`} 
                onClick={() => { recordAction('feedback').catch(() => {}); setFeedbackListType('competition'); setShowFeedbackModal(false); }}
              >
                <div className={`h-12 w-12 rounded-full flex items-center justify-center transition-colors ${hasCompetitionData ? 'bg-green-100 dark:bg-green-900/50' : 'bg-red-100 dark:bg-red-900/30 group-hover:bg-red-200 dark:group-hover:bg-red-800/50'}`}>
                  <BarChart3 size={22} className={hasCompetitionData ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} />
                </div>
                <div className="text-left flex-1">
                  <div className="font-semibold text-base flex items-center gap-2">
                    Competition Insight
                    {hasCompetitionData && <Check size={16} className="text-green-600" />}
                  </div>
                  <div className="text-xs text-muted-foreground">{hasCompetitionData ? 'View or update data' : 'Record competitor information'}</div>
                </div>
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <StockCycleModal isOpen={showStockCycleModal} onClose={() => setShowStockCycleModal(false)} visitId={currentVisitId || visit.id} retailerId={(visit.retailerId || visit.id) as string} retailerName={visit.retailerName} />

        {/* Analytics Modal */}
        <AnalyticsModal isOpen={showAnalyticsModal} onClose={() => setShowAnalyticsModal(false)} visitId={currentVisitId || visit.id} retailerId={(visit.retailerId || visit.id) as string} retailerName={visit.retailerName} onViewDetails={onViewDetails} />

        {/* Stock Data Modal */}
        <StockDataModal isOpen={showStockDataModal} onClose={() => setShowStockDataModal(false)} retailerId={(visit.retailerId || visit.id) as string} retailerName={visit.retailerName} />

        {/* Payment Marking Modal */}
        <PaymentMarkingModal open={showPaymentModal} onOpenChange={setShowPaymentModal} retailerId={(visit.retailerId || visit.id) as string} currentPendingAmount={pendingAmount} onPaymentMarked={(newPendingAmount: number) => {
        // Update local state immediately with the new pending amount
        setPendingAmount(newPendingAmount);
        if (newPendingAmount === 0) {
          setPendingSinceDate(null);
        }
        // Also dispatch event for any other listeners
        window.dispatchEvent(new CustomEvent('visitStatusChanged'));
      }} />

        {/* Van Sales Modal */}
        {showVanSales && <VanSalesModal open={showVanSales} onOpenChange={setShowVanSales} retailerId={(visit.retailerId || visit.id) as string} visitId={currentVisitId || visit.id} />}

        {/* Retailer Analytics Modal */}
        {showRetailerAnalytics && <RetailerAnalytics isOpen={showRetailerAnalytics} retailer={{
        id: visit.retailerId || visit.id,
        name: visit.retailerName,
        type: visit.retailerCategory,
        phone: visit.phone,
        address: visit.address,
        lastVisitDate: visit.lastVisitDate,
        isSelected: false,
        priority: visit.priority,
        metrics: {
          avgOrders3Months: actualOrderValue,
          avgOrderPerVisit: actualOrderValue,
          visitsIn3Months: 1
        }
      }} onClose={() => setShowRetailerAnalytics(false)} />}

        {/* AI Insights Modal */}
        <VisitAIInsightsModal isOpen={showAIInsights} onClose={() => setShowAIInsights(false)} retailerId={(visit.retailerId || visit.id) as string} retailerName={visit.retailerName} visitId={currentVisitId || visit.id} />
        
        {/* Visit Details Modal */}
        {currentLog && <RetailerVisitDetailsModal open={showVisitDetailsModal} onOpenChange={setShowVisitDetailsModal} retailerName={visit.retailerName} startTime={currentLog.start_time} endTime={currentLog.end_time} timeSpent={timeSpent} distance={trackingDistance} locationStatus={trackingLocationStatus} actionType={currentLog.action_type} isPhoneOrder={currentLog.is_phone_order} logId={currentLog.id} />}
        
        {/* Joint Sales Feedback Modal */}
        {showJointSalesFeedback && (
          <JointSalesFeedbackModal
            isOpen={showJointSalesFeedback}
            onClose={() => setShowJointSalesFeedback(false)}
            retailerId={visit.retailerId || visit.id}
            retailerName={visit.retailerName}
            beatPlanId={beatPlanId}
            visitId={currentVisitId || undefined}
            managerId={jointSalesMemberId}
            onFeedbackSubmitted={() => setHasJointSalesFeedback(true)}
          />
        )}
        
        {/* Joint Sales Feedback View Modal */}
        {showJointSalesFeedbackView && (
          <JointSalesFeedbackViewModal
            isOpen={showJointSalesFeedbackView}
            onClose={() => setShowJointSalesFeedbackView(false)}
            retailerId={visit.retailerId || visit.id}
            retailerName={visit.retailerName}
            feedbackDate={selectedDate || getLocalTodayDate()}
            onEdit={() => {
              setShowJointSalesFeedbackView(false);
              setShowJointSalesFeedback(true);
            }}
            onDeleted={() => {
              setHasJointSalesFeedback(false);
              setShowJointSalesFeedbackView(false);
            }}
          />
        )}
        
        {/* Retailer Overview Modal */}
        {retailerOverviewData && (
          <RetailerDetailModal
            isOpen={showRetailerOverview}
            onClose={() => setShowRetailerOverview(false)}
            retailer={retailerOverviewData}
            onSuccess={() => {}}
          />
        )}

        {/* Feedback List Views */}
        {feedbackListType && (
          <FeedbackListView
            isOpen={!!feedbackListType}
            onClose={() => {
              setFeedbackListType(null);
              setFeedbackEditId(null);
              setFeedbackEditData(null);
            }}
            feedbackType={feedbackListType}
            retailerId={(visit.retailerId || visit.id) as string}
            retailerName={visit.retailerName}
            visitId={currentVisitId}
            selectedDate={selectedDate}
            onAddNew={() => {
              setFeedbackEditId(null);
              setFeedbackEditData(null);
              setFeedbackListType(null);
              if (feedbackListType === 'retailer') setFeedbackActiveTab('retailer-feedback');
              else if (feedbackListType === 'branding') setFeedbackActiveTab('branding');
              else if (feedbackListType === 'joint-sales') setFeedbackActiveTab('joint-sales-feedback');
              else if (feedbackListType === 'competition') setFeedbackActiveTab('competition');
              setShowFeedbackModal(true);
            }}
            onEdit={(id, data) => {
              const currentType = feedbackListType;
              setFeedbackEditId(id);
              setFeedbackEditData(data);
              setFeedbackListType(null);
              if (currentType === 'retailer') setFeedbackActiveTab('retailer-feedback');
              else if (currentType === 'branding') setFeedbackActiveTab('branding');
              else if (currentType === 'joint-sales') setFeedbackActiveTab('joint-sales-feedback');
              else if (currentType === 'competition') setFeedbackActiveTab('competition');
              setShowFeedbackModal(true);
            }}
          />
        )}

        {/* Credit Talking Points Dialog */}
        <Dialog open={showCreditTalkingPoints} onOpenChange={setShowCreditTalkingPoints}>
          <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Collection Tips for {visit.retailerName}</DialogTitle>
            </DialogHeader>
            <CollectionTalkingPoints
              outstandingAmount={pendingAmount}
              creditLimit={creditLimitData?.creditLimit || pendingAmount * 2}
              creditScore={creditLimitData?.score || 6}
              avgDso={creditLimitData?.avgDso || 35}
              targetDays={30}
              loyaltyPoints={0}
              onTimePaymentBonus={50}
              retailerName={visit.retailerName}
            />
          </DialogContent>
        </Dialog>

        {/* Cancel Order Dialog */}
        <CancelOrderDialog
          isOpen={showCancelOrderDialog}
          onClose={() => setShowCancelOrderDialog(false)}
          orders={ordersTodayList.map(o => ({
            id: o.id,
            invoice_number: o.invoice_number,
            total_amount: o.total_amount,
            is_credit_order: o.is_credit_order,
            credit_pending_amount: o.is_credit_order ? (o.total_amount - o.credit_paid_amount) : 0,
          }))}
          retailerName={visit.retailerName}
          onCancelled={async (cancelledIds: string[]) => {
            const remaining = ordersTodayList.filter(o => !cancelledIds.includes(o.id));

            if (remaining.length === 0) {
              // All orders cancelled — reset to fresh
              setHasOrderToday(false);
              setActualOrderValue(0);
              setCurrentStatus('planned');
              setOrderPreviewOpen(false);
              setOrderValueSource(null);
              setOrdersTodayList([]);
              setLastOrderItems([]);
              setLastOrderId(null);
              setCreditPendingAmount(0);
              setPaidTodayAmount(0);
              setIsCreditOrder(false);
            } else {
              // Partial cancellation — recalculate
              setOrdersTodayList(remaining);
              const newTotal = remaining.reduce((s, o) => s + o.total_amount, 0);
              setActualOrderValue(Math.round(newTotal));
              setOrderValueSource('db');
              const newCreditPending = remaining
                .filter(o => o.is_credit_order)
                .reduce((s, o) => s + (o.total_amount - o.credit_paid_amount), 0);
              setCreditPendingAmount(Math.max(0, newCreditPending));
              const newPaid = remaining.reduce((s, o) => s + o.credit_paid_amount, 0);
              setPaidTodayAmount(newPaid);
              setIsCreditOrder(remaining.some(o => o.is_credit_order));
              setLastOrderId(remaining[remaining.length - 1]?.id || null);
            }

            setShowCancelOrderDialog(false);

            const retailerId = (visit.retailerId || visit.id) as string;
            const today = selectedDate && selectedDate.length > 0 ? selectedDate : getLocalTodayDate();
            await visitStatusCache.invalidate(retailerId, userId, today);

            // Dispatch visitStatusChanged so TodaySummary and other listeners update immediately
            const newStatus = remaining.length === 0 ? 'planned' : 'productive';
            const newOrderValue = remaining.reduce((s, o) => s + o.total_amount, 0);
            window.dispatchEvent(new CustomEvent('visitStatusChanged', {
              detail: {
                visitId: currentVisitId || visit.id,
                retailerId,
                status: newStatus,
                orderValue: Math.round(newOrderValue),
              }
            }));

            // Force all react-query caches to refetch
            window.dispatchEvent(new CustomEvent('globalDataRefresh', {
              detail: { source: 'orderCancellation', retailerId }
            }));
          }}
        />

        {/* Location Capture Modal */}
        <Dialog open={showLocationCaptureModal} onOpenChange={setShowLocationCaptureModal}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MapPin size={18} className="text-destructive" />
                Location Not Captured
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This retailer doesn't have a GPS location saved. Please capture the current location before placing an order.
            </p>
            <div className="flex gap-2 justify-end mt-2">
              <Button variant="outline" size="sm" onClick={() => setShowLocationCaptureModal(false)}>
                Cancel
              </Button>
              <Button 
                size="sm" 
                disabled={isCapturingLocation}
                onClick={async () => {
                  setIsCapturingLocation(true);
                  try {
                    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                      navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 15000,
                        maximumAge: 0,
                      });
                    });
                    
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    const retailerId = (visit.retailerId || visit.id) as string;

                    const { error } = await supabase
                      .from('retailers')
                      .update({ latitude: lat, longitude: lng })
                      .eq('id', retailerId);

                    if (error) throw error;

                    setRetailerLat(lat);
                    setRetailerLng(lng);
                    setShowLocationCaptureModal(false);

                    toast({
                      title: "Location Captured",
                      description: "Retailer location has been saved successfully. You can now place the order.",
                    });
                  } catch (err: any) {
                    console.error('Location capture error:', err);
                    toast({
                      title: "Location Capture Failed",
                      description: err?.message || "Could not get your current location. Please enable GPS and try again.",
                      variant: "destructive",
                    });
                  } finally {
                    setIsCapturingLocation(false);
                  }
                }}
              >
                {isCapturingLocation ? "Capturing..." : "Capture Location"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>;
};