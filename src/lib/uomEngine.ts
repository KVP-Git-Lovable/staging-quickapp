/**
 * UoM Engine — single source of truth for unit conversions.
 *
 * No React. Pure module. Backed by:
 *   - public.get_product_units(p_product_id) RPC
 *   - public.get_enabled_units(p_category) RPC
 *
 * Falls back to in-memory cache and (best-effort) IndexedDB cache when offline.
 *
 * NOTE: Existing kg<->g and l<->ml conversions are guaranteed by Phase 1 backfill,
 * which inserts a sibling Gram (0.001) for every Kg base product, and a sibling ml
 * (0.001) for every Litre base product. The shim in unitDisplayUtils.ts uses this.
 */
import { supabase } from '@/integrations/supabase/client';

/**
 * UoM category code. Historically a fixed union of 4 values but now data-driven
 * via the `uom_category` table (Medication, Electronics, Packaging, plus any
 * admin-added categories). Keep the type as `string` so new categories work
 * without code changes; KNOWN_CATEGORIES is exported for places that still
 * want the legacy 4 for sorting/filtering defaults.
 */
export type UomCategory = string;
export const KNOWN_CATEGORIES = ['Weight', 'Volume', 'Length', 'Quantity'] as const;

export interface ProductUnit {
  mappingId: string;
  uomId: string;
  code: string;
  name: string;
  category: UomCategory;
  conversionToBase: number;
  isBase: boolean;
  isDefaultSales: boolean;
  isPriceBasis: boolean;
  isDefaultPurchase?: boolean;
}

export interface EnabledUnit {
  uomId: string;
  code: string;
  name: string;
  category: UomCategory;
  displayOrder: number;
  isDefault: boolean;
}

// ----------------------------- in-memory cache -----------------------------
const productCache = new Map<string, ProductUnit[]>();
const enabledCache = new Map<string, EnabledUnit[]>(); // key: category || '__ALL__'

// ----------------------------- IndexedDB (offline) -------------------------
const DB_NAME = 'uom-cache';
const DB_VERSION = 1;
const STORE = 'kv';

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ----------------------------- loaders -----------------------------
export async function loadProductUnits(productId: string): Promise<ProductUnit[]> {
  if (!productId) return [];
  const cached = productCache.get(productId);
  if (cached) return cached;

  const { data, error } = await supabase.rpc('get_product_units', { p_product_id: productId });
  if (error || !data) {
    const fromIdb = await idbGet<ProductUnit[]>(`product:${productId}`);
    if (fromIdb) {
      productCache.set(productId, fromIdb);
      return fromIdb;
    }
    return [];
  }
  const mapped: ProductUnit[] = (data as any[]).map((r) => ({
    mappingId: r.mapping_id,
    uomId: r.uom_id,
    code: r.code,
    name: r.name,
    category: r.category as UomCategory,
    conversionToBase: Number(r.conversion_to_base),
    isBase: !!r.is_base,
    isDefaultSales: !!r.is_default_sales,
    isPriceBasis: !!r.is_price_basis,
    isDefaultPurchase: !!r.is_default_purchase,
  }));
  productCache.set(productId, mapped);
  void idbSet(`product:${productId}`, mapped);
  return mapped;
}

export async function loadEnabledUnits(category?: UomCategory | null): Promise<EnabledUnit[]> {
  const key = category || '__ALL__';
  const cached = enabledCache.get(key);
  if (cached) return cached;

  const { data, error } = await supabase.rpc('get_enabled_units', {
    p_category: category ?? null,
  });
  if (error || !data) {
    const fromIdb = await idbGet<EnabledUnit[]>(`enabled:${key}`);
    if (fromIdb) {
      enabledCache.set(key, fromIdb);
      return fromIdb;
    }
    return [];
  }
  const mapped: EnabledUnit[] = (data as any[]).map((r) => ({
    uomId: r.uom_id,
    code: r.code,
    name: r.name,
    category: r.category as UomCategory,
    displayOrder: Number(r.display_order ?? 0),
    isDefault: !!r.is_default,
  }));
  enabledCache.set(key, mapped);
  void idbSet(`enabled:${key}`, mapped);
  return mapped;
}

// ----------------------------- categories ---------------------------------
export interface UomCategoryRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  enabled: boolean;
  sortOrder: number;
}

let categoriesCache: UomCategoryRow[] | null = null;

/** Loads all UoM categories (enabled and disabled) sorted by sort_order. */
export async function loadCategories(): Promise<UomCategoryRow[]> {
  if (categoriesCache) return categoriesCache;
  const { data, error } = await supabase.rpc('get_uom_categories');
  if (error || !data) {
    const fromIdb = await idbGet<UomCategoryRow[]>('categories');
    if (fromIdb) {
      categoriesCache = fromIdb;
      return fromIdb;
    }
    return [];
  }
  const mapped: UomCategoryRow[] = (data as any[]).map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    isSystem: !!r.is_system,
    enabled: !!r.enabled,
    sortOrder: Number(r.sort_order ?? 100),
  }));
  categoriesCache = mapped;
  void idbSet('categories', mapped);
  return mapped;
}

export function clearCategoriesCache() {
  categoriesCache = null;
}

// ----------------------------- conversion API -----------------------------
function findByCode(units: ProductUnit[], code: string): ProductUnit | undefined {
  const c = (code || '').toUpperCase();
  return units.find((u) => u.code.toUpperCase() === c);
}

export async function getBaseUnit(productId: string): Promise<ProductUnit | null> {
  const units = await loadProductUnits(productId);
  return units.find((u) => u.isBase) ?? null;
}

export async function convertToBase(
  productId: string,
  qty: number,
  uomCode: string,
): Promise<number> {
  const units = await loadProductUnits(productId);
  const u = findByCode(units, uomCode);
  if (!u) return qty; // unknown unit — assume base
  return qty * u.conversionToBase;
}

export async function convertFromBase(
  productId: string,
  baseQty: number,
  uomCode: string,
): Promise<number> {
  const units = await loadProductUnits(productId);
  const u = findByCode(units, uomCode);
  if (!u || u.conversionToBase === 0) return baseQty;
  return baseQty / u.conversionToBase;
}

export async function convert(
  productId: string,
  qty: number,
  fromCode: string,
  toCode: string,
): Promise<number> {
  if ((fromCode || '').toUpperCase() === (toCode || '').toUpperCase()) return qty;
  const base = await convertToBase(productId, qty, fromCode);
  return convertFromBase(productId, base, toCode);
}

export function clearUomCache(productId?: string) {
  if (productId) productCache.delete(productId);
  else {
    productCache.clear();
    enabledCache.clear();
  }
}

// ============================================================================
// Phase 2 — Per-UOM Price Override (additive layer on top of derived pricing)
// ============================================================================
//
// Lookup order for the "rate of one unit X of product P":
//   1. product_price_list row for (P, X) → return rate verbatim
//   2. fallback: products.rate × (target.conversionToBase / basis.conversionToBase)
//      where basis = product_uom_mapping row with is_price_basis = true
//
// The fallback path is the existing pricing math, so any product without
// price-list rows behaves identically to before this layer existed.

export interface PriceListEntry {
  id: string;
  productId: string;
  uomId: string;
  rate: number;
  isDefaultPrice: boolean;
  notes?: string | null;
}

const priceListCache = new Map<string, PriceListEntry[]>();

export async function loadPriceList(productId: string): Promise<PriceListEntry[]> {
  if (!productId) return [];
  const cached = priceListCache.get(productId);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('product_price_list')
    .select('id, product_id, uom_id, rate, is_default_price, notes')
    .eq('product_id', productId);

  if (error || !data) {
    const fromIdb = await idbGet<PriceListEntry[]>(`pricelist:${productId}`);
    if (fromIdb) {
      priceListCache.set(productId, fromIdb);
      return fromIdb;
    }
    return [];
  }

  const mapped: PriceListEntry[] = (data as any[]).map((r) => ({
    id: r.id,
    productId: r.product_id,
    uomId: r.uom_id,
    rate: Number(r.rate),
    isDefaultPrice: !!r.is_default_price,
    notes: r.notes ?? null,
  }));
  priceListCache.set(productId, mapped);
  void idbSet(`pricelist:${productId}`, mapped);
  return mapped;
}

export function clearPriceListCache(productId?: string) {
  if (productId) priceListCache.delete(productId);
  else priceListCache.clear();
}

/**
 * Returns the effective price for one unit of `uomId` of `productId`.
 * Falls back transparently to the existing derived math if no override row exists.
 *
 * `productRate` is the canonical `products.rate` value (the price of one base
 * unit per the product's price-basis). If you don't have it pre-loaded, pass
 * undefined and it will be fetched.
 */
export async function getPriceForUnit(
  productId: string,
  uomId: string,
  productRate?: number,
): Promise<number> {
  if (!productId || !uomId) return Number(productRate ?? 0);

  // 1) Direct override
  const list = await loadPriceList(productId);
  const direct = list.find((p) => p.uomId === uomId);
  if (direct) return direct.rate;

  // 2) Fallback to derived math
  let rate = Number(productRate ?? 0);
  if (productRate === undefined) {
    const { data } = await supabase
      .from('products')
      .select('rate')
      .eq('id', productId)
      .maybeSingle();
    rate = Number((data as any)?.rate ?? 0);
  }

  const units = await loadProductUnits(productId);
  if (units.length === 0) return rate;
  const target = units.find((u) => u.uomId === uomId);
  if (!target) return rate;

  const basis = units.find((u) => u.isPriceBasis) ?? units.find((u) => u.isBase);
  const basisConv = basis?.conversionToBase || 1;

  return rate * (target.conversionToBase / basisConv);
}

// ============================================================================
// deriveProductMappings — auto-compute conversion_to_base for each unit row
// ============================================================================
//
// The Product Master form collects:
//   - one base category (Weight | Volume | Quantity)
//   - one physical size (net_weight_g for Weight, net_volume_ml for Volume)
//   - a packaging stack (rows like PIECE, STRIP, BOX) where the only manually
//     typed number per row is qty_per_piece.
//
// This function is the single source of truth that turns that input into the
// rows that will be written to product_uom_mapping. NEVER hand-edit
// conversion_to_base — always go through here.

export interface DerivedRow {
  uomId: string;
  code: string;
  name?: string;
  conversionToBase: number;
  isBase: boolean;
  isDefaultSales: boolean;
  isPriceBasis: boolean;
  isDefaultPurchase: boolean;
}

export interface DeriveInput {
  category: UomCategory; // base category
  netWeightG?: number | null; // required when category === 'Weight'
  netVolumeMl?: number | null; // required when category === 'Volume'
  /**
   * Packaging rows. Each row carries the unit identity + qtyPerPiece.
   * For Quantity-only products, qtyPerPiece is the number of pieces in that pack.
   * For Weight/Volume products, qtyPerPiece is the number of pieces (each piece
   * = netWeightG grams or netVolumeMl ml) inside that pack.
   */
  packagingRows: Array<{
    uomId: string;
    code: string;
    name?: string;
    qtyPerPiece: number;
    isDefaultSales?: boolean;
    isPriceBasis?: boolean;
    isDefaultPurchase?: boolean;
  }>;
  /**
   * Sibling base-category units (e.g. KG when base is GRAM) auto-injected by
   * the caller from useEnabledUnits(category). We need their uomId — codes are
   * just for display.
   */
  baseCategoryUnits: Array<{ uomId: string; code: string; name?: string }>;
  /**
   * Optional Step-1 selection overrides. When provided, the derived row whose
   * `code` matches (case-insensitive) is forced to be the price-basis /
   * default-sales row, taking precedence over flags carried on packaging rows.
   * Lets the Product Master editor pick KG (or GRAM, LITRE, ML) as the
   * price/default unit even though those rows are auto-injected by the engine.
   */
  priceBasisCode?: string | null;
  defaultSalesCode?: string | null;
  defaultPurchaseCode?: string | null;
}

/**
 * Derive the full set of product_uom_mapping rows.
 *
 * Branches:
 *   Weight   → base = GRAM, sibling KG auto-included; packaging conv = qtyPerPiece × netWeightG
 *   Volume   → base = ML,   sibling LITRE auto-included; packaging conv = qtyPerPiece × netVolumeMl
 *   Quantity → base = PIECE; NO weight/volume siblings; packaging conv = qtyPerPiece × 1
 */
export function deriveProductMappings(input: DeriveInput): DerivedRow[] {
  const { category, packagingRows, baseCategoryUnits } = input;

  // ---- Step 1 completeness guard ------------------------------------------
  // Refuse to auto-seed mapping rows (GRAM/KG, ML/LITRE, PIECE) unless the
  // admin has explicitly chosen at least a price-basis OR default-sales unit
  // in Step 1, OR has added a packaging row in Step 2. This prevents the old
  // "save with category only → silently get GRAM+KG" loophole that left
  // hardcoded units showing up in Order Entry.
  const hasStep1Selection = !!(input.priceBasisCode || input.defaultSalesCode);
  const hasPackagingRows = (packagingRows || []).length > 0;
  if (!hasStep1Selection && !hasPackagingRows) {
    throw new Error(
      'Configure units before saving: pick a Price basis unit and Default sales unit in Step 1, or add at least one packaging row in Step 2.',
    );
  }

  // Resolve the base unit code per category.
  const baseCode =
    category === 'Weight' ? 'GRAM' : category === 'Volume' ? 'ML' : 'PIECE';
  const base = baseCategoryUnits.find((u) => u.code.toUpperCase() === baseCode);
  if (!base) {
    throw new Error(
      `UOM master is missing the required base unit "${baseCode}" for category ${category}. ` +
        `Enable it in the UOM Master first.`,
    );
  }

  const physicalSize =
    category === 'Weight'
      ? Number(input.netWeightG || 0)
      : category === 'Volume'
        ? Number(input.netVolumeMl || 0)
        : 1; // Quantity: each PIECE is 1 base unit

  if (category !== 'Quantity' && physicalSize <= 0) {
    throw new Error(
      `Enter the ${category === 'Weight' ? 'net weight (grams)' : 'net volume (ml)'} of one piece before saving.`,
    );
  }

  const out: DerivedRow[] = [];

  // 1) The base row itself.
  out.push({
    uomId: base.uomId,
    code: base.code,
    name: base.name,
    conversionToBase: 1,
    isBase: true,
    isDefaultSales: false,
    isPriceBasis: false,
    isDefaultPurchase: false,
  });

  // 2) Sibling units in the same base category (e.g. KG for GRAM, LITRE for ML).
  if (category !== 'Quantity') {
    for (const sib of baseCategoryUnits) {
      if (sib.uomId === base.uomId) continue;
      const factor = sib.code.toUpperCase() === 'KG' || sib.code.toUpperCase() === 'LITRE' ? 1000 : 0;
      if (factor <= 0) continue;
      out.push({
        uomId: sib.uomId,
        code: sib.code,
        name: sib.name,
        conversionToBase: factor,
        isBase: false,
        isDefaultSales: false,
        isPriceBasis: false,
        isDefaultPurchase: false,
      });
    }
  }

  // 3) Packaging rows.
  let defaultSalesAssigned = false;
  let priceBasisAssigned = false;
  let defaultPurchaseAssigned = false;
  for (const r of packagingRows) {
    const qty = Number(r.qtyPerPiece || 0);
    if (!(qty > 0)) {
      throw new Error(`Packaging unit "${r.code}" needs a qty/piece greater than 0.`);
    }
    const conv = qty * physicalSize;

    if (category === 'Quantity' && r.uomId === base.uomId) {
      if (r.isDefaultSales) { out[0].isDefaultSales = true; defaultSalesAssigned = true; }
      if (r.isPriceBasis)   { out[0].isPriceBasis = true;   priceBasisAssigned = true; }
      if (r.isDefaultPurchase) { out[0].isDefaultPurchase = true; defaultPurchaseAssigned = true; }
      continue;
    }

    const existing = out.find((x) => x.uomId === r.uomId);
    if (existing) {
      if (r.isDefaultSales) { existing.isDefaultSales = true; defaultSalesAssigned = true; }
      if (r.isPriceBasis)   { existing.isPriceBasis = true;   priceBasisAssigned = true; }
      if (r.isDefaultPurchase) { existing.isDefaultPurchase = true; defaultPurchaseAssigned = true; }
      continue;
    }

    const isDef = !!r.isDefaultSales;
    const isPB = !!r.isPriceBasis;
    const isDP = !!r.isDefaultPurchase;
    if (isDef) defaultSalesAssigned = true;
    if (isPB) priceBasisAssigned = true;
    if (isDP) defaultPurchaseAssigned = true;

    out.push({
      uomId: r.uomId,
      code: r.code,
      name: r.name,
      conversionToBase: conv,
      isBase: false,
      isDefaultSales: isDef,
      isPriceBasis: isPB,
      isDefaultPurchase: isDP,
    });
  }

  // 4) Apply explicit Step-1 code overrides.
  const applyCodeOverride = (
    code: string | null | undefined,
    flag: 'isDefaultSales' | 'isPriceBasis' | 'isDefaultPurchase',
  ): boolean => {
    if (!code) return false;
    const target = code.toUpperCase();
    const match = out.find((x) => x.code.toUpperCase() === target);
    if (!match) return false;
    for (const r of out) r[flag] = false;
    match[flag] = true;
    return true;
  };
  if (applyCodeOverride(input.defaultSalesCode, 'isDefaultSales')) defaultSalesAssigned = true;
  if (applyCodeOverride(input.priceBasisCode, 'isPriceBasis')) priceBasisAssigned = true;
  if (applyCodeOverride(input.defaultPurchaseCode, 'isDefaultPurchase')) defaultPurchaseAssigned = true;

  // 5) Safety fallbacks.
  if (!defaultSalesAssigned) out[0].isDefaultSales = true;
  if (!priceBasisAssigned) out[0].isPriceBasis = true;
  // Default purchase falls back to default sales row when unset (per Q3).
  if (!defaultPurchaseAssigned) {
    const salesRow = out.find((r) => r.isDefaultSales) ?? out[0];
    salesRow.isDefaultPurchase = true;
  }

  return out;
}
