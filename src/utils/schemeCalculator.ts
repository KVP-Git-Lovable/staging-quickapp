interface SchemeCalculationResult {
  discountAmount: number;
  finalPrice: number;
  freeItems: Array<{
    productId?: string;
    productName: string;
    quantity: number;
  }>;
  appliedScheme?: any;
}

interface OrderItem {
  productId: string;
  quantity: number;
  basePrice: number;
  categoryId?: string;
  schemes?: any[];
}

interface UserOrderHistory {
  hasOrderedBefore: boolean;
}

export const calculateSchemeDiscount = (
  items: OrderItem[],
  allSchemes: any[],
  userOrderHistory?: UserOrderHistory
): SchemeCalculationResult => {
  let totalDiscountAmount = 0;
  let finalPrice = 0;
  const freeItems: Array<{ productId?: string; productName: string; quantity: number }> = [];
  let appliedScheme: any = null;

  // Calculate base total
  const baseTotal = items.reduce((sum, item) => sum + (item.basePrice * item.quantity), 0);
  finalPrice = baseTotal;

  // Sort schemes by discount value (highest first) to apply the best discount
  const applicableSchemes = allSchemes
    .filter(scheme => scheme.is_active && isSchemeValid(scheme))
    .sort((a, b) => getSchemeDiscountValue(b, items, baseTotal) - getSchemeDiscountValue(a, items, baseTotal));

  for (const scheme of applicableSchemes) {
    const result = applyScheme(scheme, items, baseTotal, userOrderHistory);
    
    if (result.discountAmount > totalDiscountAmount) {
      totalDiscountAmount = result.discountAmount;
      finalPrice = result.finalPrice;
      freeItems.length = 0; // Clear previous free items
      freeItems.push(...result.freeItems);
      appliedScheme = scheme;
    }
  }

  return {
    discountAmount: totalDiscountAmount,
    finalPrice,
    freeItems,
    appliedScheme
  };
};

const isSchemeValid = (scheme: any): boolean => {
  const now = new Date();
  const startDate = scheme.start_date ? new Date(scheme.start_date) : null;
  const endDate = scheme.end_date ? new Date(scheme.end_date) : null;

  if (startDate && now < startDate) return false;
  if (endDate && now > endDate) return false;

  return true;
};

const getSchemeDiscountValue = (scheme: any, items: OrderItem[], baseTotal: number): number => {
  const result = applyScheme(scheme, items, baseTotal);
  return result.discountAmount;
};

const applyScheme = (
  scheme: any, 
  items: OrderItem[], 
  baseTotal: number,
  userOrderHistory?: UserOrderHistory
): SchemeCalculationResult => {
  
  switch (scheme.scheme_type) {
    case 'percentage_discount':
      return applyPercentageDiscount(scheme, items, baseTotal);
    
    case 'flat_discount':
      return applyFlatDiscount(scheme, items, baseTotal);
    
    case 'buy_x_get_y_free':
      return applyBuyXGetYFree(scheme, items, baseTotal);
    
    case 'bundle_combo':
      return applyBundleCombo(scheme, items, baseTotal);
    
    case 'tiered_discount':
      return applyTieredDiscount(scheme, items, baseTotal);
    
    case 'time_based_offer':
      return applyTimeBasedOffer(scheme, items, baseTotal);
    
    case 'first_order_discount':
      return applyFirstOrderDiscount(scheme, items, baseTotal, userOrderHistory);
    
    case 'category_wide_discount':
      return applyCategoryWideDiscount(scheme, items, baseTotal);
    
    default:
      return { discountAmount: 0, finalPrice: baseTotal, freeItems: [] };
  }
};

const applyPercentageDiscount = (scheme: any, items: OrderItem[], baseTotal: number): SchemeCalculationResult => {
  const eligibleItems = items.filter(item => {
    if (scheme.product_id && item.productId !== scheme.product_id) return false;
    return item.quantity >= (scheme.condition_quantity || 1);
  });

  if (eligibleItems.length === 0) {
    return { discountAmount: 0, finalPrice: baseTotal, freeItems: [] };
  }

  const discountAmount = baseTotal * (scheme.discount_percentage / 100);
  return {
    discountAmount,
    finalPrice: baseTotal - discountAmount,
    freeItems: []
  };
};

const applyFlatDiscount = (scheme: any, items: OrderItem[], baseTotal: number): SchemeCalculationResult => {
  const eligibleItems = items.filter(item => {
    if (scheme.product_id && item.productId !== scheme.product_id) return false;
    return item.quantity >= (scheme.condition_quantity || 1);
  });

  if (eligibleItems.length === 0) {
    return { discountAmount: 0, finalPrice: baseTotal, freeItems: [] };
  }

  const discountAmount = Math.min(scheme.discount_amount, baseTotal);
  return {
    discountAmount,
    finalPrice: baseTotal - discountAmount,
    freeItems: []
  };
};

const applyBuyXGetYFree = (scheme: any, items: OrderItem[], baseTotal: number): SchemeCalculationResult => {
  const eligibleItems = items.filter(item => {
    if (scheme.product_id && item.productId !== scheme.product_id) return false;
    return item.quantity >= (scheme.buy_quantity || 1);
  });

  if (eligibleItems.length === 0) {
    return { discountAmount: 0, finalPrice: baseTotal, freeItems: [] };
  }

  const freeItems = [];
  let totalFreeQty = 0;

  for (const item of eligibleItems) {
    const sets = Math.floor(item.quantity / scheme.buy_quantity);
    const freeQty = sets * scheme.free_quantity;
    totalFreeQty += freeQty;
    
    if (freeQty > 0) {
      if (scheme.free_product_selection_mode === 'user_choice') {
        // Many-to-many pool schemes need the order-entry user's choice, which this
        // legacy calculator has no plumbing for (see schemeEngine.ts, the calculator
        // actually used by Cart.tsx/TableOrderForm.tsx). Grant nothing rather than
        // guessing a product from the pool.
      } else if (scheme.free_product_source === 'other') {
        freeItems.push({
          productId: undefined,
          productName: scheme.other_free_product_name || 'Free Product',
          quantity: freeQty
        });
      } else {
        freeItems.push({
          productId: scheme.free_product_id === 'same' ? item.productId : scheme.free_product_id,
          productName: `Free ${scheme.free_product_id === 'same' ? 'Same Product' : 'Product'}`,
          quantity: freeQty
        });
      }
    }
  }

  return {
    discountAmount: 0,
    finalPrice: baseTotal,
    freeItems
  };
};

const applyBundleCombo = (scheme: any, items: OrderItem[], baseTotal: number): SchemeCalculationResult => {
  const bundleProductIds = scheme.bundle_product_ids || [];
  const itemProductIds = items.map(item => item.productId);
  
  // Check if all bundle products are in the order
  const hasAllBundleProducts = bundleProductIds.every((productId: string) => 
    itemProductIds.includes(productId)
  );

  if (!hasAllBundleProducts) {
    return { discountAmount: 0, finalPrice: baseTotal, freeItems: [] };
  }

  let discountAmount = 0;
  
  if (scheme.bundle_discount_percentage > 0) {
    discountAmount = baseTotal * (scheme.bundle_discount_percentage / 100);
  } else if (scheme.bundle_discount_amount > 0) {
    discountAmount = Math.min(scheme.bundle_discount_amount, baseTotal);
  }

  return {
    discountAmount,
    finalPrice: baseTotal - discountAmount,
    freeItems: []
  };
};

const applyTieredDiscount = (scheme: any, items: OrderItem[], baseTotal: number): SchemeCalculationResult => {
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  
  // Find applicable tier
  const applicableTier = (scheme.tier_data || []).find((tier: any) => 
    totalQuantity >= tier.min_qty && totalQuantity <= tier.max_qty
  );

  if (!applicableTier) {
    return { discountAmount: 0, finalPrice: baseTotal, freeItems: [] };
  }

  const discountAmount = baseTotal * (applicableTier.discount_percentage / 100);
  return {
    discountAmount,
    finalPrice: baseTotal - discountAmount,
    freeItems: []
  };
};

const applyTimeBasedOffer = (scheme: any, items: OrderItem[], baseTotal: number): SchemeCalculationResult => {
  // Time-based offers are essentially percentage discounts with time constraints
  // The time validation is already done in isSchemeValid
  const discountAmount = baseTotal * (scheme.discount_percentage / 100);
  return {
    discountAmount,
    finalPrice: baseTotal - discountAmount,
    freeItems: []
  };
};

const applyFirstOrderDiscount = (
  scheme: any, 
  items: OrderItem[], 
  baseTotal: number,
  userOrderHistory?: UserOrderHistory
): SchemeCalculationResult => {
  
  // Only apply if user hasn't ordered before (for first order only schemes)
  if (scheme.is_first_order_only && userOrderHistory?.hasOrderedBefore) {
    return { discountAmount: 0, finalPrice: baseTotal, freeItems: [] };
  }

  const discountAmount = baseTotal * (scheme.discount_percentage / 100);
  return {
    discountAmount,
    finalPrice: baseTotal - discountAmount,
    freeItems: []
  };
};

const applyCategoryWideDiscount = (scheme: any, items: OrderItem[], baseTotal: number): SchemeCalculationResult => {
  // Check minimum order value
  if (scheme.min_order_value > 0 && baseTotal < scheme.min_order_value) {
    return { discountAmount: 0, finalPrice: baseTotal, freeItems: [] };
  }

  // Filter items by category
  const eligibleItems = items.filter(item => 
    item.categoryId === scheme.category_id
  );

  if (eligibleItems.length === 0) {
    return { discountAmount: 0, finalPrice: baseTotal, freeItems: [] };
  }

  // Calculate discount only on eligible category items
  const eligibleTotal = eligibleItems.reduce((sum, item) => sum + (item.basePrice * item.quantity), 0);
  const discountAmount = eligibleTotal * (scheme.discount_percentage / 100);
  
  return {
    discountAmount,
    finalPrice: baseTotal - discountAmount,
    freeItems: []
  };
};