import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { downloadExcel } from '@/utils/fileDownloader';

const COLUMNS = [
  'product_sku',
  'product_name',
  'variant_sku',
  'variant_name',
  'uom_code',
  'min_quantity',
  'list_price',
  'discount_percent',
  'final_price',
] as const;

interface ImportError {
  row?: number;
  sku?: string;
  reason?: string;
}

interface ImportResult {
  ok?: boolean;
  rows?: number;
  inserted?: number;
  updated?: number;
  failed?: number;
  errors?: ImportError[];
}

interface Props {
  priceBookId: string;
  bookName: string;
  currency: string;
  onImported: () => void;
}

const num = (v: any): number | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

const str = (v: any): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

export const PriceBookExcelActions = ({ priceBookId, bookName, currency, onImported }: Props) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleExport = async () => {
    setBusy(true);
    const tid = toast.loading('Preparing export...');
    try {
      const { data, error } = await supabase.rpc('export_price_book_entries', {
        p_price_book_id: priceBookId,
      });
      if (error) throw error;

      const rows = ((data as any[]) || []).map((r) => {
        const out: Record<string, any> = {};
        COLUMNS.forEach((c) => { out[c] = (r as any)[c] ?? ''; });
        return out;
      });

      const note = `Enter prices in ${currency}. These are local prices, not converted from the base currency.`;
      const ws = XLSX.utils.aoa_to_sheet([[note], []]);
      XLSX.utils.sheet_add_json(ws, rows, {
        header: COLUMNS as unknown as string[],
        origin: 'A3',
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Price Book');

      await downloadExcel(wb, `${bookName} - ${currency} price book.xlsx`, XLSX);
      toast.success(`Exported ${rows.length} rows`, { id: tid });
    } catch (e: any) {
      console.error('Price book export failed:', e);
      toast.error(`Export failed: ${e?.message ?? 'unknown error'}`, { id: tid });
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    const tid = toast.loading('Importing price book...');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });

      // Find the header row (the export writes a note line above it).
      const headerIdx = matrix.findIndex((r) =>
        r.some((c) => String(c).trim().toLowerCase() === 'product_sku'),
      );
      if (headerIdx < 0) throw new Error('Could not find a "product_sku" header row in the sheet');

      const headers = matrix[headerIdx].map((h) => String(h).trim().toLowerCase());
      const rows = matrix.slice(headerIdx + 1).map((r) => {
        const o: Record<string, any> = {};
        headers.forEach((h, i) => { o[h] = r[i]; });
        return {
          product_sku: str(o.product_sku),
          variant_sku: str(o.variant_sku),
          uom_code: str(o.uom_code),
          min_quantity: num(o.min_quantity),
          list_price: num(o.list_price),
          discount_percent: num(o.discount_percent),
          final_price: num(o.final_price),
        };
      }).filter((r) => r.product_sku);

      if (rows.length === 0) throw new Error('No data rows found');

      const { data, error } = await supabase.rpc('import_price_book_entries', {
        p_price_book_id: priceBookId,
        p_rows: rows as any,
      });
      if (error) throw error;

      const res = (data || {}) as ImportResult;
      setResult(res);

      const failed = res.failed ?? 0;
      const summary = `${res.inserted ?? 0} inserted, ${res.updated ?? 0} updated, ${failed} failed`;
      if (failed > 0) toast.error(`Import completed with errors — ${summary}`, { id: tid });
      else toast.success(`Import complete — ${summary}`, { id: tid });

      onImported();
    } catch (e: any) {
      console.error('Price book import failed:', e);
      toast.error(`Import failed: ${e?.message ?? 'unknown error'}`, { id: tid });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const failedCount = result?.failed ?? 0;

  return (
    <>
      <Button variant="outline" onClick={handleExport} disabled={busy}>
        <Download className="h-4 w-4 mr-2" />
        Export to Excel
      </Button>
      <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
        <Upload className="h-4 w-4 mr-2" />
        Import from Excel
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {failedCount > 0 ? 'Import completed with errors' : 'Import complete'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            {result?.inserted ?? 0} inserted, {result?.updated ?? 0} updated, {failedCount} failed
            {typeof result?.rows === 'number' && ` (of ${result.rows} rows read)`}
          </p>
          {failedCount > 0 && (
            <div className="rounded-md border divide-y text-sm">
              {(result?.errors || []).map((err, i) => (
                <div key={i} className="p-2">
                  <span className="font-medium">Row {err.row ?? '?'}</span>
                  {err.sku && <span className="text-muted-foreground"> · {err.sku}</span>}
                  <div className="text-destructive">{err.reason || 'Unknown error'}</div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PriceBookExcelActions;
