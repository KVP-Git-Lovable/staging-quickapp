import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Loader2, FileText, Eye, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { downloadReportFile, fetchReportBlob, getReportMeta } from '@/lib/reportFile';
import type { Notification } from '@/hooks/useNotifications';

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
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetPreview[] | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const objectUrls = useRef<string[]>([]);

  const releaseObjectUrls = useCallback(() => {
    objectUrls.current.forEach((u) => URL.revokeObjectURL(u));
    objectUrls.current = [];
  }, []);

  // Revoke any blob URLs when the dialog unmounts or switches notification.
  useEffect(() => () => releaseObjectUrls(), [releaseObjectUrls]);
  useEffect(() => {
    setPdfUrl(null);
    setSheets(null);
    setActiveSheet(0);
    releaseObjectUrls();
  }, [notification?.id, releaseObjectUrls]);

  if (!notification) return null;

  const { subscriptionId, storagePath, format, period, bodyMd, isPdf, isSheet } =
    getReportMeta(notification);
  const canView = Boolean(storagePath) && (isPdf || isSheet);
  const isViewing = Boolean(pdfUrl || sheets);

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
        const url = URL.createObjectURL(fetched.blob);
        objectUrls.current.push(url);
        setPdfUrl(url);
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
    setPdfUrl(null);
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

              {/* ── PDF preview ── */}
              {pdfUrl && (
                <iframe
                  src={pdfUrl}
                  title={`${notification.title} preview`}
                  className="w-full flex-1 min-h-0 rounded border bg-muted/30"
                />
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
