import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Loader2 } from "lucide-react";
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

const CURRENCIES = [
  { value: "INR", label: "₹ Indian Rupee (INR)" },
  { value: "USD", label: "$ US Dollar (USD)" },
  { value: "AED", label: "AED UAE Dirham" },
  { value: "SGD", label: "S$ Singapore Dollar" },
  { value: "BDT", label: "৳ Bangladeshi Taka" },
];

export default function RegionalSettings() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [dateFormat, setDateFormat] = useState("DD/MM/YYYY");
  const [currency, setCurrency] = useState("INR");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, timezone, date_format, currency")
        .limit(1)
        .maybeSingle();
      if (data) {
        setCompanyId((data as any).id);
        setTimezone((data as any).timezone || "Asia/Kolkata");
        setDateFormat((data as any).date_format || "DD/MM/YYYY");
        setCurrency((data as any).currency || "INR");
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (!companyId) {
      toast.error("No company record found");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({ timezone, date_format: dateFormat, currency } as any)
        .eq("id", companyId);
      if (error) throw error;
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
          <Label>Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
