import React from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import InvoiceTemplateRenderer from "@/components/invoice/InvoiceTemplateRenderer";
import { Trash2, Gift, ShoppingCart, Eye, Camera, FileText, Tag, Sparkles, Truck, Check, Calendar, Info } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { CartItemDetail } from "@/components/CartItemDetail";
import { CameraCapture } from "@/components/CameraCapture";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, addDays } from "date-fns";
import { usePaymentProofMandatory } from '@/hooks/usePaymentProofMandatory';
import { awardPointsForOrder, updateRetailerSequence, awardPointsForTotalVisits } from "@/utils/gamificationPointsAwarder";
import { awardLoyaltyPointsForOrder } from "@/utils/retailerLoyaltyPointsAwarder";
import { CreditScoreDisplay } from "@/components/CreditScoreDisplay";
import { submitOrderWithOfflineSupport } from "@/utils/offlineOrderUtils";
import { offlineStorage, STORES } from "@/lib/offlineStorage";
import { useConnectivity } from "@/hooks/useConnectivity";
import { retailerStatusRegistry } from "@/lib/retailerStatusRegistry";
import { visitStatusCache } from "@/lib/visitStatusCache";
import { addOrderToSnapshot } from "@/lib/myVisitsSnapshot";
import { syncOrdersToVanStock, getTodayDateString } from "@/utils/vanStockSync";
import { calculateLocalVanStockUpdate } from "@/utils/localVanStockSync";
import { getLocalTodayDate } from "@/utils/dateUtils";
import { getOnBehalfContext, clearOnBehalfContext } from "@/lib/onBehalfContext";
import { getOutOfBeatContext, clearOutOfBeatContext } from "@/lib/outOfBeatContext";
import { useTodaysBeatIds } from "@/hooks/useTodaysBeatIds";
import { isSlowConnection } from "@/utils/internetSpeedCheck";
import { useOfflineSchemes } from "@/hooks/useOfflineSchemes";
import { useAppliedSchemes } from "@/hooks/useAppliedSchemes";
import { calculateOrderWithSchemes, SchemeItem, formatSchemeDetailsForInvoice, ItemSchemeDetail } from "@/utils/schemeEngine";
import { markVisitDataChanged } from "@/lib/visitChangeMarker";
import { useD1Delivery } from "@/hooks/useD1Delivery";
import { useOrderBasedDelivery } from "@/hooks/useOrderBasedDelivery";
import { useVanSales } from "@/hooks/useVanSales";
import { useOrderEditPolicy } from "@/hooks/useOrderEditPolicy";
import { shouldGenerateInvoiceAtCart, getOrderConfirmationMessage } from "@/utils/invoiceGenerationUtils";
import { computeLineTax, sumLineTaxes } from "@/utils/taxCalc";

interface CartItem {
  id: string;
  name: string;
  category: string;
  rate: number;
  unit: string;
  base_unit?: string;
  quantity: number;
  total: number;
  hsn_code?: string;
  gst_percentage?: number | null;
  tax_master_id?: string | null;
  uom_id?: string | null;
  uom_code?: string | null;
  conversion_to_base?: number | null;
  schemeConditionQuantity?: number;
  schemeDiscountPercentage?: number;
  schemes?: Array<{
    is_active: boolean;
    condition_quantity?: number;
    discount_percentage?: number;
  }>;
  display_unit?: string; // Original unit selected by user (KG or Grams)
  display_quantity?: number; // Original quantity in user's unit
}
type AnyCartItem = CartItem;

// Helper to get display-friendly quantity and unit
const getDisplayQuantityAndUnit = (item: CartItem) => {
  // If display_unit and display_quantity are available, use them
  if (item.display_unit && item.display_quantity !== undefined) {
    return { qty: item.display_quantity, unit: item.display_unit };
  }
  // Fallback: If quantity is in grams, convert large amounts to KG for display
  if (item.unit?.toLowerCase() === 'grams' && item.quantity >= 1000) {
    return { qty: item.quantity / 1000, unit: 'KG' };
  }
  return { qty: item.quantity, unit: item.unit };
};

// Helper to get quantity increment based on display unit
const getQuantityIncrement = (item: CartItem) => {
  const displayUnit = item.display_unit?.toLowerCase() || item.unit?.toLowerCase() || 'grams';
  // If display unit is KG, increment by 1000 grams (1 KG)
  if (displayUnit === 'kg' || displayUnit === 'kilogram' || displayUnit === 'kilograms') {
    return 1000;
  }
  // Otherwise increment by 1 (for grams, pieces, etc.)
  return 1;
};

// Format quantity for display (show decimals only if needed)
const formatDisplayQuantity = (qty: number) => {
  if (Number.isInteger(qty)) return qty.toString();
  return qty.toFixed(2).replace(/\.?0+$/, '');
};

// Unit conversion helper - rate is already stored per selected unit, just return it
const getDisplayRate = (item: CartItem) => {
  // Rate is already converted and stored per the selected unit
  return Number(item.rate) || 0;
};

// Currency formatter - exact with 2 decimals for item-level values
const formatExact = (value: number) => {
  const num = Number(value) || 0;
  return num.toFixed(2);
};

// Currency formatter - rounded to whole number for final totals only
const formatRounded = (value: number) => {
  const num = Number(value) || 0;
  const rounded = Math.round(num);
  return rounded.toLocaleString('en-IN');
};
export const Cart = () => {
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
  const { isPaymentProofMandatory } = usePaymentProofMandatory();
  const connectivityStatus = useConnectivity();
  const { isEnabled: isD1DeliveryEnabled } = useD1Delivery();
  const { isEnabled: isOrderBasedDeliveryEnabled } = useOrderBasedDelivery();
  const { isVanSalesEnabled } = useVanSales();
  const [companyQrCode, setCompanyQrCode] = React.useState<string | null>(null);
  const [editReason, setEditReason] = React.useState<string>('');
  const editPolicy = useOrderEditPolicy();
  const editReasonRequired = isEditMode && editPolicy.edit_require_reason;

  // Backdated-order context set by My Visits when the user picked a past date.
  const [backdateCtx, setBackdateCtx] = React.useState<{ date: string; requireReason: boolean } | null>(() => {
    try {
      const raw = sessionStorage.getItem('backdated_order_context');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const today = getLocalTodayDate();
      if (parsed?.date && parsed.date < today) {
        return { date: parsed.date, requireReason: parsed.requireReason !== false };
      }
    } catch {}
    return null;
  });
  const [backdateReason, setBackdateReason] = React.useState<string>('');

  // Clear any stale (today/future) backdated context on mount so it can't leak into this or the next order.
  // Also clear it when the visitId encodes a date that doesn't match the backdate context — this happens
  // when a previous backdated session left a sticky value in sessionStorage and the user then opens a
  // today's (or different-day's) visit.
  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem('backdated_order_context');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const today = getLocalTodayDate();
      // Extract yyyy-mm-dd embedded in an offline visit id like offline_<user>_<retailer>_YYYY-MM-DD_<ts>
      const visitDateMatch = visitId.match(/_(\d{4}-\d{2}-\d{2})_/);
      const visitDate = visitDateMatch?.[1] ?? null;
      const isStale =
        !parsed?.date ||
        parsed.date >= today ||
        (visitDate && parsed.date !== visitDate);
      if (isStale) {
        sessionStorage.removeItem('backdated_order_context');
        setBackdateCtx(null);
      }
    } catch {
      sessionStorage.removeItem('backdated_order_context');
      setBackdateCtx(null);
    }
  }, [visitId]);


  const getEffectiveOrderDate = React.useCallback(
    () => backdateCtx?.date ?? getLocalTodayDate(),
    [backdateCtx]
  );
  const isBackdated = !!backdateCtx && backdateCtx.date < getLocalTodayDate();

  // On-behalf context: when a manager/admin selected a target user in the View-As selector
  // before opening this cart, the order will be credited to that user (user_id) while the
  // logged-in user is recorded as placed_by_user_id. Server enforces the permission + team check.
  const [onBehalfCtx] = React.useState<{ userId: string; name: string } | null>(() => getOnBehalfContext());
  const isOnBehalf = !!onBehalfCtx;

  // Out-of-beat context set by MyRetailers when the picked retailer is outside today's beat.
  // Server re-validates the OOB scope and applies the credit rule (owner vs collector).
  const [oobCtx] = React.useState(() => getOutOfBeatContext());
  const { data: todaysBeatIds } = useTodaysBeatIds();


  
  // Order-based delivery payment state (COD / Pay Now)
  const [deliveryPaymentType, setDeliveryPaymentType] = React.useState<'cod' | 'pay_now' | ''>('');
  // Fulfillment choice — default to next-day when D-1 is available
  const [fulfillmentChoice, setFulfillmentChoice] = React.useState<'deliver_now' | 'next_day'>('next_day');

  // Fix retailerId validation - don't use "." as a valid retailerId  
  const validRetailerId = retailerId && retailerId !== '.' && retailerId.length > 1 ? retailerId : null;
  const validVisitId = visitId && visitId.length > 1 ? visitId : null;

  // Out-of-beat flags shipped with the order payload (server re-validates + credits per policy)
  const isOutOfBeat = !!oobCtx && !!validRetailerId && oobCtx.retailerId === validRetailerId;
  const [retailerBeatIdForOOB, setRetailerBeatIdForOOB] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    if (!validRetailerId) { setRetailerBeatIdForOOB(null); return; }
    (async () => {
      try {
        const { data } = await supabase.from('retailers').select('beat_id').eq('id', validRetailerId).maybeSingle();
        if (!cancelled) setRetailerBeatIdForOOB(data?.beat_id ?? null);
      } catch { /* fallback: treat as planned */ }
    })();
    return () => { cancelled = true; };
  }, [validRetailerId]);
  const isPlannedBeat = isOutOfBeat
    ? false
    : (retailerBeatIdForOOB && todaysBeatIds ? todaysBeatIds.has(retailerBeatIdForOOB) : true);


  // Use visitId and retailerId from URL params consistently (same as Order Entry)
  const activeStorageKey = isEditMode
    ? `order_cart:edit:${editOrderId}`
    : validVisitId && validRetailerId
      ? `order_cart:${validVisitId}:${validRetailerId}`
      : validRetailerId ? `order_cart:temp:${validRetailerId}` : 'order_cart:fallback';
  
  // Table form storage key (to clear after successful order)
  const tableFormStorageKey = validVisitId && validRetailerId 
    ? `table_form:${validVisitId}:${validRetailerId}`
    : validRetailerId 
      ? `table_form:temp:${validRetailerId}`
      : 'table_form:fallback';

  // Load cart items IMMEDIATELY from localStorage (sync, no async)
  const getInitialCartItems = (): CartItem[] => {
    try {
      const rawData = localStorage.getItem(activeStorageKey);
      if (rawData && rawData !== 'undefined' && rawData !== 'null') {
        const parsedItems = JSON.parse(rawData);
        if (Array.isArray(parsedItems)) return parsedItems;
      }
    } catch (e) {
      console.error('Error loading initial cart:', e);
    }
    return [];
  };

  // Initialize states with immediate values - NO loading state needed
  const [cartItems, setCartItems] = React.useState<CartItem[]>(getInitialCartItems);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [loggedInUserName, setLoggedInUserName] = React.useState<string>("User");
  const [visitDate, setVisitDate] = React.useState<string | null>(null);
  const [selectedItem, setSelectedItem] = React.useState<CartItem | null>(null);
  const [showItemDetail, setShowItemDetail] = React.useState(false);
  const [pendingAmountFromPrevious, setPendingAmountFromPrevious] = React.useState<number>(0);

  // --- Phase 2b-3a: Edit mode state ---
  const [editLoading, setEditLoading] = React.useState<boolean>(isEditMode);
  const [editBlockedReason, setEditBlockedReason] = React.useState<string | null>(null);
  const [editOriginalOrder, setEditOriginalOrder] = React.useState<{
    id: string;
    user_id?: string | null;
    visit_id?: string | null;
    retailer_id?: string | null;
    total_amount?: number | null;
  } | null>(null);
  const [editInvoiceNumber, setEditInvoiceNumber] = React.useState<string | null>(null);

  React.useEffect(() => {
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

        // Fetch original order
        const { data: order, error: orderErr } = await supabase
          .from('orders')
          .select('id, status, invoice_generated_at, dispatched_at, user_id, visit_id, retailer_id, total_amount, credit_pending_amount, invoice_number')
          .eq('id', editOrderId)
          .maybeSingle();
        if (orderErr || !order) {
          setEditBlockedReason("This order can't be edited in its current state.");
          return;
        }

        // Fetch policy (single row)
        const { data: policyRow } = await supabase
          .from('order_edit_policy')
          .select('edit_enabled, editable_until')
          .limit(1)
          .maybeSingle();
        const policy = policyRow
          ? { edit_enabled: !!policyRow.edit_enabled, editable_until: policyRow.editable_until || 'invoice_generated' }
          : { edit_enabled: true, editable_until: 'invoice_generated' as const };

        // Fetch this user's permissions for action_order_edit
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
            .select('object_name, can_edit, can_read')
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
        setEditOriginalOrder(order as any);
        setEditInvoiceNumber((order as any)?.invoice_number || null);

        // Seed cart from order_items (only if edit cart not yet seeded)
        const editKey = `order_cart:edit:${editOrderId}`;
        const existing = localStorage.getItem(editKey);
        const isEmpty = !existing || existing === 'undefined' || existing === 'null' || existing === '[]';
        if (isEmpty) {
          const { data: items } = await supabase
            .from('order_items')
            .select('id, product_id, variant_id, product_name, category, rate, unit, quantity, total, hsn_code, uom_id, uom_code, conversion_to_base, original_rate, discount_amount, is_price_edited')
            .eq('order_id', editOrderId);
          const seeded: CartItem[] = (items || []).map((it: any) => {
            const cartId = it.variant_id
              ? `${it.product_id || it.id}_variant_${it.variant_id}`
              : (it.product_id || it.id);
            return {
              id: cartId,
              name: it.product_name,
              category: it.category || '',
              rate: Number(it.rate) || 0,
              unit: it.unit || 'pcs',
              quantity: Number(it.quantity) || 0,
              total: Number(it.total) || 0,
              hsn_code: it.hsn_code || undefined,
              uom_id: it.uom_id ?? null,
              uom_code: it.uom_code ?? null,
              conversion_to_base: it.conversion_to_base ?? null,
              ...(it.product_id ? { product_id: it.product_id } : {}),
              ...(it.variant_id ? { variant_id: it.variant_id } : {}),
              ...(it.original_rate ? { original_rate: Number(it.original_rate) } : {}),
              ...(it.is_price_edited ? { is_price_edited: true } : {}),
            } as any;
          });
          localStorage.setItem(editKey, JSON.stringify(seeded));
          if (!cancelled) setCartItems(seeded);
        }
      } catch (e: any) {
        console.error('[Cart][edit] bootstrap failed:', e);
        if (!cancelled) setEditBlockedReason(e?.message || "This order can't be edited in its current state.");
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isEditMode, editOrderId]);
  
  // Use scheme engine for calculations
  const { schemes, loading: schemesLoading } = useOfflineSchemes();
  const { appliedSchemeIds, manualSelections, clearSchemes } = useAppliedSchemes(validVisitId || '', validRetailerId || '');

  // Reload cart items when storage key changes, on mount, or when storage updates
  React.useEffect(() => {
    const loadCartFromStorage = () => {
      try {
        const rawData = localStorage.getItem(activeStorageKey);
        console.log('[Cart] Loading from storage key:', activeStorageKey, 'Data:', rawData);
        if (rawData && rawData !== 'undefined' && rawData !== 'null') {
          const parsedItems = JSON.parse(rawData);
          if (Array.isArray(parsedItems)) {
            console.log('[Cart] Loaded items:', parsedItems.map(i => ({ name: i.name, unit: i.unit, rate: i.rate })));
            setCartItems(parsedItems);
          }
        } else {
          // No data in storage, set empty cart
          setCartItems([]);
        }
      } catch (e) {
        console.error('Error loading cart from storage:', e);
      }
    };

    // Load immediately
    loadCartFromStorage();

    // Listen for storage changes from other components (real-time sync)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === activeStorageKey) {
        console.log('[Cart] Storage event detected, reloading cart');
        loadCartFromStorage();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [activeStorageKey]);

  // New payment flow state
  const [paymentType, setPaymentType] = React.useState<"" | "full" | "partial" | "credit">("");
  const [paymentMethod, setPaymentMethod] = React.useState<"" | "cash" | "cheque" | "upi" | "neft">("");
  const [partialAmount, setPartialAmount] = React.useState<string>("");
  const [chequePhotoUrl, setChequePhotoUrl] = React.useState<string>("");
  const [upiPhotoUrl, setUpiPhotoUrl] = React.useState<string>("");
  const [upiLastFourCode, setUpiLastFourCode] = React.useState<string>("");
  const [neftPhotoUrl, setNeftPhotoUrl] = React.useState<string>("");
  const [isCameraOpen, setIsCameraOpen] = React.useState(false);
  const [cameraMode, setCameraMode] = React.useState<"cheque" | "upi" | "neft">("cheque");
  const [showInvoicePreview, setShowInvoicePreview] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSubmittingD1, setIsSubmittingD1] = React.useState(false);
  const [companyData, setCompanyData] = React.useState<any>(null);
  const [retailerData, setRetailerData] = React.useState<any>(null);
  const [selectedTemplate, setSelectedTemplate] = React.useState<any>(null);
  const [selectedTemplateItems, setSelectedTemplateItems] = React.useState<any[]>([]);
  const [distributorInfo, setDistributorInfo] = React.useState<{ id: string | null; name: string | null }>({ id: null, name: null });
  
  // Background fetch for pending amount AND distributor - non-blocking (schemes now come from useOfflineSchemes)
  React.useEffect(() => {
    // Only fetch if online
    if (!navigator.onLine || !validRetailerId) return;
    
    // Fetch retailer's pending amount and distributor mapping
    supabase.from('retailers').select('pending_amount, distributor_id, distributors(id, name)').eq('id', validRetailerId).single()
      .then(({ data }) => {
        if (data) {
          const retailerPending = Number(data.pending_amount ?? 0);
          // In edit mode, the original order's outstanding is still in retailer.pending_amount.
          // Exclude it so "Previous Pending" reflects only OTHER active orders.
          const origOutstanding = isEditMode ? Number((editOriginalOrder as any)?.credit_pending_amount ?? 0) : 0;
          setPendingAmountFromPrevious(Math.max(0, retailerPending - origOutstanding));
          // Store distributor info for order submission
          const distributor = data.distributors as any;
          if (distributor) {
            setDistributorInfo({ id: distributor.id, name: distributor.name });
          } else if (data.distributor_id) {
            // Fallback: distributor_id exists but join failed, fetch separately
            supabase.from('distributors').select('id, name').eq('id', data.distributor_id).single()
              .then(({ data: distData }) => {
                if (distData) {
                  setDistributorInfo({ id: distData.id, name: distData.name });
                }
              });
          }
        }
      });
  }, [validRetailerId, isEditMode, editOriginalOrder]);

  // Calculate order totals using scheme engine
  const orderCalculation = React.useMemo(() => {
    const schemeItems: SchemeItem[] = cartItems.map(item => {
      const { qty: displayQuantity } = getDisplayQuantityAndUnit(item);
      const isKgDisplayUnit = (item.display_unit || item.unit || '').toLowerCase() === 'kg';
      const displayRate = isKgDisplayUnit && item.unit?.toLowerCase() === 'grams'
        ? getDisplayRate(item) * 1000
        : getDisplayRate(item);

      return {
        id: item.id,
        product_id: item.id.includes('_variant_') ? item.id.split('_variant_')[0] : item.id,
        variant_id: item.id.includes('_variant_') ? item.id.split('_variant_')[1] : undefined,
        quantity: displayQuantity,
        rate: displayRate,
        name: item.name
      };
    });
    
    return calculateOrderWithSchemes(schemeItems, schemes, appliedSchemeIds, manualSelections);
  }, [cartItems, schemes, appliedSchemeIds, manualSelections]);

  const computeItemSubtotal = (item: AnyCartItem) => {
    try {
      if (!item || !item.rate || !item.quantity) return 0;
      const displayRate = getDisplayRate(item);
      return Number(displayRate) * Number(item.quantity);
    } catch (error) {
      console.error('Error computing subtotal:', error);
      return 0;
    }
  };

  const computeItemDiscount = (item: AnyCartItem) => {
    // Use scheme engine's item discounts
    return orderCalculation.itemDiscounts[item.id] || 0;
  };

  const computeItemTotal = (item: AnyCartItem) => {
    try {
      if (!item) return 0;
      const subtotal = computeItemSubtotal(item);
      const discount = computeItemDiscount(item);
      return Math.max(0, subtotal - discount);
    } catch (error) {
      console.error('Error computing total:', error);
      return 0;
    }
  };
  // Fetch user data immediately from session cache (sync)
  React.useEffect(() => {
    const loadUserData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (user) {
          setUserId(user.id);
          // Use cached metadata immediately
          setLoggedInUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || "User");
          
          // Background fetch for profile if online
          if (navigator.onLine) {
            try {
              const { data: profile } = await supabase.from('profiles').select('full_name, username').eq('id', user.id).single();
              if (profile) {
                setLoggedInUserName(profile.full_name || profile.username || user.email?.split('@')[0] || "User");
              }
            } catch (e) { /* ignore */ }
          }
        }
      } catch (e) { /* ignore */ }
    };
    loadUserData();
    
    // Background fetch for QR code and visit date - non-blocking
    const loadBackgroundData = async () => {
      if (!navigator.onLine) return;
      try {
        const { data } = await supabase.from('companies').select('qr_code_url').limit(1).single();
        if (data?.qr_code_url) setCompanyQrCode(data.qr_code_url);
      } catch (e) { /* ignore */ }
      
      if (visitId) {
        try {
          const { data } = await supabase.from('visits').select('planned_date').eq('id', visitId).single();
          if (data) setVisitDate(data.planned_date);
        } catch (e) { /* ignore */ }
      }
    };
    loadBackgroundData();
  }, [visitId]);

  // Fetch invoice data in background - non-blocking
  React.useEffect(() => {
    if (!navigator.onLine) return;
    
    const loadInvoiceData = async () => {
      try {
        const { data } = await supabase.from("companies").select("*").limit(1).maybeSingle();
        if (data) setCompanyData(data);
      } catch (e) { /* ignore */ }

      if (validRetailerId) {
        try {
          const { data } = await supabase.from("retailers").select("name, address, phone, gst_number").eq("id", validRetailerId).single();
          if (data) setRetailerData(data);
        } catch (e) { /* ignore */ }
      }

      const selectedTemplateId = localStorage.getItem('selected_invoice_template');
      if (selectedTemplateId) {
        try {
          const { data } = await supabase.from("invoices").select(`*, retailers:customer_id(name, address, phone, gst_number), companies(*)`).eq("id", selectedTemplateId).single();
          if (data) {
            setSelectedTemplate(data);
            try {
              const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", selectedTemplateId);
              if (items) setSelectedTemplateItems(items);
            } catch (e) { /* ignore */ }
          }
        } catch (e) { /* ignore */ }
      }
    };
    loadInvoiceData();
  }, [validRetailerId]);

  // Listen for storage changes (when updated from OrderEntry) - cart already loaded initially
  React.useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === activeStorageKey) {
        try {
          const rawData = localStorage.getItem(activeStorageKey);
          if (rawData && rawData !== 'undefined' && rawData !== 'null') {
            const parsedItems = JSON.parse(rawData);
            if (Array.isArray(parsedItems)) setCartItems(parsedItems);
          }
        } catch (e) {
          console.error('Error reloading cart:', e);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [activeStorageKey]);
  React.useEffect(() => {
    localStorage.setItem(activeStorageKey, JSON.stringify(cartItems));
  }, [cartItems, activeStorageKey]);
  const removeFromCart = (productId: string) => {
    setCartItems(prev => prev.filter(item => item.id !== productId));
    // Also remove from OrderEntry quantities
    updateOrderEntryQuantities(productId, 0);
    toast({
      title: "Item Removed",
      description: "Item removed from cart"
    });
  };
  const updateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
      // Also update the quantities storage for OrderEntry sync
      updateOrderEntryQuantities(productId, 0);
      return;
    }
    setCartItems(prev => prev.map(item => {
      if (item.id === productId) {
        // Calculate display_quantity based on the display unit
        const displayUnit = item.display_unit?.toLowerCase() || item.unit?.toLowerCase() || 'grams';
        const isKgUnit = displayUnit === 'kg' || displayUnit === 'kilogram' || displayUnit === 'kilograms';
        
        // Calculate the new display quantity correctly based on the internal quantity
        const newDisplayQuantity = isKgUnit ? newQuantity / 1000 : newQuantity;

        const updatedItem = {
          ...item,
          quantity: newQuantity,
          display_quantity: newDisplayQuantity
        };

        // Remove pre-calculated total so schemes are recalculated based on new quantity
        delete (updatedItem as any).total;
        console.log('Updating quantity for:', updatedItem.name, 'New quantity:', newQuantity, 'Display quantity:', newDisplayQuantity, 'Schemes will be recalculated');

        // Update OrderEntry quantities storage - make sure to sync correctly
        updateOrderEntryQuantities(productId, newQuantity);
        return updatedItem;
      }
      return item;
    }));
  };

  // Function to update OrderEntry quantities storage
  const updateOrderEntryQuantities = (productId: string, quantity: number) => {
    const quantityKey = activeStorageKey.replace('order_cart:', 'order_quantities:');
    const existingQuantities = localStorage.getItem(quantityKey);
    try {
      const quantities = existingQuantities ? JSON.parse(existingQuantities) : {};
      if (quantity > 0) {
        quantities[productId] = quantity;
      } else {
        delete quantities[productId];
      }
      localStorage.setItem(quantityKey, JSON.stringify(quantities));
      console.log('Updated OrderEntry quantities:', {
        productId,
        quantity,
        allQuantities: quantities
      });
    } catch (error) {
      console.error('Error updating OrderEntry quantities:', error);
    }
  };
  const getSubtotal = () => {
    try {
      return cartItems.reduce((sum, item) => {
        if (!item) return sum;
        return sum + computeItemSubtotal(item);
      }, 0);
    } catch (error) {
      console.error('Error computing subtotal:', error);
      return 0;
    }
  };
  const getDiscount = () => {
    // Use scheme engine's calculated total discount
    return orderCalculation.totalDiscount;
  };
  const getAmountAfterDiscount = () => {
    try {
      const subtotal = getSubtotal();
      const discount = getDiscount();
      return Math.max(0, subtotal - discount);
    } catch (error) {
      console.error('Error computing amount after discount:', error);
      return 0;
    }
  };
  // Per-line GST using shared computeLineTax helper.
  // Recomputes on qty/price/discount/scheme changes only.
  const lineTaxes = React.useMemo(() => {
    return cartItems.map(it => computeLineTax({
      taxableAmount: computeItemTotal(it),
      gstPercentage: (it as any).gst_percentage,
    }));
  }, [cartItems, orderCalculation.itemDiscounts]);
  const taxTotals = React.useMemo(() => sumLineTaxes(lineTaxes), [lineTaxes]);

  const getCGST = () => taxTotals.cgst;
  const getSGST = () => taxTotals.sgst;
  const getFinalTotal = () => {
    try {
      return Math.max(0, getAmountAfterDiscount() + taxTotals.cgst + taxTotals.sgst + taxTotals.igst + taxTotals.cess);
    } catch (error) {
      console.error('Error computing final total:', error);
      return 0;
    }
  };

  // Fetch any missing gst_percentages for current cart items in one query.
  // Returns a new array with gst_percentage filled where it can be resolved.
  const ensureGstPercentages = async (items: CartItem[]): Promise<CartItem[]> => {
    const missingIds = Array.from(new Set(
      items
        .filter(it => it.gst_percentage == null)
        .map(it => (it as any).product_id || (typeof it.id === 'string' && it.id.includes('_variant_') ? it.id.split('_variant_')[0] : it.id))
        .filter((v): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))
    ));
    if (missingIds.length === 0) return items;
    try {
      const { data } = await supabase
        .from('products')
        .select('id, gst_percentage, hsn_code, tax_master_id')
        .in('id', missingIds);
      const byId = new Map<string, any>((data || []).map(p => [p.id, p]));
      return items.map(it => {
        if (it.gst_percentage != null) return it;
        const pid = (it as any).product_id || (typeof it.id === 'string' && it.id.includes('_variant_') ? it.id.split('_variant_')[0] : it.id);
        const p = byId.get(pid);
        if (!p) return it;
        return {
          ...it,
          gst_percentage: p.gst_percentage ?? null,
          hsn_code: it.hsn_code || p.hsn_code || undefined,
          tax_master_id: (it as any).tax_master_id || p.tax_master_id || null,
        } as CartItem;
      });
    } catch (e) {
      console.warn('[Cart] ensureGstPercentages failed (offline?):', e);
      return items;
    }
  };


  // Check if the visit date allows order submission
  const canSubmitOrder = () => {
    if (!visitDate) return true; // Allow if no visit date (backwards compatibility)
    const today = getLocalTodayDate(); // Get today's date in YYYY-MM-DD format (local timezone)
    console.log('Visit date:', visitDate, 'Today:', today, 'Can submit:', visitDate === today);
    return visitDate === today;
  };
  const getSubmitButtonText = () => {
    if (!visitDate) return "Submit Order";
    const today = getLocalTodayDate();
    if (visitDate === today) return "Submit Order";
    return `Order will be placed on ${new Date(visitDate).toLocaleDateString()}`;
  };
  const handleCameraCapture = async (blob: Blob) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authenticatedUserId = session?.user?.id || userId;
      if (!authenticatedUserId) {
        throw new Error("Please sign in again before uploading a payment proof");
      }

      // expense-bills is private and its RLS policy requires the first folder
      // segment to match the authenticated user's ID.
      const fileName = `${authenticatedUserId}/payment-${Date.now()}.jpg`;
      
      // Check if we're online
      if (connectivityStatus === 'online' && navigator.onLine) {
        // Online: Upload to Supabase storage
        const { error } = await supabase.storage.from('expense-bills').upload(fileName, blob, {
          contentType: blob.type || 'image/jpeg'
        });
        if (error) throw error;
        
        if (cameraMode === "cheque") {
          setChequePhotoUrl(fileName);
          toast({ title: "Cheque photo captured successfully" });
        } else if (cameraMode === "upi") {
          setUpiPhotoUrl(fileName);
          toast({ title: "Payment confirmation captured successfully" });
        } else if (cameraMode === "neft") {
          setNeftPhotoUrl(fileName);
          toast({ title: "NEFT confirmation captured successfully" });
        }
      } else {
        // Offline: Store blob as base64 for later upload
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64data = reader.result as string;
          const localUrl = URL.createObjectURL(blob);
          
          // Store base64 data in IndexedDB for later upload
          await offlineStorage.addToSyncQueue('UPLOAD_PAYMENT_PROOF', {
            fileName,
            blobBase64: base64data,
            type: cameraMode
          });
          
          if (cameraMode === "cheque") {
            setChequePhotoUrl(localUrl);
            toast({ title: "Cheque photo saved offline", description: "Will upload when online" });
          } else if (cameraMode === "upi") {
            setUpiPhotoUrl(localUrl);
            toast({ title: "Payment proof saved offline", description: "Will upload when online" });
          } else if (cameraMode === "neft") {
            setNeftPhotoUrl(localUrl);
            toast({ title: "NEFT proof saved offline", description: "Will upload when online" });
          }
        };
        reader.readAsDataURL(blob);
      }
      
      setIsCameraOpen(false);
    } catch (error) {
      console.error('Error handling photo:', error);
      toast({
        title: "Photo Capture Failed",
        description: connectivityStatus === 'offline' 
          ? "Photo saved locally, will sync when online" 
          : error instanceof Error ? error.message : "Failed to upload photo. Please try again.",
        variant: connectivityStatus === 'offline' ? "default" : "destructive"
      });
    }
  };
  const handleSubmitOrder = async () => {
    console.log('🧾 [Cart] handleSubmitOrder called', {
      connectivityStatus,
      navigatorOnline: navigator.onLine,
      paymentType,
      paymentMethod,
      cartItemsCount: cartItems.length
    });
    if (isSubmitting) return;

    if (isBackdated && backdateCtx?.requireReason && !backdateReason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Please enter a reason for this backdated order.',
        variant: 'destructive',
      });
      return;
    }

    if (editReasonRequired && !editReason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Please enter a reason for editing this order.',
        variant: 'destructive',
      });
      return;
    }

    
    if (cartItems.length === 0) {
      toast({
        title: "Empty Cart",
        description: "Please add items to cart before submitting",
        variant: "destructive"
      });
      return;
    }

    // Validate payment selections
    if (!paymentType) {
      toast({
        title: "Select Payment Type",
        description: "Please select Full Payment, Partial Payment, or Full Credit",
        variant: "destructive"
      });
      return;
    }
    if ((paymentType === "full" || paymentType === "partial") && !paymentMethod) {
      toast({
        title: "Select Payment Method",
        description: "Please select a payment method",
        variant: "destructive"
      });
      return;
    }
    if (paymentType === "partial" && (!partialAmount || parseFloat(partialAmount) <= 0)) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid partial payment amount",
        variant: "destructive"
      });
      return;
    }
    // Check payment proof ONLY when clearly online - SKIP entirely when offline
    // This allows offline orders to submit without payment proof photos
    const isDefinitelyOnline = (connectivityStatus === 'online' && navigator.onLine);
    
    console.log('💳 [Cart] Payment validation:', {
      isPaymentProofMandatory,
      isDefinitelyOnline,
      willValidate: isPaymentProofMandatory && isDefinitelyOnline,
      paymentMethod,
      chequePhotoUrl,
      upiPhotoUrl,
      neftPhotoUrl
    });
    
    // ONLY validate payment proofs when definitely online AND payment proof is mandatory
    if (isPaymentProofMandatory && isDefinitelyOnline) {
      console.log('✅ [Cart] Running payment proof validation (ONLINE MODE)');
      if (paymentMethod === "cheque" && !chequePhotoUrl) {
        console.log('❌ [Cart] Blocking: cheque photo required');
        toast({
          title: "Cheque Photo Required",
          description: "Please capture cheque photo",
          variant: "destructive"
        });
        return;
      }
      if (paymentMethod === "upi" && !upiPhotoUrl) {
        console.log('❌ [Cart] Blocking: UPI photo required');
        toast({
          title: "Payment Confirmation Required",
          description: "Please capture payment confirmation photo",
          variant: "destructive"
        });
        return;
      }
      if (paymentMethod === "neft" && !neftPhotoUrl) {
        console.log('❌ [Cart] Blocking: NEFT photo required');
        toast({
          title: "NEFT Confirmation Required",
          description: "Please capture NEFT confirmation photo",
          variant: "destructive"
        });
        return;
      }
      console.log('✅ [Cart] Payment proof validation passed');
    } else {
      console.log('⏭️ [Cart] SKIPPING payment proof validation (offline or not mandatory)');
    }

    // Check if order can be submitted today - BLOCK submission if not today
    if (!canSubmitOrder()) {
      toast({
        title: "Order Scheduled",
        description: `This order will be submitted on ${new Date(visitDate!).toLocaleDateString()}. Items will remain in your cart until then.`,
        variant: "default"
      });
      return; // This prevents any further execution
    }
    setIsSubmitting(true);

    try {
      // Get current user - use getSession() for offline support (reads from localStorage cache)
      const {
        data: { session }
      } = await supabase.auth.getSession();
      const user = session?.user;
      
      // Fallback to cached userId if session is unavailable (deep offline)
      const currentUserId = user?.id || userId;
      
      if (!currentUserId) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to submit orders",
          variant: "destructive"
        });
        return;
      }
      // Submit-time fallback: ensure every cart item has a GST rate before computing tax.
      const enrichedItems = await ensureGstPercentages(cartItems);
      if (enrichedItems !== cartItems) setCartItems(enrichedItems);
      const submissionLineTaxes = enrichedItems.map(it => computeLineTax({
        taxableAmount: computeItemTotal(it),
        gstPercentage: (it as any).gst_percentage,
      }));
      const submissionTaxTotals = sumLineTaxes(submissionLineTaxes);

      const subtotal = getSubtotal();
      const discountAmount = getDiscount();
      const cgstAmount = submissionTaxTotals.cgst;
      const sgstAmount = submissionTaxTotals.sgst;
      // CRITICAL: Round total amount ONCE at the source to ensure consistency
      // This prevents different values being stored in DB vs cache vs snapshot
      const totalAmount = Math.round(Math.max(0, getAmountAfterDiscount() + submissionTaxTotals.cgst + submissionTaxTotals.sgst));
      // Prepare IDs
      const validRetailerId = retailerId && /^[0-9a-fA-F-]{36}$/.test(retailerId) ? retailerId : null;
      const validVisitId = visitId && /^[0-9a-fA-F-]{36}$/.test(visitId) ? visitId : null;

      // Calculate credit amounts based on new payment flow
      const totalDue = pendingAmountFromPrevious + totalAmount;
      let newTotalPending = 0;
      let creditPending = 0;
      let creditPaid = 0;
      let previousPendingCleared = 0;
      let isCreditOrder = false;
      let orderPaymentMethod = "";
      let paymentProofUrl = "";
      if (paymentType === "credit") {
        // Full credit - no payment received
        isCreditOrder = true;
        newTotalPending = totalDue;
        creditPending = totalAmount;
        creditPaid = 0;
        previousPendingCleared = 0;
        orderPaymentMethod = "credit";
      } else if (paymentType === "full") {
        // Full payment - routed through FIFO post-insert. Order row starts unpaid;
        // apply_retailer_payment_fifo will clear oldest pending first (incl. this order).
        isCreditOrder = true;
        newTotalPending = Math.max(0, totalDue - totalAmount);
        previousPendingCleared = 0;
        creditPaid = 0;
        creditPending = totalAmount;
        orderPaymentMethod = paymentMethod;
        paymentProofUrl = paymentMethod === "cheque" ? chequePhotoUrl : paymentMethod === "upi" ? upiPhotoUrl : paymentMethod === "neft" ? neftPhotoUrl : "";
      } else if (paymentType === "partial") {
        // Partial payment - routed through FIFO post-insert. Order row carries its
        // OWN total as pending; FIFO RPC allocates the payment oldest-first.
        isCreditOrder = true;
        const paidAmount = parseFloat(partialAmount);
        previousPendingCleared = 0;
        creditPaid = 0;
        creditPending = totalAmount;
        newTotalPending = Math.max(0, totalDue - paidAmount);
        orderPaymentMethod = paymentMethod;
        paymentProofUrl = paymentMethod === "cheque" ? chequePhotoUrl : paymentMethod === "upi" ? upiPhotoUrl : paymentMethod === "neft" ? neftPhotoUrl : "";
      }

      // EDIT MODE: the cart must NOT collect a payment as part of the order
      // insert itself. The replacement is created with paid=0/pending=total;
      // finalize_order_edit then carries the original's payment and (below)
      // reconciles to the edited payment intent (full/partial/credit) using
      // a single delta collection — never a credit note.
      const editIntendedPaid = !isEditMode ? 0 :
        paymentType === 'full'    ? totalAmount :
        paymentType === 'partial' ? Math.max(0, parseFloat(partialAmount) || 0) : 0;
      const editDeltaProofUrl =
        paymentMethod === 'cheque' ? chequePhotoUrl :
        paymentMethod === 'upi'    ? upiPhotoUrl :
        paymentMethod === 'neft'   ? neftPhotoUrl : "";
      if (isEditMode) {
        isCreditOrder = true;
        creditPaid = 0;
        creditPending = totalAmount;
        previousPendingCleared = 0;
        newTotalPending = totalDue;
        paymentProofUrl = "";
      }

      console.time('⚡ Order Submission');

      // ALWAYS ensure we have a visit for this order (phone orders AND regular orders)
      // This ensures visit_id is never NULL in orders, fixing Today's Progress update issues
      let actualVisitId = validVisitId;
      const today = getEffectiveOrderDate();
      const isOnline = connectivityStatus === 'online' && navigator.onLine;
      
      // If no visit exists, find or create one
      if (!actualVisitId && validRetailerId && currentUserId) {
        // First check if a visit already exists for this retailer today
        if (isOnline) {
          const { data: existingVisit } = await supabase
            .from('visits')
            .select('id')
            .eq('user_id', currentUserId)
            .eq('retailer_id', validRetailerId)
            .eq('planned_date', today)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (existingVisit) {
            actualVisitId = existingVisit.id;
            console.log('[Cart] Found existing visit:', actualVisitId);
          } else {
            // Create new visit with productive status
            const { data: newVisit, error: visitError } = await supabase
              .from('visits')
              .insert({
                user_id: currentUserId,
                retailer_id: validRetailerId,
                planned_date: today,
                status: 'productive',
                skip_check_in_reason: isPhoneOrder ? 'phone-order' : 'direct-order',
                skip_check_in_time: new Date().toISOString()
              })
              .select()
              .single();
            
            if (visitError) {
              console.error('Error creating visit:', visitError);
              // Continue with generated ID for offline sync
            } else if (newVisit) {
              actualVisitId = newVisit.id;
              console.log('[Cart] Created new visit:', actualVisitId);
            }
          }
        }
        
        // If still no visit ID (offline or error), generate one for local use
        if (!actualVisitId) {
          actualVisitId = crypto.randomUUID();
          
          const offlineVisit = {
            id: actualVisitId,
            user_id: currentUserId,
            retailer_id: validRetailerId,
            planned_date: today,
            status: 'productive',
            skip_check_in_reason: isPhoneOrder ? 'phone-order' : 'direct-order',
            skip_check_in_time: new Date().toISOString(),
            created_at: new Date().toISOString()
          };
          
          // Queue visit creation for sync and save locally
          await offlineStorage.addToSyncQueue('CREATE_VISIT', offlineVisit);
          await offlineStorage.save(STORES.VISITS, offlineVisit);
          console.log('📵 Visit queued for offline sync:', actualVisitId);
        }
      }

      // Prepare scheme details for invoice
      const schemeDetailsText = formatSchemeDetailsForInvoice(orderCalculation.appliedSchemes);

      // Prepare order data - use currentUserId which works both online and offline
      // ALWAYS include visit_id - we now ensure it always exists above
      
      // CRITICAL FIX: Generate idempotency key to prevent duplicate orders
      // This key is unique per order attempt and will be checked before insertion
      const idempotencyKey = `${currentUserId}_${validRetailerId}_${getLocalTodayDate()}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      
      const orderData = {
        user_id: isOnBehalf ? onBehalfCtx!.userId : currentUserId,
        placed_by_user_id: isOnBehalf ? currentUserId : undefined,
        visit_id: actualVisitId, // ALWAYS include - ensures database trigger can update visit status
        retailer_id: validRetailerId,
        retailer_name: retailerName,
        // CRITICAL: Store distributor at order time - this preserves the mapping even if retailer's distributor changes later
        distributor_id: distributorInfo.id || null,
        distributor_name: distributorInfo.name || null,
        order_date: getEffectiveOrderDate(),
        is_backdated: isBackdated,
        backdate_reason: isBackdated ? (backdateReason.trim() || null) : null,
        is_out_of_beat: isOutOfBeat,
        out_of_beat_reason: isOutOfBeat ? (oobCtx?.reason?.trim() || null) : null,
        is_planned_beat: !isOutOfBeat,
        oob_location: isOutOfBeat && oobCtx?.gpsLat != null
          ? { lat: oobCtx.gpsLat, lng: oobCtx.gpsLng }
          : null,
        subtotal,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        status: 'confirmed',
        is_credit_order: isCreditOrder,
        credit_pending_amount: creditPending,
        credit_paid_amount: creditPaid,
        previous_pending_cleared: previousPendingCleared,
        payment_method: orderPaymentMethod,
        payment_proof_url: paymentProofUrl || null,
        upi_last_four_code: paymentMethod === 'upi' ? upiLastFourCode : null,
        idempotency_key: idempotencyKey
        // Note: scheme_details removed as column doesn't exist in orders table
      };

      const orderItems = enrichedItems.map((item, idx) => {
        const itemDiscount = orderCalculation.itemDiscounts[item.id] || 0;
        const currentRate = getDisplayRate(item);
        // Use original_rate from cart item if available (set by TableOrderForm), otherwise use current rate
        const originalRate = (item as any).original_rate || currentRate;
        const discountPerItem = item.quantity > 0 ? itemDiscount / item.quantity : 0;
        const itemTotal = computeItemTotal(item);

        // Per-line GST from shared computeLineTax (intrastate: CGST+SGST = gst%/2 each)
        const lineTax = submissionLineTaxes[idx];
        const sgstAmount = lineTax?.sgst ?? 0;
        const cgstAmount = lineTax?.cgst ?? 0;
        
        // Split composite cart id "baseProductId_variant_variantId" into proper FK fields.
        // product_id MUST be the base product UUID (FK to products.id);
        // variant_id holds the variant UUID separately (FK to product_variants.id).
        const isUUID = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
        let productId: string | null = (item as any).product_id || item.id;
        let variantId: string | null = (item as any).variant_id || null;
        if (item.id && item.id.includes('_variant_')) {
          const parts = item.id.split('_variant_');
          productId = parts[0] || productId;
          variantId = parts[1] || variantId;
        }
        if (!isUUID(productId)) productId = null;
        if (!isUUID(variantId)) variantId = null;
        // Preserve raw composite id so server-side fallback can also recover variant
        const rawCompositeId = item.id;

        return {
          id: rawCompositeId,
          product_id: productId,
          variant_id: variantId,
          // SKUs let the server-side RPC re-resolve product_id/variant_id if the
          // cached UUID is stale (product re-created or imported with a new id).
          sku: (item as any).sku || null,
          variant_sku: (item as any).variant_sku || null,
          product_name: item.name,
          category: item.category,
          rate: currentRate - discountPerItem, // Store discounted rate
          original_rate: originalRate, // Store original MRP rate
          discount_amount: itemDiscount,
          unit: item.unit,
          uom_id: (item as any).uom_id || null,
          uom_code: (item as any).uom_code || item.unit,
          conversion_to_base: (item as any).conversion_to_base ?? null,
          quantity: item.quantity,
          total: itemTotal,
          hsn_code: (item as any).hsn_code || null, // Include HSN if available
          tax_master_id: (item as any).tax_master_id ?? null,
          tax_rate_snapshot: lineTax?.taxRate ?? 0,
          cgst_rate: (lineTax?.taxRate ?? 0) / 2,
          sgst_rate: (lineTax?.taxRate ?? 0) / 2,
          cgst_amount: cgstAmount,
          sgst_amount: sgstAmount,
          igst_rate: 0,
          igst_amount: 0,
          cess_rate: 0,
          cess_amount: lineTax?.cess ?? 0,
          is_price_edited: !!(item as any).is_price_edited,
        };
      });

      // Add free items from BOGO schemes as separate order items with ₹0 price
      const freeOrderItems = orderCalculation.appliedSchemes
        .filter(s => s.free_items && s.free_items.length > 0)
        .flatMap(s => s.free_items!.map(freeItem => ({
          // Only set product_id if it's a real UUID; otherwise null so the DB cast doesn't fail
          product_id: (typeof freeItem.product_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(freeItem.product_id)) ? freeItem.product_id : null,
          variant_id: null,
          product_name: `${freeItem.product_name} (FREE)`,
          category: 'Free Item',
          rate: 0,
          original_rate: freeItem.original_rate || 0,
          discount_amount: 0,
          unit: freeItem.unit || 'pcs',
          quantity: freeItem.quantity,
          total: 0,
          hsn_code: null,
          sgst_amount: 0,
          cgst_amount: 0
        })));

      // Combine regular items with free items
      const allOrderItems = [...orderItems, ...freeOrderItems];

      // Submit order using offline-capable utility with improved feedback
      let orderSubmissionFailed = false;
      const result = await submitOrderWithOfflineSupport(orderData, allOrderItems, {
        connectivityStatus,
        onOffline: () => {
          toast({
            title: "📵 Order Saved Offline",
            description: "Your order will sync automatically when you're back online. Data is safely stored on your device.",
          });
        },
        onOnline: () => {
          toast({
            title: "✅ Order Placed Successfully",
            description: `Order for ${retailerName} has been confirmed and saved.`,
          });
        }
      });
      
      // Check if the result indicates failure (no order ID and not marked as offline)
      if (!result.order?.id && !result.offline) {
        orderSubmissionFailed = true;
        toast({
          title: "⚠️ Order Save Issue",
          description: "Order may not have saved correctly. Please check your orders list.",
          variant: "destructive"
        });
      }

      console.timeEnd('⚡ Order Submission');

      console.log('✅ Order created successfully:', {
        orderId: result.order?.id,
        offline: result.offline,
        retailerId: validRetailerId,
        newTotalPending
      });

      // Update retailer's last_order_date only.
      // pending_amount is updated atomically inside sync_order_with_items_v2 (delta-based),
      // which also writes retailer_pending_audit. Writing it again here caused double-counting.
      if (validRetailerId && !result.offline) {
        const { error: retailerUpdateError } = await supabase
          .from('retailers')
          .update({ last_order_date: new Date().toISOString().split('T')[0] })
          .eq('id', validRetailerId);
        if (retailerUpdateError) {
          console.error('❌ Failed to update retailer last_order_date:', retailerUpdateError);
        }
      }

      // FIFO at-order payment: record collection + allocate oldest-first across all
      // pending credit orders (including this new one). Idempotent per collection_id.
      const atOrderAmountPaid =
        paymentType === 'full' ? totalAmount :
        paymentType === 'partial' ? Math.max(0, parseFloat(partialAmount) || 0) : 0;
      let syncedOrderRow: any = null;
      let syncedOrderAllocations: any[] = [];
      if (!isEditMode && atOrderAmountPaid > 0 && validRetailerId && result.order?.id) {
        // Pre-mint the collection id so the online insert, offline enqueue, and
        // any later retry all target the same row (idempotent via upsert).
        const collectionId =
          (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
            ? (crypto as any).randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

        // Resolve revenue owner — best-effort; fall back to current user offline.
        let revenueOwnerId: string = currentUserId;
        if (!result.offline) {
          try {
            const { data: ret } = await supabase
              .from('retailers')
              .select('owner_id, user_id')
              .eq('id', validRetailerId)
              .maybeSingle();
            revenueOwnerId = (ret as any)?.owner_id || (ret as any)?.user_id || currentUserId;
          } catch { /* fall back to currentUserId */ }
        }

        const collectionPayload = {
          id: collectionId,
          retailer_id: validRetailerId,
          amount: atOrderAmountPaid,
          payment_method: orderPaymentMethod,
          payment_proof_url: paymentProofUrl || null,
          collected_by_user_id: currentUserId,
          revenue_owner_id: revenueOwnerId,
        };

        if (result.offline) {
          // Offline path — queue the ledger row; FIFO allocation runs on drain
          // (server-side via apply_retailer_payment_fifo).
          try {
            await offlineStorage.addToSyncQueue('CREATE_COLLECTION', {
              collection: collectionPayload,
              apply_fifo: true,
            });
          } catch (qErr) {
            console.error('[Cart] Failed to queue offline collection:', qErr);
          }

          // Optimistic offline update: reflect the paid/pending split on the
          // cached order immediately so the retailer card shows the correct
          // status offline instead of "Pending / full". Display-only — the
          // queued CREATE_COLLECTION + server FIFO remain the source of truth,
          // and VisitCard's authoritative refetch reconciles on sync.
          try {
            const paid = atOrderAmountPaid;                 // already computed above
            const pending = Math.max(0, totalAmount - paid);
            const payStatus = pending <= 0 ? 'paid' : (paid > 0 ? 'partial' : 'pending');
            const cachedOrder: any = await offlineStorage.getById(STORES.ORDERS, result.order.id);
            if (cachedOrder) {
              await offlineStorage.save(STORES.ORDERS, {
                ...cachedOrder,
                credit_paid_amount: paid,
                credit_pending_amount: pending,
                is_credit_order: pending > 0,
                payment_status: payStatus,
              });
              // nudge the visit card to re-read local order state
              window.dispatchEvent(new CustomEvent('orderDataChanged', { detail: { orderId: result.order.id, retailerId: validRetailerId } }));
            }
          } catch (e) {
            console.warn('[Cart] optimistic offline payment split failed (non-fatal):', e);
          }
        } else {
          try {
            const { data: collection, error: collErr } = await (supabase as any)
              .from('retailer_payment_collections')
              .upsert(collectionPayload, { onConflict: 'id', ignoreDuplicates: false })
              .select('id')
              .single();
            if (collErr || !collection) throw collErr || new Error('collection insert failed');
            const { error: fifoErr } = await (supabase as any).rpc('apply_retailer_payment_fifo', {
              p_retailer_id: validRetailerId,
              p_amount: atOrderAmountPaid,
              p_collection_id: (collection as any).id,
            });
            if (fifoErr) throw fifoErr;

            // Re-fetch the order row + its FIFO allocations so the UI shows the
            // post-allocation credit_paid_amount / credit_pending_amount (server-side
            // truth), not the pre-FIFO local values that were used at insert time.
            try {
              const { data: freshOrder } = await (supabase as any)
                .from('orders')
                .select('id, total_amount, is_credit_order, credit_paid_amount, credit_pending_amount, payment_status, previous_pending_cleared')
                .eq('id', result.order.id)
                .maybeSingle();
              if (freshOrder) syncedOrderRow = freshOrder;
              const { data: allocs } = await (supabase as any)
                .from('retailer_payment_allocations')
                .select('id, order_id, amount, collection_id, created_at')
                .eq('collection_id', (collection as any).id);
              syncedOrderAllocations = allocs || [];
            } catch (refetchErr) {
              console.warn('[Cart] Post-FIFO re-fetch failed:', refetchErr);
            }
          } catch (e) {
            console.error('[Cart] At-order FIFO payment failed — queuing for retry:', e);
            try {
              await offlineStorage.addToSyncQueue('CREATE_COLLECTION', {
                collection: collectionPayload,
                apply_fifo: true,
              });
            } catch (qErr) {
              console.error('[Cart] Failed to queue collection after online error:', qErr);
            }
          }
        }
      }


      // --- Phase 2b-3a: finalize edit (replace original via RPC) ---
      if (isEditMode && editOrderId && result.order?.id && !result.offline) {
        try {
          // Compute delta vs. original paid; if positive, collect ONE new
          // collection for the delta and pass it to finalize_order_edit.
          let editNewCollectionId: string | null = null;
          try {
            const { data: origRow } = await (supabase as any)
              .from('orders')
              .select('credit_paid_amount, retailer_id')
              .eq('id', editOrderId)
              .maybeSingle();
            const origPaid = Number(origRow?.credit_paid_amount || 0);
            const delta = Number((editIntendedPaid - origPaid).toFixed(2));
            if (delta > 0 && validRetailerId) {
              const { data: ret } = await supabase
                .from('retailers')
                .select('owner_id, user_id')
                .eq('id', validRetailerId)
                .maybeSingle();
              const revenueOwnerId = (ret as any)?.owner_id || (ret as any)?.user_id || currentUserId;
              const { data: collection, error: collErr } = await (supabase as any)
                .from('retailer_payment_collections')
                .insert({
                  retailer_id: validRetailerId,
                  amount: delta,
                  payment_method: paymentMethod || 'cash',
                  payment_proof_url: editDeltaProofUrl || null,
                  collected_by_user_id: currentUserId,
                  revenue_owner_id: revenueOwnerId,
                  notes: 'Edit delta collection',
                })
                .select('id')
                .single();
              if (collErr || !collection) throw collErr || new Error('edit delta collection insert failed');
              editNewCollectionId = (collection as any).id;
            }
          } catch (collectErr) {
            console.error('[Cart][edit] delta collection failed:', collectErr);
            toast({
              title: 'Edit Failed',
              description: 'Could not record the additional payment for this edit.',
              variant: 'destructive',
            });
            try {
              await supabase.rpc('cancel_order_atomic', {
                p_order_id: result.order.id,
                p_reason: 'Edit delta collection failed - rollback',
                p_cancelled_by: currentUserId,
              } as any);
            } catch {}
            return;
          }

          const { data: reqData, error: finErr } = await supabase.rpc('request_order_edit', {
            p_original_order_id: editOrderId,
            p_replacement_order_id: result.order.id,
            p_edited_by: currentUserId,
            p_reason: (editReason?.trim() || 'Order edited'),
            p_target_paid: editIntendedPaid,
            p_new_collection_id: editNewCollectionId,
          } as any);
          if (finErr) {
            console.error('[Cart][edit] request_order_edit failed, rolling back replacement:', finErr);
            try {
              await supabase.rpc('cancel_order_atomic', {
                p_order_id: result.order.id,
                p_reason: 'Edit request failed - rollback',
                p_cancelled_by: currentUserId,
              } as any);
            } catch (rbErr) {
              console.error('[Cart][edit] rollback cancel failed:', rbErr);
            }
            toast({
              title: 'Edit Failed',
              description: (finErr?.message || 'Could not submit order edit. Your changes were not applied.'),
              variant: 'destructive',
            });
            return;
          }
          if ((reqData as any) === 'pending') {
            toast({ title: 'Edit sent to your manager for approval' });
            localStorage.removeItem(activeStorageKey);
            localStorage.removeItem(tableFormStorageKey);
            clearSchemes();
            setCartItems([]);
            navigate('/visits/retailers');
            return;
          }


          // Post-finalize: re-fetch replacement to render real server values.
          try {
            const { data: freshOrder } = await (supabase as any)
              .from('orders')
              .select('id, total_amount, is_credit_order, credit_paid_amount, credit_pending_amount, payment_status, previous_pending_cleared')
              .eq('id', result.order.id)
              .maybeSingle();
            if (freshOrder) syncedOrderRow = freshOrder;
          } catch (refetchErr) {
            console.warn('[Cart][edit] Post-finalize re-fetch failed:', refetchErr);
          }
        } catch (e: any) {
          console.error('[Cart][edit] finalize threw, rolling back:', e);
          try {
            await supabase.rpc('cancel_order_atomic', {
              p_order_id: result.order.id,
              p_reason: 'Edit finalize failed - rollback',
              p_cancelled_by: currentUserId,
            } as any);
          } catch {}
          toast({
            title: 'Edit Failed',
            description: e?.message || 'Could not finalize order edit.',
            variant: 'destructive',
          });
          return;
        }
      } else if (isEditMode && result.offline) {
        toast({
          title: 'Edit requires internet',
          description: 'You went offline before the edit could be finalized. Please retry online.',
          variant: 'destructive',
        });
        return;
      }

      if (isEditMode && !result.offline) {
        toast({ title: 'Order edited successfully', description: 'The original order has been replaced.' });
      }


      // Clear cart storage AND table form storage AND applied schemes for this visit/retailer
      localStorage.removeItem(activeStorageKey);
      localStorage.removeItem(tableFormStorageKey);
      clearSchemes(); // Clear applied schemes
      console.log('[Cart] Cleared cart, table form, and applied schemes after successful order');
      
      // COMPREHENSIVE STATE CLEARING - Reset all cart and payment states for fresh order entry
      setCartItems([]);
      setPaymentType("");
      setPaymentMethod("");
      setPartialAmount("");
      setChequePhotoUrl("");
      setUpiPhotoUrl("");
      setUpiLastFourCode("");
      setNeftPhotoUrl("");
      setIsCameraOpen(false);
      setShowInvoicePreview(false);
      setSelectedItem(null);
      setShowItemDetail(false);
      setPendingAmountFromPrevious(0);

      console.log('🧹 All cart and payment states cleared for fresh order entry');

      // Show success toast and navigate IMMEDIATELY - don't wait for SMS
      toast({
        title: "Order Placed Successfully",
        description: "Your order has been submitted.",
        duration: 3000,
      });

      // Dispatch events for UI updates - TARGETED refresh only for this retailer
      if (actualVisitId && validRetailerId && currentUserId) {
        console.log('📡 Marking retailer for targeted refresh:', validRetailerId, 'orderValue:', totalAmount);
        retailerStatusRegistry.markForRefresh(validRetailerId);
        
        // CRITICAL: Cache the productive status for immediate display
        const orderDate = getEffectiveOrderDate();
        await visitStatusCache.set(
          actualVisitId,
          validRetailerId,
          currentUserId,
          orderDate,
          'productive',
          totalAmount
        );
        console.log('💾 [Cart] Cached productive status:', { retailerId: validRetailerId, orderValue: totalAmount });
        
        // FIX: Include complete order object for immediate progress stats update
        const orderForEvent = {
          id: result.order?.id || `offline_${Date.now()}`,
          retailer_id: validRetailerId,
          user_id: currentUserId,
          total_amount: totalAmount,
          order_date: orderDate,
          status: 'confirmed',
          visit_id: actualVisitId,
          created_at: new Date().toISOString(),
          // Post-FIFO synced values (server-side truth). Fall back to local
          // pre-FIFO values only when re-fetch wasn't possible (e.g. no payment).
          is_credit_order: syncedOrderRow?.is_credit_order ?? isCreditOrder,
          credit_paid_amount: syncedOrderRow?.credit_paid_amount ?? creditPaid,
          credit_pending_amount: syncedOrderRow?.credit_pending_amount ?? creditPending,
          payment_status: syncedOrderRow?.payment_status,
          previous_pending_cleared: syncedOrderRow?.previous_pending_cleared ?? previousPendingCleared,
          retailer_payment_allocations: syncedOrderAllocations,
        };
        
        // CRITICAL FIX: Update snapshot FIRST (must complete before navigation)
        // This ensures My Visits loads the updated data immediately from snapshot
        // The await is necessary because navigation will unmount this component
        try {
          await addOrderToSnapshot(currentUserId, orderDate, orderForEvent);
          console.log('📸 [Cart] Updated snapshot with order:', orderForEvent.id);
        } catch (snapshotErr) {
          console.warn('[Cart] Could not update snapshot:', snapshotErr);
        }
        
        // Mark data changed for cross-page cache invalidation (await to ensure it's set before nav)
        await markVisitDataChanged(orderDate);
        
        // Dispatch events for any components that are still mounted
        window.dispatchEvent(new CustomEvent('visitStatusChanged', {
          detail: { 
            visitId: actualVisitId, 
            status: 'productive', 
            retailerId: validRetailerId,
            orderValue: totalAmount,
            order: orderForEvent
          }
        }));
        
        window.dispatchEvent(new CustomEvent('orderSubmitted', {
          detail: {
            retailerId: validRetailerId,
            visitId: actualVisitId,
            orderValue: totalAmount
          }
        }));
      }

      // Navigate to My Visits page - snapshot is already updated
      console.log('✅ Navigating to My Visits');
      try { sessionStorage.removeItem('backdated_order_context'); } catch {}
      clearOnBehalfContext();
      clearOutOfBeatContext();
      navigate('/visits/retailers');

      // BACKGROUND WORK - Don't block user navigation for non-critical tasks
      // Gamification, retailer sequences, and invoice DB records run in background
      (async () => {
        try {
          // Van stock sync - use isSlowConnection() to decide between online sync and local calculation
          // This properly handles slow network conditions where navigator.onLine may be true
          if (currentUserId) {
            const shouldSyncOnline = navigator.onLine && !isSlowConnection();
            
            if (shouldSyncOnline) {
              console.log('🚚 Syncing order to van stock (online)...');
              try {
                await syncOrdersToVanStock(getTodayDateString(), currentUserId);
                console.log('✅ Van stock sync completed');
              } catch (vanStockError) {
                console.error('Van stock sync failed, falling back to local calculation:', vanStockError);
                // Fallback to local calculation if online sync fails
                await calculateLocalVanStockUpdate(
                  orderItems.map(item => ({
                    product_id: item.product_id,
                    quantity: item.quantity,
                    unit: item.unit
                  })),
                  currentUserId,
                  getLocalTodayDate()
                );
              }
            } else {
              console.log('🚚 Calculating local van stock update (slow/offline)...');
              try {
                await calculateLocalVanStockUpdate(
                  orderItems.map(item => ({
                    product_id: item.product_id,
                    quantity: item.quantity,
                    unit: item.unit
                  })),
                  currentUserId,
                  getLocalTodayDate()
                );
                console.log('✅ Local van stock calculation queued');
              } catch (vanStockError) {
                console.error('Local van stock calculation failed:', vanStockError);
              }
            }
          }
          
          // Only run other background tasks if fully online (not offline queued)
          if (!result.offline && currentUserId) {
            const order = result.order;

            // Check if this is the first order
            const { count: previousOrdersCount } = await supabase
              .from('orders')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', currentUserId)
              .eq('retailer_id', validRetailerId)
              .neq('id', order.id);

            const isFirstOrder = previousOrdersCount === 0;

            // Award gamification points
            await awardPointsForOrder({
              userId: currentUserId,
              retailerId: validRetailerId,
              orderValue: totalAmount,
              orderItems: orderItems.map(item => ({
                product_id: item.product_id,
                quantity: item.quantity,
              })),
              isFirstOrder
            });

            // Update retailer sequence
            await updateRetailerSequence(currentUserId, validRetailerId);

            // Award retailer loyalty points
            await awardLoyaltyPointsForOrder({
              orderId: order.id,
              retailerId: validRetailerId,
              orderValue: totalAmount,
              orderItems: orderItems.map(item => ({
                product_id: item.product_id,
                quantity: item.quantity,
              })),
              isFirstOrder,
              fseUserId: currentUserId,
              orderDate: new Date()
            });

            // Award points for total visits threshold
            const orderDate = new Date().toISOString().split('T')[0];
            await awardPointsForTotalVisits(currentUserId, orderDate);

            // Create invoice record (for future editing/management)
            const invoiceDate = new Date().toISOString().split('T')[0];
            const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const { data: companyData } = await supabase
              .from('companies')
              .select('id')
              .limit(1)
              .maybeSingle();

            const { data: invoiceRecord, error: invoiceError } = await supabase
              .from('invoices')
              .insert([{
                company_id: companyData?.id || null,
                customer_id: validRetailerId,
                invoice_date: invoiceDate,
                due_date: dueDate,
                sub_total: subtotal,
                total_tax: cgstAmount + sgstAmount,
                total_amount: totalAmount,
                created_by: currentUserId,
                status: 'issued',
                place_of_supply: '29-Karnataka',
                order_id: order.id
              }] as any)
              .select()
              .single();

            if (!invoiceError && invoiceRecord) {
              const invoiceItems = enrichedItems.map(item => {
                const quantity = Number(item.quantity || 0);
                const rate = Number(getDisplayRate(item));
                const taxableAmount = quantity * rate;
                const gstPct = Number((item as any).gst_percentage) || 0;
                const lt = computeLineTax({ taxableAmount, gstPercentage: gstPct });
                const totalWithTax = taxableAmount + lt.cgst + lt.sgst + lt.igst + lt.cess;
                return {
                  invoice_id: invoiceRecord.id,
                  description: item.name,
                  quantity,
                  unit_price: rate,
                  taxable_amount: taxableAmount,
                  cgst_rate: gstPct / 2,
                  cgst_amount: lt.cgst,
                  sgst_rate: gstPct / 2,
                  sgst_amount: lt.sgst,
                  total_amount: totalWithTax
                };
              });

              await supabase.from('invoice_items').insert(invoiceItems);
            }

            console.log('✅ Background post-order processing completed');
          }
        } catch (error) {
          console.error('Background post-order processing failed:', error);
          // Don't fail the order - it's already saved
        }
      })();

      // Invoice SMS/WhatsApp sending has been removed entirely. Nothing related to
      // invoice SMS is generated, queued, or toasted after an order is placed.
    } catch (error: any) {
      console.error('Error submitting order:', error);
      toast({
        title: "Error Submitting Order",
        description: error.message || "Failed to submit order. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // D-1 Order Confirmation Handler - New workflow for Next Day Delivery
  // This is a SEPARATE flow from handleSubmitOrder - orders go into packing list queue
  const handleConfirmD1Order = async () => {
    // Same validation as handleSubmitOrder
    if (!canSubmitOrder()) {
      toast({
        title: "Order Scheduled",
        description: `This order will be submitted on ${new Date(visitDate!).toLocaleDateString()}. Items will remain in your cart until then.`,
        variant: "default"
      });
      return;
    }

    if (isBackdated && backdateCtx?.requireReason && !backdateReason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Please enter a reason for this backdated order.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmittingD1(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      const currentUserId = user?.id || userId;
      
      if (!currentUserId) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to submit orders",
          variant: "destructive"
        });
        return;
      }

      // Submit-time fallback: ensure every cart item has a GST rate before computing tax.
      const enrichedItems = await ensureGstPercentages(cartItems);
      if (enrichedItems !== cartItems) setCartItems(enrichedItems);
      const submissionLineTaxes = enrichedItems.map(it => computeLineTax({
        taxableAmount: computeItemTotal(it),
        gstPercentage: (it as any).gst_percentage,
      }));
      const submissionTaxTotals = sumLineTaxes(submissionLineTaxes);

      const subtotal = getSubtotal();
      const discountAmount = getDiscount();
      const cgstAmount = submissionTaxTotals.cgst;
      const sgstAmount = submissionTaxTotals.sgst;
      const totalAmount = Math.round(Math.max(0, getAmountAfterDiscount() + submissionTaxTotals.cgst + submissionTaxTotals.sgst));
      
      const validRetailerId = retailerId && /^[0-9a-fA-F-]{36}$/.test(retailerId) ? retailerId : null;
      const validVisitId = visitId && /^[0-9a-fA-F-]{36}$/.test(visitId) ? visitId : null;

      // Fetch retailer to get beat_id and territory_id
      let retailerBeatId: string | null = null;
      let retailerTerritoryId: string | null = null;
      
      if (validRetailerId && navigator.onLine) {
        const { data: retailerDetails } = await supabase
          .from('retailers')
          .select('beat_id, territory_id')
          .eq('id', validRetailerId)
          .single();
        
        if (retailerDetails) {
          retailerBeatId = retailerDetails.beat_id;
          retailerTerritoryId = retailerDetails.territory_id;
        }
      }

      // Calculate credit amounts (same logic as handleSubmitOrder)
      // D-1 DIFFERENCE: If no payment type selected, treat as "collect_on_delivery"
      const totalDue = pendingAmountFromPrevious + totalAmount;
      let newTotalPending = 0;
      let creditPending = 0;
      let creditPaid = 0;
      let previousPendingCleared = 0;
      let isCreditOrder = false;
      let orderPaymentMethod = "";
      let paymentProofUrl = "";

      if (!paymentType) {
        // D-1 SPECIFIC: No payment selected = Collect on Delivery
        isCreditOrder = true;
        newTotalPending = totalDue;
        creditPending = totalAmount;
        creditPaid = 0;
        previousPendingCleared = 0;
        orderPaymentMethod = "collect_on_delivery";
      } else if (paymentType === "credit") {
        isCreditOrder = true;
        newTotalPending = totalDue;
        creditPending = totalAmount;
        creditPaid = 0;
        previousPendingCleared = 0;
        orderPaymentMethod = "credit";
      } else if (paymentType === "full") {
        // Full payment - routed through FIFO post-insert.
        isCreditOrder = true;
        newTotalPending = Math.max(0, totalDue - totalAmount);
        previousPendingCleared = 0;
        creditPaid = 0;
        creditPending = totalAmount;
        orderPaymentMethod = paymentMethod;
        paymentProofUrl = paymentMethod === "cheque" ? chequePhotoUrl : paymentMethod === "upi" ? upiPhotoUrl : paymentMethod === "neft" ? neftPhotoUrl : "";
      } else if (paymentType === "partial") {
        // Partial payment - routed through FIFO post-insert.
        isCreditOrder = true;
        const paidAmount = parseFloat(partialAmount);
        previousPendingCleared = 0;
        creditPaid = 0;
        creditPending = totalAmount;
        newTotalPending = Math.max(0, totalDue - paidAmount);
        orderPaymentMethod = paymentMethod;
        paymentProofUrl = paymentMethod === "cheque" ? chequePhotoUrl : paymentMethod === "upi" ? upiPhotoUrl : paymentMethod === "neft" ? neftPhotoUrl : "";
      }

      // EDIT MODE (D-1): cart must NOT collect payment as part of insert;
      // finalize_order_edit reconciles to the edited payment intent below.
      const editIntendedPaidD1 = !isEditMode ? 0 :
        paymentType === 'full'    ? totalAmount :
        paymentType === 'partial' ? Math.max(0, parseFloat(partialAmount) || 0) : 0;
      const editDeltaProofUrlD1 =
        paymentMethod === 'cheque' ? chequePhotoUrl :
        paymentMethod === 'upi'    ? upiPhotoUrl :
        paymentMethod === 'neft'   ? neftPhotoUrl : "";
      if (isEditMode) {
        isCreditOrder = true;
        creditPaid = 0;
        creditPending = totalAmount;
        previousPendingCleared = 0;
        newTotalPending = totalDue;
        paymentProofUrl = "";
      }

      // Ensure visit exists (same logic as handleSubmitOrder)
      let actualVisitId = validVisitId;
      const today = getEffectiveOrderDate();
      const isOnline = connectivityStatus === 'online' && navigator.onLine;
      
      if (!actualVisitId && validRetailerId && currentUserId) {
        if (isOnline) {
          const { data: existingVisit } = await supabase
            .from('visits')
            .select('id')
            .eq('user_id', currentUserId)
            .eq('retailer_id', validRetailerId)
            .eq('planned_date', today)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (existingVisit) {
            actualVisitId = existingVisit.id;
          } else {
            const { data: newVisit } = await supabase
              .from('visits')
              .insert({
                user_id: currentUserId,
                retailer_id: validRetailerId,
                planned_date: today,
                status: 'productive',
                skip_check_in_reason: isPhoneOrder ? 'phone-order' : 'direct-order',
                skip_check_in_time: new Date().toISOString()
              })
              .select()
              .single();
            
            if (newVisit) {
              actualVisitId = newVisit.id;
            }
          }
        }
        
        if (!actualVisitId) {
          actualVisitId = crypto.randomUUID();
          const offlineVisit = {
            id: actualVisitId,
            user_id: currentUserId,
            retailer_id: validRetailerId,
            planned_date: today,
            status: 'productive',
            skip_check_in_reason: isPhoneOrder ? 'phone-order' : 'direct-order',
            skip_check_in_time: new Date().toISOString(),
            created_at: new Date().toISOString()
          };
          await offlineStorage.addToSyncQueue('CREATE_VISIT', offlineVisit);
          await offlineStorage.save(STORES.VISITS, offlineVisit);
        }
      }

      // Generate idempotency key
      const idempotencyKey = `${currentUserId}_${validRetailerId}_${getLocalTodayDate()}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      
      // Calculate delivery date as tomorrow
      const deliveryDate = format(addDays(new Date(), 1), 'yyyy-MM-dd');

      // D-1 ORDER DATA - Key differences from regular order:
      // - delivery_status: 'in_packing_list' (ready for packing list inclusion)
      // - delivery_date: tomorrow (next day delivery)
      // - packing_list_id: null (not yet assigned to a packing list)
      // Payment status is determined by: is_credit_order + payment_method
      // - Paid: is_credit_order=false, payment_method=cash/upi/cheque/neft
      // - Collect on Delivery: is_credit_order=true, payment_method='collect_on_delivery'
      const orderData = {
        user_id: isOnBehalf ? onBehalfCtx!.userId : currentUserId,
        placed_by_user_id: isOnBehalf ? currentUserId : undefined,
        visit_id: actualVisitId,
        retailer_id: validRetailerId,
        retailer_name: retailerName,
        distributor_id: distributorInfo.id || null,
        distributor_name: distributorInfo.name || null,
        order_date: getEffectiveOrderDate(),
        is_backdated: isBackdated,
        backdate_reason: isBackdated ? (backdateReason.trim() || null) : null,
        is_out_of_beat: isOutOfBeat,
        out_of_beat_reason: isOutOfBeat ? (oobCtx?.reason?.trim() || null) : null,
        is_planned_beat: !isOutOfBeat,
        oob_location: isOutOfBeat && oobCtx?.gpsLat != null
          ? { lat: oobCtx.gpsLat, lng: oobCtx.gpsLng }
          : null,
        subtotal,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        status: 'confirmed',
        is_credit_order: isCreditOrder,
        credit_pending_amount: creditPending,
        credit_paid_amount: creditPaid,
        previous_pending_cleared: previousPendingCleared,
        payment_method: orderPaymentMethod,
        payment_proof_url: paymentProofUrl || null,
        upi_last_four_code: paymentMethod === 'upi' ? upiLastFourCode : null,
        idempotency_key: idempotencyKey,
        // D-1 SPECIFIC FIELDS
        delivery_status: 'in_packing_list',
        delivery_date: deliveryDate,
        packing_list_id: null
      };

      const orderItems = enrichedItems.map((item, idx) => {
        const itemDiscount = orderCalculation.itemDiscounts[item.id] || 0;
        const currentRate = getDisplayRate(item);
        const originalRate = (item as any).original_rate || currentRate;
        const discountPerItem = item.quantity > 0 ? itemDiscount / item.quantity : 0;
        const itemTotal = computeItemTotal(item);
        const lineTax = submissionLineTaxes[idx];
        const sgstAmount = lineTax?.sgst ?? 0;
        const cgstAmount = lineTax?.cgst ?? 0;
        
        const isUUID = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
        let productId: string | null = (item as any).product_id || item.id;
        let variantId: string | null = (item as any).variant_id || null;
        if (item.id && item.id.includes('_variant_')) {
          const parts = item.id.split('_variant_');
          productId = parts[0] || productId;
          variantId = parts[1] || variantId;
        }
        if (!isUUID(productId)) productId = null;
        if (!isUUID(variantId)) variantId = null;

        return {
          id: item.id,
          product_id: productId,
          variant_id: variantId,
          // SKUs let the RPC re-resolve product_id/variant_id from a stale cache.
          sku: (item as any).sku || null,
          variant_sku: (item as any).variant_sku || null,
          product_name: item.name,
          category: item.category,
          rate: currentRate - discountPerItem,
          original_rate: originalRate,
          discount_amount: itemDiscount,
          unit: item.unit,
          uom_id: (item as any).uom_id || null,
          uom_code: (item as any).uom_code || item.unit,
          conversion_to_base: (item as any).conversion_to_base ?? null,
          quantity: item.quantity,
          total: itemTotal,
          hsn_code: (item as any).hsn_code || null,
          tax_master_id: (item as any).tax_master_id ?? null,
          tax_rate_snapshot: lineTax?.taxRate ?? 0,
          cgst_rate: (lineTax?.taxRate ?? 0) / 2,
          sgst_rate: (lineTax?.taxRate ?? 0) / 2,
          cgst_amount: cgstAmount,
          sgst_amount: sgstAmount,
          igst_rate: 0,
          igst_amount: 0,
          cess_rate: 0,
          cess_amount: lineTax?.cess ?? 0,
          is_price_edited: !!(item as any).is_price_edited,
        };
      });

      // Add free items from BOGO schemes
      const freeOrderItems = orderCalculation.appliedSchemes
        .filter(s => s.free_items && s.free_items.length > 0)
        .flatMap(s => s.free_items!.map(freeItem => ({
          product_id: (typeof freeItem.product_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(freeItem.product_id)) ? freeItem.product_id : null,
          variant_id: null,
          product_name: `${freeItem.product_name} (FREE)`,
          category: 'Free Item',
          rate: 0,
          original_rate: freeItem.original_rate || 0,
          discount_amount: 0,
          unit: freeItem.unit || 'pcs',
          quantity: freeItem.quantity,
          total: 0,
          hsn_code: null,
          sgst_amount: 0,
          cgst_amount: 0
        })));

      const allOrderItems = [...orderItems, ...freeOrderItems];

      // Submit order using offline-capable utility
      const result = await submitOrderWithOfflineSupport(orderData, allOrderItems, {
        connectivityStatus,
        onOffline: () => {
          toast({
            title: "📵 D-1 Order Saved Offline",
            description: "Order will be available for packing when you're back online.",
          });
        },
        onOnline: () => {
          toast({
            title: "✅ D-1 Order Confirmed",
            description: `Order for ${retailerName} is ready for next-day delivery packing.`,
          });
        }
      });

      // Update retailer's last_order_date only (pending_amount handled by sync_order_with_items_v2)
      if (validRetailerId && !result.offline) {
        await supabase
          .from('retailers')
          .update({ last_order_date: new Date().toISOString().split('T')[0] })
          .eq('id', validRetailerId);
      }

      // FIFO at-order payment (D-1 path): same flow as regular order.
      const atOrderAmountPaidD1 =
        paymentType === 'full' ? totalAmount :
        paymentType === 'partial' ? Math.max(0, parseFloat(partialAmount) || 0) : 0;
      let syncedOrderRowD1: any = null;
      let syncedOrderAllocationsD1: any[] = [];
      if (!isEditMode && atOrderAmountPaidD1 > 0 && validRetailerId && !result.offline && result.order?.id) {
        try {
          const { data: ret } = await supabase
            .from('retailers')
            .select('owner_id, user_id')
            .eq('id', validRetailerId)
            .maybeSingle();
          const revenueOwnerId = (ret as any)?.owner_id || (ret as any)?.user_id || currentUserId;
          const { data: collection, error: collErr } = await (supabase as any)
            .from('retailer_payment_collections')
            .insert({
              retailer_id: validRetailerId,
              amount: atOrderAmountPaidD1,
              payment_method: orderPaymentMethod,
              payment_proof_url: paymentProofUrl || null,
              collected_by_user_id: currentUserId,
              revenue_owner_id: revenueOwnerId,
            })
            .select('id')
            .single();
          if (collErr || !collection) throw collErr || new Error('collection insert failed');
          const { error: fifoErr } = await (supabase as any).rpc('apply_retailer_payment_fifo', {
            p_retailer_id: validRetailerId,
            p_amount: atOrderAmountPaidD1,
            p_collection_id: (collection as any).id,
          });
          if (fifoErr) throw fifoErr;

          // Re-fetch post-FIFO synced row + allocations.
          try {
            const { data: freshOrder } = await (supabase as any)
              .from('orders')
              .select('id, total_amount, is_credit_order, credit_paid_amount, credit_pending_amount, payment_status, previous_pending_cleared')
              .eq('id', result.order.id)
              .maybeSingle();
            if (freshOrder) syncedOrderRowD1 = freshOrder;
            const { data: allocs } = await (supabase as any)
              .from('retailer_payment_allocations')
              .select('id, order_id, amount, collection_id, created_at')
              .eq('collection_id', (collection as any).id);
            syncedOrderAllocationsD1 = allocs || [];
          } catch (refetchErr) {
            console.warn('[Cart][D-1] Post-FIFO re-fetch failed:', refetchErr);
          }
        } catch (e) {
          console.error('[Cart][D-1] At-order FIFO payment failed:', e);
        }
      }

      // --- Phase 2b-3a: finalize edit (D-1 path) ---
      if (isEditMode && editOrderId && result.order?.id && !result.offline) {
        try {
          // Compute delta vs. original paid and (if positive) collect ONCE.
          let editNewCollectionIdD1: string | null = null;
          try {
            const { data: origRow } = await (supabase as any)
              .from('orders')
              .select('credit_paid_amount, retailer_id')
              .eq('id', editOrderId)
              .maybeSingle();
            const origPaid = Number(origRow?.credit_paid_amount || 0);
            const delta = Number((editIntendedPaidD1 - origPaid).toFixed(2));
            if (delta > 0 && validRetailerId) {
              const { data: ret } = await supabase
                .from('retailers')
                .select('owner_id, user_id')
                .eq('id', validRetailerId)
                .maybeSingle();
              const revenueOwnerId = (ret as any)?.owner_id || (ret as any)?.user_id || currentUserId;
              const { data: collection, error: collErr } = await (supabase as any)
                .from('retailer_payment_collections')
                .insert({
                  retailer_id: validRetailerId,
                  amount: delta,
                  payment_method: paymentMethod || 'cash',
                  payment_proof_url: editDeltaProofUrlD1 || null,
                  collected_by_user_id: currentUserId,
                  revenue_owner_id: revenueOwnerId,
                  notes: 'Edit delta collection (D-1)',
                })
                .select('id')
                .single();
              if (collErr || !collection) throw collErr || new Error('edit delta collection insert failed');
              editNewCollectionIdD1 = (collection as any).id;
            }
          } catch (collectErr) {
            console.error('[Cart][edit][D-1] delta collection failed:', collectErr);
            try {
              await supabase.rpc('cancel_order_atomic', {
                p_order_id: result.order.id,
                p_reason: 'Edit delta collection failed - rollback',
                p_cancelled_by: currentUserId,
              } as any);
            } catch {}
            toast({
              title: 'Edit Failed',
              description: 'Could not record the additional payment for this edit.',
              variant: 'destructive',
            });
            return;
          }

          const { data: reqData, error: finErr } = await supabase.rpc('request_order_edit', {
            p_original_order_id: editOrderId,
            p_replacement_order_id: result.order.id,
            p_edited_by: currentUserId,
            p_reason: (editReason?.trim() || 'Order edited'),
            p_target_paid: editIntendedPaidD1,
            p_new_collection_id: editNewCollectionIdD1,
          } as any);
          if (finErr) {
            try {
              await supabase.rpc('cancel_order_atomic', {
                p_order_id: result.order.id,
                p_reason: 'Edit request failed - rollback',
                p_cancelled_by: currentUserId,
              } as any);
            } catch {}
            toast({
              title: 'Edit Failed',
              description: (finErr?.message || 'Could not submit order edit.'),
              variant: 'destructive',
            });
            return;
          }
          if ((reqData as any) === 'pending') {
            toast({ title: 'Edit sent to your manager for approval' });
            localStorage.removeItem(activeStorageKey);
            localStorage.removeItem(tableFormStorageKey);
            clearSchemes();
            setCartItems([]);
            navigate('/visits/retailers');
            return;
          }


          // Post-finalize re-fetch for accurate Today's Order summary.
          try {
            const { data: freshOrder } = await (supabase as any)
              .from('orders')
              .select('id, total_amount, is_credit_order, credit_paid_amount, credit_pending_amount, payment_status, previous_pending_cleared')
              .eq('id', result.order.id)
              .maybeSingle();
            if (freshOrder) syncedOrderRowD1 = freshOrder;
          } catch (refetchErr) {
            console.warn('[Cart][edit][D-1] Post-finalize re-fetch failed:', refetchErr);
          }
        } catch (e: any) {
          try {
            await supabase.rpc('cancel_order_atomic', {
              p_order_id: result.order.id,
              p_reason: 'Edit finalize failed - rollback',
              p_cancelled_by: currentUserId,
            } as any);
          } catch {}
          toast({ title: 'Edit Failed', description: e?.message || 'Could not finalize order edit.', variant: 'destructive' });
          return;
        }
      } else if (isEditMode && result.offline) {
        toast({ title: 'Edit requires internet', description: 'Editing requires an internet connection.', variant: 'destructive' });
        return;
      }

      // Clear cart storage
      localStorage.removeItem(activeStorageKey);
      localStorage.removeItem(tableFormStorageKey);
      clearSchemes();
      
      // Reset all states
      setCartItems([]);
      setPaymentType("");
      setPaymentMethod("");
      setPartialAmount("");
      setChequePhotoUrl("");
      setUpiPhotoUrl("");
      setUpiLastFourCode("");
      setNeftPhotoUrl("");
      setIsCameraOpen(false);
      setShowInvoicePreview(false);
      setSelectedItem(null);
      setShowItemDetail(false);
      setPendingAmountFromPrevious(0);

      // Update visit status cache
      if (actualVisitId && validRetailerId && currentUserId) {
        retailerStatusRegistry.markForRefresh(validRetailerId);
        const orderDate = getEffectiveOrderDate();
        await visitStatusCache.set(
          actualVisitId,
          validRetailerId,
          currentUserId,
          orderDate,
          'productive',
          totalAmount
        );
        
        const orderForEvent = {
          id: result.order?.id || `offline_${Date.now()}`,
          retailer_id: validRetailerId,
          user_id: currentUserId,
          total_amount: totalAmount,
          order_date: orderDate,
          status: 'confirmed',
          delivery_status: 'in_packing_list',
          delivery_date: deliveryDate,
          visit_id: actualVisitId,
          created_at: new Date().toISOString(),
          // Post-FIFO synced values (server-side truth).
          is_credit_order: syncedOrderRowD1?.is_credit_order ?? isCreditOrder,
          credit_paid_amount: syncedOrderRowD1?.credit_paid_amount ?? creditPaid,
          credit_pending_amount: syncedOrderRowD1?.credit_pending_amount ?? creditPending,
          payment_status: syncedOrderRowD1?.payment_status,
          previous_pending_cleared: syncedOrderRowD1?.previous_pending_cleared ?? previousPendingCleared,
          retailer_payment_allocations: syncedOrderAllocationsD1,
        };
        
        try {
          await addOrderToSnapshot(currentUserId, orderDate, orderForEvent);
        } catch (snapshotErr) {
          console.warn('[Cart] Could not update snapshot:', snapshotErr);
        }
        
        window.dispatchEvent(new CustomEvent('visitStatusChanged', {
          detail: { 
            visitId: actualVisitId, 
            status: 'productive', 
            retailerId: validRetailerId,
            orderValue: totalAmount,
            order: orderForEvent
          }
        }));
        
        window.dispatchEvent(new CustomEvent('orderSubmitted', {
          detail: {
            retailerId: validRetailerId,
            visitId: actualVisitId,
            orderValue: totalAmount
          }
        }));
        
        window.dispatchEvent(new CustomEvent('visitDataChanged', { detail: { date: orderDate } }));
        markVisitDataChanged(orderDate);
      }

      // Navigate back to My Visits
      try { sessionStorage.removeItem('backdated_order_context'); } catch {}
      clearOnBehalfContext();
      clearOutOfBeatContext();
      navigate('/visits/retailers');

    } catch (error: any) {
      console.error('Error submitting D-1 order:', error);
      toast({
        title: "Error Submitting Order",
        description: error.message || "Failed to submit D-1 order. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmittingD1(false);
    }
  };

  if (isEditMode && (editLoading || editBlockedReason)) {
    return (
      <Layout>
        <div className="min-h-screen bg-background p-4">
          <Card className="max-w-xl mx-auto mt-8">
            <CardHeader>
              <CardTitle>{editLoading ? 'Loading order…' : 'Edit not available'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {editLoading ? (
                <p className="text-muted-foreground text-sm">Checking edit permissions…</p>
              ) : (
                <>
                  <p className="text-sm">{editBlockedReason}</p>
                  <Button variant="outline" onClick={() => navigate(-1)}>Go back</Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-background pb-20">
        {/* Page Header */}
        <div className="w-full px-2 sm:px-4 py-2 sm:py-3">
          <Card className="shadow-card bg-gradient-primary text-primary-foreground">
            <CardHeader className="flex flex-row items-center justify-between pb-2 px-2 sm:px-3 py-2 sm:py-3 gap-2">
              {/* Left side - Title */}
              <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0 overflow-hidden">
                <div className="min-w-0 flex-1 overflow-hidden">
                  <CardTitle className="text-base sm:text-lg font-semibold leading-tight truncate">
                    {isAdminEdit
                      ? `Edit Order${editInvoiceNumber ? ` #${editInvoiceNumber}` : ''}`
                      : 'Cart'}
                  </CardTitle>
                  <p className="text-[10px] sm:text-xs text-primary-foreground/80 leading-tight truncate">{retailerName}</p>
                </div>
              </div>
              
              {/* Right side - Preview and Cart info */}
              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowInvoicePreview(true)}
                  className="text-primary-foreground hover:bg-primary-foreground/20 p-1.5 sm:p-2 text-[10px] sm:text-xs h-auto"
                >
                  <Eye size={14} className="sm:w-4 sm:h-4 mr-1" />
                  Preview
                </Button>
                <div className="flex items-center gap-1.5">
                  <ShoppingCart size={14} className="sm:w-4 sm:h-4" />
                  <Badge variant="secondary" className="text-[9px] sm:text-[10px] h-4 sm:h-5 px-1.5">{cartItems.length} items</Badge>
                </div>
              </div>
            </CardHeader>
          </Card>
        </div>

        {isEditMode && (
          <div className="w-full px-2 sm:px-4 pb-2 space-y-2">
            <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-xs sm:text-sm">
              <strong>Editing order</strong> — submitting will create a new order that replaces the original.
            </div>
            <div className="rounded-md border bg-card px-3 py-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Reason for edit {editReasonRequired ? <span className="text-destructive">*</span> : <span className="text-muted-foreground/70">(optional)</span>}
              </label>
              <input
                type="text"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="e.g. Customer changed quantity"
                className="w-full text-sm rounded-md border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
                maxLength={200}
              />
            </div>
          </div>
        )}

        {isOnBehalf && onBehalfCtx && (
          <div className="w-full px-2 sm:px-4 pb-2">
            <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-xs sm:text-sm flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="bg-amber-200 text-amber-900 border-amber-300">On behalf</Badge>
              <span>
                Placing this order for <strong>{onBehalfCtx.name}</strong>. They will be credited as the owner.
              </span>
            </div>
          </div>
        )}

        {isOutOfBeat && oobCtx && (
          <div className="w-full px-2 sm:px-4 pb-2">
            <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-xs sm:text-sm flex items-start gap-2 flex-wrap">
              <Badge variant="secondary" className="bg-amber-200 text-amber-900 border-amber-300">Out of beat</Badge>
              <div className="flex-1 min-w-0">
                <div>This retailer is outside today's planned beat. Credit will follow your out-of-beat policy.</div>
                {oobCtx.reason && (
                  <div className="mt-0.5 text-amber-800/90"><span className="font-medium">Reason:</span> {oobCtx.reason}</div>
                )}
              </div>
            </div>
          </div>
        )}


        {isBackdated && backdateCtx && (
          <div className="w-full px-2 sm:px-4 pb-2 space-y-2">
            <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-xs sm:text-sm flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="bg-amber-200 text-amber-900 border-amber-300">Backdated</Badge>
              <span>
                Order date: <strong>{backdateCtx.date}</strong>. GPS check-in is skipped for this order.
              </span>
            </div>
            <div className="rounded-md border bg-card px-3 py-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Reason for backdating{' '}
                {backdateCtx.requireReason
                  ? <span className="text-destructive">*</span>
                  : <span className="text-muted-foreground/70">(optional)</span>}
              </label>
              <input
                type="text"
                value={backdateReason}
                onChange={(e) => setBackdateReason(e.target.value)}
                placeholder="e.g. Order taken yesterday, syncing now"
                className="w-full text-sm rounded-md border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
                maxLength={200}
              />
            </div>
          </div>
        )}




        {/* Scrollable Content */}
        <div className="w-full px-2 sm:px-4 space-y-3">
        {/* Cart Items */}
        {cartItems.length === 0 ? <Card>
            <CardContent className="p-8 text-center">
              <ShoppingCart size={48} className="mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Your cart is empty</p>
              <Button onClick={() => navigate(`/order-entry?visitId=${visitId}&retailer=${retailerName}&retailerId=${retailerId}`)} className="mt-4">
                Continue Shopping
              </Button>
            </CardContent>
          </Card> : <>
            <div className="space-y-2">
          {cartItems.map((item, itemIdx) => {
            const lineTax = lineTaxes[itemIdx];
            const discount = computeItemDiscount(item);
            const finalPrice = computeItemTotal(item);
            const hasDiscount = discount > 0;
            const { qty: displayQty, unit: displayUnit } = getDisplayQuantityAndUnit(item);

            // Extract just the variant name if it contains a dash
            const displayName = item.name.includes(' - ') ? item.name.split(' - ')[1] || item.name : item.name;
            
            // Calculate rate per display unit (if stored in grams but displaying KG)
            const ratePerDisplayUnit = displayUnit?.toLowerCase() === 'kg' && item.unit?.toLowerCase() === 'grams'
              ? getDisplayRate(item) * 1000
              : getDisplayRate(item);

            // Effective per-unit rate after scheme discount (mirrors Order Entry)
            const perUnitDiscount = item.quantity > 0 ? discount / item.quantity : 0;
            const ratePerDisplayUnitAfterDiscount = displayUnit?.toLowerCase() === 'kg' && item.unit?.toLowerCase() === 'grams'
              ? Math.max(0, ratePerDisplayUnit - perUnitDiscount * 1000)
              : Math.max(0, ratePerDisplayUnit - perUnitDiscount);

            // Get scheme details for this item
            const itemSchemes = orderCalculation.itemSchemeDetails?.[item.id] || [];
            
            return <Card key={item.id} className="border-border/50">
                    <CardContent className="p-2.5">
                      <div className="flex items-center gap-1.5">
                        {/* Product Info - Compact */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm truncate leading-tight">{displayName}</h3>
                          {(() => {
                            const isPriceEdited = !!(item as any).is_price_edited;
                            const originalRateRaw = Number((item as any).original_rate) || 0;
                            const originalPerDisplayUnit = displayUnit?.toLowerCase() === 'kg' && item.unit?.toLowerCase() === 'grams'
                              ? originalRateRaw * 1000
                              : originalRateRaw;
                            if (isAdminEdit && isPriceEdited && originalPerDisplayUnit > 0
                                && Math.abs(originalPerDisplayUnit - ratePerDisplayUnit) > 0.005) {
                              return (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                                  <span className="line-through mr-1">₹{originalPerDisplayUnit.toFixed(2)}</span>
                                  <span className="text-primary font-medium">₹{ratePerDisplayUnit.toFixed(2)}</span>
                                  /{displayUnit}
                                  <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-amber-500/15 text-amber-700 border-amber-500/30">
                                    price edited
                                  </Badge>
                                </p>
                              );
                            }
                            return hasDiscount ? (
                              <p className="text-xs text-muted-foreground">
                                <span className="line-through mr-1">₹{ratePerDisplayUnit.toFixed(2)}</span>
                                <span className="text-success font-medium">₹{ratePerDisplayUnitAfterDiscount.toFixed(2)}</span>
                                /{displayUnit}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">₹{ratePerDisplayUnit.toFixed(2)}/{displayUnit}</p>
                            );
                          })()}
                          
                          {/* GST per line — show rate next to each component */}
                          {lineTax && lineTax.taxRate > 0 && (() => {
                            const half = +(lineTax.taxRate / 2).toFixed(2);
                            return (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {lineTax.igst > 0 ? (
                                  <>IGST {lineTax.taxRate}% ₹{lineTax.igst.toFixed(2)}</>
                                ) : (
                                  <>CGST {half}% ₹{lineTax.cgst.toFixed(2)} • SGST {half}% ₹{lineTax.sgst.toFixed(2)}</>
                                )}
                              </p>
                            );
                          })()}

                          {/* Show applied scheme details */}
                          {itemSchemes.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {itemSchemes.map((scheme, idx) => (
                                <div key={idx} className="flex items-center gap-1 text-[10px] text-green-600">
                                  <Gift size={10} className="flex-shrink-0" />
                                  <span className="truncate">
                                    {scheme.schemeType === 'buy_x_get_y_free' || scheme.schemeType === 'buy_get_free' ? (
                                      <>🎁 {scheme.schemeName}: Get {scheme.freeItemQty} {scheme.freeItemName} FREE</>
                                    ) : (
                                      <>
                                        {scheme.schemeName}
                                        {scheme.discountPercentage && ` (${scheme.discountPercentage}% off)`}
                                        {scheme.discountAmount > 0 && ` - ₹${scheme.discountAmount.toFixed(2)} saved`}
                                      </>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        {/* Quantity Controls - Compact */}
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="outline" size="icon" className="h-6 w-6 text-xs" onClick={() => updateQuantity(item.id, item.quantity - getQuantityIncrement(item))}>
                            -
                          </Button>
                          <div className="min-w-[40px] text-center">
                            <div className="text-xs font-medium leading-tight">{formatDisplayQuantity(displayQty)}</div>
                            <div className="text-[10px] text-muted-foreground leading-tight">{displayUnit}</div>
                          </div>
                          <Button variant="outline" size="icon" className="h-6 w-6 text-xs" onClick={() => updateQuantity(item.id, item.quantity + getQuantityIncrement(item))}>
                            +
                          </Button>
                        </div>
                        
                        {/* Price - Compact */}
                        <div className="text-right min-w-[60px] shrink-0">
                          <div className="font-bold text-xs">₹{formatExact(finalPrice)}</div>
                          {hasDiscount && <div className="text-[10px] text-green-600 font-medium">-₹{formatExact(discount)}</div>}
                        </div>
                        
                        {/* Action Buttons - Compact */}
                        <div className="flex gap-0.5 shrink-0">
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={() => {
                      setSelectedItem(item);
                      setShowItemDetail(true);
                    }}>
                            <Eye size={12} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive/80" onClick={() => removeFromCart(item.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>;
          })}
            </div>

            {/* Free Items from BOGO Schemes - Display as product cards */}
            {orderCalculation.appliedSchemes
              .filter(s => s.free_items && s.free_items.length > 0)
              .flatMap(s => s.free_items!)
              .map((freeItem, idx) => (
                <Card key={`free-${idx}`} className="border-green-200 bg-green-50/50">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                        <Gift size={20} className="text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm truncate">{freeItem.product_name}</span>
                          <Badge className="bg-green-500 text-white text-xs shrink-0">FREE</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">Qty: {freeItem.quantity} {freeItem.unit || 'pcs'}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-lg font-bold text-green-600">₹0</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            }

            {/* Order Summary */}
            <Card>
              <CardContent className="p-3 space-y-2">
                {validRetailerId && (
                  <div className="pb-2 border-b">
                    <CreditScoreDisplay retailerId={validRetailerId} variant="compact" showCreditLimit={true} />
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-semibold">₹{formatExact(getSubtotal())}</span>
                </div>

                {getDiscount() > 0 && <div className="p-2 bg-success/10 rounded-lg border border-success/20">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Gift size={12} className="text-success" />
                      <p className="text-xs font-medium text-success">Schemes Applied</p>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Discount:</span>
                      <span className="text-success font-medium">-₹{formatExact(getDiscount())}</span>
                    </div>
                  </div>}

                <div className="border-t pt-2 space-y-1">
                  {(() => {
                    const rates = Array.from(new Set(
                      lineTaxes.filter(l => l && l.taxRate > 0).map(l => l.taxRate)
                    ));
                    const uniform = rates.length === 1 ? rates[0] : null;
                    const half = uniform != null ? +(uniform / 2).toFixed(2) : null;
                    return (
                      <>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>CGST{half != null ? ` @ ${half}%` : ''}:</span>
                          <span>₹{formatExact(getCGST())}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>SGST{half != null ? ` @ ${half}%` : ''}:</span>
                          <span>₹{formatExact(getSGST())}</span>
                        </div>
                        {rates.length > 1 && (
                          <div className="text-[10px] text-muted-foreground italic">
                            Mixed GST rates: {rates.sort((a,b)=>a-b).map(r => `${r}%`).join(', ')}
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <div className="flex justify-between text-xs font-medium border-t border-dashed mt-1 pt-1">
                    <span>Total Tax:</span>
                    <span>₹{formatExact(taxTotals.cgst + taxTotals.sgst + taxTotals.igst + taxTotals.cess)}</span>
                  </div>
                </div>

                <div className="flex justify-between text-base font-bold border-t pt-2">
                  <span>Total:</span>
                  <span>₹{formatExact(getFinalTotal())}</span>
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground -mt-1">
                  <span>(excl. GST)</span>
                  <span>₹{formatExact(getAmountAfterDiscount())}</span>
                </div>

                {pendingAmountFromPrevious > 0 && <div className="space-y-1.5 p-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Previous Pending:</span>
                      <span className="font-semibold text-warning">₹{formatRounded(pendingAmountFromPrevious)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Current Order:</span>
                      <span className="font-semibold">₹{formatRounded(getFinalTotal())}</span>
                    </div>
                    <div className="flex justify-between text-xs pt-1.5 border-t border-amber-200 dark:border-amber-800">
                      <span className="font-medium">Total Due:</span>
                      <span className="font-bold">₹{formatRounded(pendingAmountFromPrevious + getFinalTotal())}</span>
                    </div>
                  </div>}

                {/* Payment Type Selection - Conditional based on Order-Based Delivery */}
                {isOrderBasedDeliveryEnabled && !isVanSalesEnabled ? (
                  /* Order-Based Delivery: Simplified COD/Pay Now options */
                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-medium">Payment Option:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button 
                        onClick={() => {
                          setDeliveryPaymentType("cod");
                          setPaymentType("");
                          setPaymentMethod("");
                        }} 
                        variant={deliveryPaymentType === "cod" ? "default" : "outline"} 
                        className="h-10 text-xs px-2 whitespace-normal leading-tight flex flex-col items-center justify-center"
                      >
                        <Truck className="h-4 w-4 mb-1" />
                        Cash on Delivery
                      </Button>
                      <Button 
                        onClick={() => {
                          setDeliveryPaymentType("pay_now");
                          setPaymentType("full");
                          setPaymentMethod("");
                        }} 
                        variant={deliveryPaymentType === "pay_now" ? "default" : "outline"} 
                        className="h-10 text-xs px-2 whitespace-normal leading-tight flex flex-col items-center justify-center"
                      >
                        <Check className="h-4 w-4 mb-1" />
                        Pay Now
                      </Button>
                    </div>
                    {deliveryPaymentType === "cod" && (
                      <div className="p-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                        <p className="text-xs text-muted-foreground">
                          Payment will be collected at the time of delivery
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Legacy Van Sales / Standard Flow: fulfillment choice + Full/Partial/Credit */
                  <div className="space-y-3 pt-1">
                    {/* Fulfillment choice — only when D-1 is available */}
                    {isD1DeliveryEnabled && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium">Fulfillment</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setFulfillmentChoice('deliver_now')}
                            className={`rounded-[12px] p-3 text-left transition-colors ${
                              fulfillmentChoice === 'deliver_now'
                                ? 'border-2 border-primary bg-primary/5 text-primary'
                                : 'border border-border bg-background text-foreground'
                            }`}
                          >
                            <Truck className="h-4 w-4 mb-1.5" />
                            <p className="text-xs font-semibold leading-tight">Deliver now</p>
                            <p className="text-[10px] opacity-70 mt-0.5">From van stock</p>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFulfillmentChoice('next_day');
                              setPaymentType("");
                              setPaymentMethod("");
                            }}
                            className={`rounded-[12px] p-3 text-left transition-colors ${
                              fulfillmentChoice === 'next_day'
                                ? 'border-2 border-primary bg-primary/5 text-primary'
                                : 'border border-border bg-background text-foreground'
                            }`}
                          >
                            <Calendar className="h-4 w-4 mb-1.5" />
                            <p className="text-xs font-semibold leading-tight">Next-day delivery</p>
                            <p className="text-[10px] opacity-70 mt-0.5">Packed at distributor</p>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Payment section — only when Deliver now (or D-1 disabled, i.e. legacy behaviour) */}
                    {(!isD1DeliveryEnabled || fulfillmentChoice === 'deliver_now') ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium">Select Payment Type:</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          <Button onClick={() => {
                            setPaymentType("full");
                            setPaymentMethod("");
                            setDeliveryPaymentType("");
                          }} variant={paymentType === "full" ? "default" : "outline"} className="h-9 text-xs px-1.5 whitespace-normal leading-tight">
                            Full Payment
                          </Button>
                          <Button onClick={() => {
                            setPaymentType("partial");
                            setPaymentMethod("");
                            setDeliveryPaymentType("");
                          }} variant={paymentType === "partial" ? "default" : "outline"} className="h-9 text-xs px-1.5 whitespace-normal leading-tight">
                            Partial Payment
                          </Button>
                          <Button onClick={() => {
                            setPaymentType("credit");
                            setPaymentMethod("");
                            setDeliveryPaymentType("");
                          }} variant={paymentType === "credit" ? "default" : "outline"} className="h-9 text-xs px-1.5 whitespace-normal leading-tight">
                            Full Credit
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-2.5 rounded-[12px] border border-border bg-muted/40">
                        <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <p className="text-[11px] text-muted-foreground">Payment collected at delivery</p>
                      </div>
                    )}
                  </div>
                )}


                {/* Partial Payment Amount Input */}
                {paymentType === "partial" && <div className="space-y-1.5">
                    <Label htmlFor="partial-amount" className="text-xs">Partial Payment Amount</Label>
                    <Input id="partial-amount" type="number" placeholder="Enter amount" value={partialAmount} onChange={e => setPartialAmount(e.target.value)} max={getFinalTotal() + pendingAmountFromPrevious} className="h-8 text-sm border-primary ring-2 ring-primary/20 focus:ring-primary/40" />
                    {partialAmount && parseFloat(partialAmount) > 0 && <div className="p-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-success">Paying Now:</span>
                          <span className="font-semibold text-success">₹{formatRounded(parseFloat(partialAmount))}</span>
                        </div>
                        <div className="flex justify-between text-xs pt-1 border-t border-amber-200 dark:border-amber-800">
                          <span className="font-medium text-warning">Remaining:</span>
                          <span className="font-bold text-warning">₹{formatRounded(Math.max(0, getFinalTotal() + pendingAmountFromPrevious - parseFloat(partialAmount)))}</span>
                        </div>
                      </div>}
                  </div>}

                {/* Payment Method Selection - Only for legacy flow when full or partial payment selected */}
                {(paymentType === "full" || paymentType === "partial") && (deliveryPaymentType === "pay_now" || !isOrderBasedDeliveryEnabled || isVanSalesEnabled) && <div className="space-y-2 p-2.5 border rounded-lg bg-muted/50">
                    <p className="text-xs font-medium">Payment Method:</p>
                    <RadioGroup value={paymentMethod} onValueChange={(value: any) => setPaymentMethod(value)} className="flex items-center gap-6">
                      <div className="flex items-center space-x-1.5">
                        <RadioGroupItem value="cash" id="cash" className="h-3.5 w-3.5" />
                        <Label htmlFor="cash" className="text-xs">Cash</Label>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <RadioGroupItem value="cheque" id="cheque" className="h-3.5 w-3.5" />
                        <Label htmlFor="cheque" className="text-xs">Cheque</Label>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <RadioGroupItem value="upi" id="upi" className="h-3.5 w-3.5" />
                        <Label htmlFor="upi" className="text-xs">UPI</Label>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <RadioGroupItem value="neft" id="neft" className="h-3.5 w-3.5" />
                        <Label htmlFor="neft" className="text-xs">NEFT</Label>
                      </div>
                    </RadioGroup>

                    {/* Cheque Bank Details and Photo Capture */}
                    {paymentMethod === "cheque" && <div className="space-y-1.5">
                        <div className="p-2 bg-background rounded-md border">
                          <p className="text-xs font-medium mb-1.5">Bank Details for Cheque</p>
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            <p><span className="font-medium">Bank Name:</span> HDFC Bank</p>
                            <p><span className="font-medium">Account Name:</span> Bharath Beverages Pvt Ltd</p>
                            <p><span className="font-medium">Account Number:</span> 1234567890</p>
                            <p><span className="font-medium">IFSC Code:</span> HDFC0001234</p>
                          </div>
                        </div>
                        <Button onClick={() => {
                  setCameraMode("cheque");
                  setIsCameraOpen(true);
                }} variant="outline" className="w-full h-8 text-xs">
                          <Camera className="mr-1.5" size={12} />
                          {chequePhotoUrl ? "Retake Cheque" : "Capture Cheque"}
                        </Button>
                        {chequePhotoUrl && <p className="text-[10px] text-success">✓ Cheque photo captured</p>}
                      </div>}

                    {/* UPI Payment Confirmation */}
                    {paymentMethod === "upi" && <div className="space-y-1.5">
                        <div className="p-2 bg-background rounded-md border">
                          <p className="text-xs font-medium mb-1.5 text-center">Scan QR for Payment</p>
                          <div className="flex items-center justify-center bg-white p-2 rounded">
                            {companyQrCode ? (
                              <img 
                                src={companyQrCode} 
                                alt="UPI QR Code" 
                                className="w-32 h-32 object-contain"
                              />
                            ) : (
                              <div className="w-32 h-32 flex items-center justify-center bg-muted rounded">
                                <p className="text-xs text-muted-foreground">No QR Code</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="upiLastFour" className="text-xs">UPI Last-4 Code</Label>
                          <Input
                            id="upiLastFour"
                            type="text"
                            maxLength={4}
                            value={upiLastFourCode}
                            onChange={(e) => setUpiLastFourCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="Enter last 4 digits"
                            className="h-8 text-xs"
                          />
                        </div>
                        <Button onClick={() => {
                  setCameraMode("upi");
                  setIsCameraOpen(true);
                }} variant="outline" className="w-full h-8 text-xs">
                          <Camera className="mr-1.5" size={12} />
                          {upiPhotoUrl ? "Retake Proof" : "Capture Proof"}
                        </Button>
                        {upiPhotoUrl && <p className="text-[10px] text-success">✓ Payment proof captured</p>}
                      </div>}

                    {/* NEFT Bank Details and Photo Capture */}
                    {paymentMethod === "neft" && <div className="space-y-1.5">
                        <div className="p-2 bg-background rounded-md border">
                          <p className="text-xs font-medium mb-1.5">Bank Details for NEFT</p>
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            <p><span className="font-medium">Bank Name:</span> HDFC Bank</p>
                            <p><span className="font-medium">Account Name:</span> Bharath Beverages Pvt Ltd</p>
                            <p><span className="font-medium">Account Number:</span> 1234567890</p>
                            <p><span className="font-medium">IFSC Code:</span> HDFC0001234</p>
                          </div>
                        </div>
                        <Button onClick={() => {
                  setCameraMode("neft");
                  setIsCameraOpen(true);
                }} variant="outline" className="w-full h-8 text-xs">
                          <Camera className="mr-1.5" size={12} />
                          {neftPhotoUrl ? "Retake NEFT Proof" : "Capture NEFT Proof"}
                        </Button>
                        {neftPhotoUrl && <p className="text-[10px] text-success">✓ NEFT confirmation captured</p>}
                      </div>}
                  </div>}

                {/* Submit Order Button - Conditional based on flow */}
                {isOrderBasedDeliveryEnabled && !isVanSalesEnabled ? (
                  /* Order-Based Delivery: Single submit button for next day delivery */
                  <Button 
                    onClick={handleConfirmD1Order} 
                    className="w-full h-10 text-sm" 
                    variant="default" 
                    disabled={!canSubmitOrder() || !deliveryPaymentType || isSubmittingD1}
                  >
                    {isSubmittingD1 ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Placing Order...
                      </>
                    ) : (
                      <>
                        <Truck className="mr-2 h-4 w-4" />
                        {deliveryPaymentType === 'cod' ? 'Place Order (Next Day Delivery)' : 'Pay & Place Order'}
                      </>
                    )}
                  </Button>
                ) : isD1DeliveryEnabled ? (
                  /* Legacy Flow with D-1: single contextual button driven by fulfillment choice */
                  fulfillmentChoice === 'deliver_now' ? (
                    <Button
                      onClick={handleSubmitOrder}
                      className="w-full h-10 text-sm"
                      variant="default"
                      disabled={!canSubmitOrder() || !paymentType || isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Submitting...
                        </>
                      ) : (
                        <>Complete sale · collect ₹{formatRounded(getFinalTotal())}</>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleConfirmD1Order}
                      className="w-full h-10 text-sm"
                      variant="default"
                      disabled={!canSubmitOrder() || isSubmittingD1}
                    >
                      {isSubmittingD1 ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Confirming...
                        </>
                      ) : (
                        <>Confirm order · next-day delivery</>
                      )}
                    </Button>
                  )
                ) : (
                  /* Legacy Flow without D-1: keep original single submit button */
                  <Button
                    onClick={handleSubmitOrder}
                    className="w-full h-9 text-sm"
                    variant="default"
                    disabled={!canSubmitOrder() || !paymentType || isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Submitting...
                      </>
                    ) : (
                      getSubmitButtonText()
                    )}
                  </Button>
                )}

              </CardContent>
            </Card>
          </>}
        
        {/* Cart Item Detail Modal */}
        <CartItemDetail isOpen={showItemDetail} onClose={() => setShowItemDetail(false)} item={selectedItem} />

        <CameraCapture isOpen={isCameraOpen} onClose={() => setIsCameraOpen(false)} onCapture={handleCameraCapture} title={cameraMode === "cheque" ? "Capture Cheque Photo" : cameraMode === "upi" ? "Capture Payment Confirmation" : "Capture NEFT Confirmation"} />
        
        {/* Invoice Preview Dialog */}
        <Dialog open={showInvoicePreview} onOpenChange={setShowInvoicePreview}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Invoice Preview
              </DialogTitle>
            </DialogHeader>
            
            {validRetailerId && cartItems.length > 0 && (
              <InvoiceTemplateRenderer
                orderId={validVisitId || "DRAFT"}
                retailerId={validRetailerId}
                cartItems={cartItems}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
    </Layout>
  );
};

export default Cart;