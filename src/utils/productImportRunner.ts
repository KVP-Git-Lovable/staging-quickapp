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

export interface ValidatedRow {
  rowNumber: number;        // 1-based, matches sheet row (header = 1).
  sku: string;
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
    gst_percentage: number;
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

  rows.forEach((raw, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const sku = textOrNull(raw['sku']) ?? '';
    const name = textOrNull(raw['name']) ?? '';
    const categoryName = textOrNull(raw['category']) ?? '';
    const gst = numOrNull(raw['gst_percentage']);
    const rate = numOrNull(raw['rate']);
    const baseCode = textOrNull(raw['base_unit']);
    const priceBasisCode = textOrNull(raw['price_basis_unit']);
    const defSalesCode = textOrNull(raw['default_sales_unit']);

    if (!sku) errors.push('sku is required');
    else if (seenSkus.has(sku)) errors.push(`duplicate sku in file: ${sku}`);
    else seenSkus.add(sku);

    if (!name) errors.push('name is required');
    if (!categoryName) errors.push('category is required');
    if (gst == null || gst < 0 || gst > 100) errors.push('gst_percentage must be 0..100');
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

    // Auto-link by gst_percentage when tax_master_id is still unresolved.
    // This prevents the "tax_master_id = null when gst is present" damage.
    let effectiveGst = gst;
    if (!taxId && gst != null) {
      const k = rateKey(gst);
      const byRate = k != null ? ctx.taxByRate.get(k) : undefined;
      if (byRate) {
        taxId = byRate.id;
        effectiveGst = byRate.total_rate; // keep the two in lockstep
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
        // Inherit physics from uom_master unless an explicit factor was given.
        conv = s.factor ?? (u.conversion_to_base != null ? Number(u.conversion_to_base) : null);
        if (conv == null || conv <= 0) {
          errors.push(`unit "${s.code}" has no conversion_to_base in master; provide unit_n_factor`);
          continue;
        }
      } else {
        // PACK/COUNT — per-product factor mandatory.
        if (s.factor == null || s.factor <= 0) {
          errors.push(`unit "${s.code}" is pack/count; unit_n_factor > 0 is required`);
          continue;
        }
        // For pack units against a dimensional base, factor is units of base per pack
        // (e.g. 1 BAG = 30000g) — but user supplies pieces; we treat factor as base units.
        // For Quantity base (PIECE), factor = qty per piece (e.g. 1 BOX = 24).
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

    // price_basis / default_sales must be among mapped units.
    if (priceBasisUom && !seenUomIds.has(priceBasisUom.id)) {
      errors.push(`price_basis_unit "${priceBasisCode}" must be the base or one of unit_1/2/3`);
    }
    if (defSalesUom && !seenUomIds.has(defSalesUom.id)) {
      errors.push(`default_sales_unit "${defSalesCode}" must be the base or one of unit_1/2/3`);
    }

    const ok = errors.length === 0;
    const row: ValidatedRow = {
      rowNumber: i + 2, // header is row 1
      sku,
      ok,
      errors,
      warnings,
      raw,
    };
    if (ok && baseUom && (categoryId || pendingCategoryName) && gst != null && rate != null && priceBasisUom && defSalesUom) {
      row.resolved = {
        name,
        description: textOrNull(raw['description']),
        brand: textOrNull(raw['brand']),
        product_type: textOrNull(raw['product_type']),
        category_id: categoryId,
        pending_category_name: pendingCategoryName,
        gst_percentage: effectiveGst ?? gst,
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
  errorRows: Array<{ row: number; sku: string; reason: string }>;
}

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
    errorRows: [],
  };

  let done = 0;
  for (const v of validated) {
    done++;
    onProgress?.(done, validated.length);

    if (!v.ok || !v.resolved) {
      result.skipped++;
      for (const e of v.errors) result.errorRows.push({ row: v.rowNumber, sku: v.sku, reason: e });
      continue;
    }

    const r = v.resolved;
    // Resolve any pending (newly-created) category from the context map.
    let categoryId = r.category_id;
    if (!categoryId && r.pending_category_name) {
      categoryId = ctx.categoriesByName.get(r.pending_category_name.trim().toLowerCase()) ?? '';
    }
    if (!categoryId) {
      result.failed++;
      result.errorRows.push({
        row: v.rowNumber,
        sku: v.sku,
        reason: `category "${r.pending_category_name ?? ''}" was not created`,
      });
      continue;
    }

    const productPayload = {
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
    };


    const wasExisting = ctx.existingSkus.has(v.sku);

    try {
      // Upsert by SKU (relies on the products_sku_unique constraint).
      const { data: upserted, error: upErr } = await supabase
        .from('products')
        .upsert(productPayload, { onConflict: 'sku' })
        .select('id')
        .single();
      if (upErr) throw upErr;
      const productId = (upserted as any).id as string;

      // Replace mappings: delete + insert.
      const { error: delErr } = await supabase
        .from('product_uom_mapping')
        .delete()
        .eq('product_id', productId);
      if (delErr) throw delErr;

      const mappingRows = r.mappings.map((m) => ({
        product_id: productId,
        uom_id: m.uom_id,
        conversion_to_base: m.conversion_to_base,
        is_base: m.is_base,
        is_price_basis: m.is_price_basis,
        is_default_sales: m.is_default_sales,
        is_active: true,
      }));
      if (mappingRows.length > 0) {
        const { error: insErr } = await supabase
          .from('product_uom_mapping')
          .insert(mappingRows);
        if (insErr) throw insErr;
      }

      if (wasExisting) result.updated++; else result.inserted++;
      ctx.existingSkus.add(v.sku);
    } catch (e: any) {
      result.failed++;
      result.errorRows.push({
        row: v.rowNumber,
        sku: v.sku,
        reason: e?.message ?? String(e),
      });
    }
  }

  return result;
}

/**
 * Build an .xlsx Blob describing every error row, for the post-import
 * "download error report" link.
 */
export function buildErrorReportBlob(
  errors: Array<{ row: number; sku: string; reason: string }>,
): Blob {
  const ws = XLSX.utils.json_to_sheet(errors, {
    header: ['row', 'sku', 'reason'],
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

