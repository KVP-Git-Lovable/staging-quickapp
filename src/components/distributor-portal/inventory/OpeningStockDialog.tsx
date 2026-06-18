import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, Upload, Info, Plus, Trash2, Search, ScanBarcode, ChevronDown, ChevronRight, Warehouse, Sparkles, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useWarehouses } from '@/hooks/useWarehouses';

interface Product {
  id: string;
  name: string;
  unit?: string;
}

interface OpeningStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  distributorId: string;
  products: Product[];
  onSuccess: () => void;
}

interface BatchEntry {
  supplier_batch_code: string;
  mfg_date: string;
  expiry_date: string;
  quantity: number;
}

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

interface ProductEntry {
  product_id: string;
  product_name: string;
  batches: BatchEntry[];
  expanded: boolean;
  existingBatchCount: number;
  entryUnit: string;
  selected: boolean;
}

const newBatch = (): BatchEntry => ({ supplier_batch_code: '', mfg_date: '', expiry_date: '', quantity: 0 });

const OpeningStockDialog = ({ open, onOpenChange, distributorId, products, onSuccess }: OpeningStockDialogProps) => {
  const [date, setDate] = useState<Date>(new Date());
  const [entries, setEntries] = useState<ProductEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [bulkMfg, setBulkMfg] = useState('');
  const [bulkExpiry, setBulkExpiry] = useState('');
  const [bulkQty, setBulkQty] = useState<string>('');
  const [bulkExpanded, setBulkExpanded] = useState(true);
  const { warehouses, defaultWarehouse, loading: whLoading, reload: reloadWarehouses } = useWarehouses(distributorId);
  const fileRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (defaultWarehouse && !selectedWarehouseId) {
      setSelectedWarehouseId(defaultWarehouse.id);
    }
  }, [defaultWarehouse, selectedWarehouseId]);

  // Reload warehouses every time the dialog opens so newly-created
  // warehouses appear without needing a page refresh.
  useEffect(() => {
    if (open && distributorId) {
      reloadWarehouses();
    }
  }, [open, distributorId, reloadWarehouses]);

  useEffect(() => {
    if (open && products.length > 0) {
      const initial: ProductEntry[] = products.map(p => ({
        product_id: p.id,
        product_name: p.name,
        batches: [newBatch()],
        expanded: false,
        existingBatchCount: 0,
        entryUnit: getDefaultEntryUnit(p.unit || ''),
        selected: false,
      }));
      setEntries(initial);
      loadExistingBatchCounts(initial, selectedWarehouseId);
    }
  }, [products, open]);

  useEffect(() => {
    if (open && selectedWarehouseId && entries.length > 0) {
      loadExistingBatchCounts(entries, selectedWarehouseId);
    }
  }, [selectedWarehouseId]);

  const loadExistingBatchCounts = async (productEntries: ProductEntry[], warehouseId?: string) => {
    if (!warehouseId) return;
    try {
      const productIds = productEntries.map(e => e.product_id);
      const { data, error } = await supabase
        .from('inventory_batches')
        .select('product_id')
        .eq('distributor_id', distributorId)
        .eq('warehouse_id', warehouseId)
        .in('product_id', productIds);
      if (error) return;
      const counts = new Map<string, number>();
      (data || []).forEach((row: any) => {
        counts.set(row.product_id, (counts.get(row.product_id) || 0) + 1);
      });
      setEntries(prev => prev.map(e => ({ ...e, existingBatchCount: counts.get(e.product_id) || 0 })));
    } catch {
      // non-blocking
    }
  };

  const toggleExpand = (productId: string) => {
    setEntries(prev => prev.map(e => e.product_id === productId ? { ...e, expanded: !e.expanded } : e));
  };

  const addBatch = (productId: string) => {
    setEntries(prev => prev.map(e =>
      e.product_id === productId ? { ...e, batches: [...e.batches, newBatch()] } : e
    ));
  };

  const removeBatch = (productId: string, batchIndex: number) => {
    setEntries(prev => prev.map(e =>
      e.product_id === productId
        ? { ...e, batches: e.batches.filter((_, i) => i !== batchIndex) }
        : e
    ));
  };

  const updateBatch = (productId: string, batchIndex: number, field: keyof BatchEntry, value: string | number) => {
    setEntries(prev => prev.map(e =>
      e.product_id === productId
        ? { ...e, batches: e.batches.map((b, i) => i === batchIndex ? { ...b, [field]: value } : b) }
        : e
    ));
  };

  const handleScanInput = () => {
    if (!scanInput.trim()) return;
    const search = scanInput.trim().toLowerCase();
    const match = products.find(p => p.name.toLowerCase().includes(search));
    if (match) {
      setEntries(prev => prev.map(e =>
        e.product_id === match.id
          ? {
            ...e,
            expanded: true,
            batches: e.batches[0]?.quantity === 0 && e.batches.length === 1
              ? [{ ...e.batches[0], quantity: e.batches[0].quantity + 1 }]
              : e.batches,
          }
          : e
      ));
      toast.success(`Found: ${match.name}`);
    } else {
      toast.error('Product not found. Check the name/SKU.');
    }
    setScanInput('');
    scanRef.current?.focus();
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').slice(1);
      const updated = [...entries];
      lines.forEach(line => {
        const parts = line.split(',').map(s => s.trim());
        if (parts.length >= 2) {
          const name = parts[0];
          const qty = parseInt(parts[1], 10);
          const supplierBatch = parts[2] || '';
          const expiryDate = parts[3] || '';
          if (!isNaN(qty)) {
            const match = updated.find(e => e.product_name.toLowerCase() === name.toLowerCase());
            if (match) {
              match.batches = [{ supplier_batch_code: supplierBatch, mfg_date: '', expiry_date: expiryDate, quantity: qty }];
              match.expanded = true;
            }
          }
        }
      });
      setEntries(updated);
      toast.success('CSV data loaded');
    };
    reader.readAsText(file);
  };

  const getTotalQty = (entry: ProductEntry) => entry.batches.reduce((sum, b) => sum + (b.quantity || 0), 0);

  const toggleSelect = (productId: string) => {
    setEntries(prev => prev.map(e => e.product_id === productId ? { ...e, selected: !e.selected } : e));
  };

  const selectedCount = entries.filter(e => e.selected).length;

  const applyBulk = (scope: 'selected' | 'all') => {
    const qtyNum = bulkQty === '' ? null : parseFloat(bulkQty);
    if (!bulkMfg && !bulkExpiry && (qtyNum === null || isNaN(qtyNum))) {
      toast.error('Enter at least one of Mfg Date, Expiry Date or Quantity');
      return;
    }
    if (scope === 'selected' && selectedCount === 0) {
      toast.error('Select at least one product');
      return;
    }
    setEntries(prev => prev.map(e => {
      const target = scope === 'all' ? true : e.selected;
      if (!target) return e;
      const first = e.batches[0] ?? newBatch();
      const updatedFirst: BatchEntry = {
        ...first,
        mfg_date: bulkMfg || first.mfg_date,
        expiry_date: bulkExpiry || first.expiry_date,
        quantity: qtyNum !== null && !isNaN(qtyNum) ? qtyNum : first.quantity,
      };
      return {
        ...e,
        expanded: true,
        batches: [updatedFirst, ...e.batches.slice(1)],
      };
    }));
    const affected = scope === 'all' ? entries.length : selectedCount;
    toast.success(`Applied to ${affected} product${affected === 1 ? '' : 's'}`);
  };

  const clearBulk = () => {
    setBulkMfg('');
    setBulkExpiry('');
    setBulkQty('');
    setEntries(prev => prev.map(e => ({ ...e, selected: false })));
  };


  const handleConfirm = async () => {
    if (!selectedWarehouseId) {
      toast.error('Please select a warehouse');
      return;
    }
    const toSubmit = entries.filter(e => getTotalQty(e) > 0);
    if (toSubmit.length === 0) {
      toast.error('Please enter at least one product quantity');
      return;
    }
    setSubmitting(true);
    try {
      let errors = 0;
      let successCount = 0;
      const errorMessages: string[] = [];
      for (const entry of toSubmit) {
        for (const batch of entry.batches) {
          if (batch.quantity <= 0) continue;
          const prod = products.find(p => p.id === entry.product_id);
          const baseQty = convertToBaseUnit(batch.quantity, entry.entryUnit, prod?.unit || '');
          const { data, error } = await supabase.rpc('execute_stock_action', {
            p_distributor_id: distributorId,
            p_product_id: entry.product_id,
            p_action: 'OPENING_STOCK',
            p_quantity: Math.round(baseQty),
            p_notes: entry.product_name,
            p_created_by: null,
            p_batch_no: null, // auto-generate system batch code
            p_expiry_date: batch.expiry_date || null,
            p_reference_id: null,
            p_reference_number: null,
            p_warehouse_id: selectedWarehouseId || null,
            p_supplier_batch_code: batch.supplier_batch_code?.trim() || null,
            p_mfg_date: batch.mfg_date || null,
          } as any);
          if (error) {
            console.error('Opening stock RPC error:', entry.product_name, error);
            errors++;
            const msg = error.message || 'Unknown database error';
            errorMessages.push(`${entry.product_name}: ${msg}`);
            toast.error(`${entry.product_name}: ${msg}`);
            continue;
          }
          const result = typeof data === 'string' ? JSON.parse(data) : data;
          if (!result?.success) {
            errors++;
            const msg = result?.error || 'Unknown error';
            errorMessages.push(`${entry.product_name}: ${msg}`);
            toast.error(`${entry.product_name}: ${msg}`);
          } else {
            successCount++;
          }
        }
      }
      if (errors > 0 && successCount > 0) {
        toast.warning(`${successCount} batch(es) added, ${errors} failed`);
      } else if (errors > 0) {
        const detail = errorMessages[0] ? ` — ${errorMessages[0]}` : '';
        toast.error(`Failed to add opening stock${detail}`);
      } else {
        toast.success(`Opening stock added: ${successCount} batch(es) across ${toSubmit.length} product(s)`);
      }
      onSuccess();
      if (errors === 0) onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to add opening stock');
    } finally {
      setSubmitting(false);
    }
  };

  const productsWithQty = entries.filter(e => getTotalQty(e) > 0).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Opening Stock Management</DialogTitle>
          <DialogDescription>
            <div className="flex items-start gap-2 mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700">
                Each batch gets an auto-generated <strong>System Batch Code</strong> (e.g. <code className="font-mono">WH-05-260421-RICE-001</code>).
                Optionally enter a <strong>Supplier Batch Number</strong> for traceability. Add as many batches per product as needed.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Scan Input */}
          <div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  ref={scanRef}
                  placeholder="Scan barcode or type product name..."
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleScanInput()}
                  className="pl-9 h-10"
                />
              </div>
              <Button variant="outline" size="sm" onClick={handleScanInput}>
                <Search className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-1">
              Type a product name or scan a barcode to quickly find a product below.
            </p>
          </div>

          {/* Warehouse + Date + CSV row */}
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <Label className="text-xs flex items-center gap-1"><Warehouse className="w-3 h-3" /> Warehouse</Label>
              <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                <SelectTrigger className="w-[220px] h-9 text-sm">
                  <SelectValue placeholder={whLoading ? 'Loading...' : 'Select warehouse'} />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} {w.is_default ? '(Default)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Opening Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal h-9 text-sm", !date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {format(date, 'PPP')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex-1" />
            <div>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="w-4 h-4 mr-1" /> Upload CSV
              </Button>
            </div>
          </div>

          {/* Bulk Apply Panel */}
          <Collapsible open={bulkExpanded} onOpenChange={setBulkExpanded}>
            <div className="border border-primary/30 bg-primary/5 rounded-lg overflow-hidden">
              <CollapsibleTrigger asChild>
                <div className="flex items-start justify-between p-3 cursor-pointer hover:bg-primary/10">
                  <div className="flex items-start gap-2">
                    <Layers className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-primary">Bulk Apply to Products</h4>
                      <p className="text-xs text-muted-foreground">Apply the details below to selected products or all products.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Selected: {selectedCount} product{selectedCount === 1 ? '' : 's'}</span>
                    {bulkExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-3 pt-0 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Mfg Date</Label>
                      <Input type="date" value={bulkMfg} onChange={(e) => setBulkMfg(e.target.value)} className="h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">Expiry Date</Label>
                      <Input type="date" value={bulkExpiry} onChange={(e) => setBulkExpiry(e.target.value)} className="h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">Quantity</Label>
                      <Input type="number" min={0} placeholder="e.g. 50" value={bulkQty} onChange={(e) => setBulkQty(e.target.value)} className="h-9 text-sm" />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={clearBulk}>Clear</Button>
                    <Button size="sm" onClick={() => applyBulk('selected')} disabled={selectedCount === 0}>
                      Apply to Selected
                    </Button>
                    <Button size="sm" onClick={() => applyBulk('all')}>
                      Apply to All Products
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* Product entries */}
          <div className="space-y-1 border rounded-lg overflow-hidden">
            {entries.map((entry) => {
              const totalQty = getTotalQty(entry);

              return (
                <Collapsible
                  key={entry.product_id}
                  open={entry.expanded}
                  onOpenChange={() => toggleExpand(entry.product_id)}
                >
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 border-b">
                      <div className="flex items-center gap-2">
                        <div onClick={(e) => e.stopPropagation()} className="flex items-center">
                          <Checkbox checked={entry.selected} onCheckedChange={() => toggleSelect(entry.product_id)} />
                        </div>
                        {entry.expanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className="text-sm font-medium">{entry.product_name}</span>
                        {(() => {
                          const prod = products.find(p => p.id === entry.product_id);
                          const unitLabel = prod?.unit || '';
                          return unitLabel ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground">{unitLabel}</Badge>
                          ) : null;
                        })()}
                        {entry.existingBatchCount > 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                            {entry.existingBatchCount} existing batch{entry.existingBatchCount > 1 ? 'es' : ''}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {totalQty > 0 && (
                          <Badge className="bg-primary/10 text-primary text-xs">
                            Total: {totalQty} {entry.entryUnit}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {entry.batches.length} new batch(es)
                        </span>
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="p-3 bg-muted/20 space-y-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Label className="text-xs text-muted-foreground">Entry Unit:</Label>
                        <Select
                          value={entry.entryUnit}
                          onValueChange={(v) => setEntries(prev => prev.map(e =>
                            e.product_id === entry.product_id ? { ...e, entryUnit: v } : e
                          ))}
                        >
                          <SelectTrigger className="w-[120px] h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {UNIT_OPTIONS.map(u => (
                              <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {entry.batches.map((batch, bIdx) => (
                        <div key={bIdx} className="border rounded-md p-2 bg-background space-y-2">
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Sparkles className="w-3 h-3 text-primary" />
                            <span>System Batch Code: <span className="font-mono italic">auto-generated on save</span></span>
                          </div>
                          <div className="flex items-end gap-2 flex-wrap">
                            <div className="flex-1 min-w-[140px]">
                              <Label className="text-xs">Supplier Batch No (optional)</Label>
                              <Input
                                placeholder="e.g. SUP-A123"
                                value={batch.supplier_batch_code}
                                onChange={(e) => updateBatch(entry.product_id, bIdx, 'supplier_batch_code', e.target.value)}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="w-[140px]">
                              <Label className="text-xs">Mfg Date (optional)</Label>
                              <Input
                                type="date"
                                value={batch.mfg_date}
                                onChange={(e) => updateBatch(entry.product_id, bIdx, 'mfg_date', e.target.value)}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="w-[140px]">
                              <Label className="text-xs">Expiry Date</Label>
                              <Input
                                type="date"
                                value={batch.expiry_date}
                                onChange={(e) => updateBatch(entry.product_id, bIdx, 'expiry_date', e.target.value)}
                                className="h-8 text-sm"
                              />
                              {(() => {
                                if (!batch.expiry_date) return null;
                                const today = new Date(); today.setHours(0,0,0,0);
                                const exp = new Date(batch.expiry_date + 'T00:00:00');
                                const days = Math.floor((exp.getTime() - today.getTime()) / 86400000);
                                if (days < 0) {
                                  return <p className="text-[10px] text-destructive mt-0.5">⚠ Already expired — won't allocate</p>;
                                }
                                if (days <= 7) {
                                  return <p className="text-[10px] text-amber-600 mt-0.5">⚠ Near-expiry ({days}d) — may not allocate</p>;
                                }
                                return null;
                              })()}
                            </div>
                            <div className="w-28">
                              <Label className="text-xs">Quantity ({entry.entryUnit})</Label>
                              <Input
                                type="number"
                                min={0}
                                value={batch.quantity || ''}
                                onChange={(e) => updateBatch(entry.product_id, bIdx, 'quantity', parseFloat(e.target.value) || 0)}
                                className="h-8 text-sm"
                              />
                            </div>
                            {entry.batches.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => removeBatch(entry.product_id, bIdx)}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => addBatch(entry.product_id)}
                      >
                        <Plus className="w-3 h-3 mr-1" /> Add Batch
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={submitting || !selectedWarehouseId}>
            {submitting ? 'Processing...' : `Confirm Opening Stock (${productsWithQty} product${productsWithQty === 1 ? '' : 's'})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OpeningStockDialog;
