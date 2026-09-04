import React, { useMemo, useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Gift, Package, Search, Check, ChevronsUpDown, Star, Sparkles, Tag, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { isFocusedProductActive } from "@/utils/focusedProductChecker";
import { ApplyOfferSection } from "@/components/ApplyOfferSection";
import { OrderEntrySchemesModal } from "@/components/OrderEntrySchemesModal";
import { SchemeConflictChoiceDialog } from "@/components/SchemeConflictChoiceDialog";
import { useOfflineSchemes, ProductScheme } from "@/hooks/useOfflineSchemes";
import { useAppliedSchemes } from "@/hooks/useAppliedSchemes";
import { useSchemePolicies } from "@/hooks/useSchemePolicies";
import { calculateOrderWithSchemes, calculateSchemeDiscountForComparison, SchemeItem, isSchemeActive, isSchemeConditionMet, schemeHasConditions } from "@/utils/schemeEngine";
import LineItemUomSelect, { type LineItemUomSelection } from "@/components/uom/LineItemUomSelect";
import { resolveProduct, type ResolvedProduct } from "@/utils/resolveProduct";
import { useOrderEditPolicy } from "@/hooks/useOrderEditPolicy";
import { useOrderCurrency } from "@/hooks/useOrderCurrency";
import { computeLineTax } from "@/utils/taxCalc";
import { usePriceBookPrices } from "@/hooks/usePriceBookPrices";
import { OrderScribeCard } from "@/components/OrderScribeCard";
interface Product {
  id: string;
  sku: string;
  name: string;
  category_id?: string | null;
  category: { name: string } | null;
  rate: number;
  unit: string;
  base_unit?: string;
  conversion_factor?: number;
  closing_stock: number;
  is_active?: boolean;
  is_focused_product?: boolean;
  focused_type?: string | null;
  focused_due_date?: string | null;
  focused_recurring_config?: any;
  focused_territories?: string[] | null;
  schemes?: { 
    name: string; 
    description: string; 
    is_active: boolean;
    scheme_type: string;
    condition_quantity: number;
    discount_percentage: number;
  }[];
  variants?: {
    id: string;
    variant_name: string;
    sku: string;
    price: number;
    stock_quantity: number;
    discount_amount: number;
    discount_percentage: number;
    is_active: boolean;
    is_focused_product?: boolean;
    focused_type?: string | null;
    focused_due_date?: string | null;
    focused_recurring_config?: any;
    focused_territories?: string[] | null;
  }[];
}

interface OrderRow {
  id: string;
  productCode: string;
  product?: Product;
  variant?: any;
  quantity: number;
  closingStock: number;
  unit: string;
  uomId?: string | null;
  uomCode?: string | null;
  conversionToBase?: number | null;
  priceBasisUomId?: string | null;
  priceBasisUomCode?: string | null;
  priceBasisConversionToBase?: number | null;
  total: number;
  /** Admin-overridden per-unit price for this line (only set in admin edit context). */
  editedRate?: number | null;
  /** True when editedRate differs from the catalog rate. */
  isPriceEdited?: boolean;
}

interface TableOrderFormProps {
  onCartUpdate: (items: any[]) => void;
  products: Product[];
  loading: boolean;
  onReloadProducts?: () => void;
  onStockUpdate?: (productId: string, stockQuantity: number, productName: string) => void;
}

const normalizeUnitForOrder = (u?: string) => (u || "").toLowerCase().replace(/\./g, "").trim();

// Write-boundary guard: never persist a non-UUID uom_id (synthetic client-side ids break DB sync).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const safeUomId = (v: unknown): string | null => (v && UUID_RE.test(String(v)) ? String(v) : null);

const isLegacyWeightDefault = (u?: string) => {
  const unit = normalizeUnitForOrder(u);
  return ["kg", "kilogram", "kilograms", "g", "gm", "gram", "grams"].includes(unit);
};

const getDefaultOrderUnit = (product?: Product, requestedUnit?: string) => {
  const explicitUnit = normalizeUnitForOrder(requestedUnit);
  if (explicitUnit && !["kg", "kilogram", "kilograms"].includes(explicitUnit)) {
    return requestedUnit || product?.unit || "KG";
  }
  return product?.unit || product?.base_unit || requestedUnit || "KG";
};

const shouldReplaceWeightDefault = (unit?: string, product?: Product) => {
  const masterUnit = normalizeUnitForOrder(product?.unit || product?.base_unit);
  return Boolean(masterUnit && !isLegacyWeightDefault(masterUnit) && isLegacyWeightDefault(unit));
};

// Expose this handle type for refs
export interface TableOrderFormHandle {
  applyVoiceAutoFill: (results: VoiceAutoFillResult[]) => void;
}

export interface VoiceAutoFillResult {
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  quantity: number;
  unit: string;
  confidence: 'high' | 'medium' | 'low';
  searchTerm: string;
}

export const TableOrderForm = forwardRef<TableOrderFormHandle, TableOrderFormProps>(({ onCartUpdate, products, loading, onReloadProducts, onStockUpdate }, ref) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const visitId = searchParams.get("visitId") || '';
  const retailerId = searchParams.get("retailerId") || '';
  const editOrderId = searchParams.get("editOrderId") || '';
  const source = searchParams.get("source") || '';
  const isEditMode = !!editOrderId;
  const isAdminEdit = source === 'admin' && isEditMode;
  const editPolicy = useOrderEditPolicy();
  // When editing an order and the admin has locked pricing, freeze anything
  // that would change the per-unit rate (product, variant, UOM) — only qty is editable.
  // Admin edit context always bypasses the price lock (admin is the override authority).
  const priceLocked = isEditMode && editPolicy.edit_lock_price && !isAdminEdit;
  // Admins can always edit price. A rep can too, but only while editing an
  // existing order (not on first entry) and only when the admin hasn't locked
  // pricing for this company via Operations Config (edit_lock_price).
  const canEditPrice = isAdminEdit || (isEditMode && !priceLocked);
  // Separate opt-in: lets a rep edit a line's price (incl. GST) on a fresh,
  // not-yet-submitted order — gated by its own Operations Config toggle since
  // this is a distinct decision from editing an already-placed order above.
  const canEditEntryPrice = !isEditMode && editPolicy.entry_price_edit_enabled;
  const canEditAnyPrice = canEditPrice || canEditEntryPrice;
  // Phase 3: price-book pricing (feature-flagged, offline-safe, DB-resolved).
  const { resolveLinePrice } = usePriceBookPrices(retailerId);
  // Order amounts are always shown in the retailer's TRANSACTION currency (never converted).
  const { currency: txnCurrency, format: fmtMoney } = useOrderCurrency(retailerId);

  // PERF: disable noisy logs in hot paths
  const DEV_LOG = false;
  
  // Create storage key for table form persistence FIRST (needed for initial state)
  const validRetailerId = retailerId && retailerId !== '.' && retailerId.length > 1 ? retailerId : null;
  const validVisitId = visitId && visitId.length > 1 ? visitId : null;
  
  const tableFormStorageKey = isEditMode
    ? `table_form:edit:${editOrderId}`
    : validVisitId && validRetailerId 
      ? `table_form:${validVisitId}:${validRetailerId}`
      : validRetailerId 
        ? `table_form:temp:${validRetailerId}`
        : 'table_form:fallback';

  // Load initial order rows from localStorage to prevent data loss on navigation
  const getInitialOrderRows = (): OrderRow[] => {
    try {
      const savedData = localStorage.getItem(tableFormStorageKey);
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        if (isEditMode) {
          const hasProductRows = Array.isArray(parsedData) && parsedData.some((row: any) => row?.product?.id);
          return hasProductRows ? parsedData : [];
        }
        if (Array.isArray(parsedData) && parsedData.length > 0) {
          DEV_LOG && console.log('[TableOrderForm] Loaded initial rows from storage:', parsedData.length);
          return parsedData;
        }
      }
    } catch (error) {
      console.error('[TableOrderForm] Error loading initial rows:', error);
    }
    if (isEditMode) return [];
    return [{ id: "1", productCode: "", quantity: 0, closingStock: 0, unit: "", total: 0 }];
  };

  const [orderRows, setOrderRows] = useState<OrderRow[]>(getInitialOrderRows);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [editSeedApplied, setEditSeedApplied] = useState(false);
  
  // Use ref to always have access to the latest orderRows for addToCart
  const orderRowsRef = useRef<OrderRow[]>(orderRows);
  useEffect(() => {
    orderRowsRef.current = orderRows;
  }, [orderRows]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProductForVariants, setSelectedProductForVariants] = useState<string>('');
  const [openComboboxes, setOpenComboboxes] = useState<{ [key: string]: boolean }>({});
  // Per-row search text for the product picker. Only one popover is open at a time,
  // but we key by row to keep results scoped if multiple rows ever render at once.
  const [pickerSearch, setPickerSearch] = useState<{ [key: string]: string }>({});
  const [refreshingProducts, setRefreshingProducts] = useState(false);
  // How many matches to render at once. The full list can be 8k+ products —
  // rendering all of them locks the main thread; 50 is responsive + scrollable.
  const PICKER_RENDER_LIMIT = 50;
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showSchemesModal, setShowSchemesModal] = useState(false);
  // Per-row raw text for admin price inputs so partial values ("", "18.", "0.") are allowed.
  // Key = row.id, value = { rate?: rawUnitPriceText, total?: rawLineTotalText }.
  // Only the field currently being typed holds its own text; the other stays derived.
  const [priceEditText, setPriceEditText] = useState<Record<string, { rate?: string; total?: string; rate_incl_gst?: string }>>({});
  // Stock entry is occasional, so the column shows Price (incl. GST) by default and
  // switches every row to the Stock input together via this top-level "Add Stock" toggle.
  const [stockModeEnabled, setStockModeEnabled] = useState(false);

  // Load schemes with offline support
  const { schemes, loading: schemesLoading, isOnline } = useOfflineSchemes();

  // Other Free Products list, needed to resolve names when a buy_x_get_y_free
  // scheme's free_target_other_product_ids pool is offered to the buyer to choose from.
  const [otherFreeProducts, setOtherFreeProducts] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('scheme_free_products')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setOtherFreeProducts(data || []);
      });
    return () => { cancelled = true; };
  }, []);

  // Load scheme policies for enforcement
  const { policies: schemePolicies, loading: policiesLoading } = useSchemePolicies();
  
  // Applied schemes persistence
  // Sanitized ids (not the raw searchParams values) — Cart.tsx reads applied
  // schemes back with the same sanitized pair. Passing the raw ones here meant
  // an unsanitized retailerId placeholder (e.g. ".") produced a different
  // storage key than Cart.tsx would look up, so a scheme applied here could
  // silently vanish (and its free item along with it) once on the Cart screen.
  const { appliedSchemeIds, manualSelections, applyScheme, removeScheme, clearSchemes, setOnlyScheme, setManualSelection } = useAppliedSchemes(validVisitId || '', validRetailerId || '');
  
  // Track auto-applied schemes to prevent infinite loops
  const autoAppliedSchemesRef = useRef<Set<string>>(new Set());
  // Track schemes the user explicitly removed so they don't instantly auto-apply again
  const suppressedSchemesRef = useRef<Set<string>>(new Set());

  // Current retailer's scope, needed to rank scheme specificity for the
  // "Most Specific First" conflict-resolution policy.
  const [retailerScope, setRetailerScope] = useState<{ beat_id: string | null; territory_id: string | null; distributor_id: string | null } | null>(null);
  useEffect(() => {
    if (!validRetailerId) { setRetailerScope(null); return; }
    let cancelled = false;
    supabase
      .from('retailers')
      .select('beat_id, territory_id, distributor_id')
      .eq('id', validRetailerId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setRetailerScope(data || null);
      });
    return () => { cancelled = true; };
  }, [validRetailerId]);

  // scheme_applicability rows for every non-global scheme, needed for the same policy.
  const [schemeApplicabilityRows, setSchemeApplicabilityRows] = useState<{ scheme_id: string; applicability_level: string; entity_id: string | null }[]>([]);
  useEffect(() => {
    const nonGlobalSchemeIds = schemes.filter(s => s.applicability_type && s.applicability_type !== 'global').map(s => s.id);
    if (nonGlobalSchemeIds.length === 0) { setSchemeApplicabilityRows([]); return; }
    let cancelled = false;
    supabase
      .from('scheme_applicability')
      .select('scheme_id, applicability_level, entity_id')
      .in('scheme_id', nonGlobalSchemeIds)
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setSchemeApplicabilityRows(data || []);
      });
    return () => { cancelled = true; };
  }, [schemes]);

  // Highest specificity level of a scheme's applicability rules that actually match the
  // current retailer (retailer > beat > territory > salesperson/distributor), else 0 (global).
  const specificityRank = useMemo(() => {
    const RANK: Record<string, number> = { retailer: 4, beat: 3, territory: 2, salesperson: 1, distributor: 1 };
    return (scheme: ProductScheme): number => {
      if (!scheme.applicability_type || scheme.applicability_type === 'global') return 0;
      const rows = schemeApplicabilityRows.filter(r => r.scheme_id === scheme.id);
      let best = 0;
      for (const row of rows) {
        const matches =
          (row.applicability_level === 'retailer' && row.entity_id === validRetailerId) ||
          (row.applicability_level === 'beat' && row.entity_id === retailerScope?.beat_id) ||
          (row.applicability_level === 'territory' && row.entity_id === retailerScope?.territory_id) ||
          (row.applicability_level === 'distributor' && row.entity_id === retailerScope?.distributor_id) ||
          (row.applicability_level === 'salesperson');
        if (matches) best = Math.max(best, RANK[row.applicability_level] || 0);
      }
      return best;
    };
  }, [schemeApplicabilityRows, validRetailerId, retailerScope]);

  // Which conflicting scheme set the "User's Choice" dialog last prompted for, so
  // unrelated cart edits don't keep re-opening it.
  const lastConflictPromptRef = useRef<string>('');
  const [schemeConflict, setSchemeConflict] = useState<{ schemes: ProductScheme[] } | null>(null);

  const removeAppliedSchemeById = (schemeId: string) => {
    // Suppress to keep user intent (don’t instantly auto-reapply while conditions remain met)
    suppressedSchemesRef.current.add(schemeId);
    autoAppliedSchemesRef.current.delete(schemeId);
    removeScheme(schemeId);
  };

  // Get unique categories from products (memoized for performance)
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category?.name) set.add(p.category.name);
    });
    return Array.from(set).sort();
  }, [products]);

  // Helper to get cart storage key
  const getCartStorageKey = () => {
    if (isEditMode) return `order_cart:edit:${editOrderId}`;
    const validRetailerIdForStorage = retailerId && retailerId !== '.' && retailerId.length > 1 ? retailerId : null;
    const validVisitIdForStorage = visitId && visitId.length > 1 ? visitId : null;
    return validVisitIdForStorage && validRetailerIdForStorage 
      ? `order_cart:${validVisitIdForStorage}:${validRetailerIdForStorage}`
      : validRetailerIdForStorage 
        ? `order_cart:temp:${validRetailerIdForStorage}`
        : 'order_cart:fallback';
  };

  // Helper to convert quantity between units
  const convertBetweenUnits = (qty: number, fromUnit: string, toUnit: string): number => {
    const from = (fromUnit || '').toLowerCase();
    const to = (toUnit || '').toLowerCase();
    
    if (from === to) return qty;
    
    // kg to grams
    if (from === 'kg' && (to === 'grams' || to === 'gram' || to === 'g')) {
      return qty * 1000;
    }
    // grams to kg
    if ((from === 'grams' || from === 'gram' || from === 'g') && to === 'kg') {
      return qty / 1000;
    }
    
    return qty;
  };

  // Get display text showing equivalent in other unit
  const getUnitEquivalent = (qty: number, unit: string): string => {
    if (!qty || qty <= 0) return '';
    const u = (unit || '').toLowerCase();
    if (u === 'kg') {
      const grams = qty * 1000;
      return `(${grams.toLocaleString()}g)`;
    }
    if (u === 'grams' || u === 'gram' || u === 'g') {
      const kg = qty / 1000;
      return `(${kg.toFixed(2)}kg)`;
    }
    return '';
  };

  // Helper to sync current rows to cart storage
  // Stores quantity, rate and unit EXACTLY as selected from the unit master.
  // No hardcoded KG→grams normalization — the unit chosen by the user is the unit saved.
  const syncRowsToCart = (rows: OrderRow[]) => {
    const productRows = rows.filter(row => row.product && row.quantity > 0);
    const rawItems = productRows.map(row => {
      const displayName = row.variant ? row.variant.variant_name : row.product!.name;
      const stock = row.variant ? row.variant.stock_quantity : row.product!.closing_stock;
      const itemId = row.variant ? `${row.product!.id}_variant_${row.variant.id}` : row.product!.id;
      const selectedUnit = row.uomCode || row.unit || row.product!.unit || 'PC';
      const catalogRate = getPricePerUnit(
        row.product!,
        row.variant,
        selectedUnit,
        row.conversionToBase,
        row.priceBasisConversionToBase,
        row.quantity,
      );

      // Admin-edited price overrides the catalog rate on the way to the cart.
      // original_rate always keeps the catalog value for history.
      const hasEditedPrice = row.editedRate != null && Number.isFinite(row.editedRate);
      const effectiveRate = hasEditedPrice ? Number(row.editedRate) : catalogRate;
      const isPriceEdited = !!row.isPriceEdited && hasEditedPrice
        && Math.abs(Number(row.editedRate) - catalogRate) > 0.005;
      const qty = Number(row.quantity) || 0;
      const lineTotal = hasEditedPrice ? +(effectiveRate * qty).toFixed(2) : (Number(row.total) || 0);

      return {
        id: itemId,
        product_id: row.product!.id,
        variant_id: row.variant ? row.variant.id : null,
        name: displayName || 'Unknown Product',
        category: row.product!.category?.name || 'Uncategorized',
        category_id: row.product!.category_id ?? null,
        rate: effectiveRate,
        original_rate: catalogRate,
        is_price_edited: isPriceEdited,
        unit: selectedUnit,
        uom_id: safeUomId(row.uomId),
        uom_code: row.uomCode || selectedUnit,
        conversion_to_base: row.conversionToBase ?? null,
        base_unit: selectedUnit,
        quantity: qty,
        total: lineTotal,
        closingStock: Number(stock) || 0,
        schemes: row.product!.schemes || [],
        display_unit: selectedUnit,
        display_quantity: qty,
        hsn_code: (row.product as any)?.hsn_code || null,
        gst_percentage: (row.product as any)?.gst_percentage ?? null,
        tax_master_id: (row.product as any)?.tax_master_id ?? null
      };

    });

    // Merge duplicate lines (same product + variant + unit) into a single cart entry.
    // Multiple rows of the same product in the order-entry table should appear as ONE
    // line in the cart with the combined quantity/total.
    const mergedMap = new Map<string, typeof rawItems[number]>();
    for (const item of rawItems) {
      const key = `${item.product_id}__${item.variant_id ?? 'novariant'}__${item.uom_code || item.unit}`;
      const existing = mergedMap.get(key);
      if (existing) {
        existing.quantity = Number(existing.quantity) + Number(item.quantity);
        existing.total = Number(existing.total) + Number(item.total);
        existing.display_quantity = Number(existing.display_quantity) + Number(item.display_quantity);
      } else {
        mergedMap.set(key, { ...item });
      }
    }
    const cartItems = Array.from(mergedMap.values());

    onCartUpdate(cartItems);
    localStorage.setItem(getCartStorageKey(), JSON.stringify(cartItems));
    DEV_LOG && console.log('[syncRowsToCart] Synced to cart:', cartItems.length, 'items (merged from', rawItems.length, 'rows)');
  };

  const hasRealProductRows = (rows: unknown): rows is OrderRow[] => {
    return Array.isArray(rows) && rows.some((row: any) => row?.product?.id);
  };


  // Shared auto-fill path: used by the ref handle (Voice Order / Smart
  // Basket / Take Action) AND by the Order Scribe card's Accept — one
  // implementation, identical semantics.
  const applyAutoFillResults = useCallback((results: VoiceAutoFillResult[]) => {
      if (results.length === 0) return;

      console.log('[TableOrderForm] applyVoiceAutoFill called with:', results);

      // Voice/AI parsing is inherently fuzzy — a misheard number or a defaulted
      // unit can turn a normal order into one that's 100x-1000x too large, and
      // applyVoiceAutoFill used to add whatever it got straight to the cart with
      // no review step. Anything implausible for a single order line now needs
      // an explicit confirmation instead of being silently applied.
      const VOICE_CONFIRM_KG_THRESHOLD = 50; // no genuine single-line KG order seen in practice exceeds ~30kg
      const VOICE_CONFIRM_VALUE_THRESHOLD = 20000; // ₹ — well above a normal line, well below the phantom orders this is guarding against

      const confirmedResults = results.filter(result => {
        const product = products.find(p => p.id === result.productId);
        if (!product) return true; // caught and skipped below as "not found"
        const variant = result.variantId && product.variants
          ? product.variants.find(v => v.id === result.variantId)
          : undefined;
        const unit = getDefaultOrderUnit(product, result.unit);
        const rate = getPricePerUnit(product, variant, unit);
        const lineTotal = rate * result.quantity;
        const implausible =
          (unit.toLowerCase().startsWith('kg') && result.quantity > VOICE_CONFIRM_KG_THRESHOLD) ||
          lineTotal > VOICE_CONFIRM_VALUE_THRESHOLD;
        if (!implausible) return true;
        const label = variant?.variant_name || product.name;
        return window.confirm(
          `Voice heard "${result.quantity} ${unit}" for ${label} — that's ₹${lineTotal.toFixed(2)}, unusually large for one line. Add it anyway?`
        );
      });

      if (confirmedResults.length === 0) return;

      setOrderRows(prev => {
        let updatedRows = [...prev];

        for (const result of confirmedResults) {
          // Find the product in our products list
          const product = products.find(p => p.id === result.productId);
          if (!product) {
            console.log(`[applyVoiceAutoFill] Product not found: ${result.productId}`);
            continue;
          }
          
          // Find variant if specified
          let variant = undefined;
          if (result.variantId && product.variants) {
            variant = product.variants.find(v => v.id === result.variantId);
          }
          
          // Determine the row key (product ID or product_variant_ID combo)
          const rowKey = variant ? `${product.id}_variant_${variant.id}` : product.id;
          
          // Check if this product/variant already exists in the order
          const existingRowIndex = updatedRows.findIndex(row => {
            if (!row.product) return false;
            const existingKey = row.variant 
              ? `${row.product.id}_variant_${row.variant.id}` 
              : row.product.id;
            return existingKey === rowKey;
          });
          
          const unit = getDefaultOrderUnit(product, result.unit);
          
          // Calculate total price
          const rate = getPricePerUnit(product, variant, unit, null, null, result.quantity);
          const total = rate * result.quantity;
          
          if (existingRowIndex >= 0) {
            // Update existing row - add to quantity
            const existingRow = updatedRows[existingRowIndex];
            const newQuantity = existingRow.quantity + result.quantity;
            updatedRows[existingRowIndex] = {
              ...existingRow,
              quantity: newQuantity,
              total: rate * newQuantity
            };
            console.log(`[applyVoiceAutoFill] Updated existing row: ${product.name} → qty=${newQuantity}`);
          } else {
            // Find an empty row to fill, or add a new one
            const emptyRowIndex = updatedRows.findIndex(row => !row.product && row.quantity === 0);
            
            const newRow: OrderRow = {
              // Unique per row: Date.now() alone collides when several rows
              // are auto-filled in the same millisecond (Take Action / voice
              // multi-fill), and updateRow matches by id — duplicate ids made
              // one row's quantity edit propagate to all auto-filled rows.
              id: emptyRowIndex >= 0
                ? updatedRows[emptyRowIndex].id
                : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              productCode: variant?.sku || product.sku,
              product: product,
              variant: variant,
              quantity: result.quantity,
              closingStock: variant ? variant.stock_quantity : product.closing_stock,
              unit: unit,
              total: total
            };
            
            if (emptyRowIndex >= 0) {
              updatedRows[emptyRowIndex] = newRow;
            } else {
              updatedRows.push(newRow);
            }
            console.log(`[applyVoiceAutoFill] Added new row: ${variant?.variant_name || product.name} → qty=${result.quantity}`);
          }
        }
        
        // Sync to cart storage
        syncRowsToCart(updatedRows);
        
        return updatedRows;
      });
      
      // Show success toast
      const displayNames = confirmedResults.map(r => r.variantName || r.productName);
      toast({
        title: `✓ Added ${confirmedResults.length} item${confirmedResults.length > 1 ? 's' : ''} via voice`,
        description: displayNames.join(', '),
      });
  }, [products]);

  // Expose applyVoiceAutoFill to parent via ref
  useImperativeHandle(ref, () => ({
    applyVoiceAutoFill: applyAutoFillResults,
  }), [applyAutoFillResults]);


  useEffect(() => {
    // Reset init so we don't immediately overwrite loaded state
    setHasInitialized(false);
    setEditSeedApplied(false);

    // Reset auto-apply tracking for the new context
    autoAppliedSchemesRef.current.clear();
    suppressedSchemesRef.current.clear();

    // Load rows for this retailer/visit
    let rows: OrderRow[] | null = null;
    try {
      const savedData = localStorage.getItem(tableFormStorageKey);
      const parsedData = savedData ? JSON.parse(savedData) : null;
      if (isEditMode) {
        if (hasRealProductRows(parsedData)) {
          rows = parsedData;
          setEditSeedApplied(true);
        }
      } else if (Array.isArray(parsedData) && parsedData.length > 0) {
        rows = parsedData;
      }
    } catch (error) {
      console.error('[TableOrderForm] Error loading rows for key:', tableFormStorageKey, error);
    }

    if (!rows && !isEditMode) {
      rows = [{ id: "1", productCode: "", quantity: 0, closingStock: 0, unit: "", total: 0 }];
    }

    if (!rows) {
      DEV_LOG && console.log('[TableOrderForm] Edit context switched, waiting for seed:', tableFormStorageKey);
      return;
    }

    setOrderRows(rows);
    syncRowsToCart(rows);
    DEV_LOG && console.log('[TableOrderForm] Context switched, loaded rows:', rows.length, tableFormStorageKey);
  }, [tableFormStorageKey, isEditMode]);

  // EDIT MODE: seed table rows directly from the original order_items in the
  // database. OrderEntry may still be populating the edit cart asynchronously,
  // so we bypass the cart and read the source-of-truth line items instead.
  useEffect(() => {
    if (!isEditMode || products.length === 0 || !editOrderId) return;

    let cancelled = false;

    const seedFromOriginalOrder = async () => {
      try {
        const existingRaw = localStorage.getItem(tableFormStorageKey);
        const existing = existingRaw ? JSON.parse(existingRaw) : null;
        const hasRows = Array.isArray(existing) && existing.some((r: any) => r && r.product && r.product.id);
        if (hasRows) {
          if (!cancelled) setEditSeedApplied(true);
          return;
        }

        const { data: items, error } = await supabase
          .from('order_items')
          .select('id, product_id, variant_id, product_name, rate, original_rate, is_price_edited, unit, quantity, total')
          .eq('order_id', editOrderId);

        if (error) {
          console.error('[TableOrderForm][edit] failed to load original order items:', error);
          if (!cancelled) {
            const fallbackRows: OrderRow[] = [{ id: "1", productCode: "", quantity: 0, closingStock: 0, unit: "", total: 0 }];
            localStorage.setItem(tableFormStorageKey, JSON.stringify(fallbackRows));
            setOrderRows(fallbackRows);
            syncRowsToCart(fallbackRows);
            setEditSeedApplied(true);
          }
          return;
        }
        if (!Array.isArray(items) || items.length === 0) {
          console.error('[TableOrderForm][edit] no original order_items found for order:', editOrderId);
          if (!cancelled) {
            const fallbackRows: OrderRow[] = [{ id: "1", productCode: "", quantity: 0, closingStock: 0, unit: "", total: 0 }];
            localStorage.setItem(tableFormStorageKey, JSON.stringify(fallbackRows));
            setOrderRows(fallbackRows);
            syncRowsToCart(fallbackRows);
            setEditSeedApplied(true);
          }
          return;
        }

        const seeded: OrderRow[] = items.map((it: any, idx: number) => {
          const pid: string | undefined = it.product_id;
          const liveProduct = pid ? products.find(p => p.id === pid) : undefined;
          const liveVariant = liveProduct && it.variant_id
            ? liveProduct.variants?.find((v: any) => v.id === it.variant_id)
            : undefined;
          const qty = Number(it.quantity) || 0;
          const rate = Number(it.rate) || 0;
          const originalRate = Number(it.original_rate ?? rate) || rate;
          const wasEdited = !!it.is_price_edited && Math.abs(rate - originalRate) > 0.005;
          return {
            id: String(idx + 1),
            productCode: (liveVariant as any)?.sku || liveProduct?.sku || pid || '',
            product: liveProduct,
            variant: liveVariant,
            quantity: qty,
            closingStock: Number((liveVariant as any)?.stock_quantity ?? liveProduct?.closing_stock ?? 0),
            unit: it.unit || (liveProduct ? getDefaultOrderUnit(liveProduct) : 'pcs'),
            total: Number(it.total) || qty * rate,
            editedRate: wasEdited ? rate : null,
            isPriceEdited: wasEdited,
          } as OrderRow;
        });

        if (!cancelled) {
          localStorage.setItem(tableFormStorageKey, JSON.stringify(seeded));
          setOrderRows(seeded);
          syncRowsToCart(seeded);
          setEditSeedApplied(true);
          console.log('[TableOrderForm][edit] Seeded', seeded.length, 'rows from original order_items');
        }
      } catch (e) {
        console.error('[TableOrderForm][edit] seed from order_items failed:', e);
        if (!cancelled) {
          const fallbackRows: OrderRow[] = [{ id: "1", productCode: "", quantity: 0, closingStock: 0, unit: "", total: 0 }];
          localStorage.setItem(tableFormStorageKey, JSON.stringify(fallbackRows));
          setOrderRows(fallbackRows);
          syncRowsToCart(fallbackRows);
          setEditSeedApplied(true);
        }
      }
    };

    seedFromOriginalOrder();
    return () => { cancelled = true; };
  }, [isEditMode, editOrderId, products.length, tableFormStorageKey]);

  // Re-link products from live products array when products load (only once after init)

  useEffect(() => {
    if (products.length === 0 || hasInitialized) return; // Wait for products to load, only run once
    if (isEditMode && !editSeedApplied) return; // Let edit seed become authoritative before re-linking
    
    const savedData = localStorage.getItem(tableFormStorageKey);
    if (savedData) {
      try {
        const parsedData: OrderRow[] = JSON.parse(savedData);
        console.log('[TableOrderForm] Re-linking products from live array:', parsedData.length, 'rows');
        
        // Re-link products from live products array to avoid stale data
        const relinkedRows = parsedData.map(row => {
          if (row.product && row.product.id) {
            const liveProduct = products.find(p => p.id === row.product!.id);
            if (liveProduct) {
              let liveVariant = undefined;
              if (row.variant && row.variant.id) {
                liveVariant = liveProduct.variants?.find(v => v.id === row.variant.id);
              }
              const relinkedUnit = shouldReplaceWeightDefault(row.unit, liveProduct)
                ? getDefaultOrderUnit(liveProduct)
                : row.unit;
              return {
                ...row,
                product: liveProduct,
                variant: liveVariant,
                unit: relinkedUnit
              };
            }
          }
          return row;
        });
        
        setOrderRows(relinkedRows);
        // Immediately sync to cart storage after loading
        syncRowsToCart(relinkedRows);
      } catch (error) {
        console.error('[TableOrderForm] Error re-linking products:', error);
      }
    }
    setHasInitialized(true);
  }, [tableFormStorageKey, products.length, hasInitialized, isEditMode, editSeedApplied]);

  // Save table form data whenever orderRows change (but only after initialization)
  useEffect(() => {
    if (!hasInitialized) return; // Don't save during initial load
    
    if (orderRows.length > 0) {
      console.log('[TableOrderForm] Saving table form data:', orderRows.length, 'rows');
      localStorage.setItem(tableFormStorageKey, JSON.stringify(orderRows));
    }
  }, [orderRows, tableFormStorageKey, hasInitialized]);

  // Auto-apply schemes when conditions are met (respects policy settings)
  useEffect(() => {
    if (!hasInitialized || orderRows.length === 0 || schemes.length === 0 || policiesLoading) return;
    
    // If auto-apply is disabled, don't auto-apply anything
    if (!schemePolicies.autoApplyBestScheme) return;
    
    // Build items for scheme calculation - use variant ID if available for unique identification
    const items: SchemeItem[] = orderRows
      .filter(row => row.product && row.quantity > 0)
      .map(row => {
        const itemId = row.variant?.id || row.product!.id;
        const catalog = getPricePerUnit(row.product!, row.variant, row.uomCode || row.unit, row.conversionToBase, row.priceBasisConversionToBase, row.quantity);
        const eff = (row.editedRate != null && Number.isFinite(row.editedRate)) ? Number(row.editedRate) : catalog;
        return {
          id: itemId,
          product_id: itemId,
          variant_id: row.variant?.id,
          quantity: row.quantity,
          rate: eff,
          name: row.variant?.variant_name || row.product!.name,
          category_id: row.product!.category_id ?? null,
          unit: row.uomCode || row.unit
        };
      });
    
    if (items.length === 0) return;
    
    const subtotal = items.reduce((sum, item) => sum + (item.rate * item.quantity), 0);
    const activeSchemes = schemes.filter(s => isSchemeActive(s));
    
    // Get qualifying schemes (meet conditions and not suppressed)
    const qualifyingSchemes = activeSchemes
      .filter(scheme => {
        // Skip pure percentage offers with no conditions - these require manual apply
        if (scheme.scheme_type === 'percentage_discount' && !schemeHasConditions(scheme)) {
          return false;
        }
        // Skip suppressed schemes
        if (suppressedSchemesRef.current.has(scheme.id)) {
          return false;
        }
        return isSchemeConditionMet(scheme, items, subtotal);
      })
      .map(scheme => ({
        scheme,
        discount: calculateSchemeDiscountForComparison(scheme, items, subtotal)
      }))
      .filter(s => s.discount > 0);
    
    // Handle auto-removal of schemes that no longer qualify
    activeSchemes.forEach(scheme => {
      const conditionMet = isSchemeConditionMet(scheme, items, subtotal);
      const isApplied = appliedSchemeIds.includes(scheme.id);
      const wasAutoApplied = autoAppliedSchemesRef.current.has(scheme.id);
      
      // If the user no longer qualifies, clear suppression
      if (!conditionMet) {
        suppressedSchemesRef.current.delete(scheme.id);
      }
      
      // Auto-remove only if it was auto-applied and condition no longer met
      if (!conditionMet && isApplied && wasAutoApplied) {
        autoAppliedSchemesRef.current.delete(scheme.id);
        removeScheme(scheme.id);
        toast({
          title: "Offer Removed",
          description: `${scheme.name} - condition no longer met`,
          duration: 2000,
        });
      }
    });
    
    // If stacking not allowed OR max is 1, only apply the BEST scheme
    if (!schemePolicies.allowSchemeStacking || schemePolicies.maxSchemesPerOrder === 1) {
      if (qualifyingSchemes.length === 0) return;
      
      // Sort by discount and get the best one based on priority resolution
      let bestScheme;
      if (schemePolicies.priorityResolution === 'highest_discount') {
        bestScheme = qualifyingSchemes.sort((a, b) => b.discount - a.discount)[0];
      } else if (schemePolicies.priorityResolution === 'priority') {
        bestScheme = qualifyingSchemes.sort((a, b) =>
          (a.scheme.priority ?? 999) - (b.scheme.priority ?? 999)
        )[0];
      } else if (schemePolicies.priorityResolution === 'most_specific') {
        bestScheme = qualifyingSchemes.sort((a, b) => specificityRank(b.scheme) - specificityRank(a.scheme))[0];
      } else if (schemePolicies.priorityResolution === 'first_applied') {
        // User's Choice: let the order-entry user pick when more than one scheme
        // genuinely conflicts, instead of silently guessing. Only prompt once per
        // distinct conflicting set so unrelated cart edits don't keep re-opening it.
        if (qualifyingSchemes.length > 1) {
          const conflictKey = qualifyingSchemes.map(q => q.scheme.id).sort().join(',');
          if (lastConflictPromptRef.current !== conflictKey && !qualifyingSchemes.some(q => appliedSchemeIds.includes(q.scheme.id))) {
            lastConflictPromptRef.current = conflictKey;
            setSchemeConflict({ schemes: qualifyingSchemes.map(q => q.scheme) });
          }
          return;
        }
        bestScheme = qualifyingSchemes[0];
      } else {
        bestScheme = qualifyingSchemes[0];
      }

      const bestSchemeId = bestScheme.scheme.id;
      const currentAutoApplied = Array.from(autoAppliedSchemesRef.current);
      
      // If the best scheme is already applied, we're good
      if (appliedSchemeIds.includes(bestSchemeId) && appliedSchemeIds.length === 1) {
        return;
      }
      
      // Remove any other auto-applied schemes and set only the best one
      currentAutoApplied.forEach(id => {
        if (id !== bestSchemeId) {
          autoAppliedSchemesRef.current.delete(id);
        }
      });
      
      // Set only the best scheme
      if (!appliedSchemeIds.includes(bestSchemeId) || appliedSchemeIds.length > 1) {
        autoAppliedSchemesRef.current.add(bestSchemeId);
        setOnlyScheme(bestSchemeId);
        console.log('[TableOrderForm] Policy: Applied best scheme only:', bestScheme.scheme.name, 'Discount:', bestScheme.discount);
      }
      
      return;
    }
    
    // Normal multi-scheme behavior with maxSchemesPerOrder limit
    qualifyingSchemes.forEach(({ scheme }) => {
      const isApplied = appliedSchemeIds.includes(scheme.id);
      
      if (!isApplied && appliedSchemeIds.length < schemePolicies.maxSchemesPerOrder) {
        // Check same-type stacking rule
        if (!schemePolicies.sameTypeStacking) {
          const appliedTypes = appliedSchemeIds.map(id =>
            schemes.find(s => s.id === id)?.scheme_type
          ).filter(Boolean);

          if (appliedTypes.includes(scheme.scheme_type)) {
            return; // Skip - same type already applied
          }
        }

        // Mutually exclusive schemes: two schemes sharing a non-empty exclusion_group
        // can't both be applied at once.
        if (scheme.exclusion_group) {
          const appliedGroups = appliedSchemeIds
            .map(id => schemes.find(s => s.id === id)?.exclusion_group)
            .filter(Boolean);
          if (appliedGroups.includes(scheme.exclusion_group)) {
            return; // Skip - conflicts with an already-applied scheme's exclusion group
          }
        }

        autoAppliedSchemesRef.current.add(scheme.id);
        applyScheme(scheme.id, scheme, schemePolicies, schemes);
      }
    });
  }, [orderRows, schemes, hasInitialized, appliedSchemeIds, schemePolicies, policiesLoading, applyScheme, removeScheme, setOnlyScheme, specificityRank]);

  const findProductByCode = (code: string): { product: Product; variant?: any } | undefined => {
    // First check base products
    const baseProduct = products.find(p => p.sku.toLowerCase() === code.toLowerCase());
    if (baseProduct) {
      return { product: baseProduct };
    }
    
    // Then check variants
    for (const product of products) {
      if (product.variants) {
        const variant = product.variants.find(v => v.sku.toLowerCase() === code.toLowerCase() && v.is_active !== false);
        if (variant) {
          return { product, variant };
        }
      }
    }
    
    return undefined;
  };

  // Create flattened list of products and variants for combobox (memoized)
  // FOLLOWS ESTABLISHED PRODUCT DISPLAY STANDARD:
  // - Base products: Always included (even if they have variants)
  // - Variants: Display ONLY variant_name (not "base_product - variant_name")
  // - Active filtering: is_active !== false (treats null/undefined as active)
  const productOptions = useMemo(() => {
    const options: Array<{
      value: string;
      label: string;
      product: Product;
      variant?: any;
      sku: string;
      price: number;
      type: 'product' | 'variant';
      resolved?: ResolvedProduct;
    }> = [];

    // Filter only active products (driven directly by Product Master)
    let activeProducts = products.filter(p => p.is_active !== false);

    // Filter by selected category
    if (selectedCategory !== 'all') {
      activeProducts = activeProducts.filter(p => p.category?.name === selectedCategory);
    }

    activeProducts.forEach(product => {
      // Always add base product as a selectable option (even if it has variants)
      const baseResolved = resolveProduct(product);
      options.push({
        value: product.id,
        label: `${baseResolved.display_name} | ${fmtMoney(baseResolved.rate)}`,
        product,
        sku: baseResolved.sku || product.sku,
        price: baseResolved.rate,
        type: 'product',
        resolved: baseResolved,
      });

      // Add active variants; null/undefined is treated as active throughout order entry
      if (product.variants && product.variants.length > 0) {
        product.variants.forEach(variant => {
          if (variant.is_active !== false) {
            // Resolve variant against base — NULL variant fields inherit from base
            // so a variant with no overrides never renders blank.
            const r = resolveProduct(product, variant);
            options.push({
              value: `${product.id}_variant_${variant.id}`,
              label: `${r.display_name} | ${fmtMoney(r.rate)}`,
              product,
              variant,
              sku: r.sku || '',
              price: r.rate,
              type: 'variant',
              resolved: r,
            });
          }
        });
      }
    });

    return options;
  }, [products, selectedCategory]);

  // Unit conversion helpers - unified across UI and totals
  const normalizeUnit = (u?: string) => (u || "").toLowerCase().replace(/\./g, "").trim();

  const formatQtyUnit = (u?: string) => {
    const unit = normalizeUnit(u);
    if (!unit) return "";
    if (["g", "gm", "gram", "grams"].includes(unit)) return "grams";
    if (["kg", "kilogram", "kilograms"].includes(unit)) return "kg";
    if (["ml", "milliliter", "milliliters"].includes(unit)) return "ml";
    if (["l", "ltr", "liter", "liters", "litre", "litres"].includes(unit)) return "liters";
    if (["pc", "pcs", "piece", "pieces"].includes(unit)) return "pcs";
    if (["unit", "units"].includes(unit)) return "units";
    return u || "";
  };

  /** Price-book row for a line, or null when the product default applies. */
  const getPriceBookRow = (prod?: Product, variant?: any, qty?: number) => {
    if (!prod) return null;
    return resolveLinePrice(prod.id, variant?.id ?? null, Number(qty) || 0);
  };

  const getPricePerUnit = (
    prod: Product,
    variant?: any,
    unit?: string,
    conversionToBase?: number | null,
    priceBasisConversionToBase?: number | null,
    qty?: number,
  ) => {
    // Price book wins when a slab matches; otherwise fall back to the default price.
    const pbRow = getPriceBookRow(prod, variant, qty);
    const baseRate = pbRow ? Number(pbRow.price) || 0 : (Number(variant ? variant.price : prod.rate) || 0);

    const baseUnit = normalizeUnit(prod.base_unit || prod.unit);
    const targetUnit = normalizeUnit(unit || prod.unit);

    // Guard against an incomplete/stale UOM load: if the loaded unit set
    // claims a gram-family target shares the SAME conversion factor as a
    // KG-based product's price basis (ratio 1:1), that's never legitimate —
    // 1 gram cannot cost the same as 1 KG. This exact shape (price basis
    // silently resolving to the base GRAM row instead of KG when the KG
    // sibling failed to load) shipped ~700 order lines at 1000x the correct
    // price over 10 months before being caught. Fall through to the known-
    // safe string-based conversion instead of trusting the ratio.
    const isSuspiciousUnityRatio =
      !!conversionToBase && !!priceBasisConversionToBase &&
      Number(conversionToBase) === Number(priceBasisConversionToBase) &&
      (
        (baseUnit === "kg" && ["gram", "grams", "g", "gm"].includes(targetUnit)) ||
        (["g", "gm", "gram", "grams"].includes(baseUnit) && targetUnit === "kg") ||
        (["litre", "liter", "l"].includes(baseUnit) && ["ml", "milliliter", "milliliters"].includes(targetUnit)) ||
        (["ml", "milliliter", "milliliters"].includes(baseUnit) && ["litre", "liter", "l"].includes(targetUnit))
      );

    if (conversionToBase && priceBasisConversionToBase && !isSuspiciousUnityRatio) {
      return baseRate * (Number(conversionToBase) / Number(priceBasisConversionToBase));
    }

    if (!baseUnit) return baseRate;

    // KG <-> Gram conversions. `baseRate` (product.rate / variant.price) is
    // always priced per the product's price_basis_unit, which for every
    // weight-category product in this catalog is KG -- regardless of what
    // base_unit says. base_unit is the UOM system's physics base (e.g. GRAM
    // under the two-tier UOM rule), not necessarily the unit the price is
    // quoted in, so this must NOT branch on baseUnit. It used to: products
    // with base_unit=GRAM (paired with price_basis_unit=KG) hit the old
    // "baseUnit === gram" branch and had their already-per-KG rate
    // multiplied by 1000 a second time (₹319.05 -> ₹3,19,050/KG). Every
    // product until this catalog happened to have base_unit=KG too, so the
    // bug was latent until the first GRAM-based import.
    const kgWords = ["kg", "kilogram", "kilograms"];
    const gramWords = ["gram", "grams", "g", "gm"];
    if (kgWords.includes(baseUnit) || gramWords.includes(baseUnit)) {
      if (gramWords.includes(targetUnit)) return baseRate / 1000;
      if (kgWords.includes(targetUnit)) return baseRate;
    }

    // Piece-based or other units: keep as-is (optional conversion_factor can be added later)
    return baseRate;
  };

  const handleProductSelect = (rowId: string, value: string) => {
    const option = productOptions.find(opt => opt.value === value);
    if (option) {
      setOrderRows(prev =>
        prev.map(row => {
          if (row.id === rowId) {
            const defaultUnit = getDefaultOrderUnit(option.product);
            return {
              ...row,
              productCode: option.sku,
              product: option.product,
              variant: option.variant,
              // A freshly-picked row must start with a real unit, not '' —
              // the unit-switch handler below only rescales the quantity when
              // it has a previous unit to convert FROM. If a quantity gets
              // typed while unit is still blank and the user then picks
              // "Grams", there's no oldUnit to convert against, so the
              // quantity is left un-rescaled while the rate correctly divides
              // by 1000 — producing a near-zero total under a GRAM label
              // instead of the intended KG amount.
              unit: defaultUnit,
              uomId: null,
              uomCode: null,
              conversionToBase: null,
              priceBasisUomId: null,
              priceBasisUomCode: null,
              priceBasisConversionToBase: null,
              total: 0,
            };
          }
          return row;
        })
      );

      // Close the combobox
      setOpenComboboxes(prev => ({ ...prev, [rowId]: false }));
    }
  };

  const addNewRow = () => {
    const newRow: OrderRow = {
      id: Date.now().toString(),
      productCode: "",
      quantity: 0,
      closingStock: 0,
      unit: "",
      total: 0,
    };
    setOrderRows([...orderRows, newRow]);
  };

  // Handle applying a scheme - add product with minimum qualifying quantity and persist scheme
  const handleApplyScheme = (scheme: ProductScheme, product?: Product, quantity?: number) => {
    // User explicitly applied -> allow (unsuppress if previously removed)
    suppressedSchemesRef.current.delete(scheme.id);
    autoAppliedSchemesRef.current.delete(scheme.id);
    applyScheme(scheme.id);

    if (!product) {
      // Order-wide scheme - just persist
      return;
    }
    
    // Check if product already exists in order
    const existingRowIndex = orderRows.findIndex(row => row.product?.id === product.id);
    
    if (existingRowIndex >= 0) {
      // Update existing row quantity if needed
      const existingRow = orderRows[existingRowIndex];
      const newQuantity = Math.max(existingRow.quantity, quantity || 1);
      updateRow(existingRow.id, 'quantity', newQuantity);
    } else {
      // Add new row with the product
      const newRow: OrderRow = {
        id: Date.now().toString(),
        productCode: product.sku,
        product: product,
        quantity: quantity || 1,
        closingStock: product.closing_stock,
        unit: getDefaultOrderUnit(product),
        total: product.rate * (quantity || 1),
      };
      setOrderRows(prev => [...prev, newRow]);
    }
    
  };

  const removeRow = (id: string) => {
    setOrderRows(prev => {
      const updatedRows = prev.filter(row => row.id !== id);
      // Use helper to sync cart immediately
      syncRowsToCart(updatedRows);
      console.log('[removeRow] Cart synced after deletion');
      return updatedRows;
    });
  };

  const updateRow = (id: string, field: keyof OrderRow, value: any) => {
    const computeTotal = (
      prod?: Product,
      variant?: any,
      qty?: number,
      selectedUnit?: string,
      conversionToBase?: number | null,
      priceBasisConversionToBase?: number | null,
    ) => {
      if (!prod || !qty) return 0;

      // Price per selected unit using shared helper
      let price = getPricePerUnit(prod, variant, selectedUnit, conversionToBase, priceBasisConversionToBase, qty);

      // Apply variant discount if applicable
      if (variant) {
        if (Number(variant.discount_percentage) > 0) {
          price = price - (price * Number(variant.discount_percentage) / 100);
        } else if (Number(variant.discount_amount) > 0) {
          price = price - Number(variant.discount_amount);
        }
      }

      const base = Number(price) * Number(qty);
      const active = prod.schemes?.find(s => s.is_active);
      if (active && active.condition_quantity && active.discount_percentage && qty >= active.condition_quantity) {
        const discountedTotal = base - (base * (Number(active.discount_percentage) / 100));
        return parseFloat(discountedTotal.toFixed(2));
      }
      return parseFloat(base.toFixed(2));
    };

    setOrderRows(prev => {
      const updatedRows = prev.map(row => {
        if (row.id === id) {
          const updatedRow: OrderRow = field === "unit" ? { ...row } : ({ ...row, [field]: value } as OrderRow);
          if (field === "productCode") {
            const result = findProductByCode(value);
            if (result) {
              updatedRow.product = result.product;
              updatedRow.variant = result.variant;
              updatedRow.unit = '';
              updatedRow.uomId = null;
              updatedRow.uomCode = null;
              updatedRow.conversionToBase = null;
              updatedRow.priceBasisUomId = null;
              updatedRow.priceBasisUomCode = null;
              updatedRow.priceBasisConversionToBase = null;
              updatedRow.closingStock = result.variant ? result.variant.stock_quantity : result.product.closing_stock;
              updatedRow.total = computeTotal(result.product, result.variant, updatedRow.quantity, updatedRow.unit);
              // A new product resets any previous admin price override.
              updatedRow.editedRate = null;
              updatedRow.isPriceEdited = false;
            } else {
              updatedRow.product = undefined;
              updatedRow.variant = undefined;
              updatedRow.closingStock = 0;
              updatedRow.total = 0;
              updatedRow.editedRate = null;
              updatedRow.isPriceEdited = false;
            }
          } else if (field === "quantity") {
            // Use row.unit (current unit) since quantity is being updated
            updatedRow.total = computeTotal(row.product, row.variant, value, row.uomCode || row.unit, row.conversionToBase, row.priceBasisConversionToBase);
            // Preserve admin-edited unit price across quantity changes.
            if (updatedRow.editedRate != null && Number.isFinite(updatedRow.editedRate)) {
              updatedRow.total = +(Number(updatedRow.editedRate) * (Number(value) || 0)).toFixed(2);
            }
          } else if (field === "unit") {
            const sel = value as LineItemUomSelection;
            // When unit changes, convert quantity to the new unit automatically
            const oldUnit = row.uomCode || row.unit;
            const newUnit = sel.uomCode;
            updatedRow.unit = sel.uomCode;
            updatedRow.uomId = sel.uomId;
            updatedRow.uomCode = sel.uomCode;
            updatedRow.conversionToBase = sel.conversionToBase;
            updatedRow.priceBasisUomId = sel.priceBasisUomId || null;
            updatedRow.priceBasisUomCode = sel.priceBasisUomCode || null;
            updatedRow.priceBasisConversionToBase = sel.priceBasisConversionToBase ?? null;
            if (oldUnit && newUnit && row.quantity > 0) {
              updatedRow.quantity = convertBetweenUnits(row.quantity, oldUnit, newUnit);
            }
            // Recalculate total with the NEW unit and converted quantity — clears any admin override,
            // because the previous override was tied to a different UOM's price basis.
            updatedRow.total = computeTotal(row.product, row.variant, updatedRow.quantity, sel.uomCode, sel.conversionToBase, sel.priceBasisConversionToBase);
            updatedRow.editedRate = null;
            updatedRow.isPriceEdited = false;
          }
          return updatedRow;
        }
        return row;
      });
      
      // Use helper to sync cart immediately
      syncRowsToCart(updatedRows);
      return updatedRows;
    });
  };

  /**
   * Set an overridden per-unit price on a row. Pass mode='rate' with the new ex-GST unit
   * price, mode='total' with the new line total (rate is back-computed from quantity), or
   * mode='rate_incl_gst' with a GST-inclusive unit price (rate is back-computed via the
   * row's GST%). Passing an empty/invalid value clears the override so the catalog price
   * returns. Reused by both the edit-mode admin price fields (canEditPrice) and the
   * fresh-entry price field (canEditEntryPrice) — see canEditAnyPrice.
   */
  const applyAdminPrice = (rowId: string, mode: 'rate' | 'total' | 'rate_incl_gst', rawValue: string) => {
    if (!canEditAnyPrice) return;
    setOrderRows(prev => {
      const updated = prev.map(row => {
        if (row.id !== rowId || !row.product) return row;
        const qty = Number(row.quantity) || 0;
        const selectedUnit = row.uomCode || row.unit || row.product.unit || 'PC';
        const catalogRate = getPricePerUnit(
          row.product,
          row.variant,
          selectedUnit,
          row.conversionToBase,
          row.priceBasisConversionToBase,
          qty,
        );
        const gstPct = Number((row.product as any)?.gst_percentage) || 0;

        // Empty input clears the override.
        const parsed = Number(rawValue);
        if (rawValue === '' || !Number.isFinite(parsed) || parsed < 0) {
          const total = +(catalogRate * qty).toFixed(2);
          return { ...row, editedRate: null, isPriceEdited: false, total };
        }

        let nextRate: number;
        if (mode === 'rate') {
          nextRate = +parsed.toFixed(2);
        } else if (mode === 'rate_incl_gst') {
          nextRate = +(parsed / (1 + gstPct / 100)).toFixed(2);
          // Entry-price editing can be restricted to "raise only" via Operations Config.
          if (canEditEntryPrice && editPolicy.entry_price_edit_direction === 'higher_only' && nextRate < catalogRate) {
            nextRate = catalogRate;
          }
        } else {
          // total mode: rate = total / qty. Guard qty=0.
          if (qty <= 0) return row;
          nextRate = +(parsed / qty).toFixed(2);
        }

        const restoredToCatalog = Math.abs(nextRate - catalogRate) < 0.005;
        const total = +(nextRate * qty).toFixed(2);
        return {
          ...row,
          editedRate: restoredToCatalog ? null : nextRate,
          isPriceEdited: !restoredToCatalog,
          total,
        };
      });
      syncRowsToCart(updated);
      return updated;
    });
  };


  /**
   * Live typing handler for price fields. Updates the raw text buffer so
   * empty / partial values ("", "18.", "0.") are preserved in the input, and
   * pushes a parseable number into editedRate WITHOUT clearing the override on
   * empty/invalid input. Clearing happens on blur only (see onBlurAdminPrice).
   */
  const onChangeAdminPrice = (rowId: string, mode: 'rate' | 'total' | 'rate_incl_gst', rawValue: string) => {
    if (!canEditAnyPrice) return;
    // Keep only the field being typed in state; the other should recompute.
    setPriceEditText(prev => ({ ...prev, [rowId]: { [mode]: rawValue } }));
    const parsed = Number(rawValue);
    if (rawValue === '' || !Number.isFinite(parsed) || parsed < 0) return; // don't clear mid-typing
    setOrderRows(prev => {
      const updated = prev.map(row => {
        if (row.id !== rowId || !row.product) return row;
        const qty = Number(row.quantity) || 0;
        const gstPct = Number((row.product as any)?.gst_percentage) || 0;
        let nextRate: number;
        if (mode === 'rate') {
          nextRate = +parsed.toFixed(2);
        } else if (mode === 'rate_incl_gst') {
          nextRate = +(parsed / (1 + gstPct / 100)).toFixed(2);
          if (canEditEntryPrice && editPolicy.entry_price_edit_direction === 'higher_only') {
            const selectedUnit = row.uomCode || row.unit || row.product.unit || 'PC';
            const catalogRate = getPricePerUnit(row.product, row.variant, selectedUnit, row.conversionToBase, row.priceBasisConversionToBase, qty);
            if (nextRate < catalogRate) nextRate = catalogRate;
          }
        } else {
          if (qty <= 0) return row;
          nextRate = +(parsed / qty).toFixed(2);
        }
        const total = +(nextRate * qty).toFixed(2);
        return { ...row, editedRate: nextRate, isPriceEdited: true, total };
      });
      syncRowsToCart(updated);
      return updated;
    });
  };

  /** On blur: if the field was left empty, clear the override back to catalog. Always drop the raw text buffer. */
  const onBlurAdminPrice = (rowId: string, mode: 'rate' | 'total' | 'rate_incl_gst', rawValue: string) => {
    if (!canEditAnyPrice) return;
    if (mode === 'rate_incl_gst' && canEditEntryPrice && editPolicy.entry_price_edit_direction === 'higher_only' && rawValue.trim() !== '') {
      const parsed = Number(rawValue);
      const row = orderRows.find(r => r.id === rowId);
      if (row?.product && Number.isFinite(parsed)) {
        const qty = Number(row.quantity) || 0;
        const gstPct = Number((row.product as any)?.gst_percentage) || 0;
        const selectedUnit = row.uomCode || row.unit || row.product.unit || 'PC';
        const catalogRate = getPricePerUnit(row.product, row.variant, selectedUnit, row.conversionToBase, row.priceBasisConversionToBase, qty);
        const catalogInclGst = catalogRate * (1 + gstPct / 100);
        if (parsed < catalogInclGst - 0.005) {
          toast({
            title: 'Price can only be raised',
            description: `This policy only allows increasing the price — it's been kept at the catalog price of ${fmtMoney(catalogInclGst)}.`,
          });
        }
      }
    }
    if (rawValue.trim() === '') {
      applyAdminPrice(rowId, mode, '');
    }
    setPriceEditText(prev => {
      if (!(rowId in prev)) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  };



  const addToCart = () => {
    if (isAddingToCart) return;
    
    // ALWAYS use the React state directly (orderRowsRef) as single source of truth
    const currentRows = orderRowsRef.current;
    
    console.log('[addToCart] Using state rows:', currentRows.map(r => ({ 
      unit: r.unit, 
      qty: r.quantity, 
      product: r.product?.name,
      rate: r.product?.rate,
      variantPrice: r.variant?.price
    })));
    
    const validRows = currentRows.filter(row => row.product && row.quantity > 0);
    
    if (validRows.length === 0) {
      toast({
        title: "No Valid Items",
        description: "Please add valid products with quantities",
        variant: "destructive"
      });
      return;
    }

    setIsAddingToCart(true);

    try {
      // Use syncRowsToCart to ensure consistency
      syncRowsToCart(currentRows);
      
      console.log('[addToCart] Cart synced, navigating to cart page');
      
      // Navigate to cart with current parameters
      const params = new URLSearchParams(searchParams);
      navigate(`/cart?${params.toString()}`);
    } catch (error) {
      console.error('Error adding to cart:', error);
      toast({
        title: "Error",
        description: "Failed to add items to cart. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsAddingToCart(false);
    }
  };

  // Calculate totals using scheme engine
  const orderCalculation = useMemo(() => {
    const schemeItems: SchemeItem[] = orderRows
      .filter(row => row.product && row.quantity > 0)
      .map(row => {
        // Use variant ID if available for unique identification - each variant is a separate product
        const itemId = row.variant?.id || row.product!.id;
        const catalog = getPricePerUnit(row.product!, row.variant, row.uomCode || row.unit, row.conversionToBase, row.priceBasisConversionToBase, row.quantity);
        const eff = (row.editedRate != null && Number.isFinite(row.editedRate)) ? Number(row.editedRate) : catalog;
        return {
          id: itemId,
          product_id: itemId,
          variant_id: row.variant?.id,
          quantity: row.quantity,
          rate: eff,
          name: row.variant?.variant_name || row.product!.name,
          category_id: row.product!.category_id ?? null,
          unit: row.uomCode || row.unit
        };
      });
    
    return calculateOrderWithSchemes(schemeItems, schemes, appliedSchemeIds, manualSelections);
  }, [orderRows, schemes, appliedSchemeIds, manualSelections]);

  const getTotalValue = () => {
    return parseFloat(orderCalculation.subtotal.toFixed(2));
  };
  
  const getDiscountValue = () => {
    return parseFloat(orderCalculation.totalDiscount.toFixed(2));
  };
  
  const getFinalTotal = () => {
    return parseFloat(orderCalculation.finalTotal.toFixed(2));
  };

  const getGstAmount = () => {
    // Tax is computed and rounded per line via computeLineTax — the same
    // function Cart.tsx uses when an order is actually saved (CGST and SGST
    // each rounded to the nearest paisa, then summed). Rounding the combined
    // tax once at the end instead would make this live preview a paisa or two
    // higher than what actually gets persisted/invoiced, per line.
    const taxable = orderRows.filter(r => r.product && r.quantity > 0);
    const subtotal = taxable.reduce((s, r) => {
      const catalog = getPricePerUnit(r.product!, r.variant, r.uomCode || r.unit, r.conversionToBase, r.priceBasisConversionToBase, r.quantity);
      const eff = (r.editedRate != null && Number.isFinite(r.editedRate)) ? Number(r.editedRate) : catalog;
      return s + eff * r.quantity;
    }, 0);
    if (subtotal <= 0) return 0;
    const discountFactor = getFinalTotal() / subtotal;
    return taxable.reduce((tax, r) => {
      const catalog = getPricePerUnit(r.product!, r.variant, r.uomCode || r.unit, r.conversionToBase, r.priceBasisConversionToBase, r.quantity);
      const eff = (r.editedRate != null && Number.isFinite(r.editedRate)) ? Number(r.editedRate) : catalog;
      const lineTaxable = eff * r.quantity * discountFactor;
      const gstPct = Number((r.product as any)?.gst_percentage) || 0;
      return tax + computeLineTax({ taxableAmount: lineTaxable, gstPercentage: gstPct }).totalTax;
    }, 0);
  };

  const hasActiveSchemes = (product: Product) => {
    return product.schemes && product.schemes.some(scheme => scheme.is_active);
  };

  const getActiveSchemeDetails = (product: Product) => {
    const activeSchemes = product.schemes?.filter(scheme => scheme.is_active);
    if (!activeSchemes || activeSchemes.length === 0) return null;
    
    const scheme = activeSchemes[0];
    return `Buy ${scheme.condition_quantity}+ ${product.unit}s, get ${scheme.discount_percentage}% off`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        <span className="ml-2">Loading products...</span>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="text-muted-foreground mb-4">
          <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No products available</p>
          <p className="text-sm">Please contact admin to add products to the system</p>
        </div>
        <Button onClick={() => onReloadProducts?.()} variant="outline">
          Retry Loading Products
        </Button>
      </div>
    );
  }

  const isEditSeedLoading = isEditMode && !editSeedApplied && !hasRealProductRows(orderRows);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          {/* Category Filter + Refresh Products */}
          <div className="px-2 md:px-4 py-2 md:py-3 border-b border-border bg-background flex flex-wrap items-center gap-2">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="h-9 md:h-10 text-xs md:text-sm w-full md:w-64 bg-background">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50 max-h-[300px]">
                <SelectItem value="all" className="text-xs md:text-sm">All Categories</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category} className="text-xs md:text-sm">
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {onReloadProducts && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 md:h-10 md:w-10 shrink-0"
                disabled={refreshingProducts}
                onClick={async () => {
                  try {
                    setRefreshingProducts(true);
                    await onReloadProducts();
                    toast({ title: 'Products updated', description: 'Latest catalog loaded.' });
                  } catch (err) {
                    console.error('[TableOrderForm] Refresh products failed', err);
                    toast({ title: 'Refresh failed', description: 'Could not update products. Try again.', variant: 'destructive' });
                  } finally {
                    setRefreshingProducts(false);
                  }
                }}
                title="Reload products from server"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', refreshingProducts && 'animate-spin')} />
              </Button>
            )}
            <Button
              type="button"
              variant={stockModeEnabled ? "default" : "outline"}
              size="sm"
              className="h-9 md:h-10 text-xs md:text-sm ml-auto"
              onClick={() => setStockModeEnabled(v => !v)}
            >
              <Package className="h-3.5 w-3.5 md:mr-1.5" />
              <span className="hidden md:inline">{stockModeEnabled ? 'Done Adding Stock' : 'Add Stock'}</span>
              <span className="md:hidden ml-1.5">{stockModeEnabled ? 'Done' : 'Stock'}</span>
            </Button>
          </div>

          
          <div className="w-full">
            {/* Table Header - Responsive */}
            <div className="grid grid-cols-[1.5fr_0.8fr_0.6fr_0.6fr_auto] md:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 md:gap-4 px-2 md:px-4 py-2 md:py-3 bg-muted/50 border-b border-border">
              <div className="font-semibold text-xs md:text-sm">Product</div>
              <div className="font-semibold text-xs md:text-sm">Unit</div>
              <div className="font-semibold text-xs md:text-sm text-center">Qty</div>
              <div className="font-semibold text-xs md:text-sm text-center">
                {stockModeEnabled ? 'Stock' : (
                  <>
                    <span className="md:hidden">Price</span>
                    <span className="hidden md:inline">Price (incl. GST)</span>
                  </>
                )}
              </div>
              <div className="w-8"></div>
            </div>
              
              {/* Table Rows - Responsive */}
              <div className="divide-y divide-border">
                {isEditSeedLoading ? (
                  <div className="px-4 py-6 text-sm text-muted-foreground">Loading order…</div>
                ) : orderRows.map((row, index) => {
                  // Get the item ID for matching free items (variant ID or product ID)
                  const rowItemId = row.variant?.id || row.product?.id;
                  
                  // Get free items that belong to this product row
                  const freeItemsForRow = rowItemId ? orderCalculation.appliedSchemes
                    .filter(s => s.free_items && s.free_items.length > 0)
                    .flatMap(s => s.free_items!)
                    .filter(freeItem => (freeItem as any).triggering_item_id === rowItemId) : [];
                  
                  return (
                  <React.Fragment key={row.id}>
                  <div 
                  className={cn(
                    "grid grid-cols-[1.5fr_0.8fr_0.6fr_0.6fr_auto] md:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 md:gap-4 px-2 md:px-4 py-2 md:py-3 items-start",
                    index % 2 === 0 ? "bg-background" : "bg-muted/20"
                  )}
                >
                    {/* Product Column */}
                    <div className="flex flex-col min-w-0">
                      <Popover 
                        open={openComboboxes[row.id]} 
                        onOpenChange={(open) => { if (priceLocked) return; setOpenComboboxes(prev => ({ ...prev, [row.id]: open })); }}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openComboboxes[row.id]}
                            disabled={priceLocked}
                            title={priceLocked ? 'Price is locked for edited orders — only quantity can be changed' : undefined}
                            className="w-full min-w-0 justify-start h-9 md:h-11 text-xs md:text-sm font-normal bg-background px-2"
                          >

                            {row.product ? (
                              <div className="flex items-center gap-1.5 w-full overflow-hidden">
                                {(row.variant ? isFocusedProductActive(row.variant) : isFocusedProductActive(row.product)) && (
                                  <Star size={12} className="fill-yellow-500 text-yellow-500 flex-shrink-0" />
                                )}
                                {hasActiveSchemes(row.product) && (
                                  <Sparkles size={12} className="fill-orange-500 text-orange-500 flex-shrink-0" />
                                )}
                                <span className="truncate text-left flex-1 font-medium text-foreground">
                                  {row.variant ? (() => {
                                    // Show the FULL variant name as stored in Product Master.
                                    // Previously the parent product name was stripped off,
                                    // which turned "A1 Chat Masala 100g" into just "100g".
                                    return row.variant.variant_name || row.product.name;
                                  })() : row.product.name}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs md:text-sm">Select...</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[280px] md:w-[320px] p-0 bg-background z-50" align="start">
                          {(() => {
                            const search = (pickerSearch[row.id] || '').trim().toLowerCase();
                            const matches = search
                              ? productOptions.filter(o =>
                                  o.label.toLowerCase().includes(search) ||
                                  (o.sku || '').toLowerCase().includes(search)
                                )
                              : productOptions;
                            const visible = matches.slice(0, PICKER_RENDER_LIMIT);
                            return (
                              <Command className="bg-background" shouldFilter={false}>
                                <CommandInput
                                  placeholder="Search products..."
                                  className="h-9 md:h-10 text-xs md:text-sm"
                                  value={pickerSearch[row.id] || ''}
                                  onValueChange={(v) => setPickerSearch(prev => ({ ...prev, [row.id]: v }))}
                                />
                                <CommandList className="bg-background max-h-[250px] md:max-h-[300px]">
                                  <CommandEmpty>No product found.</CommandEmpty>
                                  <CommandGroup className="bg-background">
                                    {visible.map((option) => (
                                      <CommandItem
                                        key={option.value}
                                        value={option.value}
                                        onSelect={() => handleProductSelect(row.id, option.value)}
                                        className="text-xs md:text-sm bg-background hover:bg-accent py-2"
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-3 w-3 md:h-4 md:w-4",
                                            row.product?.id === option.product.id &&
                                            (!row.variant && !option.variant || row.variant?.id === option.variant?.id)
                                              ? "opacity-100"
                                              : "opacity-0"
                                          )}
                                        />
                                        <div className="flex-1 flex items-center gap-1.5">
                                          {(option.variant ? isFocusedProductActive(option.variant) : isFocusedProductActive(option.product)) && (
                                            <Star size={12} className="fill-yellow-500 text-yellow-500 flex-shrink-0" />
                                          )}
                                          {hasActiveSchemes(option.product) && (
                                            <Sparkles size={12} className="fill-orange-500 text-orange-500 flex-shrink-0" />
                                          )}
                                          <div className="flex-1">
                                            <div className="font-medium">{option.label}</div>
                                            <div className="text-[10px] md:text-xs text-muted-foreground">
                                              SKU: {option.sku} | {fmtMoney(option.variant ? option.variant.price : option.product.rate)}
                                            </div>
                                          </div>
                                        </div>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                  <div className="px-2 py-1.5 text-[10px] md:text-xs text-muted-foreground border-t bg-muted/30">
                                    Showing {visible.length} of {matches.length}
                                    {matches.length > visible.length ? ' — type to search' : ''}
                                  </div>
                                </CommandList>
                              </Command>
                            );
                          })()}
                        </PopoverContent>
                      </Popover>

                       {row.product && (() => {
                         const displayUnit = row.uomCode || row.unit;
                         const catalogRate = getPricePerUnit(row.product, row.variant, displayUnit, row.conversionToBase, row.priceBasisConversionToBase, row.quantity);
                         const pbRow = getPriceBookRow(row.product, row.variant, row.quantity);
                         const itemId = row.variant?.id || row.product.id;
                         const itemSchemes = orderCalculation.itemSchemeDetails?.[itemId] || [];
                         const totalDiscount = itemSchemes.reduce((s, x) => s + (x.discountAmount || 0), 0);
                         const hasDiscount = totalDiscount > 0 && row.quantity > 0;
                         const perUnitDiscount = hasDiscount ? totalDiscount / row.quantity : 0;
                         const hasEdited = row.editedRate != null && Number.isFinite(row.editedRate);
                         const shownRate = hasEdited ? Number(row.editedRate) : catalogRate;
                         const effectiveRate = Math.max(0, shownRate - perUnitDiscount);
                         return (
                           <>
                              {pbRow && (
                                <Badge
                                  variant="secondary"
                                  className="mt-1 text-[9px] px-1 py-0 bg-sky-500/10 text-sky-700 border-sky-500/30"
                                  title={`Priced from price book: ${pbRow.price_book_name}`}
                                >
                                  <Tag size={9} className="mr-0.5" />
                                  {pbRow.price_book_name}
                                </Badge>
                              )}
                              {canEditPrice ? (() => {
                                const buf = priceEditText[row.id] || {};
                                const qtyNum = Number(row.quantity) || 0;
                                const rateDisplay = buf.rate !== undefined
                                  ? buf.rate
                                  : (hasEdited ? String(row.editedRate) : catalogRate.toFixed(2));
                                const totalDisplay = buf.total !== undefined
                                  ? buf.total
                                  : (shownRate * qtyNum).toFixed(2);
                                return (
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                  <label className="text-[9px] text-muted-foreground">Unit ({txnCurrency})</label>
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    value={rateDisplay}
                                    onChange={(e) => onChangeAdminPrice(row.id, 'rate', e.target.value)}
                                    onBlur={(e) => onBlurAdminPrice(row.id, 'rate', e.target.value)}
                                    className="h-6 w-20 text-[10px] px-1.5"
                                  />
                                  <label className="text-[9px] text-muted-foreground">Line ({txnCurrency})</label>
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    value={totalDisplay}
                                    onChange={(e) => onChangeAdminPrice(row.id, 'total', e.target.value)}
                                    onBlur={(e) => onBlurAdminPrice(row.id, 'total', e.target.value)}
                                    className="h-6 w-24 text-[10px] px-1.5"
                                    disabled={!(qtyNum > 0)}
                                  />
                                  <span className="text-[9px] text-muted-foreground">per {displayUnit}</span>
                                 {row.isPriceEdited && (
                                   <>
                                     <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-amber-500/15 text-amber-700 border-amber-500/30">
                                       edited
                                     </Badge>
                                     <span className="text-[9px] text-muted-foreground">
                                       list {fmtMoney(catalogRate)}
                                     </span>
                                   </>
                                 )}
                                </div>
                                );
                              })() : hasDiscount ? (
                               <span className="text-[9px] mt-0.5 flex items-center gap-1 flex-wrap">
                                 <span className="line-through text-muted-foreground">
                                   {fmtMoney(catalogRate)}
                                 </span>
                                 <span className="text-green-600 font-medium">
                                    {fmtMoney(effectiveRate)} per {displayUnit}
                                 </span>
                               </span>
                             ) : (
                               <span className="text-[9px] text-muted-foreground mt-0.5">
                                  {fmtMoney(catalogRate)} per {displayUnit}
                               </span>
                             )}
                             {itemSchemes.length > 0 && row.quantity > 0 && (
                              <div className="mt-0.5 space-y-0.5">
                                {itemSchemes.map((scheme, idx) => (
                                  <div key={idx} className="flex items-center gap-1 text-[9px] md:text-[10px] text-green-600">
                                    <Gift size={10} className="flex-shrink-0" />
                                    <span className="truncate">
                                      {scheme.schemeType === 'buy_x_get_y_free' || scheme.schemeType === 'buy_get_free' ? (() => {
                                        const freeUnit = schemes.find(s => s.id === scheme.schemeId)?.free_quantity_unit;
                                        const unitLabel = formatQtyUnit(freeUnit);
                                        const unitPart = unitLabel ? `${unitLabel} ` : '';
                                        return <>🎁 {scheme.schemeName}: Get {scheme.freeItemQty} {unitPart}{scheme.freeItemName} FREE</>;
                                      })() : (
                                        <>
                                          {scheme.schemeName}
                                          {scheme.discountPercentage && ` (${scheme.discountPercentage}% off)`}
                                          {scheme.discountAmount > 0 && ` - ${fmtMoney(scheme.discountAmount)} saved`}
                                        </>
                                      )}
                                    </span>
                                  </div>
                                ))}
                              </div>
                             )}
                           </>
                         );
                       })()}
                    </div>
                    
                    {/* Unit Column */}
                    <div>
                      {row.product ? (
                        <LineItemUomSelect
                          productId={row.product.id}
                          value={row.uomCode || row.unit}
                          context="sales"
                          hideWhenSingle={false}
                          disabled={priceLocked}
                          className="h-9 md:h-11 text-xs md:text-sm w-full bg-background px-2"
                          onChange={(sel) => updateRow(row.id, "unit", sel)}
                        />

                      ) : (
                        <div className="h-9 md:h-11 flex items-center text-xs text-muted-foreground">—</div>
                      )}
                    </div>
                    
                    {/* Qty Column */}
                    <div className="flex flex-col">
                      <Input
                        type="number"
                        placeholder="0"
                        value={row.quantity || ""}
                        onChange={(e) => updateRow(row.id, "quantity", parseFloat(e.target.value) || 0)}
                        step={(row.uomCode || row.unit)?.toLowerCase() === 'kg' ? '0.1' : '1'}
                        className="h-9 md:h-11 text-xs md:text-sm text-center bg-background px-1 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                        disabled={!row.product}
                      />
                      {row.quantity > 0 && (
                        <span className="text-[9px] text-muted-foreground text-center mt-0.5">
                          {getUnitEquivalent(row.quantity, row.uomCode || row.unit)}
                        </span>
                      )}
                    </div>
                    
                    {/* Stock / Price (incl. GST) Column — Stock is occasional, so it stays
                        behind the top "Add Stock" toggle and this column shows
                        Price (incl. GST) by default. */}
                    <div>
                      {stockModeEnabled ? (
                        <Input
                          type="number"
                          placeholder="0"
                          value={row.closingStock === 0 ? "" : row.closingStock}
                          onChange={(e) => {
                            const value = e.target.value;
                            updateRow(row.id, "closingStock", value === "" ? 0 : parseInt(value) || 0);
                          }}
                          className={cn(
                            "h-9 md:h-11 text-xs md:text-sm text-center bg-background px-1",
                            row.closingStock === 0 && "text-muted-foreground"
                          )}
                          disabled={!row.product}
                        />
                      ) : row.product ? (() => {
                        const displayUnit = row.uomCode || row.unit;
                        const catalogRate = getPricePerUnit(row.product, row.variant, displayUnit, row.conversionToBase, row.priceBasisConversionToBase, row.quantity);
                        const hasEdited = row.editedRate != null && Number.isFinite(row.editedRate);
                        const shownRate = hasEdited ? Number(row.editedRate) : catalogRate;
                        const gstPct = Number((row.product as any)?.gst_percentage) || 0;
                        const inclGstRate = shownRate * (1 + gstPct / 100);
                        const buf = priceEditText[row.id]?.rate_incl_gst;
                        return canEditEntryPrice ? (
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={buf !== undefined ? buf : inclGstRate.toFixed(2)}
                            onChange={(e) => onChangeAdminPrice(row.id, 'rate_incl_gst', e.target.value)}
                            onBlur={(e) => onBlurAdminPrice(row.id, 'rate_incl_gst', e.target.value)}
                            className="h-9 md:h-11 text-xs md:text-sm text-center bg-background px-1"
                          />
                        ) : (
                          <div className="h-9 md:h-11 flex items-center justify-center text-xs md:text-sm">
                            {fmtMoney(inclGstRate)}
                          </div>
                        );
                      })() : (
                        <div className="h-9 md:h-11 flex items-center justify-center text-xs text-muted-foreground">—</div>
                      )}
                    </div>

                    {/* Delete Button */}
                    <div className="flex justify-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRow(row.id)}
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={orderRows.length === 1}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Free Items for this product - render directly under the product row */}
                  {freeItemsForRow.map((freeItem, freeIdx) => (
                    <div 
                      key={`free-${row.id}-${freeIdx}`} 
                      className="grid grid-cols-[1.5fr_0.8fr_0.6fr_0.6fr_auto] md:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 md:gap-4 px-2 md:px-4 py-1.5 md:py-2 items-center bg-green-50 border-l-4 border-l-green-500"
                    >
                      <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                        <Gift size={14} className="text-green-600 shrink-0" />
                        <span className="text-xs font-medium text-green-700 truncate">{freeItem.product_name}</span>
                        <Badge variant="secondary" className="bg-green-100 text-green-700 text-[10px] px-1 py-0 shrink-0">FREE</Badge>
                      </div>
                      <div className="text-xs text-green-600">{formatQtyUnit(freeItem.unit) || 'pcs'}</div>
                      <div className="text-center text-xs font-medium text-green-700">{freeItem.quantity}</div>
                      <div className="text-center text-xs text-muted-foreground">-</div>
                      <div className="text-right text-xs font-bold text-green-600 pr-2">{fmtMoney(0)}</div>
                    </div>
                  ))}
                  </React.Fragment>
                );
                })}
              </div>
            </div>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          onClick={addNewRow}
          className="flex items-center gap-2"
        >
          <Plus size={14} />
          Add Row
        </Button>
        
        <div className="text-right space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Currency: {txnCurrency}</p>
          <div className="flex justify-end items-center gap-2">

            <p className="text-sm text-muted-foreground">Subtotal:</p>
            <p className="text-sm font-medium">{fmtMoney(getTotalValue())}</p>
          </div>
          
          {getDiscountValue() > 0 && (
            <div className="flex justify-end items-center gap-2">
              <div className="flex items-center gap-1 text-green-600">
                <Tag size={12} />
                <p className="text-sm">Discount:</p>
              </div>
              <p className="text-sm font-medium text-green-600">-{fmtMoney(getDiscountValue())}</p>
              <button
                className="p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                onClick={() => {
                  appliedSchemeIds.forEach(id => removeAppliedSchemeById(id));
                  toast({
                    title: "Offers Removed",
                    description: "All applied offers have been removed",
                  });
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
          
          <div className="flex justify-end items-center gap-2 pt-1 border-t border-border">
            <p className="text-sm font-semibold">Total:</p>
            <p className="text-lg font-bold">{fmtMoney(getFinalTotal() + getGstAmount())}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            (excl. GST: {fmtMoney(getFinalTotal())})
          </p>
        </div>
      </div>

      {/* Apply Offers Section - Flipkart style */}
      <ApplyOfferSection
        schemes={schemes}
        orderRows={orderRows}
        onClick={() => setShowSchemesModal(true)}
        loading={schemesLoading}
      />

      {/* Save Stock button - visible when there are stock-only rows */}
      {onStockUpdate && orderRows.some(row => row.product && row.closingStock > 0) && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            const stockRows = orderRows.filter(row => row.product && row.closingStock > 0);
            stockRows.forEach(row => {
              const productName = row.variant ? row.variant.variant_name : row.product!.name;
              const productId = row.variant ? `${row.product!.id}_variant_${row.variant.id}` : row.product!.id;
              onStockUpdate(productId, row.closingStock, productName);
            });
            toast({
              title: "Stock Updated",
              description: `Stock quantities saved for ${stockRows.length} item(s).`,
            });
          }}
        >
          <Package className="h-4 w-4 mr-2" />
          Save Stock ({orderRows.filter(row => row.product && row.closingStock > 0).length})
        </Button>
      )}

      <Button
        onClick={addToCart}
        className="w-full"
        disabled={getTotalValue() === 0 || isAddingToCart}
      >
        {isAddingToCart ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading...
          </>
        ) : (
          "Preview Order"
        )}
      </Button>

      {/* Ambient Order Scribe — transcribes the in-store conversation live;
          items are created ONLY when the user presses Accept, through the
          same applyAutoFillResults path Voice Order uses. */}
      <OrderScribeCard products={products as any} onAccept={applyAutoFillResults} />

      <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded border border-border">
        <strong>Note:</strong> All base prices are stored per KG. Rates auto-adjust when selling in grams or other units.
      </p>

      {/* Schemes Modal */}
      <OrderEntrySchemesModal
        isOpen={showSchemesModal}
        onClose={() => setShowSchemesModal(false)}
        schemes={schemes}
        loading={schemesLoading}
        isOnline={isOnline}
        orderRows={orderRows}
        products={products}
        otherFreeProducts={otherFreeProducts}
        appliedSchemeIds={appliedSchemeIds}
        schemePolicies={schemePolicies}
        onApplyScheme={handleApplyScheme}
        onRemoveScheme={removeAppliedSchemeById}
        manualSelections={manualSelections}
        onSetManualSelection={setManualSelection}
      />

      <SchemeConflictChoiceDialog
        isOpen={!!schemeConflict}
        onClose={() => setSchemeConflict(null)}
        schemes={schemeConflict?.schemes || []}
        onConfirm={(schemeId) => {
          autoAppliedSchemesRef.current.add(schemeId);
          setOnlyScheme(schemeId);
        }}
      />
    </div>
  );
});

TableOrderForm.displayName = 'TableOrderForm';
