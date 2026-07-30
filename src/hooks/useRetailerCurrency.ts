import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
  label: string;
}

export interface RetailerCurrencyConfig {
  multiEnabled: boolean;
  baseCurrency: string;
  options: CurrencyOption[];
}

/**
 * Company currency policy for retailer onboarding:
 * only the company's allowed_currencies, enriched from the `currencies` table.
 */
export function useRetailerCurrencyConfig() {
  return useQuery<RetailerCurrencyConfig>({
    queryKey: ['retailer-currency-config'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: company } = await supabase
        .from('companies')
        .select('base_currency, currency, allowed_currencies, multi_currency_enabled')
        .limit(1)
        .maybeSingle();

      const base = (company as any)?.base_currency || (company as any)?.currency || 'INR';
      const allowed: string[] =
        Array.isArray((company as any)?.allowed_currencies) && (company as any).allowed_currencies.length
          ? (company as any).allowed_currencies
          : [base];
      const codes = Array.from(new Set([base, ...allowed]));

      const { data: rows } = await supabase
        .from('currencies')
        .select('code, name, symbol')
        .in('code', codes);

      const byCode = new Map((rows || []).map((r: any) => [r.code, r]));
      const options: CurrencyOption[] = codes.map((code) => {
        const r: any = byCode.get(code);
        const name = r?.name || code;
        const symbol = r?.symbol || '';
        return {
          code,
          name,
          symbol,
          label: symbol ? `${code} — ${name} (${symbol})` : `${code} — ${name}`,
        };
      });

      return {
        multiEnabled: !!(company as any)?.multi_currency_enabled,
        baseCurrency: base,
        options,
      };
    },
  });
}

/** Currency of a distributor — used as the default for a new retailer. */
export function useDistributorCurrency(distributorId?: string | null) {
  return useQuery<string | null>({
    queryKey: ['distributor-currency', distributorId],
    enabled: !!distributorId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('distributors')
        .select('currency')
        .eq('id', distributorId as string)
        .maybeSingle();
      return (data as any)?.currency || null;
    },
  });
}

/**
 * A retailer with transactions must not change currency — it would corrupt the ledger.
 */
export function useRetailerHasTransactions(retailerId?: string | null) {
  return useQuery<boolean>({
    queryKey: ['retailer-has-transactions', retailerId],
    enabled: !!retailerId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const id = retailerId as string;
      const [orders, payments, invoices] = await Promise.all([
        supabase.from('orders').select('id').eq('retailer_id', id).limit(1),
        supabase.from('retailer_payment_collections').select('id').eq('retailer_id', id).limit(1),
        supabase.from('invoices').select('id').eq('customer_id', id).limit(1),
      ]);
      return Boolean(
        (orders.data?.length || 0) ||
        (payments.data?.length || 0) ||
        (invoices.data?.length || 0)
      );
    },
  });
}
