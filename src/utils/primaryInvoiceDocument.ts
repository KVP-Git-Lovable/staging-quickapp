import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { generateTemplate4Invoice } from './invoiceGenerator';

export interface PrimaryDocLine {
  product_name: string;
  hsn_code?: string | null;
  unit?: string | null;
  packed_qty: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
}

export interface PrimaryDocInput {
  invoiceNumber: string;       // PINV-... or DRAFT-...
  invoiceDate?: string | null;
  isDraft: boolean;
  distributor: any;            // {name, address, gst_number, phone, state, contact_person, ...}
  company: any;
  lines: PrimaryDocLine[];
}

async function stampDraft(blob: Blob): Promise<Blob> {
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pdf = await PDFDocument.load(bytes);
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    const text = 'DRAFT — not a tax invoice';
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      const size = 48;
      const textWidth = font.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: (width - textWidth * 0.7) / 2,
        y: height / 2,
        size,
        font,
        color: rgb(0.78, 0.55, 0.05),
        opacity: 0.22,
        rotate: degrees(-30),
      });
    }
    const out = await pdf.save();
    return new Blob([out as BlobPart], { type: 'application/pdf' });
  } catch (e) {
    console.warn('[stampDraft] skipped', e);
    return blob;
  }
}

export async function buildPrimaryInvoiceBlob(input: PrimaryDocInput): Promise<Blob> {
  const cartItems = input.lines
    .filter(l => (l.packed_qty || 0) > 0)
    .map(l => {
      const qty = Number(l.packed_qty) || 0;
      const rate = Number(l.unit_price) || 0;
      const gross = qty * rate;
      const discount = gross * (Number(l.discount_percent) || 0) / 100;
      const taxable = gross - discount;
      const tax = taxable * (Number(l.tax_percent) || 0) / 100;
      const total = taxable + tax;
      return {
        name: l.product_name,
        product_name: l.product_name,
        quantity: qty,
        price: rate,
        rate,
        total,
        hsn_code: l.hsn_code || '-',
        unit: l.unit || 'Piece',
        base_unit: l.unit || 'Piece',
        taxable_amount: taxable,
        sgst_amount: tax / 2,
        cgst_amount: tax / 2,
        total_amount: total,
      };
    });

  const raw = await generateTemplate4Invoice({
    orderId: input.invoiceNumber,
    company: input.company || {},
    retailer: {
      name: input.distributor?.name,
      address: input.distributor?.address,
      phone: input.distributor?.phone,
      gst_number: input.distributor?.gst_number,
    },
    cartItems,
    displayInvoiceNumber: input.invoiceNumber,
    displayInvoiceDate: input.invoiceDate || undefined,
  });

  return input.isDraft ? await stampDraft(raw) : raw;
}
