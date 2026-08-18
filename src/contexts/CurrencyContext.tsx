import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

import { formatFromBase, type RatesMap } from '@/lib/money';

interface CurrencyContextValue {
  baseCurrency: string;
  displayCurrency: string;
  allowedCurrencies: string[];
  multiEnabled: boolean;
  fxMode: string;
  rates: RatesMap;
  locale: string;
  loading: boolean;
  /** Format a BASE-currency amount into the user's display currency. */
  format: (baseAmount: number | string | null | undefined) => string;
  refresh: () => Promise<void>;
}

const DEFAULT_BASE = 'INR';
const DEFAULT_LOCALE = 'en-IN';

const CurrencyContext = createContext<CurrencyContextValue>({
  baseCurrency: DEFAULT_BASE,
  displayCurrency: DEFAULT_BASE,
  allowedCurrencies: [DEFAULT_BASE],
  multiEnabled: false,
  fxMode: 'manual',
  rates: {},
  locale: DEFAULT_LOCALE,
  loading: false,
  format: (a) => formatFromBase(a, DEFAULT_BASE, DEFAULT_BASE, {}, DEFAULT_LOCALE),
  refresh: async () => {},
});

// Per-pair pick: latest effective_date wins; ties broken by source preference.
const SOURCE_RANK: Record<string, number> = { override: 3, api: 2, manual: 1 };

function buildRatesMap(rows: any[]): RatesMap {
  const best = new Map<string, any>();
  for (const r of rows || []) {
    const key = `${r.base_currency}->${r.quote_currency}`;
    const prev = best.get(key);
    if (!prev) { best.set(key, r); continue; }
    const dNew = String(r.effective_date || '');
    const dOld = String(prev.effective_date || '');
    if (dNew > dOld) { best.set(key, r); continue; }
    if (dNew === dOld) {
      const rNew = SOURCE_RANK[String(r.source || 'manual')] ?? 0;
      const rOld = SOURCE_RANK[String(prev.source || 'manual')] ?? 0;
      if (rNew > rOld) best.set(key, r);
    }
  }
  const map: RatesMap = {};
  best.forEach((row, key) => {
    const rate = Number(row.rate);
    if (rate > 0) map[key] = rate;
  });
  return map;
}

export const CurrencyProvider = ({ children }: { children: React.ReactNode }) => {
  // Track auth directly from Supabase to avoid a circular import with useAuth.
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);
  const user = userId ? { id: userId } : null;
  const [baseCurrency, setBaseCurrency] = useState(DEFAULT_BASE);
  const [allowedCurrencies, setAllowedCurrencies] = useState<string[]>([DEFAULT_BASE]);
  const [multiEnabled, setMultiEnabled] = useState(false);
  const [fxMode, setFxMode] = useState('manual');
  const [userCurrency, setUserCurrency] = useState<string | null>(null);
  const [locale, setLocale] = useState(DEFAULT_LOCALE);
  const [rates, setRates] = useState<RatesMap>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [companyRes, ratesRes, profileRes] = await Promise.all([
        supabase
          .from('companies')
          .select('base_currency, currency, allowed_currencies, multi_currency_enabled, fx_mode')
          .limit(1)
          .maybeSingle(),
        supabase.from('exchange_rates').select('base_currency, quote_currency, rate, effective_date, source'),
        user
          ? supabase.from('profiles').select('currency, locale').eq('id', user.id).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);

      const c = (companyRes as any)?.data || {};
      const base = c.base_currency || c.currency || DEFAULT_BASE;
      setBaseCurrency(base);
      const allowed: string[] = Array.isArray(c.allowed_currencies) && c.allowed_currencies.length
        ? c.allowed_currencies
        : [base];
      setAllowedCurrencies(allowed);
      setMultiEnabled(!!c.multi_currency_enabled);
      setFxMode(c.fx_mode || 'manual');

      setRates(buildRatesMap(((ratesRes as any)?.data) || []));

      const p = (profileRes as any)?.data;
      setUserCurrency(p?.currency || null);
      if (p?.locale) setLocale(p.locale);
    } catch {
      // Keep safe defaults — money display must never crash the app.
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const displayCurrency = useMemo(() => {
    if (multiEnabled && userCurrency && allowedCurrencies.includes(userCurrency)) return userCurrency;
    return baseCurrency;
  }, [multiEnabled, userCurrency, allowedCurrencies, baseCurrency]);

  const format = useCallback(
    (baseAmount: number | string | null | undefined) =>
      formatFromBase(baseAmount, baseCurrency, displayCurrency, rates, locale),
    [baseCurrency, displayCurrency, rates, locale],
  );

  const value = useMemo<CurrencyContextValue>(() => ({
    baseCurrency,
    displayCurrency,
    allowedCurrencies,
    multiEnabled,
    fxMode,
    rates,
    locale,
    loading,
    format,
    refresh: load,
  }), [baseCurrency, displayCurrency, allowedCurrencies, multiEnabled, fxMode, rates, locale, loading, format, load]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
};

export const useCurrency = () => useContext(CurrencyContext);
