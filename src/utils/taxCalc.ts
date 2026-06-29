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
