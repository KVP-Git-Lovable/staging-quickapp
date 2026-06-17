import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  ArrowLeft, Package, CheckCircle2, AlertTriangle, Truck,
  FileCheck, ClipboardCheck, RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface GRNItem {
  id: string;
  order_item_id: string;
  product_id: string;
  product_name: string;
  variant_id?: string;
  variant_name?: string;
  ordered_quantity: number;
  received_quantity: number;
  returned_quantity: number;
  return_reason: string;
  damaged_quantity: number;
  batch_number: string;
  expiry_date: string;
  unit: string;
  unit_price: number;
}

const RETURN_REASONS = [
  'damaged', 'expired', 'wrong_product', 'excess', 'quality_issue', 'short_supply', 'other'
];

const GoodsReceiptNew = () => {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<GRNItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const distributorId = localStorage.getItem('distributor_id');

  useEffect(() => {
    if (!distributorId) { navigate('/distributor-portal/login'); return; }
    if (orderId) loadOrderDetails();
  }, [orderId, distributorId]);

  const loadOrderDetails = async () => {
    try {
      const [{ data: orderData, error: orderError }, { data: itemsData, error: itemsError }] = await Promise.all([
        supabase.from('primary_orders').select('*').eq('id', orderId).single(),
        supabase.from('primary_order_items').select('*').eq('order_id', orderId),
      ]);
      if (orderError) throw orderError;
      if (itemsError) throw itemsError;

      setOrder(orderData);
      setItems(itemsData?.map(item => ({
        id: crypto.randomUUID(),
        order_item_id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        variant_id: item.variant_id || undefined,
        variant_name: item.variant_name || undefined,
        ordered_quantity: item.quantity,
        received_quantity: item.quantity,
        returned_quantity: 0,
        return_reason: '',
        damaged_quantity: 0,
        batch_number: item.batch_number || '',
        expiry_date: item.expiry_date || '',
        unit: item.unit,
        unit_price: item.unit_price,
      })) || []);
    } catch (error) {
      console.error('Error loading order:', error);
      toast.error('Failed to load order details');
      navigate('/distributor-portal/goods-receipt');
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (itemId: string, field: string, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const updated = { ...item, [field]: value };
      // Ensure received + returned doesn't exceed ordered
      if (field === 'received_quantity') {
        updated.received_quantity = Math.max(0, Math.min(updated.ordered_quantity, Number(value) || 0));
      }
      if (field === 'returned_quantity') {
        updated.returned_quantity = Math.max(0, Math.min(updated.ordered_quantity - updated.received_quantity, Number(value) || 0));
      }
      return updated;
    }));
  };

  const handleConfirmGRN = async () => {
    if (!order || !distributorId) return;
    setSaving(true);

    try {
      // Generate GRN number
      const { data: grnNumData } = await supabase.rpc('generate_grn_number');
      const grnNumber = grnNumData || `GRN-${Date.now()}`;

      const allFullyReceived = items.every(i => i.received_quantity >= i.ordered_quantity && i.returned_quantity === 0);
      const receiptType = allFullyReceived ? 'full' : 'partial';

      // Create GRN
      const { data: grn, error: grnError } = await supabase
        .from('goods_receipt_notes')
        .insert({
          grn_number: grnNumber,
          order_id: orderId,
          distributor_id: distributorId,
          receipt_type: receiptType,
          status: 'confirmed',
          received_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString(),
          notes,
        })
        .select('id')
        .single();

      if (grnError) throw grnError;

      // Create GRN items
      const grnItems = items.map(item => ({
        grn_id: grn.id,
        order_item_id: item.order_item_id,
        product_id: item.product_id,
        variant_id: item.variant_id || null,
        product_name: item.product_name,
        variant_name: item.variant_name || null,
        ordered_quantity: item.ordered_quantity,
        received_quantity: item.received_quantity,
        returned_quantity: item.returned_quantity,
        return_reason: item.return_reason || null,
        damaged_quantity: item.damaged_quantity,
        batch_number: item.batch_number || null,
        expiry_date: item.expiry_date || null,
        unit: item.unit,
        unit_price: item.unit_price,
      }));

      const { error: grnItemsError } = await supabase.from('grn_items').insert(grnItems);
      if (grnItemsError) throw grnItemsError;

      // Update order items with received quantities
      for (const item of items) {
        const { error: updErr } = await supabase.from('primary_order_items').update({
          received_quantity: item.received_quantity,
          batch_number: item.batch_number || null,
          expiry_date: item.expiry_date || null,
        }).eq('id', item.order_item_id);
        if (updErr) throw updErr;
      }

      // Resolve default warehouse (required NOT NULL on inventory + transactions)
      const { data: warehouse, error: whError } = await supabase
        .from('warehouses')
        .select('id')
        .eq('distributor_id', distributorId)
        .order('is_default', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (whError) throw whError;
      if (!warehouse?.id) {
        throw new Error('No warehouse configured for this distributor. Please create a warehouse before confirming a GRN.');
      }
      const warehouseId = warehouse.id;

      // Update inventory
      for (const item of items) {
        if (item.received_quantity <= 0) continue;

        const { data: existing, error: invSelErr } = await supabase
          .from('distributor_inventory')
          .select('id, quantity, unit_cost, batch_number, expiry_date')
          .eq('distributor_id', distributorId)
          .eq('product_id', item.product_id)
          .eq('warehouse_id', warehouseId)
          .maybeSingle();
        if (invSelErr) throw invSelErr;

        let newBalance = item.received_quantity;
        if (existing) {
          newBalance = (existing.quantity || 0) + item.received_quantity;
          const { error: invUpdErr } = await supabase.from('distributor_inventory').update({
            quantity: newBalance,
            last_received_date: new Date().toISOString().split('T')[0],
            batch_number: item.batch_number || existing.batch_number,
            expiry_date: item.expiry_date || existing.expiry_date,
            updated_at: new Date().toISOString(),
          }).eq('id', existing.id);
          if (invUpdErr) throw invUpdErr;
        } else {
          const { error: invInsErr } = await supabase.from('distributor_inventory').insert({
            distributor_id: distributorId,
            warehouse_id: warehouseId,
            product_id: item.product_id,
            variant_id: item.variant_id || null,
            product_name: item.product_name,
            variant_name: item.variant_name || null,
            quantity: item.received_quantity,
            reserved_quantity: 0,
            reorder_level: 10,
            max_stock_level: 1000,
            unit: item.unit,
            unit_cost: item.unit_price,
            batch_number: item.batch_number || null,
            expiry_date: item.expiry_date || null,
            last_received_date: new Date().toISOString().split('T')[0],
          });
          if (invInsErr) throw invInsErr;
        }

        // Log inward transaction
        const { error: txErr } = await supabase.from('distributor_inventory_transactions').insert({
          distributor_id: distributorId,
          warehouse_id: warehouseId,
          product_id: item.product_id,
          product_name: item.product_name,
          variant_id: item.variant_id || null,
          transaction_type: 'inward',
          balance_qty: item.received_quantity,
          running_balance: newBalance,
          reference_type: 'grn',
          reference_id: grn.id,
          reference_number: grnNumber,
          batch_number: item.batch_number || null,
          unit: item.unit,
          unit_cost: item.unit_price,
          notes: `GRN ${grnNumber} from order ${order.order_number}`,
        });
        if (txErr) throw txErr;
      }

      // Create return note if any items returned
      const returnedItems = items.filter(i => i.returned_quantity > 0);
      if (returnedItems.length > 0) {
        const { data: retNumData } = await supabase.rpc('generate_return_number');
        const returnNumber = retNumData || `RET-${Date.now()}`;

        const totalReturnValue = returnedItems.reduce((sum, i) => sum + (i.returned_quantity * i.unit_price), 0);

        const { data: returnNote } = await supabase.from('primary_return_notes').insert({
          return_number: returnNumber,
          order_id: orderId,
          grn_id: grn.id,
          distributor_id: distributorId,
          status: 'submitted',
          total_return_value: totalReturnValue,
          notes: `Auto-created from GRN ${grnNumber}`,
        }).select('id').single();

        if (returnNote) {
          await supabase.from('primary_return_items').insert(
            returnedItems.map(i => ({
              return_note_id: returnNote.id,
              product_id: i.product_id,
              variant_id: i.variant_id || null,
              product_name: i.product_name,
              variant_name: i.variant_name || null,
              quantity: i.returned_quantity,
              unit: i.unit,
              unit_price: i.unit_price,
              return_reason: i.return_reason || 'other',
              batch_number: i.batch_number || null,
              condition: i.return_reason || 'damaged',
            }))
          );
        }
      }

      // Update order status
      const anyReceived = items.some(i => i.received_quantity > 0);
      let newStatus = order.status;
      if (allFullyReceived) newStatus = 'delivered';
      else if (anyReceived) newStatus = 'partially_delivered';

      await supabase.from('primary_orders').update({
        status: newStatus,
        actual_delivery_date: new Date().toISOString().split('T')[0],
      }).eq('id', orderId);

      // Log status change
      await supabase.from('primary_order_status_history').insert({
        order_id: orderId!,
        status: newStatus,
        notes: `GRN ${grnNumber} confirmed. ${receiptType} receipt.`,
      });

      toast.success(`GRN ${grnNumber} confirmed! Inventory updated.`);
      navigate('/distributor-portal/goods-receipt');
    } catch (error: any) {
      console.error('Error confirming GRN:', error);
      toast.error(error?.message || 'Failed to confirm GRN');
    } finally {
      setSaving(false);
    }
  };

  const totalOrdered = items.reduce((sum, i) => sum + i.ordered_quantity, 0);
  const totalReceived = items.reduce((sum, i) => sum + i.received_quantity, 0);
  const totalReturned = items.reduce((sum, i) => sum + i.returned_quantity, 0);
  const allMatch = items.every(i => i.received_quantity === i.ordered_quantity && i.returned_quantity === 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p>Order not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background standalone-page">
      <header className="sticky-header-safe z-50 bg-card border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/distributor-portal/goods-receipt')}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="font-semibold text-foreground flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5 text-primary" />
                  Create GRN
                </h1>
                <p className="text-xs text-muted-foreground">
                  {order.order_number} • {format(new Date(order.order_date), 'dd MMM yyyy')}
                </p>
              </div>
            </div>
            <Badge className="bg-blue-100 text-blue-700">
              <Truck className="w-3 h-3 mr-1" />
              {order.status.replace('_', ' ')}
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Summary */}
        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-4">
            <div className="grid grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Items</p>
                <p className="text-lg font-bold">{items.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ordered</p>
                <p className="text-lg font-bold">{totalOrdered}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Received</p>
                <p className={`text-lg font-bold ${allMatch ? 'text-green-600' : 'text-orange-600'}`}>{totalReceived}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Returned</p>
                <p className={`text-lg font-bold ${totalReturned > 0 ? 'text-destructive' : ''}`}>{totalReturned}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status */}
        {allMatch ? (
          <Card className="bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800">
            <CardContent className="p-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-700 dark:text-green-400">Full receipt — order will be marked as delivered.</span>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-800">
            <CardContent className="p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-600" />
              <span className="text-sm text-orange-700 dark:text-orange-400">Partial receipt — order will be marked accordingly.</span>
            </CardContent>
          </Card>
        )}

        {/* Items */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4" />
              Verify & Receive Items
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((item) => (
              <div key={item.id} className="p-4 rounded-lg bg-muted/50 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-foreground">{item.product_name}</p>
                    {item.variant_name && <p className="text-sm text-muted-foreground">{item.variant_name}</p>}
                  </div>
                  <Badge variant="outline">Ordered: {item.ordered_quantity} {item.unit}</Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Received Qty</label>
                    <Input
                      type="number" min={0} max={item.ordered_quantity}
                      value={item.received_quantity}
                      onChange={(e) => updateItem(item.id, 'received_quantity', e.target.value)}
                      className={item.received_quantity !== item.ordered_quantity ? 'border-orange-300' : ''}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Returned Qty</label>
                    <Input
                      type="number" min={0} max={item.ordered_quantity - item.received_quantity}
                      value={item.returned_quantity}
                      onChange={(e) => updateItem(item.id, 'returned_quantity', e.target.value)}
                      className={item.returned_quantity > 0 ? 'border-destructive' : ''}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Batch No.</label>
                    <Input
                      placeholder="Batch"
                      value={item.batch_number}
                      onChange={(e) => updateItem(item.id, 'batch_number', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Expiry Date</label>
                    <Input
                      type="date"
                      value={item.expiry_date}
                      onChange={(e) => updateItem(item.id, 'expiry_date', e.target.value)}
                    />
                  </div>
                </div>

                {item.returned_quantity > 0 && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      <RotateCcw className="w-3 h-3 inline mr-1" />
                      Return Reason
                    </label>
                    <Select value={item.return_reason} onValueChange={(v) => updateItem(item.id, 'return_reason', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select reason..." />
                      </SelectTrigger>
                      <SelectContent>
                        {RETURN_REASONS.map(r => (
                          <SelectItem key={r} value={r}>{r.replace('_', ' ')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(item.received_quantity !== item.ordered_quantity || item.returned_quantity > 0) && (
                  <p className="text-xs text-orange-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Ordered {item.ordered_quantity}, receiving {item.received_quantity}
                    {item.returned_quantity > 0 && `, returning ${item.returned_quantity}`}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardContent className="p-4">
            <label className="text-sm font-medium block mb-2">GRN Notes</label>
            <Textarea
              placeholder="Any remarks about this receipt..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => navigate('/distributor-portal/goods-receipt')}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={handleConfirmGRN}
            disabled={saving || totalReceived === 0}
          >
            {saving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
            ) : (
              <FileCheck className="w-4 h-4 mr-2" />
            )}
            Confirm GRN & Update Inventory
          </Button>
        </div>
      </main>
    </div>
  );
};

export default GoodsReceiptNew;
