import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Loader2, FileText, Eye, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { downloadReportFile, fetchReportBlob, getReportMeta } from '@/lib/reportFile';
import type { Notification } from '@/hooks/useNotifications';
import * as pdfjsLib from 'pdfjs-dist';
// Bundle the pdf.js worker as a Web Worker via Vite — a browser-plugin <iframe>
// preview fails inside sandboxed preview iframes, and dynamic worker URLs can
// fail to load there too. Same approach as InvoicePreviewDialog.
// @ts-ignore
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

try {
  // @ts-ignore — workerPort takes precedence and is the most reliable in iframes.
  pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();
} catch (e) {
  console.warn('pdf.js worker init failed, falling back to fake worker', e);
}

interface Props {
  notification: Notification | null;
  onClose: () => void;
}

/** Rows rendered from a spreadsheet before we stop and tell the user to download. */
const MAX_PREVIEW_ROWS = 500;

type SheetPreview = { name: string; rows: any[][] };

export function ReportNotificationDialog({ notification, onClose }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [loadingView, setLoadingView] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [sheets, setSheets] = useState<SheetPreview[] | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const objectUrls = useRef<string[]>([]);
  const pdfContainerRef = useRef<HTMLDivElement | null>(null);

  const releaseObjectUrls = useCallback(() => {
    objectUrls.current.forEach((u) => URL.revokeObjectURL(u));
    objectUrls.current = [];
  }, []);

  // Revoke any blob URLs when the dialog unmounts or switches notification.
  useEffect(() => () => releaseObjectUrls(), [releaseObjectUrls]);
  useEffect(() => {
    setPdfOpen(false);
    setSheets(null);
    setActiveSheet(0);
    releaseObjectUrls();
  }, [notification?.id, releaseObjectUrls]);

  if (!notification) return null;

  const { subscriptionId, storagePath, format, period, bodyMd, isPdf, isSheet } =
    getReportMeta(notification);
  const canView = Boolean(storagePath) && (isPdf || isSheet);
  const isViewing = pdfOpen || Boolean(sheets);

  const handleDownload = async () => {
    if (!subscriptionId || !storagePath) return;
    setDownloading(true);
    try {
      await downloadReportFile(notification);
    } catch (e: any) {
      console.error(e);
      toast.error(
        "Couldn't download the report — please try again. Your browser or an extension may be blocking the download."
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleView = async () => {
    if (!subscriptionId || !storagePath) return;
    setLoadingView(true);
    try {
      const fetched = await fetchReportBlob(subscriptionId, storagePath);
      if (!fetched) return;

      if (isPdf) {
        // Rendered to canvas rather than shown in an <iframe>: the browser's PDF
        // plugin doesn't reliably paint inside a sandboxed preview iframe, which
        // is what produced the broken-document placeholder.
        const buf = await fetched.blob.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        setPdfOpen(true);
        // Let the container mount before measuring it.
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const container = pdfContainerRef.current;
        if (!container) return;
        container.innerHTML = '';
        const containerWidth = Math.max(320, container.clientWidth - 32);
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(2, Math.max(1, containerWidth / base.width));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = 'shadow-md rounded bg-white mx-auto block mb-4 max-w-full h-auto';
          const ctx = canvas.getContext('2d')!;
          container.appendChild(canvas);
          await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
        }
        return;
      }

      // Spreadsheet — parse to arrays and render a real table (no raw HTML injected).
      const XLSX = await import('xlsx');
      const buf = await fetched.blob.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const parsed: SheetPreview[] = wb.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json(wb.Sheets[name], {
          header: 1, blankrows: false, defval: '',
        }) as any[][],
      }));
      if (!parsed.length || !parsed.some((s) => s.rows.length)) {
        toast.error('This report has no readable content — try downloading it instead.');
        return;
      }
      setSheets(parsed);
      setActiveSheet(0);
    } catch (e: any) {
      console.error(e);
      toast.error("Couldn't open the report — please try downloading it instead.");
    } finally {
      setLoadingView(false);
    }
  };

  const closeViewer = () => {
    releaseObjectUrls();
    if (pdfContainerRef.current) pdfContainerRef.current.innerHTML = '';
    setPdfOpen(false);
    setSheets(null);
    setActiveSheet(0);
  };

  const sheet = sheets?.[activeSheet];
  const truncated = sheet ? sheet.rows.length > MAX_PREVIEW_ROWS : false;
  const visibleRows = sheet ? sheet.rows.slice(0, MAX_PREVIEW_ROWS) : [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* z-[110] clears the notification popover, which sits at z-[100] */}
      <DialogContent
        className={cn(
          'z-[110] flex flex-col',
          isViewing ? 'max-w-5xl h-[86vh]' : 'max-w-lg'
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <FileText size={18} className="shrink-0" /> {notification.title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 min-h-0 flex-1">
          <div className="flex items-center gap-2 text-xs flex-wrap">
            {period && <Badge variant="secondary">{period}</Badge>}
            <Badge variant="outline">{format}</Badge>
            {isViewing && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1 ml-auto"
                onClick={closeViewer}
              >
                <X size={12} /> Close preview
              </Button>
            )}
          </div>

          {format === 'summary_only' ? (
            <pre className="text-xs bg-muted/50 rounded p-3 whitespace-pre-wrap max-h-80 overflow-y-auto">
              {bodyMd || notification.message}
            </pre>
          ) : (
            <>
              {!isViewing && (
                <p className="text-sm text-muted-foreground">{notification.message}</p>
              )}

              {/* ── PDF preview — canvases painted by pdf.js ── */}
              <div
                ref={pdfContainerRef}
                className={cn(
                  'w-full flex-1 min-h-0 overflow-auto rounded border bg-muted/30 p-4',
                  pdfOpen ? 'block' : 'hidden'
                )}
              />
              {pdfOpen && loadingView && (
                <p className="text-xs text-muted-foreground text-center">Rendering pages…</p>
              )}

              {/* ── Spreadsheet preview ── */}
              {sheet && (
                <div className="flex flex-col min-h-0 flex-1 gap-2">
                  {sheets!.length > 1 && (
                    <div className="flex gap-1 overflow-x-auto pb-1">
                      {sheets!.map((s, i) => (
                        <button
                          key={s.name}
                          onClick={() => setActiveSheet(i)}
                          className={cn(
                            'text-xs px-3 py-1.5 rounded-md whitespace-nowrap transition-colors border',
                            i === activeSheet
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-muted/40 hover:bg-muted border-transparent'
                          )}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex-1 min-h-0 overflow-auto rounded border">
                    <table className="text-xs w-full border-collapse">
                      <tbody>
                        {visibleRows.map((row, ri) => (
                          <tr key={ri} className={ri === 0 ? 'sticky top-0' : undefined}>
                            {row.map((cell, ci) => {
                              const Cell = ri === 0 ? 'th' : 'td';
                              return (
                                <Cell
                                  key={ci}
                                  className={cn(
                                    'border px-2.5 py-1.5 align-top whitespace-nowrap',
                                    ri === 0
                                      ? 'bg-muted font-semibold text-left'
                                      : 'text-muted-foreground'
                                  )}
                                >
                                  {cell === null || cell === undefined ? '' : String(cell)}
                                </Cell>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {truncated
                      ? `Showing the first ${MAX_PREVIEW_ROWS} of ${sheet.rows.length} rows — download for the full report.`
                      : `${sheet.rows.length} rows`}
                  </p>
                </div>
              )}

              {/* ── Actions ── */}
              {storagePath ? (
                <div className="flex gap-2">
                  {canView && !isViewing && (
                    <Button
                      variant="outline"
                      onClick={handleView}
                      disabled={loadingView || downloading}
                      className="gap-2 flex-1"
                    >
                      {loadingView
                        ? <><Loader2 size={14} className="animate-spin" />Opening…</>
                        : <><Eye size={14} />View report</>}
                    </Button>
                  )}
                  <Button
                    onClick={handleDownload}
                    disabled={downloading || loadingView}
                    className={cn('gap-2', canView && !isViewing ? 'flex-1' : 'w-full')}
                  >
                    {downloading
                      ? <><Loader2 size={14} className="animate-spin" />Preparing…</>
                      : <><Download size={14} />Download report</>}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">File not available.</p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
