import { useState, useCallback, useRef, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { customerPortalSupabase } from '@/integrations/supabase/portal-client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Trash2, Plus, Minus, Loader2, ShoppingCart, Send, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { CustomerPortalUser } from '@/hooks/useCustomerPortalAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRetailerPriceBook, usePriceBookEntries } from '@/hooks/useRetailerPriceBook';
import { getLocalTodayDate } from '@/utils/dateUtils';

interface ContextType {
  retailer: CustomerPortalUser;
  cartCount: number;
}

interface CartItem {
  id: string;
  product_id: string;
  quantity: number;
  unit: string;
  source: string;
  product_name: string;
  product_price: number;
  product_category: string;
  category_id?: string;
  gst_percentage: number;
}

interface CartScheme {
  id: string;
  name: string;
  scheme_type: string;
  product_id: string | null;
  category_id: string | null;
  condition_quantity: number | null;
  buy_quantity: number | null;
  buy_quantity_unit: string | null;
  discount_percentage: number | null;
  discount_amount: number | null;
  free_quantity: number | null;
}

const isGramUnit = (unit: string) => {
  const u = (unit || '').toLowerCase().trim();
  return u === 'grams' || u === 'g' || u === 'gram';
};

const getConvertedPrice = (price: number, unit: string) =>
  isGramUnit(unit) ? price / 1000 : price;

const CustomerCart = () => {
  const { retailer } = useOutletContext<ContextType>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [localQuantities, setLocalQuantities] = useState<Record<string, number>>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Resolve price book (cached, shared with catalog)
  const { data: priceBookId } = useRetailerPriceBook(retailer.distributor_id);

  // Fetch cart items + products + categories in one query chain
  const { data: items = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['customer-cart', retailer.id, priceBookId],
    queryFn: async () => {
      const { data: cartData, error } = await customerPortalSupabase
        .from('customer_portal_cart')
        .select('*')
        .eq('retailer_id', retailer.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!cartData || cartData.length === 0) return [];

      const productIds = [...new Set(cartData.map((c: any) => c.product_id))];

      // Parallel: products + price entries + categories
      const [productsRes, priceEntries] = await Promise.all([
        supabase.from('products').select('id, name, rate, category_id, gst_percentage').in('id', productIds),
        priceBookId
          ? supabase.from('price_book_entries').select('product_id, final_price')
              .eq('price_book_id', priceBookId).eq('is_active', true).in('product_id', productIds)
          : Promise.resolve({ data: [] }),
      ]);

      const productMap = new Map((productsRes.data || []).map((p: any) => [p.id, p]));
      const priceMap: Record<string, number> = {};
      for (const e of ((priceEntries as any).data || [])) priceMap[e.product_id] = e.final_price;

      // Fetch category names for order items
      const categoryIds = [...new Set((productsRes.data || []).map((p: any) => p.category_id).filter(Boolean))];
      let categoryMap: Record<string, string> = {};
      if (categoryIds.length > 0) {
        const { data: cats } = await supabase.from('product_categories').select('id, name').in('id', categoryIds);
        if (cats) for (const c of cats) categoryMap[c.id] = c.name;
      }

      return cartData.map((c: any) => {
        const product = productMap.get(c.product_id) as any;
        const effectivePrice = priceMap[c.product_id] ?? product?.rate ?? 0;
        return {
          id: c.id,
          product_id: c.product_id,
          quantity: c.quantity,
          unit: c.unit,
          source: c.source,
          product_name: product?.name || 'Unknown Product',
          product_price: Number(effectivePrice),
          product_category: product?.category_id ? (categoryMap[product.category_id] || 'General') : 'General',
          category_id: product?.category_id || undefined,
          gst_percentage: Number(product?.gst_percentage ?? 0) || 0,
        } as CartItem;
      });
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  // Realtime: refresh cart when items are added/updated/removed for this retailer
  useEffect(() => {
    if (!retailer?.id) return;
    const channel = customerPortalSupabase
      .channel(`customer-cart-${retailer.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customer_portal_cart',
          filter: `retailer_id=eq.${retailer.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['customer-cart', retailer.id] });
        }
      )
      .subscribe();
    return () => {
      customerPortalSupabase.removeChannel(channel);
    };
  }, [retailer?.id, queryClient]);

  // Fetch active schemes
  const { data: schemes = [] } = useQuery({
    queryKey: ['cart-schemes'],
    queryFn: async () => {
      const all: any[] = [];
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('product_schemes')
          .select('id, name, scheme_type, product_id, category_id, condition_quantity, buy_quantity, buy_quantity_unit, discount_percentage, discount_amount, free_quantity, is_active, start_date, end_date')
          .eq('is_active', true)
          .eq('show_in_portal', true)
          .range(from, from + pageSize - 1);
        if (error) return [];
        if (!data?.length) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      const data = all;

      const now = new Date();
      return (data || []).filter((s: any) => {
        if (s.start_date && now < new Date(s.start_date)) return false;
        if (s.end_date) {
          const end = new Date(s.end_date);
          end.setHours(23, 59, 59, 999);
          if (now > end) return false;
        }
        return true;
      }) as CartScheme[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const getItemScheme = (item: CartItem): CartScheme | null => {
    return schemes.find(
      s => s.product_id === item.product_id ||
        (s.category_id && s.category_id === item.category_id) ||
        (!s.product_id && !s.category_id)
    ) || null;
  };

  // Optimistic quantity update with debounced DB write
  const getQuantity = (item: CartItem) => localQuantities[item.id] ?? item.quantity;

  const updateQuantity = useCallback((itemId: string, newQty: number) => {
    if (newQty < 1) return;
    // Optimistic local update
    setLocalQuantities(prev => ({ ...prev, [itemId]: newQty }));

    // Debounce DB write
    if (debounceTimers.current[itemId]) clearTimeout(debounceTimers.current[itemId]);
    debounceTimers.current[itemId] = setTimeout(async () => {
      try {
        const { error } = await customerPortalSupabase
          .from('customer_portal_cart')
          .update({ quantity: newQty })
          .eq('id', itemId);

        if (error) throw error;
      } catch (error) {
        console.error('Failed to update cart quantity:', error);
        setLocalQuantities(prev => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
        toast.error('Failed to update quantity');
        refetch();
      }
    }, 500);
  }, [refetch]);

  const removeItem = async (itemId: string) => {
    // Optimistic removal from query cache
    queryClient.setQueryData(['customer-cart', retailer.id, priceBookId], (old: CartItem[] | undefined) =>
      (old || []).filter(i => i.id !== itemId)
    );
    try {
      const { error } = await customerPortalSupabase.from('customer_portal_cart').delete().eq('id', itemId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['customer-cart-count'] });
    } catch (error) {
      console.error('Failed to remove cart item:', error);
      toast.error('Failed to remove');
      refetch();
    }
  };

  const submitOrder = async () => {
    const currentItems = items.map(i => ({ ...i, quantity: getQuantity(i) }));
    if (currentItems.length === 0) return;
    setSubmitting(true);
    try {
      const subtotalSnapshot = currentItems.reduce(
        (sum, i) => sum + i.quantity * getConvertedPrice(i.product_price, i.unit),
        0,
      );
      // Per-line tax from product master
      const perItemTax = currentItems.map((item) => {
        const lineSub = item.quantity * getConvertedPrice(item.product_price, item.unit);
        const lineDisc = computeLineDiscount(item, lineSub);
        const taxable = Math.max(0, lineSub - lineDisc);
        const gstPct = item.gst_percentage || 0;
        const tax = taxable * (gstPct / 100);
        return { lineSub, taxable, tax, cgst: tax / 2, sgst: tax / 2 };
      });
      const taxAmountSnapshot = perItemTax.reduce((s, x) => s + x.tax, 0);
      const cgstSnapshot = taxAmountSnapshot / 2;
      const sgstSnapshot = taxAmountSnapshot / 2;
      const totalAmount = subtotalSnapshot - discountTotal + taxAmountSnapshot;

      let userId: string | null = retailer.owner_id || null;
      if (!userId) {
        const { data: r } = await customerPortalSupabase
          .from('retailers')
          .select('owner_id, user_id')
          .eq('id', retailer.id)
          .maybeSingle();
        userId = r?.owner_id || r?.user_id || null;
      }

      const today = getLocalTodayDate();
      if (!userId) {
        toast.error('Unable to place order: retailer has no assigned sales representative.');
        return;
      }

      // Auto-create visit
      let visitId: string | null = null;
      const { data: existingVisit } = await customerPortalSupabase.from('visits').select('id')
        .eq('user_id', userId).eq('retailer_id', retailer.id).eq('planned_date', today).maybeSingle();
      if (existingVisit) {
        visitId = existingVisit.id;
      } else {
        const { data: newVisit, error: visitError } = await customerPortalSupabase.from('visits').insert({
          user_id: userId, retailer_id: retailer.id, planned_date: today,
          status: 'planned', visit_type: 'portal_order',
        }).select('id').single();

        if (visitError) throw visitError;
        visitId = newVisit?.id ?? null;
      }

      // Resolve distributor_id for the retailer
      let distributorId: string | null = retailer.distributor_id || null;
      if (!distributorId) {
        const { data: mapping } = await customerPortalSupabase
          .from('distributor_retailer_mappings')
          .select('distributor_id')
          .eq('retailer_id', retailer.id)
          .limit(1)
          .maybeSingle();
        distributorId = mapping?.distributor_id || null;
      }
      if (!distributorId) {
        const { data: ret } = await customerPortalSupabase
          .from('retailers')
          .select('distributor_id')
          .eq('id', retailer.id)
          .maybeSingle();
        distributorId = ret?.distributor_id || null;
      }
      // Fallback: resolve via beat's distributor
      if (!distributorId && retailer.beat_id) {
        const { data: beat } = await customerPortalSupabase
          .from('beats')
          .select('distributor_id')
          .eq('id', retailer.beat_id)
          .maybeSingle();
        distributorId = beat?.distributor_id || null;
      }
      if (!distributorId) {
        console.warn('[CustomerCart] No distributor resolved for retailer', retailer.id, '- order will have NULL distributor_id');
      }

      const orderPayload = {
        retailer_id: retailer.id, retailer_name: retailer.name,
        total_amount: totalAmount, subtotal: subtotalSnapshot,
        discount_amount: discountTotal,
        status: 'confirmed', order_source: 'portal_order',
        beat_id: retailer.beat_id || null, territory_id: retailer.territory_id || null,
        user_id: userId, order_date: today, visit_id: visitId,
        distributor_id: distributorId,
        idempotency_key: (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `portal-${retailer.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      };

      const createOrder = (payload: typeof orderPayload & { invoice_number?: string }) =>
        customerPortalSupabase.from('orders').insert([payload] as any).select('id').single();

      let { data: order, error: orderError } = await createOrder(orderPayload);
      if (orderError?.code === '23505' && orderError?.message?.includes('orders_invoice_number_unique')) {
        const fallback = `INV${new Date().getFullYear()}-${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
        const retry = await createOrder({ ...orderPayload, invoice_number: fallback });
        order = retry.data;
        orderError = retry.error;
      }
      if (orderError) throw orderError;

      const orderItems = currentItems.map((item, idx) => {
        const effectivePrice = getConvertedPrice(item.product_price, item.unit);
        const tax = perItemTax[idx];
        return {
          order_id: order!.id, product_id: item.product_id,
          product_name: item.product_name, category: item.product_category,
          quantity: item.quantity, rate: effectivePrice,
          total: item.quantity * effectivePrice, unit: item.unit,
          cgst_amount: tax.cgst,
          sgst_amount: tax.sgst,
          discount_amount: Math.max(0, tax.lineSub - tax.taxable),
        };
      });

      const { error: itemsError } = await customerPortalSupabase.from('order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      const { error: clearCartError } = await customerPortalSupabase
        .from('customer_portal_cart')
        .delete()
        .eq('retailer_id', retailer.id);

      if (clearCartError) throw clearCartError;

      queryClient.invalidateQueries({ queryKey: ['customer-cart-count'] });
      queryClient.invalidateQueries({ queryKey: ['customer-cart'] });
      toast.success('Order placed successfully!');

      // Navigate immediately to success page — don't block on WhatsApp send
      navigate(`/customer-portal/order-success/${order!.id}`, {
        state: {
          total: totalAmount,
          savings: discountTotal,
          orderDate: today,
          displayId: order!.id.slice(0, 8).toUpperCase(),
        },
      });

      // Fire WhatsApp confirmation in the background (non-blocking)
      (() => {
        try {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          fetch(`${supabaseUrl}/functions/v1/send-order-confirmation-whatsapp`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': anonKey,
            },
            body: JSON.stringify({ orderId: order!.id, retailerId: retailer.id }),
            keepalive: true,
          })
            .then(async (res) => {
              const result = await res.json().catch(() => ({}));
              console.log('WhatsApp confirmation result:', res.status, result);
            })
            .catch((whatsappErr) => {
              console.error('WhatsApp confirmation failed:', whatsappErr);
            });
        } catch (whatsappErr) {
          console.error('WhatsApp confirmation dispatch failed:', whatsappErr);
        }
      })();
    } catch (err: any) {
      console.error('Submit order error:', err);
      toast.error(err?.message || 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  };

  const subtotal = items.reduce((sum, i) => sum + getQuantity(i) * getConvertedPrice(i.product_price, i.unit), 0);

  // Calculate scheme discounts
  const discountTotal = items.reduce((sum, item) => {
    const qty = getQuantity(item);
    const scheme = getItemScheme(item);
    if (!scheme) return sum;
    const reqQty = scheme.condition_quantity || scheme.buy_quantity || 0;
    if (reqQty > 0 && qty < reqQty) return sum;
    const lineTotal = qty * getConvertedPrice(item.product_price, item.unit);
    if (scheme.discount_percentage) return sum + lineTotal * (scheme.discount_percentage / 100);
    if (scheme.discount_amount) return sum + scheme.discount_amount;
    return sum;
  }, 0);

  // Per-line GST sourced from product master, split equally into CGST + SGST
  const computeLineDiscount = (item: CartItem, lineTotal: number): number => {
    const scheme = getItemScheme(item);
    if (!scheme) return 0;
    const qty = getQuantity(item);
    const reqQty = scheme.condition_quantity || scheme.buy_quantity || 0;
    if (reqQty > 0 && qty < reqQty) return 0;
    if (scheme.discount_percentage) return lineTotal * (scheme.discount_percentage / 100);
    if (scheme.discount_amount) return scheme.discount_amount;
    return 0;
  };

  const gstTotal = items.reduce((sum, item) => {
    const qty = getQuantity(item);
    const lineTotal = qty * getConvertedPrice(item.product_price, item.unit);
    const lineDisc = computeLineDiscount(item, lineTotal);
    const taxable = Math.max(0, lineTotal - lineDisc);
    return sum + taxable * ((item.gst_percentage || 0) / 100);
  }, 0);
  const cgstTotal = gstTotal / 2;
  const sgstTotal = gstTotal / 2;
  const grandTotal = subtotal - discountTotal + gstTotal;

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto">
      

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ShoppingCart size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Your cart is empty</p>
          <p className="text-sm mt-1">Browse products and add items to get started</p>
          <Button className="mt-4" onClick={() => navigate('/customer-portal/home')}>
            Browse Products
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-1.5 mb-3">
            {items.map(item => {
              const qty = getQuantity(item);
              const scheme = getItemScheme(item);
              const reqQty = scheme ? (scheme.condition_quantity || scheme.buy_quantity || 0) : 0;
              const unitLabel = scheme?.buy_quantity_unit || item.unit || 'units';
              const isUnlocked = scheme && reqQty > 0 && qty >= reqQty;
              const isClose = scheme && reqQty > 0 && qty > 0 && qty < reqQty;
              const unitDisplay = isGramUnit(item.unit) ? 'g' : (item.unit || 'pcs');
              const convPrice = getConvertedPrice(item.product_price, item.unit);

              return (
                <Card key={item.id} className={`px-2.5 py-2 ${isUnlocked ? 'border-l-[3px] border-l-emerald-500' : ''}`}>
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-xs text-foreground truncate leading-tight">{item.product_name}</h3>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                        ₹{convPrice.toFixed(2)}/{unitDisplay} × {qty} = ₹{(qty * convPrice).toFixed(2)}
                      </p>
                      {item.source !== 'manual' && (
                        <span className="text-[9px] text-muted-foreground/70 capitalize">Via {item.source}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={() => updateQuantity(item.id, qty - 1)}>
                        <Minus size={14} />
                      </Button>
                      <div className="flex flex-col items-center w-9">
                        <span className="text-sm font-bold leading-none">{qty}</span>
                        <span className="text-[9px] text-muted-foreground leading-none mt-0.5">{unitDisplay}</span>
                      </div>
                      <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={() => updateQuantity(item.id, qty + 1)}>
                        <Plus size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeItem(item.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                  {isUnlocked && (
                    <div className="mt-1 inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-px rounded whitespace-nowrap">
                      <Gift size={9} /> {scheme.name}{scheme.discount_percentage ? ` · ${scheme.discount_percentage}% off` : ''}{scheme.discount_amount ? ` · ₹${scheme.discount_amount} off` : ''}{scheme.scheme_type === 'buy_x_get_y' && scheme.free_quantity ? ` · Get ${scheme.free_quantity} free` : ''}
                    </div>
                  )}
                  {isClose && (
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, reqQty)}
                      className="mt-1.5 w-full flex items-center justify-between gap-2 text-[11px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 border border-amber-300/60 dark:border-amber-800/60 px-2 py-1.5 rounded hover:bg-amber-200/80 dark:hover:bg-amber-900/50 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Gift size={12} className="shrink-0" />
                        Add {reqQty - qty} more {unitLabel} to avail "{scheme.name}"
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wide shrink-0 bg-amber-500 text-white px-1.5 py-0.5 rounded">Add</span>
                    </button>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Scheme summary */}
          {(() => {
            const appliedSchemes = items.filter(item => {
              const s = getItemScheme(item);
              const req = s ? (s.condition_quantity || s.buy_quantity || 0) : 0;
              return s && req > 0 && getQuantity(item) >= req;
            }).map(item => getItemScheme(item)!);
            
            if (appliedSchemes.length > 0) {
              return (
                <Card className="px-2.5 py-2 mb-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <Gift size={11} /> {appliedSchemes.length} offer{appliedSchemes.length > 1 ? 's' : ''} applied
                  </p>
                  {appliedSchemes.map(s => (
                    <p key={s.id} className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">• {s.name}</p>
                  ))}
                </Card>
              );
            }
            return null;
          })()}

          <Card className="px-3 py-2.5 mb-3 bg-primary/5 border-primary/20">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Subtotal</span>
              <span className="text-xs font-medium text-foreground">₹{subtotal.toFixed(2)}</span>
            </div>
            {discountTotal > 0 && (
              <div className="flex justify-between items-center mt-0.5">
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Offer Discount</span>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">-₹{discountTotal.toFixed(2)}</span>
              </div>
            )}
            {gstTotal > 0 && (
              <>
                <div className="flex justify-between items-center mt-0.5">
                  <span className="text-[11px] text-muted-foreground">CGST</span>
                  <span className="text-[11px] text-muted-foreground">₹{cgstTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center mt-0.5">
                  <span className="text-[11px] text-muted-foreground">SGST</span>
                  <span className="text-[11px] text-muted-foreground">₹{sgstTotal.toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between items-center pt-1.5 mt-1.5 border-t border-border/40">
              <span className="font-semibold text-sm text-foreground">Total</span>
              <span className="text-lg font-bold text-primary">₹{grandTotal.toFixed(2)}</span>
            </div>
          </Card>

          <Button className="w-full h-12 text-sm font-semibold gap-2" onClick={submitOrder} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={16} />}
            {submitting ? 'Placing Order...' : `Place Order · ${items.length} item${items.length > 1 ? 's' : ''}`}
          </Button>
        </>
      )}
    </div>
  );
};

export default CustomerCart;
