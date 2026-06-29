/**
 * Shared variant resolver — Phase 3.
 *
 * A `product_variant` row may OVERRIDE any master field from its base `product`.
 * NULL/undefined on the variant means "inherit from base".
 *
 * This resolver is PURE: callers pass the base + (optional) variant objects they
 * already have in memory. No DB calls.
 *
 * Use this everywhere a product/variant is displayed (pickers, cart, catalog,
 * invoice line resolution) so the same rules apply across the app.
 */

export interface ResolvedProduct {
  product_id: string;
  variant_id: string | null;
  is_variant: boolean;
  display_name: string;
  sku: string | null;
  rate: number;
  gst_percentage: number | null;
  tax_master_id: string | null;
  hsn_code: string | null;
  category_id: string | null;
  brand: string | null;
  product_type: string | null;
  description: string | null;
  net_weight_g: number | null;
  net_volume_ml: number | null;
  standard_cost: number | null;
  default_sales_uom_id: string | null;
  price_basis_uom_id: string | null;
  base_unit: string | null;
  image_url: string | null;
  stock: number;
}

// Pick variant value when non-null/undefined, otherwise fall back to base.
const pick = <T,>(...vals: Array<T | null | undefined>): T | null => {
  for (const v of vals) {
    if (v !== null && v !== undefined) return v as T;
  }
  return null;
};

export function resolveProduct(base: any, variant?: any | null): ResolvedProduct {
  const v = variant || undefined;

  const rate = Number(
    pick<number>(v?.price, v?.rate, base?.rate, base?.price, 0) ?? 0,
  );

  const stock = v
    ? Number(v.stock_quantity ?? 0)
    : Number(base?.closing_stock ?? base?.stock_quantity ?? 0);

  return {
    product_id: base?.id,
    variant_id: v?.id ?? null,
    is_variant: !!v,

    display_name: pick<string>(v?.variant_name, base?.name) ?? '',
    sku: pick<string>(v?.sku, base?.sku),
    rate,

    gst_percentage: pick<number>(v?.gst_percentage, base?.gst_percentage),
    tax_master_id: pick<string>(v?.tax_master_id, base?.tax_master_id),
    hsn_code: pick<string>(v?.hsn_code, base?.hsn_code),

    category_id: pick<string>(v?.category_id, base?.category_id),
    brand: pick<string>(v?.brand, base?.brand),
    product_type: pick<string>(v?.product_type, base?.product_type),
    description: pick<string>(v?.description, base?.description),

    net_weight_g: pick<number>(v?.net_weight_g, v?.variant_weight_g, base?.net_weight_g),
    net_volume_ml: pick<number>(v?.net_volume_ml, base?.net_volume_ml),
    standard_cost: pick<number>(v?.standard_cost, v?.variant_cost, base?.standard_cost),

    default_sales_uom_id: pick<string>(v?.default_sales_uom_id, base?.default_sales_uom_id),
    price_basis_uom_id: pick<string>(v?.price_basis_uom_id, base?.price_basis_uom_id),
    base_unit: pick<string>(v?.base_unit, base?.base_unit),

    image_url: pick<string>(v?.sku_image_url, v?.image_url, base?.sku_image_url, base?.image_url),
    stock,
  };
}
