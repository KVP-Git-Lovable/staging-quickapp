import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const TIMEZONE_CACHE_KEY = 'app_timezone_config';

export interface TimezoneConfig {
  timezone: string;      // IANA e.g. "Asia/Kolkata"
  dateFormat: string;    // "DD/MM/YYYY"
  currency: string;      // "INR"
}

const DEFAULT_CONFIG: TimezoneConfig = {
  timezone: 'Asia/Kolkata',
  dateFormat: 'DD/MM/YYYY',
  currency: 'INR',
};

// Singleton cache — loaded once, reused everywhere
let cachedConfig: TimezoneConfig | null = null;
let inflight: Promise<void> | null = null;

export function clearTimezoneCache() {
  cachedConfig = null;
  inflight = null;
  try { localStorage.removeItem(TIMEZONE_CACHE_KEY); } catch {}
}

export function useAppTimezone(): TimezoneConfig {
  const [config, setConfig] = useState<TimezoneConfig>(() => {
    if (cachedConfig) return cachedConfig;
    try {
      const stored = localStorage.getItem(TIMEZONE_CACHE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as TimezoneConfig;
        cachedConfig = parsed;
        return parsed;
      }
    } catch {}
    return DEFAULT_CONFIG;
  });

  useEffect(() => {
    if (cachedConfig) return;
    if (!inflight) {
      inflight = supabase
        .from('companies')
        .select('timezone, date_format, currency')
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            const cfg: TimezoneConfig = {
              timezone: (data as any).timezone || DEFAULT_CONFIG.timezone,
              dateFormat: (data as any).date_format || DEFAULT_CONFIG.dateFormat,
              currency: (data as any).currency || DEFAULT_CONFIG.currency,
            };
            cachedConfig = cfg;
            try { localStorage.setItem(TIMEZONE_CACHE_KEY, JSON.stringify(cfg)); } catch {}
          }
        })
        .then(() => { /* swallow */ });
    }
    inflight.then(() => {
      if (cachedConfig) setConfig(cachedConfig);
    });
  }, []);

  return config;
}

/** Get "today" at midnight local time, but representing the calendar day in the configured timezone. */
export function getTodayInTimezone(timezone: string): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  return new Date(`${y}-${m}-${d}T00:00:00`);
}

/** Format a Date for display using the configured timezone. */
export function formatInTimezone(date: Date, timezone: string, options?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString('en-IN', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options,
  });
}

/** Get ISO date string (YYYY-MM-DD) for the calendar day in the configured timezone. */
export function getLocalDateString(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date);
}
