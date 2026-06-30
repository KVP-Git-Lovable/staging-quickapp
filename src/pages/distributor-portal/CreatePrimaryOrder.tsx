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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft, Plus, Minus, Trash2, ShoppingBag, Save, Send,
  CreditCard, ArrowRight, Check, Gift, FileText, Truck, Receipt, ChevronRight,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { PaymentDetailsCard } from '@/components/distributor-portal/PaymentDetailsCard';
import ShippingAddressPicker from '@/components/distributor-portal/ShippingAddressPicker';
import { formatAddress, hasMinimumAddress } from '@/lib/addressFormat';
import { useSavedAddresses } from '@/hooks/useSavedAddresses';
import { useWarehouses } from '@/hooks/useWarehouses';
import { cn } from '@/lib/utils';
import { fetchAllPaginated } from '@/utils/fetchAllPaginated';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ChevronsUpDown } from 'lucide-react';
import { resolveProduct } from '@/utils/resolveProduct';
import { usePortalAvailability } from '@/hooks/usePortalAvailability';
import { buildDistributorContext, filterAvailableProducts } from '@/utils/productAvailability';

interface Category { id: string; name: string; }
interface PriceBookEntry { product_id: string; variant_id: string | null; final_price: number; list_price: number; }
interface Product {
  id: string; name: string; category_id?: string; category_name?: string;
  unit?: string; price?: number; priceBookPrice?: number;
  hsn_code?: string; sku?: string; image_url?: string; variants?: any[];
}
interface UomOption { code: string; name: string; }
interface OrderItem {
  product_id: string; variant_id?: string; product_name: string; variant_name?: string;
  quantity: number; unit: string; unit_price: number; discount_percent: number;
  gst_percent: number; hsn_code?: string; sku?: string; image_url?: string;
  price_book_applied?: boolean; line_total: number; category_id?: string;
  applied_scheme_id?: string | null;
  scheme_manually_set?: boolean;
}
interface SchemeRow {
  id: string; name: string; scheme_type: string;
  product_id: string | null; free_product_id: string | null;
  discount_percentage: number | null; discount_amount: number | null;
  buy_quantity: number | null; free_quantity: number | null;
  condition_quantity: number | null; min_order_value: number | null;
  start_date: string | null; end_date: string | null;
  is_active: boolean | null;
}

const DEFAULT_GST = 18;

const CreatePrimaryOrder = () => {
  const navigate = useNavigate();
  const { id: editOrderId } = useParams();
  const isEditMode = Boolean(editOrderId);

  // ===== existing state =====
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [priceBookEntries, setPriceBookEntries] = useState<PriceBookEntry[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [productUoms, setProductUoms] = useState<Record<string, UomOption[]>>({});
  const [productStock, setProductStock] = useState<Record<string, number>>({});
  const [schemes, setSchemes] = useState<SchemeRow[]>([]);
  const [supplierStock, setSupplierStock] = useState<Record<string, number> | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [shipping, setShipping] = useState<import('@/components/distributor-portal/ShippingAddressPicker').ShippingSelection>({
    source: 'warehouse', warehouseId: null, savedAddressId: null,
    custom: { address_line1: '', address_line2: '', city: '', state: '', pincode: '', country: 'India', landmark: '', contact_person: '', contact_phone: '' },
    customLatitude: null, customLongitude: null, saveCustom: false, customLabel: '',
  });
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(true);
  const [priceBookName, setPriceBookName] = useState<string>('');
  const [creditLimit, setCreditLimit] = useState<number>(0);
  const [outstanding, setOutstanding] = useState<number>(0);
  const [existingOrder, setExistingOrder] = useState<any>(null);
  const [paymentConfig, setPaymentConfig] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [distributor, setDistributor] = useState<any>(null);
  const [payment, setPayment] = useState<import('@/components/distributor-portal/PaymentDetailsCard').PaymentDetailsValue>({
    paymentTerm: 'immediate', paymentMode: 'bank_transfer', advanceAmount: 0, paymentProofUrl: null,
  });

  // ===== wizard state =====
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [maxReachedStep, setMaxReachedStep] = useState<1 | 2 | 3>(1);

  const distributorId = localStorage.getItem('distributor_id');
  // Phase 7-3: distributor portal needs availability maps for its own ctx.
  const { availabilityByProductId, territoriesById } = usePortalAvailability();

  const { warehouses: allWarehouses } = useWarehouses(distributorId);
  const { addresses: savedAddresses, create: createSavedAddress } = useSavedAddresses(distributorId);

  useEffect(() => {
    if (!distributorId) { navigate('/distributor-portal/login'); return; }
    loadData();
    loadCreditInfo();
    loadDistributor();
    loadSchemes();
  }, [distributorId, navigate]); // eslint-disable-line

  useEffect(() => {
    if (!isEditMode || !editOrderId || productsLoading) return;
    loadExistingOrder(editOrderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, editOrderId, productsLoading]);

  useEffect(() => {
    if (isEditMode) return;
    if (productsLoading) return;
    if (orderItems.length > 0) return;
    setOrderItems([{
      product_id: '', product_name: '', quantity: 1, unit: 'pieces',
      unit_price: 0, discount_percent: 0, gst_percent: DEFAULT_GST,
      line_total: 0, category_id: 'all',
    } as OrderItem]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsLoading, isEditMode]);

  const loadDistributor = async () => {
    if (!distributorId) return;
    try {
      const { data } = await supabase.from('distributors').select('*').eq('id', distributorId).maybeSingle();
      setDistributor(data);
    } catch (e) { console.warn('distributor load failed', e); }
  };

  const loadExistingOrder = async (orderId: string) => {
    try {
      const { data, error } = await supabase
        .from('primary_orders')
        .select('*, primary_order_items(*)')
        .eq('id', orderId).single();
      if (error) throw error;
      if (data.status !== 'draft') {
        toast.error('Only draft orders can be edited');
        navigate(`/distributor-portal/primary-order/${orderId}`);
        return;
      }
      setExistingOrder(data);
      setExpectedDeliveryDate(data.expected_delivery_date || '');
      setNotes(data.notes || '');
      const src = (data as any).shipping_address_source as 'warehouse' | 'saved' | 'custom' | null;
      if (src === 'warehouse' && (data as any).shipping_warehouse_id) {
        setShipping(s => ({ ...s, source: 'warehouse', warehouseId: (data as any).shipping_warehouse_id }));
      } else if (src === 'saved' && (data as any).shipping_saved_address_id) {
        setShipping(s => ({ ...s, source: 'saved', savedAddressId: (data as any).shipping_saved_address_id }));
      } else if (src === 'custom' && (data as any).shipping_address) {
        setShipping(s => ({
          ...s, source: 'custom',
          custom: { ...s.custom!, address_line1: (data as any).shipping_address, contact_person: (data as any).shipping_contact_person || '', contact_phone: (data as any).shipping_contact_phone || '' },
          customLatitude: (data as any).shipping_latitude ?? null,
          customLongitude: (data as any).shipping_longitude ?? null,
        }));
      }
      const items: OrderItem[] = (data.primary_order_items || []).map((it: any) => ({
        product_id: it.product_id, variant_id: it.variant_id || undefined,
        product_name: it.product_name, variant_name: it.variant_name || undefined,
        quantity: Number(it.quantity || 0), unit: it.unit || 'pieces',
        unit_price: Number(it.unit_price || 0), discount_percent: Number(it.discount_percent || 0),
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
      const [{ data: cfg }, { data: snap }, ordersRes] = await Promise.all([
        (supabase as any).from('distributor_payment_config').select('*').eq('distributor_id', distributorId).maybeSingle(),
        (supabase as any).rpc('get_distributor_financial_snapshot', { p_distributor_id: distributorId }),
        supabase.from('primary_orders').select('total_amount').eq('distributor_id', distributorId).not('status', 'in', '("cancelled","delivered")'),
      ]);
      const snapshotRow = Array.isArray(snap) ? snap[0] : null;
      setPaymentConfig(cfg || null);
      setSnapshot(snapshotRow || null);
      setCreditLimit(Number(cfg?.credit_limit ?? snapshotRow?.credit_limit ?? 0));
      const totalOutstanding = snapshotRow?.outstanding != null
        ? Number(snapshotRow.outstanding)
        : (ordersRes.data || []).reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
      setOutstanding(totalOutstanding);
      if (cfg) {
        setPayment((prev) => ({
          ...prev,
          paymentTerm: cfg.default_payment_term ?? prev.paymentTerm,
          paymentMode: cfg.default_payment_mode ?? prev.paymentMode,
        }));
      }
    } catch (err) { console.error('Credit check failed:', err); }
  };

  const loadSchemes = async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('product_schemes')
        .select('id, name, scheme_type, product_id, free_product_id, discount_percentage, discount_amount, buy_quantity, free_quantity, condition_quantity, min_order_value, start_date, end_date, is_active, applicability_type')
        .eq('is_active', true)
        .or(`start_date.is.null,start_date.lte.${today}`)
        .or(`end_date.is.null,end_date.gte.${today}`);
      if (error) throw error;
      const all = (data || []) as any[];

      // Filter by applicability: global schemes always apply; targeted schemes only if
      // there is a matching distributor rule for the current distributorId.
      const targetedIds = all.filter(s => s.applicability_type === 'targeted').map(s => s.id);
      let allowedTargetedIds = new Set<string>();
      if (targetedIds.length > 0 && distributorId) {
        const { data: rules } = await supabase
          .from('scheme_applicability')
          .select('scheme_id, applicability_level, entity_id')
          .in('scheme_id', targetedIds)
          .eq('applicability_level', 'distributor')
          .eq('entity_id', distributorId);
        (rules || []).forEach((r: any) => allowedTargetedIds.add(r.scheme_id));
      }

      const filtered = all.filter(s =>
        s.applicability_type !== 'targeted' || allowedTargetedIds.has(s.id)
      );
      setSchemes(filtered as SchemeRow[]);
    } catch (err) { console.error('Scheme load failed:', err); }
  };




  const loadData = async () => {
    try {
      const { data: categoriesData } = await supabase
        .from('product_categories').select('id, name').order('name');
      setCategories(categoriesData || []);

      const { data: priceBookData } = await supabase
        .from('distributor_price_books')
        .select('price_book_id, price_books(id, name)')
        .eq('distributor_id', distributorId).eq('is_active', true).maybeSingle();

      let priceEntries: PriceBookEntry[] = [];
      if (priceBookData?.price_book_id) {
        const pb = priceBookData.price_books as any;
        setPriceBookName(pb?.name || '');
        const { data: entriesData } = await supabase
          .from('price_book_entries')
          .select('product_id, variant_id, final_price, list_price')
          .eq('price_book_id', priceBookData.price_book_id).eq('is_active', true);
        priceEntries = entriesData || [];
        setPriceBookEntries(priceEntries);
      }

      const productsData = await fetchAllPaginated<any>((from, to) =>
        supabase
          .from('products')
          .select('*, product_categories(id, name), product_variants(*)')
          .eq('is_active', true)
          .order('name')
          .range(from, to)
      );

      // Build product rows. Base products are routed through resolveProduct so any
      // variant with NULL overrides will inherit base fields identically (when this
      // surface starts expanding variants as picker rows). For now we list base only;
      // when a variant exists with own price/sku, resolveProduct(base, variant) yields
      // the merged display row consistent with order entry.
      const enriched = (productsData || []).flatMap((p: any) => {
        const pe = priceEntries.find((e) => e.product_id === p.id && e.variant_id === null);
        const baseResolved = resolveProduct(p, null);
        const baseRow = {
          ...p,
          category_id: p.product_categories?.id ?? baseResolved.category_id,
          category_name: p.product_categories?.name,
          name: baseResolved.display_name,
          sku: baseResolved.sku,
          hsn_code: baseResolved.hsn_code,
          image_url: baseResolved.image_url,
          price: baseResolved.rate,
          unit: baseResolved.base_unit || p.unit || 'pieces',
          priceBookPrice: pe?.final_price,
        };
        return [baseRow];
      });
      setProducts(enriched);

      const productIds = enriched.map((p: any) => p.id);
      if (productIds.length > 0) {
        const { data: uomRows } = await supabase
          .from('product_uom_mapping')
          .select('product_id, is_default_sales, is_base, uom_master(code, name)')
          .in('product_id', productIds).eq('is_active', true);
        const uomMap: Record<string, UomOption[]> = {};
        (uomRows || []).forEach((r: any) => {
          const u = r.uom_master; if (!u) return;
          if (!uomMap[r.product_id]) uomMap[r.product_id] = [];
          const entry = { code: u.code, name: u.name };
          if (r.is_default_sales) uomMap[r.product_id].unshift(entry);
          else uomMap[r.product_id].push(entry);
        });
        setProductUoms(uomMap);

        if (distributorId) {
          const { data: invRows } = await supabase
            .from('distributor_inventory')
            .select('product_id, quantity, reserved_quantity, damaged_quantity, expired_quantity')
            .eq('distributor_id', distributorId).in('product_id', productIds);
          const stockMap: Record<string, number> = {};
          (invRows || []).forEach((r: any) => {
            const avail = Math.max(0,
              Number(r.quantity || 0) - Number(r.reserved_quantity || 0)
              - Number(r.damaged_quantity || 0) - Number(r.expired_quantity || 0));
            stockMap[r.product_id] = (stockMap[r.product_id] || 0) + avail;
          });
          setProductStock(stockMap);

          // Supplier stock — graceful: try to read any non-self inventory the
          // current user can see. If RLS denies / nothing returns, hide column.
          try {
            const { data: supRows, error: supErr } = await supabase
              .from('distributor_inventory')
              .select('product_id, quantity, reserved_quantity, damaged_quantity, expired_quantity, distributor_id')
              .neq('distributor_id', distributorId).in('product_id', productIds);
            if (supErr || !supRows || supRows.length === 0) {
              setSupplierStock(null);
            } else {
              const supMap: Record<string, number> = {};
              supRows.forEach((r: any) => {
                const avail = Math.max(0,
                  Number(r.quantity || 0) - Number(r.reserved_quantity || 0)
                  - Number(r.damaged_quantity || 0) - Number(r.expired_quantity || 0));
                supMap[r.product_id] = (supMap[r.product_id] || 0) + avail;
              });
              setSupplierStock(supMap);
            }
          } catch { setSupplierStock(null); }
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load products');
    } finally { setProductsLoading(false); }
  };

  // Phase 7-3: filter visible products based on distributor's availability rules.
  // Default (no rules) = visible everywhere.
  const availableProducts = useMemo(() => {
    if (!distributor) return products;
    const ctx = buildDistributorContext(distributor, territoriesById, distributor?.user_id);
    return filterAvailableProducts(products, (p: any) => p.id, availabilityByProductId, ctx);
  }, [products, distributor, territoriesById, availabilityByProductId]);

  const getProductPrice = (product: Product): number =>
    product.priceBookPrice ?? product.price ?? 0;

  const updateItem = (index: number, patch: Partial<OrderItem>) => {
    const updated = [...orderItems];
    updated[index] = { ...updated[index], ...patch };
    updated[index].line_total = updated[index].quantity * updated[index].unit_price;
    setOrderItems(updated);
  };

  const removeItem = (index: number) =>
    setOrderItems(orderItems.filter((_, i) => i !== index));

  const addEmptyRow = () => {
    setOrderItems((prev) => [...prev, {
      product_id: '', product_name: '', quantity: 1, unit: 'pieces',
      unit_price: 0, discount_percent: 0, gst_percent: DEFAULT_GST,
      line_total: 0, category_id: 'all',
    }]);
  };

  // ===== Scheme helpers =====
  const getApplicableSchemes = (productId: string, qty: number): SchemeRow[] => {
    if (!productId) return [];
    return schemes.filter((s) => {
      if (s.product_id && s.product_id !== productId) return false;
      const minQty = Number(s.buy_quantity ?? s.condition_quantity ?? 0);
      if (minQty > 0 && qty < minQty) return false;
      return true;
    });
  };

  const describeScheme = (s: SchemeRow): string => {
    if (s.scheme_type === 'buy_x_get_y' && s.buy_quantity && s.free_quantity) {
      return `${s.name} · Buy ${s.buy_quantity} Get ${s.free_quantity}`;
    }
    if (s.discount_percentage) return `${s.name} · ${s.discount_percentage}% off`;
    if (s.discount_amount)     return `${s.name} · ₹${s.discount_amount} off`;
    return s.name;
  };

  // Auto-apply best scheme when product or qty changes (unless user manually set one).
  useEffect(() => {
    if (schemes.length === 0) return;
    let mutated = false;
    const next = orderItems.map((it) => {
      if (!it.product_id) return it;
      const applicable = getApplicableSchemes(it.product_id, it.quantity);
      // Drop a previously auto/manual selection that no longer qualifies.
      if (it.applied_scheme_id && !applicable.find((s) => s.id === it.applied_scheme_id)) {
        mutated = true;
        return { ...it, applied_scheme_id: null, scheme_manually_set: false };
      }
      if (!it.applied_scheme_id && !it.scheme_manually_set && applicable.length > 0) {
        mutated = true;
        return { ...it, applied_scheme_id: applicable[0].id };
      }
      return it;
    });
    if (mutated) setOrderItems(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderItems.map(i => `${i.product_id}:${i.quantity}`).join('|'), schemes.length]);



  const totals = useMemo(() => {
    let subtotal = 0, totalDiscount = 0, cgst = 0, sgst = 0;
    orderItems.forEach((it) => {
      const gross = it.quantity * it.unit_price;
      const disc = gross * (it.discount_percent / 100);
      const taxable = gross - disc;
      const half = (taxable * it.gst_percent) / 200;
      subtotal += gross; totalDiscount += disc; cgst += half; sgst += half;
    });
    const taxable = subtotal - totalDiscount;
    const taxAmount = cgst + sgst;
    const grossTotal = taxable + taxAmount;
    const grandTotal = Math.round(grossTotal);
    const roundOff = grandTotal - grossTotal;
    return { subtotal, totalDiscount, taxable, cgst, sgst, taxAmount, roundOff, grandTotal };
  }, [orderItems]);

  // ===== submit / save (unchanged logic) =====
  const saveOrder = async (submit = false) => {
    const validItems = orderItems.filter((it) => it.product_id);
    if (validItems.length === 0) { toast.error('Please add at least one item'); return; }
    if (submit) {
      const cfg = paymentConfig;
      const isImmediate = payment.paymentTerm === 'immediate';
      if (!isImmediate && creditLimit > 0) {
        const newOutstanding = outstanding + Math.max(0, totals.grandTotal - (payment.advanceAmount || 0));
        const overLimit = newOutstanding > creditLimit;
        const allowBeyond = cfg?.allow_orders_beyond_limit;
        if (overLimit && !allowBeyond) {
          toast.error(`Credit limit exceeded! Limit: ₹${creditLimit.toLocaleString('en-IN')}, Outstanding + this order (net of advance): ₹${newOutstanding.toLocaleString('en-IN')}.`, { duration: 6000 });
          return;
        }
        if (overLimit && cfg?.approval_required_beyond_limit) {
          toast.warning('Order exceeds credit limit — will require approval before processing.');
        }
      }
      if (payment.advanceAmount > totals.grandTotal) {
        toast.error('Advance amount cannot exceed order total'); return;
      }
      const minAdvance = cfg?.require_advance_payment && cfg?.advance_payment_pct > 0
        ? Math.round((totals.grandTotal * Number(cfg.advance_payment_pct)) / 100) : 0;
      if (minAdvance > 0 && (payment.advanceAmount || 0) < minAdvance) {
        toast.error(`Minimum advance payment of ₹${minAdvance.toLocaleString('en-IN')} (${cfg.advance_payment_pct}%) required`); return;
      }
      const proofRequired = cfg?.require_payment_proof || payment.paymentTerm === 'advance';
      if (proofRequired && !payment.paymentProofUrl) {
        toast.error('Payment proof is required for this order'); return;
      }
    }

    let shippingSnapshot: any = {
      shipping_address: null, shipping_address_source: null,
      shipping_warehouse_id: null, shipping_saved_address_id: null,
      shipping_latitude: null, shipping_longitude: null,
      shipping_contact_person: null, shipping_contact_phone: null,
    };

    try {
      if (shipping.source === 'warehouse' && shipping.warehouseId) {
        const w = allWarehouses.find(x => x.id === shipping.warehouseId);
        if (w && w.address_line1) {
          shippingSnapshot = {
            shipping_address: w.formatted_address || formatAddress(w),
            shipping_address_source: 'warehouse', shipping_warehouse_id: w.id,
            shipping_saved_address_id: null,
            shipping_latitude: w.latitude, shipping_longitude: w.longitude,
            shipping_contact_person: w.contact_person, shipping_contact_phone: w.contact_phone,
          };
        }
      } else if (shipping.source === 'saved' && shipping.savedAddressId) {
        const a = savedAddresses.find(x => x.id === shipping.savedAddressId);
        if (a) {
          shippingSnapshot = {
            shipping_address: a.formatted_address || formatAddress(a),
            shipping_address_source: 'saved', shipping_warehouse_id: null,
            shipping_saved_address_id: a.id,
            shipping_latitude: a.latitude, shipping_longitude: a.longitude,
            shipping_contact_person: a.contact_person, shipping_contact_phone: a.contact_phone,
          };
        }
      } else if (shipping.source === 'custom' && shipping.custom && hasMinimumAddress(shipping.custom)) {
        let savedId: string | null = null;
        if (shipping.saveCustom) {
          if (!shipping.customLabel?.trim()) { toast.error('Enter a label for the address you want to save'); return; }
          const created = await createSavedAddress({
            label: shipping.customLabel.trim(),
            address_line1: shipping.custom.address_line1!.trim(),
            address_line2: shipping.custom.address_line2 || null,
            city: shipping.custom.city!.trim(),
            state: shipping.custom.state || null,
            pincode: shipping.custom.pincode!.trim(),
            country: shipping.custom.country || 'India',
            landmark: shipping.custom.landmark || null,
            contact_person: shipping.custom.contact_person || null,
            contact_phone: shipping.custom.contact_phone || null,
            latitude: shipping.customLatitude ?? null,
            longitude: shipping.customLongitude ?? null,
            is_default: false,
          });
          savedId = created.id;
        }
        shippingSnapshot = {
          shipping_address: formatAddress(shipping.custom),
          shipping_address_source: 'custom', shipping_warehouse_id: null,
          shipping_saved_address_id: savedId,
          shipping_latitude: shipping.customLatitude ?? null,
          shipping_longitude: shipping.customLongitude ?? null,
          shipping_contact_person: shipping.custom.contact_person || null,
          shipping_contact_phone: shipping.custom.contact_phone || null,
        };
      }
    } catch (err: any) { toast.error(err.message || 'Failed to save shipping address'); return; }

    setLoading(true);
    try {
      let orderId = editOrderId as string | undefined;
      const creditSnapshot = {
        credit_limit: creditLimit, outstanding,
        available_credit: Math.max(0, creditLimit - outstanding),
        utilization_pct: creditLimit > 0 ? Math.round((outstanding / creditLimit) * 100) : 0,
        captured_at: new Date().toISOString(),
      };
      const headerPayload: any = {
        distributor_id: distributorId, source_distributor_id: distributorId,
        expected_delivery_date: expectedDeliveryDate || null, notes,
        status: submit ? 'submitted' : 'draft',
        subtotal: totals.subtotal, discount_amount: totals.totalDiscount,
        tax_amount: totals.taxAmount, total_amount: totals.grandTotal,
        payment_term: payment.paymentTerm, payment_mode: payment.paymentMode,
        advance_amount: payment.advanceAmount || 0,
        payment_proof_url: payment.paymentProofUrl,
        credit_snapshot: submit ? creditSnapshot : null,
        ...shippingSnapshot,
      };

      if (isEditMode && orderId) {
        const { error: updErr } = await supabase.from('primary_orders').update(headerPayload).eq('id', orderId);
        if (updErr) throw updErr;
        const { error: delErr } = await supabase.from('primary_order_items').delete().eq('order_id', orderId);
        if (delErr) throw delErr;
      } else {
        const orderNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const { data: created, error: orderError } = await supabase
          .from('primary_orders').insert([{ ...headerPayload, order_number: orderNumber }]).select().single();
        if (orderError) throw orderError;
        orderId = created.id;
      }

      const itemsToInsert = validItems.map((it) => {
        const gross = it.quantity * it.unit_price;
        const disc = gross * (it.discount_percent / 100);
        const taxable = gross - disc;
        const tax = (taxable * it.gst_percent) / 100;
        return {
          order_id: orderId, product_id: it.product_id, variant_id: it.variant_id || null,
          product_name: it.product_name, variant_name: it.variant_name || null,
          quantity: it.quantity, unit: it.unit, unit_price: it.unit_price,
          discount_percent: it.discount_percent, tax_percent: it.gst_percent,
          line_total: Math.round((taxable + tax) * 100) / 100,
        };
      });

      const { error: itemsError } = await supabase.from('primary_order_items').insert(itemsToInsert);
      if (itemsError) {
        if (!isEditMode && orderId) await supabase.from('primary_orders').delete().eq('id', orderId);
        console.error('primary_order_items insert failed:', itemsError);
        throw itemsError;
      }

      toast.success(
        isEditMode
          ? submit ? 'Order updated & submitted' : 'Draft updated'
          : submit ? 'Order submitted successfully!' : 'Order saved as draft',
      );
      navigate(isEditMode ? `/distributor-portal/primary-order/${orderId}` : '/distributor-portal/primary-orders');
    } catch (error: any) {
      console.error('Error saving order:', error);
      toast.error(error.message || 'Failed to save order');
    } finally { setLoading(false); }
  };

  // ===== derived =====
  const totalUnits = orderItems.reduce((s, it) => s + it.quantity, 0);
  const thisOrderAmount = totals.grandTotal;
  const projectedOutstanding = outstanding + thisOrderAmount;
  const utilizationPct = creditLimit > 0
    ? Math.min(100, Math.round((projectedOutstanding / creditLimit) * 100)) : 0;
  const isExceeded = creditLimit > 0 && projectedOutstanding > creditLimit;
  const availableCredit = Math.max(0, creditLimit - outstanding);
  const roomLeft = Math.max(0, creditLimit - projectedOutstanding);
  const validItemsCount = orderItems.filter(it => it.product_id).length;

  // ===== navigation =====
  const canAdvanceFromCart = validItemsCount >= 1;
  const goNext = () => {
    if (currentStep === 1 && !canAdvanceFromCart) {
      toast.error('Add at least one product to continue'); return;
    }
    const next = (currentStep + 1) as 1 | 2 | 3;
    if (next > 3) return;
    setCurrentStep(next);
    if (next > maxReachedStep) setMaxReachedStep(next);
  };
  const goBack = () => {
    if (currentStep === 1) return;
    setCurrentStep((currentStep - 1) as 1 | 2 | 3);
  };
  const jumpTo = (s: 1 | 2 | 3) => {
    if (s <= maxReachedStep) setCurrentStep(s);
  };

  const steps: Array<{ num: 1 | 2 | 3; title: string; sub: string }> = [
    { num: 1, title: 'Cart', sub: 'Build the order' },
    { num: 2, title: 'Review', sub: 'Pricing & schemes' },
    { num: 3, title: 'Confirm & Submit', sub: 'Pay & place' },
  ];

  // ===== render =====
  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/40 via-muted/20 to-background pb-28 standalone-page">
      <main className="max-w-6xl mx-auto px-4 lg:px-6 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost" size="icon" className="shrink-0 hover:bg-primary/10"
            onClick={() => navigate(isEditMode && editOrderId
              ? `/distributor-portal/primary-order/${editOrderId}`
              : '/distributor-portal/primary-orders')}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="w-10 h-10 rounded-lg bg-foreground text-background grid place-items-center">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight">
              {isEditMode
                ? `Edit Order${existingOrder?.order_number ? ` — ${existingOrder.order_number}` : ''}`
                : 'New Primary Order'}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {distributor?.name ? `to ${distributor.name}` : 'Primary order'}
              {orderItems.length > 0 && <> · {validItemsCount || orderItems.length} {(validItemsCount || orderItems.length) === 1 ? 'item' : 'items'}</>}
            </p>
          </div>
        </div>

        {/* Stepper */}
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              {steps.map((step, idx) => {
                const isActive = step.num === currentStep;
                const isDone = step.num < currentStep || (step.num === 1 && maxReachedStep > 1) || (step.num === 2 && maxReachedStep > 2);
                const reachable = step.num <= maxReachedStep;
                return (
                  <div key={step.num} className="flex items-center flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => jumpTo(step.num)}
                      disabled={!reachable}
                      className={cn(
                        "flex items-center gap-3 min-w-0 text-left disabled:cursor-not-allowed",
                        reachable && "cursor-pointer"
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-full grid place-items-center text-sm font-semibold shrink-0 transition-all",
                        isActive ? "bg-foreground text-background"
                          : isDone ? "bg-emerald-500 text-white"
                            : "bg-muted text-muted-foreground border border-border"
                      )}>
                        {isDone && !isActive ? <Check className="w-4 h-4" /> : step.num}
                      </div>
                      <div className="min-w-0 hidden sm:block">
                        <p className={cn("text-sm font-semibold leading-tight",
                          isActive ? "text-foreground" : isDone ? "text-foreground" : "text-muted-foreground")}>
                          {step.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">{step.sub}</p>
                      </div>
                    </button>
                    {idx < steps.length - 1 && (
                      <div className={cn("flex-1 h-0.5 mx-3 rounded-full",
                        step.num < currentStep ? "bg-emerald-400" : "bg-border")} />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Live credit strip */}
        {creditLimit > 0 && (
          <CreditStrip
            creditLimit={creditLimit}
            availableCredit={availableCredit}
            thisOrder={thisOrderAmount}
            utilizationPct={utilizationPct}
            isExceeded={isExceeded}
            showRoomLeft={currentStep === 3}
            roomLeft={roomLeft}
          />
        )}

        {/* Active stage */}
        {currentStep === 1 && (
          <CartStage
            categories={categories}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            products={availableProducts}
            productsLoading={productsLoading}
            productUoms={productUoms}
            productStock={productStock}
            supplierStock={supplierStock}
            orderItems={orderItems}
            updateItem={updateItem}
            removeItem={removeItem}
            addEmptyRow={addEmptyRow}
            getProductPrice={getProductPrice}
            totals={totals}
            getApplicableSchemes={getApplicableSchemes}
            describeScheme={describeScheme}
          />
        )}

        {currentStep === 2 && (
          <ReviewStage
            orderItems={orderItems}
            updateItem={updateItem}
            removeItem={removeItem}
            totals={totals}
          />
        )}

        {currentStep === 3 && (
          <ConfirmStage
            distributor={distributor}
            distributorId={distributorId}
            shipping={shipping}
            setShipping={setShipping}
            expectedDeliveryDate={expectedDeliveryDate}
            setExpectedDeliveryDate={setExpectedDeliveryDate}
            notes={notes}
            setNotes={setNotes}
            payment={payment}
            setPayment={setPayment}
            paymentConfig={paymentConfig}
            totals={totals}
            totalUnits={totalUnits}
            validItemsCount={validItemsCount}
          />
        )}
      </main>

      {/* Single sticky footer */}
      <WizardFooter
        currentStep={currentStep}
        loading={loading}
        canNext={currentStep !== 1 || canAdvanceFromCart}
        canSubmit={!loading && validItemsCount > 0 && !isExceeded}
        isEditMode={isEditMode}
        grandTotal={totals.grandTotal}
        onBack={goBack}
        onNext={goNext}
        onSaveDraft={() => saveOrder(false)}
        onSubmit={() => saveOrder(true)}
      />
    </div>
  );
};

// ============================================================
// Credit strip — slim live bar
// ============================================================
const CreditStrip = ({
  creditLimit, availableCredit, thisOrder, utilizationPct, isExceeded, showRoomLeft, roomLeft,
}: {
  creditLimit: number; availableCredit: number; thisOrder: number;
  utilizationPct: number; isExceeded: boolean; showRoomLeft: boolean; roomLeft: number;
}) => {
  const tone = isExceeded
    ? { wrap: "bg-amber-50 border-amber-200", bar: "bg-amber-500", pill: "bg-amber-100 text-amber-700 border-amber-300", label: "Over limit" }
    : { wrap: "bg-emerald-50 border-emerald-200", bar: "bg-emerald-500", pill: "bg-white text-emerald-700 border-emerald-300", label: "Within limit ✓" };
  return (
    <div className={cn("rounded-xl border px-4 py-2.5 flex items-center gap-4", tone.wrap)}>
      <div className="flex items-center gap-2 shrink-0">
        <CreditCard className="w-4 h-4 text-emerald-700" />
        <span className="text-xs font-bold text-emerald-700 tracking-wide">CREDIT</span>
      </div>
      <div className="flex-1 max-w-[180px] h-1.5 rounded-full bg-white/60 overflow-hidden shrink-0">
        <div className={cn("h-full transition-all", tone.bar)} style={{ width: `${utilizationPct}%` }} />
      </div>
      <div className="flex-1 text-xs text-foreground/80 truncate">
        ₹{availableCredit.toLocaleString('en-IN')} available
        <span className="text-muted-foreground"> · this order ₹{thisOrder.toLocaleString('en-IN')} · {utilizationPct}% used</span>
        {showRoomLeft && (
          <span className="text-muted-foreground"> · ₹{roomLeft.toLocaleString('en-IN')} room left</span>
        )}
      </div>
      <Badge variant="outline" className={cn("text-[11px] px-2.5 py-0.5 rounded-full shrink-0", tone.pill)}>
        {tone.label}
      </Badge>
    </div>
  );
};

// ============================================================
// Stage 1 — Cart
// ============================================================
const CartStage = ({
  categories, selectedCategory, setSelectedCategory,
  products, productsLoading, productUoms, productStock, supplierStock,
  orderItems, updateItem, removeItem, addEmptyRow, getProductPrice, totals,
  getApplicableSchemes, describeScheme,
}: any) => {
  const filtered = selectedCategory === 'all'
    ? products
    : selectedCategory === 'uncategorized'
      ? products.filter((p: Product) => !p.category_id)
      : products.filter((p: Product) => p.category_id === selectedCategory);

  const showSupplier = supplierStock !== null;
  const [offersOpen, setOffersOpen] = useState(false);

  // Group applicable schemes by product line for the offers dialog.
  const offersByProduct = orderItems
    .filter((it: OrderItem) => !!it.product_id)
    .map((it: OrderItem) => ({
      key: `${it.product_id}-${it.unit}`,
      product_name: it.product_name,
      quantity: it.quantity,
      schemes: getApplicableSchemes(it.product_id, it.quantity),
    }))
    .filter((g: any) => g.schemes.length > 0);



  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-md bg-primary/10 grid place-items-center ring-1 ring-inset ring-primary/20">
              <ShoppingBag className="w-4 h-4 text-primary" />
            </span>
            Add Products
          </CardTitle>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Category:</Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[160px] h-8">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="uncategorized">Uncategorized</SelectItem>
                {categories.map((c: Category) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        {/* Header row */}
        <div className={cn(
          "hidden md:grid gap-3 px-1 pb-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide border-b",
          showSupplier
            ? "md:grid-cols-[2fr_1.1fr_0.7fr_0.8fr_0.9fr_32px]"
            : "md:grid-cols-[2fr_1.1fr_0.7fr_0.8fr_32px]"
        )}>
          <div>Product</div>
          <div>Unit</div>
          <div>Qty</div>
          <div>My Stock</div>
          {showSupplier && <div>Supplier Stock</div>}
          <div />
        </div>


        <div className="divide-y">
          {orderItems.map((item: OrderItem, index: number) => {
            const uomOptions = productUoms[item.product_id] || [];
            const fallbackUnit = products.find((p: Product) => p.id === item.product_id)?.unit || item.unit || 'pieces';
            const unitChoices: UomOption[] = uomOptions.length > 0
              ? uomOptions : [{ code: fallbackUnit, name: fallbackUnit }];

            const myStock = productStock[item.product_id] ?? 0;
            const supStock = supplierStock?.[item.product_id];
            const myLow = myStock <= 0;
            const myAmber = myStock > 0 && myStock < item.quantity;

            const productLookup = products.find((p: Product) => p.id === item.product_id);
            const listPrice = productLookup?.price ?? item.unit_price;
            const hasDiscount = productLookup?.priceBookPrice !== undefined && listPrice > (productLookup?.priceBookPrice ?? 0);
            const savings = item.unit_price > 0 && hasDiscount
              ? Math.max(0, (listPrice - item.unit_price) * item.quantity) : 0;
            const offerPct = hasDiscount && listPrice > 0
              ? Math.round(((listPrice - (productLookup?.priceBookPrice ?? 0)) / listPrice) * 100) : 0;

            return (
              <div key={index} className="py-3">
                <div className={cn(
                  "grid gap-3 items-center",
                  showSupplier
                    ? "md:grid-cols-[2fr_1.1fr_0.7fr_0.8fr_0.9fr_32px]"
                    : "md:grid-cols-[2fr_1.1fr_0.7fr_0.8fr_32px]"
                )}>
                  {/* Product */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="h-10 w-full justify-between font-normal"
                      >
                        <span className="truncate">
                          {item.product_id
                            ? (products.find((pr: Product) => pr.id === item.product_id)?.name ?? 'Choose product…')
                            : 'Choose product…'}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[260px]" align="start">
                      <Command
                        filter={(value, search) => {
                          const p = products.find((pr: Product) => pr.id === value);
                          const hay = `${p?.name ?? ''} ${(p as any)?.sku ?? ''}`.toLowerCase();
                          return hay.includes(search.toLowerCase()) ? 1 : 0;
                        }}
                      >
                        <CommandInput placeholder="Search product or SKU…" />
                        <CommandList>
                          {productsLoading ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
                          ) : (
                            <>
                              <CommandEmpty>No products found.</CommandEmpty>
                              <CommandGroup>
                                {filtered.map((p: Product) => (
                                  <CommandItem
                                    key={p.id}
                                    value={p.id}
                                    onSelect={(v) => {
                                      const prod = products.find((pr: Product) => pr.id === v);
                                      if (!prod) return;
                                      const price = getProductPrice(prod);
                                      const defaultUom = (productUoms[v] && productUoms[v][0]?.code) || prod.unit || 'pieces';
                                      updateItem(index, {
                                        product_id: prod.id, product_name: prod.name, unit: defaultUom,
                                        unit_price: price, hsn_code: prod.hsn_code,
                                        sku: (prod as any).sku, image_url: (prod as any).image_url,
                                        price_book_applied: prod.priceBookPrice !== undefined,
                                        category_id: prod.category_id,
                                        line_total: item.quantity * price,
                                      });
                                      (document.activeElement as HTMLElement)?.blur();
                                    }}
                                  >
                                    <Check className={cn('mr-2 h-4 w-4', item.product_id === p.id ? 'opacity-100' : 'opacity-0')} />
                                    <span className="truncate">{p.name}</span>
                                    {(p as any).sku && (
                                      <span className="ml-2 text-xs text-muted-foreground">{(p as any).sku}</span>
                                    )}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>


                  {/* Unit */}
                  <Select value={item.unit} onValueChange={(v) => updateItem(index, { unit: v })} disabled={!item.product_id}>
                    <SelectTrigger className="h-10 truncate"><SelectValue placeholder="Unit" /></SelectTrigger>
                    <SelectContent>
                      {unitChoices.map((u, i) => (
                        <SelectItem key={`${u.code}-${i}`} value={u.code}>
                          {u.name}{i === 0 ? ' (base)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Qty */}
                  <Input
                    type="text" inputMode="numeric" pattern="[0-9]*"
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
                    className="h-10 text-center"
                    disabled={!item.product_id}
                  />




                  {/* My Stock chip */}
                  <div>
                    {item.product_id ? (
                      <span className={cn(
                        "inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium",
                        myLow ? "bg-amber-50 text-amber-700"
                          : myAmber ? "bg-amber-50 text-amber-700"
                            : "bg-blue-50 text-blue-700"
                      )}>
                        {myStock} left
                      </span>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </div>

                  {/* Supplier Stock chip */}
                  {showSupplier && (
                    <div>
                      {item.product_id && supStock !== undefined ? (
                        <SupplierChip available={supStock} requested={item.quantity} />
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </div>
                  )}

                  {/* Delete */}
                  <Button
                    variant="ghost" size="icon"
                    className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => removeItem(index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {/* Price line + offer */}
                {item.product_id && (
                  <div className="mt-2 pl-1 space-y-0.5">
                    <div className="text-xs">
                      {hasDiscount && (
                        <span className="line-through text-muted-foreground mr-1.5">
                          ₹{listPrice.toFixed(2)}
                        </span>
                      )}
                      <span className="font-semibold text-foreground">
                        ₹{item.unit_price.toFixed(2)}/{item.unit?.toUpperCase()}
                      </span>
                    </div>
                    {savings > 0 && (
                      <div className="text-xs text-emerald-600 flex items-center gap-1">
                        <Gift className="w-3 h-3" />
                        Volume Offer ({offerPct}% off) · ₹{savings.toFixed(2)} saved
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={addEmptyRow} className="h-9">
              <Plus className="w-4 h-4 mr-1.5" /> Add Row
            </Button>
            {(() => {
              const applicableCount = orderItems.reduce((acc: number, it: OrderItem) => (
                it.product_id ? acc + (getApplicableSchemes(it.product_id, it.quantity).length > 0 ? 1 : 0) : acc
              ), 0);
              return (
                <button
                  type="button"
                  onClick={() => setOffersOpen(true)}
                  className={cn(
                    "inline-flex items-center gap-2 h-9 px-3 rounded-md",
                    "bg-primary/10 hover:bg-primary/15 border border-primary/20 transition-colors"
                  )}
                >
                  <Gift className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium text-primary">
                    Apply Offers
                    {applicableCount > 0 && (
                      <span className="ml-1.5 text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                        {applicableCount}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-primary/60" />
                </button>
              );
            })()}
          </div>
          {/* Totals block */}
          <div className="rounded-lg border bg-muted/20 p-4 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">₹{totals.subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            </div>
            {totals.totalDiscount > 0 && (
              <div className="flex justify-between">
                <span className="text-emerald-700 inline-flex items-center gap-1"><Gift className="w-3 h-3" /> Discount</span>
                <span className="font-medium text-emerald-700">− ₹{totals.totalDiscount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t mt-1.5">
              <span className="font-semibold">Total</span>
              <span className="text-xl font-extrabold tracking-tight">
                ₹{(totals.taxable).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground text-right">
              incl. GST ₹{(totals.taxable + totals.taxAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </CardContent>

      {/* Applicable offers dialog */}
      <Dialog open={offersOpen} onOpenChange={setOffersOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-4 h-4 text-primary" /> Applicable Offers
            </DialogTitle>
          </DialogHeader>
          {offersByProduct.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No offers available for the products currently in your cart.
            </div>
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {offersByProduct.map((g: any) => (
                <div key={g.key} className="rounded-lg border p-3">
                  <div className="text-sm font-semibold mb-2">
                    {g.product_name}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      Qty {g.quantity}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {g.schemes.map((s: any) => (
                      <li key={s.id} className="flex items-start gap-2 text-xs">
                        <Gift className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                        <span>{describeScheme(s)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

const SupplierChip = ({ available, requested }: { available: number; requested: number }) => {
  if (available <= 0) {
    return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-rose-50 text-rose-700">Out</span>;
  }
  if (available >= requested) {
    return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700">{available} ✓</span>;
  }
  const short = requested - available;
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700">
      {available} · {short} short
    </span>
  );
};

// ============================================================
// Stage 2 — Review
// ============================================================
const ReviewStage = ({ orderItems, updateItem, removeItem, totals }: any) => {
  const valid = orderItems.filter((it: OrderItem) => it.product_id);
  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-md bg-muted grid place-items-center">
              <FileText className="w-4 h-4 text-foreground/70" />
            </span>
            Review Order
          </CardTitle>
          <span className="text-xs text-muted-foreground">{valid.length} items</span>
        </div>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        <div className="divide-y">
          {valid.map((item: OrderItem, index: number) => {
            const gross = item.quantity * item.unit_price;
            const disc = gross * (item.discount_percent / 100);
            const lineTotal = gross - disc;
            const idxInAll = orderItems.indexOf(item);
            return (
              <div key={index} className="py-4 grid grid-cols-1 md:grid-cols-[1.6fr_1fr_auto] gap-3 items-start">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{item.product_name}</p>
                  <p className="text-xs mt-0.5">
                    <span className="font-semibold">₹{item.unit_price.toFixed(2)}/{item.unit?.toUpperCase()}</span>
                  </p>
                  {disc > 0 && (
                    <p className="text-xs text-emerald-600 flex items-center gap-1 mt-0.5">
                      <Gift className="w-3 h-3" /> Volume Offer ({item.discount_percent}% off) · ₹{disc.toFixed(2)} saved
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 md:justify-self-end">
                  <Button variant="outline" size="icon" className="h-8 w-8"
                    onClick={() => updateItem(idxInAll, { quantity: Math.max(1, item.quantity - 1) })}>
                    <Minus className="w-3 h-3" />
                  </Button>
                  <div className="w-12 text-center text-sm font-semibold">{item.quantity}</div>
                  <Button variant="outline" size="icon" className="h-8 w-8"
                    onClick={() => updateItem(idxInAll, { quantity: item.quantity + 1 })}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
                <div className="text-right">
                  <p className="font-semibold">₹{lineTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                  {disc > 0 && <p className="text-xs text-emerald-600">−₹{disc.toFixed(2)}</p>}
                  <p className="text-[10px] text-muted-foreground mt-0.5">{item.unit?.toUpperCase()}</p>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive mt-1"
                    onClick={() => removeItem(idxInAll)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Totals breakdown */}
        <div className="mt-5 rounded-xl border bg-muted/10 p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">₹{totals.subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>
          {totals.totalDiscount > 0 && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
              <div className="flex items-center justify-between text-emerald-700 text-sm font-semibold">
                <span className="inline-flex items-center gap-1.5"><Gift className="w-4 h-4" /> Schemes Applied</span>
                <span className="text-xs">{valid.filter((i: OrderItem) => i.discount_percent > 0).length} offers</span>
              </div>
              <div className="flex justify-between text-sm mt-1.5">
                <span className="text-emerald-800">Discount</span>
                <span className="font-medium text-emerald-800">− ₹{totals.totalDiscount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}
          {/* Per-rate CGST/SGST split using real per-line gst_percent */}
          {(() => {
            const buckets = new Map<number, { cgst: number; sgst: number }>();
            valid.forEach((it: OrderItem) => {
              const gross = it.quantity * it.unit_price;
              const taxable = gross - gross * (it.discount_percent / 100);
              const half = (taxable * it.gst_percent) / 200;
              const cur = buckets.get(it.gst_percent) || { cgst: 0, sgst: 0 };
              cur.cgst += half; cur.sgst += half;
              buckets.set(it.gst_percent, cur);
            });
            const rows: JSX.Element[] = [];
            Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]).forEach(([rate, v]) => {
              const half = (rate / 2).toFixed(rate % 2 === 0 ? 0 : 1);
              rows.push(
                <div key={`cgst-${rate}`} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">CGST ({half}%)</span>
                  <span>₹{v.cgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>,
                <div key={`sgst-${rate}`} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">SGST ({half}%)</span>
                  <span>₹{v.sgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
              );
            });
            return <div className="space-y-1.5">{rows}</div>;
          })()}
          <div className="border-t pt-3 flex items-end justify-between">
            <div>
              <p className="text-base font-bold">Total</p>
              <p className="text-[11px] text-muted-foreground">
                taxable ₹{totals.taxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })} · incl. GST
              </p>
            </div>
            <p className="text-2xl font-extrabold tracking-tight">
              ₹{totals.grandTotal.toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ============================================================
// Stage 3 — Confirm & Submit
// ============================================================
const ConfirmStage = ({
  distributor, distributorId, shipping, setShipping,
  expectedDeliveryDate, setExpectedDeliveryDate, notes, setNotes,
  payment, setPayment, paymentConfig, totals, totalUnits, validItemsCount,
}: any) => {
  const savings = totals.totalDiscount;
  return (
    <div className="space-y-4">
      {/* Savings banner */}
      {savings > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-amber-900 inline-flex items-center gap-2">
            <Gift className="w-4 h-4" /> You're saving on this order
          </span>
          <span className="text-base font-bold text-amber-900">₹{savings.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
        </div>
      )}

      {/* Billed To + Ship To */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="w-7 h-7 rounded-md bg-muted grid place-items-center">
                  <Receipt className="w-4 h-4 text-foreground/70" />
                </span>
                Billed To
              </CardTitle>
              <span className="text-[11px] text-muted-foreground">who the invoice names</span>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <p className="font-semibold">{distributor?.name || '—'}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {distributor?.gstin ? `GSTIN ${distributor.gstin}` : 'GSTIN —'}
              {distributor?.state ? ` · ${distributor.state}` : ''}
            </p>
            <p className="text-[11px] text-muted-foreground mt-3">
              The distributor placing the order — the receivable lands here.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl shadow-sm">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="w-7 h-7 rounded-md bg-muted grid place-items-center">
                  <Truck className="w-4 h-4 text-foreground/70" />
                </span>
                Ship To
              </CardTitle>
              <span className="text-[11px] text-muted-foreground">where goods are delivered</span>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3">
            {distributorId && (
              <ShippingAddressPicker
                distributorId={distributorId}
                value={shipping}
                onChange={setShipping}
              />
            )}
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Expected Delivery Date</Label>
              <Input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="mt-1.5 h-9"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment */}
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

      {/* Notes */}
      <Card className="rounded-xl shadow-sm">
        <CardContent className="p-4">
          <Label className="text-xs font-medium text-muted-foreground">Notes / Special Instructions</Label>
          <Textarea
            placeholder="Any special requirements or notes..."
            value={notes} onChange={(e) => setNotes(e.target.value)}
            rows={2} maxLength={500}
            className="mt-1.5 resize-none"
          />
        </CardContent>
      </Card>

      {/* Commit line */}
      <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{validItemsCount}</span> products ·{' '}
          <span className="font-semibold text-foreground">{totalUnits}</span> units
        </p>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">Grand Total (incl. GST)</p>
          <p className="text-xl font-extrabold tracking-tight">₹{totals.grandTotal.toLocaleString('en-IN')}</p>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Wizard footer
// ============================================================
const WizardFooter = ({
  currentStep, loading, canNext, canSubmit, isEditMode, grandTotal,
  onBack, onNext, onSaveDraft, onSubmit,
}: {
  currentStep: 1 | 2 | 3; loading: boolean;
  canNext: boolean; canSubmit: boolean; isEditMode: boolean; grandTotal: number;
  onBack: () => void; onNext: () => void; onSaveDraft: () => void; onSubmit: () => void;
}) => {
  const showGrandTotal = currentStep > 1;
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t shadow-[0_-4px_12px_rgba(0,0,0,0.04)] z-40">
      <div className="max-w-6xl mx-auto px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
        <div className="text-sm">
          {showGrandTotal && (
            <span className="text-muted-foreground">
              Grand Total <span className="ml-2 text-foreground font-extrabold text-base">
                ₹{grandTotal.toLocaleString('en-IN')}
              </span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {currentStep > 1 && (
            <Button variant="outline" onClick={onBack} disabled={loading}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
          )}
          <Button variant="outline" onClick={onSaveDraft} disabled={loading}>
            <Save className="w-4 h-4 mr-1.5" /> Save Draft
          </Button>
          {currentStep < 3 ? (
            <Button onClick={onNext} disabled={loading || !canNext} className="bg-foreground text-background hover:bg-foreground/90">
              Next <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          ) : (
            <Button onClick={onSubmit} disabled={!canSubmit} className="bg-foreground text-background hover:bg-foreground/90">
              <Send className="w-4 h-4 mr-1.5" />
              {isEditMode ? 'Update & Submit' : 'Submit Primary Order'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreatePrimaryOrder;
