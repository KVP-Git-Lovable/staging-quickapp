/**
 * Scheme Engine - Centralized calculation engine for all offer/discount logic
 * Handles order-wide schemes, product-specific schemes, and various discount types
 */

export interface SchemeItem {
  id: string;
  product_id?: string;
  variant_id?: string;
  quantity: number;
  rate: number;
  name?: string;
  category_id?: string | null;
  // Selling unit this line's `quantity`/`rate` are actually expressed in (e.g. 'KG', 'G').
  // Needed to convert a scheme's per-unit discount rate onto the line's real unit —
  // without it, a per-kg discount gets applied as-is against a gram-denominated
  // quantity (or vice versa), off by the conversion factor between them.
  unit?: string;
}

// kg<->g and l<->ml are the only conversions the product catalog guarantees
// (see uomEngine.ts's Phase 1 backfill note). Anything else is left unconverted
// rather than guessed.
function convertPerUnitRate(rate: number, fromUnit: string | undefined, toUnit: string | undefined): number {
  const from = (fromUnit || '').trim().toLowerCase();
  const to = (toUnit || '').trim().toLowerCase();
  if (!from || !to || from === to) return rate;
  const isGram = (u: string) => u === 'g' || u === 'gm' || u === 'gram' || u === 'grams';
  const isMl = (u: string) => u === 'ml' || u === 'milliliter' || u === 'millilitre';
  const SCALE = 1000;
  if (from === 'kg' && isGram(to)) return rate / SCALE;
  if (isGram(from) && to === 'kg') return rate * SCALE;
  if (from === 'l' && isMl(to)) return rate / SCALE;
  if (isMl(from) && to === 'l') return rate * SCALE;
  return rate;
}

export interface AppliedScheme {
  id: string;
  name: string;
  scheme_type: string;
  discount_amount: number;
  discount_percentage?: number;
  product_id?: string | null;
  free_items?: {
    product_name: string;
    quantity: number;
    product_id?: string;
    other_free_product_id?: string;
    original_rate?: number;
    unit?: string;
  }[];
  // For manual_per_unit_discount
  per_unit_discount?: number;
  unit?: string;
  applied_to_item_id?: string;
  applied_to_product_name?: string;
  value_type?: 'amount' | 'percentage';
}

export interface ItemSchemeDetail {
  schemeId: string;
  schemeName: string;
  schemeType: string;
  discountAmount: number;
  discountPercentage?: number;
  // BOGO specific fields
  freeItemName?: string;
  freeItemQty?: number;
  // Manual per-unit discount fields
  perUnitDiscount?: number;
  unit?: string;
  // For manual_per_unit_discount: 'amount' or 'percentage'
  valueType?: 'amount' | 'percentage';
}

export interface SchemeCalculationResult {
  subtotal: number;
  totalDiscount: number;
  finalTotal: number;
  appliedSchemes: AppliedScheme[];
  itemDiscounts: Record<string, number>; // product_id -> discount amount
  itemSchemeDetails: Record<string, ItemSchemeDetail[]>; // item_id -> array of schemes applied
}

export interface ProductScheme {
  id: string;
  name: string;
  description?: string | null;
  scheme_type: string;
  product_id?: string | null;
  variant_id?: string | null;
  // category_wide_discount — restricts the scheme to items in this category.
  category_id?: string | null;
  discount_percentage?: number | null;
  discount_amount?: number | null;
  // Bundle/combo support — a fixed set of products priced/discounted together
  bundle_product_ids?: string[] | null;
  bundle_discount_percentage?: number | null;
  bundle_discount_amount?: number | null;
  buy_quantity?: number | null;
  buy_quantity_unit?: string | null;
  free_quantity?: number | null;
  free_quantity_unit?: string | null;
  free_product_id?: string | null;
  other_free_product_id?: string | null;
  free_product_source?: 'catalogue' | 'other' | null;
  other_free_product_name?: string;
  // Many-to-many buy X get Y: 'fixed' (default) uses free_product_id/other_free_product_id
  // above; 'user_choice' lets the order-entry user pick one item from the pools below.
  free_product_selection_mode?: 'fixed' | 'user_choice' | null;
  free_target_product_ids?: string[] | null;
  free_target_other_product_ids?: string[] | null;
  condition_quantity?: number | null;
  quantity_condition_type?: string | null;
  min_order_value?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean | null;
  is_first_order_only?: boolean | null;
  product_name?: string;
  free_product_name?: string;
  // Multi-product support
  target_product_ids?: string[] | null;
  per_product_discounts?: Record<string, { discount_percentage: number }> | null;
  // Manual per-unit discount support
  max_discount_per_unit?: number | null;
  discount_unit?: string | null;
  // 'amount' (₹/unit) or 'percentage' (% off rate per unit). Defaults to 'amount'.
  discount_value_type?: string | null;
  // Conflict-resolution support (Scheme Management > Policy Settings)
  priority?: number | null;
  exclusion_group?: string | null;
  applicability_type?: 'global' | 'targeted' | 'hybrid' | null;
}

/**
 * Manual selection made by salesperson for a manual_per_unit_discount scheme.
 * Keyed by scheme id.
 */
export interface ManualSchemeSelection {
  // Required for manual_per_unit_discount; unused for a pure free-product-pool choice.
  itemId?: string;          // cart line id (matches SchemeItem.id)
  perUnitDiscount?: number; // amount entered, ≤ scheme.max_discount_per_unit
  // Optional: when 'percentage', perUnitDiscount represents a % off the line rate
  valueType?: 'amount' | 'percentage';
  // Optional: multi-line selection. When present, the discount is applied to every
  // listed cart line. `itemId` is kept for backward compatibility (mirrors itemIds[0]).
  itemIds?: string[];
  // Optional: per-line discount values. Keyed by cart line id. When present, each
  // selected line uses its own value (clamped to cap); falls back to perUnitDiscount.
  perItemDiscounts?: Record<string, number>;
  // Order-entry choice for a buy_x_get_y_free scheme with free_product_selection_mode
  // === 'user_choice' — which Y from the pool the buyer picked as their free item.
  chosenFreeProductId?: string;
  chosenFreeProductSource?: 'catalogue' | 'other';
  chosenFreeProductName?: string;
}

/**
 * Check if a scheme is currently active based on dates and is_active flag
 */
export function isSchemeActive(scheme: ProductScheme): boolean {
  if (scheme.is_active === false) return false;
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  if (scheme.start_date) {
    const startDate = new Date(scheme.start_date);
    startDate.setHours(0, 0, 0, 0);
    if (today < startDate) return false;
  }
  
  if (scheme.end_date) {
    const endDate = new Date(scheme.end_date);
    endDate.setHours(23, 59, 59, 999);
    if (now > endDate) return false;
  }
  
  return true;
}

/**
 * Get all active schemes from a list
 */
export function getActiveSchemes(schemes: ProductScheme[]): ProductScheme[] {
  return schemes.filter(isSchemeActive);
}

/**
 * Check if scheme has conditions (not just a pure percentage offer)
 */
export function schemeHasConditions(scheme: ProductScheme): boolean {
  return !!(
    scheme.condition_quantity ||
    scheme.buy_quantity ||
    scheme.min_order_value ||
    (scheme.scheme_type === 'bundle_combo' && scheme.bundle_product_ids && scheme.bundle_product_ids.length > 0)
  );
}

/**
 * Check if ALL conditions for a scheme are met by current order items
 */
export function isSchemeConditionMet(
  scheme: ProductScheme, 
  items: SchemeItem[], 
  subtotal: number
): boolean {
  // Check min order value condition
  if (scheme.min_order_value && subtotal < scheme.min_order_value) {
    return false;
  }

  // Bundle / Combo Discount — every listed product must be in the order,
  // not just one of them. Checked before the generic product_id/multi-product
  // branches below, since a bundle scheme sets neither of those fields and
  // would otherwise fall through to "order-wide, always eligible."
  if (scheme.scheme_type === 'bundle_combo') {
    const bundleProductIds = scheme.bundle_product_ids || [];
    if (bundleProductIds.length === 0) return false;
    const itemProductIds = new Set(items.map(item => item.product_id || item.id));
    return bundleProductIds.every(id => itemProductIds.has(id));
  }

  const hasMultiProduct = scheme.target_product_ids && scheme.target_product_ids.length > 0;

  // For product-specific schemes, check product and quantity conditions
  if (scheme.product_id) {
    const matchingItem = items.find(item => 
      item.product_id === scheme.product_id || 
      item.id === scheme.product_id
    );
    
    if (!matchingItem) return false;
    
    // Check quantity condition (buy_quantity or condition_quantity)
    const requiredQty = scheme.condition_quantity || scheme.buy_quantity;
    if (requiredQty && matchingItem.quantity < requiredQty) {
      return false;
    }
  } else if (hasMultiProduct) {
    // Multi-product scheme - check if ANY targeted product is in items and meets quantity
    const matchingItems = items.filter(item => 
      scheme.target_product_ids!.includes(item.product_id || item.id)
    );
    
    if (matchingItems.length === 0) return false;
    
    // Check quantity condition against total of matching items only
    const requiredQty = scheme.condition_quantity || scheme.buy_quantity;
    if (requiredQty) {
      const totalMatchingQty = matchingItems.reduce((sum, item) => sum + item.quantity, 0);
      if (totalMatchingQty < requiredQty) {
        return false;
      }
    }
  } else if (scheme.category_id) {
    // Category-wide scheme — only "met" if the cart actually has an item in
    // that category, otherwise it would show as applicable with nothing to discount.
    const matchingItems = items.filter(item => item.category_id === scheme.category_id);
    if (matchingItems.length === 0) return false;

    const requiredQty = scheme.condition_quantity || scheme.buy_quantity;
    if (requiredQty) {
      const totalMatchingQty = matchingItems.reduce((sum, item) => sum + item.quantity, 0);
      if (totalMatchingQty < requiredQty) {
        return false;
      }
    }
  } else {
    // Order-wide scheme (no product_id and no target_product_ids)
    const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
    const requiredQty = scheme.condition_quantity || scheme.buy_quantity;
    if (requiredQty && totalQty < requiredQty) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check if a scheme applies to a specific item
 */
function schemeAppliesToItem(scheme: ProductScheme, item: SchemeItem): boolean {
  // Bundle / Combo Discount only ever applies to its own listed products —
  // never order-wide, even though it has no product_id of its own.
  if (scheme.scheme_type === 'bundle_combo') {
    return (scheme.bundle_product_ids || []).includes(item.product_id || item.id);
  }

  // Check multi-product array first
  if (scheme.target_product_ids && scheme.target_product_ids.length > 0) {
    return scheme.target_product_ids.includes(item.product_id || item.id);
  }

  // Category-scoped scheme (e.g. category_wide_discount) — matches only items
  // in that category. Must be checked before the order-wide fallback below,
  // otherwise a category scheme with no product_id would match every item.
  if (scheme.category_id) {
    return item.category_id === scheme.category_id;
  }

  // Order-wide scheme (no product_id) applies to all items
  if (!scheme.product_id) return true;
  
  // Product-specific scheme
  if (scheme.product_id === item.product_id) {
    // If scheme has variant_id, check that too
    if (scheme.variant_id && item.variant_id) {
      return scheme.variant_id === item.variant_id;
    }
    return true;
  }
  
  return false;
}

/**
 * Get the discount percentage for a specific product (handles per-product discounts)
 */
function getProductDiscountPercentage(scheme: ProductScheme, productId: string): number {
  // Check for per-product discount first
  if (scheme.per_product_discounts && scheme.per_product_discounts[productId]) {
    return scheme.per_product_discounts[productId].discount_percentage || 0;
  }
  // Fall back to scheme-level discount
  return scheme.discount_percentage || 0;
}

/**
 * Check if quantity condition is met
 */
function isQuantityConditionMet(scheme: ProductScheme, quantity: number): boolean {
  if (!scheme.condition_quantity) return true;
  
  const condType = scheme.quantity_condition_type || 'gte';
  
  switch (condType) {
    case 'gte':
    case 'min':
      return quantity >= scheme.condition_quantity;
    case 'eq':
      return quantity === scheme.condition_quantity;
    case 'lte':
    case 'max':
      return quantity <= scheme.condition_quantity;
    default:
      return quantity >= scheme.condition_quantity;
  }
}

/**
 * Calculate discount for a single scheme on given items
 */
function calculateSchemeDiscount(
  scheme: ProductScheme, 
  items: SchemeItem[], 
  subtotal: number,
  manualSelection?: ManualSchemeSelection
): { 
  discount: number; 
  itemDiscounts: Record<string, number>; 
  itemSchemeDetails: Record<string, ItemSchemeDetail[]>;
  freeItems?: { product_name: string; quantity: number; product_id?: string; other_free_product_id?: string; original_rate?: number; unit?: string; triggering_item_id?: string }[];
  manualMeta?: { perUnitDiscount: number; unit: string; itemId: string; productName: string; valueType: 'amount' | 'percentage' };
} {
  let discount = 0;
  const itemDiscounts: Record<string, number> = {};
  const itemSchemeDetails: Record<string, ItemSchemeDetail[]> = {};
  let freeItems: { product_name: string; quantity: number; product_id?: string; other_free_product_id?: string; original_rate?: number; unit?: string; triggering_item_id?: string }[] | undefined;
  let manualMeta: { perUnitDiscount: number; unit: string; itemId: string; productName: string; valueType: 'amount' | 'percentage' } | undefined;

  // Get applicable items
  const applicableItems = items.filter(item => schemeAppliesToItem(scheme, item));
  
  if (applicableItems.length === 0) return { discount: 0, itemDiscounts, itemSchemeDetails };

  // Calculate based on scheme type
  switch (scheme.scheme_type) {
    case 'manual_per_unit_discount': {
      // Salesperson must have made a selection
      if (!manualSelection) break;
      const cap = Number(scheme.max_discount_per_unit || 0);
      if (cap <= 0) break;

      const valueType: 'amount' | 'percentage' =
        (scheme.discount_value_type as 'amount' | 'percentage') === 'percentage'
          ? 'percentage'
          : 'amount';

      const fallbackEntered = Math.max(0, Math.min(cap, Number(manualSelection.perUnitDiscount) || 0));
      const perItem = manualSelection.perItemDiscounts || {};

      // Resolve the list of selected cart lines (multi-select); fall back to single itemId for legacy.
      const selectedIds = (manualSelection.itemIds && manualSelection.itemIds.length > 0)
        ? manualSelection.itemIds
        : (manualSelection.itemId ? [manualSelection.itemId] : []);

      const unit = scheme.discount_unit || 'unit';
      const matchedItems: SchemeItem[] = [];

      for (const sid of selectedIds) {
        // Match by line id, or by variant_id for legacy stored selections.
        const item = items.find(i => i.id === sid || (i.variant_id && i.variant_id === sid));
        if (!item) continue;
        if (!schemeAppliesToItem(scheme, item)) continue;
        if (!isQuantityConditionMet(scheme, item.quantity)) continue;

        // Per-line entered value, clamped to cap; falls back to legacy single value.
        const rawForLine = perItem[sid] != null ? Number(perItem[sid]) : fallbackEntered;
        const enteredForLine = Math.max(0, Math.min(cap, Number(rawForLine) || 0));
        if (enteredForLine <= 0) continue;

        // For percentage: perUnit = rate * pct/100 (item.rate is already in the
        // line's real unit, so this is unit-safe as-is). For amount: the rep's
        // entered value is denominated in the scheme's discount_unit (e.g. kg),
        // so it must be converted onto the line's actual unit before being
        // multiplied by item.quantity — otherwise a per-kg discount gets applied
        // per-gram (or vice versa) whenever the line's unit differs from the scheme's.
        const perUnit =
          valueType === 'percentage'
            ? (Number(item.rate) || 0) * (enteredForLine / 100)
            : convertPerUnitRate(enteredForLine, unit, item.unit);
        if (perUnit <= 0) continue;

        const itemDiscount = perUnit * item.quantity;
        discount += itemDiscount;
        itemDiscounts[item.id] = (itemDiscounts[item.id] || 0) + itemDiscount;

        if (!itemSchemeDetails[item.id]) itemSchemeDetails[item.id] = [];
        itemSchemeDetails[item.id].push({
          schemeId: scheme.id,
          schemeName: scheme.name,
          schemeType: scheme.scheme_type,
          discountAmount: itemDiscount,
          perUnitDiscount: enteredForLine,
          unit,
          valueType,
          ...(valueType === 'percentage' ? { discountPercentage: enteredForLine } : {}),
        });

        matchedItems.push(item);
      }

      if (matchedItems.length > 0) {
        const firstItem = matchedItems[0];
        const firstId = firstItem.id;
        const firstEntered = perItem[firstId] != null
          ? Math.max(0, Math.min(cap, Number(perItem[firstId]) || 0))
          : fallbackEntered;
        manualMeta = {
          perUnitDiscount: firstEntered,
          unit,
          itemId: firstItem.id,
          productName: matchedItems.length === 1
            ? (firstItem.name || '')
            : `${matchedItems.length} products`,
          valueType,
        };
      }
      break;
    }

    case 'percentage_discount':
    case 'percentage': {
      const hasMultiProduct = scheme.target_product_ids && scheme.target_product_ids.length > 0;
      
      if (!scheme.product_id && !hasMultiProduct) {
        // Order-wide percentage discount
        const discountPct = scheme.discount_percentage || 0;
        if (scheme.min_order_value && subtotal < scheme.min_order_value) {
          break;
        }
        discount = subtotal * (discountPct / 100);
      } else {
        // Product-specific or multi-product percentage discount
        for (const item of applicableItems) {
          if (isQuantityConditionMet(scheme, item.quantity)) {
            // Use per-product discount if available
            const discountPct = getProductDiscountPercentage(scheme, item.product_id || item.id);
            const itemTotal = item.rate * item.quantity;
            const itemDiscount = itemTotal * (discountPct / 100);
            discount += itemDiscount;
            itemDiscounts[item.id] = (itemDiscounts[item.id] || 0) + itemDiscount;
            
            // Track scheme details per item
            if (!itemSchemeDetails[item.id]) itemSchemeDetails[item.id] = [];
            itemSchemeDetails[item.id].push({
              schemeId: scheme.id,
              schemeName: scheme.name,
              schemeType: scheme.scheme_type,
              discountAmount: itemDiscount,
              discountPercentage: discountPct
            });
          }
        }
      }
      break;
    }
    
    case 'flat_discount':
    case 'flat': {
      const discountAmt = scheme.discount_amount || 0;
      const hasMultiProduct = scheme.target_product_ids && scheme.target_product_ids.length > 0;
      
      if (!scheme.product_id && !hasMultiProduct) {
        // Order-wide flat discount (only when no product restrictions)
        if (scheme.min_order_value && subtotal < scheme.min_order_value) {
          break;
        }
        discount = Math.min(discountAmt, subtotal);
      } else {
        // Product-specific or multi-product flat discount
        // Check if total quantity of applicable items meets condition
        const totalApplicableQty = applicableItems.reduce((sum, item) => sum + item.quantity, 0);
        if (isQuantityConditionMet(scheme, totalApplicableQty)) {
          // Apply flat discount once (not per item) when condition is met
          const applicableTotal = applicableItems.reduce((sum, item) => sum + (item.rate * item.quantity), 0);
          discount = Math.min(discountAmt, applicableTotal);
          
          // Distribute discount proportionally across applicable items for tracking
          if (applicableTotal > 0) {
            for (const item of applicableItems) {
              const itemTotal = item.rate * item.quantity;
              const itemProportion = itemTotal / applicableTotal;
              const itemDiscount = discount * itemProportion;
              itemDiscounts[item.id] = (itemDiscounts[item.id] || 0) + itemDiscount;
              
              // Track scheme details per item
              if (!itemSchemeDetails[item.id]) itemSchemeDetails[item.id] = [];
              itemSchemeDetails[item.id].push({
                schemeId: scheme.id,
                schemeName: scheme.name,
                schemeType: scheme.scheme_type,
                discountAmount: itemDiscount
              });
            }
          }
        }
      }
      break;
    }
    
    case 'buy_x_get_y_free':
    case 'buy_get_free': {
      const buyQty = scheme.buy_quantity || 0;
      const freeQty = scheme.free_quantity || 0;
      const freeUnit = scheme.free_quantity_unit || 'kg';
      
      if (buyQty <= 0 || freeQty <= 0) break;

      const isUserChoice = scheme.free_product_selection_mode === 'user_choice';

      // Check if ANY applicable item meets the buy quantity threshold
      let thresholdMet = false;
      for (const item of applicableItems) {
        if (item.quantity >= buyQty) {
          thresholdMet = true;

          // THRESHOLD-BASED: Get free quantity ONCE when threshold is met (not per set)
          const freeItemsCount = freeQty;

          let freeProductName: string;
          let freeProductId: string | undefined;
          let otherFreeProductId: string | undefined;

          if (isUserChoice) {
            // Many-to-many pool: FreeProductChoiceDialog records the order-entry
            // user's pick before this scheme ever reaches appliedSchemeIds. If no
            // choice is recorded yet, don't guess — grant nothing.
            if (!manualSelection?.chosenFreeProductId) break;
            freeProductName = manualSelection.chosenFreeProductName || 'Free Item';
            freeProductId = manualSelection.chosenFreeProductSource === 'catalogue' ? manualSelection.chosenFreeProductId : undefined;
            otherFreeProductId = manualSelection.chosenFreeProductSource === 'other' ? manualSelection.chosenFreeProductId : undefined;
          } else {
            // Use scheme's FREE product details — either a catalogue product or an
            // "other" free product maintained specifically for schemes (no products row)
            const isOtherFreeProduct = scheme.free_product_source === 'other';
            freeProductName = (isOtherFreeProduct ? scheme.other_free_product_name : scheme.free_product_name) || 'Free Item';
            freeProductId = isOtherFreeProduct ? undefined : (scheme.free_product_id || undefined);
            otherFreeProductId = isOtherFreeProduct ? (scheme.other_free_product_id || undefined) : undefined;
          }

          // Track scheme details per item
          if (!itemSchemeDetails[item.id]) itemSchemeDetails[item.id] = [];
          itemSchemeDetails[item.id].push({
            schemeId: scheme.id,
            schemeName: scheme.name,
            schemeType: scheme.scheme_type,
            discountAmount: 0,
            freeItemName: freeProductName,
            freeItemQty: freeItemsCount
          });
          
          // Track free items with correct unit from scheme and triggering item ID
          freeItems = freeItems || [];
          freeItems.push({
            product_name: freeProductName,
            quantity: freeItemsCount,
            product_id: freeProductId,
            other_free_product_id: otherFreeProductId,
            original_rate: 0,
            unit: freeUnit,
            triggering_item_id: item.id
          });
          
          break; // Only apply once per order when threshold is met
        }
      }
      break;
    }
    
    case 'bundle_discount':
    case 'bundle': {
      // Bundle discount applies when all specified conditions are met
      const totalQty = applicableItems.reduce((sum, item) => sum + item.quantity, 0);
      if (isQuantityConditionMet(scheme, totalQty)) {
        const discountPct = scheme.discount_percentage || 0;
        const bundleTotal = applicableItems.reduce((sum, item) => sum + (item.rate * item.quantity), 0);
        discount = bundleTotal * (discountPct / 100);

        // Distribute discount proportionally for tracking
        if (bundleTotal > 0) {
          for (const item of applicableItems) {
            const itemTotal = item.rate * item.quantity;
            const itemProportion = itemTotal / bundleTotal;
            const itemDiscount = discount * itemProportion;
            itemDiscounts[item.id] = (itemDiscounts[item.id] || 0) + itemDiscount;

            if (!itemSchemeDetails[item.id]) itemSchemeDetails[item.id] = [];
            itemSchemeDetails[item.id].push({
              schemeId: scheme.id,
              schemeName: scheme.name,
              schemeType: scheme.scheme_type,
              discountAmount: itemDiscount,
              discountPercentage: discountPct
            });
          }
        }
      }
      break;
    }

    case 'bundle_combo': {
      // Re-check every bundle product is present, the same way flat_discount
      // above re-checks min_order_value rather than only trusting the
      // caller's isSchemeConditionMet gate. calculateOrderWithSchemes applies
      // whatever is in appliedSchemeIds directly, without re-verifying
      // eligibility itself — so a scheme applied while eligible must still
      // stop discounting the moment a required product is removed from the
      // cart, on every recompute, not just at the moment Apply was clicked.
      const bundleProductIds = scheme.bundle_product_ids || [];
      const itemProductIds = new Set(items.map(i => i.product_id || i.id));
      const hasAllBundleProducts = bundleProductIds.length > 0 && bundleProductIds.every(id => itemProductIds.has(id));
      if (!hasAllBundleProducts) break;

      // applicableItems is already scoped to just the bundle's own products
      // by schemeAppliesToItem, so the discount is computed once across the
      // bundle, not per product.
      const bundleTotal = applicableItems.reduce((sum, item) => sum + (item.rate * item.quantity), 0);
      const discountPct = scheme.bundle_discount_percentage || 0;
      const discountAmt = scheme.bundle_discount_amount || 0;

      if (discountPct > 0) {
        discount = bundleTotal * (discountPct / 100);
      } else if (discountAmt > 0) {
        discount = Math.min(discountAmt, bundleTotal);
      }

      // Distribute the discount proportionally across the bundle's items for
      // per-line tracking, same convention as flat/bundle_discount above.
      if (discount > 0 && bundleTotal > 0) {
        for (const item of applicableItems) {
          const itemTotal = item.rate * item.quantity;
          const itemProportion = itemTotal / bundleTotal;
          const itemDiscount = discount * itemProportion;
          itemDiscounts[item.id] = (itemDiscounts[item.id] || 0) + itemDiscount;

          if (!itemSchemeDetails[item.id]) itemSchemeDetails[item.id] = [];
          itemSchemeDetails[item.id].push({
            schemeId: scheme.id,
            schemeName: scheme.name,
            schemeType: scheme.scheme_type,
            discountAmount: itemDiscount,
            discountPercentage: discountPct > 0 ? discountPct : undefined,
          });
        }
      }
      break;
    }

    case 'category_wide_discount': {
      // Discount applies only to items in scheme.category_id — applicableItems
      // is already filtered to that category by schemeAppliesToItem above.
      // min_order_value is checked against the full order subtotal (it's an
      // order-level condition, matching how it's presented in the admin UI),
      // but the discount itself is computed only on the matching category's total.
      if (scheme.min_order_value && subtotal < scheme.min_order_value) {
        break;
      }
      const categoryTotal = applicableItems.reduce((sum, item) => sum + (item.rate * item.quantity), 0);
      if (categoryTotal > 0) {
        const discountPct = scheme.discount_percentage || 0;
        discount = scheme.discount_amount
          ? Math.min(scheme.discount_amount, categoryTotal)
          : categoryTotal * (discountPct / 100);

        if (discount > 0) {
          for (const item of applicableItems) {
            const itemTotal = item.rate * item.quantity;
            const itemProportion = itemTotal / categoryTotal;
            const itemDiscount = discount * itemProportion;
            itemDiscounts[item.id] = (itemDiscounts[item.id] || 0) + itemDiscount;

            if (!itemSchemeDetails[item.id]) itemSchemeDetails[item.id] = [];
            itemSchemeDetails[item.id].push({
              schemeId: scheme.id,
              schemeName: scheme.name,
              schemeType: scheme.scheme_type,
              discountAmount: itemDiscount,
              discountPercentage: discountPct > 0 ? discountPct : undefined
            });
          }
        }
      }
      break;
    }

    case 'tiered_discount':
    case 'tiered': {
      // Tiered discount based on quantity thresholds
      for (const item of applicableItems) {
        if (isQuantityConditionMet(scheme, item.quantity)) {
          const discountPct = scheme.discount_percentage || 0;
          const itemTotal = item.rate * item.quantity;
          const itemDiscount = itemTotal * (discountPct / 100);
          discount += itemDiscount;
          itemDiscounts[item.id] = (itemDiscounts[item.id] || 0) + itemDiscount;
          
          // Track scheme details per item
          if (!itemSchemeDetails[item.id]) itemSchemeDetails[item.id] = [];
          itemSchemeDetails[item.id].push({
            schemeId: scheme.id,
            schemeName: scheme.name,
            schemeType: scheme.scheme_type,
            discountAmount: itemDiscount,
            discountPercentage: discountPct
          });
        }
      }
      break;
    }
    
    default:
      // Default to percentage if type is unknown
      if (scheme.discount_percentage) {
        const discountPct = scheme.discount_percentage;
        if (!scheme.product_id) {
          discount = subtotal * (discountPct / 100);
        } else {
          for (const item of applicableItems) {
            if (isQuantityConditionMet(scheme, item.quantity)) {
              const itemTotal = item.rate * item.quantity;
              const itemDiscount = itemTotal * (discountPct / 100);
              discount += itemDiscount;
              itemDiscounts[item.id] = (itemDiscounts[item.id] || 0) + itemDiscount;
              
              // Track scheme details per item
              if (!itemSchemeDetails[item.id]) itemSchemeDetails[item.id] = [];
              itemSchemeDetails[item.id].push({
                schemeId: scheme.id,
                schemeName: scheme.name,
                schemeType: scheme.scheme_type,
                discountAmount: itemDiscount,
                discountPercentage: discountPct
              });
            }
          }
        }
      }
      break;
  }

  return { discount, itemDiscounts, itemSchemeDetails, freeItems, manualMeta };
}

/**
 * Main function: Calculate order total with all applicable schemes
 */
export function calculateOrderWithSchemes(
  items: SchemeItem[],
  allSchemes: ProductScheme[],
  appliedSchemeIds: string[] = [],
  manualSelections: Record<string, ManualSchemeSelection> = {}
): SchemeCalculationResult {
  // Calculate subtotal
  const subtotal = items.reduce((sum, item) => sum + (item.rate * item.quantity), 0);
  
  // Get active schemes
  const activeSchemes = getActiveSchemes(allSchemes);
  
  // Only apply schemes explicitly selected (including auto-applied ones)
  const schemesToApply = activeSchemes.filter(s => appliedSchemeIds.includes(s.id));

  let totalDiscount = 0;
  const appliedSchemes: AppliedScheme[] = [];
  const itemDiscounts: Record<string, number> = {};
  const itemSchemeDetails: Record<string, ItemSchemeDetail[]> = {};
  
  for (const scheme of schemesToApply) {
    const {
      discount,
      itemDiscounts: schemeItemDiscounts,
      itemSchemeDetails: schemeItemDetails,
      freeItems,
      manualMeta
    } = calculateSchemeDiscount(scheme, items, subtotal, manualSelections[scheme.id]);

    const hasFreeItems = !!(freeItems && freeItems.length > 0);

    // Apply scheme if it yields a monetary discount OR it yields free items (BOGO)
    if (discount > 0 || hasFreeItems) {
      if (discount > 0) {
        totalDiscount += discount;

        // Merge item discounts
        for (const [itemId, discountAmt] of Object.entries(schemeItemDiscounts)) {
          itemDiscounts[itemId] = (itemDiscounts[itemId] || 0) + discountAmt;
        }
      }

      // Merge item scheme details (also for BOGO where discount can be 0)
      for (const [itemId, details] of Object.entries(schemeItemDetails)) {
        if (!itemSchemeDetails[itemId]) itemSchemeDetails[itemId] = [];
        itemSchemeDetails[itemId].push(...details);
      }

      appliedSchemes.push({
        id: scheme.id,
        name: scheme.name,
        scheme_type: scheme.scheme_type,
        discount_amount: discount,
        discount_percentage: scheme.discount_percentage || undefined,
        product_id: scheme.product_id,
        free_items: freeItems,
        per_unit_discount: manualMeta?.perUnitDiscount,
        unit: manualMeta?.unit,
        applied_to_item_id: manualMeta?.itemId,
        applied_to_product_name: manualMeta?.productName,
        value_type: manualMeta?.valueType,
      });
    }
  }
  
  // Ensure discount doesn't exceed subtotal
  totalDiscount = Math.min(totalDiscount, subtotal);
  
  return {
    subtotal,
    totalDiscount,
    finalTotal: subtotal - totalDiscount,
    appliedSchemes,
    itemDiscounts,
    itemSchemeDetails
  };
}

/**
 * Get applicable schemes for given items (schemes that could apply based on products)
 */
export function getApplicableSchemes(
  items: SchemeItem[],
  allSchemes: ProductScheme[]
): ProductScheme[] {
  const activeSchemes = getActiveSchemes(allSchemes);
  
  return activeSchemes.filter(scheme => {
    // Check multi-product array first
    if (scheme.target_product_ids && scheme.target_product_ids.length > 0) {
      return items.some(item => 
        scheme.target_product_ids!.includes(item.product_id || item.id)
      );
    }
    
    // Order-wide schemes are always applicable
    if (!scheme.product_id) return true;
    
    // Check if any item matches the scheme's product
    return items.some(item => schemeAppliesToItem(scheme, item));
  });
}

/**
 * Format scheme details for invoice display
 */
export function formatSchemeDetailsForInvoice(appliedSchemes: AppliedScheme[]): string {
  if (appliedSchemes.length === 0) return '';
  
  return appliedSchemes.map(scheme => {
    let detail = `✓ ${scheme.name}`;
    
    if (scheme.discount_percentage) {
      detail += ` (${scheme.discount_percentage}% off)`;
    }
    if (scheme.scheme_type === 'manual_per_unit_discount' && scheme.per_unit_discount) {
      if (scheme.value_type === 'percentage') {
        detail += ` (${scheme.per_unit_discount}% off /${scheme.unit || 'unit'}`;
      } else {
        detail += ` (₹${scheme.per_unit_discount}/${scheme.unit || 'unit'}`;
      }
      if (scheme.applied_to_product_name) {
        detail += ` on ${scheme.applied_to_product_name}`;
      }
      detail += `)`;
    }
    
    detail += ` - Saved ₹${scheme.discount_amount.toFixed(2)}`;
    
    if (scheme.free_items && scheme.free_items.length > 0) {
      const freeDesc = scheme.free_items
        .map(f => `${f.quantity}x ${f.product_name}`)
        .join(', ');
      detail += ` + FREE: ${freeDesc}`;
    }
    
    return detail;
  }).join('\n');
}

/**
 * Calculate potential discount for a scheme (for comparison purposes)
 * Used by policy logic to determine the "best" scheme
 * Returns discount amount for monetary schemes, or a positive value for BOGO schemes
 */
export function calculateSchemeDiscountForComparison(
  scheme: ProductScheme, 
  items: SchemeItem[], 
  subtotal: number
): number {
  // Build a temporary calculation to get the discount value
  const activeSchemes = [scheme].filter(s => isSchemeActive(s));
  if (activeSchemes.length === 0) return 0;
  
  // Check if conditions are met
  if (!isSchemeConditionMet(scheme, items, subtotal)) return 0;
  
  // Calculate using the main function with just this one scheme
  const result = calculateOrderWithSchemes(items, [scheme], [scheme.id]);
  
  // For BOGO schemes, return a positive value if they yield free items
  // This ensures BOGO schemes are included in auto-apply logic
  const hasFreeItems = result.appliedSchemes.some(s => s.free_items && s.free_items.length > 0);
  if (hasFreeItems && result.totalDiscount === 0) {
    // Return a nominal positive value to indicate scheme is valid for auto-apply
    // Use the estimated value of free items (quantity * average rate) if available
    const freeItemsValue = result.appliedSchemes
      .filter(s => s.free_items && s.free_items.length > 0)
      .flatMap(s => s.free_items!)
      .reduce((sum, f) => sum + f.quantity, 0);
    return freeItemsValue > 0 ? freeItemsValue : 0.01; // Return free item count as "value" indicator
  }
  
  return result.totalDiscount;
}
