import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, degrees } from 'pdf-lib';

// ---------- Types ----------
export interface PrimaryDocLine {
  product_name: string;
  hsn_code?: string | null;
  unit?: string | null;
  packed_qty: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number; // total GST % for this line (e.g. 5, 12, 18)
}

export interface PrimaryDocParty {
  name?: string | null;
  address?: string | null;
  gst_number?: string | null;
  state?: string | null;
  phone?: string | null;
  email?: string | null;
  contact_person?: string | null;
}

export interface PrimaryDocCompany extends PrimaryDocParty {
  gstin?: string | null;
  contact_phone?: string | null;
  header_name?: string | null;
}

export interface PrimaryDocInput {
  invoiceNumber: string;          // PINV-... or DRAFT-...
  invoiceDate?: string | null;
  dueDate?: string | null;
  isDraft: boolean;
  distributor: PrimaryDocParty | null;
  company: PrimaryDocCompany | null;
  lines: PrimaryDocLine[];
  orderNumber?: string | null;
  orderDate?: string | null;
  packingListNumber?: string | null;
  paymentTerms?: string | null;
  salesPerson?: string | null;
}

// ---------- Helpers ----------
const INDIAN_STATE_CODES: Record<string, string> = {
  'jammu and kashmir':'01','himachal pradesh':'02','punjab':'03','chandigarh':'04','uttarakhand':'05','haryana':'06','delhi':'07',
  'rajasthan':'08','uttar pradesh':'09','bihar':'10','sikkim':'11','arunachal pradesh':'12','nagaland':'13','manipur':'14',
  'mizoram':'15','tripura':'16','meghalaya':'17','assam':'18','west bengal':'19','jharkhand':'20','odisha':'21','orissa':'21',
  'chhattisgarh':'22','madhya pradesh':'23','gujarat':'24','daman and diu':'25','dadra and nagar haveli':'26',
  'maharashtra':'27','karnataka':'29','goa':'30','lakshadweep':'31','kerala':'32','tamil nadu':'33','puducherry':'34',
  'andaman and nicobar islands':'35','telangana':'36','andhra pradesh':'37','ladakh':'38',
};

function stateCode(stateOrGstin?: string | null): string | null {
  if (!stateOrGstin) return null;
  const s = stateOrGstin.trim();
  // GSTIN starts with 2-digit state code
  if (/^\d{2}[A-Z]{5}/i.test(s)) return s.slice(0, 2);
  const key = s.toLowerCase().replace(/[^a-z ]/g, '').trim();
  return INDIAN_STATE_CODES[key] || null;
}

function stateLabel(state?: string | null, gstin?: string | null): string {
  if (!state && !gstin) return '—';
  const code = stateCode(gstin || state || '');
  const name = state || '';
  if (name && code) return `${name} (${code})`;
  if (name) return name;
  if (code) return `(${code})`;
  return '—';
}

function fmtMoney(n: number): string {
  return (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numberToWords(num: number): string {
  if (!isFinite(num)) return '';
  const n = Math.floor(num);
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const two = (x: number): string => x < 20 ? ones[x] : tens[Math.floor(x/10)] + (x%10 ? ' ' + ones[x%10] : '');
  const three = (x: number): string => x >= 100 ? ones[Math.floor(x/100)] + ' Hundred' + (x%100 ? ' ' + two(x%100) : '') : two(x);
  if (n === 0 && Math.round((num - n) * 100) === 0) return 'Zero Rupees Only';
  let out = '';
  const cr = Math.floor(n/10000000); const rem1 = n%10000000;
  const lk = Math.floor(rem1/100000); const rem2 = rem1%100000;
  const th = Math.floor(rem2/1000); const rem3 = rem2%1000;
  if (cr) out += three(cr) + ' Crore ';
  if (lk) out += three(lk) + ' Lakh ';
  if (th) out += three(th) + ' Thousand ';
  if (rem3) out += three(rem3);
  const paise = Math.round((num - n) * 100);
  const main = (out.trim() || 'Zero') + ' Rupees';
  return (main + (paise ? ' and ' + two(paise) + ' Paise' : '') + ' Only').replace(/\s+/g,' ');
}

// ASCII-safe text (StandardFonts don't support ₹ or em-dash)
function ascii(s: string): string {
  return s
    .replace(/₹/g, 'Rs. ')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E\n]/g, '');
}

// ---------- Layout primitives ----------
type Ctx = {
  pdf: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  width: number;
  height: number;
  cursorY: number;
  marginX: number;
  marginY: number;
};

function newPage(ctx: Ctx) {
  ctx.page = ctx.pdf.addPage([595.28, 841.89]); // A4
  ctx.width = ctx.page.getWidth();
  ctx.height = ctx.page.getHeight();
  ctx.cursorY = ctx.height - ctx.marginY;
}

function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.cursorY - needed < ctx.marginY) newPage(ctx);
}

function drawText(ctx: Ctx, text: string, x: number, y: number, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; maxWidth?: number } = {}) {
  const size = opts.size ?? 9;
  const font = opts.bold ? ctx.bold : ctx.font;
  const color = opts.color ?? rgb(0.1, 0.1, 0.15);
  const t = ascii(text ?? '');
  if (opts.maxWidth) {
    let line = '';
    let yy = y;
    const words = t.split(/\s+/);
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (font.widthOfTextAtSize(test, size) > opts.maxWidth) {
        ctx.page.drawText(line, { x, y: yy, size, font, color });
        line = w; yy -= size + 2;
      } else line = test;
    }
    if (line) ctx.page.drawText(line, { x, y: yy, size, font, color });
    return;
  }
  ctx.page.drawText(t, { x, y, size, font, color });
}

function drawRightText(ctx: Ctx, text: string, rightX: number, y: number, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}) {
  const size = opts.size ?? 9;
  const font = opts.bold ? ctx.bold : ctx.font;
  const t = ascii(text ?? '');
  const w = font.widthOfTextAtSize(t, size);
  drawText(ctx, t, rightX - w, y, opts);
}

function drawRect(ctx: Ctx, x: number, y: number, w: number, h: number, fill?: ReturnType<typeof rgb>, border?: ReturnType<typeof rgb>) {
  ctx.page.drawRectangle({ x, y, width: w, height: h, color: fill, borderColor: border, borderWidth: border ? 0.5 : 0 });
}

function drawLine(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color = rgb(0.85, 0.85, 0.9), thickness = 0.5) {
  ctx.page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color, thickness });
}

// ---------- Main builder ----------
export async function buildPrimaryInvoiceBlob(input: PrimaryDocInput): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ctx: Ctx = {
    pdf, page: null as any, font, bold,
    width: 0, height: 0, cursorY: 0,
    marginX: 28, marginY: 32,
  };
  newPage(ctx);

  // -------- Compute tax classification --------
  const sellerStateCode = stateCode(input.company?.gstin || input.company?.state || '') || null;
  const buyerStateCode = stateCode(input.distributor?.gst_number || input.distributor?.state || '') || null;
  // POS = buyer state. If unknown, fall back to same-state.
  const isInterState = !!(sellerStateCode && buyerStateCode && sellerStateCode !== buyerStateCode);

  // -------- Per-line computed numbers --------
  const computed = input.lines
    .filter(l => (l.packed_qty || 0) > 0)
    .map(l => {
      const qty = Number(l.packed_qty) || 0;
      const rate = Number(l.unit_price) || 0;
      const gross = qty * rate;
      const disc = gross * (Number(l.discount_percent) || 0) / 100;
      const taxable = gross - disc;
      const taxRate = Number(l.tax_percent) || 0;
      const tax = taxable * taxRate / 100;
      const cgstRate = isInterState ? 0 : taxRate / 2;
      const sgstRate = isInterState ? 0 : taxRate / 2;
      const igstRate = isInterState ? taxRate : 0;
      return {
        ...l,
        qty, rate, gross, disc, taxable, taxRate, tax,
        cgstRate, sgstRate, igstRate,
        cgst: taxable * cgstRate / 100,
        sgst: taxable * sgstRate / 100,
        igst: taxable * igstRate / 100,
        amount: taxable + tax,
        hsn: (l.hsn_code && l.hsn_code.trim()) || '',
      };
    });

  // -------- HSN/rate-wise tax summary --------
  const taxBuckets = new Map<string, {
    hsn: string; taxable: number; rate: number;
    cgstRate: number; sgstRate: number; igstRate: number;
    cgst: number; sgst: number; igst: number;
  }>();
  computed.forEach(l => {
    const hsn = l.hsn || '(missing)';
    const key = `${hsn}|${l.taxRate}`;
    const cur = taxBuckets.get(key) || {
      hsn, taxable: 0, rate: l.taxRate,
      cgstRate: l.cgstRate, sgstRate: l.sgstRate, igstRate: l.igstRate,
      cgst: 0, sgst: 0, igst: 0,
    };
    cur.taxable += l.taxable;
    cur.cgst += l.cgst; cur.sgst += l.sgst; cur.igst += l.igst;
    taxBuckets.set(key, cur);
  });

  const sumGross = computed.reduce((s, l) => s + l.gross, 0);
  const sumDisc = computed.reduce((s, l) => s + l.disc, 0);
  const sumTaxable = computed.reduce((s, l) => s + l.taxable, 0);
  const sumCgst = computed.reduce((s, l) => s + l.cgst, 0);
  const sumSgst = computed.reduce((s, l) => s + l.sgst, 0);
  const sumIgst = computed.reduce((s, l) => s + l.igst, 0);
  const subtotal = sumTaxable + sumCgst + sumSgst + sumIgst;
  const grandTotal = Math.round(subtotal);
  const roundOff = grandTotal - subtotal;

  // -------- Header band --------
  const headerH = 90;
  const purple = rgb(0.36, 0.30, 0.78);
  drawRect(ctx, 0, ctx.height - headerH, ctx.width, headerH, purple);

  // company info
  const compName = input.company?.header_name || input.company?.name || 'Company';
  drawText(ctx, compName, ctx.marginX, ctx.height - 30, { size: 16, bold: true, color: rgb(1,1,1) });
  const compLines: string[] = [];
  if (input.company?.address) compLines.push(input.company.address);
  const gstinLine = input.company?.gstin
    ? `GSTIN ${input.company.gstin}` + (input.company?.state ? `  -  State: ${stateLabel(input.company.state, input.company.gstin)}` : '')
    : (input.company?.state ? `State: ${stateLabel(input.company.state)}` : '');
  if (gstinLine) compLines.push(gstinLine);
  const contactBits = [input.company?.email, input.company?.contact_phone].filter(Boolean) as string[];
  if (contactBits.length) compLines.push(contactBits.join('  -  '));
  let cy = ctx.height - 48;
  compLines.forEach(l => { drawText(ctx, l, ctx.marginX, cy, { size: 8.5, color: rgb(0.92,0.92,0.98), maxWidth: ctx.width * 0.55 }); cy -= 12; });

  // right-side title
  const title = input.isDraft ? 'PROFORMA' : 'TAX INVOICE';
  drawRightText(ctx, title, ctx.width - ctx.marginX, ctx.height - 32, { size: 18, bold: true, color: rgb(1,1,1) });
  drawRightText(ctx, input.isDraft ? 'DRAFT  -  PRIMARY ORDER' : 'ORIGINAL FOR RECIPIENT', ctx.width - ctx.marginX, ctx.height - 48, { size: 8.5, bold: true, color: rgb(0.92,0.92,0.98) });
  if (input.isDraft) {
    const tag = 'Draft - not yet finalized';
    const tw = ctx.font.widthOfTextAtSize(ascii(tag), 8);
    drawRect(ctx, ctx.width - ctx.marginX - tw - 14, ctx.height - 70, tw + 14, 16, rgb(1,1,1,));
    drawText(ctx, tag, ctx.width - ctx.marginX - tw - 7, ctx.height - 66, { size: 8, color: purple });
  }

  ctx.cursorY = ctx.height - headerH - 14;

  // -------- Info row: Invoice | Reference | Terms --------
  const colW = (ctx.width - ctx.marginX * 2 - 16) / 3;
  const infoH = 86;
  const drawInfoBox = (x: number, title: string, rows: Array<[string, string, boolean?]>) => {
    drawRect(ctx, x, ctx.cursorY - infoH, colW, infoH, undefined, rgb(0.85,0.85,0.9));
    drawText(ctx, title.toUpperCase(), x + 8, ctx.cursorY - 14, { size: 8, bold: true, color: rgb(0.45,0.45,0.55) });
    let yy = ctx.cursorY - 30;
    rows.forEach(([k, v, accent]) => {
      drawText(ctx, k, x + 8, yy, { size: 8.5, color: rgb(0.4,0.4,0.5) });
      drawRightText(ctx, v || '-', x + colW - 8, yy, { size: 8.5, bold: !!accent, color: accent ? rgb(0.78, 0.18, 0.22) : rgb(0.1,0.1,0.15) });
      yy -= 14;
    });
  };

  const invNumDisplay = input.isDraft ? '- (assigned on finalize)' : (input.invoiceNumber || '-');
  drawInfoBox(ctx.marginX, 'Invoice', [
    ['Invoice No', invNumDisplay, input.isDraft],
    ['Invoice Date', input.isDraft ? '-' : (input.invoiceDate ? new Date(input.invoiceDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '-')],
    ['Due Date', input.dueDate ? new Date(input.dueDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '-'],
  ]);
  drawInfoBox(ctx.marginX + colW + 8, 'Reference', [
    ['Primary Order', input.orderNumber || '-'],
    ['Packing List', input.packingListNumber || '-'],
    ['Order Date', input.orderDate ? new Date(input.orderDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '-'],
  ]);
  const posLabel = stateLabel(input.distributor?.state, input.distributor?.gst_number);
  drawInfoBox(ctx.marginX + (colW + 8) * 2, 'Terms', [
    ['Payment', input.paymentTerms || '-'],
    ['Place of Supply', posLabel],
    ['Sales Person', input.salesPerson || '-'],
  ]);

  ctx.cursorY -= infoH + 12;

  // -------- Billed To / Shipped To --------
  const partyH = 80;
  const partyW = (ctx.width - ctx.marginX * 2 - 12) / 2;
  const drawParty = (x: number, label: string, party: PrimaryDocParty | null | undefined) => {
    drawRect(ctx, x, ctx.cursorY - partyH, partyW, partyH, undefined, rgb(0.85,0.85,0.9));
    drawText(ctx, label.toUpperCase(), x + 8, ctx.cursorY - 14, { size: 8, bold: true, color: rgb(0.45,0.45,0.55) });
    drawText(ctx, party?.name || '-', x + 8, ctx.cursorY - 30, { size: 11, bold: true });
    if (party?.address) drawText(ctx, party.address, x + 8, ctx.cursorY - 44, { size: 8.5, color: rgb(0.35,0.35,0.4), maxWidth: partyW - 16 });
    const gst = party?.gst_number?.trim();
    const gstLine = gst ? `GSTIN  ${gst}  -  State: ${stateLabel(party?.state, gst)}` : `GSTIN  Unregistered  -  State: ${stateLabel(party?.state)}`;
    drawText(ctx, gstLine, x + 8, ctx.cursorY - 60, { size: 8, color: rgb(0.25,0.25,0.3) });
    const contact = [party?.contact_person, party?.phone].filter(Boolean).join('  -  ');
    if (contact) drawText(ctx, `Contact: ${contact}`, x + 8, ctx.cursorY - 72, { size: 8, color: rgb(0.25,0.25,0.3) });
  };
  drawParty(ctx.marginX, 'Billed To', input.distributor);
  drawParty(ctx.marginX + partyW + 12, 'Shipped To', input.distributor);
  ctx.cursorY -= partyH + 14;

  // -------- Line items table --------
  // Columns: # | Description | HSN | Qty | UoM | Rate | Disc% | Taxable | (CGST|SGST) or IGST | Amount
  const useIgst = isInterState;
  const cols = useIgst
    ? [
        { key:'i',    label:'#',           x:0,   w:18,  align:'left'  as const },
        { key:'desc', label:'DESCRIPTION', x:18,  w:150, align:'left'  as const },
        { key:'hsn',  label:'HSN',         x:168, w:50,  align:'left'  as const },
        { key:'qty',  label:'QTY',         x:218, w:36,  align:'right' as const },
        { key:'uom',  label:'UOM',         x:254, w:34,  align:'left'  as const },
        { key:'rate', label:'RATE',        x:288, w:48,  align:'right' as const },
        { key:'disc', label:'DISC%',       x:336, w:36,  align:'right' as const },
        { key:'tax',  label:'TAXABLE',     x:372, w:58,  align:'right' as const },
        { key:'igst', label:'IGST',        x:430, w:50,  align:'right' as const },
        { key:'amt',  label:'AMOUNT',      x:480, w:60,  align:'right' as const },
      ]
    : [
        { key:'i',    label:'#',           x:0,   w:18,  align:'left'  as const },
        { key:'desc', label:'DESCRIPTION', x:18,  w:140, align:'left'  as const },
        { key:'hsn',  label:'HSN',         x:158, w:46,  align:'left'  as const },
        { key:'qty',  label:'QTY',         x:204, w:32,  align:'right' as const },
        { key:'uom',  label:'UOM',         x:236, w:30,  align:'left'  as const },
        { key:'rate', label:'RATE',        x:266, w:44,  align:'right' as const },
        { key:'disc', label:'DISC%',       x:310, w:34,  align:'right' as const },
        { key:'tax',  label:'TAXABLE',     x:344, w:54,  align:'right' as const },
        { key:'cgst', label:'CGST',        x:398, w:42,  align:'right' as const },
        { key:'sgst', label:'SGST',        x:440, w:42,  align:'right' as const },
        { key:'amt',  label:'AMOUNT',      x:482, w:58,  align:'right' as const },
      ];

  const tableX = ctx.marginX;
  const tableW = ctx.width - ctx.marginX * 2;

  // header
  const drawTableHeader = () => {
    const hY = ctx.cursorY;
    drawRect(ctx, tableX, hY - 18, tableW, 18, rgb(0.94, 0.93, 0.99));
    cols.forEach(c => {
      const x = tableX + c.x;
      if (c.align === 'right') drawRightText(ctx, c.label, x + c.w - 4, hY - 12, { size: 8, bold: true, color: rgb(0.36, 0.30, 0.78) });
      else drawText(ctx, c.label, x + 4, hY - 12, { size: 8, bold: true, color: rgb(0.36, 0.30, 0.78) });
    });
    ctx.cursorY = hY - 18;
  };
  drawTableHeader();

  const rowH = 18;
  computed.forEach((l, i) => {
    ensureSpace(ctx, rowH + 4);
    if (ctx.cursorY === ctx.height - ctx.marginY) drawTableHeader();
    const yMid = ctx.cursorY - 12;
    const cellVal = (k: string): string => {
      switch (k) {
        case 'i':    return String(i + 1);
        case 'desc': return l.product_name || '';
        case 'hsn':  return l.hsn || '(missing)';
        case 'qty':  return String(l.qty);
        case 'uom':  return l.unit || 'PCS';
        case 'rate': return fmtMoney(l.rate);
        case 'disc': return `${l.discount_percent || 0}%`;
        case 'tax':  return fmtMoney(l.taxable);
        case 'cgst': return fmtMoney(l.cgst);
        case 'sgst': return fmtMoney(l.sgst);
        case 'igst': return fmtMoney(l.igst);
        case 'amt':  return fmtMoney(l.amount);
        default: return '';
      }
    };
    cols.forEach(c => {
      const x = tableX + c.x;
      const v = cellVal(c.key);
      if (c.align === 'right') drawRightText(ctx, v, x + c.w - 4, yMid, { size: 8.5, bold: c.key === 'amt' });
      else drawText(ctx, v, x + 4, yMid, { size: 8.5, bold: c.key === 'desc' });
    });
    drawLine(ctx, tableX, ctx.cursorY - rowH, tableX + tableW, ctx.cursorY - rowH, rgb(0.92,0.92,0.95));
    ctx.cursorY -= rowH;
  });

  ctx.cursorY -= 14;

  // -------- HSN-wise tax summary --------
  ensureSpace(ctx, 100);
  const sumW = (ctx.width - ctx.marginX * 2 - 12) * 0.58;
  const totW = (ctx.width - ctx.marginX * 2 - 12) * 0.42;
  const sumX = ctx.marginX;
  const totX = ctx.marginX + sumW + 12;
  const startY = ctx.cursorY;

  // HSN summary box
  const hsnRows = Array.from(taxBuckets.values());
  const headerLabels = useIgst
    ? ['HSN','TAXABLE','IGST RATE','IGST AMT','TOTAL TAX']
    : ['HSN','TAXABLE','CGST RATE','CGST AMT','SGST RATE','SGST AMT','TOTAL TAX'];
  const headerCount = headerLabels.length;
  const hsnBoxH = 30 + (hsnRows.length + 1) * 16;
  drawRect(ctx, sumX, startY - hsnBoxH, sumW, hsnBoxH, undefined, rgb(0.85,0.85,0.9));
  drawRect(ctx, sumX, startY - 20, sumW, 20, rgb(0.94, 0.93, 0.99));
  drawText(ctx, 'TAX SUMMARY BY HSN', sumX + 8, startY - 14, { size: 8.5, bold: true, color: rgb(0.36, 0.30, 0.78) });

  const colXs: number[] = [];
  const innerW = sumW - 8;
  const baseColW = innerW / headerCount;
  for (let i = 0; i < headerCount; i++) colXs.push(sumX + 4 + i * baseColW);

  let yy = startY - 36;
  headerLabels.forEach((lab, i) => {
    if (i === 0) drawText(ctx, lab, colXs[i], yy, { size: 7.5, bold: true, color: rgb(0.4,0.4,0.5) });
    else drawRightText(ctx, lab, colXs[i] + baseColW - 4, yy, { size: 7.5, bold: true, color: rgb(0.4,0.4,0.5) });
  });
  yy -= 14;
  let totT=0, totC=0, totS=0, totI=0;
  hsnRows.forEach(r => {
    totT += r.taxable; totC += r.cgst; totS += r.sgst; totI += r.igst;
    drawText(ctx, r.hsn, colXs[0], yy, { size: 8 });
    drawRightText(ctx, fmtMoney(r.taxable), colXs[1] + baseColW - 4, yy, { size: 8 });
    if (useIgst) {
      drawRightText(ctx, `${r.igstRate}%`, colXs[2] + baseColW - 4, yy, { size: 8 });
      drawRightText(ctx, fmtMoney(r.igst), colXs[3] + baseColW - 4, yy, { size: 8 });
      drawRightText(ctx, fmtMoney(r.igst), colXs[4] + baseColW - 4, yy, { size: 8 });
    } else {
      drawRightText(ctx, `${r.cgstRate}%`, colXs[2] + baseColW - 4, yy, { size: 8 });
      drawRightText(ctx, fmtMoney(r.cgst), colXs[3] + baseColW - 4, yy, { size: 8 });
      drawRightText(ctx, `${r.sgstRate}%`, colXs[4] + baseColW - 4, yy, { size: 8 });
      drawRightText(ctx, fmtMoney(r.sgst), colXs[5] + baseColW - 4, yy, { size: 8 });
      drawRightText(ctx, fmtMoney(r.cgst + r.sgst), colXs[6] + baseColW - 4, yy, { size: 8 });
    }
    yy -= 14;
  });
  // totals row
  drawLine(ctx, sumX + 4, yy + 10, sumX + sumW - 4, yy + 10, rgb(0.7,0.7,0.78));
  drawText(ctx, 'Total', colXs[0], yy, { size: 8, bold: true });
  drawRightText(ctx, fmtMoney(totT), colXs[1] + baseColW - 4, yy, { size: 8, bold: true });
  if (useIgst) {
    drawRightText(ctx, '', colXs[2] + baseColW - 4, yy, { size: 8 });
    drawRightText(ctx, fmtMoney(totI), colXs[3] + baseColW - 4, yy, { size: 8, bold: true });
    drawRightText(ctx, fmtMoney(totI), colXs[4] + baseColW - 4, yy, { size: 8, bold: true });
  } else {
    drawRightText(ctx, fmtMoney(totC), colXs[3] + baseColW - 4, yy, { size: 8, bold: true });
    drawRightText(ctx, fmtMoney(totS), colXs[5] + baseColW - 4, yy, { size: 8, bold: true });
    drawRightText(ctx, fmtMoney(totC + totS), colXs[6] + baseColW - 4, yy, { size: 8, bold: true });
  }

  // Totals box (right)
  const totRows: Array<[string, string, boolean?]> = [
    ['Gross Value', fmtMoney(sumGross)],
    ['Trade Discount', `- ${fmtMoney(sumDisc)}`],
    ['Taxable Value', fmtMoney(sumTaxable)],
  ];
  if (useIgst) {
    hsnRows.forEach(r => totRows.push([`IGST (${r.rate}%)`, fmtMoney(r.igst)]));
  } else {
    // Per-rate CGST/SGST lines so labels and amounts always agree.
    hsnRows.forEach(r => {
      totRows.push([`CGST (${r.cgstRate}%)`, fmtMoney(r.cgst)]);
      totRows.push([`SGST (${r.sgstRate}%)`, fmtMoney(r.sgst)]);
    });
  }
  totRows.push(['Round Off', (roundOff >= 0 ? '+ ' : '- ') + fmtMoney(Math.abs(roundOff))]);
  totRows.push(['Grand Total', fmtMoney(grandTotal), true]);

  const totBoxH = 16 + totRows.length * 16 + 8;
  drawRect(ctx, totX, startY - totBoxH, totW, totBoxH, undefined, rgb(0.85,0.85,0.9));
  let ty = startY - 18;
  totRows.forEach(([k, v, big]) => {
    if (big) drawLine(ctx, totX + 8, ty + 10, totX + totW - 8, ty + 10, rgb(0.7,0.7,0.78));
    drawText(ctx, k, totX + 8, ty, { size: big ? 10 : 8.5, bold: !!big });
    drawRightText(ctx, v, totX + totW - 8, ty, { size: big ? 12 : 8.5, bold: !!big, color: big ? rgb(0.36, 0.30, 0.78) : rgb(0.1,0.1,0.15) });
    ty -= 16;
  });

  ctx.cursorY = startY - Math.max(hsnBoxH, totBoxH) - 14;

  // -------- Amount in words --------
  ensureSpace(ctx, 38);
  drawRect(ctx, ctx.marginX, ctx.cursorY - 32, ctx.width - ctx.marginX * 2, 32, undefined, rgb(0.85,0.85,0.9));
  drawText(ctx, 'AMOUNT IN WORDS', ctx.marginX + 8, ctx.cursorY - 12, { size: 7.5, bold: true, color: rgb(0.45,0.45,0.55) });
  drawText(ctx, numberToWords(grandTotal), ctx.marginX + 8, ctx.cursorY - 24, { size: 9.5, bold: true });
  ctx.cursorY -= 44;

  // -------- Terms & signatory --------
  ensureSpace(ctx, 70);
  drawLine(ctx, ctx.marginX, ctx.cursorY, ctx.width - ctx.marginX, ctx.cursorY, rgb(0.85,0.85,0.9));
  ctx.cursorY -= 14;
  drawText(ctx, 'TERMS & NOTES', ctx.marginX, ctx.cursorY, { size: 7.5, bold: true, color: rgb(0.45,0.45,0.55) });
  drawText(ctx, input.company?.['terms_conditions' as keyof PrimaryDocCompany] as string || 'Payment due as per agreed terms. Goods once dispatched are subject to the distributor agreement. E. & O.E.', ctx.marginX, ctx.cursorY - 14, { size: 8, color: rgb(0.3,0.3,0.35), maxWidth: (ctx.width - ctx.marginX * 2) * 0.6 });

  drawRightText(ctx, `For ${input.company?.name || 'Company'}`, ctx.width - ctx.marginX, ctx.cursorY, { size: 9, bold: true });
  drawLine(ctx, ctx.width - ctx.marginX - 160, ctx.cursorY - 36, ctx.width - ctx.marginX, ctx.cursorY - 36, rgb(0.4,0.4,0.45), 0.8);
  drawRightText(ctx, 'Authorised Signatory', ctx.width - ctx.marginX, ctx.cursorY - 48, { size: 8, color: rgb(0.4,0.4,0.5) });

  // -------- Draft watermark --------
  if (input.isDraft) {
    for (const p of pdf.getPages()) {
      const { width, height } = p.getSize();
      const t = 'DRAFT - NOT A TAX INVOICE';
      const size = 50;
      const tw = bold.widthOfTextAtSize(t, size);
      p.drawText(t, {
        x: (width - tw * 0.7) / 2,
        y: height / 2,
        size, font: bold,
        color: rgb(0.85, 0.45, 0.55),
        opacity: 0.18,
        rotate: degrees(-30),
      });
    }
  }

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
