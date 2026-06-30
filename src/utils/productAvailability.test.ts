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
