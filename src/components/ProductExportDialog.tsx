import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Download, Info } from 'lucide-react';
import {
  exportProductsMaster,
  EXPORT_ALL_COLUMNS,
  EXPORT_MANDATORY_COLUMNS,
} from '@/utils/exportProductsMaster';

type Group = { label: string; cols: string[] };

const GROUPS: Group[] = [
  { label: 'Identity', cols: ['sku', 'parent_sku', 'variant_name', 'name', 'description', 'brand', 'category', 'product_type'] },
  { label: 'Tax', cols: ['gst_percentage', 'hsn_code', 'tax_master'] },
  { label: 'Price', cols: ['rate'] },
  { label: 'Units', cols: ['base_unit', 'price_basis_unit', 'default_sales_unit', 'unit_1', 'unit_1_factor', 'unit_2', 'unit_2_factor', 'unit_3', 'unit_3_factor'] },
  { label: 'Stock', cols: ['opening_stock', 'reorder_level'] },
  { label: 'Physical', cols: ['net_weight_g', 'net_volume_ml'] },
  { label: 'Image', cols: ['image_file'] },
  { label: 'Status', cols: ['is_active', 'is_discontinued'] },
];

const MANDATORY = new Set<string>(EXPORT_MANDATORY_COLUMNS);

export const ProductExportDialog: React.FC<{ trigger: React.ReactNode }> = ({ trigger }) => {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(EXPORT_ALL_COLUMNS));
  const [busy, setBusy] = useState(false);

  const toggle = (col: string, on: boolean) => {
    if (MANDATORY.has(col)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(col); else next.delete(col);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(EXPORT_ALL_COLUMNS));
  const onlyMandatory = () => setSelected(new Set(MANDATORY));

  const orderedSelection = useMemo(
    () => EXPORT_ALL_COLUMNS.filter((c) => selected.has(c) || MANDATORY.has(c)),
    [selected],
  );

  const handleExport = async () => {
    setBusy(true);
    const tid = toast.loading('Exporting products...');
    try {
      await exportProductsMaster(orderedSelection);
      toast.success('Product master exported', { id: tid });
      setOpen(false);
    } catch (e: any) {
      console.error(e);
      toast.error(`Export failed: ${e?.message ?? 'unknown'}`, { id: tid });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export Products</DialogTitle>
          <DialogDescription>Choose the columns to include in the XLSX file.</DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Mandatory columns are always included so the file can be re-imported. Unchecking optional columns only affects this download.
          </span>
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={selectAll}>Select all</Button>
          <Button type="button" variant="outline" size="sm" onClick={onlyMandatory}>Only mandatory</Button>
          <div className="ml-auto text-xs text-muted-foreground self-center">
            {orderedSelection.length} / {EXPORT_ALL_COLUMNS.length} columns
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {GROUPS.map((g) => (
            <div key={g.label} className="border rounded-md p-3">
              <div className="text-sm font-semibold mb-2">{g.label}</div>
              <div className="space-y-2">
                {g.cols.map((col) => {
                  const mandatory = MANDATORY.has(col);
                  const checked = mandatory || selected.has(col);
                  return (
                    <label key={col} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={checked}
                        disabled={mandatory}
                        onCheckedChange={(v) => toggle(col, Boolean(v))}
                      />
                      <span className={mandatory ? 'font-medium' : ''}>
                        {col}{mandatory && <span className="text-destructive ml-0.5">*</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleExport} disabled={busy}>
            <Download className="h-4 w-4 mr-2" />
            Export {orderedSelection.length} columns
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProductExportDialog;
