import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Calculator, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAllPaginated } from '@/utils/fetchAllPaginated';

interface Candidate {
  price_book_id: string;
  price_book_name: string;
  score: number;
  matched_on: string;
  effective_from: string | null;
  effective_to: string | null;
  prices_this_item: boolean;
  entry_price: number | null;
  min_quantity: number | null;
}

interface SimResult {
  currency?: string;
  base_currency?: string;
  price?: number | null;
  final_price?: number | null;
  price_book_id?: string | null;
  price_book_name?: string | null;
  matched_on?: string | null;
  score?: number | null;
  min_quantity?: number | null;
  default_price?: number | null;
  candidates?: Candidate[];
  [k: string]: any;
}

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

const PriceSimulator = () => {
  const navigate = useNavigate();
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [running, setRunning] = useState(false);

  const [retailers, setRetailers] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; product_variants: { id: string; variant_name: string }[] }[]>([]);
  const [users, setUsers] = useState<{ id: string; full_name: string | null }[]>([]);

  const [retailerId, setRetailerId] = useState('');
  const [productId, setProductId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [userId, setUserId] = useState('');

  const [result, setResult] = useState<SimResult | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [retailersAll, productsAll, profilesRes] = await Promise.all([
          fetchAllPaginated<any>((from, to) =>
            supabase.from('retailers').select('id, name').order('name').range(from, to)
          ),
          fetchAllPaginated<any>((from, to) =>
            supabase
              .from('products')
              .select('id, name, product_variants(id, variant_name)')
              .eq('is_active', true)
              .order('name')
              .range(from, to)
          ),
          supabase.from('profiles').select('id, full_name').order('full_name'),
        ]);
        setRetailers(retailersAll || []);
        setProducts((productsAll || []).map((p: any) => ({ ...p, product_variants: p.product_variants || [] })));
        setUsers((profilesRes.data as any[]) || []);
      } catch (e: any) {
        console.error(e);
        toast.error('Failed to load reference data');
      } finally {
        setLoadingRefs(false);
      }
    })();
  }, []);

  const selectedProduct = products.find((p) => p.id === productId);

  const retailerLabels = useMemo(
    () => Object.fromEntries(retailers.map((r) => [r.id, r.name])),
    [retailers]
  );
  const productLabels = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p.name])),
    [products]
  );
  const userLabels = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.full_name || u.id])),
    [users]
  );
  const variantLabels = useMemo(
    () => Object.fromEntries((selectedProduct?.product_variants || []).map((v) => [v.id, v.variant_name])),
    [selectedProduct]
  );

  const runSimulation = async () => {
    if (!retailerId || !productId) {
      toast.error('Retailer and product are required');
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.rpc('simulate_product_price' as any, {
        p_retailer_id: retailerId,
        p_product_id: productId,
        p_variant_id: variantId || null,
        p_quantity: quantity || 1,
        p_user_id: userId || null,
      });
      if (error) throw error;
      setResult((data as any) || {});
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Simulation failed');
    } finally {
      setRunning(false);
    }
  };

  const candidates: Candidate[] = Array.isArray(result?.candidates) ? result!.candidates! : [];
  const winningPrice = result?.price ?? result?.final_price ?? null;
  const winnerId = result?.price_book_id ?? null;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-6 max-w-5xl pb-24">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/price-books')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calculator className="h-5 w-5" /> Price Simulator
            </h1>
            <p className="text-muted-foreground text-sm">
              Read-only. Shows which price book wins for a retailer / product / quantity.
            </p>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Inputs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Retailer *</Label>
                <SearchableSelect
                  value={retailerId}
                  onValueChange={setRetailerId}
                  options={retailers.map((r) => r.id)}
                  labels={retailerLabels}
                  placeholder="Select retailer"
                  searchPlaceholder="Search retailers..."
                  loading={loadingRefs}
                />
              </div>
              <div className="space-y-2">
                <Label>Product *</Label>
                <SearchableSelect
                  value={productId}
                  onValueChange={(v) => {
                    setProductId(v);
                    setVariantId('');
                  }}
                  options={products.map((p) => p.id)}
                  labels={productLabels}
                  placeholder="Select product"
                  searchPlaceholder="Search products..."
                  loading={loadingRefs}
                />
              </div>
              <div className="space-y-2">
                <Label>Variant (optional)</Label>
                <SearchableSelect
                  value={variantId}
                  onValueChange={setVariantId}
                  options={(selectedProduct?.product_variants || []).map((v) => v.id)}
                  labels={variantLabels}
                  placeholder={selectedProduct ? 'Base product (no variant)' : 'Select a product first'}
                  searchPlaceholder="Search variants..."
                  disabled={!selectedProduct || (selectedProduct.product_variants || []).length === 0}
                />
              </div>
              <div className="space-y-2">
                <Label>Salesperson (optional)</Label>
                <SearchableSelect
                  value={userId}
                  onValueChange={setUserId}
                  options={users.map((u) => u.id)}
                  labels={userLabels}
                  placeholder="Any salesperson"
                  searchPlaceholder="Search users..."
                  loading={loadingRefs}
                />
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                />
              </div>
            </div>
            <Button onClick={runSimulation} disabled={running || loadingRefs}>
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}
              Simulate price
            </Button>
          </CardContent>
        </Card>

        {result && (
          <div className="space-y-6">
            {/* Headline */}
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Winning price</p>
                <p className="text-3xl font-bold">
                  {winningPrice != null
                    ? `${result?.currency || result?.base_currency || ''} ${Number(winningPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : 'No price book matched'}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-3 text-sm">
                  {result?.price_book_name && <Badge variant="secondary">Book: {result.price_book_name}</Badge>}
                  {result?.matched_on && <Badge variant="outline">Matched on: {result.matched_on}</Badge>}
                  {result?.score != null && <Badge variant="outline">Score: {result.score}</Badge>}
                  {result?.min_quantity != null && (
                    <Badge variant="outline">Slab applied: min qty {result.min_quantity}</Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Candidates */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Books considered</CardTitle>
                <p className="text-xs text-muted-foreground flex items-start gap-1">
                  <Info className="h-3 w-3 mt-0.5 shrink-0" />
                  A book with “Prices this item = No” does not list this product/variant at this quantity slab — it is
                  skipped and the next matching book is used.
                </p>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {candidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No matching price books.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Price book</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                        <TableHead>Matched on</TableHead>
                        <TableHead>Effective</TableHead>
                        <TableHead>Prices this item</TableHead>
                        <TableHead className="text-right">Entry price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {candidates.map((c) => {
                        const isWinner = winnerId && c.price_book_id === winnerId;
                        return (
                          <TableRow key={`${c.price_book_id}-${c.score}`} className={isWinner ? 'bg-primary/10' : ''}>
                            <TableCell className="font-medium">
                              {c.price_book_name}
                              {isWinner && <Badge className="ml-2">Winner</Badge>}
                            </TableCell>
                            <TableCell className="text-right">{c.score}</TableCell>
                            <TableCell>{c.matched_on}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {fmtDate(c.effective_from)} → {fmtDate(c.effective_to)}
                            </TableCell>
                            <TableCell>
                              {c.prices_this_item ? (
                                <Badge variant="secondary">Yes</Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">Skipped</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {c.entry_price != null
                                ? Number(c.entry_price).toLocaleString(undefined, { maximumFractionDigits: 2 })
                                : '—'}
                              {c.prices_this_item && c.min_quantity != null && (
                                <span className="block text-xs text-muted-foreground">slab ≥ {c.min_quantity}</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Footer default price */}
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Fallback if no price book prices this item</p>
                  <p className="text-xs text-muted-foreground">Product default price, in the base currency.</p>
                </div>
                <p className="text-lg font-semibold">
                  {result?.default_price != null
                    ? `${result?.base_currency || ''} ${Number(result.default_price).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : '—'}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default PriceSimulator;
