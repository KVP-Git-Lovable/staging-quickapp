import { useState, useEffect } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, FileText, Plus, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface OutletContext {
  user: { id: string; full_name: string; role: string; distributor_id: string };
  distributorId: string;
}

interface Retailer {
  id: string;
  name: string;
  address: string;
  phone: string;
  gst_number: string | null;
}

interface InvoiceItem {
  product_name: string;
  hsn_code: string;
  quantity: number;
  unit: string;
  rate: number;
  taxable_amount: number;
  sgst_amount: number;
  cgst_amount: number;
  total_amount: number;
}

const TAX_RATE = 0.025; // 2.5% each SGST + CGST

const SecondaryInvoiceCreate = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { distributorId } = useOutletContext<OutletContext>();
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [selectedRetailerId, setSelectedRetailerId] = useState(searchParams.get('retailer') || '');
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [retailerSearch, setRetailerSearch] = useState('');
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');

  useEffect(() => {
    if (distributorId) loadRetailers();
  }, [distributorId]);

  useEffect(() => {
    if (selectedRetailerId && distributorId) loadRetailerOrders();
  }, [selectedRetailerId, distributorId]);

  const loadRetailers = async () => {
    const { data } = await supabase
      .from('retailers')
      .select('id, name, address, phone, gst_number')
      .or(`distributor_id.eq.${distributorId}`)
      .order('name');
    setRetailers(data || []);
  };

  const loadRetailerOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('id, retailer_name, total_amount, created_at, order_items!order_items_order_id_fkey(product_name, quantity, unit, rate, total)')
      .eq('retailer_id', selectedRetailerId)
      .in('status', ['confirmed', 'delivered'])
      .order('created_at', { ascending: false })
      .limit(20);
    setOrders(data || []);
  };

  const importFromOrder = (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order?.order_items) return;

    const newItems: InvoiceItem[] = order.order_items.map((item: any) => {
      const taxable = Number(item.total) || 0;
      const sgst = taxable * TAX_RATE;
      const cgst = taxable * TAX_RATE;
      return {
        product_name: item.product_name,
        hsn_code: '',
        quantity: Number(item.quantity) || 0,
        unit: item.unit || 'Piece',
        rate: Number(item.rate) || 0,
        taxable_amount: taxable,
        sgst_amount: sgst,
        cgst_amount: cgst,
        total_amount: taxable + sgst + cgst,
      };
    });
    setItems(newItems);
    setSelectedOrderId(orderId);
    toast.success(`Imported ${newItems.length} items from order`);
  };

  const addItem = () => {
    setItems([...items, {
      product_name: '', hsn_code: '', quantity: 1, unit: 'Piece',
      rate: 0, taxable_amount: 0, sgst_amount: 0, cgst_amount: 0, total_amount: 0,
    }]);
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const updated = [...items];
    (updated[index] as any)[field] = value;
    // Recalculate
    const qty = Number(updated[index].quantity) || 0;
    const rate = Number(updated[index].rate) || 0;
    const taxable = qty * rate;
    const sgst = taxable * TAX_RATE;
    const cgst = taxable * TAX_RATE;
    updated[index].taxable_amount = taxable;
    updated[index].sgst_amount = sgst;
    updated[index].cgst_amount = cgst;
    updated[index].total_amount = taxable + sgst + cgst;
    setItems(updated);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const totals = items.reduce((acc, item) => ({
    subtotal: acc.subtotal + item.taxable_amount,
    sgst: acc.sgst + item.sgst_amount,
    cgst: acc.cgst + item.cgst_amount,
    total: acc.total + item.total_amount,
  }), { subtotal: 0, sgst: 0, cgst: 0, total: 0 });

  const saveInvoice = async () => {
    if (!selectedRetailerId) { toast.error('Select a retailer'); return; }
    if (items.length === 0 || items.some(i => !i.product_name)) { toast.error('Add at least one item with a name'); return; }

    setLoading(true);
    try {
      // Generate invoice number
      const { data: seqData } = await supabase.rpc('nextval_text', { seq_name: 'distributor_invoice_seq' }).single();
      const seqNum = seqData || Date.now().toString();
      const invoiceNumber = `DINV-${format(new Date(), 'yyMM')}-${String(seqNum).padStart(5, '0')}`;

      const { data: invoice, error } = await supabase
        .from('distributor_secondary_invoices')
        .insert({
          distributor_id: distributorId,
          retailer_id: selectedRetailerId,
          order_id: selectedOrderId || null,
          invoice_number: invoiceNumber,
          subtotal: totals.subtotal,
          sgst_amount: totals.sgst,
          cgst_amount: totals.cgst,
          total_amount: totals.total,
          balance_due: totals.total,
          notes,
        })
        .select()
        .single();

      if (error) throw error;

      const itemsToInsert = items.map(item => ({
        invoice_id: invoice.id,
        product_name: item.product_name,
        hsn_code: item.hsn_code,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        taxable_amount: item.taxable_amount,
        sgst_amount: item.sgst_amount,
        cgst_amount: item.cgst_amount,
        total_amount: item.total_amount,
      }));

      await supabase.from('distributor_secondary_invoice_items').insert(itemsToInsert);

      toast.success(`Invoice ${invoiceNumber} created`);
      navigate('/distributor-portal/secondary-invoices');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to create invoice');
    } finally {
      setLoading(false);
    }
  };

  const filteredRetailers = retailers.filter(r =>
    r.name.toLowerCase().includes(retailerSearch.toLowerCase())
  );

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/distributor-portal/secondary-invoices')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Create Invoice</h1>
          <p className="text-sm text-muted-foreground">Secondary sales invoice</p>
        </div>
      </div>

      {/* Retailer Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Retailer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Search retailer..."
            value={retailerSearch}
            onChange={e => setRetailerSearch(e.target.value)}
          />
          <Select value={selectedRetailerId} onValueChange={setSelectedRetailerId}>
            <SelectTrigger>
              <SelectValue placeholder="Select retailer" />
            </SelectTrigger>
            <SelectContent>
              {filteredRetailers.map(r => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Import from Order */}
      {orders.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Import from Order (Optional)</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedOrderId} onValueChange={importFromOrder}>
              <SelectTrigger>
                <SelectValue placeholder="Select an order to import items" />
              </SelectTrigger>
              <SelectContent>
                {orders.map(o => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.retailer_name} — ₹{Number(o.total_amount).toLocaleString('en-IN')} — {format(new Date(o.created_at), 'dd MMM yy')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Invoice Items */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Items</CardTitle>
          <Button size="sm" variant="outline" onClick={addItem}>
            <Plus className="h-4 w-4 mr-1" /> Add Item
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, idx) => (
            <div key={idx} className="p-3 border rounded-lg space-y-3 bg-muted/30">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <Label className="text-xs">Product</Label>
                    <Input
                      value={item.product_name}
                      onChange={e => updateItem(idx, 'product_name', e.target.value)}
                      placeholder="Product name"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Qty</Label>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Rate (₹)</Label>
                    <Input
                      type="number"
                      value={item.rate}
                      onChange={e => updateItem(idx, 'rate', Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Unit</Label>
                    <Input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">HSN Code</Label>
                    <Input value={item.hsn_code} onChange={e => updateItem(idx, 'hsn_code', e.target.value)} />
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="text-destructive mt-5" onClick={() => removeItem(idx)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                <span>Taxable: ₹{item.taxable_amount.toFixed(2)}</span>
                <span>SGST: ₹{item.sgst_amount.toFixed(2)}</span>
                <span>CGST: ₹{item.cgst_amount.toFixed(2)}</span>
                <span className="font-medium text-foreground">Total: ₹{item.total_amount.toFixed(2)}</span>
              </div>
            </div>
          ))}

          {items.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>No items added. Click "Add Item" or import from an order.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardContent className="pt-4">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
        </CardContent>
      </Card>

      {/* Totals & Save */}
      {items.length > 0 && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>₹{totals.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">SGST (2.5%)</span>
              <span>₹{totals.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">CGST (2.5%)</span>
              <span>₹{totals.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Total</span>
              <span className="text-primary">₹{totals.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <Button className="w-full mt-3" onClick={saveInvoice} disabled={loading}>
              <FileText className="h-4 w-4 mr-2" />
              {loading ? 'Creating...' : 'Create Invoice'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SecondaryInvoiceCreate;
