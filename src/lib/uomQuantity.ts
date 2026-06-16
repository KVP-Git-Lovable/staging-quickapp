/**
 * UOM-aware quantity helpers.
 *
 * Single source of truth for "how many base units did this line sell?".
 *
 * Priority:
 *   1. `conversion_to_base` snapshot on the line (set by the UOM engine at order time)
 *   2. Text-based fallback for legacy rows that predate the snapshot
 *
 * Base unit is the smallest physical unit per category:
 *   Weight   → GRAM   (KG = 1000)
 *   Volume   → ML     (L  = 1000)
 *   Quantity → PIECE
 */

export type UomCategoryGuess = 'Weight' | 'Volume' | 'Quantity' | 'Unknown';

const WEIGHT_BASE_TOKENS = ['g', 'gm', 'gms', 'gram', 'grams'];
const WEIGHT_LARGE_TOKENS = ['kg', 'kilogram', 'kilograms'];
const VOLUME_BASE_TOKENS = ['ml', 'milliliter', 'millilitre', 'milliliters', 'millilitres'];
const VOLUME_LARGE_TOKENS = ['l', 'lt', 'ltr', 'liter', 'litre', 'liters', 'litres'];
const PIECE_TOKENS = ['pc', 'pcs', 'piece', 'pieces', 'unit', 'units', 'nos', 'no'];

function norm(s?: string | null) {
  return (s || '').toString().trim().toLowerCase();
}

/** Resolve a line quantity to its base-unit equivalent. */
export function resolveToBase(
  qty: number | string | null | undefined,
  unitText?: string | null,
  conversionToBase?: number | string | null,
): number {
  const q = Number(qty || 0);
  if (!q) return 0;

  // 1) Trust the snapshot when present and sensible.
  const conv = Number(conversionToBase);
  if (Number.isFinite(conv) && conv > 0) return q * conv;

  // 2) Text fallback for legacy rows.
  const u = norm(unitText);
  if (!u) return q;
  if (WEIGHT_LARGE_TOKENS.includes(u)) return q * 1000; // kg → g
  if (WEIGHT_BASE_TOKENS.includes(u)) return q;
  if (VOLUME_LARGE_TOKENS.includes(u)) return q * 1000; // L → ml
  if (VOLUME_BASE_TOKENS.includes(u)) return q;
  if (PIECE_TOKENS.includes(u)) return q;
  return q;
}

/** Best-effort category guess from a unit text (used when no DB category is available). */
export function guessCategory(unitText?: string | null): UomCategoryGuess {
  const u = norm(unitText);
  if (WEIGHT_BASE_TOKENS.includes(u) || WEIGHT_LARGE_TOKENS.includes(u)) return 'Weight';
  if (VOLUME_BASE_TOKENS.includes(u) || VOLUME_LARGE_TOKENS.includes(u)) return 'Volume';
  if (PIECE_TOKENS.includes(u)) return 'Quantity';
  return 'Unknown';
}

export interface FormattedQty {
  primary: string;   // e.g. "12,500 g"
  secondary?: string; // e.g. "12.5 KG"
  unitLabel: string;  // short label e.g. "g", "ml", "Pcs"
}

/** Format a base-unit quantity for display, optionally with a large-unit secondary line. */
export function formatBaseQty(
  baseQty: number,
  category: UomCategoryGuess | string = 'Unknown',
): FormattedQty {
  const cat = (category as string) || 'Unknown';
  const q = Number(baseQty || 0);

  if (cat === 'Weight') {
    const kg = q / 1000;
    return {
      primary: `${Math.round(q).toLocaleString()} g`,
      secondary: kg >= 1 ? `${kg.toFixed(kg >= 100 ? 1 : 2)} KG` : undefined,
      unitLabel: 'g',
    };
  }
  if (cat === 'Volume') {
    const l = q / 1000;
    return {
      primary: `${Math.round(q).toLocaleString()} ml`,
      secondary: l >= 1 ? `${l.toFixed(l >= 100 ? 1 : 2)} L` : undefined,
      unitLabel: 'ml',
    };
  }
  if (cat === 'Quantity') {
    return {
      primary: `${Math.round(q).toLocaleString()} Pcs`,
      unitLabel: 'Pcs',
    };
  }
  return {
    primary: `${q.toLocaleString()}`,
    unitLabel: '',
  };
}

/** Sum a list of {quantity, unit, conversion_to_base} rows into a single base-unit total. */
export function aggregateToBase(
  items: Array<{
    quantity?: number | string | null;
    unit?: string | null;
    conversion_to_base?: number | string | null;
  }>,
): number {
  let total = 0;
  for (const it of items || []) {
    total += resolveToBase(it.quantity, it.unit, it.conversion_to_base);
  }
  return total;
}

/** Pick a sensible category for a mixed bucket of units (returns 'Unknown' if mixed). */
export function dominantCategory(units: Array<string | null | undefined>): UomCategoryGuess {
  let weight = 0,
    volume = 0,
    qty = 0,
    other = 0;
  for (const u of units) {
    const c = guessCategory(u);
    if (c === 'Weight') weight++;
    else if (c === 'Volume') volume++;
    else if (c === 'Quantity') qty++;
    else other++;
  }
  const max = Math.max(weight, volume, qty, other);
  if (max === 0) return 'Unknown';
  if (max === weight && weight > volume && weight > qty) return 'Weight';
  if (max === volume && volume > weight && volume > qty) return 'Volume';
  if (max === qty && qty > weight && qty > volume) return 'Quantity';
  return 'Unknown';
}
