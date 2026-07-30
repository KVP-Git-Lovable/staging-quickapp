import { useCallback, useMemo } from 'react';
import { usePriceBookPrices } from '@/hooks/usePriceBookPrices';
import { useCurrency } from '@/contexts/CurrencyContext';
import { formatCurrency } from '@/lib/money';

/**
 * Currency of an ORDER (transaction currency).
 *
 * Rule: order amounts are shown in the currency the order is transacted in and are
 * NEVER converted to the viewer's display currency (that conversion belongs to
 * dashboards/reports only).
 *
 * Resolution — nothing is hardcoded:
 *  1. the `currency` returned by the retailer's resolved price-book rows, else
 *  2. the company base currency from CurrencyContext (product default prices are in base).
 *
 * All lines of one order share the retailer's currency, so this is resolved once
 * per order rather than per line.
 */
export function useOrderCurrency(retailerId?: string | null) {
  const { rows } = usePriceBookPrices(retailerId);
  const { baseCurrency, locale } = useCurrency();

  const currency = useMemo(() => {
    const fromPriceBook = (rows || []).find((r) => !!r?.currency)?.currency;
    return fromPriceBook || baseCurrency;
  }, [rows, baseCurrency]);

  const format = useCallback(
    (amount: number | string | null | undefined) => formatCurrency(amount, currency, locale),
    [currency, locale],
  );

  return { currency, format, isBaseCurrency: currency === baseCurrency };
}
