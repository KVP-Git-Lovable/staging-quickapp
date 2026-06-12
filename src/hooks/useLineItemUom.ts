import { useMemo } from 'react';
import { useProductUnits } from '@/hooks/useProductUnits';
import type { ProductUnit } from '@/lib/uomEngine';

export type UomContext = 'sales' | 'purchase' | 'packing';

export interface UseLineItemUomResult {
  loading: boolean;
  activeUnits: ProductUnit[];
  baseUnit: ProductUnit | null;
  defaultUnit: ProductUnit | null;
  priceBasisUnit: ProductUnit | null;
  isSingleUom: boolean;
}

/**
 * Returns active UOMs and the contextual default for a product line item.
 *
 * - `packing`: defaults to the BASE unit (inventory deductions stay base-only).
 * - `sales`: defaults to the product's `is_default_sales` UOM, falling back to base.
 * - `purchase`: defaults to base.
 *
 * `isSingleUom` is true when the product has only one active UOM —
 * callers should hide selectors in that case.
 */
export function useLineItemUom(
  productId: string | null | undefined,
  context: UomContext = 'packing',
): UseLineItemUomResult {
  const { data, isLoading } = useProductUnits(productId);

  return useMemo(() => {
    const activeUnits = (data || []).filter((u) => u);
    const baseUnit = activeUnits.find((u) => u.isBase) ?? null;
    const priceBasisUnit = activeUnits.find((u) => u.isPriceBasis) ?? activeUnits.find((u) => u.isDefaultSales) ?? baseUnit;
    let defaultUnit: ProductUnit | null = baseUnit;
    if (context === 'sales') {
      defaultUnit = activeUnits.find((u) => u.isDefaultSales) ?? baseUnit;
    }
    return {
      loading: isLoading,
      activeUnits,
      baseUnit,
      defaultUnit,
      priceBasisUnit,
      isSingleUom: activeUnits.length <= 1,
    };
  }, [data, isLoading, context]);
}
