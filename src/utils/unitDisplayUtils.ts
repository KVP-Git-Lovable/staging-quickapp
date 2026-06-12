/**
 * LEGACY DISPLAY-ONLY shim — DO NOT USE IN ORDER ENTRY OR PRICING PATHS.
 *
 * Order Entry is strictly mapping-driven via product_uom_mapping (see
 * `src/components/order-entry/UnitControls.tsx` and `useUnitPrice`). Products
 * without a UOM mapping must surface an explicit "No unit set" error rather
 * than silently fall back to the kg<->g / l<->ml conversion below.
 *
 * This file is kept only for historical free-text display surfaces (VisitCard,
 * distributor portal inventory/packing/secondary-sales) where order-entry
 * mappings aren't available at render time.
 */
export const getDisplayValues = (qty: number, rate: number, originalRate: number, unit: string) => {
  const unitLower = (unit || '').toLowerCase().trim();
  const displayRateBase = originalRate || rate;
  if (unitLower === 'grams' || unitLower === 'g' || unitLower === 'gram') {
    return { displayQty: qty / 1000, displayUnit: 'KG', displayRate: displayRateBase * 1000 };
  }
  return { displayQty: qty, displayUnit: unit, displayRate: displayRateBase };
};

/**
 * Format a display quantity: integers shown as-is, decimals trimmed of trailing zeros.
 */
export const formatDisplayQty = (qty: number): string => {
  return Number.isInteger(qty) ? qty.toString() : qty.toFixed(2).replace(/\.?0+$/, '');
};
