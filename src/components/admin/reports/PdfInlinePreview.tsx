import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Dataset {
  key: string;
  label: string;
  source?: string;
  dimensions: Array<{ key: string; label: string }>;
  measures: Array<{ key: string; label: string; agg?: string }>;
}

export interface PdfInlinePreviewProps {
  open: boolean;
  template: any;
  name: string;
  dataset: Dataset | undefined;
  layout: string;
  rows: string[];
  columns: string;
  values: string[];
  filters: {
    date_from: string;
    date_to: string;
    scope_user_id?: string | null;
    distributor_id?: string | null;
  };
  refreshKey: number;
}

interface Branding {
  header_name: string;
  company_name: string;
  address: string;
  gstin: string;
  contact_phone: string;
  currency: string;
  date_format: string;
  logo_url: string | null;
}

function useBranding(mode: string, distributor_id?: string | null) {
  return useQuery<Branding>({
    queryKey: ['pdf-inline-branding', mode, distributor_id || ''],
    queryFn: async () => {
      const { data: comp } = await supabase
        .from('companies')
        .select('header_name, name, address, gstin, contact_phone, currency, date_format, header_logo_url, logo_url')
        .limit(1)
        .maybeSingle();
      const c: any = comp || {};
      const b: Branding = {
        header_name: c.header_name ?? '',
        company_name: c.name ?? '',
        address: c.address ?? '',
        gstin: c.gstin ?? '',
        contact_phone: c.contact_phone ?? '',
        currency: c.currency || 'INR',
        date_format: c.date_format || 'DD/MM/YYYY',
        logo_url: c.header_logo_url || c.logo_url || null,
      };
      if (mode === 'none') {
        return { ...b, header_name: '', company_name: '', address: '', gstin: '', contact_phone: '', logo_url: null };
      }
      if (mode === 'distributor' && distributor_id) {
        const { data: dist } = await supabase
          .from('distributors')
          .select('name, logo_url')
          .eq('id', distributor_id)
          .maybeSingle();
        if (dist) {
          b.company_name = (dist as any).name ?? b.company_name;
          if ((dist as any).logo_url) b.logo_url = (dist as any).logo_url;
        }
      }
      return b;
    },
    staleTime: 60_000,
  });
}

function formatDateToken(d: Date, fmt: string): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return (fmt || 'DD/MM/YYYY').replace('DD', dd).replace('MM', mm).replace('YYYY', yyyy);
}

function fmtCurrency(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

const MEASURE_LOOKS_LIKE_MONEY = /amount|total|value|revenue|sales|price|cost|gst|tax|payment/i;

export function PdfInlinePreview(props: PdfInlinePreviewProps) {
  const { open, template: t, name, dataset, layout, rows, columns, values, filters, refreshKey } = props;

  const brandingMode = t?.branding ?? 'company';
  const branding = useBranding(brandingMode, filters.distributor_id);

  const canQuery = !!dataset?.source && (values.length > 0 || (layout === 'tabular' && rows.length > 0));

  const preview = useQuery({
    queryKey: [
      'pdf-inline-preview-rows',
      dataset?.source,
      layout,
      rows.join(','),
      columns,
      values.join(','),
      filters.date_from,
      filters.date_to,
      filters.scope_user_id || '',
      filters.distributor_id || '',
      refreshKey,
    ],
    enabled: open && canQuery,
    retry: false,
    queryFn: async () => {
      const payload: any = {
        p_layout: layout,
        p_rows: layout === 'tabular' ? null : (rows[0] || null),
        p_columns: layout === 'matrix' ? (columns || null) : null,
        p_values: values,
        p_filters: {
          date_from: filters.date_from,
          date_to: filters.date_to,
          scope_user_id: filters.scope_user_id || null,
          distributor_id: filters.distributor_id || null,
        },
      };
      const { data, error } = await supabase.rpc(dataset!.source as any, payload as any);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Derive display columns from first row (keeps in sync with the RPC output).
  const dataRows = (preview.data ?? []) as any[];
  const dimByKey = useMemo(() => {
    const m: Record<string, string> = {};
    (dataset?.dimensions ?? []).forEach(d => { m[d.key] = d.label; });
    (dataset?.measures ?? []).forEach(d => { m[d.key] = d.label; });
    return m;
  }, [dataset]);

  const displayColumns = useMemo<string[]>(() => {
    if (dataRows.length > 0) return Object.keys(dataRows[0]);
    // Fallback ordering: rows → columns → values.
    const list: string[] = [];
    if (layout === 'tabular') {
      rows.forEach(k => list.push(k));
    } else {
      if (rows[0]) list.push(rows[0]);
      if (layout === 'matrix' && columns) list.push(columns);
    }
    values.forEach(v => list.push(v));
    return list;
  }, [dataRows, layout, rows, columns, values]);

  const orientationSetting = (t?.orientation ?? 'auto') as 'auto' | 'portrait' | 'landscape';
  const orientation: 'portrait' | 'landscape' =
    orientationSetting === 'auto'
      ? (displayColumns.length > 6 ? 'landscape' : 'portrait')
      : orientationSetting;

  // Columns that visibly fit at current orientation (approx.)
  const colFit = orientation === 'landscape' ? 10 : 7;
  const visibleColumns = displayColumns.slice(0, colFit);
  const overflowCount = Math.max(0, displayColumns.length - colFit);

  // Aspect ratio: A4 portrait ≈ 210×297, landscape ≈ 297×210.
  const pageAspect = orientation === 'portrait' ? 210 / 297 : 297 / 210;

  const b = branding.data;

  const headerStyle = (t?.header_style ?? 'standard') as 'standard' | 'centered' | 'band' | 'compact';
  const title = (t?.title_override && String(t.title_override).trim()) || name || 'Report preview';
  const subtitle: string = t?.subtitle ?? '';
  const showPeriod = t?.show_period !== false;
  const showContact = !!t?.show_contact_line;
  const includeMeta = t?.include_meta !== false;
  const includeTotals = t?.include_totals !== false;
  const includePageNumbers = t?.include_page_numbers !== false;
  const footerNote: string = t?.footer_note ?? '';

  const dateFmt = b?.date_format || 'DD/MM/YYYY';
  const currency = b?.currency || 'INR';
  const periodLabel = `${formatDateToken(new Date(filters.date_from), dateFmt)} → ${formatDateToken(new Date(filters.date_to), dateFmt)}`;
  const generatedAt = formatDateToken(new Date(), dateFmt);

  // Compute totals for numeric columns from the fetched rows (measures only).
  const measureKeys = new Set((dataset?.measures ?? []).map(m => m.key));
  const totals: Record<string, number> = {};
  if (includeTotals && dataRows.length > 0) {
    visibleColumns.forEach(col => {
      if (!measureKeys.has(col)) return;
      let sum = 0;
      let any = false;
      for (const row of dataRows) {
        const v = Number((row as any)[col]);
        if (Number.isFinite(v)) { sum += v; any = true; }
      }
      if (any) totals[col] = sum;
    });
  }

  const previewRows = dataRows.slice(0, 5);

  if (!open) return null;

  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between mb-2 text-[11px] text-muted-foreground">
        <span>Inline preview · updates live as you change controls</span>
        <span>{orientation === 'portrait' ? 'A4 · Portrait' : 'A4 · Landscape'}</span>
      </div>

      {overflowCount > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-[11px] dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            {displayColumns.length} columns exceed the current orientation. The renderer will split them across
            pages — columns {colFit + 1}–{displayColumns.length} continue on page 2.
          </div>
        </div>
      )}

      <div className="w-full flex justify-center">
        <div
          className="bg-white shadow-md rounded-sm overflow-hidden text-[10px] text-black"
          style={{
            width: '100%',
            maxWidth: orientation === 'landscape' ? 900 : 640,
            aspectRatio: String(pageAspect),
          }}
        >
          <div className="w-full h-full flex flex-col p-6">
            {/* Header */}
            <PdfHeader
              style={headerStyle}
              title={title}
              subtitle={subtitle}
              branding={b}
              brandingMode={brandingMode}
              showPeriod={showPeriod}
              showContact={showContact}
              periodLabel={periodLabel}
            />

            {/* Meta block */}
            {includeMeta && (
              <div className="mt-3 grid grid-cols-3 gap-2 text-[9px] text-neutral-600">
                <div><span className="text-neutral-400">Generated</span><br />{generatedAt}</div>
                <div><span className="text-neutral-400">Dataset</span><br />{dataset?.label ?? '—'} · {layout}</div>
                <div><span className="text-neutral-400">Rows</span><br />{dataRows.length} rendered</div>
              </div>
            )}

            {/* Body table */}
            <div className="mt-3 flex-1 min-h-0 overflow-hidden">
              {!canQuery ? (
                <div className="h-full flex items-center justify-center text-[10px] text-neutral-400">
                  Pick fields in the Build step to see rows here.
                </div>
              ) : preview.isLoading ? (
                <div className="h-full flex items-center justify-center text-[10px] text-neutral-500 gap-2">
                  <Loader2 size={12} className="animate-spin" /> Loading rows…
                </div>
              ) : preview.error ? (
                <div className="h-full flex items-center justify-center text-[10px] text-rose-600">
                  Could not load preview rows.
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-300 bg-neutral-50">
                      {visibleColumns.map(col => (
                        <th key={col} className="text-left py-1.5 px-2 font-semibold text-neutral-700 text-[9px]">
                          {dimByKey[col] || col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-b border-neutral-100">
                        {visibleColumns.map(col => {
                          const v = (row as any)[col];
                          const isMoney = measureKeys.has(col) && MEASURE_LOOKS_LIKE_MONEY.test(col);
                          const display = v == null
                            ? ''
                            : isMoney && Number.isFinite(Number(v))
                              ? fmtCurrency(Number(v), currency)
                              : typeof v === 'number'
                                ? new Intl.NumberFormat('en-IN').format(v)
                                : String(v);
                          const numeric = typeof v === 'number' || (measureKeys.has(col) && Number.isFinite(Number(v)));
                          return (
                            <td key={col} className={cn('py-1 px-2 text-[9px]', numeric && 'text-right tabular-nums')}>
                              {display}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {previewRows.length === 0 && (
                      <tr>
                        <td colSpan={visibleColumns.length} className="py-6 text-center text-[10px] text-neutral-400">
                          No rows in the selected range.
                        </td>
                      </tr>
                    )}
                    {includeTotals && Object.keys(totals).length > 0 && (
                      <tr className="border-t-2 border-neutral-400 bg-neutral-50 font-semibold">
                        {visibleColumns.map((col, idx) => {
                          const isMoney = MEASURE_LOOKS_LIKE_MONEY.test(col);
                          const t = totals[col];
                          return (
                            <td key={col} className={cn('py-1 px-2 text-[9px]', measureKeys.has(col) && 'text-right tabular-nums')}>
                              {idx === 0 && t === undefined ? 'Total' :
                                t === undefined ? '' :
                                isMoney ? fmtCurrency(t, currency) : new Intl.NumberFormat('en-IN').format(t)}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="mt-3 pt-2 border-t border-neutral-200 flex items-center justify-between text-[8px] text-neutral-500">
              <span>{footerNote}</span>
              {includePageNumbers && <span>Page 1{overflowCount > 0 ? ' of 2+' : ' of 1'}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PdfHeader({
  style, title, subtitle, branding, brandingMode, showPeriod, showContact, periodLabel,
}: {
  style: 'standard' | 'centered' | 'band' | 'compact';
  title: string;
  subtitle: string;
  branding: Branding | undefined;
  brandingMode: string;
  showPeriod: boolean;
  showContact: boolean;
  periodLabel: string;
}) {
  const b = branding;
  const logo = brandingMode !== 'none' && b?.logo_url ? (
    <img src={b.logo_url} alt="" className="h-10 w-auto object-contain" crossOrigin="anonymous" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
  ) : null;
  const companyName = brandingMode !== 'none' ? (b?.header_name || b?.company_name || '') : '';
  const contactLine = showContact && brandingMode !== 'none'
    ? [b?.address, b?.gstin ? `GSTIN: ${b.gstin}` : '', b?.contact_phone].filter(Boolean).join('  ·  ')
    : '';

  if (style === 'centered') {
    return (
      <div className="text-center border-b border-neutral-300 pb-3">
        {logo && <div className="flex justify-center mb-1.5">{logo}</div>}
        {companyName && <div className="text-[11px] font-semibold text-neutral-800">{companyName}</div>}
        {contactLine && <div className="text-[8px] text-neutral-500 mt-0.5">{contactLine}</div>}
        <div className="mt-2 text-[14px] font-bold text-neutral-900">{title}</div>
        {subtitle && <div className="text-[9px] text-neutral-600">{subtitle}</div>}
        {showPeriod && <div className="text-[9px] text-neutral-500 mt-1">{periodLabel}</div>}
      </div>
    );
  }

  if (style === 'band') {
    return (
      <div>
        <div className="bg-neutral-900 text-white px-3 py-2 -mx-6 -mt-6 flex items-center gap-3">
          {logo && <div className="bg-white rounded-sm p-1">{logo}</div>}
          <div className="flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide">{companyName}</div>
            <div className="text-[14px] font-bold">{title}</div>
          </div>
          {showPeriod && <div className="text-[9px] opacity-80">{periodLabel}</div>}
        </div>
        {(subtitle || contactLine) && (
          <div className="pt-2 flex items-center justify-between text-[8px] text-neutral-500">
            <span>{subtitle}</span>
            <span>{contactLine}</span>
          </div>
        )}
      </div>
    );
  }

  if (style === 'compact') {
    return (
      <div className="flex items-center justify-between border-b border-neutral-300 pb-2 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {logo}
          <div className="min-w-0">
            <div className="text-[12px] font-bold text-neutral-900 truncate">{title}</div>
            {(companyName || subtitle) && (
              <div className="text-[8px] text-neutral-500 truncate">{[companyName, subtitle].filter(Boolean).join(' · ')}</div>
            )}
          </div>
        </div>
        {showPeriod && <div className="text-[8px] text-neutral-500 shrink-0">{periodLabel}</div>}
      </div>
    );
  }

  // Standard
  return (
    <div className="flex items-start justify-between border-b border-neutral-300 pb-3 gap-4">
      <div className="min-w-0">
        {companyName && <div className="text-[11px] font-semibold text-neutral-800">{companyName}</div>}
        {contactLine && <div className="text-[8px] text-neutral-500">{contactLine}</div>}
        <div className="mt-1 text-[14px] font-bold text-neutral-900">{title}</div>
        {subtitle && <div className="text-[9px] text-neutral-600">{subtitle}</div>}
        {showPeriod && <div className="text-[9px] text-neutral-500 mt-0.5">{periodLabel}</div>}
      </div>
      {logo && <div className="shrink-0">{logo}</div>}
    </div>
  );
}
