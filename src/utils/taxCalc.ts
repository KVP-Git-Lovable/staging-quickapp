export interface LineTaxInput {
  taxableAmount: number;
  gstPercentage: number | null | undefined;
  isInterState?: boolean;
  cessPercentage?: number;
  roundingMode?: 'round' | 'none';
}

export interface LineTax {
  taxableAmount: number;
  taxRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  totalTax: number;
}

function roundHalfUp(n: number, decimals = 2): number {
  if (!Number.isFinite(n)) return 0;
  const factor = Math.pow(10, decimals);
  // round-half-up handling negatives symmetrically
  return Math.sign(n) * Math.floor(Math.abs(n) * factor + 0.5) / factor;
}

export function computeLineTax(input: LineTaxInput): LineTax {
  const rate = Math.max(0, Number(input.gstPercentage) || 0);
  const cessPct = Math.max(0, Number(input.cessPercentage) || 0);
  let taxable = Number(input.taxableAmount);
  if (!Number.isFinite(taxable) || taxable < 0) taxable = 0;

  const gstTax = (taxable * rate) / 100;
  const cessAmt = (taxable * cessPct) / 100;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (input.isInterState) {
    igst = gstTax;
  } else {
    cgst = gstTax / 2;
    sgst = gstTax / 2;
  }
  let cess = cessAmt;

  const mode = input.roundingMode ?? 'round';
  if (mode === 'round') {
    cgst = roundHalfUp(cgst);
    sgst = roundHalfUp(sgst);
    igst = roundHalfUp(igst);
    cess = roundHalfUp(cess);
  }

  const totalTax = cgst + sgst + igst + cess;

  return {
    taxableAmount: taxable,
    taxRate: rate,
    cgst,
    sgst,
    igst,
    cess,
    totalTax,
  };
}

export function sumLineTaxes(lines: LineTax[]): {
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  totalTax: number;
} {
  return lines.reduce(
    (acc, l) => {
      acc.cgst += l.cgst;
      acc.sgst += l.sgst;
      acc.igst += l.igst;
      acc.cess += l.cess;
      acc.totalTax += l.totalTax;
      return acc;
    },
    { cgst: 0, sgst: 0, igst: 0, cess: 0, totalTax: 0 },
  );
}

/**
 * Resolve a line's tax breakdown from a stored order_item / invoice line.
 * Prefers the persisted per-line amounts (cgst_amount, sgst_amount, igst_amount, cess_amount)
 * so the invoice equals the order. Falls back to computeLineTax ONLY when every stored
 * tax amount on the line is null (legacy orders).
 *
 * Accepts loose objects with these optional fields:
 *   cgst_amount, sgst_amount, igst_amount, cess_amount,
 *   tax_rate_snapshot, gst_percentage,
 *   total | taxable_amount  (the pre-tax line value)
 *   quantity, rate           (used to derive taxable if total missing)
 */
export function resolveLineTax(item: any): LineTax {
  const cgstA = item?.cgst_amount;
  const sgstA = item?.sgst_amount;
  const igstA = item?.igst_amount;
  const cessA = item?.cess_amount;

  const taxable =
    Number(item?.total ?? item?.taxable_amount ?? 0) ||
    (Number(item?.quantity) || 0) * (Number(item?.rate ?? item?.price) || 0);

  const rate = Number(item?.tax_rate_snapshot ?? item?.gst_percentage ?? 0) || 0;

  const allNull = cgstA == null && sgstA == null && igstA == null;
  if (allNull) {
    return computeLineTax({ taxableAmount: taxable, gstPercentage: rate });
  }

  const cgst = Number(cgstA) || 0;
  const sgst = Number(sgstA) || 0;
  const igst = Number(igstA) || 0;
  const cess = Number(cessA) || 0;
  return {
    taxableAmount: taxable,
    taxRate: rate,
    cgst,
    sgst,
    igst,
    cess,
    totalTax: cgst + sgst + igst + cess,
  };
}

