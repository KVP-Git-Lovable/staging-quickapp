// jsPDF + jspdf-autotable renderer for report subscriptions.
// Consumes a neutral ReportModel. Reads branding from the DB via ./branding.ts.
// Supports header style variants, orientation, wide-column splitting.

import { jsPDF } from 'npm:jspdf@2.5.1';
import autoTableImport from 'npm:jspdf-autotable@3.8.2';
const autoTable: any = (autoTableImport as any).default ?? autoTableImport;
import { Branding, formatCurrency, formatDateToken } from './branding.ts';
import { loadUnicodeFont, registerFontOnDoc } from './font-loader.ts';

export interface ReportColumn {
  key: string;
  label: string;
  numeric: boolean;
  currency?: boolean;
  /** False when the dataset declares a non-additive aggregate (e.g. avg) —
   *  summing an average across groups produces a meaningless figure. */
  summable?: boolean;
}

export interface ReportModel {
  title: string;
  subtitle?: string;
  period: { label: string; date_from?: string; date_to?: string };
  columns: ReportColumn[];
  rows: Array<Record<string, unknown>>;
  totals?: Record<string, number> | null; // key -> summed value
  meta: {
    generated_at: Date;
    recipient_name?: string | null;
    scope_label?: string | null;
    filters_label?: string | null;
    ai_summary?: string | null;
  };
}

export interface PdfTemplate {
  header_style?: 'standard' | 'centered' | 'band' | 'compact';
  title_override?: string;
  subtitle?: string;
  show_period?: boolean;
  show_contact_line?: boolean;
  branding?: 'company' | 'distributor' | 'none';
  orientation?: 'auto' | 'portrait' | 'landscape';
  include_meta?: boolean;
  include_totals?: boolean;
  include_page_numbers?: boolean;
  footer_note?: string;
  theme?: 'default' | 'amber' | 'blue_black' | 'light_pink';
}

// Mirror of src/lib/pdfThemes.ts (edge functions cannot import from src/).
const PDF_THEMES: Record<string, { accent: string | null; band: string; headFill: string; headText: string }> = {
  default: { accent: null, band: '#111111', headFill: '#f6f6f4', headText: '#464646' },
  amber: { accent: '#f59e0b', band: '#78350f', headFill: '#fef3c7', headText: '#78350f' },
  blue_black: { accent: '#2563eb', band: '#0f172a', headFill: '#dbeafe', headText: '#1e3a8a' },
  light_pink: { accent: '#ec4899', band: '#831843', headFill: '#fce7f3', headText: '#831843' },
};

const DEFAULTS: Required<Omit<PdfTemplate, 'title_override' | 'subtitle' | 'footer_note'>> & {
  title_override: string;
  subtitle: string;
  footer_note: string;
} = {
  header_style: 'standard',
  title_override: '',
  subtitle: '',
  show_period: true,
  show_contact_line: false,
  branding: 'company',
  orientation: 'auto',
  include_meta: true,
  include_totals: true,
  include_page_numbers: true,
  footer_note: '',
  theme: 'default',
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Fit an image inside a box while preserving its aspect ratio (never stretch).
// Returns the centred draw rectangle inside the box.
function fitImage(
  doc: any,
  dataUrl: string,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
): { x: number; y: number; w: number; h: number } {
  let ratio = 1;
  try {
    const p = doc.getImageProperties(dataUrl);
    if (p?.width && p?.height) ratio = p.width / p.height;
  } catch (_) { /* fall back to square */ }
  let w = boxW;
  let h = w / ratio;
  if (h > boxH) { h = boxH; w = h * ratio; }
  return { x: boxX + (boxW - w) / 2, y: boxY + (boxH - h) / 2, w, h };
}


function fmtCell(value: unknown, col: ReportColumn, brand: Branding, unicodeSafe: boolean): string {
  if (value === null || value === undefined || value === '') return '';
  if (col.numeric) {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n)) {
      if (col.currency) return formatCurrency(n, brand.currency, unicodeSafe);
      return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
    }
  }
  return String(value);
}

function parseIsoDate(s: string | undefined): Date | null {
  if (!s) return null;
  // 'YYYY-MM-DD'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatPeriod(model: ReportModel, brand: Branding): string {
  const from = parseIsoDate(model.period.date_from);
  const to = parseIsoDate(model.period.date_to);
  if (from && to) {
    const a = formatDateToken(from, brand.date_format);
    const b = formatDateToken(to, brand.date_format);
    return a === b ? a : `${a} \u2013 ${b}`;
  }
  return model.period.label || '';
}

export async function renderReportPdf(
  model: ReportModel,
  template: PdfTemplate,
  brand: Branding,
): Promise<Uint8Array> {
  const t = { ...DEFAULTS, ...(template || {}) };

  // Auto-orient rule: portrait when <=6 columns, landscape otherwise.
  const orientation: 'p' | 'l' =
    t.orientation === 'portrait' ? 'p'
    : t.orientation === 'landscape' ? 'l'
    : (model.columns.length > 6 ? 'l' : 'p');

  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });

  // Register a Unicode TTF so ₹ and other non-WinAnsi glyphs render.
  const unicodeFont = await loadUnicodeFont();
  const fontFamily = unicodeFont ? unicodeFont.name : 'helvetica';
  if (unicodeFont) registerFontOnDoc(doc, unicodeFont);
  const unicodeSafe = !!unicodeFont;

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 32;
  const themeDef = PDF_THEMES[(t as any).theme as string] ?? PDF_THEMES.default;
  const brandRgb = hexToRgb(themeDef.accent ?? brand.brand_color);
  const bandRgb = hexToRgb(themeDef.band);
  const headFillRgb = hexToRgb(themeDef.headFill);
  const headTextRgb = hexToRgb(themeDef.headText);

  const displayTitle = (t.title_override || model.title || 'Report').trim();
  const displaySubtitle = (t.subtitle || model.subtitle || '').trim();
  const generatedAt = formatDateToken(model.meta.generated_at, `${brand.date_format} HH:mm`);
  const periodLabel = formatPeriod(model, brand);
  const contactBits = [brand.company_name, brand.address, brand.gstin ? `GSTIN ${brand.gstin}` : '', brand.contact_phone]
    .filter(Boolean).join(' \u00B7 ');

  // --- Header band ---
  let cursorY = margin;

  const drawStandardOrCentered = (centered: boolean) => {
    const logoBoxW = 46, logoBoxH = 46;
    if (centered) {
      const blockW = pageW - margin * 2;
      let y = cursorY;
      if (brand.logo_data_url && brand.logo_format) {
        const f = fitImage(doc, brand.logo_data_url, margin + (blockW - logoBoxW) / 2, y, logoBoxW, logoBoxH);
        doc.addImage(brand.logo_data_url, brand.logo_format, f.x, f.y, f.w, f.h);
        y += logoBoxH + 6;
      }
      if (brand.header_name) {
        doc.setFont(fontFamily, 'bold'); doc.setFontSize(12); doc.setTextColor(30);
        doc.text(brand.header_name, pageW / 2, y + 10, { align: 'center' }); y += 14;
      }
      if (brand.company_name) {
        doc.setFont(fontFamily, 'normal'); doc.setFontSize(9); doc.setTextColor(110);
        doc.text(brand.company_name, pageW / 2, y + 8, { align: 'center' }); y += 12;
      }
      doc.setFont(fontFamily, 'bold'); doc.setFontSize(14); doc.setTextColor(20);
      doc.text(displayTitle, pageW / 2, y + 12, { align: 'center' }); y += 18;
      if (displaySubtitle) {
        doc.setFont(fontFamily, 'italic'); doc.setFontSize(9); doc.setTextColor(120);
        doc.text(displaySubtitle, pageW / 2, y + 8, { align: 'center' }); y += 12;
      }
      if (t.show_period && periodLabel) {
        doc.setFont(fontFamily, 'normal'); doc.setFontSize(9); doc.setTextColor(90);
        doc.text(`Period: ${periodLabel}`, pageW / 2, y + 8, { align: 'center' }); y += 12;
      }
      if (t.show_contact_line && contactBits) {
        doc.setFont(fontFamily, 'normal'); doc.setFontSize(8); doc.setTextColor(130);
        doc.text(contactBits, pageW / 2, y + 8, { align: 'center' }); y += 10;
      }
      cursorY = y + 6;
    } else {
      let leftX = margin;
      if (brand.logo_data_url && brand.logo_format) {
        const f = fitImage(doc, brand.logo_data_url, margin, cursorY, logoBoxW, logoBoxH);
        doc.addImage(brand.logo_data_url, brand.logo_format, f.x, f.y, f.w, f.h);
        leftX = margin + logoBoxW + 10;
      }
      let ty = cursorY + 2;
      if (brand.header_name) {
        doc.setFont(fontFamily, 'bold'); doc.setFontSize(12); doc.setTextColor(30);
        doc.text(brand.header_name, leftX, ty + 10); ty += 14;
      }
      if (brand.company_name) {
        doc.setFont(fontFamily, 'normal'); doc.setFontSize(9); doc.setTextColor(110);
        doc.text(brand.company_name, leftX, ty + 8); ty += 12;
      }
      doc.setFont(fontFamily, 'bold'); doc.setFontSize(14); doc.setTextColor(20);
      doc.text(displayTitle, leftX, ty + 12); ty += 18;
      if (displaySubtitle) {
        doc.setFont(fontFamily, 'italic'); doc.setFontSize(9); doc.setTextColor(120);
        doc.text(displaySubtitle, leftX, ty + 8); ty += 12;
      }
      if (t.show_contact_line && contactBits) {
        doc.setFont(fontFamily, 'normal'); doc.setFontSize(8); doc.setTextColor(130);
        doc.text(contactBits, leftX, ty + 8); ty += 10;
      }
      if (t.show_period && periodLabel) {
        doc.setFont(fontFamily, 'normal'); doc.setFontSize(9); doc.setTextColor(90);
        doc.text('Period', pageW - margin, cursorY + 12, { align: 'right' });
        doc.setFont(fontFamily, 'bold'); doc.setTextColor(30);
        doc.text(periodLabel, pageW - margin, cursorY + 26, { align: 'right' });
      }
      cursorY = Math.max(ty, cursorY + logoBoxH) + 6;
    }
    doc.setFillColor(brandRgb[0], brandRgb[1], brandRgb[2]);
    doc.rect(margin, cursorY, pageW - margin * 2, 2.5, 'F');
    cursorY += 10;
  };

  const drawBand = () => {
    // Dark, professional masthead: white logo plate on the left, company +
    // report title beside it, period/date range right-aligned.
    const bandH = 64;
    const bandW = pageW - margin * 2;
    doc.setFillColor(bandRgb[0], bandRgb[1], bandRgb[2]);
    doc.roundedRect(margin, cursorY, bandW, bandH, 4, 4, 'F');

    let x = margin + 14;
    if (brand.logo_data_url && brand.logo_format) {
      const plateW = 74, plateH = 40;
      const plateY = cursorY + (bandH - plateH) / 2;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, plateY, plateW, plateH, 3, 3, 'F');
      const f = fitImage(doc, brand.logo_data_url, x + 6, plateY + 5, plateW - 12, plateH - 10);
      doc.addImage(brand.logo_data_url, brand.logo_format, f.x, f.y, f.w, f.h);
      x += plateW + 14;
    }

    const nameLine = (brand.header_name || brand.company_name || '').toUpperCase();
    doc.setTextColor(255);
    let ty = cursorY + (nameLine ? 24 : 38);
    if (nameLine) {
      doc.setFont(fontFamily, 'bold'); doc.setFontSize(9.5);
      doc.text(nameLine, x, ty);
      ty += 17;
    }
    doc.setFont(fontFamily, 'bold'); doc.setFontSize(14);
    doc.text(displayTitle, x, ty);

    if (t.show_period && periodLabel) {
      doc.setFont(fontFamily, 'normal'); doc.setFontSize(9);
      doc.setTextColor(215);
      doc.text(periodLabel, pageW - margin - 14, cursorY + bandH / 2 + 3, { align: 'right' });
    }
    cursorY += bandH + 14;
  };



  const drawCompact = () => {
    const logoBoxW = 26, logoBoxH = 26;
    let leftX = margin;
    if (brand.logo_data_url && brand.logo_format) {
      const f = fitImage(doc, brand.logo_data_url, margin, cursorY, logoBoxW, logoBoxH);
      doc.addImage(brand.logo_data_url, brand.logo_format, f.x, f.y, f.w, f.h);
      leftX = margin + logoBoxW + 8;
    }
    doc.setFont(fontFamily, 'bold'); doc.setFontSize(13); doc.setTextColor(20);
    doc.text(displayTitle, leftX, cursorY + 18);
    if (t.show_period && periodLabel) {
      doc.setFont(fontFamily, 'normal'); doc.setFontSize(9); doc.setTextColor(90);
      doc.text(periodLabel, pageW - margin, cursorY + 18, { align: 'right' });
    }
    cursorY += Math.max(logoBoxH, 20) + 4;
    doc.setFillColor(brandRgb[0], brandRgb[1], brandRgb[2]);
    doc.rect(margin, cursorY, pageW - margin * 2, 1.5, 'F');
    cursorY += 8;
  };

  const drawHeader = () => {
    if (t.header_style === 'centered') drawStandardOrCentered(true);
    else if (t.header_style === 'band') drawBand();
    else if (t.header_style === 'compact') drawCompact();
    else drawStandardOrCentered(false);
  };

  drawHeader();

  // --- Meta block: label above value, evenly spaced columns ---
  if (t.include_meta) {
    const items: Array<[string, string]> = [['Generated', generatedAt]];
    if (periodLabel) items.push(['Period', periodLabel]);
    if (model.meta.scope_label) items.push(['Dataset / Scope', model.meta.scope_label]);
    if (model.meta.recipient_name) items.push(['Prepared for', model.meta.recipient_name]);
    items.push(['Filters', model.meta.filters_label || 'None']);

    const blockW = pageW - margin * 2;
    const colW = blockW / items.length;
    const blockH = 34;
    doc.setDrawColor(228);
    doc.setFillColor(250, 250, 249);
    doc.roundedRect(margin, cursorY, blockW, blockH, 3, 3, 'FD');

    items.forEach(([label, value], i) => {
      const x = margin + 12 + i * colW;
      doc.setFont(fontFamily, 'normal'); doc.setFontSize(7); doc.setTextColor(150);
      doc.text(label.toUpperCase(), x, cursorY + 13);
      doc.setFont(fontFamily, 'bold'); doc.setFontSize(8.5); doc.setTextColor(60);
      doc.text(doc.splitTextToSize(String(value), colW - 18)[0] ?? '', x, cursorY + 25);
      if (i > 0) {
        doc.setDrawColor(232);
        doc.line(margin + i * colW, cursorY + 7, margin + i * colW, cursorY + blockH - 7);
      }
    });
    cursorY += blockH + 14;
  }


  // --- AI summary card: sits above the data, never in place of it ---
  if (model.meta.ai_summary) {
    const blockW = pageW - margin * 2;
    const textW = blockW - 28;
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(9);
    const lines: string[] = doc.splitTextToSize(String(model.meta.ai_summary), textW);
    const blockH = 26 + lines.length * 12;

    doc.setDrawColor(228);
    doc.setFillColor(250, 250, 249);
    doc.roundedRect(margin, cursorY, blockW, blockH, 3, 3, 'FD');
    // Accent rail, so it reads as commentary rather than as reported figures.
    doc.setFillColor(brandRgb[0], brandRgb[1], brandRgb[2]);
    doc.rect(margin, cursorY + 3, 2.5, blockH - 6, 'F');

    doc.setFont(fontFamily, 'bold'); doc.setFontSize(7); doc.setTextColor(150);
    doc.text('SUMMARY', margin + 14, cursorY + 14);
    doc.setFont(fontFamily, 'normal'); doc.setFontSize(9); doc.setTextColor(60);
    lines.forEach((ln, i) => doc.text(ln, margin + 14, cursorY + 28 + i * 12));

    cursorY += blockH + 14;
  }

  // --- Wide-column handling: split into chunks that fit ---
  const isEmpty = model.rows.length === 0;
  const cols = model.columns;
  const rowLabelCount = 1; // first column repeats

  // Usable text width per column, once 16pt of horizontal cell padding is taken
  // out, has to stay wide enough for real values ("Vijayanagar & Kuvempunagar",
  // "A01 Aruna Chicken Sukka Masala 200G"). The old 12/7 packed 13 columns onto
  // one landscape page at ~48pt of text each — under ten characters — so every
  // column wrapped and rows grew to a dozen lines tall.
  const capacity = orientation === 'l' ? 8 : 5;

  let chunks: number[][] = [];
  if (cols.length <= capacity || isEmpty) {
    chunks = [cols.map((_, i) => i)];
  } else {
    const rowLabelIdx = 0;
    const rest = cols.map((_, i) => i).filter(i => i !== rowLabelIdx);
    const perChunk = Math.max(1, capacity - rowLabelCount);
    for (let i = 0; i < rest.length; i += perChunk) {
      chunks.push([rowLabelIdx, ...rest.slice(i, i + perChunk)]);
    }
  }

  const shrinkFontFloor = 6;
  let bodyFontSize = 9;
  if (chunks[0]?.length > 8) bodyFontSize = 8;
  if (chunks[0]?.length > 10) bodyFontSize = 7;
  if (chunks[0]?.length > 12) bodyFontSize = shrinkFontFloor;

  const totalsRow = t.include_totals && model.totals
    ? cols.map((c) => {
        if (!c.numeric) return '';
        const v = (model.totals as any)[c.key];
        return v === undefined || v === null ? '' : fmtCell(v, c, brand, unicodeSafe);
      })
    : null;

  chunks.forEach((chunkIdxs, chunkI) => {
    if (chunkI > 0) {
      doc.addPage();
      cursorY = margin;
      doc.setFont(fontFamily, 'italic'); doc.setFontSize(9); doc.setTextColor(120);
      const first = chunkIdxs[1] ?? chunkIdxs[0];
      const last = chunkIdxs[chunkIdxs.length - 1];
      doc.text(`${displayTitle} \u2014 columns ${first + 1}\u2013${last + 1}, continued`, margin, cursorY + 10);
      cursorY += 18;
    }

    const head = [chunkIdxs.map(i => cols[i].label)];
    const body = isEmpty
      ? [[{ content: 'No records for this period.', colSpan: chunkIdxs.length, styles: { halign: 'center', textColor: 120 } }]]
      : model.rows.map(r => chunkIdxs.map(i => fmtCell(r[cols[i].key], cols[i], brand, unicodeSafe)));
    const foot = totalsRow
      ? [chunkIdxs.map((i, idx) => (idx === 0 && !cols[i].numeric ? 'Total' : totalsRow[i]))]
      : undefined;

    // Column sizing: numeric columns fit to content (so long values like
    // totals are never truncated), the dimension column takes the remaining
    // width. Alignment: numerics right, dimension left — applied to head,
    // body and foot via columnStyles.
    // Every column carries a minCellWidth. Previously the first column was the
    // only flexible one ('auto') while the rest were 'wrap'; once the wrap
    // columns overflowed the table, autoTable squeezed that single flexible
    // column down to one character, printing values vertically (P/I/E/C/E).
    const usableW = pageW - margin * 2;
    const minText = bodyFontSize <= 7 ? 34 : 40; // + 16pt padding
    const minCellWidth = Math.max(
      28,
      Math.min(minText, Math.floor(usableW / Math.max(1, chunkIdxs.length)) - 4)
    );
    const columnStyles: Record<number, any> = {};
    chunkIdxs.forEach((ci, idx) => {
      const c = cols[ci];
      if (c.numeric) {
        columnStyles[idx] = { halign: 'right', cellWidth: 'auto', minCellWidth };
      } else if (idx === 0) {
        columnStyles[idx] = { halign: 'left', cellWidth: 'auto', minCellWidth, fontStyle: 'bold' };
      } else {
        columnStyles[idx] = { halign: 'left', cellWidth: 'auto', minCellWidth };
      }
    });

    autoTable(doc, {
      head, body, foot: foot as any,
      startY: cursorY,
      margin: { left: margin, right: margin, bottom: margin + 24 },
      tableWidth: pageW - margin * 2,
      theme: 'plain',
      styles: {
        font: fontFamily,
        fontSize: bodyFontSize,
        cellPadding: { top: 6, right: 8, bottom: 6, left: 8 },
        overflow: 'linebreak',
        valign: 'middle',
        textColor: [45, 45, 45],
        lineColor: [235, 235, 233],
        lineWidth: { top: 0, right: 0, bottom: 0.5, left: 0 } as any,
        minCellHeight: 18,
      },
      headStyles: {
        fillColor: headFillRgb,
        textColor: headTextRgb,
        fontStyle: 'bold',
        fontSize: Math.max(6.5, bodyFontSize - 0.5),
        font: fontFamily,
        lineColor: [205, 205, 200],
        lineWidth: { top: 0, right: 0, bottom: 0.8, left: 0 } as any,
        cellPadding: { top: 7, right: 8, bottom: 7, left: 8 },
      },
      footStyles: {
        fillColor: [252, 252, 251],
        textColor: [17, 17, 17],
        fontStyle: 'bold',
        font: fontFamily,
        lineColor: [120, 120, 118],
        lineWidth: { top: 1.2, right: 0, bottom: 0, left: 0 } as any,
        cellPadding: { top: 7, right: 8, bottom: 7, left: 8 },
      },
      columnStyles,
      // columnStyles only apply to BODY cells in jspdf-autotable v3, which is
      // why headers/totals used to drift left while numbers were right-aligned.
      // Force head + foot to inherit the column's alignment.
      didParseCell: (data: any) => {
        if (data.section === 'head' || data.section === 'foot') {
          const st = columnStyles[data.column.index];
          if (st?.halign) data.cell.styles.halign = st.halign;
        }
      },
    });

  });

  // --- Footer on every page ---
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont(fontFamily, 'normal'); doc.setFontSize(8); doc.setTextColor(120);
    doc.setDrawColor(220);
    doc.line(margin, pageH - margin + 4, pageW - margin, pageH - margin + 4);
    const leftFooter = t.footer_note || (brand.header_name ? `Generated by ${brand.header_name}` : '');
    if (leftFooter) doc.text(leftFooter, margin, pageH - margin + 16);
    if (t.include_page_numbers) {
      doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - margin + 16, { align: 'right' });
    }
  }

  const ab = doc.output('arraybuffer');
  return new Uint8Array(ab);
}

// Human-readable label from a snake_case / dotted key.
function humanize(key: string): string {
  return key
    .replace(/[._]/g, ' ')
    .replace(/\bid\b/gi, '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Map common grouping dimension keys to a friendly display label.
const DIMENSION_LABELS: Record<string, string> = {
  user: 'Team member',
  user_id: 'Team member',
  rep: 'Team member',
  rep_id: 'Team member',
  employee: 'Team member',
  manager: 'Manager',
  manager_id: 'Manager',
  beat: 'Beat',
  beat_id: 'Beat',
  retailer: 'Retailer',
  retailer_id: 'Retailer',
  distributor: 'Distributor',
  distributor_id: 'Distributor',
  product: 'Product',
  product_id: 'Product',
  category: 'Category',
  category_id: 'Category',
  date: 'Date',
  day: 'Date',
  week: 'Week',
  month: 'Month',
  territory: 'Territory',
  territory_id: 'Territory',
  region: 'Region',
  state: 'State',
  city: 'City',
  pincode: 'Pincode',
};

export function dimensionLabel(dimensionKey: string | null | undefined): string {
  if (!dimensionKey) return 'Group';
  const k = dimensionKey.toLowerCase();
  return DIMENSION_LABELS[k] ?? humanize(dimensionKey);
}

// Build a neutral model from raw RPC rows.
export function buildReportModel(params: {
  reportName: string;
  period: { key: string; label: string; date_from: string; date_to: string };
  rows: any[];
  recipientName?: string | null;
  scopeLabel?: string | null;
  filtersLabel?: string | null;
  aiSummary?: string | null;
  // Grouping dimension key from the report definition (e.g. 'user_id', 'beat', 'date').
  // Used to name the first (row-label) column instead of showing raw keys
  // like 'grp' or 'row_label'.
  rowDimensionKey?: string | null;
  /** measure key -> aggregate declared on reportable_datasets (sum|avg|count). */
  measureAggs?: Record<string, string> | null;
  /** measure key -> display format declared on reportable_datasets (currency|number). */
  measureFormats?: Record<string, string> | null;
}): ReportModel {
  const { reportName, period, rows } = params;
  const firstRow = rows[0] ?? {};
  const keys = Object.keys(firstRow);

  const rowLabelKeys = new Set(['grp', 'group', 'row', 'row_label', 'label', 'dimension']);
  const dimensionDisplay = dimensionLabel(params.rowDimensionKey);

  const columns: ReportColumn[] = keys.map((k, idx) => {
    let numeric = keys.length > 0 && rows.length > 0;
    for (const r of rows) {
      const v = r[k];
      if (v === null || v === undefined || v === '') continue;
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) { numeric = false; break; }
    }
    // Whether a column is money is declared on the dataset's measure, not
    // inferred from its name. The name match below is only a fallback for
    // columns the dataset says nothing about, and it deliberately does not
    // look for 'total' — that made "total_hours" print as "₹ 8.81".
    let currency = false;
    if (numeric) {
      const declared = params.measureFormats?.[k];
      if (declared) {
        currency = declared === 'currency';
      } else {
        const kl = k.toLowerCase();
        if (kl.includes('amount') || kl.includes('revenue') || kl.includes('price') ||
            kl.includes('rate') || kl.includes('sales')) currency = true;
      }
    }
    // Only a genuine row-label key gets the dimension caption. Using idx === 0
    // relabelled whatever the RPC happened to return first — e.g. a `uom`
    // column headed "Order Date" while a real order_date column sat further
    // right under the same heading.
    const isRowLabelCol = rowLabelKeys.has(k.toLowerCase());
    const label = isRowLabelCol && !numeric ? dimensionDisplay : humanize(k);
    // 'avg' (and any other non-additive aggregate) must not be totalled.
    const agg = params.measureAggs?.[k];
    const summable = !agg || agg === 'sum' || agg === 'count';
    return { key: k, label, numeric, currency, summable };
  });

  let totals: Record<string, number> | null = null;
  // Only additive measures get a total. A column the dataset declares as an
  // average (e.g. rate = AVG(oi.rate)) has no meaningful sum across groups.
  const numericCols = columns.filter(c => c.numeric && c.summable !== false);
  if (numericCols.length > 0 && rows.length > 0) {
    totals = {};
    for (const c of numericCols) {
      let sum = 0;
      for (const r of rows) {
        const v = r[c.key];
        const n = typeof v === 'number' ? v : Number(v);
        if (Number.isFinite(n)) sum += n;
      }
      totals[c.key] = sum;
    }
  }

  return {
    title: reportName,
    period: { label: period.label, date_from: period.date_from, date_to: period.date_to },
    columns,
    rows,
    totals,
    meta: {
      generated_at: new Date(),
      recipient_name: params.recipientName ?? null,
      scope_label: params.scopeLabel ?? null,
      filters_label: params.filtersLabel ?? null,
      ai_summary: params.aiSummary ?? null,
    },
  };
}
