import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Tag } from 'lucide-react';
import { CustomerPortalUser } from '@/hooks/useCustomerPortalAuth';
import { useResolvedRetailerPrices } from '@/hooks/useResolvedRetailerPrices';
import { formatCurrency } from '@/lib/money';

interface ContextType {
  retailer: CustomerPortalUser;
}

const CustomerPrices = () => {
  const { retailer } = useOutletContext<ContextType>();
  const [search, setSearch] = useState('');

  const { rows, isLoading, priceBookName } = useResolvedRetailerPrices(retailer?.id, supabase);

  const productIds = useMemo(() => [...new Set(rows.map((r) => r.product_id))], [rows]);
  const variantIds = useMemo(
    () => [...new Set(rows.map((r) => r.variant_id).filter(Boolean))] as string[],
    [rows],
  );

  const { data: names } = useQuery({
    queryKey: ['customer-price-names', productIds.length, variantIds.length],
    queryFn: async () => {
      const [prodRes, varRes] = await Promise.all([
        productIds.length
          ? supabase.from('products').select('id, name').in('id', productIds)
          : Promise.resolve({ data: [] } as any),
        variantIds.length
          ? supabase.from('product_variants').select('id, variant_name').in('id', variantIds)
          : Promise.resolve({ data: [] } as any),
      ]);
      return {
        products: new Map<string, string>(((prodRes as any).data || []).map((p: any) => [p.id, p.name])),
        variants: new Map<string, string>(((varRes as any).data || []).map((v: any) => [v.id, v.variant_name])),
      };
    },
    enabled: rows.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, { name: string; variant?: string; slabs: typeof rows }>();
    for (const r of rows) {
      const name = names?.products.get(r.product_id) || 'Product';
      const variant = r.variant_id ? names?.variants.get(r.variant_id) : undefined;
      if (q && !name.toLowerCase().includes(q) && !(variant?.toLowerCase().includes(q))) continue;
      const key = `${r.product_id}-${r.variant_id ?? 'base'}`;
      if (!map.has(key)) map.set(key, { name, variant, slabs: [] });
      map.get(key)!.slabs.push(r);
    }
    const out = [...map.values()];
    out.forEach((g) => g.slabs.sort((a, b) => a.min_quantity - b.min_quantity));
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [rows, names, search]);

  return (
    <div className="px-4 pt-5 pb-28 max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Tag className="w-5 h-5 text-primary" />
          My Prices
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {priceBookName && <Badge variant="outline" className="text-[10px]">{priceBookName}</Badge>}
          <span className="text-[11px] text-muted-foreground">{groups.length} products</span>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-10 text-sm rounded-xl bg-card"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : groups.length === 0 ? (
        <Card className="rounded-xl">
          <CardContent className="p-8 text-center">
            <Tag className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No special prices assigned to you yet. Catalog prices apply.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map((g, i) => (
            <Card key={`${g.name}-${i}`} className="rounded-xl border-border/50">
              <CardContent className="p-3 space-y-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{g.name}</p>
                  {g.variant && <p className="text-[11px] text-muted-foreground">{g.variant}</p>}
                </div>
                <div className="divide-y divide-border/30">
                  {g.slabs.map((s, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        Qty from {s.min_quantity}
                      </span>
                      <span className="text-sm font-semibold text-foreground">
                        {formatCurrency(s.price, s.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomerPrices;
