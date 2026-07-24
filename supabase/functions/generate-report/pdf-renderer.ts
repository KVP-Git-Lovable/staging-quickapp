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
}

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
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
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
  const brandRgb = hexToRgb(brand.brand_color);

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
        doc.addImage(brand.logo_data_url, brand.logo_format, margin + (blockW - logoBoxW) / 2, y, logoBoxW, logoBoxH);
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
        doc.addImage(brand.logo_data_url, brand.logo_format, margin, cursorY, logoBoxW, logoBoxH);
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
    const bandH = 60;
    doc.setFillColor(brandRgb[0], brandRgb[1], brandRgb[2]);
    doc.rect(margin, cursorY, pageW - margin * 2, bandH, 'F');
    let x = margin + 12;
    if (brand.logo_data_url && brand.logo_format) {
      doc.addImage(brand.logo_data_url, brand.logo_format, x, cursorY + 8, 44, 44);
      x += 54;
    }
    let ty = cursorY + 6;
    doc.setTextColor(255);
    if (brand.header_name) {
      doc.setFont(fontFamily, 'bold'); doc.setFontSize(12);
      doc.text(brand.header_name, x, ty + 10); ty += 13;
    }
    if (brand.company_name) {
      doc.setFont(fontFamily, 'normal'); doc.setFontSize(9);
      doc.text(brand.company_name, x, ty + 8); ty += 11;
    }
    doc.setFont(fontFamily, 'bold'); doc.setFontSize(13);
    doc.text(displayTitle, x, ty + 12);
    if (t.show_period && periodLabel) {
      doc.setFont(fontFamily, 'normal'); doc.setFontSize(9);
      doc.text(periodLabel, pageW - margin - 12, cursorY + bandH - 10, { align: 'right' });
    }
    cursorY += bandH + 10;
  };

  const drawCompact = () => {
    const logoBoxW = 26, logoBoxH = 26;
    let leftX = margin;
    if (brand.logo_data_url && brand.logo_format) {
      doc.addImage(brand.logo_data_url, brand.logo_format, margin, cursorY, logoBoxW, logoBoxH);
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

  // --- Meta block ---
  if (t.include_meta) {
    const parts: string[] = [];
    parts.push(`Generated ${generatedAt}`);
    if (model.meta.recipient_name) parts.push(`For ${model.meta.recipient_name}`);
    if (model.meta.scope_label) parts.push(`Scope ${model.meta.scope_label}`);
    if (periodLabel) parts.push(`Period ${periodLabel}`);
    parts.push(model.meta.filters_label ? `Filters ${model.meta.filters_label}` : 'Filters None');
    const text = parts.join('   \u00B7   ');
    doc.setFillColor(247, 247, 245);
    doc.rect(margin, cursorY, pageW - margin * 2, 20, 'F');
    doc.setFont(fontFamily, 'normal'); doc.setFontSize(8.5); doc.setTextColor(85);
    doc.text(text, margin + 8, cursorY + 13);
    cursorY += 26;
  }

  // --- Wide-column handling: split into chunks that fit ---
  const isEmpty = model.rows.length === 0;
  const cols = model.columns;
  const rowLabelCount = 1; // first column repeats

  // Rough capacity: at 8pt font ~52 chars fit portrait, ~90 landscape.
  const capacity = orientation === 'l' ? 12 : 7;

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
    const columnStyles: Record<number, any> = {};
    chunkIdxs.forEach((ci, idx) => {
      const c = cols[ci];
      if (c.numeric) {
        columnStyles[idx] = { halign: 'right', cellWidth: 'wrap' };
      } else if (idx === 0) {
        columnStyles[idx] = { halign: 'left', cellWidth: 'auto', fontStyle: 'bold' };
      } else {
        columnStyles[idx] = { halign: 'left', cellWidth: 'wrap' };
      }
    });

    autoTable(doc, {
      head, body, foot: foot as any,
      startY: cursorY,
      margin: { left: margin, right: margin },
      tableWidth: pageW - margin * 2,
      styles: { font: fontFamily, fontSize: bodyFontSize, cellPadding: 4, overflow: 'linebreak', valign: 'middle' },
      headStyles: {
        fillColor: [brandRgb[0], brandRgb[1], brandRgb[2]],
        textColor: 255,
        fontStyle: 'bold',
        font: fontFamily,
      },
      footStyles: {
        fillColor: [245, 245, 240],
        textColor: [brandRgb[0], brandRgb[1], brandRgb[2]],
        fontStyle: 'bold',
        font: fontFamily,
      },
      alternateRowStyles: { fillColor: [248, 248, 246] },
      columnStyles,
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
  // Grouping dimension key from the report definition (e.g. 'user_id', 'beat', 'date').
  // Used to name the first (row-label) column instead of showing raw keys
  // like 'grp' or 'row_label'.
  rowDimensionKey?: string | null;
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
    let currency = false;
    if (numeric) {
      const kl = k.toLowerCase();
      if (kl.includes('amount') || kl.includes('revenue') || kl.includes('price') ||
          kl.includes('total') || kl.includes('value') || kl.includes('rate') ||
          kl.includes('sales')) currency = true;
    }
    // First column, or one of the known row-label keys → dimension label.
    const isRowLabelCol = idx === 0 || rowLabelKeys.has(k.toLowerCase());
    const label = isRowLabelCol && !numeric ? dimensionDisplay : humanize(k);
    return { key: k, label, numeric, currency };
  });

  let totals: Record<string, number> | null = null;
  const numericCols = columns.filter(c => c.numeric);
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
    },
  };
}
