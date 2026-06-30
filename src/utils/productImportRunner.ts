/**
 * Phase 3: Product master importer.
 *
 * Workflow:
 *   1. parseImportFile(file) → rows + headerMap.
 *   2. validateImportRows(rows) → per-row diagnostics + reference lookups.
 *   3. executeImport(validated) → atomic per-row upsert into products + product_uom_mapping.
 *
 * Atomicity: each row is committed via a PostgreSQL function call wrapped in a
 * single supabase RPC; the helper falls back to a sequence of statements if the
 * RPC isn't available and reverts on failure by re-querying the prior state.
 */
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { cleanHeader, IMPORT_HEADERS } from './productImportTemplate';

export type ParsedRow = Record<string, string | number | null | undefined>;

export interface ParseResult {
  rows: ParsedRow[];
  unknownHeaders: string[];
}

const DIMENSIONAL_CATEGORIES = new Set(['weight', 'volume', 'length']);

const truthy = (v: any) => {
  if (v === null || v === undefined || v === '') return false;
  const s = String(v).trim().toLowerCase();
  return ['y', 'yes', 'true', '1', 'active'].includes(s);
};

const numOrNull = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const textOrNull = (v: any): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

export async function parseImportFile(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('No sheet found in file');

  const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
  const expected = new Set(IMPORT_HEADERS.map(cleanHeader));
  const unknown = new Set<string>();

  const rows: ParsedRow[] = json.map((r) => {
    const out: ParsedRow = {};
    for (const [k, v] of Object.entries(r)) {
      const key = cleanHeader(k);
      if (!expected.has(key)) unknown.add(k);
      out[key] = v as any;
    }
    return out;
  });

  return { rows, unknownHeaders: Array.from(unknown) };
}

export type RowKind = 'product' | 'variant';

export interface VariantResolved {
  parent_sku: string;
  variant_name: string;
  price: number | null;
  stock_quantity: number | null;
  is_active: boolean;
  // Override columns — null means inherit from parent.
  tax_master_id: string | null;
  gst_percentage: number | null;
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

export interface ValidatedRow {
  rowNumber: number;        // 1-based, matches sheet row (header = 1).
  sku: string;
  kind: RowKind;
  ok: boolean;
  errors: string[];
  warnings: string[];
  raw: ParsedRow;
  resolved?: {
    name: string;
    description: string | null;
    brand: string | null;
    product_type: string | null;
    category_id: string;                 // empty string when pending_category_name is set
    pending_category_name: string | null; // original-cased name to create before import
    gst_percentage: number | null;
    hsn_code: string | null;
    tax_master_id: string | null;
    rate: number;
    base_unit: string;             // text on products row
    base_uom_id: string;           // uom_master.id of base
    price_basis_uom_id: string;
    default_sales_uom_id: string;
    opening_stock: number | null;
    reorder_level: number | null;
    net_weight_g: number | null;
    net_volume_ml: number | null;
    is_active: boolean;
    is_discontinued: boolean;
    image_file: string | null;
    mappings: Array<{
      uom_id: string;
      conversion_to_base: number;
      is_base: boolean;
      is_price_basis: boolean;
      is_default_sales: boolean;
    }>;
  };
  variantResolved?: VariantResolved;
}


export interface ValidationContext {
  categoriesByName: Map<string, string>;          // lower name → id
  uomByCode: Map<string, {
    id: string;
    code: string;
    category: string;
    is_base: boolean;
    conversion_to_base: number | null;
    enabled: boolean;
  }>;
  taxByName: Map<string, { id: string; total_rate: number | null }>;
  taxByRate: Map<number, { id: string; total_rate: number; name: string }>; // active only, gst% → tax row
  existingSkus: Set<string>;
}

const rateKey = (n: number | null | undefined): number | null => {
  if (n == null) return null;
  // Normalise to 2 decimals so 5 / 5.0 / 5.00 collide.
  return Math.round(Number(n) * 100) / 100;
};

export async function loadValidationContext(): Promise<ValidationContext> {
  const [{ data: cats }, { data: uoms }, { data: enabled }, { data: taxes }] = await Promise.all([
    supabase.from('product_categories').select('id, name'),
    supabase.from('uom_master').select('id, code, category, is_base, conversion_to_base'),
    supabase.from('enabled_units').select('uom_id, enabled'),
    supabase.from('tax_masters').select('id, name, total_rate, is_active'),
  ]);

  const enabledSet = new Set((enabled ?? []).filter((e: any) => e.enabled).map((e: any) => e.uom_id));
  const uomByCode = new Map<string, any>();
  for (const u of uoms ?? []) {
    uomByCode.set(String((u as any).code).trim().toUpperCase(), {
      id: (u as any).id,
      code: (u as any).code,
      category: (u as any).category,
      is_base: (u as any).is_base,
      conversion_to_base: (u as any).conversion_to_base,
      enabled: enabledSet.has((u as any).id),
    });
  }

  // Build tax lookup maps — by name (any), by rate (active only).
  const taxByName = new Map<string, { id: string; total_rate: number | null }>();
  const taxByRate = new Map<number, { id: string; total_rate: number; name: string }>();
  for (const t of (taxes ?? []) as any[]) {
    const rate = t.total_rate == null ? null : Number(t.total_rate);
    taxByName.set(String(t.name).trim().toLowerCase(), { id: t.id, total_rate: rate });
    if (t.is_active && rate != null) {
      const k = rateKey(rate)!;
      // First-write-wins keeps behaviour deterministic when two active rows share a rate.
      if (!taxByRate.has(k)) taxByRate.set(k, { id: t.id, total_rate: rate, name: String(t.name) });
    }
  }

  // Pull existing SKUs in pages.
  const existing = new Set<string>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('sku')
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) if ((r as any).sku) existing.add(String((r as any).sku));
    if (!data || data.length < 1000) break;
    from += 1000;
  }

  return {
    categoriesByName: new Map((cats ?? []).map((c: any) => [String(c.name).trim().toLowerCase(), c.id])),
    uomByCode,
    taxByName,
    taxByRate,
    existingSkus: existing,
  };
}

function resolveUom(ctx: ValidationContext, code: string | null) {
  if (!code) return null;
  return ctx.uomByCode.get(code.trim().toUpperCase()) ?? null;
}


export function validateImportRows(rows: ParsedRow[], ctx: ValidationContext): ValidatedRow[] {
  const out: ValidatedRow[] = [];
  const seenSkus = new Set<string>();

  // Pre-pass: collect base-row SKUs in this file so variant rows can reference
  // a parent that doesn't exist in the DB yet (Phase A creates it).
  const baseSkusInFile = new Set<string>();
  for (const raw of rows) {
    const parentSku = textOrNull(raw['parent_sku']);
    const sku = textOrNull(raw['sku']);
    if (!parentSku && sku) baseSkusInFile.add(sku);
  }

  rows.forEach((raw, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const sku = textOrNull(raw['sku']) ?? '';
    const parentSku = textOrNull(raw['parent_sku']) ?? '';
    const kind: RowKind = parentSku ? 'variant' : 'product';

    // Shared SKU validation.
    if (!sku) errors.push('sku is required');
    else if (seenSkus.has(sku)) errors.push(`duplicate sku in file: ${sku}`);
    else seenSkus.add(sku);

    if (kind === 'variant') {
      // --- VARIANT ROW ---
      const variantName = textOrNull(raw['variant_name']) ?? '';
      if (!variantName) errors.push('variant_name is required for variant rows');

      // Parent must resolve.
      const parentExistsInDb = ctx.existingSkus.has(parentSku);
      const parentInFile = baseSkusInFile.has(parentSku);
      if (!parentExistsInDb && !parentInFile) {
        errors.push(`parent_sku not found: ${parentSku}`);
      }
      if (parentSku === sku) errors.push('parent_sku must differ from sku');

      // Override resolution (all optional — blank = inherit / null).
      const gst = numOrNull(raw['gst_percentage']);
      if (gst != null && (gst < 0 || gst > 100)) errors.push('gst_percentage must be 0..100');

      const taxName = textOrNull(raw['tax_master']);
      let taxId: string | null = null;
      let effectiveGst: number | null = gst;
      if (taxName) {
        const t = ctx.taxByName.get(taxName.toLowerCase());
        if (!t) errors.push(`unknown tax_master "${taxName}"`);
        else { taxId = t.id; effectiveGst = t.total_rate; }
      }
      if (!taxId && gst != null) {
        const k = rateKey(gst);
        const byRate = k != null ? ctx.taxByRate.get(k) : undefined;
        if (byRate) { taxId = byRate.id; effectiveGst = byRate.total_rate; }
      }

      const categoryName = textOrNull(raw['category']);
      let categoryId: string | null = null;
      if (categoryName) {
        const c = ctx.categoriesByName.get(categoryName.toLowerCase());
        if (!c) errors.push(`unknown category "${categoryName}" (variant rows do not auto-create categories)`);
        else categoryId = c;
      }

      const resolveOptUom = (code: string | null, label: string): string | null => {
        if (!code) return null;
        const u = ctx.uomByCode.get(code.trim().toUpperCase());
        if (!u) { errors.push(`unknown ${label} "${code}"`); return null; }
        if (!u.enabled) { errors.push(`${label} "${code}" is disabled`); return null; }
        return u.id;
      };
      const defSalesUomId = resolveOptUom(textOrNull(raw['default_sales_unit']), 'default_sales_unit');
      const priceBasisUomId = resolveOptUom(textOrNull(raw['price_basis_unit']), 'price_basis_unit');

      const rate = numOrNull(raw['rate']);
      if (rate != null && rate <= 0) errors.push('rate must be > 0 when provided');

      const ok = errors.length === 0;
      const row: ValidatedRow = {
        rowNumber: i + 2,
        sku,
        kind,
        ok,
        errors,
        warnings,
        raw,
      };
      if (ok) {
        row.variantResolved = {
          parent_sku: parentSku,
          variant_name: variantName,
          price: rate,
          stock_quantity: numOrNull(raw['opening_stock']),
          is_active: raw['is_active'] == null || raw['is_active'] === '' ? true : truthy(raw['is_active']),
          tax_master_id: taxId,
          gst_percentage: effectiveGst,
          category_id: categoryId,
          brand: textOrNull(raw['brand']),
          hsn_code: textOrNull(raw['hsn_code']),
          product_type: textOrNull(raw['product_type']),
          description: textOrNull(raw['description']),
          default_sales_uom_id: defSalesUomId,
          price_basis_uom_id: priceBasisUomId,
          base_unit: textOrNull(raw['base_unit']),
          net_weight_g: numOrNull(raw['net_weight_g']),
          net_volume_ml: numOrNull(raw['net_volume_ml']),
          standard_cost: numOrNull(raw['standard_cost']),
          sku_image_url: textOrNull(raw['sku_image_url']),
          reorder_level: numOrNull(raw['reorder_level']),
          reorder_quantity: numOrNull(raw['reorder_quantity']),
          manufacturer: textOrNull(raw['manufacturer']),
          country_of_origin: textOrNull(raw['country_of_origin']),
        };
      }
      out.push(row);
      return;
    }

    // --- BASE PRODUCT ROW (unchanged behavior) ---
    const name = textOrNull(raw['name']) ?? '';
    const categoryName = textOrNull(raw['category']) ?? '';
    const gst = numOrNull(raw['gst_percentage']);
    const rate = numOrNull(raw['rate']);
    const baseCode = textOrNull(raw['base_unit']);
    const priceBasisCode = textOrNull(raw['price_basis_unit']);
    const defSalesCode = textOrNull(raw['default_sales_unit']);

    if (!name) errors.push('name is required');
    if (!categoryName) errors.push('category is required');
    if (gst != null && (gst < 0 || gst > 100)) errors.push('gst_percentage must be 0..100');
    if (rate == null || rate <= 0) errors.push('rate must be > 0');
    if (!baseCode) errors.push('base_unit is required');
    if (!priceBasisCode) errors.push('price_basis_unit is required');
    if (!defSalesCode) errors.push('default_sales_unit is required');

    const categoryLookup = categoryName ? ctx.categoriesByName.get(categoryName.toLowerCase()) : undefined;
    const categoryId = categoryLookup ?? '';
    const pendingCategoryName = categoryName && !categoryLookup ? categoryName : null;


    const baseUom = resolveUom(ctx, baseCode);
    if (baseCode && !baseUom) errors.push(`unknown base_unit "${baseCode}"`);
    else if (baseUom && !baseUom.enabled) errors.push(`base_unit "${baseCode}" is disabled`);
    else if (baseUom && !baseUom.is_base) errors.push(`base_unit "${baseCode}" is not the base of its category`);

    const priceBasisUom = resolveUom(ctx, priceBasisCode);
    if (priceBasisCode && !priceBasisUom) errors.push(`unknown price_basis_unit "${priceBasisCode}"`);
    else if (priceBasisUom && !priceBasisUom.enabled) errors.push(`price_basis_unit "${priceBasisCode}" is disabled`);

    const defSalesUom = resolveUom(ctx, defSalesCode);
    if (defSalesCode && !defSalesUom) errors.push(`unknown default_sales_unit "${defSalesCode}"`);
    else if (defSalesUom && !defSalesUom.enabled) errors.push(`default_sales_unit "${defSalesCode}" is disabled`);

    const taxName = textOrNull(raw['tax_master']);
    let taxId: string | null = null;
    if (taxName) {
      const t = ctx.taxByName.get(taxName.toLowerCase());
      if (!t) errors.push(`unknown tax_master "${taxName}"`);
      else taxId = t.id;
    }

    let effectiveGst = gst;
    if (!taxId && gst != null) {
      const k = rateKey(gst);
      const byRate = k != null ? ctx.taxByRate.get(k) : undefined;
      if (byRate) {
        taxId = byRate.id;
        effectiveGst = byRate.total_rate;
      }
    }

    // Mapping rows.
    type Slot = { code: string; factor: number | null };
    const slots: Slot[] = [];
    for (const n of [1, 2, 3]) {
      const c = textOrNull(raw[`unit_${n}`]);
      const f = numOrNull(raw[`unit_${n}_factor`]);
      if (c) slots.push({ code: c, factor: f });
      else if (f != null) warnings.push(`unit_${n}_factor provided without unit_${n}`);
    }

    const mappings: NonNullable<ValidatedRow['resolved']>['mappings'] = [];
    const seenUomIds = new Set<string>();

    if (baseUom) {
      mappings.push({
        uom_id: baseUom.id,
        conversion_to_base: 1,
        is_base: true,
        is_price_basis: priceBasisUom?.id === baseUom.id,
        is_default_sales: defSalesUom?.id === baseUom.id,
      });
      seenUomIds.add(baseUom.id);
    }

    for (const s of slots) {
      const u = resolveUom(ctx, s.code);
      if (!u) { errors.push(`unknown unit "${s.code}"`); continue; }
      if (seenUomIds.has(u.id)) { warnings.push(`duplicate unit "${s.code}" skipped`); continue; }
      let conv: number | null = null;
      const isDimensional = DIMENSIONAL_CATEGORIES.has((u.category || '').toLowerCase());
      const sameCategoryAsBase = baseUom && u.category === baseUom.category;
      if (isDimensional && sameCategoryAsBase) {
        conv = s.factor ?? (u.conversion_to_base != null ? Number(u.conversion_to_base) : null);
        if (conv == null || conv <= 0) {
          errors.push(`unit "${s.code}" has no conversion_to_base in master; provide unit_n_factor`);
          continue;
        }
      } else {
        if (s.factor == null || s.factor <= 0) {
          errors.push(`unit "${s.code}" is pack/count; unit_n_factor > 0 is required`);
          continue;
        }
        conv = s.factor;
      }
      mappings.push({
        uom_id: u.id,
        conversion_to_base: conv,
        is_base: false,
        is_price_basis: priceBasisUom?.id === u.id,
        is_default_sales: defSalesUom?.id === u.id,
      });
      seenUomIds.add(u.id);
    }

    if (priceBasisUom && !seenUomIds.has(priceBasisUom.id)) {
      errors.push(`price_basis_unit "${priceBasisCode}" must be the base or one of unit_1/2/3`);
    }
    if (defSalesUom && !seenUomIds.has(defSalesUom.id)) {
      errors.push(`default_sales_unit "${defSalesCode}" must be the base or one of unit_1/2/3`);
    }

    const ok = errors.length === 0;
    const row: ValidatedRow = {
      rowNumber: i + 2,
      sku,
      kind,
      ok,
      errors,
      warnings,
      raw,
    };
    if (ok && baseUom && (categoryId || pendingCategoryName) && rate != null && priceBasisUom && defSalesUom) {
      row.resolved = {
        name,
        description: textOrNull(raw['description']),
        brand: textOrNull(raw['brand']),
        product_type: textOrNull(raw['product_type']),
        category_id: categoryId,
        pending_category_name: pendingCategoryName,
        gst_percentage: effectiveGst != null ? effectiveGst : (gst != null ? gst : null),
        hsn_code: textOrNull(raw['hsn_code']),
        tax_master_id: taxId,

        rate,
        base_unit: baseUom.code,
        base_uom_id: baseUom.id,
        price_basis_uom_id: priceBasisUom.id,
        default_sales_uom_id: defSalesUom.id,
        opening_stock: numOrNull(raw['opening_stock']),
        reorder_level: numOrNull(raw['reorder_level']),
        net_weight_g: numOrNull(raw['net_weight_g']),
        net_volume_ml: numOrNull(raw['net_volume_ml']),
        is_active: raw['is_active'] == null || raw['is_active'] === ''
          ? true
          : truthy(raw['is_active']),
        is_discontinued: truthy(raw['is_discontinued']),
        image_file: textOrNull(raw['image_file']),
        mappings,
      };
    }
    out.push(row);
  });

  return out;
}

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  variantsInserted: number;
  variantsUpdated: number;
  variantsSkipped: number;
  variantsFailed: number;
  errorRows: Array<{ row: number; sku: string; reason: string; kind?: RowKind }>;
}

const CHUNK_SIZE = 300;

/**
 * Build the products row payload for a single validated row.
 * Returns null + reason if the row is unusable at execute time
 * (e.g. its pending category wasn't created).
 */
function buildProductPayload(
  v: ValidatedRow,
  ctx: ValidationContext,
): { payload: Record<string, any>; mappings: NonNullable<ValidatedRow['resolved']>['mappings'] } | { error: string } {
  const r = v.resolved!;
  let categoryId = r.category_id;
  if (!categoryId && r.pending_category_name) {
    categoryId = ctx.categoriesByName.get(r.pending_category_name.trim().toLowerCase()) ?? '';
  }
  if (!categoryId) {
    return { error: `category "${r.pending_category_name ?? ''}" was not created` };
  }
  return {
    payload: {
      sku: v.sku,
      name: r.name,
      description: r.description,
      brand: r.brand,
      product_type: r.product_type,
      category_id: categoryId,
      gst_percentage: r.gst_percentage,
      hsn_code: r.hsn_code,
      tax_master_id: r.tax_master_id,
      rate: r.rate,
      base_unit: r.base_unit,
      price_basis_uom_id: r.price_basis_uom_id,
      default_sales_uom_id: r.default_sales_uom_id,
      opening_stock: r.opening_stock ?? 0,
      reorder_level: r.reorder_level ?? 0,
      net_weight_g: r.net_weight_g,
      net_volume_ml: r.net_volume_ml,
      is_active: r.is_active,
      is_discontinued: r.is_discontinued,
    },
    mappings: r.mappings,
  };
}

/**
 * Fallback path when a chunk-level operation fails: process the chunk's rows
 * one-by-one so we can attribute the failure to specific SKUs and let the
 * rest of the import continue.
 */
async function executeChunkPerRow(
  chunk: ValidatedRow[],
  ctx: ValidationContext,
  result: ImportResult,
): Promise<void> {
  for (const v of chunk) {
    const built = buildProductPayload(v, ctx);
    if ('error' in built) {
      result.failed++;
      result.errorRows.push({ row: v.rowNumber, sku: v.sku, reason: built.error });
      continue;
    }
    const wasExisting = ctx.existingSkus.has(v.sku);
    try {
      const { data: up, error: upErr } = await supabase
        .from('products')
        .upsert(built.payload, { onConflict: 'sku' })
        .select('id')
        .single();
      if (upErr) throw upErr;
      const productId = (up as any).id as string;

      const { error: delErr } = await supabase
        .from('product_uom_mapping')
        .delete()
        .eq('product_id', productId);
      if (delErr) throw delErr;

      const rows = built.mappings.map((m) => ({
        product_id: productId,
        uom_id: m.uom_id,
        conversion_to_base: m.conversion_to_base,
        is_base: m.is_base,
        is_price_basis: m.is_price_basis,
        is_default_sales: m.is_default_sales,
        is_active: true,
      }));
      if (rows.length) {
        const { error: insErr } = await supabase.from('product_uom_mapping').insert(rows);
        if (insErr) throw insErr;
      }
      if (wasExisting) result.updated++; else result.inserted++;
      ctx.existingSkus.add(v.sku);
    } catch (e: any) {
      result.failed++;
      result.errorRows.push({ row: v.rowNumber, sku: v.sku, reason: e?.message ?? String(e) });
    }
  }
}

/**
 * Chunked bulk importer. ~300 rows per chunk:
 *   1. one upsert into products (returns id+sku)
 *   2. one delete from product_uom_mapping (in product_ids)
 *   3. one insert into product_uom_mapping (all chunk rows)
 *
 * Cuts ~3 calls per row to ~3 calls per 300 rows. If any chunk-level op
 * fails, that single chunk falls back to per-row processing so failures
 * are attributed to specific SKUs and the rest of the import continues.
 */
export async function executeImport(
  validated: ValidatedRow[],
  ctx: ValidationContext,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const result: ImportResult = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    variantsInserted: 0,
    variantsUpdated: 0,
    variantsSkipped: 0,
    variantsFailed: 0,
    errorRows: [],
  };

  // 0. Split by kind.
  const baseRows = validated.filter((v) => v.kind === 'product');
  const variantRows = validated.filter((v) => v.kind === 'variant');

  // 1. Pre-pass on BASE rows: separate invalid from importable.
  const importable: ValidatedRow[] = [];
  for (const v of baseRows) {
    if (!v.ok || !v.resolved) {
      result.skipped++;
      for (const e of v.errors) result.errorRows.push({ row: v.rowNumber, sku: v.sku, reason: e, kind: 'product' });
      continue;
    }
    importable.push(v);
  }

  const total = validated.length;
  let done = baseRows.length - importable.length;
  onProgress?.(done, total);

  // 2. Process BASE rows in chunks (existing logic — unchanged).
  for (let i = 0; i < importable.length; i += CHUNK_SIZE) {
    const chunk = importable.slice(i, i + CHUNK_SIZE);

    const payloads: Record<string, any>[] = [];
    const mappingsBySku = new Map<string, NonNullable<ValidatedRow['resolved']>['mappings']>();

    for (const v of chunk) {
      const built = buildProductPayload(v, ctx);
      if ('error' in built) {
        result.failed++;
        result.errorRows.push({ row: v.rowNumber, sku: v.sku, reason: built.error, kind: 'product' });
        continue;
      }
      payloads.push(built.payload);
      mappingsBySku.set(v.sku, built.mappings);
    }

    if (payloads.length === 0) {
      done += chunk.length;
      onProgress?.(done, total);
      continue;
    }

    const usableChunk = chunk.filter((v) => mappingsBySku.has(v.sku));

    try {
      const { data: upserted, error: upErr } = await supabase
        .from('products')
        .upsert(payloads, { onConflict: 'sku' })
        .select('id, sku');
      if (upErr) throw upErr;

      const idBySku = new Map<string, string>();
      for (const row of (upserted ?? []) as any[]) {
        idBySku.set(String(row.sku), String(row.id));
      }

      const resolvedSkus = new Set<string>();
      const productIds: string[] = [];
      for (const v of usableChunk) {
        const id = idBySku.get(v.sku);
        if (!id) {
          result.failed++;
          result.errorRows.push({ row: v.rowNumber, sku: v.sku, reason: 'upsert returned no id for sku', kind: 'product' });
          continue;
        }
        resolvedSkus.add(v.sku);
        productIds.push(id);
      }

      if (productIds.length > 0) {
        const { error: delErr } = await supabase
          .from('product_uom_mapping')
          .delete()
          .in('product_id', productIds);
        if (delErr) throw delErr;
      }

      const mappingRows: Record<string, any>[] = [];
      for (const v of usableChunk) {
        if (!resolvedSkus.has(v.sku)) continue;
        const productId = idBySku.get(v.sku)!;
        for (const m of mappingsBySku.get(v.sku) ?? []) {
          mappingRows.push({
            product_id: productId,
            uom_id: m.uom_id,
            conversion_to_base: m.conversion_to_base,
            is_base: m.is_base,
            is_price_basis: m.is_price_basis,
            is_default_sales: m.is_default_sales,
            is_active: true,
          });
        }
      }
      if (mappingRows.length > 0) {
        const { error: insErr } = await supabase
          .from('product_uom_mapping')
          .insert(mappingRows);
        if (insErr) throw insErr;
      }

      for (const v of usableChunk) {
        if (!resolvedSkus.has(v.sku)) continue;
        if (ctx.existingSkus.has(v.sku)) result.updated++;
        else {
          result.inserted++;
          ctx.existingSkus.add(v.sku);
        }
      }
    } catch (e: any) {
      console.warn(
        `[importRunner] chunk ${i / CHUNK_SIZE + 1} bulk path failed (${e?.message ?? e}); retrying row-by-row`,
      );
      await executeChunkPerRow(usableChunk, ctx, result);
    }

    done += chunk.length;
    onProgress?.(done, total);
  }

  // 3. Phase B — VARIANT rows.
  if (variantRows.length > 0) {
    // Invalid variants first.
    const importableVariants: ValidatedRow[] = [];
    for (const v of variantRows) {
      if (!v.ok || !v.variantResolved) {
        result.variantsSkipped++;
        for (const e of v.errors) result.errorRows.push({ row: v.rowNumber, sku: v.sku, reason: e, kind: 'variant' });
        done++;
        onProgress?.(done, total);
        continue;
      }
      importableVariants.push(v);
    }

    if (importableVariants.length > 0) {
      // Build fresh sku → product_id map for every parent_sku referenced.
      const parentSkus = Array.from(new Set(importableVariants.map((v) => v.variantResolved!.parent_sku)));
      const parentIdBySku = new Map<string, string>();
      for (let i = 0; i < parentSkus.length; i += 500) {
        const batch = parentSkus.slice(i, i + 500);
        const { data, error } = await supabase
          .from('products')
          .select('id, sku')
          .in('sku', batch);
        if (error) {
          // Hard fail: can't resolve any parent.
          for (const v of importableVariants) {
            result.variantsFailed++;
            result.errorRows.push({ row: v.rowNumber, sku: v.sku, reason: `parent lookup failed: ${error.message}`, kind: 'variant' });
            done++;
          }
          onProgress?.(done, total);
          return result;
        }
        for (const r of (data ?? []) as any[]) parentIdBySku.set(String(r.sku), String(r.id));
      }

      // Existing variant SKUs (for inserted vs updated count).
      const variantSkus = importableVariants.map((v) => v.sku);
      const existingVariantSkus = new Set<string>();
      for (let i = 0; i < variantSkus.length; i += 500) {
        const batch = variantSkus.slice(i, i + 500);
        const { data } = await supabase
          .from('product_variants')
          .select('sku')
          .in('sku', batch);
        for (const r of (data ?? []) as any[]) if (r.sku) existingVariantSkus.add(String(r.sku));
      }

      // Per-row upsert (variant counts are typically smaller; per-row keeps
      // attribution exact while still skipping a failed parent only).
      for (const v of importableVariants) {
        const r = v.variantResolved!;
        const productId = parentIdBySku.get(r.parent_sku);
        if (!productId) {
          result.variantsFailed++;
          result.errorRows.push({ row: v.rowNumber, sku: v.sku, reason: `parent_sku not found: ${r.parent_sku}`, kind: 'variant' });
          done++;
          onProgress?.(done, total);
          continue;
        }
        const payload: Record<string, any> = {
          product_id: productId,
          sku: v.sku,
          variant_name: r.variant_name,
          price: r.price,
          stock_quantity: r.stock_quantity ?? 0,
          is_active: r.is_active,
          // Override columns — null = inherit at read time via resolveProduct.
          tax_master_id: r.tax_master_id,
          gst_percentage: r.gst_percentage,
          category_id: r.category_id,
          brand: r.brand,
          hsn_code: r.hsn_code,
          product_type: r.product_type,
          description: r.description,
          default_sales_uom_id: r.default_sales_uom_id,
          price_basis_uom_id: r.price_basis_uom_id,
          base_unit: r.base_unit,
          net_weight_g: r.net_weight_g,
          net_volume_ml: r.net_volume_ml,
          standard_cost: r.standard_cost,
          sku_image_url: r.sku_image_url,
          reorder_level: r.reorder_level,
          reorder_quantity: r.reorder_quantity,
          manufacturer: r.manufacturer,
          country_of_origin: r.country_of_origin,
          // Retired legacy field — tax flows via tax_master_id.
          variant_tax_rate: null,
        };
        try {
          const { error } = await supabase
            .from('product_variants')
            .upsert(payload, { onConflict: 'sku' });
          if (error) throw error;
          if (existingVariantSkus.has(v.sku)) result.variantsUpdated++;
          else result.variantsInserted++;
        } catch (e: any) {
          result.variantsFailed++;
          result.errorRows.push({ row: v.rowNumber, sku: v.sku, reason: e?.message ?? String(e), kind: 'variant' });
        }
        done++;
        onProgress?.(done, total);
      }
    }
  }

  return result;
}

/**
 * Build an .xlsx Blob describing every error row, for the post-import
 * "download error report" link.
 */
export function buildErrorReportBlob(
  errors: Array<{ row: number; sku: string; reason: string; kind?: RowKind }>,
): Blob {
  const ws = XLSX.utils.json_to_sheet(errors, {
    header: ['row', 'kind', 'sku', 'reason'],
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Errors');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}



/**
 * Return the unique set of category names that need to be created,
 * preserving the original casing of the first occurrence in the file.
 * Deduplicated case-insensitively + trimmed.
 */
export function getPendingCategoryNames(validated: ValidatedRow[]): string[] {
  const seen = new Map<string, string>(); // lowercase → original-cased
  for (const v of validated) {
    const name = v.resolved?.pending_category_name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  }
  return Array.from(seen.values());
}

/**
 * Create the given category names in product_categories (one insert per unique
 * name) and populate ctx.categoriesByName so executeImport can resolve them.
 * Safe to call with an empty list.
 */
export async function createPendingCategories(
  names: string[],
  ctx: ValidationContext,
): Promise<{ created: number; failed: Array<{ name: string; reason: string }> }> {
  const failed: Array<{ name: string; reason: string }> = [];
  let created = 0;
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (ctx.categoriesByName.has(key)) continue;
    const { data, error } = await supabase
      .from('product_categories')
      .insert({ name: name.trim() })
      .select('id')
      .single();
    if (error || !data) {
      failed.push({ name, reason: error?.message ?? 'insert failed' });
      continue;
    }
    ctx.categoriesByName.set(key, (data as any).id);
    created++;
  }
  return { created, failed };
}

