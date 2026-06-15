import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export interface VariantExtendedFormData {
  variant_type?: string;
  uom_id?: string | null;
  variant_weight_g?: number | null;
  variant_cost?: number | null;
  variant_tax_rate?: number | null;
  is_discontinued?: boolean;
  discontinued_date?: string | null;
  barcode_image_url?: string | null;
  qr_code?: string | null;
}

const VARIANT_TYPES = ['Size', 'Color', 'Weight', 'Packaging', 'Quantity', 'Flavor', 'Other'];

interface InheritedFromProduct {
  uomLabel?: string;
  cost?: number | null;
  costCurrency?: string;
  taxRate?: number | null;
}

interface Props {
  form: VariantExtendedFormData;
  inherited?: InheritedFromProduct;
  onFormChange: (updates: Partial<VariantExtendedFormData>) => void;
}

export const VariantExtendedFields: React.FC<Props> = ({ form, inherited, onFormChange }) => {
  const [uoms, setUoms] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('uom_master')
        .select('id, code, name')
        .order('name');
      if (!cancelled && data) setUoms(data as any);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleBarcodeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `variant_barcode_${Date.now()}.${fileExt}`;
      const { error } = await supabase.storage.from('product-images').upload(fileName, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);
      onFormChange({ barcode_image_url: publicUrl });
    } catch (err) {
      console.error('Variant barcode upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Identity */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Variant Classification</h3>
        <div>
          <Label htmlFor="variant_type">Variant Type *</Label>
          <Select
            value={form.variant_type || 'Other'}
            onValueChange={(v) => onFormChange({ variant_type: v })}
          >
            <SelectTrigger id="variant_type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {VARIANT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Units & Weight */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Units & Weight</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="variant_uom">UoM Override</Label>
            <Select
              value={form.uom_id || '__inherit__'}
              onValueChange={(v) => onFormChange({ uom_id: v === '__inherit__' ? null : v })}
            >
              <SelectTrigger id="variant_uom"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__inherit__">
                  Inherit from product{inherited?.uomLabel ? ` (${inherited.uomLabel})` : ''}
                </SelectItem>
                {uoms.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name} ({u.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="variant_weight_g">Variant Weight (g)</Label>
            <Input
              id="variant_weight_g"
              type="number"
              min={0}
              step="0.01"
              value={form.variant_weight_g ?? ''}
              onChange={(e) => onFormChange({ variant_weight_g: e.target.value === '' ? null : Math.max(0, parseFloat(e.target.value)) })}
              placeholder="0"
            />
          </div>
        </div>
      </div>

      {/* Cost & Tax overrides */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Cost & Tax Overrides</h3>
        <p className="text-xs text-muted-foreground">
          Leave blank to inherit the parent product's value.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="variant_cost">
              Variant Cost{inherited?.cost != null ? ` (product: ${inherited.costCurrency || 'INR'} ${inherited.cost})` : ''}
            </Label>
            <Input
              id="variant_cost"
              type="number"
              min={0}
              step="0.01"
              value={form.variant_cost ?? ''}
              onChange={(e) => onFormChange({ variant_cost: e.target.value === '' ? null : Math.max(0, parseFloat(e.target.value)) })}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="variant_tax_rate">
              Variant Tax Rate %{inherited?.taxRate != null ? ` (product: ${inherited.taxRate}%)` : ''}
            </Label>
            <Input
              id="variant_tax_rate"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={form.variant_tax_rate ?? ''}
              onChange={(e) => {
                if (e.target.value === '') { onFormChange({ variant_tax_rate: null }); return; }
                const v = Math.min(100, Math.max(0, parseFloat(e.target.value)));
                onFormChange({ variant_tax_rate: v });
              }}
              placeholder="0"
            />
          </div>
        </div>
      </div>

      {/* Barcode image + QR */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Barcode & QR</h3>
        <div>
          <Label htmlFor="variant_barcode_upload">Barcode Image</Label>
          <div className="flex items-center gap-2">
            <Input
              id="variant_barcode_upload"
              type="file"
              accept="image/*"
              onChange={handleBarcodeUpload}
              disabled={uploading}
              className="flex-1"
            />
            <Button type="button" variant="outline" size="icon" disabled={uploading}>
              {uploading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
            </Button>
          </div>
          {form.barcode_image_url && (
            <img src={form.barcode_image_url} alt="Variant Barcode" className="mt-2 h-20 object-contain border rounded" />
          )}
        </div>
        {form.qr_code && (
          <div>
            <Label>QR Code (auto-generated)</Label>
            <img src={form.qr_code} alt="Variant QR" className="mt-2 h-28 w-28 border rounded" />
          </div>
        )}
      </div>

      {/* Lifecycle */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Lifecycle</h3>
        <div className="flex items-center justify-between">
          <Label htmlFor="variant_is_discontinued" className="cursor-pointer">
            Is Discontinued
          </Label>
          <Switch
            id="variant_is_discontinued"
            checked={!!form.is_discontinued}
            onCheckedChange={(checked) => onFormChange({
              is_discontinued: checked,
              ...(checked ? {} : { discontinued_date: null }),
            })}
          />
        </div>
        {form.is_discontinued && (
          <div className="pl-4 border-l-2 border-destructive/30">
            <Label htmlFor="variant_discontinued_date">Discontinued Date *</Label>
            <Input
              id="variant_discontinued_date"
              type="date"
              value={form.discontinued_date || ''}
              onChange={(e) => onFormChange({ discontinued_date: e.target.value || null })}
              required
            />
          </div>
        )}
      </div>
    </div>
  );
};
