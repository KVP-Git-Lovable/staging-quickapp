import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { 
  ArrowLeft, 
  Package, 
  Search, 
  Filter,
  AlertTriangle,
  TrendingUp,
  Calendar,
  Box,
  BookOpen,
  Wrench,
  RotateCcw,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays } from 'date-fns';
import WarehouseManagement from '@/components/distributor-portal/inventory/WarehouseManagement';
import OpeningStockDialog from '@/components/distributor-portal/inventory/OpeningStockDialog';
import { useWarehouses } from '@/hooks/useWarehouses';

interface InventoryItem {
  id: string;
  product_name: string;
  variant_name?: string;
  sku?: string;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  reorder_level: number;
  max_stock_level: number;
  unit: string;
  unit_cost: number;
  total_value: number;
  batch_number?: string;
  expiry_date?: string;
  last_received_date?: string;
  location?: string;
}

const DistributorInventory = () => {
  const navigate = useNavigate();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [openingStockOpen, setOpeningStockOpen] = useState(false);
  const [products, setProducts] = useState<{ id: string; name: string; unit?: string }[]>([]);

  const distributorId = localStorage.getItem('distributor_id');
  const { warehouses, loading: whLoading, createWarehouse, updateWarehouse, deleteWarehouse } = useWarehouses(distributorId);

  useEffect(() => {
    if (!distributorId) {
      navigate('/distributor-portal/login');
      return;
    }
    loadInventory();
    loadProducts();
  }, [distributorId, navigate]);

  const loadInventory = async () => {
    try {
      const { data, error } = await supabase
        .from('distributor_inventory')
        .select('*')
        .eq('distributor_id', distributorId)
        .order('product_name');

      if (error) throw error;
      setInventory(data || []);
    } catch (error) {
      console.error('Error loading inventory:', error);
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, unit')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      setProducts((data || []) as any);
    } catch (e) {
      console.error('Error loading products:', e);
    }
  };

  const getStockStatus = (item: InventoryItem) => {
    if (item.quantity === 0) return { label: 'Out of Stock', color: 'bg-red-100 text-red-700', severity: 'critical' };
    if (item.quantity <= item.reorder_level) return { label: 'Low Stock', color: 'bg-yellow-100 text-yellow-700', severity: 'warning' };
    if (item.quantity >= item.max_stock_level * 0.9) return { label: 'Overstocked', color: 'bg-blue-100 text-blue-700', severity: 'info' };
    return { label: 'In Stock', color: 'bg-green-100 text-green-700', severity: 'good' };
  };

  const getExpiryStatus = (expiryDate?: string) => {
    if (!expiryDate) return null;
    const daysToExpiry = differenceInDays(new Date(expiryDate), new Date());
    if (daysToExpiry < 0) return { label: 'Expired', color: 'text-red-600', severity: 'critical' };
    if (daysToExpiry <= 30) return { label: `${daysToExpiry}d left`, color: 'text-orange-600', severity: 'warning' };
    if (daysToExpiry <= 90) return { label: `${daysToExpiry}d left`, color: 'text-yellow-600', severity: 'caution' };
    return null;
  };

  const filteredInventory = inventory.filter(item => {
    const matchesSearch = 
      item.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sku?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (stockFilter === 'all') return matchesSearch;
    
    const status = getStockStatus(item);
    if (stockFilter === 'low' && status.severity !== 'warning') return false;
    if (stockFilter === 'out' && status.severity !== 'critical') return false;
    if (stockFilter === 'good' && status.severity !== 'good') return false;
    
    return matchesSearch;
  });

  const stats = {
    totalItems: inventory.length,
    lowStock: inventory.filter(i => i.quantity <= i.reorder_level && i.quantity > 0).length,
    outOfStock: inventory.filter(i => i.quantity === 0).length,
    totalValue: inventory.reduce((sum, i) => sum + (i.total_value || 0), 0),
    expiringItems: inventory.filter(i => {
      if (!i.expiry_date) return false;
      const daysToExpiry = differenceInDays(new Date(i.expiry_date), new Date());
      return daysToExpiry <= 30 && daysToExpiry >= 0;
    }).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
          <p className="text-muted-foreground">{inventory.length} products in stock</p>
        </div>
        <Button size="sm" onClick={() => setOpeningStockOpen(true)} disabled={warehouses.length === 0}>
          <Plus className="w-4 h-4 mr-2" />
          Add Opening Stock
        </Button>
      </div>

      {/* Warehouses (create/manage) */}
      {distributorId && (
        <WarehouseManagement
          warehouses={warehouses}
          loading={whLoading}
          onCreateWarehouse={createWarehouse}
          onUpdateWarehouse={updateWarehouse}
          onDeleteWarehouse={deleteWarehouse}
          defaultOpen={warehouses.length === 0}
        />
      )}

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/distributor-portal/inventory-ledger')}>
            <BookOpen className="w-4 h-4 mr-2" />
            View Ledger
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/distributor-portal/stock-adjustments')}>
            <Wrench className="w-4 h-4 mr-2" />
            Adjustments
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/distributor-portal/returns')}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Returns
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Total SKUs</p>
                  <p className="font-bold">{stats.totalItems}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Low Stock</p>
                  <p className="font-bold text-yellow-600">{stats.lowStock}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-red-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Out of Stock</p>
                  <p className="font-bold text-red-600">{stats.outOfStock}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-orange-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Expiring Soon</p>
                  <p className="font-bold text-orange-600">{stats.expiringItems}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="col-span-2 md:col-span-1">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Total Value</p>
                  <p className="font-bold text-green-600">₹{stats.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by product name or SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={stockFilter} onValueChange={setStockFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Stock Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Items</SelectItem>
              <SelectItem value="low">Low Stock</SelectItem>
              <SelectItem value="out">Out of Stock</SelectItem>
              <SelectItem value="good">In Stock</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Inventory List */}
        {filteredInventory.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-medium text-foreground mb-2">No inventory items found</h3>
              <p className="text-sm text-muted-foreground">
                {searchTerm || stockFilter !== 'all' 
                  ? 'Try adjusting your filters' 
                  : 'Your inventory will appear here once orders are received'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredInventory.map((item) => {
              const stockStatus = getStockStatus(item);
              const expiryStatus = getExpiryStatus(item.expiry_date);
              const stockPercentage = Math.min(100, (item.quantity / item.max_stock_level) * 100);

              return (
                <Card key={item.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-start gap-2">
                          <h3 className="font-medium text-foreground">{item.product_name}</h3>
                          <Badge className={stockStatus.color} variant="secondary">
                            {stockStatus.label}
                          </Badge>
                          {expiryStatus && (
                            <span className={`text-xs font-medium ${expiryStatus.color}`}>
                              {expiryStatus.label}
                            </span>
                          )}
                        </div>
                        {item.variant_name && (
                          <p className="text-sm text-muted-foreground">{item.variant_name}</p>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                          {item.sku && <span>SKU: {item.sku}</span>}
                          {item.batch_number && <span>Batch: {item.batch_number}</span>}
                          {item.location && <span>Location: {item.location}</span>}
                          {item.expiry_date && (
                            <span>Expires: {format(new Date(item.expiry_date), 'dd MMM yyyy')}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6">
                        {/* Stock Level Bar */}
                        <div className="w-full md:w-32">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Stock Level</span>
                            <span className="font-medium">{Math.round(stockPercentage)}%</span>
                          </div>
                          <Progress 
                            value={stockPercentage} 
                            className="h-2"
                          />
                        </div>

                        {/* Quantities */}
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-xs text-muted-foreground">Total</p>
                            <p className="font-bold">{item.quantity}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Reserved</p>
                            <p className="font-bold text-orange-600">{item.reserved_quantity}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Available</p>
                            <p className="font-bold text-green-600">{item.available_quantity}</p>
                          </div>
                        </div>

                        {/* Value */}
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Value</p>
                          <p className="font-bold">₹{item.total_value?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || '0'}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
    </div>
  );
};

export default DistributorInventory;
