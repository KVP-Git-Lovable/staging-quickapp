/**
 * Persistence helpers between the ProductUnitsEditor state and
 * `product_uom_mapping`. Keeps reconciliation logic out of the giant
 * ProductManagement.tsx component.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  loadEnabledUnits,
  deriveProductMappings,
  clearUomCache,
  clearPriceListCache,
  type DerivedRow,
} from './uomEngine';
import type {
  ProductUnitsEditorValue,
  UnitRow,
} from '@/components/admin/uom/ProductUnitsEditor';

export interface ReconcileResult {
  derived: DerivedRow[];
  deactivated: number;
}

/**
 * Persist the editor's state to product_uom_mapping.
 * - Soft-deactivates rows whose uom is no longer in the derived set.
 * - Upserts every derived row (unique key: product_id + uom_id).
 */
export async function reconcileProductUomMapping(
  productId: string,
  value: ProductUnitsEditorValue,
): Promise<ReconcileResult> {
  if (!productId) throw new Error('productId is required');

  // Need the base-category units (KG/GRAM, LITRE/ML, PIECE) to feed the engine.
  const baseCategoryUnits = await loadEnabledUnits(value.baseCategory);

  const derived = deriveProductMappings({
    category: value.baseCategory,
    netWeightG: value.netWeightG,
    netVolumeMl: value.netVolumeMl,
    packagingRows: value.rows.map((r) => ({
      uomId: r.uomId,
      code: r.code,
      name: r.name,
      qtyPerPiece: r.qtyPerPiece,
      isDefaultSales: r.isDefaultSales,
      isPriceBasis: r.isPriceBasis,
      isDefaultPurchase: r.isDefaultPurchase,
    })),
    baseCategoryUnits: baseCategoryUnits.map((u) => ({
      uomId: u.uomId,
      code: u.code,
      name: u.name,
    })),
    priceBasisCode: value.priceBasisCode ?? null,
    defaultSalesCode: value.defaultSalesCode ?? null,
    defaultPurchaseCode: value.defaultPurchaseCode ?? null,
  });

  // Soft-deactivate stale rows (preserve them for historical order lines).
  const keepIds = new Set(derived.map((r) => r.uomId));
  const { data: existing } = await supabase
    .from('product_uom_mapping')
    .select('id, uom_id')
    .eq('product_id', productId);

  const staleIds = (existing ?? [])
    .filter((r: any) => !keepIds.has(r.uom_id))
    .map((r: any) => r.id);

  let deactivated = 0;
  if (staleIds.length > 0) {
    const { error: deactErr } = await supabase
      .from('product_uom_mapping')
      .update({ is_active: false })
      .in('id', staleIds);
    if (deactErr) throw deactErr;
    deactivated = staleIds.length;
  }

  // Upsert each derived row. Unique key (product_id, uom_id) lets us merge.
  const payload = derived.map((r) => ({
    product_id: productId,
    uom_id: r.uomId,
    conversion_to_base: r.conversionToBase,
    is_base: r.isBase,
    is_default_sales: r.isDefaultSales,
    is_price_basis: r.isPriceBasis,
    is_default_purchase: r.isDefaultPurchase,
    is_active: true,
  }));

  const { error: upsertErr } = await supabase
    .from('product_uom_mapping')
    .upsert(payload, { onConflict: 'product_id,uom_id' });
  if (upsertErr) throw upsertErr;

  // Bust caches so the rest of the app picks up the change immediately.
  clearUomCache(productId);
  clearPriceListCache(productId);

  return { derived, deactivated };
}

/**
 * Hydrate the ProductUnitsEditor value from an existing product's
 * product_uom_mapping rows. Returns null when the product has no mappings yet
 * (caller should seed with emptyProductUnitsEditorValue() instead).
 *
 * netWeightG / netVolumeMl can't always be recovered exactly from the
 * persisted conversion factors — we make a best-effort guess by reading the
 * first non-base packaging row (smallest conversionToBase > 1). The user can
 * adjust before saving.
 */
export async function hydrateUnitsEditorFromProduct(
  productId: string,
): Promise<ProductUnitsEditorValue | null> {
  if (!productId) return null;

  const { data, error } = await supabase
    .from('product_uom_mapping')
    .select(
      'uom_id, conversion_to_base, is_base, is_default_sales, is_price_basis, is_default_purchase, is_active, uom_master:uom_id(code, name, category)',
    )
    .eq('product_id', productId)
    .eq('is_active', true);

  if (error) throw error;
  if (!data || data.length === 0) return null;

  const baseRow = data.find((r: any) => r.is_base) ?? data[0];
  const baseCategory = (baseRow as any).uom_master?.category ?? 'Quantity';
  const baseCode = (baseRow as any).uom_master?.code?.toUpperCase?.() ?? '';

  // Sibling rows: same category as base, not the base itself, with the
  // canonical kg/litre conversion factor → these are auto-injected by the
  // engine and must not appear as packaging rows in Step 2.
  const isSibling = (r: any) => {
    if (r.is_base) return true;
    const code = r.uom_master?.code?.toUpperCase?.() ?? '';
    if (baseCode === 'GRAM' && code === 'KG') return true;
    if (baseCode === 'ML' && code === 'LITRE') return true;
    return false;
  };

  const packagingRaw = data.filter((r: any) => !isSibling(r));

  // Best-effort: derive physical size from the smallest packaging row's conv.
  // For Weight: conv = qtyPerPiece * netWeightG. If qtyPerPiece was 1 we get
  // netWeightG = conv. We can't disambiguate so prefer rows whose conv matches
  // the canonical "1 piece = X grams" assumption.
  let physicalSize: number | null = null;
  if (baseCategory === 'Weight' || baseCategory === 'Volume') {
    // Find the row tagged as price-basis or default-sales first; assume qty=1.
    const anchor =
      packagingRaw.find((r: any) => r.is_price_basis) ??
      packagingRaw.find((r: any) => r.is_default_sales) ??
      packagingRaw[0];
    if (anchor) physicalSize = Number(anchor.conversion_to_base) || null;
  }

  const rows: UnitRow[] = packagingRaw.map((r: any) => {
    const conv = Number(r.conversion_to_base) || 0;
    const qtyPerPiece =
      baseCategory === 'Quantity'
        ? conv
        : physicalSize && physicalSize > 0
          ? conv / physicalSize
          : 1;
    return {
      uomId: r.uom_id,
      code: r.uom_master?.code ?? '',
      name: r.uom_master?.name ?? '',
      category: r.uom_master?.category ?? baseCategory,
      qtyPerPiece,
      conversionToBase: conv,
      isBase: !!r.is_base,
      isDefaultSales: !!r.is_default_sales,
      isPriceBasis: !!r.is_price_basis,
      isDefaultPurchase: !!r.is_default_purchase,
    };
  });

  const codeOf = (pred: (r: any) => boolean): string | null => {
    const hit = data.find(pred);
    return (hit as any)?.uom_master?.code ?? null;
  };

  return {
    baseCategory,
    netWeightG: baseCategory === 'Weight' ? physicalSize : null,
    netVolumeMl: baseCategory === 'Volume' ? physicalSize : null,
    rows,
    priceOverrides: [],
    priceBasisCode: codeOf((r: any) => r.is_price_basis),
    defaultSalesCode: codeOf((r: any) => r.is_default_sales),
    defaultPurchaseCode: codeOf((r: any) => r.is_default_purchase),
  };
}
