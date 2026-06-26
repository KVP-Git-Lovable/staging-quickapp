/**
 * Phase 2: Product master EXPORT (round-trip template).
 *
 * Exports ALL products to a single xlsx with the exact column set agreed for
 * the Phase 3 import template. Resolves FK ids to human-readable codes/names
 * so the file can be edited and re-imported without lookups.
 */
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { downloadExcel } from '@/utils/fileDownloader';

const PAGE = 1000;

async function fetchAll<T = any>(table: string, select: string): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // Paginate to bypass the 1000 row default cap.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from(table as any)
      .select(select)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

const blank = (v: any) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
    ? ''
    : v;

const filenameFromUrl = (url?: string | null): string => {
  if (!url) return '';
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  } catch {
    const parts = String(url).split('/');
    return parts[parts.length - 1] || '';
  }
};

export const EXPORT_ALL_COLUMNS = [
  'sku',
  'name',
  'description',
  'brand',
  'category',
  'product_type',
  'gst_percentage',
  'hsn_code',
  'tax_master',
  'rate',
  'base_unit',
  'price_basis_unit',
  'default_sales_unit',
  'unit_1',
  'unit_1_factor',
  'unit_2',
  'unit_2_factor',
  'unit_3',
  'unit_3_factor',
  'opening_stock',
  'reorder_level',
  'net_weight_g',
  'net_volume_ml',
  'image_file',
  'is_active',
  'is_discontinued',
] as const;

export const EXPORT_MANDATORY_COLUMNS = [
  'sku',
  'name',
  'category',
  'gst_percentage',
  'rate',
  'base_unit',
  'price_basis_unit',
  'default_sales_unit',
] as const;

export async function exportProductsMaster(columns?: string[]): Promise<void> {
  // 1. Lookup tables (small, single shot is fine).
  const [{ data: cats }, { data: uoms }, { data: taxes }] = await Promise.all([
    supabase.from('product_categories').select('id, name'),
    supabase.from('uom_master').select('id, code'),
    supabase.from('tax_masters').select('id, name'),
  ]);
  const catName = new Map((cats ?? []).map((c: any) => [c.id, c.name]));
  const uomCode = new Map((uoms ?? []).map((u: any) => [u.id, u.code]));
  const taxName = new Map((taxes ?? []).map((t: any) => [t.id, t.name]));

  // 2. Products (paginated).
  const products = await fetchAll<any>(
    'products',
    'id, sku, name, description, brand, product_type, category_id, gst_percentage, hsn_code, tax_master_id, rate, base_unit, price_basis_uom_id, default_sales_uom_id, opening_stock, reorder_level, net_weight_g, net_volume_ml, sku_image_url, is_active, is_discontinued',
  );

  // 3. UOM mappings for every product (paginated).
  const mappings = await fetchAll<any>(
    'product_uom_mapping',
    'product_id, uom_id, conversion_to_base, is_base, is_active',
  );
  const mapByProduct = new Map<string, any[]>();
  for (const m of mappings) {
    if (m.is_active === false) continue;
    if (m.is_base) continue;
    const arr = mapByProduct.get(m.product_id) ?? [];
    arr.push(m);
    mapByProduct.set(m.product_id, arr);
  }

  // 4. Build rows in the exact column order. Filter by selection but keep the
  // canonical order, and always include mandatory columns.
  const selected = new Set(columns ?? EXPORT_ALL_COLUMNS);
  for (const m of EXPORT_MANDATORY_COLUMNS) selected.add(m);
  const header = EXPORT_ALL_COLUMNS.filter((c) => selected.has(c));

  let missingPrice = 0,
    missingHsn = 0,
    missingUnits = 0,
    missingImage = 0,
    missingGst = 0;

  const rows = products.map((p) => {
    const extras = (mapByProduct.get(p.id) ?? [])
      .slice()
      .sort(
        (a, b) =>
          Number(a.conversion_to_base ?? 0) - Number(b.conversion_to_base ?? 0),
      )
      .slice(0, 3);
    const u = (i: number) => extras[i]?.uom_id ? uomCode.get(extras[i].uom_id) ?? '' : '';
    const f = (i: number) =>
      extras[i]?.conversion_to_base != null
        ? Number(extras[i].conversion_to_base)
        : '';

    const imageFile = filenameFromUrl(p.sku_image_url);

    if (p.rate == null || Number(p.rate) === 0) missingPrice++;
    if (!p.hsn_code) missingHsn++;
    if (extras.length === 0) missingUnits++;
    if (!imageFile) missingImage++;
    if (p.gst_percentage == null) missingGst++;

    return {
      sku: blank(p.sku),
      name: blank(p.name),
      description: blank(p.description),
      brand: blank(p.brand),
      category: blank(catName.get(p.category_id) ?? ''),
      product_type: blank(p.product_type),
      gst_percentage: p.gst_percentage ?? '',
      hsn_code: blank(p.hsn_code),
      tax_master: blank(taxName.get(p.tax_master_id) ?? ''),
      rate: p.rate ?? '',
      base_unit: blank(p.base_unit),
      price_basis_unit: blank(uomCode.get(p.price_basis_uom_id) ?? ''),
      default_sales_unit: blank(uomCode.get(p.default_sales_uom_id) ?? ''),
      unit_1: u(0),
      unit_1_factor: f(0),
      unit_2: u(1),
      unit_2_factor: f(1),
      unit_3: u(2),
      unit_3_factor: f(2),
      opening_stock: p.opening_stock ?? '',
      reorder_level: p.reorder_level ?? '',
      net_weight_g: p.net_weight_g ?? '',
      net_volume_ml: p.net_volume_ml ?? '',
      image_file: imageFile,
      is_active: p.is_active === false ? 'no' : 'yes',
      is_discontinued: p.is_discontinued ? 'yes' : 'no',
    };
  });

  // 5. Workbook.
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, { header });
  XLSX.utils.book_append_sheet(wb, ws, 'Products');

  const summary = [
    ['Metric', 'Count'],
    ['Total products', products.length],
    ['Missing price (rate)', missingPrice],
    ['Missing HSN code', missingHsn],
    ['Missing units (no packaging mapping)', missingUnits],
    ['Missing image', missingImage],
    ['Missing GST %', missingGst],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(summary);
  XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

  const date = new Date().toISOString().slice(0, 10);
  await downloadExcel(wb, `products_export_${date}.xlsx`, XLSX);
}
