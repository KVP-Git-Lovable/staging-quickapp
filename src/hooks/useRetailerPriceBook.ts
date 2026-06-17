import { useQuery } from '@tanstack/react-query';
import { supabase as defaultClient } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

export const useRetailerPriceBook = (
  distributorId: string | null | undefined,
  client?: SupabaseClient<any>
) => {
  const sb = (client ?? defaultClient) as SupabaseClient<any>;
  return useQuery({
    queryKey: ['retailer-price-book', distributorId],
    queryFn: async () => {
      let priceBookId: string | null = null;

      if (distributorId) {
        const { data: dpb } = await sb
          .from('distributor_price_books')
          .select('price_book_id')
          .eq('distributor_id', distributorId)
          .maybeSingle();
        priceBookId = (dpb as any)?.price_book_id ?? null;
      }

      if (!priceBookId) {
        const { data: stdPb } = await sb
          .from('price_books')
          .select('id')
          .eq('is_standard', true)
          .eq('is_active', true)
          .maybeSingle();
        priceBookId = (stdPb as any)?.id ?? null;
      }

      return priceBookId;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const usePriceBookEntries = (
  priceBookId: string | null | undefined,
  productIds?: string[],
  client?: SupabaseClient<any>
) => {
  const sb = (client ?? defaultClient) as SupabaseClient<any>;
  const fingerprint = productIds?.length ?? 0;
  return useQuery({
    queryKey: ['price-book-entries', priceBookId, fingerprint],
    queryFn: async () => {
      if (!priceBookId) return {};
      let query = sb
        .from('price_book_entries')
        .select('product_id, final_price')
        .eq('price_book_id', priceBookId)
        .eq('is_active', true);

      if (productIds && productIds.length > 0) {
        query = query.in('product_id', productIds);
      }

      const { data } = await query;
      const map: Record<string, number> = {};
      if (data) {
        for (const e of data as any[]) map[e.product_id] = e.final_price;
      }
      return map;
    },
    enabled: !!priceBookId,
    staleTime: 5 * 60 * 1000,
  });
};
