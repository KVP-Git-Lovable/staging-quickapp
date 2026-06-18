import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, Eye, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fetchAndGenerateInvoice } from "@/utils/invoiceGenerator";

function isStaleDepError(err: any): boolean {
  const msg = err?.message || String(err || "");
  return (
    msg.includes("Failed to fetch dynamically imported module") &&
    msg.includes("/.vite/deps/")
  );
}

function rethrowOrRecover(err: any): never {
  if (isStaleDepError(err)) {
    // Surface to the global recovery handler in main.tsx
    window.dispatchEvent(new ErrorEvent("error", { message: err.message }));
  }
  throw err;
}
import * as pdfjsLib from "pdfjs-dist";
// Bundle the pdf.js worker as a Web Worker via Vite — avoids URL/CSP issues
// inside sandboxed preview iframes where dynamic worker URLs can fail to load.
// @ts-ignore
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

try {
  // workerPort takes precedence and is the most reliable path in iframes.
  // @ts-ignore
  pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();
} catch (e) {
  console.warn("pdf.js worker init failed, falling back to fake worker", e);
}

// Module-level cache so re-opening / downloading is instant
type CachedInvoice = { blob: Blob; invoiceNumber: string };
const invoiceCache = new Map<string, CachedInvoice>();
const inflight = new Map<string, Promise<CachedInvoice>>();

async function getInvoice(orderId: string): Promise<CachedInvoice> {
  const cached = invoiceCache.get(orderId);
  if (cached) return cached;
  const existing = inflight.get(orderId);
  if (existing) return existing;
  const p = (async () => {
    try {
      const { blob, invoiceNumber } = await fetchAndGenerateInvoice(orderId);
      const entry = { blob, invoiceNumber: invoiceNumber || "invoice" };
      invoiceCache.set(orderId, entry);
      inflight.delete(orderId);
      return entry;
    } catch (err) {
      inflight.delete(orderId);
      rethrowOrRecover(err);
    }
  })();
  inflight.set(orderId, p);
  return p;
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface InvoicePreviewDialogProps {
  orderId: string;
  invoiceNumber?: string | null;
  triggerLabel?: string;
  iconOnly?: boolean;
  className?: string;
  /** Controlled open state. When provided, the built-in trigger button is hidden. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Hide the built-in trigger button (use with controlled `open`). */
  hideTrigger?: boolean;
}

/**
 * Opens an inline preview of the order invoice PDF inside a dialog,
 * with an explicit Download button. Does NOT auto-download.
 */
export const InvoicePreviewDialog = ({
  orderId,
  invoiceNumber,
  triggerLabel = "View Invoice",
  iconOnly = false,
  className,
  open: openProp,
  onOpenChange,
  hideTrigger,
}: InvoicePreviewDialogProps) => {
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? !!openProp : internalOpen;
  const setOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };
  const [loading, setLoading] = useState(false);
  const [resolvedNumber, setResolvedNumber] = useState<string | null>(invoiceNumber || null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { blob, invoiceNumber: num } = await getInvoice(orderId);
        if (cancelled) return;
        setPdfBlob(blob);
        if (num) setResolvedNumber(num);

        // Render via pdf.js into canvases (works inside sandboxed iframes).
        // Render page 1 immediately, then the rest progressively for fast first paint.
        const buf = await blob.arrayBuffer();
        if (cancelled) return;
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";
        const containerWidth = container.clientWidth - 32;
        const renderPage = async (i: number) => {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          const scale = Math.min(1.5, Math.max(1, containerWidth / viewport.width));
          const scaled = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = scaled.width;
          canvas.height = scaled.height;
          canvas.className = "shadow-md rounded bg-white mx-auto block mb-4 max-w-full h-auto";
          const ctx = canvas.getContext("2d")!;
          container.appendChild(canvas);
          await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise;
        };
        // First page first for fast perceived load
        await renderPage(1);
        if (cancelled) return;
        setLoading(false);
        for (let i = 2; i <= pdf.numPages; i++) {
          if (cancelled) return;
          await renderPage(i);
        }
      } catch (err: any) {
        console.error("Invoice preview failed", err);
        toast.error(err?.message || "Failed to load invoice");
        setOpen(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setPdfBlob(null);
      if (containerRef.current) containerRef.current.innerHTML = "";
    }
  }, [open]);

  const handleDownload = () => {
    if (!pdfBlob) return;
    triggerDownload(pdfBlob, resolvedNumber || "invoice");
    toast.success("Invoice downloaded");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size={iconOnly ? "icon" : "sm"}
            title={triggerLabel}
            className={cn(iconOnly && "h-8 w-8 p-0", className)}
          >
            <Eye className={cn("h-4 w-4", !iconOnly && "mr-2")} />
            {!iconOnly && triggerLabel}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-5xl max-h-[92vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-5 py-3 border-b flex flex-row items-center justify-between gap-2 space-y-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Invoice {resolvedNumber ? `· ${resolvedNumber}` : ""}
          </DialogTitle>
          <Button size="sm" onClick={handleDownload} disabled={!pdfBlob || loading}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </DialogHeader>
        <div className="flex-1 bg-muted/30 min-h-[70vh] relative overflow-y-auto">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground gap-2 z-10 bg-muted/30">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating invoice…
            </div>
          )}
          <div ref={containerRef} className="p-4" />
        </div>
      </DialogContent>
    </Dialog>
  );
};

/** Standalone download button for the Invoice column. */
export const DownloadInvoiceButton = ({
  orderId,
  invoiceNumber,
  className,
}: {
  orderId: string;
  invoiceNumber?: string | null;
  className?: string;
}) => {
  const [busy, setBusy] = useState(false);
  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { blob, invoiceNumber: num } = await getInvoice(orderId);
      triggerDownload(blob, invoiceNumber || num || "invoice");
      toast.success("Invoice downloaded");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to download invoice");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8", className)}
      title="Download Invoice"
      onClick={handleClick}
      disabled={busy}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
    </Button>
  );
};