/**
 * Bulk Import dialog: Template / Import / Images tabs.
 *
 * Drop-in replacement for the legacy "Import Product Data" CSV button.
 * Uses Phase 3 validators + atomic-per-row upsert.
 */
import React, { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Download, FileUp, Image as ImageIcon, Loader2, Upload, FileSpreadsheet } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { downloadProductImportTemplate } from '@/utils/productImportTemplate';
import {
  parseImportFile,
  loadValidationContext,
  validateImportRows,
  executeImport,
  buildErrorReportBlob,
  getPendingCategoryNames,
  createPendingCategories,
  type ValidatedRow,
  type ImportResult,
} from '@/utils/productImportRunner';
import { uploadProductImagesBySku, type ImageUploadOutcome } from '@/utils/productImageBatchUpload';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';


interface Props {
  trigger: React.ReactNode;
  onImported?: () => void;
}

export function ProductBulkImportDialog({ trigger, onImported }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'template' | 'data' | 'images'>('template');

  // Data import state
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState<ValidatedRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  // Image upload state
  const [uploading, setUploading] = useState(false);
  const [outcomes, setOutcomes] = useState<ImageUploadOutcome[] | null>(null);
  const [imgProgress, setImgProgress] = useState({ done: 0, total: 0 });
  const imgRef = useRef<HTMLInputElement>(null);

  // New-categories confirmation state
  const [pendingCategories, setPendingCategories] = useState<string[]>([]);
  const [showCategoryConfirm, setShowCategoryConfirm] = useState(false);

  const reset = () => {
    setValidated(null);
    setResult(null);
    setOutcomes(null);
    setProgress({ done: 0, total: 0 });
    setImgProgress({ done: 0, total: 0 });
    setPendingCategories([]);
    setShowCategoryConfirm(false);
  };


  const handleFile = async (file?: File) => {
    if (!file) return;
    setValidating(true);
    setValidated(null);
    setResult(null);
    try {
      const { rows, unknownHeaders } = await parseImportFile(file);
      if (unknownHeaders.length) {
        toast.warning(`Ignored unknown columns: ${unknownHeaders.join(', ')}`);
      }
      const ctx = await loadValidationContext();
      const v = validateImportRows(rows, ctx);
      setValidated(v);
      (window as any).__importCtx = ctx; // stash for execute step
      const okCount = v.filter((r) => r.ok).length;
      toast.success(`Validated ${v.length} rows — ${okCount} OK, ${v.length - okCount} with errors`);
    } catch (e: any) {
      console.error(e);
      toast.error(`Parse failed: ${e?.message ?? 'unknown'}`);
    } finally {
      setValidating(false);
    }
  };

  const runImport = async () => {
    if (!validated) return;
    const newCats = getPendingCategoryNames(validated);
    if (newCats.length > 0) {
      setPendingCategories(newCats);
      setShowCategoryConfirm(true);
      return;
    }
    await executeImportNow();
  };

  const executeImportNow = async () => {
    if (!validated) return;
    const ctx = (window as any).__importCtx;
    if (!ctx) { toast.error('Validation context missing — re-upload the file'); return; }
    setImporting(true);
    setProgress({ done: 0, total: validated.length });
    try {
      if (pendingCategories.length > 0) {
        const { created, failed } = await createPendingCategories(pendingCategories, ctx);
        if (failed.length > 0) {
          toast.error(`Failed to create ${failed.length} categories: ${failed.map((f) => f.name).join(', ')}`);
        }
        if (created > 0) toast.success(`Created ${created} new categor${created === 1 ? 'y' : 'ies'}`);
      }
      const res = await executeImport(validated, ctx, (done, total) => setProgress({ done, total }));
      setResult(res);
      toast.success(
        `Import complete: ${res.inserted + res.updated} products, ${res.variantsInserted + res.variantsUpdated} variants; ${res.skipped + res.failed + res.variantsSkipped + res.variantsFailed} skipped`,
      );
      onImported?.();
    } catch (e: any) {
      console.error(e);
      toast.error(`Import failed: ${e?.message ?? 'unknown'}`);
    } finally {
      setImporting(false);
      setPendingCategories([]);
    }
  };


  const downloadErrors = () => {
    if (!result || result.errorRows.length === 0) return;
    const blob = buildErrorReportBlob(result.errorRows);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product_import_errors_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImages = async (files?: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setOutcomes(null);
    setImgProgress({ done: 0, total: files.length });
    try {
      const arr = Array.from(files);
      const res = await uploadProductImagesBySku(arr, (done, total) => setImgProgress({ done, total }));
      setOutcomes(res);
      const updated = res.filter((r) => r.status === 'updated').length;
      const unmatched = res.filter((r) => r.status === 'unmatched').length;
      const failed = res.filter((r) => r.status === 'failed').length;
      toast.success(`Images: ${updated} updated, ${unmatched} unmatched, ${failed} failed`);
      if (updated > 0) onImported?.();
    } catch (e: any) {
      console.error(e);
      toast.error(`Image upload failed: ${e?.message ?? 'unknown'}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Bulk Import</DialogTitle>
          <DialogDescription>
            Download the template, fill it in, validate, then import. Upload product images by SKU on the third tab.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="template"><FileSpreadsheet className="h-4 w-4 mr-2" />Template</TabsTrigger>
            <TabsTrigger value="data"><FileUp className="h-4 w-4 mr-2" />Import data</TabsTrigger>
            <TabsTrigger value="images"><ImageIcon className="h-4 w-4 mr-2" />Images by SKU</TabsTrigger>
          </TabsList>

          <TabsContent value="template" className="space-y-3 py-3">
            <p className="text-sm text-muted-foreground">
              Downloads a blank .xlsx with mandatory columns marked (e.g. <code>sku*</code>, <code>rate*</code>),
              a sample row for a piece product and a weight product, and a Legend sheet documenting each column
              and the two-tier UOM rule (dimensional factors inherited from the unit master; pack factors entered here).
            </p>
            <Button
              onClick={async () => {
                try { await downloadProductImportTemplate(); toast.success('Template downloaded'); }
                catch (e: any) { toast.error(`Download failed: ${e?.message ?? 'unknown'}`); }
              }}
            >
              <Download className="h-4 w-4 mr-2" /> Download template
            </Button>
          </TabsContent>

          <TabsContent value="data" className="space-y-3 py-3">
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={validating || importing}>
                {validating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileUp className="h-4 w-4 mr-2" />}
                Choose file (.xlsx / .csv)
              </Button>
              {validated && (
                <>
                  <Badge variant="secondary">{validated.length} rows</Badge>
                  <Badge variant="outline">
                    {validated.filter((r) => r.kind === 'product').length} products
                  </Badge>
                  <Badge variant="outline">
                    {validated.filter((r) => r.kind === 'variant').length} variants
                  </Badge>
                  <Badge className="bg-emerald-600">{validated.filter((r) => r.ok).length} OK</Badge>
                  <Badge variant="destructive">{validated.filter((r) => !r.ok).length} with errors</Badge>
                  <Button onClick={runImport} disabled={importing || validated.every((r) => !r.ok)}>
                    {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    Import valid rows
                  </Button>
                </>
              )}
            </div>

            {importing && (
              <div className="space-y-1">
                <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
                <p className="text-xs text-muted-foreground">
                  Importing… {progress.done}/{progress.total}
                </p>
              </div>
            )}

            {result && (
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Products:</span>
                  <Badge className="bg-emerald-600">Inserted: {result.inserted}</Badge>
                  <Badge className="bg-blue-600">Updated: {result.updated}</Badge>
                  <Badge variant="secondary">Skipped: {result.skipped}</Badge>
                  <Badge variant="destructive">Failed: {result.failed}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Variants:</span>
                  <Badge className="bg-emerald-600">Inserted: {result.variantsInserted}</Badge>
                  <Badge className="bg-blue-600">Updated: {result.variantsUpdated}</Badge>
                  <Badge variant="secondary">Skipped: {result.variantsSkipped}</Badge>
                  <Badge variant="destructive">Failed: {result.variantsFailed}</Badge>
                  {result.errorRows.length > 0 && (
                    <Button size="sm" variant="outline" onClick={downloadErrors}>
                      <Download className="h-4 w-4 mr-2" />Download error report
                    </Button>
                  )}
                </div>
              </div>
            )}

            {validated && (
              <ScrollArea className="h-[40vh] border rounded">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Row</TableHead>
                      <TableHead className="w-32">SKU</TableHead>
                      <TableHead className="w-24">Kind</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                      <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validated.map((r) => (
                      <TableRow key={r.rowNumber} className={r.ok ? '' : 'bg-destructive/5'}>
                        <TableCell>{r.rowNumber}</TableCell>
                        <TableCell className="font-mono text-xs">{r.sku || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {r.kind === 'variant' ? 'Variant' : 'Product'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {r.ok
                            ? <Badge className="bg-emerald-600">OK</Badge>
                            : <Badge variant="destructive">Invalid</Badge>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {[...r.errors, ...r.warnings].join(' · ') || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="images" className="space-y-3 py-3">
            <p className="text-sm text-muted-foreground">
              Filename (minus extension) is matched to the product SKU (case-insensitive). Images are
              auto-optimized (WebP, max 1280px, ~200 KB) before upload.
            </p>
            <input
              ref={imgRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => handleImages(e.target.files)}
            />
            <Button variant="outline" onClick={() => imgRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ImageIcon className="h-4 w-4 mr-2" />}
              Choose images
            </Button>
            {uploading && (
              <p className="text-xs text-muted-foreground">
                Uploading… {imgProgress.done}/{imgProgress.total}
              </p>
            )}
            {outcomes && (
              <ScrollArea className="h-[40vh] border rounded">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead className="w-32">SKU</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                      <TableHead className="w-24">Size</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outcomes.map((o, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{o.file}</TableCell>
                        <TableCell className="font-mono text-xs">{o.sku}</TableCell>
                        <TableCell>
                          {o.status === 'updated' && <Badge className="bg-emerald-600">Updated</Badge>}
                          {o.status === 'unmatched' && <Badge variant="secondary">No SKU match</Badge>}
                          {o.status === 'failed' && <Badge variant="destructive">Failed</Badge>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {o.optimizedBytes ? `${Math.round(o.optimizedBytes / 1024)} KB` : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{o.error ?? ''}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>

      <AlertDialog open={showCategoryConfirm} onOpenChange={setShowCategoryConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Create {pendingCategories.length} new categor{pendingCategories.length === 1 ? 'y' : 'ies'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The following categor{pendingCategories.length === 1 ? 'y was' : 'ies were'} not found and will be
              created before importing products. Cancel if any are typos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ScrollArea className="max-h-60 border rounded p-3">
            <ul className="text-sm space-y-1">
              {pendingCategories.map((name) => (
                <li key={name} className="font-mono">• {name}</li>
              ))}
            </ul>
          </ScrollArea>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingCategories([])}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowCategoryConfirm(false); executeImportNow(); }}>
              Create & import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

