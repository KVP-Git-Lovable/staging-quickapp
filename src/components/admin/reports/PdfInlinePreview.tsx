import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, AlertTriangle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

/**
 * Inline PDF preview.
 *
 * IMPORTANT: this renders the REAL PDF produced by the `generate-report` edge
 * function (mode: 'preview'), i.e. exactly the same template, renderer and
 * branding path used for the delivered/downloaded file. There is intentionally
 * no separate HTML mock — that is what previously caused preview/download
 * drift. The Download button saves the very bytes shown above it.
 */
export function PdfInlinePreview(props: PdfInlinePreviewProps) {
  const { open, template: t, name, dataset, layout, rows, columns, values, filters, refreshKey } = props;

  const canQuery = !!dataset?.key && (values.length > 0 || (layout === 'tabular' && rows.length > 0));

  const previewPayload = useMemo(() => ({
    mode: 'preview' as const,
    preview: {
      name: name || 'Report',
      dataset_key: dataset?.key ?? '',
      layout,
      config: {
        rows,
        columns: columns ? [columns] : [],
        values,
        filters: {
          date_from: filters.date_from,
          date_to: filters.date_to,
          scope_user_id: filters.scope_user_id || null,
          distributor_id: filters.distributor_id || null,
        },
      },
      pdf_template: t ?? {},
      period: {
        key: `${filters.date_from}_${filters.date_to}`,
        label: `${filters.date_from} → ${filters.date_to}`,
        date_from: filters.date_from,
        date_to: filters.date_to,
      },
    },
  }), [name, dataset?.key, layout, rows, columns, values, filters, t]);

  const pdf = useQuery({
    queryKey: ['pdf-inline-preview-file', JSON.stringify(previewPayload), refreshKey],
    enabled: open && canQuery,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-report', { body: previewPayload });
      if (error) throw error;
      if (data instanceof Blob) return data;
      if (data instanceof ArrayBuffer) return new Blob([data], { type: 'application/pdf' });
      throw new Error((data as any)?.error || 'Preview failed');
    },
  });

  const [url, setUrl] = useState<string | null>(null);
  const lastUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!(pdf.data instanceof Blob)) return;
    const next = URL.createObjectURL(pdf.data);
    if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    lastUrl.current = next;
    setUrl(next);
    return () => {
      // revoked on next render or unmount
    };
  }, [pdf.data]);

  useEffect(() => () => { if (lastUrl.current) URL.revokeObjectURL(lastUrl.current); }, []);

  if (!open) return null;

  const orientationSetting = (t?.orientation ?? 'auto') as 'auto' | 'portrait' | 'landscape';
  const columnCount = (layout === 'tabular' ? rows.length : 1) + values.length + (layout === 'matrix' && columns ? 1 : 0);
  const orientation = orientationSetting === 'auto'
    ? (columnCount > 6 ? 'landscape' : 'portrait')
    : orientationSetting;

  const download = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(name || 'report').replace(/[^\w-]+/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between mb-2 text-[11px] text-muted-foreground">
        <span>Inline preview · this is the exact PDF that gets delivered</span>
        <div className="flex items-center gap-2">
          <span>{orientation === 'portrait' ? 'A4 · Portrait' : 'A4 · Landscape'}</span>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={download} disabled={!url}>
            <Download size={13} className="mr-1" /> Download PDF
          </Button>
        </div>
      </div>

      <div
        className="w-full rounded-md border border-border bg-background overflow-hidden"
        style={{ height: orientation === 'portrait' ? 780 : 620 }}
      >
        {!canQuery ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            Pick fields in the Build step to see the PDF here.
          </div>
        ) : pdf.isLoading || pdf.isFetching ? (
          <div className="h-full flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Rendering PDF…
          </div>
        ) : pdf.error ? (
          <div className="h-full flex items-center justify-center gap-2 text-xs text-destructive px-6 text-center">
            <AlertTriangle size={14} /> Could not render the PDF preview. {(pdf.error as any)?.message ?? ''}
          </div>
        ) : url ? (
          <iframe title="Report PDF preview" src={`${url}#toolbar=0&navpanes=0&view=FitH`} className="w-full h-full" />
        ) : null}
      </div>
    </div>
  );
}
