// READ-ONLY: do not add mutations here
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { getInventoryTransactionTypeLabel, resolveInventoryTransactionType } from '../inventory/transactionDisplay';
import type { NetworkInventoryRow } from './useNetworkChildInventory';

interface Props {
  childId: string;
  row: NetworkInventoryRow;
}

const NetworkInventoryRowDetail = ({ childId, row }: Props) => {
  const [tab, setTab] = useState('batches');
  const [movements, setMovements] = useState<any[] | null>(null);
  const [orders, setOrders] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tab === 'movement' && movements === null) {
      setLoading(true);
      let q = supabase
        .from('distributor_inventory_transactions')
        .select('id, transaction_type, reference_type, balance_qty, batch_number, created_at, notes')
        .eq('distributor_id', childId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (row.product_id) q = q.eq('product_id', row.product_id);
      else q = q.eq('product_name', row.product_name);
      q.then(({ data }) => {
        setMovements(data || []);
        setLoading(false);
      });
    }
    if (tab === 'orders' && orders === null) {
      setLoading(true);
      let q = supabase
        .from('order_items')
        .select('id, order_id, product_name, quantity, rate, total, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      if (row.product_id) q = q.eq('product_id', row.product_id);
      else q = q.eq('product_name', row.product_name);
      q.then(({ data }) => {
        setOrders(data || []);
        setLoading(false);
      });
    }
  }, [tab, childId, row.product_id, row.product_name, movements, orders]);

  return (
    <div className="bg-muted/30 p-4 border-t">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-8">
          <TabsTrigger value="batches" className="text-xs">Batches ({row.batches.length})</TabsTrigger>
          <TabsTrigger value="movement" className="text-xs">Movement</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs">Orders</TabsTrigger>
        </TabsList>

        <TabsContent value="batches" className="mt-2">
          {row.batches.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No batch data.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 text-xs">Batch #</TableHead>
                  <TableHead className="h-8 text-xs">Expiry</TableHead>
                  <TableHead className="h-8 text-xs text-right">Qty</TableHead>
                  <TableHead className="h-8 text-xs text-right">Reserved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {row.batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="py-1.5 text-xs">{b.batch_number || '—'}</TableCell>
                    <TableCell className="py-1.5 text-xs">{b.expiry_date ? new Date(b.expiry_date).toLocaleDateString() : '—'}</TableCell>
                    <TableCell className="py-1.5 text-xs text-right">{b.quantity}</TableCell>
                    <TableCell className="py-1.5 text-xs text-right">{b.reserved_quantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="movement" className="mt-2">
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : !movements || movements.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No movements in window.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 text-xs">Date</TableHead>
                  <TableHead className="h-8 text-xs">Type</TableHead>
                  <TableHead className="h-8 text-xs">Batch</TableHead>
                  <TableHead className="h-8 text-xs text-right">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="py-1.5 text-xs">{new Date(m.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="py-1.5 text-xs">{getInventoryTransactionTypeLabel(resolveInventoryTransactionType(m))}</TableCell>
                    <TableCell className="py-1.5 text-xs">{m.batch_number || '—'}</TableCell>
                    <TableCell className="py-1.5 text-xs text-right">{m.balance_qty}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="orders" className="mt-2">
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : !orders || orders.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No recent orders.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 text-xs">Date</TableHead>
                  <TableHead className="h-8 text-xs">Order</TableHead>
                  <TableHead className="h-8 text-xs text-right">Qty</TableHead>
                  <TableHead className="h-8 text-xs text-right">Rate</TableHead>
                  <TableHead className="h-8 text-xs text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o: any) => (
                  <TableRow key={o.id}>
                    <TableCell className="py-1.5 text-xs">{new Date(o.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="py-1.5 text-xs font-mono">{o.order_id?.slice(0, 8)}</TableCell>
                    <TableCell className="py-1.5 text-xs text-right">{o.quantity}</TableCell>
                    <TableCell className="py-1.5 text-xs text-right">₹{Number(o.rate || 0).toLocaleString('en-IN')}</TableCell>
                    <TableCell className="py-1.5 text-xs text-right">₹{Number(o.total || 0).toLocaleString('en-IN')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default NetworkInventoryRowDetail;
