import { useState, useEffect, useMemo } from 'react';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { moveToRecycleBin } from '@/utils/recycleBinUtils';
import { Truck, Plus, Edit, Trash2, Package, RotateCcw, ChevronDown, ChevronRight, ShoppingCart, TrendingDown, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { useProfilePermissions } from '@/hooks/useProfilePermissions';
import { UserSelector } from '@/components/UserSelector';
import { useSubordinates } from '@/hooks/useSubordinates';

interface Van {
  id: string;
  registration_number: string;
  make_model: string;
  purchase_date?: string;
  rc_book_url?: string;
  rc_expiry_date?: string;
  insurance_url?: string;
  insurance_expiry_date?: string;
  pollution_cert_url?: string;
  pollution_expiry_date?: string;
  driver_name?: string;
  driver_phone?: string;
  driver_address?: string;
  is_active: boolean;
  assigned_user_id?: string;
  assigned_user_name?: string;
}

interface UserOption {
  id: string;
  full_name: string;
}

interface VanStockSummary {
  id: string;
  van_id: string;
  van_registration: string;
  van_model: string;
  user_name: string;
  user_id: string;
  beat_name: string;
  stock_date: string;
  total_stock: number;
  total_ordered: number;
  total_returned: number;
  closing_stock: number;
  start_km: number;
  end_km: number;
  items: VanStockItem[];
}

interface VanStockItem {
  id: string;
  product_id: string;
  product_name: string;
  unit: string;
  start_qty: number;
  ordered_qty: number;
  returned_qty: number;
  left_qty: number;
  price_without_gst: number;
}

interface OpeningGRNEdit {
  id: string;
  van_stock_id: string;
  user_id: string;
  user_name: string;
  product_id: string;
  product_name: string;
  previous_qty: number;
  edited_qty: number;
  difference: number;
  unit: string;
  created_at: string;
  stock_date: string;
  edit_source: string;
}

export default function VanSalesManagement() {
  const navigate = useNavigate();
  const { hasAdminAccess } = useAdminAccess();
  const { user } = useAuth();
  const [vans, setVans] = useState<Van[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingVan, setEditingVan] = useState<Van | null>(null);
  // No date filter - show all van stock data for admin
  const [vanStockSummaries, setVanStockSummaries] = useState<VanStockSummary[]>([]);
  const [openingGRNEdits, setOpeningGRNEdits] = useState<OpeningGRNEdit[]>([]);
  const [expandedVans, setExpandedVans] = useState<Set<string>>(new Set());
  
  // Hierarchical user filter (for managers)
  const { isManager, subordinateIds, subordinates } = useSubordinates();
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  
  // Filter van stock summaries based on selected user
  const { hasPermission: hasVanPerm } = useProfilePermissions();
  const canViewAll = hasVanPerm('admin_van_sales', 'can_view_all');

  const filteredVanStockSummaries = useMemo(() => {
    if (selectedUserId === 'all') {
      // Show all if user has can_view_all permission, otherwise filter to subordinates
      if (isManager && !canViewAll) {
        return vanStockSummaries.filter(s => 
          s.user_id === user?.id || subordinateIds.includes(s.user_id)
        );
      }
      return vanStockSummaries;
    }
    if (selectedUserId === 'self') {
      return vanStockSummaries.filter(s => s.user_id === user?.id);
    }
    return vanStockSummaries.filter(s => s.user_id === selectedUserId);
  }, [vanStockSummaries, selectedUserId, user?.id, subordinateIds, isManager, canViewAll]);
  
  const [formData, setFormData] = useState({
    registration_number: '',
    make_model: '',
    purchase_date: '',
    rc_expiry_date: '',
    insurance_expiry_date: '',
    pollution_expiry_date: '',
    driver_name: '',
    driver_phone: '',
    driver_address: '',
    assigned_user_id: '',
  });

  useEffect(() => {
    if (!hasAdminAccess) {
      navigate('/');
      return;
    }
    loadVans();
    loadUsers();
    loadVanStockSummaries();
    loadOpeningGRNEdits();
  }, [hasAdminAccess, navigate]);

  // Real-time subscription for van_stock and van_stock_items changes
  useEffect(() => {
    const channel = supabase
      .channel('van-stock-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'van_stock' },
        () => { loadVanStockSummaries(); loadOpeningGRNEdits(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'van_stock_items' },
        () => loadVanStockSummaries()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'van_stock_opening_edits' },
        () => loadOpeningGRNEdits()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadOpeningGRNEdits = async () => {
    try {
      const { data: edits, error } = await supabase
        .from('van_stock_opening_edits')
        .select('*, van_stock(stock_date, user_id)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get user names
      const userIds = [...new Set(edits?.map(e => (e.van_stock as any)?.user_id).filter(Boolean) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      const profileMap: Record<string, string> = {};
      profiles?.forEach(p => { profileMap[p.id] = p.full_name || 'Unknown'; });

      const formattedEdits: OpeningGRNEdit[] = (edits || []).map(e => ({
        id: e.id,
        van_stock_id: e.van_stock_id,
        user_id: (e.van_stock as any)?.user_id || e.user_id,
        user_name: profileMap[(e.van_stock as any)?.user_id || e.user_id] || 'Unknown',
        product_id: e.product_id,
        product_name: e.product_name,
        previous_qty: e.previous_qty,
        edited_qty: e.edited_qty,
        difference: e.difference,
        unit: e.unit,
        created_at: e.created_at,
        stock_date: (e.van_stock as any)?.stock_date || '',
        edit_source: (e as any).edit_source || 'load_previous',
      }));

      setOpeningGRNEdits(formattedEdits);
    } catch (error) {
      console.error('Error loading opening GRN edits:', error);
    }
  };

  const loadVans = async () => {
    // Fetch vans - assigned_user_id may not exist yet if migration pending
    const { data, error } = await supabase
      .from('vans')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error loading vans:', error);
      toast.error('Failed to load vans');
      setLoading(false);
      return;
    }
    
    // Get assigned user names if assigned_user_id exists
    const vansWithUsers = await Promise.all((data || []).map(async (van) => {
      let assigned_user_name = null;
      if ((van as any).assigned_user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', (van as any).assigned_user_id)
          .maybeSingle();
        assigned_user_name = profile?.full_name || null;
      }
      return {
        ...van,
        assigned_user_id: (van as any).assigned_user_id || null,
        assigned_user_name
      };
    }));
    
    setVans(vansWithUsers);
    setLoading(false);
  };

  const loadUsers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name')
      .order('full_name');
    
    if (error) {
      console.error('Error loading users:', error);
    } else {
      setUsers(data || []);
    }
  };

  const loadVanStockSummaries = async () => {
    try {
      // Get ALL van_stock records - no date filter for admin view
      const { data: stockData, error: stockError } = await supabase
        .from('van_stock')
        .select('id, van_id, user_id, stock_date, start_km, end_km')
        .order('stock_date', { ascending: false });

      if (stockError) {
        console.error('Error fetching van_stock:', stockError);
        toast.error('Failed to load van stock: ' + stockError.message);
        return;
      }
      
      console.log('Loaded van_stock records:', stockData?.length, stockData);

      if (!stockData || stockData.length === 0) {
        setVanStockSummaries([]);
        return;
      }

      // Fetch vans and profiles separately to avoid join issues
      const vanIds = [...new Set(stockData.map(s => s.van_id))];
      const userIds = [...new Set(stockData.map(s => s.user_id))];

      const [{ data: vansData }, { data: profilesData }, { data: products }, { data: variants }] = await Promise.all([
        supabase.from('vans').select('id, registration_number, make_model').in('id', vanIds),
        supabase.from('profiles').select('id, full_name').in('id', userIds),
        supabase.from('products').select('id, name, rate'),
        supabase.from('product_variants').select('id, variant_name, price')
      ]);

      const vansMap: Record<string, any> = {};
      vansData?.forEach(v => { vansMap[v.id] = v; });

      const profilesMap: Record<string, any> = {};
      profilesData?.forEach(p => { profilesMap[p.id] = p; });
      
      // Build product price map from products table - by ID and by name
      const productPriceMapById: Record<string, number> = {};
      const productPriceMapByName: Record<string, number> = {};
      products?.forEach(p => { 
        productPriceMapById[p.id] = p.rate || 0;
        if (p.name) {
          productPriceMapByName[p.name.toUpperCase().trim()] = p.rate || 0;
        }
      });
      
      // Build variant price map - van_stock_items.product_id often refers to product_variants.id
      const variantPriceMapById: Record<string, number> = {};
      const variantPriceMapByName: Record<string, number> = {};
      variants?.forEach(v => {
        variantPriceMapById[v.id] = v.price || 0;
        if (v.variant_name) {
          variantPriceMapByName[v.variant_name.toUpperCase().trim()] = v.price || 0;
        }
      });

      // Get stock items for each van_stock
      const summaries: VanStockSummary[] = [];
      
      for (const stock of stockData || []) {
        // Get stock items with full details
        const { data: items } = await supabase
          .from('van_stock_items')
          .select('id, product_id, product_name, unit, start_qty, ordered_qty, returned_qty, left_qty')
          .eq('van_stock_id', stock.id);

        // Get beat name from beat_plans for this user and date
        const { data: beatPlan } = await supabase
          .from('beat_plans')
          .select('beat_name')
          .eq('user_id', stock.user_id)
          .eq('plan_date', stock.stock_date)
          .maybeSingle();

        // Deduplicate items by product_name (keep latest/aggregated)
        const deduplicatedItemsMap = new Map<string, any>();
        (items || []).forEach((item: any) => {
          const existing = deduplicatedItemsMap.get(item.product_name);
          if (!existing) {
            deduplicatedItemsMap.set(item.product_name, item);
          }
          // Keep the first occurrence (they should have same qty anyway)
        });

        const stockItems: VanStockItem[] = Array.from(deduplicatedItemsMap.values()).map((item: any) => {
          // Look up price: variant first (by ID, then name), then product (by ID, then name)
          const variantPriceById = variantPriceMapById[item.product_id] || 0;
          const variantPriceByName = variantPriceMapByName[(item.product_name || '').toUpperCase().trim()] || 0;
          const productPriceById = productPriceMapById[item.product_id] || 0;
          const productPriceByName = productPriceMapByName[(item.product_name || '').toUpperCase().trim()] || 0;
          const priceWithGST = variantPriceById || variantPriceByName || productPriceById || productPriceByName;
          const priceWithoutGST = priceWithGST / 1.05; // Remove 5% GST
          return {
            id: item.id,
            product_id: item.product_id,
            product_name: item.product_name,
            unit: item.unit,
            start_qty: item.start_qty || 0,
            ordered_qty: item.ordered_qty || 0,
            returned_qty: item.returned_qty || 0,
            left_qty: (item.start_qty || 0) - (item.ordered_qty || 0) + (item.returned_qty || 0),
            price_without_gst: priceWithoutGST
          };
        });
        
        // Sort items by product_name alphabetically
        stockItems.sort((a, b) => a.product_name.localeCompare(b.product_name));

        const totalStock = stockItems.reduce((sum, item) => sum + item.start_qty, 0);
        const totalOrdered = stockItems.reduce((sum, item) => sum + item.ordered_qty, 0);
        const totalReturned = stockItems.reduce((sum, item) => sum + item.returned_qty, 0);
        const closingStock = stockItems.reduce((sum, item) => sum + item.left_qty, 0);

        const vanInfo = vansMap[stock.van_id];
        const profileInfo = profilesMap[stock.user_id];

        summaries.push({
          id: stock.id,
          van_id: stock.van_id,
          van_registration: vanInfo?.registration_number || 'Unknown',
          van_model: vanInfo?.make_model || '',
          user_name: profileInfo?.full_name || 'Unknown User',
          user_id: stock.user_id,
          beat_name: beatPlan?.beat_name || 'No Beat',
          stock_date: stock.stock_date,
          total_stock: totalStock,
          total_ordered: totalOrdered,
          total_returned: totalReturned,
          closing_stock: closingStock,
          start_km: stock.start_km || 0,
          end_km: stock.end_km || 0,
          items: stockItems
        });
      }

      setVanStockSummaries(summaries);
    } catch (error) {
      console.error('Error loading van stock summaries:', error);
    }
  };

  const toggleVanExpanded = (vanId: string) => {
    setExpandedVans(prev => {
      const newSet = new Set(prev);
      if (newSet.has(vanId)) {
        newSet.delete(vanId);
      } else {
        newSet.add(vanId);
      }
      return newSet;
    });
  };

  const handleSubmit = async () => {
    if (!formData.registration_number || !formData.make_model) {
      toast.error('Please enter Van Registration Number and Make/Model');
      return;
    }

    const payload = {
      ...formData,
      purchase_date: formData.purchase_date || null,
      rc_expiry_date: formData.rc_expiry_date || null,
      insurance_expiry_date: formData.insurance_expiry_date || null,
      pollution_expiry_date: formData.pollution_expiry_date || null,
      assigned_user_id: formData.assigned_user_id || null,
      is_active: true,
    };

    if (editingVan) {
      const { error } = await supabase
        .from('vans')
        .update(payload)
        .eq('id', editingVan.id);
      
      if (error) {
        toast.error('Failed to update van');
      } else {
        toast.success('Van updated successfully');
        setShowAddModal(false);
        setEditingVan(null);
        loadVans();
      }
    } else {
      const { error } = await supabase
        .from('vans')
        .insert([payload]);
      
      if (error) {
        toast.error('Failed to add van');
      } else {
        toast.success('Van added successfully');
        setShowAddModal(false);
        loadVans();
      }
    }

    setFormData({
      registration_number: '',
      make_model: '',
      purchase_date: '',
      rc_expiry_date: '',
      insurance_expiry_date: '',
      pollution_expiry_date: '',
      driver_name: '',
      driver_phone: '',
      driver_address: '',
      assigned_user_id: '',
    });
  };

  const handleEdit = (van: Van) => {
    setEditingVan(van);
    setFormData({
      registration_number: van.registration_number,
      make_model: van.make_model,
      purchase_date: van.purchase_date || '',
      rc_expiry_date: van.rc_expiry_date || '',
      insurance_expiry_date: van.insurance_expiry_date || '',
      pollution_expiry_date: van.pollution_expiry_date || '',
      driver_name: van.driver_name || '',
      driver_phone: van.driver_phone || '',
      driver_address: van.driver_address || '',
      assigned_user_id: van.assigned_user_id || '',
    });
    setShowAddModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to move this van to recycle bin?')) return;

    const vanData = vans.find(v => v.id === id);
    if (vanData) {
      await moveToRecycleBin({
        tableName: 'vans',
        recordId: id,
        recordData: vanData,
        moduleName: 'Vans',
        recordName: vanData.registration_number
      });
    }

    const { error } = await supabase
      .from('vans')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast.error('Failed to delete van');
    } else {
      toast.success('Van moved to recycle bin');
      loadVans();
    }
  };

  if (loading) return <Layout><div className="p-8">Loading...</div></Layout>;

  return (
    <Layout>
      <div className="p-8 w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Van Sales Management</h1>
            <p className="text-muted-foreground mt-1">Manage van fleet and sales operations</p>
          </div>
          <Button onClick={() => navigate('/')}>Back to Home</Button>
        </div>

        <Tabs defaultValue="van-database" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="van-database" className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Van Database
            </TabsTrigger>
            <TabsTrigger value="van-inventory" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Van Inventory & Stock
              <span className="flex items-center gap-1 ml-1 px-1.5 py-0.5 bg-green-500/20 text-green-600 text-xs rounded-full">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                Live
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="van-database">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Van Database</CardTitle>
                    <CardDescription>Manage your van fleet</CardDescription>
                  </div>
              <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogTrigger asChild>
                  <Button onClick={() => {
                    setEditingVan(null);
                    setFormData({
                      registration_number: '',
                      make_model: '',
                      purchase_date: '',
                      rc_expiry_date: '',
                      insurance_expiry_date: '',
                      pollution_expiry_date: '',
                      driver_name: '',
                      driver_phone: '',
                      driver_address: '',
                      assigned_user_id: '',
                    });
                  }}>
                    <Plus className="mr-2 h-4 w-4" /> Add Van
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingVan ? 'Edit Van' : 'Add New Van'}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="registration_number">Registration Number *</Label>
                      <Input
                        id="registration_number"
                        value={formData.registration_number}
                        onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
                        placeholder="e.g., MH-12-AB-1234"
                      />
                    </div>
                    <div>
                      <Label htmlFor="make_model">Make / Model *</Label>
                      <Input
                        id="make_model"
                        value={formData.make_model}
                        onChange={(e) => setFormData({ ...formData, make_model: e.target.value })}
                        placeholder="e.g., Tata Ace"
                      />
                    </div>
                    <div>
                      <Label htmlFor="purchase_date">Purchase Date</Label>
                      <Input
                        id="purchase_date"
                        type="date"
                        value={formData.purchase_date}
                        onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="rc_expiry_date">RC Book Expiry Date</Label>
                      <Input
                        id="rc_expiry_date"
                        type="date"
                        value={formData.rc_expiry_date}
                        onChange={(e) => setFormData({ ...formData, rc_expiry_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="insurance_expiry_date">Insurance Expiry Date</Label>
                      <Input
                        id="insurance_expiry_date"
                        type="date"
                        value={formData.insurance_expiry_date}
                        onChange={(e) => setFormData({ ...formData, insurance_expiry_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="pollution_expiry_date">Pollution Certificate Expiry</Label>
                      <Input
                        id="pollution_expiry_date"
                        type="date"
                        value={formData.pollution_expiry_date}
                        onChange={(e) => setFormData({ ...formData, pollution_expiry_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="driver_name">Driver Name</Label>
                      <Input
                        id="driver_name"
                        value={formData.driver_name}
                        onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })}
                        placeholder="Driver's full name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="driver_phone">Driver Phone</Label>
                      <Input
                        id="driver_phone"
                        value={formData.driver_phone}
                        onChange={(e) => setFormData({ ...formData, driver_phone: e.target.value })}
                        placeholder="Driver's contact number"
                      />
                    </div>
                    <div>
                      <Label htmlFor="driver_address">Driver Address</Label>
                      <Textarea
                        id="driver_address"
                        value={formData.driver_address}
                        onChange={(e) => setFormData({ ...formData, driver_address: e.target.value })}
                        placeholder="Driver's address"
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label htmlFor="assigned_user">Assign to User</Label>
                      <Select
                        value={formData.assigned_user_id}
                        onValueChange={(value) => setFormData({ ...formData, assigned_user_id: value === 'none' ? '' : value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select user (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No user assigned</SelectItem>
                          {users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.full_name || 'Unnamed User'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        This van will be pre-selected for the assigned user in Van Stock
                      </p>
                    </div>
                    <Button onClick={handleSubmit} className="w-full">
                      {editingVan ? 'Update Van' : 'Add Van'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {vans.map((van) => (
                <Card key={van.id} className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Truck className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold">{van.registration_number}</h3>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(van)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(van.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-muted-foreground">Model:</span> {van.make_model}</p>
                    {van.assigned_user_name && (
                      <p className="flex items-center gap-1">
                        <User className="h-3 w-3 text-primary" />
                        <span className="text-muted-foreground">Assigned to:</span> 
                        <span className="font-medium text-primary">{van.assigned_user_name}</span>
                      </p>
                    )}
                    {van.driver_name && (
                      <p><span className="text-muted-foreground">Driver:</span> {van.driver_name}</p>
                    )}
                    {van.driver_phone && (
                      <p><span className="text-muted-foreground">Phone:</span> {van.driver_phone}</p>
                    )}
                    {van.rc_expiry_date && (
                      <p><span className="text-muted-foreground">RC Expiry:</span> {new Date(van.rc_expiry_date).toLocaleDateString()}</p>
                    )}
                    {van.insurance_expiry_date && (
                      <p><span className="text-muted-foreground">Insurance Expiry:</span> {new Date(van.insurance_expiry_date).toLocaleDateString()}</p>
                    )}
                    <div className="pt-2">
                      <span className={`px-2 py-1 rounded text-xs ${van.is_active ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                        {van.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {vans.length === 0 && (
              <div className="p-8 text-center">
                <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No vans added yet</p>
                <p className="text-sm text-muted-foreground mt-1">Add your first van to get started</p>
              </div>
            )}
          </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="van-inventory">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Van Inventory & Stock Management</CardTitle>
                    <CardDescription>
                      All users' van stock - Real-time updates from My Visits
                    </CardDescription>
                  </div>
                  {(isManager || canViewAll) && (
                    <UserSelector
                      selectedUserId={selectedUserId}
                      onUserChange={setSelectedUserId}
                      showAllOption={true}
                      allOptionLabel="All Team"
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {filteredVanStockSummaries.length === 0 ? (
                  <div className="text-center py-8">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No van stock records found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Users will appear here when they add van stock in My Visits
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredVanStockSummaries.map((summary) => (
                      <Collapsible
                        key={summary.id}
                        open={expandedVans.has(summary.id)}
                        onOpenChange={() => toggleVanExpanded(summary.id)}
                      >
                        <CollapsibleTrigger asChild>
                          <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <Truck className="h-5 w-5 text-primary" />
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="font-semibold">{summary.user_name}</p>
                                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                                        {new Date(summary.stock_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                      </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                      Van: {summary.van_registration} ({summary.van_model}) • Beat: {summary.beat_name}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className="text-right text-sm">
                                    <p className="text-muted-foreground">Stock: <span className="font-semibold text-foreground">{(summary.total_stock / 1000).toFixed(2)} KG</span></p>
                                  </div>
                                  {expandedVans.has(summary.id) ? (
                                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <Card className="mt-2 border-l-4 border-l-primary">
                            <CardContent className="p-4">
                              {/* Summary Stats - Display in KG */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Package className="h-4 w-4 text-blue-600" />
                                    <span className="text-xs text-muted-foreground">Stock in Van</span>
                                  </div>
                                  <p className="text-2xl font-bold text-blue-600">{(summary.total_stock / 1000).toFixed(2)} <span className="text-sm font-normal">KG</span></p>
                                </div>
                                <div className="bg-amber-50 dark:bg-amber-950 p-3 rounded-lg">
                                  <div className="flex items-center gap-2 mb-1">
                                    <ShoppingCart className="h-4 w-4 text-amber-600" />
                                    <span className="text-xs text-muted-foreground">Ordered Qty</span>
                                  </div>
                                  <p className="text-2xl font-bold text-amber-600">{(summary.total_ordered / 1000).toFixed(2)} <span className="text-sm font-normal">KG</span></p>
                                </div>
                                <div className="bg-purple-50 dark:bg-purple-950 p-3 rounded-lg">
                                  <div className="flex items-center gap-2 mb-1">
                                    <RotateCcw className="h-4 w-4 text-purple-600" />
                                    <span className="text-xs text-muted-foreground">Returned Qty</span>
                                  </div>
                                  <p className="text-2xl font-bold text-purple-600">{(summary.total_returned / 1000).toFixed(2)} <span className="text-sm font-normal">KG</span></p>
                                </div>
                                <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg">
                                  <div className="flex items-center gap-2 mb-1">
                                    <TrendingDown className="h-4 w-4 text-green-600" />
                                    <span className="text-xs text-muted-foreground">Left in Van</span>
                                  </div>
                                  <p className="text-2xl font-bold text-green-600">{(summary.closing_stock / 1000).toFixed(2)} <span className="text-sm font-normal">KG</span></p>
                                </div>
                              </div>

                              {/* KM Tracking */}
                              <div className="flex items-center gap-4 text-sm mb-4 p-2 bg-muted/50 rounded">
                                <span className="text-muted-foreground">Start KM: <span className="font-semibold text-foreground">{summary.start_km}</span></span>
                                <span className="text-muted-foreground">End KM: <span className="font-semibold text-foreground">{summary.end_km || '-'}</span></span>
                                <span className="text-muted-foreground">Total KM: <span className="font-semibold text-primary">{summary.end_km > 0 ? summary.end_km - summary.start_km : '-'}</span></span>
                              </div>

                              {/* Product Details - Unified with Opening GRN Edits */}
                              <div className="border-t pt-4">
                                <h4 className="font-semibold mb-3 flex items-center gap-2">
                                  <Package className="h-4 w-4" /> Product Details
                                </h4>
                                {summary.items.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">No products in this van stock</p>
                                ) : (
                                  (() => {
                                    // Get ALL edits for this summary (no longer using a Map which overwrites)
                                    const editsForSummary = openingGRNEdits.filter(
                                      e => e.stock_date === summary.stock_date && e.user_id === summary.user_id
                                    );
                                    
                                    // Show edits first, then products without edits
                                    const productsWithEdits = new Set(editsForSummary.map(e => e.product_id));
                                    const productsWithoutEdits = summary.items.filter(item => !productsWithEdits.has(item.product_id));
                                    
                                    return (
                                      <div className="border rounded-lg overflow-hidden bg-amber-50/50 dark:bg-amber-950/20">
                                        <table className="w-full text-sm">
                                          <thead className="bg-amber-100/50 dark:bg-amber-900/30">
                                            <tr>
                                              <th className="text-left p-3 font-medium">Product</th>
                                              <th className="text-left p-3 font-medium">Source</th>
                                              <th className="text-right p-3 font-medium">Previous Left</th>
                                              <th className="text-right p-3 font-medium">Edited Qty</th>
                                              <th className="text-right p-3 font-medium">Difference</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {/* First show all edits */}
                                            {editsForSummary.map((edit) => {
                                              const unit = edit.unit || 'grams';
                                              const isGrams = unit.toLowerCase() === 'grams';
                                              const prevDisplay = isGrams ? (edit.previous_qty / 1000).toFixed(2) : edit.previous_qty.toFixed(2);
                                              const editDisplay = isGrams ? (edit.edited_qty / 1000).toFixed(2) : edit.edited_qty.toFixed(2);
                                              const diffDisplay = isGrams ? (edit.difference / 1000).toFixed(2) : edit.difference.toFixed(2);
                                              const displayUnit = isGrams ? 'KG' : unit;
                                              
                                              const sourceLabel = edit.edit_source === 'manual_edit' 
                                                ? '✏️ Manual Edit' 
                                                : '📦 Load Previous';
                                              const sourceColor = edit.edit_source === 'manual_edit'
                                                ? 'text-blue-600 dark:text-blue-400'
                                                : 'text-purple-600 dark:text-purple-400';
                                              
                                              return (
                                                <tr key={edit.id} className="border-t border-amber-200/50 dark:border-amber-800/50">
                                                  <td className="p-3">
                                                    <p className="font-medium">{edit.product_name}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                      {new Date(edit.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                  </td>
                                                  <td className={`p-3 text-xs font-medium ${sourceColor}`}>
                                                    {sourceLabel}
                                                  </td>
                                                  <td className="p-3 text-right font-medium">{prevDisplay} {displayUnit}</td>
                                                  <td className="p-3 text-right font-medium">{editDisplay} {displayUnit}</td>
                                                  <td className={`p-3 text-right font-medium ${
                                                    edit.difference > 0 ? 'text-green-600' : 
                                                    edit.difference < 0 ? 'text-red-600' : 
                                                    'text-muted-foreground'
                                                  }`}>
                                                    {edit.difference > 0 ? '+' : ''}{diffDisplay} {displayUnit}
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                            {/* Then show products without any edits */}
                                            {productsWithoutEdits.map((item) => {
                                              const startQty = item.start_qty / 1000; // Always grams to KG
                                              return (
                                                <tr key={item.id} className="border-t border-amber-200/50 dark:border-amber-800/50 opacity-60">
                                                  <td className="p-3">
                                                    <p className="font-medium">{item.product_name}</p>
                                                    <p className="text-xs text-muted-foreground">₹{item.price_without_gst.toFixed(2)}/KG</p>
                                                  </td>
                                                  <td className="p-3 text-xs text-muted-foreground">—</td>
                                                  <td className="p-3 text-right font-medium">{startQty.toFixed(2)} KG</td>
                                                  <td className="p-3 text-right font-medium">{startQty.toFixed(2)} KG</td>
                                                  <td className="p-3 text-right text-muted-foreground">0.00 KG</td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    );
                                  })()
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
