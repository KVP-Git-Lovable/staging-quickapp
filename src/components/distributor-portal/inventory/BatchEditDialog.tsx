import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';

interface BatchEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batch: {
    id: string;
    batch_no: string;
    expiry_date: string | null;
    system_batch_code?: string | null;
    supplier_batch_code?: string | null;
    mfg_date?: string | null;
  };
  onSuccess: () => void;
}

const BatchEditDialog = ({ open, onOpenChange, batch, onSuccess }: BatchEditDialogProps) => {
  const [supplierBatch, setSupplierBatch] = useState(batch.supplier_batch_code || '');
  const [mfgDate, setMfgDate] = useState(batch.mfg_date || '');
  const [expiryDate, setExpiryDate] = useState(batch.expiry_date || '');
  const [saving, setSaving] = useState(false);

  const systemCode = batch.system_batch_code || batch.batch_no;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('inventory_batches')
        .update({
          supplier_batch_code: supplierBatch.trim() || null,
          mfg_date: mfgDate || null,
          expiry_date: expiryDate || null,
        })
        .eq('id', batch.id);
      if (error) throw error;
      toast.success('Batch updated');
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update batch');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-base">Edit Batch</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-primary" /> System Batch Code (read-only)
            </Label>
            <Input value={systemCode} readOnly className="font-mono text-sm bg-muted" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Supplier Batch No (optional)</Label>
            <Input
              value={supplierBatch}
              onChange={e => setSupplierBatch(e.target.value)}
              placeholder="e.g. SUP-A123"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Mfg Date</Label>
              <Input type="date" value={mfgDate} onChange={e => setMfgDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Expiry Date</Label>
              <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BatchEditDialog;
