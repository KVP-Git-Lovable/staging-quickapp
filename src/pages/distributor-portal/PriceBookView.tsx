import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, BookOpen, Tag, ShoppingCart, Store } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/money';

interface PrimaryRow {
  key: string;
  product_id: string;
  variant_id: string | null;
  product_name: string;
  variant_name?: string;
  min_quantity: number;
  price: number;
  currency: string;
  price_book_name: string | null;
}

interface SecondaryRow {
  id: string;
  product_name: string;
  variant_name?: string;
  list_price: number;
  final_price: number;
  discount_percent: number | null;
  uom: string | null;
  min_quantity: number | null;
}

const fetchNameMaps = async (productIds: string[], variantIds: string[]) => {
  const [prodRes, varRes] = await Promise.all([
    productIds.length
      ? supabase.from('products').select('id, name').in('id', productIds)
      : Promise.resolve({ data: [] } as any),
    variantIds.length
      ? supabase.from('product_variants').select('id, variant_name').in('id', variantIds)
      : Promise.resolve({ data: [] } as any),
  ]);
  const productMap = new Map<string, string>(((prodRes as any)?.data || []).map((p: any) => [p.id, p.name]));
  const variantMap = new Map<string, string>(((varRes as any)?.data || []).map((v: any) => [v.id, v.variant_name]));
  return { productMap, variantMap };
};

const PriceBookView = () => {
  const distributorId = localStorage.getItem('distributor_id');

  const [primaryRows, setPrimaryRows] = useState<PrimaryRow[]>([]);
  const [primaryBookName, setPrimaryBookName] = useState<string | null>(null);
  const [primaryLoading, setPrimaryLoading] = useState(true);

  const [secondaryRows, setSecondaryRows] = useState<SecondaryRow[]>([]);
  const [secondaryBook, setSecondaryBook] = useState<{ name: string; currency: string } | null>(null);
  const [secondaryLoading, setSecondaryLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!distributorId) {
      setPrimaryLoading(false);
      setSecondaryLoading(false);
      return;
    }
    void loadPrimary();
    void loadSecondary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distributorId]);

  const loadPrimary = async () => {
    setPrimaryLoading(true);
    try {
      const { data, error } = await supabase.rpc('resolve_prices_for_distributor' as any, {
        p_distributor_id: distributorId!,
      });
      if (error) throw error;

      const rows = (data as any[]) || [];
      if (!rows.length) {
        setPrimaryRows([]);
        setPrimaryBookName(null);
        return;
      }

      const productIds = [...new Set(rows.map((r) => r.product_id).filter(Boolean))];
      const variantIds = [...new Set(rows.map((r) => r.variant_id).filter(Boolean))] as string[];
      const { productMap, variantMap } = await fetchNameMaps(productIds, variantIds);

      setPrimaryBookName(rows[0]?.price_book_name ?? null);
      setPrimaryRows(
        rows.map((r, i) => ({
          key: `${r.product_id}-${r.variant_id ?? 'base'}-${r.min_quantity}-${i}`,
          product_id: r.product_id,
          variant_id: r.variant_id,
          product_name: productMap.get(r.product_id) || 'Unknown',
          variant_name: r.variant_id ? variantMap.get(r.variant_id) : undefined,
          min_quantity: Number(r.min_quantity) || 1,
          price: Number(r.price) || 0,
          currency: r.currency || 'INR',
          price_book_name: r.price_book_name ?? null,
        })),
      );
    } catch (e) {
      console.error('Error loading buy prices:', e);
      toast.error('Failed to load your purchase prices');
    } finally {
      setPrimaryLoading(false);
    }
  };

  const loadSecondary = async () => {
    setSecondaryLoading(true);
    try {
      const { data: assignments } = await supabase
        .from('distributor_price_books')
        .select('price_book_id, price_books!inner(id, name, currency, target_type, is_active)')
        .eq('distributor_id', distributorId!)
        .eq('is_active', true);

      const match = ((assignments as any[]) || []).find((a) => {
        const pb = a.price_books;
        return pb && pb.is_active !== false && (pb.target_type ?? 'retailer') === 'retailer';
      });

      if (!match) {
        setSecondaryBook(null);
        setSecondaryRows([]);
        return;
      }

      const pb = match.price_books;
      setSecondaryBook({ name: pb.name, currency: pb.currency || 'INR' });

      const { data: entriesData } = await supabase
        .from('price_book_entries')
        .select('*')
        .eq('price_book_id', pb.id)
        .eq('is_active', true)
        .order('created_at');

      const entries = (entriesData as any[]) || [];
      if (!entries.length) {
        setSecondaryRows([]);
        return;
      }

      const productIds = [...new Set(entries.map((e) => e.product_id).filter(Boolean))];
      const variantIds = [...new Set(entries.filter((e) => e.variant_id).map((e) => e.variant_id))] as string[];
      const { productMap, variantMap } = await fetchNameMaps(productIds, variantIds);

      setSecondaryRows(
        entries.map((e) => ({
          id: e.id,
          product_name: productMap.get(e.product_id) || 'Unknown',
          variant_name: e.variant_id ? variantMap.get(e.variant_id) : undefined,
          list_price: Number(e.list_price) || 0,
          final_price: Number(e.final_price) || 0,
          discount_percent: e.discount_percent,
          uom: e.uom,
          min_quantity: e.min_quantity,
        })),
      );
    } catch (e) {
      console.error('Error loading sell prices:', e);
      toast.error('Failed to load your retailer price book');
    } finally {
      setSecondaryLoading(false);
    }
  };

  const q = searchQuery.trim().toLowerCase();
  const matches = (name: string, variant?: string) =>
    !q || name.toLowerCase().includes(q) || (variant?.toLowerCase().includes(q) ?? false);

  // Group primary rows by product+variant, with slabs sorted by min_quantity
  const primaryGroups = useMemo(() => {
    const map = new Map<string, { name: string; variant?: string; slabs: PrimaryRow[] }>();
    for (const r of primaryRows) {
      if (!matches(r.product_name, r.variant_name)) continue;
      const key = `${r.product_id}-${r.variant_id ?? 'base'}`;
      if (!map.has(key)) map.set(key, { name: r.product_name, variant: r.variant_name, slabs: [] });
      map.get(key)!.slabs.push(r);
    }
    const groups = [...map.values()];
    groups.forEach((g) => g.slabs.sort((a, b) => a.min_quantity - b.min_quantity));
    groups.sort((a, b) => a.name.localeCompare(b.name));
    return groups;
  }, [primaryRows, q]);

  const filteredSecondary = useMemo(
    () => secondaryRows.filter((e) => matches(e.product_name, e.variant_name)),
    [secondaryRows, q],
  );

  const Spinner = () => (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-primary" />
          Price Books
        </h1>
        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
          <Tag className="w-3 h-3" />
          Read-only view of what you buy at and what your retailers pay
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <Tabs defaultValue="buy" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="buy" className="gap-2">
            <ShoppingCart className="w-4 h-4" /> I buy at
          </TabsTrigger>
          <TabsTrigger value="sell" className="gap-2">
            <Store className="w-4 h-4" /> I sell at
          </TabsTrigger>
        </TabsList>

        {/* PRIMARY */}
        <TabsContent value="buy" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {primaryBookName && <Badge variant="outline">{primaryBookName}</Badge>}
            <span>{primaryGroups.length} products</span>
          </div>

          {primaryLoading ? (
            <Spinner />
          ) : primaryRows.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-medium text-foreground mb-1">No purchase prices found</h3>
                <p className="text-sm text-muted-foreground">
                  Contact your company to get a price book assigned.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Qty from</TableHead>
                        <TableHead className="text-right">Your Price</TableHead>
                        <TableHead>Price Book</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {primaryGroups.map((g) =>
                        g.slabs.map((slab, idx) => (
                          <TableRow key={slab.key}>
                            <TableCell>
                              {idx === 0 ? (
                                <div>
                                  <p className="font-medium text-sm">{g.name}</p>
                                  {g.variant && (
                                    <p className="text-xs text-muted-foreground">{g.variant}</p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground pl-4">↳ slab</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{slab.min_quantity}+</TableCell>
                            <TableCell className="text-right font-semibold text-sm">
                              {formatCurrency(slab.price, slab.currency)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {slab.price_book_name || '—'}
                            </TableCell>
                          </TableRow>
                        )),
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* SECONDARY */}
        <TabsContent value="sell" className="mt-4 space-y-3">
          {secondaryBook && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">{secondaryBook.name}</Badge>
              <span>{secondaryRows.length} products</span>
            </div>
          )}

          {secondaryLoading ? (
            <Spinner />
          ) : !secondaryBook ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Store className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-medium text-foreground mb-1">No retailer price book assigned yet.</h3>
                <p className="text-sm text-muted-foreground">Ask your administrator to assign one.</p>
              </CardContent>
            </Card>
          ) : secondaryRows.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">This price book has no active entries yet.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">List Price</TableHead>
                        <TableHead className="text-right">Discount</TableHead>
                        <TableHead className="text-right">Retailer Price</TableHead>
                        <TableHead>Qty from</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSecondary.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{entry.product_name}</p>
                              {entry.variant_name && (
                                <p className="text-xs text-muted-foreground">{entry.variant_name}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground line-through">
                            {formatCurrency(entry.list_price, secondaryBook.currency)}
                          </TableCell>
                          <TableCell className="text-right">
                            {entry.discount_percent ? (
                              <Badge variant="secondary" className="text-xs">
                                {entry.discount_percent}% off
                              </Badge>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-sm">
                            {formatCurrency(entry.final_price, secondaryBook.currency)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {entry.min_quantity ? `${entry.min_quantity} ${entry.uom || 'pcs'}` : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PriceBookView;
