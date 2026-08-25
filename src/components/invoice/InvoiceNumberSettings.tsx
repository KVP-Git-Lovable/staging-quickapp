import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Loader2, Hash } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type YearMode = 'calendar' | 'financial' | 'none';

interface InvoiceNumberSettingsState {
  prefix: string;
  separator: string;
  padding: number;
  yearMode: YearMode;
  fyStartMonth: number;
}

const DEFAULTS: InvoiceNumberSettingsState = {
  prefix: 'INV',
  separator: '-',
  padding: 3,
  yearMode: 'calendar',
  fyStartMonth: 4,
};

const SETTING_KEYS = [
  'number_prefix',
  'number_padding',
  'number_template',
  'number_year_mode',
  'number_fy_start_month',
] as const;

// Builds the template generate_invoice_number() actually substitutes against.
// The literal separator isn't its own placeholder in that function — it's
// baked into the template string between {year} and {seq} — so the chosen
// separator has to be folded in here rather than stored on its own.
const buildTemplate = (s: InvoiceNumberSettingsState): string =>
  s.yearMode === 'none'
    ? `{prefix}${s.separator}{seq}`
    : `{prefix}{year}${s.separator}{seq}`;

// Mirrors _invoice_pad / _invoice_year_part purely client-side, for preview
// only — never touches the real sequence.
const previewNumber = (s: InvoiceNumberSettingsState, nextSeq: number, now: Date): string => {
  const pad = Math.max(s.padding, 1);
  const seqStr = String(nextSeq);
  const seqPart = seqStr.length >= pad ? seqStr : seqStr.padStart(pad, '0');

  let yearPart = '';
  if (s.yearMode === 'calendar') {
    yearPart = String(now.getFullYear());
  } else if (s.yearMode === 'financial') {
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    yearPart = m >= s.fyStartMonth
      ? `${y}-${String((y + 1) % 100).padStart(2, '0')}`
      : `${y - 1}-${String(y % 100).padStart(2, '0')}`;
  }

  return buildTemplate(s)
    .replace('{prefix}', s.prefix)
    .replace('{year}', yearPart)
    .replace('{seq}', seqPart);
};

export default function InvoiceNumberSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<InvoiceNumberSettingsState>(DEFAULTS);
  const [nextSeq, setNextSeq] = useState<number | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('invoice_document_settings')
        .select('setting_key, setting_value')
        .in('setting_key', SETTING_KEYS as unknown as string[]);
      if (error) throw error;

      const raw: Record<string, string> = {};
      (data || []).forEach((row: any) => {
        const v = row.setting_value;
        raw[row.setting_key] = typeof v === 'string' ? v : (v?.toString?.() ?? '');
      });

      // Recover prefix/separator out of whatever template is currently
      // saved, so editing an existing custom template doesn't get silently
      // clobbered back to defaults the first time this panel loads.
      const tpl = raw.number_template || buildTemplate(DEFAULTS);
      const yearMode = (raw.number_year_mode as YearMode) || DEFAULTS.yearMode;
      const afterPrefix = tpl.replace('{prefix}', '');
      const sepMatch = yearMode === 'none'
        ? afterPrefix.match(/^(.*)\{seq\}$/)
        : afterPrefix.replace('{year}', '').match(/^(.*)\{seq\}$/);
      const separator = sepMatch?.[1] ?? DEFAULTS.separator;

      setSettings({
        prefix: raw.number_prefix || DEFAULTS.prefix,
        separator,
        padding: Number(raw.number_padding) || DEFAULTS.padding,
        yearMode,
        fyStartMonth: Number(raw.number_fy_start_month) || DEFAULTS.fyStartMonth,
      });

      const { data: seqData } = await supabase.rpc('get_invoice_seq_preview' as any);
      if (typeof seqData === 'number') setNextSeq(seqData);
    } catch (error) {
      console.error('Error loading invoice number settings:', error);
      toast.error('Failed to load invoice number settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings.prefix.trim()) {
      toast.error('Prefix cannot be empty');
      return;
    }
    setSaving(true);
    try {
      const rows = [
        { setting_key: 'number_prefix', setting_value: settings.prefix.trim() },
        { setting_key: 'number_padding', setting_value: String(Math.max(settings.padding, 1)) },
        { setting_key: 'number_template', setting_value: buildTemplate(settings) },
        { setting_key: 'number_year_mode', setting_value: settings.yearMode },
        { setting_key: 'number_fy_start_month', setting_value: String(settings.fyStartMonth) },
      ];
      const { error } = await supabase
        .from('invoice_document_settings')
        .upsert(rows, { onConflict: 'setting_key' });
      if (error) throw error;
      toast.success('Invoice number format saved — new invoices will use it from here on');
    } catch (error) {
      console.error('Error saving invoice number settings:', error);
      toast.error('Failed to save invoice number settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const preview = previewNumber(settings, nextSeq ?? 1, new Date());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Hash className="h-4 w-4" />
          Invoice Number Format
        </CardTitle>
        <CardDescription>
          Controls the number every new invoice gets going forward. Existing invoice numbers are never changed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="inv-prefix">Prefix</Label>
            <Input
              id="inv-prefix"
              value={settings.prefix}
              maxLength={10}
              onChange={(e) => setSettings(prev => ({ ...prev, prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
              placeholder="INV"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-separator">Separator</Label>
            <Input
              id="inv-separator"
              value={settings.separator}
              maxLength={2}
              onChange={(e) => setSettings(prev => ({ ...prev, separator: e.target.value }))}
              placeholder="-"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-padding">Sequence digits</Label>
            <Input
              id="inv-padding"
              type="number"
              min={1}
              max={10}
              value={settings.padding}
              onChange={(e) => setSettings(prev => ({ ...prev, padding: Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1)) }))}
            />
            <p className="text-xs text-muted-foreground">
              Zero-padded up to this many digits — grows automatically once the count passes it, never truncates.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-year-mode">Year in number</Label>
            <Select
              value={settings.yearMode}
              onValueChange={(value: YearMode) => setSettings(prev => ({ ...prev, yearMode: value }))}
            >
              <SelectTrigger id="inv-year-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="calendar">Calendar year (2026)</SelectItem>
                <SelectItem value="financial">Financial year (2026-27)</SelectItem>
                <SelectItem value="none">No year</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {settings.yearMode === 'financial' && (
            <div className="space-y-1.5">
              <Label htmlFor="inv-fy-start">Financial year starts in</Label>
              <Select
                value={String(settings.fyStartMonth)}
                onValueChange={(value) => setSettings(prev => ({ ...prev, fyStartMonth: Number(value) }))}
              >
                <SelectTrigger id="inv-fy-start">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['January','February','March','April','May','June','July','August','September','October','November','December']
                    .map((name, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="p-4 rounded-lg border bg-muted/30">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Next invoice number will look like</p>
          <p className="text-2xl font-mono font-semibold">{preview}</p>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? 'Saving...' : 'Save Format'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
