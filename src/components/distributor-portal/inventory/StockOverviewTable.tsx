import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, Pencil, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import BatchEditDialog from './BatchEditDialog';
import { getDisplayValues } from '@/utils/unitDisplayUtils';

interface InventoryRow {
  id: string;
  product_id: string;
  product_name: string;
  available_quantity: number;
  reserved_quantity: number;
  damaged_quantity: number;
  expired_quantity: number;
  updated_at: string;
  unit?: string | null;
}

interface BatchRow {
  id: string;
  batch_no: string;
  expiry_date: string | null;
  quantity: number;
  available_qty: number;
  reserved_qty: number;
}

interface StockOverviewTableProps {
  inventory: InventoryRow[];
  productFilter: string;
  onProductFilterChange: (val: string) => void;
  products: { id: string; name: string; unit?: string }[];
  distributorId?: string;
}

type SortField = 'product_name' | 'available_quantity' | 'reserved_quantity' | 'damaged_quantity' | 'expired_quantity' | 'updated_at';

const PAGE_SIZE = 20;

const StockOverviewTable = ({ inventory, productFilter, onProductFilterChange, products, distributorId }: StockOverviewTableProps) => {
  const [sortField, setSortField] = useState<SortField>('product_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [batchData, setBatchData] = useState<Record<string, BatchRow[]>>({});
  const [batchLoading, setBatchLoading] = useState<Set<string>>(new Set());
  const [editingBatch, setEditingBatch] = useState<BatchRow | null>(null);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const fetchBatches = useCallback(async (productId: string) => {
    if (!distributorId) return;
    setBatchLoading(prev => new Set(prev).add(productId));
    try {
      const { data, error } = await supabase
        .from('inventory_batches')
        .select('id, batch_no, expiry_date, quantity, available_qty, reserved_qty')
        .eq('distributor_id', distributorId)
        .eq('product_id', productId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBatchData(prev => ({ ...prev, [productId]: (data || []) as BatchRow[] }));
    } catch (err) {
      console.error('Error fetching batches:', err);
    } finally {
      setBatchLoading(prev => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  }, [distributorId]);

  const toggleExpand = (productId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
        if (!batchData[productId]) {
          fetchBatches(productId);
        }
      }
      return next;
    });
  };

  const sorted = useMemo(() => {
    const arr = [...inventory];
    arr.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return arr;
  }, [inventory, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <TableHead className="cursor-pointer select-none bg-muted/50" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1 text-xs font-medium">
        {label}
        <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${sortField === field && sortDir === 'desc' ? 'rotate-180' : ''}`} />
      </div>
    </TableHead>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">Current Stock Overview</CardTitle>
        <Select value={productFilter} onValueChange={(v) => { onProductFilterChange(v); setPage(1); }}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="All Products" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Products</SelectItem>
            {products.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 bg-muted/50" />
              <SortHeader field="product_name" label="Product" />
              <SortHeader field="available_quantity" label="Available" />
              <SortHeader field="reserved_quantity" label="Reserved" />
              <SortHeader field="damaged_quantity" label="Damaged" />
              <SortHeader field="expired_quantity" label="Expired" />
              <SortHeader field="updated_at" label="Last Updated" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No inventory items found
                </TableCell>
              </TableRow>
            ) : (
              paginated.map(row => {
                const isExpanded = expandedRows.has(row.product_id);
                const batches = batchData[row.product_id];
                const isLoading = batchLoading.has(row.product_id);
                const rowUnit = row.unit || '';
                const { displayUnit } = getDisplayValues(1, 1, 1, rowUnit);
                const convertQty = (q: number) => getDisplayValues(q, 1, 1, rowUnit).displayQty;

                return (
                  <>
                    <TableRow key={row.id} className="cursor-pointer hover:bg-muted/30" onClick={() => toggleExpand(row.product_id)}>
                      <TableCell className="w-8 px-2">
                        {isExpanded
                          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          : <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />
                        }
                      </TableCell>
                      <TableCell className="font-medium">
                        {row.product_name}
                        {displayUnit && <span className="ml-1.5 text-xs text-muted-foreground">({displayUnit})</span>}
                      </TableCell>
                      <TableCell className="text-green-700 font-semibold">{convertQty(row.available_quantity).toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-amber-600 font-semibold">{convertQty(row.reserved_quantity).toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-red-600 font-semibold">{convertQty(row.damaged_quantity).toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-slate-500 font-semibold">{convertQty(row.expired_quantity).toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {row.updated_at ? format(new Date(row.updated_at), 'MM/dd/yyyy') : '-'}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${row.id}-batches`}>
                        <TableCell colSpan={7} className="p-0 bg-muted/20">
                          {isLoading ? (
                            <div className="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground">
                              <Loader2 className="w-4 h-4 animate-spin" /> Loading batches…
                            </div>
                          ) : !batches || batches.length === 0 ? (
                            <div className="text-center py-4 text-sm text-muted-foreground">
                              No batches found for this product
                            </div>
                          ) : (
                            <div className="px-6 py-2">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs h-8">Batch No</TableHead>
                                    <TableHead className="text-xs h-8">Expiry Date</TableHead>
                                    <TableHead className="text-xs h-8">Qty</TableHead>
                                    <TableHead className="text-xs h-8">Available</TableHead>
                                    <TableHead className="text-xs h-8">Reserved</TableHead>
                                    <TableHead className="text-xs h-8 w-10" />
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {batches.map(b => (
                                    <TableRow key={b.id} className="text-sm">
                                      <TableCell className="py-1.5 font-medium">{b.batch_no}</TableCell>
                                      <TableCell className="py-1.5">
                                        {b.expiry_date ? format(new Date(b.expiry_date), 'MM/dd/yyyy') : '-'}
                                      </TableCell>
                                      <TableCell className="py-1.5">{convertQty(b.quantity).toLocaleString('en-IN')}</TableCell>
                                      <TableCell className="py-1.5 text-green-700">{convertQty(Math.max(0, (b.quantity || 0) - (b.reserved_qty || 0))).toLocaleString('en-IN')}</TableCell>
                                      <TableCell className="py-1.5 text-amber-600">{convertQty(b.reserved_qty).toLocaleString('en-IN')}</TableCell>
                                      <TableCell className="py-1.5">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6"
                                          onClick={e => { e.stopPropagation(); setEditingBatch(b); }}
                                        >
                                          <Pencil className="w-3.5 h-3.5" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })
            )}
          </TableBody>
        </Table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {editingBatch && (
        <BatchEditDialog
          open={!!editingBatch}
          onOpenChange={(open) => { if (!open) setEditingBatch(null); }}
          batch={editingBatch}
          onSuccess={() => {
            const productId = inventory.find(i =>
              batchData[i.product_id]?.some(b => b.id === editingBatch.id)
            )?.product_id;
            if (productId) fetchBatches(productId);
            setEditingBatch(null);
          }}
        />
      )}
    </Card>
  );
};

export default StockOverviewTable;
