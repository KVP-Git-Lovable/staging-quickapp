import { describe, it, expect } from 'vitest';
import {
  buildRetailerContext,
  buildDistributorContext,
  filterAvailableProducts,
  isProductAvailable,
  type AvailabilityRow,
  type RetailerContext,
} from './productAvailability';

const ctxIndia = (overrides: Partial<RetailerContext> = {}): RetailerContext => ({
  state: 'Karnataka',
  region: 'South',
  zone: 'Bangalore',
  territory_id: 't-1',
  distributor_id: 'd-1',
  user_id: 'u-1',
  ...overrides,
});

const row = (
  scope_type: AvailabilityRow['scope_type'],
  scope_value: string,
  mode: AvailabilityRow['mode'] = 'include',
  product_id = 'p-1'
): AvailabilityRow => ({ product_id, scope_type, scope_value, mode });

describe('isProductAvailable', () => {
  it('returns true when no rows', () => {
    expect(isProductAvailable([], ctxIndia())).toBe(true);
    expect(isProductAvailable(null, ctxIndia())).toBe(true);
    expect(isProductAvailable(undefined, ctxIndia())).toBe(true);
  });

  it('include region North + ctx North => visible', () => {
    const rows = [row('region', 'North')];
    expect(isProductAvailable(rows, ctxIndia({ region: 'North' }))).toBe(true);
  });

  it('include region North + ctx South => hidden', () => {
    const rows = [row('region', 'North')];
    expect(isProductAvailable(rows, ctxIndia({ region: 'South' }))).toBe(false);
  });

  it('exclude state Kerala + ctx Kerala => hidden', () => {
    const rows = [row('state', 'Kerala', 'exclude')];
    expect(isProductAvailable(rows, ctxIndia({ state: 'Kerala' }))).toBe(false);
  });

  it('exclude state Kerala + ctx Karnataka => visible (no includes => default visible)', () => {
    const rows = [row('state', 'Kerala', 'exclude')];
    expect(isProductAvailable(rows, ctxIndia({ state: 'Karnataka' }))).toBe(true);
  });

  it('exclude wins over matching include', () => {
    const rows = [
      row('region', 'South'),
      row('state', 'Karnataka', 'exclude'),
    ];
    expect(isProductAvailable(rows, ctxIndia())).toBe(false);
  });

  it('territory uuid matching', () => {
    const rows = [row('territory', 't-42')];
    expect(isProductAvailable(rows, ctxIndia({ territory_id: 't-42' }))).toBe(true);
    expect(isProductAvailable(rows, ctxIndia({ territory_id: 't-1' }))).toBe(false);
  });

  it('distributor uuid matching', () => {
    const rows = [row('distributor', 'd-9')];
    expect(isProductAvailable(rows, ctxIndia({ distributor_id: 'd-9' }))).toBe(true);
    expect(isProductAvailable(rows, ctxIndia({ distributor_id: 'd-1' }))).toBe(false);
  });

  it('user uuid matching', () => {
    const rows = [row('user', 'u-7')];
    expect(isProductAvailable(rows, ctxIndia({ user_id: 'u-7' }))).toBe(true);
    expect(isProductAvailable(rows, ctxIndia({ user_id: 'u-1' }))).toBe(false);
  });

  it('null ctx fields never match', () => {
    const rows = [row('region', 'North')];
    expect(isProductAvailable(rows, ctxIndia({ region: null }))).toBe(false);
    const exRows = [row('state', 'Kerala', 'exclude')];
    expect(isProductAvailable(exRows, ctxIndia({ state: null }))).toBe(true);
  });

  it('multiple includes — visible if ANY include matches', () => {
    const rows = [row('region', 'North'), row('region', 'South')];
    expect(isProductAvailable(rows, ctxIndia({ region: 'South' }))).toBe(true);
    expect(isProductAvailable(rows, ctxIndia({ region: 'East' }))).toBe(false);
  });
});

describe('buildRetailerContext', () => {
  it('derives region/zone from territory lookup when retailer lacks them', () => {
    const territories = new Map([['t-1', { region: 'South', zone: 'BLR' }]]);
    const ctx = buildRetailerContext(
      { state: 'Karnataka', territory_id: 't-1', distributor_id: 'd-1' },
      territories,
      'u-1'
    );
    expect(ctx).toEqual({
      state: 'Karnataka',
      region: 'South',
      zone: 'BLR',
      territory_id: 't-1',
      distributor_id: 'd-1',
      user_id: 'u-1',
    });
  });

  it('retailer-level region/zone wins over territory lookup', () => {
    const territories = { 't-1': { region: 'South', zone: 'BLR' } };
    const ctx = buildRetailerContext(
      { state: 'KA', region: 'West', zone: 'PUN', territory_id: 't-1' },
      territories,
      'u-1'
    );
    expect(ctx.region).toBe('West');
    expect(ctx.zone).toBe('PUN');
  });

  it('handles null retailer / missing territory gracefully', () => {
    const ctx = buildRetailerContext(null, null, 'u-9');
    expect(ctx).toEqual({
      state: null, region: null, zone: null,
      territory_id: null, distributor_id: null, user_id: 'u-9',
    });
  });

  it('falls back to retailer.user_id when no explicit userId passed', () => {
    const ctx = buildRetailerContext({ user_id: 'u-fallback' }, null, null);
    expect(ctx.user_id).toBe('u-fallback');
  });
});

describe('filterAvailableProducts', () => {
  type P = { id: string; base_id?: string; name: string };
  const products: P[] = [
    { id: 'p-1', name: 'Always visible' },
    { id: 'p-2', name: 'North only' },
    { id: 'p-3', name: 'Excluded in Kerala' },
    { id: 'v-4', base_id: 'p-2', name: 'Variant of North only' },
  ];
  const getBaseId = (p: P) => p.base_id ?? p.id;

  const map = new Map<string, AvailabilityRow[]>([
    ['p-2', [row('region', 'North', 'include', 'p-2')]],
    ['p-3', [row('state', 'Kerala', 'exclude', 'p-3')]],
  ]);

  it('keeps unrestricted products and applies include rules via base id', () => {
    const northCtx = ctxIndia({ region: 'North', state: 'Delhi' });
    const out = filterAvailableProducts(products, getBaseId, map, northCtx);
    expect(out.map((p) => p.id).sort()).toEqual(['p-1', 'p-2', 'p-3', 'v-4']);
  });

  it('hides include-gated product (and its variant) outside the included region', () => {
    const southCtx = ctxIndia({ region: 'South', state: 'Karnataka' });
    const out = filterAvailableProducts(products, getBaseId, map, southCtx);
    expect(out.map((p) => p.id).sort()).toEqual(['p-1', 'p-3']);
  });

  it('exclude rule hides the product in the matching state', () => {
    const keralaCtx = ctxIndia({ region: 'South', state: 'Kerala' });
    const out = filterAvailableProducts(products, getBaseId, map, keralaCtx);
    expect(out.map((p) => p.id)).toEqual(['p-1']);
  });

  it('no map / empty map => no filtering', () => {
    expect(filterAvailableProducts(products, getBaseId, null, ctxIndia()).length).toBe(4);
    expect(filterAvailableProducts(products, getBaseId, new Map(), ctxIndia()).length).toBe(4);
  });
});

describe('buildDistributorContext', () => {
  it('pulls region/zone from territory and sets distributor_id from id', () => {
    const terrs = new Map([['t-9', { region: 'East', zone: 'Kolkata' }]]);
    const ctx = buildDistributorContext(
      { id: 'd-9', state: 'WB', territory_id: 't-9' },
      terrs,
      'u-9'
    );
    expect(ctx).toEqual({
      state: 'WB', region: 'East', zone: 'Kolkata',
      territory_id: 't-9', distributor_id: 'd-9', user_id: 'u-9',
    });
  });
});
