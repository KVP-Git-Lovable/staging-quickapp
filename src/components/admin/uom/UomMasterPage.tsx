import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUp, ArrowDown, Loader2, Plus, Star, ChevronDown, ChevronRight, Lock, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { clearUomCache, clearCategoriesCache, loadCategories, type UomCategoryRow, type UomCategory } from '@/lib/uomEngine';
import { cn } from '@/lib/utils';

interface UomRow {
  id: string;
  code: string;
  name: string;
  category: UomCategory;
  enabled: boolean;
  display_order: number;
  is_default: boolean;
  is_default_sales: boolean;
  is_default_purchase: boolean;
  conversion_to_base: number | null;
  is_base: boolean;
  is_system: boolean;
}

const UNIVERSAL = new Set<string>(['Weight', 'Volume', 'Length']);

// ----- Number formatting helpers -------------------------------------------
const fmtBig = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });
function fmt(n: number): string {
  if (!isFinite(n)) return '—';
  if (n === 0) return '0';
  if (Math.abs(n) >= 1) return fmtBig.format(Number(n.toFixed(6)));
  // sub-1: keep up to 6 sig figs
  return Number(n.toPrecision(6)).toString();
}

// ===========================================================================
// Conversion Chain bar
// ===========================================================================
const ConversionChainBar: React.FC<{ units: UomRow[] }> = ({ units }) => {
  if (units.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap py-2 px-3 border border-border/50 rounded-md bg-muted/30">
      <span className="text-[10px] font-semibold text-muted-foreground tracking-wider mr-2">
        CONVERSION CHAIN:
      </span>
      {units.map((u, i) => {
        const next = units[i + 1];
        const factor =
          next && u.conversion_to_base && next.conversion_to_base
            ? next.conversion_to_base / u.conversion_to_base
            : null;
        return (
          <React.Fragment key={u.id}>
            <span
              className={cn(
                'inline-flex items-center gap-1 font-mono text-xs px-2 py-1 rounded border',
                u.is_base
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background border-border',
              )}
            >
              {u.code}
              {u.is_base && <Star className="h-3 w-3" fill="currentColor" />}
            </span>
            {next && (
              <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                {factor != null ? `× ${fmt(factor)} →` : '→'}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ===========================================================================
// Add custom unit dialog
// ===========================================================================
const AddCustomUnitDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  category: UomCategory;
  onCreated: () => void;
}> = ({ open, onOpenChange, category, onCreated }) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [conv, setConv] = useState('');
  const [saving, setSaving] = useState(false);
  const isQuantity = category === 'Quantity';

  useEffect(() => {
    if (open) {
      setCode('');
      setName('');
      setConv('');
    }
  }, [open]);

  const submit = async () => {
    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();
    if (!cleanCode || !cleanName) {
      toast.error('Code and Name are required');
      return;
    }
    let convVal: number | null = null;
    if (!isQuantity) {
      const parsed = parseFloat(conv);
      if (!parsed || parsed <= 0) {
        toast.error('Enter a positive conversion factor');
        return;
      }
      convVal = parsed;
    }
    setSaving(true);
    try {
      const { data: inserted, error } = await supabase
        .from('uom_master')
        .insert({
          code: cleanCode,
          name: cleanName,
          category,
          conversion_to_base: convVal,
          is_base: false,
          is_system: false,
        } as any)
        .select('id')
        .single();
      if (error) throw error;
      await supabase.from('enabled_units').insert({
        uom_id: (inserted as any).id,
        enabled: true,
        is_default: false,
        display_order: 50,
      } as any);
      toast.success(`${cleanCode} added`);
      onCreated();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to add unit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add custom unit to {category}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. PALLET"
                className="font-mono uppercase"
              />
            </div>
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pallet" />
            </div>
          </div>
          <div>
            <Label className="text-xs">
              Conversion to base unit
              {isQuantity && (
                <span className="ml-2 text-muted-foreground">— defined per product</span>
              )}
            </Label>
            <Input
              type="number"
              step="any"
              value={conv}
              onChange={(e) => setConv(e.target.value)}
              disabled={isQuantity}
              placeholder={isQuantity ? 'N/A — set on each product' : '1 unit = ? base units'}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add unit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ===========================================================================
// Single category card
// ===========================================================================
const CategoryCard: React.FC<{
  category: UomCategory;
  rows: UomRow[];
  savingId: string | null;
  onPersist: (row: UomRow, patch: Partial<UomRow>) => Promise<void>;
  onSetDefault: (row: UomRow) => Promise<void> | void;
  onSetDefaultPurchase: (row: UomRow) => Promise<void> | void;
  onMove: (row: UomRow, dir: -1 | 1) => void;
  onSaveConversion: (row: UomRow, value: number) => Promise<void>;
  onAddCustom: () => void;
}> = ({ category, rows, savingId, onPersist, onSetDefault, onSetDefaultPurchase, onMove, onSaveConversion, onAddCustom }) => {
  const [showHidden, setShowHidden] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const isUniversal = UNIVERSAL.has(category);
  const enabledRows = rows.filter((r) => r.enabled);
  const hiddenRows = rows.filter((r) => !r.enabled);
  const baseRow = rows.find((r) => r.is_base) ?? null;
  const defaultSalesRow = enabledRows.find((r) => r.is_default_sales) ?? enabledRows.find((r) => r.is_default) ?? null;
  const defaultPurchaseRow = enabledRows.find((r) => r.is_default_purchase) ?? null;
  const defaultRow = defaultSalesRow; // legacy alias used in row highlighting

  return (
    <Card className="border-border/60">
      <CardHeader className="py-3 px-4 border-b border-border/50">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            <span className="font-semibold text-sm">{category}</span>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] font-medium border-0',
                isUniversal
                  ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300'
                  : 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
              )}
            >
              {isUniversal ? 'universal conversion' : 'per-product conversion'}
            </Badge>
          </button>
          <span className="text-[10px] text-muted-foreground font-mono">
            {enabledRows.length} enabled, {hiddenRows.length} hidden
          </span>
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="p-4 space-y-3">
          {isUniversal && <ConversionChainBar units={enabledRows} />}

          {/* Primary (purchase) + Secondary (sales) default selectors */}
          <div className="grid md:grid-cols-2 gap-2">
            <div className="flex items-center gap-3 border border-border/50 rounded-md p-3">
              <Label className="text-[10px] font-semibold text-muted-foreground tracking-wider whitespace-nowrap">
                SECONDARY (SALES)
              </Label>
              <Select
                value={defaultSalesRow?.id || ''}
                onValueChange={(v) => {
                  const r = rows.find((x) => x.id === v);
                  if (r) onSetDefault(r);
                }}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Pick selling unit" />
                </SelectTrigger>
                <SelectContent>
                  {enabledRows.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="font-mono text-xs mr-2">{r.code}</span> — {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 border border-border/50 rounded-md p-3">
              <Label className="text-[10px] font-semibold text-muted-foreground tracking-wider whitespace-nowrap">
                PRIMARY (PURCHASE)
              </Label>
              <Select
                value={defaultPurchaseRow?.id || ''}
                onValueChange={(v) => {
                  const r = rows.find((x) => x.id === v);
                  if (r) onSetDefaultPurchase(r);
                }}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Pick buying unit" />
                </SelectTrigger>
                <SelectContent>
                  {enabledRows.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="font-mono text-xs mr-2">{r.code}</span> — {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Secondary unit pre-fills sales orders; primary unit pre-fills purchase orders / GRNs.
          </p>

          {/* Table header */}
          <div className="grid grid-cols-[80px_1fr_2fr_140px_70px_70px] gap-2 px-2 text-[10px] font-semibold text-muted-foreground tracking-wider">
            <div>CODE</div>
            <div>NAME</div>
            <div>CONVERSION (BOTH WAYS)</div>
            <div>RATE TO BASE</div>
            <div className="text-center">ENABLED</div>
            <div className="text-center">ORDER</div>
          </div>

          {/* Enabled rows */}
          <div className="space-y-1">
            {enabledRows.map((row) => (
              <UnitRow
                key={row.id}
                row={row}
                baseRow={baseRow}
                isUniversal={isUniversal}
                savingId={savingId}
                onPersist={onPersist}
                onMove={onMove}
                onSaveConversion={onSaveConversion}
              />
            ))}
          </div>

          {/* Hidden toggle */}
          {hiddenRows.length > 0 && (
            <button
              onClick={() => setShowHidden((s) => !s)}
              className="w-full text-left px-3 py-2 border border-dashed border-border rounded-md text-xs hover:bg-muted/30 transition-colors"
            >
              {showHidden ? '▲' : '▼'} {showHidden ? 'Hide' : 'Show'} {hiddenRows.length} hidden{' '}
              {hiddenRows.length === 1 ? 'unit' : 'units'}
            </button>
          )}
          {showHidden &&
            hiddenRows.map((row) => (
              <UnitRow
                key={row.id}
                row={row}
                baseRow={baseRow}
                isUniversal={isUniversal}
                savingId={savingId}
                onPersist={onPersist}
                onMove={onMove}
                onSaveConversion={onSaveConversion}
                muted
              />
            ))}

          {/* Add custom */}
          <Button
            variant="outline"
            className="w-full border-dashed text-xs"
            onClick={onAddCustom}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add custom unit to {category}
          </Button>
        </CardContent>
      )}
    </Card>
  );
};

// ===========================================================================
// Single row
// ===========================================================================
const UnitRow: React.FC<{
  row: UomRow;
  baseRow: UomRow | null;
  isUniversal: boolean;
  savingId: string | null;
  onPersist: (row: UomRow, patch: Partial<UomRow>) => Promise<void>;
  onMove: (row: UomRow, dir: -1 | 1) => void;
  onSaveConversion: (row: UomRow, value: number) => Promise<void>;
  muted?: boolean;
}> = ({ row, baseRow, isUniversal, savingId, onPersist, onMove, onSaveConversion, muted }) => {
  const [editVal, setEditVal] = useState(row.conversion_to_base?.toString() ?? '');
  useEffect(() => {
    setEditVal(row.conversion_to_base?.toString() ?? '');
  }, [row.conversion_to_base]);

  const isSaving = savingId === row.id;

  // Build the both-ways conversion text
  const conversionDisplay = useMemo(() => {
    if (!isUniversal) {
      return (
        <Badge className="bg-purple-500/10 text-purple-700 dark:text-purple-300 border-0 text-[10px]">
          per product
        </Badge>
      );
    }
    if (row.is_base) {
      return (
        <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-0 text-[10px]">
          ★ base unit — all conversions relative to this
        </Badge>
      );
    }
    if (!baseRow || !row.conversion_to_base) return <span className="text-muted-foreground text-xs">—</span>;
    const fwd = `1 ${row.code} = ${fmt(row.conversion_to_base)} ${baseRow.code}`;
    const inv = `1 ${baseRow.code} = ${fmt(1 / row.conversion_to_base)} ${row.code}`;
    return (
      <div className="flex flex-col leading-tight">
        <span className="font-mono text-xs">{fwd}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{inv}</span>
      </div>
    );
  }, [isUniversal, baseRow, row]);

  const handleBlur = () => {
    if (!isUniversal || row.is_base) return;
    const v = parseFloat(editVal);
    if (!v || v <= 0) {
      setEditVal(row.conversion_to_base?.toString() ?? '');
      return;
    }
    if (v === row.conversion_to_base) return;
    onSaveConversion(row, v);
  };

  return (
    <div
      className={cn(
        'grid grid-cols-[80px_1fr_2fr_140px_70px_70px] gap-2 items-center px-2 py-2 rounded-md border border-border/40',
        muted && 'opacity-60 bg-muted/20',
        row.is_default && 'bg-primary/5',
      )}
    >
      <div className="flex items-center gap-1">
        {row.is_default && <span className="h-2 w-2 rounded-full bg-primary" />}
        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-muted border border-border/50">
          {row.code}
        </span>
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-sm">{row.name}</span>
        {row.is_default && (
          <span className="text-[10px] text-primary font-medium">default</span>
        )}
      </div>
      <div>{conversionDisplay}</div>
      <div>
        {isUniversal && !row.is_base ? (
          <div className="flex items-center gap-1">
            <Input
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              onBlur={handleBlur}
              type="number"
              step="any"
              className="h-7 text-xs font-mono"
              disabled={isSaving}
            />
            <span className="text-[10px] text-muted-foreground font-mono">{baseRow?.code}</span>
          </div>
        ) : (
          <Badge variant="outline" className="text-[10px] font-mono">
            {row.is_base ? 'base' : 'n/a'}
          </Badge>
        )}
      </div>
      <div className="flex flex-col items-center gap-1">
        <Switch
          checked={row.enabled}
          disabled={isSaving}
          onCheckedChange={(v) => onPersist(row, { enabled: v })}
        />
        {row.is_base && (
          <span className="text-[9px] text-muted-foreground font-medium">base</span>
        )}
      </div>
      <div className="flex items-center justify-center gap-0.5">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={() => onMove(row, -1)}
          disabled={isSaving}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={() => onMove(row, 1)}
          disabled={isSaving}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};

// ===========================================================================
// Main page content
// ===========================================================================
export const UomMasterPageContent: React.FC = () => {
  const qc = useQueryClient();
  const [rows, setRows] = useState<UomRow[]>([]);
  const [categories, setCategories] = useState<UomCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [addCategory, setAddCategory] = useState<UomCategory | null>(null);
  const [confirmBaseToggle, setConfirmBaseToggle] = useState<{ row: UomRow; usage: { products: number; mappings: number } } | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: masters, error: e1 }, { data: enabled, error: e2 }, cats] = await Promise.all([
      supabase
        .from('uom_master')
        .select('id, code, name, category, is_base, is_system')
        .order('category')
        .order('name'),
      supabase
        .from('enabled_units')
        .select('uom_id, enabled, display_order, is_default, is_default_sales, is_default_purchase'),
      loadCategories(),
    ]);
    if (e1 || e2) {
      toast.error('Failed to load UoM master');
      setLoading(false);
      return;
    }
    setCategories(cats);
    const map = new Map((enabled ?? []).map((e: any) => [e.uom_id, e]));
    const merged: UomRow[] = (masters ?? []).map((m: any) => {
      const e = map.get(m.id);
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        category: m.category as UomCategory,
        enabled: e?.enabled ?? false,
        display_order: e?.display_order ?? 0,
        is_default: e?.is_default ?? false,
        is_default_sales: e?.is_default_sales ?? false,
        is_default_purchase: e?.is_default_purchase ?? false,
        conversion_to_base: null, // per-product, not on uom_master
        is_base: !!m.is_base,
        is_system: !!m.is_system,
      };
    });
    setRows(merged);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Dynamic category code list (enabled categories only, sorted by sort_order).
  const enabledCategoryCodes = useMemo(
    () => categories.filter((c) => c.enabled).map((c) => c.code),
    [categories],
  );

  const grouped = useMemo(() => {
    const out: Record<string, UomRow[]> = {};
    for (const code of enabledCategoryCodes) out[code] = [];
    for (const r of rows) {
      if (!out[r.category]) out[r.category] = [];
      out[r.category].push(r);
    }
    for (const k of Object.keys(out)) {
      out[k].sort((a, b) => {
        // Base first, then by display order, then by name
        if (a.is_base && !b.is_base) return -1;
        if (!a.is_base && b.is_base) return 1;
        return a.display_order - b.display_order || a.name.localeCompare(b.name);
      });
    }
    return out;
  }, [rows, enabledCategoryCodes]);

  const upsertEnabled = async (row: UomRow, patch: Partial<UomRow>) => {
    const next = { ...row, ...patch };
    const { error } = await supabase.from('enabled_units').upsert(
      {
        uom_id: row.id,
        enabled: next.enabled,
        display_order: next.display_order,
        is_default: next.is_default && next.enabled,
        is_default_sales: next.is_default_sales && next.enabled,
        is_default_purchase: next.is_default_purchase && next.enabled,
      },
      { onConflict: 'uom_id' },
    );
    return error;
  };

  const applyPersist = async (row: UomRow, patch: Partial<UomRow>) => {
    setSavingId(row.id);
    const error = await upsertEnabled(row, patch);
    setSavingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    const next = { ...row, ...patch };
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...next,
              is_default: next.is_default && next.enabled,
              is_default_sales: next.is_default_sales && next.enabled,
              is_default_purchase: next.is_default_purchase && next.enabled,
            }
          : r,
      ),
    );
    clearUomCache();
    qc.invalidateQueries({ queryKey: ['uom'] });
  };

  // Public persist — wraps applyPersist with a usage-aware confirmation when
  // the admin tries to disable a base unit (replaces the old hard block).
  const persist = async (row: UomRow, patch: Partial<UomRow>) => {
    if (row.is_base && patch.enabled === false) {
      const { data, error } = await supabase.rpc('get_unit_usage_count', { p_uom_id: row.id });
      if (error) {
        toast.error(error.message);
        return;
      }
      const usage = (data as any[])?.[0] || { products_using: 0, mappings_using: 0 };
      setConfirmBaseToggle({
        row,
        usage: { products: Number(usage.products_using || 0), mappings: Number(usage.mappings_using || 0) },
      });
      return;
    }
    await applyPersist(row, patch);
  };

  const setDefaultGeneric = async (
    row: UomRow,
    field: 'is_default_sales' | 'is_default_purchase' | 'is_default',
  ) => {
    if (!row.enabled) {
      toast.error('Enable the unit first to set it as default');
      return;
    }
    setSavingId(row.id);
    const sameCat = rows.filter((r) => r.category === row.category && r.id !== row.id && (r as any)[field]);
    for (const r of sameCat) {
      await upsertEnabled(r, { [field]: false } as any);
    }
    const error = await upsertEnabled(row, { enabled: true, [field]: true } as any);
    setSavingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    await load();
    clearUomCache();
    qc.invalidateQueries({ queryKey: ['uom'] });
  };

  const setDefault = (row: UomRow) => setDefaultGeneric(row, 'is_default_sales');
  const setDefaultPurchase = (row: UomRow) => setDefaultGeneric(row, 'is_default_purchase');

  const move = (row: UomRow, dir: -1 | 1) => {
    const list = grouped[row.category].filter((r) => r.enabled || !r.enabled);
    const idx = list.findIndex((r) => r.id === row.id);
    const swap = list[idx + dir];
    if (!swap) return;
    persist(row, { display_order: swap.display_order });
    persist(swap, { display_order: row.display_order });
  };

  const saveConversion = async (row: UomRow, value: number) => {
    setSavingId(row.id);
    const { error } = await supabase
      .from('uom_master')
      .update({ conversion_to_base: value } as any)
      .eq('id', row.id);
    setSavingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, conversion_to_base: value } : r)),
    );
    clearUomCache();
    qc.invalidateQueries({ queryKey: ['uom'] });
    toast.success(`${row.code} updated`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground flex-1">
          All units across all categories. Each category has a primary (purchase) and a secondary
          (sales) default that pre-fills product forms. Disabling a base unit only hides it from
          new product forms — existing products are unaffected.
        </p>
        <Button variant="outline" size="sm" onClick={() => setShowCategoryManager(true)}>
          Manage categories
        </Button>
      </div>

      {enabledCategoryCodes.map((cat) => (
        <CategoryCard
          key={cat}
          category={cat}
          rows={grouped[cat] || []}
          savingId={savingId}
          onPersist={persist}
          onSetDefault={setDefault}
          onSetDefaultPurchase={setDefaultPurchase}
          onMove={move}
          onSaveConversion={saveConversion}
          onAddCustom={() => setAddCategory(cat)}
        />
      ))}
      {addCategory && (
        <AddCustomUnitDialog
          open={!!addCategory}
          onOpenChange={(v) => !v && setAddCategory(null)}
          category={addCategory}
          onCreated={load}
        />
      )}

      {showCategoryManager && (
        <CategoryManagerDialog
          open={showCategoryManager}
          onOpenChange={setShowCategoryManager}
          categories={categories}
          onChanged={async () => {
            clearCategoriesCache();
            await load();
          }}
        />
      )}

      {confirmBaseToggle && (
        <AlertDialog open onOpenChange={(o) => !o && setConfirmBaseToggle(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Disable base unit {confirmBaseToggle.row.code}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmBaseToggle.usage.products > 0 ? (
                  <>
                    <strong>{confirmBaseToggle.usage.products}</strong> product
                    {confirmBaseToggle.usage.products === 1 ? '' : 's'} use{' '}
                    <strong>{confirmBaseToggle.row.code}</strong> across{' '}
                    <strong>{confirmBaseToggle.usage.mappings}</strong> mapping
                    {confirmBaseToggle.usage.mappings === 1 ? '' : 's'}. Disabling only hides this
                    unit from new product forms — existing products keep working.
                  </>
                ) : (
                  <>This base unit is not used by any product yet. Safe to disable.</>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  const r = confirmBaseToggle.row;
                  setConfirmBaseToggle(null);
                  await applyPersist(r, { enabled: false });
                }}
              >
                Disable anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
};

// ===========================================================================
// Categories manager dialog
// ===========================================================================
const CategoryManagerDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: UomCategoryRow[];
  onChanged: () => Promise<void> | void;
}> = ({ open, onOpenChange, categories, onChanged }) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const toggle = async (cat: UomCategoryRow, enabled: boolean) => {
    setBusyId(cat.id);
    const { error } = await supabase
      .from('uom_category')
      .update({ enabled })
      .eq('id', cat.id);
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    await onChanged();
  };

  const remove = async (cat: UomCategoryRow) => {
    if (cat.isSystem) {
      toast.error('System categories cannot be deleted — disable them instead.');
      return;
    }
    if (!confirm(`Delete category "${cat.name}"? Units already in this category remain in the database.`)) return;
    setBusyId(cat.id);
    const { error } = await supabase.from('uom_category').delete().eq('id', cat.id);
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    await onChanged();
  };

  const create = async () => {
    const c = code.trim();
    const n = name.trim();
    if (!c || !n) {
      toast.error('Code and Name are required');
      return;
    }
    const { error } = await supabase.from('uom_category').insert({
      code: c,
      name: n,
      description: description.trim() || null,
      is_system: false,
      enabled: true,
      sort_order: 100,
    } as any);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${c} added`);
    setCode('');
    setName('');
    setDescription('');
    setShowAdd(false);
    await onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>UoM Categories</DialogTitle>
          <DialogDescription>
            Categories group units (e.g. Weight, Medication, Electronics). System categories are
            ship-with-product and can be disabled but not deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 max-h-[50vh] overflow-y-auto">
          {categories.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 px-3 py-2 border border-border/40 rounded-md"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{c.code}</span>
                  <span className="text-sm font-medium">{c.name}</span>
                  {c.isSystem && (
                    <Badge variant="outline" className="text-[10px]">system</Badge>
                  )}
                </div>
                {c.description && (
                  <p className="text-[11px] text-muted-foreground truncate">{c.description}</p>
                )}
              </div>
              <Switch
                checked={c.enabled}
                disabled={busyId === c.id}
                onCheckedChange={(v) => toggle(c, v)}
              />
              {!c.isSystem && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive"
                  disabled={busyId === c.id}
                  onClick={() => remove(c)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {showAdd ? (
          <div className="space-y-3 border border-dashed border-border rounded-md p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Code</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. Textile"
                  className="font-mono"
                />
              </div>
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Textile" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description"
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={create}>
                Add category
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="w-full border-dashed" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add category
          </Button>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
