// Resolves what a scheme's Category/Product list column should display.
// Bundle/Combo schemes and multi-product schemes ("Apply to Multiple
// Products") both target a set of products via an ID array rather than a
// single product_id/category_id, so neither has anything for the existing
// single-product/single-category fallback to show.

export interface SchemeProductLabelInput {
  scheme_type: string;
  // Callers with a joined product/category row (e.g. Scheme Management) use these.
  product?: { name?: string | null } | null;
  category?: { name?: string | null } | null;
  // Callers with a flat, pre-resolved name (e.g. the offline scheme cache used
  // in Order Entry) use these instead — no joined row is available there.
  product_name?: string | null;
  category_name?: string | null;
  bundle_product_ids?: string[] | null;
  target_product_ids?: string[] | null;
}

export interface ProductNameLookup {
  id: string;
  name: string;
}

function namesForIds(ids: string[] | null | undefined, products: ProductNameLookup[]): string[] {
  if (!ids || ids.length === 0) return [];
  const nameById = new Map(products.map(p => [p.id, p.name]));
  return ids.map(id => nameById.get(id)).filter((name): name is string => !!name);
}

function formatNameList(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
}

export function getSchemeProductLabel(
  scheme: SchemeProductLabelInput,
  products: ProductNameLookup[]
): string {
  if (scheme.scheme_type === 'bundle_combo') {
    const bundleLabel = formatNameList(namesForIds(scheme.bundle_product_ids, products));
    if (bundleLabel) return bundleLabel;
  }

  const targetLabel = formatNameList(namesForIds(scheme.target_product_ids, products));
  if (targetLabel) return targetLabel;

  return (
    scheme.product?.name ||
    scheme.category?.name ||
    scheme.product_name ||
    scheme.category_name ||
    'All Products'
  );
}
