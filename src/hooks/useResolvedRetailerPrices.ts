import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase as defaultClient } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ResolvedPriceRow {
  product_id: string;
  variant_id: string | null;
  min_quantity: number;
  price: number;
  currency: string;
  price_book_id: string | null;
  price_book_name: string | null;
  matched_on: string | null;
  score: number | null;
}

/**
 * Pick the winning price row for a line.
 * - candidates: same product AND (same variant OR product-level row) AND min_quantity <= qty
 * - prefer variant-specific over product-level, then the HIGHEST min_quantity
 */
export function pickResolvedPrice(
  rows: ResolvedPriceRow[] | undefined,
  productId: string | null | undefined,
  variantId: string | null | undefined,
  quantity: number,
): ResolvedPriceRow | null {
  if (!rows?.length || !productId) return null;
  const qty = Number(quantity) > 0 ? Number(quantity) : 1;

  let best: ResolvedPriceRow | null = null;
  for (const r of rows) {
    if (r.product_id !== productId) continue;
    const variantMatch = variantId ? r.variant_id === variantId : false;
    if (!variantMatch && r.variant_id !== null) continue;
    if (Number(r.min_quantity ?? 1) > qty) continue;

    if (!best) { best = r; continue; }
    const bestVariantMatch = best.variant_id !== null;
    if (variantMatch !== bestVariantMatch) {
      if (variantMatch) best = r;
      continue;
    }
    if (Number(r.min_quantity ?? 1) > Number(best.min_quantity ?? 1)) best = r;
  }
  return best;
}

/** All price-book prices resolved by the database for one retailer. */
export const useResolvedRetailerPrices = (
  retailerId: string | null | undefined,
  client?: SupabaseClient<any>,
) => {
  const sb = (client ?? defaultClient) as SupabaseClient<any>;

  const query = useQuery({
    queryKey: ['resolved-retailer-prices', retailerId],
    queryFn: async (): Promise<ResolvedPriceRow[]> => {
      if (!retailerId) return [];
      // Same owner_id -> user_id fallback CustomerCart.tsx already uses to find
      // "the assigned rep" for this retailer -- without it, a salesperson-level
      // price book (score 90) could never win from this portal.
      const { data: retailerRow } = await sb
        .from('retailers')
        .select('owner_id, user_id')
        .eq('id', retailerId)
        .maybeSingle();
      const assignedUserId = retailerRow?.owner_id || retailerRow?.user_id || null;
      const { data, error } = await sb.rpc('resolve_prices_for_retailer' as any, {
        p_retailer_id: retailerId,
        p_user_id: assignedUserId,
      });
      if (error) throw error;
      return ((data as any[]) || []).map((r) => ({
        product_id: r.product_id,
        variant_id: r.variant_id ?? null,
        min_quantity: Number(r.min_quantity) || 1,
        price: Number(r.price) || 0,
        currency: r.currency || 'INR',
        price_book_id: r.price_book_id ?? null,
        price_book_name: r.price_book_name ?? null,
        matched_on: r.matched_on ?? null,
        score: r.score ?? null,
      }));
    },
    enabled: !!retailerId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const rows = query.data;

  const resolve = useCallback(
    (productId: string | null | undefined, variantId: string | null | undefined, quantity: number) =>
      pickResolvedPrice(rows, productId, variantId, quantity),
    [rows],
  );

  const priceBookName = useMemo(() => rows?.[0]?.price_book_name ?? null, [rows]);
  const currency = useMemo(() => rows?.[0]?.currency ?? null, [rows]);

  return { ...query, rows: rows ?? [], resolve, priceBookName, currency };
};
