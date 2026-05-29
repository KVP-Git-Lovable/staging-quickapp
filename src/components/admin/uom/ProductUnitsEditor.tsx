import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, AlertCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useEnabledUnits } from '@/hooks/useEnabledUnits';
import { deriveProductMappings, type UomCategory } from '@/lib/uomEngine';
import { cn } from '@/lib/utils';

// ---- Public API -----------------------------------------------------------

export interface UnitRow {
  uomId: string;
  code: string;
  name: string;
  category: UomCategory;
  qtyPerPiece: number;
  conversionToBase: number;
  isBase: boolean;
  isDefaultSales: boolean;
  isPriceBasis: boolean;
  isDefaultPurchase?: boolean;
}

export interface PriceOverrideRow {
  uomId: string;
  code: string;
  name: string;
  rate: number;
  isDefaultPrice: boolean;
  notes?: string | null;
}

export interface ProductUnitsEditorValue {
  baseCategory: UomCategory;
  netWeightG: number | null;
  netVolumeMl: number | null;
  rows: UnitRow[];
  priceOverrides?: PriceOverrideRow[];
  /**
   * Step-1 selections — codes from UOM Master (e.g. "KG", "GRAM", "LITRE", "PIECE").
   * Decoupled from packaging rows so that for Weight/Volume products the user
   * can pick the auto-injected sibling unit (KG / LITRE) as the default sales
   * or price-basis unit, even though that unit isn't part of `rows`.
   */
  priceBasisCode?: string | null;
  defaultSalesCode?: string | null;
  defaultPurchaseCode?: string | null;
}

interface Props {
  value: ProductUnitsEditorValue;
  onChange: (v: ProductUnitsEditorValue) => void;
  className?: string;
  /** Base rate (₹) for the product, used by the Live Preview pricing chips. */
  productRate?: number;
}

// ---- Helpers --------------------------------------------------------------

const PIECE_CODE = 'PIECE';

const emptyValue: ProductUnitsEditorValue = {
  baseCategory: 'Weight',
  netWeightG: null,
  netVolumeMl: null,
  rows: [],
  priceOverrides: [],
  priceBasisCode: null,
  defaultSalesCode: null,
  defaultPurchaseCode: null,
};

function physicalSizeOf(v: ProductUnitsEditorValue): number {
  if (v.baseCategory === 'Weight') return Number(v.netWeightG || 0);
  if (v.baseCategory === 'Volume') return Number(v.netVolumeMl || 0);
  return 1;
}

function baseUnitLabel(cat: UomCategory): string {
  return cat === 'Weight' ? 'GRAM' : cat === 'Volume' ? 'ML' : 'PIECE';
}

function baseUnitShort(cat: UomCategory): string {
  return cat === 'Weight' ? 'g' : cat === 'Volume' ? 'ml' : 'pcs';
}

function physicalUnitNoun(cat: UomCategory): string {
  return cat === 'Weight' ? 'grams (G)' : cat === 'Volume' ? 'millilitres (ML)' : 'pieces';
}

/**
 * Generate the per-row inline math hint, e.g.
 *   "1 BOX = 16 pcs × 250 g = 4000 g = 4 KG"
 *   "1 STRIP = 10 pcs × 500 ml = 5000 ml = 5 L"
 *   "1 BOX = 24 pcs"
 *   "1 PCS = 1 piece (base unit)"
 */
function formatRowMath(row: UnitRow, v: ProductUnitsEditorValue): string {
  if (row.code === PIECE_CODE) return `1 ${row.code} = 1 piece (base unit)`;
  const qty = row.qtyPerPiece || 0;
  if (v.baseCategory === 'Quantity') {
    return `1 ${row.code} = ${qty} pcs`;
  }
  const physical = physicalSizeOf(v);
  if (!(physical > 0) || !(qty > 0)) {
    return `1 ${row.code} = ${qty} pcs × ? ${baseUnitShort(v.baseCategory)} (set physical size above)`;
  }
  const totalBase = qty * physical;
  if (v.baseCategory === 'Weight') {
    const kg = totalBase / 1000;
    const kgStr = Number.isInteger(kg) ? kg.toString() : kg.toFixed(3).replace(/\.?0+$/, '');
    return `1 ${row.code} = ${qty} pcs × ${physical} g = ${totalBase} g = ${kgStr} KG`;
  }
  // Volume
  const l = totalBase / 1000;
  const lStr = Number.isInteger(l) ? l.toString() : l.toFixed(3).replace(/\.?0+$/, '');
  return `1 ${row.code} = ${qty} pcs × ${physical} ml = ${totalBase} ml = ${lStr} L`;
}

/** Default pack-label suggestion (e.g. "1 box (16 pcs)"). */
function defaultPackLabel(row: UnitRow): string {
  const lower = row.name.toLowerCase();
  if (row.code === PIECE_CODE) return '1 piece';
  if (row.qtyPerPiece > 1) return `1 ${lower} (${row.qtyPerPiece} pcs)`;
  return `1 ${lower}`;
}

// ---- Component ------------------------------------------------------------

export const ProductUnitsEditor: React.FC<Props> = ({ value, onChange, className, productRate }) => {
  const { data: packagingCatalog = [], isLoading: pkgLoading } = useEnabledUnits('Quantity');
  const { data: baseCatUnits = [] } = useEnabledUnits(value.baseCategory);

  const [pickerCode, setPickerCode] = useState<string>('');

  // Auto-seed PIECE row 0. This also repairs legacy products that load with
  // zero product_uom_mapping rows: the parent opens with an empty value, then
  // Product Master hydration completes with rows still empty. Depending only on
  // packagingCatalog.length misses that second transition, so include row count.
  useEffect(() => {
    if (value.rows.length > 0) return;
    if (pkgLoading) return;
    const piece = packagingCatalog.find((u) => u.code === PIECE_CODE);
    if (!piece) return;
    onChange({
      ...value,
      rows: [
        {
          uomId: piece.uomId,
          code: piece.code,
          name: piece.name,
          category: 'Quantity',
          qtyPerPiece: 1,
          conversionToBase: 1,
          isBase: value.baseCategory === 'Quantity',
          isDefaultSales: true,
          isPriceBasis: true,
        },
      ],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkgLoading, packagingCatalog.length, value.rows.length]);

  const derivedPreview = useMemo(() => {
    if (value.rows.length === 0) return [] as ReturnType<typeof deriveProductMappings>;
    const physical = physicalSizeOf(value);
    if (value.baseCategory !== 'Quantity' && physical <= 0) return [];
    try {
      return deriveProductMappings({
        category: value.baseCategory,
        netWeightG: value.netWeightG,
        netVolumeMl: value.netVolumeMl,
        baseCategoryUnits: baseCatUnits.map((u) => ({
          uomId: u.uomId,
          code: u.code,
          name: u.name,
        })),
        packagingRows: value.rows.map((r) => ({
          uomId: r.uomId,
          code: r.code,
          name: r.name,
          qtyPerPiece: r.qtyPerPiece,
          isDefaultSales: r.isDefaultSales,
          isPriceBasis: r.isPriceBasis,
        })),
        priceBasisCode: value.priceBasisCode ?? null,
        defaultSalesCode: value.defaultSalesCode ?? null,
      });
    } catch {
      return [];
    }
  }, [value, baseCatUnits]);

  const usedIds = useMemo(() => new Set(value.rows.map((r) => r.uomId)), [value.rows]);
  const addable = useMemo(
    () => packagingCatalog.filter((u) => !usedIds.has(u.uomId)),
    [packagingCatalog, usedIds],
  );

  // ---- handlers --------------------------------------------------------------

  const setCategory = (cat: UomCategory) => {
    onChange({
      ...value,
      baseCategory: cat,
      netWeightG: cat === 'Weight' ? value.netWeightG : null,
      netVolumeMl: cat === 'Volume' ? value.netVolumeMl : null,
      rows: value.rows.map((r) =>
        r.code === PIECE_CODE ? { ...r, isBase: cat === 'Quantity' } : r,
      ),
    });
  };

  const setNetWeight = (g: string) => {
    const n = parseFloat(g);
    onChange({ ...value, netWeightG: isFinite(n) ? n : null });
  };
  const setNetVolume = (ml: string) => {
    const n = parseFloat(ml);
    onChange({ ...value, netVolumeMl: isFinite(n) ? n : null });
  };

  const addRow = () => {
    if (!pickerCode) return;
    const u = packagingCatalog.find((x) => x.code === pickerCode);
    if (!u) return;
    onChange({
      ...value,
      rows: [
        ...value.rows,
        {
          uomId: u.uomId,
          code: u.code,
          name: u.name,
          category: 'Quantity',
          qtyPerPiece: 1,
          conversionToBase: 1,
          isBase: false,
          isDefaultSales: false,
          isPriceBasis: false,
        },
      ],
    });
    setPickerCode('');
  };

  const removeRow = (uomId: string) => {
    const target = value.rows.find((r) => r.uomId === uomId);
    if (!target || target.code === PIECE_CODE) return;
    onChange({ ...value, rows: value.rows.filter((r) => r.uomId !== uomId) });
  };

  const setRowQty = (uomId: string, qty: number) => {
    onChange({
      ...value,
      rows: value.rows.map((r) =>
        r.uomId === uomId
          ? { ...r, qtyPerPiece: qty, conversionToBase: qty * physicalSizeOf(value) }
          : r,
      ),
    });
  };

  const setDefaultSales = (uomId: string) => {
    onChange({
      ...value,
      rows: value.rows.map((r) => ({
        ...r,
        isDefaultSales: r.uomId === uomId,
      })),
    });
  };

  const setPriceBasis = (uomId: string) => {
    onChange({
      ...value,
      rows: value.rows.map((r) => ({
        ...r,
        isPriceBasis: r.uomId === uomId,
      })),
    });
  };

  // For Weight/Volume products the price-basis & default-sales dropdowns are
  // populated from the base category catalog (e.g. KG, GRAM for Weight). For
  // Quantity-only products they fall back to the packaging rows.
  const topPickerOptions = useMemo(() => {
    if (value.baseCategory === 'Quantity') {
      return value.rows.map((r) => ({ code: r.code, name: r.name }));
    }
    return baseCatUnits.map((u) => ({ code: u.code, name: u.name }));
  }, [value.baseCategory, value.rows, baseCatUnits]);

  // Step-1 selections live directly on the editor value. Falling back to a
  // matching row flag keeps backward-compat with already-saved products that
  // were authored before this field existed.
  const currentPriceBasisCode =
    value.priceBasisCode ??
    value.rows.find((r) => r.isPriceBasis)?.code ??
    '';
  const currentDefaultSalesCode =
    value.defaultSalesCode ??
    value.rows.find((r) => r.isDefaultSales)?.code ??
    '';
  // Default Purchase falls back to Default Sales when never set (per approved Q3).
  const currentDefaultPurchaseCode =
    value.defaultPurchaseCode ??
    value.rows.find((r) => r.isDefaultPurchase)?.code ??
    currentDefaultSalesCode ??
    '';

  const setTopPriceBasis = (code: string) => {
    // For Quantity-only products, also mirror onto the matching packaging row
    // so the inline `default` chip in Step 2 stays in sync. For Weight/Volume
    // products the chosen code (KG / GRAM / LITRE / ML) lives only on the
    // top-level value — the engine flags the right derived row at save time.
    if (value.baseCategory === 'Quantity') {
      const matched = value.rows.find((r) => r.code === code);
      onChange({
        ...value,
        priceBasisCode: code,
        rows: matched
          ? value.rows.map((r) => ({ ...r, isPriceBasis: r.uomId === matched.uomId }))
          : value.rows,
      });
      return;
    }
    onChange({ ...value, priceBasisCode: code });
  };
  const setTopDefaultSales = (code: string) => {
    if (value.baseCategory === 'Quantity') {
      const matched = value.rows.find((r) => r.code === code);
      onChange({
        ...value,
        defaultSalesCode: code,
        rows: matched
          ? value.rows.map((r) => ({ ...r, isDefaultSales: r.uomId === matched.uomId }))
          : value.rows,
      });
      return;
    }
    onChange({ ...value, defaultSalesCode: code });
  };
  const setTopDefaultPurchase = (code: string) => {
    if (value.baseCategory === 'Quantity') {
      const matched = value.rows.find((r) => r.code === code);
      onChange({
        ...value,
        defaultPurchaseCode: code,
        rows: matched
          ? value.rows.map((r) => ({ ...r, isDefaultPurchase: r.uomId === matched.uomId }))
          : value.rows,
      });
      return;
    }
    onChange({ ...value, defaultPurchaseCode: code });
  };
  const setDefaultPurchaseRow = (uomId: string) => {
    onChange({
      ...value,
      rows: value.rows.map((r) => ({
        ...r,
        isDefaultPurchase: r.uomId === uomId,
      })),
      defaultPurchaseCode: value.rows.find((r) => r.uomId === uomId)?.code ?? value.defaultPurchaseCode ?? null,
    });
  };

  // ---- Section C handlers ----
  const overrides = value.priceOverrides ?? [];
  const overrideIds = useMemo(() => new Set(overrides.map((o) => o.uomId)), [overrides]);
  const addableOverrideUnits = useMemo(
    () => value.rows.filter((r) => !overrideIds.has(r.uomId)),
    [value.rows, overrideIds],
  );

  const addOverride = (uomId: string) => {
    const u = value.rows.find((r) => r.uomId === uomId);
    if (!u) return;
    onChange({
      ...value,
      priceOverrides: [
        ...overrides,
        {
          uomId: u.uomId,
          code: u.code,
          name: u.name,
          rate: 0,
          isDefaultPrice: overrides.length === 0,
          notes: null,
        },
      ],
    });
  };

  const updateOverride = (uomId: string, patch: Partial<PriceOverrideRow>) => {
    onChange({
      ...value,
      priceOverrides: overrides.map((o) => (o.uomId === uomId ? { ...o, ...patch } : o)),
    });
  };

  const removeOverride = (uomId: string) => {
    onChange({
      ...value,
      priceOverrides: overrides.filter((o) => o.uomId !== uomId),
    });
  };

  const setDefaultPrice = (uomId: string) => {
    onChange({
      ...value,
      priceOverrides: overrides.map((o) => ({ ...o, isDefaultPrice: o.uomId === uomId })),
    });
  };

  const physical = physicalSizeOf(value);

  // ---- render ----------------------------------------------------------------

  return (
    <div className={cn('space-y-4', className)}>
      {/* ============== STEP 1 — BASE UNIT SETUP ============== */}
      <section className="rounded-lg border bg-muted/20 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Step 1 — Base Unit Setup
          </h3>
          <Badge variant="secondary" className="text-[10px]">
            Base: {baseUnitLabel(value.baseCategory)}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Category</Label>
            <Select value={value.baseCategory} onValueChange={(v) => setCategory(v as UomCategory)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Weight">Weight (sold by grams / kg)</SelectItem>
                <SelectItem value="Volume">Volume (sold by ml / litre)</SelectItem>
                <SelectItem value="Quantity">Quantity only (no weight)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {value.baseCategory !== 'Quantity' && (
            <div>
              <Label className="text-xs text-muted-foreground">Physical size of 1 piece</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={
                    value.baseCategory === 'Weight'
                      ? (value.netWeightG ?? '')
                      : (value.netVolumeMl ?? '')
                  }
                  onChange={(e) =>
                    value.baseCategory === 'Weight'
                      ? setNetWeight(e.target.value)
                      : setNetVolume(e.target.value)
                  }
                  placeholder={value.baseCategory === 'Weight' ? 'e.g. 250' : 'e.g. 500'}
                  className="h-9 flex-1"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {physicalUnitNoun(value.baseCategory)}
                </span>
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">Price basis unit</Label>
            <Select value={currentPriceBasisCode} onValueChange={setTopPriceBasis}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Pick rate-quoted unit" />
              </SelectTrigger>
              <SelectContent>
                {topPickerOptions.map((u) => (
                  <SelectItem key={u.code} value={u.code}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Default sales unit</Label>
            <Select value={currentDefaultSalesCode} onValueChange={setTopDefaultSales}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Pick default sales unit" />
              </SelectTrigger>
              <SelectContent>
                {topPickerOptions.map((u) => (
                  <SelectItem key={u.code} value={u.code}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Default purchase unit</Label>
            <Select value={currentDefaultPurchaseCode} onValueChange={setTopDefaultPurchase}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Pick default purchase unit" />
              </SelectTrigger>
              <SelectContent>
                {topPickerOptions.map((u) => (
                  <SelectItem key={u.code} value={u.code}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">
              Used for GRN / purchase entry. Defaults to the sales unit if unset.
            </p>
          </div>
        </div>

        {value.baseCategory !== 'Quantity' &&
          (!currentPriceBasisCode || !currentDefaultSalesCode) && (
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Pick the rate-quoted unit (e.g. <span className="font-mono">KG</span>) and the
                default sales unit. These are saved on{' '}
                <span className="font-mono">product_uom_mapping</span> and drive Order Entry.
              </span>
            </div>
          )}
      </section>

      {/* ============== STEP 2 — PACKAGING ROWS ============== */}
      <section className="rounded-lg border bg-muted/20 p-4 space-y-3">
        <div>
          <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Step 2 — Packaging Rows{' '}
            <span className="font-normal normal-case tracking-normal text-[11px] text-muted-foreground/80">
              (add one row per packaging type this product uses)
            </span>
          </h3>
        </div>

        {/* Table */}
        <div className="rounded-md border bg-background overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[80px_120px_1fr_60px_100px_110px_70px] items-center gap-2 px-3 py-2 border-b bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <div>Unit</div>
            <div>Qty per 1 piece</div>
            <div>Label shown to user</div>
            <div className="text-center">Base?</div>
            <div className="text-center">Default sales?</div>
            <div className="text-center">Default purchase?</div>
            <div />
          </div>

          {/* Body rows */}
          {value.rows.map((row, idx) => {
            const isPiece = row.code === PIECE_CODE;
            const isBaseChip = isPiece; // PCS is always the base piece
            return (
              <div
                key={row.uomId}
                className={cn(
                  'border-b last:border-b-0',
                  row.isDefaultSales && 'bg-primary/5',
                )}
              >
                <div className="grid grid-cols-[80px_120px_1fr_60px_100px_110px_70px] items-center gap-2 px-3 py-2.5">
                  <div className="text-sm font-bold tracking-wide">{row.code}</div>

                  <div>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      value={row.qtyPerPiece}
                      disabled={isPiece}
                      onChange={(e) => setRowQty(row.uomId, parseFloat(e.target.value) || 0)}
                      className={cn(
                        'h-8 text-right',
                        isPiece && 'bg-muted/60 text-muted-foreground',
                      )}
                    />
                  </div>

                  <div>
                    <Input
                      readOnly
                      value={defaultPackLabel(row)}
                      className="h-8 bg-background"
                    />
                  </div>

                  <div className="text-center">
                    {isBaseChip ? (
                      <span className="inline-block rounded-full bg-primary/15 text-primary text-[10px] font-semibold px-2 py-0.5">
                        base
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </div>

                  <div className="text-center">
                    {row.isDefaultSales ? (
                      <button
                        type="button"
                        onClick={() => setDefaultSales(row.uomId)}
                        className="inline-block rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold px-2 py-0.5"
                      >
                        default
                      </button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDefaultSales(row.uomId)}
                        className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                      >
                        set
                      </Button>
                    )}
                  </div>

                  <div className="text-center">
                    {row.isDefaultPurchase ? (
                      <button
                        type="button"
                        onClick={() => setDefaultPurchaseRow(row.uomId)}
                        className="inline-block rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px] font-semibold px-2 py-0.5"
                      >
                        purchase
                      </button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDefaultPurchaseRow(row.uomId)}
                        className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                      >
                        set
                      </Button>
                    )}
                  </div>

                  <div className="text-right">
                    {!isPiece ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeRow(row.uomId)}
                        className="h-7 text-[11px] px-2 text-destructive hover:text-destructive"
                      >
                        remove
                      </Button>
                    ) : (
                      <span className="text-muted-foreground/30 text-xs">—</span>
                    )}
                  </div>
                </div>

                {/* Inline conversion math */}
                <div className="px-3 pb-2 -mt-1">
                  <p className="text-[11px] font-mono text-muted-foreground">
                    {formatRowMath(row, value)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add row */}
        <div className="flex items-center gap-2">
          <Select value={pickerCode} onValueChange={setPickerCode}>
            <SelectTrigger className="h-9 flex-1">
              <SelectValue
                placeholder={
                  pkgLoading
                    ? 'Loading units…'
                    : addable.length
                      ? '+ add packaging unit'
                      : 'No more packaging units available'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {addable.map((u) => (
                <SelectItem key={u.code} value={u.code}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" onClick={addRow} disabled={!pickerCode}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>

        {value.baseCategory !== 'Quantity' && !(physical > 0) && (
          <div className="flex items-start gap-2 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Enter the {value.baseCategory === 'Weight' ? 'net weight (g)' : 'net volume (ml)'} of
              one piece in Step 1 to compute pack conversions.
            </span>
          </div>
        )}
      </section>

      {/* ============== Section C — Price Overrides ============== */}
      <section className="rounded-lg border bg-muted/20 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Price Overrides <span className="font-normal normal-case tracking-normal text-[11px] text-muted-foreground/80">(optional)</span>
          </h3>
          <Badge variant="outline" className="text-[10px]">
            Falls back to derived price if empty
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground -mt-1">
          Set an exact rate for any unit (e.g. BOX = ₹1250). Units without an override
          continue to use the auto-derived price from <span className="font-mono">products.rate</span>.
        </p>

        {overrides.length > 0 && (
          <div className="space-y-2">
            {overrides.map((o) => (
              <div
                key={o.uomId}
                className={cn(
                  'flex items-center gap-2 rounded-md border bg-background p-2',
                  o.isDefaultPrice && 'border-primary/40',
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{o.name}</span>
                    {o.isDefaultPrice && (
                      <Badge variant="outline" className="text-[10px] h-5">
                        DEFAULT PRICE
                      </Badge>
                    )}
                  </div>
                  <Input
                    placeholder="Notes (optional)"
                    value={o.notes ?? ''}
                    onChange={(e) => updateOverride(o.uomId, { notes: e.target.value || null })}
                    className="h-7 text-xs mt-1"
                  />
                </div>

                <div className="flex flex-col items-end gap-0.5">
                  <Label className="text-[10px] text-muted-foreground">Rate (₹)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={o.rate}
                    onChange={(e) =>
                      updateOverride(o.uomId, { rate: parseFloat(e.target.value) || 0 })
                    }
                    className="h-8 w-24 text-right"
                  />
                </div>

                <Button
                  type="button"
                  variant={o.isDefaultPrice ? 'default' : 'ghost'}
                  size="sm"
                  title="Mark as the default price"
                  onClick={() => setDefaultPrice(o.uomId)}
                  className="h-9 px-2 text-xs"
                >
                  Default
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeOverride(o.uomId)}
                  className="h-9 w-9 p-0 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Select value="" onValueChange={(uomId) => uomId && addOverride(uomId)}>
            <SelectTrigger className="h-9 flex-1">
              <SelectValue
                placeholder={
                  addableOverrideUnits.length
                    ? 'Add price override for a unit…'
                    : value.rows.length === 0
                      ? 'Add packaging units first'
                      : 'All units already have an override'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {addableOverrideUnits.map((u) => (
                <SelectItem key={u.uomId} value={u.uomId}>
                  {u.name} ({u.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* ============== LIVE CONVERSION + PRICING PREVIEW ============== */}
      <section className="rounded-lg border bg-muted/20 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Live Preview
          </h3>
        </div>
        <p className="text-[11px] text-muted-foreground -mt-1">
          Auto-computed from above — no manual entry needed.
        </p>

        {derivedPreview.length > 0 ? (
          <>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1.5 font-semibold">
                Conversions
              </p>
              <div className="flex flex-wrap gap-1.5">
                {derivedPreview.map((r) => (
                  <Badge
                    key={`conv-${r.uomId}`}
                    variant={r.isBase ? 'default' : r.isDefaultSales ? 'secondary' : 'outline'}
                    className="text-[11px] font-mono"
                  >
                    1 {r.code} = {r.conversionToBase} {baseUnitLabel(value.baseCategory)}
                    {r.isDefaultSales ? ' • sold as' : ''}
                    {r.isDefaultPurchase ? ' • purchased as' : ''}
                  </Badge>
                ))}
              </div>
            </div>

            {productRate !== undefined && productRate > 0 && (() => {
              const basis = derivedPreview.find((r) => r.isPriceBasis) ?? derivedPreview.find((r) => r.isBase) ?? derivedPreview[0];
              const basisConv = basis?.conversionToBase || 1;
              const overrides = value.priceOverrides ?? [];
              return (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1.5 font-semibold">
                    Pricing — base rate ₹{productRate.toLocaleString('en-IN')} per {basis?.code ?? '—'}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {derivedPreview.map((r) => {
                      const override = overrides.find((o) => o.uomId === r.uomId);
                      const computed = override
                        ? override.rate
                        : productRate * (r.conversionToBase / basisConv);
                      const formatted = computed >= 100
                        ? Math.round(computed).toLocaleString('en-IN')
                        : computed.toFixed(2);
                      return (
                        <Badge
                          key={`price-${r.uomId}`}
                          variant={override ? 'default' : r.isDefaultSales ? 'secondary' : 'outline'}
                          className="text-[11px] font-mono"
                        >
                          ₹{formatted} / {r.code}
                          {override ? ' • override' : ''}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground italic pt-1">
            Add a unit in Step 2 to preview conversions.
          </p>
        )}
      </section>
    </div>
  );
};

export function emptyProductUnitsEditorValue(): ProductUnitsEditorValue {
  return { ...emptyValue };
}
