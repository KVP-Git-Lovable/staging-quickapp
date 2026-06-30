/**
 * Product availability resolver (Phase 7-1).
 *
 * Pure functions only — no Supabase, no React, no I/O. Consumers fetch the
 * availability rows + a retailer context and ask `isProductAvailable(...)`.
 *
 * Semantics:
 *   - No rows for a product => available everywhere.
 *   - Any matched `exclude` row => hidden (exclude always wins).
 *   - If any `include` rows exist, the product is visible ONLY when an
 *     include row matches the context.
 *   - Variants inherit their base product's rows — always resolve against
 *     the BASE product_id.
 */

export type AvailabilityScope =
  | 'region'
  | 'zone'
  | 'state'
  | 'territory'
  | 'distributor'
  | 'user';

export type AvailabilityMode = 'include' | 'exclude';

export type AvailabilityRow = {
  product_id: string;
  scope_type: AvailabilityScope;
  scope_value: string;
  mode: AvailabilityMode;
};

export type RetailerContext = {
  state: string | null;
  region: string | null;
  zone: string | null;
  territory_id: string | null;
  distributor_id: string | null;
  user_id: string | null;
};

export type TerritoryLookupEntry = {
  region?: string | null;
  zone?: string | null;
};

type RetailerLike = {
  state?: string | null;
  region?: string | null;
  zone?: string | null;
  territory_id?: string | null;
  distributor_id?: string | null;
  user_id?: string | null;
};

/**
 * Build a RetailerContext from a retailer + a territories lookup map.
 *
 * - region/zone come from the retailer's territory when present;
 *   any explicit value on the retailer itself wins.
 * - userId is the current rep/distributor user driving the order.
 */
export function buildRetailerContext(
  retailer: RetailerLike | null | undefined,
  territoriesById: Map<string, TerritoryLookupEntry> | Record<string, TerritoryLookupEntry> | null | undefined,
  userId: string | null | undefined
): RetailerContext {
  const r = retailer ?? {};
  const territoryId = r.territory_id ?? null;

  let territory: TerritoryLookupEntry | undefined;
  if (territoryId && territoriesById) {
    if (territoriesById instanceof Map) {
      territory = territoriesById.get(territoryId);
    } else {
      territory = (territoriesById as Record<string, TerritoryLookupEntry>)[territoryId];
    }
  }

  return {
    state: r.state ?? null,
    region: r.region ?? territory?.region ?? null,
    zone: r.zone ?? territory?.zone ?? null,
    territory_id: territoryId,
    distributor_id: r.distributor_id ?? null,
    user_id: userId ?? r.user_id ?? null,
  };
}

function contextValue(ctx: RetailerContext, scope: AvailabilityScope): string | null {
  switch (scope) {
    case 'region': return ctx.region;
    case 'zone': return ctx.zone;
    case 'state': return ctx.state;
    case 'territory': return ctx.territory_id;
    case 'distributor': return ctx.distributor_id;
    case 'user': return ctx.user_id;
  }
}

/**
 * `rows` MUST be the availability rows for ONE product (the BASE product id).
 * Variants do not have their own rows — always call with the base product_id.
 */
export function isProductAvailable(
  rows: AvailabilityRow[] | null | undefined,
  ctx: RetailerContext
): boolean {
  if (!rows || rows.length === 0) return true;

  const matched = (r: AvailabilityRow): boolean => {
    const v = contextValue(ctx, r.scope_type);
    return v != null && String(v) === String(r.scope_value);
  };

  if (rows.some((r) => r.mode === 'exclude' && matched(r))) return false;

  const includes = rows.filter((r) => r.mode === 'include');
  if (includes.length === 0) return true;
  return includes.some(matched);
}

/**
 * Filter a list of products/variants by availability. The caller supplies
 * `getBaseProductId` so this works for both base products and variants
 * (variants must always resolve against their BASE product_id).
 */
export function filterAvailableProducts<T>(
  products: T[],
  getBaseProductId: (p: T) => string | null | undefined,
  availabilityByProductId: Map<string, AvailabilityRow[]> | null | undefined,
  ctx: RetailerContext
): T[] {
  if (!products || products.length === 0) return products ?? [];
  if (!availabilityByProductId || availabilityByProductId.size === 0) return products;
  return products.filter((p) => {
    const id = getBaseProductId(p);
    if (!id) return true;
    const rows = availabilityByProductId.get(id);
    return isProductAvailable(rows ?? null, ctx);
  });
}

type DistributorLike = {
  id?: string | null;
  state?: string | null;
  region?: string | null;
  zone?: string | null;
  territory_id?: string | null;
};

/**
 * Build a RetailerContext for distributor-driven order flows (e.g. primary
 * order from the distributor portal where there is no retailer yet).
 * The context represents the distributor's own region/zone/state/territory.
 */
export function buildDistributorContext(
  distributor: DistributorLike | null | undefined,
  territoriesById: Map<string, TerritoryLookupEntry> | Record<string, TerritoryLookupEntry> | null | undefined,
  userId: string | null | undefined
): RetailerContext {
  const d = distributor ?? {};
  const territoryId = d.territory_id ?? null;

  let territory: TerritoryLookupEntry | undefined;
  if (territoryId && territoriesById) {
    if (territoriesById instanceof Map) {
      territory = territoriesById.get(territoryId);
    } else {
      territory = (territoriesById as Record<string, TerritoryLookupEntry>)[territoryId];
    }
  }

  return {
    state: d.state ?? null,
    region: d.region ?? territory?.region ?? null,
    zone: d.zone ?? territory?.zone ?? null,
    territory_id: territoryId,
    distributor_id: d.id ?? null,
    user_id: userId ?? null,
  };
}
