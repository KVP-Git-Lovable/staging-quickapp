import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  ShoppingBag,
  Save,
  Send,
  Package,
  Receipt,
  FileText,
  CreditCard,
  Edit2,
  Star,
  Info,
  ArrowRight,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';

interface Category {
  id: string;
  name: string;
}

interface PriceBookEntry {
  product_id: string;
  variant_id: string | null;
  final_price: number;
  list_price: number;
}

interface Product {
  id: string;
  name: string;
  category_id?: string;
  category_name?: string;
  unit?: string;
  price?: number;
  priceBookPrice?: number;
  hsn_code?: string;
  variants?: any[];
}

interface OrderItem {
  product_id: string;
  variant_id?: string;
  product_name: string;
  variant_name?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_percent: number;
  gst_percent: number;
  hsn_code?: string;
  line_total: number; // gross (qty * unit_price) — taxes & discount tracked separately
}

const DEFAULT_GST = 18;

const CreatePrimaryOrder = () => {
  const navigate = useNavigate();
  const { id: editOrderId } = useParams();
  const isEditMode = Boolean(editOrderId);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [priceBookEntries, setPriceBookEntries] = useState<PriceBookEntry[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(true);
  const [priceBookName, setPriceBookName] = useState<string>('');
  const [creditLimit, setCreditLimit] = useState<number>(0);
  const [outstanding, setOutstanding] = useState<number>(0);
  const [creditChecked, setCreditChecked] = useState(false);
  const [existingOrder, setExistingOrder] = useState<any>(null);

  const distributorId = localStorage.getItem('distributor_id');

  useEffect(() => {
    if (!distributorId) {
      navigate('/distributor-portal/login');
      return;
    }
    loadData();
    loadCreditInfo();
  }, [distributorId, navigate]);

  // Load order when in edit mode (after products are loaded so we can hydrate names/units)
  useEffect(() => {
    if (!isEditMode || !editOrderId || productsLoading) return;
    loadExistingOrder(editOrderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, editOrderId, productsLoading]);

  const loadExistingOrder = async (orderId: string) => {
    try {
      const { data, error } = await supabase
        .from('primary_orders')
        .select('*, primary_order_items(*)')
        .eq('id', orderId)
        .single();
      if (error) throw error;
      if (data.status !== 'draft') {
        toast.error('Only draft orders can be edited');
        navigate(`/distributor-portal/primary-order/${orderId}`);
        return;
      }
      setExistingOrder(data);
      setExpectedDeliveryDate(data.expected_delivery_date || '');
      setNotes(data.notes || '');
      const items: OrderItem[] = (data.primary_order_items || []).map((it: any) => ({
        product_id: it.product_id,
        variant_id: it.variant_id || undefined,
        product_name: it.product_name,
        variant_name: it.variant_name || undefined,
        quantity: Number(it.quantity || 0),
        unit: it.unit || 'pieces',
        unit_price: Number(it.unit_price || 0),
        discount_percent: Number(it.discount_percent || 0),
        gst_percent: Number(it.gst_percentage ?? it.tax_percent ?? DEFAULT_GST),
        hsn_code: it.hsn_code || undefined,
        line_total: Number(it.quantity || 0) * Number(it.unit_price || 0),
      }));
      setOrderItems(items);
    } catch (err: any) {
      console.error('Error loading order:', err);
      toast.error(err.message || 'Failed to load order');
      navigate('/distributor-portal/primary-orders');
    }
  };

  const loadCreditInfo = async () => {
    if (!distributorId) return;
    try {
      const [creditRes, ordersRes] = await Promise.all([
        supabase
          .from('distributor_credit_limits')
          .select('credit_limit')
          .eq('distributor_id', distributorId)
          .maybeSingle(),
        supabase
          .from('primary_orders')
          .select('total_amount')
          .eq('distributor_id', distributorId)
          .not('status', 'in', '("cancelled","delivered")'),
      ]);
      setCreditLimit(Number(creditRes.data?.credit_limit || 0));
      const totalOutstanding = (ordersRes.data || []).reduce(
        (s: number, o: any) => s + Number(o.total_amount || 0),
        0,
      );
      setOutstanding(totalOutstanding);
      setCreditChecked(true);
    } catch (err) {
      console.error('Credit check failed:', err);
    }
  };

  useEffect(() => {
    if (selectedCategory === 'all') {
      setFilteredProducts(products);
    } else if (selectedCategory === 'uncategorized') {
      setFilteredProducts(products.filter((p) => !p.category_id));
    } else {
      setFilteredProducts(products.filter((p) => p.category_id === selectedCategory));
    }
    setSelectedProduct('');
  }, [selectedCategory, products]);

  const loadData = async () => {
    try {
      const { data: categoriesData } = await supabase
        .from('product_categories')
        .select('id, name')
        .order('name');
      setCategories(categoriesData || []);

      const { data: priceBookData } = await supabase
        .from('distributor_price_books')
        .select('price_book_id, price_books(id, name)')
        .eq('distributor_id', distributorId)
        .eq('is_active', true)
        .maybeSingle();

      let priceEntries: PriceBookEntry[] = [];
      if (priceBookData?.price_book_id) {
        const pb = priceBookData.price_books as any;
        setPriceBookName(pb?.name || '');
        const { data: entriesData } = await supabase
          .from('price_book_entries')
          .select('product_id, variant_id, final_price, list_price')
          .eq('price_book_id', priceBookData.price_book_id)
          .eq('is_active', true);
        priceEntries = entriesData || [];
        setPriceBookEntries(priceEntries);
      }

      const { data: productsData, error } = await supabase
        .from('products')
        .select('*, product_categories(id, name), product_variants(*)')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;

      const enriched = (productsData || []).map((p: any) => {
        const pe = priceEntries.find((e) => e.product_id === p.id && e.variant_id === null);
        return {
          ...p,
          category_id: p.product_categories?.id,
          category_name: p.product_categories?.name,
          // products table uses `rate` (not `price`) — map it so order entry has a unit price
          price: Number(p.rate ?? p.price ?? 0),
          // prefer explicit selling unit, fall back to base_unit, then pieces
          unit: p.unit || p.base_unit || 'pieces',
          priceBookPrice: pe?.final_price,
        };
      });
      setProducts(enriched);
      setFilteredProducts(enriched);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load products');
    } finally {
      setProductsLoading(false);
    }
  };

  const getProductPrice = (product: Product): number =>
    product.priceBookPrice ?? product.price ?? 0;

  const addItem = () => {
    if (!selectedProduct) {
      toast.error('Please select a product');
      return;
    }
    const product = products.find((p) => p.id === selectedProduct);
    if (!product) return;
    const unitPrice = getProductPrice(product);
    const existingIndex = orderItems.findIndex((it) => it.product_id === selectedProduct);

    if (existingIndex >= 0) {
      const updated = [...orderItems];
      updated[existingIndex].quantity += quantity;
      updated[existingIndex].line_total =
        updated[existingIndex].quantity * updated[existingIndex].unit_price;
      setOrderItems(updated);
    } else {
      setOrderItems([
        ...orderItems,
        {
          product_id: product.id,
          product_name: product.name,
          quantity,
          unit: product.unit || 'pieces',
          unit_price: unitPrice,
          discount_percent: 0,
          gst_percent: DEFAULT_GST,
          hsn_code: product.hsn_code,
          line_total: quantity * unitPrice,
        },
      ]);
    }
    setSelectedProduct('');
    setQuantity(1);
    toast.success('Item added');
  };

  const updateItem = (index: number, patch: Partial<OrderItem>) => {
    const updated = [...orderItems];
    updated[index] = { ...updated[index], ...patch };
    updated[index].line_total = updated[index].quantity * updated[index].unit_price;
    setOrderItems(updated);
  };

  const removeItem = (index: number) =>
    setOrderItems(orderItems.filter((_, i) => i !== index));

  const totals = useMemo(() => {
    let subtotal = 0;
    let totalDiscount = 0;
    let cgst = 0;
    let sgst = 0;
    orderItems.forEach((it) => {
      const gross = it.quantity * it.unit_price;
      const disc = gross * (it.discount_percent / 100);
      const taxable = gross - disc;
      const half = (taxable * it.gst_percent) / 200; // CGST = SGST = half of GST
      subtotal += gross;
      totalDiscount += disc;
      cgst += half;
      sgst += half;
    });
    const taxable = subtotal - totalDiscount;
    const taxAmount = cgst + sgst;
    const grossTotal = taxable + taxAmount;
    const grandTotal = Math.round(grossTotal);
    const roundOff = grandTotal - grossTotal;
    return {
      subtotal,
      totalDiscount,
      taxable,
      cgst,
      sgst,
      taxAmount,
      roundOff,
      grandTotal,
    };
  }, [orderItems]);

  const saveOrder = async (submit = false) => {
    if (orderItems.length === 0) {
      toast.error('Please add at least one item');
      return;
    }
    if (submit && creditLimit > 0) {
      const newOutstanding = outstanding + totals.grandTotal;
      if (newOutstanding > creditLimit) {
        toast.error(
          `Credit limit exceeded! Limit: ₹${creditLimit.toLocaleString('en-IN')}, Outstanding + this order: ₹${newOutstanding.toLocaleString('en-IN')}. Cannot submit.`,
          { duration: 6000 },
        );
        return;
      }
    }

    setLoading(true);
    try {
      let orderId = editOrderId as string | undefined;

      const headerPayload = {
        distributor_id: distributorId,
        expected_delivery_date: expectedDeliveryDate || null,
        notes,
        status: submit ? 'submitted' : 'draft',
        subtotal: totals.subtotal,
        discount_amount: totals.totalDiscount,
        tax_amount: totals.taxAmount,
        total_amount: totals.grandTotal,
      };

      if (isEditMode && orderId) {
        const { error: updErr } = await supabase
          .from('primary_orders')
          .update(headerPayload)
          .eq('id', orderId);
        if (updErr) throw updErr;
        const { error: delErr } = await supabase
          .from('primary_order_items')
          .delete()
          .eq('order_id', orderId);
        if (delErr) throw delErr;
      } else {
        const orderNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const { data: created, error: orderError } = await supabase
          .from('primary_orders')
          .insert([{ ...headerPayload, order_number: orderNumber }])
          .select()
          .single();
        if (orderError) throw orderError;
        orderId = created.id;
      }

      const itemsToInsert = orderItems.map((it) => {
        const gross = it.quantity * it.unit_price;
        const disc = gross * (it.discount_percent / 100);
        const taxable = gross - disc;
        const tax = (taxable * it.gst_percent) / 100;
        return {
          order_id: orderId,
          product_id: it.product_id,
          variant_id: it.variant_id || null,
          product_name: it.product_name,
          variant_name: it.variant_name || null,
          quantity: it.quantity,
          unit: it.unit,
          unit_price: it.unit_price,
          discount_percent: it.discount_percent,
          gst_percentage: it.gst_percent,
          tax_percent: it.gst_percent,
          hsn_code: it.hsn_code || null,
          line_total: Math.round((taxable + tax) * 100) / 100,
        };
      });

      const { error: itemsError } = await supabase
        .from('primary_order_items')
        .insert(itemsToInsert);
      if (itemsError) throw itemsError;

      toast.success(
        isEditMode
          ? submit
            ? 'Order updated & submitted'
            : 'Draft updated'
          : submit
            ? 'Order submitted successfully!'
            : 'Order saved as draft',
      );
      navigate(
        isEditMode
          ? `/distributor-portal/primary-order/${orderId}`
          : '/distributor-portal/primary-orders',
      );
    } catch (error: any) {
      console.error('Error saving order:', error);
      toast.error(error.message || 'Failed to save order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-44 standalone-page">
      {/* Header */}
      <header className="sticky-header-safe z-50 bg-card border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                navigate(
                  isEditMode && editOrderId
                    ? `/distributor-portal/primary-order/${editOrderId}`
                    : '/distributor-portal/primary-orders',
                )
              }
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="font-semibold text-foreground">
                {isEditMode
                  ? `Edit Order${existingOrder?.order_number ? ` — ${existingOrder.order_number}` : ''}`
                  : 'New Primary Order'}
              </h1>
              <p className="text-xs text-muted-foreground">
                {orderItems.length} items
                {priceBookName && <span className="ml-2">• Price Book: {priceBookName}</span>}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Credit warning */}
        {creditChecked && creditLimit > 0 && (
          <Card
            className={`border-l-4 ${
              outstanding > creditLimit
                ? 'border-l-destructive bg-destructive/5'
                : outstanding > creditLimit * 0.8
                  ? 'border-l-yellow-500 bg-yellow-50'
                  : 'border-l-green-500 bg-green-50'
            }`}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {outstanding > creditLimit ? '⚠️ Credit Limit Exceeded' : 'Credit Status'}
                </span>
                <span>
                  ₹{outstanding.toLocaleString('en-IN')} / ₹{creditLimit.toLocaleString('en-IN')}
                </span>
              </div>
              {outstanding > creditLimit && (
                <p className="text-xs text-destructive mt-1">
                  Order submission is blocked until outstanding is cleared.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Add product */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Add Products</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="uncategorized">Uncategorized</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Select Product</Label>
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a product..." />
                  </SelectTrigger>
                  <SelectContent>
                    {productsLoading ? (
                      <SelectItem value="loading" disabled>
                        Loading...
                      </SelectItem>
                    ) : filteredProducts.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No products in this category
                      </SelectItem>
                    ) : (
                      filteredProducts.map((p) => {
                        const price = getProductPrice(p);
                        const hasPB = p.priceBookPrice !== undefined;
                        return (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} - ₹
                            {price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}/
                            {p.unit || 'pc'}
                            {hasPB && <span className="text-primary ml-1">★</span>}
                          </SelectItem>
                        );
                      })
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantity</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="text-center"
                  />
                  <Button variant="outline" size="icon" onClick={() => setQuantity(quantity + 1)}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
            <Button onClick={addItem} className="w-full md:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Add to Order
            </Button>
          </CardContent>
        </Card>

        {/* Items */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              Order Items ({orderItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {orderItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No items added yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {orderItems.map((item, index) => {
                  const gross = item.quantity * item.unit_price;
                  const disc = gross * (item.discount_percent / 100);
                  const taxable = gross - disc;
                  const tax = (taxable * item.gst_percent) / 100;
                  const lineTotal = taxable + tax;
                  return (
                    <div key={index} className="p-3 rounded-lg bg-muted/50 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {item.product_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            ₹
                            {item.unit_price.toLocaleString('en-IN', {
                              maximumFractionDigits: 2,
                            })}{' '}
                            / {item.unit}
                            {item.hsn_code && <span className="ml-2">HSN: {item.hsn_code}</span>}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive h-8 w-8"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                        <div>
                          <Label className="text-xs">Qty</Label>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() =>
                                updateItem(index, {
                                  quantity: Math.max(1, item.quantity - 1),
                                })
                              }
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) =>
                                updateItem(index, {
                                  quantity: Math.max(1, parseInt(e.target.value) || 1),
                                })
                              }
                              className="text-center h-8"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => updateItem(index, { quantity: item.quantity + 1 })}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Discount %</Label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={item.discount_percent}
                            onChange={(e) =>
                              updateItem(index, {
                                discount_percent: Math.max(
                                  0,
                                  Math.min(100, parseFloat(e.target.value) || 0),
                                ),
                              })
                            }
                            className="h-8"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">GST %</Label>
                          <Input
                            type="number"
                            min={0}
                            max={28}
                            value={item.gst_percent}
                            onChange={(e) =>
                              updateItem(index, {
                                gst_percent: Math.max(
                                  0,
                                  Math.min(28, parseFloat(e.target.value) || 0),
                                ),
                              })
                            }
                            className="h-8"
                          />
                        </div>
                        <div className="text-right">
                          <Label className="text-xs">Line Total</Label>
                          <p className="font-semibold">
                            ₹{lineTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground pt-1 border-t">
                        <span>
                          Gross: ₹{gross.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                        {disc > 0 && (
                          <span className="text-green-600">
                            Disc: −₹
                            {disc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </span>
                        )}
                        <span>
                          Taxable: ₹
                          {taxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                        <span>
                          GST: ₹{tax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Totals breakdown card */}
        {orderItems.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="w-4 h-4" />
                Order Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal (gross)</span>
                  <span className="font-medium">
                    ₹{totals.subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
                {totals.totalDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Item Discount</span>
                    <span>
                      −₹
                      {totals.totalDiscount.toLocaleString('en-IN', {
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1.5">
                  <span className="text-muted-foreground">Taxable Value</span>
                  <span className="font-medium">
                    ₹{totals.taxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CGST</span>
                  <span>
                    ₹{totals.cgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SGST</span>
                  <span>
                    ₹{totals.sgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
                {Math.abs(totals.roundOff) > 0.001 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Round-off</span>
                    <span>
                      {totals.roundOff >= 0 ? '+' : '−'}₹
                      {Math.abs(totals.roundOff).toLocaleString('en-IN', {
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 text-lg font-bold">
                  <span>Grand Total</span>
                  <span className="text-primary">
                    ₹{totals.grandTotal.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Order details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Order Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Expected Delivery Date</Label>
              <Input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div>
              <Label>Notes / Special Instructions</Label>
              <Textarea
                placeholder="Any special requirements or notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Sticky bottom action bar */}
      {orderItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t shadow-lg p-4 z-40">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="w-full md:w-auto text-sm">
              <div className="flex items-center justify-between md:justify-start gap-6">
                <span className="text-muted-foreground">
                  {orderItems.length} item{orderItems.length === 1 ? '' : 's'}
                </span>
                <span className="text-lg font-bold text-primary">
                  ₹{totals.grandTotal.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <Button
                variant="outline"
                onClick={() => saveOrder(false)}
                disabled={loading}
                className="flex-1 md:flex-none"
              >
                <Save className="w-4 h-4 mr-2" />
                {isEditMode ? 'Save Draft' : 'Save Draft'}
              </Button>
              <Button
                onClick={() => saveOrder(true)}
                disabled={loading}
                className="flex-1 md:flex-none"
              >
                <Send className="w-4 h-4 mr-2" />
                {isEditMode ? 'Update & Submit' : 'Submit Order'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreatePrimaryOrder;
