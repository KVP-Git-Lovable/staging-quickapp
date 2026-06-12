import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useRetailerPriceBook = (distributorId: string | null | undefined) => {
  return useQuery({
    queryKey: ['retailer-price-book', distributorId],
    queryFn: async () => {
      let priceBookId: string | null = null;

      if (distributorId) {
        const { data: dpb } = await supabase
          .from('distributor_price_books')
          .select('price_book_id')
          .eq('distributor_id', distributorId)
          .maybeSingle();
        priceBookId = dpb?.price_book_id ?? null;
      }

      if (!priceBookId) {
        const { data: stdPb } = await supabase
          .from('price_books')
          .select('id')
          .eq('is_standard', true)
          .eq('is_active', true)
          .maybeSingle();
        priceBookId = stdPb?.id ?? null;
      }

      return priceBookId;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const usePriceBookEntries = (priceBookId: string | null | undefined, productIds?: string[]) => {
  // Stable cheap fingerprint — never sort/join thousands of UUIDs on every render.
  // selectedCategory is part of the upstream products query key, so length+priceBookId
  // is a sufficient cache discriminator here.
  const fingerprint = productIds?.length ?? 0;
  return useQuery({
    queryKey: ['price-book-entries', priceBookId, fingerprint],
    queryFn: async () => {
      if (!priceBookId) return {};
      let query = supabase
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
        for (const e of data) map[e.product_id] = e.final_price;
      }
      return map;
    },
    enabled: !!priceBookId,
    staleTime: 5 * 60 * 1000,
  });
};
