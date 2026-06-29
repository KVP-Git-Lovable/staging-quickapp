import { describe, it, expect } from 'vitest';
import { resolveProduct } from './resolveProduct';

const base = {
  id: 'prod-1',
  name: 'Mango Bar',
  sku: 'MB-001',
  rate: 100,
  gst_percentage: 18,
  tax_master_id: 'tm-18',
  hsn_code: '21050000',
  category_id: 'cat-1',
  brand: 'Acme',
  product_type: 'goods',
  description: 'Frozen mango bar',
  net_weight_g: 80,
  net_volume_ml: null,
  standard_cost: 45,
  default_sales_uom_id: 'uom-pc',
  price_basis_uom_id: 'uom-pc',
  base_unit: 'piece',
  sku_image_url: 'https://img/base.jpg',
  closing_stock: 50,
};

describe('resolveProduct', () => {
  it('returns base values when no variant is provided', () => {
    const r = resolveProduct(base);
    expect(r.is_variant).toBe(false);
    expect(r.variant_id).toBeNull();
    expect(r.display_name).toBe('Mango Bar');
    expect(r.rate).toBe(100);
    expect(r.gst_percentage).toBe(18);
    expect(r.tax_master_id).toBe('tm-18');
    expect(r.hsn_code).toBe('21050000');
    expect(r.sku).toBe('MB-001');
    expect(r.image_url).toBe('https://img/base.jpg');
    expect(r.stock).toBe(50);
  });

  it('returns variant values when variant overrides them', () => {
    const variant = {
      id: 'v-1',
      product_id: 'prod-1',
      variant_name: 'Mango Bar Family Pack',
      sku: 'MB-001-FP',
      price: 250,
      gst_percentage: 5,
      tax_master_id: 'tm-5',
      hsn_code: '21059900',
      category_id: 'cat-2',
      brand: 'Acme Plus',
      stock_quantity: 12,
      sku_image_url: 'https://img/variant.jpg',
    };
    const r = resolveProduct(base, variant);
    expect(r.is_variant).toBe(true);
    expect(r.variant_id).toBe('v-1');
    expect(r.display_name).toBe('Mango Bar Family Pack');
    expect(r.rate).toBe(250);
    expect(r.sku).toBe('MB-001-FP');
    expect(r.gst_percentage).toBe(5);
    expect(r.tax_master_id).toBe('tm-5');
    expect(r.hsn_code).toBe('21059900');
    expect(r.category_id).toBe('cat-2');
    expect(r.brand).toBe('Acme Plus');
    expect(r.image_url).toBe('https://img/variant.jpg');
    expect(r.stock).toBe(12);
  });

  it('falls back to base when variant fields are null (nothing blank)', () => {
    const variant = {
      id: 'v-2',
      product_id: 'prod-1',
      variant_name: 'Single',
      sku: null,
      price: null,
      gst_percentage: null,
      tax_master_id: null,
      hsn_code: null,
      category_id: null,
      brand: null,
      stock_quantity: 7,
      sku_image_url: null,
    };
    const r = resolveProduct(base, variant);
    expect(r.is_variant).toBe(true);
    expect(r.display_name).toBe('Single');
    // All NULL overrides → inherit from base
    expect(r.sku).toBe('MB-001');
    expect(r.rate).toBe(100);
    expect(r.gst_percentage).toBe(18);
    expect(r.tax_master_id).toBe('tm-18');
    expect(r.hsn_code).toBe('21050000');
    expect(r.category_id).toBe('cat-1');
    expect(r.brand).toBe('Acme');
    expect(r.image_url).toBe('https://img/base.jpg');
    // stock is own (not inherited)
    expect(r.stock).toBe(7);
  });
});
