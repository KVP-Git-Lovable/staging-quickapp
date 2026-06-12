import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { ArrowRight, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getDisplayValues } from '@/utils/unitDisplayUtils';
import {
  getInventoryMovementTarget,
  getInventoryTransactionTypeLabel,
  inventoryTransactionTypeLabels,
  isNegativeInventoryTransaction,
  resolveInventoryTransactionType,
} from './transactionDisplay';

interface Product {
  id: string;
  name: string;
  unit?: string;
}

interface TransactionsLedgerPanelProps {
  distributorId: string;
  products: Product[];
  warehouses?: { id: string; name: string }[];
}

const PAGE_SIZE = 20;

const TransactionsLedgerPanel = ({ distributorId, products, warehouses = [] }: TransactionsLedgerPanelProps) => {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const productMap = Object.fromEntries(products.map(p => [p.id, p.name]));
  const productUnitMap = Object.fromEntries(products.map(p => [p.id, p.unit || '']));
  const warehouseMap = Object.fromEntries(warehouses.map(w => [w.id, w.name]));

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('distributor_inventory_transactions')
        .select('id, product_id, transaction_type, reference_type, balance_qty, running_balance, notes, created_at, warehouse_id, batch_number, unit')
        .eq('distributor_id', distributorId)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (typeFilter !== 'all') query = query.eq('transaction_type', typeFilter);
      if (productFilter !== 'all') query = query.eq('product_id', productFilter);

      const { data, error } = await query;
      if (error) throw error;
      // Map balance_qty -> quantity so existing render code (qty/sign logic) keeps working
      const mapped = (data || []).map((t: any) => ({ ...t, quantity: t.balance_qty }));
      setTransactions(mapped);
      setHasMore(mapped.length === PAGE_SIZE);
    } catch (err) {
      console.error('Error loading transactions:', err);
    } finally {
      setLoading(false);
    }
  }, [distributorId, typeFilter, productFilter, page]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    const channel = supabase
      .channel('ledger-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'distributor_inventory_transactions', filter: `distributor_id=eq.${distributorId}` }, () => loadTransactions())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [distributorId, loadTransactions]);

  const txTypes = Object.entries(inventoryTransactionTypeLabels).filter(([type]) => type !== 'LEGACY_ENTRY');

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BookOpen className="w-4 h-4" /> Transactions Ledger
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {txTypes.map(([type, label]) => (
                  <SelectItem key={type} value={type}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={productFilter} onValueChange={(v) => { setProductFilter(v); setPage(0); }}>
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
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : transactions.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">No transactions found</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Date</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Type</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Product</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Qty</th>
                    <th className="text-center px-2 py-2"></th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Movement</th>
                    {warehouses.length > 0 && (
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Warehouse</th>
                    )}
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(txn => {
                    const txnType = resolveInventoryTransactionType(txn);
                    const neg = isNegativeInventoryTransaction(txnType);
                    const target = getInventoryMovementTarget(txnType);
                    const rowUnit = txn.unit || '';
                    const { displayQty, displayUnit } = getDisplayValues(txn.quantity, 1, 1, rowUnit);
                    const qtyStr = `${neg ? '-' : '+'}${displayQty.toLocaleString('en-IN')}`;
                    const productName = productMap[txn.product_id] || txn.notes || 'Unknown';

                    return (
                      <tr key={txn.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                          {format(new Date(txn.created_at), 'dd/MM/yyyy')}
                        </td>
                        <td className="px-4 py-2.5 font-medium">
                          {getInventoryTransactionTypeLabel(txnType)}
                        </td>
                        <td className="px-4 py-2.5">{productName}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`font-semibold ${neg ? 'text-red-600' : 'text-green-600'}`}>
                            {qtyStr}{displayUnit ? ` ${displayUnit}` : ''}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-center text-muted-foreground">
                          <ArrowRight className="w-4 h-4 inline-block" />
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`w-2.5 h-2.5 rounded-full ${target.color}`} />
                            <span className="font-medium">{target.label}</span>
                          </span>
                        </td>
                        {warehouses.length > 0 && (
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {warehouseMap[txn.warehouse_id] || '—'}
                          </td>
                        )}
                        <td className="px-4 py-2.5 text-right text-muted-foreground">
                          {txn.running_balance != null ? getDisplayValues(txn.running_balance, 1, 1, rowUnit).displayQty.toLocaleString('en-IN') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-t">
              <span className="text-xs text-muted-foreground">Page {page + 1}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default TransactionsLedgerPanel;
