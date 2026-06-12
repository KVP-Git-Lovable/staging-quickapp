// Shared fuzzy matching utilities for product name resolution
// Used by both Voice Order and Chat Order flows

export interface FuzzyProduct {
  id: string;
  name: string;
  rate: number;
  unit?: string;
  sku?: string;
  category?: { name: string } | string;
  variants?: {
    id: string;
    variant_name: string;
    sku?: string;
    price: number;
    is_active?: boolean;
  }[];
}

export const normalizeUnit = (unit: string): string => {
  const u = (unit || '').toLowerCase().trim();
  if (['gram', 'grams', 'gm', 'grm'].includes(u)) return 'g';
  if (['kilogram', 'kilograms', 'kilo', 'kilos'].includes(u)) return 'kg';
  return u;
};

export const collapseWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const levenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
};

const levenshteinSimilarity = (a: string, b: string): number => {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
};

export const extractPrimaryName = (s: string): string => {
  const cleaned = s.toLowerCase().trim()
    .replace(/\d+/g, '')
    .replace(/\b(g|gm|gram|grams|kg|kilo|kilogram|kilograms)\b/gi, '')
    .trim();
  const words = cleaned.split(/\s+/).filter(w => w.length >= 2);
  return words[0] || cleaned;
};

export const extractSize = (s: string): string | null => {
  const match = s.match(/(\d+)\s*(g|gm|gram|grams|kg|kilo|kilogram|kilograms)?/i);
  if (!match) return null;
  const num = match[1];
  const unit = normalizeUnit(match[2] || '');
  return unit === 'kg' ? String(parseInt(num) * 1000) : num;
};

export const fuzzyMatch = (searchTerm: string, target: string): number => {
  const searchLower = searchTerm.toLowerCase().trim();
  const targetLower = target.toLowerCase().trim();
  if (targetLower === searchLower) return 1;

  const searchPrimary = extractPrimaryName(searchLower);
  const targetPrimary = extractPrimaryName(targetLower);

  let primaryScore = 0;
  if (searchPrimary && targetPrimary) {
    if (searchPrimary === targetPrimary) primaryScore = 1;
    else if (targetPrimary.includes(searchPrimary) || searchPrimary.includes(targetPrimary)) primaryScore = 0.9;
    else primaryScore = levenshteinSimilarity(searchPrimary, targetPrimary);
  }

  const searchSize = extractSize(searchLower);
  const targetSize = extractSize(targetLower);
  let sizeScore = 0;
  if (searchSize && targetSize) {
    sizeScore = searchSize === targetSize ? 1 : Math.max(0, 1 - Math.abs(parseInt(searchSize) - parseInt(targetSize)) / Math.max(parseInt(searchSize), parseInt(targetSize)));
  } else if (!searchSize && !targetSize) {
    sizeScore = 0.5;
  }

  if (primaryScore < 0.4) return 0;
  return primaryScore * 0.7 + sizeScore * 0.3;
};

export const findBestMatch = (searchName: string, products: FuzzyProduct[]) => {
  let bestScore = 0;
  let bestProduct: FuzzyProduct | null = null;
  let bestVariant: FuzzyProduct['variants'] extends (infer V)[] ? V : never | undefined;

  for (const product of products) {
    const baseScore = fuzzyMatch(searchName, product.name);
    if (baseScore > bestScore) { bestScore = baseScore; bestProduct = product; bestVariant = undefined; }

    if (product.variants) {
      for (const variant of product.variants) {
        if (variant.is_active === false) continue;
        const vs = fuzzyMatch(searchName, variant.variant_name);
        if (vs > bestScore) { bestScore = vs; bestProduct = product; bestVariant = variant; }
        const cs = fuzzyMatch(searchName, `${product.name} ${variant.variant_name}`);
        if (cs > bestScore) { bestScore = cs; bestProduct = product; bestVariant = variant; }
      }
    }
  }

  const confidence: 'high' | 'medium' | 'low' = bestScore >= 0.8 ? 'high' : bestScore >= 0.5 ? 'medium' : 'low';
  return { product: bestScore >= 0.3 ? bestProduct : null, variant: bestVariant, confidence };
};

/** Build a shortlist of product names from transcript words for AI matching */
export const buildProductShortlist = (text: string, products: FuzzyProduct[], maxShortlist = 80, fallbackCount = 50): string[] => {
  const words = text.toLowerCase().split(/\s+/);
  const shortlisted: string[] = [];
  for (const product of products) {
    const pName = product.name.toLowerCase();
    const isCandidate = words.some(w => w.length >= 3 && pName.includes(w));
    if (isCandidate) {
      shortlisted.push(product.name);
      if (product.variants) {
        for (const v of product.variants) {
          if (v.is_active !== false) shortlisted.push(`${product.name} ${v.variant_name}`);
        }
      }
    }
  }
  return shortlisted.length > 0 ? shortlisted.slice(0, maxShortlist) : products.slice(0, fallbackCount).map(p => p.name);
};
