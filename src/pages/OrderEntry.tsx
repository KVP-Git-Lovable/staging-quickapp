import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Package, Gift, ArrowLeft, Plus, Check, Grid3X3, Table, Minus, ChevronDown, ChevronRight, Search, X, XCircle, UserX, DoorClosed, Camera, RotateCcw, Star, Sparkles, Target, MessageSquare, Mic, Clock, AlertCircle, Loader2 } from "lucide-react";
import { hasAttendanceTodayOfflineSupport } from "@/utils/attendanceUtils";
import { offlineStorage, STORES } from "@/lib/offlineStorage";
import { VoiceOrderAssistant } from "@/components/VoiceOrderAssistant";
import { SmartBasketButton } from "@/components/SmartBasketButton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { TableOrderForm, TableOrderFormHandle } from "@/components/TableOrderForm";
import { OrderSummaryModal } from "@/components/OrderSummaryModal";
import { SchemeDetailsModal } from "@/components/SchemeDetailsModal";
import { supabase } from "@/integrations/supabase/client";
import { ImageStockCapture } from "@/components/ImageStockCapture";
import { ReturnStockForm } from "@/components/ReturnStockForm";
import { CompetitionDataForm } from "@/components/CompetitionDataForm";
import { useCheckInMandatory } from "@/hooks/useCheckInMandatory";
import { isFocusedProductActive } from "@/utils/focusedProductChecker";
import { useOfflineOrderEntry } from "@/hooks/useOfflineOrderEntry";
import { useMasterDataCache } from "@/hooks/useMasterDataCache";
import { buildRetailerContext, filterAvailableProducts } from "@/utils/productAvailability";
import { WifiOff, Wifi, MapPin, CheckCircle2, AlertTriangle } from "lucide-react";
import { useRetailerVisitTracking } from "@/hooks/useRetailerVisitTracking";
import { RetailerVisitDetailsModal } from "@/components/RetailerVisitDetailsModal";
import { getLocalTodayDate } from "@/utils/dateUtils";
import { OrderGuideManualButton } from "@/components/OrderGuideManualButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Product {
  id: string;
  name: string;
  category: string;
  rate: number;
  unit: string;
  base_unit?: string;
  hsn_code?: string;
  hasScheme?: boolean;
  schemeDetails?: string;
  closingStock?: number;
  is_focused_product?: boolean;
  focused_type?: string | null;
  focused_due_date?: string | null;
  focused_recurring_config?: any;
  focused_territories?: string[] | null;
}
interface CartItem extends Product {
  quantity: number;
  total: number;
  schemeConditionQuantity?: number;
  schemeDiscountPercentage?: number;
  schemes?: Array<{
    is_active: boolean;
    condition_quantity?: number;
    discount_percentage?: number;
  }>;
}
interface GridProduct {
  id: string;
  name: string;
  category: string;
  rate: number;
  unit: string;
  base_unit?: string;
  conversion_factor?: number;
  hsn_code?: string;
  hasScheme?: boolean;
  schemeDetails?: string;
  schemeConditionQuantity?: number;
  schemeDiscountPercentage?: number;
  closingStock?: number;
  variants?: ProductVariant[];
  selectedVariantId?: string;
  sku?: string;
  is_focused_product?: boolean;
  focused_type?: string | null;
  focused_due_date?: string | null;
  focused_recurring_config?: any;
  focused_territories?: string[] | null;
}
interface ProductVariant {
  id: string;
  variant_name: string;
  sku: string;
  price: number;
  stock_quantity: number;
  discount_amount: number;
  discount_percentage: number;
  is_active: boolean;
  hsn_code?: string;
  is_focused_product?: boolean;
  focused_type?: string | null;
  focused_due_date?: string | null;
  focused_recurring_config?: any;
  focused_territories?: string[] | null;
}
export const OrderEntry = () => {
  const {
    t
  } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const visitId = searchParams.get("visitId") || '';
  const retailerId = searchParams.get("retailerId") || '';
  const retailerName = searchParams.get("retailer") || "Retailer Name";
  const isPhoneOrder = searchParams.get("phoneOrder") === "true";
  const editOrderId = searchParams.get("editOrderId") || '';
  const isEditMode = !!editOrderId;
  const source = searchParams.get("source") || '';
  const isAdminEdit = source === 'admin' && isEditMode;
  const [editInvoiceNumber, setEditInvoiceNumber] = React.useState<string | null>(null);
  const {
    isCheckInMandatory,
    loading: checkInMandatoryLoading
  } = useCheckInMandatory();
  
  // Offline order entry hook
  const {
    products: cachedProducts,
    loading: offlineLoading,
    isOnline,
    fetchProducts: fetchOfflineProducts,
    resetFetchGuard: resetOfflineProductsGuard
  } = useOfflineOrderEntry();

  // Force-refresh the full master data cache (re-syncs products end-to-end).
  // Used by the "Refresh products" button + the 10-min staleness check on open.
  const { forceRefreshMasterData, availabilityByProductId, territoriesById } = useMasterDataCache();

  // Manual refresh: re-sync product master AND reload the picker list.
  const reloadProductsFromMaster = useCallback(async () => {
    try {
      await forceRefreshMasterData();
    } catch (err) {
      console.warn('[OrderEntry] forceRefreshMasterData failed, falling back to local fetch', err);
    }
    // Reset the in-memory de-dupe guard so the next fetchOfflineProducts
    // actually re-reads the freshly cached rows instead of returning early.
    // Reset the in-memory de-dupe guard so the next fetchOfflineProducts
    // actually re-reads the freshly cached rows instead of returning early.
    resetOfflineProductsGuard?.();
    await fetchOfflineProducts();
  }, [forceRefreshMasterData, fetchOfflineProducts, resetOfflineProductsGuard]);

  // On OPEN: if online and cache is older than ~10 min, kick a background refresh
  // so newly-added products appear without waiting for the 45-min interval.
  useEffect(() => {
    if (!navigator.onLine) return;
    const lastCached = parseInt(localStorage.getItem('master_data_cached_at') || '0', 10);
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    if (!lastCached || lastCached < tenMinAgo) {
      console.log('[OrderEntry] Master data >10 min old — background refresh');
      forceRefreshMasterData().catch(err =>
        console.warn('[OrderEntry] Background master refresh failed', err)
      );
    }
    // Run once when the screen mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // PERF: keep Order Entry ultra-fast even on slow/no network
  const DEV_LOG = false;

  // Confirm connectivity quickly (do not rely only on navigator.onLine)
  const [connectivity, setConnectivity] = useState<"checking" | "online" | "offline">(
    navigator.onLine ? "checking" : "offline"
  );

  useEffect(() => {
    let cancelled = false;

    const ping = async () => {
      // If browser already knows it's offline, trust it immediately
      if (!navigator.onLine) {
        if (!cancelled) setConnectivity("offline");
        return;
      }

      if (!cancelled) setConnectivity("checking");

      try {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 800);
        const res = await fetch("/ping.txt", {
          method: "HEAD",
          cache: "no-store",
          signal: controller.signal,
        });
        window.clearTimeout(timeoutId);
        if (!cancelled) setConnectivity(res.ok ? "online" : "offline");
      } catch {
        if (!cancelled) setConnectivity("offline");
      }
    };

    // Run once immediately, then respond to connectivity changes
    ping();

    const onOnline = () => ping();
    const onOffline = () => setConnectivity("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Allow features to work when online OR still checking (optimistic)
  const isActuallyOnline = connectivity === "online" || connectivity === "checking";

  // getLocalDateString is now imported from @/utils/dateUtils as getLocalTodayDate
  const getLocalDateString = getLocalTodayDate;
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [quantities, setQuantities] = useState<{
    [key: string]: number;
  }>({});
  const [closingStocks, setClosingStocks] = useState<{
    [key: string]: number;
  }>({});
  const [selectedVariants, setSelectedVariants] = useState<{
    [key: string]: string;
  }>({});
  const [selectedUnits, setSelectedUnits] = useState<{
    [key: string]: string;
  }>({});
  const [orderMode, setOrderMode] = useState<"grid" | "table" | "no-order" | "return-stock" | "competition">("table");
  const [searchTerm, setSearchTerm] = useState("");
  const [noOrderReason, setNoOrderReason] = useState<string>("");
  const [customNoOrderReason, setCustomNoOrderReason] = useState<string>("");
  const [noOrderSubmitting, setNoOrderSubmitting] = useState(false);
  const [showOverstockPrompt, setShowOverstockPrompt] = useState(false);
  const [hasCompetitionData, setHasCompetitionData] = useState(false);
  const [categories, setCategories] = useState<string[]>(["All"]);
  const [products, setProducts] = useState<GridProduct[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loggedInUserName, setLoggedInUserName] = useState<string>("User");
  const [schemes, setSchemes] = useState<any[]>([]);
  const [expandedProducts, setExpandedProducts] = useState<{
    [key: string]: boolean;
  }>({});
  const [hasAutoExpanded, setHasAutoExpanded] = useState(false);
  
  // Ref for TableOrderForm to call applyVoiceAutoFill
  const tableFormRef = useRef<TableOrderFormHandle>(null);

  // Fetch and set user ID on component mount
  useEffect(() => {
    const fetchUserId = async () => {
      // First try to get from localStorage cache (instant, works offline)
      const cachedUserId = localStorage.getItem('cached_user_id');
      if (cachedUserId) {
        setUserId(cachedUserId);
        console.log('✅ User ID set from cache:', cachedUserId);
      }
      
      try {
        // Use getSession() instead of getUser() - reads from localStorage cache, works offline
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUserId(session.user.id);
          console.log('✅ User ID set from session:', session.user.id);
          // Update cache
          localStorage.setItem('cached_user_id', session.user.id);
        } else if (!cachedUserId) {
          // No session and no cache - try getUser as last resort
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            setUserId(user.id);
            localStorage.setItem('cached_user_id', user.id);
            console.log('✅ User ID set from getUser:', user.id);
          }
        }
      } catch (error) {
        console.log('Error fetching user session (may be offline):', error);
        // Already set from cache above, so this is fine
      }
    };
    
    fetchUserId();
  }, []);

  // Reset auto-expand flag whenever category changes
  useEffect(() => {
    setHasAutoExpanded(false);
  }, [selectedCategory]);

  // Auto-expand first product with variants when products are loaded
  useEffect(() => {
    if (products.length > 0 && !hasAutoExpanded) {
      // Filter products based on selected category
      const productsToCheck = selectedCategory === "All" ? products : products.filter(p => p.category === selectedCategory);
      const firstProductWithVariants = productsToCheck.find(p => p.variants && p.variants.length > 0);
      if (firstProductWithVariants) {
        console.log('Auto-expanding first product with variants:', firstProductWithVariants.name);
        setExpandedProducts({
          [firstProductWithVariants.id]: true
        });
        setHasAutoExpanded(true);
      }
    }
  }, [products, selectedCategory, hasAutoExpanded]);
  
  const [showOrderSummary, setShowOrderSummary] = useState(false);
  const [currentProductName, setCurrentProductName] = useState<string>("Product");
  const [showSchemeModal, setShowSchemeModal] = useState(false);
  const [selectedProductForScheme, setSelectedProductForScheme] = useState<GridProduct | null>(null);
  const [filteredSchemes, setFilteredSchemes] = useState<any[]>([]);
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());
  const [showImageCapture, setShowImageCapture] = useState(false);

  // --- Edit-order mode state (mirrors Cart edit bootstrap) ---
  const [editLoading, setEditLoading] = useState<boolean>(isEditMode);
  const [editBlockedReason, setEditBlockedReason] = useState<string | null>(null);

  // Function to auto-select "Over Stocked" option
  const handleAutoSelectOverStocked = async () => {
    if (!visitId) return;
    try {
      // First check if there's already a confirmed order for this visit
      const {
        data: existingOrders
      } = await supabase.from('orders').select('id').eq('visit_id', visitId).eq('status', 'confirmed');

      // If an order already exists, don't mark as unproductive
      if (existingOrders && existingOrders.length > 0) {
        console.log('Order already exists for this visit. Not marking as unproductive.');
        return;
      }

      // Only mark as unproductive if no order exists
      const {
        error
      } = await supabase.from('visits').update({
        status: 'unproductive',
        no_order_reason: 'over-stocked'
      }).eq('id', visitId);
      if (error) {
        console.error('Error auto-selecting over stocked:', error);
      } else {
        console.log('Auto-selected "Over Stocked" for visit:', visitId);
        
        // Also update cache to ensure immediate reflection
        try {
          const cachedVisit = await offlineStorage.getById<any>('visits', visitId);
          if (cachedVisit) {
            await offlineStorage.save('visits', {
              ...cachedVisit,
              status: 'unproductive',
              no_order_reason: 'over-stocked'
            });
          }
        } catch (cacheError) {
          console.log('Cache update skipped:', cacheError);
        }
      }
    } catch (error) {
      console.error('Error in handleAutoSelectOverStocked:', error);
    }
  };
  
  // Fix retailerId validation - don't use "." as a valid retailerId  
  const validRetailerId = retailerId && retailerId !== '.' && retailerId.length > 1 ? retailerId : null;
  const validVisitId = visitId && visitId.length > 1 ? visitId : null;

  // Retailer visit tracking states
  const [retailerLat, setRetailerLat] = useState<number | undefined>(undefined);
  const [retailerLng, setRetailerLng] = useState<number | undefined>(undefined);
  const [retailerBeatId, setRetailerBeatId] = useState<string | undefined>(undefined);
  // Phase 7-3: full retailer record (state/region/zone/territory_id/distributor_id) for availability ctx.
  const [selectedRetailerForAvail, setSelectedRetailerForAvail] = useState<any>(null);
  const [showVisitDetailsModal, setShowVisitDetailsModal] = useState(false);
  const [hasTrackedVisit, setHasTrackedVisit] = useState(false);
  const [isSettingLocation, setIsSettingLocation] = useState(false);

  // Global check-in capture: track if first interaction has been recorded
  const hasRecordedFirstInteraction = useRef(false);

  // Attendance gate state - block order entry until attendance is marked
  const [attendanceChecked, setAttendanceChecked] = useState(false);
  const [hasAttendance, setHasAttendance] = useState(false);
  const [checkingAttendance, setCheckingAttendance] = useState(true);

  // Function to set retailer location from current GPS
  const setRetailerLocation = async () => {
    if (!validRetailerId) {
      toast({
        title: "Error",
        description: "No retailer selected",
        variant: "destructive"
      });
      return;
    }

    setIsSettingLocation(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        });
      });

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      // Update retailer in database
      const { error } = await supabase
        .from('retailers')
        .update({
          latitude: lat,
          longitude: lng,
          updated_at: new Date().toISOString()
        })
        .eq('id', validRetailerId);

      if (error) throw error;

      // Update local state
      setRetailerLat(lat);
      setRetailerLng(lng);

      toast({
        title: "Location Set",
        description: "Retailer GPS location saved successfully",
      });

      // Restart tracking with new coordinates
      if (hasTrackedVisit) {
        await startTracking('order', isPhoneOrder);
      }
    } catch (error: any) {
      console.error('Error setting retailer location:', error);
      toast({
        title: "Location Error",
        description: error.message || "Failed to capture GPS location",
        variant: "destructive"
      });
    } finally {
      setIsSettingLocation(false);
    }
  };
  
  // Initialize visit tracking hook
  const {
    currentLog,
    locationStatus,
    distance,
    timeSpent,
    formattedTimeSpent,
    startTracking,
    endTracking,
    recordActivity,
    recordAction,
    recheckLocation
  } = useRetailerVisitTracking({
    retailerId: validRetailerId || '',
    retailerLat,
    retailerLng,
    visitId: validVisitId || undefined,
    userId: userId || '',
    selectedDate: getLocalDateString()
  });

  // Check attendance on mount - OFFLINE FIRST
  useEffect(() => {
    const checkAttendance = async () => {
      if (isAdminEdit) {
        // Admin editing from Operations: bypass field-rep attendance gate.
        setHasAttendance(true);
        setAttendanceChecked(true);
        setCheckingAttendance(false);
        return;
      }
      if (!userId) {
        setCheckingAttendance(false);
        return;
      }
      
      try {
        // Use offline-first check - checks Supabase first, falls back to cache
        const hasMarkedAttendance = await hasAttendanceTodayOfflineSupport(userId);
        setHasAttendance(hasMarkedAttendance);
        setAttendanceChecked(true);
      } catch (error) {
        console.error('Error checking attendance:', error);
        // If check fails, also check offline storage directly as fallback
        try {
          await offlineStorage.init();
          const cachedAttendance = await offlineStorage.getAll(STORES.ATTENDANCE);
          const todayStr = new Date().toISOString().split('T')[0];
          const hasLocal = cachedAttendance.some(
            (a: any) => a.user_id === userId && a.date === todayStr
          );
          setHasAttendance(hasLocal);
        } catch {
          setHasAttendance(false);
        }
        setAttendanceChecked(true);
      } finally {
        setCheckingAttendance(false);
      }
    };
    
    checkAttendance();
  }, [userId, isAdminEdit]);

  // Global click handler - ANY click/touch inside Order Entry page triggers check-in
  const handlePageInteraction = useCallback(() => {
    if (isAdminEdit) return; // No visit check-in capture for admin edits
    if (!hasRecordedFirstInteraction.current && userId) {
      hasRecordedFirstInteraction.current = true;
      console.log('📍 First page interaction - capturing check-in');
      recordAction('order').catch((err) => console.log('Check-in error (non-fatal):', err));
    }
  }, [userId, recordAction, isAdminEdit]);
  
  // Fetch retailer coordinates - CACHE FIRST, non-blocking
  useEffect(() => {
    if (!validRetailerId) return;

    const loadRetailerCoordinates = async () => {
      // 1) Try cache first (instant) - from offlineStorage
      try {
        const cachedRetailers = await offlineStorage.getAll<any>(STORES.RETAILERS);
        const cachedRetailer = cachedRetailers.find((r: any) => r.id === validRetailerId);

        if (cachedRetailer) {
          setSelectedRetailerForAvail(cachedRetailer);
        }
        if (cachedRetailer?.latitude && cachedRetailer?.longitude) {
          setRetailerLat(cachedRetailer.latitude);
          setRetailerLng(cachedRetailer.longitude);
        }
        if (cachedRetailer?.beat_id) {
          setRetailerBeatId(cachedRetailer.beat_id);
        }
      } catch (cacheError) {
        DEV_LOG && console.log('📍 Cache read failed (non-critical):', cacheError);
      }

      // 2) Background network fetch - ONLY when confirmed online (never block UI)
      if (isActuallyOnline) {
        const fetchFromNetwork = () => {
          supabase
            .from('retailers')
            .select('latitude, longitude, beat_id')
            .eq('id', validRetailerId)
            .single()
            .then(({ data, error }) => {
              if (!error && data) {
                if (data.latitude && data.longitude) {
                  setRetailerLat(data.latitude);
                  setRetailerLng(data.longitude);
                }
                if (data.beat_id) {
                  setRetailerBeatId(data.beat_id);
                }
              }
            });
        };

        requestIdleCallback?.(fetchFromNetwork) || setTimeout(fetchFromNetwork, 50);
      }
    };

    loadRetailerCoordinates();
  }, [validRetailerId, isActuallyOnline]);

  // Auto-capture retailer GPS if missing - silently update retailer record
  const hasAttemptedGpsCapture = useRef(false);
  useEffect(() => {
    if (!validRetailerId || hasAttemptedGpsCapture.current) return;
    // Wait a bit for retailer coords to load from cache/network
    const timer = setTimeout(() => {
      if (retailerLat || retailerLng) return; // Already has coordinates
      hasAttemptedGpsCapture.current = true;
      
      if (!navigator.geolocation) return;
      
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = Number(position.coords.latitude.toFixed(7));
          const lng = Number(position.coords.longitude.toFixed(7));
          
          // Update retailer record in Supabase
          const { error } = await supabase
            .from('retailers')
            .update({ latitude: lat, longitude: lng, updated_at: new Date().toISOString() })
            .eq('id', validRetailerId);
          
          if (!error) {
            setRetailerLat(lat);
            setRetailerLng(lng);
            toast({
              title: '📍 Location Updated',
              description: 'Retailer location captured automatically',
              duration: 3000,
            });
          }
        },
        (err) => {
          console.log('Auto GPS capture failed (non-critical):', err.message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }, 3000); // Wait 3s for existing coords to load first

    return () => clearTimeout(timer);
  }, [validRetailerId, retailerLat, retailerLng]);

  // Debug location tracking state (disabled for performance)
  useEffect(() => {
    if (!DEV_LOG) return;
    console.log('📍 Location tracking state:', {
      retailerLat,
      retailerLng,
      locationStatus,
      distance,
      hasCoords: !!(retailerLat && retailerLng)
    });
  }, [retailerLat, retailerLng, locationStatus, distance]);
  
  // Use visitId and retailerId from URL params consistently
  const activeStorageKey = isEditMode
    ? `order_cart:edit:${editOrderId}`
    : (validVisitId && validRetailerId ? `order_cart:${validVisitId}:${validRetailerId}` : validRetailerId ? `order_cart:temp:${validRetailerId}` : 'order_cart:fallback');

  // --- Edit-order bootstrap: guard with canEditOrder + seed cart from original order_items ---
  useEffect(() => {
    if (!isEditMode) return;
    let cancelled = false;
    (async () => {
      try {
        setEditLoading(true);
        setEditBlockedReason(null);

        if (!navigator.onLine) {
          setEditBlockedReason('Editing requires an internet connection.');
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id;
        if (!uid) {
          setEditBlockedReason("You don't have permission to edit orders.");
          return;
        }

        const { data: order, error: orderErr } = await supabase
          .from('orders')
          .select('id, status, invoice_generated_at, dispatched_at, user_id, visit_id, retailer_id, total_amount, invoice_number')
          .eq('id', editOrderId)
          .maybeSingle();
        if (orderErr || !order) {
          setEditBlockedReason("This order can't be edited in its current state.");
          return;
        }
        if (!cancelled) setEditInvoiceNumber((order as any)?.invoice_number || null);

        const { data: policyRow } = await supabase
          .from('order_edit_policy')
          .select('edit_enabled, editable_until')
          .limit(1)
          .maybeSingle();
        const policy = policyRow
          ? { edit_enabled: !!policyRow.edit_enabled, editable_until: policyRow.editable_until || 'invoice_generated' }
          : { edit_enabled: true, editable_until: 'invoice_generated' as const };

        const { data: up } = await supabase
          .from('user_profiles')
          .select('profile_id')
          .eq('user_id', uid)
          .maybeSingle();
        const profileId = up?.profile_id || null;
        let hasEdit = false;
        if (profileId) {
          const { data: perms } = await supabase
            .from('profile_object_permissions')
            .select('object_name, can_edit')
            .eq('profile_id', profileId)
            .eq('object_name', 'action_order_edit');
          hasEdit = !!(perms && perms.some((p: any) => p.can_edit));
        }
        const permMap = { action_order_edit: hasEdit };

        const { canEditOrder } = await import('@/utils/canEditOrder');
        const decision = canEditOrder(order as any, permMap as any, policy as any);
        if (!decision.allowed) {
          setEditBlockedReason(decision.reason);
          return;
        }

        if (cancelled) return;

        // Seed cart from original order_items, ONLY if the edit cart is empty
        const editKey = `order_cart:edit:${editOrderId}`;
        const existing = localStorage.getItem(editKey);
        const isEmpty = !existing || existing === 'undefined' || existing === 'null' || existing === '[]';
        if (isEmpty) {
          const { data: items, error: itemsError } = await supabase
            .from('order_items')
            .select('id, product_id, variant_id, product_name, category, rate, unit, quantity, total, hsn_code, uom_id, uom_code, conversion_to_base, original_rate, discount_amount')
            .eq('order_id', editOrderId);
          if (itemsError) {
            console.error('[OrderEntry][edit] failed to load original order_items:', itemsError);
            localStorage.setItem(editKey, JSON.stringify([]));
            if (!cancelled) {
              setCart([]);
              syncQuantitiesFromCart([]);
            }
            return;
          }
          if (!Array.isArray(items) || items.length === 0) {
            console.error('[OrderEntry][edit] no original order_items found for order:', editOrderId);
            localStorage.setItem(editKey, JSON.stringify([]));
            if (!cancelled) {
              setCart([]);
              syncQuantitiesFromCart([]);
            }
            return;
          }
          const seeded: CartItem[] = (items || []).map((it: any) => {
            const cartId = it.variant_id
              ? `${it.product_id || it.id}_variant_${it.variant_id}`
              : (it.product_id || it.id);
            const liveProduct = it.product_id ? products.find(p => p.id === it.product_id) : undefined;
            const liveVariant = liveProduct && it.variant_id
              ? liveProduct.variants?.find((v: any) => v.id === it.variant_id)
              : undefined;
            return {
              id: cartId,
              name: it.product_name,
              category: it.category || '',
              rate: Number(it.rate) || 0,
              unit: it.unit || 'pcs',
              quantity: Number(it.quantity) || 0,
              total: Number(it.total) || 0,
              hsn_code: it.hsn_code || undefined,
              closingStock: (liveVariant as any)?.stock_quantity ?? liveProduct?.closingStock ?? undefined,
              ...(it.product_id ? { product_id: it.product_id } : {}),
              ...(it.variant_id ? { variant_id: it.variant_id } : {}),
              ...(it.original_rate ? { original_rate: Number(it.original_rate) } : {}),
            } as any;
          });
          localStorage.setItem(editKey, JSON.stringify(seeded));
          if (!cancelled) {
            setCart(seeded);
            syncQuantitiesFromCart(seeded);
          }
        }
      } catch (e: any) {
        console.error('[OrderEntry][edit] bootstrap failed:', e);
        if (!cancelled) setEditBlockedReason(e?.message || "This order can't be edited in its current state.");
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isEditMode, editOrderId]);

  // NOTE: Avoid logging in render path to keep Order Entry fast on slow devices/networks


  // Load cart and sync quantities - this runs every time we come back to OrderEntry
  useEffect(() => {
    try {
      if (!activeStorageKey) return;

      const raw = localStorage.getItem(activeStorageKey);
      if (raw) {
        const cartData = JSON.parse(raw) as CartItem[];
        setCart(cartData);
        // Sync quantities from cart to order entry immediately - CRITICAL for persistence
        syncQuantitiesFromCart(cartData);
        return;
      }
    } catch (error) {
      console.error('Error loading cart:', error);
    }
  }, [activeStorageKey]);

  // Additional effect to ensure quantities are always synced when returning from cart
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Page became visible - likely returning from cart
        console.log('Page became visible, re-syncing cart data');
        const rawUser = localStorage.getItem(activeStorageKey);
        if (rawUser) {
          try {
            const cartData = JSON.parse(rawUser) as CartItem[];
            syncQuantitiesFromCart(cartData);
          } catch (error) {
            console.error('Error re-syncing cart on visibility change:', error);
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also sync on window focus (when coming back from another tab/page)
    const handleFocus = () => {
      console.log('Window focused, re-syncing cart data');
      const rawUser = localStorage.getItem(activeStorageKey);
      if (rawUser) {
        try {
          const cartData = JSON.parse(rawUser) as CartItem[];
          syncQuantitiesFromCart(cartData);
        } catch (error) {
          console.error('Error re-syncing cart on focus:', error);
        }
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [activeStorageKey]);

  // Function to sync quantities from cart back to order entry
  const syncQuantitiesFromCart = (cartData: CartItem[]) => {
    const newQuantities: {
      [key: string]: number;
    } = {};
    const newStocks: {
      [key: string]: number;
    } = {};
    const newVariants: {
      [key: string]: string;
    } = {};
    console.log('=== Syncing cart data to OrderEntry ===', cartData);
    cartData.forEach(item => {
      console.log('Processing cart item:', {
        id: item.id,
        quantity: item.quantity,
        name: item.name
      });

      // Check if this is a variant item (format: baseId_variant_variantId)
      if (item.id.includes('_variant_')) {
        const parts = item.id.split('_variant_');
        if (parts.length === 2) {
          const baseProductId = parts[0];
          const variantId = parts[1];
          console.log('Found variant item:', {
            baseProductId,
            variantId,
            quantity: item.quantity
          });

          // For variant items, store quantity under the full variant ID and set the variant selection
          newQuantities[item.id] = item.quantity; // Store under full variant ID
          newVariants[baseProductId] = variantId;

          // Also set the variant-specific stock if available
          if (item.closingStock) {
            newStocks[item.id] = item.closingStock;
          }
        }
      } else {
        // This is a base product, set its quantity directly
        console.log('Found base product:', {
          id: item.id,
          quantity: item.quantity
        });
        newQuantities[item.id] = item.quantity;

        // Set stock if available
        if (item.closingStock) {
          newStocks[item.id] = item.closingStock;
        }
      }
    });
    // Apply synced data to OrderEntry state (no logging for performance)
    setQuantities(prev => ({
      ...prev,
      ...newQuantities,
    }));

    setClosingStocks(prev => ({
      ...prev,
      ...newStocks,
    }));

    setSelectedVariants(prev => ({
      ...prev,
      ...newVariants,
    }));

    // Also update the addedItems set (by base product id) so the green state persists
    const addedBaseIds = new Set<string>();
    cartData.forEach(item => {
      const baseId = item.id.includes('_variant_') ? item.id.split('_variant_')[0] : item.id;
      if ((item.quantity || 0) > 0) addedBaseIds.add(baseId);
    });
    setAddedItems(prev => new Set([...prev, ...Array.from(addedBaseIds)]));
  };
  useEffect(() => {
    localStorage.setItem(activeStorageKey, JSON.stringify(cart));

    // Also save quantities, variants, and stocks separately for persistence
    const quantityKey = activeStorageKey.replace('order_cart:', 'order_quantities:');
    const variantKey = activeStorageKey.replace('order_cart:', 'order_variants:');
    const stockKey = activeStorageKey.replace('order_cart:', 'order_stocks:');
    localStorage.setItem(quantityKey, JSON.stringify(quantities));
    localStorage.setItem(variantKey, JSON.stringify(selectedVariants));
    localStorage.setItem(stockKey, JSON.stringify(closingStocks));
  }, [cart, activeStorageKey, quantities, selectedVariants, closingStocks]);

  // Load saved form data when storage key changes or products are loaded
  useEffect(() => {
    if (!activeStorageKey) return;

    const quantityKey = activeStorageKey.replace('order_cart:', 'order_quantities:');
    const variantKey = activeStorageKey.replace('order_cart:', 'order_variants:');
    const stockKey = activeStorageKey.replace('order_cart:', 'order_stocks:');

    // Load quantities
    const savedQuantities = localStorage.getItem(quantityKey);
    if (savedQuantities) {
      try {
        const parsedQuantities = JSON.parse(savedQuantities);
        setQuantities(prev => ({
          ...prev,
          ...parsedQuantities,
        }));
      } catch (error) {
        console.error('Error loading saved quantities:', error);
      }
    }

    // Load selected variants
    const savedVariants = localStorage.getItem(variantKey);
    if (savedVariants) {
      try {
        const parsedVariants = JSON.parse(savedVariants);
        setSelectedVariants(prev => ({
          ...prev,
          ...parsedVariants,
        }));
      } catch (error) {
        console.error('Error loading saved variants:', error);
      }
    }

    // Load closing stocks
    const savedStocks = localStorage.getItem(stockKey);
    if (savedStocks) {
      try {
        const parsedStocks = JSON.parse(savedStocks);
        setClosingStocks(prev => ({
          ...prev,
          ...parsedStocks,
        }));
      } catch (error) {
        console.error('Error loading saved stocks:', error);
      }
    }

    // Also sync from cart data to ensure consistency
    const cartData = localStorage.getItem(activeStorageKey);
    if (cartData) {
      try {
        const parsedCart = JSON.parse(cartData) as CartItem[];
        syncQuantitiesFromCart(parsedCart);
      } catch (error) {
        console.error('Error syncing from cart:', error);
      }
    }
  }, [activeStorageKey, products.length]);
  // Load products from offline hook on mount - only once
  useEffect(() => {
    fetchOfflineProducts();
  }, [fetchOfflineProducts]);

  // Map cached products ONLY when Grid mode is used (keeps initial Table load fast)
  useEffect(() => {
    if (orderMode !== "grid") return;
    if (!cachedProducts || cachedProducts.length === 0) return;

    const run = () => {
      try {
        console.log('📦 Mapping cached products (grid mode):', cachedProducts.length);

        // Extract unique categories
        const uniqueCategories = new Set<string>();
        cachedProducts.forEach((p: any) => {
          const categoryName = p.category?.name || 'Uncategorized';
          uniqueCategories.add(categoryName);
        });
        setCategories(['All', ...Array.from(uniqueCategories)]);

        // Map products to GridProduct format
        const mapped: GridProduct[] = cachedProducts.map((p: any) => {
          const categoryName = p.category?.name || 'Uncategorized';
          const productSchemes = p.schemes || [];
          const productVariants = p.variants || [];

          return {
            id: p.id,
            name: p.name,
            category: categoryName,
            rate: p.rate,
            unit: p.unit,
            base_unit: p.base_unit,
            conversion_factor: p.conversion_factor,
            closingStock: p.closing_stock || 0,
            sku: p.sku,
            hasScheme: productSchemes.length > 0,
            schemeDetails:
              productSchemes.length > 0
                ? `Buy ${productSchemes[0].condition_quantity} get ${productSchemes[0].discount_percentage}% off`
                : undefined,
            schemeConditionQuantity: productSchemes[0]?.condition_quantity,
            schemeDiscountPercentage: productSchemes[0]?.discount_percentage,
            variants: productVariants.map((v: any) => ({
              id: v.id,
              variant_name: v.variant_name,
              sku: v.sku,
              price: v.price,
              stock_quantity: v.stock_quantity,
              discount_amount: v.discount_amount,
              discount_percentage: v.discount_percentage,
              is_active: v.is_active,
              is_focused_product: v.is_focused_product,
              focused_type: v.focused_type,
              focused_due_date: v.focused_due_date,
              focused_recurring_config: v.focused_recurring_config,
              focused_territories: v.focused_territories,
            })),
            is_focused_product: p.is_focused_product,
            focused_type: p.focused_type,
            focused_due_date: p.focused_due_date,
            focused_recurring_config: p.focused_recurring_config,
            focused_territories: p.focused_territories,
          };
        });

        setProducts(mapped);
        setSchemes(cachedProducts.flatMap((p: any) => p.schemes || []));
        console.log('✅ Mapped products (grid mode):', mapped.length);
      } catch (error) {
        console.error('💥 Error mapping cached products:', error);
      }
    };

    // Defer heavy mapping so the Order Entry page becomes interactive immediately
    const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void) => void);
    if (ric) ric(run);
    else setTimeout(run, 0);
  }, [cachedProducts, orderMode]);

  // Real-time subscriptions DISABLED for performance
  // Products load from cache instantly and sync in background
  // No need to re-fetch on every database change
  /*
  useEffect(() => {
    if (!isOnline) {
      console.log('Skipping realtime subscriptions - offline mode');
      return;
    }

    const channel = supabase.channel('order-entry-changes').on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'products'
    }, () => {
      console.log('Product change detected, refreshing...');
      fetchOfflineProducts();
    }).on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'product_schemes'
    }, () => {
      console.log('Product scheme change detected, refreshing...');
      fetchOfflineProducts();
    }).on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'product_variants'
    }, () => {
      console.log('Product variant change detected, refreshing...');
      fetchOfflineProducts();
    }).subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOnline, fetchOfflineProducts]);
  */

  // Phase 7-3: build availability ctx for the selected retailer (if any).
  // No retailer selected => show all products.
  const availabilityCtx = useMemo(
    () => buildRetailerContext(selectedRetailerForAvail, territoriesById, userId),
    [selectedRetailerForAvail, territoriesById, userId]
  );

  // Filter master cache by availability for downstream consumers (TableOrderForm, Voice).
  const availableCachedProducts = useMemo(() => {
    if (!validRetailerId || !selectedRetailerForAvail) return cachedProducts;
    return filterAvailableProducts(
      cachedProducts as any[],
      (p) => p.id,
      availabilityByProductId,
      availabilityCtx
    );
  }, [cachedProducts, validRetailerId, selectedRetailerForAvail, availabilityByProductId, availabilityCtx]);

  // Filter products by category and search term
  const filteredProducts = products.filter(product => {
    // Phase 7-3: availability gate (default visible if no retailer or no rules).
    if (validRetailerId && selectedRetailerForAvail) {
      const rows = availabilityByProductId.get(product.id);
      if (rows && rows.length > 0) {
        // re-use isProductAvailable via filterAvailableProducts shape
        const ok = filterAvailableProducts([product as any], (p: any) => p.id, availabilityByProductId, availabilityCtx).length === 1;
        if (!ok) return false;
      }
    }
    // Category filter
    const matchesCategory = selectedCategory === "All" || product.category === selectedCategory;

    // Search filter - search in product name, SKU, and variant names
    const matchesSearch = searchTerm.trim() === "" || product.name.toLowerCase().includes(searchTerm.toLowerCase()) || product.sku && product.sku.toLowerCase().includes(searchTerm.toLowerCase()) || product.variants && product.variants.some(v => v.variant_name.toLowerCase().includes(searchTerm.toLowerCase()) || v.sku.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesCategory && matchesSearch;
  });
  // PERF: avoid logging large product arrays during render
  const handleQuantityChange = (productId: string, quantity: number) => {
    console.log('Quantity changed:', {
      productId,
      quantity
    });

    // Track activity for checkout timing
    recordActivity();

    // Store quantity under the actual productId (could be base or variant)
    setQuantities(prev => {
      const newQuantities = {
        ...prev
      };
      if (quantity > 0) {
        newQuantities[productId] = quantity;
      } else {
        delete newQuantities[productId];
      }

      // Immediately save to localStorage
      const quantityKey = activeStorageKey.replace('order_cart:', 'order_quantities:');
      localStorage.setItem(quantityKey, JSON.stringify(newQuantities));
      console.log('Saving quantity for product:', {
        productId,
        quantity,
        newQuantities
      });
      return newQuantities;
    });

    // Update cart if item exists there (use the full productId for cart lookup)
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.id === productId);
      if (existingItem && quantity > 0) {
        return prevCart.map(item => item.id === productId ? {
          ...item,
          quantity,
          total: item.rate * quantity
        } : item);
      } else if (existingItem && quantity <= 0) {
        // Remove from cart if quantity is 0 or negative
        return prevCart.filter(item => item.id !== productId);
      }
      return prevCart;
    });
  };
  const handleClosingStockChange = (productId: string, value: string) => {
    // Remove leading zeros and convert to number
    const cleanValue = value.replace(/^0+/, '') || '0';
    const stock = parseInt(cleanValue) || 0;

    // Store stock under the actual productId (could be base or variant)
    setClosingStocks(prev => {
      const newStocks = {
        ...prev
      };
      if (stock > 0) {
        newStocks[productId] = stock;
      } else {
        delete newStocks[productId];
      }

      // Immediately save to localStorage
      const stockKey = activeStorageKey.replace('order_cart:', 'order_stocks:');
      localStorage.setItem(stockKey, JSON.stringify(newStocks));
      console.log('Saving stock for product:', {
        productId,
        stock,
        newStocks
      });
      return newStocks;
    });
  };
  const handleVariantChange = (productId: string, variantId: string) => {
    setSelectedVariants(prev => {
      const newVariants = {
        ...prev,
        [productId]: variantId
      };
      // Immediately save to localStorage
      const variantKey = activeStorageKey.replace('order_cart:', 'order_variants:');
      localStorage.setItem(variantKey, JSON.stringify(newVariants));
      return newVariants;
    });
    // Don't reset any quantities - each variant and base product should maintain their own quantities independently
  };
  const getDisplayProduct = (product: GridProduct) => {
    const selectedVariantId = selectedVariants[product.id];
    if (selectedVariantId && selectedVariantId !== "base" && product.variants) {
      const variant = product.variants.find(v => v.id === selectedVariantId);
      if (variant) {
        const variantPrice = variant.discount_percentage > 0 ? variant.price - variant.price * variant.discount_percentage / 100 : variant.discount_amount > 0 ? variant.price - variant.discount_amount : variant.price;

        // Check if variant name is "Base variant" or "Base Variant" - if so, just use product name
        const isBaseVariant = variant.variant_name.toLowerCase() === 'base variant';
        const displayName = isBaseVariant ? product.name : variant.variant_name;
        return {
          ...product,
          id: `${product.id}_variant_${variant.id}`,
          name: displayName,
          rate: variantPrice,
          closingStock: variant.stock_quantity,
          sku: variant.sku
        };
      }
    }
    return product;
  };
  const getSavingsAmount = (product: GridProduct) => {
    const selectedVariantId = selectedVariants[product.id];
    if (selectedVariantId && selectedVariantId !== "base" && product.variants) {
      const variant = product.variants.find(v => v.id === selectedVariantId);
      if (variant) {
        if (variant.discount_percentage > 0) {
          return variant.price * variant.discount_percentage / 100;
        }
        if (variant.discount_amount > 0) {
          return variant.discount_amount;
        }
      }
    }
    return 0;
  };

  // Helper function to get applied scheme name for a product
  const getAppliedSchemeName = (productId: string): string => {
    const productSchemes = schemes.filter(s => 
      (s.product_id === productId || 
       (s.target_product_ids && s.target_product_ids.includes(productId))) &&
      s.is_active &&
      (!s.start_date || new Date(s.start_date) <= new Date()) &&
      (!s.end_date || new Date(s.end_date) >= new Date())
    );
    
    if (productSchemes.length === 0) return '';
    
    // Return the first applicable scheme name with discount info
    const scheme = productSchemes[0];
    if (scheme.discount_percentage) {
      return `${scheme.name} (${scheme.discount_percentage}% off)`;
    }
    if (scheme.discount_amount) {
      return `${scheme.name} (₹${scheme.discount_amount} off)`;
    }
    return scheme.name;
  };

  // Helper function to get scheme description
  const getSchemeDescription = (scheme: any) => {
    const conditionText = scheme.quantity_condition_type === 'more_than' ? `Buy ${scheme.condition_quantity}+ ${scheme.scheme_type === 'buy_get' ? 'items' : 'units'}` : `Buy exactly ${scheme.condition_quantity} ${scheme.scheme_type === 'buy_get' ? 'items' : 'units'}`;
    if (scheme.scheme_type === 'discount' || scheme.scheme_type === 'volume_discount') {
      if (scheme.discount_percentage) {
        return `${conditionText}, get ${scheme.discount_percentage}% off`;
      } else if (scheme.discount_amount) {
        return `${conditionText}, get ₹${scheme.discount_amount} off`;
      }
    } else if (scheme.scheme_type === 'buy_get') {
      return `${conditionText}, get ${scheme.free_quantity} free`;
    }
    return scheme.description || 'Special offer';
  };

  // Helper function to calculate scheme discount
  const calculateSchemeDiscount = (productId: string, variantId: string | null, quantity: number, basePrice: number) => {
    // Validate inputs
    const safeQuantity = Number(quantity) || 0;
    const safeBasePrice = Number(basePrice) || 0;
    const applicableSchemes = schemes.filter(scheme => scheme.product_id === productId && (scheme.variant_id === variantId || scheme.variant_id === null));
    console.log('Calculating scheme discount:', {
      productId,
      variantId,
      quantity: safeQuantity,
      basePrice: safeBasePrice,
      availableSchemes: applicableSchemes.map(s => ({
        id: s.id,
        name: s.name,
        variant_id: s.variant_id,
        condition_quantity: s.condition_quantity,
        quantity_condition_type: s.quantity_condition_type,
        discount_percentage: s.discount_percentage,
        scheme_type: s.scheme_type
      }))
    });
    let totalDiscount = 0;
    let freeQuantity = 0;
    applicableSchemes.forEach(scheme => {
      const conditionQty = Number(scheme.condition_quantity) || 0;
      // Fix condition logic: "more_than" should check >= not just >
      const meetsCondition = scheme.quantity_condition_type === 'more_than' ? safeQuantity >= conditionQty // Changed from > to >=
      : safeQuantity === conditionQty;
      console.log('Scheme condition check:', {
        schemeName: scheme.name,
        conditionType: scheme.quantity_condition_type,
        conditionQty,
        actualQty: safeQuantity,
        meetsCondition
      });
      if (meetsCondition) {
        if (scheme.scheme_type === 'discount' || scheme.scheme_type === 'volume_discount') {
          const discountPct = Number(scheme.discount_percentage) || 0;
          const discountAmt = Number(scheme.discount_amount) || 0;
          if (discountPct > 0) {
            const schemeDiscount = safeBasePrice * safeQuantity * discountPct / 100;
            totalDiscount += schemeDiscount;
            console.log('Applied percentage discount:', {
              discountPct,
              schemeDiscount,
              totalDiscount
            });
          } else if (discountAmt > 0) {
            totalDiscount += discountAmt;
            console.log('Applied fixed discount:', {
              discountAmt,
              totalDiscount
            });
          }
        } else if (scheme.scheme_type === 'buy_get') {
          freeQuantity += Number(scheme.free_quantity) || 0;
        }
      }
    });
    const result = {
      totalDiscount: Number(totalDiscount) || 0,
      freeQuantity: Number(freeQuantity) || 0
    };
    console.log('Final scheme calculation result:', result);
    return result;
  };

  // Function to save stock data to database
  const saveStockData = async (productId: string, stockQuantity: number, productName: string) => {
    if (!userId || !visitId || !retailerId) return;
    try {
      const {
        error
      } = await supabase.from('stock').upsert({
        user_id: userId,
        retailer_id: retailerId,
        visit_id: visitId,
        product_id: productId,
        product_name: productName,
        stock_quantity: stockQuantity
      }, {
        onConflict: 'user_id,retailer_id,visit_id,product_id'
      });
      if (error) {
        console.error('Error saving stock data:', error);
        toast({
          title: "Stock Save Error",
          description: error?.message ? String(error.message) : "Failed to save stock quantity",
          variant: "destructive"
        });
      } else {
        console.log('Stock saved successfully', {
          productId,
          stockQuantity
        });
      }
    } catch (error: any) {
      console.error('Error saving stock data:', error);
      toast({
        title: "Stock Save Error",
        description: error?.message ? String(error.message) : "Failed to save stock quantity",
        variant: "destructive"
      });
    }
  };
  const addToCart = (product: Product) => {
    // Track activity for checkout timing
    recordActivity();
    
    // Get the display product (could be variant)
    const displayProduct = getDisplayProduct(product as GridProduct);
    // Use the display product ID for quantity lookup (supports both base and variant quantities)
    const quantity = quantities[displayProduct.id] || 0;
    const stockQuantity = closingStocks[displayProduct.id] || 0;
    console.log('Adding to cart:', {
      originalProductId: product.id,
      displayProductId: displayProduct.id,
      productName: displayProduct.name,
      quantity,
      stockQuantity,
      activeStorageKey
    });

    // Check if only stock is updated without any quantity
    // First check if ANY quantity exists across all products/variants
    const hasAnyQuantity = Object.values(quantities).some(qty => (qty || 0) > 0);
    if (quantity <= 0 && stockQuantity > 0) {
      // Save stock data only
      saveStockData(displayProduct.id, stockQuantity, displayProduct.name);

      // Only auto-select "Over Stocked" if NO quantities are entered anywhere
      if (!hasAnyQuantity) {
        toast({
          title: "Over Stocked - Auto Selected",
          description: `Stock quantity saved for ${displayProduct.name}. Over Stocked reason auto-selected.`
        });
        handleAutoSelectOverStocked();
      } else {
        toast({
          title: "Stock Updated",
          description: `Stock quantity saved for ${displayProduct.name}.`
        });
      }
      return;
    }
    if (quantity <= 0) {
      toast({
        title: "Invalid Quantity",
        description: "Please enter a valid quantity",
        variant: "destructive"
      });
      return;
    }

    // Apply unit conversion to get correct price
    let effectiveRate = Number(displayProduct.rate);
    const selectedUnit = selectedUnits[product.id] || product.unit || 'kg';

    // Only apply conversion for non-variant products
    if (!displayProduct.id.includes('_variant_') && (product as GridProduct).base_unit) {
      const gridProduct = product as GridProduct;
      const baseUnit = gridProduct.base_unit?.toLowerCase() || 'kg';
      const targetUnit = selectedUnit.toLowerCase();
      let conversionFactor = 1;
      if (baseUnit === 'kg') {
        if (targetUnit === 'grams' || targetUnit === 'gram') {
          conversionFactor = 0.001;
        }
      }
      effectiveRate = effectiveRate * conversionFactor;
    }
    const baseTotal = effectiveRate * Number(quantity);

    // Determine the variant ID for scheme calculation
    let variantIdForScheme = null;
    if (displayProduct.id.includes('_variant_')) {
      // For composite variant IDs, extract the actual variant ID
      variantIdForScheme = displayProduct.id.split('_variant_')[1];
    }
    console.log('Scheme calculation debug:', {
      productId: product.id,
      variantIdForScheme,
      quantity,
      basePrice: Number(displayProduct.rate),
      displayProductId: displayProduct.id
    });
    const {
      totalDiscount,
      freeQuantity
    } = calculateSchemeDiscount(product.id, variantIdForScheme, quantity, effectiveRate);
    const finalTotal = baseTotal - totalDiscount;
    console.log('Scheme discount result:', {
      baseTotal,
      totalDiscount,
      finalTotal
    });
    const cartItem = {
      ...displayProduct,
      // Preserve original rate as base rate (e.g. per KG) for consistent conversions
      rate: displayProduct.rate,
      // Store the unit the user actually selected (KG or grams)
      unit: selectedUnit,
      // Store base_unit for correct KG 2 gram conversion in cart and invoice
      base_unit: (product as GridProduct).base_unit || displayProduct.base_unit || displayProduct.unit,
      // Include HSN code from product for invoice
      hsn_code: (displayProduct as any).hsn_code || (product as any).hsn_code || '',
      quantity,
      total: finalTotal,
      closingStock: closingStocks[displayProduct.id] || displayProduct.closingStock
    };
    const existingItem = cart.find(item => item.id === displayProduct.id);
    if (existingItem) {
      setCart(prev => {
        const newCart = prev.map(item => item.id === displayProduct.id ? {
          ...item,
          quantity,
          total: finalTotal,
          closingStock: cartItem.closingStock
        } : item);
        console.log('Updated cart:', newCart);
        return newCart;
      });
    } else {
      setCart(prev => {
        const newCart = [...prev, cartItem];
        console.log('New cart:', newCart);
        return newCart;
      });
    }
    const schemeMessage = totalDiscount > 0 ? ` (Saved ₹${totalDiscount.toFixed(2)})` : '';
    const freeMessage = freeQuantity > 0 ? ` + ${freeQuantity} free` : '';

    // Save stock data if stock quantity is provided
    if (stockQuantity > 0) {
      saveStockData(displayProduct.id, stockQuantity, displayProduct.name);
    }
    toast({
      title: "Added to Cart",
      description: `${quantity} ${displayProduct.unit}(s) of ${displayProduct.name} added to cart${schemeMessage}${freeMessage}`
    });
  };
  const handleBulkCartUpdate = (items: CartItem[]) => {
    console.log('Bulk update from TableOrderForm:', items);
    // 1) Update cart by replacing quantities/totals for incoming items
    setCart(prev => {
      const newCart = [...prev];
      items.forEach(item => {
        const existingIndex = newCart.findIndex(cartItem => cartItem.id === item.id);
        if (existingIndex >= 0) {
          newCart[existingIndex] = {
            ...newCart[existingIndex],
            quantity: item.quantity,
            total: item.total,
            closingStock: item.closingStock
          };
        } else if (item.quantity > 0) {
          newCart.push(item);
        }
      });
      // Also remove any items that now have zero quantity
      return newCart.filter(ci => ci.quantity > 0);
    });

    // 2) Sync "Current" selection values immediately
    setQuantities(prev => {
      const updated = {
        ...prev
      };
      items.forEach(it => {
        if (it.quantity > 0) {
          updated[it.id] = it.quantity;
        } else {
          delete updated[it.id];
        }
      });
      return updated;
    });

    // 3) Sync closing stock values as well
    setClosingStocks(prev => {
      const updated = {
        ...prev
      } as {
        [key: string]: number;
      };
      items.forEach(it => {
        if (typeof (it as any).closingStock === 'number') {
          updated[it.id] = Number((it as any).closingStock) || 0;
        }
      });
      return updated;
    });
  };

  // State for delete confirmation dialog
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Function to clear all cached form data (with confirmation)
  const handleDeleteClick = () => {
    // Check if there's anything to clear
    const hasItems = cart.length > 0 || Object.keys(quantities).length > 0;
    if (hasItems) {
      setShowDeleteConfirm(true);
    } else {
      toast({
        title: "Nothing to clear",
        description: "Cart is already empty"
      });
    }
  };

  const clearAllFormData = () => {
    const quantityKey = activeStorageKey.replace('order_cart:', 'order_quantities:');
    const variantKey = activeStorageKey.replace('order_cart:', 'order_variants:');
    const stockKey = activeStorageKey.replace('order_cart:', 'order_stocks:');

    // Clear from localStorage
    localStorage.removeItem(activeStorageKey);
    localStorage.removeItem(quantityKey);
    localStorage.removeItem(variantKey);
    localStorage.removeItem(stockKey);

    // Reset all state
    setCart([]);
    setQuantities({});
    setSelectedVariants({});
    setClosingStocks({});
    setShowDeleteConfirm(false);
    
    toast({
      title: "Order cleared",
      description: "All items have been removed from the order"
    });
    console.log('All form data cleared');
  };
  const getTotalItems = () => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  };
  const getTotalValue = () => {
    return cart.reduce((sum, item) => {
      const itemTotal = Number(item.total) || 0;
      return sum + itemTotal;
    }, 0);
  };

  // Calculate total value from selected quantities and variants with auto-calculation
  const getSelectionValue = () => {
    // In table mode, rely on cart snapshot from TableOrderForm for immediate header updates
    if (orderMode === "table") {
      const cartTotal = cart.reduce((sum, item) => sum + (Number(item.total) || Number(item.rate) * Number(item.quantity) || 0), 0);
      return Number(cartTotal) || 0;
    }
    let total = 0;

    // Include all products regardless of category to match cart behavior
    products.forEach(product => {
      // Check base product quantity
      const baseQty = Number(quantities[product.id]) || 0;
      if (baseQty > 0) {
        const productRate = Number(product.rate) || 0;
        const {
          totalDiscount
        } = calculateSchemeDiscount(product.id, null, baseQty, productRate);
        const discountValue = Number(totalDiscount) || 0;
        const subtotal = baseQty * productRate - discountValue;
        total += Number(subtotal) || 0;
      }

      // Check all variant quantities using composite IDs
      if (product.variants) {
        product.variants.forEach(variant => {
          const variantCompositeId = `${product.id}_variant_${variant.id}`;
          const variantQty = Number(quantities[variantCompositeId]) || 0;
          if (variantQty > 0) {
            const basePrice = Number(variant.price) || 0;
            const discountPct = Number(variant.discount_percentage) || 0;
            const discountAmt = Number(variant.discount_amount) || 0;
            const variantPrice = discountPct > 0 ? basePrice - basePrice * discountPct / 100 : discountAmt > 0 ? basePrice - discountAmt : basePrice;
            const {
              totalDiscount
            } = calculateSchemeDiscount(product.id, variant.id, variantQty, variantPrice);
            const discountValue = Number(totalDiscount) || 0;
            const subtotal = variantQty * variantPrice - discountValue;
            total += Number(subtotal) || 0;
          }
        });
      }
    });
    return Number(total) || 0;
  };

  // Get total selected items count
  const getSelectionItemCount = () => {
    let count = 0;
    products.forEach(product => {
      // Count base product quantity
      const baseQty = quantities[product.id] || 0;
      count += baseQty;

      // Count all variant quantities using the same composite keys used everywhere else
      if (product.variants) {
        product.variants.forEach(variant => {
          const variantCompositeId = `${product.id}_variant_${variant.id}`;
          const variantQty = quantities[variantCompositeId] || 0;
          count += variantQty;
        });
      }
    });
    return count;
  };

  // Get current selection details for order summary
  const getSelectionDetails = () => {
    // In table mode, derive directly from cart snapshot
    if (orderMode === "table") {
      const items = cart.map(ci => {
        const baseId = ci.id.includes('_variant_') ? ci.id.split('_variant_')[0] : ci.id;
        const product = products.find(p => p.id === baseId);
        const savings = Math.max(0, Number(ci.rate) * Number(ci.quantity) - Number(ci.total || 0));
        const appliedOffers: string[] = [];
        if (savings > 0) appliedOffers.push(`Savings: ₹${savings.toFixed(2)}`);
        return {
          id: ci.id,
          variantName: ci.name,
          selectedItem: ci.name,
          quantity: Number(ci.quantity) || 0,
          rate: Number(ci.rate) || 0,
          totalPrice: Number(ci.total) || Number(ci.rate) * Number(ci.quantity) || 0,
          savings,
          appliedOffers,
          unit: product?.unit || 'piece'
        };
      });
      const totalSavings = items.reduce((s, it) => s + (Number(it.savings) || 0), 0);
      return {
        items,
        totalSavings
      };
    }
    const items: any[] = [];
    let totalSavings = 0;
    console.log('Getting selection details with current quantities:', quantities);

    // Include all products regardless of category
    products.forEach(product => {
      // Check base product quantity
      const baseQty = quantities[product.id] || 0;
      if (baseQty > 0) {
        const total = baseQty * product.rate;
        const {
          totalDiscount
        } = calculateSchemeDiscount(product.id, null, baseQty, product.rate);
        totalSavings += totalDiscount;
        items.push({
          id: product.id,
          variantName: product.name,
          selectedItem: product.name,
          quantity: baseQty,
          rate: product.rate,
          totalPrice: total - totalDiscount,
          savings: totalDiscount,
          appliedOffers: totalDiscount > 0 ? [`Scheme discount: ₹${totalDiscount.toFixed(2)}`] : []
        });
      }

      // Check all variant quantities - only for variants of this specific product
      if (product.variants) {
        product.variants.forEach(variant => {
          // FIX: use composite id for variant quantities
          const variantCompositeId = `${product.id}_variant_${variant.id}`;
          const variantQty = quantities[variantCompositeId] || 0;
          if (variantQty > 0) {
            const variantPrice = variant.discount_percentage > 0 ? variant.price - variant.price * variant.discount_percentage / 100 : variant.discount_amount > 0 ? variant.price - variant.discount_amount : variant.price;
            const variantSavings = variant.discount_percentage > 0 ? variant.price * variant.discount_percentage / 100 : variant.discount_amount;
            const baseTotal = variantQty * variantPrice;
            const {
              totalDiscount
            } = calculateSchemeDiscount(product.id, variant.id, variantQty, variantPrice);
            totalSavings += variantSavings * variantQty + totalDiscount;
            const appliedOffers = [] as string[];
            if (variantSavings > 0) {
              appliedOffers.push(`Variant discount: ₹${(variantSavings * variantQty).toFixed(2)}`);
            }
            if (totalDiscount > 0) {
              appliedOffers.push(`Scheme discount: ₹${totalDiscount.toFixed(2)}`);
            }
            items.push({
              id: `${product.id}_variant_${variant.id}`,
              variantName: variant.variant_name,
              selectedItem: variant.variant_name,
              quantity: variantQty,
              rate: variant.price,
              // Use original price, not discounted
              totalPrice: baseTotal - totalDiscount,
              savings: variantSavings * variantQty + totalDiscount,
              appliedOffers
            });
          }
        });
      }
    });
    return {
      items,
      totalSavings
    };
  };

  // Handle adding all selected items to cart
  const handleAddAllToCart = () => {
    const {
      items
    } = getSelectionDetails();
    if (items.length === 0) {
      toast({
        title: "No Items Selected",
        description: "Please select items and enter quantities",
        variant: "destructive"
      });
      return;
    }

    // Clear existing cart and replace with current selections
    const newCartItems: CartItem[] = [];

    // Add all items to cart
    items.forEach(item => {
      const baseProductId = item.id.split('_')[0];
      const product = products.find(p => p.id === baseProductId);

      // Check if this is a variant or base product
      const isVariant = item.id.includes('_variant_');
      const variantId = isVariant ? item.id.split('_variant_')[1] : null;

      // Find applicable schemes for discount calculation
      const applicableSchemes = schemes.filter(scheme => scheme.product_id === baseProductId && (scheme.variant_id === variantId || scheme.variant_id === null));

      // Get the active scheme (if any)
      const activeScheme = applicableSchemes.find(scheme => {
        const meetsCondition = scheme.quantity_condition_type === 'more_than' ? item.quantity > scheme.condition_quantity : item.quantity === scheme.condition_quantity;
        return meetsCondition;
      });
      const cartItem: CartItem = {
        id: item.id,
        name: item.selectedItem,
        category: product?.category || "Unknown",
        rate: item.rate,
        unit: product?.unit || "piece",
        quantity: item.quantity,
        total: item.totalPrice,
        // Add scheme information for discount calculations
        ...(activeScheme && {
          schemeConditionQuantity: activeScheme.condition_quantity,
          schemeDiscountPercentage: activeScheme.discount_percentage || 0,
          schemes: [{
            is_active: true,
            condition_quantity: activeScheme.condition_quantity,
            discount_percentage: activeScheme.discount_percentage || 0
          }]
        })
      };
      newCartItems.push(cartItem);
    });

    // Replace cart completely with new selections
    setCart(newCartItems);

    // Don't clear quantities - keep them until order is submitted
    // setQuantities({};
    // setSelectedVariants({});
    setShowOrderSummary(false);
    toast({
      title: "Cart Updated",
      description: `Cart updated with ${items.length} item(s)`
    });

    // Record proceed to cart action for time tracking
    recordAction('proceed_to_cart').catch(() => {});

    // Navigate to cart with current parameters
    const params = new URLSearchParams(searchParams);
    navigate(`/cart?${params.toString()}`);
  };

  // Auto-sync function to update cart with current selections
  const autoSyncCart = () => {
    const {
      items
    } = getSelectionDetails();

    // Create new cart items from current selections
    const newCartItems: CartItem[] = [];
    items.forEach(item => {
      const baseProductId = item.id.split('_')[0];
      const product = products.find(p => p.id === baseProductId);

      // Check if this is a variant or base product
      const isVariant = item.id.includes('_variant_');
      const variantId = isVariant ? item.id.split('_variant_')[1] : null;

      // Find applicable schemes for discount calculation
      const applicableSchemes = schemes.filter(scheme => scheme.product_id === baseProductId && (scheme.variant_id === variantId || scheme.variant_id === null));

      // Get the active scheme (if any)
      const activeScheme = applicableSchemes.find(scheme => {
        const meetsCondition = scheme.quantity_condition_type === 'more_than' ? item.quantity > scheme.condition_quantity : item.quantity === scheme.condition_quantity;
        return meetsCondition;
      });
      const cartItem: CartItem = {
        id: item.id,
        name: item.selectedItem,
        category: product?.category || "Unknown",
        rate: item.rate,
        unit: product?.unit || "piece",
        base_unit: product?.base_unit, // Include base_unit for proper invoice calculations
        quantity: item.quantity,
        total: item.totalPrice,
        // Add scheme information for discount calculations
        ...(activeScheme && {
          schemeConditionQuantity: activeScheme.condition_quantity,
          schemeDiscountPercentage: activeScheme.discount_percentage || 0,
          schemes: [{
            is_active: true,
            condition_quantity: activeScheme.condition_quantity,
            discount_percentage: activeScheme.discount_percentage || 0
          }]
        })
      };
      newCartItems.push(cartItem);
    });

    // Update both state and localStorage
    setCart(newCartItems);

    // Also update localStorage directly for cart page
    const storageKey = userId && retailerId ? `order_cart:${userId}:${retailerId}` : retailerId ? `order_cart:temp:${retailerId}` : null;
    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(newCartItems));
    }
  };

  // Function to toggle variant table visibility
  const toggleVariantTable = (productId: string) => {
    setExpandedProducts(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }));
  };

  // Function to handle product selection - keep variants collapsed
  const handleProductSelect = (productId: string, productName: string) => {
    // Do not auto-expand variants when selecting a product
    // User can manually expand by clicking "Available Variants"
    setCurrentProductName(productName);
  };

  // Auto-expand logic for filtered products when category changes - preserve any already expanded items
  useEffect(() => {
    if (filteredProducts.length > 0) {
      setExpandedProducts(prev => {
        const newExpanded: {
          [key: string]: boolean;
        } = {
          ...prev
        };
        // Initialize keys for current list but don't collapse ones already opened
        filteredProducts.forEach(product => {
          if (newExpanded[product.id] === undefined) {
            newExpanded[product.id] = false;
          }
        });
        return newExpanded;
      });
    }
  }, [selectedCategory, filteredProducts]);

  // Function to handle scheme click
  const handleSchemeClick = (product: GridProduct) => {
    const productSchemes = schemes.filter(scheme => scheme.product_id === product.id && scheme.is_active && (!scheme.start_date || new Date(scheme.start_date) <= new Date()) && (!scheme.end_date || new Date(scheme.end_date) >= new Date()));
    setSelectedProductForScheme(product);
    setFilteredSchemes(productSchemes);
    setShowSchemeModal(true);
  };

  // Show loading while checking attendance
  if (checkingAttendance) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Checking attendance...</span>
        </div>
      </Layout>
    );
  }

  // Show attendance required dialog if not marked
  if (attendanceChecked && !hasAttendance) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-600">
                <AlertCircle className="h-6 w-6" />
                Attendance Required
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                You need to mark your attendance before placing orders. 
                Please start your day first.
              </p>
              <div className="flex flex-col gap-2">
                <Button 
                  onClick={() => navigate('/attendance')}
                  className="w-full"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Mark Attendance
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => navigate(-1)}
                  className="w-full"
                >
                  Go Back
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return <Layout>
    <div 
      className="min-h-screen bg-background pb-20 pt-2"
      onClick={handlePageInteraction}
      onTouchStart={handlePageInteraction}
    >
      {/* Edit-order mode banner */}
      {isEditMode && (
        <div className="w-full px-2 sm:px-4 pt-2">
          {editBlockedReason ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm">
              <div className="font-semibold mb-1">Cannot edit this order</div>
              <div>{editBlockedReason}</div>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => navigate(-1)}>Go Back</Button>
            </div>
          ) : (
            <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 p-2.5 text-xs sm:text-sm">
              <span className="font-semibold">Editing order</span>
              {editLoading ? ' — loading original items…' : ' — submitting will create a new order that replaces the original.'}
            </div>
          )}
        </div>
      )}
      {/* Page Header - Fixed layout with stable positioning */}
      <div className="w-full px-2 sm:px-4 py-2 sm:py-3">
        <Card className="shadow-card bg-gradient-primary text-primary-foreground">
          <CardHeader className="flex flex-row items-center justify-between pb-2 px-2 sm:px-3 py-2 sm:py-3 gap-2">
            {/* Left side - Back button and Title */}
            <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0 overflow-hidden">
              <div className="min-w-0 flex-1 overflow-hidden">
                <CardTitle className="text-sm sm:text-base font-medium leading-tight truncate">
                  {isAdminEdit
                    ? `Edit Order${editInvoiceNumber ? ` #${editInvoiceNumber}` : ''}`
                    : (isPhoneOrder ? t('order.phoneOrderEntry') : t('order.orderEntry'))}
                </CardTitle>
                <p className="text-[10px] sm:text-xs text-primary-foreground/80 leading-tight truncate max-w-[40vw] sm:max-w-none">{retailerName}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  {isActuallyOnline ? (
                    <Wifi className="h-2.5 w-2.5 text-primary-foreground/60" />
                  ) : (
                    <WifiOff className="h-2.5 w-2.5 text-orange-400" />
                  )}
                  <span className="text-[9px] text-primary-foreground/60">
                    {isActuallyOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
                
              </div>
            </div>
              
              {/* Right side - Help, Clear, Cart and Current value */}
              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                {/* Help/Guide Button */}
                <OrderGuideManualButton 
                  variant="icon" 
                  className="text-primary-foreground hover:bg-primary-foreground/20 h-8 w-8"
                />
                {/* Clear Form Button */}
                <Button variant="ghost" onClick={handleDeleteClick} className="text-primary-foreground hover:bg-primary-foreground/20 h-auto p-1 sm:p-1.5 flex flex-col items-center gap-0 min-w-[40px] sm:min-w-[45px]" title="Clear all form data">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="sm:w-[14px] sm:h-[14px]">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                  <span className="text-[8px] sm:text-[9px] leading-tight">{t('common.delete')}</span>
                </Button>
                
                <Button variant="ghost" onClick={() => navigate(`/cart?visitId=${visitId}&retailerId=${retailerId}&retailer=${encodeURIComponent(retailerName)}${isPhoneOrder ? '&phoneOrder=true' : ''}${isEditMode ? `&editOrderId=${encodeURIComponent(editOrderId)}` : ''}${isAdminEdit ? '&source=admin' : ''}`)} className="text-primary-foreground hover:bg-primary-foreground/20 h-auto p-1.5 sm:p-2 flex flex-col items-center gap-0 min-w-[42px] sm:min-w-[50px] relative">
                  <div className="relative">
                    <ShoppingCart size={14} className="sm:w-4 sm:h-4" />
                    {cart.length > 0 && <Badge className="absolute -top-1 -right-1 h-3.5 w-3.5 sm:h-4 sm:w-4 flex items-center justify-center p-0 text-[9px] sm:text-[10px] bg-destructive text-destructive-foreground rounded-full border-0">
                        {cart.length}
                      </Badge>}
                  </div>
                  <span className="text-[9px] sm:text-[10px] leading-tight">{t('order.cart')}</span>
                </Button>
                <Button variant="ghost" onClick={() => {
                const {
                  items
                } = getSelectionDetails();
                if (items.length > 0) {
                  setShowOrderSummary(true);
                }
              }} className="text-primary-foreground hover:bg-primary-foreground/20 h-auto p-1.5 sm:p-2 min-w-[50px] sm:min-w-[60px]" disabled={getSelectionValue() === 0}>
                  <div className="text-center">
                    <p className="text-[9px] sm:text-[10px] text-primary-foreground/80 leading-tight">Current</p>
                    <p className="text-xs sm:text-sm font-bold leading-tight break-all">
                      ₹{getSelectionValue().toLocaleString()}
                    </p>
                  </div>
                </Button>
              </div>
            </CardHeader>
          </Card>
        </div>

      <div className="w-full px-2 sm:px-4 space-y-3">

        {/* Order Mode Toggle - Burger Style Layout */}
        <Card>
          <CardContent className="p-2">
            <div className="space-y-1.5">
              {/* Row 1: Grid, Table, AI Stock */}
              <div className="flex gap-1.5">
                <Button 
                  variant={orderMode === "grid" ? "default" : "outline"} 
                  onClick={() => {
                    setOrderMode("grid");
                    // Record action for time tracking - first call = check-in, subsequent = check-out update
                    recordAction('order').catch(() => {});
                  }}
                  className="flex-1 h-7 text-xs" 
                  size="sm"
                >
                  <Grid3X3 size={12} className="mr-0.5" />
                  Grid
                </Button>
                <Button 
                  variant={orderMode === "table" ? "default" : "outline"} 
                  onClick={() => {
                    setOrderMode("table");
                    // Record action for time tracking - first call = check-in, subsequent = check-out update
                    recordAction('order').catch(() => {});
                  }}
                  className="flex-1 h-7 text-xs" 
                  size="sm"
                >
                  <Table size={12} className="mr-0.5" />
                  Table
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowImageCapture(true);
                    // Record action for time tracking - first call = check-in, subsequent = check-out update
                    recordAction('order').catch(() => {});
                  }}
                  className="flex-1 h-7 text-xs" 
                  size="sm" 
                  title="AI Stock Capture"
                >
                  <Camera size={12} className="mr-0.5" />
                  AI Stock
                </Button>
              </div>
              
              {/* Row 2: Voice Order + Smart Basket */}
              <div className="flex gap-1.5">
                <VoiceOrderAssistant
                  products={availableCachedProducts.map(p => ({
                    id: p.id,
                    name: p.name,
                    rate: p.rate,
                    unit: p.unit,
                    sku: p.sku,
                    category: p.category,
                    variants: p.variants
                  }))}
                  onAutoFillProducts={(results) => {
                    if (orderMode === "table" && tableFormRef.current) {
                      tableFormRef.current.applyVoiceAutoFill(results);
                    } else {
                      results.forEach(result => {
                        handleQuantityChange(result.productId, result.quantity);
                        if (result.unit) {
                          setSelectedUnits(prev => ({
                            ...prev,
                            [result.productId]: result.unit
                          }));
                        }
                      });
                      if (results.length > 0) {
                        toast({
                          title: `✓ ${results.length} product${results.length > 1 ? 's' : ''} auto-filled`,
                          description: results.map(r => `${r.productName}: ${r.quantity} ${r.unit}`).join(', '),
                        });
                      }
                    }
                  }}
                  disabled={!isActuallyOnline || cachedProducts.length === 0}
                  className="flex-1"
                />
                <SmartBasketButton
                  retailerId={validRetailerId || ''}
                  beatId={retailerBeatId}
                  onAutoFillProducts={(results) => {
                    if (orderMode === "table" && tableFormRef.current) {
                      tableFormRef.current.applyVoiceAutoFill(results);
                    } else {
                      results.forEach(result => {
                        handleQuantityChange(result.productId, result.quantity);
                        if (result.unit) {
                          setSelectedUnits(prev => ({
                            ...prev,
                            [result.productId]: result.unit
                          }));
                        }
                      });
                      if (results.length > 0) {
                        toast({
                          title: `✓ ${results.length} product${results.length > 1 ? 's' : ''} auto-filled`,
                          description: results.map(r => `${r.productName}: ${r.quantity} ${r.unit}`).join(', '),
                        });
                      }
                    }
                  }}
                  disabled={!isActuallyOnline || !validRetailerId}
                  className="flex-1"
                />
              </div>
              
              {/* Row 3: Return, No Order, Competition */}
              <div className="flex gap-1.5">
                <Button 
                  variant={orderMode === "return-stock" ? "default" : "outline"} 
                  onClick={() => {
                    setOrderMode("return-stock");
                    // Record action for time tracking - first call = check-in, subsequent = check-out update
                    recordAction('order').catch(() => {});
                  }}
                  className="flex-1 h-7 text-xs" 
                  size="sm"
                >
                  <RotateCcw size={12} className="mr-0.5" />
                  Returns
                </Button>
                <Button 
                  variant={orderMode === "no-order" ? "default" : "outline"} 
                  onClick={() => {
                    setOrderMode("no-order");
                    // Record action for time tracking - first call = check-in, subsequent = check-out update
                    recordAction('order').catch(() => {});
                  }}
                  className="flex-1 h-7 text-xs" 
                  size="sm"
                >
                  <XCircle size={12} className="mr-0.5" />
                  No Order
                </Button>
                <Button 
                  variant={orderMode === "competition" ? "default" : "outline"} 
                  onClick={() => {
                    setOrderMode("competition");
                    // Record action for time tracking - first call = check-in, subsequent = check-out update
                    recordAction('order').catch(() => {});
                  }}
                  className={`flex-1 h-7 text-xs ${hasCompetitionData ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
                  size="sm"
                >
                  <Target size={12} className="mr-0.5" />
                  Competition
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Search Bar - Compact */}
        

        {orderMode === "return-stock" ? <>
            {/* Return Stock Section */}
            <ReturnStockForm visitId={visitId} retailerId={retailerId} retailerName={retailerName} onComplete={() => {
          toast({
            title: "Returns Recorded",
            description: "Return stock has been recorded successfully"
          });
          setOrderMode("grid");
        }} />
          </> : orderMode === "no-order" ? <>
            {/* No Order Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Select No Order Reason</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[{
              value: "over-stocked",
              label: "Over Stocked",
              description: "Retailer has sufficient inventory",
              icon: Package,
              color: "text-warning"
            }, {
              value: "owner-not-available",
              label: "Owner Not Available",
              description: "Decision maker is not present",
              icon: UserX,
              color: "text-muted-foreground"
            }, {
              value: "store-closed",
              label: "Store Closed",
              description: "Store is temporarily closed",
              icon: DoorClosed,
              color: "text-destructive"
            }, {
              value: "permanently-closed",
              label: "Permanently Closed",
              description: "Store has shut down permanently",
              icon: XCircle,
              color: "text-destructive"
            }, {
              value: "other",
              label: "Other",
              description: "Specify a custom reason",
              icon: MessageSquare,
              color: "text-primary"
            }].map(reason => {
              const IconComponent = reason.icon;
              return <Card 
                key={reason.value} 
                className={`cursor-pointer transition-all duration-200 hover:shadow-md ${noOrderReason === reason.value ? 'ring-2 ring-primary bg-primary/5' : 'hover:border-primary/50'}`} 
                onClick={(e) => {
                  e.preventDefault();
                  console.log('No order reason clicked:', reason.value);
                  
                  // Mark as selected
                  setNoOrderReason(reason.value);
                  
                  if (reason.value === "over-stocked") {
                    setShowOverstockPrompt(true);
                  }
                  
                  // Reset custom reason if switching away from "other"
                  if (reason.value !== "other") {
                    setCustomNoOrderReason("");
                  }
                }}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <IconComponent className={`size-5 ${reason.color}`} />
                          <div className="flex-1">
                            <h4 className="font-medium text-card-foreground">{reason.label}</h4>
                            <p className="text-sm text-muted-foreground">{reason.description}</p>
                          </div>
                          {noOrderReason === reason.value && (
                            <Check className="size-5 text-primary" />
                          )}
                        </div>
                      </CardContent>
                    </Card>;
            })}
            
            {/* Show input field when "Other" is selected */}
            {noOrderReason === "other" && (
              <div className="space-y-2 mt-4">
                <label className="text-sm font-medium text-foreground">Enter Reason</label>
                <Input
                  placeholder="Type your reason here..."
                  value={customNoOrderReason}
                  onChange={(e) => setCustomNoOrderReason(e.target.value)}
                  className="w-full"
                  autoFocus
                />
              </div>
            )}
            
            {/* Show submit button when any reason is selected */}
            {noOrderReason && (
              <Button 
                onClick={async (e) => {
                  e.preventDefault();
                  
                  // Prevent double-click
                  if (noOrderSubmitting) return;
                  setNoOrderSubmitting(true);
                  
                  console.log('🔴 NO ORDER: Submit clicked (LOCAL-FIRST)', { 
                    noOrderReason, 
                    customNoOrderReason,
                    visitId,
                    retailerId
                  });
                  
                  const finalReason = noOrderReason === "other" ? customNoOrderReason.trim() : noOrderReason;
                  
                  if (!finalReason) {
                    toast({
                      title: "Error",
                      description: "Please enter a reason",
                      variant: "destructive"
                    });
                    setNoOrderSubmitting(false);
                    return;
                  }
                  
                  if (!retailerId) {
                    toast({
                      title: "Error",
                      description: "Retailer ID is missing",
                      variant: "destructive"
                    });
                    setNoOrderSubmitting(false);
                    return;
                  }
                  
                  if (!userId) {
                    toast({
                      title: "Error",
                      description: "User not authenticated. Please log in again.",
                      variant: "destructive"
                    });
                    setNoOrderSubmitting(false);
                    return;
                  }
                  
                  try {
                    // Use LOCAL-FIRST pattern for instant response
                    const { submitNoOrderLocalFirst } = await import('@/utils/noOrderUtils');
                    
                    const today = getLocalDateString();
                    
                    await submitNoOrderLocalFirst({
                      visitId,
                      retailerId,
                      userId,
                      reason: finalReason,
                      today
                    });
                    
                    // Clear cart storage
                    try {
                      const storageKey = validVisitId && validRetailerId 
                        ? `order_cart:${validVisitId}:${validRetailerId}` 
                        : validRetailerId 
                          ? `order_cart:temp:${validRetailerId}` 
                          : 'order_cart:fallback';
                      localStorage.removeItem(storageKey);
                    } catch (storageError) {
                      console.log('⚠️ Cart clear skipped:', storageError);
                    }
                    
                    // Show success immediately
                    toast({
                      title: "✅ Visit Marked as Unproductive",
                      description: `Reason: ${finalReason.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`,
                      duration: 3000
                    });
                    
                    setNoOrderSubmitting(false);
                    
                    // Navigate immediately - no waiting for network
                    setTimeout(() => {
                      navigate("/visits/retailers");
                    }, 100);
                    
                  } catch (error: any) {
                    console.error('🔴 NO ORDER: Error:', error);
                    toast({
                      title: "Failed to Save",
                      description: error?.message || "Please try again",
                      variant: "destructive"
                    });
                    setNoOrderSubmitting(false);
                  }
                }}
                className="w-full mt-4"
                size="lg"
                disabled={noOrderSubmitting}
              >
                {noOrderSubmitting ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Saving...
                  </>
                ) : (
                  "Submit No Order Reason"
                )}
              </Button>
            )}
              </CardContent>
            </Card>
          </> : orderMode === "competition" ? <>
            {/* Competition Section */}
            <CompetitionDataForm 
              retailerId={retailerId} 
              visitId={visitId} 
              onSave={() => {
                setHasCompetitionData(true);
                toast({
                  title: "Success",
                  description: "Competition data saved successfully"
                });
              }} 
            />
          </> : orderMode === "grid" ? <>
            {/* Category Tabs */}
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
          <TabsList className="grid grid-cols-3 w-full">
            {categories.slice(0, 3).map(category => <TabsTrigger key={category} value={category} className="text-xs">
                {category}
              </TabsTrigger>)}
          </TabsList>
          <TabsList className="grid grid-cols-3 w-full mt-2">
            {categories.slice(3).map(category => <TabsTrigger key={category} value={category} className="text-xs">
                {category}
              </TabsTrigger>)}
          </TabsList>
        </Tabs>

        {/* Single Column Layout */}
        <div className="space-y-3">
          {/* Products Grid */}
          <div className="space-y-3">
          {offlineLoading ? <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-sm text-muted-foreground">Loading products...</p>
            </div> : filteredProducts.length === 0 ? <div className="text-center py-8">
              <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No products found</p>
              <p className="text-sm text-muted-foreground mt-2">
                {selectedCategory === "All" ? "No products available" : `No products in ${selectedCategory} category`}
              </p>
            </div> : filteredProducts.map(product => {
              const displayProduct = getDisplayProduct(product);
              const savingsAmount = getSavingsAmount(product);
              return <Card key={product.id} className="relative">
                {/* Only show scheme button for products with active schemes */}
                {product.hasScheme && <div className="absolute -top-2 -right-2 z-20">
                    <Badge className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 hover:scale-105 text-white text-xs px-2 py-1 cursor-pointer transition-all duration-200 shadow-lg border-2 border-white" onClick={() => handleSchemeClick(product)}>
                      <Gift size={10} className="mr-1" />
                      Scheme
                    </Badge>
                  </div>}
                
                <CardContent className="p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm text-primary flex items-center gap-1.5">
                        {isFocusedProductActive(product) && (
                          <Star size={14} className="fill-yellow-500 text-yellow-500 flex-shrink-0" />
                        )}
                        {product.hasScheme && (
                          <Sparkles size={14} className="fill-orange-500 text-orange-500 flex-shrink-0" />
                        )}
                        <span className="flex-1">{product.name}</span>
                      </h3>
                      <p className="text-xs text-muted-foreground">{product.category}</p>
                      {displayProduct.sku && <p className="text-xs text-blue-600 font-mono">SKU: {displayProduct.sku}</p>}
                      <p className="text-base font-bold text-primary">
                        Total: ₹{(() => {
                          let total = 0;

                          // Calculate base product total
                          const baseQty = quantities[product.id] || 0;
                          if (baseQty > 0) {
                            const {
                              totalDiscount
                            } = calculateSchemeDiscount(product.id, null, baseQty, product.rate);
                            total += baseQty * product.rate - totalDiscount;
                          }

                          // Calculate all variant totals using composite IDs
                          if (product.variants) {
                            product.variants.forEach(variant => {
                              const variantCompositeId = `${product.id}_variant_${variant.id}`;
                              const variantQty = quantities[variantCompositeId] || 0;
                              if (variantQty > 0) {
                                const variantPrice = variant.discount_percentage > 0 ? variant.price - variant.price * variant.discount_percentage / 100 : variant.discount_amount > 0 ? variant.price - variant.discount_amount : variant.price;
                                const {
                                  totalDiscount
                                } = calculateSchemeDiscount(product.id, variant.id, variantQty, variantPrice);
                                total += variantQty * variantPrice - totalDiscount;
                              }
                            });
                          }
                          return total > 0 ? total.toLocaleString() : "0";
                        })()}
                      </p>
                      
                      {savingsAmount > 0 && (
                        <>
                          <p className="text-xs text-green-600 font-semibold">
                            You save ₹{savingsAmount.toFixed(2)}
                          </p>
                          {getAppliedSchemeName(product.id) && (
                            <div className="flex items-center gap-1 text-[10px] text-orange-600">
                              <Gift size={10} />
                              <span>{getAppliedSchemeName(product.id)}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    
                  </div>

                  {/* Variant Grid - Always Expanded in Grid View */}
                  {product.variants && product.variants.length > 0 && <div className="mb-3">
                      {/* No collapsible - always show variants in Grid view */}
                      <div className="mb-2">
                        <label className="text-xs text-muted-foreground font-semibold">Available Variants</label>
                      </div>
                        <div className="border rounded-lg overflow-hidden">
                          <div className="bg-muted/50 grid grid-cols-5 gap-1 p-2 text-xs font-medium">
                            <div>Variant</div>
                            <div>Rate</div>
                            <div>Unit</div>
                            <div>Qty</div>
                            <div>Stock</div>
                          </div>
                          
                          {/* Base Product Row */}
                          <div className="grid grid-cols-5 gap-1 p-2 text-xs border-t">
                            <div className="text-xs flex items-center gap-1">
                              {isFocusedProductActive(product) && (
                                <Star size={12} className="fill-yellow-500 text-yellow-500 flex-shrink-0" />
                              )}
                              {product.hasScheme && (
                                <Sparkles size={12} className="fill-orange-500 text-orange-500 flex-shrink-0" />
                              )}
                              <span>{product.name}</span>
                            </div>
                            <div className="font-medium">
                              {(() => {
                                const selectedUnit = selectedUnits[product.id] || product.unit || 'kg';
                                const baseUnit = product.base_unit?.toLowerCase() || 'kg';
                                const targetUnit = selectedUnit.toLowerCase();
                                let conversionFactor = 1;
                                if (baseUnit === 'kg') {
                                  if (targetUnit === 'grams' || targetUnit === 'gram') {
                                    conversionFactor = 0.001;
                                  }
                                }
                                const pricePerUnit = product.rate * conversionFactor;
                                return conversionFactor !== 1 ? <div className="flex flex-col">
                                    <span>₹{pricePerUnit.toFixed(2)}</span>
                                    <span className="text-[9px] text-muted-foreground">
                                      (₹{product.rate.toFixed(2)}/{baseUnit})
                                    </span>
                                  </div> : `₹${product.rate % 1 === 0 ? product.rate.toString() : product.rate.toFixed(2)}`;
                              })()}
                            </div>
                            <div>
                              <Select value={selectedUnits[product.id] || product.unit || 'kg'} onValueChange={value => {
                                setSelectedUnits(prev => ({
                                  ...prev,
                                  [product.id]: value
                                }));
                              }}>
                                <SelectTrigger className="h-6 text-xs p-1 w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="kg">kg</SelectItem>
                                  <SelectItem value="grams">grams</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Input type="number" placeholder="0" value={quantities[product.id] || ""} onChange={e => {
                                console.log('Base product quantity change:', product.id, e.target.value);
                                const qty = parseInt(e.target.value) || 0;
                                handleQuantityChange(product.id, qty);
                                if (qty > 0) {
                                  handleVariantChange(product.id, "base");
                                }
                              }} className="h-6 text-xs p-1" min="0" disabled={false} />
                            </div>
                             <div>
                               <Input type="number" placeholder="0" value={(() => {
                                const stock = closingStocks[product.id] ?? product.closingStock;
                                return stock === 0 ? "" : stock;
                              })()} onChange={e => {
                                const value = e.target.value;
                                handleClosingStockChange(product.id, value === "" ? "0" : value);
                              }} onFocus={e => {
                                if (e.target.value === "0" || e.target.value === "") {
                                  e.target.select();
                                }
                              }} className={`h-6 text-xs p-1 ${(() => {
                                const stock = closingStocks[product.id] ?? product.closingStock;
                                return stock === 0 ? "text-muted-foreground" : "";
                              })()}`} min="0" />
                             </div>
                          </div>

                           {/* Variant Rows */}
                           {product.variants.map(variant => {
                            const variantPrice = variant.discount_percentage > 0 ? variant.price - variant.price * variant.discount_percentage / 100 : variant.discount_amount > 0 ? variant.price - variant.discount_amount : variant.price;
                            const savings = variant.discount_percentage > 0 ? variant.price * variant.discount_percentage / 100 : variant.discount_amount;
                            const variantCompositeId = `${product.id}_variant_${variant.id}`;
                            const variantQuantity = quantities[variantCompositeId] || 0;
                            const variantAmount = variantQuantity * variantPrice;

                            // Check if this variant has a scheme applied specifically to it
                            const hasVariantScheme = schemes.some(scheme => scheme.product_id === product.id && scheme.variant_id === variant.id && scheme.is_active && (!scheme.start_date || new Date(scheme.start_date) <= new Date()) && (!scheme.end_date || new Date(scheme.end_date) >= new Date()));

                            // Get variant-specific schemes
                            const variantSchemes = schemes.filter(scheme => scheme.product_id === product.id && scheme.variant_id === variant.id && scheme.is_active && (!scheme.start_date || new Date(scheme.start_date) <= new Date()) && (!scheme.end_date || new Date(scheme.end_date) >= new Date()));
                            return <div key={variant.id} className={`grid grid-cols-5 gap-1 p-2 text-xs border-t ${hasVariantScheme ? 'bg-green-50 border-green-200' : ''}`}>
                                 <div className="text-xs flex items-center gap-1">
                                   {isFocusedProductActive(variant) && (
                                     <Star size={12} className="fill-yellow-500 text-yellow-500 flex-shrink-0" />
                                   )}
                                   {hasVariantScheme && (
                                     <Sparkles size={12} className="fill-orange-500 text-orange-500 flex-shrink-0" />
                                   )}
                                   <div>
                                     <div>{variant.variant_name}</div>
                                     {variantSchemes.length > 0 && <div className="text-orange-500 font-medium mt-1">
                                         {variantSchemes.map(scheme => scheme.description).join(', ')}
                                       </div>}
                                    </div>
                                  </div>
                                  <div className="font-medium">
                                    {(() => {
                                      const selectedUnit = selectedUnits[variantCompositeId] || product.unit || 'kg';
                                      const baseUnit = product.base_unit?.toLowerCase() || 'kg';
                                      const targetUnit = selectedUnit.toLowerCase();
                                      let conversionFactor = 1;
                                      if (baseUnit === 'kg') {
                                        if (targetUnit === 'grams' || targetUnit === 'gram') {
                                          conversionFactor = 0.001;
                                        }
                                      }
                                      const pricePerUnit = variantPrice * conversionFactor;
                                      return conversionFactor !== 1 ? (
                                        <div className="flex flex-col">
                                          <span>₹{pricePerUnit.toFixed(2)}</span>
                                          <span className="text-[9px] text-muted-foreground">
                                            (₹{variantPrice.toFixed(2)}/{baseUnit})
                                          </span>
                                        </div>
                                      ) : `₹${variantPrice % 1 === 0 ? variantPrice.toString() : variantPrice.toFixed(2)}`;
                                    })()}
                                  </div>
                                  <div>
                                    <Select 
                                      value={selectedUnits[variantCompositeId] || product.unit || 'kg'} 
                                      onValueChange={(value) => {
                                        setSelectedUnits(prev => ({
                                          ...prev,
                                          [variantCompositeId]: value
                                        }));
                                      }}
                                    >
                                      <SelectTrigger className="h-6 text-xs p-1 w-full">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="kg">kg</SelectItem>
                                        <SelectItem value="grams">grams</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                 <div>
                                  <Input type="number" placeholder="0" value={variantQuantity || ""} onChange={e => {
                                  const qty = parseInt(e.target.value) || 0;
                                  const variantCompositeId = `${product.id}_variant_${variant.id}`;
                                  handleQuantityChange(variantCompositeId, qty);
                                  if (qty > 0) {
                                    handleVariantChange(product.id, variant.id);
                                  }
                                }} className="h-6 text-xs p-1" min="0" />
                                </div>
                                 <div>
                                   <Input type="number" placeholder="0" value={(() => {
                                  const variantCompositeId = `${product.id}_variant_${variant.id}`;
                                  const stock = closingStocks[variantCompositeId] ?? variant.stock_quantity;
                                  return stock === 0 ? "" : stock;
                                })()} onChange={e => {
                                  const value = e.target.value;
                                  const variantCompositeId = `${product.id}_variant_${variant.id}`;
                                  handleClosingStockChange(variantCompositeId, value === "" ? "0" : value);
                                }} onFocus={e => {
                                  if (e.target.value === "0" || e.target.value === "") {
                                    e.target.select();
                                  }
                                }} className={`h-6 text-xs p-1 ${(() => {
                                  const variantCompositeId = `${product.id}_variant_${variant.id}`;
                                  const stock = closingStocks[variantCompositeId] ?? variant.stock_quantity;
                                   return stock === 0 ? "text-muted-foreground" : "";
                                 })()}`} min="0" />
                                 </div>
                               </div>;
                           })}
                        </div>
                    </div>}

                   {/* Simple table for products without variants */}
                   {(!product.variants || product.variants.length === 0) && <div className="mb-3">
                       <div className="border rounded-lg overflow-hidden">
                         <div className="bg-muted/50 grid grid-cols-4 gap-1 p-2 text-xs font-medium">
                           <div>Product</div>
                           <div>Rate</div>
                           <div>Qty</div>
                           <div>Stock</div>
                         </div>
                         
                         <div className="grid grid-cols-4 gap-1 p-2 text-xs border-t">
                           <div className="text-xs">{product.name}</div>
                           <div className="font-medium">₹{product.rate % 1 === 0 ? product.rate.toString() : product.rate.toFixed(2)}</div>
                           <div>
                             <Input type="number" placeholder="0" value={quantities[product.id] || ""} onChange={e => {
                            const qty = parseInt(e.target.value) || 0;
                            handleQuantityChange(product.id, qty);
                          }} className="h-6 text-xs p-1" min="0" />
                           </div>
                           <div>
                             <Input type="number" placeholder="0" value={(() => {
                            const stock = closingStocks[product.id] ?? product.closingStock;
                            return stock === 0 ? "" : stock;
                          })()} onChange={e => {
                            const value = e.target.value;
                            handleClosingStockChange(product.id, value === "" ? "0" : value);
                          }} onFocus={e => {
                            if (e.target.value === "0" || e.target.value === "") {
                              e.target.select();
                            }
                          }} className={`h-6 text-xs p-1 ${(() => {
                            const stock = closingStocks[product.id] ?? product.closingStock;
                            return stock === 0 ? "text-muted-foreground" : "";
                          })()}`} min="0" />
                            </div>
                          </div>
                        </div>
                      </div>}

                    {/* Add to Cart Button - unified for both variants and non-variants */}
                    <div className="mt-3">
                      <Button onClick={() => {
                      if (product.variants && product.variants.length > 0) {
                        // Handle products with variants
                        const selectedItems = [];
                        const stockOnlyItems = [];
                        let totalQtyForProduct = 0;

                        // Check base product quantity and stock
                        const baseQty = quantities[product.id] || 0;
                        const baseStock = closingStocks[product.id] || 0;
                        if (baseQty > 0) {
                          const baseTotal = baseQty * product.rate;
                          const {
                            totalDiscount
                          } = calculateSchemeDiscount(product.id, null, baseQty, product.rate);
                          const finalTotal = baseTotal - totalDiscount;
                          selectedItems.push({
                            ...product,
                            quantity: baseQty,
                            total: finalTotal,
                            closingStock: baseStock || product.closingStock
                          });
                          totalQtyForProduct += baseQty;
                        } else if (baseStock > 0) {
                          // Only stock, no quantity
                          stockOnlyItems.push({
                            id: product.id,
                            name: product.name,
                            stock: baseStock
                          });
                        }

                        // Check all variant quantities and stocks for this product
                        product.variants.forEach(variant => {
                          const variantCompositeId = `${product.id}_variant_${variant.id}`;
                          const variantQty = quantities[variantCompositeId] || 0;
                          const variantStock = closingStocks[variantCompositeId] || 0;
                          if (variantQty > 0) {
                            const variantPrice = variant.discount_percentage > 0 ? variant.price - variant.price * variant.discount_percentage / 100 : variant.discount_amount > 0 ? variant.price - variant.discount_amount : variant.price;
                            const baseTotal = variantQty * variantPrice;
                            const {
                              totalDiscount
                            } = calculateSchemeDiscount(product.id, variant.id, variantQty, variantPrice);
                            const finalTotal = baseTotal - totalDiscount;
                            selectedItems.push({
                              id: `${product.id}_variant_${variant.id}`,
                              name: variant.variant_name,
                              category: product.category,
                              rate: variantPrice,
                              unit: product.unit,
                              quantity: variantQty,
                              total: finalTotal,
                              closingStock: variantStock || variant.stock_quantity
                            });
                            totalQtyForProduct += variantQty;
                          } else if (variantStock > 0) {
                            // Only stock, no quantity
                            stockOnlyItems.push({
                              id: `${product.id}_variant_${variant.id}`,
                              name: variant.variant_name,
                              stock: variantStock
                            });
                          }
                        });

                        // Handle stock-only items (save to database only)
                        if (stockOnlyItems.length > 0) {
                          stockOnlyItems.forEach(item => {
                            saveStockData(item.id, item.stock, item.name);
                          });
                        }

                        // Handle cart items (quantity > 0)
                        if (selectedItems.length > 0) {
                          selectedItems.forEach(item => {
                            const existingItem = cart.find(cartItem => cartItem.id === item.id);
                            if (existingItem) {
                              // Replace existing item with new quantity
                              setCart(prev => prev.map(cartItem => cartItem.id === item.id ? {
                                ...cartItem,
                                quantity: item.quantity,
                                total: item.total,
                                closingStock: item.closingStock
                              } : cartItem));
                            } else {
                              // Add new item
                              setCart(prev => [...prev, item]);
                            }

                            // Save stock data if stock quantity is provided
                            if (item.closingStock > 0) {
                              saveStockData(item.id, item.closingStock, item.name);
                            }
                          });
                        }

                        // Show appropriate toast message
                        if (selectedItems.length > 0 && stockOnlyItems.length > 0) {
                          toast({
                            title: "Updated",
                            description: `${totalQtyForProduct} item(s) added to cart and stock quantities saved for ${stockOnlyItems.length} item(s)`
                          });
                        } else if (selectedItems.length > 0) {
                          toast({
                            title: "Added to Cart",
                            description: `${product.name}: ${totalQtyForProduct} item(s) added to cart`
                          });
                        } else if (stockOnlyItems.length > 0) {
                          // Check if ANY quantity exists across all products/variants
                          const hasAnyQuantity = Object.values(quantities).some(qty => (qty || 0) > 0);
                          if (!hasAnyQuantity) {
                            toast({
                              title: "Over Stocked - Auto Selected",
                              description: `Stock quantities saved for ${stockOnlyItems.length} item(s) of ${product.name}. Over Stocked reason auto-selected.`
                            });
                            // Auto-select "Over Stocked" option
                            handleAutoSelectOverStocked();
                          } else {
                            toast({
                              title: "Stock Updated",
                              description: `Stock quantities saved for ${stockOnlyItems.length} item(s) of ${product.name}.`
                            });
                          }
                        }
                      } else {
                        // Handle single products without variants
                        addToCart(product);
                      }

                      // Mark item as added and keep it in the set (persistent state)
                      setAddedItems(prev => new Set([...prev, product.id]));
                    }} className={`w-full h-8 text-xs transition-all duration-300 ${addedItems.has(product.id) ? 'bg-green-600 hover:bg-green-700 text-white border-green-600' : 'bg-primary hover:bg-primary/90 text-primary-foreground'}`} disabled={(() => {
                      if (product.variants && product.variants.length > 0) {
                        // Check if base product has quantity or stock
                        const baseQty = quantities[product.id] || 0;
                        const baseStock = closingStocks[product.id] || 0;
                        const hasValidBase = baseQty > 0 || baseStock > 0;

                        // Check if any variant has quantity or stock
                        const hasValidVariant = product.variants.some(v => {
                          const variantCompositeId = `${product.id}_variant_${v.id}`;
                          const variantQty = quantities[variantCompositeId] || 0;
                          const variantStock = closingStocks[variantCompositeId] || 0;
                          return variantQty > 0 || variantStock > 0;
                        });
                        // Button is enabled if either quantity OR stock exists
                        return !hasValidBase && !hasValidVariant;
                      } else {
                        // For single products - enable if either quantity OR stock exists
                        const displayProduct = getDisplayProduct(product);
                        const qty = quantities[displayProduct.id] || 0;
                        const stock = closingStocks[displayProduct.id] || 0;
                        return qty <= 0 && stock <= 0;
                      }
                    })()}>
                         {addedItems.has(product.id) ? <>
                             <Check className="w-3 h-3 mr-1" />
                             Added
                           </> : <>
                             <Plus className="w-3 h-3 mr-1" />
                             Add {(() => {
                          if (product.variants && product.variants.length > 0) {
                            // Show total quantity for products with variants
                            const baseQty = quantities[product.id] || 0;
                            const variantQty = product.variants.reduce((sum, v) => {
                              const variantCompositeId = `${product.id}_variant_${v.id}`;
                              return sum + (quantities[variantCompositeId] || 0);
                            }, 0);
                            const totalQty = baseQty + variantQty;
                            return totalQty > 0 ? `${totalQty} item(s)` : '';
                          } else {
                            // Show quantity for single products
                            const displayProduct = getDisplayProduct(product);
                            const qty = quantities[displayProduct.id] || 0;
                            return qty > 0 ? `${qty} ${displayProduct.unit}(s)` : '';
                          }
                        })()} 
                           </>}
                       </Button>
                      </div>
                  </CardContent>
               </Card>;
            })}
           </div>

        </div>
        </> : (/* Table Order Form */
      <TableOrderForm 
        ref={tableFormRef}
        products={availableCachedProducts}
        loading={offlineLoading}
        onReloadProducts={reloadProductsFromMaster}
        onCartUpdate={handleBulkCartUpdate}
        onStockUpdate={(productId, stockQuantity, productName) => {
          saveStockData(productId, stockQuantity, productName);
        }}
      />)}

        
        {/* Order Summary Modal */}
        <OrderSummaryModal isOpen={showOrderSummary} onClose={() => setShowOrderSummary(false)} items={getSelectionDetails().items} totalAmount={getSelectionValue()} totalSavings={getSelectionDetails().totalSavings} onAddToCart={handleAddAllToCart} productName={currentProductName} />
        
        {/* Scheme Details Modal */}
        <SchemeDetailsModal isOpen={showSchemeModal} onClose={() => setShowSchemeModal(false)} productName={selectedProductForScheme?.name || "Product"} schemes={filteredSchemes} />

        {/* Retailer Visit Details Modal */}
        {currentLog && (
          <RetailerVisitDetailsModal
            open={showVisitDetailsModal}
            onOpenChange={setShowVisitDetailsModal}
            retailerName={retailerName}
            startTime={currentLog.start_time}
            endTime={currentLog.end_time}
            timeSpent={timeSpent}
            distance={distance}
            locationStatus={locationStatus}
            actionType={currentLog.action_type}
            isPhoneOrder={isPhoneOrder}
            logId={currentLog.id}
          />
        )}

        {/* Image Stock Capture Modal */}
        <ImageStockCapture isOpen={showImageCapture} onClose={() => setShowImageCapture(false)} onApprove={async stockCounts => {
        try {
          const {
            data: {
              user
            }
          } = await supabase.auth.getUser();
          if (!user) {
            toast({
              title: 'Not signed in',
              description: 'Please sign in and try again',
              variant: 'destructive'
            });
            return;
          }
          const today = new Date().toISOString().split('T')[0];

          // Enhanced matching: Match detected products with local products by ID or name
          const matchedStockUpdates: {
            [key: string]: number;
          } = {};
          const databaseRecords: any[] = [];
          console.log('🔍 Processing AI detected stock counts:', stockCounts);
          console.log('📦 Available products:', products.map(p => ({
            id: p.id,
            name: p.name,
            variants: p.variants?.length || 0
          })));
          stockCounts.forEach(({
            productId,
            productName,
            count
          }) => {
            // Try to find product by ID first
            let matchedProduct = products.find(p => p.id === productId);

            // If not found by ID, try to match by name (case-insensitive and partial match)
            if (!matchedProduct && productName) {
              const searchName = productName.toLowerCase().trim();
              matchedProduct = products.find(p => {
                const pName = p.name.toLowerCase().trim();
                // Match if product name contains the detected name OR detected name contains product name
                return pName.includes(searchName) || searchName.includes(pName);
              });
              console.log(`🔎 Matching by name for "${productName}":`, matchedProduct?.name || 'No match');
            }
            if (matchedProduct) {
              console.log(`✅ Matched product:`, {
                id: matchedProduct.id,
                name: matchedProduct.name,
                count
              });

              // Update stock for the matched product
              if (matchedProduct.variants && matchedProduct.variants.length > 0) {
                // Has variants - update all variants with the same stock count
                matchedProduct.variants.forEach(variant => {
                  const variantCompositeId = `${matchedProduct.id}_variant_${variant.id}`;
                  matchedStockUpdates[variantCompositeId] = count;
                  console.log(`📝 Updated variant stock: ${variantCompositeId} = ${count}`);
                });

                // Also update base product stock
                matchedStockUpdates[matchedProduct.id] = count;
              } else {
                // No variants - update base product
                matchedStockUpdates[matchedProduct.id] = count;
                console.log(`📝 Updated base product stock: ${matchedProduct.id} = ${count}`);
              }

              // Create database record
              databaseRecords.push({
                user_id: user.id,
                retailer_id: retailerId,
                visit_id: visitId,
                product_id: matchedProduct.id,
                product_name: matchedProduct.name,
                stock_quantity: count,
                ordered_quantity: 0,
                visit_date: today
              });
            } else {
              console.warn(`⚠️ Could not match detected product: "${productName || productId}"`);
            }
          });
          console.log('📊 Final stock updates to apply:', matchedStockUpdates);

          // Save to database
          if (databaseRecords.length > 0) {
            const {
              error: insertError
            } = await supabase.from('stock_cycle_data').insert(databaseRecords);
            if (insertError) {
              console.error('Database insert error:', insertError);
              throw insertError;
            }
            console.log('✅ Saved to database:', databaseRecords.length, 'records');
          }

          // Update local state for immediate UI feedback
          setClosingStocks(prev => {
            const updated = {
              ...prev,
              ...matchedStockUpdates
            };
            console.log('📦 Updated closingStocks state:', updated);
            return updated;
          });

          // Also save to localStorage for persistence
          const stockKey = activeStorageKey.replace('order_cart:', 'order_stocks:');
          const existingStocks = JSON.parse(localStorage.getItem(stockKey) || '{}');
          const mergedStocks = {
            ...existingStocks,
            ...matchedStockUpdates
          };
          localStorage.setItem(stockKey, JSON.stringify(mergedStocks));
          console.log('💾 Saved to localStorage:', mergedStocks);
          const matchedCount = Object.keys(matchedStockUpdates).length;
          if (matchedCount > 0) {
            toast({
              title: 'Stock Updated Successfully',
              description: `Updated stock for ${matchedCount} item${matchedCount === 1 ? '' : 's'}. Check "Stock Qty" column in the order form.`,
              duration: 5000
            });
          } else {
            toast({
              title: 'No Products Matched',
              description: 'Could not match detected products with available products. Please check product names.',
              variant: 'destructive',
              duration: 5000
            });
          }
          console.log('✅ Stock update complete. Matched products:', matchedCount);
        } catch (e: any) {
          console.error('Error saving stock records:', e);
          toast({
            title: 'Failed to update stock',
            description: e?.message || 'Please try again',
            variant: 'destructive'
          });
        } finally {
          setShowImageCapture(false);
        }
      }} />
      </div>
    </div>

    {/* Delete Confirmation Dialog */}
    <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear all items?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove all {cart.length} items from your order. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={clearAllFormData} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Clear All
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Overstock Prompt Dialog */}
    <AlertDialog open={showOverstockPrompt} onOpenChange={setShowOverstockPrompt}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Update Stock Count?</AlertDialogTitle>
          <AlertDialogDescription>
            Would you like to update the retailer's current stock quantities before submitting? You can update stock counts in the Grid or Table view.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>No, Continue</AlertDialogCancel>
          <AlertDialogAction onClick={() => {
            setShowOverstockPrompt(false);
            setOrderMode("table");
          }}>
            Yes, Update Stock
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </Layout>;
};