/**
 * BarcodeScannerDialog
 *
 * Two modes in one dialog:
 *  - Option 1: Camera scan  — opens the device rear camera, continuously decodes
 *                             frames using ZXing. Works in browser + Capacitor WebView.
 *  - Option 2: Manual entry — text input for Bluetooth handheld scanners (keyboard mode)
 *                             or typing. Auto-submits when the code reaches the expected length.
 *
 * Usage:
 *   <BarcodeScannerDialog
 *     open={scanOpen}
 *     onOpenChange={setScanOpen}
 *     expectedCode={row.batch_number}          // what we expect to scan
 *     productName={row.product_name}
 *     onSuccess={() => handlePackedChange(row, Number(row.picked_qty))}
 *   />
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Camera, Keyboard, CheckCircle2, XCircle, Loader2,
  ScanBarcode, RefreshCw, AlertTriangle, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface BarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The batch_number we expect the picker to scan. Pass null to accept any code. */
  expectedCode: string | null;
  /** Display name for the product being confirmed */
  productName?: string;
  /** Called with the scanned/entered code once it is verified (or if expectedCode is null) */
  onSuccess: (scannedCode: string) => void;
  /** Allow confirming even on mismatch (shows warning but still proceeds). Default false. */
  allowMismatch?: boolean;
}

// ─── Camera scan mode ──────────────────────────────────────────────────────────

function CameraScanMode({
  expectedCode, productName, onSuccess, allowMismatch, onClose,
}: Omit<BarcodeScannerDialogProps, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const rafRef      = useRef<number | null>(null);
  const decoderRef  = useRef<any>(null);

  const [status, setStatus]         = useState<'init' | 'scanning' | 'match' | 'mismatch' | 'error'>('init');
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [loadingZxing, setLoadingZxing] = useState(true);
  const [permDenied, setPermDenied]   = useState(false);

  // Dynamically import ZXing so it only loads when this dialog opens
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const zxing = await import('@zxing/library');
        if (!mounted) return;
        decoderRef.current = new zxing.BrowserMultiFormatReader();
        setLoadingZxing(false);
        startCamera();
      } catch (err) {
        console.error('[BarcodeScan] ZXing load failed:', err);
        if (mounted) setStatus('error');
      }
    })();
    return () => { mounted = false; stopAll(); };
  }, []);

  const stopAll = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (decoderRef.current) { try { decoderRef.current.reset(); } catch {} }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus('scanning');
      scheduleDecode();
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setPermDenied(true);
      }
      setStatus('error');
    }
  };

  const scheduleDecode = () => {
    rafRef.current = requestAnimationFrame(decodeFrame);
  };

  const decodeFrame = useCallback(() => {
    if (!decoderRef.current || !videoRef.current || !canvasRef.current) {
      rafRef.current = requestAnimationFrame(decodeFrame);
      return;
    }
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (video.readyState < 2) { rafRef.current = requestAnimationFrame(decodeFrame); return; }

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) { rafRef.current = requestAnimationFrame(decodeFrame); return; }
    ctx.drawImage(video, 0, 0);

    try {
      const LuminanceCtor = (window as any).__ZXingLuminance;
      const luminance = LuminanceCtor ? new LuminanceCtor(canvas) : null;

      decoderRef.current.decodeFromCanvas(canvas)
        .then((result: any) => {
          const code = result?.getText?.() || result?.text || '';
          if (code) handleDecoded(code);
          else scheduleDecode();
        })
        .catch(() => { scheduleDecode(); });
    } catch {
      // decodeFromCanvas may throw on some frames — just retry
      scheduleDecode();
    }
  }, []);

  // ZXing BrowserMultiFormatReader.decodeFromCanvas is synchronous in some versions —
  // handle both sync (throws NotFoundException) and async (returns Promise)
  const startDecoding = useCallback(() => {
    if (!decoderRef.current || !videoRef.current || !canvasRef.current) return;
    const video  = videoRef.current;
    const canvas = canvasRef.current;

    const tick = () => {
      if (video.readyState < 2 || status === 'match' || status === 'mismatch') return;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(video, 0, 0);
      try {
        const result = decoderRef.current.decodeFromCanvas(canvas);
        if (result) { handleDecoded(result.getText()); return; }
      } catch (e: any) {
        if (e?.name !== 'NotFoundException') console.warn('[ZXing]', e?.message);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [status]);

  useEffect(() => {
    if (status === 'scanning' && !loadingZxing) startDecoding();
  }, [status, loadingZxing]);

  const handleDecoded = (code: string) => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setScannedCode(code);

    if (!expectedCode || code === expectedCode) {
      setStatus('match');
      setTimeout(() => { onSuccess(code); onClose(); }, 800);
    } else {
      setStatus('mismatch');
    }
  };

  const handleRetry = () => {
    setScannedCode(null);
    setStatus('scanning');
    startDecoding();
  };

  const handleForceProceed = () => {
    if (scannedCode) { onSuccess(scannedCode); onClose(); }
  };

  if (permDenied) return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <AlertTriangle className="h-10 w-10 text-amber-500" />
      <p className="font-medium">Camera permission denied</p>
      <p className="text-sm text-muted-foreground">Enable camera access in your device/browser settings, then retry.</p>
      <Button variant="outline" onClick={handleRetry}><RefreshCw className="h-4 w-4 mr-1" /> Retry</Button>
    </div>
  );

  if (status === 'error' && !permDenied) return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <XCircle className="h-10 w-10 text-destructive" />
      <p className="font-medium">Camera unavailable</p>
      <p className="text-sm text-muted-foreground">ZXing could not load or no camera found. Use manual entry instead.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Video feed */}
      <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />

        {/* Scanning overlay */}
        {status === 'scanning' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {/* Dark vignette */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/40" />
            {/* Scan frame */}
            <div className="relative w-56 h-36 border-2 border-white/70 rounded-lg">
              {/* Corner accents */}
              {[
                'top-0 left-0 border-t-2 border-l-2 rounded-tl-lg',
                'top-0 right-0 border-t-2 border-r-2 rounded-tr-lg',
                'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg',
                'bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg',
              ].map((cls, i) => (
                <div key={i} className={`absolute w-5 h-5 border-primary ${cls}`} />
              ))}
              {/* Animated scan line */}
              <div className="absolute left-1 right-1 h-0.5 bg-primary/80 animate-scan-line" />
            </div>
            <p className="relative mt-3 text-white text-xs bg-black/60 px-3 py-1 rounded-full">
              Point at barcode on carton
            </p>
          </div>
        )}

        {/* Match overlay */}
        {status === 'match' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-900/60">
            <CheckCircle2 className="h-16 w-16 text-green-400" />
            <p className="text-white font-semibold mt-2">Batch verified!</p>
          </div>
        )}

        {/* Mismatch overlay */}
        {status === 'mismatch' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/60 gap-3 p-4">
            <XCircle className="h-12 w-12 text-red-300" />
            <div className="text-center">
              <p className="text-white font-semibold">Wrong batch scanned</p>
              <p className="text-red-200 text-xs mt-1">Scanned: <code className="font-mono">{scannedCode}</code></p>
              <p className="text-red-200 text-xs">Expected: <code className="font-mono">{expectedCode}</code></p>
            </div>
          </div>
        )}

        {/* Loading */}
        {loadingZxing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
            <Loader2 className="h-8 w-8 text-white animate-spin" />
            <p className="text-white/70 text-xs mt-2">Loading scanner…</p>
          </div>
        )}
      </div>

      {/* Expected batch info */}
      {expectedCode && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 text-xs">
          <ScanBarcode className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground">Expected:</span>
          <code className="font-mono font-medium text-foreground flex-1 truncate">{expectedCode}</code>
          {productName && <span className="text-muted-foreground truncate max-w-[120px]">{productName}</span>}
        </div>
      )}

      {/* Mismatch actions */}
      {status === 'mismatch' && (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleRetry}>
            <RefreshCw className="h-4 w-4 mr-1" /> Retry scan
          </Button>
          {allowMismatch && (
            <Button variant="destructive" className="flex-1" onClick={handleForceProceed}>
              Override &amp; confirm
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Manual / Bluetooth mode ───────────────────────────────────────────────────

function ManualScanMode({
  expectedCode, productName, onSuccess, allowMismatch, onClose,
}: Omit<BarcodeScannerDialogProps, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const [inputValue, setInputValue] = useState('');
  const [matchState, setMatchState] = useState<'idle' | 'match' | 'mismatch'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus so Bluetooth scanner can type into it immediately
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const verify = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    if (!expectedCode) {
      // No expected code — accept anything
      onSuccess(trimmed);
      onClose();
      return;
    }

    if (trimmed === expectedCode) {
      setMatchState('match');
      toast.success(`Batch verified: ${trimmed}`);
      setTimeout(() => { onSuccess(trimmed); onClose(); }, 600);
    } else {
      setMatchState('mismatch');
      toast.error(`Mismatch — got ${trimmed}, expected ${expectedCode}`);
    }
  };

  const handleChange = (val: string) => {
    setInputValue(val);
    setMatchState('idle');
    // Auto-submit when the entered code matches expected length (Bluetooth scanner fires Enter too,
    // but some scanners don't — length match is a good fallback)
    if (expectedCode && val.length === expectedCode.length) {
      verify(val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); verify(inputValue); }
  };

  return (
    <div className="space-y-4">
      {/* Expected batch */}
      {expectedCode && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
          <p className="text-xs text-muted-foreground">Expected batch number</p>
          <code className="text-sm font-mono font-semibold text-foreground break-all">{expectedCode}</code>
          {productName && <p className="text-xs text-muted-foreground">{productName}</p>}
        </div>
      )}

      {/* Input */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Keyboard className="h-3.5 w-3.5" />
          Scan barcode or type batch number
        </label>
        <div className="relative">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Scan or type batch number…"
            className={cn(
              'font-mono pr-10 text-sm h-11',
              matchState === 'match'    && 'border-green-500 bg-green-50/30 dark:bg-green-900/10',
              matchState === 'mismatch' && 'border-destructive bg-destructive/5',
            )}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {inputValue && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => { setInputValue(''); setMatchState('idle'); inputRef.current?.focus(); }}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Feedback */}
        {matchState === 'match' && (
          <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" /> Batch matched — confirming…
          </div>
        )}
        {matchState === 'mismatch' && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-destructive text-xs font-medium">
              <XCircle className="h-3.5 w-3.5" />
              Code does not match expected batch
            </div>
            <div className="text-xs text-muted-foreground">
              Entered: <code className="font-mono">{inputValue}</code> ·
              Expected: <code className="font-mono">{expectedCode}</code>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {matchState === 'mismatch' && (
          <Button variant="outline" className="flex-1"
            onClick={() => { setInputValue(''); setMatchState('idle'); inputRef.current?.focus(); }}>
            <RefreshCw className="h-4 w-4 mr-1" /> Clear &amp; retry
          </Button>
        )}
        {(matchState === 'idle' || matchState === 'mismatch') && (
          <Button
            className={cn('flex-1', matchState === 'mismatch' && !allowMismatch && 'opacity-50 pointer-events-none')}
            onClick={() => verify(inputValue)}
            disabled={!inputValue.trim()}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" />
            {matchState === 'mismatch' && allowMismatch ? 'Override & confirm' : 'Confirm'}
          </Button>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground text-center">
        Bluetooth scanner? Make sure this field is focused, then scan — it will auto-submit.
      </p>
    </div>
  );
}

// ─── Main dialog ───────────────────────────────────────────────────────────────

export function BarcodeScannerDialog({
  open, onOpenChange,
  expectedCode, productName, onSuccess, allowMismatch = false,
}: BarcodeScannerDialogProps) {
  const [tab, setTab] = useState<'camera' | 'manual'>('camera');

  const handleClose = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-0">
          <DialogTitle className="text-base flex items-center gap-2">
            <ScanBarcode className="h-4 w-4 text-primary" />
            Scan batch barcode
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={v => setTab(v as any)} className="px-4 pt-3 pb-4">
          <TabsList className="w-full h-8 mb-4">
            <TabsTrigger value="camera"  className="flex-1 text-xs gap-1.5 h-7">
              <Camera className="h-3.5 w-3.5" /> Camera
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex-1 text-xs gap-1.5 h-7">
              <Keyboard className="h-3.5 w-3.5" /> Manual / BT
            </TabsTrigger>
          </TabsList>

          <TabsContent value="camera" className="mt-0">
            {open && tab === 'camera' && (
              <CameraScanMode
                expectedCode={expectedCode}
                productName={productName}
                onSuccess={onSuccess}
                allowMismatch={allowMismatch}
                onClose={handleClose}
              />
            )}
          </TabsContent>

          <TabsContent value="manual" className="mt-0">
            {open && (
              <ManualScanMode
                expectedCode={expectedCode}
                productName={productName}
                onSuccess={onSuccess}
                allowMismatch={allowMismatch}
                onClose={handleClose}
              />
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default BarcodeScannerDialog;
