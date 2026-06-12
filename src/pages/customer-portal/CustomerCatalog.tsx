import { useState, useEffect, useCallback, useMemo, useRef, memo, startTransition } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useOutletContext, useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { upsertCartItems } from '@/utils/customerCartHelper';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Camera, Loader2, Package, ShoppingCart, Plus, Trash2, Check, ChevronsUpDown, Gift, X, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { VoiceSearchButton } from '@/components/VoiceSearchButton';
import { CustomerPortalUser } from '@/hooks/useCustomerPortalAuth';
import CustomerPhotoOrder from './CustomerPhotoOrder';
import { useRetailerPriceBook, usePriceBookEntries } from '@/hooks/useRetailerPriceBook';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface ContextType {
  retailer: CustomerPortalUser;
  cartCount: number;
}

interface Category {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  sku?: string;
  rate: number;
  unit: string;
  category_id?: string;
  closing_stock?: number;
}

interface Scheme {
  id: string;
  name: string;
  scheme_type: string;
  product_id: string | null;
  category_id: string | null;
  discount_percentage: number | null;
  discount_amount: number | null;
  buy_quantity: number | null;
  free_quantity: number | null;
  condition_quantity: number | null;
  buy_quantity_unit: string | null;
}

interface OrderRow {
  id: string;
  product?: Product;
  quantity: number;
  stock: number;
  unit: string;
}

const isGramUnit = (unit: string) => {
  const u = (unit || '').toLowerCase().trim();
  return u === 'grams' || u === 'g' || u === 'gram';
};

/** Rate is stored per-KG; for gram units divide by 1000 to get per-gram price */
const getConvertedPrice = (price: number, unit: string) =>
  isGramUnit(unit) ? price / 1000 : price;

const getDisplayPrice = (price: number, unit: string) => {
  if (isGramUnit(unit)) return `₹${(price / 1000).toFixed(2)} / gram`;
  return `₹${price.toFixed(2)} / ${unit}`;
};


interface ProductPickerProps {
  products: Product[];
  selectedId?: string;
  priceMap: Record<string, number>;
  getProductScheme: (p: Product) => Scheme | null;
  formatScheme: (s: Scheme) => string;
  onSelect: (productId: string) => void;
}

const ProductPickerItem = memo(function ProductPickerItem({
  product, selected, price, scheme, formatScheme, onSelect,
}: {
  product: Product;
  selected: boolean;
  price: number;
  scheme: Scheme | null;
  formatScheme: (s: Scheme) => string;
  onSelect: (id: string) => void;
}) {
  return (
    <CommandItem
      value={`${product.name} ${product.sku || ''}`}
      onSelect={() => onSelect(product.id)}
      onMouseMove={(e) => e.preventDefault()}
      className={cn("text-xs bg-card hover:bg-accent py-2.5 rounded-lg", scheme && "bg-emerald-50/50 dark:bg-emerald-950/20")}
    >
      <Check className={cn("mr-2 h-3 w-3", selected ? "opacity-100" : "opacity-0")} />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate flex items-center gap-1">
          {product.name}
          {scheme && <Gift size={10} className="text-emerald-600 shrink-0" />}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {product.sku && `SKU: ${product.sku} | `}₹{price.toFixed(2)}
        </div>
        {scheme && (
          <div className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            🎁 {formatScheme(scheme)}
          </div>
        )}
      </div>
    </CommandItem>
  );
});

interface ProductPickerPropsExt extends ProductPickerProps {
  loading?: boolean;
}

const ProductPicker = memo(function ProductPicker({
  products, selectedId, priceMap, getProductScheme, formatScheme, onSelect, loading,
}: ProductPickerPropsExt) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      startTransition(() => setDebouncedQuery(query));
    }, 200);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 200);
    const out: Product[] = [];
    for (const p of products) {
      if (p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q))) {
        out.push(p);
        if (out.length >= 200) break;
      }
    }
    return out;
  }, [products, debouncedQuery]);

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 3,
  });

  return (
    <Command className="bg-card" shouldFilter={false}>
      <CommandInput
        placeholder="Search products..."
        className="h-10 text-xs"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList ref={parentRef as any} className="bg-card max-h-[250px]">
        {filtered.length === 0 ? (
          <CommandEmpty>{loading ? 'Loading products…' : 'No product found.'}</CommandEmpty>
        ) : (
          <CommandGroup className="bg-card">
            <div style={{ height: rowVirtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map(vi => {
                const p = filtered[vi.index];
                return (
                  <div
                    key={p.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${vi.size}px`,
                      transform: `translateY(${vi.start}px)`,
                    }}
                  >
                    <ProductPickerItem
                      product={p}
                      selected={selectedId === p.id}
                      price={priceMap[p.id] ?? p.rate}
                      scheme={getProductScheme(p)}
                      formatScheme={formatScheme}
                      onSelect={onSelect}
                    />
                  </div>
                );
              })}
            </div>
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
});

const CustomerCatalog = () => {
  const { retailer, cartCount } = useOutletContext<ContextType>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showPhotoOrder, setShowPhotoOrder] = useState(false);
  const [orderRows, setOrderRows] = useState<OrderRow[]>([
    { id: '1', quantity: 0, stock: 0, unit: 'KG' }
  ]);
  const [openComboboxes, setOpenComboboxes] = useState<Record<string, boolean>>({});
  const [addingToCart, setAddingToCart] = useState(false);
  const [showOffersModal, setShowOffersModal] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (searchParams.get('photo') === 'true') setShowPhotoOrder(true);
  }, [searchParams]);

  useEffect(() => {
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['product-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_categories')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return (data || []) as Category[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: priceBookId } = useRetailerPriceBook(retailer.distributor_id);

  // Fetch the globally enabled sales units from the Unit of Measure Master.
  // The customer portal should only display units that are actually enabled.
  const { data: enabledUnits = [] } = useQuery({
    queryKey: ['enabled-sales-units'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enabled_units')
        .select('uom_id, is_default_sales, is_default, display_order, uom_master:uom_master!enabled_units_uom_id_fkey(code, name)')
        .eq('enabled', true)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Pick the single active display unit: default-sales > default > first enabled.
  const activeUnitCode = useMemo(() => {
    if (!enabledUnits.length) return null;
    const def = enabledUnits.find((u: any) => u.is_default_sales) || enabledUnits.find((u: any) => u.is_default) || enabledUnits[0];
    return (def?.uom_master?.code || def?.uom_master?.name || null) as string | null;
  }, [enabledUnits]);

  // Fetch products for selected category
  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['catalog-products', selectedCategory, activeUnitCode],
    queryFn: async () => {
      const pageSize = 1000;
      let from = 0;
      const all: any[] = [];
      while (true) {
        let query = supabase
          .from('products')
          .select('id, name, sku, product_number, rate, unit, category_id, closing_stock, default_sales_uom_id, default_sales_uom:uom_master!products_default_sales_uom_id_fkey(code, name)')
          .eq('is_active', true)
          .order('name')
          .range(from, from + pageSize - 1);
        if (selectedCategory !== 'all') {
          query = query.eq('category_id', selectedCategory);
        }
        const { data, error } = await query;
        if (error) throw error;
        if (!data?.length) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all.map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku || p.product_number || undefined,
        rate: Number(p.rate ?? 0),
        // Always prefer the globally enabled unit from the Unit of Measure Master.
        // Fall back to the product's default sales UOM, then legacy `unit` text.
        // Hardcoded to PC per request — display unit always shows Pieces in customer portal catalog.
        unit: 'PC',
        category_id: p.category_id || undefined,
        closing_stock: Number(p.closing_stock ?? 0),
      })) as Product[];
    },
    staleTime: 2 * 60 * 1000,
  });


  // Price book entries for all loaded products
  const productIds = useMemo(() => products.map(p => p.id), [products]);
  const { data: priceMap = {} } = usePriceBookEntries(priceBookId, productIds);

  // Fetch active schemes
  const { data: schemes = [] } = useQuery({
    queryKey: ['catalog-schemes'],
    queryFn: async () => {
      const all: any[] = [];
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('product_schemes')
          .select('id, name, scheme_type, product_id, category_id, discount_percentage, discount_amount, buy_quantity, free_quantity, condition_quantity, buy_quantity_unit, is_active, start_date, end_date')
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
      }) as Scheme[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // GST map – keyed by product ID, sourced from product master
  const { data: gstMap = {} } = useQuery({
    queryKey: ['product-gst-map'],
    queryFn: async () => {
      const map: Record<string, number> = {};
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('products')
          .select('id, gst_percentage')
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const p of data) {
          map[p.id] = Number((p as any).gst_percentage ?? 0) || 0;
        }
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return map;
    },
    staleTime: 10 * 60 * 1000,
  });

  const handleVoiceSearch = useCallback((text: string) => {
    setSearch(text);
  }, []);

  // Pre-index schemes by product/category for O(1) lookup per render
  const { schemesByProductId, schemesByCategoryId, globalSchemes } = useMemo(() => {
    const byProd = new Map<string, Scheme[]>();
    const byCat = new Map<string, Scheme[]>();
    const global: Scheme[] = [];
    for (const s of schemes) {
      if (s.product_id) {
        const arr = byProd.get(s.product_id) || [];
        arr.push(s);
        byProd.set(s.product_id, arr);
      } else if (s.category_id) {
        const arr = byCat.get(s.category_id) || [];
        arr.push(s);
        byCat.set(s.category_id, arr);
      } else {
        global.push(s);
      }
    }
    return { schemesByProductId: byProd, schemesByCategoryId: byCat, globalSchemes: global };
  }, [schemes]);

  // Returns ALL schemes that target this product (by product, category, or global)
  const getProductSchemes = useCallback((product: Product): Scheme[] => {
    const out: Scheme[] = [];
    const p = schemesByProductId.get(product.id);
    if (p) out.push(...p);
    if (product.category_id) {
      const c = schemesByCategoryId.get(product.category_id);
      if (c) out.push(...c);
    }
    if (globalSchemes.length) out.push(...globalSchemes);
    return out;
  }, [schemesByProductId, schemesByCategoryId, globalSchemes]);

  // Returns the best (highest discount) scheme for a product at the given line total
  const getBestScheme = (product: Product, qty: number, lineTotal: number): Scheme | null => {
    const candidates = getProductSchemes(product);
    let best: Scheme | null = null;
    let bestSaving = 0;
    for (const s of candidates) {
      const reqQty = s.condition_quantity || s.buy_quantity || 0;
      if (reqQty > 0 && qty < reqQty) continue;
      let saving = 0;
      if (s.discount_percentage) saving = lineTotal * (Number(s.discount_percentage) / 100);
      else if (s.discount_amount) saving = Number(s.discount_amount);
      if (saving > bestSaving) {
        best = s;
        bestSaving = saving;
      }
    }
    return best;
  };

  // Backward-compat alias used by row UI (just returns first matching scheme for display)
  const getProductScheme = useCallback((product: Product): Scheme | null => {
    return getProductSchemes(product)[0] || null;
  }, [getProductSchemes]);

  const formatScheme = useCallback((s: Scheme): string => {
    if (s.scheme_type === 'buy_x_get_y' && s.buy_quantity && s.free_quantity)
      return `Buy ${s.buy_quantity} Get ${s.free_quantity} Free`;
    if (s.discount_percentage) return `${s.discount_percentage}% Off`;
    if (s.discount_amount) return `₹${s.discount_amount} Off`;
    return s.name;
  }, []);

  // Filter products based on search for combobox
  const filteredProducts = useMemo(() => {
    if (!debouncedSearch) return products;
    const q = debouncedSearch.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.sku && p.sku.toLowerCase().includes(q))
    );
  }, [products, debouncedSearch]);

  const handleProductSelect = useCallback((rowId: string, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    setOrderRows(prev => prev.map(row => {
      if (row.id === rowId) {
        return {
          ...row,
          product,
          unit: product.unit || 'pieces',
          stock: 0,
          quantity: row.quantity || 0,
        };
      }
      return row;
    }));
    setOpenComboboxes(prev => ({ ...prev, [rowId]: false }));
  }, [products]);

  const updateRow = (id: string, field: keyof OrderRow, value: any) => {
    setOrderRows(prev => prev.map(row => {
      if (row.id === id) return { ...row, [field]: value };
      return row;
    }));
  };

  const addNewRow = () => {
    setOrderRows(prev => [...prev, {
      id: Date.now().toString(),
      quantity: 0,
      stock: 0,
      unit: 'KG',
    }]);
  };

  const removeRow = (id: string) => {
    if (orderRows.length <= 1) return;
    setOrderRows(prev => prev.filter(r => r.id !== id));
  };

  // Calculate subtotal, discount, and total
  const { subtotal, gstTotal, discountTotal, appliedSchemes } = useMemo(() => {
    let sub = 0;
    let gst = 0;
    let discount = 0;
    const applied: { name: string; saving: number }[] = [];
    for (const row of orderRows) {
      if (row.product && row.quantity > 0) {
        const rawPrice = priceMap[row.product.id] ?? row.product.rate ?? 0;
        const effectiveUnit = row.unit || row.product.unit || 'pc';
        const unitPrice = getConvertedPrice(rawPrice, effectiveUnit);
        const lineTotal = unitPrice * row.quantity;
        sub += lineTotal;
        const gstPct = gstMap[row.product.id] ?? 0;
        gst += lineTotal * (gstPct / 100);

        // Pick the BEST applicable scheme for this row
        const best = getBestScheme(row.product, row.quantity, lineTotal);
        if (best) {
          let saving = 0;
          if (best.discount_percentage) saving = lineTotal * (Number(best.discount_percentage) / 100);
          else if (best.discount_amount) saving = Number(best.discount_amount);
          if (saving > 0) {
            discount += saving;
            applied.push({ name: best.name, saving });
          }
        }
      }
    }
    return { subtotal: sub, gstTotal: gst, discountTotal: discount, appliedSchemes: applied };
  }, [orderRows, priceMap, gstMap, schemes]);

  const validRows = orderRows.filter(r => r.product && r.quantity > 0);

  const addAllToCart = async () => {
    if (validRows.length === 0) {
      toast.error('Add at least one product with quantity');
      return;
    }
    setAddingToCart(true);
    try {
      const items = validRows.map(row => ({
        retailer_id: retailer.id,
        product_id: row.product!.id,
        quantity: row.quantity,
        unit: row.unit || row.product!.unit || 'pieces',
        source: 'manual' as const,
      }));

      const { success, failed } = await upsertCartItems(items);
      if (failed > 0 && success === 0) throw new Error('All items failed');

      toast.success(`${success} item${success > 1 ? 's' : ''} added to cart`);
      queryClient.invalidateQueries({ queryKey: ['customer-cart-count'] });
      setOrderRows([{ id: Date.now().toString(), quantity: 0, stock: 0, unit: 'KG' }]);
    } catch (err) {
      console.error('Add to cart error:', err);
      toast.error('Failed to add to cart');
    } finally {
      setAddingToCart(false);
    }
  };

  return (
    <div className="px-4 pt-5 pb-28 max-w-lg mx-auto space-y-4">

      {showPhotoOrder && (
        <CustomerPhotoOrder
          retailerId={retailer.id}
          onClose={() => setShowPhotoOrder(false)}
        />
      )}

      {/* Category Filter */}
      <Select value={selectedCategory} onValueChange={setSelectedCategory}>
        <SelectTrigger className="h-11 text-sm bg-card rounded-xl border-border/50 shadow-sm">
          <SelectValue placeholder="All Categories" />
        </SelectTrigger>
        <SelectContent className="bg-card z-50 max-h-[300px] rounded-xl">
          <SelectItem value="all" className="text-sm">All Categories</SelectItem>
          {categories.map(cat => (
            <SelectItem key={cat.id} value={cat.id} className="text-sm">{cat.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Order Entry Table */}
      <Card className="overflow-hidden rounded-xl border-border/50 shadow-sm">
       {/* Table Header */}
        <div className="grid grid-cols-[1fr_56px_52px_52px_32px] sm:grid-cols-[1.5fr_0.7fr_0.6fr_0.6fr_auto] gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 bg-primary/5 border-b border-border/40">
          <div className="font-bold text-[10px] sm:text-xs text-primary/80 uppercase tracking-wider">Product</div>
          <div className="font-bold text-[10px] sm:text-xs text-primary/80 uppercase tracking-wider">Unit</div>
          <div className="font-bold text-[10px] sm:text-xs text-primary/80 uppercase tracking-wider text-center">Qty</div>
          <div className="font-bold text-[10px] sm:text-xs text-primary/80 uppercase tracking-wider text-center">Stock</div>
          <div className="w-7 sm:w-8"></div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border/30">
          {orderRows.map((row, index) => {
            const scheme = row.product ? getProductScheme(row.product) : null;
            const rawPrice = row.product ? (priceMap[row.product.id] ?? row.product.rate ?? 0) : 0;
            const effectiveUnit = row.unit || row.product?.unit || 'pc';
            const unitPrice = row.product ? getConvertedPrice(rawPrice, effectiveUnit) : 0;
            const gstPct = row.product ? (gstMap[row.product.id] ?? 0) : 0;

            return (
              <div key={row.id}>
                {/* Single-line grid row */}
                <div
                  className={cn(
                    "grid grid-cols-[1fr_56px_52px_52px_32px] sm:grid-cols-[1.5fr_0.7fr_0.6fr_0.6fr_auto] gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 items-center transition-colors",
                    index % 2 === 0 ? "bg-card" : "bg-muted/20",
                    scheme && "border-l-[3px] border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/10"
                  )}
                >
                  {/* Product Combobox */}
                  <div className="min-w-0">
                    <Popover
                      open={openComboboxes[row.id]}
                      onOpenChange={(open) => setOpenComboboxes(prev => ({ ...prev, [row.id]: open }))}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full min-w-0 justify-start h-8 sm:h-9 text-[11px] sm:text-xs font-normal bg-card border-border/40 px-2 rounded-lg"
                        >
                          {row.product ? (
                            <span className="truncate text-left flex-1 font-semibold text-foreground">
                              {row.product.name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60 text-[11px]">Select...</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[280px] p-0 bg-card z-50 rounded-xl shadow-lg border-border/50" align="start">
                        {openComboboxes[row.id] && (
                          <ProductPicker
                            products={products}
                            selectedId={row.product?.id}
                            priceMap={priceMap}
                            getProductScheme={getProductScheme}
                            formatScheme={formatScheme}
                            onSelect={(productId) => handleProductSelect(row.id, productId)}
                            loading={productsLoading}
                          />
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Unit — pinned to the product's active unit from the unit master */}
                  <Select value={row.unit} onValueChange={(v) => updateRow(row.id, 'unit', v)}>
                    <SelectTrigger className="h-8 sm:h-9 text-[11px] sm:text-xs font-medium text-foreground w-full bg-card border-border/40 px-1 rounded-lg [&>svg]:hidden">
                      <SelectValue>
                        {(row.product?.unit || row.unit || 'Pcs').toUpperCase()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-card z-50 rounded-xl">
                      <SelectItem value={row.product?.unit || row.unit || 'pieces'} className="text-xs">
                        {(row.product?.unit || row.unit || 'Pcs').toUpperCase()}
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Qty */}
                  <Input
                    type="number"
                    placeholder="0"
                    value={row.quantity || ''}
                    onChange={e => updateRow(row.id, 'quantity', parseFloat(e.target.value) || 0)}
                    className="h-8 sm:h-9 text-[11px] sm:text-xs font-medium text-foreground text-center bg-card border-border/40 px-1 rounded-lg [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                    disabled={!row.product}
                  />

                  {/* Stock */}
                  <Input
                    type="number"
                    placeholder="0"
                    value={row.stock || ''}
                    onChange={e => updateRow(row.id, 'stock', parseInt(e.target.value) || 0)}
                    className="h-8 sm:h-9 text-[11px] sm:text-xs font-medium text-foreground text-center bg-card border-border/40 px-1 rounded-lg"
                    disabled={!row.product}
                  />

                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(row.id)}
                    className="h-7 w-7 sm:h-8 sm:w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10 rounded-lg"
                    disabled={orderRows.length === 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Price + Scheme info below the row */}
                {row.product && (
                  <div className={cn(
                    "flex flex-wrap items-center gap-1.5 px-2 sm:px-3 pb-1.5 -mt-0.5",
                    index % 2 === 0 ? "bg-card" : "bg-muted/20",
                    scheme && "bg-emerald-50/30 dark:bg-emerald-950/10"
                  )}>
                    <span className="text-[10px] text-muted-foreground">
                      {getDisplayPrice(rawPrice, effectiveUnit)}
                      {gstPct > 0 && <span className="ml-1">+{gstPct}% GST</span>}
                    </span>
                    {scheme && (
                      <span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-600">
                        <Gift size={9} />
                        {formatScheme(scheme)}
                      </span>
                    )}
                    {scheme && (() => {
                      const reqQty = scheme.condition_quantity || scheme.buy_quantity || 0;
                      const unitLabel = scheme.buy_quantity_unit || row.product!.unit || 'units';
                      if (reqQty > 0 && row.quantity > 0) {
                        if (row.quantity >= reqQty) {
                          return (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded truncate max-w-full">
                              ✅ Offer: {scheme.name}
                            </span>
                          );
                        } else {
                          const remaining = reqQty - row.quantity;
                          return (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded truncate max-w-full">
                              💡 +{remaining} {unitLabel} → {scheme.name}
                            </span>
                          );
                        }
                      }
                      return null;
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Add Row */}
      <Button
        variant="outline"
        size="sm"
        onClick={addNewRow}
        className="gap-1.5 text-xs rounded-lg border-dashed border-border/60 hover:bg-primary/5 hover:border-primary/30"
      >
        <Plus size={14} />
        Add Row
      </Button>

      {/* Totals Card */}
      <Card className="p-4 rounded-xl border-border/50 shadow-sm">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm text-muted-foreground">Subtotal</span>
          <span className="text-sm font-medium text-foreground">₹{subtotal.toFixed(2)}</span>
        </div>
        {appliedSchemes.length > 0 && (
          <>
            {appliedSchemes.map((s, i) => (
              <div key={i} className="flex justify-between items-center mb-1">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium truncate pr-2">
                  🎁 {s.name}
                </span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  -₹{s.saving.toFixed(2)}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center mb-1 pt-1 border-t border-emerald-200/40 dark:border-emerald-800/40">
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">Total Offer Discount</span>
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">-₹{discountTotal.toFixed(2)}</span>
            </div>
          </>
        )}
        {gstTotal > 0 && (
          <>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-muted-foreground">CGST</span>
              <span className="text-xs text-muted-foreground">₹{(gstTotal / 2).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-muted-foreground">SGST</span>
              <span className="text-xs text-muted-foreground">₹{(gstTotal / 2).toFixed(2)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between items-center pt-2 border-t border-border/40">
          <span className="text-base font-bold text-foreground">Total</span>
          <span className="text-lg font-bold text-primary">₹{(subtotal - discountTotal + gstTotal).toFixed(2)}</span>
        </div>
      </Card>

      {/* Apply Offers badge */}
      {schemes.length > 0 && (
        <button
          onClick={() => setShowOffersModal(true)}
          className="inline-flex items-center gap-2 text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-4 py-2.5 rounded-xl hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-all shadow-sm"
        >
          <Gift size={15} />
          Apply Offers ({schemes.length})
          <ChevronRight size={13} />
        </button>
      )}

      {/* Offers Modal */}
      <Dialog open={showOffersModal} onOpenChange={setShowOffersModal}>
        <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift size={18} className="text-emerald-600" />
              Available Offers ({schemes.length})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {schemes.map(scheme => {
              const targetProduct = scheme.product_id
                ? products.find(p => p.id === scheme.product_id)
                : null;
              const targetCategory = scheme.category_id
                ? categories.find(c => c.id === scheme.category_id)
                : null;
              const reqQty = scheme.condition_quantity || scheme.buy_quantity || 0;

              // Check if this scheme is currently applied (matches a row meeting qty req)
              const matchingRow = orderRows.find(r =>
                r.product && r.quantity > 0 &&
                (
                  scheme.product_id === r.product.id ||
                  (scheme.category_id && scheme.category_id === r.product.category_id) ||
                  (!scheme.product_id && !scheme.category_id)
                )
              );
              const isApplied = !!matchingRow && (reqQty <= 0 || matchingRow.quantity >= reqQty);
              const needsMore = !!matchingRow && reqQty > 0 && matchingRow.quantity < reqQty;

              return (
                <div key={scheme.id} className={cn(
                  "p-3.5 rounded-xl border",
                  isApplied
                    ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40"
                    : "border-border/60 bg-muted/30"
                )}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground flex-1">{scheme.name}</p>
                    {isApplied && (
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-200 dark:bg-emerald-900/60 px-2 py-0.5 rounded-full whitespace-nowrap">
                        ✓ APPLIED
                      </span>
                    )}
                  </div>
                  <p className={cn(
                    "text-xs font-medium mt-1",
                    isApplied ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
                  )}>
                    {formatScheme(scheme)}
                    {reqQty > 0 && ` (min qty ${reqQty})`}
                  </p>
                  {targetProduct && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Applies to: {targetProduct.name}
                    </p>
                  )}
                  {targetCategory && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Applies to category: {targetCategory.name}
                    </p>
                  )}
                  {!scheme.product_id && !scheme.category_id && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Applies to all products
                    </p>
                  )}
                  {needsMore && matchingRow?.product && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5 font-medium">
                      💡 Add {reqQty - matchingRow.quantity} more {matchingRow.unit || 'units'} of {matchingRow.product.name} to unlock
                    </p>
                  )}
                  {!matchingRow && targetProduct && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Add {targetProduct.name} to your order to use this offer
                    </p>
                  )}
                </div>
              );
            })}
            {schemes.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">
                No active offers right now
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add to Cart CTA */}
      <Button
        className="w-full h-12 text-sm font-semibold gap-2 rounded-xl shadow-md"
        onClick={addAllToCart}
        disabled={addingToCart || validRows.length === 0}
      >
        {addingToCart ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <ShoppingCart size={16} />
        )}
        {validRows.length > 0
          ? `Add ${validRows.length} Item${validRows.length > 1 ? 's' : ''} to Cart`
          : 'Preview Order'}
      </Button>

      <p className="text-[10px] text-muted-foreground/70 text-center">
        Note: All base prices are stored per KG. Rates auto-adjust when selling in grams or other units.
      </p>

      {/* Fixed bottom cart summary */}
      {cartCount > 0 && (
        <div className="fixed bottom-[4.5rem] left-0 right-0 z-30 px-4 pb-2 backdrop-blur-sm">
          <div className="max-w-lg mx-auto">
            <Button
              className="w-full h-12 text-sm font-semibold gap-2 shadow-lg rounded-xl"
              variant="secondary"
              onClick={() => navigate('/customer-portal/cart')}
            >
              <ShoppingCart size={16} />
              View Cart ({cartCount} item{cartCount > 1 ? 's' : ''})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerCatalog;
