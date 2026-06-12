import { useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Gift, Loader2, Calendar, Package, ShoppingCart } from 'lucide-react';
import { CustomerPortalUser } from '@/hooks/useCustomerPortalAuth';
import { toast } from 'sonner';
import { ensureMinimumCartQuantity } from '@/utils/customerCartHelper';

interface ContextType {
  retailer: CustomerPortalUser;
  cartCount: number;
}

interface Scheme {
  id: string;
  name: string;
  description: string | null;
  scheme_type: string;
  discount_percentage: number | null;
  discount_amount: number | null;
  buy_quantity: number | null;
  free_quantity: number | null;
  min_order_value: number | null;
  start_date: string | null;
  end_date: string | null;
  condition_quantity: number | null;
  buy_quantity_unit: string | null;
  free_quantity_unit: string | null;
  product_id: string | null;
  product_name?: string;
  category_name?: string;
}

const SCHEME_TYPE_LABELS: Record<string, string> = {
  buy_x_get_y: 'Buy X Get Y',
  percentage_discount: 'Percentage Discount',
  flat_discount: 'Flat Discount',
  bundle: 'Bundle Offer',
  tiered: 'Tiered Discount',
  volume: 'Volume Discount',
};

const formatUnit = (unit: string | null | undefined): string => {
  if (!unit) return 'units';
  const map: Record<string, string> = { kg: 'KG', grams: 'g', pieces: 'pcs', liters: 'L', ml: 'ml', units: 'units' };
  return map[unit.toLowerCase()] || unit.toUpperCase();
};

const CustomerSchemes = () => {
  const { retailer } = useOutletContext<ContextType>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [addingToCart, setAddingToCart] = useState<string | null>(null);

  const { data: schemes = [], isLoading } = useQuery({
    queryKey: ['customer-schemes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_schemes')
        .select(`
          id, name, description, scheme_type,
          discount_percentage, discount_amount,
          buy_quantity, free_quantity, min_order_value,
          start_date, end_date, product_id,
          condition_quantity, buy_quantity_unit, free_quantity_unit,
          products:product_id(name),
          product_categories:category_id(name)
        `)
        .eq('is_active', true)
        .eq('show_in_portal', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const now = new Date();
      return (data || [])
        .filter((s: any) => {
          if (s.start_date && now < new Date(s.start_date)) return false;
          if (s.end_date) {
            const end = new Date(s.end_date);
            end.setHours(23, 59, 59, 999);
            if (now > end) return false;
          }
          return true;
        })
        .map((s: any) => ({
          ...s,
          product_name: s.products?.name || null,
          category_name: s.product_categories?.name || null,
        })) as Scheme[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const schemeTypes = [...new Set(schemes.map(s => s.scheme_type))];

  const filtered = schemes.filter(s => {
    if (typeFilter && s.scheme_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.product_name?.toLowerCase().includes(q) ||
        s.category_name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const addSchemeToCart = async (scheme: Scheme) => {
    const qty = scheme.buy_quantity || scheme.condition_quantity;
    if (!scheme.product_id || !qty) {
      toast.error('This scheme cannot be added to cart directly');
      return;
    }

    setAddingToCart(scheme.id);
    try {
      const unit = scheme.buy_quantity_unit || 'units';
      const { quantity: cartQty, existed, changed } = await ensureMinimumCartQuantity({
        retailer_id: retailer.id,
        product_id: scheme.product_id,
        quantity: qty,
        unit,
        source: 'manual',
      });

      const formattedUnit = formatUnit(unit);
      if (!existed) {
        toast.success(`Added ${cartQty} ${formattedUnit} to cart`);
      } else if (changed) {
        toast.success(`Updated to ${cartQty} ${formattedUnit} in cart`);
      } else {
        toast.success(`Already have ${cartQty} ${formattedUnit} in cart`);
      }

      queryClient.invalidateQueries({ queryKey: ['customer-cart-count'] });
      queryClient.invalidateQueries({ queryKey: ['customer-cart'] });
    } catch (err: any) {
      console.error('Add scheme to cart error:', err);
      toast.error('Failed to add to cart');
    } finally {
      setAddingToCart(null);
    }
  };

  const getSchemeColor = (type: string) => {
    switch (type) {
      case 'buy_x_get_y': return 'bg-emerald-500';
      case 'percentage_discount': return 'bg-blue-500';
      case 'flat_discount': return 'bg-amber-500';
      case 'bundle': return 'bg-purple-500';
      default: return 'bg-primary';
    }
  };

  const getSchemeTypeColor = (type: string) => {
    switch (type) {
      case 'buy_x_get_y': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'percentage_discount': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'flat_discount': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      default: return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getBuyCondition = (s: Scheme): string => {
    const qty = s.buy_quantity || s.condition_quantity;
    if (qty) {
      const unit = formatUnit(s.buy_quantity_unit);
      return `Buy ${qty} ${unit}`;
    }
    if (s.min_order_value) return `Min order ₹${s.min_order_value}`;
    return 'No minimum';
  };

  const getBenefit = (s: Scheme): string => {
    if (s.scheme_type === 'buy_x_get_y' && s.free_quantity) {
      const unit = formatUnit(s.free_quantity_unit);
      return `Get ${s.free_quantity} ${unit} Free`;
    }
    if (s.discount_percentage) return `Get ${s.discount_percentage}% Discount`;
    if (s.discount_amount) return `Get ₹${s.discount_amount} Off`;
    return SCHEME_TYPE_LABELS[s.scheme_type] || 'Special Offer';
  };

  const getRequiredQty = (s: Scheme): number | null => {
    return s.buy_quantity || s.condition_quantity || null;
  };

  const canAddToCart = (s: Scheme): boolean => {
    return !!(s.product_id && (s.buy_quantity || s.condition_quantity));
  };

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto">
      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <Input
          placeholder="Search schemes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10"
        />
      </div>

      {/* Type Filter Chips */}
      {schemeTypes.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-3 scrollbar-hide">
          <button
            onClick={() => setTypeFilter(null)}
            className={`text-xs px-3 py-1.5 rounded-full border whitespace-nowrap transition-colors ${
              !typeFilter ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border hover:bg-muted'
            }`}
          >
            All
          </button>
          {schemeTypes.map(type => (
            <button
              key={type}
              onClick={() => setTypeFilter(typeFilter === type ? null : type)}
              className={`text-xs px-3 py-1.5 rounded-full border whitespace-nowrap transition-colors ${
                typeFilter === type ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border hover:bg-muted'
              }`}
            >
              {SCHEME_TYPE_LABELS[type] || type}
            </button>
          ))}
        </div>
      )}

      {/* Scheme List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Gift size={40} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">{search || typeFilter ? 'No matching schemes found' : 'No active schemes right now'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((scheme) => {
            const requiredQty = getRequiredQty(scheme);
            const unit = formatUnit(scheme.buy_quantity_unit);
            const isAdding = addingToCart === scheme.id;
            const addable = canAddToCart(scheme);

            return (
              <Card key={scheme.id} className="overflow-hidden">
                {/* Color accent bar */}
                <div className={`h-1.5 ${getSchemeColor(scheme.scheme_type)}`} />
                <div className="p-3.5">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h3 className="text-sm font-bold text-foreground leading-tight">{scheme.name}</h3>
                    <Badge className={`text-[10px] px-1.5 py-0 shrink-0 ${getSchemeTypeColor(scheme.scheme_type)}`}>
                      {SCHEME_TYPE_LABELS[scheme.scheme_type] || scheme.scheme_type}
                    </Badge>
                  </div>

                  {/* Product name */}
                  {(scheme.product_name || scheme.category_name) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                      <Package size={13} className="shrink-0" />
                      <span className="font-medium">{scheme.product_name || scheme.category_name}</span>
                    </div>
                  )}

                  {/* Description */}
                  {scheme.description && (
                    <p className="text-xs text-muted-foreground mb-2.5">{scheme.description}</p>
                  )}

                  {/* Buy Condition & Benefit */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {addable ? (
                      <button
                        onClick={() => addSchemeToCart(scheme)}
                        disabled={isAdding}
                        className="rounded-lg bg-primary/10 border border-primary/30 p-2.5 text-center cursor-pointer hover:bg-primary/20 active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-center justify-center gap-1 text-[10px] text-primary mb-1">
                          <ShoppingCart size={11} />
                          <span className="font-semibold uppercase tracking-wide">Buy</span>
                        </div>
                        {isAdding ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <Loader2 size={12} className="animate-spin text-primary" />
                            <span className="text-xs font-bold text-primary">Adding...</span>
                          </div>
                        ) : (
                          <p className="text-xs font-bold text-primary">{getBuyCondition(scheme)} →</p>
                        )}
                        <span className="text-[9px] text-primary/70 mt-0.5 block">Tap to add to cart</span>
                      </button>
                    ) : (
                      <div className="rounded-lg bg-muted/60 border border-border/50 p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground mb-1">
                          <ShoppingCart size={11} />
                          <span className="font-semibold uppercase tracking-wide">Buy</span>
                        </div>
                        <p className="text-xs font-bold text-foreground">{getBuyCondition(scheme)}</p>
                      </div>
                    )}
                    <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 p-2.5 text-center">
                      <div className="flex items-center justify-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 mb-1">
                        <Gift size={11} />
                        <span className="font-semibold uppercase tracking-wide">Get</span>
                      </div>
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{getBenefit(scheme)}</p>
                    </div>
                  </div>

                  {/* Validity dates */}
                  {(scheme.start_date || scheme.end_date) && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Calendar size={12} />
                      <span>
                        {formatDate(scheme.start_date)}
                        {scheme.end_date ? ` – ${formatDate(scheme.end_date)}` : ' onwards'}
                      </span>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CustomerSchemes;
