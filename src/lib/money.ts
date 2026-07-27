// Central money formatting + conversion.
// Principle: every amount stored in the DB is in the company BASE currency.
// To show it to a user, convert base -> the user's display currency, then format.
// Formatting uses Intl (symbol + decimal places are derived automatically from the ISO code).

export type RatesMap = Record<string, number>; // key: `${base}->${quote}`  value: multiplier

/**
 * Format an amount that is ALREADY in `currency`. Symbol and decimals come from Intl per ISO code
 * (e.g. INR -> ₹, JPY -> ¥ with 0 decimals). Falls back to "CODE 1,234" for unknown codes.
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  currency: string = 'INR',
  locale: string = 'en-IN',
): string {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString(locale)}`;
  }
}

/**
 * Convert `amount` from one currency to another using a rates map keyed `${from}->${to}`.
 * Returns the amount unchanged if from===to or no rate is known (safe fallback, never throws).
 */
export function convertAmount(
  amount: number | string | null | undefined,
  from: string,
  to: string,
  rates: RatesMap = {},
): number {
  const n = Number(amount) || 0;
  if (!from || !to || from === to) return n;
  const direct = rates[`${from}->${to}`];
  if (direct && direct > 0) return n * direct;
  const inverse = rates[`${to}->${from}`];
  if (inverse && inverse > 0) return n / inverse;
  return n; // unknown rate -> return unconverted rather than a wrong/zero value
}

/**
 * Take a BASE-currency amount, convert it to the display currency, and format it.
 * This is the function most UI code should call.
 */
export function formatFromBase(
  baseAmount: number | string | null | undefined,
  baseCurrency: string,
  displayCurrency: string,
  rates: RatesMap = {},
  locale: string = 'en-IN',
): string {
  const converted = convertAmount(baseAmount, baseCurrency, displayCurrency, rates);
  return formatCurrency(converted, displayCurrency, locale);
}
