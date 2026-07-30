import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle } from 'lucide-react';

export interface PriceBookWarningInput {
  id: string;
  currency: string | null;
  target_type: string | null;
  is_standard: boolean | null;
  effective_to: string | null;
  is_active?: boolean | null;
}

/** Non-blocking configuration warnings for a price book. */
export function usePriceBookWarnings(book?: PriceBookWarningInput | null) {
  return useQuery<string[]>({
    queryKey: [
      'price-book-warnings',
      book?.id,
      book?.currency,
      book?.target_type,
      book?.is_standard,
      book?.effective_to,
    ],
    enabled: !!book?.id,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const b = book as PriceBookWarningInput;
      const warnings: string[] = [];

      // a) only book for this currency + target_type, but not marked standard
      if (!b.is_standard) {
        const { count } = await supabase
          .from('price_books')
          .select('id', { count: 'exact', head: true })
          .eq('currency', b.currency ?? '')
          .eq('target_type', b.target_type ?? '')
          .eq('is_active', true);
        if ((count ?? 0) <= 1) {
          warnings.push(
            "Not marked standard: this book will rank below any standard book. Tick 'Is standard' if it is the default for this currency."
          );
        }
      }

      // b) expired
      if (b.effective_to) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (new Date(b.effective_to) < today) {
          warnings.push('Expired: this book is not being applied to any order.');
        }
      }

      // c) entries with no price
      const { count: zeroCount } = await supabase
        .from('price_book_entries')
        .select('id', { count: 'exact', head: true })
        .eq('price_book_id', b.id)
        .eq('final_price', 0);
      if ((zeroCount ?? 0) > 0) {
        warnings.push(
          `${zeroCount} product${zeroCount === 1 ? ' has' : 's have'} no price set and will fall through to the next price book or the product default.`
        );
      }

      return warnings;
    },
  });
}

export function PriceBookWarnings({
  book,
  className,
}: {
  book?: PriceBookWarningInput | null;
  className?: string;
}) {
  const { data: warnings } = usePriceBookWarnings(book);
  if (!warnings?.length) return null;

  return (
    <div className={className}>
      <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 p-3 space-y-1.5">
        {warnings.map((w) => (
          <div key={w} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{w}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PriceBookWarnings;
