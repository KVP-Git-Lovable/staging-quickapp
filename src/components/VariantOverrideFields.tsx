import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { resolveProduct } from '@/utils/resolveProduct';

/**
 * Per-field inherit/override editor for product_variants.
 *
 * value semantics: NULL on a variant column = inherit from base.
 * Any non-null value = override.
 *
 * Uses resolveProduct(base, variant) to show the effective value while inherited.
 */

export interface VariantOverrideValues {
  tax_master_id: string | null;
  gst_percentage: number | null; // read-only mirror; trigger keeps in sync with tax_master_id
  category_id: string | null;
  brand: string | null;
  hsn_code: string | null;
  product_type: string | null;
  description: string | null;
  default_sales_uom_id: string | null;
  price_basis_uom_id: string | null;
  base_unit: string | null;
  net_weight_g: number | null;
  net_volume_ml: number | null;
  standard_cost: number | null;
  sku_image_url: string | null;
  reorder_level: number | null;
  reorder_quantity: number | null;
  manufacturer: string | null;
  country_of_origin: string | null;
}

interface Props {
  base: any;
  values: VariantOverrideValues;
  onChange: (patch: Partial<VariantOverrideValues>) => void;
  categories: Array<{ id: string; name: string }>;
  taxMasters: Array<{ id: string; name: string; total_rate: number | null }>;
}

type FieldType = 'text' | 'number' | 'textarea' | 'select';

interface RowConfig {
  key: keyof VariantOverrideValues;
  label: string;
  type: FieldType;
  options?: Array<{ value: string; label: string }>;
  // For select: a key on base that mirrors the resolved value (rendering)
  baseDisplay?: (base: any) => string | number | null | undefined;
}

const OverrideRow: React.FC<{
  cfg: RowConfig;
  values: VariantOverrideValues;
  onChange: (patch: Partial<VariantOverrideValues>) => void;
  base: any;
  extraOnOverride?: (newVal: any) => Partial<VariantOverrideValues>;
}> = ({ cfg, values, onChange, base, extraOnOverride }) => {
  const current = values[cfg.key];
  const isOverride = current !== null && current !== undefined && current !== '';
  // Effective value via resolver (variant overrides → base fallback).
  const resolved = resolveProduct(base, values as any) as any;
  const effective = isOverride ? current : (cfg.baseDisplay ? cfg.baseDisplay(base) : resolved[cfg.key as string] ?? base?.[cfg.key as string]);

  const toggle = (override: boolean) => {
    if (override) {
      // Switch to override → seed with current base value (so user sees what they're editing).
      const seed = cfg.baseDisplay ? cfg.baseDisplay(base) : base?.[cfg.key as string];
      const v = seed ?? (cfg.type === 'number' ? 0 : '');
      const patch: Partial<VariantOverrideValues> = { [cfg.key]: v as any };
      if (extraOnOverride) Object.assign(patch, extraOnOverride(v));
      onChange(patch);
    } else {
      const patch: Partial<VariantOverrideValues> = { [cfg.key]: null as any };
      if (cfg.key === 'tax_master_id') patch.gst_percentage = null;
      onChange(patch);
    }
  };

  const renderInput = () => {
    const val = current ?? '';
    if (cfg.type === 'select') {
      return (
        <Select
          value={(val as string) || ''}
          onValueChange={(v) => {
            const patch: Partial<VariantOverrideValues> = { [cfg.key]: v as any };
            if (extraOnOverride) Object.assign(patch, extraOnOverride(v));
            onChange(patch);
          }}
        >
          <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent>
            {cfg.options?.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (cfg.type === 'textarea') {
      return (
        <Textarea
          value={(val as string) || ''}
          onChange={(e) => onChange({ [cfg.key]: e.target.value } as any)}
          rows={2}
        />
      );
    }
    if (cfg.type === 'number') {
      return (
        <Input
          type="number"
          step="0.01"
          value={val === '' ? '' : Number(val)}
          onChange={(e) => onChange({ [cfg.key]: e.target.value === '' ? 0 : parseFloat(e.target.value) } as any)}
        />
      );
    }
    return (
      <Input
        value={(val as string) || ''}
        onChange={(e) => onChange({ [cfg.key]: e.target.value } as any)}
      />
    );
  };

  // Display label for "inherited" effective value (selects show label, others show raw).
  let inheritedDisplay: React.ReactNode = '—';
  if (effective !== null && effective !== undefined && effective !== '') {
    if (cfg.type === 'select') {
      const match = cfg.options?.find((o) => o.value === String(effective));
      inheritedDisplay = match?.label ?? String(effective);
    } else {
      inheritedDisplay = String(effective);
    }
  }

  return (
    <div className="grid grid-cols-12 gap-3 items-start py-2 border-b border-border/40">
      <div className="col-span-3">
        <Label className="text-sm">{cfg.label}</Label>
        {isOverride ? (
          <Badge variant="default" className="ml-2 bg-emerald-600 hover:bg-emerald-600 text-[10px]">Overridden</Badge>
        ) : (
          <Badge variant="secondary" className="ml-2 text-[10px]">Inherited</Badge>
        )}
      </div>
      <div className="col-span-2 flex items-center gap-2">
        <Switch checked={isOverride} onCheckedChange={toggle} />
        <span className="text-xs text-muted-foreground">{isOverride ? 'Override' : 'Inherit'}</span>
      </div>
      <div className="col-span-7">
        {isOverride ? (
          renderInput()
        ) : (
          <div className="text-sm text-muted-foreground italic px-3 py-2 border border-dashed rounded bg-muted/30">
            {inheritedDisplay} <span className="text-[10px]">(from base)</span>
          </div>
        )}
      </div>
    </div>
  );
};

export const VariantOverrideFields: React.FC<Props> = ({ base, values, onChange, categories, taxMasters }) => {
  const [uoms, setUoms] = useState<Array<{ id: string; code: string; name: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('uom_master').select('id, code, name').order('name');
      if (!cancelled && data) setUoms(data as any);
    })();
    return () => { cancelled = true; };
  }, []);

  const uomOptions = uoms.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }));
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));
  const taxOptions = taxMasters.map((t) => ({
    value: t.id,
    label: `${t.name}${t.total_rate != null ? ` (${t.total_rate}%)` : ''}`,
  }));

  const section = (title: string, rows: RowConfig[]) => (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-foreground mt-4 mb-2">{title}</h3>
      {rows.map((cfg) => {
        const extra = cfg.key === 'tax_master_id'
          ? (v: any) => {
              const t = taxMasters.find((tm) => tm.id === v);
              return { gst_percentage: t?.total_rate ?? null };
            }
          : undefined;
        return (
          <OverrideRow
            key={cfg.key}
            cfg={cfg}
            values={values}
            onChange={onChange}
            base={base}
            extraOnOverride={extra}
          />
        );
      })}
    </div>
  );

  return (
    <div className="space-y-2 border rounded-md p-4 bg-muted/10">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Master Field Overrides</h2>
        <span className="text-xs text-muted-foreground">Toggle a field to override the base product's value.</span>
      </div>

      {section('Pricing & Tax', [
        { key: 'tax_master_id', label: 'GST Bracket', type: 'select', options: taxOptions,
          baseDisplay: (b) => b?.tax_master_id ?? null },
        { key: 'standard_cost', label: 'Standard Cost (₹)', type: 'number',
          baseDisplay: (b) => b?.standard_cost ?? null },
      ])}

      {section('Classification', [
        { key: 'category_id', label: 'Category', type: 'select', options: categoryOptions,
          baseDisplay: (b) => b?.category_id ?? null },
        { key: 'brand', label: 'Brand', type: 'text', baseDisplay: (b) => b?.brand },
        { key: 'product_type', label: 'Product Type', type: 'text', baseDisplay: (b) => b?.product_type },
        { key: 'hsn_code', label: 'HSN Code', type: 'text', baseDisplay: (b) => b?.hsn_code },
        { key: 'manufacturer', label: 'Manufacturer', type: 'text', baseDisplay: (b) => b?.manufacturer },
        { key: 'country_of_origin', label: 'Country of Origin', type: 'text', baseDisplay: (b) => b?.country_of_origin },
        { key: 'description', label: 'Description', type: 'textarea', baseDisplay: (b) => b?.description },
      ])}

      {section('Units', [
        { key: 'default_sales_uom_id', label: 'Default Sales UoM', type: 'select', options: uomOptions,
          baseDisplay: (b) => b?.default_sales_uom_id ?? null },
        { key: 'price_basis_uom_id', label: 'Price Basis UoM', type: 'select', options: uomOptions,
          baseDisplay: (b) => b?.price_basis_uom_id ?? null },
        { key: 'base_unit', label: 'Base Unit', type: 'text', baseDisplay: (b) => b?.base_unit },
      ])}

      {section('Physical', [
        { key: 'net_weight_g', label: 'Net Weight (g)', type: 'number', baseDisplay: (b) => b?.net_weight_g },
        { key: 'net_volume_ml', label: 'Net Volume (ml)', type: 'number', baseDisplay: (b) => b?.net_volume_ml },
      ])}

      {section('Stock', [
        { key: 'reorder_level', label: 'Reorder Level', type: 'number', baseDisplay: (b) => b?.reorder_level },
        { key: 'reorder_quantity', label: 'Reorder Quantity', type: 'number', baseDisplay: (b) => b?.reorder_quantity },
      ])}

      {section('Image', [
        { key: 'sku_image_url', label: 'SKU Image URL', type: 'text', baseDisplay: (b) => b?.sku_image_url ?? b?.image_url },
      ])}
    </div>
  );
};

export const emptyVariantOverrides = (): VariantOverrideValues => ({
  tax_master_id: null, gst_percentage: null, category_id: null, brand: null,
  hsn_code: null, product_type: null, description: null,
  default_sales_uom_id: null, price_basis_uom_id: null, base_unit: null,
  net_weight_g: null, net_volume_ml: null, standard_cost: null,
  sku_image_url: null, reorder_level: null, reorder_quantity: null,
  manufacturer: null, country_of_origin: null,
});
