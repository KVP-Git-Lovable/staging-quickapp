import { useEffect, useState } from 'react';
import { Globe2, Clock, Coins, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { clearTimezoneCache } from '@/hooks/useAppTimezone';

// Locales — display names for date/number formatting.
const LOCALES = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-US', label: 'English (United States)' },
  { code: 'en-GB', label: 'English (United Kingdom)' },
  { code: 'hi-IN', label: 'हिन्दी (भारत)' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ (ಭಾರತ)' },
  { code: 'ta-IN', label: 'தமிழ் (இந்தியா)' },
  { code: 'te-IN', label: 'తెలుగు (భారత్)' },
  { code: 'gu-IN', label: 'ગુજરાતી (ભારત)' },
  { code: 'de-DE', label: 'Deutsch (Deutschland)' },
  { code: 'fr-FR', label: 'Français (France)' },
  { code: 'es-ES', label: 'Español (España)' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'ja-JP', label: '日本語 (日本)' },
  { code: 'zh-CN', label: '中文 (简体)' },
];

// Common IANA timezones. Kept short and practical.
const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney',
  'UTC',
];

// Currencies — displayed for now; monetary formatting will be wired to
// company profile in a follow-up.
const CURRENCIES = [
  { code: 'INR', label: 'Indian Rupee (₹)' },
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'AED', label: 'UAE Dirham (د.إ)' },
  { code: 'SGD', label: 'Singapore Dollar (S$)' },
  { code: 'JPY', label: 'Japanese Yen (¥)' },
  { code: 'CNY', label: 'Chinese Yuan (¥)' },
  { code: 'AUD', label: 'Australian Dollar (A$)' },
];

interface CompanyDefaults {
  timezone: string;
  currency: string;
}

const DEFAULTS: CompanyDefaults = { timezone: 'Asia/Kolkata', currency: 'INR' };

export const LocaleSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [companyDefaults, setCompanyDefaults] = useState<CompanyDefaults>(DEFAULTS);
  const [locale, setLocale] = useState<string>('en-IN');
  const [timezone, setTimezone] = useState<string>('');
  const [currency, setCurrency] = useState<string>('');
  const [initial, setInitial] = useState({ locale: '', timezone: '', currency: '' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: company }, { data: profile }] = await Promise.all([
        supabase.from('companies').select('timezone, currency').limit(1).maybeSingle(),
        supabase
          .from('profiles')
          .select('locale, timezone, currency')
          .eq('id', user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const defs: CompanyDefaults = {
        timezone: (company as any)?.timezone || DEFAULTS.timezone,
        currency: (company as any)?.currency || DEFAULTS.currency,
      };
      setCompanyDefaults(defs);
      const p = profile as any;
      const nextLocale = p?.locale || 'en-IN';
      const nextTz = p?.timezone || '';
      const nextCur = p?.currency || '';
      setLocale(nextLocale);
      setTimezone(nextTz);
      setCurrency(nextCur);
      setInitial({ locale: nextLocale, timezone: nextTz, currency: nextCur });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const dirty =
    locale !== initial.locale ||
    timezone !== initial.timezone ||
    currency !== initial.currency;

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          locale: locale || null,
          // Empty string means "use company default" — persist as null.
          timezone: timezone || null,
          currency: currency || null,
        })
        .eq('id', user.id);
      if (error) throw error;
      setInitial({ locale, timezone, currency });
      clearTimezoneCache();
      toast({ title: 'Preferences saved', description: 'Your locale settings have been updated.' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message ?? String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const effectiveTz = timezone || companyDefaults.timezone;
  const effectiveCur = currency || companyDefaults.currency;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Globe2 className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Locale Settings</CardTitle>
        </div>
        <CardDescription>
          Choose your locale, time zone, and currency. Time zone and currency default to what your admin
          has configured for the company — override them here if you work in a different region.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Locale */}
        <div className="space-y-2">
          <Label htmlFor="locale-select">Locale</Label>
          <Select value={locale} onValueChange={setLocale} disabled={loading}>
            <SelectTrigger id="locale-select">
              <SelectValue placeholder="Select a locale" />
            </SelectTrigger>
            <SelectContent>
              {LOCALES.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Controls date and number formatting.
          </p>
        </div>

        {/* Time zone */}
        <div className="space-y-2">
          <Label htmlFor="tz-select" className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> Time Zone
          </Label>
          <Select
            value={timezone || '__default__'}
            onValueChange={(v) => setTimezone(v === '__default__' ? '' : v)}
            disabled={loading}
          >
            <SelectTrigger id="tz-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">
                Use company default ({companyDefaults.timezone})
              </SelectItem>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>{tz}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />
            Admin-configured default: <span className="font-medium">{companyDefaults.timezone}</span>.
            Effective for you: <span className="font-medium">{effectiveTz}</span>.
          </p>
        </div>

        {/* Currency */}
        <div className="space-y-2">
          <Label htmlFor="cur-select" className="flex items-center gap-1.5">
            <Coins className="h-4 w-4" /> Currency
          </Label>
          <Select
            value={currency || '__default__'}
            onValueChange={(v) => setCurrency(v === '__default__' ? '' : v)}
            disabled={loading}
          >
            <SelectTrigger id="cur-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">
                Use company default ({companyDefaults.currency})
              </SelectItem>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />
            Company default: <span className="font-medium">{companyDefaults.currency}</span>.
            Effective for you: <span className="font-medium">{effectiveCur}</span>.
            Display formatting will be wired to the company profile shortly.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!dirty || saving || loading}>
            {saving ? 'Saving…' : 'Save preferences'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
