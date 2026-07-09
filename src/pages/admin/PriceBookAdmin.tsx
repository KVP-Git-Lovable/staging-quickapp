import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Plus, Search, BookOpen, Calendar, Copy, Edit, MoreVertical, Building2, Store } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { format } from 'date-fns';
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
  effective_from: string | null;
  effective_to: string | null;
  territory_id: string | null;
  apply_to_all_territories: boolean;
  distributor_category: string | null;
  cloned_from: string | null;
  created_at: string;
  territory?: { name: string } | null;
  entries_count?: number;
}

interface Territory {
  id: string;
  name: string;
}

const priceBookTypes = {
  distributor: [
    { value: 'standard', label: 'Standard Price Book' },
    { value: 'territory', label: 'Territory Price Book' },
    { value: 'distributor_category', label: 'Distributor Category Price Book' },
  ],
  retailer: [
    { value: 'standard', label: 'Standard Retailer Price Book' },
    { value: 'retailer_territory', label: 'Territory Price Book' },
  ]
};

const distributorCategories = [
  'super_stockist',
  'distributor',
  'sub_distributor',
  'agent',
];

const PriceBookAdmin = () => {
  const navigate = useNavigate();
  const [priceBooks, setPriceBooks] = useState<PriceBook[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'distributor' | 'retailer'>('distributor');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCloneOpen, setIsCloneOpen] = useState(false);
  const [selectedPriceBook, setSelectedPriceBook] = useState<PriceBook | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price_book_type: 'standard',
    target_type: 'distributor' as 'distributor' | 'retailer',
    currency: 'INR',
    is_standard: false,
    is_active: true,
    effective_from: '',
    effective_to: '',
    territory_id: '',
    apply_to_all_territories: true,
    distributor_category: '',
  });

  useEffect(() => {
    fetchData();
  }, [activeFilter, activeTab]);

  const fetchData = async () => {
    try {
      let query = supabase
        .from('price_books')
        .select(`
          *,
          territory:territories(name)
        `)
        .eq('target_type', activeTab)
        .order('created_at', { ascending: false });

      if (activeFilter === 'active') {
        query = query.eq('is_active', true);
      } else if (activeFilter === 'inactive') {
        query = query.eq('is_active', false);
      }

      const [priceBookRes, territoriesRes] = await Promise.all([
        query,
        supabase.from('territories').select('id, name').order('name')
      ]);

      if (priceBookRes.error) throw priceBookRes.error;
      if (territoriesRes.error) throw territoriesRes.error;

      // Get entry counts
      const priceBookIds = (priceBookRes.data || []).map(pb => pb.id);
      let countMap: Record<string, number> = {};
      
      if (priceBookIds.length > 0) {
        const { data: entryCounts } = await supabase
          .from('price_book_entries')
          .select('price_book_id')
          .in('price_book_id', priceBookIds);

        countMap = (entryCounts || []).reduce((acc, entry) => {
          acc[entry.price_book_id] = (acc[entry.price_book_id] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
      }

      const booksWithCounts = (priceBookRes.data || []).map(pb => ({
        ...pb,
        target_type: pb.target_type || 'distributor',
        apply_to_all_territories: pb.apply_to_all_territories ?? false,
        entries_count: countMap[pb.id] || 0
      }));

      setPriceBooks(booksWithCounts);
      setTerritories(territoriesRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load price books');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error('Price book name is required');
      return;
    }

    try {
      const { data: user } = await supabase.auth.getUser();
      
      const insertData: any = {
        name: formData.name,
        description: formData.description || null,
        price_book_type: formData.price_book_type,
        target_type: formData.target_type,
        currency: formData.currency,
        is_standard: formData.is_standard,
        is_active: formData.is_active,
        effective_from: formData.effective_from || null,
        effective_to: formData.effective_to || null,
        territory_id: formData.apply_to_all_territories ? null : (formData.territory_id || null),
        apply_to_all_territories: formData.apply_to_all_territories,
        distributor_category: formData.distributor_category || null,
        created_by: user?.user?.id || null,
      };

      const { data: newPriceBook, error } = await supabase
        .from('price_books')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      // Auto-add all products to the price book
      const products = await fetchAllPaginated<any>((from, to) =>
        supabase
          .from('products')
          .select('id, rate, product_variants(id, price)')
          .eq('is_active', true)
          .range(from, to)
      );

      if (products && products.length > 0) {
        const entries: any[] = [];
        
        products.forEach((product: any) => {
          // Add base product
          entries.push({
            price_book_id: newPriceBook.id,
            product_id: product.id,
            variant_id: null,
            list_price: product.rate || 0,
            discount_percent: 0,
            final_price: product.rate || 0,
            min_quantity: 1,
          });

          // Add variants
          if (product.product_variants && product.product_variants.length > 0) {
            product.product_variants.forEach((variant: any) => {
              entries.push({
                price_book_id: newPriceBook.id,
                product_id: product.id,
                variant_id: variant.id,
                list_price: variant.price || product.rate || 0,
                discount_percent: 0,
                final_price: variant.price || product.rate || 0,
                min_quantity: 1,
              });
            });
          }
        });

        if (entries.length > 0) {
          await supabase.from('price_book_entries').insert(entries);
        }
      }

      toast.success('Price book created with all products');
      setIsCreateOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Error creating price book:', error);
      toast.error(error.message || 'Failed to create price book');
    }
  };

  const handleClone = async () => {
    if (!selectedPriceBook || !formData.name.trim()) {
      toast.error('Price book name is required');
      return;
    }

    try {
      const { data: user } = await supabase.auth.getUser();
      
      const { data: newPriceBook, error: createError } = await supabase
        .from('price_books')
        .insert({
          name: formData.name,
          description: formData.description || selectedPriceBook.description,
          price_book_type: formData.price_book_type,
          target_type: formData.target_type,
          currency: formData.currency || selectedPriceBook.currency,
          is_standard: false,
          is_active: formData.is_active,
          effective_from: formData.effective_from || null,
          effective_to: formData.effective_to || null,
          territory_id: formData.apply_to_all_territories ? null : (formData.territory_id || null),
          apply_to_all_territories: formData.apply_to_all_territories,
          distributor_category: formData.distributor_category || null,
          cloned_from: selectedPriceBook.id,
          created_by: user?.user?.id || null,
        })
        .select()
        .single();

      if (createError) throw createError;

      // Clone entries
      const { data: entries, error: entriesError } = await supabase
        .from('price_book_entries')
        .select('*')
        .eq('price_book_id', selectedPriceBook.id);

      if (entriesError) throw entriesError;

      if (entries && entries.length > 0) {
        const newEntries = entries.map(entry => ({
          price_book_id: newPriceBook.id,
          product_id: entry.product_id,
          variant_id: entry.variant_id,
          list_price: entry.list_price,
          discount_percent: entry.discount_percent,
          final_price: entry.final_price,
          min_quantity: entry.min_quantity,
          is_active: entry.is_active,
        }));

        const { error: insertError } = await supabase
          .from('price_book_entries')
          .insert(newEntries);

        if (insertError) throw insertError;
      }

      toast.success(`Price book cloned with ${entries?.length || 0} entries`);
      setIsCloneOpen(false);
      setSelectedPriceBook(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Error cloning price book:', error);
      toast.error(error.message || 'Failed to clone price book');
    }
  };

  const toggleActive = async (priceBook: PriceBook) => {
    try {
      const { error } = await supabase
        .from('price_books')
        .update({ is_active: !priceBook.is_active })
        .eq('id', priceBook.id);

      if (error) throw error;
      toast.success(`Price book ${priceBook.is_active ? 'deactivated' : 'activated'}`);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update price book');
    }
  };

  const openCloneDialog = (priceBook: PriceBook) => {
    setSelectedPriceBook(priceBook);
    setFormData({
      name: `${priceBook.name} - Copy`,
      description: priceBook.description || '',
      price_book_type: 'territory',
      target_type: priceBook.target_type as 'distributor' | 'retailer',
      currency: priceBook.currency,
      is_standard: false,
      is_active: true,
      effective_from: '',
      effective_to: '',
      territory_id: '',
      apply_to_all_territories: false,
      distributor_category: '',
    });
    setIsCloneOpen(true);
  };

  const openCreateDialog = () => {
    resetForm();
    setFormData(prev => ({ ...prev, target_type: activeTab }));
    setIsCreateOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      price_book_type: 'standard',
      target_type: activeTab,
      currency: 'INR',
      is_standard: false,
      is_active: true,
      effective_from: '',
      effective_to: '',
      territory_id: '',
      apply_to_all_territories: true,
      distributor_category: '',
    });
  };

  const getTypeLabel = (type: string, targetType: string) => {
    const types = targetType === 'retailer' ? priceBookTypes.retailer : priceBookTypes.distributor;
    return types.find(t => t.value === type)?.label || type;
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'standard': return 'bg-primary/10 text-primary';
      case 'territory': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'distributor_category': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'retailer_territory': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const filteredPriceBooks = priceBooks.filter(book =>
    book.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    book.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentTypeOptions = formData.target_type === 'retailer' 
    ? priceBookTypes.retailer 
    : priceBookTypes.distributor;

  const renderPriceBookCard = (book: PriceBook) => (
    <Card key={book.id} className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-lg">{book.name}</span>
              {book.is_standard && (
                <Badge variant="secondary">Standard</Badge>
              )}
              <Badge className={book.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-muted text-muted-foreground'}>
                {book.is_active ? 'Active' : 'Inactive'}
              </Badge>
              <Badge className={getTypeColor(book.price_book_type)}>
                {getTypeLabel(book.price_book_type, book.target_type)}
              </Badge>
            </div>

            {book.description && (
              <p className="text-sm text-muted-foreground">{book.description}</p>
            )}

            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <span>{book.currency}</span>
              <span>{book.entries_count || 0} products</span>
              {book.apply_to_all_territories ? (
                <span className="text-primary font-medium">All Territories</span>
              ) : book.territory ? (
                <span>Territory: {book.territory.name}</span>
              ) : null}
              {book.distributor_category && (
                <span>Category: {book.distributor_category.replace(/_/g, ' ')}</span>
              )}
              {book.effective_from && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  From: {format(new Date(book.effective_from), 'dd MMM yyyy')}
                </span>
              )}
              {book.effective_to && (
                <span>
                  To: {format(new Date(book.effective_to), 'dd MMM yyyy')}
                </span>
              )}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/admin/price-books/${book.id}`)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit & Manage Prices
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openCloneDialog(book)}>
                <Copy className="h-4 w-4 mr-2" />
                Clone Price Book
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleActive(book)}>
                {book.is_active ? 'Deactivate' : 'Activate'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );

  const renderCreateForm = () => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>Price Book Name *</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Enter price book name"
        />
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Optional description"
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>Price Book Type</Label>
        <Select
          value={formData.price_book_type}
          onValueChange={(val) => setFormData({ ...formData, price_book_type: val })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {currentTypeOptions.map(type => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Territory Assignment */}
      <div className="space-y-3 p-3 border rounded-lg">
        <Label className="text-sm font-medium">Territory Assignment</Label>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="all-territories"
            checked={formData.apply_to_all_territories}
            onCheckedChange={(checked) => setFormData({ 
              ...formData, 
              apply_to_all_territories: !!checked,
              territory_id: checked ? '' : formData.territory_id
            })}
          />
          <label htmlFor="all-territories" className="text-sm cursor-pointer">
            Apply to all territories
          </label>
        </div>
        
        {!formData.apply_to_all_territories && (
          <Select
            value={formData.territory_id}
            onValueChange={(val) => setFormData({ ...formData, territory_id: val })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select specific territory" />
            </SelectTrigger>
            <SelectContent>
              {territories.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {formData.target_type === 'distributor' && formData.price_book_type === 'distributor_category' && (
        <div className="space-y-2">
          <Label>Distributor Category</Label>
          <Select
            value={formData.distributor_category}
            onValueChange={(val) => setFormData({ ...formData, distributor_category: val })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {distributorCategories.map(cat => (
                <SelectItem key={cat} value={cat}>
                  {cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Currency</Label>
          <Input
            value={formData.currency}
            onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
            placeholder="INR"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Effective From</Label>
          <Input
            type="date"
            value={formData.effective_from}
            onChange={(e) => setFormData({ ...formData, effective_from: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Effective To</Label>
          <Input
            type="date"
            value={formData.effective_to}
            onChange={(e) => setFormData({ ...formData, effective_to: e.target.value })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label>Standard Price Book</Label>
        <Switch
          checked={formData.is_standard}
          onCheckedChange={(checked) => setFormData({ ...formData, is_standard: checked })}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label>Active</Label>
        <Switch
          checked={formData.is_active}
          onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
        />
      </div>

      <div className="p-3 bg-muted rounded-lg">
        <p className="text-sm text-muted-foreground">
          All products from product master will be automatically added to this price book with their default rates.
        </p>
      </div>

      <Button onClick={handleCreate} className="w-full">Create Price Book</Button>
    </div>
  );

  return (
    <Layout>
      <div className="container mx-auto px-4 py-6 max-w-5xl pb-24">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold">Price Book Management</h1>
              <p className="text-muted-foreground text-sm">{filteredPriceBooks.length} price books</p>
            </div>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                New Price Book
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  Create {activeTab === 'retailer' ? 'Retailer' : 'Distributor'} Price Book
                </DialogTitle>
              </DialogHeader>
              {renderCreateForm()}
            </DialogContent>
          </Dialog>
        </div>

        {/* Clone Dialog */}
        <Dialog open={isCloneOpen} onOpenChange={setIsCloneOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Clone Price Book</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                Cloning from: <strong>{selectedPriceBook?.name}</strong> ({selectedPriceBook?.entries_count || 0} entries)
              </p>

              <div className="space-y-2">
                <Label>New Price Book Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter new name"
                />
              </div>

              <div className="space-y-2">
                <Label>Price Book Type</Label>
                <Select
                  value={formData.price_book_type}
                  onValueChange={(val) => setFormData({ ...formData, price_book_type: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currentTypeOptions.filter(t => t.value !== 'standard').map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Territory Assignment for Clone */}
              <div className="space-y-3 p-3 border rounded-lg">
                <Label className="text-sm font-medium">Territory Assignment</Label>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="clone-all-territories"
                    checked={formData.apply_to_all_territories}
                    onCheckedChange={(checked) => setFormData({ 
                      ...formData, 
                      apply_to_all_territories: !!checked,
                      territory_id: checked ? '' : formData.territory_id
                    })}
                  />
                  <label htmlFor="clone-all-territories" className="text-sm cursor-pointer">
                    Apply to all territories
                  </label>
                </div>
                
                {!formData.apply_to_all_territories && (
                  <Select
                    value={formData.territory_id}
                    onValueChange={(val) => setFormData({ ...formData, territory_id: val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select specific territory" />
                    </SelectTrigger>
                    <SelectContent>
                      {territories.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {formData.target_type === 'distributor' && formData.price_book_type === 'distributor_category' && (
                <div className="space-y-2">
                  <Label>Distributor Category</Label>
                  <Select
                    value={formData.distributor_category}
                    onValueChange={(val) => setFormData({ ...formData, distributor_category: val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {distributorCategories.map(cat => (
                        <SelectItem key={cat} value={cat}>
                          {cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Effective From</Label>
                  <Input
                    type="date"
                    value={formData.effective_from}
                    onChange={(e) => setFormData({ ...formData, effective_from: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Effective To</Label>
                  <Input
                    type="date"
                    value={formData.effective_to}
                    onChange={(e) => setFormData({ ...formData, effective_to: e.target.value })}
                  />
                </div>
              </div>

              <Button onClick={handleClone} className="w-full">
                <Copy className="h-4 w-4 mr-2" />
                Clone Price Book
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Tabs for Distributor vs Retailer */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'distributor' | 'retailer')} className="mb-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="distributor" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Distributor Price Books
            </TabsTrigger>
            <TabsTrigger value="retailer" className="flex items-center gap-2">
              <Store className="h-4 w-4" />
              Retailer Price Books
            </TabsTrigger>
          </TabsList>

          <TabsContent value="distributor" className="mt-0">
            <p className="text-sm text-muted-foreground mb-4">
              Used for primary sales orders from distributors
            </p>
          </TabsContent>
          <TabsContent value="retailer" className="mt-0">
            <p className="text-sm text-muted-foreground mb-4">
              Used for secondary sales orders to retailers
            </p>
          </TabsContent>
        </Tabs>

        {/* Filters */}
        <div className="space-y-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search price books..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant={activeFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveFilter('all')}
            >
              All
            </Button>
            <Button
              variant={activeFilter === 'active' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveFilter('active')}
            >
              Active
            </Button>
            <Button
              variant={activeFilter === 'inactive' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveFilter('inactive')}
            >
              Inactive
            </Button>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : filteredPriceBooks.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No {activeTab === 'retailer' ? 'retailer' : 'distributor'} price books found
              </p>
              <Button className="mt-4" onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Price Book
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredPriceBooks.map(renderPriceBookCard)}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default PriceBookAdmin;