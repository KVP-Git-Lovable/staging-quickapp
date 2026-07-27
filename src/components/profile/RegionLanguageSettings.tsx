import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe2, Clock, Coins, Languages, ChevronDown, MapPin } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { clearTimezoneCache } from '@/hooks/useAppTimezone';

/** Region presets — picking a region sets sensible locale / timezone / currency. */
const REGIONS = [
  { code: 'IN', flag: '🇮🇳', name: 'India', locale: 'en-IN', timezone: 'Asia/Kolkata', currency: 'INR' },
  { code: 'AE', flag: '🇦🇪', name: 'United Arab Emirates', locale: 'en-GB', timezone: 'Asia/Dubai', currency: 'AED' },
  { code: 'SG', flag: '🇸🇬', name: 'Singapore', locale: 'en-GB', timezone: 'Asia/Singapore', currency: 'SGD' },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom', locale: 'en-GB', timezone: 'Europe/London', currency: 'GBP' },
  { code: 'US', flag: '🇺🇸', name: 'United States', locale: 'en-US', timezone: 'America/New_York', currency: 'USD' },
  { code: 'DE', flag: '🇩🇪', name: 'Germany', locale: 'de-DE', timezone: 'Europe/Berlin', currency: 'EUR' },
  { code: 'FR', flag: '🇫🇷', name: 'France', locale: 'fr-FR', timezone: 'Europe/Paris', currency: 'EUR' },
  { code: 'AU', flag: '🇦🇺', name: 'Australia', locale: 'en-GB', timezone: 'Australia/Sydney', currency: 'AUD' },
  { code: 'JP', flag: '🇯🇵', name: 'Japan', locale: 'ja-JP', timezone: 'Asia/Tokyo', currency: 'JPY' },
];

const LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिंदी' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
];

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

const TIMEZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Shanghai',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo', 'Australia/Sydney', 'UTC',
];

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

const DEFAULTS = { timezone: 'Asia/Kolkata', currency: 'INR' };

export const RegionLanguageSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { i18n } = useTranslation();

  const [open, setOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [companyDefaults, setCompanyDefaults] = useState(DEFAULTS);
  const [region, setRegion] = useState('IN');
  const [language, setLanguage] = useState((i18n.language || 'en').split('-')[0]);
  const [locale, setLocale] = useState('en-IN');
  const [timezone, setTimezone] = useState('');
  const [currency, setCurrency] = useState('');
  const [initial, setInitial] = useState({ language: '', locale: '', timezone: '', currency: '' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: company }, { data: profile }] = await Promise.all([
        supabase.from('companies').select('timezone, currency').limit(1).maybeSingle(),
        supabase.from('profiles').select('locale, timezone, currency, preferred_language').eq('id', user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      const defs = {
        timezone: (company as any)?.timezone || DEFAULTS.timezone,
        currency: (company as any)?.currency || DEFAULTS.currency,
      };
      setCompanyDefaults(defs);
      const p = profile as any;
      const nextLocale = p?.locale || 'en-IN';
      const nextTz = p?.timezone || '';
      const nextCur = p?.currency || '';
      const nextLang = (p?.preferred_language || i18n.language || 'en').split('-')[0];
      setLocale(nextLocale);
      setTimezone(nextTz);
      setCurrency(nextCur);
      setLanguage(nextLang);
      const match = REGIONS.find(
        (r) => r.locale === nextLocale && (!nextTz || r.timezone === nextTz),
      ) || REGIONS.find((r) => r.locale === nextLocale);
      if (match) setRegion(match.code);
      setInitial({ language: nextLang, locale: nextLocale, timezone: nextTz, currency: nextCur });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const handleRegionChange = (code: string) => {
    setRegion(code);
    const r = REGIONS.find((x) => x.code === code);
    if (!r) return;
    setLocale(r.locale);
    setTimezone(r.timezone);
    setCurrency(r.currency);
  };

  const dirty =
    language !== initial.language ||
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
          timezone: timezone || null,
          currency: currency || null,
          preferred_language: language,
        } as any)
        .eq('id', user.id);
      if (error) throw error;
      await i18n.changeLanguage(language);
      localStorage.setItem('preferredLanguage', language);
      setInitial({ language, locale, timezone, currency });
      clearTimezoneCache();
      toast({ title: 'Preferences saved', description: 'Your language and region settings have been updated.' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message ?? String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const activeRegion = REGIONS.find((r) => r.code === region);
  const activeLang = LANGUAGES.find((l) => l.code === language);
  const effectiveTz = timezone || companyDefaults.timezone;
  const effectiveCur = currency || companyDefaults.currency;

  return (
    <Card className="overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button type="button" className="w-full text-left">
            <CardHeader className="pb-4 hover:bg-muted/40 transition-colors">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Globe2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Language &amp; Region</CardTitle>
                    <CardDescription className="text-xs">
                      {activeRegion?.flag} {activeRegion?.name} · {activeLang?.nativeName} · {effectiveCur}
                    </CardDescription>
                  </div>
                </div>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-5 pt-0">
            {/* Region */}
            <div className="space-y-2">
              <Label htmlFor="region-select" className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> Country / Region
              </Label>
              <Select value={region} onValueChange={handleRegionChange} disabled={loading}>
                <SelectTrigger id="region-select">
                  <SelectValue placeholder="Select your region" />
                </SelectTrigger>
                <SelectContent>
                  {REGIONS.map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      <span className="mr-2">{r.flag}</span>{r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Sets your date format, time zone and currency automatically.
              </p>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Languages className="h-4 w-4" /> Display Language
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {LANGUAGES.map((l) => {
                  const selected = language === l.code;
                  return (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => setLanguage(l.code)}
                      className={`rounded-lg border p-3 text-center transition-all hover:border-primary/50 ${
                        selected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border bg-card'
                      }`}
                    >
                      <div className="text-sm font-medium text-foreground">{l.nativeName}</div>
                      <div className="text-[11px] text-muted-foreground">{l.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Advanced overrides */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="px-0 text-muted-foreground">
                  <ChevronDown className={`h-4 w-4 mr-1 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                  Advanced (locale, time zone, currency)
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-3">
                <div className="space-y-2">
                  <Label htmlFor="locale-select">Locale (date &amp; number format)</Label>
                  <Select value={locale} onValueChange={setLocale} disabled={loading}>
                    <SelectTrigger id="locale-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LOCALES.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tz-select" className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" /> Time Zone
                  </Label>
                  <Select
                    value={timezone || '__default__'}
                    onValueChange={(v) => setTimezone(v === '__default__' ? '' : v)}
                    disabled={loading}
                  >
                    <SelectTrigger id="tz-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">Use company default ({companyDefaults.timezone})</SelectItem>
                      {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Effective for you: {effectiveTz}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cur-select" className="flex items-center gap-1.5">
                    <Coins className="h-4 w-4" /> Currency
                  </Label>
                  <Select
                    value={currency || '__default__'}
                    onValueChange={(v) => setCurrency(v === '__default__' ? '' : v)}
                    disabled={loading}
                  >
                    <SelectTrigger id="cur-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">Use company default ({companyDefaults.currency})</SelectItem>
                      {CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Effective for you: {effectiveCur}</p>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={!dirty || saving || loading}>
                {saving ? 'Saving…' : 'Save preferences'}
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
