import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe2, Clock, Coins, Languages, ChevronDown, MapPin, Check, ChevronsUpDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { clearTimezoneCache } from '@/hooks/useAppTimezone';
import {
  LANGUAGES, REGIONS, LANGS_WITH_TRANSLATIONS, applyDocumentLanguage,
} from '@/i18n/regions';

const LOCALES = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-US', label: 'English (United States)' },
  { code: 'en-GB', label: 'English (United Kingdom)' },
  { code: 'en-CA', label: 'English (Canada)' },
  { code: 'en-SG', label: 'English (Singapore)' },
  { code: 'hi-IN', label: 'हिन्दी (भारत)' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ (ಭಾರತ)' },
  { code: 'ta-IN', label: 'தமிழ் (இந்தியா)' },
  { code: 'te-IN', label: 'తెలుగు (భారత్)' },
  { code: 'gu-IN', label: 'ગુજરાતી (ભારત)' },
  { code: 'mr-IN', label: 'मराठी (भारत)' },
  { code: 'bn-BD', label: 'বাংলা (বাংলাদেশ)' },
  { code: 'ml-IN', label: 'മലയാളം (ഇന്ത്യ)' },
  { code: 'pa-IN', label: 'ਪੰਜਾਬੀ (ਭਾਰਤ)' },
  { code: 'ar-AE', label: 'العربية (الإمارات)' },
  { code: 'ar-SA', label: 'العربية (السعودية)' },
  { code: 'de-DE', label: 'Deutsch (Deutschland)' },
  { code: 'fr-FR', label: 'Français (France)' },
  { code: 'nl-NL', label: 'Nederlands (Nederland)' },
  { code: 'es-ES', label: 'Español (España)' },
  { code: 'es-MX', label: 'Español (México)' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'ja-JP', label: '日本語 (日本)' },
  { code: 'zh-CN', label: '中文 (简体)' },
];

const TIMEZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Dhaka', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Shanghai',
  'Europe/London', 'Europe/Paris', 'Europe/Amsterdam', 'Europe/Berlin',
  'America/New_York', 'America/Toronto', 'America/Mexico_City', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo', 'Australia/Sydney', 'UTC',
];

const CURRENCIES = [
  { code: 'INR', label: 'Indian Rupee (₹)' },
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'AED', label: 'UAE Dirham (د.إ)' },
  { code: 'SAR', label: 'Saudi Riyal (﷼)' },
  { code: 'SGD', label: 'Singapore Dollar (S$)' },
  { code: 'CAD', label: 'Canadian Dollar (C$)' },
  { code: 'MXN', label: 'Mexican Peso (MX$)' },
  { code: 'BDT', label: 'Bangladeshi Taka (৳)' },
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
  const [langOpen, setLangOpen] = useState(false);
  const [showAllLanguages, setShowAllLanguages] = useState(false);
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
      const [{ data: company }, { data: profile }, { data: currencyRows }] = await Promise.all([
        supabase
          .from('companies')
          .select('timezone, currency, base_currency, allowed_currencies, multi_currency_enabled')
          .limit(1)
          .maybeSingle(),
        supabase.from('profiles').select('locale, timezone, currency, preferred_language').eq('id', user.id).maybeSingle(),
        supabase.from('currencies').select('code, name, symbol'),
      ]);
      if (cancelled) return;
      const comp = company as any;
      const defs = {
        timezone: comp?.timezone || DEFAULTS.timezone,
        currency: comp?.base_currency || comp?.currency || DEFAULTS.currency,
      };
      setCompanyDefaults(defs);
      setMultiEnabled(!!comp?.multi_currency_enabled);
      setAllowedCurrencies(
        Array.isArray(comp?.allowed_currencies) && comp.allowed_currencies.length
          ? comp.allowed_currencies
          : [defs.currency],
      );
      setCurrencyMeta((currencyRows as any[]) || []);

      const p = profile as any;
      const nextLocale = p?.locale || 'en-IN';
      const nextTz = p?.timezone || '';
      const nextCur = p?.currency || '';
      const nextLang = (p?.preferred_language || i18n.language || 'en').split('-')[0];
      setLocale(nextLocale);
      setTimezone(nextTz);
      setCurrency(nextCur);
      setLanguage(nextLang);
      applyDocumentLanguage(nextLang);
      const match =
        REGIONS.find((r) => r.locale === nextLocale && (!nextTz || r.timezone === nextTz)) ||
        REGIONS.find((r) => r.locale === nextLocale) ||
        REGIONS.find((r) => r.timezone === nextTz);
      if (match) setRegion(match.code);
      setInitial({ language: nextLang, locale: nextLocale, timezone: nextTz, currency: nextCur });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const activeRegion = REGIONS.find((r) => r.code === region);

  const handleRegionChange = (code: string) => {
    setRegion(code);
    const r = REGIONS.find((x) => x.code === code);
    if (!r) return;
    setLocale(r.locale);
    setTimezone(r.timezone);
    setCurrency(r.currency);
    if (!r.languages.includes(language)) {
      // English is the universal fallback for regions that don't offer the current language.
      handleLanguageSelect('en');
    }
  };

  const handleLanguageSelect = (code: string) => {
    setLanguage(code);
    setLangOpen(false);
    applyDocumentLanguage(code);
    i18n.changeLanguage(code);
    localStorage.setItem('preferredLanguage', code);
  };

  const availableLanguages = useMemo(() => {
    if (showAllLanguages || !activeRegion) return LANGUAGES;
    const inRegion = LANGUAGES.filter((l) => activeRegion.languages.includes(l.code));
    // Always keep the currently selected language visible.
    if (!inRegion.some((l) => l.code === language)) {
      const current = LANGUAGES.find((l) => l.code === language);
      if (current) return [current, ...inRegion];
    }
    return inRegion;
  }, [showAllLanguages, activeRegion, language]);

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
      applyDocumentLanguage(language);
      setInitial({ language, locale, timezone, currency });
      clearTimezoneCache();
      toast({ title: 'Preferences saved', description: 'Your language and region settings have been updated.' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message ?? String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const activeLang = LANGUAGES.find((l) => l.code === language);
  const effectiveTz = timezone || companyDefaults.timezone;
  const effectiveCur = currency || companyDefaults.currency;

  const regionHintFor = (code: string) =>
    REGIONS.find((r) => r.languages[0] === code)?.flag ||
    REGIONS.find((r) => r.languages.includes(code))?.flag ||
    '🌐';

  return (
    <Card className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button type="button" className="w-full text-left">
            <CardHeader className="pb-4 bg-gradient-to-r from-sky-50 to-transparent dark:from-sky-950/30 hover:bg-muted/40 transition-colors">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-sm shadow-sky-500/30 flex items-center justify-center">
                    <Globe2 className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Language &amp; Region</CardTitle>
                    <CardDescription className="text-xs">
                      {activeRegion?.flag} {activeRegion?.name} · {activeLang?.native} · {effectiveCur}
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
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
              <Label htmlFor="region-select" className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-sky-600" /> Country / Region
              </Label>
              <Select value={region} onValueChange={handleRegionChange} disabled={loading}>
                <SelectTrigger id="region-select" className="bg-background rounded-lg">
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
                Sets your date format, time zone, currency and available languages automatically.
              </p>
            </div>

            {/* Language */}
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
              <Label className="flex items-center gap-1.5">
                <Languages className="h-4 w-4 text-violet-600" /> Display Language
              </Label>

              <Popover open={langOpen} onOpenChange={setLangOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={langOpen}
                    disabled={loading}
                    className="w-full justify-between rounded-lg bg-background font-normal"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span>{regionHintFor(language)}</span>
                      <span className="truncate font-semibold">{activeLang?.native ?? 'Select language'}</span>
                      <span className="truncate text-xs text-muted-foreground">{activeLang?.english}</span>
                    </span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command
                    filter={(value, search) =>
                      value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                    }
                  >
                    <CommandInput placeholder="Search language…" />
                    <CommandList>
                      <CommandEmpty>No language found.</CommandEmpty>
                      <CommandGroup>
                        {availableLanguages.map((l) => {
                          const beta = !LANGS_WITH_TRANSLATIONS.includes(l.code);
                          return (
                            <CommandItem
                              key={l.code}
                              value={`${l.native} ${l.english} ${l.code}`}
                              onSelect={() => handleLanguageSelect(l.code)}
                              className="gap-2"
                            >
                              <span className="w-5 text-center">{regionHintFor(l.code)}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold">{l.native}</span>
                                <span className="block truncate text-[11px] text-muted-foreground">{l.english}</span>
                              </span>
                              {beta && (
                                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium text-muted-foreground">
                                  Beta
                                </Badge>
                              )}
                              <Check className={`h-4 w-4 ${language === l.code ? 'opacity-100 text-violet-600' : 'opacity-0'}`} />
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-xs text-muted-foreground">
                  Show all languages
                  <span className="block text-[11px]">Ignore the region filter and list every language.</span>
                </span>
                <Switch checked={showAllLanguages} onCheckedChange={setShowAllLanguages} />
              </div>

              {!LANGS_WITH_TRANSLATIONS.includes(language) && (
                <p className="text-[11px] text-muted-foreground">
                  Beta language — untranslated text falls back to English.
                </p>
              )}
            </div>

            {/* Advanced overrides */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="px-0 text-muted-foreground">
                  <ChevronDown className={`h-4 w-4 mr-1 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                  Advanced (locale, time zone, currency)
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 rounded-xl border border-border/60 bg-muted/30 p-3 mt-2">
                <div className="space-y-2">
                  <Label htmlFor="locale-select">Locale (date &amp; number format)</Label>
                  <Select value={locale} onValueChange={setLocale} disabled={loading}>
                    <SelectTrigger id="locale-select" className="bg-background rounded-lg"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LOCALES.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {activeRegion && (
                    <p className="text-xs text-muted-foreground">Date format: {activeRegion.dateFormat}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tz-select" className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-amber-600" /> Time Zone
                  </Label>
                  <Select
                    value={timezone || '__default__'}
                    onValueChange={(v) => setTimezone(v === '__default__' ? '' : v)}
                    disabled={loading}
                  >
                    <SelectTrigger id="tz-select" className="bg-background rounded-lg"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">Use company default ({companyDefaults.timezone})</SelectItem>
                      {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Effective for you: {effectiveTz}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cur-select" className="flex items-center gap-1.5">
                    <Coins className="h-4 w-4 text-emerald-600" /> Currency
                  </Label>
                  <Select
                    value={currency || '__default__'}
                    onValueChange={(v) => setCurrency(v === '__default__' ? '' : v)}
                    disabled={loading}
                  >
                    <SelectTrigger id="cur-select" className="bg-background rounded-lg"><SelectValue /></SelectTrigger>
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
              <Button className="w-full rounded-full sm:w-auto" onClick={handleSave} disabled={!dirty || saving || loading}>
                {saving ? 'Saving…' : 'Save preferences'}
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
