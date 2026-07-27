import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Loader2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { clearTimezoneCache } from "@/hooks/useAppTimezone";

const TIMEZONES = [
  { value: "Asia/Kolkata", label: "India Standard Time (IST) — Asia/Kolkata" },
  { value: "Asia/Dubai", label: "Gulf Standard Time (GST) — Asia/Dubai" },
  { value: "Asia/Singapore", label: "Singapore Time (SGT)" },
  { value: "Asia/Bangkok", label: "Indochina Time (ICT)" },
  { value: "Asia/Dhaka", label: "Bangladesh Standard Time (BST)" },
  { value: "Asia/Karachi", label: "Pakistan Standard Time (PKT)" },
  { value: "Asia/Colombo", label: "Sri Lanka Time (SLT)" },
  { value: "UTC", label: "UTC" },
];

const DATE_FORMATS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (31/12/2026)" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (12/31/2026)" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (2026-12-31)" },
];

interface CurrencyRow {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  is_active: boolean;
}

export default function RegionalSettings() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [dateFormat, setDateFormat] = useState("DD/MM/YYYY");
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([]);
  const [baseCurrency, setBaseCurrency] = useState("INR");
  const [multiEnabled, setMultiEnabled] = useState(false);
  const [allowed, setAllowed] = useState<string[]>(["INR"]);
  const [fxMode, setFxMode] = useState<"manual" | "api">("manual");
  const [rates, setRates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [companyRes, currRes] = await Promise.all([
        supabase
          .from("companies")
          .select("id, timezone, date_format, currency, base_currency, allowed_currencies, fx_mode, multi_currency_enabled")
          .limit(1)
          .maybeSingle(),
        supabase
          .from("currencies")
          .select("code, name, symbol, decimals, is_active")
          .order("code"),
      ]);

      setCurrencies(((currRes.data as CurrencyRow[] | null) || []).filter(c => c.is_active));

      const company: any = companyRes.data;
      const base = company?.base_currency || company?.currency || "INR";
      if (company) {
        setCompanyId(company.id);
        setTimezone(company.timezone || "Asia/Kolkata");
        setDateFormat(company.date_format || "DD/MM/YYYY");
        setBaseCurrency(base);
        setMultiEnabled(!!company.multi_currency_enabled);
        setAllowed(Array.from(new Set([base, ...(company.allowed_currencies || [])])));
        setFxMode(company.fx_mode === "api" ? "api" : "manual");
      }

      const { data: rateRows } = await supabase
        .from("exchange_rates")
        .select("base_currency, quote_currency, rate, effective_date")
        .eq("base_currency", base)
        .eq("source", "manual")
        .order("effective_date", { ascending: false });

      const latest: Record<string, string> = {};
      (rateRows || []).forEach((r: any) => {
        if (latest[r.quote_currency] === undefined) latest[r.quote_currency] = String(r.rate);
      });
      setRates(latest);
      setLoading(false);
    })();
  }, []);

  const quoteCurrencies = useMemo(
    () => allowed.filter(c => c !== baseCurrency),
    [allowed, baseCurrency]
  );

  const handleBaseChange = (code: string) => {
    setBaseCurrency(code);
    setAllowed(prev => Array.from(new Set([code, ...prev])));
  };

  const toggleAllowed = (code: string, checked: boolean) => {
    if (code === baseCurrency) return;
    setAllowed(prev => (checked ? Array.from(new Set([...prev, code])) : prev.filter(c => c !== code)));
  };

  const handleSave = async () => {
    if (!companyId) {
      toast.error("No company record found");
      return;
    }
    setSaving(true);
    try {
      const finalAllowed = multiEnabled
        ? Array.from(new Set([baseCurrency, ...allowed]))
        : [baseCurrency];

      const { error } = await supabase
        .from("companies")
        .update({
          timezone,
          date_format: dateFormat,
          currency: baseCurrency,
          base_currency: baseCurrency,
          multi_currency_enabled: multiEnabled,
          allowed_currencies: finalAllowed,
          fx_mode: fxMode,
        } as any)
        .eq("id", companyId);
      if (error) throw error;

      if (multiEnabled && fxMode === "manual") {
        const today = new Date().toISOString().split("T")[0];
        const rows = finalAllowed
          .filter(c => c !== baseCurrency)
          .map(c => ({
            base_currency: baseCurrency,
            quote_currency: c,
            rate: Number(rates[c]),
            effective_date: today,
            source: "manual",
          }))
          .filter(r => Number.isFinite(r.rate) && r.rate > 0);

        if (rows.length > 0) {
          const { error: rateErr } = await supabase
            .from("exchange_rates")
            .upsert(rows as any, {
              onConflict: "base_currency,quote_currency,effective_date,source",
            });
          if (rateErr) throw rateErr;
        }
      }

      setAllowed(finalAllowed);
      clearTimezoneCache();
      toast.success("Regional settings saved");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const label = (c: CurrencyRow) => `${c.code} — ${c.name} (${c.symbol})`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Regional Settings
        </CardTitle>
        <CardDescription>
          Configure timezone, date format, and currency. Applies across the entire app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Timezone</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map(tz => (
                <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            All dates, coverage periods, and beat planning will use this timezone.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Date Format</Label>
          <Select value={dateFormat} onValueChange={setDateFormat}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_FORMATS.map(df => (
                <SelectItem key={df.value} value={df.value}>{df.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Base / Reporting Currency</Label>
          <Select value={baseCurrency} onValueChange={handleBaseChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select base currency" />
            </SelectTrigger>
            <SelectContent>
              {currencies.map(c => (
                <SelectItem key={c.code} value={c.code}>{label(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            All reports and roll-ups are converted to this currency.
          </p>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div className="space-y-1">
            <Label>Allow multiple currencies</Label>
            <p className="text-xs text-muted-foreground">
              Let users transact and view in currencies other than the base.
            </p>
          </div>
          <Switch checked={multiEnabled} onCheckedChange={setMultiEnabled} />
        </div>

        {multiEnabled && (
          <div className="space-y-6 border-l-2 pl-4 ml-1">
            <div className="space-y-2">
              <Label>Allowed Currencies</Label>
              <div className="grid gap-2 sm:grid-cols-2 rounded-lg border p-3">
                {currencies.map(c => {
                  const isBase = c.code === baseCurrency;
                  return (
                    <label key={c.code} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={isBase || allowed.includes(c.code)}
                        disabled={isBase}
                        onCheckedChange={(v) => toggleAllowed(c.code, v === true)}
                      />
                      <span className={isBase ? "font-medium" : ""}>
                        {label(c)}{isBase ? " · base" : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Exchange Rate Mode</Label>
              <div className="inline-flex rounded-lg border p-1">
                {(["manual", "api"] as const).map(mode => (
                  <Button
                    key={mode}
                    type="button"
                    size="sm"
                    variant={fxMode === mode ? "default" : "ghost"}
                    onClick={() => setFxMode(mode)}
                  >
                    {mode === "manual" ? "Manual" : "Integration"}
                  </Button>
                ))}
              </div>
            </div>

            {fxMode === "manual" ? (
              <div className="space-y-2">
                <Label>Manual Exchange Rates</Label>
                {quoteCurrencies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Add more allowed currencies to define exchange rates.
                  </p>
                ) : (
                  <div className="space-y-2 rounded-lg border p-3">
                    {quoteCurrencies.map(code => (
                      <div key={code} className="flex items-center gap-3">
                        <span className="text-sm w-24">1 {baseCurrency} =</span>
                        <Input
                          type="number"
                          step="0.000001"
                          min="0"
                          className="max-w-[180px]"
                          value={rates[code] ?? ""}
                          onChange={(e) => setRates(prev => ({ ...prev, [code]: e.target.value }))}
                          placeholder="0.00"
                        />
                        <span className="text-sm text-muted-foreground">{code}</span>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">
                      Saved with today's date as the effective date.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                Rates are fetched daily.
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Regional Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
