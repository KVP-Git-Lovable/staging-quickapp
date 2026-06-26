/**
 * Phase 3: Blank import template with sample row + legend sheet.
 * Mirrors the Phase 2 export column set so a downloaded export can be
 * re-uploaded after edits without column rearrangement.
 */
import * as XLSX from 'xlsx';
import { downloadExcel } from '@/utils/fileDownloader';

export const IMPORT_HEADERS = [
  'sku*',
  'name*',
  'description',
  'brand',
  'category*',
  'product_type',
  'gst_percentage*',
  'hsn_code',
  'tax_master',
  'rate*',
  'base_unit*',
  'price_basis_unit*',
  'default_sales_unit*',
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

// Strip the trailing "*" used to mark mandatory headers.
export const cleanHeader = (h: string) => h.replace(/\*$/, '').trim().toLowerCase();

export async function downloadProductImportTemplate(): Promise<void> {
  const sampleRows = [
    {
      'sku*': 'COFFEE01',
      'name*': 'British Coffee 250g',
      description: 'Instant filter coffee',
      brand: 'British',
      'category*': 'Beverages',
      product_type: 'finished_good',
      'gst_percentage*': 5,
      hsn_code: '21011200',
      tax_master: 'GST 5%',
      'rate*': 240,
      'base_unit*': 'PIECE',
      'price_basis_unit*': 'PIECE',
      'default_sales_unit*': 'PIECE',
      unit_1: 'BOX',
      unit_1_factor: 24,
      unit_2: 'CARTON',
      unit_2_factor: 144,
      unit_3: '',
      unit_3_factor: '',
      opening_stock: 0,
      reorder_level: 10,
      net_weight_g: 250,
      net_volume_ml: '',
      image_file: 'COFFEE01.jpg',
      is_active: 'yes',
      is_discontinued: 'no',
    },
    {
      'sku*': 'SUGAR1KG',
      'name*': 'White Sugar 1kg',
      description: 'Refined white sugar',
      brand: 'Generic',
      'category*': 'Groceries',
      product_type: 'finished_good',
      'gst_percentage*': 5,
      hsn_code: '17019100',
      tax_master: '',
      'rate*': 45,
      'base_unit*': 'GRAM',
      'price_basis_unit*': 'KG',
      'default_sales_unit*': 'KG',
      unit_1: 'BAG',
      unit_1_factor: 30,
      unit_2: '',
      unit_2_factor: '',
      unit_3: '',
      unit_3_factor: '',
      opening_stock: 0,
      reorder_level: 50,
      net_weight_g: 1000,
      net_volume_ml: '',
      image_file: 'SUGAR1KG.jpg',
      is_active: 'yes',
      is_discontinued: 'no',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows, { header: IMPORT_HEADERS as unknown as string[] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products');

  const legend: (string | number)[][] = [
    ['Column', 'Mandatory', 'Description'],
    ['sku', 'YES', 'Unique product SKU; upsert key.'],
    ['name', 'YES', 'Product display name.'],
    ['description', 'no', 'Long description.'],
    ['brand', 'no', 'Brand name.'],
    ['category', 'YES', 'Must match an existing product category (by name).'],
    ['product_type', 'no', 'e.g. finished_good, raw_material.'],
    ['gst_percentage', 'YES', '0–100. Used for tax display.'],
    ['hsn_code', 'no', 'HSN/SAC code.'],
    ['tax_master', 'no', 'Optional Tax Master name (must exist).'],
    ['rate', 'YES', 'Selling price for the price_basis_unit. > 0.'],
    ['base_unit', 'YES', 'Smallest unit (e.g. PIECE, GRAM, ML). Must be the base of its category.'],
    ['price_basis_unit', 'YES', 'Unit the rate is quoted in. Must exist & be enabled.'],
    ['default_sales_unit', 'YES', 'Default unit shown during order entry.'],
    ['unit_1 / unit_2 / unit_3', 'no', 'Additional units mapped to this product.'],
    ['unit_n_factor', 'depends', 'PACK/COUNT units (BOX, CARTON, BAG) REQUIRE a factor (qty per piece). Dimensional units (KG, LITRE…) inherit from the Unit Master and may be left blank.'],
    ['opening_stock / reorder_level', 'no', 'Numeric.'],
    ['net_weight_g', 'no', 'Required for weight-based products (base_unit = GRAM).'],
    ['net_volume_ml', 'no', 'Required for volume-based products (base_unit = ML).'],
    ['image_file', 'no', 'Reference filename only; upload images separately on the Images tab (filename minus extension = SKU).'],
    ['is_active', 'no', 'yes/no. Defaults to yes.'],
    ['is_discontinued', 'no', 'yes/no. Defaults to no.'],
    [],
    ['Two-tier UOM rule', '', ''],
    ['Dimensional (Weight/Volume/Length)', '', 'Conversion is physics and set ONCE in the Unit Master (e.g. KG=1000g, LITRE=1000ml). Leave unit_n_factor blank.'],
    ['Pack / Count (Quantity, Packaging, Medication, Electronics)', '', 'Conversion is per-product (1 BOX = 24 for product A, 12 for product B). Always provide unit_n_factor.'],
  ];
  const wsLegend = XLSX.utils.aoa_to_sheet(legend);
  XLSX.utils.book_append_sheet(wb, wsLegend, 'Legend');

  const date = new Date().toISOString().slice(0, 10);
  await downloadExcel(wb, `products_import_template_${date}.xlsx`, XLSX);
}
