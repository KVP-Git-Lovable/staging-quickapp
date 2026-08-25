import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tag } from "lucide-react";
import { ProductScheme } from "@/hooks/useOfflineSchemes";
import type { ManualSchemeSelection } from "@/utils/schemeEngine";

interface CartLine {
  id: string;            // engine line id (variant?.id || product.id)
  productId: string;
  variantId?: string;
  name: string;
  quantity: number;
  rate: number;          // tax-exclusive rate — the app's convention everywhere else
  unit: string;
  gstPercent?: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  scheme: ProductScheme | null;
  cartLines: CartLine[];
  initialSelection?: ManualSchemeSelection | null;
  onConfirm: (selection: ManualSchemeSelection) => void;
}

/** Money comparisons, below the paisa the dialog displays. */
const MONEY_EPSILON = 0.005;

const round2 = (n: number) => Math.round(n * 100) / 100;

export const ManualPerUnitApplyDialog: React.FC<Props> = ({
  isOpen, onClose, scheme, cartLines, initialSelection, onConfirm,
}) => {
  const valueType: 'amount' | 'percentage' =
    (scheme?.discount_value_type as 'amount' | 'percentage') === 'percentage' ? 'percentage' : 'amount';
  const cap = Number(scheme?.max_discount_per_unit || 0);
  const unit = scheme?.discount_unit || 'unit';
  const minQty = Number(scheme?.condition_quantity || 0);

  // Filter eligible lines: must match scheme target (product/variant) when set
  const eligibleLines = useMemo(() => {
    if (!scheme) return [];
    return cartLines.filter(l => {
      if (scheme.variant_id) return l.variantId === scheme.variant_id;
      if (scheme.product_id) return l.productId === scheme.product_id;
      if (scheme.target_product_ids?.length) return scheme.target_product_ids.includes(l.productId);
      return true; // all products
    });
  }, [scheme, cartLines]);

  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [perItemValues, setPerItemValues] = useState<Record<string, string>>({});
  // Whether the ₹ value typed per line already includes GST. Only meaningful for
  // amount-type discounts — a percentage-of-rate discount is scale-invariant, so
  // the toggle is hidden for those. Whatever mode is active, the value actually
  // stored via onConfirm is always normalized back to tax-exclusive, since that's
  // the convention schemeEngine.ts and every other discount in the app expects —
  // this dialog is the only place that needs to know a GST-inclusive number was typed.
  const [discountMode, setDiscountMode] = useState<'without_gst' | 'with_gst'>('without_gst');
  const showGstToggle = valueType === 'amount';

  /**
   * The figure being typed into the GST-inclusive total.
   *
   * "Value with GST" is the one total that can be typed into; "Value without
   * GST" is always derived from it and the discount, never entered. While the
   * field is being edited it shows exactly what was typed rather than the
   * recomputed figure, so the number is not rewritten under the cursor
   * mid-keystroke, while the tax-exclusive figure above keeps updating live. On
   * blur it goes back to showing what was actually reached, which is how a cap
   * or a rounded paisa becomes visible.
   */
  const [totalDraft, setTotalDraft] = useState<string | null>(null);
  // Set when the last typed total could not be reached because the scheme cap ran out.
  const [totalCapped, setTotalCapped] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // Seed selection: prefer prior selection (itemIds or legacy itemId), else select all eligible lines.
    const eligibleIds = eligibleLines.filter(l => !minQty || l.quantity >= minQty).map(l => l.id);
    const prior = (initialSelection?.itemIds && initialSelection.itemIds.length > 0)
      ? initialSelection.itemIds
      : (initialSelection?.itemId ? [initialSelection.itemId] : []);
    const valid = prior.filter(id => eligibleIds.includes(id));
    setSelectedItemIds(valid.length > 0 ? valid : eligibleIds);
    // Seed per-line values from prior selection if present, else from legacy single value.
    // Stored values are always tax-exclusive, so the seeded fields start in that mode too.
    const seed: Record<string, string> = {};
    const legacy = initialSelection?.perUnitDiscount ? String(initialSelection.perUnitDiscount) : '';
    const priorPerItem = initialSelection?.perItemDiscounts || {};
    eligibleIds.forEach(id => {
      if (priorPerItem[id] != null) seed[id] = String(priorPerItem[id]);
      else if (legacy) seed[id] = legacy;
    });
    setPerItemValues(seed);
    // Scheme's saved preference (set in Scheme Master) pre-selects the toggle —
    // reps can still switch it per order, this is just the starting point.
    setDiscountMode(scheme?.discount_gst_mode === 'with_gst' ? 'with_gst' : 'without_gst');
    setTotalDraft(null);
    setTotalCapped(false);
  }, [isOpen, scheme?.id]);

  const toggleLine = (id: string) => {
    setSelectedItemIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // The cap is a tax-exclusive business limit. In "with GST" mode the raw typed
  // discount number is larger than the effective ex-GST discount by (1 + gst%), so
  // the raw input is allowed to go proportionally higher — it still nets out to at
  // most `cap` once normalized.
  const rawCapFor = (line: CartLine | undefined) => {
    const gstPct = line?.gstPercent || 0;
    if (showGstToggle && discountMode === 'with_gst' && gstPct > 0) {
      return cap * (1 + gstPct / 100);
    }
    return cap;
  };

  // The tax-exclusive ₹/unit discount implied by whatever was typed — used to
  // compute preview amounts. For 'percentage' type this is rate × pct/100, scaled
  // down further if the raw number was GST-inclusive.
  const perUnitAmountFor = (rawEntered: number, line: CartLine) => {
    const gstPct = line.gstPercent || 0;
    const perUnitRaw = valueType === 'percentage' ? line.rate * (rawEntered / 100) : rawEntered;
    if (showGstToggle && discountMode === 'with_gst' && gstPct > 0) {
      return perUnitRaw / (1 + gstPct / 100);
    }
    return perUnitRaw;
  };

  // The value to actually persist via onConfirm, in the shape schemeEngine.ts
  // expects: for 'percentage' type, the raw percentage unchanged (GST mode doesn't
  // apply — engine re-derives the amount from rate itself); for 'amount' type, a
  // tax-exclusive ₹/unit figure, converting out of GST-inclusive if that was typed.
  const storedValueFor = (rawEntered: number, line: CartLine) => {
    if (valueType === 'percentage') return rawEntered;
    const gstPct = line.gstPercent || 0;
    if (showGstToggle && discountMode === 'with_gst' && gstPct > 0) {
      return rawEntered / (1 + gstPct / 100);
    }
    return rawEntered;
  };

  const setLineValue = (id: string, raw: string) => {
    // Kept exactly as typed so a part-written decimal such as "12." survives the
    // keystroke. Every figure derived from it is clamped to the cap already, and
    // the field itself is tidied up on blur.
    setPerItemValues(prev => ({ ...prev, [id]: raw }));
    setTotalCapped(false);
  };

  const normalizeLineValue = (id: string) => {
    setPerItemValues(prev => {
      const raw = prev[id];
      if (raw == null || raw === '') return prev;
      const n = Number(raw);
      if (Number.isNaN(n)) return { ...prev, [id]: '' };
      const line = eligibleLines.find(l => l.id === id);
      return { ...prev, [id]: String(round2(Math.max(0, Math.min(rawCapFor(line), n)))) };
    });
  };

  const selectedLines = eligibleLines.filter(l => selectedItemIds.includes(l.id));

  // Tax-exclusive discount amount for a line — the figure used everywhere the app
  // already speaks in ex-GST terms (row label, downstream onConfirm payload).
  const lineDiscountFor = (line: CartLine) => {
    const raw = Number(perItemValues[line.id]) || 0;
    if (raw <= 0) return 0;
    const capped = Math.max(0, Math.min(rawCapFor(line), raw));
    return perUnitAmountFor(capped, line) * line.quantity;
  };
  const previewDiscount = selectedLines.reduce((sum, l) => sum + lineDiscountFor(l), 0);

  // Post-discount line/order totals, shown both ways so it's unambiguous which
  // figure a retailer is actually being charged.
  const lineTotalsFor = (line: CartLine) => {
    const grossExGst = line.rate * line.quantity;
    const netExGst = Math.max(0, grossExGst - lineDiscountFor(line));
    const gstPct = line.gstPercent || 0;
    const netInclGst = netExGst * (1 + gstPct / 100);
    return { netExGst, netInclGst };
  };
  const totalExGst = selectedLines.reduce((sum, l) => sum + lineTotalsFor(l).netExGst, 0);
  const totalInclGst = selectedLines.reduce((sum, l) => sum + lineTotalsFor(l).netInclGst, 0);
  const linesWithValue = selectedLines.filter(l => (Number(perItemValues[l.id]) || 0) > 0);

  const symbol = valueType === 'percentage' ? '%' : '₹';
  const capLabel = valueType === 'percentage' ? `${cap}%` : `₹${cap}`;

  /* ── Working a typed total backwards into per-line discounts ───────────── */

  /** Largest tax-exclusive ₹/unit discount a line may carry under the scheme cap. */
  const maxPerUnitExGst = (line: CartLine) =>
    valueType === 'percentage' ? line.rate * (cap / 100) : cap;

  /** Turn a tax-exclusive ₹/unit discount back into the number the row shows. */
  const rawFromPerUnitExGst = (perUnitExGst: number, line: CartLine) => {
    if (valueType === 'percentage') {
      return line.rate > 0 ? (perUnitExGst / line.rate) * 100 : 0;
    }
    const gstPct = line.gstPercent || 0;
    return (showGstToggle && discountMode === 'with_gst' && gstPct > 0)
      ? perUnitExGst * (1 + gstPct / 100)
      : perUnitExGst;
  };

  /**
   * The per-line discounts that bring the selected lines to a given GST-inclusive total.
   *
   * The reduction needed is shared out in proportion to what each line is worth
   * (GST-inclusive), so a bigger line absorbs a bigger share. A line that hits
   * the scheme cap stops taking more and hands the rest back to the lines that
   * still have room, which is repeated until either the target is met or every
   * line is capped.
   *
   * Only the GST-inclusive total is solved for; the tax-exclusive figure is
   * derived from the result, never entered.
   */
  const solveForTotal = (target: number) => {
    const lines = selectedLines.filter(l => l.quantity > 0 && l.rate > 0);
    if (lines.length === 0) return null;

    const gstMultOf = (l: CartLine) => 1 + (l.gstPercent || 0) / 100;
    const grossOf = (l: CartLine) => l.rate * l.quantity * gstMultOf(l);
    const maxCutOf = (l: CartLine) => maxPerUnitExGst(l) * l.quantity * gstMultOf(l);

    const gross = lines.reduce((s, l) => s + grossOf(l), 0);
    const ceiling = lines.reduce((s, l) => s + maxCutOf(l), 0);
    const wanted = Math.max(0, gross - Math.max(0, target));
    const required = Math.min(ceiling, wanted);

    const cut = new Map<string, number>(lines.map(l => [l.id, 0]));
    let remaining = required;
    let pool = lines.slice();
    // One pass per line is always enough to settle every cap, since each pass
    // either exhausts the remainder or removes at least one line from the pool.
    for (let pass = 0; pass < lines.length && remaining > MONEY_EPSILON && pool.length > 0; pass++) {
      const poolGross = pool.reduce((s, l) => s + grossOf(l), 0);
      if (poolGross <= 0) break;
      let taken = 0;
      const next: CartLine[] = [];
      for (const l of pool) {
        const room = maxCutOf(l) - (cut.get(l.id) || 0);
        const take = Math.min(remaining * (grossOf(l) / poolGross), room);
        cut.set(l.id, (cut.get(l.id) || 0) + take);
        taken += take;
        if (room - take > MONEY_EPSILON) next.push(l);
      }
      remaining -= taken;
      if (taken <= MONEY_EPSILON) break;
      pool = next;
    }

    /*
     * The per-row figures are rounded to paise, because that is what a rep can
     * read and retype. A rounded per-unit discount is worth quantity × that
     * rounding on the line, so a target that does not divide cleanly by the
     * quantity can end a paisa or two away — the field shows the figure actually
     * reached once it is left, so what is displayed is always what gets applied.
     */
    const values: Record<string, string> = {};
    lines.forEach(l => {
      // cut is a GST-inclusive amount here; convert back to the tax-exclusive
      // per-unit discount every other figure in this dialog is stored/shown as.
      const perUnitExGst = ((cut.get(l.id) || 0) / gstMultOf(l)) / l.quantity;
      values[l.id] = String(round2(Math.max(0, rawFromPerUnitExGst(perUnitExGst, l))));
    });
    return { values, capped: wanted - required > MONEY_EPSILON };
  };

  /** The lowest GST-inclusive total the scheme cap allows the selection to reach. */
  const capFloor = () =>
    selectedLines.reduce((sum, l) => {
      const gstMult = 1 + (l.gstPercent || 0) / 100;
      return sum + Math.max(0, (l.rate * l.quantity - maxPerUnitExGst(l) * l.quantity) * gstMult);
    }, 0);

  const onTotalTyped = (text: string) => {
    setTotalDraft(text);
    const n = Number(text.replace(/,/g, ''));
    if (text.trim() === '' || Number.isNaN(n)) return;
    const solved = solveForTotal(n);
    if (!solved) return;
    setPerItemValues(prev => ({ ...prev, ...solved.values }));
    setTotalCapped(solved.capped);
  };

  const canConfirm = linesWithValue.length > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    const ids = linesWithValue.map(l => l.id);
    const perItemDiscounts: Record<string, number> = {};
    let firstVal = 0;
    ids.forEach((id, i) => {
      const line = eligibleLines.find(l => l.id === id)!;
      const raw = Number(perItemValues[id]) || 0;
      const v = Math.min(cap, storedValueFor(Math.max(0, Math.min(rawCapFor(line), raw)), line));
      perItemDiscounts[id] = v;
      if (i === 0) firstVal = v;
    });
    onConfirm({
      itemId: ids[0],
      itemIds: ids,
      perUnitDiscount: firstVal, // legacy/back-compat
      perItemDiscounts,
      valueType,
    });
    onClose();
  };

  if (!scheme) return null;

  const totalFieldValue = totalDraft ?? totalInclGst.toFixed(2);

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Tag className="w-4 h-4 text-primary" />
            Apply: {scheme.name}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Cap: {capLabel} {valueType === 'amount' ? `/ ${unit}` : `off per ${unit}`}
            {minQty ? ` · Min qty ${minQty}${unit ? ` ${unit}` : ''}` : ''}
          </p>
        </DialogHeader>

        <div className="space-y-3">
          {showGstToggle && (
            <div>
              <Label className="text-xs font-medium">The ₹ value you type below is</Label>
              <div className="flex gap-1.5 mt-1.5">
                <button
                  type="button"
                  onClick={() => setDiscountMode('without_gst')}
                  className={`flex-1 text-[11px] py-1.5 rounded border transition-colors ${
                    discountMode === 'without_gst'
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  Without GST
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountMode('with_gst')}
                  className={`flex-1 text-[11px] py-1.5 rounded border transition-colors ${
                    discountMode === 'with_gst'
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  With GST
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {discountMode === 'without_gst'
                  ? 'Reduces the taxable rate — GST is then added on the discounted amount. This matches the app’s catalog prices.'
                  : 'The final, tax-included price drops by exactly this much — GST is backed out automatically.'}
              </p>
            </div>
          )}

          <div>
            <Label className="text-xs font-medium">Pick products from your cart</Label>
            {eligibleLines.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-2 p-3 bg-muted/40 rounded">
                No eligible product in cart for this offer. Add one first.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between mt-2 mb-1">
                  <button
                    type="button"
                    className="text-[11px] text-primary hover:underline"
                    onClick={() => {
                      const all = eligibleLines.filter(l => !minQty || l.quantity >= minQty).map(l => l.id);
                      setSelectedItemIds(selectedItemIds.length === all.length ? [] : all);
                    }}
                  >
                    {selectedItemIds.length === eligibleLines.filter(l => !minQty || l.quantity >= minQty).length
                      ? 'Clear all'
                      : 'Select all'}
                  </button>
                  <span className="text-[11px] text-muted-foreground">
                    {selectedItemIds.length} selected
                  </span>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1">
                  {eligibleLines.map(line => {
                    const disabled = !!minQty && line.quantity < minQty;
                    const checked = selectedItemIds.includes(line.id);
                    const lineVal = perItemValues[line.id] ?? '';
                    const lineDiscount = checked ? lineDiscountFor(line) : 0;
                    return (
                      <div
                        key={line.id}
                        className={`flex items-center gap-2 p-2 rounded border text-xs ${
                          checked ? 'border-primary bg-primary/5' : 'border-border'
                        } ${disabled ? 'opacity-50' : ''}`}
                      >
                        <label className={`flex items-center gap-2 min-w-0 flex-1 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                          <Checkbox
                            checked={checked}
                            disabled={disabled}
                            onCheckedChange={() => !disabled && toggleLine(line.id)}
                          />
                          <div className="min-w-0">
                            <div className="truncate font-medium">{line.name}</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {line.quantity} {line.unit} @ ₹{line.rate.toFixed(2)}
                              {disabled ? ` · need ≥${minQty}` : ''}
                              {checked && lineDiscount > 0 ? ` · −₹${lineDiscount.toFixed(2)}` : ''}
                            </div>
                          </div>
                        </label>
                        <div className="relative shrink-0 w-[88px]">
                          <Input
                            type="text"
                            inputMode="decimal"
                            disabled={disabled || !checked}
                            value={lineVal}
                            onChange={(e) => setLineValue(line.id, e.target.value)}
                            onBlur={() => normalizeLineValue(line.id)}
                            placeholder={`0–${rawCapFor(line).toFixed(2)}`}
                            aria-label={`Discount per ${unit} for ${line.name}`}
                            className="pr-6 h-7 text-xs"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{symbol}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Enter a per-{unit} discount on each row · max {capLabel}
          </p>

          {selectedLines.length > 0 && (
            <div className="bg-muted/50 rounded p-2 text-xs space-y-1">
              <div className="font-medium">Preview</div>
              <div className="text-muted-foreground">
                {linesWithValue.length} product{linesWithValue.length === 1 ? '' : 's'}
                {' · total '}
                <span className="font-semibold text-foreground">₹{previewDiscount.toFixed(2)}</span> off
                {showGstToggle && ' (tax-exclusive)'}
              </div>

              {/* Derived, never entered — follows whatever the GST-inclusive
                  total currently is. */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
                <span className="text-muted-foreground">Value without GST</span>
                <span className="font-semibold text-foreground pr-2">₹{totalExGst.toFixed(2)}</span>
              </div>

              {/* The GST-inclusive total can be typed into, which works the
                  per-row discounts backwards; editing a row works it forwards. */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Value with GST</span>
                <div className="relative w-[104px] shrink-0">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={totalFieldValue}
                    onChange={(e) => onTotalTyped(e.target.value)}
                    onBlur={() => setTotalDraft(null)}
                    aria-label="Value with GST"
                    className="h-7 pl-5 text-xs text-right font-semibold"
                  />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">₹</span>
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground">
                Type the value with GST to set the discount from the total instead — it is
                shared across the selected rows, up to the {capLabel} / {unit} cap. The value
                without GST follows on its own.
              </p>
              {totalCapped && (
                <p className="text-[10px] text-amber-600">
                  The {capLabel} cap stops this going below ₹{capFloor().toFixed(2)}.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!canConfirm} onClick={handleConfirm}>
            Apply Offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
