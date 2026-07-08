import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, Search, Save, Trash2, Package, RefreshCw, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAllPaginated } from '@/utils/fetchAllPaginated';

interface PriceBook {
  id: string;
  name: string;
  description: string | null;
  price_book_type: string;
  target_type: string;
  currency: string;
  is_standard: boolean;
  is_active: boolean;
}

interface PriceBookEntry {
  id: string;
  product_id: string;
  variant_id: string | null;
  list_price: number;
  discount_percent: number;
  final_price: number;
  min_quantity: number;
  uom?: string | null;
  is_active: boolean;
  product?: { name: string; unit: string | null; category_id: string | null } | null;
  variant?: { variant_name: string } | null;
}

interface Product {
  id: string;
  name: string;
  unit?: string | null;
  mrp?: number | null;
  category_id?: string | null;
  product_variants: { id: string; variant_name: string; price?: number | null }[];
}

interface Category {
  id: string;
  name: string;
}

const PriceBookDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [priceBook, setPriceBook] = useState<PriceBook | null>(null);
  const [entries, setEntries] = useState<PriceBookEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');
  const [newEntry, setNewEntry] = useState({
    list_price: 0,
    discount_percent: 0,
    min_quantity: 1,
    uom: '',
  });

  useEffect(() => {
    if (id) {
      fetchData();
    }
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [priceBookRes, entriesRes, productsAll, categoriesRes] = await Promise.all([
        supabase.from('price_books').select('*').eq('id', id).single(),
        supabase
          .from('price_book_entries')
          .select(`
            *,
            product:products(name, unit:base_unit, category_id),
            variant:product_variants(variant_name)
          `)
          .eq('price_book_id', id)
          .order('created_at', { ascending: false }),
        fetchAllPaginated<any>((from, to) =>
          supabase
            .from('products')
            .select('id, name, unit:base_unit, rate, category_id, product_variants(id, variant_name, price)')
            .eq('is_active', true)
            .order('name')
            .range(from, to)
        ),

        supabase
          .from('product_categories')
          .select('id, name')
          .order('name'),
      ]);

      if (priceBookRes.error) throw priceBookRes.error;
      if (entriesRes.error) throw entriesRes.error;

      setPriceBook({
        ...priceBookRes.data,
        target_type: priceBookRes.data.target_type || 'distributor'
      });
      setEntries(entriesRes.data || []);
      setCategories(categoriesRes.data || []);
      
      // Map products to match Product interface
      const mappedProducts: Product[] = (productsAll || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        unit: p.unit,
        mrp: p.rate,
        category_id: p.category_id,
        product_variants: p.product_variants || []
      }));
      setProducts(mappedProducts);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load price book');
      navigate('/admin/price-books');
    } finally {
      setLoading(false);
    }
  };

  const syncAllProducts = async () => {
    if (!id) return;
    
    setSyncing(true);
    try {
      // Get existing product/variant combinations
      const existingKeys = new Set(
        entries.map(e => `${e.product_id}-${e.variant_id || 'null'}`)
      );

      const newEntries: any[] = [];
      
      products.forEach(product => {
        // Check base product
        const baseKey = `${product.id}-null`;
        if (!existingKeys.has(baseKey)) {
          newEntries.push({
            price_book_id: id,
            product_id: product.id,
            variant_id: null,
            list_price: product.mrp || 0,
            discount_percent: 0,
            final_price: product.mrp || 0,
            min_quantity: 1,
          });
        }

        // Check variants
        product.product_variants.forEach(variant => {
          const variantKey = `${product.id}-${variant.id}`;
          if (!existingKeys.has(variantKey)) {
            newEntries.push({
              price_book_id: id,
              product_id: product.id,
              variant_id: variant.id,
              list_price: variant.price || product.mrp || 0,
              discount_percent: 0,
              final_price: variant.price || product.mrp || 0,
              min_quantity: 1,
            });
          }
        });
      });

      if (newEntries.length > 0) {
        const { error } = await supabase.from('price_book_entries').insert(newEntries);
        if (error) throw error;
        toast.success(`Added ${newEntries.length} new products`);
        fetchData();
      } else {
        toast.info('All products already in price book');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to sync products');
    } finally {
      setSyncing(false);
    }
  };

  const handleAddEntry = async () => {
    if (!selectedProduct) {
      toast.error('Please select a product');
      return;
    }

    const finalPrice = newEntry.list_price * (1 - newEntry.discount_percent / 100);

    try {
      const { error } = await supabase.from('price_book_entries').insert({
        price_book_id: id,
        product_id: selectedProduct,
        variant_id: selectedVariant || null,
        list_price: newEntry.list_price,
        discount_percent: newEntry.discount_percent,
        final_price: finalPrice,
        min_quantity: newEntry.min_quantity,
      });

      if (error) throw error;
      toast.success('Product added to price book');
      setIsAddOpen(false);
      resetAddForm();
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add product');
    }
  };

  const handleUpdateEntry = async (entry: PriceBookEntry, field: string, value: number | string) => {
    const updatedEntry = { ...entry, [field]: value };
    const finalPrice = typeof updatedEntry.list_price === 'number' && typeof updatedEntry.discount_percent === 'number' 
      ? updatedEntry.list_price * (1 - updatedEntry.discount_percent / 100) 
      : entry.final_price;

    try {
      const updateData: Record<string, any> = { [field]: value };
      if (field === 'list_price' || field === 'discount_percent') {
        updateData.final_price = finalPrice;
      }

      const { error } = await supabase
        .from('price_book_entries')
        .update(updateData)
        .eq('id', entry.id);

      if (error) throw error;
      setEntries(entries.map(e => 
        e.id === entry.id ? { ...e, [field]: value, ...(field === 'list_price' || field === 'discount_percent' ? { final_price: finalPrice } : {}) } : e
      ));
    } catch (error: any) {
      toast.error(error.message || 'Failed to update');
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    try {
      const { error } = await supabase
        .from('price_book_entries')
        .delete()
        .eq('id', entryId);

      if (error) throw error;
      toast.success('Product removed');
      setEntries(entries.filter(e => e.id !== entryId));
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove');
    }
  };

  const resetAddForm = () => {
    setSelectedProduct('');
    setSelectedVariant('');
    setNewEntry({ list_price: 0, discount_percent: 0, min_quantity: 1, uom: '' });
  };

  const getCategoryName = (categoryId: string | null | undefined) => {
    if (!categoryId) return 'Uncategorized';
    const cat = categories.find(c => c.id === categoryId);
    return cat?.name || 'Uncategorized';
  };

  const selectedProductData = products.find(p => p.id === selectedProduct);

  const filteredEntries = entries.filter(entry => {
    const matchesSearch = entry.product?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.variant?.variant_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || entry.product?.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Group entries by category for display
  const entriesByCategory = filteredEntries.reduce((acc, entry) => {
    const categoryId = entry.product?.category_id || 'uncategorized';
    if (!acc[categoryId]) {
      acc[categoryId] = [];
    }
    acc[categoryId].push(entry);
    return acc;
  }, {} as Record<string, PriceBookEntry[]>);

  if (loading) {
    return (
      <Layout>
        <div className="p-4 text-center">Loading...</div>
      </Layout>
    );
  }

  if (!priceBook) {
    return (
      <Layout>
        <div className="p-4 text-center">Price book not found</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-6 max-w-5xl pb-24">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/price-books')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{priceBook.name}</h1>
                <Badge className={priceBook.is_active ? 'bg-green-100 text-green-800' : 'bg-muted'}>
                  {priceBook.is_active ? 'Active' : 'Inactive'}
                </Badge>
                <Badge variant="outline">
                  {priceBook.target_type === 'retailer' ? 'Retailer' : 'Distributor'}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm">
                {entries.length} products • {priceBook.currency}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={syncAllProducts} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              Sync All Products
            </Button>
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetAddForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Product
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Product to Price Book</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Product *</Label>
                    <Select value={selectedProduct} onValueChange={(val) => {
                      setSelectedProduct(val);
                      setSelectedVariant('');
                      const prod = products.find(p => p.id === val);
                      if (prod) {
                        setNewEntry({ ...newEntry, list_price: prod.mrp || 0 });
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map(product => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedProductData?.product_variants?.length > 0 && (
                    <div className="space-y-2">
                      <Label>Variant (Optional)</Label>
                      <Select value={selectedVariant} onValueChange={(val) => {
                        setSelectedVariant(val);
                        const variantData = selectedProductData.product_variants.find(v => v.id === val);
                        if (variantData) {
                          setNewEntry({ ...newEntry, list_price: variantData.price || selectedProductData.mrp || 0 });
                        }
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select variant" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">No variant (Base product)</SelectItem>
                          {selectedProductData.product_variants.map(variant => (
                            <SelectItem key={variant.id} value={variant.id}>
                              {variant.variant_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>List Price</Label>
                      <Input
                        type="number"
                        value={newEntry.list_price}
                        onChange={(e) => setNewEntry({ ...newEntry, list_price: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Discount %</Label>
                      <Input
                        type="number"
                        value={newEntry.discount_percent}
                        onChange={(e) => setNewEntry({ ...newEntry, discount_percent: parseFloat(e.target.value) || 0 })}
                        min={0}
                        max={100}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Min Quantity</Label>
                    <Input
                      type="number"
                      value={newEntry.min_quantity}
                      onChange={(e) => setNewEntry({ ...newEntry, min_quantity: parseInt(e.target.value) || 1 })}
                      min={1}
                    />
                  </div>

                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Final Price</p>
                    <p className="text-lg font-bold">
                      ₹{(newEntry.list_price * (1 - newEntry.discount_percent / 100)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </p>
                  </div>

                  <Button onClick={handleAddEntry} className="w-full">Add Product</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search and Category Filter */}
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
              <SelectItem value="uncategorized">Uncategorized</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Entries List */}
        {filteredEntries.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No products in this price book</p>
              <Button onClick={syncAllProducts} disabled={syncing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                Add All Products
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(entriesByCategory).map(([categoryId, categoryEntries]) => (
              <div key={categoryId}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                  {getCategoryName(categoryId === 'uncategorized' ? null : categoryId)} ({categoryEntries.length})
                </h3>
                <div className="space-y-3">
                  {categoryEntries.map(entry => (
                    <Card key={entry.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex-1 min-w-[200px]">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => navigate(`/product-management?product=${entry.product_id}`)}
                                className="font-medium truncate text-primary hover:underline flex items-center gap-1"
                              >
                                {entry.product?.name}
                                <ExternalLink className="h-3 w-3" />
                              </button>
                              {entry.variant && (
                                <Badge variant="outline" className="text-xs">
                                  {entry.variant.variant_name}
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <div>
                              <Input
                                type="number"
                                value={entry.min_quantity}
                                onChange={(e) => handleUpdateEntry(entry, 'min_quantity', parseInt(e.target.value) || 1)}
                                className="w-20 text-center"
                                min={1}
                              />
                              <p className="text-xs text-muted-foreground text-center">Min Qty</p>
                            </div>
                            <div>
                              <Input
                                value={entry.uom || entry.product?.unit || 'pc'}
                                onChange={(e) => handleUpdateEntry(entry, 'uom', e.target.value)}
                                className="w-20 text-center"
                                placeholder="UOM"
                              />
                              <p className="text-xs text-muted-foreground text-center">UOM</p>
                            </div>
                            <div>
                              <Input
                                type="number"
                                value={entry.list_price}
                                onChange={(e) => handleUpdateEntry(entry, 'list_price', parseFloat(e.target.value) || 0)}
                                className="w-24 text-right"
                              />
                              <p className="text-xs text-muted-foreground text-center">List Price</p>
                            </div>
                            <div>
                              <Input
                                type="number"
                                value={entry.discount_percent}
                                onChange={(e) => handleUpdateEntry(entry, 'discount_percent', parseFloat(e.target.value) || 0)}
                                className="w-20 text-right"
                                min={0}
                                max={100}
                              />
                              <p className="text-xs text-muted-foreground text-center">Disc %</p>
                            </div>
                            <div className="min-w-20 text-center">
                              <p className="font-bold text-primary">
                                ₹{entry.final_price?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </p>
                              <p className="text-xs text-muted-foreground">Final</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => handleDeleteEntry(entry.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default PriceBookDetail;