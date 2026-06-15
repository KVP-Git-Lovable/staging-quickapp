import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';

export interface ProductExtendedFormData {
  product_type?: string;
  gross_weight_g?: number | null;
  packaging_weight_g?: number | null;
  standard_cost?: number | null;
  cost_currency?: string;
  reorder_quantity?: number | null;
  last_cost_update?: string | null;
  primary_supplier_id?: string | null;
  manufacturer?: string;
  country_of_origin?: string;
  is_discontinued?: boolean;
  discontinued_date?: string | null;
  discontinuation_reason?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

const PRODUCT_TYPES = ['Finished Good', 'Raw Material', 'Semi-Finished', 'Service', 'Packaging'];
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED'];
const COUNTRIES = [
  'India', 'United States', 'United Kingdom', 'United Arab Emirates',
  'China', 'Germany', 'Singapore', 'Japan', 'Australia', 'Bangladesh',
  'Sri Lanka', 'Nepal', 'Vietnam', 'Thailand', 'Malaysia', 'Other',
];

interface Props {
  form: ProductExtendedFormData;
  onFormChange: (updates: Partial<ProductExtendedFormData>) => void;
}

export const ProductExtendedFields: React.FC<Props> = ({ form, onFormChange }) => {
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([]);
  const [users, setUsers] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('vendors')
        .select('id, name')
        .order('name')
        .limit(500);
      if (!cancelled && data) setVendors(data as any);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const ids = [form.created_by, form.updated_by].filter(Boolean) as string[];
    if (!ids.length) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', ids);
      if (!cancelled && data) {
        const map: Record<string, string> = {};
        data.forEach((p: any) => { map[p.id] = p.name || p.email || p.id; });
        setUsers(map);
      }
    })();
    return () => { cancelled = true; };
  }, [form.created_by, form.updated_by]);

  return (
    <div className="space-y-6 pt-4 border-t">
      {/* Classification */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Classification</h3>
        <div>
          <Label htmlFor="product_type">Product Type *</Label>
          <Select
            value={form.product_type || 'Finished Good'}
            onValueChange={(v) => onFormChange({ product_type: v })}
          >
            <SelectTrigger id="product_type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRODUCT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Measurements */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Measurements</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="gross_weight_g">Gross Weight (g)</Label>
            <Input
              id="gross_weight_g"
              type="number"
              min={0}
              step="0.01"
              value={form.gross_weight_g ?? ''}
              onChange={(e) => onFormChange({ gross_weight_g: e.target.value === '' ? null : Math.max(0, parseFloat(e.target.value)) })}
              placeholder="Weight including packaging"
            />
          </div>
          <div>
            <Label htmlFor="packaging_weight_g">Packaging Weight (g)</Label>
            <Input
              id="packaging_weight_g"
              type="number"
              min={0}
              step="0.01"
              value={form.packaging_weight_g ?? ''}
              onChange={(e) => onFormChange({ packaging_weight_g: e.target.value === '' ? null : Math.max(0, parseFloat(e.target.value)) })}
              placeholder="Packaging only"
            />
          </div>
        </div>
      </div>

      {/* Costing & Replenishment */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Costing & Replenishment</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="standard_cost">Standard Cost</Label>
            <Input
              id="standard_cost"
              type="number"
              min={0}
              step="0.01"
              value={form.standard_cost ?? ''}
              onChange={(e) => onFormChange({ standard_cost: e.target.value === '' ? null : Math.max(0, parseFloat(e.target.value)) })}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="cost_currency">Currency</Label>
            <Select
              value={form.cost_currency || 'INR'}
              onValueChange={(v) => onFormChange({ cost_currency: v })}
            >
              <SelectTrigger id="cost_currency"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="reorder_quantity">Reorder Qty (MOQ)</Label>
            <Input
              id="reorder_quantity"
              type="number"
              min={0}
              value={form.reorder_quantity ?? ''}
              onChange={(e) => onFormChange({ reorder_quantity: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value) || 0) })}
              placeholder="0"
            />
          </div>
        </div>
        {form.last_cost_update && (
          <p className="text-xs text-muted-foreground">
            Last cost update: {new Date(form.last_cost_update).toLocaleString()}
          </p>
        )}
      </div>

      {/* Supply Chain */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Supply Chain</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="primary_supplier">Primary Supplier</Label>
            <Select
              value={form.primary_supplier_id || '__none__'}
              onValueChange={(v) => onFormChange({ primary_supplier_id: v === '__none__' ? null : v })}
            >
              <SelectTrigger id="primary_supplier"><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="manufacturer">Manufacturer</Label>
            <Input
              id="manufacturer"
              value={form.manufacturer || ''}
              onChange={(e) => onFormChange({ manufacturer: e.target.value })}
              placeholder="OEM / brand owner"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="country_of_origin">Country of Origin</Label>
          <Select
            value={form.country_of_origin || ''}
            onValueChange={(v) => onFormChange({ country_of_origin: v })}
          >
            <SelectTrigger id="country_of_origin"><SelectValue placeholder="Select country" /></SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lifecycle */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Lifecycle</h3>
        <div className="flex items-center justify-between">
          <Label htmlFor="is_discontinued" className="cursor-pointer">
            Is Discontinued
          </Label>
          <Switch
            id="is_discontinued"
            checked={!!form.is_discontinued}
            onCheckedChange={(checked) => onFormChange({
              is_discontinued: checked,
              ...(checked ? {} : { discontinued_date: null, discontinuation_reason: '' }),
            })}
          />
        </div>
        {form.is_discontinued && (
          <div className="space-y-4 pl-4 border-l-2 border-destructive/30">
            <div>
              <Label htmlFor="discontinued_date">Discontinued Date *</Label>
              <Input
                id="discontinued_date"
                type="date"
                value={form.discontinued_date || ''}
                onChange={(e) => onFormChange({ discontinued_date: e.target.value || null })}
                required
              />
            </div>
            <div>
              <Label htmlFor="discontinuation_reason">Reason</Label>
              <Textarea
                id="discontinuation_reason"
                value={form.discontinuation_reason || ''}
                onChange={(e) => onFormChange({ discontinuation_reason: e.target.value })}
                placeholder="Why is this product being discontinued?"
                rows={2}
              />
            </div>
          </div>
        )}
      </div>

      {/* Audit (read-only) */}
      {(form.created_by || form.updated_by) && (
        <div className="space-y-2 pt-2 border-t">
          <h3 className="text-sm font-semibold text-foreground">Audit</h3>
          <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
            <div><span className="font-medium">Created by:</span> {form.created_by ? (users[form.created_by] || form.created_by) : '—'}</div>
            <div><span className="font-medium">Updated by:</span> {form.updated_by ? (users[form.updated_by] || form.updated_by) : '—'}</div>
          </div>
        </div>
      )}
    </div>
  );
};
