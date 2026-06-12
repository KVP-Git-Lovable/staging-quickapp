import { useEffect, useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLineItemUom, type UomContext } from '@/hooks/useLineItemUom';
import { useProductUnits } from '@/hooks/useProductUnits';
import type { ProductUnit } from '@/lib/uomEngine';

export interface LineItemUomSelection {
  uomId: string;
  uomCode: string;
  conversionToBase: number;
}

interface Props {
  productId: string;
  value?: string; // selected uomCode
  onChange: (sel: LineItemUomSelection) => void;
  context?: UomContext;
  className?: string;
  disabled?: boolean;
  /** When true and the product has only one active UOM, render nothing.
   *  When false, still render a disabled label (handy for table cells). */
  hideWhenSingle?: boolean;
}

const toSel = (u: ProductUnit): LineItemUomSelection => ({
  uomId: u.uomId,
  uomCode: u.code,
  conversionToBase: u.conversionToBase,
});

/**
 * Compact per-line UOM picker.
 * - Hides itself for single-UOM products (returns null) when `hideWhenSingle`.
 * - Auto-emits the contextual default once units load.
 * - All conversion math stays in the parent — this component only emits the snapshot.
 */
export default function LineItemUomSelect({
  productId,
  value,
  onChange,
  context = 'packing',
  className,
  disabled,
  hideWhenSingle = true,
}: Props) {
  const { loading, activeUnits, defaultUnit, isSingleUom } = useLineItemUom(productId, context);
  // Pulled separately for the secondary helper line. Same data source — React
  // Query dedupes the request — but lets us safely null-guard for legacy
  // products that lack any product_uom_mapping rows.
  const { data: productUnits } = useProductUnits(productId);

  // Emit default upward as soon as units are loaded (only when no value chosen yet).
  useEffect(() => {
    if (loading || !defaultUnit) return;
    if (value) return;
    onChange(toSel(defaultUnit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, defaultUnit?.code]);

  // ---- Bug-guard #3: secondary helper line, null-safe for legacy products.
  // We render "1 BOX = 4 KG = 16 PCS" by reading conversion factors directly
  // from the already-loaded productUnits list. We never call convert() against
  // a unit that isn't in productUnits — legacy products simply show no helper.
  const helperLine = useMemo(() => {
    const selectedCode = value || defaultUnit?.code;
    if (!selectedCode || !productUnits || productUnits.length === 0) return null;
    const selected = productUnits.find(
      (u) => u.code.toUpperCase() === selectedCode.toUpperCase(),
    );
    if (!selected) return null; // unknown unit on this product → render nothing

    const baseQty = selected.conversionToBase; // qty of base per 1 selected unit
    const parts: string[] = [];
    // Show conversions to every OTHER mapped unit, in display order:
    // big siblings first (KG, LITRE), then PIECE, then base, then others.
    const order = (u: typeof selected) => {
      const c = u.code.toUpperCase();
      if (c === 'KG' || c === 'LITRE') return 0;
      if (c === 'PIECE') return 1;
      if (u.isBase) return 3;
      return 2;
    };
    const others = productUnits
      .filter((u) => u.uomId !== selected.uomId && u.conversionToBase > 0)
      .sort((a, b) => order(a) - order(b));

    for (const u of others) {
      const qty = baseQty / u.conversionToBase;
      // Skip noisy near-zero results (e.g. 250g shown as 0.25 KG is fine,
      // but 1 PIECE shown as 0.001 KG isn't useful).
      if (!isFinite(qty) || qty <= 0) continue;
      const pretty = qty >= 100 ? Math.round(qty) : Number(qty.toFixed(qty >= 1 ? 2 : 3));
      parts.push(`${pretty} ${u.code}`);
    }
    if (parts.length === 0) return null;
    return `1 ${selected.code} = ${parts.join(' = ')}`;
  }, [value, defaultUnit?.code, productUnits]);

  if (loading) {
    return <span className="text-xs text-muted-foreground">…</span>;
  }
  if (activeUnits.length === 0) {
    return hideWhenSingle ? null : <span className="text-xs text-muted-foreground">—</span>;
  }
  if (isSingleUom && hideWhenSingle) {
    return null;
  }

  const handleChange = (code: string) => {
    const u = activeUnits.find((x) => x.code === code);
    if (u) onChange(toSel(u));
  };

  return (
    <div className="flex flex-col gap-0.5">
      <Select value={value || defaultUnit?.code || ''} onValueChange={handleChange} disabled={disabled}>
        <SelectTrigger className={className ?? 'h-7 w-24 text-xs'}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {activeUnits.map((u) => (
            <SelectItem key={u.uomId} value={u.code} className="text-xs">
              {u.code}
              {u.isBase ? ' (base)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {helperLine && (
        <span className="text-[10px] text-muted-foreground font-mono leading-tight">
          {helperLine}
        </span>
      )}
    </div>
  );
}

