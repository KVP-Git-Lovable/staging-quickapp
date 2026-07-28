// Central money formatting + conversion.
// Principle: every amount stored in the DB is in the company BASE currency.
// Rates are stored base<->X; any-to-any pairs resolve via triangulation through the base.
// If no rate can be resolved, we format in the BASE currency (honest) rather than stamping
// a foreign symbol onto an unconverted number.

export type RatesMap = Record<string, number>; // key: `${base}->${quote}` value: multiplier

/**
 * Format an amount that is ALREADY in `currency`.
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

function findPairRate(from: string, to: string, rates: RatesMap): number | null {
  if (from === to) return 1;
  const direct = rates[`${from}->${to}`];
  if (direct && direct > 0) return direct;
  const inverse = rates[`${to}->${from}`];
  if (inverse && inverse > 0) return 1 / inverse;
  return null;
}

/** Resolve a from->to rate, triangulating through `baseCurrency` when needed. */
export function resolveRate(
  from: string,
  to: string,
  rates: RatesMap = {},
  baseCurrency?: string,
): number | null {
  const direct = findPairRate(from, to, rates);
  if (direct !== null) return direct;

  if (baseCurrency && from !== baseCurrency && to !== baseCurrency) {
    const fromToBase = findPairRate(from, baseCurrency, rates);
    const baseToTo = findPairRate(baseCurrency, to, rates);
    if (fromToBase !== null && baseToTo !== null) return fromToBase * baseToTo;
  }

  return null;
}

/** Convert between currencies; returns the amount unchanged when no rate is resolvable. */
export function convertAmount(
  amount: number | string | null | undefined,
  from: string,
  to: string,
  rates: RatesMap = {},
  baseCurrency?: string,
): number {
  const n = Number(amount) || 0;
  if (!from || !to) return n;
  const rate = resolveRate(from, to, rates, baseCurrency);
  return rate === null ? n : n * rate;
}

/**
 * Take a BASE-currency amount, convert it to the display currency, and format it.
 * Falls back to base-currency formatting when no rate exists.
 */
export function formatFromBase(
  baseAmount: number | string | null | undefined,
  baseCurrency: string,
  displayCurrency: string,
  rates: RatesMap = {},
  locale: string = 'en-IN',
): string {
  const n = Number(baseAmount) || 0;
  const base = baseCurrency || 'INR';
  if (!displayCurrency || displayCurrency === base) return formatCurrency(n, base, locale);
  const rate = resolveRate(base, displayCurrency, rates, base);
  if (rate === null) return formatCurrency(n, base, locale);
  return formatCurrency(n * rate, displayCurrency, locale);
}
