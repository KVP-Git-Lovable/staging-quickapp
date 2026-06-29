import { describe, it, expect } from 'vitest';
import { computeLineTax, sumLineTaxes } from './taxCalc';

describe('computeLineTax', () => {
  it('0% on 100 -> all zero', () => {
    const r = computeLineTax({ taxableAmount: 100, gstPercentage: 0 });
    expect(r.cgst).toBe(0);
    expect(r.sgst).toBe(0);
    expect(r.igst).toBe(0);
    expect(r.cess).toBe(0);
    expect(r.totalTax).toBe(0);
    expect(r.taxRate).toBe(0);
  });

  it('5% on 100 intrastate', () => {
    const r = computeLineTax({ taxableAmount: 100, gstPercentage: 5 });
    expect(r.cgst).toBe(2.5);
    expect(r.sgst).toBe(2.5);
    expect(r.igst).toBe(0);
    expect(r.totalTax).toBe(5);
    expect(r.taxRate).toBe(5);
  });

  it('18% on 100', () => {
    const r = computeLineTax({ taxableAmount: 100, gstPercentage: 18 });
    expect(r.cgst).toBe(9);
    expect(r.sgst).toBe(9);
    expect(r.totalTax).toBe(18);
  });

  it('28% on 1000', () => {
    const r = computeLineTax({ taxableAmount: 1000, gstPercentage: 28 });
    expect(r.cgst).toBe(140);
    expect(r.sgst).toBe(140);
    expect(r.totalTax).toBe(280);
  });

  it('interstate 18% on 100', () => {
    const r = computeLineTax({ taxableAmount: 100, gstPercentage: 18, isInterState: true });
    expect(r.igst).toBe(18);
    expect(r.cgst).toBe(0);
    expect(r.sgst).toBe(0);
    expect(r.totalTax).toBe(18);
  });

  it('gst 12% + cess 12% on 100', () => {
    const r = computeLineTax({ taxableAmount: 100, gstPercentage: 12, cessPercentage: 12 });
    expect(r.cgst).toBe(6);
    expect(r.sgst).toBe(6);
    expect(r.cess).toBe(12);
    expect(r.totalTax).toBe(24);
  });

  it('line rounding: 18% on 23.81', () => {
    const r = computeLineTax({ taxableAmount: 23.81, gstPercentage: 18 });
    expect(r.cgst).toBe(2.14);
    expect(r.sgst).toBe(2.14);
    expect(r.totalTax).toBe(4.28);
  });

  it('gstPercentage null -> all zero', () => {
    const r = computeLineTax({ taxableAmount: 100, gstPercentage: null });
    expect(r.cgst).toBe(0);
    expect(r.sgst).toBe(0);
    expect(r.totalTax).toBe(0);
  });

  it('gstPercentage undefined -> all zero', () => {
    const r = computeLineTax({ taxableAmount: 100, gstPercentage: undefined });
    expect(r.totalTax).toBe(0);
  });

  it('taxable NaN -> all zero', () => {
    const r = computeLineTax({ taxableAmount: NaN, gstPercentage: 18 });
    expect(r.taxableAmount).toBe(0);
    expect(r.totalTax).toBe(0);
  });

  it('taxable negative -> all zero', () => {
    const r = computeLineTax({ taxableAmount: -50, gstPercentage: 18 });
    expect(r.taxableAmount).toBe(0);
    expect(r.totalTax).toBe(0);
  });
});

describe('sumLineTaxes', () => {
  it('sums two lines', () => {
    const a = computeLineTax({ taxableAmount: 100, gstPercentage: 5 });
    const b = computeLineTax({ taxableAmount: 100, gstPercentage: 18 });
    const s = sumLineTaxes([a, b]);
    expect(s.cgst).toBe(11.5);
    expect(s.sgst).toBe(11.5);
    expect(s.totalTax).toBe(23);
  });
});
