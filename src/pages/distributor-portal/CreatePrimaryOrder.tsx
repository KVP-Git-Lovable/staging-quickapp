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
import { PaymentDetailsCard } from '@/components/distributor-portal/PaymentDetailsCard';
import ShippingAddressPicker from '@/components/distributor-portal/ShippingAddressPicker';
import { formatAddress, hasMinimumAddress } from '@/lib/addressFormat';
import { useSavedAddresses } from '@/hooks/useSavedAddresses';
import { useWarehouses } from '@/hooks/useWarehouses';

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

interface UomOption {
  code: string;
  name: string;
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
  // UI-only — not persisted
  category_id?: string;
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
  const [productUoms, setProductUoms] = useState<Record<string, UomOption[]>>({});
  const [productStock, setProductStock] = useState<Record<string, number>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState<string>('30');
  const [shipping, setShipping] = useState<import('@/components/distributor-portal/ShippingAddressPicker').ShippingSelection>({
    source: 'warehouse',
    warehouseId: null,
    savedAddressId: null,
    custom: { address_line1: '', address_line2: '', city: '', state: '', pincode: '', country: 'India', landmark: '', contact_person: '', contact_phone: '' },
    customLatitude: null,
    customLongitude: null,
    saveCustom: false,
    customLabel: '',
  });
  const [showSummaryDetails, setShowSummaryDetails] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(true);
  const [priceBookName, setPriceBookName] = useState<string>('');
  const [creditLimit, setCreditLimit] = useState<number>(0);
  const [outstanding, setOutstanding] = useState<number>(0);
  const [creditChecked, setCreditChecked] = useState(false);
  const [existingOrder, setExistingOrder] = useState<any>(null);
  // Payment & Credit config (Phase 3)
  const [paymentConfig, setPaymentConfig] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [payment, setPayment] = useState<import('@/components/distributor-portal/PaymentDetailsCard').PaymentDetailsValue>({
    paymentTerm: 'immediate',
    paymentMode: 'bank_transfer',
    advanceAmount: 0,
    paymentProofUrl: null,
  });

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

  // Seed one empty product row by default (only for new orders, once products load)
  useEffect(() => {
    if (isEditMode) return;
    if (productsLoading) return;
    if (orderItems.length > 0) return;
    setOrderItems([
      {
        product_id: '',
        product_name: '',
        quantity: 1,
        unit: 'pieces',
        unit_price: 0,
        discount_percent: 0,
        gst_percent: DEFAULT_GST,
        line_total: 0,
        category_id: 'all',
      } as OrderItem,
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsLoading, isEditMode]);

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
      // New config-driven loader: read distributor_payment_config + live snapshot RPC
      const [{ data: cfg }, { data: snap }, ordersRes] = await Promise.all([
        (supabase as any)
          .from('distributor_payment_config')
          .select('*')
          .eq('distributor_id', distributorId)
          .maybeSingle(),
        (supabase as any).rpc('get_distributor_financial_snapshot', { p_distributor_id: distributorId }),
        supabase
          .from('primary_orders')
          .select('total_amount')
          .eq('distributor_id', distributorId)
          .not('status', 'in', '("cancelled","delivered")'),
      ]);
      const snapshotRow = Array.isArray(snap) ? snap[0] : null;
      setPaymentConfig(cfg || null);
      setSnapshot(snapshotRow || null);
      setCreditLimit(Number(cfg?.credit_limit ?? snapshotRow?.credit_limit ?? 0));
      const totalOutstanding =
        snapshotRow?.outstanding != null
          ? Number(snapshotRow.outstanding)
          : (ordersRes.data || []).reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
      setOutstanding(totalOutstanding);
      // Seed payment defaults from config (term + mode only; advance amount is edited in the card)
      if (cfg) {
        setPayment((prev) => ({
          ...prev,
          paymentTerm: cfg.default_payment_term ?? prev.paymentTerm,
          paymentMode: cfg.default_payment_mode ?? prev.paymentMode,
        }));
      }
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

      const productIds = enriched.map((p: any) => p.id);
      if (productIds.length > 0) {
        // UOM options per product
        const { data: uomRows } = await supabase
          .from('product_uom_mapping')
          .select('product_id, is_default_sales, is_base, uom_master(code, name)')
          .in('product_id', productIds)
          .eq('is_active', true);
        const uomMap: Record<string, UomOption[]> = {};
        (uomRows || []).forEach((r: any) => {
          const u = r.uom_master;
          if (!u) return;
          if (!uomMap[r.product_id]) uomMap[r.product_id] = [];
          // default-sales first, then base, then rest
          const entry = { code: u.code, name: u.name };
          if (r.is_default_sales) uomMap[r.product_id].unshift(entry);
          else uomMap[r.product_id].push(entry);
        });
        setProductUoms(uomMap);

        // Stock available per product (sum across variants/batches for this distributor)
        if (distributorId) {
          const { data: invRows } = await supabase
            .from('distributor_inventory')
            .select('product_id, quantity, reserved_quantity, damaged_quantity, expired_quantity')
            .eq('distributor_id', distributorId)
            .in('product_id', productIds);
          const stockMap: Record<string, number> = {};
          (invRows || []).forEach((r: any) => {
            const avail = Math.max(
              0,
              Number(r.quantity || 0) -
                Number(r.reserved_quantity || 0) -
                Number(r.damaged_quantity || 0) -
                Number(r.expired_quantity || 0),
            );
            stockMap[r.product_id] = (stockMap[r.product_id] || 0) + avail;
          });
          setProductStock(stockMap);
        }
      }
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
    const validItems = orderItems.filter((it) => it.product_id);
    if (validItems.length === 0) {
      toast.error('Please add at least one item');
      return;
    }
    // Payment validations (Phase 3 — driven by distributor_payment_config)
    if (submit) {
      const cfg = paymentConfig;
      const isImmediate = payment.paymentTerm === 'immediate';

      // Credit gating — skip for immediate payment
      if (!isImmediate && creditLimit > 0) {
        const newOutstanding = outstanding + Math.max(0, totals.grandTotal - (payment.advanceAmount || 0));
        const overLimit = newOutstanding > creditLimit;
        const allowBeyond = cfg?.allow_orders_beyond_limit;
        if (overLimit && !allowBeyond) {
          toast.error(
            `Credit limit exceeded! Limit: ₹${creditLimit.toLocaleString('en-IN')}, Outstanding + this order (net of advance): ₹${newOutstanding.toLocaleString('en-IN')}.`,
            { duration: 6000 },
          );
          return;
        }
        if (overLimit && cfg?.approval_required_beyond_limit) {
          toast.warning('Order exceeds credit limit — will require approval before processing.');
        }
      }

      // Advance amount validation
      if (payment.advanceAmount > totals.grandTotal) {
        toast.error('Advance amount cannot exceed order total');
        return;
      }
      const minAdvance = cfg?.require_advance_payment && cfg?.advance_payment_pct > 0
        ? Math.round((totals.grandTotal * Number(cfg.advance_payment_pct)) / 100)
        : 0;
      if (minAdvance > 0 && (payment.advanceAmount || 0) < minAdvance) {
        toast.error(`Minimum advance payment of ₹${minAdvance.toLocaleString('en-IN')} (${cfg.advance_payment_pct}%) required`);
        return;
      }

      // Payment proof requirement
      const proofRequired = cfg?.require_payment_proof || payment.paymentTerm === 'advance';
      if (proofRequired && !payment.paymentProofUrl) {
        toast.error('Payment proof is required for this order');
        return;
      }
    }

    setLoading(true);
    try {
      let orderId = editOrderId as string | undefined;

      const creditSnapshot = {
        credit_limit: creditLimit,
        outstanding,
        available_credit: Math.max(0, creditLimit - outstanding),
        utilization_pct: creditLimit > 0 ? Math.round((outstanding / creditLimit) * 100) : 0,
        captured_at: new Date().toISOString(),
      };

      const headerPayload: any = {
        distributor_id: distributorId,
        source_distributor_id: distributorId,
        expected_delivery_date: expectedDeliveryDate || null,
        notes,
        status: submit ? 'submitted' : 'draft',
        subtotal: totals.subtotal,
        discount_amount: totals.totalDiscount,
        tax_amount: totals.taxAmount,
        total_amount: totals.grandTotal,
        payment_term: payment.paymentTerm,
        payment_mode: payment.paymentMode,
        advance_amount: payment.advanceAmount || 0,
        payment_proof_url: payment.paymentProofUrl,
        credit_snapshot: submit ? creditSnapshot : null,
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

      const itemsToInsert = validItems.map((it) => {
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
          
          tax_percent: it.gst_percent,
          
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
    <div className="min-h-screen bg-gradient-to-b from-muted/40 via-muted/20 to-background pb-32 standalone-page">
      <main className="max-w-7xl mx-auto px-4 lg:px-6 py-6 space-y-5">
        {/* Section 1: Header strip */}
        <Card className="rounded-xl shadow-sm border-l-4 border-l-primary overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 hover:bg-primary/10 hover:text-primary"
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
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary ring-1 ring-inset ring-primary/20">
                      {orderItems.length} {orderItems.length === 1 ? 'item' : 'items'}
                    </span>
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
                className="shrink-0 hover:border-primary/40 hover:text-primary"
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
                        className={`w-9 h-9 rounded-full grid place-items-center text-sm font-semibold shrink-0 transition-all ${
                          isActive
                            ? 'bg-primary text-primary-foreground ring-4 ring-primary/15 shadow-sm'
                            : isDone
                              ? 'bg-emerald-500 text-white'
                              : 'bg-muted text-muted-foreground border border-border'
                        }`}
                      >
                        {isDone ? <Check className="w-4 h-4" /> : step.num}
                      </div>
                      <div className="min-w-0 hidden sm:block">
                        <p className={`text-sm font-semibold leading-tight ${isActive ? 'text-primary' : isDone ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {step.title}
                        </p>
                        <p className="text-xs text-muted-foreground leading-tight mt-0.5 truncate">
                          {step.subtitle}
                        </p>
                      </div>
                    </div>
                    {idx < steps.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-3 rounded-full ${step.num < activeStep ? 'bg-emerald-400' : 'bg-border'}`} />
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
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-md bg-primary/10 grid place-items-center ring-1 ring-inset ring-primary/20">
                      <ShoppingBag className="w-4 h-4 text-primary" />
                    </span>

                    Add Products
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                      Category
                    </Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger className="w-[200px] h-9">
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
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-3">
                {/* Header row */}
                <div className="hidden md:grid md:grid-cols-[2fr_1.1fr_1.1fr_1fr_auto] gap-3 px-1 text-xs font-medium text-muted-foreground">
                  <div>Select Product</div>
                  <div>Unit</div>
                  <div>Quantity</div>
                  <div>Available Stock</div>
                  <div className="w-8" />
                </div>

                {orderItems.length === 0 && (
                  <div className="text-center py-6 text-xs text-muted-foreground border border-dashed rounded-lg">
                    No products yet — click "Add New Row" below to start.
                  </div>
                )}

                {orderItems.map((item, index) => {
                  const rowProducts =
                    selectedCategory === 'all'
                      ? products
                      : selectedCategory === 'uncategorized'
                        ? products.filter((p) => !p.category_id)
                        : products.filter((p) => p.category_id === selectedCategory);
                  const uomOptions = productUoms[item.product_id] || [];
                  const fallbackUnit =
                    products.find((p) => p.id === item.product_id)?.unit || item.unit || 'pieces';
                  const unitChoices: UomOption[] =
                    uomOptions.length > 0
                      ? uomOptions
                      : [{ code: fallbackUnit, name: fallbackUnit }];
                  const stockQty = productStock[item.product_id] ?? 0;
                  const inStock = stockQty > 0;

                  return (
                    <div
                      key={index}
                      className="grid grid-cols-1 md:grid-cols-[2fr_1.1fr_1.1fr_1fr_auto] gap-3 items-center py-2 border-b last:border-b-0"
                    >
                      {/* Product */}
                      <Select
                        value={item.product_id || ''}
                        onValueChange={(v) => {
                          const p = products.find((pr) => pr.id === v);
                          if (!p) return;
                          const price = getProductPrice(p);
                          const defaultUom = (productUoms[v] && productUoms[v][0]?.code) || p.unit || 'pieces';
                          updateItem(index, {
                            product_id: p.id,
                            product_name: p.name,
                            unit: defaultUom,
                            unit_price: price,
                            hsn_code: p.hsn_code,
                            sku: (p as any).sku,
                            image_url: (p as any).image_url,
                            price_book_applied: p.priceBookPrice !== undefined,
                            category_id: p.category_id,
                            line_total: item.quantity * price,
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a product..." />
                        </SelectTrigger>
                        <SelectContent>
                          {productsLoading ? (
                            <SelectItem value="loading" disabled>
                              Loading...
                            </SelectItem>
                          ) : rowProducts.length === 0 ? (
                            <SelectItem value="none" disabled>
                              No products
                            </SelectItem>
                          ) : (
                            rowProducts.map((p) => {
                              const price = getProductPrice(p);
                              const hasPB = p.priceBookPrice !== undefined;
                              return (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} - ₹{price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                  {hasPB && <span className="text-primary ml-1">★</span>}
                                </SelectItem>
                              );
                            })
                          )}
                        </SelectContent>
                      </Select>

                      {/* Unit */}
                      <Select
                        value={item.unit}
                        onValueChange={(v) => updateItem(index, { unit: v })}
                        disabled={!item.product_id}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Unit" />
                        </SelectTrigger>
                        <SelectContent>
                          {unitChoices.map((u) => (
                            <SelectItem key={u.code} value={u.code}>
                              {u.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Quantity */}
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() =>
                            updateItem(index, { quantity: Math.max(1, item.quantity - 1) })
                          }
                          disabled={!item.product_id}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        <Input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={item.quantity === 0 ? '' : item.quantity}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, '');
                            updateItem(index, { quantity: raw === '' ? 0 : parseInt(raw, 10) });
                          }}
                          onBlur={(e) => {
                            const n = parseInt(e.target.value, 10);
                            if (!n || n < 1) updateItem(index, { quantity: 1 });
                          }}
                          className="h-9 text-center px-1"
                          disabled={!item.product_id}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => updateItem(index, { quantity: item.quantity + 1 })}
                          disabled={!item.product_id}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      {/* Available Stock */}
                      <div className="text-sm">
                        {item.product_id ? (
                          <>
                            <p className="font-semibold text-foreground leading-tight">{stockQty}</p>
                            <p
                              className={`text-[11px] leading-tight ${
                                inStock ? 'text-emerald-600' : 'text-destructive'
                              }`}
                            >
                              {inStock ? 'In Stock' : 'Out of Stock'}
                            </p>
                          </>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </div>

                      {/* Delete */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => removeItem(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}

                <Button
                  variant="ghost"
                  className="w-full border-2 border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"

                  onClick={() => {
                    setOrderItems((prev) => [
                      ...prev,
                      {
                        product_id: '',
                        product_name: '',
                        quantity: 1,
                        unit: 'pieces',
                        unit_price: 0,
                        discount_percent: 0,
                        gst_percent: DEFAULT_GST,
                        line_total: 0,
                        category_id: 'all',
                      },
                    ]);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Row
                </Button>
              </CardContent>
            </Card>

            {/* Section 4: Order Items table */}
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="p-5 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-md bg-primary/10 grid place-items-center ring-1 ring-inset ring-primary/20">
                      <ShoppingCart className="w-4 h-4 text-primary" />
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
                                      type="text"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      value={item.quantity === 0 ? '' : item.quantity}
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => {
                                        const raw = e.target.value.replace(/[^0-9]/g, '');
                                        updateItem(index, { quantity: raw === '' ? 0 : parseInt(raw, 10) });
                                      }}
                                      onBlur={(e) => {
                                        const n = parseInt(e.target.value, 10);
                                        if (!n || n < 1) updateItem(index, { quantity: 1 });
                                      }}
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
                    {distributorId && (
                      <ShippingAddressPicker
                        distributorId={distributorId}
                        value={shipping}
                        onChange={setShipping}
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Section 5b: Payment Details (Phase 3 — driven by distributor_payment_config) */}
            <PaymentDetailsCard
              value={payment}
              onChange={setPayment}
              grandTotal={totals.grandTotal}
              requireAdvance={!!paymentConfig?.require_advance_payment}
              requireProof={!!paymentConfig?.require_payment_proof || payment.paymentTerm === 'advance'}
              canOverride={false}
              distributorId={distributorId || ''}
              allowedModes={paymentConfig?.allowed_payment_modes ?? undefined}
              allowedTerms={paymentConfig?.allowed_payment_terms ?? undefined}
            />

          </div>

          {/* RIGHT sticky panel */}
          <aside className="lg:sticky lg:top-6 space-y-5 self-start">
            {/* Order Summary */}
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-md bg-primary/10 grid place-items-center ring-1 ring-inset ring-primary/20">
                    <Receipt className="w-4 h-4 text-primary" />
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

                <div className="mt-2 rounded-lg bg-primary/5 border border-primary/15 p-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Estimated Grand Total</span>
                  <span className="text-xl font-extrabold text-primary tracking-tight">
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
                    <span className="w-7 h-7 rounded-md bg-primary/10 grid place-items-center ring-1 ring-inset ring-primary/20">
                      <CreditCard className="w-4 h-4 text-primary" />
                    </span>

                    Credit Validation
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
                    <span className="text-muted-foreground">Outstanding Amount</span>
                    <span className={`font-medium ${outstanding > 0 ? 'text-rose-600' : ''}`}>₹{outstanding.toLocaleString('en-IN')}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Order Value</span>
                    <span className="font-medium">₹{thisOrderAmount.toLocaleString('en-IN')}</span>
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
                    Order value exceeds available credit.
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
                <p className="text-[11px] text-muted-foreground">Scheme Benefits</p>
                <p className="text-sm font-semibold text-emerald-600">- ₹{totals.totalDiscount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">GST ({avgGstPercent}%)</p>
                <p className="text-sm font-semibold">₹ {totals.taxAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Round Off</p>
                <p className="text-sm font-semibold">{totals.roundOff >= 0 ? '+' : '-'} ₹ {Math.abs(totals.roundOff).toFixed(2)}</p>
              </div>
              <div className="rounded-lg bg-primary/5 border border-primary/15 px-3 py-1.5">
                <p className="text-[11px] font-semibold text-primary uppercase tracking-wide">Grand Total</p>
                <p className="text-xl font-extrabold text-primary leading-tight">₹ {totals.grandTotal.toLocaleString('en-IN')}</p>
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
                {isEditMode ? 'Update & Submit' : 'Submit Primary Order'}
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
