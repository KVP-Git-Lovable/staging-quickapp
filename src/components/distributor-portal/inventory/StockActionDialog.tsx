import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useWarehouses } from '@/hooks/useWarehouses';
import { Warehouse } from 'lucide-react';

interface StockActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: 'RESERVE' | 'RELEASE' | 'MARK_DAMAGED' | 'MARK_EXPIRED';
  distributorId: string;
  products: { id: string; name: string; unit?: string }[];
  onSuccess: () => void;
}

const actionLabels: Record<string, string> = {
  RESERVE: 'Reserve Stock',
  RELEASE: 'Release Reserved Stock',
  MARK_DAMAGED: 'Mark as Damaged',
  MARK_EXPIRED: 'Mark as Expired',
};

const UNIT_OPTIONS = [
  { value: 'KG', label: 'KG' },
  { value: 'grams', label: 'Grams' },
  { value: 'pieces', label: 'Pieces' },
  { value: 'liters', label: 'Liters' },
  { value: 'ml', label: 'ML' },
  { value: 'boxes', label: 'Boxes' },
  { value: 'packets', label: 'Packets' },
];

function convertToBaseUnit(quantity: number, enteredUnit: string, productUnit: string): number {
  const entered = (enteredUnit || '').toLowerCase().trim();
  const base = (productUnit || '').toLowerCase().trim();
  if (entered === base) return quantity;
  if ((entered === 'kg') && (base === 'grams' || base === 'g' || base === 'gram')) return quantity * 1000;
  if ((entered === 'grams' || entered === 'g' || entered === 'gram') && base === 'kg') return quantity / 1000;
  if ((entered === 'liters' || entered === 'l' || entered === 'liter') && (base === 'ml' || base === 'milliliter')) return quantity * 1000;
  if ((entered === 'ml' || entered === 'milliliter') && (base === 'liters' || base === 'l' || base === 'liter')) return quantity / 1000;
  return quantity;
}

function getDefaultEntryUnit(productUnit: string): string {
  const u = (productUnit || '').toLowerCase().trim();
  if (u === 'grams' || u === 'g' || u === 'gram') return 'KG';
  if (u === 'ml' || u === 'milliliter' || u === 'milliliters') return 'liters';
  if (u === 'kg' || u === 'kilogram' || u === 'kilograms') return 'KG';
  if (u === 'liters' || u === 'l' || u === 'liter' || u === 'litres') return 'liters';
  if (u === 'pieces' || u === 'piece' || u === 'pcs') return 'pieces';
  return u || 'KG';
}

const StockActionDialog = ({ open, onOpenChange, action, distributorId, products, onSuccess }: StockActionDialogProps) => {
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [entryUnit, setEntryUnit] = useState('KG');
  const { warehouses, defaultWarehouse, loading: whLoading } = useWarehouses(distributorId);

  useEffect(() => {
    if (defaultWarehouse && !selectedWarehouseId) {
      setSelectedWarehouseId(defaultWarehouse.id);
    }
  }, [defaultWarehouse, selectedWarehouseId]);

  const handleSubmit = async () => {
    if (!productId || !quantity || Number(quantity) <= 0) {
      toast.error('Please select a product and enter a valid quantity');
      return;
    }
    setSubmitting(true);
    try {
      const prod = products.find(p => p.id === productId);
      const baseQty = convertToBaseUnit(Number(quantity), entryUnit, prod?.unit || '');
      const { data, error } = await supabase.rpc('execute_stock_action', {
        p_distributor_id: distributorId,
        p_product_id: productId,
        p_action: action,
        p_quantity: Math.round(baseQty),
        p_notes: notes || null,
        p_created_by: null,
        p_warehouse_id: selectedWarehouseId || null,
      });

      if (error) throw error;

      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (result?.success) {
        toast.success(`${actionLabels[action]} completed successfully`);
        onSuccess();
        onOpenChange(false);
        setProductId('');
        setQuantity('');
        setNotes('');
      } else {
        toast.error(result?.error || 'Action failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to execute action');
    } finally {
      setSubmitting(false);
    }
  };

  const noWarehouses = !whLoading && warehouses.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{actionLabels[action]}</DialogTitle>
        </DialogHeader>
        {noWarehouses ? (
          <div className="py-8 text-center space-y-2">
            <Warehouse className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium text-foreground">No Warehouses Available</p>
            <p className="text-xs text-muted-foreground">Please create a warehouse before performing stock actions.</p>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div>
                <Label className="flex items-center gap-1"><Warehouse className="w-3.5 h-3.5" /> Warehouse <span className="text-destructive">*</span></Label>
                <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                  <SelectTrigger><SelectValue placeholder={whLoading ? 'Loading...' : 'Select warehouse'} /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.name} {w.is_default ? '(Default)' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Product</Label>
                <Select value={productId} onValueChange={(v) => {
                  setProductId(v);
                  const prod = products.find(p => p.id === v);
                  setEntryUnit(getDefaultEntryUnit(prod?.unit || ''));
                }}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label>Quantity ({entryUnit})</Label>
                  <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Enter quantity" />
                </div>
                <div className="w-[120px]">
                  <Label className="text-xs">Unit</Label>
                  <Select value={entryUnit} onValueChange={setEntryUnit}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNIT_OPTIONS.map(u => (
                        <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add notes..." rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting || !selectedWarehouseId}>
                {submitting ? 'Processing...' : 'Confirm'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StockActionDialog;
