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
  sku?: string;
  image_url?: string;
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
  sku?: string;
  image_url?: string;
  price_book_applied?: boolean;
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
  const [paymentTerms, setPaymentTerms] = useState<string>('30');
  const [shippingAddress, setShippingAddress] = useState<string>('');
  const [showSummaryDetails, setShowSummaryDetails] = useState(false);
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
          sku: (product as any).sku,
          image_url: (product as any).image_url,
          price_book_applied: product.priceBookPrice !== undefined,
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
        source_distributor_id: distributorId,
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

  const totalUnits = orderItems.reduce((s, it) => s + it.quantity, 0);
  const avgGstPercent = orderItems.length
    ? Math.round(orderItems.reduce((s, it) => s + it.gst_percent, 0) / orderItems.length)
    : 0;
  const thisOrderAmount = totals.grandTotal;
  const projectedOutstanding = outstanding + thisOrderAmount;
  const utilizationPct = creditLimit > 0
    ? Math.min(100, Math.round((projectedOutstanding / creditLimit) * 100))
    : 0;
  const isExceeded = creditLimit > 0 && projectedOutstanding > creditLimit;
  const isNearLimit = creditLimit > 0 && !isExceeded && projectedOutstanding > creditLimit * 0.85;
  const availableCredit = Math.max(0, creditLimit - projectedOutstanding);

  // Stepper state (purely visual)
  const activeStep = orderItems.length === 0
    ? 1
    : !expectedDeliveryDate
      ? 2
      : isExceeded
        ? 3
        : 4;

  const steps = [
    { num: 1, title: 'Add Products', subtitle: 'Select products and quantities' },
    { num: 2, title: 'Review Order', subtitle: 'Review pricing and schemes' },
    { num: 3, title: 'Credit Validation', subtitle: 'Check credit limit' },
    { num: 4, title: 'Submit', subtitle: 'Review and submit order' },
  ];

  const scrollToAddProducts = () => {
    document.getElementById('add-products-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-muted/30 pb-32 standalone-page">
      <main className="max-w-7xl mx-auto px-4 lg:px-6 py-6 space-y-5">
        {/* Section 1: Header strip */}
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
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
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold text-foreground truncate">
                    {isEditMode
                      ? `Edit Order${existingOrder?.order_number ? ` — ${existingOrder.order_number}` : ''}`
                      : 'New Primary Order'}
                  </h1>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>{orderItems.length} {orderItems.length === 1 ? 'item' : 'items'}</span>
                    {priceBookName && (
                      <>
                        <span>•</span>
                        <span><span className="font-medium text-foreground/80">Price Book:</span> {priceBookName}</span>
                      </>
                    )}
                    <span>•</span>
                    <span><span className="font-medium text-foreground/80">Order Date:</span> {format(new Date(), 'dd MMM yyyy')}</span>
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => saveOrder(false)}
                disabled={loading || orderItems.length === 0}
                className="shrink-0"
              >
                <FileText className="w-4 h-4 mr-2" />
                Save Draft
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Stepper */}
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-2">
              {steps.map((step, idx) => {
                const isActive = step.num === activeStep;
                const isDone = step.num < activeStep;
                return (
                  <div key={step.num} className="flex items-center flex-1 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-full grid place-items-center text-sm font-semibold shrink-0 transition-colors ${
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : isDone
                              ? 'bg-primary/10 text-primary border border-primary/30'
                              : 'bg-muted text-muted-foreground border border-border'
                        }`}
                      >
                        {isDone ? <Check className="w-4 h-4" /> : step.num}
                      </div>
                      <div className="min-w-0 hidden sm:block">
                        <p className={`text-sm font-medium leading-tight ${isActive || isDone ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {step.title}
                        </p>
                        <p className="text-xs text-muted-foreground leading-tight mt-0.5 truncate">
                          {step.subtitle}
                        </p>
                      </div>
                    </div>
                    {idx < steps.length - 1 && (
                      <div className={`flex-1 h-px mx-3 ${step.num < activeStep ? 'bg-primary/40' : 'bg-border'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Body: two-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
          {/* LEFT column */}
          <div className="space-y-5 min-w-0">
            {/* Section 3: Add Products */}
            <Card id="add-products-card" className="rounded-xl shadow-sm">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-md bg-muted/60 grid place-items-center">
                    <ShoppingBag className="w-4 h-4 text-foreground/70" />
                  </span>
                  Add Products
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_1fr] gap-4">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Category</Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="All Categories" />
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
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Select Product</Label>
                    <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Choose a product..." />
                      </SelectTrigger>
                      <SelectContent>
                        {productsLoading ? (
                          <SelectItem value="loading" disabled>Loading...</SelectItem>
                        ) : filteredProducts.length === 0 ? (
                          <SelectItem value="none" disabled>No products in this category</SelectItem>
                        ) : (
                          filteredProducts.map((p) => {
                            const price = getProductPrice(p);
                            const hasPB = p.priceBookPrice !== undefined;
                            return (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} - ₹{price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}/{p.unit || 'pc'}
                                {hasPB && <span className="text-primary ml-1">★</span>}
                              </SelectItem>
                            );
                          })
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Quantity</Label>
                    <div className="flex items-center gap-1.5 mt-1.5">
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
                <Button onClick={addItem} className="bg-foreground hover:bg-foreground/90 text-background">
                  <Plus className="w-4 h-4 mr-2" />
                  Add to Order
                </Button>
              </CardContent>
            </Card>

            {/* Section 4: Order Items table */}
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="p-5 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-md bg-muted/60 grid place-items-center">
                      <ShoppingCart className="w-4 h-4 text-foreground/70" />
                    </span>
                    Order Items ({orderItems.length})
                  </CardTitle>
                  {orderItems.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setOrderItems([])}
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" />
                      Clear All
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {orderItems.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No items added yet</p>
                    <p className="text-xs mt-1">Use the form above to add products to your order.</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent bg-muted/30">
                            <TableHead className="font-semibold text-foreground/70">Product</TableHead>
                            <TableHead className="font-semibold text-foreground/70">Quantity</TableHead>
                            <TableHead className="font-semibold text-foreground/70">Unit Price (₹)</TableHead>
                            <TableHead className="font-semibold text-foreground/70">Price Source</TableHead>
                            <TableHead className="font-semibold text-foreground/70">Scheme Applied</TableHead>
                            <TableHead className="font-semibold text-foreground/70">GST</TableHead>
                            <TableHead className="font-semibold text-foreground/70 text-right">Line Total (₹)</TableHead>
                            <TableHead className="font-semibold text-foreground/70 text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orderItems.map((item, index) => {
                            const gross = item.quantity * item.unit_price;
                            const disc = gross * (item.discount_percent / 100);
                            const taxable = gross - disc;
                            const tax = (taxable * item.gst_percent) / 100;
                            const lineTotal = taxable + tax;
                            const productLookup = products.find((p) => p.id === item.product_id);
                            const imgUrl = item.image_url || (productLookup as any)?.image_url;
                            const sku = item.sku || (productLookup as any)?.sku;
                            const pbApplied = item.price_book_applied || productLookup?.priceBookPrice !== undefined;
                            const schemeName = (productLookup as any)?.scheme_name || (item as any).scheme_name;
                            const schemeDetail = (productLookup as any)?.scheme_detail || (item as any).scheme_detail;

                            return (
                              <TableRow key={index} className="align-middle">
                                <TableCell>
                                  <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-md bg-muted/70 grid place-items-center overflow-hidden shrink-0">
                                      {imgUrl ? (
                                        <img src={imgUrl} alt={item.product_name} className="w-full h-full object-cover" />
                                      ) : (
                                        <Package className="w-5 h-5 text-muted-foreground" />
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-medium text-foreground leading-tight">
                                        {item.product_name}
                                      </p>
                                      {sku && (
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                          SKU: {sku}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => updateItem(index, { quantity: Math.max(1, item.quantity - 1) })}
                                    >
                                      <Minus className="w-3 h-3" />
                                    </Button>
                                    <Input
                                      type="number"
                                      value={item.quantity}
                                      onChange={(e) => updateItem(index, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                                      className="h-7 w-14 text-center px-1"
                                    />
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => updateItem(index, { quantity: item.quantity + 1 })}
                                    >
                                      <Plus className="w-3 h-3" />
                                    </Button>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground mt-1 text-center">Units</p>
                                </TableCell>
                                <TableCell className="font-medium">
                                  ₹{item.unit_price.toFixed(2)}
                                </TableCell>
                                <TableCell>
                                  {pbApplied ? (
                                    <div>
                                      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 text-[10px] px-1.5 py-0 h-5">
                                        Price Book
                                      </Badge>
                                      <p className="text-[10px] text-muted-foreground mt-1">{priceBookName || 'Distributor Price Book'}</p>
                                    </div>
                                  ) : (
                                    <div>
                                      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-[10px] px-1.5 py-0 h-5">
                                        MRP
                                      </Badge>
                                      <p className="text-[10px] text-muted-foreground mt-1">MRP Applied</p>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {schemeName ? (
                                    <div>
                                      <Badge variant="outline" className="border-orange-300 bg-orange-50 text-orange-700 text-[10px] px-1.5 py-0 h-5">
                                        {schemeName}
                                      </Badge>
                                      {schemeDetail && (
                                        <p className="text-[10px] text-muted-foreground mt-1">{schemeDetail}</p>
                                      )}
                                    </div>
                                  ) : (
                                    <div>
                                      <span className="text-sm text-muted-foreground">—</span>
                                      <p className="text-[10px] text-muted-foreground mt-1">No Scheme</p>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {item.gst_percent}%
                                </TableCell>
                                <TableCell className="text-right font-semibold">
                                  ₹{lineTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => removeItem(index)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="border-t p-3">
                      <Button
                        variant="ghost"
                        className="w-full border border-dashed text-primary hover:bg-primary/5"
                        onClick={scrollToAddProducts}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add More Products
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Section 5: Order Details */}
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-md bg-muted/60 grid place-items-center">
                    <FileText className="w-4 h-4 text-foreground/70" />
                  </span>
                  Order Details
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Left column */}
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Expected Delivery Date</Label>
                      <Input
                        type="date"
                        value={expectedDeliveryDate}
                        onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Notes / Special Instructions</Label>
                      <Textarea
                        placeholder="Any special requirements or notes..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        maxLength={500}
                        className="mt-1.5 resize-none"
                      />
                      <p className="text-[10px] text-muted-foreground text-right mt-1">{notes.length} / 500</p>
                    </div>
                  </div>

                  {/* Right column */}
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">
                        Shipping Address <span className="text-muted-foreground/70">(Optional)</span>
                      </Label>
                      {/* TODO: persist shipping_address_id to primary_orders once column is wired */}
                      <Select value={shippingAddress} onValueChange={setShippingAddress}>
                        <SelectTrigger className="mt-1.5">
                          <SelectValue placeholder="Select shipping address" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Default Address</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="ghost"
                      className="w-full border border-dashed text-primary hover:bg-primary/5"
                      onClick={() => toast.info('Address management coming soon')}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add New Address
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT sticky panel */}
          <aside className="lg:sticky lg:top-6 space-y-5 self-start">
            {/* Order Summary */}
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-md bg-muted/60 grid place-items-center">
                    <Receipt className="w-4 h-4 text-foreground/70" />
                  </span>
                  Order Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Products</span>
                  <span className="font-medium">{orderItems.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Units</span>
                  <span className="font-medium">{totalUnits}</span>
                </div>
                <div className="flex justify-between border-t pt-2.5">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">₹{totals.subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                {totals.totalDiscount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Scheme Benefits</span>
                    <span className="font-medium text-emerald-600">- ₹{totals.totalDiscount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST ({avgGstPercent}%)</span>
                  <span className="font-medium">₹{totals.taxAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>

                {showSummaryDetails && (
                  <div className="border-t pt-2 space-y-1.5 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>CGST</span>
                      <span>₹{totals.cgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>SGST</span>
                      <span>₹{totals.sgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Round Off</span>
                      <span>{totals.roundOff >= 0 ? '+' : '−'}₹{Math.abs(totals.roundOff).toFixed(2)}</span>
                    </div>
                  </div>
                )}

                <div className="border-t pt-3 flex items-center justify-between">
                  <span className="font-semibold text-foreground">Estimated Grand Total</span>
                  <span className="text-xl font-bold text-primary">
                    ₹{totals.grandTotal.toLocaleString('en-IN')}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-primary hover:bg-primary/5 mt-1"
                  onClick={() => setShowSummaryDetails((v) => !v)}
                >
                  {showSummaryDetails ? 'Hide Details' : 'View Details'}
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </CardContent>
            </Card>

            {/* Credit Utilization */}
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="p-5 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-md bg-muted/60 grid place-items-center">
                      <CreditCard className="w-4 h-4 text-foreground/70" />
                    </span>
                    Credit Utilization
                    <Info className="w-3.5 h-3.5 text-muted-foreground" />
                  </CardTitle>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-2 py-0 h-5 ${
                      isExceeded
                        ? 'bg-destructive/10 text-destructive border-destructive/30'
                        : isNearLimit
                          ? 'bg-amber-50 text-amber-700 border-amber-300'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    }`}
                  >
                    {isExceeded ? 'Exceeded' : isNearLimit ? 'Near Limit' : 'Within Limit'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-3 text-sm">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Credit Limit</span>
                    <span className="font-medium">₹ {creditLimit.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Outstanding</span>
                    <span className="font-medium">₹ {outstanding.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">This Order (Est.)</span>
                    <span className="font-medium">₹ {thisOrderAmount.toLocaleString('en-IN')}</span>
                  </div>
                </div>
                <div>
                  <div className="relative">
                    <Progress
                      value={utilizationPct}
                      className={`h-2 ${
                        isExceeded
                          ? '[&>div]:bg-destructive'
                          : isNearLimit
                            ? '[&>div]:bg-amber-500'
                            : '[&>div]:bg-emerald-500'
                      }`}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-right mt-1">{utilizationPct}% Used</p>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-muted-foreground">Available Credit</span>
                  <span className={`font-semibold ${isExceeded ? 'text-destructive' : 'text-emerald-600'}`}>
                    ₹ {availableCredit.toLocaleString('en-IN')}
                  </span>
                </div>
                {isExceeded && (
                  <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded px-2 py-1.5">
                    Order exceeds credit limit. Submission disabled.
                  </p>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>

      {/* Section 7: Sticky bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t shadow-[0_-4px_12px_rgba(0,0,0,0.04)] z-40">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="grid grid-cols-3 md:flex md:items-center gap-x-8 gap-y-3">
              <div>
                <p className="text-[11px] text-muted-foreground">Subtotal</p>
                <p className="text-sm font-semibold">₹ {totals.subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Discount</p>
                <p className="text-sm font-semibold text-destructive">- ₹ {totals.totalDiscount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">GST ({avgGstPercent}%)</p>
                <p className="text-sm font-semibold">₹ {totals.taxAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Round Off</p>
                <p className="text-sm font-semibold">{totals.roundOff >= 0 ? '+' : '-'} ₹ {Math.abs(totals.roundOff).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Grand Total</p>
                <p className="text-xl font-bold text-primary leading-tight">₹ {totals.grandTotal.toLocaleString('en-IN')}</p>
              </div>
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <Button
                variant="outline"
                onClick={() => saveOrder(false)}
                disabled={loading || orderItems.length === 0}
                className="flex-1 md:flex-none"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Draft
              </Button>
              <Button
                onClick={() => saveOrder(true)}
                disabled={loading || orderItems.length === 0 || isExceeded}
                className="flex-1 md:flex-none"
              >
                <Send className="w-4 h-4 mr-2" />
                {isEditMode ? 'Update & Submit' : 'Submit Order'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreatePrimaryOrder;
