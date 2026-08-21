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
  }, [isOpen, scheme?.id]);

  const toggleLine = (id: string) => {
    setSelectedItemIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // The cap is a tax-exclusive business limit. In "with GST" mode the raw typed
  // number is larger than the effective ex-GST discount by (1 + gst%), so the raw
  // input is allowed to go proportionally higher — it still nets out to at most `cap`
  // once normalized.
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
    if (raw === '') {
      setPerItemValues(prev => ({ ...prev, [id]: '' }));
      return;
    }
    const n = Number(raw);
    if (Number.isNaN(n)) return;
    const line = eligibleLines.find(l => l.id === id);
    setPerItemValues(prev => ({ ...prev, [id]: String(Math.max(0, Math.min(rawCapFor(line), n))) }));
  };

  const selectedLines = eligibleLines.filter(l => selectedItemIds.includes(l.id));
  // Tax-exclusive discount amount for a line — the figure used everywhere the app
  // already speaks in ex-GST terms (row label, downstream onConfirm payload).
  const lineDiscountFor = (line: CartLine) => {
    const raw = Math.max(0, Math.min(rawCapFor(line), Number(perItemValues[line.id]) || 0));
    if (raw <= 0) return 0;
    return perUnitAmountFor(raw, line) * line.quantity;
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

  // The total fields are only directly editable when exactly one product is
  // selected — with more than one, "the total" doesn't map back to a single
  // line's discount unambiguously, so they stay read-only in that case.
  const soleSelectedLine = selectedLines.length === 1 ? selectedLines[0] : null;

  // Reverse-calculates the per-unit discount needed for `soleSelectedLine` to
  // reach a typed target total, and writes it straight back into that line's
  // discount field — so it's the exact same value the row's own input holds.
  const applyTargetTotal = (target: 'ex_gst' | 'incl_gst', raw: string) => {
    if (!soleSelectedLine) return;
    if (raw === '') return;
    const n = Number(raw);
    if (Number.isNaN(n)) return;
    const line = soleSelectedLine;
    const gross = line.rate * line.quantity;
    const gstPct = line.gstPercent || 0;
    const targetNetExGst = target === 'incl_gst' && gstPct > 0 ? n / (1 + gstPct / 100) : n;
    const neededDiscountTotal = Math.max(0, gross - targetNetExGst);
    const perUnitExGst = line.quantity > 0 ? neededDiscountTotal / line.quantity : 0;
    const cappedExGst = Math.min(cap, perUnitExGst);
    // Convert back into whatever "raw" shape the discount field itself expects —
    // the inverse of perUnitAmountFor / storedValueFor above.
    const rawForField = (showGstToggle && discountMode === 'with_gst' && gstPct > 0)
      ? cappedExGst * (1 + gstPct / 100)
      : cappedExGst;
    setPerItemValues(prev => ({ ...prev, [line.id]: String(Math.max(0, rawForField)) }));
  };

  const symbol = valueType === 'percentage' ? '%' : '₹';
  const capLabel = valueType === 'percentage' ? `${cap}%` : `₹${cap}`;

  const canConfirm = linesWithValue.length > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    const ids = linesWithValue.map(l => l.id);
    const perItemDiscounts: Record<string, number> = {};
    let firstVal = 0;
    ids.forEach((id, i) => {
      const line = eligibleLines.find(l => l.id === id)!;
      const raw = Math.max(0, Math.min(rawCapFor(line), Number(perItemValues[id]) || 0));
      const v = Math.min(cap, storedValueFor(raw, line));
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
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={rawCapFor(line)}
                            step="0.01"
                            disabled={disabled || !checked}
                            value={lineVal}
                            onChange={(e) => setLineValue(line.id, e.target.value)}
                            placeholder={`0–${rawCapFor(line).toFixed(2)}`}
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

          {linesWithValue.length > 0 && (
            <div className="bg-muted/50 rounded p-2 text-xs space-y-1">
              <div className="font-medium">Preview</div>
              <div className="text-muted-foreground">
                {linesWithValue.length} product{linesWithValue.length > 1 ? 's' : ''}
                {' · total '}
                <span className="font-semibold text-foreground">₹{previewDiscount.toFixed(2)}</span> off
                {showGstToggle && ' (tax-exclusive)'}
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-border/60">
                <span className="text-muted-foreground">Value without GST</span>
                {soleSelectedLine ? (
                  <div className="relative w-[110px]">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">₹</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={totalExGst.toFixed(2)}
                      onChange={(e) => applyTargetTotal('ex_gst', e.target.value)}
                      className="pl-5 h-6 text-xs text-right font-semibold"
                    />
                  </div>
                ) : (
                  <span className="font-semibold text-foreground">₹{totalExGst.toFixed(2)}</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Value with GST</span>
                {soleSelectedLine ? (
                  <div className="relative w-[110px]">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">₹</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={totalInclGst.toFixed(2)}
                      onChange={(e) => applyTargetTotal('incl_gst', e.target.value)}
                      className="pl-5 h-6 text-xs text-right font-semibold"
                    />
                  </div>
                ) : (
                  <span className="font-semibold text-foreground">₹{totalInclGst.toFixed(2)}</span>
                )}
              </div>
              {soleSelectedLine && (
                <p className="text-[10px] text-muted-foreground pt-0.5">
                  Editing either total works out the matching discount above — capped at ₹{cap}/{unit}.
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
